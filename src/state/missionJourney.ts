// 月ミッションの「いまどこ」：本物の経過時間、地球からの距離、月までの距離、速さ。
// 場面ごとの物理（早送りあり）を、アポロ17号の本物の節目（data/apolloTimeline.ts）に合わせて読みかえる。

import { GET, EARTH_MOON, R_EARTH, R_MOON_M, coastDistance, coastSpeed } from '../data/apolloTimeline'
import { PDI_IDEAL, LOI_IDEAL } from '../data/lunarDescent'
import { TLI_WINDOW, TLI_WINDOW_OPEN, missionReadout, sim, useMoonMission } from './moonMission'
import { lunar, lunarReadout } from './moonLunar'
import { dockJourney } from './moonDock'
import { returnJourney } from './moonReturn'

export type Journey = {
  /** 打ち上げからの経過時間（秒。発射前は負） */
  get: number
  /** 地球の表面から（m） */
  fromEarth: number
  /** 月の表面まで（m） */
  toMoon: number
  /** 速さ（m/s）。near が earth なら地球に対して、moon なら月に対して */
  speed: number
  near: 'earth' | 'moon'
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))

export function journey(): Journey | null {
  const s = useMoonMission.getState()
  const p = s.phase
  if (p === 'pad') return { get: -s.countdown, fromEarth: 0, toMoon: EARTH_MOON - R_EARTH - R_MOON_M, speed: 0, near: 'earth' }
  if (p === 'ascent' || p === 'orbit' || p === 'tli' || p === 'outbound') {
    const r = missionReadout()
    let get = r.t
    if (p === 'orbit') {
      // 本物は地球を約 2 周してから月へ。画面の周回は短いので、窓のまん中が本物の点火時刻になるように合わせる
      const ot = r.t - sim.orbitAt
      get = lerp(GET.orbit, GET.tli, ot / (TLI_WINDOW_OPEN + TLI_WINDOW / 2))
    } else if (p === 'tli') get = GET.tli + (r.t - sim.tliAt)
    else if (p === 'outbound') get = GET.tliEnd + (r.t - sim.tliEnd)
    else get = Math.min(r.t, GET.orbit)
    return { get, fromEarth: r.alt, toMoon: Math.max(0, EARTH_MOON - R_EARTH - R_MOON_M - r.alt), speed: r.speed, near: 'earth' }
  }
  if (p === 'dock' || p === 'marble') {
    const d = dockJourney()
    return { get: d.get, fromEarth: d.fromEarth, toMoon: EARTH_MOON - d.fromEarth - R_EARTH - R_MOON_M, speed: d.speed, near: 'earth' }
  }
  if (p === 'home') return returnJourney()
  if (p === 'coast') {
    const dist = coastDistance(lunar.coast)
    return { get: lerp(GET.marble + 900, GET.loi - 3600, lunar.coast), fromEarth: dist - R_EARTH, toMoon: EARTH_MOON - dist - R_MOON_M, speed: coastSpeed(dist), near: 'earth' }
  }
  if (p === 'loi' || p === 'undock' || p === 'descent' || p === 'landed') {
    const r = lunarReadout()
    const far = EARTH_MOON - R_EARTH - R_MOON_M
    if (r.kind === 'stack') return { get: GET.loi + (r.t - LOI_IDEAL), fromEarth: far, toMoon: r.alt, speed: r.speed, near: 'moon' }
    const get = Math.min(GET.landing + 600, GET.pdi + (r.t - (r.pdiAt ?? PDI_IDEAL)))
    return { get: p === 'landed' ? Math.min(get, GET.landing + 600) : get, fromEarth: far, toMoon: Math.max(0, r.alt), speed: Math.hypot(r.vUp, r.vSide), near: 'moon' }
  }
  return null
}
