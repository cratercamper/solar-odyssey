import { useEffect, useRef, useState } from 'react'
import { cinemaClock } from '../../state/pioneerFx'
import { ui } from '../../i18n'
import { endCinema, usePioneer } from '../../state/pioneer'
import { CINEMA_SECONDS, GROW_SECONDS, STAGE_COUNT, STAGES } from '../../data/pioneer'

// 建設の場面の画面：上下の黒い帯、字幕（段階の名前と、現実の科学のひとこと）、段階の点、とばすボタン。
// 回転の段階では、重力のメーターが 0 から 1g まで上がる。カメラと花火は components/sf/pioneer/BuildCinema.tsx

const ARC = (g: number) => ({ x: 60 - 42 * Math.cos(Math.PI * g), y: 62 - 42 * Math.sin(Math.PI * g) })

/** 時間の帯と重力メーターを、3D の建設と同じ時計（cinemaClock）で動かす。毎フレーム React を描き直さない */
function useCinemaClock(refs: {
  time: React.RefObject<HTMLSpanElement | null>
  arc: React.RefObject<SVGPathElement | null>
  needle: React.RefObject<SVGLineElement | null>
  num: React.RefObject<HTMLElement | null>
}) {
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const t = cinemaClock.t
      if (refs.time.current) refs.time.current.style.width = `${Math.min(1, t / CINEMA_SECONDS) * 100}%`
      const grow = Math.min(1, t / GROW_SECONDS)
      const g = grow * grow * (3 - 2 * grow)
      refs.arc.current?.setAttribute('stroke-dasharray', `${g * 100} 100`)
      const e = ARC(g)
      refs.needle.current?.setAttribute('x2', String(e.x))
      refs.needle.current?.setAttribute('y2', String(e.y))
      if (refs.num.current) refs.num.current.textContent = `${g.toFixed(2)} g`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [refs])
}

export function BuildCinemaUi() {
  const cinema = usePioneer((p) => p.cinema)
  const stage = usePioneer((p) => p.stage)
  const builtAt = usePioneer((p) => p.builtAt)
  if (!cinema) return null
  // 建てるたびに作り直して、前の場面の終わりの姿が一瞬出ないようにする
  return <CinemaOverlay key={builtAt} stage={stage} />
}

function CinemaOverlay({ stage }: { stage: number }) {
  const time = useRef<HTMLSpanElement>(null)
  const arc = useRef<SVGPathElement>(null)
  const needle = useRef<SVGLineElement>(null)
  const num = useRef<HTMLElement>(null)
  const [refs] = useState(() => ({ time, arc, needle, num }))
  useCinemaClock(refs)
  const p = { stage }
  const tt = ui().pioneer
  const built = STAGES[p.stage - 1]
  if (!built) return null
  const finale = p.stage >= STAGE_COUNT
  const start = ARC(0)
  return (
    <div className="pio-cinema-ui" role="dialog" aria-label={tt.built(built.id)}>
      <div className="pio-bar-top">
        <button type="button" className="pio-skip-cinema" onClick={() => endCinema(true)}>
          {tt.cinema.skip} <kbd>Esc</kbd>
        </button>
      </div>
      <div className="pio-bar-bottom">
        <span ref={time} className="pio-cinema-time" style={{ width: '0%' }} />
      </div>
      <div className="pio-caption">
        <div className="pio-cinema-steps" aria-hidden>
          {STAGES.map((st, i) => (
            <i key={st.id} className={i < p.stage - 1 ? 'done' : i === p.stage - 1 ? 'new' : ''} />
          ))}
        </div>
        <small>{finale ? tt.cinema.finale : tt.cinema.stage(p.stage, STAGE_COUNT)}</small>
        <h2>{tt.stageName[built.id]}</h2>
        <p className="pio-cinema-science">{tt.stageScience[built.id]}</p>
      </div>
      {built.id === 'spin' && (
        <div className="pio-gravity" aria-label={`${tt.cinema.gravity} 1.00g`}>
          <span className="pio-gravity-title">{tt.cinema.gravity}</span>
          <svg viewBox="0 0 120 70" aria-hidden>
            <path d="M10 62a50 50 0 0 1 100 0" stroke="rgba(255,255,255,0.18)" strokeWidth="8" fill="none" strokeLinecap="round" />
            <path d="M10 62a50 50 0 0 1 100 0" stroke="var(--accent)" strokeWidth="8" fill="none" strokeLinecap="round" pathLength={100} strokeDasharray="0 100" ref={arc} />
            <line ref={needle} x1="60" y1="62" x2={start.x} y2={start.y} stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <b ref={num}>0.00 g</b>
          <small>{tt.cinema.gravityNote}</small>
        </div>
      )}
    </div>
  )
}
