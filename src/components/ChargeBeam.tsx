import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CHARGE_LEVELS, CHARGE_STEPS, FADE_SECONDS, beamCharge, beamFx, muzzle, now } from '../state/beam'
import { asteroids, beamSweeps, beamTargets, bodies, rockBreaks } from '../state/registry'
import { ship } from '../state/flight'
import { shipScale } from '../state/zoom'
import { useStore } from '../state/store'
import { useLevel } from '../state/quality'
import { usePostFxActive } from './SpaceLighting'
import { ui } from '../i18n'
import { beamHum, playChargeFire, playChargeStep, startChargeHum, type ChargeHum } from '../audio/sfx'

// チャージビーム（長押しで溜めて、離して撃つ）の見た目と破壊。
// 溜め：外から発射口へ吸い込まれる光の粒・大きくなる光の球・段階が上がるたびの光の輪。
// 発射：衝撃波の輪・カメラのズームアウト（フラッシュ・ヒットストップ・揺れは state/beam.ts と Ship・BeamGauge）。
// 本体：白い芯と、色の付いた太い外側を重ね、流れる模様・脈動・螺旋の光の帯をまとわせる。ビームの色の光で船体と岩を照らす。
// 余韻：細くなりながら消え、発射口から湯気。当たった岩は白く光ってから砕け、赤熱した破片が冷えていく。
// ビームと粒はどれも、カメラに向けた板と点をシェーダーで動かす（毎フレームの CPU の仕事は少ない）。粒の数は画質で変える。

const FULL = CHARGE_STEPS[CHARGE_STEPS.length - 1]
/** 溜めの段階ごとの色（青→水色→白） */
const CHARGE_COLORS = [new THREE.Color(0.25, 0.4, 2.0), ...CHARGE_LEVELS.slice(1).map((l) => l!.color)]
/** 岩が白く光ってから砕けるまで */
const HIT_FLASH = 0.08
/** 破片が冷えて消えるまで */
const SHARD_LIFE = 1.8
/** 光のにじみ（Bloom）を使うときの明るさの割合 */
const BLOOM_GAIN = 0.45
/** 湯気が消えるまで */
const STEAM_LIFE = 1.6

const POOLS = {
  high: { gather: 64, shards: 420, perRock: 14, steam: 28 },
  medium: { gather: 48, shards: 300, perRock: 11, steam: 22 },
  low: { gather: 28, shards: 160, perRock: 7, steam: 14 },
}

// ---------- シェーダー ----------

/** ビームの帯：線分のまわりで、いつもカメラに向く板（円柱を横から見た形）。螺旋の帯は横に揺らして、手前を明るくする */
const ribbonVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform vec3 uStart;
  uniform vec3 uDir;
  uniform float uLen;
  uniform float uR0;
  uniform float uR1;
  uniform float uTime;
  uniform float uPhase;
  varying vec2 vUv;
  varying float vDist;
  varying float vFront;
  void main() {
    float a = position.y + 0.5;
    vec3 p = uStart + uDir * (a * uLen);
    vec3 side = cross(uDir, cameraPosition - p);
    float sl = length(side);
    side = sl > 1e-12 ? side / sl : vec3(1.0, 0.0, 0.0);
    float r = mix(uR0, uR1, a);
    float off = 0.0;
    vFront = 1.0;
    #ifdef SPIRAL
      float ph = a * uLen / max(uR0, 1e-7) * 0.22 - uTime * 10.0 + uPhase;
      off = sin(ph) * r * 1.35;
      vFront = 0.25 + 0.75 * (0.5 + 0.5 * cos(ph));
    #endif
    vUv = uv;
    vDist = a * uLen / max(uR0, 1e-7);
    vec4 mv = viewMatrix * vec4(p + side * (off + position.x * 2.0 * r), 1.0);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`

const ribbonFragment = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uTime;
  uniform float uGain;
  uniform sampler2D uFlow;
  varying vec2 vUv;
  varying float vDist;
  varying float vFront;
  void main() {
    float d = abs(vUv.x - 0.5) * 2.0;
    float ends = smoothstep(0.0, 0.015, vUv.y) * (1.0 - smoothstep(0.88, 1.0, vUv.y));
    vec3 c;
    float a;
    #if defined(CORE)
      float flow = texture2D(uFlow, vec2(vUv.x * 0.5, vDist * 0.03 - uTime * 3.2)).r;
      c = vec3(3.2 + 2.0 * flow);
      a = pow(max(0.0, 1.0 - d * d), 3.0);
    #elif defined(SPIRAL)
      c = mix(uColor, vec3(1.6), 0.35) * vFront;
      a = exp(-d * d * 5.0) * vFront;
    #else
      // 外側：円柱を横から見た厚み。模様を先へ流して、エネルギーが走って見えるように
      float shell = sqrt(max(0.0, 1.0 - d * d));
      float f1 = texture2D(uFlow, vec2(vUv.x * 0.9, vDist * 0.018 - uTime * 2.4)).r;
      float f2 = texture2D(uFlow, vec2(vUv.x * 0.6 + 0.37, vDist * 0.031 - uTime * 4.1)).g;
      float e = 0.5 + 1.5 * f1 * f2;
      c = uColor * e;
      a = shell * (0.45 + 0.55 * e) * (1.0 - smoothstep(0.75, 1.0, d));
    #endif
    gl_FragColor = vec4(c * uGain, a * ends * uAlpha);
    #include <logdepthbuf_fragment>
  }
`

/** 溜めの粒：外から発射口へ、だんだん速く吸い込まれる（位置はすべてシェーダーで計算） */
const gatherVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec4 aSeed;
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform float uTime;
  uniform float uRate;
  uniform float uSize;
  uniform float uScale;
  uniform float uOn;
  varying float vA;
  varying float vLife;
  void main() {
    float life = fract(uTime * uRate * (0.8 + aSeed.w * 0.5) + aSeed.w * 7.13);
    float r = uRadius * pow(1.0 - life, 1.6);
    vec3 p = uCenter + normalize(aSeed.xyz) * r;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uScale * (0.5 + life) / max(-mv.z, 1e-6);
    vA = uOn * smoothstep(0.0, 0.25, life) * (1.0 - smoothstep(0.9, 1.0, life));
    vLife = life;
    #include <logdepthbuf_vertex>
  }
`

const gatherFragment = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  varying float vA;
  varying float vLife;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = vA * smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(mix(uColor, vec3(2.0), vLife * 0.6), a);
    #include <logdepthbuf_fragment>
  }
`

/** 破片：生まれた場所・速さ・時刻から、飛び散りながら赤熱→暗い赤へ冷える。aKind 1 は岩が白く光る閃光 */
const shardVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 aVel;
  attribute vec3 aInfo; // x: 生まれた時刻, y: 大きさ, z: 種類（0 破片・1 閃光）
  uniform float uTime;
  uniform float uScale;
  varying float vAge;
  varying float vKind;
  void main() {
    float age = uTime - aInfo.x;
    float life = aInfo.z > 0.5 ? ${HIT_FLASH * 1.6} : ${SHARD_LIFE.toFixed(2)};
    vAge = age / life;
    vKind = aInfo.z;
    if (age < 0.0 || age > life) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vec3 p = position + aVel * (age - 0.3 * age * age);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float grow = aInfo.z > 0.5 ? 0.6 + 1.6 * vAge : 1.0 - 0.55 * vAge;
    gl_PointSize = max(1.5, aInfo.y * uScale * grow / max(-mv.z, 1e-6));
    #include <logdepthbuf_vertex>
  }
`

const shardFragment = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform float uGain;
  varying float vAge;
  varying float vKind;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    vec3 c;
    float a;
    if (vKind > 0.5) {
      c = vec3(3.0, 3.0, 3.2);
      a = (1.0 - vAge) * smoothstep(1.0, 0.0, d);
    } else {
      // 白熱 → 黄 → 橙 → 暗い赤へ冷える
      vec3 hot = mix(vec3(3.0, 2.6, 1.8), vec3(2.4, 1.1, 0.25), smoothstep(0.0, 0.18, vAge));
      c = mix(hot, vec3(0.45, 0.06, 0.02), smoothstep(0.18, 0.75, vAge));
      a = (1.0 - smoothstep(0.6, 1.0, vAge)) * smoothstep(1.0, 0.35, d);
    }
    gl_FragColor = vec4(c * uGain, a);
    #include <logdepthbuf_fragment>
  }
`

/** 放熱の湯気：発射口から上へふわっと広がって消える */
const steamVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec4 aSeed;
  uniform vec3 uCenter;
  uniform vec3 uUp;
  uniform float uStart;
  uniform float uTime;
  uniform float uUnit;
  uniform float uScale;
  varying float vA;
  void main() {
    float age = uTime - uStart - aSeed.w * 0.5;
    float k = age / ${STEAM_LIFE.toFixed(2)};
    if (age < 0.0 || k > 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vec3 drift = (aSeed.xyz * 0.6 + uUp * 0.8) * uUnit;
    vec3 p = uCenter + drift * (1.0 - exp(-age * 2.2)) * 1.8;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uUnit * uScale * (0.25 + 0.9 * k) / max(-mv.z, 1e-6);
    vA = smoothstep(0.0, 0.12, k) * (1.0 - k);
    #include <logdepthbuf_vertex>
  }
`

const steamFragment = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    gl_FragColor = vec4(0.8, 0.86, 0.95, vA * 0.32 * smoothstep(1.0, 0.0, d));
    #include <logdepthbuf_fragment>
  }
`

/** 光の輪（段階が上がる瞬間のパルスと、発射の衝撃波） */
const ringVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`

const ringFragment = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uWidth;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float ring = exp(-pow((d - 0.82) / uWidth, 2.0)) + 0.25 * exp(-pow((d - 0.6) / (uWidth * 2.5), 2.0));
    gl_FragColor = vec4(uColor, ring * uAlpha * (1.0 - smoothstep(0.96, 1.0, d)));
    #include <logdepthbuf_fragment>
  }
`

// ---------- テクスチャ ----------

/** ビームの中を流れる模様（なめらかな乱数。r と g で別の模様） */
function flowTexture() {
  const w = 32
  const h = 64
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 255 * Math.random() ** 1.6
    data[i * 4 + 1] = 255 * Math.random() ** 1.3
    data[i * 4 + 2] = 0
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, w, h)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

/** 光の球の、中心ほど明るい丸 */
function glowTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.12, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.35)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.08)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

function ribbonMaterial(kind: 'CORE' | 'OUTER' | 'SPIRAL', flow: THREE.Texture, phase = 0) {
  return new THREE.ShaderMaterial({
    vertexShader: ribbonVertex,
    fragmentShader: ribbonFragment,
    defines: { [kind]: '' },
    uniforms: {
      uStart: { value: new THREE.Vector3() },
      uDir: { value: new THREE.Vector3(0, 0, -1) },
      uLen: { value: 1 },
      uR0: { value: 0.01 },
      uR1: { value: 0.01 },
      uTime: { value: 0 },
      uPhase: { value: phase },
      uColor: { value: new THREE.Color() },
      uAlpha: { value: 0 },
      uFlow: { value: flow },
      uGain: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

const randomDir = (out: THREE.Vector3) => out.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()

// ---------- 作業用 ----------
const m = new THREE.Vector3()
const dir = new THREE.Vector3()
const aim = new THREE.Vector3()
const v = new THREE.Vector3()
const w = new THREE.Vector3()
const shipUp = new THREE.Vector3()
const zAxis = new THREE.Vector3(0, 0, 1)
const inv = new THREE.Matrix4()
const localFrom = new THREE.Vector3()
const localDir = new THREE.Vector3()
const tmpM = new THREE.Matrix4()
const zero = new THREE.Matrix4().makeScale(0, 0, 0)
const white = new THREE.Color(4, 4, 4)

type Ring = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; start: number; seconds: number; size: number; face: 'camera' | 'beam'; delay: number }
type Pending = { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4; color: THREE.Color; at: number; size: number }

export function ChargeBeam() {
  const { camera, gl } = useThree()
  const level = useLevel()
  const postFx = usePostFxActive()
  const bloomOn = useStore((s) => s.settings.fx.bloom)
  const bloom = postFx && bloomOn
  const pool = POOLS[level]
  const flow = useMemo(flowTexture, [])
  const glowTex = useMemo(glowTexture, [])

  const beam = useMemo(
    () => ({
      geometry: new THREE.PlaneGeometry(1, 1, 1, 64),
      outer: ribbonMaterial('OUTER', flow),
      core: ribbonMaterial('CORE', flow),
      spiralA: ribbonMaterial('SPIRAL', flow, 0),
      spiralB: ribbonMaterial('SPIRAL', flow, Math.PI),
    }),
    [flow],
  )

  const gather = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    const seeds = new Float32Array(pool.gather * 4)
    for (let i = 0; i < pool.gather; i++) {
      randomDir(v)
      seeds.set([v.x, v.y, v.z, Math.random()], i * 4)
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pool.gather * 3), 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    const material = new THREE.ShaderMaterial({
      vertexShader: gatherVertex,
      fragmentShader: gatherFragment,
      uniforms: {
        uCenter: { value: new THREE.Vector3() },
        uRadius: { value: 0.1 },
        uTime: { value: 0 },
        uRate: { value: 1 },
        uSize: { value: 0.01 },
        uScale: { value: 500 },
        uOn: { value: 0 },
        uColor: { value: new THREE.Color() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { geometry, material }
  }, [pool.gather])

  const shards = useMemo(() => {
    const n = pool.shards
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    geometry.setAttribute('aVel', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    const info = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) info[i * 3] = -100
    geometry.setAttribute('aInfo', new THREE.BufferAttribute(info, 3))
    const material = new THREE.ShaderMaterial({
      vertexShader: shardVertex,
      fragmentShader: shardFragment,
      uniforms: { uTime: { value: 0 }, uScale: { value: 500 }, uGain: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { geometry, material, next: 0, n }
  }, [pool.shards])

  const steam = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    const seeds = new Float32Array(pool.steam * 4)
    for (let i = 0; i < pool.steam; i++) {
      randomDir(v)
      seeds.set([v.x, v.y, v.z, Math.random()], i * 4)
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pool.steam * 3), 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    const material = new THREE.ShaderMaterial({
      vertexShader: steamVertex,
      fragmentShader: steamFragment,
      uniforms: {
        uCenter: { value: new THREE.Vector3() },
        uUp: { value: new THREE.Vector3(0, 1, 0) },
        uStart: { value: -100 },
        uTime: { value: 0 },
        uUnit: { value: 0.01 },
        uScale: { value: 500 },
      },
      transparent: true,
      depthWrite: false,
    })
    return { geometry, material }
  }, [pool.steam])

  const rings = useMemo<Ring[]>(
    () =>
      Array.from({ length: 4 }, () => {
        const mat = new THREE.ShaderMaterial({
          vertexShader: ringVertex,
          fragmentShader: ringFragment,
          uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uWidth: { value: 0.06 } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
        mesh.frustumCulled = false
        mesh.visible = false
        return { mesh, mat, start: -100, seconds: 1, size: 1, face: 'camera', delay: 0 }
      }),
    [],
  )

  useEffect(
    () => () => {
      gather.geometry.dispose()
      gather.material.dispose()
    },
    [gather],
  )
  useEffect(
    () => () => {
      shards.geometry.dispose()
      shards.material.dispose()
    },
    [shards],
  )
  useEffect(
    () => () => {
      steam.geometry.dispose()
      steam.material.dispose()
    },
    [steam],
  )

  const glow = useRef<THREE.Sprite>(null!)
  const glowMat = useRef<THREE.SpriteMaterial>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const group = useRef<THREE.Group>(null!)
  const ribbons = useRef<THREE.Group>(null!)

  const state = useRef({
    level: 0,
    charging: false,
    firing: 0,
    hum: null as ChargeHum | null,
    stopHum: null as (() => void) | null,
    pending: [] as Pending[],
    hitTargets: new Set<object>(),
    rocks: 0,
    junk: 0,
    steamShown: false,
  })

  // 画面の外へ出たら、鳴っている音を止める
  useEffect(
    () => () => {
      state.current.hum?.stop()
      state.current.stopHum?.()
    },
    [],
  )

  function addRing(face: Ring['face'], color: THREE.Color, size: number, seconds: number, delay = 0, width = 0.06) {
    const r = rings.reduce((a, b) => (a.start + a.seconds + a.delay < b.start + b.seconds + b.delay ? a : b))
    r.face = face
    r.size = size
    r.seconds = seconds
    r.delay = delay
    r.start = now()
    r.mat.uniforms.uColor.value.copy(color)
    r.mat.uniforms.uWidth.value = width
  }

  /** 破片の点を出す（輪のように使い回す） */
  function spawnShards(at: THREE.Vector3, size: number, birth: number, count: number) {
    const pos = shards.geometry.getAttribute('position') as THREE.BufferAttribute
    const vel = shards.geometry.getAttribute('aVel') as THREE.BufferAttribute
    const info = shards.geometry.getAttribute('aInfo') as THREE.BufferAttribute
    for (let i = 0; i < count; i++) {
      const k = shards.next
      shards.next = (shards.next + 1) % shards.n
      const flash = i === 0
      randomDir(v).multiplyScalar(flash ? 0 : size * (1.2 + Math.random() * 3.5))
      pos.setXYZ(k, at.x, at.y, at.z)
      vel.setXYZ(k, v.x, v.y, v.z)
      info.setXYZ(k, flash ? birth - HIT_FLASH : birth, flash ? size * 5 : size * (0.25 + Math.random() * 0.35), flash ? 1 : 0)
    }
    pos.needsUpdate = true
    vel.needsUpdate = true
    info.needsUpdate = true
  }

  /** ビームの通り道にある小惑星帯の岩を探して、白く光らせる（少しあとで砕く） */
  function sweepBelt(from: THREE.Vector3, d: THREE.Vector3, length: number, radius: number, spread: number, time: number) {
    const s = state.current
    for (const mesh of asteroids.meshes) {
      inv.copy(mesh.matrixWorld).invert()
      localFrom.copy(from).applyMatrix4(inv)
      localDir.copy(d).transformDirection(inv)
      const arr = mesh.instanceMatrix.array as Float32Array
      for (let i = 0; i < mesh.count; i++) {
        const o = i * 16
        const size = Math.hypot(arr[o], arr[o + 1], arr[o + 2])
        if (size === 0) continue
        const dx = arr[o + 12] - localFrom.x
        const dy = arr[o + 13] - localFrom.y
        const dz = arr[o + 14] - localFrom.z
        const along = dx * localDir.x + dy * localDir.y + dz * localDir.z
        if (along < 0 || along > length) continue
        const perp2 = dx * dx + dy * dy + dz * dz - along * along
        const reach = radius + along * spread + size
        if (perp2 > reach * reach) continue
        if (s.pending.some((p) => p.mesh === mesh && p.index === i)) continue
        mesh.getMatrixAt(i, tmpM)
        const color = new THREE.Color()
        mesh.getColorAt(i, color)
        mesh.setColorAt(i, white)
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        s.pending.push({ mesh, index: i, matrix: tmpM.clone(), color, at: time, size })
        v.set(arr[o + 12], arr[o + 13], arr[o + 14]).applyMatrix4(mesh.matrixWorld)
        spawnShards(v, size, time + HIT_FLASH, 1)
      }
    }
  }

  useFrame(({ clock }, rawDelta) => {
    // 毎フレームの追いかけを、フレームの速さ（60fps と 144fps など）によらず同じ速さにする
    const steps = Math.min(rawDelta, 0.1) * 60
    const ease = (k: number) => 1 - (1 - k) ** steps
    // 光のにじみ（Bloom）があると、明るい部分がにじんで白く飛ぶので、そのぶん明るさを抑える（にじみのないスマホの「軽量」と見た目をそろえる）
    const gain = bloom ? BLOOM_GAIN : 1
    const time = now()
    const s = state.current
    const c = beamCharge
    const st = useStore.getState()
    const unit = shipScale() / 0.3
    const scaleUniform = gl.domElement.height * 0.5 * camera.projectionMatrix.elements[5]
    muzzle(m)
    shipUp.set(0, 1, 0).applyQuaternion(ship.quaternion)

    // 狙う向き：追いかけカメラとブリッジでは画面の中央（通常のビームと同じ）、ほかのカメラでは船の正面
    if (st.mode !== 'flight' || st.cameraMode === 'hero') dir.set(0, 0, -1).applyQuaternion(ship.quaternion)
    else {
      camera.getWorldDirection(dir)
      aim.copy(camera.position).addScaledVector(dir, 40 / Math.max(1, 1 / unit))
      dir.copy(aim).sub(m).normalize()
    }

    // ---------- 溜め ----------
    const chargeK = c.charging ? Math.min(1, (time - c.start) / FULL) : 0
    if (c.charging && !s.charging) s.hum = startChargeHum()
    if (!c.charging && s.charging) {
      s.hum?.stop()
      s.hum = null
    }
    if (c.charging && c.level > s.level) {
      const color = CHARGE_COLORS[c.level]
      addRing('camera', color, unit * (0.07 + c.level * 0.025), 0.3, 0, 0.05)
      s.hum?.setLevel(c.level)
      playChargeStep(c.level)
    }
    s.charging = c.charging
    s.level = c.charging ? c.level : 0

    const color = CHARGE_COLORS[c.charging ? c.level : c.firing]
    const gm = gather.material.uniforms
    gm.uCenter.value.copy(m)
    gm.uRadius.value = unit * (0.09 + 0.05 * chargeK)
    gm.uTime.value = time
    gm.uRate.value = 1.1 + chargeK * 1.6
    gm.uSize.value = unit * 0.006
    gm.uScale.value = scaleUniform
    gm.uOn.value = c.charging ? Math.min(1, (time - c.start) * 4) : Math.max(0, gm.uOn.value - 0.15 * steps)
    gm.uColor.value.copy(color).multiplyScalar(gain)

    // 光の球：溜めるほど大きく明るく、ちらつく。撃っているあいだは発射口の光
    let glowSize = 0
    let glowAlpha = 0
    if (c.charging) {
      glowSize = unit * (0.02 + 0.08 * chargeK ** 1.3) * (1 + 0.1 * Math.sin(time * 47) + 0.06 * Math.sin(time * 23))
      glowAlpha = 0.55 + 0.45 * chargeK
    }

    // 溜めているあいだは船を震わせ、周りを暗くする
    beamFx.tremble = c.charging ? 0.15 + 0.85 * chargeK : Math.max(0, beamFx.tremble - 0.08 * steps)
    const dimTo = c.charging ? 0.12 + 0.28 * chargeK : 0
    const poseTo = (c.charging && time - c.start > CHARGE_STEPS[0] * 0.6) || c.firing ? 1 : 0
    beamFx.pose += (poseTo - beamFx.pose) * ease(poseTo ? 0.06 : 0.04)
    beamFx.dim += (dimTo - beamFx.dim) * ease(c.charging ? 0.08 : 0.15)

    // ---------- 発射 ----------
    const spec = c.firing ? CHARGE_LEVELS[c.firing] : null
    if (c.firing && s.firing !== c.firing) {
      // 撃った瞬間：衝撃波の輪を 2 つ、少しズームアウト
      s.firing = c.firing
      s.hitTargets.clear()
      s.rocks = 0
      s.junk = 0
      s.steamShown = false
      const ringColor = CHARGE_COLORS[c.firing]
      addRing('beam', ringColor, unit * (0.09 + c.firing * 0.035), 0.4, 0.05, 0.05)
      addRing('beam', white, unit * (0.06 + c.firing * 0.02), 0.28, 0.05, 0.08)
      const cam = camera as THREE.PerspectiveCamera
      if (st.settings.beamFx.shake) {
        cam.fov += 3 + c.firing * 2
        cam.updateProjectionMatrix()
      }
      playChargeFire(c.firing)
      s.stopHum = beamHum(spec!.seconds, c.firing)
    }

    let beamOn = false
    if (spec) {
      const age = time - c.fireStart
      const fade = (age - spec.seconds) / FADE_SECONDS
      if (age < 0) {
        // ヒットストップ中：ビームはまだ出さず、発射口だけ強く光る
        glowSize = unit * 0.06
        glowAlpha = 1
      } else if (fade >= 1) {
        c.firing = 0
        s.firing = 0
        s.stopHum = null
        if (s.rocks + s.junk > 0)
          st.showToast(
            s.junk > 0
              ? ui().chargeBeam.rocksAndJunkDestroyed(s.rocks, s.junk)
              : ui().chargeBeam.rocksDestroyed(s.rocks),
          )
      } else {
        beamOn = true
        // 立ち上がりは一気に太く、終わりは細くなりながら消える
        const rise = Math.min(1, age / 0.06)
        const thin = fade > 0 ? 1 - fade : 1
        const pulse = 1 + 0.09 * Math.sin(age * 31) + 0.05 * Math.sin(age * 57)
        const r0 = spec.radius * shipScale() * rise * thin * pulse
        const spread = Math.tan(THREE.MathUtils.degToRad(spec.spread))
        // 天体に当たったら、そこで止める
        let length = spec.range * Math.min(1, unit * 4)
        for (const body of bodies.values()) {
          body.object.getWorldPosition(v)
          w.copy(v).sub(m)
          const along = w.dot(dir)
          if (along < 0) continue
          const perp2 = w.lengthSq() - along * along
          const r2 = body.radius * body.radius
          if (perp2 > r2) continue
          const hitAt = along - Math.sqrt(r2 - perp2)
          if (hitAt > 0 && hitAt < length) length = hitAt
        }
        const alpha = (fade > 0 ? 1 - fade : 1) * rise
        const r1 = r0 + length * spread * 0.3 * thin
        const mats = [beam.outer, beam.core, beam.spiralA, beam.spiralB]
        mats.forEach((mat, i) => {
          const u = mat.uniforms
          u.uStart.value.copy(m)
          u.uDir.value.copy(dir)
          u.uLen.value = length
          const k = i === 1 ? 0.28 : i === 0 ? 1 : 0.2
          u.uR0.value = r0 * k
          u.uR1.value = r1 * k
          u.uTime.value = age
          u.uAlpha.value = alpha * (i >= 2 ? 0.9 : 1)
          u.uColor.value.copy(spec.color)
          u.uGain.value = gain
        })
        glowSize = r0 * 1.8
        glowAlpha = alpha

        // 壊す（細くなっているあいだは壊さない）
        if (fade <= 0 && age > 0.03) {
          sweepBelt(m, dir, length, r0 * 2, spread, time)
          beamSweeps.forEach((sweep) =>
            sweep(m, dir, length, r0 * 2, spread, (at, size) => {
              s.junk++
              spawnShards(at, size, time, Math.max(3, Math.round(pool.perRock / 3)))
            }),
          )
          for (const target of beamTargets) {
            if (s.hitTargets.has(target)) continue
            target.object.getWorldPosition(v)
            w.copy(v).sub(m)
            const along = w.dot(dir)
            if (along < 0 || along > length) continue
            const reach = r0 * 4 + along * spread
            if (w.lengthSq() - along * along > reach * reach) continue
            s.hitTargets.add(target)
            spawnShards(v, unit * 0.05, time, pool.perRock)
            target.onHit()
          }
        }
        // 撃ち終わり：発射口から湯気
        if (fade > 0 && !s.steamShown) {
          s.steamShown = true
          steam.material.uniforms.uStart.value = time
        }
      }
    }
    ribbons.current.visible = beamOn

    // 白く光った岩を、少しあとで砕く
    if (s.pending.length) {
      const elapsed = clock.getElapsedTime()
      s.pending = s.pending.filter((p) => {
        if (time - p.at < HIT_FLASH) return true
        p.mesh.setColorAt(p.index, p.color)
        if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true
        p.mesh.setMatrixAt(p.index, zero)
        p.mesh.instanceMatrix.needsUpdate = true
        asteroids.destroyed.push({ mesh: p.mesh, index: p.index, matrix: p.matrix, at: elapsed })
        v.setFromMatrixPosition(p.matrix).applyMatrix4(p.mesh.matrixWorld)
        spawnShards(v, p.size, time, pool.perRock)
        if (rockBreaks.size) {
          const rock = { shape: asteroids.meshes.indexOf(p.mesh), index: p.index }
          for (const f of rockBreaks) f(asteroids.types.get(p.mesh)?.[p.index] ?? 0, p.size, v, rock)
        }
        s.rocks++
        return false
      })
    }

    // 光の球
    glow.current.visible = glowAlpha > 0.01
    glow.current.position.copy(m)
    glow.current.scale.setScalar(Math.max(1e-6, glowSize))
    glowMat.current.color.copy(color).multiplyScalar(1.4 * gain)
    glowMat.current.opacity = glowAlpha

    // ビームの色の光で、船体や岩を照らす（いつも置いておき、明るさだけ変える。光の数が変わるとシェーダーを作り直すので）
    const l = light.current
    l.position.copy(m).addScaledVector(dir, unit * (beamOn ? 0.12 : 0.03))
    l.color.copy(color).multiplyScalar(0.5)
    l.distance = unit * (beamOn ? 2.4 : 0.8)
    const lightTo = beamOn ? 1.5 + c.firing * 0.8 : c.charging ? 0.4 + 1.6 * chargeK : 0
    l.intensity += (lightTo - l.intensity) * ease(0.35)
    if (st.mode === 'map') l.intensity = 0

    // 光の輪
    for (const r of rings) {
      const k = (time - r.start - r.delay) / r.seconds
      r.mesh.visible = k >= 0 && k < 1
      if (!r.mesh.visible) continue
      r.mesh.position.copy(m)
      if (r.face === 'camera') r.mesh.quaternion.copy(camera.quaternion)
      else r.mesh.quaternion.setFromUnitVectors(zAxis, dir)
      r.mesh.scale.setScalar(r.size * (0.15 + 0.85 * (1 - (1 - k) ** 3)))
      r.mat.uniforms.uAlpha.value = (1 - k) ** 1.5
    }

    // 湯気と破片
    const su = steam.material.uniforms
    su.uCenter.value.copy(m)
    su.uUp.value.copy(shipUp)
    su.uTime.value = time
    su.uUnit.value = unit * 0.05
    su.uScale.value = scaleUniform
    shards.material.uniforms.uTime.value = time
    shards.material.uniforms.uGain.value = gain
    shards.material.uniforms.uScale.value = scaleUniform
    // 全体マップでは見せない。ただし光（pointLight）は隠さない：光の数が変わると、全部の材質のシェーダーを作り直すことになり、
    // マップからワープしたときに数秒止まる（ワープの声だけ先に流れて演出が遅れる）
    group.current.visible = st.mode !== 'map'
  })

  return (
    <>
    <group ref={group}>
      <group ref={ribbons} visible={false}>
        {/* 外側（太く色付き）→ 螺旋 → 芯（白く細い）の順に重ねる */}
        <mesh geometry={beam.geometry} material={beam.outer} frustumCulled={false} renderOrder={10} />
        <mesh geometry={beam.geometry} material={beam.spiralA} frustumCulled={false} renderOrder={11} />
        <mesh geometry={beam.geometry} material={beam.spiralB} frustumCulled={false} renderOrder={11} />
        <mesh geometry={beam.geometry} material={beam.core} frustumCulled={false} renderOrder={12} />
      </group>
      <points geometry={gather.geometry} material={gather.material} frustumCulled={false} renderOrder={12} />
      <points geometry={shards.geometry} material={shards.material} frustumCulled={false} renderOrder={12} />
      <points geometry={steam.geometry} material={steam.material} frustumCulled={false} renderOrder={9} />
      {rings.map((r, i) => (
        <primitive key={i} object={r.mesh} renderOrder={13} />
      ))}
      <sprite ref={glow} visible={false} renderOrder={13}>
        <spriteMaterial ref={glowMat} map={glowTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
    <pointLight ref={light} intensity={0} distance={1} decay={1} />
    </>
  )
}
