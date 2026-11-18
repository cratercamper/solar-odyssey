import { byId } from './translation'
// components/eva/hull.ts の文言（日本語）

const texts = {
  ship: '母船のまわり（自由飛行）',
  hull: 'この船の外壁',
  arcadia: 'アルカディアの発進路',
  dock: '天の湊 リングの下面',
} satisfies Record<string, string>

// 英語の evaSites.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type EvaSitesJa = typeof texts
export const evaSitesJa: Record<string, string> = byId(texts)
