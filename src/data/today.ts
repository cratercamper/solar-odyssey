// 今日の宇宙：今日の月の形と、今夜見える惑星を日付から計算する。
// 惑星の位置は data/ephemeris.ts と同じ JPL（Standish）の近似の軌道要素。地球から見た方向だけ使うので、
// 黄道の面からの傾き（数度）は無視する。月の形は平均の満ち欠けの周期から（±半日くらいずれる）

const DEG = Math.PI / 180
/** 2000年1月1日12時（世界時）からの日数 */
const daysAt = (ms: number) => (ms - Date.UTC(2000, 0, 1, 12)) / 86_400_000

/** ケプラーの方程式（data/ephemeris.ts と同じ。あちらは文言を読み込むので、計算だけのここでは持たない） */
function trueAnomaly(M: number, e: number) {
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  return { nu: 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)), E }
}

/** 平均黄経（度）、100年あたりの変化（度）、近日点の黄経（度）、離心率、軌道の半径（天文単位） */
const ORBITS: Record<string, { L: number; rate: number; peri: number; e: number; a: number }> = {
  mercury: { L: 252.2503235, rate: 149472.67411175, peri: 77.45779628, e: 0.20563593, a: 0.38709927 },
  venus: { L: 181.9790995, rate: 58517.81538729, peri: 131.60246718, e: 0.00677672, a: 0.72333566 },
  earth: { L: 100.46457166, rate: 35999.37244981, peri: 102.93768193, e: 0.01671123, a: 1.00000261 },
  mars: { L: -4.55343205, rate: 19140.30268499, peri: -23.94362959, e: 0.0933941, a: 1.52371034 },
  jupiter: { L: 34.39644051, rate: 3034.74612775, peri: 14.72847983, e: 0.04838624, a: 5.20288700 },
  saturn: { L: 49.95424423, rate: 1222.49362201, peri: 92.59887831, e: 0.05386179, a: 9.53667594 },
  uranus: { L: 313.23810451, rate: 428.48202785, peri: 170.9542763, e: 0.04725744, a: 19.18916464 },
  neptune: { L: -55.12002969, rate: 218.45945325, peri: 44.96476227, e: 0.00859048, a: 30.06992276 },
}

/** 太陽から見た位置（黄道の面の x, y、天文単位） */
function helio(id: string, days: number) {
  const o = ORBITS[id]
  const L = (o.L + (o.rate * days) / 36_525) * DEG
  const peri = o.peri * DEG
  const { nu, E } = trueAnomaly(L - peri, o.e)
  const r = o.a * (1 - o.e * Math.cos(E))
  const lon = peri + nu
  return { x: r * Math.cos(lon), y: r * Math.sin(lon), r }
}

/** 角度を −180〜180 度に */
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180

export type PlanetSky = {
  id: string
  /** 地球から見た、太陽からの離れ角（度、0〜180） */
  elongation: number
  /** 太陽の東側（夕方の西の空に見える）か */
  evening: boolean
  /** 地球からの距離（天文単位） */
  distanceAu: number
  /** 今夜、目で見やすいか（太陽から 20 度以上離れている） */
  visible: boolean
  /** 一晩じゅう見える（太陽と反対の側、離れ角 150 度以上） */
  allNight: boolean
}

/** 目で見える 5 つの惑星（天王星・海王星は望遠鏡がいる） */
export const NAKED_EYE = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const

/** その日（ミリ秒）の、地球から見た惑星の様子 */
export function planetSky(id: string, ms: number): PlanetSky {
  const days = daysAt(ms)
  const e = helio('earth', days)
  const p = helio(id, days)
  // 地球から見た太陽の方向と、惑星の方向
  const sunLon = Math.atan2(-e.y, -e.x) / DEG
  const dx = p.x - e.x
  const dy = p.y - e.y
  const pLon = Math.atan2(dy, dx) / DEG
  const diff = wrap(pLon - sunLon)
  const elongation = Math.abs(diff)
  // 内側の惑星は太陽から一定以上離れないので、20 度で見やすさを分ける（水星は最大でも約 28 度）
  const visible = elongation >= 20
  return { id, elongation, evening: diff > 0, distanceAu: Math.hypot(dx, dy), visible, allNight: elongation >= 150 }
}

/** 平均の満ち欠けの周期（日） */
export const SYNODIC_MONTH = 29.530588853
/** 基準の新月：2000年1月6日 18時14分（世界時） */
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14)

export type MoonPhaseName = 'new' | 'waxingCrescent' | 'firstQuarter' | 'waxingGibbous' | 'full' | 'waningGibbous' | 'lastQuarter' | 'waningCrescent'

/** その日の月の形：月齢（日）、光っている割合（0〜1）、呼び名 */
export function moonPhase(ms: number) {
  const age = ((((ms - NEW_MOON_MS) / 86_400_000) % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH
  const angle = (age / SYNODIC_MONTH) * 2 * Math.PI
  const lit = (1 - Math.cos(angle)) / 2
  const name: MoonPhaseName =
    age < 1.5 || age >= 28.0
      ? 'new'
      : age < 6.4
        ? 'waxingCrescent'
        : age < 8.4
          ? 'firstQuarter'
          : age < 13.8
            ? 'waxingGibbous'
            : age < 15.8
              ? 'full'
              : age < 21.1
                ? 'waningGibbous'
                : age < 23.1
                  ? 'lastQuarter'
                  : 'waningCrescent'
  return { age, lit, name, waxing: age < SYNODIC_MONTH / 2 }
}

/** 今日の、地球と太陽の距離（天文単位） */
export const earthSunAu = (ms: number) => helio('earth', daysAt(ms)).r
