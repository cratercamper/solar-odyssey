import { PLANETS } from './bodies'

// キャンペーン「博士の探査隊」（第1部）の決まりごと。文章は src/i18n/campaign.ja.ts / campaign.en.ts。
// cratercamper さんの案（2026-11-13）：はじめは行ける星をしぼり、子どもにもわかる目標を一つ出す。
// その星で岩（試料）を集めると、次の星へのワープと着陸が開く。月 → 火星 → 金星・水星 → 木星の衛星。
// お話（2026-11-15）：ミナセ博士が無人の着陸船とローバーを先に送り、「ふしぎな信号」が出た星へ乗りこんでいく。

/** 目標：その天体でローバーの試料を count 個集める（同じ種類でも数える） */
export type CampaignGoal = { body: string; count: number }

export type CampaignStage = {
  /** 文言の id（i18n の campaign.stages） */
  id: string
  /** この段階で新しく行けるようになる天体（前の段階のぶんに足す） */
  opens: string[]
  /** この段階の目標（全部そろうと次の段階へ） */
  goals: CampaignGoal[]
}

export const CAMPAIGN_STAGES: CampaignStage[] = [
  { id: 'moon', opens: ['moon'], goals: [{ body: 'moon', count: 3 }] },
  { id: 'mars', opens: ['mars', 'phobos', 'deimos'], goals: [{ body: 'mars', count: 3 }] },
  { id: 'inner', opens: ['venus', 'mercury'], goals: [{ body: 'venus', count: 2 }, { body: 'mercury', count: 2 }] },
  { id: 'jupiter', opens: ['jupiter', 'io', 'europa', 'ganymede', 'callisto'], goals: [{ body: 'europa', count: 3 }] },
]

/** いつでも行ける天体（ふるさと） */
const ALWAYS_OPEN = new Set(['earth'])

/** 鍵をかける天体：惑星・準惑星と、その衛星（太陽・望遠鏡・SF の構造物などはかけない） */
const LOCKABLE = new Set(PLANETS.flatMap((p) => [p.id, ...p.moons.map((m) => m.id)]))

/** stage 番目の段階までに開いている天体。stage が段階の数なら、第1部をクリアした（全部の段階のぶん） */
export function openBodies(stage: number): Set<string> {
  const open = new Set(ALWAYS_OPEN)
  for (let i = 0; i <= Math.min(stage, CAMPAIGN_STAGES.length - 1); i++) for (const id of CAMPAIGN_STAGES[i].opens) open.add(id)
  return open
}

/** キャンペーンで、その天体にまだ行けないか */
export const isLockedBody = (id: string, stage: number) => LOCKABLE.has(id) && !openBodies(stage).has(id)
