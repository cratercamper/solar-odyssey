import { byId } from './translation'
// state/eva.ts の文言（日本語）

const texts = {
  hand: '汎用ハンド',
  drill: 'ドリル',
  cutter: 'カッター',
  welder: '溶接ツール',
  pad: '吸着パッド',
} satisfies Record<string, string>

// 英語の evaTools.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type EvaToolsJa = typeof texts
export const evaToolsJa: Record<string, string> = byId(texts)
