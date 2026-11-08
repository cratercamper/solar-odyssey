// ローバーで採集できる岩・試料。天体ごとに、実際にその天体で見つかっている（または、あると考えられている）ものから選んだ。
// 成分はおおよその割合（%）。分析カードの棒グラフにする。

import { ui } from '../i18n'

export type RockSample = {
  id: string
  /** 岩の色（見た目） */
  color: string
  /** つや：0 = ざらざら、1 = つるつる */
  gloss?: number
  /** 丸い（氷・小石） */
  round?: boolean
  comp: [string, number][]
}

/** RockSample の文言（日本語は src/i18n/rockSamples.ja.ts、英語は rockSamples.en.ts） */
export type RockSampleText = {
  name: string
  note: string
}

const MARS: RockSample[] = [
  {
    id: 'mudstone',
    color: '#8e6a55',
    comp: [['SiO₂', 43], ['FeO', 19], ['Al₂O₃', 9], ['MgO', 9], ['CaO', 6], ['clay', 20]],
  },
  {
    id: 'basalt',
    color: '#4b4038',
    comp: [['SiO₂', 46], ['FeO', 19], ['MgO', 9], ['Al₂O₃', 10], ['CaO', 7]],
  },
  {
    id: 'blueberry',
    color: '#3b3b44',
    gloss: 0.5,
    round: true,
    comp: [['Fe₂O₃', 80], ['SiO₂', 10], ['other', 10]],
  },
  {
    id: 'vein',
    color: '#d9d2c3',
    gloss: 0.3,
    comp: [['CaSO₄', 85], ['H₂O', 10], ['other', 5]],
  },
  {
    id: 'meteorite',
    color: '#5d5a58',
    gloss: 0.7,
    comp: [['Fe', 92], ['Ni', 7], ['Co', 1]],
  },
]

const MOON: RockSample[] = [
  {
    id: 'anorthosite',
    color: '#c9c6bf',
    comp: [['SiO₂', 44], ['Al₂O₃', 32], ['CaO', 18], ['FeO', 3], ['MgO', 3]],
  },
  {
    id: 'mare-basalt',
    color: '#4a4846',
    comp: [['SiO₂', 42], ['FeO', 20], ['TiO₂', 8], ['CaO', 10], ['Al₂O₃', 10], ['MgO', 10]],
  },
  {
    id: 'breccia',
    color: '#8b8781',
    comp: [['SiO₂', 45], ['Al₂O₃', 22], ['CaO', 13], ['FeO', 9], ['MgO', 11]],
  },
  {
    id: 'orange-soil',
    color: '#b8743c',
    gloss: 0.6,
    round: true,
    comp: [['SiO₂', 39], ['FeO', 22], ['TiO₂', 9], ['MgO', 15], ['other', 15]],
  },
]

const EARTH: RockSample[] = [
  {
    id: 'sandstone',
    color: '#a8573a',
    comp: [['SiO₂', 85], ['Fe₂O₃', 4], ['Al₂O₃', 6], ['other', 5]],
  },
  {
    id: 'shale',
    color: '#6d5d55',
    comp: [['SiO₂', 58], ['Al₂O₃', 16], ['FeO', 7], ['K₂O', 3], ['other', 16]],
  },
  {
    id: 'quartz',
    color: '#e8e4dc',
    gloss: 0.8,
    comp: [['SiO₂', 99], ['other', 1]],
  },
]

const VENUS: RockSample[] = [
  {
    id: 'venus-basalt',
    color: '#5e4a36',
    comp: [['SiO₂', 46], ['FeO', 9], ['MgO', 11], ['Al₂O₃', 16], ['CaO', 8], ['other', 10]],
  },
]

const MERCURY: RockSample[] = [
  {
    id: 'mercury-crust',
    color: '#6f6a64',
    comp: [['SiO₂', 50], ['MgO', 20], ['S', 3], ['Al₂O₃', 12], ['other', 15]],
  },
]

const IO: RockSample[] = [
  {
    id: 'sulfur',
    color: '#d6c04a',
    gloss: 0.3,
    comp: [['S', 70], ['frost', 20], ['silicates', 10]],
  },
]

const ICY: RockSample[] = [
  {
    id: 'ice',
    color: '#d4dce4',
    gloss: 0.6,
    comp: [['ice', 92], ['salts', 4], ['other', 4]],
  },
  {
    id: 'salt',
    color: '#8a5a3a',
    comp: [['ice', 60], ['salts', 30], ['other', 10]],
  },
]

const TITAN: RockSample[] = [
  {
    id: 'titan-pebble',
    color: '#9a8466',
    round: true,
    comp: [['ice', 80], ['organics', 20]],
  },
]

const ROCKY: RockSample[] = [
  {
    id: 'regolith-rock',
    color: '#6a655f',
    comp: [['SiO₂', 45], ['FeO', 15], ['MgO', 15], ['other', 25]],
  },
]

const ICY_IDS = new Set(['europa', 'ganymede', 'callisto', 'enceladus', 'mimas', 'tethys', 'dione', 'rhea', 'iapetus', 'miranda', 'ariel', 'umbriel', 'titania', 'oberon', 'triton', 'pluto', 'charon'])

export function samplesFor(bodyId: string): RockSample[] {
  if (bodyId === 'mars') return MARS
  if (bodyId === 'moon') return MOON
  if (bodyId === 'earth') return EARTH
  if (bodyId === 'venus') return VENUS
  if (bodyId === 'mercury') return MERCURY
  if (bodyId === 'io') return IO
  if (bodyId === 'titan') return TITAN
  if (ICY_IDS.has(bodyId)) return ICY
  return ROCKY
}

/** 成分の名前：化学式（'SiO₂'）はそのまま、ことばの成分は id（'clay'）で、文言は src/i18n/rockComp */
export const compLabel = (label: string): string => ui().rockComp[label] ?? label
