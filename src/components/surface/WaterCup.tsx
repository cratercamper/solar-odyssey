import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { stepWater, waterGone, type Water } from '../../data/water'
import { useWaterCup } from '../../state/waterCup'
import { useLanding } from '../../state/landing'
import { LANDER_POS, type Terrain } from './terrain'
import { dayProfile, sampleAt } from './dayProfile'
import { hoursPerSecond, useSkyClock } from './skyClock'
import { aimAt } from './viewAim'
import { ui } from '../../i18n'
import { useLang } from '../../i18n/lang'

// 水のコップ：目の前の小さな台に、水の入ったガラスのビーカーを置く。
// 星の気温と気圧で、泡が立ち、湯気が出て、凍り、消える（data/water.ts が中身の計算）。
// 真空では、沸いた水が勢いよく噴き出して、残りがその場で凍る

/** ビーカーの内側の半径と、水を入れる高さ（m） */
const R = 0.066
const FILL = 0.15
const GLASS_H = 0.19
/** 台の高さと、目からの距離（m） */
const TABLE_H = 1.02
const AHEAD = 1.55
/** 氷は水より 9% かさが増える */
const ICE_GROW = 1.09
const BUBBLES = 56
const VAPOR = 90
/** 地球の晴れた真昼の、地面の明るさ（ルクス）：日ざしの強さのものさし */
const LUX_1AU = 120000

/** ガラスの目盛り（白い線と数字。透けるところは透明） */
function scaleTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(255,255,255,0.85)'
  g.font = 'bold 18px sans-serif'
  for (let i = 1; i <= 8; i++) {
    const y = 256 - (i / 9.5) * 256
    const long = i % 2 === 0
    g.fillRect(20, y - 1.5, long ? 44 : 26, 3)
    if (long) g.fillText(String(i * 100), 70, y + 6)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 氷の白いくもり（閉じこめた泡と細いひび） */
function iceTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#dfeaf2'
  g.fillRect(0, 0, 256, 256)
  let s = 7
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.5})`
    g.beginPath()
    g.arc(rnd() * 256, rnd() * 256, 0.6 + rnd() * 2.4, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = 'rgba(150,175,195,0.55)'
  g.lineWidth = 1
  for (let i = 0; i < 14; i++) {
    let x = rnd() * 256
    let y = rnd() * 256
    g.beginPath()
    g.moveTo(x, y)
    for (let k = 0; k < 5; k++) g.lineTo((x += (rnd() - 0.5) * 50), (y += (rnd() - 0.5) * 50))
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** 湯気・しぶき：丸くぼけた点。aA は濃さ、aS は大きさ（m） */
function vaporMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 600 }, uColor: { value: new THREE.Color('#ffffff') } },
    vertexShader: `
      attribute float aA;
      attribute float aS;
      varying float vA;
      uniform float uScale;
      void main() {
        vA = aA;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aS * uScale / max(0.05, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      uniform vec3 uColor;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = dot(d, d) * 4.0;
        if (r > 1.0) discard;
        gl_FragColor = vec4(uColor, vA * (1.0 - r) * (1.0 - r));
      }`,
  })
}

type Puff = { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; s0: number; s1: number; a: number }

/** 凍った泡のでこぼこ（x, y, 高さ） */
const BUMPS: [number, number, number][] = Array.from({ length: 9 }, (_, i) => {
  const a = i * 2.4
  const r = 0.012 + ((i * 37) % 9) * 0.005
  return [Math.cos(a) * r, Math.sin(a) * r, 0.003 + ((i * 53) % 7) * 0.0012]
})

const fwd = new THREE.Vector3()
const m4 = new THREE.Matrix4()
const pos = new THREE.Vector3()
const quat = new THREE.Quaternion()
const scl = new THREE.Vector3()

export function WaterCup({ terrain }: { terrain: Terrain }) {
  const id = useWaterCup((c) => c.id)
  const at = useWaterCup((c) => c.at)
  if (!id || id !== terrain.def.id) return null
  return <Cup key={at} terrain={terrain} />
}

function Cup({ terrain }: { terrain: Terrain }) {
  useLang()
  const { camera, size } = useThree()
  const def = terrain.def
  const profile = useMemo(() => dayProfile(def), [def])
  // 置く場所：目で見ている向きの前（着陸船を外から見ていたら、自分の目から着陸船の少し横）
  const place = useMemo(() => {
    if (useLanding.getState().view === 'eye') {
      camera.getWorldDirection(fwd)
      fwd.y = 0
    } else fwd.set(LANDER_POS.x, 0, LANDER_POS.y).applyAxisAngle(THREE.Object3D.DEFAULT_UP, 0.45)
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1)
    fwd.normalize()
    const p = new THREE.Vector3(fwd.x * AHEAD, 0, fwd.z * AHEAD)
    p.y = terrain.height(p.x, p.z)
    return { p, yaw: Math.atan2(fwd.x, fwd.z) }
  }, [camera, terrain])
  const top = place.p.y + TABLE_H

  // 置いたら、目の高さに切りかえて、コップの方を向く（少し寄って）
  useEffect(() => {
    useLanding.setState({ view: 'eye' })
    aimAt(new THREE.Vector3(place.p.x, top + 0.13, place.p.z), 2.2, 27)
  }, [place, top])

  const tex = useMemo(() => ({ scale: scaleTexture(), ice: iceTexture() }), [])
  const mats = useMemo(() => {
    const glass = new THREE.MeshPhysicalMaterial({ color: '#f4fbff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 })
    const marks = new THREE.MeshBasicMaterial({ map: tex.scale, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.8 })
    const water = new THREE.MeshPhysicalMaterial({ color: '#3f8ad0', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.62, clearcoat: 1, envMapIntensity: 1.3 })
    const surface = new THREE.MeshPhysicalMaterial({ color: '#8cc4f0', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.75, clearcoat: 1, envMapIntensity: 1.8 })
    const ice = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex.ice, roughness: 0.4, metalness: 0, transparent: true, opacity: 0.93, emissive: '#6f879e', emissiveIntensity: 0.45 })
    const froth = new THREE.MeshStandardMaterial({ color: '#f6fbff', roughness: 0.85, metalness: 0, emissive: '#8094a8', emissiveIntensity: 0.4 })
    const foam = new THREE.MeshStandardMaterial({ color: '#f4fbff', roughness: 0.7, transparent: true, opacity: 0, depthWrite: false })
    const bubble = new THREE.MeshStandardMaterial({ color: '#e8f6ff', roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false })
    const metal = new THREE.MeshStandardMaterial({ color: '#2a2f36', roughness: 0.7, metalness: 0.15 })
    const dark = new THREE.MeshStandardMaterial({ color: '#40454d', roughness: 0.6, metalness: 0.5 })
    return { glass, marks, water, surface, ice, froth, foam, bubble, metal, dark }
  }, [tex])
  const vapor = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(VAPOR * 3), 3))
    geo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(VAPOR), 1))
    geo.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(VAPOR), 1))
    const pts = new THREE.Points(geo, vaporMaterial())
    pts.frustumCulled = false
    pts.renderOrder = 4
    return pts
  }, [])
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) m.dispose()
      tex.scale.dispose()
      tex.ice.dispose()
      vapor.geometry.dispose()
      ;(vapor.material as THREE.Material).dispose()
    },
    [mats, tex, vapor],
  )

  // 真空で一気に凍った氷の上は、泡が固まってでこぼこ
  const froth = useMemo(() => {
    const g = new THREE.RingGeometry(0.0005, R - 0.001, 48, 7)
    const p = g.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i)) / R
      let z = 0.002
      for (const [bx, by, h] of BUMPS) z += h * Math.exp(-((p.getX(i) - bx) ** 2 + (p.getY(i) - by) ** 2) / 0.00035)
      p.setZ(i, (z + Math.random() * 0.0008) * (1 - r * r * 0.6))
    }
    g.computeVertexNormals()
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  useEffect(() => () => froth.dispose(), [froth])
  const frothMesh = useRef<THREE.Mesh>(null)
  const foamMesh = useRef<THREE.Mesh>(null)
  const waterMesh = useRef<THREE.Mesh>(null)
  const surfMesh = useRef<THREE.Mesh>(null)
  const iceMesh = useRef<THREE.Mesh>(null)
  const bubbles = useRef<THREE.InstancedMesh>(null)
  const tempLabel = useRef<HTMLElement>(null)
  const stateLabel = useRef<HTMLElement>(null)
  const sim = useRef({ w: useWaterCup.getState().water, push: 0, b: [] as { x: number; z: number; y: number; v: number; r: number }[], puffs: [] as Puff[], spawn: 0, t: 0 })

  // 泡の出発点
  useMemo(() => {
    const b = sim.current.b
    for (let i = 0; i < BUBBLES; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * (R - 0.01)
      b.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: Math.random(), v: 0.6 + Math.random() * 0.8, r: 0.6 + Math.random() * 0.8 })
    }
  }, [])

  const vacuum = def.id !== 'earth' && def.id !== 'venus' && def.id !== 'titan'

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = sim.current
    s.t += dt
    const clock = useSkyClock.getState().clock
    const rate = useSkyClock.getState().rate
    const speed = Math.max(360, hoursPerSecond(rate, def.id) * 3600)
    const env = { id: def.id, temp: sampleAt(profile.temp, clock), sun: sampleAt(profile.lux, clock) / LUX_1AU }
    // 置いてすぐの 0.6 秒は、ただ置かれている（何が起きるか見る間）
    const w: Water = s.t < 0.6 ? s.w : stepWater(s.w, env, dt, speed)
    s.w = w
    s.push += dt
    if (s.push > 0.2) {
      s.push = 0
      useWaterCup.setState({ water: w, env: env.temp, sim: speed })
    }

    // 水と氷の高さ（氷は水の上に浮く）
    // 真空で激しく沸くあいだは、泡で水かさが増える
    const hl = FILL * w.liquid * (1 + (vacuum ? 0.22 : 0.06) * w.boil)
    const hi = FILL * w.ice * ICE_GROW
    const base = 0.006
    const shake = w.boil * (vacuum ? 0.004 : 0.0015)
    if (waterMesh.current) {
      waterMesh.current.visible = hl > 0.0008
      waterMesh.current.scale.set(1, Math.max(1e-4, hl), 1)
      waterMesh.current.position.y = base + hl / 2
    }
    if (surfMesh.current) {
      surfMesh.current.visible = hl > 0.0008 && hi < 0.001
      surfMesh.current.position.set((Math.random() - 0.5) * shake, base + hl + 0.0005 + (Math.random() - 0.5) * shake * 1.5, (Math.random() - 0.5) * shake)
      surfMesh.current.rotation.set(-Math.PI / 2 + (Math.random() - 0.5) * w.boil * 0.25, 0, (Math.random() - 0.5) * w.boil * 0.25)
    }
    if (foamMesh.current) {
      foamMesh.current.visible = hl > 0.0008 && w.boil > 0.2
      foamMesh.current.position.y = base + hl + 0.002
      foamMesh.current.scale.setScalar(0.9 + Math.random() * 0.1)
      foamMesh.current.rotation.y = Math.random() * 6
      mats.foam.opacity = Math.min(0.85, w.boil * (vacuum ? 0.85 : 0.4))
    }
    if (frothMesh.current) {
      frothMesh.current.visible = hi > 0.0008 && w.flashed
      frothMesh.current.position.y = base + hl + hi
    }
    if (iceMesh.current) {
      iceMesh.current.visible = hi > 0.0008
      iceMesh.current.scale.set(1, Math.max(1e-4, hi), 1)
      iceMesh.current.position.y = base + hl + hi / 2
      // 真空で一気に凍った氷は泡だらけで白い。ゆっくり凍った氷は少し透ける
      ;(iceMesh.current.material as THREE.MeshStandardMaterial).opacity = w.flashed ? 0.96 : 0.86
    }

    // 泡：沸く強さに合わせて数と速さ
    const bm = bubbles.current
    if (bm) {
      const n = Math.round(BUBBLES * Math.min(1, w.boil * 1.2))
      for (let i = 0; i < BUBBLES; i++) {
        const b = s.b[i]
        if (i >= n || hl < 0.004) {
          m4.makeScale(0, 0, 0)
          bm.setMatrixAt(i, m4)
          continue
        }
        b.y += (dt * b.v * (0.5 + 2.2 * w.boil) * (vacuum ? 2 : 1)) / Math.max(0.02, hl / FILL)
        if (b.y > 1) b.y -= 1
        const r = 0.0025 * b.r * (1 + 1.5 * w.boil) * (vacuum ? 2.2 : 1) * (0.6 + 0.6 * b.y)
        pos.set(b.x + Math.sin(s.t * 9 + i) * 0.002, base + b.y * hl, b.z)
        m4.compose(pos, quat.identity(), scl.setScalar(r))
        bm.setMatrixAt(i, m4)
      }
      bm.instanceMatrix.needsUpdate = true
    }

    // 湯気としぶき
    const topY = base + hl + hi
    let rateP = 0
    if (w.liquid > 0 && w.boil > 0.3) rateP = vacuum ? 80 : 22 * w.boil
    if (w.sublime > 0) rateP = Math.max(rateP, 10 * w.sublime)
    s.spawn += rateP * dt
    while (s.spawn >= 1) {
      s.spawn -= 1
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * R * 0.8
      const p: Puff = { x: Math.cos(a) * r, y: topY, z: Math.sin(a) * r, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: 0.02, s1: 0.1, a: 0.3 }
      if (vacuum && w.liquid > 0) {
        // 真空：空気に止められないので、まっすぐ勢いよく飛び散る（すぐ見えなくなる）
        const sp = 0.6 + Math.random() * 1.6
        const tilt = Math.random() * 0.7
        p.vx = Math.cos(a) * Math.sin(tilt) * sp
        p.vz = Math.sin(a) * Math.sin(tilt) * sp
        p.vy = Math.cos(tilt) * sp
        p.life = 0.35 + Math.random() * 0.35
        p.s0 = 0.008
        p.s1 = 0.05
        p.a = 0.75
      } else if (vacuum) {
        // 昇華：うすい気体が、ふわっと散る
        p.vy = 0.25 + Math.random() * 0.2
        p.vx = (Math.random() - 0.5) * 0.2
        p.vz = (Math.random() - 0.5) * 0.2
        p.life = 0.8
        p.s0 = 0.02
        p.s1 = 0.12
        p.a = 0.12
      } else {
        // 空気のある星：湯気がゆらゆら昇って広がる。金星の 460℃ の空気では水蒸気は冷えて白くならず、ほとんど見えない
        p.vy = 0.12 + Math.random() * 0.1
        p.vx = (Math.random() - 0.5) * 0.05
        p.vz = (Math.random() - 0.5) * 0.05
        p.life = 2 + Math.random()
        p.s0 = 0.03
        p.s1 = 0.3
        p.a = def.id === 'venus' ? 0.1 : 0.35
      }
      if (s.puffs.length >= VAPOR) s.puffs.shift()
      s.puffs.push(p)
    }
    const P = vapor.geometry.getAttribute('position') as THREE.BufferAttribute
    const A = vapor.geometry.getAttribute('aA') as THREE.BufferAttribute
    const S = vapor.geometry.getAttribute('aS') as THREE.BufferAttribute
    const g = def.gravity * 9.81
    s.puffs = s.puffs.filter((p) => (p.age += dt) < p.life)
    for (let i = 0; i < VAPOR; i++) {
      const p = s.puffs[i]
      if (!p) {
        A.setX(i, 0)
        continue
      }
      if (vacuum && w.liquid > 0) p.vy -= g * dt * 0.3
      else {
        p.vx += Math.sin(s.t * 1.3 + i) * 0.01 * dt
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      const k = p.age / p.life
      P.setXYZ(i, p.x, p.y, p.z)
      A.setX(i, p.a * Math.min(1, k * 6) * (1 - k))
      S.setX(i, p.s0 + (p.s1 - p.s0) * k)
    }
    P.needsUpdate = A.needsUpdate = S.needsUpdate = true
    ;(vapor.material as THREE.ShaderMaterial).uniforms.uScale.value = size.height / (2 * Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2)))

    // 名札：水の温度と、いまの様子
    const tx = ui().waterCup
    if (tempLabel.current) tempLabel.current.textContent = waterGone(w) ? tx.gone : tx.temp(Math.round(w.temp))
    if (stateLabel.current) {
      stateLabel.current.textContent =
        waterGone(w) ? '' :
        w.liquid > 0 && w.boil > 0.3 ? tx.state.boiling :
        w.freezing ? tx.state.freezing :
        w.sublime > 0.05 ? tx.state.subliming :
        w.liquid === 0 ? tx.state.ice :
        w.ice > 0 ? tx.state.slush : tx.state.liquid
    }
  })

  const legs = [0, 1, 2, 3].map((i) => {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    return [Math.cos(a) * 0.19, Math.sin(a) * 0.19] as const
  })
  return (
    <group position={place.p} rotation-y={place.yaw}>
      {/* 台：四本脚の小さな金属のテーブル */}
      <mesh position-y={TABLE_H - 0.012} material={mats.metal} castShadow receiveShadow>
        <boxGeometry args={[0.34, 0.022, 0.34]} />
      </mesh>
      {legs.map(([x, z], i) => (
        <mesh key={i} position={[x, (TABLE_H - 0.02) / 2 - 0.05, z]} material={mats.dark} castShadow>
          <cylinderGeometry args={[0.011, 0.013, TABLE_H + 0.08, 8]} />
        </mesh>
      ))}
      <mesh position-y={0.32} material={mats.dark}>
        <boxGeometry args={[0.28, 0.01, 0.28]} />
      </mesh>
      <group position-y={TABLE_H}>
        {/* ビーカー */}
        <mesh material={mats.water} ref={waterMesh} renderOrder={1}>
          <cylinderGeometry args={[R, R, 1, 40]} />
        </mesh>
        <mesh material={mats.surface} ref={surfMesh} renderOrder={1}>
          <circleGeometry args={[R, 40]} />
        </mesh>
        <mesh material={mats.foam} ref={foamMesh} renderOrder={2} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[R, 24]} />
        </mesh>
        <mesh material={mats.froth} ref={frothMesh} geometry={froth} renderOrder={1} />
        <mesh material={mats.ice} ref={iceMesh} renderOrder={1} castShadow>
          <cylinderGeometry args={[R - 0.001, R, 1, 40]} />
        </mesh>
        <instancedMesh ref={bubbles} args={[undefined, undefined, BUBBLES]} material={mats.bubble} renderOrder={2} frustumCulled={false}>
          <sphereGeometry args={[1, 8, 6]} />
        </instancedMesh>
        <mesh position-y={GLASS_H / 2} material={mats.glass} renderOrder={3} castShadow>
          <cylinderGeometry args={[R + 0.003, R + 0.003, GLASS_H, 48, 1, true]} />
        </mesh>
        <mesh position-y={0.003} material={mats.glass} renderOrder={3}>
          <cylinderGeometry args={[R + 0.003, R + 0.003, 0.006, 48]} />
        </mesh>
        <mesh position-y={GLASS_H} rotation-x={Math.PI / 2} material={mats.glass} renderOrder={3}>
          <torusGeometry args={[R + 0.003, 0.0025, 6, 48]} />
        </mesh>
        {/* 目盛り：こちら側だけ */}
        <mesh position-y={GLASS_H / 2} material={mats.marks} renderOrder={3}>
          <cylinderGeometry args={[R + 0.0036, R + 0.0036, GLASS_H, 16, 1, true, Math.PI - 0.35, 0.7]} />
        </mesh>
        <primitive object={vapor} />
        <group position-y={GLASS_H + 0.07}>
          <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
            <div className="cup-tag">
              <b ref={tempLabel} />
              <span ref={stateLabel} />
            </div>
          </Html>
        </group>
      </group>
    </group>
  )
}
