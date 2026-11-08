import { byId } from './translation'
// components/Phaser.tsx の文言（日本語）

const texts = {
  '0': '炭素質（C型）の小惑星を破壊。小惑星の約4分の3がこのタイプで、太陽系ができたころの材料がほぼそのまま残っています。',
  '1': '石質（S型）の小惑星を破壊。岩と金属が混ざっていて、地球に落ちてくる隕石に多いタイプです。',
  '2': '金属（M型）の小惑星を破壊。鉄やニッケルが多く、昔の小さな惑星の芯のかけらだと考えられています。',
  sparse: '本物の小惑星帯はとてもまばらで、大きな岩どうしは数十万〜100万kmほど離れています。探査機は何にもぶつからずに通り抜けられます。',
} satisfies Record<string, string>

// 英語の phaserFacts.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type PhaserFactsJa = typeof texts
export const phaserFactsJa: Record<string, string> = byId(texts)
