import { seeded } from '../sf/batch'
import { currentLevel, lowMemory } from '../../state/quality'
import { isTouchDevice } from '../../state/input'

// 「本格的な森」。ラボの森（jungle.ts）の全体を、本物をスキャンした植物・板根の高い木・写真の地面・木もれ日で作り直す
// （WalkForest.tsx）。URL に ?forest=old を付けたときだけ、前の作りの森に戻る（見比べ用）。
// ここは「どこに何を置くか」だけを決める。森の広さや小道は jungle.ts から受け取る（ここからは jungle.ts を読まない）。

const QUERY = typeof location !== 'undefined' ? location.search + location.hash : ''
/** 本格的な森を使う（ふだんから。?forest=old のときだけ前の森） */
export const FOREST_ON = !/[?&#]forest=old\b/.test(QUERY)
/** お試しのときの URL（?forest=jungle など）を付けたときは、森の入口から歩き始める */
export const FOREST_START = /[?&#]forest=(jungle|sample|new)\b/.test(QUERY)

/** 置き場所：(s, y)、向き、大きさの倍率、色などをずらすための 0〜1 の数、地面からの高さ m（着生の植物など） */
export type Spot = { s: number; y: number; yaw: number; k: number; v: number; h?: number }
/** 高い木・細い木の置き場所。variant = 形の番号（TALL・POLE） */
export type TreeSpot = Spot & { variant: number }

/** 高い木（板根のある巨木）の形：胸の高さの幹の半径 m、幹の高さ m、形の種 */
export const TALL = [
  { r: 0.74, h: 17, seed: 11 },
  { r: 0.86, h: 19.5, seed: 23 },
  { r: 0.66, h: 16, seed: 37 },
  { r: 0.8, h: 18.5, seed: 51 },
  { r: 0.7, h: 16.5, seed: 67 },
  { r: 0.92, h: 21, seed: 83 },
]
/** 細い若木の形 */
export const POLE = [
  { r: 0.11, h: 8, seed: 101 },
  { r: 0.14, h: 10.5, seed: 102 },
  { r: 0.1, h: 7, seed: 103 },
  { r: 0.15, h: 12, seed: 104 },
]

/** 部品（public/models/forest-kit.glb の中の名前） */
export type KitName =
  | 'fern_a'
  | 'fern_b'
  | 'calathea_a'
  | 'calathea_b'
  | 'calathea_c'
  | 'anthurium_a'
  | 'anthurium_b'
  | 'anthurium_c'
  | 'arrow'
  | 'shrub'
  | 'creeper_a'
  | 'creeper_b'
  | 'pachira_a'
  | 'pachira_b'
  | 'roots'
  | 'stump'
  | 'log'
  | 'log_b'
  | 'rock_a'
  | 'rock_b'
  | 'rock_c'
  | 'rock_d'

/**
 * 部品ごとの、置いたときのおおよその半径 m と地面からの浮かせ方（倍率 1 のとき）、
 * see = 見える距離 m（倍率 1 のとき。大きく置いたものほど遠くまで見える）、near = 近く用の形を使う距離（see に対する割合）
 */
export const KIT: Record<KitName, { r: number; lift: number; see: number; near: number }> = {
  fern_a: { r: 0.5, lift: 0, see: 12, near: 0.45 },
  fern_b: { r: 0.3, lift: 0, see: 10, near: 0.45 },
  calathea_a: { r: 0.3, lift: 0, see: 12, near: 0.4 },
  calathea_b: { r: 0.2, lift: 0, see: 9, near: 0.4 },
  calathea_c: { r: 0.12, lift: 0, see: 5.5, near: 1 },
  anthurium_a: { r: 0.5, lift: 0, see: 12, near: 0.4 },
  anthurium_b: { r: 0.32, lift: 0, see: 11, near: 0.4 },
  anthurium_c: { r: 0.16, lift: 0, see: 6.5, near: 1 },
  arrow: { r: 0.35, lift: -0.02, see: 11, near: 0.4 },
  shrub: { r: 0.08, lift: -0.01, see: 5.5, near: 0.4 },
  creeper_a: { r: 0.13, lift: 0, see: 5, near: 1 },
  creeper_b: { r: 0.1, lift: 0, see: 5, near: 1 },
  pachira_a: { r: 0.5, lift: -0.02, see: 22, near: 0.4 },
  pachira_b: { r: 0.48, lift: -0.02, see: 22, near: 0.4 },
  roots: { r: 1.6, lift: -0.06, see: 50, near: 0.35 },
  stump: { r: 0.7, lift: 0.1, see: 45, near: 0.35 },
  log: { r: 2, lift: 0.2, see: 45, near: 0.35 },
  log_b: { r: 1.5, lift: 0.1, see: 36, near: 0.35 },
  rock_a: { r: 1.3, lift: 0.12, see: 70, near: 0.35 },
  rock_b: { r: 1, lift: 0.1, see: 70, near: 0.35 },
  rock_c: { r: 1, lift: 0.1, see: 70, near: 0.35 },
  rock_d: { r: 0.95, lift: 0.1, see: 70, near: 0.35 },
}

export type Forest = {
  tall: TreeSpot[]
  poles: TreeSpot[]
  kit: Record<KitName, Spot[]>
  /** 根元の暗がり（地面に落とす丸い影）：場所、半径 m、濃さ 0〜1 */
  shade: { s: number; y: number; r: number; a: number }[]
  obstacles: { s: number; y: number; r: number }[]
}

/** jungle.ts から受け取るもの */
export type ForestEnv = {
  rect: { s0: number; s1: number; y0: number; y1: number }
  /** 小道（輪と南北の道）の点の列。最後は最初につながらない（輪は閉じた点の列をそのまま渡す） */
  paths: { s: number; y: number }[][]
  /** 小道のまん中からの距離 m */
  trailDist: (s: number, y: number) => number
  /** 小道の幅の半分 m */
  half: number
  /** 森の入口（この前のふちには茂みを置かない） */
  gate: { s: number; y: number }
  /** よける物（残す、ふしぎな植物） */
  avoid: { s: number; y: number; r: number }[]
}

/** 数の倍率（スマホ・軽い画質は少なく） */
export function forestDensity() {
  if (lowMemory() || currentLevel() === 'low') return 0.45
  if (isTouchDevice() || currentLevel() === 'medium') return 0.7
  return 1
}

/** 置いた物を、4 m のます目に分けて覚える（重なりを早く調べるため） */
class Taken {
  private cells = new Map<number, { s: number; y: number; r: number }[]>()
  private maxR = 0
  private key = (i: number, j: number) => i * 4096 + j
  add(s: number, y: number, r: number) {
    const k = this.key(Math.floor(s / 4), Math.floor(y / 4))
    let c = this.cells.get(k)
    if (!c) this.cells.set(k, (c = []))
    c.push({ s, y, r })
    this.maxR = Math.max(this.maxR, r)
  }
  /** (s, y) の半径 r が、どれかと (r + 相手の r) × f + gap より近いか */
  hits(s: number, y: number, r: number, f: number, gap: number) {
    const reach = Math.ceil(((r + this.maxR) * f + gap) / 4)
    const i0 = Math.floor(s / 4)
    const j0 = Math.floor(y / 4)
    for (let i = i0 - reach; i <= i0 + reach; i++)
      for (let j = j0 - reach; j <= j0 + reach; j++) {
        const c = this.cells.get(this.key(i, j))
        if (c) for (const t of c) if (Math.hypot(t.s - s, t.y - y) < (t.r + r) * f + gap) return true
      }
    return false
  }
}

export function forestLayout(env: ForestEnv): Forest {
  const rand = seeded(7301)
  const k = forestDensity()
  const R = env.rect
  const W = R.s1 - R.s0
  const H = R.y1 - R.y0
  const kit = Object.fromEntries(Object.keys(KIT).map((n) => [n, [] as Spot[]])) as Record<KitName, Spot[]>
  const shade: Forest['shade'] = []
  const obstacles: Forest['obstacles'] = []
  const taken = new Taken()
  for (const a of env.avoid) taken.add(a.s, a.y, a.r)
  const inRect = (s: number, y: number, pad: number) => s > R.s0 + pad && s < R.s1 - pad && y > R.y0 + pad && y < R.y1 - pad
  const offPath = (s: number, y: number, r: number) => env.trailDist(s, y) - env.half > r * 0.55 + 0.25
  const free = (s: number, y: number, r: number, gap = 0) => inRect(s, y, 0.6) && offPath(s, y, r) && !taken.hits(s, y, r, 0.62, gap)
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)]
  /** 範囲の中で、空いている所を探す */
  const spot = (r: number, gap = 0, tries = 30) => {
    for (let i = 0; i < tries; i++) {
      const s = R.s0 + 1 + rand() * (W - 2)
      const y = R.y0 + 1 + rand() * (H - 2)
      if (free(s, y, r, gap)) return { s, y }
    }
    return null
  }
  const put = (name: KitName, s: number, y: number, scale: number, yaw = rand() * Math.PI * 2, solid = 0, shadeA = 0.5) => {
    const r = KIT[name].r * scale
    kit[name].push({ s, y, yaw, k: scale, v: rand() })
    taken.add(s, y, r)
    shade.push({ s, y, r: r * 1.25, a: shadeA })
    if (solid > 0) obstacles.push({ s, y, r: solid })
  }

  // 高い木（板根のある巨木）：入口のすぐ先の 3 本は、見本の一角と同じ場所。あとは 14 m 以上はなして散らす
  const tall: TreeSpot[] = []
  const addTall = (s: number, y: number, variant: number, scale: number) => {
    const t = TALL[variant]
    tall.push({ s, y, yaw: rand() * Math.PI * 2, k: scale, v: rand(), variant })
    taken.add(s, y, t.r * scale * 3.4)
    obstacles.push({ s, y, r: t.r * scale * 1.5 })
    shade.push({ s, y, r: t.r * scale * 5.5, a: 0.8 })
  }
  addTall(243.4, 11769.6, 0, 1)
  addTall(257.8, 11777.4, 1, 1)
  addTall(241.2, 11786.2, 2, 1)
  for (let i = 0, n = 0; i < 4000 && n < 64; i++) {
    const s = R.s0 + 3 + rand() * (W - 6)
    const y = R.y0 + 3 + rand() * (H - 6)
    const variant = Math.floor(rand() * TALL.length)
    const scale = 0.9 + rand() * 0.22
    const r = TALL[variant].r * scale
    if (!offPath(s, y, r * 3.5)) continue
    if (tall.some((t) => Math.hypot(t.s - s, t.y - y) < 14)) continue
    if (taken.hits(s, y, r * 2, 0.62, 0)) continue
    addTall(s, y, variant, scale)
    n++
  }

  // 地面の小物：倒木（長い軸に沿って、ぶつかる丸を並べる）、切り株、根の盛り上がり、苔むした石
  const addLog = (name: 'log' | 'log_b', s: number, y: number, scale: number, yaw: number) => {
    put(name, s, y, scale, yaw, 0, 0.55)
    if (name === 'log') for (const d of [-1.6, -0.5, 0.6, 1.7]) obstacles.push({ s: s + Math.cos(yaw) * d * scale, y: y - Math.sin(yaw) * d * scale, r: 0.5 * scale })
  }
  addLog('log', 254.6, 11770.3, 1.15, 0.5)
  addLog('log', 245.2, 11780.4, 0.95, 2.2)
  for (let i = 0; i < Math.round(30 * k); i++) {
    const name = i % 3 === 2 ? 'log_b' : 'log'
    const scale = name === 'log' ? 0.8 + rand() * 0.45 : 1 + rand() * 0.6
    const p = spot(KIT[name].r * scale, 0.4)
    if (p) addLog(name, p.s, p.y, scale, rand() * Math.PI * 2)
  }
  for (let i = 0; i < Math.round(12 * k); i++) {
    const scale = 0.85 + rand() * 0.4
    const p = spot(KIT.stump.r * scale, 0.5)
    if (p) put('stump', p.s, p.y, scale, rand() * Math.PI * 2, 0.7 * scale)
  }
  // 根の盛り上がりは、高い木の根元のそば（板根の先）に
  for (const t of tall) {
    if (rand() < 0.45) continue
    const a = rand() * Math.PI * 2
    const d = TALL[t.variant].r * t.k * (3 + rand())
    const s = t.s + Math.cos(a) * d
    const y = t.y + Math.sin(a) * d
    const scale = 0.8 + rand() * 0.35
    if (inRect(s, y, 1) && offPath(s, y, KIT.roots.r * scale)) put('roots', s, y, scale, rand() * Math.PI * 2, 0, 0.35)
  }
  // 石：1〜3 個のかたまり
  const rocks = ['rock_a', 'rock_b', 'rock_c', 'rock_d'] as const
  for (let i = 0; i < Math.round(26 * k); i++) {
    const p = spot(1.2, 1)
    if (!p) continue
    const n = 1 + Math.floor(rand() * 3)
    for (let j = 0; j < n; j++) {
      const name = pick(rocks)
      const scale = (j ? 0.3 : 0.42) + rand() * 0.2
      const a = rand() * Math.PI * 2
      const s = p.s + (j ? Math.cos(a) * (0.9 + rand()) : 0)
      const y = p.y + (j ? Math.sin(a) * (0.9 + rand()) : 0)
      if (j && !free(s, y, KIT[name].r * scale)) continue
      put(name, s, y, scale, rand() * Math.PI * 2, KIT[name].r * scale * 0.85)
    }
  }

  // 細い木（林の中の若木）
  const poles: TreeSpot[] = []
  for (let i = 0; i < Math.round(230 * k); i++) {
    const p = spot(1.3, 0.6, 12)
    if (!p) continue
    const variant = Math.floor(rand() * POLE.length)
    const scale = 0.85 + rand() * 0.35
    poles.push({ ...p, yaw: rand() * Math.PI * 2, k: scale, v: rand(), variant })
    taken.add(p.s, p.y, 0.9)
    obstacles.push({ s: p.s, y: p.y, r: POLE[variant].r * scale + 0.12 })
    shade.push({ s: p.s, y: p.y, r: 1.1, a: 0.5 })
  }

  // 下草：種類ごとにかたまって生える。かたまりのまん中に大きい株、まわりに小さい株
  type Species = { big: KitName; mid: KitName; small: KitName; scale: [number, number]; n: [number, number] }
  const SPECIES: Species[] = [
    { big: 'anthurium_a', mid: 'anthurium_b', small: 'anthurium_c', scale: [1.9, 3.2], n: [5, 9] },
    { big: 'calathea_a', mid: 'calathea_b', small: 'calathea_c', scale: [2.6, 4], n: [5, 9] },
    { big: 'fern_a', mid: 'fern_b', small: 'fern_b', scale: [2, 3.2], n: [5, 9] },
    { big: 'arrow', mid: 'arrow', small: 'calathea_c', scale: [2.3, 3.5], n: [3, 6] },
    { big: 'shrub', mid: 'shrub', small: 'fern_b', scale: [6, 9], n: [3, 6] },
    { big: 'creeper_a', mid: 'creeper_b', small: 'creeper_b', scale: [3, 5], n: [6, 12] },
  ]
  /** 森のふちは、背の高い茂みのかたまり */
  const EDGE = [SPECIES[4], SPECIES[3], SPECIES[0], SPECIES[1]]
  const clump = (cs: number, cy: number, sp: Species) => {
    const count = Math.max(2, Math.round((sp.n[0] + rand() * (sp.n[1] - sp.n[0])) * k))
    for (let i = 0; i < count; i++) {
      const name = i === 0 ? sp.big : i < 3 ? sp.mid : sp.small
      const scale = (sp.scale[0] + rand() * (sp.scale[1] - sp.scale[0])) * (i === 0 ? 1 : 0.9)
      // まん中から、だんだん外へ
      const d = i === 0 ? 0 : 0.5 + Math.sqrt(i) * 0.75 * (0.7 + rand() * 0.6)
      const a = rand() * Math.PI * 2
      const s = cs + Math.cos(a) * d
      const y = cy + Math.sin(a) * d
      if (!free(s, y, KIT[name].r * scale)) continue
      put(name, s, y, scale)
    }
  }
  // 森のふち：外の公園や町が木の間から丸見えにならないように、ふちの 0〜5 m に中くらいの木と茂みを詰める（入口の前はあける）
  const edge = (s: number, y: number, p: number) => {
    if (Math.abs(s - env.gate.s) < 7 && y < R.y0 + 8) return
    if (rand() < p) {
      const name: KitName = rand() < 0.5 ? 'pachira_b' : 'pachira_a'
      const scale = 3.4 + rand() * 1.3
      if (free(s, y, KIT[name].r * scale * 0.45)) put(name, s, y, scale, rand() * Math.PI * 2, 0.3, 0.6)
    }
    const a = rand() * Math.PI * 2
    clump(s + Math.cos(a) * 1.2, y + Math.sin(a) * 1.2, EDGE[Math.floor(rand() * EDGE.length)])
  }
  // 2 列：いちばん外（0〜3 m）はすき間なく、その内側（3〜7 m）は少しまばらに
  for (const [d0, d1, p] of [
    [0.8, 3, 0.9],
    [3, 7, 0.6],
  ]) {
    const step = () => (2.2 + rand() * 1.2) / Math.max(0.6, k)
    const inset = () => d0 + rand() * (d1 - d0)
    for (let d = rand() * 2; d < W; d += step()) {
      edge(R.s0 + d, R.y0 + inset(), p)
      edge(R.s0 + d, R.y1 - inset(), p)
    }
    for (let d = rand() * 2; d < H; d += step()) {
      edge(R.s0 + inset(), R.y0 + d, p)
      edge(R.s1 - inset(), R.y0 + d, p)
    }
  }

  // 中くらいの木（パキラ）
  for (let i = 0; i < Math.round(300 * k); i++) {
    const name: KitName = i % 2 ? 'pachira_b' : 'pachira_a'
    const scale = name === 'pachira_a' ? 2.9 + rand() * 0.9 : 3.3 + rand() * 1.3
    const p = spot(KIT[name].r * scale * 0.7, 0.4, 20)
    if (!p) continue
    put(name, p.s, p.y, scale, rand() * Math.PI * 2, 0.3, 0.6)
  }

  // かたまりのまん中：小道の両わき（歩くとすぐ目に入る）、高い木の根元、あとは空いた所
  let n = 0
  const sp = () => SPECIES[n++ % SPECIES.length]
  for (const path of env.paths) {
    let next = rand() * 3
    let acc = 0
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]
      const b = path[i]
      const L = Math.hypot(b.s - a.s, b.y - a.y)
      if (L < 1e-6) continue
      const ns = -(b.y - a.y) / L
      const ny = (b.s - a.s) / L
      for (; next < acc + L; next += 4.6 + rand() * 2.4) {
        const f = (next - acc) / L
        for (const side of [-1, 1]) {
          const off = env.half + 1.5 + rand() * 1.8
          clump(a.s + (b.s - a.s) * f + ns * side * off, a.y + (b.y - a.y) * f + ny * side * off, sp())
        }
      }
      acc += L
    }
  }
  for (const t of tall) for (let i = 0; i < 3; i++) clump(t.s + Math.cos(i * 2.1 + t.v * 6) * TALL[t.variant].r * t.k * 4.2, t.y + Math.sin(i * 2.1 + t.v * 6) * TALL[t.variant].r * t.k * 4.2, sp())
  for (let i = 0; i < Math.round(900 * k); i++) clump(R.s0 + 2 + rand() * (W - 4), R.y0 + 2 + rand() * (H - 4), sp())
  // すき間を埋める小さい株
  const fill: KitName[] = ['fern_b', 'calathea_c', 'anthurium_c', 'creeper_a', 'fern_b', 'creeper_b']
  for (let i = 0; i < Math.round(2600 * k); i++) {
    const name = fill[i % fill.length]
    const scale = name.startsWith('creeper') ? 3.5 + rand() * 2.5 : 1.8 + rand() * 1.4
    const p = spot(KIT[name].r * scale, 0.05, 8)
    if (p) put(name, p.s, p.y, scale)
  }

  // 高い木の幹に着生する植物（オオタニワタリは、本当に木の幹に付いて育つ）
  for (const t of tall) {
    const T = TALL[t.variant]
    for (let i = 0; i < 4; i++) {
      const a = rand() * Math.PI * 2
      const h = (3.2 + rand() * 7) * t.k
      kit[i % 2 ? 'fern_b' : 'fern_a'].push({ s: t.s + Math.cos(a) * T.r * t.k * 0.82, y: t.y + Math.sin(a) * T.r * t.k * 0.82, yaw: rand() * Math.PI * 2, k: 0.9 + rand() * 0.7, v: rand(), h })
    }
  }
  return { tall, poles, kit, shade, obstacles }
}
