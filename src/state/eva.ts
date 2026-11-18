import { create } from 'zustand'
import { useStore } from './store'
import { raceActive } from './race'
import { ui } from '../i18n'
import * as THREE from 'three'
import { jobsRt, newShift, useEvaJobs } from './evaJobs'
import { bodies } from './registry'
import { ship } from './flight'
import { DOCK_ID } from '../data/sf'
import { DOCK_CLEAR_SEGMENTS, dockSiteMatrix, setEvaSite, type EvaSiteId } from '../components/eva/hull'

// 船外活動ロボット EVR-1「ツムギ」。乗っている船の背中のエアロックから、たたんだまま押し出され、
// 外で展開して、命綱の届く範囲を 6 方向に飛び回る。宇宙の場面は止めて、船の外壁のまわりの場面（EvaView）を出す。
// 流れ：none → fadeIn（暗転）→ launch（ハッチが開いて押し出される）→ deploy（展開・起動）→ fly（操縦）
//       → recall（命綱を巻き取って、たたみながらもどる）→ fadeOut → none

//       母船のまわりで遠くにいるときは、回収の前に return（暗転して、エアロックのそばへ連れもどす）
export type EvaPhase = 'none' | 'fadeIn' | 'launch' | 'deploy' | 'fly' | 'return' | 'recall' | 'fadeOut'
export type EvaView = 'chase' | 'head'
export type EvaTool = 'hand' | 'drill' | 'cutter' | 'welder' | 'pad'
export type EvaFace = 'none' | 'boot' | 'normal' | 'happy' | 'focus' | 'sweat' | 'ouch'

export const EVA_TOOLS: EvaTool[] = ['hand', 'drill', 'cutter', 'welder', 'pad']
export const TOOL_ICON: Record<EvaTool, string> = { hand: '✋', drill: '⛛', cutter: '✂', welder: '⚡', pad: '◉' }

export const EVA_FADE = 0.7
export const LAUNCH_SEC = 2.2
export const DEPLOY_SEC = 3.6
export const RECALL_SEC = 3.2
/** 命綱の長さ（m）。エアロックからこれより遠くへは行けない */
export const TETHER_M = 40
/** 速さの段階（m/s）。マウスのホイール・スマホの「速さ」ボタンで切り替える。Q（スマホはブースト）を押しているあいだは 2.5 倍 */
export const EVA_SPEEDS = [1, 3, 8, 20, 40]
export const EVA_SPEED_DEFAULT = 2
export const EVA_BOOST = 2.5
/** 遠くから回収するときの暗転（秒） */
export const RETURN_SEC = 0.9
/** これより遠くから回収するときは、暗転してエアロックのそばへ連れもどす（m） */
export const RETURN_FAR = 14

type EvaState = {
  phase: EvaPhase
  since: number
  view: EvaView
  tool: EvaTool
  /** ツールを付け替えている最中（腕を背中へ回している） */
  swapping: boolean
  /** 作業中（ツールを使っている） */
  working: boolean
  face: EvaFace
  /** 計器（ときどき書き換える）：速さ m/s、エアロックからの距離 m、外壁からの高さ m、ガス・電池 %、地図の位置と向き */
  hud: { speed: number; dist: number; alt: number; gas: number; battery: number; x: number; z: number; hdg: number }
  /** 命綱がいっぱいまで伸びている */
  taut: boolean
  /** 自動ブレーキ（手を離すと、ゆっくり止まる） */
  assist: boolean
  /** 速さの段階（EVA_SPEEDS の番号） */
  speed: number
  /** 母船のまわり（ship）：母船の外形からの距離と、警告・限界 */
  range: { d: number; warn: boolean; edge: boolean }
}

export const evaNow = () => performance.now() / 1000

export const useEva = create<EvaState>(() => ({
  phase: 'none',
  since: 0,
  view: 'chase',
  tool: 'hand',
  swapping: false,
  working: false,
  face: 'none',
  hud: { speed: 0, dist: 0, alt: 0, gas: 100, battery: 100, x: 0, z: 0, hdg: 0 },
  taut: false,
  assist: true,
  speed: EVA_SPEED_DEFAULT,
  range: { d: 0, warn: false, edge: false },
}))

/** 速さの段階を変える（+1 速く、-1 遅く） */
export function stepEvaSpeed(dir: number) {
  const s = useEva.getState()
  useEva.setState({ speed: Math.max(0, Math.min(EVA_SPEEDS.length - 1, s.speed + dir)) })
}

/** 船外の場面を出している（宇宙の場面は止める） */
export const evaScene = (phase = useEva.getState().phase) => phase === 'launch' || phase === 'deploy' || phase === 'fly' || phase === 'return' || phase === 'recall'
export const evaActive = () => useEva.getState().phase !== 'none'

const setPhase = (phase: EvaPhase) => useEva.setState({ phase, since: evaNow() })

/** 船外活動を始められるか（操縦中で、ワープ・レース・着陸をしていない） */
export function canStartEva(landed: boolean) {
  const s = useStore.getState()
  return s.mode === 'flight' && s.warpPhase === 'idle' && !raceActive() && !landed && !evaActive()
}

const v1 = new THREE.Vector3()
const v2 = new THREE.Vector3()
const q1 = new THREE.Quaternion()

/**
 * 作業場所を決める。ふつうは母船のまわりを自由に飛ぶ（ship）。
 * 修理の仕事（repair）は：天の湊のそば（SF の世界）ならリングの下面、アルカディアに乗っていれば発進路、ほかは船の外壁。
 * want で決め打ちもできる（テスト用）
 */
function pickSite(want?: EvaSiteId | 'repair') {
  if (want === undefined || want === 'ship') {
    setEvaSite('ship', ship.quaternion)
    return
  }
  if (want === 'repair') want = undefined
  const s = useStore.getState()
  const dock = s.settings.world === 'sf' ? bodies.get(DOCK_ID) : undefined
  let id: EvaSiteId = s.settings.ship === 'arcadia' ? 'arcadia' : 'hull'
  if (dock) {
    dock.object.getWorldPosition(v1)
    if (ship.position.distanceTo(v1) < dock.radius * 5) id = 'dock'
  }
  if (want && (want !== 'dock' || dock)) id = want
  if (id !== 'dock' || !dock) {
    setEvaSite(id, ship.quaternion)
    return
  }
  // 地球の見える側：リングの下面に立つと、地球は外へ向かって 45° 見上げたところ。外向きが地球の方角に近い区画を選ぶ
  const dq = dock.object.getWorldQuaternion(q1)
  const e = bodies.get('earth')
  let az = 0
  if (e) {
    e.object.getWorldPosition(v2).sub(v1).applyQuaternion(dq.clone().invert())
    az = Math.atan2(-v2.z, v2.x)
  }
  const seg = Math.PI / 8
  let best = DOCK_CLEAR_SEGMENTS[0]
  let bestD = Infinity
  for (const k of DOCK_CLEAR_SEGMENTS) {
    const a = (k + 0.5) * seg
    const d = Math.abs(Math.atan2(Math.sin(a - az), Math.cos(a - az)))
    if (d < bestD) {
      bestD = d
      best = k
    }
  }
  const a = (best + 0.5) * seg
  const local = new THREE.Quaternion().setFromRotationMatrix(dockSiteMatrix(a))
  setEvaSite('dock', dq.clone().multiply(local), a)
  s.showToast(ui().eva.dockSiteNote)
}

/** 船外活動を始める（ボタン一つで、母船のまわりへ）。'repair' なら修理の仕事の場所へ */
export function startEva(want?: EvaSiteId | 'repair') {
  pickSite(typeof want === 'string' ? want : undefined)
  if (document.pointerLockElement) document.exitPointerLock()
  useEva.setState({ view: 'chase', swapping: false, working: false, face: 'none', taut: false, range: { d: 0, warn: false, edge: false }, hud: { speed: 0, dist: 0, alt: 0, gas: 100, battery: 100, x: 0, z: 0, hdg: 0 } })
  resetEvaInput()
  newShift()
  setPhase('fadeIn')
  window.setTimeout(() => {
    if (useEva.getState().phase === 'fadeIn') setPhase('launch')
  }, EVA_FADE * 1000)
}

/** 修理の仕事へ（船の外壁・アルカディアの発進路・天の湊） */
export const startRepairEva = () => startEva('repair')

/** 回収：命綱を巻き取って、エアロックへもどす（far：エアロックから遠いときは、先に暗転して連れもどす） */
export function recallEva(far = false) {
  const p = useEva.getState().phase
  if (p !== 'fly' && p !== 'deploy') return
  if (document.pointerLockElement) document.exitPointerLock()
  useEva.setState({ working: false, swapping: false })
  setPhase(far && p === 'fly' ? 'return' : 'recall')
}

/** 回収のボタン・キー：遠くにいるかは Tsumugi が決める */
export const evaRecall = { request: () => recallEva() }

/** 巻き取りが終わったら（Tsumugi から呼ぶ）、暗転して宇宙へ */
export function finishEva() {
  if (useEva.getState().phase !== 'recall') return
  setPhase('fadeOut')
  window.setTimeout(() => {
    if (useEva.getState().phase === 'fadeOut') {
      useEva.setState({ phase: 'none' })
      useStore.getState().showToast(ui().eva.tsumugiAboard)
    }
  }, EVA_FADE * 1000)
}

export const setEvaPhase = setPhase

/** ツールを選ぶ（付け替えの動きは Tsumugi が見る） */
export function pickTool(tool: EvaTool) {
  const s = useEva.getState()
  if (s.phase !== 'fly' || s.swapping || s.tool === tool) return
  // 部品を運んでいるあいだは、付け替えられない
  if (jobsRt.carrying) {
    useEvaJobs.setState({ blockedAt: evaNow() })
    return
  }
  evaInput.swapTo = tool
}

// ---- 操縦の入力（キーボードと画面のボタンの両方から書き込む）。-1..1 ------------------------------------

export const evaInput = {
  /** 移動：前後（前 +）、左右（右 +）、上下（上 +） */
  fwd: 0,
  right: 0,
  up: 0,
  /** 回転：左右を向く（右 +）、上下を向く（上 +）、横に回る（右 +） */
  yaw: 0,
  pitch: 0,
  roll: 0,
  /** マウスやなぞりで向きを変えたぶん（ラジアン。Tsumugi が読んだら 0 にもどす） */
  lookX: 0,
  lookY: 0,
  brake: false,
  work: false,
  swapTo: null as EvaTool | null,
  /** スマホのスティック（-1..1） */
  stickX: 0,
  stickY: 0,
  /** スマホの上昇・下降ボタン */
  padUp: 0,
  /** ブースト（Q・スマホのボタン） */
  boost: false,
}

export function resetEvaInput() {
  Object.assign(evaInput, { fwd: 0, right: 0, up: 0, yaw: 0, pitch: 0, roll: 0, lookX: 0, lookY: 0, brake: false, work: false, swapTo: null, stickX: 0, stickY: 0, padUp: 0, boost: false })
  keys.clear()
}

const keys = new Set<string>()
const has = (...codes: string[]) => (codes.some((c) => keys.has(c)) ? 1 : 0)

function fromKeys() {
  evaInput.fwd = has('KeyW') - has('KeyS')
  evaInput.right = has('KeyD') - has('KeyA')
  evaInput.up = has('KeyR', 'Space') - has('KeyF', 'ShiftLeft', 'ShiftRight')
  evaInput.yaw = has('ArrowRight') - has('ArrowLeft')
  evaInput.pitch = has('ArrowUp') - has('ArrowDown')
  evaInput.roll = has('KeyC') - has('KeyZ')
  evaInput.brake = keys.has('KeyX')
  evaInput.work = keys.has('KeyE')
  evaInput.boost = keys.has('KeyQ') || touchBoost
}

let touchBoost = false
/** スマホのブーストのボタン */
export function setTouchBoost(on: boolean) {
  touchBoost = on
  evaInput.boost = keys.has('KeyQ') || on
}

const HOLD_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyC', 'KeyX', 'KeyE', 'KeyQ'])

/** キーボード：WASD 前後左右・R/スペース 上・F/Shift 下・マウス／矢印 向き・Z/C 横回転・Q ブースト・ホイール 速さ・X ブレーキ・E 作業・1〜5 ツール・V 見方・K 回収 */
export function bindEvaKeys() {
  const down = (e: KeyboardEvent) => {
    if (!evaActive()) return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    const digit = /^Digit([1-5])$/.exec(e.code)
    if (digit) {
      e.preventDefault()
      e.stopPropagation()
      if (!e.repeat) pickTool(EVA_TOOLS[Number(digit[1]) - 1])
      return
    }
    if (e.code === 'KeyV') {
      e.preventDefault()
      e.stopPropagation()
      if (!e.repeat) useEva.setState({ view: useEva.getState().view === 'chase' ? 'head' : 'chase' })
      return
    }
    if (e.code === 'KeyK') {
      e.preventDefault()
      e.stopPropagation()
      if (!e.repeat) evaRecall.request()
      return
    }
    if (e.code === 'KeyB') {
      e.stopPropagation()
      if (!e.repeat) useEva.setState({ assist: !useEva.getState().assist })
      return
    }
    if (!HOLD_KEYS.has(e.code)) return
    e.preventDefault()
    e.stopPropagation()
    keys.add(e.code)
    fromKeys()
  }
  const up = (e: KeyboardEvent) => {
    if (!keys.delete(e.code)) return
    fromKeys()
  }
  const blur = () => {
    keys.clear()
    fromKeys()
  }
  // ホイールで速さの段階を変える（上へ回すと速く）
  let acc = 0
  let pausedUntil = 0
  const wheel = (e: WheelEvent) => {
    if (useEva.getState().phase !== 'fly') return
    if ((e.target as HTMLElement | null)?.closest?.('.eva-jobs, .sample-card')) return
    const now = performance.now()
    if (now < pausedUntil) return
    acc += e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1)
    if (Math.abs(acc) < 60) return
    stepEvaSpeed(acc < 0 ? 1 : -1)
    acc = 0
    pausedUntil = now + 160
  }
  // マウスを固定しているときは、マウスを動かすだけで向きが変わる
  const move = (e: MouseEvent) => {
    if (!document.pointerLockElement || useEva.getState().phase !== 'fly') return
    evaInput.lookX += e.movementX * 0.0022
    evaInput.lookY += e.movementY * 0.0022
  }
  window.addEventListener('keydown', down, true)
  window.addEventListener('keyup', up, true)
  window.addEventListener('blur', blur)
  window.addEventListener('wheel', wheel, { passive: true })
  window.addEventListener('mousemove', move)
  return () => {
    window.removeEventListener('wheel', wheel)
    window.removeEventListener('mousemove', move)
    window.removeEventListener('keydown', down, true)
    window.removeEventListener('keyup', up, true)
    window.removeEventListener('blur', blur)
    blur()
  }
}

/** テスト用（#debug）：ツムギを置き直す・姿勢を見る */
export const evaDebug: {
  place?: (x: number, y: number, z: number, yawDeg?: number) => void
  state?: () => { pos: number[]; vel: number[] }
  cam?: [number, number, number]
  /** 確認用：エアロックのハッチの開き（0..1）を固定する */
  hatch?: number
} = {}
