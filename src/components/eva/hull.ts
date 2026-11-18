import * as THREE from 'three'
import { shipDistance } from './shipCollider'

// 船外の場面の足場（作業場所）。エアロックはどこでも原点、外向きが +Y、前が -Z。
// - hull：乗っている船の背中のあたりを、メートル単位の大きな円筒の一部として描く（円筒の軸は Z、いちばん上が y = 0）
// - arcadia：アルカディアの 2 本の舳先のあいだの発進路（平らな床と、左右の装甲の壁）
// - dock：天の湊のリングの下面（地球の側を向いた平らな面）
// 平らな場所では、theta の代わりに x（m）を使う（hullPoint などの引数はそのまま）。

export const HULL_R = 26
/** 外壁の長さの半分（m） */
export const HULL_HALF = 150
/** エアロック（背中のまんなか） */
export const AIRLOCK = { x: 0, z: 0, size: 1.5 }

/** ship：本物の母船の模型（実寸）のまわりを自由に飛ぶ（shipCollider.ts） */
export type EvaSiteId = 'ship' | 'hull' | 'arcadia' | 'dock'

/** 横断面の折れ線（右側が中身）。x, y（m） */
export type Poly = [number, number][]

export type SiteShape = {
  /** 円筒の半径（0 なら平ら） */
  R: number
  /** 横断面（平らな場所）。z の位置で x をずらす関数（先細り・リングの曲がり） */
  polys: Poly[]
  shift: (x: number, z: number) => number
  /** 当たり判定のある前後の範囲 */
  half: number
}

/** アルカディアの発進路の壁（模型の上で測った形。床から 26 m で内へ 3 m 傾き、上で外へ開いて舳先の背になる） */
export const ARC_W = 17.95 // 模型の壁（18.25 m）より 30 cm 内側に、細かい面を重ねる
const ARC_SIDE: Poly = [
  [ARC_W, 0],
  [ARC_W - 3.15, 26],
  [19.7, 30.3],
  [30, 41],
  [40, 42.6],
  [70, 42.3],
]
/** 発進路の床：カタパルトのレール（x ±3.7〜5.3、高さ 1 m） */
const ARC_FLOOR: Poly = [
  [-ARC_W, 0],
  [-5.35, 0],
  [-5.35, 1],
  [-3.65, 1],
  [-3.65, 0],
  [3.65, 0],
  [3.65, 1],
  [5.35, 1],
  [5.35, 0],
  [ARC_W, 0],
]
/** 前（-Z）へ行くほど広がる（模型では 90 m 前で 22.7 m、70 m 後ろで 15.2 m） */
export const arcTaper = (z: number) => -0.046 * z

/** 天の湊のリングの下面の半径（m）。エアロックはここ。リングの下面は 1,940〜2,160 m */
export const DOCK_R = 2050

export const SITE_SHAPES: Record<EvaSiteId, SiteShape> = {
  ship: { R: 0, polys: [], shift: () => 0, half: Infinity },
  hull: { R: HULL_R, polys: [], shift: () => 0, half: HULL_HALF },
  arcadia: {
    R: 0,
    polys: [
      // 左の壁（上から下へ）→ 床 → 右の壁（下から上へ）
      [...ARC_SIDE.map(([x, y]) => [-x, y] as [number, number]).reverse(), ...ARC_FLOOR.slice(1, -1), ...ARC_SIDE],
    ],
    shift: (x, z) => (Math.abs(x) >= ARC_W - 4 ? Math.sign(x) * arcTaper(z) : 0),
    half: 170,
  },
  dock: {
    R: 0,
    polys: [
      // 内のふちと外のふちは、リングの中へ（上へ）面取りしてある
      // リングに沿って走る配管の箱（x -26〜-22、22〜26、高さ 1.2 m）
      [
        [-150, -40],
        [-110, 0],
        [-26, 0],
        [-26, 1.2],
        [-22, 1.2],
        [-22, 0],
        [22, 0],
        [22, 1.2],
        [26, 1.2],
        [26, 0],
        [110, 0],
        [160, -45],
      ],
    ],
    // リングは半径 2 km あまりで曲がっているので、前後へ行くほど内側（-x）へ寄る
    shift: (_x, z) => -(z * z) / (2 * DOCK_R),
    half: 400,
  },
}

/** 天の湊のリングの下面で、まわりに物がない区画（リングを 16 に分けた区画の番号。模型の下から光線を当てて確かめた） */
export const DOCK_CLEAR_SEGMENTS = [0, 7, 8, 11, 12, 15]
export const DOCK_BOTTOM = -140

/** 天の湊の模型の座標（m、three の向き）での、作業場所の置き場所と向き（a：リングの上から見た角度、Blender の向き） */
export function dockSiteMatrix(a: number, out = new THREE.Matrix4()) {
  const c = Math.cos(a)
  const s = Math.sin(a)
  // 外向き（半径の向き）が +X、下（地球の側）が +Y、リングに沿った向きが Z
  out.makeBasis(new THREE.Vector3(c, 0, -s), new THREE.Vector3(0, -1, 0), new THREE.Vector3(-s, 0, -c))
  return out.setPosition(DOCK_R * c, DOCK_BOTTOM, -DOCK_R * s)
}

/** いまの作業場所（startEva で決める）。frame：場面の座標 → 宇宙の場面の向き。planet：見えている天体を決めてあれば */
export const evaSite: { id: EvaSiteId; shape: SiteShape; frame: THREE.Quaternion; dockA: number; planet: string | null } = {
  id: 'hull',
  shape: SITE_SHAPES.hull,
  frame: new THREE.Quaternion(),
  dockA: 0,
  planet: null,
}

export function setEvaSite(id: EvaSiteId, frame?: THREE.Quaternion, dockA = 0) {
  evaSite.id = id
  evaSite.shape = SITE_SHAPES[id]
  if (frame) evaSite.frame.copy(frame)
  evaSite.dockA = dockA
  evaSite.planet = id === 'dock' ? 'earth' : null
}

const flat = () => evaSite.shape.R === 0

/** 外壁の上の点と外向き：真上から右へ theta（ラジアン）回ったところ（平らな場所は x = theta m）、前後 z */
export function hullPoint(theta: number, z: number, lift = 0, out?: THREE.Vector3) {
  const o = out ?? new THREE.Vector3()
  if (flat()) return o.set(theta + evaSite.shape.shift(theta, z), lift, z)
  const R = evaSite.shape.R
  const r = R + lift
  return o.set(r * Math.sin(theta), r * Math.cos(theta) - R, z)
}

export function hullNormal(theta: number, out?: THREE.Vector3) {
  const o = out ?? new THREE.Vector3()
  if (flat()) return o.set(0, 1, 0)
  return o.set(Math.sin(theta), Math.cos(theta), 0)
}

/** 外壁の上に置く物の回り（Z のまわり、ラジアン。平らな場所は 0） */
export const hullRoll = (theta: number) => (flat() ? 0 : -theta)

const segN = new THREE.Vector2()

/** 横断面の折れ線（右側が中身）からの、めりこみの深さ。n に外向き（左）を入れる */
function polyClearance(x: number, y: number, poly: Poly, r: number, n: THREE.Vector2) {
  let best = Infinity
  let depth = 0
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, ay] = poly[i]
    const [bx, by] = poly[i + 1]
    const dx = bx - ax
    const dy = by - ay
    const L = Math.hypot(dx, dy)
    const t = ((x - ax) * dx + (y - ay) * dy) / (L * L)
    const tc = Math.max(0, Math.min(1, t))
    const px = ax + dx * tc
    const py = ay + dy * tc
    const d = Math.hypot(x - px, y - py)
    if (d >= best) continue
    best = d
    // 左（外）へ向かう符号つきの距離
    const side = ((x - ax) * -dy + (y - ay) * dx) / L
    if (side < 0) {
      // 中身の側：面の外向きへ押し出す
      depth = r - side
      segN.set(-dy / L, dx / L)
    } else {
      depth = r - d
      if (tc > 0 && tc < 1) segN.set(-dy / L, dx / L)
      else segN.set((x - px) / d, (y - py) / d)
    }
  }
  n.copy(segN)
  return depth
}

const n2 = new THREE.Vector2()

/** 点 p が外壁から r より近ければ、めりこんだ深さ（m、>0）を返し、normal に外向きを入れる */
export function hullClearance(p: THREE.Vector3, r: number, normal: THREE.Vector3) {
  if (evaSite.id === 'ship') return Math.max(0, r - shipDistance(p, normal, r + 0.01))
  const sh = evaSite.shape
  if (Math.abs(p.z) > sh.half) return 0
  // エアロックの穴の中（発進・回収のとき）は当たらない
  if (Math.abs(p.x - AIRLOCK.x) < AIRLOCK.size / 2 && Math.abs(p.z - AIRLOCK.z) < AIRLOCK.size / 2 && p.y < 0.2) return 0
  if (flat()) {
    let deepest = 0
    for (const poly of sh.polys) {
      // ずらした分をもどして、横断面の上で比べる
      const x = p.x - sh.shift(p.x, p.z)
      const d = polyClearance(x, p.y, poly, r, n2)
      if (d > deepest) {
        deepest = d
        normal.set(n2.x, n2.y, 0)
      }
    }
    return deepest
  }
  const dx = p.x
  const dy = p.y + sh.R
  const d = Math.hypot(dx, dy)
  const depth = sh.R + r - d
  if (depth <= 0) return 0
  normal.set(dx / d, dy / d, 0)
  return depth
}

const altN = new THREE.Vector3()

/** 外壁からの高さ（計器） */
export function hullAlt(p: THREE.Vector3) {
  if (evaSite.id === 'ship') return shipDistance(p, altN, 5000)
  if (flat()) {
    const n = new THREE.Vector3()
    // 足もとの面までの距離（壁のそばでは壁まで）
    const r = 60
    const d = hullClearance(p, r, n)
    return d > 0 ? Math.max(0, r - d) : p.y
  }
  return Math.hypot(p.x, p.y + evaSite.shape.R) - evaSite.shape.R
}
