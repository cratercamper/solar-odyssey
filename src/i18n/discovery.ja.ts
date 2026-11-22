// 発見スキャン（ui/ScannerHud.tsx、ui/DiscoveryNote.tsx）の文言（日本語）

export const discoveryJa = {
  navButton: '発見スキャン',
  saveLabel: '発見した小惑星',
  scanner: 'スキャナー',
  goBelt: '火星と木星のあいだの小惑星帯へ行くと、岩をスキャンできます。',
  noRock: '近くにスキャンできる岩がありません。岩にもう少し近づこう。',
  rockInRange: '◇ の岩をスキャンできます',
  scan: 'スキャン',
  scanning: 'スキャン中…',
  stop: 'スキャナーを切る',
  note: '発見ノート',
  newFind: '新しい小惑星を発見！',
  known: 'この岩はもう発見ずみです',
  code: '仮符号',
  codeNote: '本物の小惑星も、見つかるとまず「見つけた年＋半月の記号＋順番」の仮の名前（仮符号）が付きます。',
  kind: {
    0: '炭素質（C型）',
    1: '石質（S型）',
    2: '金属（M型）',
  } as Record<0 | 1 | 2, string>,
  kindNote: {
    0: '小惑星の約4分の3がこのタイプ。太陽系ができたころの材料がほぼそのまま残っています。',
    1: '岩と金属が混ざったタイプ。地球に落ちてくる隕石に多い種類です。',
    2: '鉄やニッケルが多いタイプ。昔の小さな惑星の芯のかけらと考えられています。',
  } as Record<0 | 1 | 2, string>,
  size: (km: number) => `大きさ 約${km}km（見積もり）`,
  namePrompt: '名前を付けよう（付けなくてもOK）',
  namePlaceholder: '例：ほしのたま',
  save: '記録する',
  later: 'あとで',
  realNaming: '本物の小惑星は140万個以上見つかっています。軌道がはっきりして番号が付くと、見つけた人が名前を提案できます。',
  noteTitle: '発見ノート',
  noteCount: (n: number) => `${n}個`,
  noteEmpty: 'まだ発見がありません。ナビの「学ぶ」から発見スキャンを入れて、小惑星帯の岩に近づいてスキャンしよう。',
  rename: '名前を変える',
  foundOn: (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日に発見`,
  close: '閉じる',
  /** エベレストとくらべた大きさ（A2 の発見の瞬間） */
  sizeVs: (km: number, times: number) =>
    times >= 1.15 ? `約${km}km：エベレストの高さの${times.toFixed(1)}倍` : times >= 0.85 ? `約${km}km：エベレストの高さと同じくらい` : `約${km}km：エベレストの高さの${Math.round(times * 10)}割くらい`,
  more: 'もっと知る',
  less: 'とじる',
  photo: '発見したときの写真',
  noPhoto: '写真なし',
  /** 名前を付けたものは「名前（仮符号）」、まだなら仮符号だけ */
  label: (name: string, code: string) => (name ? `${name}（${code}）` : code),
}
