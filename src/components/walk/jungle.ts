import { seeded } from '../sf/batch'
import { currentLevel, lowMemory } from '../../state/quality'
import { isTouchDevice } from '../../state/input'
import { FOREST_ON, forestLayout, type Forest } from './forestLayout'

// 公園の北の生け垣の外の、お試しのジャングル（コロニーの生き物の研究所が育てている森、という見立て）。
// 植物はみな読み込みなしでその場で作る形（WalkJungle.tsx）。ここは置き場所だけを決める。
// park.ts から使うので、ここでは park.ts の値を一番外（読み込みのとき）では使わない（関数の中だけ）。

/** ジャングルの範囲（m）。南の辺が公園の北の端。南北の小道（s = 250）がそのまま入口 */
export const JUNGLE = { s0: 205, s1: 405, y0: 11760, y1: 11895 }
/** 入口（南北の小道の上） */
export const JUNGLE_GATE = { s: 250, y: JUNGLE.y0 + 1.5 }

export const inJungle = (s: number, y: number, pad = 0) => s > JUNGLE.s0 - pad && s < JUNGLE.s1 + pad && y > JUNGLE.y0 - pad && y < JUNGLE.y1 + pad

export type Plant = { s: number; y: number; yaw: number; k: number; color: number; v: number }
export type Jungle = {
  /** 森の中の小道（輪）。点の列で、最後は最初につながる */
  trail: { s: number; y: number }[]
  giants: Plant[]
  ferns: Plant[]
  ears: Plant[]
  bulbs: Plant[]
  spirals: Plant[]
  mushrooms: Plant[]
  grass: Plant[]
  obstacles: { s: number; y: number; r: number }[]
}

/** 小道の幅 m */
export const TRAIL_W = 3

let jungle: Jungle | null = null
let forest: Forest | null = null

/** 「本格的な森」の置き場所（forestLayout.ts）。?forest=old のときは null */
export function jungleForest() {
  jungleLayout()
  return forest
}

/** 小道（点の列。閉じていない）からの距離 */
function polyDist(path: { s: number; y: number }[], s: number, y: number) {
  let d = Infinity
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const ds = b.s - a.s
    const dy = b.y - a.y
    const l2 = ds * ds + dy * dy || 1
    const u = Math.max(0, Math.min(1, ((s - a.s) * ds + (y - a.y) * dy) / l2))
    d = Math.min(d, Math.hypot(s - a.s - ds * u, y - a.y - dy * u))
  }
  return d
}

/** 数の倍率（スマホ・軽い画質は少なく） */
function density() {
  if (lowMemory() || currentLevel() === 'low') return 0.35
  if (isTouchDevice() || currentLevel() === 'medium') return 0.6
  return 1
}

export function jungleLayout(): Jungle {
  if (jungle) return jungle
  const rand = seeded(5150)
  const NS = JUNGLE_GATE.s
  // 小道：西のはしが南北の小道に触れる、ゆがんだ輪
  const trail: { s: number; y: number }[] = []
  const RS = 64
  const RY = 44
  const cs = NS + RS
  const cy = (JUNGLE.y0 + JUNGLE.y1) / 2
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2
    const w = 1 + 0.12 * Math.sin(t * 3 + 0.7) + 0.07 * Math.sin(t * 5 + 2.1)
    // 西のはし（t = π）では、ゆがみを 0 にして、ちょうど南北の小道に触れるように
    const c = Math.max(0, -Math.cos(t)) ** 2
    trail.push({ s: cs + Math.cos(t) * RS * (1 + (w - 1) * (1 - c)), y: cy + Math.sin(t) * RY * w })
  }
  /** 小道（輪と南北の小道）からの距離 */
  const trailDist = (s: number, y: number) => {
    let d = Math.abs(s - NS)
    for (let i = 0; i < trail.length; i++) {
      const a = trail[i]
      const b = trail[(i + 1) % trail.length]
      const ds = b.s - a.s
      const dy = b.y - a.y
      const l2 = ds * ds + dy * dy
      const u = Math.max(0, Math.min(1, ((s - a.s) * ds + (y - a.y) * dy) / l2))
      d = Math.min(d, Math.hypot(s - a.s - ds * u, y - a.y - dy * u))
    }
    return d
  }
  const k = density()
  const obstacles: Jungle['obstacles'] = []
  const placed: { s: number; y: number; r: number }[] = []
  /** 範囲の中で、小道から clear m 以上、ほかの大きいものから gap m 以上はなれた所を探す */
  const spot = (clear: number, gap: number, tries = 30) => {
    for (let i = 0; i < tries; i++) {
      const s = JUNGLE.s0 + 3 + rand() * (JUNGLE.s1 - JUNGLE.s0 - 6)
      const y = JUNGLE.y0 + 3 + rand() * (JUNGLE.y1 - JUNGLE.y0 - 6)
      if (trailDist(s, y) < TRAIL_W / 2 + clear) continue
      if (placed.some((p) => Math.hypot(p.s - s, p.y - y) < p.r + gap)) continue
      return { s, y }
    }
    return null
  }
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]
  const make = (n: number, clear: number, gap: number, r: number, scale: [number, number], colors: number[], solid: number) => {
    const out: Plant[] = []
    for (let i = 0; i < Math.round(n * k); i++) {
      const p = spot(clear, gap)
      if (!p) continue
      const sc = scale[0] + rand() * (scale[1] - scale[0])
      out.push({ ...p, yaw: rand() * Math.PI * 2, k: sc, color: pick(colors), v: rand() })
      if (r > 0) placed.push({ ...p, r: r * sc })
      if (solid > 0) obstacles.push({ ...p, r: solid * sc })
    }
    return out
  }
  // 大きいものから先に置く
  const giants = make(20, 5, 11, 6, [0.8, 1.25], [0x3f7a34, 0x4a8a3a, 0x356a44, 0x5a7a34], 1.5)
  const mushrooms = make(26, 2.5, 3, 2.5, [0.6, 1.4], [0xe9e2d0, 0xd06a4a, 0x9b6ad0, 0xe0b44a], 0.45)
  const spirals = make(32, 2, 2.5, 1.2, [0.7, 1.4], [0xd8642c, 0xc83a5a, 0x3fa38a, 0xe0a030], 0.35)
  const ferns = make(120, 1.8, 2, 1.4, [0.7, 1.5], [0x4f8a36, 0x5d9a3a, 0x3f7a40, 0x6a9a30], 0.28)
  const bulbs = make(60, 1.2, 1.4, 0.8, [0.7, 1.3], [0x6ff0e0, 0xf07ad8, 0xb0f060, 0x8ab0ff], 0)
  const ears = make(420, 0.5, 0.9, 0.8, [0.6, 1.7], [0x3f7a30, 0x2f6a3a, 0x4f8a2a, 0x356a50, 0x5a7a2a], 0)
  // 下草：小道のすぐそばまで
  const grass: Plant[] = []
  for (let i = 0; i < Math.round(2600 * k); i++) {
    const s = JUNGLE.s0 + 1.5 + rand() * (JUNGLE.s1 - JUNGLE.s0 - 3)
    const y = JUNGLE.y0 + 1.5 + rand() * (JUNGLE.y1 - JUNGLE.y0 - 3)
    if (trailDist(s, y) < TRAIL_W / 2 + 0.4) continue
    grass.push({ s, y, yaw: rand() * Math.PI * 2, k: 0.6 + rand() * 0.9, color: pick([0x5a9a3a, 0x4a8a32, 0x6aa040, 0x3f8a5a, 0x7a9a30]), v: rand() })
  }
  // 入口のアーチの柱
  for (const ds of [-3.6, 3.6]) obstacles.push({ s: JUNGLE_GATE.s + ds, y: JUNGLE_GATE.y, r: 0.35 })
  jungle = { trail, giants, ferns, ears, bulbs, spirals, mushrooms, grass, obstacles }
  if (FOREST_ON) {
    // 「本格的な森」のお試し：今までの木と下草はやめて、forestLayout.ts の植物に入れかえる。
    // ふしぎな植物（光る球・らせんの角・大きなきのこ）は、半分だけ残して、森のアクセントにする
    const half = <T,>(a: T[]) => a.filter((_, i) => i % 2 === 0)
    const keep = { bulbs: half(bulbs), spirals: half(spirals), mushrooms: half(mushrooms) }
    const accents = [...keep.mushrooms.map((p) => ({ s: p.s, y: p.y, r: 0.45 * p.k })), ...keep.spirals.map((p) => ({ s: p.s, y: p.y, r: 0.35 * p.k }))]
    const loop = [...trail, trail[0]]
    const ns = [
      { s: NS, y: JUNGLE.y0 - 4 },
      { s: NS, y: JUNGLE.y1 + 4 },
    ]
    forest = forestLayout({
      rect: JUNGLE,
      paths: [ns, loop],
      trailDist: (s, y) => Math.min(Math.abs(s - NS), polyDist(loop, s, y)),
      half: TRAIL_W / 2,
      gate: JUNGLE_GATE,
      avoid: [...accents.map((a) => ({ ...a, r: a.r * 2.5 })), ...keep.bulbs.map((p) => ({ s: p.s, y: p.y, r: 0.8 * p.k }))],
    })
    const gate = obstacles.filter((o) => Math.abs(o.y - JUNGLE_GATE.y) < 0.01 && Math.abs(Math.abs(o.s - JUNGLE_GATE.s) - 3.6) < 0.01)
    jungle = { trail, giants: [], ferns: [], ears: [], grass: [], ...keep, obstacles: [...accents, ...gate, ...forest.obstacles] }
  }
  return jungle
}
