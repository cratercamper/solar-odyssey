import * as THREE from 'three'
import type { Age, Motion, Person } from './figure'
import { lowMemory } from '../../state/quality'
import { MOB_STYLE, addOutlines, applyPaintTextures, semiMaterial } from './semiReal'
import { richMaterial } from './richSkin'
import { MOB_SET } from './trialSet'

// 公園の人。MakeHuman（Blender の MPFB 2、素材は CC0）で作ったリアル寄りの 12 人（子ども 4・大人 5・シニア 3）。
// tools/mobs/mpfb_style.json（年齢ごとの幅、服・髪・肌、顔のパーツの揺れ幅）から mpfb_gen.py で決まった種で作り、
// finish_mpfb.py で髪の色・肌の色味をそろえ、テクスチャを縮めている（1 人 1.4〜1.9 MB）。
// 動きは Mixamo（public/walk/motions.json に、VRM 1.0 の正規化ボーン向けに変換したもの）。
// 同じ人を何人も出すので、VRM は 1 回だけ読み込み、形と材質を共有したまま骨だけを複製する（SkeletonUtils.clone）。
// そのため正規化ボーンを使わず、動きを人ごとの元の骨（raw bone）の回転に直してから再生する。

/** headScale：頭（髪ごと）の大きさ。phone：スマホ（メモリの少ない端末）でも読む人（半分にして軽くする） */
export type MobModel = { file: string; age: Age; height: number; headScale?: number; phone?: boolean }

export const MOB_MODELS: MobModel[] = [
  { file: 'mpfb_child_1', age: 'child', height: 1.278, phone: true },
  { file: 'mpfb_child_2', age: 'child', height: 1.349, phone: true },
  { file: 'mpfb_child_3', age: 'child', height: 1.175 },
  { file: 'mpfb_child_4', age: 'child', height: 1.295 },
  { file: 'mpfb_adult_1', age: 'adult', height: 1.619, phone: true },
  { file: 'mpfb_adult_2', age: 'adult', height: 1.897 },
  { file: 'mpfb_adult_3', age: 'adult', height: 1.494, phone: true },
  { file: 'mpfb_adult_4', age: 'adult', height: 1.491, phone: true },
  { file: 'mpfb_adult_5', age: 'adult', height: 1.683 },
  { file: 'mpfb_elder_1', age: 'elder', height: 1.508, phone: true },
  { file: 'mpfb_elder_2', age: 'elder', height: 1.537 },
  { file: 'mpfb_elder_3', age: 'elder', height: 1.446 },
]

/** 自分（歩く人）の姿。この人は 1.50 m と小柄なので、自分のときは 1.65 m ほどにする */
export const PLAYER_MODEL = 'mpfb_adult_4'
export const PLAYER_SCALE = 1.1

type ClipData = { fps: number; frames: number; loop: boolean; rot: string; pos: string }
export type MotionData = { bones: string[]; clips: Record<string, ClipData> }

/** 1 人ぶんの型（共有する形と、その人の骨に合わせた動き） */
export type VrmModel = {
  info: MobModel
  scene: THREE.Object3D
  clips: Map<string, THREE.AnimationClip>
  /** 立ったときの腰の高さ m */
  hipsHeight: number
  /** 頭の骨の名前 */
  headName: string
  /** 首の骨の名前 */
  neckName: string
  /** 左右の腕の骨の名前（上腕・前腕・手）。ホバースクーターのハンドルを握るのに使う */
  arms: [string, string, string][]
  /** 左右の脚の骨の名前（太もも・すね・足・つま先）と腰の骨。ホバースクーターの板に足をつけるのに使う */
  legs?: [string, string, string, string][]
  hipsName?: string
}

const int16 = (b64: string) => {
  const bin = atob(b64)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return new Int16Array(u8.buffer)
}

/** VRM の材質（MToon）を、場面の光（昼夜・街灯）に合う軽い Lambert に置き換える。輪郭線は描かない */
function toLambert(root: THREE.Object3D) {
  const hidden = new THREE.MeshBasicMaterial({ visible: false })
  const conv = new Map<THREE.Material, THREE.Material>()
  const swap = (m: THREE.Material) => {
    let r = conv.get(m)
    if (r) return r
    const src = m as THREE.Material & { map?: THREE.Texture | null; color?: THREE.Color; isOutline?: boolean }
    if (src.isOutline) r = hidden
    else if (m.name.endsWith('.eyes'))
      // 目はツヤを出す（光が映り込まないと「死んだ目」に見える）
      r = new THREE.MeshPhongMaterial({
        map: src.map ?? null,
        shininess: 140,
        specular: 0x8a8a8a,
        // セミリアルでは白目が影で灰色に沈まないよう、少しだけ自分で光らせる
        ...(MOB_STYLE !== 'real' ? { emissiveMap: src.map ?? null, emissive: MOB_STYLE === 'rich' ? 0x303030 : 0x5a5a5a } : {}),
      })
    else if (MOB_STYLE === 'semi' || MOB_STYLE === 'paint') r = semiMaterial(src)
    else
      // ?mobstyle=rich では肌・髪・服を質感つきに（それ以外は Lambert）
      r =
        (MOB_STYLE === 'rich' ? richMaterial(src) : null) ??
        new THREE.MeshLambertMaterial({
          map: src.map ?? null,
          color: src.color ? src.color.clone() : 0xffffff,
          transparent: m.transparent,
          alphaTest: m.alphaTest,
          side: m.side,
          depthWrite: m.depthWrite,
        })
    conv.set(m, r)
    return r
  }
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
    mesh.castShadow = true
    // セミリアル・絵の版では、目玉にまぶた・髪の影を落とさない（影の解像度が粗く、目全体が黒く沈むため）
    const eyes = !Array.isArray(mesh.material) && mesh.material.name.endsWith('.eyes')
    mesh.receiveShadow = !(eyes && MOB_STYLE !== 'real')
    if (eyes && MOB_STYLE !== 'real') mesh.castShadow = false
    mesh.frustumCulled = false
  })
  if (MOB_STYLE === 'semi' || MOB_STYLE === 'paint') addOutlines(root)
}

/**
 * 正規化ボーン向けの動きを、この人の元の骨の回転に直す（three-vrm の VRMHumanoidRig.update と同じ式）。
 * raw：VRM の骨の名前（hips など）から、この人の骨を引く。
 * tpose：元の形が T ポーズでない人（Rocketbox など）は、T ポーズにしたときの骨の向き（ローカル）を渡す
 */
export function bakeClips(scene: THREE.Object3D, raw: (name: string) => THREE.Object3D | null | undefined, data: MotionData, tpose?: Map<THREE.Object3D, THREE.Quaternion>) {
  const saved = new Map<THREE.Object3D, THREE.Quaternion>()
  if (tpose)
    for (const [b, q] of tpose) {
      saved.set(b, b.quaternion.clone())
      b.quaternion.copy(q)
    }
  scene.updateMatrixWorld(true)
  // T ポーズでの骨の世界の向き。骨組みの親子が VRM と違う素材もある（Rocketbox は太ももの親が背骨、鎖骨の親が首）ので、
  // VRM の親子で動きを積み上げた「世界の向き」を作り、それをこの素材の本当の親から見た向きに直す
  const nodes = data.bones.map((name) => raw(name) ?? null)
  const tw = new Map<THREE.Object3D, THREE.Quaternion>()
  const twOf = (o: THREE.Object3D) => {
    let w = tw.get(o)
    if (!w) tw.set(o, (w = o.getWorldQuaternion(new THREE.Quaternion())))
    return w
  }
  const index = new Map<THREE.Object3D, number>()
  nodes.forEach((o, i) => o && index.set(o, i))
  const vrmParent = data.bones.map((name) => {
    let p = VRM_PARENT[name]
    // この人にない骨（upperChest など）は飛ばして、その上の骨につなぐ
    while (p && !raw(p)) p = VRM_PARENT[p]
    return p ? data.bones.indexOf(p) : -1
  })
  const bones = nodes.map((node) => {
    if (!node || !node.parent) return null
    // 本当の親から上へたどって、最初の動く骨（なければ動かない親）
    let a: THREE.Object3D | null = node.parent
    while (a && !index.has(a)) a = a.parent
    const P = twOf(node.parent)
    return { node, tw: twOf(node).clone(), anc: a ? index.get(a)! : -1, rel: a ? twOf(a).clone().invert().multiply(P) : P.clone() }
  })
  for (const [b, q] of saved) b.quaternion.copy(q)
  scene.updateMatrixWorld(true)
  const hipsNode = raw('hips')!
  const hipsWorld = hipsNode.getWorldPosition(new THREE.Vector3())
  const hipsParentInv = hipsNode.parent!.matrixWorld.clone().invert()
  const H = hipsWorld.y
  const clips = new Map<string, THREE.AnimationClip>()
  const q = new THREE.Quaternion()
  const v = new THREE.Vector3()
  const acc = data.bones.map(() => new THREE.Quaternion())
  const world = data.bones.map(() => new THREE.Quaternion())
  for (const [name, c] of Object.entries(data.clips)) {
    const rot = int16(c.rot)
    const pos = int16(c.pos)
    const n = c.frames + (c.loop ? 1 : 0)
    const times = new Float32Array(n)
    for (let f = 0; f < n; f++) times[f] = f / c.fps
    const vals = bones.map((b) => (b ? new Float32Array(n * 4) : null))
    for (let f = 0; f < n; f++) {
      // VRM の親子で積み上げた回し方（data.bones は親が先に並んでいる）→ 骨の世界の向き
      data.bones.forEach((_, bi) => {
        const o = ((f % c.frames) * data.bones.length + bi) * 4
        q.set(rot[o] / 32767, rot[o + 1] / 32767, rot[o + 2] / 32767, rot[o + 3] / 32767).normalize()
        const pi = vrmParent[bi]
        if (pi >= 0) acc[bi].copy(acc[pi]).multiply(q)
        else acc[bi].copy(q)
        const b = bones[bi]
        if (b) world[bi].copy(acc[bi]).multiply(b.tw)
      })
      bones.forEach((b, bi) => {
        if (!b) return
        // 親の世界の向き：動く骨の向き × そこから親までの動かない向き
        if (b.anc >= 0) q.copy(world[b.anc]).multiply(b.rel)
        else q.copy(b.rel)
        q.invert().multiply(world[bi])
        q.toArray(vals[bi]!, f * 4)
      })
    }
    const tracks: THREE.KeyframeTrack[] = []
    bones.forEach((b, bi) => {
      if (b) tracks.push(new THREE.QuaternionKeyframeTrack(`${b.node.name}.quaternion`, times, vals[bi]!))
    })
    const pv = new Float32Array(n * 3)
    for (let f = 0; f < n; f++) {
      const o = (f % c.frames) * 3
      v.set(hipsWorld.x + (pos[o] / 10000) * H, (pos[o + 1] / 10000) * H, hipsWorld.z + (pos[o + 2] / 10000) * H).applyMatrix4(hipsParentInv)
      v.toArray(pv, f * 3)
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${hipsNode.name}.position`, times, pv))
    clips.set(name, new THREE.AnimationClip(name, -1, tracks))
  }
  return { clips, hipsHeight: H }
}

/** VRM の骨の親（動きのデータはこの親子で書かれている） */
const VRM_PARENT: Record<string, string> = (() => {
  const p: Record<string, string> = { spine: 'hips', chest: 'spine', upperChest: 'chest', neck: 'upperChest', head: 'neck' }
  for (const s of ['left', 'right']) {
    Object.assign(p, {
      [`${s}Shoulder`]: 'upperChest',
      [`${s}UpperArm`]: `${s}Shoulder`,
      [`${s}LowerArm`]: `${s}UpperArm`,
      [`${s}Hand`]: `${s}LowerArm`,
      [`${s}ThumbMetacarpal`]: `${s}Hand`,
      [`${s}ThumbProximal`]: `${s}ThumbMetacarpal`,
      [`${s}ThumbDistal`]: `${s}ThumbProximal`,
      [`${s}UpperLeg`]: 'hips',
      [`${s}LowerLeg`]: `${s}UpperLeg`,
      [`${s}Foot`]: `${s}LowerLeg`,
      [`${s}Toes`]: `${s}Foot`,
    })
    for (const f of ['Index', 'Middle', 'Ring', 'Little']) {
      p[`${s}${f}Proximal`] = `${s}Hand`
      p[`${s}${f}Intermediate`] = `${s}${f}Proximal`
      p[`${s}${f}Distal`] = `${s}${f}Intermediate`
    }
  }
  return p
})()

let loading: Promise<VrmModel[]> | null = null

/** 公園の人の VRM と動きを読み込む（歩く場面に来たとき 1 回だけ） */
export function loadMobModels(): Promise<VrmModel[]> {
  return (loading ??= (async () => {
    const base = import.meta.env.BASE_URL
    // ふだんは Rocketbox の人（trialPeople.ts）。前の MakeHuman の人は ?mobset=makehuman
    if (MOB_SET !== 'makehuman') {
      const motions = (await fetch(`${base}walk/motions.json`).then((r) => r.json())) as MotionData
      return (await import('./trialPeople')).loadTrialModels(base, motions)
    }
    const [{ GLTFLoader }, { VRMLoaderPlugin, VRMUtils }, motions] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('@pixiv/three-vrm'),
      fetch(`${base}walk/motions.json`).then((r) => r.json() as Promise<MotionData>),
    ])
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))
    const models = await Promise.all(
      MOB_MODELS.filter((m) => m.phone || !lowMemory()).map(async (info) => {
        const gltf = await loader.loadAsync(`${base}walk/mobs/${info.file}.vrm`)
        const vrm = gltf.userData.vrm as import('@pixiv/three-vrm').VRM
        VRMUtils.removeUnnecessaryVertices(gltf.scene)
        VRMUtils.combineSkeletons(gltf.scene)
        // 揺れ物・視線・表情は使わない（骨を複製するので、元の VRM の仕組みは動かさない）
        const { clips, hipsHeight } = bakeClips(vrm.scene, (b) => vrm.humanoid.getRawBoneNode(b as never), motions)
        toLambert(vrm.scene)
        if (MOB_STYLE === 'paint') await applyPaintTextures(vrm.scene, base)
        const raw = (b: string) => vrm.humanoid.getRawBoneNode(b as never)?.name ?? ''
        const arms = (['left', 'right'] as const).map((side) => [raw(`${side}UpperArm`), raw(`${side}LowerArm`), raw(`${side}Hand`)] as [string, string, string])
        const legs = (['left', 'right'] as const).map((side) => [raw(`${side}UpperLeg`), raw(`${side}LowerLeg`), raw(`${side}Foot`), raw(`${side}Toes`)] as [string, string, string, string])
        return { info, scene: vrm.scene, clips, hipsHeight, headName: raw('head'), neckName: raw('neck'), arms, legs, hipsName: raw('hips') }
      }),
    )
    return models
  })())
}

/** 腰の高さあたりの、動きの中の進む速さ（Mixamo の Y Bot：歩き 1.85 m / 1.03 s、走り 3.06 m / 0.70 s、腰の高さ 1.04 m） */
const WALK_PER_HIP = 1.85 / 1.04 / 1.033
const RUN_PER_HIP = 3.06 / 1.04 / 0.7

/** VRM の人。pose の motion を Mixamo の動きに当て、変わるときはなめらかにつなぐ */
export class VrmPerson implements Person {
  readonly group = new THREE.Group()
  private mixer: THREE.AnimationMixer
  private actions = new Map<string, THREE.AnimationAction>()
  private current: THREE.AnimationAction | null = null
  private lastMotion: Motion | null = null
  private choice: Record<'idle' | 'sit' | 'ground' | 'wave', string>
  private hips: number

  constructor(
    readonly model: VrmModel,
    rand: () => number,
    scale = 1,
    /** 跳ぶ高さを動きの外（自分の操作）で決める：跳ぶ動きの腰の上下を使わない */
    private codeJump = false,
  ) {
    const { clone } = skeletonUtils!
    const body = clone(model.scene)
    // VRM 1.0 は +z を向いている。この場面の人は -z が前
    body.rotation.y = Math.PI
    body.scale.setScalar(scale)
    const hs = model.info.headScale ?? 1
    this.head = body.getObjectByName(model.headName) ?? null
    this.neck = model.neckName ? (body.getObjectByName(model.neckName) ?? null) : null
    // 首に頭のほかの骨（Rocketbox の鎖骨）がつながっている人は、首を回すと肩・腕までつられるので頭だけで向く
    if (this.neck && this.neck.children.some((c) => (c as THREE.Bone).isBone && c !== this.head)) this.neck = null
    if (hs !== 1) this.head?.scale.setScalar(hs)
    this.group.add(body)
    this.hips = model.hipsHeight * scale
    this.mixer = new THREE.AnimationMixer(body)
    const pick = (list: string[]) => list[Math.floor(rand() * list.length)]
    this.choice = {
      idle: model.info.age === 'child' ? pick(['idleHappy', 'idleBreath', 'idle']) : pick(['idle', 'idleBreath', 'idleNeutral']),
      sit: pick(['sitIdle', 'sitIdle2', 'sitIdle3', 'sitFidget']),
      ground: pick(['groundSit', 'groundSit2']),
      wave: pick(['wave', 'waveShort']),
    }
    this.mixer.timeScale = 0.92 + rand() * 0.16
    this.offset = rand() * 10
    this.arms = model.arms.map((names) => names.map((n) => (n ? (body.getObjectByName(n) ?? null) : null)) as ArmBones)
    this.legs = (model.legs ?? []).map((names) => names.map((n) => (n ? (body.getObjectByName(n) ?? null) : null)) as LegBones)
    this.hipsBone = model.hipsName ? (body.getObjectByName(model.hipsName) ?? null) : null
    // 立った形で、足首の高さと、足首からつま先への下がり方を測る（板に足の裏をつけるため）
    const [, , foot, toe] = this.legs[0] ?? []
    if (foot && toe) {
      this.group.updateMatrixWorld(true)
      const f = foot.getWorldPosition(new THREE.Vector3())
      const t = toe.getWorldPosition(new THREE.Vector3())
      this.ankleH = f.y
      this.toeDrop = (f.y - t.y) / Math.max(0.02, Math.hypot(t.x - f.x, t.z - f.z))
    }
    // まばたきの形を持つ人（Rocketbox）
    body.traverse((o) => {
      const m = o as THREE.Mesh
      const d = m.morphTargetDictionary
      if (!m.isMesh || !d || !m.morphTargetInfluences) return
      const idx = Object.keys(d)
        .filter((k) => /EyeBlink(Left|Right)$/.test(k))
        .map((k) => d[k])
      if (idx.length) this.blinks.push({ m, idx })
    })
    this.nextBlink = 1 + rand() * 4
  }
  private blinks: { m: THREE.Mesh; idx: number[] }[] = []
  private nextBlink = 0
  private blinkT = -1

  /** まばたき：1 分に 10 回ほど。閉じる 0.1 秒、開ける 0.2 秒 */
  private blink(dt: number) {
    if (!this.blinks.length) return
    if (this.blinkT < 0) {
      this.nextBlink -= dt
      if (this.nextBlink <= 0) this.blinkT = 0
      return
    }
    this.blinkT += dt
    const t = this.blinkT
    const w = t < 0.1 ? t / 0.1 : t < 0.14 ? 1 : Math.max(0, 1 - (t - 0.14) / 0.2)
    for (const b of this.blinks) for (const i of b.idx) b.m.morphTargetInfluences![i] = w
    if (t > 0.34) {
      this.blinkT = -1
      this.nextBlink = 2 + Math.random() * 6 + (Math.random() < 0.15 ? -1.8 : 0)
    }
  }
  private arms: ArmBones[]
  /** 手を置く先（世界の位置、左・右）。null なら動きのまま */
  private grips: [THREE.Vector3, THREE.Vector3] | null = null

  /** 両手を世界のこの位置へ伸ばす（ホバースクーターのハンドル）。null で動きのままにもどす */
  grip(left: THREE.Vector3 | null, right: THREE.Vector3 | null) {
    this.grips = left && right ? [left, right] : null
  }

  private legs: LegBones[] = []
  private hipsBone: THREE.Object3D | null = null
  private hipsRest: { p: THREE.Vector3; q: THREE.Quaternion } | null = null
  private ankleH = 0.08
  private toeDrop = 0.4
  /** 板の上の立ち方：足の裏を置く先（世界の位置、左・右）、つま先の向き（世界、板にそった向き）、腰を落とす量 m、上体の前への傾き rad */
  private stanceSet: { feet: [THREE.Vector3, THREE.Vector3]; toes: [THREE.Vector3, THREE.Vector3]; crouch: number; lean: number } | null = null

  /** 両足を板の上のこの位置に置き、ひざを少し曲げる（ホバースクーター）。null で動きのままにもどす */
  stance(s: { feet: [THREE.Vector3, THREE.Vector3]; toes: [THREE.Vector3, THREE.Vector3]; crouch: number; lean: number } | null) {
    this.stanceSet = s
  }

  /** 腰を落として上体を少し前へ倒し、2 本の骨の脚で足を板に置く。ひざは前（少し外）へ。足の裏は板にそろえる */
  private applyStance() {
    const st = this.stanceSet
    const hips = this.hipsBone
    if (!st || !hips?.parent || this.legs.length < 2) return
    this.group.updateMatrixWorld(true)
    this.group.getWorldQuaternion(gq)
    lgUp.set(0, 1, 0).applyQuaternion(gq)
    // 腰を落とす（腰の骨を、体の上の向きに沿って下げる）
    // 動きが腰の骨を動かさない人でも下がり続けないように、変える前を覚えておき、次の動きの前にもどす
    this.hipsRest = { p: hips.position.clone(), q: hips.quaternion.clone() }
    hips.getWorldPosition(ikT).addScaledVector(lgUp, -st.crouch)
    hips.parent.worldToLocal(ikT)
    hips.position.copy(ikT)
    // 上体を前へ倒す（腰の骨を、体の横の軸で回す。脚はあとで足を置き直す）
    if (st.lean) {
      lgAx.set(1, 0, 0).applyQuaternion(gq)
      ikQ.setFromAxisAngle(lgAx, -st.lean)
      hips.getWorldQuaternion(bq).premultiply(ikQ)
      hips.parent.getWorldQuaternion(pq)
      hips.quaternion.copy(pq.invert().multiply(bq))
    }
    hips.updateMatrixWorld(true)
    this.legs.forEach(([upper, lower, foot, toe], i) => {
      if (!upper || !lower || !foot || !upper.parent) return
      const target = lgT.copy(st.feet[i]).addScaledVector(lgUp, this.ankleH)
      upper.getWorldPosition(ikS)
      lower.getWorldPosition(ikE)
      foot.getWorldPosition(ikH)
      const a = ikS.distanceTo(ikE)
      const b = ikE.distanceTo(ikH)
      ikU.subVectors(target, ikS)
      const d = THREE.MathUtils.clamp(ikU.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3)
      ikU.normalize()
      // ひざの向き：前、少し外
      ikP.set(i === 0 ? -0.2 : 0.2, 0, -1).applyQuaternion(gq)
      ikP.addScaledVector(ikU, -ikP.dot(ikU)).normalize()
      const cosA = (a * a + d * d - b * b) / (2 * a * d)
      const knee = ikT.copy(ikS).addScaledVector(ikU, a * cosA).addScaledVector(ikP, a * Math.sqrt(Math.max(0, 1 - cosA * cosA)))
      swing(upper, ikE.sub(ikS).normalize(), ikD.subVectors(knee, ikS).normalize())
      lower.getWorldPosition(ikE)
      foot.getWorldPosition(ikH)
      swing(lower, ikH.sub(ikE).normalize(), ikD.subVectors(target, ikE).normalize())
      // 足の裏を板にそろえる：足首からつま先への向きを、板の上のつま先の向きへ
      if (toe) {
        foot.getWorldPosition(ikH)
        toe.getWorldPosition(ikE)
        swing(foot, ikE.sub(ikH).normalize(), ikD.copy(st.toes[i]).addScaledVector(lgUp, -this.toeDrop).normalize())
      }
    })
  }

  /** 2 本の骨の腕を、手が目標に届くように曲げる。肘は外・下・後ろへ逃がす */
  private applyGrip() {
    if (!this.grips) return
    this.group.updateMatrixWorld(true)
    this.group.getWorldQuaternion(gq)
    this.arms.forEach(([upper, lower, hand], i) => {
      if (!upper || !lower || !hand || !upper.parent) return
      const target = this.grips![i]
      upper.getWorldPosition(ikS)
      lower.getWorldPosition(ikE)
      hand.getWorldPosition(ikH)
      const a = ikS.distanceTo(ikE)
      const b = ikE.distanceTo(ikH)
      ikU.subVectors(target, ikS)
      const d = THREE.MathUtils.clamp(ikU.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3)
      ikU.normalize()
      // 肘の逃がし先：人の向きで、外（左腕は左）・下・後ろ
      ikP.set(i === 0 ? 0.55 : -0.55, -0.7, 0.45).applyQuaternion(gq)
      ikP.addScaledVector(ikU, -ikP.dot(ikU)).normalize()
      const cosA = (a * a + d * d - b * b) / (2 * a * d)
      const elbow = ikT.copy(ikS).addScaledVector(ikU, a * cosA).addScaledVector(ikP, a * Math.sqrt(Math.max(0, 1 - cosA * cosA)))
      swing(upper, ikE.sub(ikS).normalize(), ikD.subVectors(elbow, ikS).normalize())
      lower.getWorldPosition(ikE)
      hand.getWorldPosition(ikH)
      swing(lower, ikH.sub(ikE).normalize(), ikD.subVectors(target, ikE).normalize())
    })
  }
  private offset: number
  /** 見る先（世界の位置）。null なら見ない */
  private lookTarget: THREE.Vector3 | null = null
  private lookW = 0
  private head: THREE.Object3D | null = null
  private neck: THREE.Object3D | null = null

  /** 近くの人の顔を見る（首 4 割・頭 6 割で向ける）。null で前に戻す */
  look(target: THREE.Vector3 | null) {
    this.lookTarget = target
  }

  private applyLook(dt: number) {
    const t = this.lookTarget
    let want = 0
    let yaw = 0
    let pitch = 0
    if (t && this.head) {
      const g = this.group
      g.updateMatrixWorld(true)
      this.head.getWorldPosition(lv)
      g.worldToLocal(lv)
      ld.copy(t)
      g.worldToLocal(ld).sub(lv)
      yaw = Math.atan2(-ld.x, -ld.z)
      pitch = Math.atan2(ld.y, Math.hypot(ld.x, ld.z))
      // 真後ろの人は見ない（首が回りすぎる）
      if (Math.abs(yaw) < 1.9) want = 1
      this.lastYaw = THREE.MathUtils.clamp(yaw, -1.25, 1.25)
      this.lastPitch = THREE.MathUtils.clamp(pitch, -0.45, 0.35)
    }
    this.lookW += (want - this.lookW) * Math.min(1, dt * 2.5)
    if (this.lookW < 0.01 || !this.head) return
    lq.setFromAxisAngle(AX_Y, this.lastYaw * this.lookW).multiply(lq2.setFromAxisAngle(AX_X, this.lastPitch * this.lookW))
    // 人の向きの中での回し方を、世界の回し方に直す
    this.group.getWorldQuaternion(gq)
    wq.copy(gq).multiply(lq).multiply(gq.invert())
    for (const [bone, k] of [[this.neck, 0.4], [this.head, 0.6]] as const) {
      if (!bone || !bone.parent) continue
      part.identity().slerp(wq, this.neck ? k : 1)
      bone.getWorldQuaternion(bq)
      bq.premultiply(part)
      bone.parent.getWorldQuaternion(pq)
      bone.quaternion.copy(pq.invert().multiply(bq))
      bone.updateMatrixWorld(true)
    }
  }
  private lastYaw = 0
  private lastPitch = 0

  private action(name: string) {
    let a = this.actions.get(name)
    if (!a) {
      let clip = this.model.clips.get(name)!
      if (this.codeJump && name === 'hop') clip = new THREE.AnimationClip(clip.name + '-inPlace', clip.duration, clip.tracks.filter((t) => !t.name.endsWith('.position')))
      a = this.mixer.clipAction(clip)
      if (name === 'hop' || name === 'jump') {
        a.setLoop(THREE.LoopOnce, 1)
        a.clampWhenFinished = true
      }
      this.actions.set(name, a)
    }
    return a
  }

  private play(name: string, fade = 0.3) {
    const a = this.action(name)
    if (this.current === a) return a
    a.reset()
    a.time = a.loop === THREE.LoopOnce ? 0 : this.offset % a.getClip().duration
    a.enabled = true
    a.setEffectiveWeight(1)
    a.play()
    if (this.current) a.crossFadeFrom(this.current, fade, false)
    this.current = a
    return a
  }

  /** speed：進む速さ m/s（歩く・走るの足の運びを合わせる） */
  pose(motion: Motion, _phase: number, dt: number, speed = 0) {
    const changed = motion !== this.lastMotion
    this.lastMotion = motion
    if (motion === 'walk') this.play('walk').timeScale = Math.max(0.4, speed / (WALK_PER_HIP * this.hips))
    else if (motion === 'run') this.play('run').timeScale = Math.max(0.5, speed / (RUN_PER_HIP * this.hips))
    else if (motion === 'jump') {
      const a = this.play('hop', 0.12)
      if (changed) a.reset().play()
    } else if (motion === 'sit') this.play(this.choice.sit, 0.5)
    else if (motion === 'ground') this.play(this.choice.ground, 0.5)
    else if (motion === 'wave') this.play(this.choice.wave)
    else if (motion === 'ride' || motion === 'glide') this.play('idleNeutral', 0.25)
    else this.play(this.choice.idle)
    if (this.hipsRest && this.hipsBone) {
      this.hipsBone.position.copy(this.hipsRest.p)
      this.hipsBone.quaternion.copy(this.hipsRest.q)
      this.hipsRest = null
    }
    this.mixer.update(dt)
    this.applyLook(dt)
    this.blink(dt)
    if (motion === 'ride') this.applyStance()
    if (motion === 'ride' || motion === 'glide') this.applyGrip()
  }

  dispose() {
    this.mixer.stopAllAction()
    this.group.removeFromParent()
  }
}

const lv = new THREE.Vector3()
const ld = new THREE.Vector3()
const lq = new THREE.Quaternion()
const lq2 = new THREE.Quaternion()
const gq = new THREE.Quaternion()
const wq = new THREE.Quaternion()
const part = new THREE.Quaternion()
const bq = new THREE.Quaternion()
const pq = new THREE.Quaternion()
const AX_X = new THREE.Vector3(1, 0, 0)
const AX_Y = new THREE.Vector3(0, 1, 0)

type ArmBones = [THREE.Object3D | null, THREE.Object3D | null, THREE.Object3D | null]
type LegBones = [THREE.Object3D | null, THREE.Object3D | null, THREE.Object3D | null, THREE.Object3D | null]
const lgUp = new THREE.Vector3()
const lgAx = new THREE.Vector3()
const lgT = new THREE.Vector3()
const ikS = new THREE.Vector3()
const ikE = new THREE.Vector3()
const ikH = new THREE.Vector3()
const ikU = new THREE.Vector3()
const ikP = new THREE.Vector3()
const ikT = new THREE.Vector3()
const ikD = new THREE.Vector3()
const ikQ = new THREE.Quaternion()

/** 骨を世界の中で回して、子の骨へ向かう向き from を to にする */
function swing(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  ikQ.setFromUnitVectors(from, to)
  bone.getWorldQuaternion(bq)
  bq.premultiply(ikQ)
  bone.parent!.getWorldQuaternion(pq)
  bone.quaternion.copy(pq.invert().multiply(bq))
  bone.updateMatrixWorld(true)
}

let skeletonUtils: typeof import('three/examples/jsm/utils/SkeletonUtils.js') | null = null
/** VrmPerson を作る前に呼ぶ */
export async function prepareVrmPeople() {
  skeletonUtils ??= await import('three/examples/jsm/utils/SkeletonUtils.js')
  return loadMobModels()
}
