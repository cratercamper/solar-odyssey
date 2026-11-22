import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useSite } from './useSite'
import { bodies } from '../../state/registry'
import { ship } from '../../state/flight'
import { useStore } from '../../state/store'
import { SF_SPACE_TEXT, SWARM_ID, sfEntry } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { roomEnvironment } from '../telescope/parts'

// 銀色の群れ（オリジナルの架空の生命体）。何百もの小さな銀のかけらが、ムクドリの大群のように
// 流れながら、球・輪・波・らせんへと形を変えていく。自機が近づくと、自機の形をまねてみせる。
// 何もしてこない。木星と同じ軌道の上、木星より60度前（トロヤ群のあたり）を漂う。

const COUNT = 700
/** 群れの大きさ（表示単位。自機の長さは約0.3） */
const SIZE = 1.5
/** ひとつの形でいる時間と、形を変えるのにかかる時間（秒） */
const HOLD = 9
const BLEND = 4
/** これより近いと、自機の形をまねる */
const MIMIC = 14

type Shape = (i: number, u: number, v: number, t: number, out: THREE.Vector3) => THREE.Vector3

const TAU = Math.PI * 2
const golden = Math.PI * (3 - Math.sqrt(5))

const sphere: Shape = (i, _u, _v, t, out) => {
  const y = 1 - (2 * (i + 0.5)) / COUNT
  const r = Math.sqrt(1 - y * y)
  const a = i * golden + t * 0.15
  return out.set(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(SIZE * 0.85)
}
const ring: Shape = (_i, u, v, t, out) => {
  const a = u * TAU + t * 0.2
  const b = v * TAU
  const R = SIZE
  const r = SIZE * 0.28
  return out.set((R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a))
}
const wave: Shape = (_i, u, v, t, out) => {
  const x = (u - 0.5) * SIZE * 2.8
  const z = (v - 0.5) * SIZE * 1.6
  return out.set(x, 0.35 * SIZE * Math.sin(x * 1.6 + t * 0.9) * Math.cos(z * 1.4 + t * 0.6), z)
}
const helix: Shape = (i, u, _v, t, out) => {
  const a = u * TAU * 2 + t * 0.4 + (i % 2) * Math.PI
  return out.set((u - 0.5) * SIZE * 3, Math.cos(a) * SIZE * 0.4, Math.sin(a) * SIZE * 0.4)
}
/** 自機をまねた形（円盤・首・副船体・2本のナセル）。前は -Z */
const echo: Shape = (i, u, v, _t, out) => {
  const k = i % 10
  if (k < 5) {
    const a = u * TAU
    const r = Math.sqrt(v) * 0.32
    return out.set(Math.cos(a) * r, 0.07 + (k - 2) * 0.004, -0.17 + Math.sin(a) * r).multiplyScalar(SIZE * 3)
  }
  if (k < 7) return out.set((v - 0.5) * 0.08, -0.06 + (u - 0.5) * 0.06, 0.05 + u * 0.22).multiplyScalar(SIZE * 3)
  const side = k < 9 ? 1 : -1
  const a = v * TAU
  return out.set(side * 0.2 + Math.cos(a) * 0.025, 0.068 + Math.sin(a) * 0.025, 0.02 + u * 0.32).multiplyScalar(SIZE * 3)
}
const SHAPES = [sphere, ring, wave, helix]

export function Swarm() {
  useLang()
  const { gl } = useThree()
  const group = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const moved = useSite(group, { id: SWARM_ID, radius: SIZE * 1.6, notice: { distance: MIMIC, text: SF_SPACE_TEXT.swarmFound } })

  const mesh = useMemo(() => {
    const env = roomEnvironment(gl)
    const geometry = new THREE.OctahedronGeometry(1, 0)
    geometry.scale(0.022, 0.022, 0.06)
    const material = new THREE.MeshStandardMaterial({ color: '#dfe6ef', metalness: 1, roughness: 0.14, envMap: env, envMapIntensity: 1.3 })
    const m = new THREE.InstancedMesh(geometry, material, COUNT)
    m.frustumCulled = false
    for (let i = 0; i < COUNT; i++) m.setColorAt(i, new THREE.Color(1, 1, 1))
    return m
  }, [gl])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    },
    [mesh],
  )

  const sim = useMemo(() => {
    let s = 3
    const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    return {
      u: Float32Array.from({ length: COUNT }, rand),
      v: Float32Array.from({ length: COUNT }, rand),
      phase: Float32Array.from({ length: COUNT }, rand),
      pos: Array.from({ length: COUNT }, () => new THREE.Vector3()),
      ready: false,
    }
  }, [])

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const target = new THREE.Vector3()
  const vel = new THREE.Vector3()
  const jupiter = new THREE.Vector3()
  const matrix = new THREE.Matrix4()
  const quat = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const Z = new THREE.Vector3(0, 0, 1)
  const color = new THREE.Color()
  const mimic = useRef(0)

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime()
    const dt = Math.min(delta, 0.05)
    const g = group.current
    // 木星と同じ軌道の上で、木星より60度前
    const j = bodies.get('jupiter')
    if (j) {
      j.object.getWorldPosition(jupiter)
      g.position.copy(jupiter).applyAxisAngle(Z.set(0, 1, 0), Math.PI / 3)
      g.position.y += 3 + Math.sin(t * 0.2) * 0.4
      Z.set(0, 0, 1)
    }
    moved()

    // 自機が近いと、自機の形をまねる（自機の向きにそろえる）
    const d = ship.position.distanceTo(g.position)
    const st = useStore.getState()
    const want = d < MIMIC && st.mode !== 'map' ? 1 : 0
    mimic.current += (want - mimic.current) * (1 - Math.exp(-0.6 * dt))
    if (mimic.current > 0.01) {
      quat.copy(ship.quaternion)
      g.quaternion.slerp(quat, 1 - Math.exp(-0.8 * dt))
    } else g.rotation.y += dt * 0.03

    // 今の形と次の形。かけらごとに少しずつずらして変わる（群れの中を変化の波が伝わる）
    const cycle = HOLD + BLEND
    const n = Math.floor(t / cycle)
    const from = SHAPES[n % SHAPES.length]
    const to = SHAPES[(n + 1) % SHAPES.length]
    const local = t - n * cycle
    for (let i = 0; i < COUNT; i++) {
      const u = sim.u[i]
      const v = sim.v[i]
      const k = THREE.MathUtils.smoothstep(local - HOLD - sim.phase[i] * 1.5 + 0.75, 0, BLEND - 1.5)
      from(i, u, v, t, a)
      to(i, u, v, t, b)
      target.lerpVectors(a, b, k)
      if (mimic.current > 0.01) target.lerp(echo(i, u, v, t, a), mimic.current)
      // 群れらしい、ゆらぎ
      const w = sim.phase[i] * TAU
      target.x += Math.sin(t * 0.7 + w) * 0.06
      target.y += Math.sin(t * 0.9 + w * 1.3) * 0.06
      target.z += Math.cos(t * 0.6 + w * 0.7) * 0.06
      const p = sim.pos[i]
      if (!sim.ready) p.copy(target)
      vel.copy(target).sub(p)
      p.addScaledVector(vel, 1 - Math.exp(-(1.6 + sim.phase[i]) * dt))
      // 進む向きにかけらを向ける（止まっているときは、群れの回る向き）
      if (vel.lengthSq() < 1e-6) vel.set(-p.z, 0, p.x)
      quat.setFromUnitVectors(Z, vel.normalize())
      matrix.compose(p, quat, scale)
      mesh.setMatrixAt(i, matrix)
      // 光の当たり方で、きらきらと明るさが揺れる
      const shimmer = 0.75 + 0.35 * Math.sin(t * 2.3 + w * 3 + p.x * 2)
      mesh.setColorAt(i, color.setScalar(shimmer))
    }
    sim.ready = true
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <group ref={group}>
      <primitive object={mesh} />
      <Html position={[0, SIZE * 1.8, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(SWARM_ID)}>
          {sfEntry(SWARM_ID)?.name()}
        </span>
      </Html>
    </group>
  )
}
