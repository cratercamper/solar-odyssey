import { useEffect, useState, type PointerEvent as RPointerEvent } from 'react'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { isTouchDevice } from '../../state/input'
import { endMission, useMoonMission } from '../../state/moonMission'
import { CORRIDOR, EI_ANGLE, blackout } from '../../data/reentry'
import { CORRIDOR_TIME, ENTRY_WARP, TEI_BURN, TEI_WARP, bindReturnKeys, inCorridor, pressTei, ret, retryEntry, setReturnAuto, startReturn, useMoonReturn } from '../../state/moonReturn'
import { startChapter } from '../../state/missionChapters'
import { ChapterMenu } from './ChapterMenu'
import './return.css'
import { CamMenu } from './CamMenu'

// 章8（離陸・再会・地球へ帰還）の画面：ランデブーの距離、地球へ向かう点火のボタン、突入の角度の目盛り、
// 火の玉の中の高さ・速さ・G・揚力の向き、パラシュート、失敗と終わりのカード

function useTick(ms = 100) {
  const [, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}

/** 押しているあいだだけ ret.input を v に */
function hold(v: number) {
  return {
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      ret.input = v
      if (ret.auto) setReturnAuto(false)
    },
    onPointerUp: () => (ret.input = 0),
    onPointerCancel: () => (ret.input = 0),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }
}

const km = (m: number) => ui().moonMission.journey.dist(m)
const kms = (v: number) => ui().moonMission.journey.speedOf(v)

/** 角度の目盛り：左が浅い（-4°）、右が深い（-9°）。緑の帯が回廊、まん中の線が −6.5° */
function AngleGauge({ angle }: { angle: number }) {
  const T = ui().moonReturn
  const lo = -4
  const hi = -9
  const x = (a: number) => ((a - lo) / (hi - lo)) * 100
  const ok = inCorridor(angle)
  return (
    <div className="rt-gauge">
      <div className="rt-gauge-bar">
        <i className="rt-gauge-bad l" style={{ width: `${x(CORRIDOR.shallow)}%` }} />
        <i className="rt-gauge-ok" style={{ left: `${x(CORRIDOR.shallow)}%`, width: `${x(CORRIDOR.steep) - x(CORRIDOR.shallow)}%` }} />
        <i className="rt-gauge-ideal" style={{ left: `${x(EI_ANGLE)}%` }} />
        <i className={`rt-gauge-needle ${ok ? 'ok' : 'bad'}`} style={{ left: `${Math.max(0, Math.min(100, x(angle)))}%` }} />
      </div>
      <div className="rt-gauge-labels">
        <span>{T.shallow}</span>
        <span>{T.steep}</span>
      </div>
    </div>
  )
}

function Corridor() {
  useTick()
  const T = ui().moonReturn
  const auto = useMoonMission((s) => s.auto)
  const touch = isTouchDevice()
  const left = CORRIDOR_TIME - ret.t
  return (
    <>
      <div className="rt-center">
        <div className="rt-k">{T.angle}</div>
        <div className={`rt-big ${inCorridor(ret.angle) ? 'good' : 'bad'}`}>{T.deg(ret.angle)}</div>
        <AngleGauge angle={ret.angle} />
        <div className="rt-sub">
          {T.ideal}　·　{T.toEi(left)}
        </div>
        {!touch && !auto && <div className="rt-keys">{T.angleKeys}</div>}
      </div>
      {touch && !auto && (
        <div className="rt-pad">
          <button {...hold(1)}>{T.touchUp}</button>
          <button {...hold(-1)}>{T.touchDown}</button>
        </div>
      )}
    </>
  )
}

function EntryPanel() {
  useTick()
  const T = ui().moonReturn
  const auto = useMoonMission((s) => s.auto)
  const touch = isTouchDevice()
  const e = ret.e
  if (!e) return null
  const black = blackout(e)
  const climbing = e.gamma > 0 && e.v > 7000
  const lift = e.lift > 0.5 ? T.liftUp : e.lift < -0.5 ? T.liftDown : T.liftSide
  return (
    <>
      <div className="rt-panel">
        <div className="rt-row">
          <span>{T.alt}</span>
          <b>{km(e.h)}</b>
        </div>
        <div className="rt-row">
          <span>{T.speed}</span>
          <b>{kms(e.v)}</b>
        </div>
        <div className={`rt-row ${e.g > 9 ? 'bad' : e.g > 6.5 ? 'warn' : ''}`}>
          <span>{T.g}</span>
          <b>{e.g.toFixed(1)}</b>
          <i className="rt-gbar">
            <i style={{ width: `${Math.min(100, (e.g / 12) * 100)}%` }} />
          </i>
        </div>
        <div className="rt-note">{T.peak(e.peakG)}</div>
        <div className="rt-row">
          <span>{T.lift}</span>
          <b className="rt-lift">
            <i style={{ transform: `rotate(${Math.acos(Math.max(-1, Math.min(1, e.lift)))}rad)` }}>↑</i>
            {lift}
          </b>
        </div>
        <div className="rt-warp">{T.warp(ENTRY_WARP)}</div>
      </div>
      {black && <div className="rt-black">{T.blackout}</div>}
      {climbing && !auto && <div className="rt-climb">{T.climbing}</div>}
      {!touch && !auto && (
        <div className="rt-keys rt-bottom">
          <div>{T.entryKeys}</div>
          <div className="rt-tip">{T.entryTip}</div>
        </div>
      )}
      {touch && !auto && (
        <div className="rt-pad">
          <button {...hold(1)}>{T.touchLiftUp}</button>
          <button {...hold(-1)}>{T.touchLiftDown}</button>
        </div>
      )}
    </>
  )
}

function Chutes() {
  useTick()
  const T = ui().moonReturn
  const mains = useMoonReturn((s) => s.mains)
  return (
    <div className="rt-panel rt-small">
      <div className="rt-row">
        <span>{T.alt}</span>
        <b>{km(ret.h)}</b>
      </div>
      <div className="rt-note">{mains ? T.mains : T.drogue}</div>
    </div>
  )
}

function Rendezvous() {
  useTick()
  const T = ui().moonReturn
  return (
    <div className="rt-panel rt-small">
      <div className="rt-row">
        <span>{T.gap}</span>
        <b>{T.m(Math.max(0, ret.gap))}</b>
      </div>
    </div>
  )
}

function Tei() {
  useTick()
  const T = ui().moonReturn
  const step = useMoonReturn((s) => s.step)
  if (step === 'teiWait')
    return (
      <div className="rt-tei">
        <button className="mm-go ready" onPointerDown={() => pressTei()}>
          {T.teiGo}
        </button>
        <div className="mm-hint">{T.teiHint}</div>
      </div>
    )
  const burned = Math.min(TEI_BURN, ret.t * TEI_WARP)
  return (
    <div className="rt-tei">
      <div className="rt-burn">
        <i style={{ width: `${(burned / TEI_BURN) * 100}%` }} />
      </div>
      <div className="rt-sub">
        {T.burn(burned)}　·　{T.warp(TEI_WARP)}
      </div>
    </div>
  )
}

function Fail() {
  const T = ui().moonReturn
  const fail = useMoonReturn((s) => s.fail)
  const peak = useMoonReturn((s) => s.peakG)
  return (
    <div className="mm-end rt-card">
      <div className="mm-end-title">{fail === 'skip' ? T.skipTitle : T.steepTitle}</div>
      <div className="mm-end-note">{fail === 'skip' ? T.skipLine : T.steepLine}</div>
      {fail === 'steep' && <div className="mm-end-note">{T.peak(peak)}</div>}
      <div className="mm-end-buttons">
        <button className="mm-continue" onClick={() => retryEntry()}>
          {T.retry}
        </button>
        <button onClick={() => endMission()}>{T.back}</button>
      </div>
    </div>
  )
}

function End() {
  const T = ui().moonReturn
  const s = useMoonReturn()
  return (
    <div className="mm-end rt-card">
      <div className="mm-end-title">{T.endTitle}</div>
      <div className="mm-end-stars">{T.endStars(s.stars)}</div>
      {s.angle !== null && <div className="mm-end-note">{T.endLine(s.angle, s.peakG)}</div>}
      <div className="mm-end-note rt-starnote">{T.endNote}</div>
      {T.endLines.map((l) => (
        <div className="mm-end-next" key={l}>
          {l}
        </div>
      ))}
      <div className="mm-end-buttons">
        <button onClick={() => startReturn()}>{T.again}</button>
        <button onClick={() => startChapter(0)}>{T.toStart}</button>
        <button className="mm-continue" onClick={() => endMission()}>
          {T.back}
        </button>
      </div>
    </div>
  )
}

export function ReturnHud() {
  useLang()
  const T = ui().moonReturn
  const M = ui().moonMission
  const auto = useMoonMission((s) => s.auto)
  const step = useMoonReturn((s) => s.step)
  useEffect(() => bindReturnKeys(), [])
  const steer = step === 'corridor' || step === 'entry'
  return (
    <>
      {step === 'rdv' && <Rendezvous />}
      {(step === 'teiWait' || step === 'tei') && <Tei />}
      {step === 'corridor' && <Corridor />}
      {step === 'entry' && <EntryPanel />}
      {step === 'chutes' && <Chutes />}
      {step === 'fail' && <Fail />}
      {step === 'end' && <End />}
      <div className="mm-buttons rt-buttons">
        <CamMenu />
        {steer && (
          <button className={auto ? 'on' : ''} onClick={() => setReturnAuto(!auto)}>
            {auto ? T.autoOn : T.auto}
          </button>
        )}
        <ChapterMenu />
        <button className="mm-quit" onClick={() => endMission()}>
          {M.quit}
        </button>
      </div>
    </>
  )
}
