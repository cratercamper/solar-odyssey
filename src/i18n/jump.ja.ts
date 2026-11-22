// 重力ジャンプ（components/surface/GravityJump.tsx と、地表の画面のカード）の文言（日本語）

/** 高さ（m）を読みやすく */
const m = (h: number) => (h >= 100 ? `${Math.round(h).toLocaleString('ja-JP')} m` : h >= 10 ? `${h.toFixed(0)} m` : `${h.toFixed(1)} m`)
/** 時間（秒）を読みやすく */
const time = (s: number) => (s < 60 ? `${s.toFixed(1)}秒` : s < 3600 ? `${Math.round(s / 60)}分` : `${(s / 3600).toFixed(1)}時間`)

export const jumpJa = {
  button: '🦘 ジャンプしてみる',
  buttonTip: '地球で50cm跳べる人が、ここで同じ力で跳ぶと？',
  again: 'もう一度',
  close: '閉じる',
  /** 3D の名札 */
  you: 'ここ',
  earth: '地球',
  height: m,
  /** 跳んでいるあいだ */
  jumping: '同じ力で、せーの！',
  fastForward: (x: number) => `${x}倍の早送り`,
  /** 着地したあと */
  result: (h: number, x: number) => (x < 1.15 ? `高さ ${m(h)}。地球とほとんど同じ` : `高さ ${m(h)}。地球の ${x >= 10 ? Math.round(x).toLocaleString('ja-JP') : x.toFixed(1)}倍！`),
  airtime: (s: number, x: number) => (x < 1.15 ? `空中にいた時間 ${time(s)}` : `空中にいた時間 ${time(s)}（地球の${x >= 10 ? Math.round(x).toLocaleString('ja-JP') : x.toFixed(1)}倍）`),
  earthJumps: (n: number) => (n <= 1 ? '' : `そのあいだに、地球なら${n.toLocaleString('ja-JP')}回ジャンプできます`),
  note: '重力が弱いほど、同じ力で高く、長く跳べます。',
  m,
  time,
}
