import { useEffect, useState } from 'react'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { journey } from '../../state/missionJourney'
import { EARTH_MOON, R_EARTH, R_MOON_M, getToUtc } from '../../data/apolloTimeline'
import './journeyBar.css'

const SPAN = EARTH_MOON - R_EARTH - R_MOON_M

/** 地球から月までの線の上の位置（0〜1）。ほぼ実際の割合のまま、両端だけ少し広げて、はじめと終わりの動きも見えるようにする */
function place(fromEarth: number, toMoon: number, near: 'earth' | 'moon') {
  const f = (m: number) => Math.pow(Math.min(1, Math.max(0, m / SPAN)), 0.6)
  return near === 'moon' ? 1 - f(toMoon) : f(fromEarth)
}

const clock = (t: number) => {
  const sign = t < 0 ? '-' : ''
  const a = Math.floor(Math.abs(t))
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${sign}${p(Math.floor(a / 3600), 3)}:${p(Math.floor(a / 60) % 60)}:${p(a % 60)}`
}

/** いまどこ：地球から月までの線と、距離・速さ・本物の経過時間 */
export function JourneyBar() {
  useLang()
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 200)
    return () => clearInterval(id)
  }, [])
  const j = journey()
  if (!j) return null
  const T = ui().moonMission.journey
  const at = place(j.fromEarth, j.toMoon, j.near)
  return (
    <div className="jb" aria-live="off">
      <div className="jb-line">
        <span className="jb-end earth">{T.earth}</span>
        <div className="jb-track">
          <i className="jb-done" style={{ width: `${at * 100}%` }} />
          <i className="jb-ship" style={{ left: `${at * 100}%` }} />
        </div>
        <span className="jb-end moon">{T.moon}</span>
      </div>
      <div className="jb-nums">
        <span>
          {T.fromEarth} <b>{T.dist(j.fromEarth)}</b>
        </span>
        <span>
          {T.toMoon} <b>{T.dist(j.toMoon)}</b>
        </span>
        <span className="jb-speed">
          <b>{T.speedOf(j.speed)}</b>
        </span>
      </div>
      <div className="jb-time">
        {T.elapsed} <b>{clock(j.get)}</b>
        <span className="jb-date">{T.date(getToUtc(j.get))}</span>
      </div>
    </div>
  )
}
