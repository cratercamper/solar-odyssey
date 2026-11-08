import type { PoiText } from '../components/surface/pois'
import { byId } from './translation'

// components/surface/pois.ts の文言（日本語）

const texts = {
  'mars-buttes': { name: '地層の丘' },
  'mars-boulders': { name: '岩塊の野' },
  'mars-dunes': { name: '黒い砂丘' },
  'mercury-scarp': { name: '断崖' },
  'mercury-crater': { name: '大クレーター' },
  'venus-lava': { name: '溶岩流' },
  'venus-dome': { name: '溶岩ドーム' },
  'venus-tessera': { name: 'テッセラ' },
  'moon-crater': { name: '大クレーター' },
  'moon-rille': { name: 'リル' },
  'moon-scarp': { name: '断崖' },
  'io-lava': { name: '溶岩流' },
  'io-patera': { name: '火山の穴' },
  'europa-ridges': { name: '二重尾根' },
  'europa-chaos': { name: 'カオス地形' },
  'ganymede-crater': { name: '大クレーター' },
  'ganymede-grooves': { name: '溝状地形' },
  'callisto-crater': { name: '大クレーター' },
  'mimas-crater': { name: '大クレーター' },
  'enceladus-ridges': { name: '二重尾根' },
  'enceladus-grooves': { name: '溝状地形' },
  'tethys-crater': { name: '大クレーター' },
  'tethys-scarp': { name: '氷の崖' },
  'dione-scarp': { name: '氷の崖' },
  'dione-crater': { name: '大クレーター' },
  'rhea-crater': { name: '大クレーター' },
  'titan-channel': { name: 'メタンの川' },
  'titan-lakebed': { name: '干上がった湖' },
  'iapetus-crater': { name: '大クレーター' },
  'miranda-scarp': { name: '断崖' },
  'miranda-grooves': { name: '溝状地形' },
  'ariel-scarp': { name: '谷の崖' },
  'ariel-crater': { name: '大クレーター' },
  'umbriel-crater': { name: '大クレーター' },
  'titania-scarp': { name: '谷の崖' },
  'titania-crater': { name: '大クレーター' },
  'oberon-crater': { name: '大クレーター' },
  'proteus-crater': { name: '大クレーター' },
  'triton-ridges': { name: '二重尾根' },
  'pluto-polygons': { name: '氷の多角形' },
  'pluto-chaos': { name: '氷の山塊' },
  'charon-scarp': { name: '谷の崖' },
  'charon-crater': { name: '大クレーター' },
} satisfies Record<string, PoiText>

// 英語の pois.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type PoisJa = typeof texts
export const poisJa: Record<string, PoiText> = byId(texts)
