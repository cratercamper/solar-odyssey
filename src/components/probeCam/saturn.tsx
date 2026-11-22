import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { encounterRelative, sampleTracks, trackAt, type Encounter } from '../../data/trajectory'
import { poleOf } from '../../data/probeView'

// カッシーニが土星を回るあいだ（13年）の、模型の画面の部品：
//  ・道すじ：13年分（294周）を全部描くと線だらけになるので、今の前後だけを毎フレーム作る
//  ・衛星：タイタンとエンケラドゥスを、本物の位置（Horizons の値）に。近くの衛星は大きく見える
// 座標は画面の軸（黄道の x, 北, -y）。km の空間で作り、Encounter の縮め方（見かけの大きさを保つ）で置く

/** 黄道座標を画面の軸に */
const toScreen = (r: number[], out = new THREE.Vector3()) => out.set(r[0], r[2], -r[1])

const DAY_MS = 86_400_000
/** 描く範囲：今から何日前まで（通ったところ）と、何日先まで（これから通るところ） */
const BACK_DAYS = 18
const AHEAD_DAYS = 6
/** 1本の線の点の数の上限 */
const MAX_POINTS = 1500
const LINE_COLOR = 0xb59cff

/** 天体の重力で進む道を、点の間かくを変えながら（近いところは細かく）たどる */
function trace(e: Encounter, from: number, to: number, out: Float32Array) {
  const dir = Math.sign(to - from)
  let ms = from
  let n = 0
  const v = new THREE.Vector3()
  while (n < MAX_POINTS) {
    const s = encounterRelative(e, ms)
    out[n * 3] = s.r[0]
    out[n * 3 + 1] = s.r[2]
    out[n * 3 + 2] = -s.r[1]
    n++
    if ((to - ms) * dir <= 0) break
    // 土星からの距離を速さで割った時間の 2% ずつ（2分〜6時間）
    const r = Math.hypot(s.r[0], s.r[1], s.r[2])
    const speed = Math.max(0.1, v.set(s.v[0], s.v[1], s.v[2]).length())
    const step = THREE.MathUtils.clamp((r / speed) * 0.02, 120, 6 * 3600) * 1000
    ms = dir > 0 ? Math.min(to, ms + step) : Math.max(to, ms - step)
  }
  return n
}

/** 今の前後の道すじ（通ったところは明るく、これから通るところはうすく） */
export function OrbitTrail({ encounter, now }: { encounter: Encounter; now: () => number | null }) {
  const lines = useMemo(() => {
    const make = (opacity: number) => {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3))
      geometry.setDrawRange(0, 0)
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: LINE_COLOR, transparent: true, opacity, depthWrite: false, toneMapped: false }))
      line.frustumCulled = false
      return line
    }
    return { back: make(0.95), ahead: make(0.28) }
  }, [])
  const frame = useRef(0)
  useFrame(() => {
    const ms = now()
    const show = ms !== null && ms > encounter.ms
    lines.back.visible = lines.ahead.visible = show
    // 3フレームに1回作り直す（点の数が多いので）
    if (!show || frame.current++ % 3) return
    for (const [line, to] of [
      [lines.back, Math.max(encounter.ms, ms - BACK_DAYS * DAY_MS)],
      [lines.ahead, Math.min(encounter.until ?? ms, ms + AHEAD_DAYS * DAY_MS)],
    ] as const) {
      const attr = line.geometry.attributes.position as THREE.BufferAttribute
      line.geometry.setDrawRange(0, trace(encounter, ms, to, attr.array as Float32Array))
      attr.needsUpdate = true
    }
  })
  return (
    <>
      <primitive object={lines.back} />
      <primitive object={lines.ahead} />
    </>
  )
}

/** 衛星の見た目 */
type MoonLook = { name: string; radiusKm: number; color: string; haze?: string; plume?: boolean }
const MOONS: MoonLook[] = [
  // タイタン：厚いもやの大気で、オレンジ色のぼんやりした玉に見える
  { name: 'titan', radiusKm: 2575, color: '#c48a3c', haze: '#e9b467' },
  // エンケラドゥス：太陽系でいちばん白い（光をほとんど返す）。南極から水蒸気と氷のつぶが噴き出す
  { name: 'enceladus', radiusKm: 252, color: '#f4f7ff', plume: true },
]

/** 近くの衛星を置く距離の範囲（表示の単位）。カメラ（模型から十数 m）から見ても、見かけの大きさがほぼ本物になるよう、遠めに */
const NEAR_UNITS = 350
const FAR_UNITS = 4500
/** 土星を置く距離（ProbeCamCanvas の FAR）。衛星の前後関係を土星と合わせるため */
const SATURN_UNITS = 1000

/** カメラが向く先（近くの衛星があれば、その向き）。CameraRig が読む */
export const moonFocus: { dir: THREE.Vector3 | null } = { dir: null }

function plumeGeometry() {
  // 南極から、上へ広がる円すい形に、氷のつぶ（半径1の衛星の大きさで）
  const n = 900
  const pos = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const h = Math.pow(Math.random(), 0.7) * 2.2
    const spread = 0.15 + h * 0.45
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * spread
    pos[i * 3] = Math.cos(a) * r
    pos[i * 3 + 1] = -(0.95 + h)
    pos[i * 3 + 2] = Math.sin(a) * r
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  return g
}

/** タイタンとエンケラドゥス（土星を回るあいだだけ）。探査機から見た本物の向きに、見かけの大きさを保って置く */
export function SaturnMoons({ encounter, now }: { encounter: Encounter; now: () => { ms: number; rel: number[] } | null }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const pole = useMemo(() => toScreen(poleOf('saturn')).normalize(), [])
  const tilt = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pole), [pole])
  const plume = useMemo(plumeGeometry, [])
  const d = new THREE.Vector3()
  useFrame(() => {
    const s = now()
    const tracks = encounter.samples ? sampleTracks(encounter.samples) : null
    let focus: THREE.Vector3 | null = null
    let focusRadii = Infinity
    MOONS.forEach((m, i) => {
      const g = refs.current[i]
      if (!g) return
      const at = s && tracks?.[m.name] ? trackAt(tracks[m.name], s.ms, encounter.gm) : null
      if (!s || !at) {
        g.visible = false
        return
      }
      // 探査機から衛星へ（km）
      toScreen([at.r[0] - s.rel[0], at.r[1] - s.rel[1], at.r[2] - s.rel[2]], d)
      const dm = d.length()
      const ds = Math.hypot(s.rel[0], s.rel[1], s.rel[2])
      const units = THREE.MathUtils.clamp((SATURN_UNITS * dm) / ds, NEAR_UNITS, FAR_UNITS)
      const k = units / dm
      g.visible = true
      g.position.copy(d).multiplyScalar(k)
      g.scale.setScalar(m.radiusKm * k)
      g.quaternion.copy(tilt)
      // 衛星の半径の 40 倍より近ければ、カメラはその衛星を見る
      const radii = dm / m.radiusKm
      if (radii < 40 && radii < focusRadii) {
        focusRadii = radii
        focus = d.clone().normalize()
      }
    })
    moonFocus.dir = focus
  })
  return (
    <>
      {MOONS.map((m, i) => (
        <group key={m.name} ref={(g) => void (refs.current[i] = g)} visible={false}>
          <mesh>
            <sphereGeometry args={[1, 64, 48]} />
            <meshStandardMaterial color={m.color} roughness={m.plume ? 0.8 : 1} />
          </mesh>
          {m.haze && (
            <mesh scale={1.06}>
              <sphereGeometry args={[1, 48, 32]} />
              <meshBasicMaterial color={m.haze} transparent opacity={0.28} side={THREE.BackSide} depthWrite={false} />
            </mesh>
          )}
          {m.plume && (
            <points geometry={plume}>
              <pointsMaterial color="#cfe6ff" size={0.03} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
            </points>
          )}
        </group>
      ))}
    </>
  )
}
