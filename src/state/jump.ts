import { create } from 'zustand'
import { jumpOn, playbackSpeed } from '../data/jump'

// 重力ジャンプ：地表で「ジャンプしてみる」を押すと、目の前で宇宙飛行士（この星）と、となりで地球の人（うすい青）が
// 同じ力で跳ぶ（components/surface/GravityJump.tsx）。結果は画面の上に（ui は SurfaceView の JumpCard）

/** しゃがんでから足が地面をはなれるまで（秒） */
export const CROUCH = 0.4
/** 着地してから立ち上がるまで（秒） */
export const LAND = 0.6

type JumpState = {
  /** 跳んでいる星（跳んでいなければ null） */
  id: string | null
  /** 始めた時刻（performance.now() のミリ秒） */
  at: number
  /** 着地した（結果を出す） */
  landed: boolean
}

export const useJump = create<JumpState>(() => ({ id: null, at: 0, landed: false }))

/** 動作確認用：見せる時刻（秒）を止める（#debug の __sv.jump.debug.freeze） */
export const jumpDebug = { freeze: null as number | null }

export function startJump(id: string) {
  if (!jumpOn(id)) return
  useJump.setState({ id, at: performance.now(), landed: false })
}
export const stopJump = () => useJump.setState({ id: null, landed: false })

/**
 * 始めてからの、星の上での時刻（秒）。空中の時間が長い星は早送り（しゃがむ・立つところは早送りしない）
 * 戻り値の real は、画面で過ぎた時間
 */
export function jumpClock(id: string) {
  const j = jumpOn(id)!
  const real = jumpDebug.freeze ?? (performance.now() - useJump.getState().at) / 1000
  const speed = playbackSpeed(j.airtime)
  const air = j.airtime / speed
  let t: number
  if (real < CROUCH) t = real
  else if (real < CROUCH + air) t = CROUCH + (real - CROUCH) * speed
  else t = CROUCH + j.airtime + (real - CROUCH - air)
  return { t, real, speed, total: CROUCH + air + LAND }
}
