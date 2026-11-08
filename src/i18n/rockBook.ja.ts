// ui/RockBook.tsx の文言（日本語）

export const rockBookJa = {
  landerHint: (where: string) => `${where}に着陸して、ローバーで光の柱の岩を探してみよう。`,
  spotsHint: (where: string, spots: string[]) => `${where}の見どころ「${spots.join('」「')}」で見つかるかも。ミニマップの ◆ をめざして走ろう。`,
  back: '一覧へ',
  /** まだ見つけていない岩の名前 */
  unknownName: '？？？',
  foundOn: '見つけた場所：',
  notFoundYet: 'まだ見つけていない岩です。',
  rockCollection: '岩石コレクション',
  close: '閉じる',
  howToCollect: '惑星や衛星に着陸してローバーを出し、岩を採集すると、ここに標本が並びます。まだ見つけていない岩はシルエットだけ。タップすると説明が読めます。',
}
