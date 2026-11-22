import { PLANETS, SUN } from './bodies'

// 到着の瞬間：星に着いたとき、まず「大きさ」を絵で見せる。
// 地球より大きい星には地球を横にならべ（3D、components/ArrivalRow.tsx）、地球より小さい星はその星を地球の幅にならべる（ui/ArrivalMoment.tsx）。
// とても小さい星は、ならべると数が多すぎて絵にならないので「歩いて一周すると何時間」で見せる。
// 数はすべて平均半径（data/bodies.ts）から計算する

export type ArrivalKind =
  /** 地球より大きい：地球が何個ならぶか（3D で星の前にならべる） */
  | 'giant'
  /** 地球：月が何個ならぶか */
  | 'earth'
  /** 地球より小さい：その星が地球の幅に何個ならぶか */
  | 'small'
  /** とても小さい：歩いて一周すると何時間か */
  | 'tiny'

export type Arrival = {
  id: string
  kind: ArrivalKind
  /** ならべる数（直径の比。丸める前） */
  ratio: number
  /** 絵や文で使う数（0.5 きざみ。10 以上は 1 きざみ） */
  count: number
  /** 歩いて一周する時間（時間。人の歩く速さ 4.5 km/h） */
  walkHours: number
}

const EARTH_KM = 6_371
const MOON_KM = 1_737
/** これより多くならぶ星は、ならべずに「歩いて一周」で見せる */
export const MAX_ROW = 30
/** 人の歩く速さ（km/h） */
export const WALK_KMH = 4.5

/** 0.5 きざみに丸める（10 以上は 1 きざみ） */
export function roundCount(ratio: number) {
  return ratio >= 10 ? Math.round(ratio) : Math.max(0.5, Math.round(ratio * 2) / 2)
}

function radiusOf(id: string) {
  if (id === 'sun') return SUN.radiusKm
  for (const p of PLANETS) {
    if (p.id === id) return p.radiusKm
    const m = p.moons.find((x) => x.id === id)
    if (m) return m.radiusKm
  }
  return null
}

/** その星に着いたときに見せる大きさ（星でないもの、望遠鏡や SF の物は null） */
export function arrivalOf(id: string | null | undefined): Arrival | null {
  if (!id) return null
  const km = radiusOf(id)
  if (!km) return null
  const walkHours = (2 * Math.PI * km) / WALK_KMH
  if (id === 'earth') {
    const ratio = EARTH_KM / MOON_KM
    return { id, kind: 'earth', ratio, count: roundCount(ratio), walkHours }
  }
  if (km > EARTH_KM) {
    const ratio = km / EARTH_KM
    return { id, kind: 'giant', ratio, count: roundCount(ratio), walkHours }
  }
  const ratio = EARTH_KM / km
  const kind = ratio > MAX_ROW ? 'tiny' : 'small'
  return { id, kind, ratio, count: roundCount(ratio), walkHours }
}

export const hasArrival = (id: string | null | undefined) => arrivalOf(id) !== null
