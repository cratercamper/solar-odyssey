import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { isTouchDevice } from '../../state/input'
import { endMission, useMoonMission } from '../../state/moonMission'
import {
  CAPTURE_OFF,
  CAPTURE_SPEED,
  DOCK_WARP,
  bindDockKeys,
  dock,
  marbleToCoast,
  pressShutter,
  setDockAuto,
  startDock,
  startMarble,
  useMoonDock,
} from '../../state/moonDock'
import { ChapterMenu } from './ChapterMenu'
import { useAutoNext } from './autoNext'
import './dock.css'
import { CamMenu } from './CamMenu'

// 章3（ドッキング）と章4（青い地球）の画面：照準、距離と速さ、ずれの目盛り、終わりのカード。写真の枠と、本物の写真との見くらべ

const REAL_PHOTO = `${import.meta.env.BASE_URL}textures/as17-148-22727.jpg`

function useTick(ms = 100) {
  const [, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}

function hold(set: (v: number) => void, v: number) {
  return {
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      set(v)
    },
    onPointerUp: () => set(0),
    onPointerCancel: () => set(0),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }
}

/** ずれの目盛り：まんなかが着陸船の口。点が司令船の探り棒（照準で見える向きと同じ） */
function OffsetDial() {
  const R = 46
  const scale = R / 1.2
  const x = Math.max(-1.2, Math.min(1.2, dock.x))
  const y = Math.max(-1.2, Math.min(1.2, dock.y))
  const off = Math.hypot(dock.x, dock.y)
  return (
    <svg className="dk-dial" viewBox="-50 -50 100 100" aria-hidden>
      <circle r={R} className="dk-dial-edge" />
      <circle r={CAPTURE_OFF * scale} className={`dk-dial-ok ${off <= CAPTURE_OFF ? 'in' : ''}`} />
      <line x1={-R} x2={R} y1={0} y2={0} className="dk-dial-line" />
      <line y1={-R} y2={R} x1={0} x2={0} className="dk-dial-line" />
      <circle cx={x * scale} cy={-y * scale} r={4} className="dk-dial-dot" />
    </svg>
  )
}

function Approach() {
  useTick()
  const T = ui().moonDock
  const auto = useMoonMission((s) => s.auto)
  const tries = useMoonDock((s) => s.tries)
  const touch = isTouchDevice()
  const fast = dock.vz > CAPTURE_SPEED
  const off = Math.hypot(dock.x, dock.y)
  return (
    <>
      <div className="dk-panel">
        <div className="dk-row">
          <span>{T.gap}</span>
          <b>{T.m(Math.max(0, dock.gap))}</b>
        </div>
        <div className={`dk-row ${fast ? 'bad' : dock.vz > 0.02 ? 'good' : ''}`}>
          <span>{T.closing}</span>
          <b>{T.ms(dock.vz)}</b>
          {fast && <i>{T.tooFast}</i>}
        </div>
        <div className={`dk-row ${off <= CAPTURE_OFF ? 'good' : ''}`}>
          <span>{T.offset}</span>
          <b>{T.m(off)}</b>
        </div>
        <OffsetDial />
        <div className="dk-note">{T.limit(CAPTURE_SPEED, CAPTURE_OFF)}</div>
        <div className="dk-warp">{T.warp(DOCK_WARP)}</div>
        {tries > 0 && <div className="dk-note">{T.tries(tries)}</div>}
      </div>
      {!touch && !auto && <div className="dk-hint">{T.keys}</div>}
      {touch && !auto && (
        <div className="dk-pad">
          <div className="dk-pad-cross">
            <button className="u" {...hold((v) => (dock.input.y = v), 1)}>▲</button>
            <button className="l" {...hold((v) => (dock.input.x = v), -1)}>◀</button>
            <button className="r" {...hold((v) => (dock.input.x = v), 1)}>▶</button>
            <button className="d" {...hold((v) => (dock.input.y = v), -1)}>▼</button>
          </div>
          <div className="dk-pad-z">
            <button className="go" {...hold((v) => (dock.input.z = v), 1)}>{T.touchFwd}</button>
            <button {...hold((v) => (dock.input.z = v), -1)}>{T.touchBack}</button>
          </div>
        </div>
      )}
    </>
  )
}

/** 照準（COAS）：司令船の窓に映る十字 */
function Coas() {
  return (
    <svg className="dk-coas" viewBox="-100 -100 200 200" aria-hidden>
      <circle r={60} />
      <line x1={-92} x2={-14} y1={0} y2={0} />
      <line x1={14} x2={92} y1={0} y2={0} />
      <line y1={-92} y2={-14} x1={0} x2={0} />
      <line y1={14} y2={92} x1={0} x2={0} />
      {[-40, -20, 20, 40].map((v) => (
        <g key={v}>
          <line x1={v} x2={v} y1={-4} y2={4} />
          <line y1={v} y2={v} x1={-4} x2={4} />
        </g>
      ))}
    </svg>
  )
}

function DockEnd() {
  const T = ui().moonDock
  const M = ui().moonMission
  const stars = useMoonDock((s) => s.stars)
  const hit = useMoonDock((s) => s.hit)
  const auto = useAutoNext(() => startMarble(), 6)
  return (
    <div className="mm-end dk-end">
      <div className="mm-end-title">{T.endTitle}</div>
      <div className="mm-end-stars">{T.endStars(stars)}</div>
      {hit && <div className="mm-end-note">{T.endLine(hit.speed, hit.off)}</div>}
      <div className="mm-end-note">{T.endNote}</div>
      <div className="mm-end-buttons">
        <button className="mm-continue" onClick={() => startMarble()}>
          {auto.left !== null ? M.autoNext(T.toMarble, auto.left) : T.toMarble}
        </button>
        <button onClick={() => (auto.cancel(), startDock())}>{T.again}</button>
        <button onClick={() => (auto.cancel(), endMission())}>{T.back}</button>
      </div>
    </div>
  )
}

/** 写真の枠：短い辺の 8 割の四角（DockWorld の画角と同じ）。ドラッグでカメラを向ける */
function Finder() {
  const T = ui().moonDock
  const drag = useRef<{ x: number; y: number } | null>(null)
  const touch = isTouchDevice()
  const deg = () => 38.6 / (0.8 * Math.min(window.innerWidth, window.innerHeight))
  return (
    <>
      <div
        className="dk-drag"
        onPointerDown={(e) => {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const k = deg()
          // つかんで動かす向きに地球が動く（カメラは逆へ）
          dock.aimYaw -= (e.clientX - drag.current.x) * k
          dock.aimPitch += (e.clientY - drag.current.y) * k
          drag.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
      <div className="dk-finder" aria-hidden>
        <i className="g1" />
        <i className="g2" />
        <i className="g3" />
        <i className="g4" />
        <span>{T.finder}</span>
      </div>
      <div className="dk-hint dk-aim">
        <div>{T.aimHint}</div>
        {!touch && <div className="dk-sub">{T.aimKeys}</div>}
      </div>
      <button className="dk-shutter" onClick={() => pressShutter()}>
        {T.shutter}
      </button>
    </>
  )
}

function Compare() {
  const T = ui().moonDock
  const M = ui().moonMission
  const photo = useMoonDock((s) => s.photo)
  // 撮った写真と本物を見くらべる時間をとってから、自動で 3 日の旅へ（撮り直すと止まる）
  const auto = useAutoNext(() => marbleToCoast(), 10, !!photo)
  if (!photo) return null
  const stars = photo.cut ? 0 : photo.off < 3 ? 3 : photo.off < 6 ? 2 : 1
  return (
    <div className="dk-compare">
      <div className="dk-photos">
        <figure>
          {photo.url ? <img src={photo.url} alt={T.yours} /> : <div className="dk-nophoto" />}
          <figcaption>
            {T.yours}
            <b className="dk-stars">{T.photoStars(stars)}</b>
            {!photo.cut && <small>{T.photoOff(photo.off)}</small>}
          </figcaption>
        </figure>
        <figure>
          <img src={REAL_PHOTO} alt={T.real} />
          <figcaption>{T.real}</figcaption>
        </figure>
      </div>
      <div className="dk-note">{photo.cut ? T.cutNote : T.realNote}</div>
      <div className="mm-end-buttons">
        <button className="mm-continue" onClick={() => marbleToCoast()}>
          {auto.left !== null ? M.autoNext(T.toCoast, auto.left) : T.toCoast}
        </button>
        <button onClick={() => (auto.cancel(), pressShutter())}>{T.retake}</button>
      </div>
      <div className="dk-credit">{T.credit}</div>
    </div>
  )
}

export function DockHud() {
  useLang()
  const T = ui().moonDock
  const M = ui().moonMission
  const phase = useMoonMission((s) => s.phase)
  const cam = useMoonMission((s) => s.cam)
  const auto = useMoonMission((s) => s.auto)
  const step = useMoonDock((s) => s.step)
  useEffect(() => bindDockKeys(), [])
  const marble = phase === 'marble'
  const coas = !marble && cam === 'window' && (step === 'approach' || step === 'capture' || step === 'latch')
  return (
    <>
      {coas && <Coas />}
      {step === 'approach' && <Approach />}
      {step === 'dockEnd' && <DockEnd />}
      {marble && cam === 'window' && step === 'aim' && <Finder />}
      {marble && step === 'aim' && cam !== 'window' && (
        <button className="dk-shutter" onClick={() => useMoonMission.setState({ cam: 'window', camLocked: true })}>
          {T.finder}
        </button>
      )}
      {marble && step === 'shot' && <Compare />}
      <div className="mm-buttons dk-buttons">
        <CamMenu />
        {step === 'approach' && (
          <button className={auto ? 'on' : ''} onClick={() => setDockAuto(!auto)}>
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
