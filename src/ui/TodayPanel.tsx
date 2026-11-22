import { useEffect } from 'react'
import { NAKED_EYE, SYNODIC_MONTH, earthSunAu, moonPhase, planetSky } from '../data/today'
import { PROBES } from '../data/probes'
import { openProbes, playProbe, realDistanceNow } from '../state/probes'
import { closeToday, useToday } from '../state/today'
import { warpToMissed } from '../state/quiz'
import { useLanding } from '../state/landing'
import { useStore } from '../state/store'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'
import './today.css'

const AU_KM = 149_597_871
const LIGHT_KM_S = 299_792.458

/** 月の形（北半球から見た向き：満ちていくときは右側が光る） */
function MoonPic({ age }: { age: number }) {
  const r = 38
  const c = 44
  const theta = (age / SYNODIC_MONTH) * 2 * Math.PI
  const lit = (1 - Math.cos(theta)) / 2
  const waxing = age < SYNODIC_MONTH / 2
  const rx = Math.abs(Math.cos(theta)) * r
  const gibbous = lit > 0.5
  const outer = waxing ? 1 : 0
  const term = waxing ? (gibbous ? 1 : 0) : gibbous ? 0 : 1
  const d = `M ${c} ${c - r} A ${r} ${r} 0 0 ${outer} ${c} ${c + r} A ${rx} ${r} 0 0 ${term} ${c} ${c - r} Z`
  return (
    <svg className="today-moon" viewBox="0 0 88 88" aria-hidden="true">
      <circle cx={c} cy={c} r={r} fill="#2a2d36" />
      {lit > 0.01 && <path d={d} fill="#f2ecd8" />}
    </svg>
  )
}

/** 今日の宇宙：今日の月の形、今夜見える惑星、探査機の今、地球と太陽の距離。開くたびに今日の日付で計算する */
export function TodayPanel() {
  const open = useToday((s) => s.open)
  const at = useToday((s) => s.at)
  const mode = useStore((s) => s.mode)
  const landing = useLanding((l) => l.phase)
  useLang()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      e.stopPropagation()
      closeToday()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null
  const t = ui().today
  const canGo = landing === 'idle' && mode !== 'gallery'
  const go = (id: string) => {
    closeToday()
    warpToMissed(id)
  }
  const moon = moonPhase(at)
  const sky = NAKED_EYE.map((id) => planetSky(id, at))
  const flying = PROBES.filter((p) => p.distance)

  const when = (s: (typeof sky)[number]) =>
    !s.visible ? t.hidden : s.allNight ? t.allNight : s.id === 'mercury' || s.id === 'venus' ? (s.evening ? t.evening : t.morning) : s.evening ? t.eveningLate : t.morningEarly

  return (
    <section className="today-panel" role="dialog" aria-label={t.title}>
      <header>
        <h2>
          {t.title}
          <span className="today-date">{t.date(new Date(at))}</span>
        </h2>
        <button className="close" onClick={closeToday} aria-label={t.close}>
          ×
        </button>
      </header>

      <div className="today-block today-moon-block">
        <MoonPic age={moon.age} />
        <div>
          <h3>{t.moonTitle}</h3>
          <p>
            <b>{t.phase[moon.name]}</b>
          </p>
          <p className="small">{t.moonAge(moon.age, moon.lit)}</p>
          <p>{t.moonWhen[moon.name]}</p>
          <p className="muted small">{t.moonNote}</p>
        </div>
        {canGo && (
          <button className="secondary today-go" onClick={() => go('moon')}>
            🚀 {t.goThere}
          </button>
        )}
      </div>

      <div className="today-block">
        <h3>{t.planetsTitle}</h3>
        <ul className="today-list">
          {sky.map((s) => (
            <li key={s.id} className={s.visible ? 'seen' : 'hidden'}>
              <span className="today-name">{ui().bodies[s.id].name}</span>
              <span className="today-when">{when(s)}</span>
              <span className="muted small today-far">{t.fromEarth(s.distanceAu * AU_KM, (s.distanceAu * AU_KM) / LIGHT_KM_S)}</span>
              {canGo && (
                <button className="secondary today-go" onClick={() => go(s.id)}>
                  🚀 {t.goThere}
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="muted small">{t.planetsNote}</p>
      </div>

      <div className="today-block">
        <h3>{t.probesTitle}</h3>
        <ul className="today-list">
          {flying.map((p) => {
            const au = realDistanceNow(p) ?? 0
            return (
              <li key={p.id} className="seen">
                <span className="today-name">{ui().probes[p.id].name}</span>
                <span className="today-when wide">{t.probeNow(au * AU_KM, (au * AU_KM) / LIGHT_KM_S / 3600)}</span>
                <button
                  className="secondary today-go"
                  onClick={() => {
                    closeToday()
                    openProbes()
                    playProbe(p.id)
                  }}
                >
                  {t.watchJourney}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="today-block">
        <h3>{t.earthTitle}</h3>
        <p>{t.earthSun(earthSunAu(at) * AU_KM)}</p>
        <p className="small">{t.earthNear}</p>
      </div>

      <p className="muted small">{t.source}</p>
    </section>
  )
}
