import { CONAMARA_EASY_RACE, CONAMARA_RACE, COPRATES_RACE, TAURUS_RACE } from './raceLines'
import type { RallyTracksJa } from '../i18n/rallyTracks.ja'

// ローバーレースのコース。キーはコースの名前で、ふつうは着陸地点（SITES、surfaces.ts）の名前と同じ。
// ひとつのレース場に、やさしいコースと上級のコースのように、いくつかのコースがあることもある（site で同じ地点をさす）

export type RallyTrack = {
  /** どの天体か */
  body: string
  /** どの着陸地点（SITES）を走るか。省くとコースの名前と同じ */
  site?: string
  /** 同じレース場にコースがいくつかあるときの、むずかしさ（スタート欄で選ぶ。easy が最初に選ばれる） */
  level?: 'easy' | 'hard'
  /** 走行ライン（10 m ごと、x 東・z 南） */
  line: [number, number][]
  /** 門の道のり（m、最後がゴール）。左右交互（ジグザグ）に置いてある（raceLines.ts） */
  gates: number[]
  /** 追いかけっこ：ライバルが先に逃げて、ゴールまでにタッチしてつかまえる（月） */
  chase?: boolean
  /** 氷：タイヤの横の力の倍率（1 がふつう）。コンピューターのカーブの速さと、すべる見た目に使う */
  ice?: number
}

/** RallyTrack の文言（日本語は src/i18n/rallyTracks.ja.ts、英語は rallyTracks.en.ts） */
export type RallyTrackText = {
  /** スタート欄の題 */
  title: string
  /** スタート欄の説明 */
  intro: string
  /** 運転中・着陸船のボタン */
  button: string
  /** もとの着陸地点へ戻るボタン */
  home: string
}

export const TRACKS: Record<string, RallyTrack> = {
  coprates: {
    body: 'mars',
    ...COPRATES_RACE,
  },
  taurus: {
    body: 'moon',
    ...TAURUS_RACE,
    chase: true,
  },
  // エウロパ：やさしいコース（曲げない・門は約 200 m ごと、cratercamper さん 2026-11-12）と、上級のジグザグのコース
  conamaraEasy: {
    body: 'europa',
    site: 'conamara',
    level: 'easy',
    ...CONAMARA_EASY_RACE,
    ice: 0.2,
  },
  conamara: {
    body: 'europa',
    level: 'hard',
    ...CONAMARA_RACE,
    ice: 0.2,
  },
  // id は src/i18n/rallyTracks.ja.ts と同じ：文言のないコース（文言だけのコースも）は型エラー
} satisfies Record<keyof RallyTracksJa, RallyTrack>

/** コースが走る着陸地点の名前 */
export const siteOfTrack = (id: string) => TRACKS[id]?.site ?? id

/** そのレース場（着陸地点）のコース（やさしい順） */
export function tracksAt(site: string): string[] {
  const rank = (id: string) => (TRACKS[id].level === 'easy' ? 0 : TRACKS[id].level === 'hard' ? 2 : 1)
  return Object.keys(TRACKS)
    .filter((id) => siteOfTrack(id) === site)
    .sort((a, b) => rank(a) - rank(b))
}

/** その天体のレース場の着陸地点の名前（無ければ null） */
export function trackForBody(body: string): string | null {
  for (const [id, tr] of Object.entries(TRACKS)) if (tr.body === body) return siteOfTrack(id)
  return null
}
