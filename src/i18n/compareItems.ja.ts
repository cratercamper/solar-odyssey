import type { CompareItemText } from '../data/shipParts'
import { byId } from './translation'

// data/shipParts.ts の文言（日本語）

const texts = {
  skytree: { name: '東京スカイツリー', note: '高さ634m。寝かせて並べています' },
  iss: { name: '国際宇宙ステーション', note: '人が住んでいる、いちばん大きな宇宙の建物' },
  jet: { name: 'ジャンボジェット', note: 'ボーイング747' },
  hubble: { name: 'ハッブル宇宙望遠鏡', note: '大型バスくらい' },
} satisfies Record<string, CompareItemText>

// 英語の compareItems.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type CompareItemsJa = typeof texts
export const compareItemsJa: Record<string, CompareItemText> = byId(texts)
