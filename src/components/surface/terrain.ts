import * as THREE from 'three'
import type { SurfaceDef } from '../../data/surfaces'
import { detailAt, heightAt, type Dem } from './dem'
import { poisFor, poiWeight, type Poi } from './pois'
import { FORM_KINDS, FORM_ROCK_TILE, formPalette, formRelief, formRocks, formTint } from './poiForms'
import { TRACKS, tracksAt } from '../../data/rallyTracks'

// 地表の地形：なだらかな起伏・クレーター・砂丘・遠くの山並み・天体の丸み（小さな星ほど地平線が近い）。
// 立つ場所（原点）と着陸船の場所は平らにならす。

export const LANDER_POS = new THREE.Vector2(4, -30) // (x, z) m
export const FAR = 3200

/** 決まった種から同じ並びの乱数を出す */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1_000_000) / 1_000_000
  }
}

function hash(x: number, y: number, seed: number) {
  const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return v - Math.floor(v)
}

function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy, seed)
  const b = hash(ix + 1, iy, seed)
  const c = hash(ix, iy + 1, seed)
  const d = hash(ix + 1, iy + 1, seed)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

export function fbm(x: number, y: number, seed: number, octaves = 5) {
  let v = 0
  let a = 0.5
  let f = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    v += a * noise(x * f, y * f, seed + i * 13)
    norm += a
    a *= 0.5
    f *= 2.03
  }
  return v / norm
}

type Crater = { x: number; z: number; r: number }

const CELL = 200

function idSeed(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) % 100000
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * 場所ごとに荒れ具合の変わる地面（月・エウロパ）。全体に同じでこぼこを足すと単調でつまらないので、
 * 数百 m ごとに「ほぼ平ら」「少しでこぼこ」「荒れた所」が入れかわる。でこぼこの細かさも場所でちがう。
 * レース場のコースの上（ZONE_LANE の内側）は、少しでこぼこまでにおさえる（走りやすく）
 */
const ZONE_BODIES = new Set(['moon', 'europa'])
/** レース場ごとの、すべてのコースの線（やさしいコースと上級のコースの両方を平らにする） */
const raceLines = (site: string) => tracksAt(site).map((id) => TRACKS[id].line)
/**
 * レースのコースの上（線からこの距離 m まで）は、ほぼ平らにする（どの星でも、最初のレースは走りやすく）。
 * その外 ZONE_LANE_FADE m で元の地面にもどる。でこぼこや荒れた所は、ふつうの着陸地点で楽しむ
 */
const ZONE_LANE = 14
const ZONE_LANE_FADE = 18
const LANE_CELL = 25

const DUNE_SAND = new THREE.Color('#4a3a32')
const BOULDER_GROUND = new THREE.Color('#5a4232')
const BUTTE_LIGHT = new THREE.Color('#b8957a')
const BUTTE_DARK = new THREE.Color('#6e5040')

export class Terrain {
  readonly seed: number
  readonly craters: Crater[] = []
  readonly radiusM: number
  /** クレーターを 200 m 四方のます目に分けて、近いものだけ調べる */
  private grid = new Map<string, Crater[]>()
  /** ならした場所（立つ場所・着陸船）の高さ：まわりの地面の高さにそろえる */
  private baseEye = 0
  private baseLander = 0

  /** 本物の地形（観測された標高）。あれば起伏・クレーター・砂丘・山並みは作らず、これを使う */
  readonly dem: Dem | null
  /** 見どころ（地層の丘・岩塊の野・砂丘）と、地層の丘ひとつひとつ */
  readonly pois: Poi[]
  private buttes = new Map<string, { x: number; z: number; a: number; h: number }[]>()
  /** 干上がった湖：見どころと、湖の底の高さ */
  private lakes: { p: Poi; level: number }[] = []
  /** 火星以外の見どころ（poiForms.ts の地形） */
  private formPois: Poi[] = []
  /** 荒れ具合の変わる地面か（月・エウロパ）と、レース場のコースの点（LANE_CELL m のます目に分けたもの） */
  private zoned: boolean
  private lane: Map<string, [number, number][]> | null = null

  constructor(readonly def: SurfaceDef, dem: Dem | null = null) {
    this.seed = idSeed(def.id)
    // 別の着陸地点（峡谷レース場）には、見どころを置かない（本物の地形そのものを走る）
    this.pois = def.site ? [] : poisFor(def.id)
    this.formPois = this.pois.filter((p) => FORM_KINDS.has(p.kind))
    this.zoned = ZONE_BODIES.has(def.id)
    if (this.zoned) {
      const qs: number[] = []
      for (let x = -900; x <= 900; x += 45) for (let z = -900; z <= 900; z += 45) qs.push(this.zoneQ(x, z))
      qs.sort((p, q) => p - q)
      this.zoneCut = [qs[Math.floor(qs.length * 0.35)], qs[Math.floor(qs.length * 0.75)]]
    }
    const lines = def.site ? raceLines(def.site) : []
    if (lines.length) {
      const lane = new Map<string, [number, number][]>()
      // 10 m ごとの点のあいだを 2.5 m ごとに埋める（線までの距離を点までの距離で測れるように）
      for (const line of lines) for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i]
        const [bx, bz] = line[i + 1]
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2.5))
        for (let k = 0; k < n; k++) {
          const px = ax + ((bx - ax) * k) / n
          const pz = az + ((bz - az) * k) / n
          const key = `${Math.floor(px / LANE_CELL)},${Math.floor(pz / LANE_CELL)}`
          const list = lane.get(key)
          if (list) list.push([px, pz])
          else lane.set(key, [[px, pz]])
        }
      }
      this.lane = lane
    }
    this.pois.forEach((p, i) => {
      if (p.kind !== 'buttes') return
      const rnd = seeded(this.seed + 300 + i)
      const list: { x: number; z: number; a: number; h: number }[] = []
      // 小さめの丘をたくさん、あいだに谷を残して（ひとつの山に見えないように）
      for (let k = 0; k < 160 && list.length < 14; k++) {
        const ang = rnd() * Math.PI * 2
        const d = Math.sqrt(rnd()) * p.r * 0.7
        const b = { x: p.x + Math.cos(ang) * d, z: p.z + Math.sin(ang) * d, a: 25 + rnd() * 45, h: 8 + rnd() * 18 }
        if (list.some((o) => Math.hypot(o.x - b.x, o.z - b.z) < (o.a + b.a) * 1.05)) continue
        list.push(b)
      }
      this.buttes.set(p.id, list)
    })
    this.radiusM = def.radiusKm * 1000
    this.dem = dem
    const rnd = seeded(this.seed + 7)
    const n = dem ? 0 : Math.round(def.relief.craters * 260)
    const add = (r: number, x: number, z: number) => {
      // 立つ場所と着陸船の下には大きなクレーターを置かない
      const clear = Math.min(Math.hypot(x, z), Math.hypot(x - LANDER_POS.x, z - LANDER_POS.y))
      if (clear < r * 1.6 + 20) return
      const c = { x, z, r }
      this.craters.push(c)
      const reach = r * 3
      for (let gx = Math.floor((x - reach) / CELL); gx <= Math.floor((x + reach) / CELL); gx++) {
        for (let gz = Math.floor((z - reach) / CELL); gz <= Math.floor((z + reach) / CELL); gz++) {
          const key = `${gx},${gz}`
          const list = this.grid.get(key)
          if (list) list.push(c)
          else this.grid.set(key, [c])
        }
      }
    }
    for (let i = 0; i < n; i++) {
      // 小さいクレーターほど多い（べき分布）
      const r = Math.max(2.5, def.relief.craterMax * rnd() ** 3.2)
      const ang = rnd() * Math.PI * 2
      const dist = Math.sqrt(rnd()) * 2200
      add(r, Math.cos(ang) * dist, Math.sin(ang) * dist)
    }
    // ローバーで走れる範囲（3 km 四方）と、その先に見える所にも、同じ密度でクレーターを足す（2.2〜4.2 km の輪）。
    // 着陸地点のまわりの並びは今までと同じ
    const rnd2 = seeded(this.seed + 8)
    const n2 = Math.round(n * ((4200 / 2200) ** 2 - 1))
    for (let i = 0; i < n2; i++) {
      const r = Math.max(2.5, def.relief.craterMax * rnd2() ** 3.2)
      const ang = rnd2() * Math.PI * 2
      const dist = Math.sqrt(2200 ** 2 + rnd2() * (4200 ** 2 - 2200 ** 2))
      add(r, Math.cos(ang) * dist, Math.sin(ang) * dist)
    }
    // 湖の底は、湖の中のいちばん低い所より 2.5 m 下の平らな面（岸はまわりから下り坂になる）
    const lakes = this.pois.filter((p) => p.kind === 'lakebed')
    this.lakes = lakes.map((p) => {
      let lo = this.sample(p.x, p.z, true).h
      for (let i = 0; i < 16; i++) {
        const a = (i / 8) * Math.PI
        const d = p.r * (i < 8 ? 0.3 : 0.6)
        lo = Math.min(lo, this.sample(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, true).h)
      }
      return { p, level: lo - 2.5 }
    })
    this.settle()
  }

  /** 穴の底や丘の上に立たないよう、ならした場所はまわり 40 m の平均の高さにする */
  private settle() {
    const avg = (cx: number, cz: number) => {
      let sum = 0
      let n = 0
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2
        for (const d of [15, 28, 40]) {
          sum += this.sample(cx + Math.cos(a) * d, cz + Math.sin(a) * d, true).h
          n++
        }
      }
      return sum / n
    }
    this.baseEye = avg(0, 0)
    this.baseLander = avg(LANDER_POS.x, LANDER_POS.y)
  }

  /** 平らにならす重み（0：ならさない〜1：完全に平ら） */
  flat(x: number, z: number) {
    const a = 1 - smooth(4, 12, Math.hypot(x, z))
    const b = 1 - smooth(14, 30, Math.hypot(x - LANDER_POS.x, z - LANDER_POS.y))
    return Math.max(a, b)
  }

  /** 地形の高さ（丸みを除く）と、クレーターのふちの噴出物・割れ目の重み */
  sample(x: number, z: number, raw = false) {
    const R = this.def.relief
    const s = this.seed
    if (this.dem) {
      // 本物の地形 ＋ 地図より細かい足もとのでこぼこ
      let real = heightAt(this.dem.near, x, z) ?? heightAt(this.dem.far, x, z) ?? 0
      // レースのコースの上では、本物の地形の細かいでこぼこをならす（大きな地形の形はそのまま）
      const lw = this.lane && this.def.id === 'mars' ? this.laneW(x, z) : 0
      if (lw > 0) real += (this.nearSmooth(x, z) - real) * 0.75 * lw
      if (this.dem.detail) real += detailAt(this.dem.detail, x, z) * (1 - 0.7 * lw)
      if (this.def.id === 'mars' && !this.def.site) real += this.marsRelief(x, z)
      if (this.pois.length) real += this.poiRelief(x, z)
      let h = real + (fbm(x / 22, z / 22, s + 50, 3) - 0.5) * 0.5 + (fbm(x / 5, z / 5, s + 51, 2) - 0.5) * 0.15
      if (this.zoned) h += this.zoneRelief(x, z, 1)
      if (raw) return { h, ejecta: 0, crack: 0 }
      const a = 1 - smooth(4, 12, Math.hypot(x, z))
      const b = 1 - smooth(14, 30, Math.hypot(x - LANDER_POS.x, z - LANDER_POS.y))
      const f = Math.max(a, b)
      h = h * (1 - f) + (a >= b ? this.baseEye : this.baseLander) * f
      return { h, ejecta: 0, crack: 0 }
    }
    let h = (fbm(x / R.hillScale, z / R.hillScale, s) - 0.5) * 2 * R.hills
    if (this.zoned) {
      // 足もとの細かいでこぼこは、場所ごとの荒れ具合で（見どころの中は、見どころの形をそのまま見せる）
      const calmHere = this.formPois.length ? this.poiCalm(x, z) : 1
      h += (fbm(x / 22, z / 22, s + 50, 3) - 0.5) * 0.5 + this.zoneRelief(x, z, calmHere)
    } else h += (fbm(x / 22, z / 22, s + 50, 3) - 0.5) * 0.9 // 足もとの細かいでこぼこ
    // 見どころ（火星以外）の中では、ふつうのクレーターと砂丘を埋めて見どころの形を目立たせる（新しい地形が古い地形をおおった形）。
    // 見どころの外では calm = 1 で、これまでと同じ
    let calm = -1
    if (R.dunes) {
      calm = this.formPois.length ? this.poiCalm(x, z) : 1
      // 風下にゆるく、風上に急な砂丘の列
      const w = x * 0.82 + z * 0.57 + fbm(x / 300, z / 300, s + 9) * 140
      const ph = (w / 95) % 1
      const p = ph < 0 ? ph + 1 : ph
      h += R.dunes * (p < 0.7 ? p / 0.7 : (1 - p) / 0.3) * (0.6 + 0.4 * fbm(x / 400, z / 400, s + 3)) * calm
    }
    let ejecta = 0
    for (const c of this.grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
      const dx = x - c.x
      const dz = z - c.z
      const d2 = (dx * dx + dz * dz) / (c.r * c.r)
      if (d2 > 9) continue
      if (calm < 0) calm = this.formPois.length ? this.poiCalm(x, z) : 1
      const d = Math.sqrt(d2)
      const depth = c.r * 0.22
      const rim = c.r * 0.05
      if (d < 1) h += (depth * (d2 - 1) + rim * d2 * d2) * calm
      else h += rim * Math.exp(-(d - 1) * 3.2) * calm
      ejecta = Math.max(ejecta, Math.exp(-((d - 1.05) ** 2) * 9) * (c.r > 8 ? 1 : 0.5) * calm)
    }
    let crack = 0
    if (R.cracks) {
      const n1 = Math.abs(fbm(x / 160, z / 160, s + 21, 4) - 0.5)
      const n2 = Math.abs(fbm(x / 70 + 9, z / 70, s + 33, 3) - 0.5)
      crack = Math.max(1 - smooth(0.0, 0.018, n1), 0.6 * (1 - smooth(0.0, 0.012, n2))) * R.cracks
      if (this.def.id === 'europa') {
        // エウロパの二重尾根：2 本の低い尾根のあいだに溝。まわりに赤茶色の筋が広がる（ガリレオの写真）
        const ridge = 1 - smooth(0.0, 0.03, n1)
        const trough = 1 - smooth(0.0, 0.01, n1)
        h += (ridge * 1.8 - trough * 1.2 + 0.5 * (1 - smooth(0.0, 0.012, n2))) * R.cracks
        crack = Math.max(1 - smooth(0.0, 0.05, n1), 0.6 * (1 - smooth(0.0, 0.02, n2))) * R.cracks * 0.85
      } else h += crack * 0.6
    }
    if (this.pois.length) h += this.poiRelief(x, z)
    for (const l of this.lakes) {
      const w = poiWeight(l.p, x, z, 0.35)
      if (w > 0) h += (l.level + (fbm(x / 40, z / 40, s + 113, 2) - 0.5) * 0.15 - h) * w
    }
    const r = Math.hypot(x, z)
    // 遠くの山並み。ローバーで走れる範囲（着陸地点から 1.5 km）の外から立ち上がる
    if (R.mountains) h += smooth(1700, 3300, r) * fbm(x / 700, z / 700, s + 77, 4) ** 1.6 * R.mountains * 2.2
    if (raw) return { h, ejecta, crack }
    const a = 1 - smooth(4, 12, Math.hypot(x, z))
    const b = 1 - smooth(14, 30, Math.hypot(x - LANDER_POS.x, z - LANDER_POS.y))
    const f = Math.max(a, b)
    const base = a >= b ? this.baseEye : this.baseLander
    h = h * (1 - f) + base * f
    return { h, ejecta: ejecta * (1 - f), crack }
  }

  /**
   * 荒れ具合の重み：flat（ほぼ平ら）・bumpy（少しでこぼこ）・rough（荒れた所）。足すと 1。
   * 数百 m の大きさのむらで決める。レース場のコースの上（lane = true のとき）は、ほぼ平らにする
   */
  zoneMix(x: number, z: number, lane = true) {
    const q = this.zoneQ(x, z)
    const [a, b] = this.zoneCut
    let rough = smooth(b - 0.035, b + 0.035, q)
    const notFlat = smooth(a - 0.035, a + 0.035, q)
    let bumpy = notFlat - rough
    if (lane && this.lane && notFlat > 0) {
      // コースの上：荒れた所はなくし、少しでこぼこも 2 割だけ残す（ほぼ平ら）
      const w = this.laneW(x, z)
      bumpy *= 1 - 0.8 * w
      rough *= 1 - w
    }
    return { flat: 1 - bumpy - rough, bumpy, rough }
  }

  private zoneQ(x: number, z: number) {
    return fbm(x / 340 + 17, z / 340 - 5, this.seed + 140, 3)
  }

  /** 荒れ具合のむらの境目：走れる範囲のうち、およそ 35 % がほぼ平ら・40 % が少しでこぼこ・25 % が荒れた所になるように */
  private zoneCut: [number, number] = [0.45, 0.58]

  /** レースのコースの上か（1：コースの上〜0：コースから離れた所） */
  private laneW(x: number, z: number) {
    return 1 - smooth(ZONE_LANE, ZONE_LANE + ZONE_LANE_FADE, this.laneDist(x, z))
  }

  /** 地図の高さを、まわり ±9 m でならしたもの（コースの上の細かい起伏を消すため） */
  private nearSmooth(x: number, z: number) {
    const m = this.dem!.near
    const at = (px: number, pz: number) => heightAt(m, px, pz) ?? heightAt(this.dem!.far, px, pz) ?? 0
    const r = 9
    return (at(x, z) * 2 + at(x + r, z) + at(x - r, z) + at(x, z + r) + at(x, z - r)) / 6
  }

  /** コースの線までの距離（m、遠ければ大きな数） */
  private laneDist(x: number, z: number) {
    const cx = Math.floor(x / LANE_CELL)
    const cz = Math.floor(z / LANE_CELL)
    let best = 1e9
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gz = cz - 1; gz <= cz + 1; gz++) {
        for (const [px, pz] of this.lane?.get(`${gx},${gz}`) ?? []) {
          const d = (px - x) ** 2 + (pz - z) ** 2
          if (d < best) best = d
        }
      }
    }
    return Math.sqrt(best)
  }

  /**
   * 荒れ具合に合わせたでこぼこ（m）。w は全体の強さ（見どころの中では小さく）。
   *  少しでこぼこ … 波長 7〜16 m のなだらかなこぶ（高さ ±0.5 m ほど）。こぶの大きさは場所でちがう
   *  荒れた所   … 月はクレーターの縁の噴出物のような、とがったこぶの重なり（±1.5 m ほど）。
   *                エウロパは割れて少しずれた氷の板（カオス地形）の、段のある地面
   */
  private zoneRelief(x: number, z: number, w: number) {
    if (w <= 0.01 || this.noZone) return 0
    const s = this.seed
    const m = this.zoneMix(x, z)
    let h = 0
    if (m.bumpy > 0.01) {
      // こぶの細かさは場所でちがう（7〜16 m）
      const sc = 7 + 9 * fbm(x / 500, z / 500, s + 141, 2)
      h += (fbm(x / sc, z / sc, s + 142, 3) - 0.5) * 2.6 * m.bumpy
    }
    if (m.rough > 0.01) {
      if (this.def.id === 'europa') {
        // 氷の板：大きなむらを段にして、板どうしの高さを少しずらす（段はなめらかに）
        const u = fbm(x / 26, z / 26, s + 143, 3) * 6
        const fl = Math.floor(u)
        const step = (fl + smooth(0.4, 0.6, u - fl)) / 6
        h += ((step - 0.5) * 4 + (fbm(x / 6, z / 6, s + 144, 2) - 0.5) * 1.2) * m.rough
      } else {
        // とがったこぶ（尾根の形のノイズ）を 2 つの大きさで重ねる
        const r1 = 1 - Math.abs(fbm(x / 18, z / 18, s + 143, 3) * 2 - 1)
        const r2 = 1 - Math.abs(fbm(x / 7, z / 7, s + 144, 2) * 2 - 1)
        h += ((r1 * r1 - 0.45) * 2.8 + (r2 * r2 - 0.45) * 0.9) * m.rough
      }
    }
    return h * w
  }

  /**
   * 見どころの地形：
   *  地層の丘 … 平らな頂き・急な崖・ふもとのなだらかな崖錐（がいすい）。高さ 2.2 m ごとの段（地層）で崖を刻む
   *  岩塊の野 … ゆるいこぶ（岩は scatter() で増やす）
   *  砂丘     … 風下にゆるく風上に急な、高さ 4〜8 m の砂丘の列
   */
  private poiRelief(x: number, z: number) {
    let h = 0
    const s = this.seed
    for (const p of this.pois) {
      const w = poiWeight(p, x, z, 0.25)
      if (w <= 0) continue
      if (FORM_KINDS.has(p.kind)) h += formRelief(p, x, z, s, w)
      else if (p.kind === 'buttes') {
        h += (this.butteTop(p, x, z) + 3) * w
      } else if (p.kind === 'boulders') {
        h += (fbm(x / 55, z / 55, s + 80, 3) - 0.5) * 7 * w
      } else {
        // 風は北西から：列は北東〜南西に伸びる
        const u = x * 0.6 - z * 0.8 + (fbm(x / 160, z / 160, s + 82, 3) - 0.5) * 90
        const ph = (((u / 64) % 1) + 1) % 1
        const prof = ph < 0.72 ? ph / 0.72 : (1 - ph) / 0.28
        const amp = 4 + 4 * fbm(x / 220, z / 220, s + 83, 2)
        h += prof * prof * (3 - 2 * prof) * amp * w
      }
    }
    return h
  }

  /** 地層の丘の高さ（見どころの外側へのぼかしの前） */
  private butteTop(p: Poi, x: number, z: number) {
    const s = this.seed
    // 丘のふちを不ぞろいに（崖が円に見えないように）
    const jag = (fbm(x / 28, z / 28, s + 70, 3) - 0.5) * 0.5 + (fbm(x / 9, z / 9, s + 71, 2) - 0.5) * 0.12
    let top = 0
    for (const b of this.buttes.get(p.id) ?? []) {
      const d = Math.hypot(x - b.x, z - b.z) / b.a + jag
      if (d > 1.9) continue
      // 層が少しずつ後ろへ下がった、段々の斜面（平均 25〜30°、段の立ち上がりは急）と、ふもとの崖錐
      const prof = 0.8 * (1 - smooth(0.25, 0.95, d)) + 0.2 * (1 - smooth(0.95, 1.85, d))
      let hh = b.h * prof
      const q = hh / 2.2
      const fl = Math.floor(q)
      hh = (fl + smooth(0.45, 0.8, q - fl)) * 2.2
      top = Math.max(top, hh)
    }
    return top
  }

  /** ふつうのクレーターを残す割合（火星以外の見どころの中ほど 0 に近い） */
  private poiCalm(x: number, z: number) {
    let w = 0
    for (const p of this.formPois) w = Math.max(w, poiWeight(p, x, z, 0.35))
    return 1 - w
  }

  /** 見どころの岩の決まり：more（出やすさの倍率）、big（大岩の野か）、pebble（小石の川原か）、k（明るさ） */
  private poiRocks(x: number, z: number) {
    let more = 1
    let big = 0
    let pebble = 0
    let k = 1
    for (const p of this.pois) {
      const w = poiWeight(p, x, z, 0.3)
      if (w <= 0) continue
      if (FORM_KINDS.has(p.kind)) {
        const f = formRocks(p, x, z, this.seed, w)
        more *= f.more
        big = Math.max(big, f.big)
        pebble = Math.max(pebble, f.pebble ?? 0)
        if (f.k !== undefined) k = f.k
      } else if (p.kind === 'boulders') {
        more *= 1 + 14 * w
        big = Math.max(big, w)
        k = Math.min(k, 1 - 0.38 * w)
      } else if (p.kind === 'dunes') more *= 1 - w
      else more *= 1 + 0.5 * w
    }
    return { more, big, pebble, k }
  }

  /**
   * 火星の走れる範囲に足す起伏。本物の着陸地点（ゲール・クレーターの底）は 3 km で高低差 20 m ほどの平原なので、
   * 写真に出てくる地形を重ねる：ゆるい丘、段になった低い台地（ふちは急な崖）、くねくね曲がる川の跡の溝。
   * 着陸地点から 2.4 km より外では弱めて、3.4 km で 0（遠くの山並みの本物の地形とつながるように）
   */
  private marsRelief(x: number, z: number) {
    const fade = 1 - smooth(2400, 3400, Math.hypot(x, z))
    if (fade <= 0) return 0
    const s = this.seed
    // ゆるい丘（数百 m の大きさ、高さ ±10 m ほど）
    let h = (fbm(x / 330, z / 330, s + 60, 4) - 0.5) * 45
    // 台地：大きなむらの高い所を、2 段の平らな段にする（段のふちは幅 20〜30 m の急な斜面）
    const m = fbm(x / 560 + 3.1, z / 560 - 1.7, s + 61, 4) + (fbm(x / 90, z / 90, s + 65, 2) - 0.5) * 0.04
    h += smooth(0.53, 0.55, m) * 8 + smooth(0.6, 0.615, m) * 6
    // 川の跡の溝：ゆがめた雑音の「0.5 の線」に沿って掘る。断面は U 字（深さ 6 m・幅 40〜60 m）。
    // 線は輪になりやすいので、別の雑音で半分ほど途切れさせ、ところどころに残る涸れ川にする
    const wx = x + (fbm(x / 420, z / 420, s + 62, 3) - 0.5) * 520
    const wz = z + (fbm(x / 420 + 7.3, z / 420, s + 63, 3) - 0.5) * 520
    const c = Math.abs(fbm(wx / 1300, wz / 1300, s + 64, 3) - 0.5)
    const w = 0.026
    if (c < w) {
      const keep = smooth(0.46, 0.52, fbm(x / 700 + 5, z / 700, s + 67, 2))
      const u = c / w
      h -= 7 * (1 - u * u) * keep
    }
    return h * fade
  }

  /** 丸みを含めた高さ：遠いほど地平線の下へ沈む（r² / 2R） */
  private noZone = false

  /**
   * ミニマップ用の高さ：場所ごとのでこぼこ（zoneRelief）を除く。細かいこぶまで入れると、
   * 等高線が小さな輪だらけになって読みにくく、描くのもとても重くなる
   */
  mapHeight(x: number, z: number) {
    this.noZone = true
    try {
      return this.height(x, z)
    } finally {
      this.noZone = false
    }
  }

  height(x: number, z: number) {
    const r2 = x * x + z * z
    return this.sample(x, z).h - r2 / (2 * this.radiusM)
  }

  /** 地面の色（場所ごとのむら・クレーターの噴出物・割れ目）。sample() の結果を渡す */
  private colors() {
    const g1 = new THREE.Color(this.def.ground)
    const g2 = new THREE.Color(this.def.ground2)
    const ej = new THREE.Color(this.def.ejecta ?? this.def.ground)
    const crackCol = new THREE.Color(this.def.id === 'europa' ? '#8a5a35' : this.def.ground2).multiplyScalar(0.8)
    const twoTone = this.def.id === 'iapetus'
    const pal = this.pois.some((p) => FORM_KINDS.has(p.kind)) ? formPalette(this.def) : null
    return (c: THREE.Color, x: number, z: number, ejecta: number, crack: number) => {
      let m = fbm(x / 260, z / 260, this.seed + 5, 4)
      m = twoTone ? smooth(0.42, 0.58, fbm(x / 1500, z / 1500, this.seed + 6, 3)) : smooth(0.3, 0.75, m)
      c.copy(g1).lerp(g2, m)
      c.lerp(ej, Math.min(1, ejecta * 0.75))
      c.lerp(crackCol, Math.min(1, crack))
      // 見どころ：砂丘は黒っぽい玄武岩の砂、岩塊の野は少し暗く
      for (const p of this.pois) {
        if (p.kind === 'buttes') {
          // 地層の縞：段ごとに明るい層と暗い層をかわりばんこに
          const w = poiWeight(p, x, z, 0.25)
          if (w <= 0) continue
          const top = this.butteTop(p, x, z)
          if (top < 0.6) continue
          const band = Math.floor(top / 2.2) % 2
          c.lerp(band ? BUTTE_LIGHT : BUTTE_DARK, w * Math.min(1, top / 3) * (band ? 0.35 : 0.2))
          continue
        }
        const w = poiWeight(p, x, z, 0.3)
        if (w > 0 && pal && FORM_KINDS.has(p.kind)) formTint(c, pal, p, x, z, this.seed, w)
        else if (w > 0) c.lerp(p.kind === 'dunes' ? DUNE_SAND : BOULDER_GROUND, w * (p.kind === 'dunes' ? 0.7 : 0.25))
      }
      // 小さなむら
      c.multiplyScalar(0.9 + 0.2 * fbm(x / 9, z / 9, this.seed + 8, 3))
      return c
    }
  }

  /** 円形の格子の輪の数と、1 周の分割数 */
  get rings() {
    return this.dem ? { RINGS: 190, SEG: 360 } : { RINGS: 150, SEG: 240 }
  }

  /**
   * 中心ほど細かい、円形の格子の地面。中心はふだん着陸地点（cx, cz = 0）。
   * 広い範囲を走れる天体では、ローバーが遠くへ行くと、ローバーのそばを中心に作り直す
   */
  geometry(cx = 0, cz = 0) {
    const job = this.geometryJob(cx, cz)
    let r = job.next()
    while (!r.done) r = job.next()
    return r.value
  }

  /** geometry() を少しずつ作る（輪 20 本ごとに一休み。走っている間に作り直しても画面が止まらないように） */
  *geometryJob(cx = 0, cz = 0): Generator<void, THREE.BufferGeometry, void> {
    // 本物の地形は、崖や岩山の形が崩れないよう細かめに
    const { RINGS, SEG } = this.rings
    const nv = 1 + RINGS * SEG
    const pos = new Float32Array(nv * 3)
    const col = new Float32Array(nv * 3)
    const uv = new Float32Array(nv * 2)
    const c = new THREE.Color()
    const color = this.colors()
    let k = 0
    const push = (x: number, z: number) => {
      const { h, ejecta, crack } = this.sample(x, z)
      pos[k * 3] = x
      pos[k * 3 + 1] = h - (x * x + z * z) / (2 * this.radiusM)
      pos[k * 3 + 2] = z
      uv[k * 2] = x / 3
      uv[k * 2 + 1] = z / 3
      color(c, x, z, ejecta, crack)
      col[k * 3] = c.r
      col[k * 3 + 1] = c.g
      col[k * 3 + 2] = c.b
      k++
    }
    push(cx, cz)
    for (let i = 1; i <= RINGS; i++) {
      const r = FAR * (i / RINGS) ** 2.3
      for (let j = 0; j < SEG; j++) {
        const a = (j / SEG) * Math.PI * 2
        push(cx + Math.cos(a) * r, cz + Math.sin(a) * r)
      }
      if (i % 4 === 0) yield
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(this.ringIndex())
    // 法線：輪に沿った向きと、外へ向かう向きの外積（となりの頂点から。少しずつ）
    const nrm = new Float32Array(nv * 3)
    nrm[1] = 1
    const at = (i: number, j: number) => (i <= 0 ? 0 : 1 + (i - 1) * SEG + ((j + SEG) % SEG)) * 3
    for (let i = 1; i <= RINGS; i++) {
      for (let j = 0; j < SEG; j++) {
        const p0 = at(i, j - 1)
        const p1 = at(i, j + 1)
        const q0 = at(i - 1, j)
        const q1 = at(Math.min(RINGS, i + 1), j)
        const ax = pos[p1] - pos[p0]
        const ay = pos[p1 + 1] - pos[p0 + 1]
        const az = pos[p1 + 2] - pos[p0 + 2]
        const bx = pos[q1] - pos[q0]
        const by = pos[q1 + 1] - pos[q0 + 1]
        const bz = pos[q1 + 2] - pos[q0 + 2]
        const nx = ay * bz - az * by
        const ny = az * bx - ax * bz
        const nz = ax * by - ay * bx
        const l = Math.hypot(nx, ny, nz) || 1
        const o = at(i, j)
        nrm[o] = nx / l
        nrm[o + 1] = ny / l
        nrm[o + 2] = nz / l
      }
      if (i % 40 === 0) yield
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 0, cz), FAR * 1.01)
    return geo
  }

  private ringIdx: THREE.BufferAttribute | null = null
  /** 円形の格子のつなぎ方（どこを中心にしても同じなので 1 つだけ作る） */
  private ringIndex() {
    if (this.ringIdx) return this.ringIdx
    const { RINGS, SEG } = this.rings
    const idx = new Uint32Array(SEG * 3 + (RINGS - 1) * SEG * 6)
    let o = 0
    for (let j = 0; j < SEG; j++) {
      idx[o++] = 0
      idx[o++] = 1 + ((j + 1) % SEG)
      idx[o++] = 1 + j
    }
    for (let i = 1; i < RINGS; i++) {
      const a0 = 1 + (i - 1) * SEG
      const b0 = 1 + i * SEG
      for (let j = 0; j < SEG; j++) {
        const j1 = (j + 1) % SEG
        idx[o++] = a0 + j
        idx[o++] = a0 + j1
        idx[o++] = b0 + j
        idx[o++] = a0 + j1
        idx[o++] = b0 + j1
        idx[o++] = b0 + j
      }
    }
    this.ringIdx = new THREE.BufferAttribute(idx, 1)
    return this.ringIdx
  }

  /**
   * 正方形のタイルの地面（ローバーのまわりの細かい地面）。(x0, z0) が北西の角、一辺 size m、step m 間隔。
   * 法線はタイルの外の 1 つ先の高さも使って求めるので、となりのタイルと継ぎ目なくつながる。
   * ふちには下へ垂らした「すそ」を付ける（となりや粗い地面との小さなすき間をふさぐ）
   */
  tile(x0: number, z0: number, size: number, step: number) {
    const job = this.tileJob(x0, z0, size, step)
    let r = job.next()
    while (!r.done) r = job.next()
    return r.value
  }

  /** tile() を少しずつ作る（16 行ごとに一休み） */
  *tileJob(x0: number, z0: number, size: number, step: number): Generator<void, THREE.BufferGeometry, void> {
    const n = Math.round(size / step)
    const w = n + 3 // 外側に 1 つずつ余分に
    const hs = new Float32Array(w * w)
    for (let j = 0; j < w; j++) {
      for (let i = 0; i < w; i++) hs[j * w + i] = this.height(x0 + (i - 1) * step, z0 + (j - 1) * step)
      if (j % 16 === 15) yield
    }
    const v = (n + 1) * (n + 1)
    const skirt = 4 * n
    const pos = new Float32Array((v + skirt) * 3)
    const nrm = new Float32Array((v + skirt) * 3)
    const col = new Float32Array((v + skirt) * 3)
    const uv = new Float32Array((v + skirt) * 2)
    const c = new THREE.Color()
    const color = this.colors()
    let k = 0
    for (let j = 0; j <= n; j++) {
      if (j % 16 === 15) yield
      for (let i = 0; i <= n; i++, k++) {
        const x = x0 + i * step
        const z = z0 + j * step
        const at = (j + 1) * w + i + 1
        pos[k * 3] = x
        pos[k * 3 + 1] = hs[at]
        pos[k * 3 + 2] = z
        const hx = hs[at + 1] - hs[at - 1]
        const hz = hs[at + w] - hs[at - w]
        const l = Math.hypot(hx, 2 * step, hz)
        nrm[k * 3] = -hx / l
        nrm[k * 3 + 1] = (2 * step) / l
        nrm[k * 3 + 2] = -hz / l
        uv[k * 2] = x / 3
        uv[k * 2 + 1] = z / 3
        const sm = this.def.relief.cracks || this.craters.length ? this.sample(x, z) : null
        color(c, x, z, sm?.ejecta ?? 0, sm?.crack ?? 0)
        col[k * 3] = c.r
        col[k * 3 + 1] = c.g
        col[k * 3 + 2] = c.b
      }
    }
    const idx: number[] = []
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i
        idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2)
      }
    // すそ：ふちを 1 周（北→東→南→西）たどり、真下へ 3 m 下げた頂点と結ぶ
    const ring: number[] = []
    for (let i = 0; i < n; i++) ring.push(i)
    for (let j = 0; j < n; j++) ring.push(j * (n + 1) + n)
    for (let i = n; i > 0; i--) ring.push(n * (n + 1) + i)
    for (let j = n; j > 0; j--) ring.push(j * (n + 1))
    ring.forEach((src, r) => {
      const d = v + r
      for (let q = 0; q < 3; q++) {
        pos[d * 3 + q] = pos[src * 3 + q]
        nrm[d * 3 + q] = nrm[src * 3 + q]
        col[d * 3 + q] = col[src * 3 + q]
      }
      pos[d * 3 + 1] -= 3
      uv[d * 2] = uv[src * 2]
      uv[d * 2 + 1] = uv[src * 2 + 1]
    })
    for (let r = 0; r < ring.length; r++) {
      const a = ring[r]
      const b = ring[(r + 1) % ring.length]
      const a2 = v + r
      const b2 = v + ((r + 1) % ring.length)
      idx.push(a, b, a2, b, b2, a2, a, a2, b, b, a2, b2)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(idx)
    geo.computeBoundingSphere()
    return geo
  }

  /** 上向きの法線（丸みを含む） */
  normal(x: number, z: number) {
    const e = 1.2
    const hx = this.height(x + e, z) - this.height(x - e, z)
    const hz = this.height(x, z + e) - this.height(x, z - e)
    const l = Math.hypot(hx, 2 * e, hz)
    return { x: -hx / l, y: (2 * e) / l, z: -hz / l }
  }

  private rockCache = new Map<number, Rock[]>()

  /**
   * 岩の置き方（地形ラボで決めた決まり）：
   *  1. 岩は崖（急な斜面）やクレーターのふちから来るので、その近くに多い
   *  2. 群れで置く：親の岩のまわりに、割れたかけらが下り坂の方へ散らばる
   *  3. 大きさはべき分布（大岩は少しだけ、小石はたくさん）
   *  4. 急な斜面には大きな岩は留まれないので、留まれる傾きまで転がして置く（崖のふもとにたまる）
   *  5. 2〜4 割を地面に埋め、地面の傾きに沿わせる
   * 同じ数なら同じ並び（ローバーの当たり判定も同じものを使う）
   */
  rocks(count: number): Rock[] {
    const hit = this.rockCache.get(count)
    if (hit) return hit
    const rnd = seeded(this.seed + 99)
    const out = this.scatter(rnd, count, () => {
      const ang = rnd() * Math.PI * 2
      const dist = 3 + rnd() ** 1.6 * 420
      return [Math.cos(ang) * dist, Math.sin(ang) * dist]
    })
    this.rockCache.set(count, out)
    return out
  }

  /**
   * タイル（北西の角 (tx, tz)・一辺 size m）の岩。決まりは rocks() と同じ。タイルの番号から種を作るので、
   * 何度作っても同じ岩が同じ場所に出る（離れて戻ってきても変わらない）
   */
  tileRocks(tx: number, tz: number, size: number, count: number): Rock[] {
    const job = this.tileRocksJob(tx, tz, size, count)
    let r = job.next()
    while (!r.done) r = job.next()
    return r.value
  }

  /** tileRocks() を少しずつ（岩塊の野のタイルは岩が多く、一度に作ると 1 フレームが長くなるので） */
  *tileRocksJob(tx: number, tz: number, size: number, count: number): Generator<void, Rock[], void> {
    const rnd = seeded(this.seed * 7919 + (tx / size + 4096) * 9973 + (tz / size + 4096) * 7)
    let more = 1
    for (const p of this.pois) {
      const m = p.kind === 'boulders' ? 14 : (FORM_ROCK_TILE[p.kind] ?? 1)
      if (m === 1) continue
      const cx = Math.max(tx, Math.min(tx + size, p.x))
      const cz = Math.max(tz, Math.min(tz + size, p.z))
      if (Math.hypot(cx - p.x, cz - p.z) < p.r) more = Math.max(more, m)
    }
    return yield* this.scatterJob(rnd, Math.round(count * more), () => [tx + rnd() * size, tz + rnd() * size])
  }

  private scatter(rnd: () => number, count: number, pick: () => [number, number]): Rock[] {
    const job = this.scatterJob(rnd, count, pick)
    let r = job.next()
    while (!r.done) r = job.next()
    return r.value
  }

  /** 岩を置く（40 回試すごとに一休み） */
  private *scatterJob(rnd: () => number, count: number, pick: () => [number, number]): Generator<void, Rock[], void> {
    const out: Rock[] = []
    const steep = (x: number, z: number) => Math.min(1, Math.max(0, (1 - this.normal(x, z).y - 0.07) / 0.18))
    /** 岩の出やすさ：近く（5 m）に崖があるか、クレーターのふちか */
    const rockiness = (x: number, z: number) => {
      let st = steep(x, z)
      for (let k = 0; k < 4; k++) st = Math.max(st, steep(x + Math.cos(k * 1.57 + 0.4) * 5, z + Math.sin(k * 1.57 + 0.4) * 5))
      return 0.35 + 0.65 * st + 0.6 * this.sample(x, z).ejecta
    }
    const place = (x0: number, z0: number, s: number, sy: number, k = 1) => {
      let x = x0
      let z = z0
      const hold = s > 0.45 ? 0.9 : s > 0.2 ? 0.82 : 0.7
      let n = this.normal(x, z)
      for (let step = 0; step < 30 && n.y < hold; step++) {
        const l = Math.hypot(n.x, n.z) || 1
        x += (n.x / l) * 0.8
        z += (n.z / l) * 0.8
        n = this.normal(x, z)
      }
      if (n.y < hold || this.flat(x, z) > 0.3) return
      const bury = 0.15 + rnd() * 0.2
      const rock: Rock = { x, y: this.height(x, z) - s * sy * bury, z, s, sy, rot: rnd() * 6.28, tilt: 0, nx: n.x * 0.8, nz: n.z * 0.8, v: Math.floor(rnd() * 3) }
      if (k !== 1) rock.k = k
      out.push(rock)
    }
    let tries = 0
    while (out.length < count && tries < count * 20) {
      tries++
      if (tries % 40 === 0) yield
      const [x, z] = pick()
      const pr = this.pois.length ? this.poiRocks(x, z) : null
      let more = pr?.more ?? 1
      if (this.zoned) {
        // 平らな所は岩が少なく、荒れた所は多い（レースのコースの上は、地面を平らにしても岩の数はこれまでどおり。岩を跳びこすのがレースのこつ）
        const m = this.zoneMix(x, z, false)
        const w = this.lane ? this.laneW(x, z) : 0
        more *= 0.45 * m.flat + m.bumpy + (2.2 - 1.2 * w) * m.rough
      }
      if (this.flat(x, z) > 0.3) continue
      if (more <= 0.02) {
        rnd()
        continue
      }
      // 岩塊の野の中はいつも置く（崖の近さを調べる手間をはぶく）
      if (more >= 3) rnd()
      else if (rnd() > rockiness(x, z) * more) continue
      // 岩塊の野：1 m 前後の大岩が多い（ほとんどはローバーで乗り越えられる高さ）
      const u = rnd()
      const field = !!pr && pr.big > 0.3
      // 川原（タイタンのメタンの川）：こぶし〜ひと抱えくらいの丸い小石
      const big = field ? 0.1 + 1.1 * u ** 1.7 : pr && pr.pebble > 0.3 ? 0.05 + 0.32 * u ** 1.6 : 0.08 + 1.7 * u ** 4
      // 岩塊の野の岩は背が高めの角ばった塊
      const sy = field ? 0.85 + rnd() * 0.45 : 0.65 + rnd() * 0.35
      const k = pr?.k ?? 1
      place(x, z, big, sy, k)
      // かけら：親が大きいほど多く、下り坂の方へ
      const n = this.normal(x, z)
      const kids = Math.floor(rnd() * 3 + big * 6)
      for (let c = 0; c < kids && out.length < count; c++) {
        const r = (0.5 + big * 1.5) * Math.sqrt(-2 * Math.log(1 - rnd() * 0.98)) * 0.7
        const a = rnd() * 6.28
        place(x + Math.cos(a) * r + n.x * r * 1.5, z + Math.sin(a) * r + n.z * r * 1.5, Math.max(0.06, big * (0.12 + 0.45 * rnd() ** 1.8)), sy * (0.9 + rnd() * 0.2), k)
      }
    }
    return out
  }
}

/** k：明るさの倍率（岩塊の野の黒っぽい岩。なければ 1） */
export type Rock = { x: number; y: number; z: number; s: number; sy: number; rot: number; tilt: number; nx: number; nz: number; v: number; k?: number }

/**
 * 岩の形。round = true は丸い小石（タイタンの氷）。ふだんは割れた角ばった岩：
 * 細かく分けた多面体を大小の凹凸で崩し、何本かの平面で削って割れた面を作る。底は平たく（地面に埋まる側）
 */
export function rockGeometry(seed: number, round: boolean, detail = round ? 2 : 3) {
  const geo = new THREE.IcosahedronGeometry(1, detail)
  const p = geo.attributes.position as THREE.BufferAttribute
  const rnd = seeded(seed)
  const cuts = round
    ? []
    : Array.from({ length: 10 }, () => ({ v: new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize(), d: 0.5 + rnd() * 0.35 }))
  const ph = [rnd() * 10, rnd() * 10, rnd() * 10]
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const bump = round
      ? 0.9 + 0.12 * Math.sin(v.x * 2.3 + ph[0]) * Math.sin(v.z * 2.1 + ph[1])
      : 1 + 0.1 * Math.sin(v.x * 2.1 + ph[0]) * Math.sin(v.y * 2.7 + ph[1]) + 0.05 * Math.sin(v.z * 7.3 + ph[2]) * Math.sin(v.x * 6.1)
    v.multiplyScalar(bump)
    for (const c of cuts) {
      const d = v.dot(c.v)
      if (d > c.d) v.addScaledVector(c.v, c.d - d)
    }
    if (!round && v.y < -0.25) v.y = -0.25 - (v.y + 0.25) * 0.25 // 底は平たく
    p.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}

/** 細かい砂のつぶの絵（地面と岩に重ねて、近くで見ても平たく見えないように） */
let grain: THREE.CanvasTexture | null = null
export function grainTexture() {
  if (grain) return grain
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const img = g.createImageData(size, size)
  const rnd = seeded(4242)
  // 細かいノイズを、少しぼかした大きなむらに重ねる
  const coarse = new Float32Array(size * size)
  for (let i = 0; i < coarse.length; i++) coarse[i] = rnd()
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0
      for (let k = -2; k <= 2; k++) acc += coarse[((y + k + size) % size) * size + ((x + k * 2 + size) % size)]
      const v = 0.82 + 0.1 * (acc / 5) + 0.16 * rnd() + (rnd() < 0.02 ? -0.25 : 0)
      const o = (y * size + x) * 4
      const b = Math.max(0, Math.min(255, v * 230))
      img.data[o] = img.data[o + 1] = img.data[o + 2] = b
      img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  grain = new THREE.CanvasTexture(canvas)
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping
  grain.anisotropy = 4
  return grain
}
