import * as THREE from 'three'
import { COLONY_LENGTH, COLONY_RADIUS } from '../../data/sf'
import { AVENUE, M, cityPlan, type Tree } from '../sf/colonyCity'
import { seeded } from '../sf/batch'

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
/** 歩ける範囲（植え込みの柵の内側） */
export const BOUNDS = { s0: PATCH.s0 + FADE + 10, s1: PATCH.s1 - FADE - 10, y0: PATCH.y0 + FADE + 10, y1: PATCH.y1 - FADE - 10 }

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

const inBounds = (p: Pt, pad = 0) => p.s > PATCH.s0 + FADE * 0.5 + pad && p.s < PATCH.s1 - FADE * 0.5 - pad && p.y > PATCH.y0 + FADE * 0.5 + pad && p.y < PATCH.y1 - FADE * 0.5 - pad

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
  for (let s = AVENUE + 30; s < EW_END - 10; s += 26) {
    lamps.push({ s, y: EW_Y + (Math.round(s / 26) % 2 ? 1 : -1) * (PATH_W / 2 + 0.8) })
    if (Math.abs(s - NS_S) > PLAZA.r + 8 && Math.round(s / 26) % 3 === 0) benches.push({ s, y: EW_Y + PATH_W / 2 + 1.4, yaw: 0, taken: false })
  }
  for (let y = PATCH.y0 + 60; y < PATCH.y1 - 60; y += 26) {
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
    Math.abs(s) > AVENUE - 10
  const trees: Tree[] = []
  for (const t of plan.trees) if (inBoundsTree(t) && (Math.abs(t.s) > AVENUE - 10 ? free(t.s, t.y, 2) : true)) trees.push(t)
  const colors = [0x3f6a36, 0x4a7a3c, 0x365d30, 0x55803f, 0x2f5530, 0x5b7f34, 0x6a8a3a]
  // 木立のかたまり
  for (let c = 0; c < 46; c++) {
    const cs = PATCH.s0 + 40 + rand() * (PATCH.s1 - PATCH.s0 - 80)
    const cy = PATCH.y0 + 40 + rand() * (PATCH.y1 - PATCH.y0 - 80)
    const k = 3 + Math.floor(rand() * 7)
    for (let j = 0; j < k; j++) {
      const s = cs + (rand() - 0.5) * 40
      const y = cy + (rand() - 0.5) * 40
      if (!free(s, y, 3) || !inBounds({ s, y })) continue
      trees.push({ s, y, h: 8 + rand() * 10, color: colors[Math.floor(rand() * colors.length)] })
    }
  }
  // 道沿いの並木
  for (let s = AVENUE + 40; s < EW_END - 20; s += 18)
    for (const side of [-1, 1]) {
      const t = { s: s + 9, y: EW_Y + side * 9, h: 9 + rand() * 4, color: colors[1] }
      // 広場の石畳と南北の道の上には植えない
      if (Math.hypot(t.s - PLAZA.s, t.y - PLAZA.y) < PLAZA.r + 3 || Math.abs(t.s - NS_S) < PATH_W / 2 + 2) continue
      trees.push(t)
    }
  for (const t of trees) obstacles.push({ s: t.s, y: t.y, r: 0.35 + t.h * 0.015 })
  park = { benches, lamps, trees, obstacles }
  return park
}

/** 近くで描く木か（範囲の中の木は、遠くの木の配置から外して、幹のある形で描く） */
export function inBoundsTree(t: { s: number; y: number }) {
  return t.s > PATCH.s0 + 30 && t.s < PATCH.s1 - 30 && t.y > PATCH.y0 + 30 && t.y < PATCH.y1 - 30
}
