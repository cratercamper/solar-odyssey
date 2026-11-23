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
/** ホバースクーターの速さ（m/s）：ふつう・ブースト（Shift／スマホの「ブースト」）。ブーストなら時速 115 km */
export const HOVER_SPEED = 18
export const HOVER_BOOST = 32
/** 空を飛ぶ（高速）：高さ m と、速さ m/s（ふつう・ブースト）。ブーストなら円筒の 1 周（約 25 km）を 4 分ほどで回る */
export const SKY_HEIGHT = 30
export const SKY_SPEED = 45
export const SKY_BOOST = 100

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
  /** ビルの屋上のふちの近くにいる（腰かけられる） */
  edgeNear: boolean
  /** ホバースクーターで、ビルの平らな屋上の上を飛んでいる（降りると屋上に止まる） */
  overRoof: boolean
  /** ホバースクーターに乗っている */
  riding: boolean
  /** ホバースクーターで空を飛んでいる（高速） */
  flying: boolean
  /** 水の上で降りようとした時刻（お知らせを少し出す） */
  waterNote: number
  /** 窓の上（橋の外）で地面へ降りようとした時刻 */
  skyNote: number
  /** 今いる所（左上の名前） */
  area: WalkArea
  /** 今いる大地の帯（0〜2。窓の帯の橋の上は -1） */
  land: number
  /** 今の重さ（G。地面で 1、回転の軸で 0） */
  gee: number
  /** 軸へのエレベーターの扉の近く（up = 地面から上へ、down = 軸の駅から下へ） */
  elevNear: 'up' | 'down' | null
  /** エレベーターに乗っている */
  inElev: boolean
  /** 軸の駅に着いた時刻（「現実の科学では」を少し出す） */
  axisNote: number
  /** 人の模型を読み終えたか（それまでは人を出さず、「読み込み中」を出す） */
  peopleReady: boolean
  /** 次に歩く場面を始めるとき、軸へのエレベーターの前から始める */
  startAtTower: boolean
  /** 翼をつけている */
  wings: boolean
  /** 翼をつけられる所（軸の駅）にいる */
  wingsHere: boolean
}

/** 今いる所の種類：公園・住宅街・ジャングル（お試しの場所）と、街の計画の区画、窓の帯の橋 */
export type WalkArea = 'park' | 'town' | 'jungle' | 'parkZone' | 'townZone' | 'downtown' | 'urban' | 'suburb' | 'farm' | 'lake' | 'hill' | 'bridge' | 'axis' | 'elevator'

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
  edgeNear: false,
  overRoof: false,
  riding: false,
  flying: false,
  waterNote: 0,
  skyNote: 0,
  area: 'park',
  land: 0,
  gee: 1,
  elevNear: null,
  inElev: false,
  axisNote: 0,
  peopleReady: false,
  startAtTower: false,
  wings: false,
  wingsHere: false,
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

/** 歩く場面を、回転の軸へのエレベーターの前から始める */
export function startWalkAtTower() {
  if (!canWalkDirect()) return
  useWalk.setState({ startAtTower: true })
  startWalkDirect()
}

function beginWalk(c: { id: string; name: () => string }) {
  if (document.pointerLockElement) document.exitPointerLock()
  resetWalkInput()
  useWalk.setState({ colonyId: c.id, colonyName: c.name(), view: 'chase', run: false, sitting: false, benchNear: false, riding: false, flying: false, waterNote: 0, skyNote: 0, gee: 1, elevNear: null, inElev: false, axisNote: 0, wings: false, wingsHere: false, peopleReady: false })
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
  /** 翼をつける・はずす（読んだら false にもどす） */
  wings: false,
  /** ホバースクーターに乗る・降りる（読んだら false にもどす） */
  ride: false,
  /** 空を飛ぶ・地面へ降りる（スクーターに乗っているとき。読んだら false にもどす） */
  sky: false,
  /** カメラの距離を変えたぶん（ホイール。+ で遠く） */
  zoom: 0,
  /** スマホのスティック（-1..1） */
  stickX: 0,
  stickY: 0,
  shift: false,
}

export function resetWalkInput() {
  Object.assign(walkInput, { fwd: 0, right: 0, lookX: 0, lookY: 0, jump: false, sit: false, wings: false, ride: false, sky: false, zoom: 0, stickX: 0, stickY: 0, shift: false })
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

/** キーボード：WASD/矢印 歩く・Shift 走る・スペース ジャンプ・E 座る/立つ・F ホバースクーター・G 空を飛ぶ・V 見方・J/Esc 船へもどる・マウス 向き・ホイール 距離 */
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
    if (e.code === 'KeyG') {
      e.stopPropagation()
      if (!e.repeat) walkInput.sky = true
      return
    }
    if (e.code === 'KeyR') {
      e.stopPropagation()
      if (!e.repeat) walkInput.wings = true
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
