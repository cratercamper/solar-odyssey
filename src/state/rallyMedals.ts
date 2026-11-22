import { create } from 'zustand'
import { TRACKS } from '../data/rallyTracks'
import { saveData } from './save'

// ローバーレースのメダル（コースごとに、いちばん良いメダルを 1 つ覚える）。
// ふつうのレースはゴールのタイムで（TRACKS の medals）、追いかけっこ（月）はつかまえた数で（3 台で金・2 台で銀・1 台で銅）。
// メダルはコンピューターの強さに関係なく、自分のタイムだけで決まる。
// 金メダルを取ると、そのコースのごほうびの岩（TRACKS の reward）が岩石コレクションに入る（RallyPanel.tsx の結果のカード）。

/** 1 金・2 銀・3 銅 */
export type Medal = 1 | 2 | 3

export type MedalRecord = { medal: Medal; at: number }

const KEY = 'rally-medals'
const VERSION = 1

function load(): Record<string, MedalRecord> {
  try {
    const v = JSON.parse(saveData.get(KEY) ?? 'null')
    if (!v || v.v !== VERSION || typeof v.medals !== 'object') return {}
    const out: Record<string, MedalRecord> = {}
    for (const [track, r] of Object.entries(v.medals as Record<string, MedalRecord>)) {
      if (track in TRACKS && (r.medal === 1 || r.medal === 2 || r.medal === 3) && r.at > 0) out[track] = { medal: r.medal, at: r.at }
    }
    return out
  } catch {
    return {}
  }
}

export const useRallyMedals = create<{ medals: Record<string, MedalRecord> }>(() => ({ medals: load() }))

/** そのコースで取れるメダル（取れなければ null）。caught は追いかけっこだけ */
export function medalFor(track: string, time: number, caught?: number): Medal | null {
  const tr = TRACKS[track]
  if (!tr) return null
  if (tr.chase) return caught === undefined || caught <= 0 ? null : caught >= 3 ? 1 : caught === 2 ? 2 : 3
  if (!tr.medals) return null
  const [gold, silver, bronze] = tr.medals
  return time <= gold ? 1 : time <= silver ? 2 : time <= bronze ? 3 : null
}

/** 次のメダルまで（ふつうのレース：あと何秒、追いかけっこ：あと何台）。金なら null */
export function nextMedal(track: string, time: number, caught?: number): { medal: Medal; need: number } | null {
  const tr = TRACKS[track]
  const now = medalFor(track, time, caught)
  if (!tr || now === 1) return null
  const want = (now === null ? 3 : now - 1) as Medal
  if (tr.chase) return { medal: want, need: 4 - want - (caught ?? 0) }
  return tr.medals ? { medal: want, need: time - tr.medals[want - 1] } : null
}

/** ゴールでメダルを記録する。前より良いメダルなら true */
export function awardMedal(track: string, medal: Medal): boolean {
  const had = useRallyMedals.getState().medals[track]
  if (had && had.medal <= medal) return false
  const medals = { ...useRallyMedals.getState().medals, [track]: { medal, at: Date.now() } }
  useRallyMedals.setState({ medals })
  saveData.set(KEY, JSON.stringify({ v: VERSION, medals }))
  return true
}

/** メダルの絵文字 */
export const medalIcon = (m: Medal) => (m === 1 ? '🥇' : m === 2 ? '🥈' : '🥉')
