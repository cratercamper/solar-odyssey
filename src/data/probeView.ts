// 探査機の模型の画面（右側）で使う、本物の数字。
// 探査機の位置と速さ、近くの惑星の位置、地球の向き、字幕の場面と、字幕に入れる数字を求める。
import { PLANETS } from './bodies'
import { AU_KM, encounterPlanet, encounterRelative, heliocentric, nearestEncounter, speedKmS, type Encounter, type Trajectory } from './trajectory'

const DEG = Math.PI / 180
const DAY_MS = 86_400_000
const J2000_MS = Date.UTC(2000, 0, 1, 12)
/** 地球の自転軸の傾き（黄道に対して）。赤道座標を黄道座標に直すのに使う */
const OBLIQUITY = 23.439 * DEG

type Vec = [number, number, number]

/** 赤道座標（赤経・赤緯）の向きを、黄道座標の単位ベクトルに */
export function equatorialToEcliptic(raDeg: number, decDeg: number): Vec {
  const x = Math.cos(decDeg * DEG) * Math.cos(raDeg * DEG)
  const y = Math.cos(decDeg * DEG) * Math.sin(raDeg * DEG)
  const z = Math.sin(decDeg * DEG)
  return [x, Math.cos(OBLIQUITY) * y + Math.sin(OBLIQUITY) * z, -Math.sin(OBLIQUITY) * y + Math.cos(OBLIQUITY) * z]
}

/** 惑星の北極の向き（IAU の値、J2000 の赤経・赤緯） */
const POLES: Record<string, [number, number]> = {
  venus: [272.76, 67.16],
  earth: [0, 90],
  jupiter: [268.057, 64.495],
  saturn: [40.589, 83.537],
  uranus: [257.311, -15.175],
  neptune: [299.36, 43.46],
}
/** リュウグウの自転軸（黄経 179.3°・黄緯 −87.4°、Watanabe ほか 2019）。ほぼ黄道の南を向き、逆向きに回る */
const RYUGU_POLE: Vec = (() => {
  const lon = 179.3 * DEG
  const lat = -87.4 * DEG
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
})()
/** リュウグウの自転の周期（時間） */
export const RYUGU_ROTATION_HOURS = 7.63
export const poleOf = (id: string): Vec => (id === 'ryugu' ? RYUGU_POLE : equatorialToEcliptic(...(POLES[id] ?? [0, 90])))

/** 地球の本初子午線（経度0）の向き（黄道座標）。グリニッジ恒星時から。打ち上げの日の地球の向きを本物にするため */
export function earthPrimeMeridian(ms: number): Vec {
  const gmst = (280.46061837 + 360.98564736629 * ((ms - J2000_MS) / DAY_MS)) * DEG
  return equatorialToEcliptic(gmst / DEG, 0)
}

/** 月の位置（地球中心、km、黄道座標）。平均の動きだけのおおよそ（打ち上げの場面で、月の方向を見せる） */
export function moonGeocentric(ms: number): Vec {
  const d = (ms - J2000_MS) / DAY_MS
  const L = (218.316 + 13.176396 * d) * DEG
  const M = (134.963 + 13.064993 * d) * DEG
  const F = (93.272 + 13.22935 * d) * DEG
  const lon = L + 6.289 * DEG * Math.sin(M)
  const lat = 5.128 * DEG * Math.sin(F)
  const r = 385_001 - 20_905 * Math.cos(M)
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)]
}

/** 地球の太陽中心の位置（天文単位、黄道座標）。アプリの惑星と同じ求め方（向きは本物、距離は1） */
export function earthHelio(ms: number): Vec {
  // data/ephemeris.ts の地球と同じ軌道要素（JPL の近似値）。ここでは画面の文言を読み込まないよう、地球の分だけ持つ
  const days = (ms - J2000_MS) / DAY_MS
  const L = (100.46457166 + (35999.37244981 * days) / 36_525) * DEG
  const peri = 102.93768193 * DEG
  const M = L - peri
  const e = 0.01671123
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 5; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
  const a = peri + nu
  const r = 1 - e * Math.cos(E)
  return [Math.cos(a) * r, Math.sin(a) * r, 0]
}

/** 天体の半径（km）。リュウグウは、はやぶさ2が表面まで降りたときの中心からの距離（赤道のあたり） */
export const planetRadiusKm = (id: string) => (id === 'ryugu' ? 0.46 : (PLANETS.find((p) => p.id === id)?.radiusKm ?? 1000))

/** その時刻の、模型の画面に要る数字 */
export type ProbeNow = {
  ms: number
  /** 太陽中心の位置（天文単位）と速度（天文単位／日）、黄道座標 */
  r: Vec
  v: Vec
  /** 太陽から見た速さ（km/s） */
  speed: number
  /** 太陽からの距離（天文単位） */
  sunAu: number
  /** 地球からの距離（km） */
  earthKm: number
  /** いちばん近い通過と、そこからの日数 */
  encounter: Encounter
  days: number
  /** 通過する惑星から見た位置（km）と速度（km/s）。惑星の重力で進める範囲の中だけ */
  rel: Vec | null
  relV: Vec | null
}

export function probeNow(t: Trajectory, ms: number): ProbeNow {
  const s = heliocentric(t, ms)
  const { encounter, days } = nearestEncounter(t, ms)
  const inside = Math.abs(days) < encounter.window
  const q = inside ? encounterRelative(encounter, ms) : null
  const e = earthHelio(ms)
  const earthKm = Math.hypot(s.r[0] - e[0], s.r[1] - e[1], s.r[2] - e[2]) * AU_KM
  return {
    ms,
    r: s.r,
    v: s.v,
    speed: speedKmS(s),
    sunAu: Math.hypot(...s.r),
    earthKm,
    encounter,
    days,
    rel: q ? q.r : null,
    relV: q ? q.v : null,
  }
}

const angle = (a: Vec, b: Vec) => Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b))))) / DEG

/** 通過の前後の数字：太陽から見た速さ（前・後）、曲がった角度、最接近の雲の上からの高さ、惑星の公転の速さ */
export function flybyNumbers(t: Trajectory, e: Encounter) {
  const before = heliocentric(t, e.ms - e.window * DAY_MS)
  const after = heliocentric(t, e.ms + e.window * DAY_MS)
  const inRel = encounterRelative(e, e.ms - e.window * 0.5 * DAY_MS).v
  const outRel = encounterRelative(e, e.ms + e.window * 0.5 * DAY_MS).v
  const p = encounterPlanet(e, e.ms)
  const closest = Math.hypot(e.rel[0], e.rel[1], e.rel[2])
  return {
    speedBefore: speedKmS(before),
    speedAfter: speedKmS(after),
    /** 惑星から見た速さ（近づくときと離れるとき、ほぼ同じ） */
    relSpeed: Math.hypot(...inRel),
    /** 太陽から見た進む向きが変わった角度 */
    turnSun: angle(before.v, after.v),
    /** 惑星から見た進む向きが変わった角度 */
    turnPlanet: angle(inRel, outRel),
    closestKm: closest,
    altitudeKm: closest - planetRadiusKm(e.body),
    planetSpeed: speedKmS(p),
  }
}

/** 字幕の場面。index は道すじの encounters の何番目か */
export type CaptionScene =
  | { kind: 'launch'; step: 0 | 1 | 2 }
  | { kind: 'flyby'; body: string; index: number; step: 0 | 1 | 2 | 3 | 4 }
  | { kind: 'stay'; body: string; step: 'approach' | 'home' | 'dip' | 'depart'; dip: number }
  | { kind: 'cruise'; after: number }
  | { kind: 'beyond' }

/** 最接近の前後で、字幕を変える境目（日）。惑星の大きさと速さで、ちょうど見どころに合うように */
const CLOSE_DAYS: Record<string, number> = { jupiter: 0.35, saturn: 0.2, uranus: 0.15, neptune: 0.08 }
/** とどまるあいだ、降りていく前後の何日を「タッチダウンの場面」にするか */
const DIP_DAYS = 1.2
/** 着いてから何日を「到着の場面」にするか */
const ARRIVE_DAYS = 4

export function captionScene(t: Trajectory, now: ProbeNow): CaptionScene {
  const e = now.encounter
  const d = now.days
  const index = t.encounters.indexOf(e)
  if (index === 0 && d < 6) return { kind: 'launch', step: d < 0.35 ? 0 : d < 2 ? 1 : 2 }
  if (e.until !== undefined && Math.abs(d) < e.window) {
    if (d < 0 || (d === 0 && now.ms - e.ms < ARRIVE_DAYS * DAY_MS)) return { kind: 'stay', body: e.body, step: 'approach', dip: -1 }
    // 見どころ：タッチダウン（前後 DIP_DAYS 日）か、とどまるあいだの見どころ（前後 days 日）
    const marks = e.hover ? e.hover.dips.map((x) => ({ ms: x.ms, days: DIP_DAYS })) : (e.moments ?? [])
    const dip = marks.findIndex((x) => Math.abs(x.ms - now.ms) < x.days * DAY_MS)
    if (dip < 0 && (d > 0 || (!e.moments && e.until - now.ms < 2 * DAY_MS))) return { kind: 'stay', body: e.body, step: 'depart', dip: -1 }
    return { kind: 'stay', body: e.body, step: dip >= 0 ? 'dip' : 'home', dip }
  }
  if (index > 0 && Math.abs(d) < e.window) {
    const c = CLOSE_DAYS[e.body] ?? 0.2
    const step = d < -c * 8 ? 0 : d < -c ? 1 : d <= c ? 2 : d < c * 10 ? 3 : 4
    return { kind: 'flyby', body: e.body, index, step }
  }
  const last = t.encounters[t.encounters.length - 1]
  if (now.ms > last.ms) return { kind: 'beyond' }
  // 惑星と惑星のあいだ（字幕は、画面の側で数秒ごとに順に変える）。after は最後に通った天体の番号（その見どころを最初に出す）
  let after = 0
  t.encounters.forEach((x, i) => {
    if (x.ms < now.ms) after = i
  })
  return { kind: 'cruise', after }
}
