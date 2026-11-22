import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { PROBES, dateMs } from '../data/probes'
import { EPOCH_MS, formatDate } from '../data/ephemeris'
import { closeProbes, pathAt, playProbe, probeById, probeClock, probePath, realDistanceNow, seekProbe, togglePlay, useProbes } from '../state/probes'
import { heliocentric } from '../data/trajectory'
import { ProbeCamPane } from './ProbeCamPane'
import { useStore } from '../state/store'
import { raceActive, useRace } from '../state/race'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'

const YEAR_MS = 365.25 * 86_400_000
/** 1天文単位（億km） */
const AU_OKU_KM = 1.496

/** 再生中の日付と、太陽からの距離（0.2秒おきに読む） */
function useReplayReadout(probeId: string | null) {
  const [now, setNow] = useState({ ms: 0, au: 0 })
  const path = useRef<ReturnType<typeof probePath> | null>(null)
  useEffect(() => {
    const probe = probeById(probeId)
    path.current = probe ? probePath(probe) : null
    if (!probe) return
    const p = new THREE.Vector3()
    // 最後の天体を過ぎて1年たったら、本物の距離（まっすぐ遠ざかる速さから）を出す。道すじの形はおおよそなので
    const last = probe.stops[probe.stops.length - 1]
    const realFrom = dateMs(last.until ?? last.date) + YEAR_MS
    const read = () => {
      if (probe.trajectory) {
        setNow({ ms: probeClock.ms, au: Math.hypot(...heliocentric(probe.trajectory, probeClock.ms).r) })
        return
      }
      const d = probe.distance
      const real = d && probeClock.ms > realFrom ? d.au + (d.auPerYear * (probeClock.ms - dateMs(d.date))) / YEAR_MS : null
      setNow({ ms: probeClock.ms, au: real ?? (path.current ? pathAt(path.current, probeClock.ms, p).point.length() : 0) })
    }
    read()
    const id = setInterval(read, 200)
    return () => clearInterval(id)
  }, [probeId])
  return now
}

/** 今も飛んでいる探査機の、今の距離の説明 */
function nowText(id: string) {
  const probe = probeById(id)
  const au = probe ? realDistanceNow(probe) : null
  if (!probe || au === null) return null
  const hours = Math.round((au * 8.317) / 60)
  const today = formatDate(new Date(EPOCH_MS))
  return ui().probePanel.distanceToday(today, Math.round(au), Math.round(au * AU_OKU_KM), hours, ((au * AU_OKU_KM) / 10).toFixed(1))
}

/** 探査機の旅：一覧から選ぶと、打ち上げから順に、惑星をその日の位置に動かしながら道すじをたどる */
export function ProbePanel() {
  const { open, probeId, playing, event, finished } = useProbes()
  const mode = useStore((s) => s.mode)
  const racePhase = useRace((r) => r.phase)
  const readout = useReplayReadout(open ? probeId : null)
  const list = useRef<HTMLOListElement>(null)
  const probe = probeById(probeId)
  useLang()

  // 全体マップを離れたり、レースが始まったりしたら閉じる（惑星を元の時間に戻す）
  useEffect(() => {
    if (open && (mode !== 'map' || raceActive())) closeProbes()
  }, [open, mode, racePhase])

  // 今のできごとが見えるように
  useEffect(() => {
    list.current?.querySelector('.now')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [event])

  if (!open) return null

  return (
    <>
      {probe?.trajectory && probe.model && <ProbeCamPane probe={probe} />}
      <section className={`probe-panel${probe?.trajectory ? ' with-cam' : ''}`} aria-label={ui().probePanel.probeJourneys}>
        <header>
          <h2>
            {ui().probePanel.probeJourneys}
            {probe && <span style={{ color: probe.color }}>{ui().probePanel.separator}{ui().probes[probe.id].name}</span>}
          </h2>
          <button className="close" onClick={closeProbes} aria-label={ui().probePanel.close}>
            ×
          </button>
        </header>

        {!probe ? (
          <>
            <p className="muted">
              {ui().probePanel.introNote}
            </p>
            <div className="probe-list">
              {PROBES.map((p) => (
                <button key={p.id} className="nav-item" onClick={() => playProbe(p.id)}>
                  <span className="probe-dot" style={{ background: p.color }} />
                  <span>
                    {ui().probes[p.id].name}
                    <span className="muted small"> {ui().probes[p.id].summary}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="probe-date">
              {formatDate(new Date(readout.ms))}
              <span className="muted">
                {ui().probePanel.sunDistancePrefix}
                {readout.au < 10 ? readout.au.toFixed(1) : Math.round(readout.au)}
                {ui().probePanel.sunDistanceSuffix}
              </span>
            </div>
            <ol className="probe-events" ref={list}>
              {probe.events.map((e, i) => (
                <li key={e.date} className={i === event ? 'now' : i < event ? 'past' : ''} onClick={() => seekProbe(dateMs(e.date))}>
                  <span className="probe-when">{formatDate(new Date(dateMs(e.date)))}</span>
                  {ui().probes[probe.id].events[i].text}
                </li>
              ))}
              {finished && (
                <li className="now">
                  {ui().probes[probe.id].last} {nowText(probe.id)}
                </li>
              )}
            </ol>
            <div className="probe-controls">
              <button className="secondary" onClick={togglePlay}>
                {finished ? ui().probePanel.replay : playing ? ui().probePanel.pause : ui().probePanel.play}
              </button>
              <button className="secondary" onClick={() => useProbes.setState({ probeId: null, playing: false })}>
                {ui().probePanel.otherProbes}
              </button>
            </div>
          </>
        )}
        <p className="muted small">
          {probe?.trajectory ? ui().probePanel.realPathNote : ui().probePanel.pathsNote}
        </p>
      </section>
    </>
  )
}
