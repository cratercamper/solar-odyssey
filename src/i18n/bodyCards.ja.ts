// ui/BodyCards.tsx の文言（日本語）。天体カード：大きさ・重力・1日・気温を地球とくらべる

const n = (v: number, digits = 2) => Number(v.toPrecision(digits)).toLocaleString('ja-JP', { maximumFractionDigits: 6 })

export const bodyCardsJa = {
  title: '天体カード',
  open: '天体カード',
  openHint: '大きさ・重力・1日・気温を地球とくらべる',
  close: '閉じる',
  prev: '前の天体',
  next: '次の天体',
  pickOther: 'ほかの天体',
  goThere: 'ここへ行く',
  kindStar: '恒星',
  kindPlanet: '惑星',
  kindDwarf: '準惑星',
  kindMoonOf: (parent: string) => `${parent}の衛星`,
  size: '大きさ',
  gravity: '重力',
  day: '1日の長さ',
  temperature: '気温',
  earth: '地球',
  diameter: (km: string) => `直径 ${km}km`,
  km: (v: number) => Math.round(v).toLocaleString('ja-JP'),
  /** 地球とくらべて何倍か */
  timesEarth: (x: number) => (x >= 0.95 && x <= 1.05 ? '地球とほぼ同じ' : x >= 0.1 ? `地球の約${n(x, x >= 100 ? 3 : 2)}倍` : `地球の約${n(1 / x)}分の1`),
  sizeNote: '円の大きさは本当の比です。',
  tooSmall: '（小さいほうは点にしか見えません）',
  /** 体重：地球で 30kg の人 */
  weight: (kg: number) => `地球で体重30kgの人は、ここでは約${kg >= 10 ? `${Math.round(kg)}kg` : kg >= 1 ? `${n(kg)}kg` : `${n(kg * 1000)}g`}の重さに感じます。`,
  /** ジャンプ：地球で 50cm 跳べる人 */
  jump: (m: number) => `地球で50cm跳べる人なら、約${m >= 1000 ? `${n(m / 1000)}km` : m >= 10 ? `${Math.round(m)}m` : m >= 1 ? `${n(m)}m` : `${Math.round(m * 100)}cm`}も跳べる計算です。`,
  jumpLess: (m: number) => `地球で50cm跳べる人も、約${Math.round(m * 100)}cmしか跳べません。`,
  cloudTops: '固い地面がないので、雲の上の高さでの値です。',
  sunSurface: '表面での値です。',
  /** 1日の長さ（時間） */
  dayLength: (h: number) =>
    h >= 72 ? `約${n(h / 24, 3)}日` : `約${Math.floor(h)}時間${Math.round((h % 1) * 60) ? `${Math.round((h % 1) * 60)}分` : ''}`,
  dayVsEarth: (x: number) => (x >= 0.95 && x <= 1.05 ? '地球とほぼ同じ' : x >= 1 ? `地球の約${n(x, 3)}日分` : `地球の1日の約${n(1 / x)}分の1`),
  dayNoteSun: '太陽はガスなので、場所によって回る速さが違います（赤道で約25日）。',
  dayNoteMoon: '親の星にいつも同じ面を向けて回るので、1日は親の星を1周する時間とほぼ同じです。',
  dayNoteRetro: '自転が逆向きなので、太陽は西から昇ります。',
  dayNote: '日の出から次の日の出までの時間です。',
  temp: (c: number) => `${c < 0 ? '−' : ''}${Math.abs(Math.round(c)).toLocaleString('ja-JP')}℃`,
  tempRange: (min: string, max: string) => `${min}〜${max}`,
  tempRangeMean: (min: string, max: string, mean: string) => `${min}〜${max}（平均 約${mean}）`,
  gravityValue: (v: number) => `${Number(v.toPrecision(v >= 0.1 ? 3 : 2)).toLocaleString('ja-JP', { maximumFractionDigits: 6 })} m/s²`,
  tempAbout: (c: string) => `約${c}`,
  tempUnknown: 'くわしい気温はまだよく分かっていません。',
  tempEarth: '地球（−89〜57℃、平均15℃）',
  source: '数字は NASA の公開データの概数です。',
}
