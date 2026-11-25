import { useEffect, useRef, useState } from 'react'
import { boardCrewRover, boardLrv, endSuitWalk, suitInput, useSuitWalk } from '../../state/suitWalk'
import { useLanding } from '../../state/landing'
import { isTouchDevice } from '../../state/input'
import { gaitFor } from './SuitWalk'
import type { SurfaceDef } from '../../data/surfaces'
import { ui } from '../../i18n'
import { useLang } from '../../i18n/lang'
import './suitWalk.css'

// 宇宙服で歩いているあいだの、画面の下のボタン（PC とスマホ）と、スマホの左のスティック

/** スマホの歩くスティック：さわった所を中心に、指の向きと距離で前後左右 */
function Stick() {
  const base = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const at = useRef<{ id: number; x: number; y: number } | null>(null)
  const R = 46
  const set = (dx: number, dy: number) => {
    const d = Math.hypot(dx, dy)
    const k = d > R ? R / d : 1
    const x = dx * k
    const y = dy * k
    if (knob.current) knob.current.style.transform = `translate(${x}px, ${y}px)`
    suitInput.x = x / R
    suitInput.z = -y / R
  }
  const end = () => {
    at.current = null
    set(0, 0)
  }
  useEffect(() => end, [])
  return (
    <div
      ref={base}
      className="sw-stick"
      onPointerDown={(e) => {
        const r = base.current!.getBoundingClientRect()
        at.current = { id: e.pointerId, x: r.left + r.width / 2, y: r.top + r.height / 2 }
        base.current!.setPointerCapture(e.pointerId)
        set(e.clientX - at.current.x, e.clientY - at.current.y)
        e.stopPropagation()
      }}
      onPointerMove={(e) => {
        if (at.current?.id === e.pointerId) set(e.clientX - at.current.x, e.clientY - at.current.y)
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div ref={knob} className="sw-knob" />
    </div>
  )
}

/** eva：アポロ17号の章7 で月面車を降りて歩いているとき（着陸船へもどるボタンの代わりに、月面車に乗るボタン） */
export function SuitWalkPanel({ def, eva = false }: { def: SurfaceDef; eva?: boolean }) {
  useLang()
  const t = ui().suitWalk
  const edge = useSuitWalk((s) => s.edge)
  const run = useSuitWalk((s) => s.run)
  const steps = useSuitWalk((s) => s.steps)
  const nearCrew = useSuitWalk((s) => s.nearCrew)
  const nearLrv = useSuitWalk((s) => s.nearLrv)
  const menu = useLanding((l) => l.menu)
  const touch = isTouchDevice()
  // 外へ出たときだけ、この星の歩き方を一言
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setIntro(false), 7000)
    return () => clearTimeout(id)
  }, [])
  const g = def.gravity < 0.01 ? def.gravity.toFixed(4) : def.gravity.toFixed(2)
  return (
    <>
      {intro && <div className="sw-intro">{t.gait[gaitFor(def.gravity)](g)}</div>}
      {edge && <div className="sw-edge">{t.edge}</div>}
      <div className="surface-hint sw-hint">
        {eva ? (touch ? t.lrvHintTouch : t.lrvHintPc) : touch ? t.hintTouch : t.hintPc}
        {steps > 0 && <span className="sw-steps">{t.steps(steps)}</span>}
      </div>
      {touch && (
        <div className="sw-pad">
          <Stick />
          <div className="sw-pad-right">
            <button className={`sw-run${run ? ' on' : ''}`} onClick={() => useSuitWalk.setState({ run: !run })} aria-pressed={run}>
              {t.run}
            </button>
            <button className="sw-jump" onPointerDown={() => (suitInput.jump = true)}>
              {t.jump}
            </button>
          </div>
        </div>
      )}
      {eva ? (
        <div className="surface-buttons sw-actions">
          {nearLrv ? (
            <button className="primary sw-board" onClick={boardLrv} title={touch ? undefined : t.boardLrvKey}>
              {t.boardLrv}
            </button>
          ) : (
            <div className="sw-lrv-far">{t.lrvFar}</div>
          )}
        </div>
      ) : (
      <div className="surface-buttons sw-actions">
        <button className={`secondary${menu ? ' on' : ''}`} onClick={() => useLanding.setState({ menu: !menu })} title={ui().surfaceView.landerMenuTip}>
          {menu ? ui().surfaceView.hideMenu : ui().surfaceView.menu}
        </button>
        {nearCrew && (
          <button className="primary sw-board" onClick={boardCrewRover} title={touch ? undefined : t.boardCrewKey}>
            {t.boardCrew}
          </button>
        )}
        <button className={nearCrew ? 'secondary' : 'primary'} onClick={endSuitWalk}>
          {t.back}
        </button>
      </div>
      )}
    </>
  )
}
