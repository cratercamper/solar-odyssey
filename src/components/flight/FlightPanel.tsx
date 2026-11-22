import type { PointerEvent as RPointerEvent } from 'react'
import { ui } from '../../i18n'
import { useLang } from '../../i18n/lang'
import { endFlight, restartLap, setGear, useSkyFlight } from '../../state/skyFlight'
import { startTakeoff } from '../../state/landing'
import { SPEEDS } from './flightControl'
import { isTouchDevice } from '../../state/input'
import './skyFlight.css'

/** スマホのボタンの操縦（FlightView が毎フレーム読む） */
export const flightPad = { turn: 0, pitch: 0 }

function hold(set: (v: number) => void) {
  return {
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      set(1)
    },
    onPointerUp: () => set(0),
    onPointerCancel: () => set(0),
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  }
}

const fmtAlt = (m: number) => (m >= 10_000 ? ui().skyFlight.km(Math.round(m / 1000)) : m >= 1000 ? ui().skyFlight.km((m / 1000).toFixed(1)) : ui().skyFlight.m(Math.round(m)))
const fmtSpeed = (v: number) => (v >= 1000 ? ui().skyFlight.kms((v / 1000).toFixed(1)) : ui().skyFlight.kmh(Math.round(v * 3.6)))
const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`

export function FlightPanel({ loading, failed }: { loading: boolean; failed: boolean }) {
  useLang()
  const t = ui().skyFlight
  const s = useSkyFlight()
  const touch = isTouchDevice()
  const offDeg = Math.round((s.off * 180) / Math.PI)
  return (
    <div className="flight-ui">
      {(loading || failed) && <div className="flight-caption">{failed ? t.failed : t.loading}</div>}
      {failed && (
        <div className="flight-buttons">
          <button className="primary" onClick={endFlight}>
            {t.back}
          </button>
        </div>
      )}
      {!loading && !failed && (
        <>
          <div className="flight-hud">
            <div className="flight-title">{t.title}</div>
            <div className="flight-row">
              <span>{t.altitude}</span>
              <b>{fmtAlt(s.alt)}</b>
            </div>
            <div className="flight-row">
              <span>{t.speed}</span>
              <b>{fmtSpeed(s.speed)}</b>
            </div>
            <div className="flight-row gears">
              <button className="secondary small" onClick={() => setGear(s.gear - 1)} aria-label={t.slower}>
                −
              </button>
              <span className="gear-bar">
                {SPEEDS.map((_, i) => (
                  <i key={i} className={i <= s.gear ? 'on' : ''} />
                ))}
              </span>
              <button className="secondary small" onClick={() => setGear(s.gear + 1)} aria-label={t.faster}>
                ＋
              </button>
            </div>
            <div className="flight-lap">
              <div className="flight-row">
                <span>{t.lap}</span>
                <b>{Math.floor(s.lap * 100)}%</b>
              </div>
              <div className="lap-bar">
                <i style={{ width: `${Math.min(100, s.lap * 100)}%` }} />
              </div>
              <div className={`lap-dir${Math.abs(offDeg) > 20 ? ' warn' : ''}`}>{Math.abs(offDeg) <= 5 ? t.onCourse : offDeg > 0 ? t.turnRight(Math.abs(offDeg)) : t.turnLeft(Math.abs(offDeg))}</div>
              {s.laps && <div className="lap-best">{t.best(fmtTime(s.laps.best), s.laps.times)}</div>}
            </div>
          </div>
          {s.justLapped !== null && (
            <div className="flight-card">
              <b>{t.lapped}</b>
              <div>{t.lapTime(fmtTime(s.justLapped))}</div>
              <button className="secondary" onClick={() => useSkyFlight.setState({ justLapped: null })}>
                {t.ok}
              </button>
            </div>
          )}
          {!touch && <div className="flight-hint">{t.keys}</div>}
          {touch && (
            <>
              <div className="flight-pad left">
                <button className="pad" {...hold((v) => (flightPad.turn = -v))}>
                  ◀
                </button>
                <button className="pad" {...hold((v) => (flightPad.turn = v))}>
                  ▶
                </button>
              </div>
              <div className="flight-pad right">
                <button className="pad" {...hold((v) => (flightPad.pitch = v))}>
                  ▲
                </button>
                <button className="pad" {...hold((v) => (flightPad.pitch = -v))}>
                  ▼
                </button>
              </div>
            </>
          )}
          <div className="flight-buttons">
            <button className="secondary" onClick={restartLap} title={t.restartTip}>
              {t.restart}
            </button>
            <button className="secondary flight-back" onClick={endFlight}>
              {t.back}
            </button>
            <button className="primary" onClick={startTakeoff}>
              {t.toSpace}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
