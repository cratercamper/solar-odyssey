import * as THREE from 'three'
import { APOLLO17_LIFTOFF, groundFromEquatorial, siteSky } from '../../data/siteSky'
import { EQUATORIAL_FROM_APP } from '../../data/skyFrame'

// 打ち上げの場面の「空の時計」：いつの空を描くか。
//
// - 観察（observe）：1972 年 11 月 20 日の夕方 17 時 16 分（米東部時間）。発射台のサターンV に低い夕日が当たり、
//   東の海から満月が昇ってくる（本物のアポロ17号は 8 月 28 日から発射台に立っていた）。
// - タイムラプス（timelapse）：その夕方から真夜中へ（日が沈み、投光器が列ごとにつき、満月が頭の上へ）。
//   そのあと毎晩 0 時 33 分の空を 1 日ずつめくって、16 日後の打ち上げの夜へ（月は欠けながら東へ沈んでいく）。
// - 秒読みから先：打ち上げの瞬間、1972 年 12 月 7 日 0 時 33 分（月の無い夜）。
//
// 向きは地面の組の座標（x 東、y 上、z 南）。地面の組は離昇の瞬間まで three の座標と同じ。

/** 観察の時刻（世界時）：日の入りの 10 分ほど前。太陽は高さ 1.4°、満月は東北東に高さ 2° */
export const OBSERVE_AT = Date.UTC(1972, 10, 20, 22, 16)
/** 前半（夕方 → 真夜中）・後半（16 夜をめくる）の区切り（0〜1） */
const SPLIT = 0.46
/** 日の入りの部分（0〜DUSK_END）で進める時間 */
const DUSK_END = 0.24
const DUSK_MS = 50 * 60_000
const SPLIT_END = 0.93
const DAY = 86_400_000
/** 後半の最初の夜：11 月 21 日 0 時 33 分（東部時間） */
const NIGHT0 = APOLLO17_LIFTOFF - 16 * DAY

/** 星表の向き（アプリの座標）→ ms の発射場の空（地面の組の座標）の回転 */
export function launchSkyRotation(ms = APOLLO17_LIFTOFF) {
  const g = groundFromEquatorial(ms)
  const m3 = new THREE.Matrix3().set(g[0], g[1], g[2], g[3], g[4], g[5], g[6], g[7], g[8]).multiply(EQUATORIAL_FROM_APP)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().setFromMatrix3(m3))
}

export type SkyNow = {
  /** 表に出す時刻（世界時のミリ秒） */
  ms: number
  sun: THREE.Vector3
  moon: THREE.Vector3
  moonLit: number
  /** 星表の向き（three の座標） */
  stars: THREE.Quaternion
  /** 投光器と町の明かりがついた割合（0〜1、列ごとに順につく） */
  lights: number
  /** 霜（燃料を入れた夜だけ） */
  frost: number
  /** 乗組員の通路の腕が退いた割合 */
  crewArm: number
  /** タイムラプスの後半（日付をめくっている）か */
  flipping: boolean
}

const ease = (x: number) => {
  const k = THREE.MathUtils.clamp(x, 0, 1)
  return k * k * (3 - 2 * k)
}

function vec(g: { x: number; y: number; z: number }, out: THREE.Vector3) {
  return out.set(g.x, g.y, g.z)
}

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _qa = new THREE.Quaternion()

/** 空の時計の、ある時刻（ms）の空 */
function at(ms: number, out: SkyNow) {
  const s = siteSky(ms)
  vec(s.sun, out.sun)
  vec(s.moon, out.moon)
  out.moonLit = s.moonLit
  out.stars.copy(launchSkyRotation(ms))
  out.ms = ms
}

/** 夜 k（0〜16、小数は前後の夜のあいだ）。毎晩同じ 0 時 33 分の空を、なめらかにつなぐ */
function night(k: number, out: SkyNow) {
  const i = Math.min(15, Math.floor(k))
  const f = k - i
  at(NIGHT0 + (i + 1) * DAY, out)
  _a.copy(out.sun)
  _b.copy(out.moon)
  const lit = out.moonLit
  _qa.copy(out.stars)
  at(NIGHT0 + i * DAY, out)
  out.sun.lerp(_a, f).normalize()
  out.moon.lerp(_b, f).normalize()
  out.moonLit += (lit - out.moonLit) * f
  out.stars.slerp(_qa, f)
  out.ms = NIGHT0 + Math.round(k) * DAY
}

export function newSky(): SkyNow {
  return { ms: 0, sun: new THREE.Vector3(), moon: new THREE.Vector3(), moonLit: 0, stars: new THREE.Quaternion(), lights: 1, frost: 1, crewArm: 1, flipping: false }
}

/** いまの空（LaunchWorld が毎フレーム書く。画面の時計が読む） */
export const liveSky = newSky()

/** 日が沈んでから、投光器が列ごとにつく割合（太陽の高さの正弦から） */
const lightsFor = (sunY: number) => THREE.MathUtils.clamp((-sunY - 0.03) / 0.12, 0, 1)

/**
 * いまの空。phase が observe なら観察の夕方、timelapse なら u（0〜1）の所、それ以外は打ち上げの夜
 */
export function skyNow(phase: string, u: number, out: SkyNow): SkyNow {
  out.flipping = false
  if (phase === 'observe') {
    at(OBSERVE_AT, out)
    out.lights = 0
    out.frost = 0
    out.crewArm = 0
    return out
  }
  if (phase === 'timelapse') {
    if (u < DUSK_END) {
      // 日の入り：はじめの 3 秒ほどで 50 分（日が沈み、空の色が変わり、投光器がつく）
      at(OBSERVE_AT + (u / DUSK_END) * DUSK_MS, out)
    } else if (u < SPLIT) {
      // 夜が更けていく（満月が東から頭の上へ）
      const k = (u - DUSK_END) / (SPLIT - DUSK_END)
      at(OBSERVE_AT + DUSK_MS + (NIGHT0 - OBSERVE_AT - DUSK_MS) * (k * k * (3 - 2 * k) * 0.6 + k * 0.4), out)
    } else {
      out.flipping = u < SPLIT_END
      // 1 夜ずつ同じ速さでめくる（月が東の空を下りていくのが見える）
      night(16 * THREE.MathUtils.clamp((u - SPLIT) / (SPLIT_END - SPLIT), 0, 1), out)
    }
    out.lights = lightsFor(out.sun.y)
    // 燃料を入れるのは打ち上げの夜（最後の 2 夜ぶん）。乗組員の通路の腕は秒読みの 5 分前に退く
    out.frost = ease((u - 0.82) / 0.1)
    out.crewArm = ease((u - 0.9) / 0.08)
    return out
  }
  at(APOLLO17_LIFTOFF, out)
  out.lights = 1
  out.frost = 1
  out.crewArm = 1
  return out
}
