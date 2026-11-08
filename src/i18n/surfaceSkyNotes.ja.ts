// data/surfaces.ts の文言（日本語）

const texts = {
  moon: '地球は空のほぼ同じ場所にとどまり、満ち欠けしながら回ります。',
  io: '木星が空の大きな部分を占めています。満月の約40倍の大きさです。',
  europa: '木星が満月の約20倍の大きさに見えます。',
  phobos: '火星が空の大きな部分を占めています。',
  mimas: '衛星は土星の赤道の上を回るので、輪はほとんど真横から見えて、細い線になります。',
  enceladus: '輪はほとんど真横から見えて、細い線になります。',
  iapetus: '軌道が傾いているので、ここからは土星の輪が開いて見えます。',
  titan: 'もやが厚くて、土星も太陽もぼんやりした明るさにしか見えません。',
  venus: '雲が厚くて、太陽はどこにあるのかわかりません。',
  pluto: '空にはカロンが、いつも同じ場所に浮かんでいます。',
  charon: '冥王星が空のいつも同じ場所に浮かんでいます。',
  earth: 'お昼すぎに東の空から月が昇り、夜には明るく輝きます。',
} satisfies Record<string, string>

// 英語の surfaceSkyNotes.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type SurfaceSkyNotesJa = typeof texts
export const surfaceSkyNotesJa: Record<string, string> = texts
