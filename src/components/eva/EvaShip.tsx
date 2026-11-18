import { useEffect, useLayoutEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { ShipSpec } from '../../data/ships'
import { OwnShipModel } from '../ship/VariantModel'
import { lowMemory } from '../../state/quality'
import { isTouchDevice } from '../../state/input'
import { MAP_KEYS, shrinkTexture } from '../surface/shrinkTexture'
import { MODULE_H, MODULE_W, buildShipCollider, clearShipSite, setupShipSite } from './shipCollider'

// 母船のまわりを自由に飛ぶときの母船：乗っている船の模型を実寸（m）で置く。
// エアロックは船の背中の平らな所に立てた小屋の上（場面の原点）。当たり判定は本物の形（shipCollider.ts）。

const MODEL = (file: string) => `${import.meta.env.BASE_URL}models/${file}`

export function EvaShip({ spec }: { spec: ShipSpec }) {
  // 模型の読みこみを、ここで待つ（SV-01 の船体は ShipModel の中の Suspense で読むので、先に読んでおく）
  useGLTF(MODEL(spec.model ?? 'ship-hull.glb'))
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)

  // 置いたらすぐ（最初のフレームより前に）、形を調べてエアロックの場所を決める
  useLayoutEffect(() => {
    const o = outer.current
    const g = inner.current
    if (!o || !g) return
    o.position.set(0, 0, 0)
    const bvh = buildShipCollider(o)
    if (!bvh) return
    const at = setupShipSite(bvh, spec.lengthM)
    o.position.copy(at)
    o.updateMatrixWorld(true)
    if (location.hash.includes('debug')) console.log(`[eva-ship] ${spec.id} tris ${(bvh.geometry.index?.count ?? 0) / 3} at`, at.toArray())
    return () => clearShipSite()
  }, [spec])

  // スマホではテクスチャを縮める（宇宙の場面の分と二重に載るので）。材質は船ごとに複製してあるので、差し替えてよい。
  // 船の影も落とさない（影の地図に船全体を描くぶんを省く）
  useEffect(() => {
    const g = inner.current
    if (!g || !(lowMemory() || isTouchDevice())) return
    g.traverse((x) => (x.castShadow = false))
    if (!lowMemory()) return
    const owned: THREE.Texture[] = []
    const done = new Map<THREE.Texture, THREE.Texture>()
    g.traverse((x) => {
      const mesh = x as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats as THREE.MeshStandardMaterial[]) {
        for (const key of MAP_KEYS) {
          const t = m[key]
          if (!t) continue
          let small = done.get(t)
          if (small === undefined) {
            small = shrinkTexture(t, 1024) ?? t
            done.set(t, small)
            if (small !== t) owned.push(small)
          }
          if (small !== t) {
            m[key] = small
            m.needsUpdate = true
          }
        }
      }
    })
    return () => owned.forEach((t) => t.dispose())
  }, [spec])

  return (
    <group ref={outer}>
      <group ref={inner} scale={spec.metersPerUnit}>
        <OwnShipModel spec={spec} unitScale={spec.metersPerUnit} env={false} />
      </group>
    </group>
  )
}

/** エアロックの小屋：船の背中に立てた箱。上面の穴が、ハッチ（EvaWorld の Airlock）の枠にちょうど合う */
export function AirlockModule({ color }: { color: string }) {
  const h = MODULE_W / 2
  const hole = 0.75
  const wall = h - hole
  const y = -MODULE_H / 2
  return (
    <group>
      {/* まわりの壁（外側）：上面の穴を残して、4 枚の板で囲む */}
      {[
        [0, -(hole + wall / 2), MODULE_W, wall],
        [0, hole + wall / 2, MODULE_W, wall],
        [-(hole + wall / 2), 0, wall, hole * 2],
        [hole + wall / 2, 0, wall, hole * 2],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, y, z]} castShadow receiveShadow>
          <boxGeometry args={[w, MODULE_H, d]} />
          <meshStandardMaterial color="#c4c8ce" roughness={0.55} metalness={0.35} />
        </mesh>
      ))}
      {/* 色の帯と、足もとの台 */}
      <mesh position={[0, -0.32, 0]}>
        <boxGeometry args={[MODULE_W + 0.02, 0.14, MODULE_W + 0.02]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0, -MODULE_H - 0.15, 0]} receiveShadow>
        <boxGeometry args={[MODULE_W + 0.8, 0.5, MODULE_W + 0.8]} />
        <meshStandardMaterial color="#7d848e" roughness={0.6} metalness={0.4} />
      </mesh>
    </group>
  )
}
