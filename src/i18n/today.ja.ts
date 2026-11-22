// ui/TodayPanel.tsx の文言（日本語）。今日の宇宙：今日の月の形、今夜見える惑星、探査機の今

import type { MoonPhaseName } from '../data/today'

const oku = (km: number) => (km >= 1e8 ? `約${Number((km / 1e8).toPrecision(km >= 1e9 ? 3 : 2))}億km` : `約${Number((km / 1e4).toPrecision(2)).toLocaleString('ja-JP')}万km`)
const light = (sec: number) => (sec < 60 ? `約${Math.round(sec)}秒` : sec < 3600 ? `約${Math.round(sec / 60)}分` : `約${Number((sec / 3600).toPrecision(2))}時間`)

export const todayJa = {
  title: '今日の宇宙',
  navButton: '今日の宇宙',
  close: '閉じる',
  date: (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`,
  moonTitle: '今日の月',
  phase: {
    new: '新月',
    waxingCrescent: '三日月のころ（満ちていく）',
    firstQuarter: '上弦の月（右半分）',
    waxingGibbous: '満月に近づく月',
    full: '満月',
    waningGibbous: '欠けはじめた月',
    lastQuarter: '下弦の月（左半分）',
    waningCrescent: '明け方の細い月',
  } satisfies Record<MoonPhaseName, string>,
  moonAge: (age: number, lit: number) => `月齢 約${age.toFixed(1)}、光って見えるのは約${Math.round(lit * 100)}%`,
  moonWhen: {
    new: '太陽と同じ方向にあるので、今日はほとんど見えません。',
    waxingCrescent: '夕方、太陽が沈んだあとの西の空に見えます。',
    firstQuarter: '夕方に南の空に見え、夜中に沈みます。',
    waxingGibbous: '夕方から夜中すぎまで見えます。',
    full: '夕方に東から昇り、一晩じゅう見えます。',
    waningGibbous: '夜になってから昇り、明け方まで見えます。',
    lastQuarter: '夜中に昇り、明け方に南の空に見えます。',
    waningCrescent: '明け方、日の出前の東の空に見えます。',
  } satisfies Record<MoonPhaseName, string>,
  moonNote: '形の向きは日本など北半球から見たものです。',
  planetsTitle: '今夜見える惑星',
  planetsNote: '目で見える5つの惑星です。天王星と海王星は望遠鏡がいります。',
  evening: '夕方、西の空',
  morning: '明け方、東の空',
  allNight: '一晩じゅう',
  eveningLate: '夕方から夜',
  morningEarly: '夜中から明け方',
  hidden: '太陽の近くにあって見えにくい',
  fromEarth: (km: number, sec: number) => `地球から${oku(km)}（光で${light(sec)}）`,
  probesTitle: '探査機の今',
  probeNow: (km: number, hours: number) => `太陽から${oku(km)}。電波が届くのに約${Number(hours.toPrecision(2))}時間`,
  watchJourney: '旅を見る',
  earthTitle: '今日の地球と太陽',
  earthSun: (km: number) => `太陽まで${oku(km)}。`,
  earthNear: '1月はじめにいちばん近く、7月はじめにいちばん遠くなります。季節は距離ではなく、地軸の傾きで決まります。',
  goThere: '行く',
  source: '位置は日付から計算したおおよその値です（月の形は半日ほどずれることがあります）。',
}
