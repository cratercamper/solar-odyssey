// components/surface/TimeBar.tsx の文言（日本語）

export const timeBarJa = {
  /** 温度 */
  degrees: (t: number) => `${t}℃`,
  dayInEarthHours: (h: string) => `1日 = 地球の${h}時間`,
  dayInEarthDays: (h: string) => `1日 = 地球の約${h}日`,
  newMoon: '新月',
  fullMoon: '満月',
  firstQuarter: '上弦の月',
  lastQuarter: '下弦の月',
  waxingCrescent: '三日月のころ',
  waningCrescent: '明け方の細い月',
  waxingGibbous: '満月に向かう月',
  waningGibbous: '欠けていく月',
  moonFromEarth: 'いま地球から見た月',
  earthPhase: (earthFull: boolean) => `空の地球は${earthFull ? '満ちて' : '欠けて'}見えます`,
  luxLarge: (lx: number) => `約${Math.round(lx / 10000)}万`,
  luxValue: (lx: number | string) => `約${lx}`,
  brightSummerSun: '真夏の日なた',
  overcastDay: 'くもりの日の外',
  brightRoom: '明るい部屋',
  dusk: '夕方の薄暗さ',
  fullMoonNight: '満月の夜',
  starlightOnly: '星明かりだけ',
  luxUnit: 'ルクス',
  ground: '地表',
  light: '明るさ',
  luxLike: (like: string) => `いまは「${like}」くらい`,
  groundTemp: '地表の温度',
  night: '夜',
  weather: '天気',
  localTime: '現地時刻',
  /** 時間の速さのボタン */
  rate: { pause: '止める', sixMinutes: '1秒=6分', dayPerMinute: '1日を1分で' },
  /** 時刻へ飛ぶボタン */
  jump: { noon: '昼', sunset: '夕方', night: '夜' },
  /** 天体ごとの天気の呼び方：ボタン（自動・荒れ・おだやか） */
  weatherButton: {
    mars: { auto: '自動', storm: '砂嵐', clear: '晴れ' },
    earth: { auto: '自動', storm: '砂嵐', clear: '晴れ' },
    titan: { auto: '自動', storm: '雨', clear: 'やむ' },
  },
  /** 天体ごとの今の天気（強い・弱い・おだやか） */
  weatherNow: {
    mars: { strong: '砂嵐', weak: '砂ぼこり', calm: '晴れ' },
    earth: { strong: '砂嵐', weak: '風が強い', calm: '晴れ' },
    titan: { strong: 'メタンの雨', weak: '霧雨', calm: 'もや' },
  },
}
