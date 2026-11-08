import { PLANETS, SUN } from './bodies'
import { CUBE_ID } from './cube'
import { COLONY_ID, SF_OBJECTS, sfEntry } from './sf'
import { HUBBLE_ID, WEBB_ID } from './telescopes'
import { ui } from '../i18n'
import type { StampTitlesJa } from '../i18n/stampTitles.ja'

// 訪問スタンプ帳：天体のそばまで行くとスタンプがもらえる。決まった組をそろえたり、たくさん集めたりすると称号がもらえる

/** name：ページの名前（今の言語、i18n/stampGroups） */
export type StampGroup = { id: string; name: () => string; ids: string[] }

const planet = (id: string) => PLANETS.find((p) => p.id === id)!
const moonsOf = (id: string) => planet(id).moons.map((m) => m.id)

export const STAMP_GROUPS: StampGroup[] = [
  { id: 'planets', name: () => ui().stampGroups.planets, ids: ['sun', ...PLANETS.filter((p) => !p.dwarf).map((p) => p.id)] },
  ...PLANETS.filter((p) => !p.dwarf && p.moons.length > 0).map((p) => ({ id: `moons-${p.id}`, name: () => ui().stampGroups.moonsOf(ui().bodies[p.id].name, p.moons.length), ids: moonsOf(p.id) })),
  { id: 'dwarf', name: () => ui().stampGroups.dwarf, ids: PLANETS.filter((p) => p.dwarf).flatMap((p) => [p.id, ...moonsOf(p.id)]) },
  { id: 'scopes', name: () => ui().stampGroups.scopes, ids: [HUBBLE_ID, WEBB_ID] },
  // SF モードだけのページ（本物の太陽系のスタンプとは別に数える）
  { id: 'sf', name: () => ui().stampGroups.sf, ids: SF_OBJECTS.map((e) => e.id) },
]

/** 太陽・惑星・衛星（数を数える称号はこれだけで数える） */
export const NATURAL = STAMP_GROUPS.filter((g) => g.id !== 'scopes' && g.id !== 'sf').flatMap((g) => g.ids)
export const STAMP_IDS = new Set(STAMP_GROUPS.flatMap((g) => g.ids))

/** スタンプの色 */
export function stampColor(id: string) {
  if (id === 'sun') return SUN.color
  if (id === HUBBLE_ID || id === WEBB_ID) return id === WEBB_ID ? '#e8b04a' : '#c9ced8'
  const sf = sfEntry(id)
  if (sf) return sf.color
  for (const p of PLANETS) {
    if (p.id === id) return p.color
    const m = p.moons.find((m) => m.id === id)
    if (m) return m.color
  }
  return '#888'
}

export type Title = {
  /** 文言は src/i18n/stampTitles.ja.ts（同じ id）。文言のない id は型エラー */
  id: keyof StampTitlesJa
  /** この中から count 個（stamp：行った天体、quiz：航海日誌のクイズに正解した天体） */
  ids: string[]
  count: number
  source: 'stamp' | 'quiz'
  /** 数を集める称号（いちばん上のものを「今の称号」にする） */
  rank?: boolean
  /** もらうまで名前を伏せる */
  secret?: boolean
  /** SF モードのもの（現実モードでは見せない） */
  sf?: boolean
}

/** 称号の文言（i18n/stampTitles、称号の id ごと） */
export type TitleText = {
  name: string
  /** もらい方（count：いる数） */
  how: (count: number) => string
}

const group = (id: string) => STAMP_GROUPS.find((g) => g.id === id)!.ids
const rank = (count: number, id: Title['id']): Title => ({
  id,
  ids: NATURAL,
  count,
  source: 'stamp',
  rank: true,
})
const set = (id: Title['id'], ids: string[], secret = false): Title => ({ id, ids, count: ids.length, source: 'stamp', secret })

export const TITLES: Title[] = [
  rank(1, 'rookie'),
  rank(5, 'apprentice'),
  rank(12, 'skilled'),
  rank(22, 'veteran'),
  rank(NATURAL.length, 'grand-tour'),
  set('rocky', ['mercury', 'venus', 'earth', 'mars']),
  set('giants', ['jupiter', 'saturn', 'uranus', 'neptune']),
  set('nearby', ['moon', ...moonsOf('mars')]),
  set('galilean', moonsOf('jupiter')),
  set('saturn-moons', moonsOf('saturn')),
  set('ice-moons', [...moonsOf('uranus'), ...moonsOf('neptune')]),
  set('far', group('dwarf')),
  set('scopes', group('scopes')),
  { ...set('mystery', [CUBE_ID], true), sf: true },
  { ...set('colonist', [COLONY_ID]), sf: true },
  { id: 'scholar', ids: NATURAL, count: 10, source: 'quiz' },
  { id: 'professor', ids: NATURAL, count: NATURAL.length, source: 'quiz' },
]

/** 称号のための数（集めた数、いる数） */
export function titleProgress(title: Title, stamps: Record<string, number>, explored: string[]) {
  const have = title.source === 'stamp' ? title.ids.filter((id) => id in stamps).length : title.ids.filter((id) => explored.includes(id)).length
  return { have: Math.min(have, title.count), need: title.count }
}

/** 称号の文言（今の言語） */
export const titleText = (title: Title) => ui().stampTitles[title.id]

export const titleEarned = (title: Title, stamps: Record<string, number>, explored: string[]) => {
  const { have, need } = titleProgress(title, stamps, explored)
  return have >= need
}
