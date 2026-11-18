import { create } from 'zustand'
import { useStore } from './store'
import { raceActive } from './race'
import { COLONY_ID, colonyName } from '../data/sf'

// コロニーの中を歩く。港から入ったコロニーの中で「降りて歩く」を選ぶと、宇宙の場面を止めて、
// 地面の公園のまわりを人の大きさで描く場面（components/walk/WalkView）を出す。
// 流れ：none → fadeIn（暗転）→ walk（明けて歩く）→ leave（暗転）→ fadeOut（宇宙の場面で明ける）→ none

export type WalkPhase = 'none' | 'fadeIn' | 'walk' | 'leave' | 'fadeOut'
/** chase：後ろから見る、eye：自分の目で見る */
export type WalkView = 'chase' | 'eye'

export const WALK_FADE = 0.7
/** 歩く・走る速さ（m/s） */
export const WALK_SPEED = 1.5
export const RUN_SPEED = 4.2
/** ジャンプの初速（m/s）。コロニーの地面では重力が 1G なので、地球と同じ高さまで跳べる */
export const JUMP_SPEED = 3.6
export const GRAVITY = 9.8
/** ホバースクーターの速さ（m/s）：ふつう・ブースト（Shift／スマホの「ブースト」）。公園は 1 km ほどあるので、ブーストなら 1 分で端から端まで */
export const HOVER_SPEED = 9
export const HOVER_BOOST = 16

type WalkState = {
  phase: WalkPhase
  since: number
  /** 歩いているコロニー（宇宙の場面の天体 id）と名前 */
  colonyId: string | null
  colonyName: string
  view: WalkView
  /** 走る（スマホのボタンは押すたびに切り替え。PC は Shift を押しているあいだ） */
  run: boolean
  /** ベンチに座っている */
  sitting: boolean
  /** 近くに座れるベンチがある */
  benchNear: boolean
  /** ホバースクーターに乗っている */
  riding: boolean
  /** 水の上で降りようとした時刻（お知らせを少し出す） */
  waterNote: number
}

export const walkNow = () => performance.now() / 1000

export const useWalk = create<WalkState>(() => ({
  phase: 'none',
  since: 0,
  colonyId: null,
  colonyName: '',
  view: 'chase',
  run: false,
  sitting: false,
  benchNear: false,
  riding: false,
  waterNote: 0,
}))

/** 歩く場面を出している（宇宙の場面は止める） */
export const walkScene = (phase = useWalk.getState().phase) => phase === 'walk' || phase === 'leave'
export const walkActive = () => useWalk.getState().phase !== 'none'

const setPhase = (phase: WalkPhase) => useWalk.setState({ phase, since: walkNow() })

/** 自機がいまどのコロニーの中にいるか（Colony.tsx が中に入った・出たときに書く） */
export const colonyWalk = {
  inside: null as null | { id: string; name: () => string },
}

/** 降りて歩けるコロニーの中にいる（操縦中で、ワープ・レースをしていない） */
export function walkableColony() {
  const s = useStore.getState()
  if (s.mode !== 'flight' || s.warpPhase !== 'idle' || raceActive() || walkActive()) return null
  return colonyWalk.inside
}

export function startWalk() {
  const c = walkableColony()
  if (c) beginWalk(c)
}

/** 歩く場面へ、どこからでも直接行ける（航法コンピュータのボタン）。SF の世界で、操縦中のときだけ */
export function canWalkDirect() {
  const s = useStore.getState()
  return s.settings.world === 'sf' && s.mode === 'flight' && s.warpPhase === 'idle' && !raceActive() && !walkActive()
}
export function startWalkDirect() {
  if (!canWalkDirect()) return
  beginWalk(colonyWalk.inside ?? { id: COLONY_ID, name: colonyName })
}

function beginWalk(c: { id: string; name: () => string }) {
  if (document.pointerLockElement) document.exitPointerLock()
  resetWalkInput()
  useWalk.setState({ colonyId: c.id, colonyName: c.name(), view: 'chase', run: false, sitting: false, benchNear: false, riding: false, waterNote: 0 })
  setPhase('fadeIn')
  window.setTimeout(() => {
    if (useWalk.getState().phase === 'fadeIn') setPhase('walk')
  }, WALK_FADE * 1000)
}

/** 船へもどる */
export function endWalk() {
  if (useWalk.getState().phase !== 'walk') return
  if (document.pointerLockElement) document.exitPointerLock()
  setPhase('leave')
  window.setTimeout(() => {
    if (useWalk.getState().phase !== 'leave') return
    setPhase('fadeOut')
    window.setTimeout(() => {
      if (useWalk.getState().phase === 'fadeOut') useWalk.setState({ phase: 'none' })
    }, WALK_FADE * 1000)
  }, WALK_FADE * 1000)
}

// ---- 入力（キーボードと画面のボタンの両方から書き込む） ------------------------------------

export const walkInput = {
  /** 前後（前 +）・左右（右 +）。-1..1 */
  fwd: 0,
  right: 0,
  /** マウスやなぞりで向きを変えたぶん（ラジアン。歩く場面が読んだら 0 にもどす） */
  lookX: 0,
  lookY: 0,
  /** ジャンプの押し下げ（読んだら false にもどす） */
  jump: false,
  /** 座る・立つ（読んだら false にもどす） */
  sit: false,
  /** ホバースクーターに乗る・降りる（読んだら false にもどす） */
  ride: false,
  /** カメラの距離を変えたぶん（ホイール。+ で遠く） */
  zoom: 0,
  /** スマホのスティック（-1..1） */
  stickX: 0,
  stickY: 0,
  shift: false,
}

export function resetWalkInput() {
  Object.assign(walkInput, { fwd: 0, right: 0, lookX: 0, lookY: 0, jump: false, sit: false, ride: false, zoom: 0, stickX: 0, stickY: 0, shift: false })
  keys.clear()
}

const keys = new Set<string>()
const has = (...codes: string[]) => (codes.some((c) => keys.has(c)) ? 1 : 0)

function fromKeys() {
  walkInput.fwd = has('KeyW', 'ArrowUp') - has('KeyS', 'ArrowDown')
  walkInput.right = has('KeyD', 'ArrowRight') - has('KeyA', 'ArrowLeft')
  walkInput.shift = keys.has('ShiftLeft') || keys.has('ShiftRight')
}

const HOLD_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'])

export const toggleWalkView = () => useWalk.setState({ view: useWalk.getState().view === 'chase' ? 'eye' : 'chase' })

/** キーボード：WASD/矢印 歩く・Shift 走る・スペース ジャンプ・E 座る/立つ・F ホバースクーター・V 見方・J/Esc 船へもどる・マウス 向き・ホイール 距離 */
export function bindWalkKeys() {
  const down = (e: KeyboardEvent) => {
    if (useWalk.getState().phase !== 'walk') return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (e.code === 'Space') {
      e.preventDefault()
      e.stopPropagation()
      if (!e.repeat) walkInput.jump = true
      return
    }
    if (e.code === 'KeyE') {
      e.stopPropagation()
      if (!e.repeat) walkInput.sit = true
      return
    }
    if (e.code === 'KeyF') {
      e.stopPropagation()
      if (!e.repeat) walkInput.ride = true
      return
    }
    if (e.code === 'KeyV') {
      e.stopPropagation()
      if (!e.repeat) toggleWalkView()
      return
    }
    if (e.code === 'KeyJ' || (e.code === 'Escape' && !document.pointerLockElement)) {
      e.stopPropagation()
      if (!e.repeat) endWalk()
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
  const wheel = (e: WheelEvent) => {
    if (useWalk.getState().phase !== 'walk') return
    walkInput.zoom += Math.sign(e.deltaY)
  }
  const move = (e: MouseEvent) => {
    if (!document.pointerLockElement || useWalk.getState().phase !== 'walk') return
    walkInput.lookX += e.movementX * 0.0022
    walkInput.lookY += e.movementY * 0.0022
  }
  window.addEventListener('keydown', down, true)
  window.addEventListener('keyup', up, true)
  window.addEventListener('blur', blur)
  window.addEventListener('wheel', wheel, { passive: true })
  window.addEventListener('mousemove', move)
  return () => {
    window.removeEventListener('keydown', down, true)
    window.removeEventListener('keyup', up, true)
    window.removeEventListener('blur', blur)
    window.removeEventListener('wheel', wheel)
    window.removeEventListener('mousemove', move)
  }
}
