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

export type EvaPhase = 'none' | 'fadeIn' | 'launch' | 'deploy' | 'fly' | 'recall' | 'fadeOut'
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
/** 最高速度（m/s） */
export const EVA_TOP = 3

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
}))

/** 船外の場面を出している（宇宙の場面は止める） */
export const evaScene = (phase = useEva.getState().phase) => phase === 'launch' || phase === 'deploy' || phase === 'fly' || phase === 'recall'
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
 * 作業場所を決める：天の湊のそば（SF の世界）ならリングの下面、アルカディアに乗っていれば発進路、ほかは船の外壁。
 * want で決め打ちもできる（テスト用）
 */
function pickSite(want?: EvaSiteId) {
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

export function startEva(want?: EvaSiteId) {
  pickSite(typeof want === 'string' ? want : undefined)
  if (document.pointerLockElement) document.exitPointerLock()
  useEva.setState({ view: 'chase', swapping: false, working: false, face: 'none', taut: false, hud: { speed: 0, dist: 0, alt: 0, gas: 100, battery: 100, x: 0, z: 0, hdg: 0 } })
  resetEvaInput()
  newShift()
  setPhase('fadeIn')
  window.setTimeout(() => {
    if (useEva.getState().phase === 'fadeIn') setPhase('launch')
  }, EVA_FADE * 1000)
}

/** 回収：命綱を巻き取って、エアロックへもどす */
export function recallEva() {
  const p = useEva.getState().phase
  if (p !== 'fly' && p !== 'deploy') return
  useEva.setState({ working: false, swapping: false })
  setPhase('recall')
}

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
}

export function resetEvaInput() {
  Object.assign(evaInput, { fwd: 0, right: 0, up: 0, yaw: 0, pitch: 0, roll: 0, lookX: 0, lookY: 0, brake: false, work: false, swapTo: null, stickX: 0, stickY: 0, padUp: 0 })
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
}

const HOLD_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyC', 'KeyX', 'KeyE'])

/** キーボード：WASD 前後左右・R/スペース 上・F/Shift 下・矢印 向き・Z/C 横回転・X ブレーキ・E 作業・1〜5 ツール・V 見方 */
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
  window.addEventListener('keydown', down, true)
  window.addEventListener('keyup', up, true)
  window.addEventListener('blur', blur)
  return () => {
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
} = {}
