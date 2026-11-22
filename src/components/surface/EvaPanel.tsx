import { useEffect, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { isTouchDevice } from '../../state/input'
import { bindRoverKeys, roverInput, useRover } from '../../state/rover'
import { EVA_STOPS, evaSite, leaveApolloEva, nextLeg, restartEva, skipDrive, takeSample, useApolloEva, watchLiftoff } from '../../state/apolloEva'
import { RoverHud, RoverMap } from './RoverHud'
import { RadioSubtitle } from '../moonMission/RadioSubtitle'
import { useRadio } from '../../audio/radio'
import { startChapter } from '../../state/missionChapters'
import './evaPanel.css'

// アポロ17号の追体験・章7（state/apolloEva.ts）の表示：いまの船外活動・次の場所・着いたときのカード・
// 採った試料・月を去る言葉・離陸のテレビの枠・おわりのカード。運転は与圧ローバーと同じ速度計とボタン

function holdProps(on: () => void, off: () => void) {
  return {
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      on()
    },
    onPointerUp: off,
    onPointerCancel: off,
    onContextMenu: (e: RMouseEvent) => e.preventDefault(),
  }
}

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`)

/** 次の場所の向き：月面車の向きからの角度（右が +）を、ことばと矢印に */
function Direction({ turn }: { turn: number }) {
  const T = ui().apolloEva
  const deg = (turn * 180) / Math.PI
  const word = Math.abs(deg) < 20 ? T.ahead : Math.abs(deg) > 150 ? T.behind : deg > 0 ? T.right : T.left
  return (
    <span className="ae-dir">
      <span className="ae-arrow" style={{ transform: `rotate(${deg}deg)` }}>
        ▲
      </span>
      {word}
    </span>
  )
}

export function EvaPanel() {
  useLang()
  const T = ui().apolloEva
  const H = ui().apollo17
  const step = useApolloEva((s) => s.step)
  const leg = useApolloEva((s) => s.leg)
  const dist = useApolloEva((s) => s.dist)
  const turn = useApolloEva((s) => s.turn)
  const phase = useRover((r) => r.phase)
  const view = useRover((r) => r.view)
  const radio = useRadio((r) => r.playing)
  useEffect(() => bindRoverKeys(), [])
  const drive = phase === 'drive' && (step === 'drive' || step === 'back')
  const stop = EVA_STOPS[Math.min(leg, EVA_STOPS.length - 1)]
  const site = evaSite(stop.id)
  const eva = leg >= EVA_STOPS.length ? 3 : stop.eva
  const tv = step === 'liftoff' || step === 'done'

  return (
    <>
      {tv && <div className="ae-tv" aria-hidden="true" />}
      {/* 章の始まりの幕：月面車の用意ができるまで（黒い空だけの画面にしない） */}
      <div className={`ae-title ${step === 'board' && phase !== 'drive' ? 'on' : ''}`} aria-hidden={step !== 'board'}>
        <div className="ae-title-k">{T.chapter}</div>
        <div className="ae-title-date">{T.titleCard[1]}</div>
        <div className="ae-title-line">{T.titleCard[2]}</div>
      </div>
      <RadioSubtitle />
      <div className="ae-head">
        <div className="ae-chapter">{T.chapter}</div>
        {!tv && (
          <div className="ae-no">
            {T.evaNo(eva)} <small>· {T.evaLength[eva - 1]}</small>
          </div>
        )}
      </div>
      {!tv && <div className="surface-left rover">{phase === 'drive' && <RoverMap />}</div>}

      {(step === 'board' || drive) && (
        <div className="surface-hint rover-hint">{step === 'board' ? T.boarding : T.keysHint}</div>
      )}

      {(step === 'drive' || step === 'back') && (
        <div className="ae-card ae-target">
          <div className="ae-k">{step === 'back' ? T.backToLm : T.next}</div>
          {step === 'drive' && <div className="ae-name">{H[site.id].name}</div>}
          <div className="ae-dist">
            {T.distance(km(dist))} <Direction turn={turn} />
          </div>
          {step === 'back' && <div className="ae-note">{T.parkHint}</div>}
          <button className="secondary ae-skip" onClick={skipDrive} title={T.skipTip}>
            {T.skip}
          </button>
        </div>
      )}

      {step === 'stop' && (
        <div className="ae-card ae-big">
          <div className="ae-k">
            {T.arrived} · {H[site.id].when}
          </div>
          <div className="ae-name">{H[site.id].name}</div>
          <p>{H[site.id].story}</p>
          <button className="primary" onClick={takeSample}>
            {T.take}
          </button>
        </div>
      )}

      {step === 'sample' && (
        <div className="ae-card ae-big">
          <div className="ae-k">{T.sampleLabel}</div>
          <div className="ae-name">{T.samples[stop.id].title}</div>
          {T.samples[stop.id].lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <button className="primary" onClick={nextLeg}>
            {leg + 1 >= EVA_STOPS.length ? T.goBack : T.goNext}
          </button>
        </div>
      )}

      {step === 'closeout' && (
        <div className="ae-card ae-big ae-closeout">
          <div className="ae-name">{T.closeoutTitle}</div>
          {T.closeoutLines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <button className="primary" onClick={watchLiftoff} disabled={!!radio}>
            {T.watch}
          </button>
        </div>
      )}

      {step === 'liftoff' && (
        <div className="ae-tv-cap">
          <div>{T.liftoffCap}</div>
          <small>{T.liftoffNote}</small>
        </div>
      )}

      {step === 'done' && (
        <div className="ae-card ae-big ae-done">
          <div className="ae-name">{T.doneTitle}</div>
          {T.doneLines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <div className="ae-buttons">
            <button className="primary" onClick={() => startChapter(8)}>
              {T.toReturn}
            </button>
            <button className="secondary" onClick={restartEva}>
              {T.again}
            </button>
            <button className="secondary" onClick={leaveApolloEva}>
              {T.end}
            </button>
          </div>
        </div>
      )}

      {drive && <RoverHud />}
      {drive && isTouchDevice() && (
        <div className="rover-pad">
          <div className="rover-pad-left">
            <button {...holdProps(() => (roverInput.steer = -1), () => (roverInput.steer = 0))}>◀</button>
            <button {...holdProps(() => (roverInput.steer = 1), () => (roverInput.steer = 0))}>▶</button>
          </div>
          <div className="rover-pad-right">
            <button {...holdProps(() => (roverInput.throttle = -1), () => (roverInput.throttle = 0))}>▼</button>
            <button className="go" {...holdProps(() => (roverInput.throttle = 1), () => (roverInput.throttle = 0))}>▲</button>
          </div>
        </div>
      )}
      {!tv && (
        <div className="surface-buttons rover-actions">
          {drive && (
            <button className="secondary" onClick={() => useRover.getState().setView(view === 'chase' ? 'cam' : 'chase')}>
              {view === 'chase' ? T.toSeat : T.toChase}
            </button>
          )}
          <button className="secondary" onClick={leaveApolloEva}>
            {T.end}
          </button>
        </div>
      )}
    </>
  )
}
