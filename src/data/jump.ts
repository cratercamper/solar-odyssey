import { cardOf } from './bodyCards'
import { SURFACES } from './surfaces'

// 重力ジャンプ：地球で 50 cm 跳べる人が、同じ力でその星で跳んだら、どこまで高く・どれだけ長く跳べるか。
// 重力は天体カードと同じ値（公表の質量と半径から GM/r²）。小さな星では高く上がるほど重力が弱まるので、
// 高さはエネルギーの式で、空中の時間は細かく区切って計算する

const EARTH_G = 9.81
/** 地球で跳べる高さ（m）。ふつうの人のその場ジャンプ */
export const EARTH_JUMP_M = 0.5
/** 地面をけった瞬間の速さ（m/s） */
export const V0 = Math.sqrt(2 * EARTH_G * EARTH_JUMP_M)

export type Jump = {
  id: string
  /** 表面の重力（m/s²） */
  g: number
  /** いちばん高いところ（m） */
  height: number
  /** 空中にいる時間（秒） */
  airtime: number
  /** 地球で同じように跳んだときの空中の時間（秒） */
  earthAirtime: number
}

/** 半径 R（m）、表面の重力 g の星で、速さ V0 で真上に跳んだときの、高さ（秒 t のとき） */
export function heightAt(t: number, g: number, radiusM: number) {
  // 地面に近いあいだは放物線と同じ。高く上がる小さな星では、上で重力が弱まるのを足す
  const flat = V0 * t - (g * t * t) / 2
  if (radiusM <= 0 || flat < radiusM * 0.002) return Math.max(0, flat)
  return Math.max(0, integrate(g, radiusM, t))
}

/** 重力の弱まりを入れて、t 秒後の高さを細かく区切って計算する */
function integrate(g: number, R: number, t: number) {
  const gm = g * R * R
  const steps = 400
  const dt = t / steps
  let r = R
  let v = V0
  for (let i = 0; i < steps; i++) {
    // 半分ずつ進める（速さの変化をていねいに）
    const a1 = -gm / (r * r)
    const vm = v + a1 * (dt / 2)
    const rm = r + v * (dt / 2)
    const a2 = -gm / (rm * rm)
    r += vm * dt
    v += a2 * dt
  }
  return r - R
}

/** その星でのジャンプ（着陸できて重力の分かる星だけ） */
export function jumpOn(id: string): Jump | null {
  const card = cardOf(id)
  const surf = SURFACES.get(id)
  if (!card || !surf) return null
  const g = card.gravity
  const R = surf.radiusKm * 1000
  const gm = g * R * R
  // 高さ：エネルギーの式（V0²/2 = GM(1/R − 1/(R+h))）
  const inv = 1 / R - (V0 * V0) / (2 * gm)
  const height = inv > 0 ? 1 / inv - R : Infinity
  // 空中の時間：上りと下りは同じ。上りの時間を細かく足す
  let airtime: number
  if (height < R * 0.002) airtime = (2 * V0) / g
  else {
    let t = 0
    let r = R
    const n = 4000
    const dr = height / n
    for (let i = 0; i < n; i++) {
      const rm = r + dr / 2
      // その高さでの速さ（エネルギーの式）
      const v = Math.sqrt(Math.max(1e-9, V0 * V0 - 2 * gm * (1 / R - 1 / rm)))
      t += dr / v
      r += dr
    }
    airtime = 2 * t
  }
  return { id, g, height, airtime, earthAirtime: (2 * V0) / EARTH_G }
}

/** 空中の時間が長い星は早送りで見せる（見せる時間が 8 秒くらいになる、きりのよい倍率） */
export function playbackSpeed(airtime: number) {
  if (airtime <= 12) return 1
  for (const s of [2, 5, 10, 20, 50, 100, 200, 500, 1000]) if (airtime / s <= 10) return s
  return 1000
}
