import * as THREE from 'three'
import type { Age } from './figure'
import { bakeClips, type MobModel, type MotionData, type VrmModel } from './vrmPeople'
import { MOB_SET } from './trialSet'
import { lowMemory } from '../../state/quality'

// 公園の人の素材。ふだんは Rocketbox（junji さんが 3 つを見比べて、いちばん自然と選んだ。2026-11-18）。
// 見比べ用に ?mobset=makehuman（前の MakeHuman の人、vrmPeople.ts）・?mobset=quaternius も残している。
// スマホは phone の 8 人だけ（大人 4・子ども 2・年配 2。全部の人の 4 割ほどの重さ）。
//  - Rocketbox（Microsoft、MIT）：リアル寄り。肌に凹凸の画像（毛穴・しわ）があり、まばたきの形も入っている。
//    tools/mobs/rocketbox/ で FBX から glb 1 つにまとめたもの（まばたき以外の顔の形を捨て、テクスチャは 1024 px）
//  - Quaternius Universal Base Characters（CC0）：すっきりした作風。無料版は下着姿の男女 2 体と髪型だけなので、服は体の高さで塗り分ける
// どちらも元の形が T ポーズではないので、腕と脚を T ポーズに起こしたときの骨の向きで、今と同じ動き（Mixamo）を焼き直す。

/** tone：肌の色の掛け算（素材の肌は日焼けした色 1 つだけ）、hairColor：髪の色（素材の髪は灰色で、色を掛けて使う） */
type TrialModel = MobModel & { src: string; tone?: [number, number, number]; hair?: string[]; hairColor?: number; cloth?: [number, number] }

const RB = 'walk/mobs/rocketbox/'
const QT = 'walk/mobs/trial/quaternius/'

const LIST: Record<'rocketbox' | 'quaternius', TrialModel[]> = {
  rocketbox: [
    // 大人（先頭の人が自分の姿）
    { file: 'Male_Adult_01', src: RB, age: 'adult', height: 1.76, phone: true },
    { file: 'Female_Adult_01', src: RB, age: 'adult', height: 1.66, phone: true },
    { file: 'Male_Adult_12', src: RB, age: 'adult', height: 1.8, phone: true },
    { file: 'Female_Adult_03', src: RB, age: 'adult', height: 1.58, phone: true },
    { file: 'Male_Adult_09', src: RB, age: 'adult', height: 1.7 },
    { file: 'Female_Adult_05', src: RB, age: 'adult', height: 1.62 },
    { file: 'Male_Adult_04', src: RB, age: 'adult', height: 1.82 },
    { file: 'Female_Adult_09', src: RB, age: 'adult', height: 1.68 },
    { file: 'Male_Adult_17', src: RB, age: 'adult', height: 1.74 },
    { file: 'Female_Adult_14', src: RB, age: 'adult', height: 1.64 },
    // 子ども（素材はどの子も 1.43 m なので、縮めて年齢をばらす）
    { file: 'Female_Child_01', src: RB, age: 'child', height: 1.32, phone: true },
    { file: 'Male_Child_02', src: RB, age: 'child', height: 1.18, phone: true },
    { file: 'Male_Child_01', src: RB, age: 'child', height: 1.38 },
    { file: 'Female_Child_02', src: RB, age: 'child', height: 1.22 },
    // 年配の人（白髪・白いひげの人。年配の女性は素材に見当たらないので、落ち着いた見た目の人）
    { file: 'Male_Adult_05', src: RB, age: 'elder', height: 1.7, phone: true },
    { file: 'Male_Adult_03', src: RB, age: 'elder', height: 1.72 },
    { file: 'Male_Adult_14', src: RB, age: 'elder', height: 1.74 },
    { file: 'Female_Adult_02', src: RB, age: 'elder', height: 1.6, phone: true },
  ],
  quaternius: [
    { file: 'q_male_light', src: 'Superhero_Male', tone: [1.32, 1.3, 1.32], hair: ['Hair_SimpleParted'], hairColor: 0x7a5236, age: 'adult', height: 1.76, cloth: [0x3d6f8f, 0x2c2f38] },
    { file: 'q_female_dark', src: 'Superhero_Female', tone: [0.62, 0.56, 0.54], hair: ['Hair_Buns'], hairColor: 0x2a2220, age: 'adult', height: 1.64, cloth: [0xc4673f, 0x3a3f4f] },
    { file: 'q_male_dark', src: 'Superhero_Male', tone: [0.8, 0.74, 0.72], hair: ['Hair_Buzzed', 'Hair_Beard'], hairColor: 0x3a2a22, age: 'adult', height: 1.8, cloth: [0x6b8e4e, 0x34302c] },
    { file: 'q_female_light', src: 'Superhero_Female', tone: [1.36, 1.32, 1.3], hair: ['Hair_Long'], hairColor: 0xe0bd80, age: 'adult', height: 1.66, cloth: [0xe0d6c2, 0x47506b] },
  ],
}

/** VRM の骨の名前 → この素材の骨の名前 */
const BONES: Record<'rocketbox' | 'quaternius', Record<string, string>> = {
  rocketbox: {
    hips: 'Bip01_Pelvis',
    spine: 'Bip01_Spine',
    chest: 'Bip01_Spine1',
    upperChest: 'Bip01_Spine2',
    neck: 'Bip01_Neck',
    head: 'Bip01_Head',
    leftShoulder: 'Bip01_L_Clavicle',
    leftUpperArm: 'Bip01_L_UpperArm',
    leftLowerArm: 'Bip01_L_Forearm',
    leftHand: 'Bip01_L_Hand',
    rightShoulder: 'Bip01_R_Clavicle',
    rightUpperArm: 'Bip01_R_UpperArm',
    rightLowerArm: 'Bip01_R_Forearm',
    rightHand: 'Bip01_R_Hand',
    leftUpperLeg: 'Bip01_L_Thigh',
    leftLowerLeg: 'Bip01_L_Calf',
    leftFoot: 'Bip01_L_Foot',
    leftToes: 'Bip01_L_Toe0',
    rightUpperLeg: 'Bip01_R_Thigh',
    rightLowerLeg: 'Bip01_R_Calf',
    rightFoot: 'Bip01_R_Foot',
    rightToes: 'Bip01_R_Toe0',
  },
  quaternius: {
    hips: 'pelvis',
    spine: 'spine_01',
    chest: 'spine_02',
    upperChest: 'spine_03',
    neck: 'neck_01',
    head: 'Head',
    leftShoulder: 'clavicle_l',
    leftUpperArm: 'upperarm_l',
    leftLowerArm: 'lowerarm_l',
    leftHand: 'hand_l',
    rightShoulder: 'clavicle_r',
    rightUpperArm: 'upperarm_r',
    rightLowerArm: 'lowerarm_r',
    rightHand: 'hand_r',
    leftUpperLeg: 'thigh_l',
    leftLowerLeg: 'calf_l',
    leftFoot: 'foot_l',
    leftToes: 'ball_l',
    rightUpperLeg: 'thigh_r',
    rightLowerLeg: 'calf_r',
    rightFoot: 'foot_r',
    rightToes: 'ball_r',
  },
}

const v1 = new THREE.Vector3()
const v2 = new THREE.Vector3()
const qa = new THREE.Quaternion()
const qb = new THREE.Quaternion()

/** 骨を世界の中で回して、子へ向かう向きを to にする */
function aim(bone: THREE.Object3D, child: THREE.Object3D, to: THREE.Vector3) {
  bone.getWorldPosition(v1)
  child.getWorldPosition(v2)
  const from = v2.sub(v1).normalize()
  qa.setFromUnitVectors(from, to)
  bone.getWorldQuaternion(qb).premultiply(qa)
  bone.parent!.getWorldQuaternion(qa)
  bone.quaternion.copy(qa.invert().multiply(qb))
  bone.updateMatrixWorld(true)
}

/** 腕を横に、脚をまっすぐ下に起こした T ポーズのときの骨の向き（ローカル）。元の向きはもどしておく */
function tPose(root: THREE.Object3D, raw: (n: string) => THREE.Object3D | null) {
  const all = new Map<THREE.Object3D, THREE.Quaternion>()
  root.traverse((o) => all.set(o, o.quaternion.clone()))
  const X = new THREE.Vector3(1, 0, 0)
  const NX = new THREE.Vector3(-1, 0, 0)
  const DOWN = new THREE.Vector3(0, -1, 0)
  root.updateMatrixWorld(true)
  const chain: [string, string, THREE.Vector3][] = [
    ['leftUpperArm', 'leftLowerArm', X],
    ['leftLowerArm', 'leftHand', X],
    ['rightUpperArm', 'rightLowerArm', NX],
    ['rightLowerArm', 'rightHand', NX],
    ['leftUpperLeg', 'leftLowerLeg', DOWN],
    ['leftLowerLeg', 'leftFoot', DOWN],
    ['rightUpperLeg', 'rightLowerLeg', DOWN],
    ['rightLowerLeg', 'rightFoot', DOWN],
  ]
  for (const [a, b, to] of chain) {
    const A = raw(a)
    const B = raw(b)
    if (A && B) aim(A, B, to)
  }
  const out = new Map<THREE.Object3D, THREE.Quaternion>()
  for (const name of Object.keys(BONES.rocketbox)) {
    const b = raw(name)
    if (b) out.set(b, b.quaternion.clone())
  }
  for (const [o, q] of all) o.quaternion.copy(q)
  root.updateMatrixWorld(true)
  return out
}

/** 読み込んだ人を、足が地面・顔が +z・身長 height m に置く（外側の箱は動かさない：VrmPerson が回して大きさを変えるため） */
function stand(obj: THREE.Object3D, raw: (n: string) => THREE.Object3D | null, height: number) {
  const outer = new THREE.Group()
  const inner = new THREE.Group()
  inner.add(obj)
  outer.add(inner)
  outer.updateMatrixWorld(true)
  // 顔の向き：左の上腕から右の上腕へ向かう線と、上から求める
  const L = raw('leftUpperArm')!.getWorldPosition(new THREE.Vector3())
  const R = raw('rightUpperArm')!.getWorldPosition(new THREE.Vector3())
  const fwd = L.sub(R).cross(new THREE.Vector3(0, 1, 0))
  inner.rotation.y = Math.atan2(fwd.x, fwd.z) * -1
  outer.updateMatrixWorld(true)
  const head = raw('head')!.getWorldPosition(new THREE.Vector3())
  const box = new THREE.Box3().setFromObject(obj, true)
  // 頭のてっぺんは頭の骨より少し上（身長 = 頭の骨の高さ × 1.075 くらい）
  const top = Math.max(box.max.y, head.y)
  const s = height / (top - box.min.y)
  inner.scale.setScalar(s)
  inner.position.y = -box.min.y * s
  outer.updateMatrixWorld(true)
  return outer
}

function names(set: 'rocketbox' | 'quaternius', root: THREE.Object3D) {
  const map = BONES[set]
  const cache = new Map<string, THREE.Object3D | null>()
  return (n: string) => {
    if (!cache.has(n)) cache.set(n, map[n] ? (root.getObjectByName(map[n]) ?? null) : null)
    return cache.get(n)!
  }
}

let gltfLoader: Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTFLoader> | null = null
const loadGltf = async (url: string) => {
  gltfLoader ??= import('three/examples/jsm/loaders/GLTFLoader.js').then((m) => new m.GLTFLoader())
  return (await gltfLoader).loadAsync(url)
}

/** 服：体の高さ（元の形での位置）で、シャツ・ズボン・靴を塗り分ける */
function paintClothes(mesh: THREE.SkinnedMesh, mat: THREE.MeshStandardMaterial, raw: (n: string) => THREE.Object3D | null, cloth: [number, number]) {
  mesh.updateMatrixWorld(true)
  const inv = mesh.matrixWorld.clone().invert()
  const at = (n: string) => raw(n)!.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv)
  const hip = at('hips')
  const neck = at('neck')
  const ankle = at('leftFoot')
  const elbowL = at('leftLowerArm')
  const shoulderL = at('leftUpperArm')
  // 腕の向き（元の形で）：肩から肘へ。半袖は肩から肘までの 45 % まで
  const arm = elbowL.clone().sub(shoulderL)
  const uniforms = {
    uHip: { value: hip.y },
    uNeck: { value: neck.y },
    uAnkle: { value: ankle.y + (hip.y - ankle.y) * 0.04 },
    uShoulder: { value: shoulderL },
    uArm: { value: arm },
    uShirt: { value: new THREE.Color(cloth[0]) },
    uPants: { value: new THREE.Color(cloth[1]) },
  }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRest;
uniform float uHip; uniform float uNeck; uniform float uAnkle;
uniform vec3 uShoulder; uniform vec3 uArm; uniform vec3 uShirt; uniform vec3 uPants;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  {
    vec3 p = vRest;
    // 腕の上での位置（0 = 肩、1 = 肘）。左右は x の符号で見る
    vec3 sh = vec3( sign( p.x ) * abs( uShoulder.x ), uShoulder.y, uShoulder.z );
    vec3 ar = vec3( sign( p.x ) * abs( uArm.x ), uArm.y, uArm.z );
    float along = dot( p - sh, ar ) / dot( ar, ar );
    bool onArm = along > 0.0;
    float T = uNeck - uHip;
    // 首まわりは丸く開ける（首の付け根より上でも、首から離れた肩の上はシャツ）
    float collar = p.y < uNeck + 0.1 * T && length( p.xz - vec2( 0.0, uShoulder.z ) ) > 0.16 * T ? 1.0 : 0.0;
    float shirt = ( p.y > uHip - 0.02 * T && ( p.y < uNeck || collar > 0.5 ) && ( !onArm || along < 0.45 ) ) ? 1.0 : 0.0;
    float pants = ( p.y <= uHip - 0.02 * T && p.y > uAnkle ) ? 1.0 : 0.0;
    float shoes = p.y <= uAnkle ? 1.0 : 0.0;
    float grain = 0.94 + 0.06 * sin( p.y * 900.0 ) * sin( p.x * 700.0 );
    diffuseColor.rgb = mix( diffuseColor.rgb, uShirt * grain, shirt );
    diffuseColor.rgb = mix( diffuseColor.rgb, uPants * grain, pants );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.09, 0.08, 0.08 ), shoes );
  }`,
      )
  }
  mat.customProgramCacheKey = () => 'q-clothes-2'
}

async function loadRocketbox(base: string, info: TrialModel) {
  const gltf = await loadGltf(`${base}${info.src}${info.file}.glb`)
  const root = gltf.scene
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
  })
  const raw0 = names('rocketbox', root)
  return { scene: stand(root, raw0, info.height), raw: raw0 }
}

async function loadQuaternius(base: string, info: TrialModel) {
  const gltf = await loadGltf(`${base}${QT}${info.src}.gltf`)
  const root = gltf.scene
  const raw0 = names('quaternius', root)
  let body: THREE.SkinnedMesh | null = null
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh
    if (!m.isMesh) return
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    if (/^Super/i.test(m.name)) body = m
  })
  if (body) {
    const b = body as THREE.SkinnedMesh
    const mat = (b.material as THREE.MeshStandardMaterial).clone()
    if (info.tone) mat.color.setRGB(...info.tone)
    if (info.cloth) paintClothes(b, mat, raw0, info.cloth)
    b.material = mat
  }
  // 髪：同じ骨組みで作られているので、この人の骨につなぎ直す
  for (const h of info.hair ?? []) {
    const hg = await loadGltf(`${base}${QT}${h}.gltf`)
    const meshes: THREE.SkinnedMesh[] = []
    hg.scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh)
    })
    for (const m of meshes) {
      const bones = m.skeleton.bones.map((bn) => root.getObjectByName(bn.name) as THREE.Bone)
      if (bones.some((bn) => !bn)) continue
      m.removeFromParent()
      ;((body as THREE.SkinnedMesh | null)?.parent ?? root).add(m)
      m.bind(new THREE.Skeleton(bones, m.skeleton.boneInverses), m.bindMatrix)
      m.castShadow = true
      m.frustumCulled = false
      if (info.hairColor !== undefined) {
        const hm = (m.material as THREE.MeshStandardMaterial).clone()
        // 灰色の髪の画像（明るさ 0.55 ほど）に色を掛ける
        hm.color.set(info.hairColor).multiplyScalar(1.8)
        m.material = hm
      }
    }
  }
  // 眉も髪と同じ色に
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && /Eyebrow/i.test(m.name) && info.hairColor !== undefined) {
      const em = (m.material as THREE.MeshStandardMaterial).clone()
      em.color.set(info.hairColor).multiplyScalar(1.8)
      m.material = em
    }
  })
  const scene = stand(root, raw0, info.height)
  return { scene, raw: raw0 }
}

/** この素材の人を読み込む（スマホなどメモリの少ない端末は phone の人だけ）。自分の姿は最初の人 */
export async function loadTrialModels(base: string, motions: MotionData): Promise<VrmModel[]> {
  const set = MOB_SET === 'quaternius' ? 'quaternius' : 'rocketbox'
  const list = LIST[set].filter((m) => m.phone || set === 'quaternius' || !lowMemory())
  const loaded = await Promise.all(
    list.map(async (info) => {
      const { scene, raw } = set === 'rocketbox' ? await loadRocketbox(base, info) : await loadQuaternius(base, info)
      const tp = tPose(scene, raw)
      const { clips, hipsHeight } = bakeClips(scene, raw, motions, tp)
      const nm = (n: string) => raw(n)?.name ?? ''
      const model: VrmModel = {
        info,
        scene,
        clips,
        hipsHeight,
        headName: nm('head'),
        neckName: nm('neck'),
        arms: (['left', 'right'] as const).map((sd) => [nm(`${sd}UpperArm`), nm(`${sd}LowerArm`), nm(`${sd}Hand`)] as [string, string, string]),
        legs: (['left', 'right'] as const).map((sd) => [nm(`${sd}UpperLeg`), nm(`${sd}LowerLeg`), nm(`${sd}Foot`), nm(`${sd}Toes`)] as [string, string, string, string]),
        hipsName: nm('hips'),
      }
      return model
    }),
  )
  // 公園の人は年齢で配る。この素材にない年齢は、大人で埋める
  const out = [...loaded]
  for (const age of ['child', 'elder'] as Age[]) {
    if (out.some((m) => m.info.age === age)) continue
    for (const m of loaded.filter((x) => x.info.age === 'adult')) out.push({ ...m, info: { ...m.info, age } })
  }
  return out
}
