import { create } from 'zustand'

// 到着の瞬間：星に着いたときに、大きさの絵（3D：components/ArrivalRow.tsx、2D：ui/ArrivalMoment.tsx）と、いちばん驚くことを一つ見せる

/** 出ている時間（秒）。過ぎたら消える */
export const ARRIVAL_SECONDS = 12
/** ならべ始めるまで（秒）。着いた星をまず見てから */
const ROW_START = 0.9
/** ならべ終わるまでの長さ（秒）。数が多いときは一つずつを短くする */
const ROW_SECONDS = 3.2

type ArrivalState = {
  /** いま見せている星（なければ null） */
  id: string | null
  /** 見せ始めた時刻（performance.now() のミリ秒） */
  at: number
}

export const useArrival = create<ArrivalState>(() => ({ id: null, at: 0 }))

export const showArrival = (id: string) => useArrival.setState({ id, at: performance.now() })
export const closeArrival = () => {
  if (useArrival.getState().id) useArrival.setState({ id: null })
}

/** 動作確認用：秒数を止める（#debug の __sv.arrival.debug.freeze。null なら止めない） */
export const arrivalDebug = { freeze: null as number | null }

/** 見せ始めてからの秒数 */
export const arrivalElapsed = () => arrivalDebug.freeze ?? (performance.now() - useArrival.getState().at) / 1000

/** 一つならべる間隔（秒） */
export const rowStep = (items: number) => Math.min(0.42, ROW_SECONDS / Math.max(1, items))

/** t 秒のときに、いくつならんでいるか（items 個まで） */
export function shownAt(t: number, items: number) {
  if (t < ROW_START) return 0
  return Math.min(items, Math.floor((t - ROW_START) / rowStep(items)) + 1)
}

/** i 番目がならび始めてからの秒数（まだなら負） */
export const itemAge = (t: number, i: number, items: number) => t - ROW_START - i * rowStep(items)

/** ならべ終わる時刻（秒） */
export const rowDone = (items: number) => ROW_START + (items - 1) * rowStep(items)

/** 消えていくときの明るさ（最後の 0.8 秒で 1 → 0） */
export const fadeAt = (t: number) => Math.max(0, Math.min(1, (ARRIVAL_SECONDS - t) / 0.8))
