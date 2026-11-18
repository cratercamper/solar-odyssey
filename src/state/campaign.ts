import { create } from 'zustand'
import { CAMPAIGN_STAGES, isLockedBody } from '../data/campaign'
import { ui } from '../i18n'
import { useStore } from './store'

// キャンペーン「博士の探査隊」の進み具合（data/campaign.ts）。端末に保存する。
// active：いまキャンペーンで遊んでいるか（起動するたびに、はじめの画面で選ぶ。保存しない）。
// stage：いまの段階（CAMPAIGN_STAGES の番号。段階の数と同じなら第1部クリア）。
// counts：天体ごとに、キャンペーンで集めた試料の数（自由探検で集めたぶんは数えない）。
// card：博士のメッセージのカード（その段階のはじまり intro・クリア done・第1部の終わり end）

export type CampaignCard = { kind: 'intro' | 'done' | 'end'; stage: number } | null

type CampaignState = {
  active: boolean
  /** はじめの画面（キャンペーンか自由探検かを選ぶ）を出しているか */
  picking: boolean
  stage: number
  counts: Record<string, number>
  card: CampaignCard
}

const KEY = 'solar-voyager:campaign'
type Saved = { v: 1; stage: number; counts: Record<string, number> }

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null
    if (s && s.v === 1 && Number.isInteger(s.stage) && s.stage >= 0 && s.counts && typeof s.counts === 'object')
      return { v: 1, stage: Math.min(s.stage, CAMPAIGN_STAGES.length), counts: s.counts }
  } catch {
    // 読めなければ、はじめから
  }
  return { v: 1, stage: 0, counts: {} }
}

function save() {
  const { stage, counts } = useCampaign.getState()
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, stage, counts } satisfies Saved))
  } catch {
    // 保存できなくても遊べる
  }
}

/** ふだんは自由探検ではじまる（junji 2026-11-17）。#campaign のリンクのときだけ、はじめにキャンペーンの画面を出す */
const askAtStart = /[?&#]campaign\b/.test(location.search + location.hash)

export const useCampaign = create<CampaignState>(() => ({ active: false, picking: askAtStart, card: null, ...load() }))

/** いまの段階（クリア後は null） */
export const currentStage = () => CAMPAIGN_STAGES[useCampaign.getState().stage] ?? null

/** キャンペーンで、その天体にまだ行けないか（キャンペーンで遊んでいないときは、いつも行ける） */
export function campaignLocked(id: string | null | undefined): boolean {
  const c = useCampaign.getState()
  return !!id && c.active && isLockedBody(id, c.stage)
}

/**
 * 行けない天体へ行こうとしたとき（ワープ・自動航行・着陸）：お知らせを出して true を返す。行ければ false
 */
export function blockedByCampaign(id: string | null | undefined): boolean {
  if (!campaignLocked(id)) return false
  const st = currentStage()
  const t = ui().campaign
  useStore.getState().showToast(t.locked(ui().bodies[id!]?.name ?? id!, st ? goalLine(st.goals[0].body, st.goals[0].count) : ''))
  return true
}

/** 目標の一行（例：月で岩を3つ集めよう） */
export const goalLine = (body: string, count: number) => ui().campaign.goal(ui().bodies[body]?.name ?? body, count)

/** キャンペーンをはじめる（つづきから）。本物の太陽系にして、目標の天体を行き先にする */
export function startCampaign() {
  useCampaign.setState({ active: true, picking: false })
  const st = currentStage()
  useCampaign.setState({ card: st ? { kind: 'intro', stage: useCampaign.getState().stage } : { kind: 'end', stage: CAMPAIGN_STAGES.length } })
  aimAtGoal()
}

/** キャンペーンの画面を開く（航法コンピュータのボタンから） */
export function openCampaign() {
  useCampaign.setState({ picking: true })
}

/** キャンペーンの画面を閉じる（遊び方は変えない） */
export function closeCampaignScreen() {
  useCampaign.setState({ picking: false })
}

/** 自由探検（今までどおり、どこへでも行ける） */
export function startFree() {
  useCampaign.setState({ active: false, picking: false, card: null })
}

/** はじめからやり直す */
export function resetCampaign() {
  useCampaign.setState({ stage: 0, counts: {} })
  save()
  startCampaign()
}

/** 目標の天体（まだそろっていない最初のもの）を、行き先にする */
export function aimAtGoal() {
  const st = currentStage()
  if (!st) return
  const { counts } = useCampaign.getState()
  const g = st.goals.find((x) => (counts[x.body] ?? 0) < x.count) ?? st.goals[0]
  const s = useStore.getState()
  if (s.warpPhase === 'idle' && s.targetId !== g.body) s.setTarget(g.body)
}

/** ローバーで試料を一つ採った（Rover.tsx から） */
export function campaignSample(body: string) {
  const c = useCampaign.getState()
  if (!c.active) return
  const st = CAMPAIGN_STAGES[c.stage]
  if (!st) return
  const counts = { ...c.counts, [body]: (c.counts[body] ?? 0) + 1 }
  useCampaign.setState({ counts })
  if (st.goals.every((g) => (counts[g.body] ?? 0) >= g.count)) {
    // 段階クリア：次の星が開く。カードを読んでから、次の段階のはじまり（intro）を出す
    useCampaign.setState({ stage: c.stage + 1, card: { kind: 'done', stage: c.stage } })
  }
  save()
}

/** 博士のカードを閉じる。クリアのカードのあとは、次の段階のはじまり（最後なら第1部の終わり） */
export function closeCampaignCard() {
  const { card, stage } = useCampaign.getState()
  if (card?.kind === 'done') {
    useCampaign.setState({ card: stage < CAMPAIGN_STAGES.length ? { kind: 'intro', stage } : { kind: 'end', stage } })
    return
  }
  useCampaign.setState({ card: null })
  if (card?.kind === 'intro') aimAtGoal()
}

// 自動航行：行けない天体へは入れない（ボタン・G キー・スマホのボタンのどれからでも）
useStore.subscribe((s, prev) => {
  if (s.autopilot && !prev.autopilot && blockedByCampaign(s.targetId)) useStore.getState().setAutopilot(false)
})
