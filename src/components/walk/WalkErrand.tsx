import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDelivery, handoffDone, nextStop } from '../../state/delivery'
import { useWalk } from '../../state/walk'
import { COLONY_ID } from '../../data/sf'
import { LAB_STOP } from '../../data/delivery'
import { EW_Y, GROUND_LIFT, NS_S, frameAt, landPoint, parkLayout, type Obstacle } from './park'
import { walker } from './WalkActors'

// 配達の仕事の最後：コロニーの公園の研究温室へ、歩いて荷物を届ける（state/delivery.ts の LAB_STOP）。
// 仕事で研究温室へ向かうときだけ、広場の南の道ばたに、ガラスの温室・目じるしの光の柱・入口の光る輪を出す。
// 入口の輪に入ると手渡し（完了のカードは開拓の画面が出す）。温室には入れない（公園のぶつかる物に足す）

/** 温室の大きさ（m）と、入口の輪の半径 */
const LAB_R = 4.2
const DOOR_R = 1.6
const BEAM_H = 90

/** 温室を置く所：広場の南、南北の道の東の芝生。木やベンチと重なるなら、少しずつ南へずらす */
function labSpot(obstacles: readonly Obstacle[]) {
  for (let i = 0; i < 12; i++) {
    const s = NS_S + 11
    const y = EW_Y - 42 - i * 9
    if (obstacles.every((o) => Math.hypot(o.s - s, o.y - y) > o.r + LAB_R + 1.2)) return { s, y }
  }
  return { s: NS_S + 11, y: EW_Y - 42 }
}

/** 温室と入口の位置（どの画面からも同じ所。歩く場面の案内も使う） */
let spot: { s: number; y: number } | null = null
export function labPlace() {
  if (!spot) spot = labSpot(parkLayout().obstacles)
  // 入口は道の側（西）
  return { ...spot, doorS: spot.s - LAB_R - DOOR_R - 0.8, doorY: spot.y }
}

/** 研究温室へ向かっているところか（仕事の次の行き先が研究温室で、研究温室のあるコロニー（1 号基）を歩いている） */
export function useLabErrand() {
  const job = useDelivery((d) => d.active)
  const colony = useWalk((w) => w.colonyId)
  return !!job && nextStop(job) === LAB_STOP && colony === COLONY_ID
}

/** 研究温室までの距離（m） */
export function labDistance() {
  const p = labPlace()
  return Math.hypot(walker.s - p.doorS, walker.y - p.doorY)
}

function Greenhouse() {
  const parts = useMemo(() => {
    // 透過（transmission）は公園をもう一度描くので重い。ふつうの半透明にする
    const glass = new THREE.MeshStandardMaterial({ color: '#cfe9ff', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    const frame = new THREE.MeshStandardMaterial({ color: '#e9edf2', roughness: 0.45, metalness: 0.3 })
    const base = new THREE.MeshStandardMaterial({ color: '#8b939e', roughness: 0.85 })
    const leaf = new THREE.MeshStandardMaterial({ color: '#4f9a52', roughness: 0.8 })
    const glow = new THREE.MeshBasicMaterial({ color: '#ffd27a', toneMapped: false })
    return { glass, frame, base, leaf, glow }
  }, [])
  useEffect(() => () => Object.values(parts).forEach((m) => m.dispose()), [parts])
  const ribs = 8
  return (
    <group>
      {/* 土台 */}
      <mesh material={parts.base} position={[0, 0.15, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[LAB_R + 0.4, LAB_R + 0.6, 0.3, 40]} />
      </mesh>
      {/* 低い壁と、ガラスのドーム */}
      <mesh material={parts.glass} position={[0, 1.3, 0]}>
        <cylinderGeometry args={[LAB_R, LAB_R, 2, 40, 1, true]} />
      </mesh>
      <mesh material={parts.glass} position={[0, 2.3, 0]}>
        <sphereGeometry args={[LAB_R, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* 白い骨組み（ドームの肋骨と、壁の上の輪） */}
      {Array.from({ length: ribs }, (_, i) => (
        <mesh key={i} material={parts.frame} position={[0, 2.3, 0]} rotation={[0, (i / ribs) * Math.PI * 2, 0]}>
          <torusGeometry args={[LAB_R, 0.07, 6, 32, Math.PI]} />
        </mesh>
      ))}
      {[0.32, 2.3].map((y) => (
        <mesh key={y} material={parts.frame} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[LAB_R, 0.09, 6, 48]} />
        </mesh>
      ))}
      {/* 壁の柱（ガラスの壁が見えにくくても、ドームが浮いて見えないように） */}
      {Array.from({ length: ribs * 2 }, (_, i) => {
        const a = (i / (ribs * 2)) * Math.PI * 2
        return (
          <mesh key={`p${i}`} material={parts.frame} position={[Math.cos(a) * LAB_R, 1.3, Math.sin(a) * LAB_R]} castShadow>
            <boxGeometry args={[0.12, 2, 0.12]} />
          </mesh>
        )
      })}
      {/* 中の苗床（緑の小山） */}
      {[-1.6, 0, 1.6].map((x) => (
        <mesh key={x} material={parts.leaf} position={[x, 0.6, 0.6 * Math.sign(x)]} castShadow>
          <sphereGeometry args={[0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      ))}
      {/* 入口（西）の明かり */}
      <mesh material={parts.glow} position={[-LAB_R - 0.05, 2.1, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[1.4, 0.18]} />
      </mesh>
    </group>
  )
}

export function WalkErrand() {
  const on = useLabErrand()
  if (!on) return null
  return <Errand />
}

function Errand() {
  const lab = useRef<THREE.Group>(null)
  const door = useRef<THREE.Group>(null)
  const beam = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const done = useRef(false)
  const place = labPlace()
  const mats = useMemo(
    () => ({
      beam: new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      ring: new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    }),
    [],
  )
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])

  // 温室には入れない：公園のぶつかる物に足す（終わったら外す）
  useEffect(() => {
    const obstacles = parkLayout().obstacles
    const o: Obstacle = { s: place.s, y: place.y, r: LAB_R + 0.7 }
    obstacles.push(o)
    return () => {
      const i = obstacles.indexOf(o)
      if (i >= 0) obstacles.splice(i, 1)
    }
  }, [place.s, place.y])

  useEffect(() => {
    if (lab.current) {
      landPoint(place.s, place.y, GROUND_LIFT, lab.current.position)
      frameAt(place.s, lab.current.quaternion)
    }
    if (door.current) {
      // 地面の板（GROUND_LIFT だけ持ち上げてある）より少し上に
      landPoint(place.doorS, place.doorY, GROUND_LIFT + 0.03, door.current.position)
      frameAt(place.doorS, door.current.quaternion)
    }
  }, [place.s, place.y, place.doorS, place.doorY])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const d = labDistance()
    if (beam.current) mats.beam.opacity = 0.18 + 0.08 * Math.sin(t * 2)
    if (ring.current) {
      const k = 1 + 0.08 * Math.sin(t * 4)
      ring.current.scale.set(k, k, 1)
      mats.ring.opacity = d < DOOR_R * 4 ? 0.95 : 0.6
    }
    // 入口の輪に入ったら手渡し（1 回だけ）
    if (!done.current && d < DOOR_R && walker.h < 1.5) {
      done.current = true
      handoffDone()
    }
  })

  return (
    <>
      <group ref={lab}>
        <Greenhouse />
        {/* 目じるしの光の柱（遠くから見える） */}
        <mesh ref={beam} material={mats.beam} position={[0, BEAM_H / 2, 0]}>
          <cylinderGeometry args={[0.6, 1.4, BEAM_H, 16, 1, true]} />
        </mesh>
      </group>
      <group ref={door}>
        <mesh ref={ring} material={mats.ring} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[DOOR_R - 0.18, DOOR_R, 48]} />
        </mesh>
      </group>
    </>
  )
}
