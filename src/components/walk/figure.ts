import * as THREE from 'three'

// 仮の人形（VRM の人を読み込むまでの代わり。読めない端末ではこのまま）。どの人も同じ形のパーツを使い、色と大きさだけ変える。
// 動き（pose）は、VRM のときも同じ名前で Mixamo の動きを再生できるようにしておく：
// idle（立つ）・walk（歩く）・run（走る）・sit（座る）・jump（跳ぶ）・wave（手を振る）

/** ground：地面（芝生）に座る。ride：ホバースクーターに乗って、ハンドルを握る */
export type Motion = 'idle' | 'walk' | 'run' | 'sit' | 'jump' | 'wave' | 'ground' | 'ride' | 'glide'

export type Look = {
  /** 身長 m */
  height: number
  skin: number
  hair: number
  top: number
  bottom: number
  shoes: number
  /** 髪が長い */
  longHair?: boolean
}

/** 歩く場面の人（自分も、まわりの人も）。group を場面に置き、毎フレーム pose を呼ぶ */
export interface Person {
  readonly group: THREE.Group
  /** speed：進む速さ m/s（足の運びを合わせるのに使う人もいる） */
  pose(motion: Motion, phase: number, dt: number, speed?: number): void
  dispose(): void
}

let shared: null | {
  limb: THREE.CapsuleGeometry
  torso: THREE.CapsuleGeometry
  head: THREE.SphereGeometry
  hair: THREE.SphereGeometry
  longHair: THREE.CapsuleGeometry
  foot: THREE.BoxGeometry
} = null

function parts() {
  return (shared ??= {
    // 長さ 1・太さ 1 の手足（使う所で伸ばす）。上の端が原点（関節）
    limb: new THREE.CapsuleGeometry(0.5, 1, 4, 8).translate(0, -0.5, 0),
    torso: new THREE.CapsuleGeometry(1, 1.2, 4, 10),
    head: new THREE.SphereGeometry(1, 16, 12),
    hair: new THREE.SphereGeometry(1.06, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    longHair: new THREE.CapsuleGeometry(0.9, 1.2, 4, 10),
    foot: new THREE.BoxGeometry(1, 1, 1),
  })
}

const materials = new Map<number, THREE.MeshLambertMaterial>()
const mat = (c: number) => {
  let m = materials.get(c)
  if (!m) materials.set(c, (m = new THREE.MeshLambertMaterial({ color: c })))
  return m
}

type Joint = { pivot: THREE.Group; seg: THREE.Mesh }

/** 球と円柱で作った人形。体の比率は大人も子どもも同じで、全体を height に合わせて縮める（子どもは頭を少し大きく） */
export class Mannequin implements Person {
  readonly group = new THREE.Group()
  private body = new THREE.Group()
  private hipL: Joint
  private hipR: Joint
  private kneeL: Joint
  private kneeR: Joint
  private shL: Joint
  private shR: Joint
  private elL: Joint
  private elR: Joint
  private torso: THREE.Mesh
  private headG = new THREE.Group()
  private sitBlend = 0
  private jumpT = 0

  constructor(look: Look) {
    const p = parts()
    const child = look.height < 1.4
    const k = look.height / 1.7
    this.group.add(this.body)
    this.body.scale.setScalar(k)
    const add = (geo: THREE.BufferGeometry, color: number, parent: THREE.Object3D, s: [number, number, number], at: [number, number, number] = [0, 0, 0]) => {
      const m = new THREE.Mesh(geo, mat(color))
      m.scale.set(...s)
      m.position.set(...at)
      m.castShadow = true
      parent.add(m)
      return m
    }
    const joint = (parent: THREE.Object3D, at: [number, number, number], len: number, r: number, color: number): Joint => {
      const pivot = new THREE.Group()
      pivot.position.set(...at)
      parent.add(pivot)
      const seg = add(p.limb, color, pivot, [r * 2, len, r * 2])
      return { pivot, seg }
    }
    // 脚：腰 0.9 m、もも 0.44 m、すね 0.44 m
    this.hipL = joint(this.body, [-0.09, 0.92, 0], 0.44, 0.07, look.bottom)
    this.hipR = joint(this.body, [0.09, 0.92, 0], 0.44, 0.07, look.bottom)
    this.kneeL = joint(this.hipL.pivot, [0, -0.44, 0], 0.44, 0.055, child ? look.skin : look.bottom)
    this.kneeR = joint(this.hipR.pivot, [0, -0.44, 0], 0.44, 0.055, child ? look.skin : look.bottom)
    for (const kn of [this.kneeL, this.kneeR]) add(p.foot, look.shoes, kn.pivot, [0.1, 0.07, 0.24], [0, -0.47, -0.05])
    // 胴
    this.torso = add(p.torso, look.top, this.body, [0.15, 0.17, 0.11], [0, 1.2, 0])
    // 腕：肩 1.42 m、上腕 0.3 m、前腕 0.28 m
    this.shL = joint(this.body, [-0.21, 1.42, 0], 0.3, 0.048, look.top)
    this.shR = joint(this.body, [0.21, 1.42, 0], 0.3, 0.048, look.top)
    this.elL = joint(this.shL.pivot, [0, -0.3, 0], 0.28, 0.04, look.skin)
    this.elR = joint(this.shR.pivot, [0, -0.3, 0], 0.28, 0.04, look.skin)
    // 頭
    const hs = child ? 1.18 : 1
    this.headG.position.set(0, 1.6, 0)
    this.headG.scale.setScalar(hs)
    this.body.add(this.headG)
    add(p.head, look.skin, this.headG, [0.1, 0.115, 0.105])
    const hair = add(p.hair, look.hair, this.headG, [0.1, 0.115, 0.105], [0, 0.005, 0.006])
    hair.rotation.x = 0.25
    if (look.longHair) add(p.longHair, look.hair, this.headG, [0.085, 0.09, 0.05], [0, -0.12, 0.06])
    // 首
    add(p.limb, look.skin, this.body, [0.07, 0.08, 0.07], [0, 1.53, 0])
  }

  /** phase：歩く・走る足の運びの位相（ラジアン）。dt：座る・立つの移り変わり用 */
  pose(motion: Motion, phase: number, dt: number) {
    if (motion === 'ground') motion = 'sit'
    const sit = motion === 'sit' ? 1 : 0
    this.sitBlend += (sit - this.sitBlend) * Math.min(1, dt * 5)
    const sb = this.sitBlend
    const walk = motion === 'walk' ? 1 : 0
    const run = motion === 'run' ? 1 : 0
    const amp = walk * 0.45 + run * 0.85
    const sw = Math.sin(phase)
    const bend = (x: number) => Math.max(0, x)
    if (motion === 'jump') this.jumpT = Math.min(1, this.jumpT + dt * 6)
    else this.jumpT = Math.max(0, this.jumpT - dt * 6)
    const jt = this.jumpT

    // 脚：前へ振る = x 軸まわりに +（前は -z）。下の式は「前へ・曲げる = +」で書いて、まとめて符号を返す
    const hipL = -sw * amp
    const hipR = sw * amp
    this.hipL.pivot.rotation.x = -(hipL * (1 - sb) + (-Math.PI / 2) * sb - jt * 0.5)
    this.hipR.pivot.rotation.x = -(hipR * (1 - sb) + (-Math.PI / 2) * sb - jt * 0.2)
    this.kneeL.pivot.rotation.x = -((bend(Math.sin(phase + 1.4)) * (walk * 0.7 + run * 1.4)) * (1 - sb) + (Math.PI / 2) * sb + jt * 0.9)
    this.kneeR.pivot.rotation.x = -((bend(Math.sin(phase + 1.4 + Math.PI)) * (walk * 0.7 + run * 1.4)) * (1 - sb) + (Math.PI / 2) * sb + jt * 0.5)
    // 腕：脚と逆に振る。手を振るときは右腕を上げる
    const armAmp = walk * 0.4 + run * 0.9
    const wave = motion === 'wave' ? 1 : 0
    this.shL.pivot.rotation.x = -(sw * armAmp * (1 - sb) - 0.25 * sb - jt * 2.4)
    this.shR.pivot.rotation.x = -(-sw * armAmp * (1 - sb) - 0.25 * sb - jt * 2.4)
    this.shL.pivot.rotation.z = -0.08 - jt * 0.3
    this.shR.pivot.rotation.z = 0.08 + jt * 0.3 + wave * 2.6
    this.elL.pivot.rotation.x = -(-(0.15 + run * 1.2) * (1 - sb) - 0.6 * sb)
    this.elR.pivot.rotation.x = -(-(0.15 + run * 1.2) * (1 - sb) - 0.6 * sb)
    this.elR.pivot.rotation.z = wave * (0.4 + Math.sin(phase * 3) * 0.5)
    // 体：歩くと上下に揺れ、走ると前へ傾く。座ると腰が座面（0.46 m）まで下がる
    const bob = Math.abs(Math.cos(phase)) * (walk * 0.03 + run * 0.07)
    this.body.position.y = bob * (1 - sb) - sb * 0.46 * this.body.scale.y
    this.body.position.z = sb * 0.12 * this.body.scale.y
    this.body.rotation.x = -run * 0.18 - walk * 0.03
    this.torso.rotation.z = Math.sin(phase) * (walk * 0.03 + run * 0.05)
    this.headG.rotation.y = 0
  }

  /** 少しだけ頭を回す（まわりを見る） */
  look(yaw: number) {
    this.headG.rotation.y = yaw
  }

  dispose() {
    this.group.removeFromParent()
  }
}

/* ---------- ランダムな見た目 ---------- */

const SKINS = [0xf3d6c1, 0xe8c1a0, 0xd7a47f, 0xb98260, 0x8d5a3c, 0x6b4430, 0xf5dfcf]
const HAIRS = [0x1c1714, 0x2c211a, 0x4a3324, 0x6d4a2f, 0x9a7048, 0xc8a26a, 0xd9d4cc, 0x8a8a8a, 0x3a2a40, 0xa23a2a]
const TOPS = [0xd8432f, 0x2f6fd8, 0xf2c94c, 0x5aa469, 0xffffff, 0x8e5bd0, 0xe48bb0, 0x33393f, 0x6fb8d9, 0xe8853a, 0x9c2f45, 0xcfd4c2]
const BOTTOMS = [0x2e3a55, 0x3b3b3b, 0x5a4a3a, 0x7c8a9a, 0x1f2b3a, 0xb9a98a, 0x4a5a3a]
const SHOES = [0x222222, 0xf0f0f0, 0x6a4a30, 0x3b5bb0, 0xc0392b]

export type Age = 'child' | 'adult' | 'elder'

/** 同じ人がいないように、身長・肌・髪・服をくじで決める */
export function randomLook(age: Age, rand: () => number): Look {
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)]
  const height = age === 'child' ? 1.05 + rand() * 0.35 : age === 'elder' ? 1.52 + rand() * 0.25 : 1.55 + rand() * 0.35
  return {
    height,
    skin: pick(SKINS),
    hair: age === 'elder' ? pick([0xd9d4cc, 0xbdb8b0, 0x8a8a8a, 0xeeeeee]) : pick(HAIRS),
    top: pick(TOPS),
    bottom: pick(BOTTOMS),
    shoes: pick(SHOES),
    longHair: rand() < 0.4,
  }
}

/** 自分（調査隊の隊員）：紺の上下に橙の差し色 */
export const CREW_LOOK: Look = { height: 1.72, skin: 0xe8c1a0, hair: 0x2c211a, top: 0x24365c, bottom: 0x1f2b3a, shoes: 0xe8853a }
