import { COLONY_RADIUS } from '../../data/sf'
import { AVENUE, M, RIVER_W, cityPlan, meters, type Building, type Tree, type ZoneKind } from '../sf/colonyCity'
import { G, POND, inBoundsTree } from './park'

// コロニーの円筒ぜんぶを歩くための、場所の決まり（歩く場面の座標 → 3 本の大地の帯・窓の帯・橋）。
// 歩く場面の s は円周の向きの長さ（m）で、角度 s / G。帯 k（0〜2）の中心は 120°×k、帯の幅は 60°、
// そのあいだの 60° は窓（ガラス）の帯。窓の帯は、ところどころに架けた橋の上だけ歩いて渡れる。
// 街の計画（colonyCity.ts の cityPlan）は帯ごとに「帯の中心からの横の位置 ps（m、半径 RP で測る）」で書いてあるので、
// ここで歩く場面の s と行き来する。

const DEG = Math.PI / 180
const TAU = Math.PI * 2
/** 街の計画の半径（m）。宇宙の場面の大地の板の半径 */
export const RP = COLONY_RADIUS / M
/** 歩く地面の円周 m（約 25 km） */
export const CIRC = TAU * G
/** 帯の半分の幅（角度） */
const STRIP_HALF = 30 * DEG
/** 帯の半分の幅（計画の m） */
export const STRIP_HALF_PS = meters.width / 2
export const STRIP_LEN = meters.length
/** 港側・太陽側の端の壁の手前で止める（m） */
export const Y_MIN = 80
export const Y_MAX = STRIP_LEN - 80

export const wrapA = (a: number) => a - TAU * Math.round(a / TAU)
/** s を -CIRC/2〜CIRC/2 へ（同じ場所のまま） */
export const wrapS = (s: number) => wrapA(s / G) * G
export const stripCenterA = (k: number) => k * 120 * DEG

export type Where = { k: number; ps: number }
const where: Where = { k: 0, ps: 0 }
/** その s が、どの大地の帯の、計画の横の位置いくつか（窓の帯なら null） */
export function stripAt(s: number, out = where): Where | null {
  const a = wrapA(s / G)
  for (let k = 0; k < 3; k++) {
    const d = wrapA(a - stripCenterA(k))
    if (Math.abs(d) <= STRIP_HALF) {
      out.k = k
      out.ps = d * RP
      return out
    }
  }
  return null
}

/** 帯 k の計画の横の位置 ps を、歩く場面の s へ（near に近い周回で） */
export function walkS(k: number, ps: number, near = 0) {
  const s = (stripCenterA(k) + ps / RP) * G
  return s + CIRC * Math.round((near - s) / CIRC)
}

/** 帯 k の、計画の位置 y の区画の種類 */
export function zoneAt(k: number, y: number): ZoneKind {
  const t = y / STRIP_LEN
  for (const z of cityPlan(k).zones) if (t >= z.t0 && t < z.t1) return z.kind
  return 'hill'
}

/* ---------- 橋 ---------- */

/** 窓の帯にかけた橋の y（m）。2 本目は公園の東西の道（y = 11520）の続き */
export const BRIDGE_Y = [2600, 11520, 19600, 27400]
/** 橋の幅の半分（歩ける幅の半分はこれより少し狭い） */
export const BRIDGE_HALF = 5
const BRIDGE_WALK = BRIDGE_HALF - 0.8

/** 川を渡る歩道橋の y（帯ごと同じ） */
export const FOOTBRIDGE_Y = Array.from({ length: 53 }, (_, i) => 400 + i * 600)
export const FOOTBRIDGE_HALF = 2.2
/** 歩道橋の長さの半分（川の中心から。計画の m） */
export const FOOTBRIDGE_REACH = RIVER_W / 2 + 14

function nearestOf(list: number[], y: number) {
  let best = list[0]
  for (const v of list) if (Math.abs(v - y) < Math.abs(best - y)) best = v
  return best
}

/* ---------- 水（川と湖） ---------- */

/** 計画の (ps, y) が水の上か（池のほとりの公園の池は park.ts が見るので、ここでは数えない）。grow で岸を広げる */
export function waterAt(k: number, ps: number, y: number, grow = 0) {
  const plan = cityPlan(k)
  const rv = plan.river(y)
  if (Math.abs(ps - rv) < RIVER_W / 2 - 3 + grow) {
    const fb = nearestOf(FOOTBRIDGE_Y, y)
    if (!(Math.abs(y - fb) < FOOTBRIDGE_HALF - 0.4 && Math.abs(ps - plan.river(fb)) < FOOTBRIDGE_REACH)) return true
  }
  for (const l of plan.lakes) {
    if (k === 0 && l === POND) continue
    if (((ps - l.s) / (l.rs + grow)) ** 2 + ((y - l.y) / (l.ry + grow)) ** 2 < 1) return true
  }
  return false
}

/* ---------- 建物と木の、場所ごとの索引 ---------- */

const CELL = 100
type Index = { buildings: Map<number, Building[]>; trees: Map<number, Tree[]> }
const indexes: (Index | undefined)[] = []
const key = (i: number, j: number) => (i + 64) * 1024 + j

/** 帯 k の建物と木を、100 m のます目に分けたもの（池のほとりの公園の中の木は park.ts が描くので入れない） */
export function stripIndex(k: number): Index {
  const got = indexes[k]
  if (got) return got
  const plan = cityPlan(k)
  const idx: Index = { buildings: new Map(), trees: new Map() }
  const put = <T>(m: Map<number, T[]>, ps: number, y: number, item: T) => {
    const kk = key(Math.floor(ps / CELL), Math.floor(y / CELL))
    let l = m.get(kk)
    if (!l) m.set(kk, (l = []))
    l.push(item)
  }
  for (const b of plan.buildings) put(idx.buildings, b.s, b.y, b)
  for (const t of plan.trees) {
    if (k === 0 && inBoundsTree(t)) continue
    // 大通り（鉄道の高架の下）には木を描かない
    if (Math.abs(t.s) < AVENUE - 8) continue
    put(idx.trees, t.s, t.y, t)
  }
  indexes[k] = idx
  return idx
}

/** 計画の範囲（ps0〜ps1, y0〜y1）の中に中心がある建物・木 */
export function itemsIn(k: number, kind: 'buildings', ps0: number, ps1: number, y0: number, y1: number, out: Building[]): Building[]
export function itemsIn(k: number, kind: 'trees', ps0: number, ps1: number, y0: number, y1: number, out: Tree[]): Tree[]
export function itemsIn(k: number, kind: 'buildings' | 'trees', ps0: number, ps1: number, y0: number, y1: number, out: (Building | Tree)[]) {
  const m = stripIndex(k)[kind] as Map<number, (Building | Tree)[]>
  for (let i = Math.floor(ps0 / CELL); i <= Math.floor(ps1 / CELL); i++)
    for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++)
      for (const it of m.get(key(i, j)) ?? []) if (it.s >= ps0 && it.s < ps1 && it.y >= y0 && it.y < y1) out.push(it)
  return out
}

/** その場所のまわり r m の中で、いちばん高い建物の高さ（m）。窓の帯の上は 0。空を飛ぶスクーターが、ビルの上を越えるのに使う */
export function roofAt(s: number, y: number, r: number) {
  const w = stripAt(s)
  if (!w) return 0
  const ps = w.ps
  let top = 0
  roofs.length = 0
  itemsIn(w.k, 'buildings', ps - r - 140, ps + r + 140, y - r - 140, y + r + 140, roofs)
  for (const b of roofs) {
    if (b.h <= top) continue
    const ds = Math.max(0, Math.abs(ps - b.s) - b.w / 2)
    const dy = Math.max(0, Math.abs(y - b.y) - b.d / 2)
    if (ds * ds + dy * dy < r * r) top = b.h
  }
  return top
}
const roofs: Building[] = []

/* ---------- 歩く人を押し出す・止める ---------- */

const near: (Building | Tree)[] = []
const treeR = (t: Tree) => 0.35 + t.h * 0.015

/**
 * 街の計画の建物・木・川・湖から押し出し、端の壁と窓の帯（橋の外）で止める。
 * fly：空を飛んでいる高さ（m）。その高さより低い建物と木は無視し、窓の帯も越えられる
 */
export function pushWorld(p: { s: number; y: number }, r: number, o: { water?: boolean; fly?: number } = {}) {
  p.y = Math.min(Y_MAX, Math.max(Y_MIN, p.y))
  const fly = o.fly ?? 0
  const w = stripAt(p.s)
  if (!w) {
    if (fly > 0) return
    // 窓の帯：橋の上だけ
    const yb = nearestOf(BRIDGE_Y, p.y)
    const dy = Math.abs(p.y - yb) - BRIDGE_WALK
    if (dy <= 0) return
    // 大地のふちへ戻すのと、橋の上へ戻すのとで、近いほう
    const a = wrapA(p.s / G)
    const band = Math.floor((a - 30 * DEG + TAU) / (120 * DEG)) % 3
    const a0 = wrapA(30 * DEG + band * 120 * DEG)
    const a1 = wrapA(a0 + 60 * DEG)
    const d0 = wrapA(a - a0) * G
    const d1 = wrapA(a1 - a) * G
    const ds = Math.min(d0, d1)
    if (ds < dy) p.s += d0 < d1 ? -d0 - 0.01 : d1 + 0.01
    else p.y = yb + Math.sign(p.y - yb) * BRIDGE_WALK
    return
  }
  const k = w.k
  let ps = w.ps
  let y = p.y
  const scale = G / RP
  // 建物（計画の箱）
  near.length = 0
  itemsIn(k, 'buildings', ps - 120, ps + 120, y - 120, y + 120, near as Building[])
  for (const b of near as Building[]) {
    if (fly > 0 && b.h < fly - 1) continue
    const s0 = b.s - b.w / 2
    const s1 = b.s + b.w / 2
    const y0 = b.y - b.d / 2
    const y1 = b.y + b.d / 2
    const cs = Math.min(s1, Math.max(s0, ps))
    const cy = Math.min(y1, Math.max(y0, y))
    const ds = ps - cs
    const dy = y - cy
    const d = Math.hypot(ds, dy)
    if (d >= r) continue
    if (d > 1e-6) {
      ps = cs + (ds / d) * r
      y = cy + (dy / d) * r
    } else {
      const opts = [ps - s0, s1 - ps, y - y0, y1 - y]
      const i = opts.indexOf(Math.min(...opts))
      if (i === 0) ps = s0 - r
      else if (i === 1) ps = s1 + r
      else if (i === 2) y = y0 - r
      else y = y1 + r
    }
  }
  // 木の幹
  if (fly <= 0) {
    near.length = 0
    itemsIn(k, 'trees', ps - 8, ps + 8, y - 8, y + 8, near as Tree[])
    for (const t of near as Tree[]) {
      const min = treeR(t) + r
      const ds = ps - t.s
      const dy = y - t.y
      const d = Math.hypot(ds, dy)
      if (d < min && d > 1e-6) {
        ps = t.s + (ds / d) * min
        y = t.y + (dy / d) * min
      }
    }
  }
  // 川と湖（スクーターと、空を飛んでいるときは渡れる）
  if (o.water !== false && fly <= 0 && waterAt(k, ps, y, r)) {
    const plan = cityPlan(k)
    const rv = plan.river(y)
    const fb = nearestOf(FOOTBRIDGE_Y, y)
    const onDeck = Math.abs(ps - plan.river(fb)) < FOOTBRIDGE_REACH && Math.abs(y - fb) < FOOTBRIDGE_HALF + r + 1
    // 歩道橋から横へ出かけたら、橋の上へ戻す（岸まで飛ばさない）
    if (onDeck) y = fb + Math.sign(y - fb || 1) * (FOOTBRIDGE_HALF - 0.45)
    else if (Math.abs(ps - rv) < RIVER_W / 2 - 3 + r) ps = rv + Math.sign(ps - rv || 1) * (RIVER_W / 2 - 3 + r + 0.01)
    for (const l of plan.lakes) {
      if (k === 0 && l === POND) continue
      const v = ((ps - l.s) / (l.rs + r)) ** 2 + ((y - l.y) / (l.ry + r)) ** 2
      if (v < 1) {
        const f = 1 / Math.sqrt(v) + 1e-4
        ps = l.s + (ps - l.s) * f
        y = l.y + (y - l.y) * f
      }
    }
  }
  p.s += (ps - w.ps) * scale
  p.y = y
}

/** 今いる所の名前の種類（左上に出す） */
export type WorldArea = ZoneKind | 'bridge'
export function worldArea(s: number, y: number): { area: WorldArea; k: number } {
  const w = stripAt(s)
  if (!w) return { area: 'bridge', k: -1 }
  return { area: zoneAt(w.k, y), k: w.k }
}

/** 降りて立てる所か（大地の帯の上か、窓の帯なら橋の上） */
export function standable(s: number, y: number) {
  if (stripAt(s)) return true
  return Math.abs(y - nearestOf(BRIDGE_Y, y)) <= BRIDGE_WALK
}

/** 川や湖の水の上か（公園の池は数えない） */
export function wetAt(s: number, y: number) {
  const w = stripAt(s)
  return !!w && waterAt(w.k, w.ps, y)
}

const inside: Building[] = []
/** 計画の建物の中か（h は地面からの高さ m）。カメラが建物の壁の中へ入らないように使う */
export function inBuilding(s: number, y: number, h: number) {
  const w = stripAt(s)
  if (!w) return false
  inside.length = 0
  itemsIn(w.k, 'buildings', w.ps - 110, w.ps + 110, y - 110, y + 110, inside)
  for (const b of inside) if (h < b.h + 0.5 && Math.abs(w.ps - b.s) < b.w / 2 + 0.3 && Math.abs(y - b.y) < b.d / 2 + 0.3) return true
  return false
}
