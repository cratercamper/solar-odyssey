import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { skinCraftMaterial } from './craftSkin'

// アポロの宇宙船（apollo.glb）：司令船・機械船（csm）と着陸船（lm、脚つき）。月のまわりの場面とドッキングの場面で使う。
// glTF の向き：+Y 上、-Z 前。司令船は先端（ドッキングの探り棒の付け根）が原点で、機首が +Y。着陸船は足の裏が原点

export const APOLLO_URL = `${import.meta.env.BASE_URL}models/apollo.glb`
/** ドッキングの口（LM のてっぺん） */
export const DROGUE = new THREE.Vector3(0, 6.16, 0.2)

/** 脚をたたむ（0）・のばす（1） */
export function setLegs(craft: Craft, k: number, q = new THREE.Quaternion()) {
  for (const L of craft.legs) L.obj.quaternion.copy(L.base).premultiply(q.setFromAxisAngle(L.axis, (1 - k) * -2.05))
}

export type Craft = {
  lm: THREE.Group
  csm: THREE.Group
  legs: { obj: THREE.Object3D; base: THREE.Quaternion; axis: THREE.Vector3 }[]
}

export function useCraft(): Craft {
  const { scene } = useGLTF(APOLLO_URL)
  return useMemo(() => {
    const src = scene.clone(true)
    src.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      // しわや継ぎ目は glb に焼き込み済み（tools/blender/bake_mission.py）
      mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone()
      // 近くで見たときの細かさ（テープ・継ぎ目・しわ）をシェーダーで足す
      skinCraftMaterial(mesh.material)
    })
    const lm = new THREE.Group()
    lm.name = 'lm'
    const csm = new THREE.Group()
    csm.name = 'csm'
    const legs: Craft['legs'] = []
    const get = (n: string) => src.getObjectByName(n)
    for (const n of ['LMDescent', 'LMAscent']) {
      const o = get(n)
      if (o) lm.add(o)
    }
    for (let j = 0; j < 4; j++) {
      const o = get(`Leg${j}`)
      if (!o) continue
      lm.add(o)
      // 脚をたたむ：付け根の、まわりの向き（脚の外向きと直交する水平の向き）のまわりに回す
      const out = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion)
      const axis = new THREE.Vector3(0, 1, 0).cross(out).normalize()
      legs.push({ obj: o, base: o.quaternion.clone(), axis })
    }
    for (const n of ['CM', 'SM']) {
      const o = get(n)
      if (o) csm.add(o)
    }
    return { lm, csm, legs }
  }, [scene])
}

