import * as THREE from 'three'
import type { Rig } from './astronaut'

// 重力ジャンプの宇宙飛行士を、作り込んだモデル（public/models/astronaut.glb、骨の入った 1 体）で描く。
// GravityJump の動き（pose）は、手作りの宇宙飛行士と同じ「関節の箱」（Rig の Group）に角度を書く。
// ここでは毎フレーム、その角度をモデルの骨へ写す（体の左右の軸＝モデルの X 軸のまわりに回す）。
// 読み込みが終わるまで・失敗したときは、手作りの宇宙飛行士のまま

/** 宇宙飛行士の背の高さ（m、ヘルメットの上まで） */
const HEIGHT = 1.85

type Src = { scene: THREE.Group }
let loading: Promise<Src | null> | null = null

/** モデルを一度だけ読む（失敗したら null） */
export function loadSuit(): Promise<Src | null> {
  if (loading) return loading
  loading = Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')])
    .then(async ([{ GLTFLoader }, { MeshoptDecoder }]) => {
      const loader = new GLTFLoader()
      loader.setMeshoptDecoder(MeshoptDecoder)
      const g = await loader.loadAsync(`${import.meta.env.BASE_URL}models/astronaut.glb`)
      return { scene: g.scene }
    })
    .catch(() => null)
  return loading
}

type Link = { group: THREE.Group; bone: THREE.Bone; rest: THREE.Quaternion; toLocal: THREE.Quaternion }

const qa = new THREE.Quaternion()
const qb = new THREE.Quaternion()
const X = new THREE.Vector3(1, 0, 0)
const Z = new THREE.Vector3(0, 0, 1)
const ax = new THREE.Vector3()
const az = new THREE.Vector3()

/** 読み込んだモデルから、宇宙飛行士ひとり（ghost は地球の人：うすい青で透ける） */
export async function makeSuitRig(src: Src, ghost: boolean): Promise<Rig | null> {
  const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js')
  const model = clone(src.scene) as THREE.Group
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const k = HEIGHT / Math.max(1e-6, box.max.y - box.min.y)
  model.scale.setScalar(k)
  model.position.y = -box.min.y * k

  const bones = new Map<string, THREE.Bone>()
  const materials: THREE.MeshStandardMaterial[] = []
  const swapped = new Map<THREE.Material, THREE.MeshStandardMaterial>()
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone)
    const m = o as THREE.SkinnedMesh
    if (!m.isMesh) return
    m.frustumCulled = false
    m.castShadow = true
    const list = (Array.isArray(m.material) ? m.material : [m.material]).map((orig) => {
      let mat = swapped.get(orig)
      if (!mat) {
        mat = (orig as THREE.MeshStandardMaterial).clone()
        if (ghost) {
          mat.map = null
          mat.metalnessMap = null
          mat.metalness = 0
          mat.color.set('#86b9ff')
          mat.transparent = true
          mat.opacity = 0.5
          mat.depthWrite = false
          mat.emissive = new THREE.Color('#2a5aa8')
          mat.emissiveIntensity = 0.35
        }
        mat.envMapIntensity = 0.8
        swapped.set(orig, mat)
        materials.push(mat)
      }
      return mat
    })
    m.material = list.length === 1 ? list[0] : list
  })

  const need = ['hip_joint', 'spine1', 'leg_1L', 'leg_1R', 'leg_2L', 'leg_2R', 'footL', 'footR', 'arm_1L', 'arm_1R', 'arm_2L', 'arm_2R']
  if (need.some((n) => !bones.has(n))) return null

  const root = new THREE.Group()
  const holder = new THREE.Group()
  holder.add(model)
  root.add(holder)
  root.updateMatrixWorld(true)

  // 立ったときの腰・ひざ・足首の高さから、もも・すねの長さ（m）
  const y = (n: string) => bones.get(n)!.getWorldPosition(ax).y
  const hipY = y('leg_1L')
  const kneeY = y('leg_2L')
  const thigh = hipY - kneeY
  const shin = kneeY

  const body = new THREE.Group()
  body.position.y = hipY
  const torso = new THREE.Group()
  const g2 = (): [THREE.Group, THREE.Group] => [new THREE.Group(), new THREE.Group()]
  const shoulders = g2()
  const elbows = g2()
  const hips = g2()
  const knees = g2()

  const links: Link[] = []
  const modelQ = new THREE.Quaternion()
  model.getWorldQuaternion(modelQ)
  const link = (group: THREE.Group, name: string) => {
    const bone = bones.get(name)!
    // 骨の向き（モデルの中で）。モデルの軸のまわりの回転を、骨の手もとの回転に直すのに使う
    const w = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(modelQ.clone().invert())
    links.push({ group, bone, rest: bone.quaternion.clone(), toLocal: w.invert() })
  }
  link(torso, 'spine1')
  // 0 が左（+X）、1 が右
  link(shoulders[0], 'arm_1L')
  link(shoulders[1], 'arm_1R')
  link(elbows[0], 'arm_2L')
  link(elbows[1], 'arm_2R')
  link(hips[0], 'leg_1L')
  link(hips[1], 'leg_1R')
  link(knees[0], 'leg_2L')
  link(knees[1], 'leg_2R')
  // 足首：ふだんは靴の裏を地面と平らに保つ（もも・すねの角度を打ち消す）。rig.feet で、かかと・つま先を上げる
  const feet = g2()
  link(feet[0], 'footL')
  link(feet[1], 'footR')

  const update = () => {
    holder.position.set(0, body.position.y - hipY, body.position.z)
    for (let i = 0; i < 2; i++) feet[i].rotation.x = -(hips[i].rotation.x + knees[i].rotation.x) - (rig.feet?.[i] ?? 0)
    for (const l of links) {
      // モデルの X 軸・Z 軸を、この骨の向きで見た軸に
      ax.copy(X).applyQuaternion(l.toLocal)
      az.copy(Z).applyQuaternion(l.toLocal)
      qa.setFromAxisAngle(ax, l.group.rotation.x)
      qb.setFromAxisAngle(az, l.group.rotation.z)
      l.bone.quaternion.copy(l.rest).multiply(qa).multiply(qb)
    }
  }

  // 靴：足首の高さ（骨の位置）と、かかと・つま先までの長さ（だいたい）
  const sole = Math.max(0.06, Math.min(0.16, y('footL')))
  const rig: Rig = { root, body, torso, shoulders, elbows, hips, knees, materials, legs: { hipY, thigh, shin }, update, feet: [0, 0], boot: { sole, heel: 0.07, toe: 0.2 } }
  return rig
}
