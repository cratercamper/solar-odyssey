import { useEffect, useState } from 'react'
import { ECLIPSES, eclipseById, type Eclipse } from '../data/eclipses'
import { EPOCH_MS } from '../data/ephemeris'
import { closeEclipses, eclipseClock, eclipseNow, eclipseStage, playEclipse, seekEclipse, toggleEclipsePlay, useEclipse } from '../state/eclipse'
import { useStore } from '../state/store'
import { raceActive, useRace } from '../state/race'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'

const HOUR_MS = 3_600_000
const pad = (n: number) => String(n).padStart(2, '0')

/** 言語の時間帯で読む（日本語は日本時間、英語は世界時（UTC）：eclipsePanel.utcOffsetHours） */
const zoned = (ms: number) => new Date(ms + ui().eclipsePanel.utcOffsetHours * HOUR_MS)

function dayText(ms: number) {
  const d = zoned(ms)
  return ui().eclipsePanel.date(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

function clockText(ms: number) {
  const d = zoned(ms)
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  return ui().eclipsePanel.dateTime(dayText(ms), time)
}

function typeName(e: Eclipse) {
  if (e.kind === 'solar') {
    if (e.type === 'total') return ui().eclipsePanel.totalSolarEclipse
    if (e.type === 'annular') return ui().eclipsePanel.annularSolarEclipse
    return ui().eclipsePanel.partialSolarEclipse
  }
  if (e.type === 'total') return ui().eclipsePanel.totalLunarEclipse
  if (e.type === 'partial') return ui().eclipsePanel.partialLunarEclipse
  return ui().eclipsePanel.penumbralLunarEclipse
}

/** 今の様子の説明 */
function stageText(e: Eclipse, before: boolean) {
  const stage = eclipseStage()
  if (e.kind === 'solar') {
    if (stage === 'none')
      return before
        ? ui().eclipsePanel.solarBeforeNote
        : ui().eclipsePanel.solarAfterNote
    if (stage === 'partial')
      return ui().eclipsePanel.solarPartialNote
    return eclipseNow.umbra < 0
      ? ui().eclipsePanel.solarAnnularNote
      : ui().eclipsePanel.solarTotalNote
  }
  if (stage === 'none')
    return before
      ? ui().eclipsePanel.lunarBeforeNote
      : ui().eclipsePanel.lunarAfterNote
  if (stage === 'penumbral')
    return ui().eclipsePanel.lunarPenumbralNote
  if (stage === 'partial')
    return ui().eclipsePanel.lunarPartialNote
  return ui().eclipsePanel.lunarTotalNote
}

/** 再生中の時刻と様子（0.2秒おきに読む） */
function useReadout(id: string | null) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!id) return
    const read = () => setNow(eclipseClock.ms)
    read()
    const timer = setInterval(read, 200)
    return () => clearInterval(timer)
  }, [id])
  return now
}

/** 宇宙から見る日食・月食：一覧から選ぶと、その日時の地球と月を、影が落ちるところまで再生する */
export function EclipsePanel() {
  const { open, eclipseId, playing } = useEclipse()
  const mode = useStore((s) => s.mode)
  const racePhase = useRace((r) => r.phase)
  const ms = useReadout(open ? eclipseId : null)
  const eclipse = eclipseById(eclipseId)
  useLang()

  // 全体マップを離れたり、レースが始まったりしたら閉じる（惑星を元の時間に戻す）
  useEffect(() => {
    if (open && (mode !== 'map' || raceActive())) closeEclipses()
  }, [open, mode, racePhase])

  if (!open) return null

  return (
    <section className="probe-panel eclipse-panel" aria-label={ui().eclipsePanel.eclipses}>
      <header>
        <h2>
          {ui().eclipsePanel.eclipsesFromSpace}
          {eclipse && <span className="eclipse-kind">{ui().eclipsePanel.separator}{typeName(eclipse)}</span>}
        </h2>
        <button className="close" onClick={closeEclipses} aria-label={ui().eclipsePanel.close}>
          ×
        </button>
      </header>

      {!eclipse ? (
        <>
          <p className="muted">
            {ui().eclipsePanel.introNote}
          </p>
          <div className="probe-list">
            {ECLIPSES.map((e) => {
              const past = Date.parse(e.at) < EPOCH_MS
              return (
                <button key={e.id} className="nav-item" onClick={() => playEclipse(e.id)}>
                  <span className={`probe-dot eclipse-dot ${e.kind}`} />
                  <span>
                    {dayText(Date.parse(e.at))} {typeName(e)}
                    {past && <span className="muted small"> {ui().eclipsePanel.pastSuffix}</span>}
                    <span className="muted small"> {ui().eclipses[e.id].where}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div className="probe-date">{clockText(ms)}</div>
          <p className="eclipse-where muted small">
            {ui().eclipsePanel.seenFrom}
            {ui().eclipses[eclipse.id].where}
          </p>
          <p className="eclipse-stage">{stageText(eclipse, ms < eclipseClock.peak)}</p>
          <input
            className="eclipse-seek"
            type="range"
            min={eclipseClock.peak - eclipseClock.span}
            max={eclipseClock.peak + eclipseClock.span}
            step={60_000}
            value={ms}
            onChange={(e) => seekEclipse(Number(e.target.value))}
            aria-label={ui().eclipsePanel.time}
          />
          <p className="muted small">{ui().eclipses[eclipse.id].note}</p>
          <div className="probe-controls">
            <button className="secondary" onClick={toggleEclipsePlay}>
              {playing ? ui().eclipsePanel.pause : ms >= eclipseClock.peak + eclipseClock.span ? ui().eclipsePanel.replay : ui().eclipsePanel.play}
            </button>
            <button className="secondary" onClick={() => useEclipse.setState({ eclipseId: null, playing: false })}>
              {ui().eclipsePanel.otherEclipses}
            </button>
          </div>
        </>
      )}
      <p className={`muted small eclipse-about${eclipse ? ' watching' : ''}`}>
        {ui().eclipsePanel.lineUpNote}
      </p>
    </section>
  )
}
