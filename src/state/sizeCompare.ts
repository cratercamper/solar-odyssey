import { create } from 'zustand'
import { canCompare, defaultPicks, type Pick } from '../data/sizeCompare'

// 大きさくらべ（ui/SizeCompare.tsx）：どの星を、なにとくらべているか、どれに寄っているか

type SizeCompareState = {
  /** くらべている星（開いていなければ null） */
  id: string | null
  /** ならべているもの。くらべている星も、はじめはここに入っている（ボタンではずせる） */
  picks: Pick[]
  /** 寄って見ているもの（全体なら null） */
  focus: string | null
}

export const useSizeCompare = create<SizeCompareState>(() => ({ id: null, picks: [], focus: null }))

/** 開く（くらべられない星なら地球）。その星もはじめから選んである（ほかのものとおなじに、はずせる） */
export function openSizeCompare(id?: string | null) {
  if (document.pointerLockElement) document.exitPointerLock()
  const target = canCompare(id) ? id : 'earth'
  useSizeCompare.setState({ id: target, picks: [target, ...defaultPicks(target)], focus: null })
}
export const closeSizeCompare = () => useSizeCompare.setState({ id: null, focus: null })

/** くらべるものを足す・はずす */
export function togglePick(p: Pick) {
  const s = useSizeCompare.getState()
  const picks = s.picks.includes(p) ? s.picks.filter((x) => x !== p) : [...s.picks, p]
  useSizeCompare.setState({ picks, focus: s.focus === p && !picks.includes(p) ? null : s.focus })
}

/** さわったものに寄る（もう一度さわると全体にもどる） */
export function focusOn(id: string | null) {
  const s = useSizeCompare.getState()
  useSizeCompare.setState({ focus: s.focus === id ? null : id })
}
