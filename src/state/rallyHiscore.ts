import { saveData } from './save'
import { create } from 'zustand'
import { TRACKS } from '../data/rallyTracks'
import { RALLY_RECORDS, type RallyRecord } from '../data/rallyRecords'
import { coursePrint, unpackSamples, type GhostRun } from './rallyGhost'
import { DRIVE_VERSION } from './rover'

// ローバーレースのハイスコア表（レース場ごと）：ゴールしたレースをすべて、このブラウザに残す（自己ベストは state/rally.ts のまま）。
// 表には、ゲームに入っている記録（data/rallyRecords.ts）も並ぶ。表の 1 位の走りが金色のゴースト（RallyGhost.tsx）。
// 表と記録・ゴーストは、レース場ごと（キーは TRACKS の名前、自己ベストと同じ）。
// 追いかけっこ（月）は、つかまえた数の多い順、同じ数ならタイムの順（3 台つかまえるのが優勝、RallyPanel.tsx）。

export type RallyResult = {
  /** ゴールのタイム（秒） */
  time: number
  /** 順位 1〜4 */
  place: number
  /** ゴールした日時（Date.now()） */
  at: number
  /** ローバーの色（RALLY_COLORS の番号） */
  color: number
  /** 走った人。ゲームに入っている記録だけ（自分の記録には無い） */
  name?: string
  /** 追いかけっこだけ：つかまえたローバーの数 */
  caught?: number
}

export type HiscoreRow = { rank: number; result: RallyResult }

/**
 * レース場の今のレースの印：コースの線の印と、走りの版（state/rover.ts の DRIVE_VERSION）。たとえば峡谷は '122:1211.1/d1'。
 * どちらかが変わったら、表は新しく始め（前の表は別の名前で残す）、印の合わないゴーストと記録は再生しない
 */
export function courseOf(track: string) {
  const tr = TRACKS[track]
  if (!tr) throw new Error(`rally hiscore: no track ${track}`)
  return `${coursePrint(tr.line)}/d${DRIVE_VERSION}`
}

const VERSION = 1
const keyOf = (track: string) => `rally-results:${track}`
type Book = { v: number; course: string; results: RallyResult[] }

const valid = (r: RallyResult) =>
  Number.isFinite(r.time) && r.time > 0 && Number.isInteger(r.place) && r.place >= 1 && r.place <= 4 && r.at > 0 && Number.isInteger(r.color) && r.color >= 0 &&
  (r.caught === undefined || (Number.isInteger(r.caught) && r.caught >= 0))

function load(track: string): RallyResult[] {
  const key = keyOf(track)
  const course = courseOf(track)
  let text: string | null = null
  try {
    text = saveData.get(key)
    if (text === null) return []
    const b = JSON.parse(text) as Book
    if (b.v !== VERSION || !Array.isArray(b.results)) throw new Error(`format v${b.v}`)
    if (b.course !== course) {
      // コースが変わった：前のコースの表は別の名前で残して、新しい表を始める
      saveData.set(`${key}:${b.course}`, text)
      saveData.remove(key)
      return []
    }
    return b.results.filter(valid)
  } catch (e) {
    console.warn(`rally results (${track}): stored table not used (${(e as Error).message})`)
    try {
      // 読めない表は消さずに、別の名前で残す
      if (text !== null) saveData.set(`${key}:unreadable:${Date.now()}`, text)
    } catch {
      // 保存できなくても遊べる
    }
    return []
  }
}

// ゲームに入っている記録のうち、そのレース場の今のコースのもの（レース場ごとに、はじめて使うときに作る）
const builtIns = new Map<string, Map<RallyResult, RallyRecord>>()
function builtIn(track: string) {
  let m = builtIns.get(track)
  if (m) return m
  m = new Map()
  const course = courseOf(track)
  for (const rec of RALLY_RECORDS) {
    if (rec.track !== track) continue
    if (rec.course !== course) {
      console.warn(`rally records: ${rec.name} ${rec.time} s is for course ${rec.course}, not ${course} (${track}); not shown`)
      continue
    }
    const r: RallyResult = { time: rec.time, place: rec.place, at: rec.at, color: rec.color, name: rec.name }
    if (rec.caught !== undefined) r.caught = rec.caught
    m.set(r, rec)
  }
  builtIns.set(track, m)
  return m
}

// 自分の記録（このブラウザ）。レース場ごとに、はじめて使うときに読む。表が変わるたびに新しい配列にする
const books = new Map<string, RallyResult[]>()

/** そのレース場の自分の記録 */
export function resultsOf(track: string): RallyResult[] {
  let r = books.get(track)
  if (!r) {
    r = load(track)
    books.set(track, r)
  }
  return r
}

/** 表が変わったら rev が増える（画面を書き換えるため） */
export const useRallyHiscore = create<{ rev: number }>(() => ({ rev: 0 }))

/** ハイスコア表：自分の記録とゲームに入っている記録を、速い順に（追いかけっこは、つかまえた数の多い順が先。同じなら先に走ったほうが上） */
export function hiscoreTable(track: string): HiscoreRow[] {
  return [...resultsOf(track), ...builtIn(track).keys()]
    .sort((a, b) => (b.caught ?? 0) - (a.caught ?? 0) || a.time - b.time || a.at - b.at)
    .map((result, i) => ({ rank: i + 1, result }))
}

/** ゴールした走りを表に入れる。日時と、表での順位を返す（Rally.tsx のゴールで）。caught は追いかけっこだけ */
export function bookResult(track: string, time: number, place: number, color: number, caught?: number): { at: number; rank: number } {
  const r: RallyResult = { time, place, color, at: Date.now() }
  if (caught !== undefined) r.caught = caught
  const results = [...resultsOf(track), r]
  books.set(track, results)
  useRallyHiscore.setState((h) => ({ rev: h.rev + 1 }))
  try {
    saveData.set(keyOf(track), JSON.stringify({ v: VERSION, course: courseOf(track), results } satisfies Book))
  } catch {
    // 保存できなくても遊べる
  }
  return { at: r.at, rank: hiscoreTable(track).findIndex((row) => row.result === r) + 1 }
}

const builtInRuns = new Map<RallyRecord, GhostRun>()

/**
 * 金色のゴーストの走り：表の 1 位。ゲームに入っている記録ならその走り、自分の記録なら自分のゴースト（own）が
 * その走りのときだけ（ゴーストを残す前に走った 1 位には走りが無い）。name は 1 位の人（自分なら null）
 */
export function goldRun(track: string, own: GhostRun | null): { run: GhostRun; name: string | null } | null {
  const top = hiscoreTable(track)[0]?.result
  if (!top) return null
  const rec = builtIn(track).get(top)
  if (!rec) return own && own.at === top.at ? { run: own, name: null } : null
  let run = builtInRuns.get(rec)
  if (!run) {
    try {
      run = { time: rec.time, hz: rec.hz, data: unpackSamples(rec.b64), at: rec.at }
    } catch (e) {
      console.warn(`rally records: ${rec.name}'s run is unreadable (${(e as Error).message})`)
      return null
    }
    builtInRuns.set(rec, run)
  }
  return { run, name: rec.name }
}

/**
 * 自分のゴーストを入れかえるか：新しい走り（a）が、表で今のゴースト（b）より上なら（峡谷では速いほう、
 * 追いかけっこではつかまえた数の多いほう）。表に無い走り（ゴーストを残す前の古いもの）とは、タイムでくらべる
 */
export function ranksAbove(track: string, a: GhostRun, b: GhostRun): boolean {
  const rows = hiscoreTable(track)
  const row = (g: GhostRun) => (g.at === undefined ? -1 : rows.findIndex((r) => r.result.name === undefined && r.result.at === g.at))
  const ia = row(a)
  const ib = row(b)
  return ia < 0 || ib < 0 ? a.time < b.time : ia < ib
}
