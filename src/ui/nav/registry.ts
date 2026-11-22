import type { ReactNode } from 'react'
import { create } from 'zustand'
import { useStore } from '../../state/store'
import { useRace } from '../../state/race'
import { useMission } from '../../state/mission'

// 航法パネル（ui/NavPanel.tsx）の「遊び・学びの入口」の登録表。
// 新しい機能は ui/nav/entries/ に自分のファイルを足して registerNav を呼ぶだけ（NavPanel.tsx は触らない）。
// NavPanel が ui/nav/entries/*.ts をまとめて読み込み、tab ごとに order の小さい順に並べる。

/** 行く（天体・ワープ・着陸・入港）／見る（観察・日食・ギャラリー）／遊ぶ（レース・EVA・公園・キャンペーン・物語）／学ぶ（クイズ・探査機・図鑑・スタンプ帳） */
export type NavTab = 'go' | 'see' | 'play' | 'learn'
export const NAV_TABS: readonly NavTab[] = ['go', 'see', 'play', 'learn']

/** ボタンのいまの様子（entry.use の返り値）。どれも省ける */
export type NavEntryState = {
  /** 開いている・遊んでいる最中（ボタンを光らせる） */
  on?: boolean
  disabled?: boolean
  /** 文言をその時々で変えるとき（キャンペーンの「第2段階」など）。無ければ label() */
  label?: ReactNode
  /** 文言の後ろに薄く出すもの（「12/32」など） */
  badge?: ReactNode
}

export type NavEntry = {
  /** ほかと重ならない名前（'race'、'pioneer' など） */
  id: string
  tab: NavTab
  /** タブの中の並び（小さいほど上。いまある入口は 10 きざみ） */
  order: number
  /** ボタンの文言（ui() を呼ぶ関数にする） */
  label: () => string
  /** キーの案内（'K' など） */
  kbd?: string
  /** ボタンに足す class（自動テストや CSS で探すため） */
  className?: string
  /** その世界のときだけ出す（無ければいつも） */
  world?: 'real' | 'sf'
  /** ボタンの様子を決める React のフック（ボタンごとの部品の中で呼ぶので、中で useStore などを使ってよい） */
  use?: () => NavEntryState
  /** 押したとき（スマホでは押す前にパネルを閉じる） */
  run: () => void
}

const entries = new Map<string, NavEntry>()

/** 入口を登録する。同じ id は後のほうで置きかえる */
export function registerNav(entry: NavEntry) {
  entries.set(entry.id, entry)
}

/** 登録した入口（tab を渡すとそのタブだけ）を並び順で。world を渡すと、その世界で出すものだけ */
export function navEntries(tab?: NavTab, world?: 'real' | 'sf'): NavEntry[] {
  return [...entries.values()]
    .filter((e) => (!tab || e.tab === tab) && (!world || !e.world || e.world === world))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

/** 入口のボタンがよく使う「いま押せるか」の材料 */
export function useNavContext() {
  const warpPhase = useStore((s) => s.warpPhase)
  const mode = useStore((s) => s.mode)
  const racePhase = useRace((r) => r.phase)
  const missionPhase = useMission((m) => m.phase)
  const racing = racePhase === 'countdown' || racePhase === 'running'
  return {
    /** ワープ中かレース中 */
    busy: warpPhase !== 'idle' || racing,
    racing,
    /** ストーリーモードの任務の最中 */
    onMission: missionPhase === 'active',
    /** 宇宙を飛んでいる（着陸・EVA・公園などの場面ではない） */
    flight: mode === 'flight',
  }
}

/** いま開いているタブ（パネルを閉じても覚えておく。ほかの画面から openNavTab('play') で開ける） */
export const useNavTab = create<{ tab: NavTab }>(() => ({ tab: 'go' }))
export const openNavTab = (tab: NavTab) => useNavTab.setState({ tab })
