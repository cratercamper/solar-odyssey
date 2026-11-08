// state/quiz.ts の文言（日本語）：天体のデータから作る「くらべる」問題と、点数の称号。
// name などは天体の名前、数（文字列のもの）は state/quiz.ts が書式を整えたもの

export const quizJa = {
  biggest: {
    question: 'この中で、いちばん大きい惑星は？',
    explanation: (name: string, diameterKm: string, timesEarth: string) => `${name}の直径は約${diameterKm}km。地球の約${timesEarth}倍です。`,
  },
  farthest: {
    question: 'この中で、太陽からいちばん遠い惑星は？',
    explanation: (name: string, au: string, sunlight: string) => `${name}は太陽から地球の約${au}倍の距離にあり、太陽の光が届くのに${sunlight}かかります。`,
  },
  longestYear: {
    question: 'この中で、太陽のまわりを1周するのにいちばん時間がかかる惑星は？',
    explanation: (name: string, year: string) => `${name}の1年（太陽を1周する時間）は${year}。太陽から遠いほど、ゆっくり大回りします。`,
  },
  shortestDay: {
    question: 'この中で、1回の自転（1日）がいちばん短い惑星は？',
    explanation: (name: string, spin: string) => `${name}は${spin}で1回自転します。木星や土星のような大きなガスの惑星は、とても速く回っています。`,
  },
  moonOf: {
    question: (moon: string) => `${moon}は、どの天体のまわりを回る衛星？`,
    /** backwards：ほかの衛星と逆向きに回る */
    explanation: (moon: string, parent: string, period: string, backwards: boolean) => `${moon}は${parent}の衛星で、${period}で${parent}を1周します${backwards ? '（ほかの衛星と逆向き）' : ''}。`,
  },
  /** 時間（年・日・時間のどれで書くかは state/quiz.ts が選ぶ） */
  aboutYears: (n: string) => `約${n}年`,
  aboutDays: (n: string) => `約${n}日`,
  aboutHours: (n: string) => `約${n}時間`,
  /** 太陽の光が届く時間 */
  aboutMinutes: (minutes: number) => `約${minutes}分`,
  aboutHoursMinutes: (hours: number, minutes: number) => `約${hours}時間${minutes ? `${minutes}分` : ''}`,
  /** 点数に応じた称号 */
  title: {
    master: '太陽系マスター',
    veteran: 'ベテラン航海士',
    skilled: '一人前の航海士',
    trainee: '見習い航海士',
  },
}
