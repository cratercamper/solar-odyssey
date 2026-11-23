// 翼で飛ぶ（コロニーの中のグライダー遊び）の動き。WalkActors が毎フレーム呼ぶ。three.js に頼らない計算だけ（テストしやすい）。
// 機首の上げ下げ（W 下げる・S 上げる）で高さと速さを取りかえ、A D／マウスで機体を傾けて曲がる。
// 本当の重さ（回転の遠心力）は軸に近いほど弱く、高い所では何をしても変わらなくなるので、
// ゲームとして少なくとも 0.4G 分は効かせる。ただし軸のすぐそば（ほとんど重さのない所）では本当の重さのまま。

/** 機首の向き（rad、水平から上が +）：手をはなしたとき（ゆるく沈む滑空）・W・S */
export const WING_PITCH_TRIM = -0.12
export const WING_PITCH_DIVE = -0.55
export const WING_PITCH_CLIMB = 0.42
/** いちばん大きく傾ける角度（rad）・失速する速さ（m/s） */
export const WING_BANK = 0.6
export const WING_STALL = 5
/** ゲームとして効かせる最低の重さ（m/s²）。0.4G */
export const WING_MIN_G = 9.8 * 0.4

export type WingState = {
  /** 空気に対する速さ m/s */
  gs: number
  /** 機首の向き・進む道の傾き（rad、上が +）・機体の傾き（右へ傾くと +） */
  wp: number
  fp: number
  bank: number
  /** 上がる（+）・下がる（-）速さ m/s */
  vh: number
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const smooth = (v: number, a: number, b: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/** 効かせる重さ：本当の重さ g（m/s²）から */
export const wingGee = (g: number) => Math.max(g, WING_MIN_G * smooth(g, 0.3, 2))

/**
 * 1 コマ進める。fwd：W が +1、S が -1。right：D が +1。err：カメラの向き − 体の向き（rad、マウスで向いた先へ曲がる）。
 * h：地面からの高さ m（地面の近くでは翼を立てて沈みを抑える）。返すのは回る速さ（rad/s、左回りが +）
 */
export function wingStep(s: WingState, fwd: number, right: number, err: number, running: boolean, g: number, h: number, dt: number) {
  const ge = wingGee(g)
  // 機首：手をはなすと、ゆるく沈む滑空の角度にもどる
  const pitchTo = fwd > 0.3 ? WING_PITCH_DIVE * (running ? 1.4 : 1) : fwd < -0.3 ? WING_PITCH_CLIMB : WING_PITCH_TRIM
  s.wp += clamp(pitchTo - s.wp, -1.4 * dt, 1.4 * dt)
  // 傾き：A D と、カメラの向きへ向かうための傾き
  const bankTo = clamp(right * WING_BANK - err * 1.6, -WING_BANK, WING_BANK)
  s.bank += (bankTo - s.bank) * Math.min(1, dt * 3)
  const V = Math.max(1, s.gs)
  // 傾いた揚力が横へ引くので、傾くほど速く回る（釣り合った旋回：ω = g tanφ / V）
  const turnRate = clamp((-ge * Math.tan(s.bank)) / Math.max(V, 5), -1.6, 1.6)
  // 進む道の傾き：機首の向きに少し遅れてついていく。遅いと翼が空気をつかめず（失速）下へ落ちる。傾けて曲がると少し沈む
  const stall = smooth(V, WING_STALL * 0.6, WING_STALL * 1.3)
  const fpTo = (s.wp - 0.25 * (1 / Math.cos(s.bank) - 1)) * stall - 0.7 * (1 - stall) * Math.min(1, ge / 3)
  s.fp += (fpTo - s.fp) * Math.min(1, dt * 1.8)
  // 速さ：下りでは重さで速くなり、上りでは遅くなる。翼の抵抗（滑空比 約 8）と空気の抵抗で頭打ち
  s.gs = Math.max(0, s.gs + (-ge * Math.sin(s.fp) - 0.06 * ge - 0.004 * s.gs * s.gs) * dt)
  s.vh = V * Math.sin(s.fp)
  // 地面の近くでは、翼を立てて沈みを抑える
  if (h < 80) {
    const lim = -4 - h * 0.15
    if (s.vh < lim) {
      s.vh = lim
      s.fp = Math.asin(clamp(lim / V, -1, 1))
    }
  }
  return turnRate
}
