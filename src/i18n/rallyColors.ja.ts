import type { RallyColorText } from '../state/rally'
import { byId } from './translation'

// state/rally.ts の文言（日本語）：4 色のローバー

const texts = {
  red: { color: '赤', name: 'アカツメ', trait: 'スピード型' },
  blue: { color: '青', name: 'ミナモ', trait: '慎重型' },
  yellow: { color: '黄', name: 'イナズマ', trait: 'ジャンプ好き' },
  green: { color: '緑', name: 'コケモモ', trait: '近道好き' },
} satisfies Record<string, RallyColorText>

// 英語の rallyColors.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type RallyColorsJa = typeof texts
export const rallyColorsJa: Record<string, RallyColorText> = byId(texts)
