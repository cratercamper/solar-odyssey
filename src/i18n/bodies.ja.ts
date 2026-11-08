import type { PlanetText, MoonText } from '../data/bodies'
import { byId } from './translation'

// data/bodies.ts の文言（日本語）

const texts = {
  sun: { name: '太陽' },
  mercury: { name: '水星' },
  venus: { name: '金星' },
  earth: { name: '地球' },
  moon: { name: '月' },
  mars: { name: '火星' },
  phobos: { name: 'フォボス' },
  deimos: { name: 'ダイモス' },
  jupiter: { name: '木星' },
  io: { name: 'イオ' },
  europa: { name: 'エウロパ' },
  ganymede: { name: 'ガニメデ' },
  callisto: { name: 'カリスト' },
  saturn: { name: '土星' },
  mimas: { name: 'ミマス' },
  enceladus: { name: 'エンケラドゥス' },
  tethys: { name: 'テティス' },
  dione: { name: 'ディオネ' },
  rhea: { name: 'レア' },
  titan: { name: 'タイタン' },
  iapetus: { name: 'イアペトゥス' },
  uranus: { name: '天王星' },
  miranda: { name: 'ミランダ' },
  ariel: { name: 'アリエル' },
  umbriel: { name: 'ウンブリエル' },
  titania: { name: 'ティタニア' },
  oberon: { name: 'オベロン' },
  neptune: { name: '海王星' },
  proteus: { name: 'プロテウス' },
  triton: { name: 'トリトン' },
  pluto: { name: '冥王星' },
  charon: { name: 'カロン' },
} satisfies Record<string, PlanetText | MoonText>

// 英語の bodies.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type BodiesJa = typeof texts
export const bodiesJa: Record<string, PlanetText | MoonText> = byId(texts)
