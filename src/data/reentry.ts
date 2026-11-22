// 章8：地球への再突入の物理（司令船ひとつ。2 次元：高さ・速さ・経路角）。
// 数字の出典：Apollo 17 Mission Report (MSC-07904) 表 3-1 と 1 章の表。突入（高さ 40 万フィート = 121.9 km）で秒速 11.0 km、経路角 -6.5°。
// 揚力は機体の傾き（バンク）で上か下へ向ける：上へ向けると浅く（はじかれやすい）、下へ向けると深く（G が強い）。
// 状態をこわさない関数だけ（テストできるように、画面や window を使わない）

export const RE = 6_371_000
const MU = 3.986e14
const G0 = 9.80665
/** 大気に入ったとする高さ（m）と、そのときの速さ（m/s） */
export const EI_ALT = 121_920
export const EI_SPEED = 11_000
/** 本物の経路角（度） */
export const EI_ANGLE = -6.5
/** 回廊：これより浅いと大気にはじかれ、深いと G が強すぎる（度） */
export const CORRIDOR = { shallow: -5.6, steep: -7.4 }
/** 減速用の小さいパラシュート（ドローグ）と主パラシュートを開く高さ（m） */
export const DROGUE_ALT = 7_300
export const MAIN_ALT = 3_200
/** 主パラシュート 3 つでの着水の速さ（m/s。約 9.4 m/s = 時速 34 km） */
export const SPLASH_SPEED = 9.4
const DROGUE_SPEED = 52

/** 司令船：重さ約 5,900 kg、直径 3.9 m（底の面 12 m²）。抗力係数 約 1.3、揚抗比 0.3 */
const MASS = 5_900
const AREA = 12.0
const CD = 1.3
const LD = 0.3

export type Entry = {
  t: number
  /** 高さ（m） */
  h: number
  /** 速さ（m/s） */
  v: number
  /** 経路角（rad。下向きが負） */
  gamma: number
  /** 進んだ道のり（地上で、m） */
  range: number
  /** 揚力の上向きの割合（-1 下 〜 1 上） */
  lift: number
  /** いまの G と、いちばん強かった G */
  g: number
  peakG: number
  /** 大気に深く入った（85 km より下へ） */
  dipped: boolean
  /** 最初に深く入ったあと、上向きに変わった（引き起こした） */
  pulled: boolean
}

export const air = (h: number) => 1.225 * Math.exp(-Math.max(0, h) / 7_200)

export function startEntry(angleDeg: number): Entry {
  return { t: 0, h: EI_ALT, v: EI_SPEED, gamma: (angleDeg * Math.PI) / 180, range: 0, lift: 1, g: 0, peakG: 0, dipped: false, pulled: false }
}

/** 1 歩すすめる（dt 秒、本物の時間）。want：揚力をどちらへ（-1〜1）。機体を回すのには時間がかかる（1 秒に 0.25 ずつ） */
export function stepEntry(e: Entry, dt: number, want: number) {
  const n = Math.max(1, Math.ceil(dt / 0.05))
  const h = dt / n
  for (let i = 0; i < n; i++) {
    e.lift += clamp(want - e.lift, -0.25 * h, 0.25 * h)
    const r = RE + e.h
    const rho = air(e.h)
    const q = 0.5 * rho * e.v * e.v
    const drag = (q * CD * AREA) / MASS
    const lift = drag * LD
    const g = MU / (r * r)
    const dv = -drag - g * Math.sin(e.gamma)
    const dg = (lift * e.lift) / e.v - (g / e.v - e.v / r) * Math.cos(e.gamma)
    e.v = Math.max(1, e.v + dv * h)
    e.gamma += dg * h
    e.h += e.v * Math.sin(e.gamma) * h
    e.range += ((e.v * Math.cos(e.gamma) * RE) / r) * h
    e.t += h
    e.g = Math.hypot(drag, lift) / G0
    e.peakG = Math.max(e.peakG, e.g)
    if (e.h < 85_000) e.dipped = true
    if (e.dipped && e.gamma > 0) e.pulled = true
  }
}

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v))
}

export type EntryEnd = 'ok' | 'skip' | 'steep' | null

/** 終わったか：ok（パラシュートの高さまで）、skip（大気にはじかれた）、steep（G が強すぎた） */
export function entryResult(e: Entry): EntryEnd {
  if (e.peakG > 12) return 'steep'
  if (e.dipped && e.h > EI_ALT && e.gamma > 0) return 'skip'
  // 一度も深く入らないまま上がりはじめた（浅すぎた）
  if (!e.dipped && e.gamma > 0 && e.v > 7_000) return 'skip'
  if (e.h <= DROGUE_ALT) return 'ok'
  return null
}

/** 熱の強さ（0〜1）：空気の濃さ × 速さの 3 乗。火の玉と通信途絶に使う */
export function heating(e: Entry) {
  const qdot = Math.sqrt(air(e.h)) * Math.pow(e.v / 1000, 3)
  // いちばん熱いとき（高さ 55〜60 km、秒速 10 km 前後）が 1 くらい
  return Math.min(1, qdot / 21)
}

/** 通信が途絶えているか（本物：突入の 17 秒後から 3 分 20 秒）。まわりの空気がプラズマになって電波を通さない */
export const blackout = (e: Entry) => e.h < 101_000 && e.v > 4_800

/** おまかせ：G が強くなったら揚力を上へ、はじかれそうなら下へ */
export function entryAuto(e: Entry) {
  // 上がりはじめたら揚力を下へ（はじかれないように）。G が強いあいだは上へ。そのあいだは G を 4 くらいに保つ
  if (!e.pulled) return 1
  if (e.gamma > 0) return -1
  if (e.g > 4) return 1
  if (e.v < 3_000) return 1
  return clamp((e.g - 3) * 1.2, -1, 1)
}

/** パラシュートでの降り方（高さ → 落ちる速さ m/s） */
export function chuteSpeed(h: number) {
  if (h > MAIN_ALT) return DROGUE_SPEED
  return SPLASH_SPEED
}

/** 星（0〜3）：回廊のまん中に入れたか、G をおさえられたか */
export function entryStars(angleDeg: number, peakG: number) {
  const off = Math.abs(angleDeg - EI_ANGLE)
  return 1 + (off < 0.3 ? 1 : 0) + (peakG < 7.5 ? 1 : 0)
}
