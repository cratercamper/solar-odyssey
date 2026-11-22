// 水のコップの実験（components/surface/WaterCup.tsx）：地表に置いた水が、その星の気温と気圧で
// 凍る・沸く・消える。量はすべて「最初の水の重さ」に対する割合。
//
// ・気圧が水の三重点（0.611 kPa）より低い（月・水星・氷の衛星・火星）：水は液体でいられない。
//   置いたとたんに沸騰し、蒸発で熱をうばわれて 0℃ まで冷え、残りが凍る（およそ 8 割が氷になって残る）。
//   氷はその後、日ざしの熱で少しずつ直接気体になる（昇華）。夜や、とても寒い星では残り続ける。
// ・空気のある星（地球・金星・タイタン）：水の温度がまわりの温度へ近づく。0℃ で凍り、沸点で沸く。
//   沸点は気圧で変わる（クラウジウス＝クラペイロンの式）。金星の 92 気圧では約 300℃ で沸く。

/** 地表の気圧（kPa）。ここに無い星は、ほぼ真空 */
const PRESSURE: Record<string, number> = { earth: 101.3, venus: 9200, mars: 0.6, titan: 147 }
/**
 * 水がまわりの温度に近づく速さ（秒、温度差が 1/e になるまで）。1 L のビーカーで、濃い空気ほど熱をよく運ぶ。
 * 金星は 92 気圧の熱い二酸化炭素、タイタンは 1.5 気圧の冷たい窒素。真空は放射だけ
 */
const TAU: Record<string, number> = { earth: 6000, venus: 800, titan: 2500, mars: 15000 }
const TAU_VACUUM = 20000

/** 水の三重点（kPa）：これより低い気圧では、水は液体でいられない */
export const TRIPLE_KPA = 0.611
/** 温度 1℃ ぶんの熱で、何℃ぶんの水が… （比熱 4.18 J/g/K に対する潜熱） */
const FUSE = 334 / 4.18
const VAPOR = 2257 / 4.18
/** 真空で日ざしを受けた氷の昇華（1 au の真上の太陽で、ビーカーの氷が半日ほどで消える：1 秒あたりの割合。見やすく少し速め） */
const SUBLIME = 3e-5

export const pressureKPa = (id: string) => PRESSURE[id] ?? 0

/** 沸点（℃）。三重点より低い気圧では null（液体にならない） */
export function boilingPoint(kPa: number): number | null {
  if (kPa < TRIPLE_KPA) return null
  const R = 8.314
  const L = 40660
  return 1 / (1 / 373.15 - (R * Math.log(kPa / 101.325)) / L) - 273.15
}

export type Water = {
  /** 水（氷）の温度（℃） */
  temp: number
  /** 液体の水・氷の割合（最初の水 = 1） */
  liquid: number
  ice: number
  /** 沸き立つ強さ（0〜1）、凍っていく途中か、昇華している強さ（0〜1） */
  boil: number
  freezing: boolean
  sublime: number
  /** 真空で、いきなり沸いた（一度でも）／金星などで、沸騰で消えた */
  flashed: boolean
}

export const freshWater = (): Water => ({ temp: 20, liquid: 1, ice: 0, boil: 0, freezing: false, sublime: 0, flashed: false })

export type Env = {
  id: string
  /** 地面の温度（℃） */
  temp: number
  /** 日ざしの強さ（地球の晴れた日の真昼 = 1） */
  sun: number
}

/** どんな結末になる星か（カードの言葉を選ぶ） */
export type Regime = 'vacuum' | 'thin' | 'liquid' | 'freeze' | 'boil'

export function regimeOf(id: string, temp: number): Regime {
  const p = pressureKPa(id)
  if (p < TRIPLE_KPA) return id === 'mars' ? 'thin' : 'vacuum'
  const tb = boilingPoint(p)!
  if (temp >= tb) return 'boil'
  if (temp <= 0) return 'freeze'
  return 'liquid'
}

/**
 * dtReal 秒（画面の時間）ぶん進める。sim は、画面の 1 秒が星の上の何秒か（早回し）。
 * 真空でいきなり沸いて凍るところは、本当に数秒で起きるので、画面の時間で進める
 */
export function stepWater(w: Water, env: Env, dtReal: number, sim: number): Water {
  const o = { ...w }
  const p = pressureKPa(env.id)
  const dt = dtReal * sim
  const tau = p < TRIPLE_KPA ? (env.id === 'mars' ? TAU.mars : TAU_VACUUM) : (TAU[env.id] ?? TAU.earth)
  o.boil = 0
  o.freezing = false
  o.sublime = 0

  if (p < TRIPLE_KPA) {
    if (o.liquid > 0) {
      o.flashed = true
      o.boil = 1
      if (o.temp > 0.05) {
        // 沸騰の蒸発で冷える：冷えたぶんの熱が、水を気体にする
        const dT = Math.min(o.temp, o.temp * (1 - Math.exp(-dtReal / 0.45)) + 4 * dtReal)
        o.temp -= dT
        o.liquid = Math.max(0, o.liquid - (o.liquid * dT) / VAPOR)
      } else {
        // 0℃ で凍っていく：凍らせる熱も、まわりの水の蒸発がうばう
        o.temp = 0
        o.freezing = true
        const x = Math.min(o.liquid / (1 + FUSE / VAPOR), 0.6 * dtReal)
        o.ice += x
        o.liquid = Math.max(0, o.liquid - x * (1 + FUSE / VAPOR))
        if (o.liquid < 1e-4) o.liquid = 0
      }
      return o
    }
    // 氷：まわりの温度へ近づく。日なたでも、昇華が熱をうばうので −55℃ くらいにとどまる（溶けずに気体になる）
    const target = Math.min(env.temp, -55)
    o.temp = Math.min(0, target + (o.temp - target) * Math.exp(-dt / (tau / 6)))
    // 昇華：日ざしの熱しだい。とても冷たい氷はほとんど気体にならない
    const warm = Math.min(1, Math.exp((env.temp + 60) / 12))
    const rate = SUBLIME * env.sun * warm * (env.id === 'mars' ? 0.3 : 1)
    if (o.ice > 0 && rate > 0) {
      o.sublime = Math.min(1, rate * sim * 20)
      o.ice = Math.max(0, o.ice - rate * dt)
    }
    return o
  }

  // 空気のある星
  const tb = boilingPoint(p)!
  const total = o.liquid + o.ice
  if (total <= 0) return o
  let T = env.temp + (o.temp - env.temp) * Math.exp(-dt / tau)
  if (o.liquid > 0 && T >= tb) {
    // 沸点で止まり、入ってくる熱が水を気体にする
    T = tb
    const loss = ((env.temp - tb) / (VAPOR * tau)) * dt
    o.liquid = Math.max(0, o.liquid - loss)
    o.boil = Math.min(1, 0.35 + (env.temp - tb) / 120)
    if (o.liquid === 0) o.flashed = true
  } else if (o.liquid > 0 && T <= 0) {
    // 0℃ で止まり、うばわれる熱のぶん凍る
    T = 0
    const x = Math.min(o.liquid, ((0 - env.temp) / (FUSE * tau)) * dt)
    o.liquid -= x
    o.ice += x
    o.freezing = true
  } else if (o.ice > 0 && T > 0) {
    // 溶ける
    T = 0
    const x = Math.min(o.ice, ((env.temp - 0) / (FUSE * tau)) * dt)
    o.ice -= x
    o.liquid += x
  }
  // 沸く手前の小さな泡
  if (o.liquid > 0 && o.boil === 0 && T > tb - 12) o.boil = 0.15 * (1 - (tb - T) / 12)
  o.temp = T
  return o
}

/** 消えた（全部が気体になった） */
export const waterGone = (w: Water) => w.liquid + w.ice < 0.002
