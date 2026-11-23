import { Suspense, memo, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import { useDpr } from '../../state/quality'
import { QualityGovernor } from '../QualityGovernor'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { isTouchDevice } from '../../state/input'
import { WALK_FADE, bindWalkKeys, endWalk, toggleWalkView, useWalk, walkInput, walkNow, walkScene } from '../../state/walk'
import { colonyDay } from '../sf/colonyCity'
import { WalkWorld } from './WalkWorld'
import './WalkView.css'
import { WalkActors, walker, wingFlight } from './WalkActors'
import { WalkErrand } from './WalkErrand'
import { WalkErrandHud } from './WalkErrandHud'

// コロニーの中を歩く場面。宇宙の場面とは別の Canvas で描く（そのあいだ宇宙の場面は止める）。

const WalkCanvas = memo(function WalkCanvas() {
  const dpr = useDpr(1.75)
  return (
    <Canvas shadows="percentage" dpr={dpr} gl={{ alpha: false, logarithmicDepthBuffer: true }} camera={{ fov: 62, near: 0.08, far: 60000 }}>
      <Suspense fallback={null}>
        <WalkWorld follow={{ current: walker.pos }} />
        <WalkActors />
        {/* 配達の仕事：研究温室へ歩いて届ける（そのときだけ出る） */}
        <WalkErrand />
      </Suspense>
      <QualityGovernor />
    </Canvas>
  )
})

/** スマホの移動スティック（左下） */
function Stick() {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState<[number, number]>([0, 0])
  const move = (e: RPointerEvent) => {
    const el = base.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const R = r.width / 2
    let x = (e.clientX - r.left - R) / R
    let y = (e.clientY - r.top - R) / R
    const l = Math.hypot(x, y)
    if (l > 1) {
      x /= l
      y /= l
    }
    walkInput.stickX = Math.abs(x) < 0.12 ? 0 : x
    walkInput.stickY = Math.abs(y) < 0.12 ? 0 : y
    setKnob([x, y])
  }
  const end = () => {
    walkInput.stickX = 0
    walkInput.stickY = 0
    setKnob([0, 0])
  }
  return (
    <div
      className="eva-stick"
      ref={base}
      onPointerDown={(e) => {
        e.stopPropagation()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        move(e)
      }}
      onPointerMove={(e) => e.buttons && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="eva-knob" style={{ transform: `translate(${knob[0] * 34}px, ${knob[1] * 34}px)` }} />
    </div>
  )
}

/** 昼・夕方・夜（コロニーの 1 日） */
function useDayWord() {
  const [word, setWord] = useState<'day' | 'dusk' | 'night'>('day')
  useEffect(() => {
    const iv = window.setInterval(() => {
      const n = colonyDay.night
      setWord(n < 0.15 ? 'day' : n > 0.85 ? 'night' : 'dusk')
    }, 1000)
    return () => window.clearInterval(iv)
  }, [])
  return word
}

function WalkPanel() {
  useLang()
  const name = useWalk((w) => w.colonyName)
  const view = useWalk((w) => w.view)
  const sitting = useWalk((w) => w.sitting)
  const benchNear = useWalk((w) => w.benchNear)
  const edgeNear = useWalk((w) => w.edgeNear)
  const overRoof = useWalk((w) => w.overRoof)
  const run = useWalk((w) => w.run)
  const riding = useWalk((w) => w.riding)
  const flying = useWalk((w) => w.flying)
  const skyNote = useWalk((w) => w.skyNote)
  const waterNote = useWalk((w) => w.waterNote)
  const area = useWalk((w) => w.area)
  const land = useWalk((w) => w.land)
  const gee = useWalk((w) => w.gee)
  const elevNear = useWalk((w) => w.elevNear)
  const inElev = useWalk((w) => w.inElev)
  const axisNote = useWalk((w) => w.axisNote)
  const peopleReady = useWalk((w) => w.peopleReady)
  const wings = useWalk((w) => w.wings)
  const wingsHere = useWalk((w) => w.wingsHere)
  // 翼をつけたとき、使い方を少し出す
  const [wingsAt, setWingsAt] = useState(0)
  useEffect(() => setWingsAt(wings ? walkNow() : 0), [wings])
  const day = useDayWord()
  useEffect(() => bindWalkKeys(), [])
  // 降りたときのお知らせ（しばらくして消す）
  const [note, setNote] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setNote(false), 9000)
    return () => window.clearTimeout(t)
  }, [])
  const stop = (e: RPointerEvent) => e.stopPropagation()
  return (
    <div className="walk-ui">
      <div className="walk-badge">
        <b>{name}</b>
        {ui().walk[area]}
        <br />
        <small>
          {land >= 0 && `${ui().walk.land(land)} · `}
          {gee < 0.995 ? ui().walk.gee(gee) : ui().walk.gravity} · {ui().walk[day]}
        </small>
      </div>
      <div className="walk-buttons" onPointerDown={stop}>
        <button onClick={toggleWalkView}>
          {ui().walk.view}: {view === 'chase' ? ui().walk.viewChase : ui().walk.viewEye}
          <kbd>V</kbd>
        </button>
        {((gee > 0.9 && !wings) || riding) && (
          <button className={riding ? 'on' : ''} onClick={() => (walkInput.ride = true)}>
            {riding ? ui().walk.rideOff : ui().walk.ride}
            <kbd>F</kbd>
          </button>
        )}
        {riding && (
          <button className={flying ? 'on' : ''} onPointerDown={() => (walkInput.sky = true)}>
            {flying ? (overRoof ? ui().walk.roofLand : ui().walk.skyOff) : ui().walk.sky}
            <kbd>G</kbd>
          </button>
        )}
        {(wingsHere || wings) && (
          <button className={wings ? 'on' : ''} onPointerDown={() => (walkInput.wings = true)}>
            {wings ? ui().walk.wingsOff : ui().walk.wingsOn}
            <kbd>R</kbd>
          </button>
        )}
        <button onClick={endWalk}>
          {ui().walk.backToShip}
          <kbd>J</kbd>
        </button>
      </div>
      {riding && <Speedometer />}
      {wings && <WingGauge />}
      {waterNote > 0 && walkNow() - waterNote < 3.5 && <WaterNote at={waterNote} text={ui().walk.waterNote} />}
      {skyNote > 0 && walkNow() - skyNote < 3.5 && <WaterNote at={skyNote} text={ui().walk.skyNote} />}
      {elevNear && !riding && (
        <button className="walk-sit" onPointerDown={stop} onClick={() => (walkInput.sit = true)}>
          {elevNear === 'up' ? ui().walk.elevUp : ui().walk.elevDown}
          <kbd>E</kbd>
        </button>
      )}
      {inElev && <ElevNote />}
      {axisNote > 0 && !wings && <AxisNote at={axisNote} />}
      {!peopleReady && <div className="walk-loading">{ui().walk.peopleLoading}</div>}
      {wingsAt > 0 && <TimedNote at={wingsAt} secs={12} text={ui().walk.wingsNote} />}
      {!elevNear && (benchNear || edgeNear || sitting) && (
        <button className="walk-sit" onPointerDown={stop} onClick={() => (walkInput.sit = true)}>
          {sitting ? ui().walk.stand : edgeNear ? ui().walk.sitEdge : ui().walk.sit}
          <kbd>E</kbd>
        </button>
      )}
      {note && <div className="walk-note">{ui().walk.arrived(name)}</div>}
      <div className="walk-hint">{wings ? ui().walk.wingsHint : flying ? ui().walk.skyHint : riding ? ui().walk.rideHint : wingsHere ? ui().walk.stationHint : ui().walk.keysHint}</div>
      <Stick />
      <div className="walk-pad" onPointerDown={stop}>
        {/* iPhone はスティックを押さえたままの 2 本目の指だと click が来ないので、押した瞬間に切り替える */}
        {((gee > 0.9 && !wings) || riding) && (
          <button className={riding ? 'walk-ride on' : 'walk-ride'} onPointerDown={() => (walkInput.ride = true)}>
            {riding ? ui().walk.rideOff : ui().walk.ride}
          </button>
        )}
        <button className={run ? 'on' : ''} onPointerDown={() => useWalk.setState({ run: !useWalk.getState().run })}>
          {riding ? ui().walk.boost : ui().walk.run}
        </button>
        <button onPointerDown={() => (walkInput.jump = true)}>{riding ? ui().walk.hop : wings ? ui().walk.flap : ui().walk.jump}</button>
      </div>
    </div>
  )
}

/** 翼の姿勢計：地平線（機首の上げ下げで上下、機体の傾きで回る）と、機首の角度・上がる下がる速さ・高さ・速さ */
function WingGauge() {
  const [v, setV] = useState({ ...wingFlight })
  useEffect(() => {
    const iv = window.setInterval(() => setV({ ...wingFlight }), 100)
    return () => window.clearInterval(iv)
  }, [])
  if (!v.active) return null
  const deg = (r: number) => Math.round((r * 180) / Math.PI)
  // 機首が上がると地平線は下へ（1° で 1.2 px）、右へ傾くと地平線は左回りに
  const dy = Math.max(-40, Math.min(40, deg(v.pitch) * 1.2))
  const stall = v.speed < 4
  return (
    <div className={stall ? 'walk-wing stall' : 'walk-wing'}>
      <svg viewBox="-50 -50 100 100" width="92" height="92" aria-hidden>
        <defs>
          <clipPath id="walk-wing-clip">
            <circle r="46" />
          </clipPath>
        </defs>
        <g clipPath="url(#walk-wing-clip)">
          <g transform={`rotate(${-deg(v.bank)}) translate(0 ${dy})`}>
            <rect x="-120" y="-160" width="240" height="160" fill="#2f6f9e" />
            <rect x="-120" y="0" width="240" height="160" fill="#6b5233" />
            <line x1="-120" x2="120" y1="0" y2="0" stroke="#fff" strokeWidth="1.5" />
            {[-20, -10, 10, 20].map((p) => (
              <line key={p} x1={-10} x2={10} y1={-p * 1.2} y2={-p * 1.2} stroke="#fff" strokeWidth="1" opacity="0.7" />
            ))}
          </g>
        </g>
        <circle r="46" fill="none" stroke="rgba(110,220,255,0.6)" strokeWidth="2" />
        {/* 自分（翼の印）は動かない */}
        <path d="M-28 0 H-9 L0 6 L9 0 H28" fill="none" stroke="#ffd27a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="walk-wing-text">
        <b>{ui().walk.wingPitch(deg(v.pitch))}</b>
        <span>{ui().walk.wingClimb(v.climb)}</span>
        <span>{ui().walk.wingAlt(v.alt)}</span>
        <span>{ui().walk.kmh(Math.round(v.speed * 3.6))}</span>
        {stall && <b className="warn">{ui().walk.wingStall}</b>}
      </div>
    </div>
  )
}

/** ホバースクーターの速度計 */
function Speedometer() {
  const [v, setV] = useState(0)
  useEffect(() => {
    const iv = window.setInterval(() => setV(Math.round(walker.speed * 3.6)), 120)
    return () => window.clearInterval(iv)
  }, [])
  return <div className="walk-speed">{ui().walk.kmh(v)}</div>
}

/** 水の上・窓の上で降りようとしたときのお知らせ（少しして消える） */
/** エレベーターの高さ（乗っているあいだ） */
function ElevNote() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 250)
    return () => window.clearInterval(t)
  }, [])
  return <div className="walk-note">{ui().walk.elevRiding(walker.h)}</div>
}

/** 軸の駅に着いたときの「現実の科学では」（少し長めに出す） */
function AxisNote({ at }: { at: number }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = window.setTimeout(() => setTick((n) => n + 1), Math.max(0, (at + 14.1 - walkNow()) * 1000))
    return () => window.clearTimeout(t)
  }, [at])
  if (walkNow() - at > 14) return null
  return <div className="walk-note">{ui().walk.axisNote}</div>
}

/** 少しのあいだだけ出すお知らせ */
function TimedNote({ at, secs, text }: { at: number; secs: number; text: string }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = window.setTimeout(() => setTick((n) => n + 1), Math.max(0, (at + secs + 0.1 - walkNow()) * 1000))
    return () => window.clearTimeout(t)
  }, [at, secs])
  if (walkNow() - at > secs) return null
  return <div className="walk-note">{text}</div>
}

function WaterNote({ at, text }: { at: number; text: string }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = window.setTimeout(() => setTick((n) => n + 1), Math.max(0, (at + 3.6 - walkNow()) * 1000))
    return () => window.clearTimeout(t)
  }, [at])
  if (walkNow() - at > 3.5) return null
  return <div className="walk-note">{text}</div>
}

/** 画面をなぞって見回す。PC はクリックでマウスを固定して、動かすだけで見回す */
function useLookDrag() {
  const last = useRef<{ id: number; x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: RPointerEvent) => {
      if (useWalk.getState().phase !== 'walk') return
      if (e.pointerType === 'mouse' && e.target instanceof HTMLCanvasElement && !document.pointerLockElement && !isTouchDevice()) {
        void e.target.requestPointerLock?.()
        return
      }
      last.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    },
    onPointerMove: (e: RPointerEvent) => {
      const l = last.current
      if (!l || l.id !== e.pointerId) return
      const k = e.pointerType === 'touch' ? 0.006 : 0.004
      walkInput.lookX += (e.clientX - l.x) * k
      walkInput.lookY += (e.clientY - l.y) * k
      l.x = e.clientX
      l.y = e.clientY
    },
    onPointerUp: () => (last.current = null),
    onPointerCancel: () => (last.current = null),
  }
}

export function WalkView() {
  const phase = useWalk((w) => w.phase)
  const since = useWalk((w) => w.since)
  const scene3d = walkScene(phase)
  const look = useLookDrag()
  const [, setTick] = useState(0)
  // 幕が動いているあいだだけ描き直す
  useEffect(() => {
    if (phase === 'none') return
    let raf = 0
    const start = walkNow()
    const loop = () => {
      setTick((n) => n + 1)
      if (walkNow() - start < WALK_FADE + 0.1) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase])
  if (phase === 'none') return null
  const T = walkNow() - since
  let curtain = 0
  if (phase === 'fadeIn' || phase === 'leave') curtain = Math.min(1, T / WALK_FADE)
  else curtain = Math.max(0, 1 - T / WALK_FADE)
  return (
    <div className={scene3d ? 'surface-view solid walk-view' : 'surface-view walk-view'} {...look}>
      {scene3d && <WalkCanvas />}
      {scene3d && <WalkPanel />}
      {scene3d && <WalkErrandHud />}
      <div className="surface-curtain" style={{ opacity: curtain, pointerEvents: curtain > 0.5 ? 'auto' : 'none' }} />
    </div>
  )
}
