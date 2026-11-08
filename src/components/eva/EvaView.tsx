import { Suspense, memo, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type MouseEvent as RMouseEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { dprFor, useLevel } from '../../state/quality'
import { QualityGovernor } from '../QualityGovernor'
import { useLang } from '../../i18n/lang'
import { useShip } from '../../data/ships'
import {
  DEPLOY_SEC,
  EVA_FADE,
  EVA_TOOLS,
  LAUNCH_SEC,
  RECALL_SEC,
  TETHER_M,
  TOOL_ICON,
  bindEvaKeys,
  evaInput,
  evaNow,
  evaScene,
  pickTool,
  recallEva,
  useEva,
} from '../../state/eva'
import { EvaWorld } from './EvaWorld'
import { EvaJobs } from './EvaJobs'
import { JOBS, JOB_TYPES, rackRt, useEvaJobs, useEvaLog } from '../../state/evaJobs'
import { Tsumugi } from './Tsumugi'
import { ARC_W, HULL_R, arcTaper, evaSite } from './hull'
import { ui } from '../../i18n'

// 船外活動の場面。宇宙の場面とは別の Canvas で描く（そのあいだ宇宙の場面は止める）。

/**
 * 船外の Canvas。発進・回収のあいだは幕のために外側が毎フレーム描き直すので、memo でそこから切り離す
 * （Canvas を描き直すたびに影の設定がかけ直され、影の地図が作り直されて、影を受ける材質が描けなくなることがある）。
 * 影は PCF（three.js にはもう PCFSoft がなく、指定すると毎回 PCF に置き換えて作り直す）
 */
const EvaCanvas = memo(function EvaCanvas() {
  const level = useLevel()
  const spec = useShip()
  const tint = useMemo(() => new THREE.Color(spec.swatch[0]), [spec])
  return (
    <Canvas shadows="percentage" dpr={Math.min(dprFor(level), 1.75)} gl={{ alpha: false }} camera={{ fov: 62, near: 0.05, far: 12000, position: [2.4, 1.7, 3.3] }}>
      <color attach="background" args={['#000']} />
      <Suspense fallback={null}>
        <EvaWorld spec={spec} />
        <Tsumugi shipTint={tint} />
        <EvaJobs />
      </Suspense>
      <QualityGovernor />
    </Canvas>
  )
})

/** ボタンを押しているあいだだけ入力する */
function holdProps(on: () => void, off: () => void) {
  return {
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      on()
    },
    onPointerUp: off,
    onPointerCancel: off,
    onContextMenu: (e: RMouseEvent) => e.preventDefault(),
  }
}

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
    evaInput.stickX = Math.abs(x) < 0.12 ? 0 : x
    evaInput.stickY = Math.abs(y) < 0.12 ? 0 : y
    setKnob([x, y])
  }
  const end = () => {
    evaInput.stickX = 0
    evaInput.stickY = 0
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

function Bar({ v, warn }: { v: number; warn?: boolean }) {
  return (
    <span className={`eva-bar${warn ? ' warn' : ''}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
    </span>
  )
}

/** 計器：速さ・命綱・外壁からの高さ・ガス・電池 */
function EvaHud() {
  useLang()
  const hud = useEva((e) => e.hud)
  const taut = useEva((e) => e.taut)
  const assist = useEva((e) => e.assist)
  const left = Math.max(0, TETHER_M - hud.dist)
  return (
    <div className="eva-hud">
      <div className="eva-badge">EVR-1 TSUMUGI</div>
      <div className="eva-site">{ui().evaSites[evaSite.id]}</div>
      <div className="eh-speed">
        {hud.speed.toFixed(2)}
        <small> m/s</small>
      </div>
      <div className="eh-row">
        <span className="eh-k">{ui().evaView.tether}</span>
        <Bar v={(left / TETHER_M) * 100} warn={taut || left < 5} />
        <span className="eh-v">
          {left.toFixed(0)}
          <small> m</small>
        </span>
      </div>
      <div className="eh-row">
        <span className="eh-k">{ui().evaView.gas}</span>
        <Bar v={hud.gas} warn={hud.gas < 15} />
        <span className="eh-v">{hud.gas}%</span>
      </div>
      <div className="eh-row">
        <span className="eh-k">{ui().evaView.battery}</span>
        <Bar v={hud.battery} />
        <span className="eh-v">{hud.battery}%</span>
      </div>
      <div className="eh-row">
        <span className="eh-k">{ui().evaView.altitude}</span>
        <span className="eh-v wide">
          {hud.alt.toFixed(1)}
          <small> m</small>
        </span>
        <span className={`eh-assist${assist ? ' on' : ''}`}>{assist ? ui().evaView.autoBrake : ui().evaView.inertia}</span>
      </div>
    </div>
  )
}

/** ミニマップ：真上から見た外壁の帯、エアロック、命綱の届く円、ツムギの位置と向き */
function EvaMap() {
  useLang()
  const hud = useEva((e) => e.hud)
  const taut = useEva((e) => e.taut)
  const jobs = useEvaJobs((j) => j.ui.jobs)
  const focus = useEvaJobs((j) => j.ui.focus)
  const H = TETHER_M + 6
  const site = evaSite.id
  const halfW = site === 'hull' ? HULL_R * 0.98 : site === 'dock' ? 110 : ARC_W
  // アルカディアの発進路は前へ行くほど広い
  const trench = `M ${-ARC_W - arcTaper(-H)} ${-H} L ${ARC_W + arcTaper(-H)} ${-H} L ${ARC_W + arcTaper(H)} ${H} L ${-ARC_W - arcTaper(H)} ${H} Z`
  const seams = site === 'arcadia' ? [-4.5, 4.5] : [-20, -10, 0, 10, 20]
  return (
    <div className={`eva-map${taut ? ' edge' : ''}`}>
      <svg viewBox={`${-H} ${-H} ${H * 2} ${H * 2}`} aria-label={ui().evaView.minimap}>
        {site === 'arcadia' ? <path d={trench} className="m-hull" /> : <rect x={-halfW} y={-H} width={halfW * 2} height={H * 2} className="m-hull" />}
        {seams.map((x) => (
          <line key={x} x1={x} y1={-H} x2={x} y2={H} className="m-seam" />
        ))}
        <circle cx={0} cy={0} r={TETHER_M} className="m-range" />
        <rect x={-1.6} y={-1.6} width={3.2} height={3.2} className="m-lock" />
        <rect x={rackRt.P.x - 1.1} y={rackRt.P.z - 1.1} width={2.2} height={2.2} className="m-rack" />
        {jobs.map((j, i) => (
          <g key={i} transform={`translate(${j.x} ${j.z})`} className={j.done ? 'm-job done' : i === focus ? 'm-job on' : 'm-job'}>
            {j.done ? <circle r={2} /> : <path d="M 0 -3 L 3 0 L 0 3 L -3 0 Z" />}
          </g>
        ))}
        <line x1={0} y1={0} x2={hud.x} y2={hud.z} className="m-tether" />
        <g transform={`translate(${hud.x} ${hud.z}) rotate(${hud.hdg})`}>
          <path d="M 0 -4.2 L 2.8 3 L 0 1.6 L -2.8 3 Z" className="m-bot" />
        </g>
      </svg>
      <span className="m-fwd">{site === 'dock' ? ui().evaView.alongRing : ui().evaView.bow} ▲</span>
    </div>
  )
}

function ToolBar() {
  useLang()
  const tool = useEva((e) => e.tool)
  const swapping = useEva((e) => e.swapping)
  return (
    <div className="eva-tools">
      {EVA_TOOLS.map((k, i) => (
        <button key={k} className={`eva-tool${tool === k ? ' on' : ''}`} disabled={swapping} onClick={() => pickTool(k)} title={ui().evaTools[k]}>
          <span className="et-icon">{TOOL_ICON[k]}</span>
          <kbd>{i + 1}</kbd>
        </button>
      ))}
    </div>
  )
}

const toolLabel = (k: keyof typeof TOOL_ICON) => `${TOOL_ICON[k]} ${ui().evaTools[k]}`

/** 修理の依頼：3 つの一覧と、いま向かっている依頼の手順 */
function JobPanel() {
  useLang()
  const jobUi = useEvaJobs((j) => j.ui)
  const carrying = useEvaJobs((j) => j.carrying)
  const [open, setOpen] = useState(true)
  if (!jobUi.jobs.length) return null
  const done = jobUi.jobs.filter((j) => j.done).length
  const fj = jobUi.jobs[jobUi.focus]
  const def = fj ? JOBS[fj.type] : null
  return (
    <div className={`eva-jobs${open ? '' : ' shut'}`}>
      <button className="ej-head" onClick={() => setOpen(!open)}>
        <span className="ej-kicker">{ui().evaView.repairOrders}</span>
        <span className="ej-count">
          {done} / {jobUi.jobs.length}
        </span>
        <span className="ej-fold">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          <ul className="ej-list">
            {jobUi.jobs.map((j, i) => (
              <li key={i} className={j.done ? 'done' : i === jobUi.focus ? 'on' : ''}>
                <span className="ej-mark">{j.done ? '✓' : i === jobUi.focus ? '▶' : ui().evaView.pendingMark}</span>
                {ui().evaJobs[j.type].name}
              </li>
            ))}
          </ul>
          {fj && def && !fj.done && (
            <ol className="ej-steps">
              {def.steps.map((st, k) => (
                <li key={k} className={k < fj.step ? 'done' : k === fj.step ? 'on' : ''}>
                  <span className="ej-tool">{TOOL_ICON[st.tool]}</span>
                  <span className="ej-text">{ui().evaJobs[fj.type].steps[k].text}</span>
                  {k === fj.step && (
                    <span className="eva-bar ej-bar">
                      <span style={{ width: `${jobUi.prog * 100}%` }} />
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      {fj && def && !fj.done && <JobHint ui={jobUi} carrying={!!carrying} />}
      {done === jobUi.jobs.length && <div className="ej-hint ok">{ui().evaView.allRepairsDone}</div>}
    </div>
  )
}

function JobHint({ ui: jobUi, carrying }: { ui: ReturnType<typeof useEvaJobs.getState>['ui']; carrying: boolean }) {
  const blockedAt = useEvaJobs((j) => j.blockedAt)
  const fj = jobUi.jobs[jobUi.focus]
  const st = JOBS[fj.type].steps[fj.step]
  const key = EVA_TOOLS.indexOf(st.tool) + 1
  if (carrying && evaNow() - blockedAt < 2.5) return <div className="ej-hint warn">{ui().evaView.cantSwapTools}</div>
  if (jobUi.need) return <div className="ej-hint warn">{ui().evaView.switchToTool(toolLabel(jobUi.need), key)}</div>
  if (jobUi.near) return <div className="ej-hint go">{ui().evaView.holdEToWork}</div>
  const where = jobUi.toRack ? ui().evaView.goToRack : carrying ? ui().evaView.carryPart : ui().evaView.goToWorkSite
  return (
    <div className="ej-hint">
      {where} <b>{jobUi.dist.toFixed(0)} m</b>
    </div>
  )
}

/** 修理が終わったときのカード：作業の中身と、本当の宇宙の船外作業の豆知識 */
function JobCard() {
  useLang()
  const card = useEvaJobs((j) => j.card)
  const jobUi = useEvaJobs((j) => j.ui)
  const log = useEvaLog((l) => l.log)
  const j = card !== null ? jobUi.jobs[card] : null
  if (!j) return null
  const def = JOBS[j.type]
  const kinds = JOB_TYPES.filter((k) => log[k]).length
  return (
    <div className="sample-card eva-card">
      <div className="sample-head">
        <span className="ec-check">✓</span>
        <div>
          <div className="sample-kicker">{ui().evaView.repairComplete}</div>
          <div className="sample-name">{ui().evaJobs[j.type].name}</div>
        </div>
      </div>
      <ol className="ec-steps">
        {def.steps.map((st, k) => (
          <li key={k}>
            <span className="ej-tool">{TOOL_ICON[st.tool]}</span>
            {ui().evaJobs[j.type].steps[k].text}
          </li>
        ))}
      </ol>
      <p className="sample-note">
        <span className="ec-tag">{ui().evaView.inRealSpace}</span>
        {ui().evaJobs[j.type].note}
      </p>
      <div className="sample-foot">
        <span>
          {ui().evaView.workLog} {kinds} / {JOB_TYPES.length} {ui().evaView.kindsUnit}{ui().evaView.sep}{ui().evaView.thisKind} ×{log[j.type] ?? 0}
        </span>
        <button className="secondary" onClick={() => useEvaJobs.setState({ card: null })}>
          {ui().evaView.close}
        </button>
      </div>
    </div>
  )
}

function EvaPanel() {
  useLang()
  const phase = useEva((e) => e.phase)
  const view = useEva((e) => e.view)
  const assist = useEva((e) => e.assist)
  const taut = useEva((e) => e.taut)
  const tool = useEva((e) => e.tool)
  const working = useEva((e) => e.working)
  const swapping = useEva((e) => e.swapping)
  const gas = useEva((e) => e.hud.gas)
  useEffect(() => bindEvaKeys(), [])
  const fly = phase === 'fly'
  const toolName = ui().evaTools[tool]
  return (
    <div className="surface-ui eva-ui">
      {phase === 'launch' && <div className="surface-caption">{ui().evaView.openingAirlock}</div>}
      {phase === 'deploy' && <div className="surface-caption">{ui().evaView.tsumugiBooting}</div>}
      {phase === 'recall' && <div className="surface-caption">{ui().evaView.reelingIn}</div>}
      {fly && (
        <>
          <div className="surface-hint eva-hint">
            {ui().evaView.keysHint}
          </div>
          <EvaHud />
          <EvaMap />
          <JobPanel />
          <JobCard />
          <ToolBar />
          <div className="eva-status">
            {swapping ? (
              <span className="es-busy">{ui().evaView.swappingTools}</span>
            ) : working ? (
              <span className="es-busy">{ui().evaView.workingWithTool(toolName)}</span>
            ) : (
              <button className="eva-work" {...holdProps(() => (evaInput.work = true), () => (evaInput.work = false))}>
                {ui().evaView.useTool(toolName)} <kbd>E</kbd>
              </button>
            )}
          </div>
          {taut && (
            <div className="rover-edge">
              {ui().evaView.tetherFull}
              <small>{ui().evaView.tetherRange(TETHER_M)}</small>
            </div>
          )}
          {gas === 0 && <div className="eva-warn">{ui().evaView.outOfGas}</div>}
          <Stick />
          <div className="eva-pad">
            <button {...holdProps(() => (evaInput.padUp = 1), () => (evaInput.padUp = 0))}>{ui().evaView.up}</button>
            <button {...holdProps(() => (evaInput.padUp = -1), () => (evaInput.padUp = 0))}>{ui().evaView.down}</button>
            <button className="go" {...holdProps(() => (evaInput.work = true), () => (evaInput.work = false))}>
              {ui().evaView.use}
            </button>
          </div>
        </>
      )}
      <div className="surface-buttons rover-actions eva-actions">
        {fly && (
          <>
            <button className="secondary" onClick={() => useEva.setState({ view: view === 'chase' ? 'head' : 'chase' })}>
              {view === 'chase' ? ui().evaView.switchToTsumugiCam : ui().evaView.switchToChaseCam}
            </button>
            <button className={`secondary${assist ? ' on' : ''}`} onClick={() => useEva.setState({ assist: !assist })}>
              {assist ? ui().evaView.autoBrakeOn : ui().evaView.autoBrakeOff}
            </button>
          </>
        )}
        {(fly || phase === 'deploy') && (
          <button className="primary" onClick={recallEva}>
            {ui().evaView.recall}
          </button>
        )}
      </div>
    </div>
  )
}

/** 画面をなぞって向きを変える（マウスでも指でも） */
function useLookDrag() {
  const last = useRef<{ id: number; x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: RPointerEvent) => {
      if (useEva.getState().phase !== 'fly') return
      last.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    },
    onPointerMove: (e: RPointerEvent) => {
      const l = last.current
      if (!l || l.id !== e.pointerId) return
      const k = e.pointerType === 'touch' ? 0.006 : 0.004
      evaInput.lookX += (e.clientX - l.x) * k
      evaInput.lookY += (e.clientY - l.y) * k
      l.x = e.clientX
      l.y = e.clientY
    },
    onPointerUp: () => (last.current = null),
    onPointerCancel: () => (last.current = null),
  }
}

export function EvaView() {
  const phase = useEva((e) => e.phase)
  const since = useEva((e) => e.since)
  const scene3d = evaScene(phase)
  const look = useLookDrag()
  const [, setTick] = useState(0)
  useEffect(() => {
    if (phase === 'none' || phase === 'fly') return
    let raf = 0
    const loop = () => {
      setTick((n) => n + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase])
  if (phase === 'none') return null
  const T = evaNow() - since
  let curtain = 0
  if (phase === 'fadeIn') curtain = Math.min(1, T / EVA_FADE)
  else if (phase === 'launch') curtain = Math.max(0, 1 - T / EVA_FADE)
  else if (phase === 'recall') curtain = Math.max(0, (T - RECALL_SEC) / EVA_FADE)
  else if (phase === 'fadeOut') curtain = Math.max(0, 1 - T / EVA_FADE)
  void LAUNCH_SEC
  void DEPLOY_SEC
  return (
    <div className={scene3d ? 'surface-view solid eva-view' : 'surface-view eva-view'} {...look}>
      {scene3d && <EvaCanvas />}
      {scene3d && <EvaPanel />}
      <div className="surface-curtain" style={{ opacity: curtain, pointerEvents: curtain > 0.5 ? 'auto' : 'none' }} />
    </div>
  )
}
