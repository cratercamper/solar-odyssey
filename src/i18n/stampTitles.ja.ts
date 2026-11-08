import type { TitleText } from '../data/stamps'
import { byId } from './translation'

// data/stamps.ts の文言（日本語）：称号（count：いる数）

/** 天体を count 個集める称号 */
const visit = (count: number) => `天体を${count}つ訪れる`

const texts = {
  rookie: { name: '宇宙の新人', how: visit },
  apprentice: { name: '見習い探検家', how: visit },
  skilled: { name: '一人前の探検家', how: visit },
  veteran: { name: 'ベテラン探検家', how: visit },
  'grand-tour': { name: '太陽系グランドツアー', how: (count: number) => `太陽・惑星・衛星をぜんぶ（${count}）訪れる` },
  rocky: { name: '岩の惑星めぐり', how: () => '水星・金星・地球・火星を訪れる' },
  giants: { name: '巨大惑星めぐり', how: () => '木星・土星・天王星・海王星を訪れる' },
  nearby: { name: '近くの衛星めぐり', how: () => '月と、火星の衛星2つを訪れる' },
  galilean: { name: 'ガリレオ衛星コンプリート', how: () => '木星の4つの衛星（1610年にガリレオが見つけた）を訪れる' },
  'saturn-moons': { name: '土星の衛星めぐり', how: (count: number) => `土星の衛星${count}つを訪れる` },
  'ice-moons': { name: '氷の巨大惑星の衛星めぐり', how: () => '天王星と海王星の衛星をぜんぶ訪れる' },
  far: { name: '最果ての冥王星', how: () => '冥王星とカロンを訪れる' },
  scopes: { name: '望遠鏡ウォッチャー', how: () => 'ハッブルとウェッブ、2つの宇宙望遠鏡を訪れる' },
  mystery: { name: '謎の発見者', how: () => 'どこかに浮かぶ、見たことのない船を見つける' },
  colonist: { name: 'コロニー訪問者', how: () => 'L5スペースコロニーを訪れる' },
  scholar: { name: '博士の卵', how: (count: number) => `航海日誌のクイズに${count}問正解する` },
  professor: { name: '太陽系博士', how: (count: number) => `航海日誌のクイズに、太陽・惑星・衛星ぜんぶ（${count}）正解する` },
} satisfies Record<string, TitleText>

// 英語の stampTitles.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type StampTitlesJa = typeof texts
export const stampTitlesJa: Record<string, TitleText> = byId(texts)
