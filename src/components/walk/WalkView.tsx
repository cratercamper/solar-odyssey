import { Suspense, memo, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import { dprFor, useLevel } from '../../state/quality'
import { QualityGovernor } from '../QualityGovernor'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { isTouchDevice } from '../../state/input'
import { WALK_FADE, bindWalkKeys, endWalk, toggleWalkView, useWalk, walkInput, walkNow, walkScene } from '../../state/walk'
import { colonyDay } from '../sf/colonyCity'
import { WalkWorld } from './WalkWorld'
import { WalkActors, walker } from './WalkActors'

// コロニーの中を歩く場面。宇宙の場面とは別の Canvas で描く（そのあいだ宇宙の場面は止める）。

const WalkCanvas = memo(function WalkCanvas() {
  const level = useLevel()
  return (
    <Canvas shadows="percentage" dpr={Math.min(dprFor(level), 1.75)} gl={{ alpha: false, logarithmicDepthBuffer: true }} camera={{ fov: 62, near: 0.08, far: 60000 }}>
      <Suspense fallback={null}>
        <WalkWorld follow={{ current: walker.pos }} />
        <WalkActors />
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
  const run = useWalk((w) => w.run)
  const riding = useWalk((w) => w.riding)
  const waterNote = useWalk((w) => w.waterNote)
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
        {ui().walk.park}
        <br />
        <small>
          {ui().walk.gravity} · {ui().walk[day]}
        </small>
      </div>
      <div className="walk-buttons" onPointerDown={stop}>
        <button onClick={toggleWalkView}>
          {ui().walk.view}: {view === 'chase' ? ui().walk.viewChase : ui().walk.viewEye}
          <kbd>V</kbd>
        </button>
        <button className={riding ? 'on' : ''} onClick={() => (walkInput.ride = true)}>
          {riding ? ui().walk.rideOff : ui().walk.ride}
          <kbd>F</kbd>
        </button>
        <button onClick={endWalk}>
          {ui().walk.backToShip}
          <kbd>J</kbd>
        </button>
      </div>
      {riding && <Speedometer />}
      {waterNote > 0 && walkNow() - waterNote < 3.5 && <WaterNote at={waterNote} />}
      {(benchNear || sitting) && (
        <button className="walk-sit" onPointerDown={stop} onClick={() => (walkInput.sit = true)}>
          {sitting ? ui().walk.stand : ui().walk.sit}
          <kbd>E</kbd>
        </button>
      )}
      {note && <div className="walk-note">{ui().walk.arrived(name)}</div>}
      <div className="walk-hint">{riding ? ui().walk.rideHint : ui().walk.keysHint}</div>
      <Stick />
      <div className="walk-pad" onPointerDown={stop}>
        {/* iPhone はスティックを押さえたままの 2 本目の指だと click が来ないので、押した瞬間に切り替える */}
        <button className={riding ? 'walk-ride on' : 'walk-ride'} onPointerDown={() => (walkInput.ride = true)}>
          {riding ? ui().walk.rideOff : ui().walk.ride}
        </button>
        <button className={run ? 'on' : ''} onPointerDown={() => useWalk.setState({ run: !useWalk.getState().run })}>
          {riding ? ui().walk.boost : ui().walk.run}
        </button>
        <button onPointerDown={() => (walkInput.jump = true)}>{riding ? ui().walk.hop : ui().walk.jump}</button>
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

/** 水の上で降りようとしたときのお知らせ（少しして消える） */
function WaterNote({ at }: { at: number }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = window.setTimeout(() => setTick((n) => n + 1), Math.max(0, (at + 3.6 - walkNow()) * 1000))
    return () => window.clearTimeout(t)
  }, [at])
  if (walkNow() - at > 3.5) return null
  return <div className="walk-note">{ui().walk.waterNote}</div>
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
      <div className="surface-curtain" style={{ opacity: curtain, pointerEvents: curtain > 0.5 ? 'auto' : 'none' }} />
    </div>
  )
}
