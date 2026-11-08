import { PLANETS } from './bodies'
import type { SurfaceSitesJa } from '../i18n/surfaceSites.ja'

// 着陸できる天体（地表のある惑星・衛星・冥王星とカロン）の、地表の景色の設定。
// 色や地形は探査機の写真をもとにした「それらしい」作り。空に浮かぶ母惑星の見かけの大きさは、
// 半径と距離から計算した本当の大きさ（度）。

export type Relief = {
  /** なだらかな起伏の高さ（m）と、その波長（m） */
  hills: number
  hillScale: number
  /** クレーターの多さ（0〜1）と、いちばん大きいクレーターの半径（m） */
  craters: number
  craterMax: number
  /** 岩の多さ（0〜1） */
  rocks: number
  /** 砂丘（風の吹く天体）の高さ（m） */
  dunes?: number
  /** 氷の割れ目の筋（0〜1） */
  cracks?: number
  /** 遠くの山並みの高さ（m） */
  mountains?: number
}

export type SkyBody = {
  /** テクスチャの名前（data/textures.ts）か、無ければ色で描く天体の id */
  id: string
  color: string
  /** 見かけの直径（度） */
  angle: number
  el: number
  az: number
  /** 輪（土星）：見える開き具合（度。衛星は土星の赤道の上を回るので、ほとんど真横から見える） */
  ringOpen?: number
}

export type SurfaceDef = {
  id: string
  /** 同じ天体の別の着陸地点（火星の峡谷レース場 'coprates' など）。無ければふつうの着陸地点 */
  site?: string
  ground: string
  ground2: string
  rock: string
  /** クレーターのふちの明るい噴出物 */
  ejecta?: string
  relief: Relief
  /** 空の色（大気が無ければ null で黒い空） */
  sky: { zenith: string; horizon: string } | null
  /** もやの濃さ（0〜1）と色 */
  haze: number
  hazeColor: string
  /** 厚い雲やもやで、太陽の形が見えない */
  sunHidden?: boolean
  /** 露出の補正（EV）。暗く沈みすぎる天体の地面を、少しだけ明るく見せる */
  ev?: number
  /** 地面の表面のざらつき（0 つるつる〜1 ざらざら）。書いていなければ地面の種類の値 */
  groundRough?: number
  /** 星の見え方（0〜1） */
  stars: number
  sunEl: number
  sunAz: number
  /** 降りるときに砂ぼこりが舞う */
  dust: boolean
  /** 重力（地球 = 1）、気温（℃） */
  gravity: number
  temp: [number, number]
  /** 太陽からの距離（au）。太陽の見かけの大きさと明るさに使う */
  au: number
  /** 天体の半径（km）。小さな天体ほど地平線が丸く近い */
  radiusKm: number
  skyBody?: SkyBody
  extras?: ('plumes' | 'volcano' | 'geysers' | 'clouds')[]
}

type Base = Omit<SurfaceDef, 'id' | 'au' | 'radiusKm' | 'skyBody' | 'gravity' | 'temp'>

const airless = (ground: string, ground2: string, rock: string, relief: Partial<Relief> = {}, extra: Partial<Base> = {}): Base => ({
  ground,
  ground2,
  rock,
  ejecta: undefined,
  relief: { hills: 14, hillScale: 420, craters: 0.6, craterMax: 160, rocks: 0.5, ...relief },
  sky: null,
  haze: 0,
  hazeColor: '#000000',
  stars: 1,
  sunEl: 24,
  sunAz: 150,
  dust: true,
  ...extra,
})

const BASE: Record<string, Base> = {
  mercury: airless('#8c867e', '#6f6a64', '#5a5550', { craters: 0.75, craterMax: 220, hills: 20 }, { ejecta: '#a9a39a', sunEl: 14 }),
  venus: {
    ground: '#9c7a52', ground2: '#6e573d', rock: '#58493a',
    relief: { hills: 10, hillScale: 600, craters: 0.02, craterMax: 60, rocks: 0.7, mountains: 260 },
    sky: { zenith: '#8a5a1e', horizon: '#c9862e' }, haze: 0.75, hazeColor: '#b9772c', sunHidden: true, stars: 0,
    sunEl: 50, sunAz: 150, dust: false,
  },
  // 地球の着陸地点はモニュメント・バレー（赤い砂と砂岩の岩山。地形は本物の標高データ）
  earth: {
    ground: '#b4643a', ground2: '#c98b58', rock: '#9a4a2c',
    relief: { hills: 18, hillScale: 500, craters: 0, craterMax: 0, rocks: 0.35, mountains: 420 },
    sky: { zenith: '#2f6fd6', horizon: '#b9d6f2' }, haze: 0.25, hazeColor: '#d8c2a8', stars: 0,
    sunEl: 38, sunAz: 150, dust: true, extras: ['clouds'],
  },
  moon: airless('#8e8b86', '#6f6c68', '#5d5a56', { craters: 0.8, craterMax: 200, hills: 16, mountains: 300 }, { ejecta: '#b3afa8' }),
  mars: {
    // 写真（キュリオシティ）に合わせた、くすんだ茶色の砂と、黒っぽい岩
    ground: '#9a6446', ground2: '#7a4c34', rock: '#40312a',
    relief: { hills: 12, hillScale: 380, craters: 0.15, craterMax: 90, rocks: 0.85, mountains: 380 },
    sky: { zenith: '#b88a62', horizon: '#e0b48a' }, haze: 0.35, hazeColor: '#d4a07a', stars: 0.05,
    sunEl: 24, sunAz: 150, dust: true,
  },
  phobos: airless('#5f554c', '#4a423b', '#3f3832', { craters: 0.7, craterMax: 120, hills: 8, rocks: 0.6 }),
  deimos: airless('#7b6e60', '#665b4f', '#4f463e', { craters: 0.35, craterMax: 80, hills: 6, rocks: 0.25 }),
  io: {
    ...airless('#c9b24a', '#a9822e', '#3b3128', { craters: 0, craterMax: 0, hills: 10, rocks: 0.3, mountains: 520 }),
    ground2: '#c97a2a', ejecta: '#e8dfa0', extras: ['volcano'],
  },
  europa: airless('#dbd5c8', '#c6b496', '#9b8f7d', { craters: 0.04, craterMax: 50, hills: 6, rocks: 0.35, cracks: 0.9 }, { ejecta: '#e9e4da' }),
  ganymede: airless('#8d8478', '#b2a998', '#6d665c', { craters: 0.45, craterMax: 160, hills: 12, cracks: 0.4 }, { ejecta: '#cfc7b8' }),
  callisto: airless('#5b5348', '#463f37', '#3a342e', { craters: 0.95, craterMax: 190, hills: 12 }, { ejecta: '#c7c0b4' }),
  mimas: airless('#a9a7a3', '#8f8d89', '#7b7976', { craters: 0.9, craterMax: 180 }),
  enceladus: airless('#e9eef4', '#cfd8e2', '#b9c3cf', { craters: 0.15, craterMax: 70, hills: 8, cracks: 0.8, rocks: 0.2 }, { extras: ['plumes'], dust: false }),
  tethys: airless('#c9c7c3', '#b1afab', '#9a9894', { craters: 0.75, craterMax: 170 }),
  dione: airless('#bdbdbd', '#9e9e9e', '#8a8a8a', { craters: 0.65, craterMax: 160, cracks: 0.25 }),
  rhea: airless('#b5b3b0', '#9a9894', '#878581', { craters: 0.85, craterMax: 180 }),
  titan: {
    ground: '#bf9a68', ground2: '#957650', rock: '#e2d0a6',
    relief: { hills: 8, hillScale: 500, craters: 0.02, craterMax: 50, rocks: 0.45, dunes: 5 },
    sky: { zenith: '#a8692a', horizon: '#d99a4a' }, haze: 0.8, hazeColor: '#c98a3c', sunHidden: true, stars: 0,
    sunEl: 30, sunAz: 150, dust: false, ev: 1,
  },
  iapetus: airless('#d8d2c4', '#3a2f26', '#6f665a', { craters: 0.8, craterMax: 190, mountains: 600 }),
  miranda: airless('#a8a49e', '#8f8b85', '#77736e', { craters: 0.35, craterMax: 100, cracks: 0.5, mountains: 700 }),
  ariel: airless('#c3c1bc', '#a8a6a1', '#86827c', { craters: 0.45, craterMax: 120, cracks: 0.35 }),
  umbriel: airless('#5f5c58', '#4b4845', '#3e3c39', { craters: 0.9, craterMax: 170 }, { ejecta: '#9a958e' }),
  titania: airless('#9e968d', '#857e76', '#6f6962', { craters: 0.6, craterMax: 150, cracks: 0.25, rocks: 0.75 }),
  oberon: airless('#8e7f73', '#71655b', '#5f564e', { craters: 0.8, craterMax: 170 }),
  proteus: airless('#686460', '#55524d', '#484540', { craters: 0.7, craterMax: 110, rocks: 0.4 }, { ev: 0.6 }),
  triton: airless('#d8c4b9', '#bca69c', '#8c7d75', { craters: 0.08, craterMax: 50, hills: 6, cracks: 0.4, rocks: 0.2 }, {
    sky: { zenith: '#000000', horizon: '#1a2033' }, haze: 0.08, hazeColor: '#3a4660', extras: ['geysers'], dust: false,
  }),
  pluto: airless('#d9c9b0', '#b78f6a', '#8a6c52', { craters: 0.1, craterMax: 70, hills: 6, rocks: 0.25, mountains: 900 }, {
    sky: { zenith: '#000000', horizon: '#24345c' }, haze: 0.12, hazeColor: '#3d5590', dust: false,
  }),
  charon: airless('#a9a39b', '#8e8780', '#77716a', { craters: 0.55, craterMax: 140, cracks: 0.3 }),
}

// 重力（地球 = 1）と気温（℃：低い〜高い）
const PHYS: Record<string, [number, [number, number]]> = {
  mercury: [0.38, [-170, 430]], venus: [0.9, [460, 470]], earth: [1, [-10, 30]], moon: [0.165, [-170, 120]],
  mars: [0.38, [-110, 20]], phobos: [0.0006, [-110, -5]], deimos: [0.0003, [-110, -20]],
  io: [0.183, [-160, -130]], europa: [0.134, [-220, -150]], ganymede: [0.146, [-200, -120]], callisto: [0.126, [-190, -110]],
  mimas: [0.0065, [-210, -180]], enceladus: [0.0115, [-240, -190]], tethys: [0.015, [-210, -185]], dione: [0.0237, [-210, -185]],
  rhea: [0.0269, [-220, -175]], titan: [0.138, [-180, -178]], iapetus: [0.0228, [-230, -140]],
  miranda: [0.0079, [-220, -185]], ariel: [0.0274, [-220, -185]], umbriel: [0.0234, [-220, -190]], titania: [0.0385, [-220, -190]],
  oberon: [0.0354, [-220, -190]], proteus: [0.007, [-225, -215]], triton: [0.0794, [-238, -230]],
  pluto: [0.063, [-240, -218]], charon: [0.0294, [-240, -215]],
}

const SATURN_MOON_TILT: Record<string, number> = { iapetus: 15 }

const deg = (rad: number) => (rad * 180) / Math.PI

function build(): Map<string, SurfaceDef> {
  const out = new Map<string, SurfaceDef>()
  for (const p of PLANETS) {
    const gas = ['jupiter', 'saturn', 'uranus', 'neptune'].includes(p.id)
    const entries: { id: string; radiusKm: number; sky?: SkyBody }[] = []
    if (!gas) {
      // 惑星の空に浮かぶ衛星：地球の月、冥王星のカロン
      const m = p.moons[0]
      const sky = p.id === 'earth' || p.id === 'pluto'
        ? { id: m.id, color: m.color, angle: deg(2 * Math.atan(m.radiusKm / m.distanceKm)), el: 34, az: -30 }
        : undefined
      entries.push({ id: p.id, radiusKm: p.radiusKm, sky })
    }
    for (const m of p.moons) {
      const angle = deg(2 * Math.atan(p.radiusKm / m.distanceKm))
      const ringOpen = p.ring ? (SATURN_MOON_TILT[m.id] ?? 2) : undefined
      // 大きく見えるほど低めに置いて、地平線と一緒に入るように
      const el = Math.min(32, 12 + angle * 0.45)
      entries.push({ id: m.id, radiusKm: m.radiusKm, sky: { id: p.id, color: p.color, angle, el, az: -18, ringOpen } })
    }
    for (const e of entries) {
      const base = BASE[e.id]
      const phys = PHYS[e.id]
      if (!base || !phys) continue
      out.set(e.id, {
        ...base,
        id: e.id,
        au: p.distanceAu,
        radiusKm: e.radiusKm,
        gravity: phys[0],
        temp: phys[1],
        skyBody: e.sky,
      })
    }
  }
  return out
}

export const SURFACES = build()

export const surfaceFor = (id: string) => SURFACES.get(id) ?? null

type Site = { body: string; dem: string; range?: number; look?: { ground?: string; ground2?: string; ev?: number; groundRough?: number } }
/** 別の着陸地点。dem：本物の地形の地図（public/terrain/ の名前） */
/** range：ローバーで走れる範囲（正方形の半分の幅、m）。書いていなければ wideGround.ts の SITE_RANGE */
export const SITES: Record<string, Site> = {
  coprates: {
    body: 'mars',
    dem: 'mars_coprates',
  },
  taurus: {
    body: 'moon',
    dem: 'moon_taurus',
    // アポロ17号の観測点2（西南西へ 7.2 km）まで走れるように。地形の地図（near）は 16 km 四方
    range: 7000,
  },
  conamara: {
    body: 'europa',
    dem: 'europa_conamara',
    // 若い氷の帯：ふつうのエウロパの地面より少し白く。白い地面が日を照り返してまぶしすぎないよう、
    // 露出を下げ、表面はざらざら（霜）にして、太陽の向こう側の大きな照り返しを抑える
    look: { ground: '#dcd8d0', ground2: '#c9c1b3', ev: -0.7, groundRough: 0.92 },
  },
  // id は src/i18n/surfaceSites.ja.ts と同じ：文言のない着陸地点（文言だけのものも）は型エラー
} satisfies Record<keyof SurfaceSitesJa, Site>

const siteCache = new Map<string, SurfaceDef>()
/** 着陸地点つきの天体の設定（site が無ければ surfaceFor と同じ） */
export function siteDef(id: string, site: string | null | undefined): SurfaceDef | null {
  const base = surfaceFor(id)
  if (!base || !site || SITES[site]?.body !== id) return base
  const key = `${id}:${site}`
  let d = siteCache.get(key)
  if (!d) {
    // 峡谷の壁（南へ 15 km、高さ 8 km）が霞に消えないよう、もやは少しうすめ
    d = { ...base, ...SITES[site].look, site, haze: base.haze * 0.6 }
    siteCache.set(key, d)
  }
  return d
}

/** 本物の地形の地図の名前（public/terrain/）。別の着陸地点はその地図 */
export const demIdFor = (def: SurfaceDef) => (def.site ? SITES[def.site]?.dem ?? def.id : def.id)
