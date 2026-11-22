import * as THREE from 'three'
import { COLONY_LENGTH, COLONY_RADIUS } from '../../data/sf'
import { AVENUE, M, cityPlan, type Tree } from '../sf/colonyCity'
import { seeded } from '../sf/batch'
import { JUNGLE, inJungle, jungleLayout } from './jungle'

// コロニーの中を歩く場面の公園（1 本目の大地の帯の、公園の区画の池のそば）。
// 座標はメートル。コロニーの軸は +Y（太陽向き）で、宇宙の場面のコロニーの形（ColonyModel）を 1/M 倍して重ねる。
// 帯の上の位置は (s, y)：s は帯の中心からの横の位置（円周の向き）、y は港側の端からの長さ（軸の向き）。
// 地面は円筒の内側なので、「上」は軸の向きで、場所ごとに少しずつ傾く。

/**
 * 歩く地面の、軸からの距離 m。宇宙の場面の大地（円筒の一部を 60° あたり 24 面の平らな板で作ったもの）は、
 * 板のまん中が円より 1 m ほど軸の側へ出ているので、それより少し上にする
 */
export const G = (COLONY_RADIUS / M) * 0.999 - 1.05
/** 公園の地面の板を G からどれだけ浮かせているか m（宇宙の場面の大地と重ならないように）。人の足元もこの高さに置く */
export const GROUND_LIFT = 0.06
/** コロニーの長さの半分 m */
export const HALF_L = COLONY_LENGTH / M / 2

/** 公園の池（街の計画の、1 本目の帯の公園の池） */
const plan = cityPlan(0)
const lakeY = (plan.zones.find((z) => z.kind === 'park')!.t0 + plan.zones.find((z) => z.kind === 'park')!.t1) / 2
export const POND = plan.lakes.reduce((best, l) => (Math.abs(l.y - lakeY * (HALF_L * 2)) < Math.abs(best.y - lakeY * (HALF_L * 2)) ? l : best))

/** 地面の絵を細かく描く範囲（m）。外側の 90 m で、もとの大地の絵へ溶かす */
export const PATCH = { s0: -140, s1: 1040, y0: 10900, y1: 12260 }
export const FADE = 90
/**
 * 歩ける範囲（まわりの生け垣と、池に浮かべたブイの内側）。
 * もとは 1 km 四方ほどあって広すぎたので、池の西側の 400×490 m ほどを公園にして、その西と南を住宅街にした。
 * 西の端は大通りの歩道まで
 */
export const BOUNDS = { s0: AVENUE - 0.7, s1: 722, y0: 11000, y1: 11760 }

/** 帯の上の (s, y) と地面からの高さ h（m）を、場面の座標へ */
export function landPoint(s: number, y: number, h: number, out = new THREE.Vector3()) {
  const a = s / G
  const r = G - h
  return out.set(Math.sin(a) * r, -HALF_L + y, Math.cos(a) * r)
}

/** 場所 s での向き：x = 東（s が増える向き）、y = 上（軸の向き）、z = 北（y が増える向き） */
export function frameAt(s: number, out = new THREE.Quaternion()) {
  const a = s / G
  basis.makeBasis(east.set(Math.cos(a), 0, -Math.sin(a)), up.set(-Math.sin(a), 0, -Math.cos(a)), north.set(0, 1, 0))
  return out.setFromRotationMatrix(basis)
}
export const upAt = (s: number, out = new THREE.Vector3()) => out.set(-Math.sin(s / G), 0, -Math.cos(s / G))
const basis = new THREE.Matrix4()
const east = new THREE.Vector3()
const up = new THREE.Vector3()
const north = new THREE.Vector3()

/* ---------- 公園の作り ---------- */

export type Pt = { s: number; y: number }
export type Bench = { s: number; y: number; /** 座った人の向き（前 = -z を、北から右回りでなく、frameAt の y 軸まわりの角度で） */ yaw: number; taken: boolean }
export type Lamp = Pt
export type Obstacle = { s: number; y: number; r: number }

/** 池のまわりの散歩道（楕円） */
export const LOOP = { s: POND.s, y: POND.y, rs: POND.rs + 32, ry: POND.ry + 32 }
/** 大通りから池へ向かう東西の道の y と、南北の道の s */
export const EW_Y = 11520
export const NS_S = 250
/** 広場（道の交わる所、噴水） */
export const PLAZA = { s: NS_S, y: EW_Y, r: 17 }
/** 遊び場（砂場と遊具） */
export const PLAY = { s: 420, y: 11380, r: 22 }
export const PATH_W = 4.5

/** 散歩道の上の点（角度 t。0 で東、反時計回り = y が増える向き） */
export const loopPoint = (t: number) => ({ s: LOOP.s + Math.cos(t) * LOOP.rs, y: LOOP.y + Math.sin(t) * LOOP.ry })

/** 公園の中か（歩ける範囲の中で、住宅街でない所） */
const inBounds = (p: Pt, pad = 0) => p.s > BOUNDS.s0 + pad && p.s < BOUNDS.s1 - pad && p.y > BOUNDS.y0 + pad && p.y < BOUNDS.y1 - pad && !inTown(p.s, p.y, pad)

/** 池の中か（1 より小さければ中）。岸の砂の帯を含めない */
export const pondValue = (s: number, y: number, grow = 0) => ((s - POND.s) / (POND.rs + grow)) ** 2 + ((y - POND.y) / (POND.ry + grow)) ** 2

/** 散歩道の東西の道が、散歩道とぶつかる s */
export const EW_END = LOOP.s - LOOP.rs * Math.sqrt(Math.max(0, 1 - ((EW_Y - LOOP.y) / LOOP.ry) ** 2))

/** 道からの距離（m）。散歩道は楕円なので近似 */
export function pathDistance(s: number, y: number) {
  let d = Infinity
  // 東西の道（大通りの歩道から散歩道まで）
  if (s > AVENUE && s < EW_END + 2) d = Math.min(d, Math.abs(y - EW_Y))
  // 南北の道
  d = Math.min(d, Math.abs(s - NS_S))
  // 散歩道
  const k = Math.sqrt(((s - LOOP.s) / LOOP.rs) ** 2 + ((y - LOOP.y) / LOOP.ry) ** 2)
  d = Math.min(d, Math.abs(k - 1) * Math.min(LOOP.rs, LOOP.ry) * (0.6 + 0.4 * Math.abs((s - LOOP.s) / Math.max(1, Math.hypot(s - LOOP.s, y - LOOP.y)))))
  // 大通りの歩道
  d = Math.min(d, Math.abs(Math.abs(s) - (AVENUE + 3)))
  return d
}

export type Park = {
  benches: Bench[]
  lamps: Lamp[]
  /** 近くで幹のある形に描く木（街の計画の木＋公園に足した木） */
  trees: Tree[]
  obstacles: Obstacle[]
  town: Town
}

let park: Park | null = null

export function parkLayout(): Park {
  if (park) return park
  const rand = seeded(2207)
  const benches: Bench[] = []
  const lamps: Lamp[] = []
  const obstacles: Obstacle[] = []
  // 散歩道：ベンチ（池を向く）と街灯
  const n = 120
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    const p = loopPoint(t)
    // 楕円の外向きの法線
    const nx = Math.cos(t) / LOOP.rs
    const ny = Math.sin(t) / LOOP.ry
    const l = Math.hypot(nx, ny)
    const ox = nx / l
    const oy = ny / l
    if (i % 3 === 0) {
      const b = { s: p.s + ox * (PATH_W / 2 + 1.4), y: p.y + oy * (PATH_W / 2 + 1.4) }
      // 池（内向き）を向く：前 (-sinψ, -cosψ) = (-ox, -oy)
      if (inBounds(b, 6)) benches.push({ ...b, yaw: Math.atan2(ox, oy), taken: false })
    } else if (i % 3 === 1 && i % 2 === 0) {
      const q = { s: p.s - ox * (PATH_W / 2 + 0.8), y: p.y - oy * (PATH_W / 2 + 0.8) }
      if (inBounds(q, 4)) lamps.push(q)
    }
  }
  // 東西の道と南北の道：両側に街灯、ときどきベンチ
  const onStreet = (s: number, y: number, m = 1) => STREETS.some((st) => inside({ s, y }, streetRect(st), m))
  for (let s = AVENUE + 30; s < EW_END - 10; s += 26) {
    if (onStreet(s, EW_Y)) continue
    lamps.push({ s, y: EW_Y + (Math.round(s / 26) % 2 ? 1 : -1) * (PATH_W / 2 + 0.8) })
    if (Math.abs(s - NS_S) > PLAZA.r + 8 && Math.round(s / 26) % 3 === 0) benches.push({ s, y: EW_Y + PATH_W / 2 + 1.4, yaw: 0, taken: false })
  }
  // 南北の道は、住宅街との境の道から北の端まで
  for (let y = 11278; y < BOUNDS.y1 - 4; y += 26) {
    if (Math.abs(y - EW_Y) < PLAZA.r + 4) continue
    lamps.push({ s: NS_S + (Math.round(y / 26) % 2 ? 1 : -1) * (PATH_W / 2 + 0.8), y })
    if (Math.round(y / 26) % 3 === 0) benches.push({ s: NS_S - PATH_W / 2 - 1.4, y, yaw: -Math.PI / 2, taken: false })
  }
  // 広場のまわりのベンチ（噴水を向く）
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const ox = Math.cos(a)
    const oy = Math.sin(a)
    benches.push({ s: PLAZA.s + ox * (PLAZA.r - 1.5), y: PLAZA.y + oy * (PLAZA.r - 1.5), yaw: Math.atan2(ox, oy), taken: false })
  }
  // 遊び場のまわり（見守りのベンチ）
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4
    const ox = Math.cos(a)
    const oy = Math.sin(a)
    benches.push({ s: PLAY.s + ox * (PLAY.r + 3), y: PLAY.y + oy * (PLAY.r + 3), yaw: Math.atan2(ox, oy), taken: false })
  }
  for (const b of benches) obstacles.push({ s: b.s, y: b.y, r: 0.9 })
  for (const l of lamps) obstacles.push({ s: l.s, y: l.y, r: 0.25 })
  obstacles.push({ s: PLAZA.s, y: PLAZA.y, r: 5.2 })

  // 木：街の計画で決まっている木（範囲の中）と、公園の木立を足したもの
  const free = (s: number, y: number, r: number) =>
    pathDistance(s, y) > PATH_W / 2 + r &&
    pondValue(s, y, 14 + r) > 1 &&
    Math.hypot(s - PLAZA.s, y - PLAZA.y) > PLAZA.r + r + 2 &&
    Math.hypot(s - PLAY.s, y - PLAY.y) > PLAY.r + r + 4 &&
    Math.abs(s) > AVENUE - 10 &&
    !inTown(s, y, r + 2) &&
    !inJungle(s, y, r + 4)
  const trees: Tree[] = []
  for (const t of plan.trees) if (inBoundsTree(t) && !inJungle(t.s, t.y, 4) && (Math.abs(t.s) > AVENUE - 10 ? free(t.s, t.y, 2) : !inTown(t.s, t.y, 2))) trees.push(t)
  const colors = [0x3f6a36, 0x4a7a3c, 0x365d30, 0x55803f, 0x2f5530, 0x5b7f34, 0x6a8a3a]
  // 木立のかたまり：公園の中に多め（芝生が広く空きすぎないように）と、生け垣の外の見える所
  const PARK_RECT = { s0: 201, s1: BOUNDS.s1, y0: 11267, y1: BOUNDS.y1 }
  for (let c = 0; c < 90; c++) {
    const r = c < 62 ? PARK_RECT : { s0: PATCH.s0 + 40, s1: PATCH.s1 - 40, y0: PATCH.y0 + 40, y1: PATCH.y1 - 40 }
    const cs = r.s0 + rand() * (r.s1 - r.s0)
    const cy = r.y0 + rand() * (r.y1 - r.y0)
    const k = 3 + Math.floor(rand() * 7)
    for (let j = 0; j < k; j++) {
      const s = cs + (rand() - 0.5) * 40
      const y = cy + (rand() - 0.5) * 40
      if (!free(s, y, 3) || !inBoundsTree({ s, y })) continue
      trees.push({ s, y, h: 8 + rand() * 10, color: colors[Math.floor(rand() * colors.length)] })
    }
  }
  // 道沿いの並木
  for (let s = AVENUE + 40; s < EW_END - 20; s += 18)
    for (const side of [-1, 1]) {
      const t = { s: s + 9, y: EW_Y + side * 9, h: 9 + rand() * 4, color: colors[1] }
      // 広場の石畳と南北の道の上には植えない
      if (Math.hypot(t.s - PLAZA.s, t.y - PLAZA.y) < PLAZA.r + 3 || Math.abs(t.s - NS_S) < PATH_W / 2 + 2 || onStreet(t.s, t.y, 2)) continue
      trees.push(t)
    }
  // 住宅街の庭木と街灯
  const town = townLayout()
  trees.push(...town.trees)
  for (const l of town.lamps) {
    lamps.push(l)
    obstacles.push({ s: l.s, y: l.y, r: 0.25 })
  }
  for (const t of trees) obstacles.push({ s: t.s, y: t.y, r: 0.35 + t.h * 0.015 })
  // ジャングルの太い幹・キノコの柄など
  obstacles.push(...jungleLayout().obstacles)
  park = { benches, lamps, trees, obstacles, town }
  return park
}

/** 近くで描く木か（範囲の中の木は、遠くの木の配置から外して、幹のある形で描く） */
export function inBoundsTree(t: { s: number; y: number }) {
  return t.s > PATCH.s0 + 30 && t.s < PATCH.s1 - 30 && t.y > PATCH.y0 + 30 && t.y < PATCH.y1 - 30
}

/* ---------- 住宅街（お試し） ---------- */

export type Rect = { s0: number; s1: number; y0: number; y1: number }

/** 住宅街の区画：公園の西（大通りとの間）の帯と、南の帯 */
export const TOWN: Rect[] = [
  { s0: BOUNDS.s0, s1: 201, y0: BOUNDS.y0, y1: BOUNDS.y1 },
  { s0: 201, s1: 640, y0: BOUNDS.y0, y1: 11267 },
]
export function inTown(s: number, y: number, pad = 0) {
  for (const r of TOWN) if (s > r.s0 - pad && s < r.s1 + pad && y > r.y0 - pad && y < r.y1 + pad) return true
  return false
}

/** 住宅街の道。ax = 'y' は軸の向き（y）に s = c を通る道、ax = 's' は円周の向きに y = c を通る道 */
export type Street = { ax: 's' | 'y'; c: number; a0: number; a1: number }
/** 車道の幅と、両側の歩道の幅 m */
export const STREET_W = 6
export const WALK_W = 2
const HALF = STREET_W / 2 + WALK_W
export const STREETS: Street[] = [
  // 西の帯：南北の道 2 本（東の 1 本は公園との境）と、東西の道 2 本
  { ax: 'y', c: 122, a0: BOUNDS.y0, a1: BOUNDS.y1 },
  { ax: 'y', c: 196, a0: BOUNDS.y0, a1: BOUNDS.y1 },
  { ax: 's', c: 11400, a0: AVENUE + 6, a1: 196 },
  { ax: 's', c: 11645, a0: AVENUE + 6, a1: 196 },
  // 南の帯：東西の道 4 本（北の 1 本は公園との境）と、南北の道 2 本
  { ax: 's', c: 11262, a0: AVENUE + 6, a1: 640 },
  { ax: 's', c: 11196, a0: 196, a1: 640 },
  { ax: 's', c: 11130, a0: AVENUE + 6, a1: 640 },
  { ax: 's', c: 11064, a0: 196, a1: 640 },
  { ax: 'y', c: NS_S, a0: BOUNDS.y0, a1: 11262 },
  { ax: 'y', c: 440, a0: BOUNDS.y0, a1: 11262 },
]
/** 道（車道＋歩道）の範囲 */
export function streetRect(st: Street, half = HALF): Rect {
  return st.ax === 'y' ? { s0: st.c - half, s1: st.c + half, y0: st.a0, y1: st.a1 } : { s0: st.a0, s1: st.a1, y0: st.c - half, y1: st.c + half }
}
const overlap = (a: Rect, b: Rect, m = 0) => a.s0 < b.s1 + m && a.s1 > b.s0 - m && a.y0 < b.y1 + m && a.y1 > b.y0 - m
const inside = (p: Pt, r: Rect, m = 0) => p.s > r.s0 - m && p.s < r.s1 + m && p.y > r.y0 - m && p.y < r.y1 + m

/** 家：(s, y) は建物の底のまん中、yaw は玄関の向き（前 = -z）。w は間口、d は奥行き、h は壁の高さ */
export type House = { s: number; y: number; yaw: number; w: number; d: number; h: number; flat: boolean; wall: number; roof: number; /** 玄関の位置（間口の向きの、まん中からの m） */ door: number; seed: number }
/** 塀・生け垣：(s, y) は底のまん中、長さは yaw の x の向き */
export type Wall = { s: number; y: number; yaw: number; len: number; h: number; t: number; hedge: boolean; color: number }
export type Town = {
  houses: House[]
  walls: Wall[]
  /** 門から玄関までの敷石 */
  walks: Rect[]
  /** ぶつかる箱（家・塀・生け垣） */
  boxes: Rect[]
  /** 門の前の歩道（立ち話の場所）。yaw は道を向く向き */
  gates: (Pt & { yaw: number; ax: 's' | 'y' })[]
  trees: Tree[]
  lamps: Lamp[]
  /** 池に浮かべた、歩ける範囲の端のしるし */
  buoys: Pt[]
}

const HOUSE_COLORS = [0xeee8dc, 0xe6dcc8, 0xd9d4cc, 0xf2efe8, 0xc9b49a, 0xa9b8c0, 0xd8c3a8, 0x8f9aa0, 0xe8d9bf, 0xb8a58e, 0xf0e6d6, 0x9aa38f]
const ROOF_COLORS = [0x3a3f46, 0x4b4f55, 0x7a4a36, 0x5a3a2e, 0x3f4a5a, 0x5d6b5a, 0x2f3338, 0x6b5b4e]
const WALL_COLORS = [0xc9c4b8, 0xd8d2c4, 0xb9b4aa, 0xe2ddd2, 0xa8a196]
const HEDGE = 0x8fb86a
const GARDEN_TREES = [0x4a7a3c, 0x55803f, 0x3f6a36, 0x6a8a3a, 0x5b7f34]

let town: Town | null = null

export function townLayout(): Town {
  if (town) return town
  const rand = seeded(7319)
  const t: Town = { houses: [], walls: [], walks: [], boxes: [], gates: [], trees: [], lamps: [], buoys: [] }
  // 家を建てない所：道、公園から大通りへの東西の小道（並木の幅まで）
  const keepOut: Rect[] = STREETS.map((st) => streetRect(st))
  keepOut.push({ s0: AVENUE, s1: 202, y0: EW_Y - 12, y1: EW_Y + 12 })
  const lots: Rect[] = []
  const wallBox = (w: Wall) => {
    const along = Math.abs(Math.sin(w.yaw)) > 0.5 // 長さが y の向き
    const hl = w.len / 2
    const ht = w.t / 2
    t.boxes.push(along ? { s0: w.s - ht, s1: w.s + ht, y0: w.y - hl, y1: w.y + hl } : { s0: w.s - hl, s1: w.s + hl, y0: w.y - ht, y1: w.y + ht })
  }
  const addWall = (w: Wall) => {
    t.walls.push(w)
    wallBox(w)
  }
  // 区画は、道（と大通り）に面して並べる
  const fronts = [{ ax: 'y' as const, c: AVENUE, half: 6, a0: BOUNDS.y0, a1: BOUNDS.y1, sides: [1] }, ...STREETS.map((st) => ({ ...st, half: HALF, sides: [-1, 1] }))]
  for (const f of fronts)
    for (const side of f.sides) {
      let a = f.a0 + 1
      let prevEnd = -1e9
      while (a < f.a1 - 10) {
        const len = 13 + rand() * 5
        const dep = 24 + rand() * 4
        const fc = f.c + side * f.half
        const bc = fc + side * dep
        const r: Rect = f.ax === 'y' ? { s0: Math.min(fc, bc), s1: Math.max(fc, bc), y0: a, y1: a + len } : { s0: a, s1: a + len, y0: Math.min(fc, bc), y1: Math.max(fc, bc) }
        const inTownRect = TOWN.some((z) => r.s0 >= z.s0 - 0.01 && r.s1 <= z.s1 + 0.01 && r.y0 >= z.y0 - 0.01 && r.y1 <= z.y1 + 0.01)
        // 面している道に触れるのはよいので、少し内側で調べる
        const rIn: Rect = { s0: r.s0 + 0.4, s1: r.s1 - 0.4, y0: r.y0 + 0.4, y1: r.y1 - 0.4 }
        if (!inTownRect || keepOut.some((k) => overlap(k, rIn)) || lots.some((l) => overlap(l, rIn))) {
          a += 3
          continue
        }
        lots.push(r)
        buildLot(f.ax, side, a, len, fc, dep, Math.abs(a - prevEnd) < 0.01)
        prevEnd = a + len
        a += len
      }
    }

  /** 1 区画：家、前の塀か生け垣（門のすき間）、横の仕切り、敷石、庭木 */
  function buildLot(ax: 's' | 'y', side: number, a: number, len: number, fc: number, dep: number, joined: boolean) {
    // (間口の向きの位置, 奥の向きの位置) → (s, y)
    const P = (al: number, ac: number): Pt => (ax === 'y' ? { s: ac, y: al } : { s: al, y: ac })
    const yaw = ax === 'y' ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? 0 : Math.PI
    // 家の x の向きが、間口の向きの + か -（家の中の位置 u = (間口の位置 - まん中) × sx）
    const sx = ax === 'y' ? -Math.sin(yaw) : Math.cos(yaw)
    // 塀の長さを間口の向きにする yaw
    const wallYaw = ax === 'y' ? Math.PI / 2 : 0
    const sideYaw = ax === 'y' ? 0 : Math.PI / 2
    const w = len - 3 - rand() * 1.5
    const setback = 3.5 + rand() * 2.5
    const d = Math.min(8.5 + rand() * 3.5, dep - setback - 4)
    const cA = a + len / 2 + (rand() - 0.5) * Math.max(0, len - w - 2)
    const cX = fc + side * (setback + d / 2)
    const two = rand() < 0.72
    const doorA = cA + (rand() - 0.5) * (w - 2.8)
    const c = P(cA, cX)
    t.houses.push({ s: c.s, y: c.y, yaw, w, d, h: two ? 5.9 : 3.1, flat: rand() < 0.28, wall: HOUSE_COLORS[Math.floor(rand() * HOUSE_COLORS.length)], roof: ROOF_COLORS[Math.floor(rand() * ROOF_COLORS.length)], door: (doorA - cA) * sx, seed: rand() })
    const hb0 = P(cA - w / 2, fc + side * setback)
    const hb1 = P(cA + w / 2, fc + side * (setback + d))
    t.boxes.push({ s0: Math.min(hb0.s, hb1.s), s1: Math.max(hb0.s, hb1.s), y0: Math.min(hb0.y, hb1.y), y1: Math.max(hb0.y, hb1.y) })
    // 前の塀（ブロック塀）か生け垣。門のところは 2.2 m あける
    const hedge = rand() < 0.45
    const th = hedge ? 0.6 : 0.15
    const wh = hedge ? 1.15 : 1.05
    const color = hedge ? HEDGE : WALL_COLORS[Math.floor(rand() * WALL_COLORS.length)]
    const frontX = fc + side * (th / 2 + 0.05)
    const g0 = doorA - 1.1
    const g1 = doorA + 1.1
    for (const [p0, p1] of [
      [a + 0.2, g0],
      [g1, a + len - 0.2],
    ]) {
      if (p1 - p0 < 0.4) continue
      const m = P((p0 + p1) / 2, frontX)
      addWall({ s: m.s, y: m.y, yaw: wallYaw, len: p1 - p0, h: wh, t: th, hedge, color })
    }
    // 横の仕切り（となりの区画とくっついていれば、その間に 1 本だけ）
    const sideLen = dep - 0.9
    const sideX = fc + side * (0.6 + sideLen / 2)
    const sides = joined ? [a + len - 0.2] : [a + 0.2, a + len - 0.2]
    for (const al of sides) {
      const m = P(al, sideX)
      addWall({ s: m.s, y: m.y, yaw: sideYaw, len: sideLen, h: hedge ? 1.3 : 1.2, t: hedge ? 0.55 : 0.12, hedge, color })
    }
    // 敷石
    const w0 = P(doorA - 0.7, fc)
    const w1 = P(doorA + 0.7, fc + side * setback)
    t.walks.push({ s0: Math.min(w0.s, w1.s), s1: Math.max(w0.s, w1.s), y0: Math.min(w0.y, w1.y), y1: Math.max(w0.y, w1.y) })
    // 門の前（歩道の上）
    const gp = P(doorA, fc - side * 0.6)
    t.gates.push({ ...gp, yaw: yaw + Math.PI, ax })
    // 庭木：裏庭に 1〜2 本、ときどき前庭の角にも
    const back0 = setback + d + 1.8
    const back1 = dep - 1.6
    const nBack = back1 - back0 > 1 && rand() < 0.55 ? 1 : 0
    for (let i = 0; i < nBack; i++) {
      const p = P(a + 2 + rand() * (len - 4), fc + side * (back0 + rand() * (back1 - back0)))
      t.trees.push({ ...p, h: 4.5 + rand() * 3, color: GARDEN_TREES[Math.floor(rand() * GARDEN_TREES.length)] })
    }
    if (rand() < 0.22 && setback > 4.2) {
      // 門から遠い方の角
      const al = doorA - a > len / 2 ? a + 1.8 : a + len - 1.8
      const p = P(al, fc + side * 1.9)
      t.trees.push({ ...p, h: 3.5 + rand() * 1.5, color: GARDEN_TREES[Math.floor(rand() * GARDEN_TREES.length)] })
    }
  }

  // 街灯：道の両側にかわりばんこに 30 m ごと（交差点の中はよける）
  const roads = STREETS.map((st) => streetRect(st, HALF + 1))
  STREETS.forEach((st, i) => {
    let k = 0
    for (let al = st.a0 + 12; al < st.a1 - 6; al += 30, k++) {
      const ac = st.c + (k % 2 ? 1 : -1) * (HALF - 0.45)
      const p: Pt = st.ax === 'y' ? { s: ac, y: al } : { s: al, y: ac }
      if (roads.some((r, j) => j !== i && inside(p, r))) continue
      t.lamps.push(p)
    }
  })

  // まわりの生け垣（ブロック塀の代わりに、低い木の列）。円周の向きは地面が曲がるので 16 m ごとに区切る。
  // 道の行き止まりのところは切れ目をあけて、公園の外（コロニーの街や畑）へ出られるようにする
  const GAP = 4
  const split = (a0: number, a1: number, gaps: number[]) => {
    const out: [number, number][] = []
    let a = a0
    for (const g of [...gaps].sort((x, y) => x - y)) {
      if (g - GAP > a && g + GAP < a1) {
        out.push([a, g - GAP])
        a = g + GAP
      }
    }
    out.push([a, a1])
    return out
  }
  const hedgeAlongS = (y: number, s0: number, s1: number, gaps: number[] = []) => {
    for (const [a0, a1] of split(s0, s1, gaps)) {
      const n = Math.max(1, Math.ceil((a1 - a0) / 16))
      const l = (a1 - a0) / n
      for (let i = 0; i < n; i++) addWall({ s: a0 + l * (i + 0.5), y, yaw: 0, len: l + 0.05, h: 1.4, t: 0.8, hedge: true, color: HEDGE })
    }
  }
  const hedgeAlongY = (s: number, y0: number, y1: number, gaps: number[] = []) => {
    for (const [a0, a1] of split(y0, y1, gaps)) addWall({ s, y: (a0 + a1) / 2, yaw: Math.PI / 2, len: a1 - a0, h: 1.4, t: 0.8, hedge: true, color: HEDGE })
  }
  // 池の岸（砂利の外）と、まわりの線が交わる所
  const shoreS = (y: number) => POND.s - (POND.rs + 6) * Math.sqrt(Math.max(0, 1 - ((y - POND.y) / (POND.ry + 6)) ** 2))
  const shoreY = (s: number) => POND.y - (POND.ry + 6) * Math.sqrt(Math.max(0, 1 - ((s - POND.s) / (POND.rs + 6)) ** 2))
  const north = BOUNDS.y1 + 0.6
  const east = BOUNDS.s1 + 0.6
  // 西は大通りへ（住宅街の東西の道と、公園の東西の道の先）、南は住宅街の南北の道の先、東と北は 1 か所ずつ
  hedgeAlongY(BOUNDS.s0 - 0.5, BOUNDS.y0 - 1, BOUNDS.y1 + 1, [11130, 11262, 11400, EW_Y, 11645])
  // 北の生け垣は、ジャングルへ続く所をあける
  hedgeAlongS(north, BOUNDS.s0 - 0.9, JUNGLE.s0 - 0.4, [122])
  hedgeAlongS(north, JUNGLE.s1 + 0.4, shoreS(north))
  hedgeAlongS(BOUNDS.y0 - 0.6, BOUNDS.s0 - 0.9, east + 0.4, [122, 196, NS_S, 440])
  hedgeAlongY(east, BOUNDS.y0 - 1, shoreY(east), [11160])
  // 池の上の端は、ブイを並べる
  for (let y = shoreY(east) + 5; y < north; y += 6) if (pondValue(east, y) < 1) t.buoys.push({ s: east, y })
  for (let s = shoreS(north) + 5; s < east; s += 6) if (pondValue(s, north) < 1) t.buoys.push({ s, y: north })

  town = t
  return town
}

/** ぶつかる箱を、16 m ごとのます目に分けておく（近くの箱だけを調べる） */
const BOX_CELL = 16
let boxGrid: Map<number, Rect[]> | null = null
const cellKey = (i: number, j: number) => i * 4096 + j
export function boxesNear(s: number, y: number): Rect[] {
  if (!boxGrid) {
    boxGrid = new Map()
    for (const b of townLayout().boxes)
      for (let i = Math.floor(b.s0 / BOX_CELL); i <= Math.floor(b.s1 / BOX_CELL); i++)
        for (let j = Math.floor(b.y0 / BOX_CELL); j <= Math.floor(b.y1 / BOX_CELL); j++) {
          const k = cellKey(i, j)
          let list = boxGrid.get(k)
          if (!list) boxGrid.set(k, (list = []))
          list.push(b)
        }
  }
  return boxGrid.get(cellKey(Math.floor(s / BOX_CELL), Math.floor(y / BOX_CELL))) ?? []
}

/** 家・塀から、半径 r の丸を押し出す（いちばん浅い向きへ） */
export function pushOutOfBoxes(p: Pt, r: number) {
  seen.clear()
  for (let i = Math.floor((p.s - r) / BOX_CELL); i <= Math.floor((p.s + r) / BOX_CELL); i++)
    for (let j = Math.floor((p.y - r) / BOX_CELL); j <= Math.floor((p.y + r) / BOX_CELL); j++) {
      boxesNear(i * BOX_CELL, j * BOX_CELL)
      for (const b of boxGrid!.get(cellKey(i, j)) ?? []) {
        if (seen.has(b)) continue
        seen.add(b)
        const cs = Math.min(b.s1, Math.max(b.s0, p.s))
        const cy = Math.min(b.y1, Math.max(b.y0, p.y))
        const ds = p.s - cs
        const dy = p.y - cy
        const d = Math.hypot(ds, dy)
        if (d >= r) continue
        if (d > 1e-6) {
          p.s = cs + (ds / d) * r
          p.y = cy + (dy / d) * r
        } else {
          // 中心が箱の中：いちばん近い辺から出す
          const opts = [p.s - b.s0, b.s1 - p.s, p.y - b.y0, b.y1 - p.y]
          const k = opts.indexOf(Math.min(...opts))
          if (k === 0) p.s = b.s0 - r
          else if (k === 1) p.s = b.s1 + r
          else if (k === 2) p.y = b.y0 - r
          else p.y = b.y1 + r
        }
      }
    }
}
const seen = new Set<Rect>()
