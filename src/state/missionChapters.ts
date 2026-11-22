// 月ミッションの章：どの章からでも始められ、遊んでいる途中で次の章へ飛ばせる。
// 章の番号は計画の 0〜8（0 発射台、1 上昇、2 地球の周回と月への点火、3 ドッキング、4 青い地球と 3 日の旅、
// 5 月の裏でブレーキ、6 着陸、7 月面の探検、8 帰還）。

import { debugSkip, saveChapter, startMoonMission, useMoonMission, setCaption, type MissionPhase } from './moonMission'
import { lunarSkip, stepOutside } from './moonLunar'
import { startDock, startMarble } from './moonDock'
import { startReturn } from './moonReturn'
import { evaOn, leaveApolloEva } from './apolloEva'
import { FADE as SURFACE_FADE } from './landing'
import { startSaturnObserve } from './saturnExplorer'

export type Chapter = {
  n: number
  /** この章から始める（ない章は準備中） */
  start?: () => void
}

/** いまのミッションを止めて、新しく始める */
function begin(chapter: 'launch' | 'moon', after?: () => void) {
  useMoonMission.setState({ phase: 'none' })
  startMoonMission(chapter, after)
}

/** 章3・4：発射台の場面を用意してから、すぐドッキングの場面へ */
function beginDeep(start: () => void) {
  begin('launch', start)
}

export const CHAPTERS: Chapter[] = [
  // 章0：夕方の発射台でサターンV を見てから、タイムラプスで打ち上げの夜へ
  { n: 0, start: () => begin('launch', startSaturnObserve) },
  {
    n: 1,
    start: () =>
      begin('launch', () => {
        // 秒読みを飛ばして、離昇の瞬間から
        useMoonMission.setState({ phase: 'ascent', countdown: 0, ignitedAt: 1 })
        setCaption('ignition')
      }),
  },
  {
    n: 2,
    start: () =>
      begin('launch', () => {
        // 上昇はおまかせで済ませて、地球を回り始めた所から
        let guard = 0
        while (useMoonMission.getState().phase !== 'orbit' && guard++ < 400) debugSkip(guard * 5)
        useMoonMission.setState({ auto: false, caption: null })
        setCaption('orbit')
      }),
  },
  { n: 3, start: () => beginDeep(startDock) },
  { n: 4, start: () => beginDeep(startMarble) },
  { n: 5, start: () => begin('moon') },
  { n: 6, start: () => begin('moon', () => lunarSkip('undock', false)) },
  // 月面の探検：ミッションの場面を閉じて、地表の場面（タウルス・リトロー谷）へ
  { n: 7, start: () => stepOutside() },
  // 帰還：月面（章7 の終わり）からは、地表の場面を閉じてから
  { n: 8, start: () => beginReturn() },
]

function beginReturn() {
  if (evaOn()) {
    leaveApolloEva()
    window.setTimeout(() => begin('launch', startReturn), SURFACE_FADE * 1000 + 150)
  } else begin('launch', startReturn)
}

const OF_PHASE: Partial<Record<MissionPhase, number>> = {
  observe: 0,
  timelapse: 0,
  pad: 0,
  ascent: 1,
  orbit: 2,
  tli: 2,
  outbound: 2,
  dock: 3,
  marble: 4,
  coast: 5,
  loi: 5,
  undock: 6,
  descent: 6,
  landed: 6,
  home: 8,
}

/** いまの章（ミッションの外では null） */
export const chapterOf = (phase: MissionPhase): number | null => OF_PHASE[phase] ?? null

/** いまの章の次に遊べる章（なければ null） */
export function nextChapter(phase: MissionPhase): Chapter | null {
  const now = chapterOf(phase)
  if (now === null) return null
  return CHAPTERS.find((c) => c.n > now && c.start) ?? null
}

export function startChapter(n: number) {
  const c = CHAPTERS[n]
  if (!c?.start) return
  saveChapter(n)
  c.start()
}

// 章が変わるたびに、進んだ所を残す
useMoonMission.subscribe((s, prev) => {
  if (s.phase === prev.phase) return
  const n = chapterOf(s.phase)
  if (n !== null && n > 0) saveChapter(n)
})
