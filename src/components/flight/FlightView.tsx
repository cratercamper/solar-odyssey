import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildChunk, chunkCenterDir, chunkSize, dirOf, heightAt, keyOf, loadMoonMap, MOON_R, type ChunkKey, type GlobalMap } from './moonGlobe'
import { FlightCtl, LapMeter, type FlightInput } from './flightControl'
import { flightNow, lapDone, useSkyFlight } from '../../state/skyFlight'
import { useSkyClock } from '../surface/skyClock'
import { useLanding } from '../../state/landing'
import { loadCatalog } from '../Sky'
import { currentLevel, lowMemory, useDpr } from '../../state/quality'
import { FlightPanel, flightPad } from './FlightPanel'

// 着陸船で月の空を飛ぶ場面。月は丸ごと一つの球（moonGlobe.ts の四分木のかけら）、空には星・太陽・地球。
// 着陸船のうしろから追いかけるカメラ。操縦は flightControl.ts。

/** 着陸地点の緯度・経度（度）。地表の場面の着陸地点と同じ場所から飛び立つ */
const SITES: Record<string, [number, number]> = {
  moon: [0.67, 23.47], // 静かの海（アポロ 11 号のそば）
  taurus: [20.19, 30.77], // タウルス・リットロウの谷（アポロ 17 号）
}
/** 写真の地図（4k_moon.jpg）は、標高の地図より少し東へずれている（地形とくらべて求めた） */
const TEX_SHIFT = -42 / 2048
const LANDER_M = 24
const EARTH_DIST = 3_000_000
const EARTH_R = (EARTH_DIST * 6371) / 384_400

// ---- 月の材質 ----
const moonVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 dir;
  varying vec3 vN;
  varying vec3 vDir;
  void main() {
    vN = normal;
    vDir = dir;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`
const moonFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uMap;
  uniform vec3 uSun;
  uniform vec3 uEarth;
  uniform float uShift;
  uniform float uDetail;
  varying vec3 vN;
  varying vec3 vDir;
  float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    #include <logdepthbuf_fragment>
    vec3 d = normalize(vDir);
    float lon = atan(-d.z, d.x);
    float lat = asin(clamp(d.y, -1.0, 1.0));
    vec2 uv = vec2((lon + PI) / (2.0 * PI) + uShift, (lat + 0.5 * PI) / PI);
    // 経度 ±180° のつぎ目で色の地図の細かさを取り違えないように、つぎ目をずらした座標の変化も見る
    vec2 uv2 = vec2(fract(uv.x + 0.5) - 0.5, uv.y);
    vec2 dx = dFdx(uv); vec2 dy = dFdy(uv);
    vec2 dx2 = dFdx(uv2); vec2 dy2 = dFdy(uv2);
    if (dot(dx2, dx2) + dot(dy2, dy2) < dot(dx, dx) + dot(dy, dy)) { dx = dx2; dy = dy2; }
    vec3 albedo = textureGrad(uMap, fract(uv), dx, dy).rgb;
    albedo = pow(albedo, vec3(2.2));
    // 近くでは細かいまだら（色の地図の 1 画素は 2.7 km もある）
    vec3 p = d * ${MOON_R.toFixed(1)};
    float m = vnoise(p / 140.0) * 0.6 + vnoise(p / 35.0) * 0.4;
    albedo *= mix(1.0, 0.75 + 0.5 * m, uDetail);
    vec3 n = normalize(vN);
    float mu0 = dot(n, uSun);
    // 月の砂の明るさ（ロンメル・ゼーリガー則と、ふつうの拡散のまぜ）。昼と夜のさかいは地形で少しぼかす
    float lit = max(mu0, 0.0);
    float day = smoothstep(-0.04, 0.06, dot(d, uSun));
    vec3 c = albedo * lit * day * 1.45;
    // 地球の照り返し（地球のほうを向いた面だけ、ほんのり青白く）
    c += albedo * vec3(0.02, 0.026, 0.038) * max(dot(n, uEarth), 0.0);
    // 星明かり（夜の側も、地形がうっすら分かるくらい）
    c += albedo * 0.008;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

type Chunk = { mesh: THREE.Mesh; used: number; level: number }

/** かけらの細かさの上限と、分ける近さ（画質で変える） */
function lodSettings() {
  const lvl = currentLevel()
  if (lvl === 'low' || lowMemory()) return { max: 13, split: 1.25, budget: 3 }
  if (lvl === 'medium') return { max: 13, split: 1.6, budget: 4 }
  return { max: 14, split: 2, budget: 6 }
}

function MoonGlobe({ map, sun, earth }: { map: GlobalMap; sun: THREE.Vector3; earth: THREE.Vector3 }) {
  const tex = useTexture(`${import.meta.env.BASE_URL}textures/4k_moon.jpg`)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const material = useMemo(() => {
    tex.colorSpace = THREE.NoColorSpace
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    tex.wrapS = THREE.RepeatWrapping
    tex.needsUpdate = true
    return new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uSun: { value: sun }, uEarth: { value: earth }, uShift: { value: TEX_SHIFT }, uDetail: { value: 0 } },
      vertexShader: moonVertex,
      fragmentShader: moonFragment,
    })
  }, [tex, sun, earth, gl])
  const group = useMemo(() => new THREE.Group(), [])
  const lod = useMemo(() => {
    const chunks = new Map<string, Chunk>()
    const queue = new Map<string, ChunkKey>()
    const make = (k: ChunkKey) => {
      const { geometry, center } = buildChunk(map, k)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.copy(center)
      mesh.visible = false
      mesh.name = 'moon-chunk'
      group.add(mesh)
      const c = { mesh, used: 0, level: k.level }
      chunks.set(keyOf(k), c)
      return c
    }
    // 6 面の根は先に作る（穴が開かないように）
    for (let f = 0; f < 6; f++) make({ face: f, level: 0, i: 0, j: 0 })
    return { chunks, queue, make, frame: 0, settings: lodSettings() }
  }, [map, material, group])
  useEffect(
    () => () => {
      for (const c of lod.chunks.values()) c.mesh.geometry.dispose()
      material.dispose()
    },
    [lod, material],
  )

  const cd = useMemo(() => new THREE.Vector3(), [])
  const camDir = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const { chunks, queue, make, settings } = lod
    const f = ++lod.frame
    const cam = camera.position
    const camR = cam.length()
    camDir.copy(cam).normalize()
    const alt = camR - MOON_R
    material.uniforms.uDetail.value = THREE.MathUtils.clamp(1 - alt / 40000, 0, 1)
    // 地平線の向こうは描かない（山の高さのぶん余裕をみる）
    const horizon = Math.acos(THREE.MathUtils.clamp((MOON_R - 9000) / Math.max(camR, MOON_R - 8000), -1, 1)) + Math.acos((MOON_R - 9000) / (MOON_R + 11000))
    for (const c of chunks.values()) c.mesh.visible = false
    const visit = (k: ChunkKey) => {
      const size = chunkSize(k.level)
      chunkCenterDir(k, cd)
      const ang = Math.acos(THREE.MathUtils.clamp(cd.dot(camDir), -1, 1))
      if (k.level > 1 && ang - (size / MOON_R) * 0.8 > horizon) return
      const dist = Math.max(0, cd.multiplyScalar(MOON_R).distanceTo(cam) - size * 0.75)
      const self = chunks.get(keyOf(k))
      if (k.level < settings.max && dist < size * settings.split) {
        const kids: ChunkKey[] = []
        for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) kids.push({ face: k.face, level: k.level + 1, i: k.i * 2 + di, j: k.j * 2 + dj })
        const ready = kids.every((c) => chunks.has(keyOf(c)))
        if (ready) {
          for (const c of kids) visit(c)
          if (self) self.used = f
          return
        }
        for (const c of kids) if (!chunks.has(keyOf(c))) queue.set(keyOf(c), c)
      }
      if (self) {
        self.mesh.visible = true
        self.used = f
      }
    }
    for (let face = 0; face < 6; face++) visit({ face, level: 0, i: 0, j: 0 })
    // 足りないかけらを作る：粗いもの・近いものから、1 コマに数 ms まで
    if (queue.size) {
      const list = [...queue.values()].sort((a, b) => a.level - b.level || chunkCenterDir(a, cd).distanceToSquared(camDir) - chunkCenterDir(b, _t).distanceToSquared(camDir))
      const t0 = performance.now()
      for (const k of list) {
        make(k)
        queue.delete(keyOf(k))
        if (performance.now() - t0 > settings.budget) break
      }
      // 使われなくなったものは忘れる（次のコマにまた要るなら、また入る）
      queue.clear()
    }
    // 長く使っていないかけらを捨てる
    if (chunks.size > 900 && f % 30 === 0) {
      for (const [key, c] of chunks) {
        if (c.level > 0 && f - c.used > 240) {
          group.remove(c.mesh)
          c.mesh.geometry.dispose()
          chunks.delete(key)
        }
      }
    }
  })
  return <primitive object={group} />
}
const _t = new THREE.Vector3()

// ---- 空：星・太陽・地球（カメラのまわりに置き、月より先に描く。月が手前を隠す） ----
function SkyDome({ sun, earth }: { sun: THREE.Vector3; earth: THREE.Vector3 }) {
  const camera = useThree((s) => s.camera)
  const [stars, setStars] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    let alive = true
    loadCatalog().then(
      (g) => alive && setStars(g),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [])
  const starMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute float mag;
          attribute vec3 color;
          varying vec3 vColor;
          void main() {
            float flux = pow(10.0, -0.4 * (mag - 1.5) * 0.6);
            vColor = color * min(flux * 1.6, 3.0);
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
            gl_Position.z = gl_Position.w * 0.999999;
            gl_PointSize = clamp(1.5 + 1.6 * sqrt(flux), 1.5, 5.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          void main() {
            float r = length(gl_PointCoord - 0.5) * 2.0;
            gl_FragColor = vec4(vColor * exp(-r * r * 3.0), 1.0);
          }`,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )
  const earthTex = useTexture(`${import.meta.env.BASE_URL}textures/2k_earth_daymap.jpg`)
  const earthMat = useMemo(() => {
    earthTex.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.9, metalness: 0, depthTest: false, depthWrite: false })
  }, [earthTex])
  const sunMat = useMemo(() => new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(6, 5.6, 5), blending: THREE.AdditiveBlending, transparent: false, depthTest: false, depthWrite: false, toneMapped: false }), [])
  useEffect(
    () => () => {
      starMat.dispose()
      earthMat.dispose()
      sunMat.map?.dispose()
      sunMat.dispose()
    },
    [starMat, earthMat, sunMat],
  )
  const starsRef = useRef<THREE.Points>(null)
  const earthRef = useRef<THREE.Mesh>(null)
  const sunRef = useRef<THREE.Sprite>(null)
  useFrame(() => {
    const c = camera.position
    starsRef.current?.position.copy(c)
    earthRef.current?.position.copy(c).addScaledVector(earth, EARTH_DIST)
    sunRef.current?.position.copy(c).addScaledVector(sun, EARTH_DIST * 1.2)
  })
  return (
    <>
      {stars && <points ref={starsRef} geometry={stars} material={starMat} scale={1000} renderOrder={-3} frustumCulled={false} />}
      <sprite ref={sunRef} material={sunMat} scale={EARTH_DIST * 1.2 * 0.02} renderOrder={-2} />
      <mesh ref={earthRef} material={earthMat} renderOrder={-1} rotation={[0, Math.PI, 0]} name="flight-earth">
        <sphereGeometry args={[EARTH_R, 48, 32]} />
      </mesh>
    </>
  )
}

/** 丸い光の点のテクスチャ */
function dotTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.35, 'rgba(255,255,255,0.8)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 32, 32)
  return new THREE.CanvasTexture(c)
}

/** 金属が真っ黒にならないように、部屋の光の映りこみ（宇宙なので弱く） */
function Reflections() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.35
    return () => {
      if (scene.environment === env) scene.environment = null
      env.dispose()
      pmrem.dispose()
      room.dispose()
    }
  }, [gl, scene])
  return null
}

// ---- 着陸船 ----
function Ship({ ctl }: { ctl: FlightCtl }) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/ship-lander.glb`)
  const model = useMemo(() => {
    const m = scene.clone(true)
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.75, 2), toneMapped: false })
    m.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const src = mesh.material as THREE.MeshStandardMaterial
      if (src.name === 'Glow') mesh.material = glow
    })
    // 飛んでいるあいだは脚をしまう
    const legs = m.getObjectByName('Legs')
    if (legs) legs.visible = false
    return m
  }, [scene])
  const marker = useMemo(() => new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(1.6, 1.3, 0.6), sizeAttenuation: false, depthTest: false, depthWrite: false, toneMapped: false, transparent: true }), [])
  useEffect(() => () => marker.dispose(), [marker])
  const group = useRef<THREE.Group>(null)
  const basis = useMemo(() => ({ m: new THREE.Matrix4(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), v: new THREE.Vector3() }), [])
  useFrame(() => {
    const g = group.current
    if (!g) return
    g.position.copy(ctl.p)
    // 機首（模型の -z）を進む向きへ、上を月の上へ。曲がるときは傾ける
    const v = ctl.velocityDir(basis.v)
    basis.z.copy(v).negate()
    basis.y.copy(ctl.up).addScaledVector(basis.z, -ctl.up.dot(basis.z)).normalize()
    basis.y.applyAxisAngle(basis.z, -ctl.bank)
    basis.x.crossVectors(basis.y, basis.z)
    basis.m.makeBasis(basis.x, basis.y, basis.z)
    g.quaternion.setFromRotationMatrix(basis.m)
  })
  return (
    <group ref={group} name="flight-lander">
      <primitive object={model} scale={LANDER_M} position={[0, -3, 0]} />
      {/* 遠くから見ても、どこにいるか分かる光の点 */}
      <sprite material={marker} scale={[0.012, 0.012, 1]} renderOrder={5} />
    </group>
  )
}

// ---- 操縦とカメラ ----
const keys = new Set<string>()
function useKeys() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      keys.add(e.code)
      const s = useSkyFlight.getState()
      if (e.code === 'KeyE' || e.code === 'Equal' || e.code === 'NumpadAdd') useSkyFlight.setState({ gear: Math.min(7, s.gear + 1) })
      if (e.code === 'KeyQ' || e.code === 'Minus' || e.code === 'NumpadSubtract') useSkyFlight.setState({ gear: Math.max(0, s.gear - 1) })
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
    }
    const up = (e: KeyboardEvent) => keys.delete(e.code)
    const blur = () => keys.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      keys.clear()
    }
  }, [])
}

function Pilot({ map, start, heading }: { map: GlobalMap; start: THREE.Vector3; heading: THREE.Vector3 }) {
  useKeys()
  const camera = useThree((s) => s.camera)
  const el = useThree((s) => s.gl.domElement)
  const ctl = useMemo(() => {
    const c = new FlightCtl(MOON_R)
    c.place(start, heightAt(map, start.x, start.y, start.z) + 25, heading, 0)
    // 飛び立つ：少し機首を上げて
    c.pitch = 0.45
    return c
  }, [map, start, heading])
  const lap = useMemo(() => {
    const l = new LapMeter()
    l.start(ctl.p, ctl.fwd)
    return l
  }, [ctl])
  const restart = useSkyFlight((s) => s.restart)
  useEffect(() => {
    if (restart) lap.start(ctl.p, ctl.fwd)
  }, [restart, lap, ctl])
  // カメラのまわり方（ドラッグで見回す。離すとゆっくり後ろへ戻る）
  const look = useRef({ yaw: 0, pitch: 0.18, drag: false, x: 0, y: 0 })
  useEffect(() => {
    const down = (e: PointerEvent) => {
      look.current.drag = true
      look.current.x = e.clientX
      look.current.y = e.clientY
    }
    const move = (e: PointerEvent) => {
      const L = look.current
      if (!L.drag) return
      L.yaw -= (e.clientX - L.x) * 0.006
      L.pitch = THREE.MathUtils.clamp(L.pitch + (e.clientY - L.y) * 0.004, -0.5, 1.3)
      L.x = e.clientX
      L.y = e.clientY
    }
    const up = () => (look.current.drag = false)
    const wheel = (e: WheelEvent) => {
      const s = useSkyFlight.getState()
      useSkyFlight.setState({ gear: THREE.MathUtils.clamp(s.gear + (e.deltaY < 0 ? 1 : -1), 0, 7) })
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('wheel', wheel, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [el])
  const tmp = useMemo(() => ({ back: new THREE.Vector3(), side: new THREE.Vector3(), cam: new THREE.Vector3(), look: new THREE.Vector3(), along: new THREE.Vector3(), ui: 0 }), [])
  const ground = useMemo(() => (d: THREE.Vector3) => heightAt(map, d.x, d.y, d.z), [map])
  const input = useMemo<FlightInput>(() => ({ turn: 0, pitch: 0, gear: 0 }), [])
  // 確かめる用（#debug）
  useEffect(() => {
    if (location.hash.includes('debug')) (window as unknown as { __flight: unknown }).__flight = { ctl, lap }
  }, [ctl, lap])

  // 優先度 -1：着陸船の模型（Ship）より先に動かす。後だと、模型が 1 コマ前の位置に描かれる。
  // 負の優先度なので、描画は R3F がこれまでどおり自分でする（自分で描かなくなるのは正の優先度のときだけ）
  useFrame((_, dt) => {
    const k = (c: string) => (keys.has(c) ? 1 : 0)
    input.turn = THREE.MathUtils.clamp(k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft') + flightPad.turn, -1, 1)
    input.pitch = THREE.MathUtils.clamp(k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown') + flightPad.pitch, -1, 1)
    input.gear = useSkyFlight.getState().gear
    ctl.step(dt, input, ground)
    lap.update(ctl.p)
    // 一周
    const st = useSkyFlight.getState()
    if (Math.abs(lap.angle) >= Math.PI * 2) {
      lapDone(flightNow() - st.lapSince)
      lap.start(ctl.p, ctl.fwd)
    }
    // カメラ：うしろの少し上から。速いほど少し離れる
    // 高く上がるほど離れて、上から見下ろす（高さ 300 km より上では月がまるごと見える）
    const high = THREE.MathUtils.smoothstep(ctl.alt, 2000, 300_000)
    // 縦長の画面（スマホ）では、横が狭いので少し離れる
    const narrow = (camera as THREE.PerspectiveCamera).aspect < 1 ? 1.7 : 1
    const dist = (70 + Math.min(160, ctl.speed * 0.01)) * narrow + ctl.alt * 0.9 * high
    const lift = 0.18 + 0.85 * high
    const L = look.current
    if (!L.drag) {
      L.yaw *= Math.exp(-dt * 0.8)
      L.pitch += (lift - L.pitch) * Math.min(1, dt * 0.8)
    }
    const back = tmp.back.copy(ctl.fwd).negate().applyAxisAngle(ctl.up, L.yaw)
    tmp.cam.copy(ctl.p).addScaledVector(back, dist * Math.cos(L.pitch)).addScaledVector(ctl.up, dist * Math.sin(L.pitch) + 8)
    // カメラが山にもぐらないように
    const camUp = tmp.side.copy(tmp.cam).normalize()
    const minR = MOON_R + ground(camUp) + 6
    if (tmp.cam.length() < minR) tmp.cam.setLength(minR)
    camera.position.copy(tmp.cam)
    camera.up.copy(ctl.up)
    camera.lookAt(tmp.look.copy(ctl.p).addScaledVector(ctl.up, 6))
    // 表示（4 回 / 秒）
    tmp.ui += dt
    if (tmp.ui > 0.25) {
      tmp.ui = 0
      const along = lap.along(ctl.up, tmp.along)
      const off = Math.atan2(tmp.side.crossVectors(along, ctl.fwd).dot(ctl.up), along.dot(ctl.fwd))
      useSkyFlight.setState({ alt: ctl.alt, speed: ctl.speed, lap: Math.max(0, Math.abs(lap.angle) / (Math.PI * 2)), off: -off })
    }
  }, -1)
  return <Ship ctl={ctl} />
}

function FlightScene({ map }: { map: GlobalMap }) {
  const site = useLanding.getState().site ?? 'moon'
  // 太陽：着陸地点の今の時刻から（12 時に真上、夕方は西へ）。地球：経度 0 の上（月はいつも同じ面を地球に向けている）
  const { sun, earth, start, heading } = useMemo(() => {
    const [lat, lon] = SITES[site] ?? SITES.moon
    const la = THREE.MathUtils.degToRad(lat)
    const lo = THREE.MathUtils.degToRad(lon)
    const clock = useSkyClock.getState().clock ?? 12
    const sunLon = lo - ((clock - 12) / 24) * Math.PI * 2
    const s = dirOf(0, sunLon)
    const st = dirOf(la, lo)
    // 東向きに飛び立つ（経度が増える向き）
    const east = new THREE.Vector3(0, 1, 0).cross(st).normalize()
    return { sun: s, earth: new THREE.Vector3(1, 0, 0), start: st, heading: east }
  }, [site])
  return (
    <>
      <Reflections />
      <SkyDome sun={sun} earth={earth} />
      <MoonGlobe map={map} sun={sun} earth={earth} />
      <directionalLight position={sun} intensity={3} />
      <ambientLight intensity={0.06} />
      <Pilot map={map} start={start} heading={heading} />
    </>
  )
}

const FlightCanvas = memo(function FlightCanvas({ map }: { map: GlobalMap }) {
  const dpr = useDpr(1.75)
  return (
    <Canvas dpr={dpr} gl={{ alpha: false, logarithmicDepthBuffer: true }} camera={{ fov: 60, near: 0.5, far: 8_000_000 }} onCreated={({ scene }) => (scene.background = new THREE.Color('#000'))}>
      <FlightScene map={map} />
    </Canvas>
  )
})

/** 月の空を飛ぶ場面（地表の場面の代わりに出す） */
export function FlightView() {
  const phase = useSkyFlight((s) => s.phase)
  const [map, setMap] = useState<GlobalMap | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    loadMoonMap().then(
      (m) => {
        if (!alive) return
        setMap(m)
        useSkyFlight.setState({ phase: 'fly' })
      },
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [])
  return (
    <div className="flight-view">
      {map && <FlightCanvas map={map} />}
      <FlightPanel loading={phase === 'loading'} failed={failed} />
    </div>
  )
}
