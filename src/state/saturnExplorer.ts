import { create } from 'zustand'
import { saveSlot } from './save'
import { missionNow, useMoonMission } from './moonMission'
import type { PartId } from '../components/moonMission/saturnCutaway'

// 観察パート（サターンV 図鑑）：打ち上げの前に、夕方の発射台に立つサターンV をぐるっと回して見る。
// 8 つの印（部品）にさわるとカメラが寄り、その部分の外板が開いて中が見える。「断面」で全体を切り開き、
// 「大きさくらべ」で人の大きさとくらべる。「打ち上げの夜へ」でタイムラプス（夕方 → 16 日後の夜）から秒読みへ。

type ExplorerState = {
  /** 選んでいる部品（null は全体を見る） */
  part: PartId | null
  /** 全体の断面 */
  cutAll: boolean
  /** 人とくらべる */
  size: boolean
  /** 前に見たことがある（はじめての人にだけ、さわり方の案内を出す） */
  seen: boolean
}

const seenSlot = saveSlot<boolean>('saturn-explorer-seen', false, (v) => (typeof v === 'boolean' ? v : null))

export const useExplorer = create<ExplorerState>(() => ({ part: null, cutAll: false, size: false, seen: seenSlot.load() }))

/** 観察パートを始める（発射台の場面が出たあとに呼ぶ） */
export function startSaturnObserve() {
  useExplorer.setState({ part: null, cutAll: false, size: false, seen: seenSlot.load() })
  useMoonMission.setState({ phase: 'observe', since: missionNow(), cam: 'film', camLocked: false })
}

export function pickPart(part: PartId | null) {
  const s = useExplorer.getState()
  useExplorer.setState({ part: s.part === part ? null : part, cutAll: false })
  markSeen()
}

export function toggleCut() {
  const s = useExplorer.getState()
  useExplorer.setState({ cutAll: !s.cutAll, part: null })
  markSeen()
}

export function toggleSize() {
  useExplorer.setState({ size: !useExplorer.getState().size })
  markSeen()
}

function markSeen() {
  if (useExplorer.getState().seen) return
  seenSlot.save(true)
  useExplorer.setState({ seen: true })
}

/** 「打ち上げの夜へ」：タイムラプスを始める */
export function toLaunchNight() {
  if (useMoonMission.getState().phase !== 'observe') return
  markSeen()
  useExplorer.setState({ part: null, cutAll: false, size: false })
  useMoonMission.setState({ phase: 'timelapse', since: missionNow() })
}

/** タイムラプスをとばして、すぐ秒読みへ */
export function skipTimelapse() {
  if (useMoonMission.getState().phase !== 'timelapse') return
  useMoonMission.setState({ since: missionNow() - 1e3 })
}
