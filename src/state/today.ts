import { create } from 'zustand'

/** 今日の宇宙のパネルを開いているか。開いた時刻で中身を作り直す */
export const useToday = create<{ open: boolean; at: number }>(() => ({ open: false, at: Date.now() }))

export function openToday() {
  if (document.pointerLockElement) document.exitPointerLock()
  useToday.setState({ open: true, at: Date.now() })
}
export const closeToday = () => useToday.setState({ open: false })
