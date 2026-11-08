import * as THREE from 'three'
import type { Planet } from './bodies'
import { EARTH_YEAR_SECONDS } from './scale'
import { ui } from '../i18n'

// 惑星の本当の位置（太陽から見た方向）。軌道の形はアプリでは円にしているが、
// 円のどこにいるかは、日付からケプラーの方程式で求めた本物の方向にそろえる。
// 軌道要素は JPL（Standish）の 1800〜2050年向けの近似値。

const DEG = Math.PI / 180
const DAY_MS = 86_400_000
/** 2000年1月1日12時（世界時）。軌道要素の基準の日 */
const J2000_MS = Date.UTC(2000, 0, 1, 12)

/** 平均黄経（度）、その100年あたりの変化（度）、近日点の黄経（度）、離心率 */
type Elements = { L: number; rate: number; peri: number; e: number }

const ELEMENTS: Record<string, Elements> = {
  mercury: { L: 252.2503235, rate: 149472.67411175, peri: 77.45779628, e: 0.20563593 },
  venus: { L: 181.9790995, rate: 58517.81538729, peri: 131.60246718, e: 0.00677672 },
  earth: { L: 100.46457166, rate: 35999.37244981, peri: 102.93768193, e: 0.01671123 },
  mars: { L: -4.55343205, rate: 19140.30268499, peri: -23.94362959, e: 0.0933941 },
  jupiter: { L: 34.39644051, rate: 3034.74612775, peri: 14.72847983, e: 0.04838624 },
  saturn: { L: 49.95424423, rate: 1222.49362201, peri: 92.59887831, e: 0.05386179 },
  uranus: { L: 313.23810451, rate: 428.48202785, peri: 170.9542763, e: 0.04725744 },
  neptune: { L: -55.12002969, rate: 218.45945325, peri: 44.96476227, e: 0.00859048 },
  pluto: { L: 238.92903833, rate: 145.20780515, peri: 224.06891629, e: 0.2488273 },
}

/** 平均近点角から真近点角を求める（ケプラーの方程式をニュートン法で解く） */
export function trueAnomaly(M: number, e: number) {
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  return { nu: 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)), E }
}

/** その日の、太陽から見た惑星の方向（黄経、ラジアン） */
export function planetLongitude(id: string, days: number) {
  const el = ELEMENTS[id]
  if (!el) return 0
  const L = (el.L + (el.rate * days) / 36_525) * DEG
  const peri = el.peri * DEG
  return peri + trueAnomaly(L - peri, el.e).nu
}

/** アプリを開いた時刻。シミュレーションの時間 0 はこの瞬間（惑星は今日の本当の位置に並ぶ） */
export const EPOCH_MS = Date.now()
const EPOCH_DAYS = (EPOCH_MS - J2000_MS) / DAY_MS
/** シミュレーションの1秒が何日にあたるか（地球の1年＝120秒） */
export const DAYS_PER_SIM_SECOND = 365.25 / EARTH_YEAR_SECONDS

/** シミュレーションの時間（秒）を、2000年1月1日からの日数に */
export const simDays = (t: number) => EPOCH_DAYS + t * DAYS_PER_SIM_SECOND
/** 日付（ミリ秒）の、シミュレーションの時間 */
export const simTimeAt = (ms: number) => (ms - EPOCH_MS) / DAY_MS / DAYS_PER_SIM_SECOND
/** 現実の1時間が、シミュレーションの何秒か（時間の速さを「1秒に何時間」で決めるのに使う） */
export const SIM_SECONDS_PER_HOUR = 1 / (24 * DAYS_PER_SIM_SECOND)
/** シミュレーションの時間の日時（ミリ秒） */
export const simMs = (t: number) => EPOCH_MS + t * DAYS_PER_SIM_SECOND * DAY_MS
/** シミュレーションの時間の日付 */
export const simDate = (t: number) => new Date(simMs(t))
/** 日付（ミリ秒）の、2000年1月1日からの日数 */
export const daysAt = (ms: number) => (ms - J2000_MS) / DAY_MS

/** 日付（今の言語で） */
export const formatDate = (d: Date) => ui().ephemeris.date(d)

const node = new THREE.Vector3()

/** 惑星の位置：本物の日付での方向に、表示用の円軌道の半径（distance）で置く（冥王星は軌道を傾ける） */
export function planetPosition(planet: Planet, distance: number, t: number, out: THREE.Vector3) {
  const a = planetLongitude(planet.id, simDays(t))
  out.set(Math.cos(a) * distance, 0, -Math.sin(a) * distance)
  if (planet.inclinationDeg) {
    const n = (planet.nodeDeg ?? 0) * DEG
    out.applyAxisAngle(node.set(Math.cos(n), 0, -Math.sin(n)), planet.inclinationDeg * DEG)
  }
  return out
}
