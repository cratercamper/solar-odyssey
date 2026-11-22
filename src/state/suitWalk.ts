import { create } from 'zustand'
import { crewPose, launchRover, useRover } from './rover'

// 宇宙服で地表を歩く（着陸船から外へ出る）。歩くのは components/surface/SuitWalk.tsx。
// 動かし方：PC は WASD／矢印（カメラの向きへ）、Shift で走る、Space で跳ぶ、マウスのドラッグで見回す。
// スマホは左下のスティックと、右下の「跳ぶ」「走る」

export type SuitWalkState = {
  on: boolean
  /** 外へ出た時刻（秒、performance.now 基準） */
  since: number
  /** 行ける範囲の端にいる */
  edge: boolean
  /** 走る（スマホの切りかえ。PC は Shift を押しているあいだ） */
  run: boolean
  /** 足あとの数 */
  steps: number
  /** 与圧ローバーのそば（乗りこめる） */
  nearCrew: boolean
}

export const useSuitWalk = create<SuitWalkState>(() => ({ on: false, since: 0, edge: false, run: false, steps: 0, nearCrew: false }))

export const suitNow = () => performance.now() / 1000

export function startSuitWalk() {
  if (useSuitWalk.getState().on || useRover.getState().phase !== 'none') return
  useSuitWalk.setState({ on: true, since: suitNow(), edge: false, run: false, steps: 0, nearCrew: false })
}

export function endSuitWalk() {
  if (!useSuitWalk.getState().on) return
  useSuitWalk.setState({ on: false, edge: false, nearCrew: false })
  suitInput.x = suitInput.z = 0
  keys.clear()
}

/** 与圧ローバーのそばで「乗る」：歩くのをやめて、そのまま運転へ（乗りこむところから） */
export function boardCrewRover() {
  if (!useSuitWalk.getState().nearCrew || !crewPose.on) return
  endSuitWalk()
  launchRover(false, 'crew')
}

/** 与圧ローバーの車体（車の向きで、前後 ±CREW_HALF_L・左右 ±CREW_HALF_W、高さ CREW_TOP_Y まで。m） */
export const CREW_HALF_L = 3.3
export const CREW_HALF_W = 2.3
export const CREW_TOP_Y = 3.4
/** 車体からこの距離までは「乗る」が出る（m） */
export const CREW_NEAR = 1.8

/** 入力：x は右、z は前（-1〜1、カメラの向きで）。jump は 1 回ぶん */
export const suitInput = { x: 0, z: 0, run: false, jump: false }
/** 見回すカメラ（SuitWalk が使う）：yaw は水平の向き、pitch は見下ろす角度、dist は距離（m） */
export const suitCam = { yaw: 0, pitch: 0.28, dist: 5.5 }

/** 宇宙飛行士のいまの姿（地面の読み込み・影・ミニマップの中心に使う） */
export const suitPose = { x: 0, y: 0, z: 0, heading: 0, speed: 0, grounded: true }

/** 確認用：move に [右, 前] を入れると、その入力で歩き続ける。place で好きな場所へ置く */
export const suitDebug: { move: [number, number] | null; place: ((x: number, z: number, heading: number) => void) | null } = { move: null, place: null }

const keys = new Set<string>()
const KEYS = new Set(['KeyE', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'])

function fromKeys() {
  const has = (...c: string[]) => c.some((k) => keys.has(k))
  suitInput.z = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0)
  suitInput.x = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0)
  suitInput.run = has('ShiftLeft', 'ShiftRight')
}

/** PC のキー（歩いているあいだだけ受け取る） */
export function bindSuitKeys() {
  const down = (e: KeyboardEvent) => {
    if (!useSuitWalk.getState().on || !KEYS.has(e.code)) return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    e.preventDefault()
    e.stopPropagation()
    if (e.code === 'Space') {
      if (!e.repeat) suitInput.jump = true
      return
    }
    if (e.code === 'KeyE') {
      if (!e.repeat) boardCrewRover()
      return
    }
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

/** ローバーか宇宙飛行士が外にいる（地面の読み込みと影を、そのまわりに合わせる。位置は roverFocus） */
export const followOn = () => useRover.getState().phase !== 'none' || useSuitWalk.getState().on
