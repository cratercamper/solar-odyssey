// アポロ17号の本物の時刻（打ち上げからの経過時間。秒）。出典：NASA Apollo 17 Mission Report / Apollo by the Numbers
// 画面の物理は場面ごとに早送りするので、表示する経過時間はここの節目に合わせる。

const hms = (h: number, m: number, s: number) => h * 3600 + m * 60 + s

/** 打ち上げ：1972-12-07 05:33:00 UTC */
export const LAUNCH_UTC = Date.UTC(1972, 11, 7, 5, 33, 0)
/** 経過時間の時計合わせ：打ち上げが 2 時間 40 分おくれたので、65 時間目に時計を +2:40:00 進めて、予定の時刻表に合わせた */
const CLOCK_UPDATE_AT = 65 * 3600
const CLOCK_UPDATE = 2 * 3600 + 40 * 60

/** 経過時間（時計合わせのあとの表示）から、世界時（ms） */
export function getToUtc(get: number) {
  return LAUNCH_UTC + (get >= CLOCK_UPDATE_AT + CLOCK_UPDATE ? get - CLOCK_UPDATE : get) * 1000
}

export const GET = {
  /** 地球を回る軌道に入った */
  orbit: hms(0, 11, 53),
  /** 月へ向かう点火と、その終わり */
  tli: hms(3, 12, 37),
  tliEnd: hms(3, 18, 28),
  /** 司令船が第3段から離れる・つなぐ（キャプチャー）・着陸船を引き出す（AFJ Day 1: Transposition, Docking and Extraction） */
  sep: hms(3, 42, 43),
  softDock: hms(3, 57, 3),
  ejection: hms(4, 45, 32),
  /** 「ブルー・マーブル」の写真（AS17-148-22727 のあたり） */
  marble: hms(5, 6, 24),
  /** 月の裏でのブレーキ（LOI） */
  loi: hms(86, 14, 23),
  /** 降下の点火（PDI）と着陸 */
  pdi: hms(112, 49, 53),
  landing: hms(113, 1, 58),
  // 章8：月を出てから着水まで（ミッション報告の表 3-1。65 時間目の時計合わせ +2:40:00 のあとの時刻）
  /** 月からの離陸・司令船とつなぐ・着陸船を切り離す */
  lunarLiftoff: hms(188, 1, 37),
  lunarDock: hms(190, 17, 15),
  lmJettison: hms(193, 58, 31),
  /** 地球へ向かう点火（143.7 秒） */
  tei: hms(236, 42, 9),
  /** 司令船と機械船を切り離す・大気に入る（高さ 121.9 km）・通信が途絶える・ドローグ・主パラシュート・着水 */
  cmSep: hms(304, 3, 49),
  entry: hms(304, 18, 38),
  blackoutStart: hms(304, 18, 55),
  blackoutEnd: hms(304, 22, 15),
  drogue: hms(304, 26, 22),
  mains: hms(304, 27, 13),
  splash: hms(304, 31, 59),
}

/** 地球と月の中心の間（m）。1972 年 12 月 10 日ごろ */
export const EARTH_MOON = 384_400_000
export const R_EARTH = 6_371_000
export const R_MOON_M = 1_737_400
const MU_EARTH = 3.986e14
const MU_MOON = 4.9028e12

/** 月への旅の途中：進み具合（0〜1、時間）から、地球の中心からの距離（m）。放物線に近い軌道なので、距離は時間の 2/3 乗でのびる */
export function coastDistance(progress: number) {
  // 「ブルー・マーブル」を撮ったあと（高さ約 3.5 万 km）から
  const r0 = R_EARTH + 36_000_000
  const r1 = EARTH_MOON - R_MOON_M - 2_000_000
  return r0 + (r1 - r0) * Math.pow(Math.min(1, Math.max(0, progress)), 2 / 3)
}

/** 月への旅の途中の速さ（m/s）：地球の重力でだんだん遅くなり（約 10.8 → 0.9 km/s）、月のそばでは月に引かれてまた速くなる */
export function coastSpeed(r: number) {
  // 地球に対するエネルギーの式（長半径 29 万 km の細長いだ円）
  let v2 = Math.max(0, MU_EARTH * (2 / r - 1 / 2.9e8))
  // 月の重力がまさる範囲（約 6.6 万 km）に入ってから
  const toMoon = Math.max(R_MOON_M, EARTH_MOON - r)
  if (toMoon < 6.6e7) v2 += 2 * MU_MOON * (1 / toMoon - 1 / 6.6e7)
  return Math.sqrt(v2)
}
