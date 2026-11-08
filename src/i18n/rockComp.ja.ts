// data/rockSamples.ts の成分の名前（日本語）。化学式だけの成分（'SiO₂'）はここになく、そのまま出る

const texts = {
  ice: 'H₂O 氷',
  frost: 'SO₂ 霜',
  silicates: 'ケイ酸塩',
  other: 'その他',
  salts: '塩類',
  organics: '有機物',
  clay: '粘土鉱物',
} satisfies Record<string, string>

// 英語の rockComp.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type RockCompJa = typeof texts
export const rockCompJa: Record<string, string> = texts
