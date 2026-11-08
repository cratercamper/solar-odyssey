import { CONAMARA_RACE, COPRATES_RACE, TAURUS_RACE } from './raceLines'
import type { RallyTracksJa } from '../i18n/rallyTracks.ja'

// ローバーレースのコース（レース場ごと）。キーは着陸地点（SITES、surfaces.ts）の名前

export type RallyTrack = {
  /** どの天体か */
  body: string
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
  conamara: {
    body: 'europa',
    ...CONAMARA_RACE,
    ice: 0.2,
  },
  // id は src/i18n/rallyTracks.ja.ts と同じ：文言のないコース（文言だけのコースも）は型エラー
} satisfies Record<keyof RallyTracksJa, RallyTrack>

/** その天体のレース場（無ければ null） */
export function trackForBody(body: string): string | null {
  for (const [id, tr] of Object.entries(TRACKS)) if (tr.body === body) return id
  return null
}
