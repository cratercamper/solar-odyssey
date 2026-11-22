// SF の「コロニー経営」：開拓で完成させたコロニー（1 号基の対になる 2 本目の円筒）を育てる遊び（数と決まりだけ。動きは state/colony.ts）。
// 区画（住宅・農場・工場・公園・発電・水）を開拓の資源で建て、税と方針を決めると、時間とともに人口と満足度が動く。
// 時間はアプリを閉じているあいだも進む（戻ったときに、決まった上限までまとめて進める）。
// どの数も「目標の値へ少しずつ近づく」形なので、放っておいても壊れない（人口は下限で止まり、予算は 0 で止まる）。

import { NONE, type Amounts } from './pioneer'

/** コロニーの 1 時間（現実のミリ秒）。1 日は 4 分 */
export const HOUR_MS = 10_000
export const DAY_HOURS = 24
/** 閉じていたあいだに進める上限（コロニーの時間で 7 日） */
export const OFFLINE_MAX_HOURS = 7 * DAY_HOURS
/** グラフの点を取る間隔（時間）と、残す数（14 日ぶん） */
export const SAMPLE_HOURS = 6
export const HISTORY_MAX = 56

export type ZoneId = 'housing' | 'farm' | 'factory' | 'park' | 'power' | 'water'
export const ZONES: readonly ZoneId[] = ['housing', 'farm', 'factory', 'park', 'power', 'water']
export type Zones = Record<ZoneId, number>

/** 区画を建てる費用（開拓の倉庫から払う） */
export const ZONE_COST: Record<ZoneId, Amounts> = {
  housing: { metal: 20, ice: 10, gas: 0 },
  farm: { metal: 5, ice: 20, gas: 0 },
  factory: { metal: 30, ice: 0, gas: 10 },
  park: { metal: 0, ice: 15, gas: 0 },
  power: { metal: 15, ice: 0, gas: 15 },
  water: { metal: 5, ice: 25, gas: 0 },
}

/** 区画の広さ（はじめの数と、研究で増える数） */
export const LAND = 14
export const LAND_PLUS = 4

export type TaxLevel = 0 | 1 | 2
export const TAX_LEVELS: readonly TaxLevel[] = [0, 1, 2]
/** 税：1 人 1 時間あたりの収入と、満足度への響き */
export const TAX = [
  { rate: 0.03, happy: 8 },
  { rate: 0.06, happy: 0 },
  { rate: 0.1, happy: -14 },
] as const

export type PolicyId = 'balance' | 'growth' | 'green' | 'industry'
export const POLICIES: readonly PolicyId[] = ['balance', 'growth', 'green', 'industry']

export type ResearchId = 'hydroponics' | 'mirrors' | 'recycling' | 'highrise' | 'automation' | 'culture' | 'terrace' | 'fusion'
export type ResearchDef = { id: ResearchId; cost: number; hours: number; needs: readonly ResearchId[]; col: number; row: number }
/** 研究の木（col・row は画面の上の位置。needs の研究が終わると始められる） */
export const RESEARCH: readonly ResearchDef[] = [
  { id: 'hydroponics', cost: 120, hours: 8, needs: [], col: 0, row: 0 },
  { id: 'mirrors', cost: 120, hours: 8, needs: [], col: 0, row: 1 },
  { id: 'culture', cost: 160, hours: 10, needs: [], col: 0, row: 2 },
  { id: 'recycling', cost: 180, hours: 12, needs: ['hydroponics'], col: 1, row: 0 },
  { id: 'highrise', cost: 220, hours: 14, needs: ['mirrors'], col: 1, row: 1 },
  { id: 'automation', cost: 240, hours: 14, needs: ['mirrors'], col: 1, row: 2 },
  { id: 'terrace', cost: 320, hours: 20, needs: ['highrise', 'recycling'], col: 2, row: 0 },
  { id: 'fusion', cost: 440, hours: 24, needs: ['automation'], col: 2, row: 2 },
]
export const researchDef = (id: ResearchId) => RESEARCH.find((r) => r.id === id)!

export type Sample = { h: number; pop: number; happy: number; food: number; water: number; power: number; credits: number }

export type ColonySave = {
  v: 1
  /** 経営を始めたか（コロニーが完成したあと、端末から始める） */
  started: boolean
  /** 最後に時間を進めた現実の時刻（ミリ秒） */
  at: number
  /** 始めてからのコロニーの時間（時間） */
  hour: number
  zones: Zones
  pop: number
  happy: number
  credits: number
  tax: TaxLevel
  policy: PolicyId
  research: ResearchId[]
  /** いま研究しているもの（残りの時間） */
  studying: { id: ResearchId; left: number } | null
  history: Sample[]
  /** 工場が作って、まだ開拓の倉庫へ送っていない金属（端数） */
  made: number
}

export const NO_ZONES: Zones = { housing: 0, farm: 0, factory: 0, park: 0, power: 0, water: 0 }
export const START_ZONES: Zones = { housing: 2, farm: 1, factory: 1, park: 0, power: 1, water: 1 }

export const NEW_COLONY: ColonySave = {
  v: 1,
  started: false,
  at: 0,
  hour: 0,
  zones: { ...NO_ZONES },
  pop: 0,
  happy: 0,
  credits: 0,
  tax: 1,
  policy: 'balance',
  research: [],
  studying: null,
  history: [],
  made: 0,
}

/** 経営を始めたときの形（小さな町から） */
export function startColony(now: number): ColonySave {
  const s: ColonySave = { ...NEW_COLONY, started: true, at: now, zones: { ...START_ZONES }, pop: 80, happy: 60, credits: 60 }
  return { ...s, history: [sample(s)] }
}

const has = (s: Pick<ColonySave, 'research'>, id: ResearchId) => s.research.includes(id)
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export const landSize = (s: Pick<ColonySave, 'research'>) => LAND + (has(s, 'terrace') ? LAND_PLUS : 0)
export const landUsed = (z: Zones) => ZONES.reduce((n, id) => n + z[id], 0)

/** いまの町の数（作る量・使う量・仕事の数・満足度の目標）。画面も同じ数を見せる */
export function economy(s: Pick<ColonySave, 'zones' | 'pop' | 'tax' | 'policy' | 'research'>) {
  const z = s.zones
  const pop = s.pop
  const capacity = z.housing * 120 * (has(s, 'highrise') ? 1.35 : 1)
  const food = z.farm * 110 * (has(s, 'hydroponics') ? 1.3 : 1)
  const foodNeed = pop
  const water = z.water * 160
  const waterNeed = (pop + z.farm * 25) * (has(s, 'recycling') ? 0.7 : 1)
  const power = z.power * 150 * (has(s, 'mirrors') ? 1.3 : 1) * (has(s, 'fusion') ? 1.6 : 1)
  const powerNeed = pop * 0.5 + z.factory * 55 + z.water * 12 + z.farm * 8
  const jobs = z.factory * 90 + z.farm * 30 + z.park * 10 + z.power * 15 + z.water * 15
  const ratio = (have: number, need: number) => (need <= 0 ? 1 : clamp(have / need, 0, 1))
  const rFood = ratio(food, foodNeed)
  const rWater = ratio(water, waterNeed)
  const rPower = ratio(power, powerNeed)
  const jobless = pop > 0 ? clamp((pop - jobs) / pop, 0, 1) : 0
  const park = Math.min(24, z.park * 6) * (has(s, 'culture') ? 1.5 : 1)
  const policyHappy = { balance: 0, growth: -4, green: 8, industry: -6 }[s.policy]
  // 満足度の目標：もとは 55。公園・税・方針で上下し、足りない物と仕事のなさで下がる
  const parts = {
    base: 55,
    park,
    tax: TAX[s.tax].happy,
    policy: policyHappy,
    food: -(1 - rFood) * 45,
    water: -(1 - rWater) * 45,
    power: -(1 - rPower) * 30,
    jobs: -jobless * 25,
  }
  const happyTarget = clamp(Object.values(parts).reduce((a, b) => a + b, 0), 0, 100)
  // 人口の目標：住める数 × 満足度（3〜10 割）× 食べ物と水の足り具合
  const popTarget = Math.max(MIN_POP, capacity * clamp(happyTarget / 85, 0.3, 1) * Math.min(rFood, rWater))
  // 工場の働き（電気が足りないと落ちる）
  const work = z.factory * rPower * (has(s, 'automation') ? 1.4 : 1) * (s.policy === 'industry' ? 1.5 : s.policy === 'green' ? 0.7 : 1)
  const income = pop * TAX[s.tax].rate * (0.5 + 0.5 * Math.min(1, jobs / Math.max(1, pop))) + work * 2.5
  const upkeep = landUsed(z) * 0.35
  return { capacity, food, foodNeed, water, waterNeed, power, powerNeed, jobs, rFood, rWater, rPower, jobless, parts, happyTarget, popTarget, work, income, upkeep }
}
export type Economy = ReturnType<typeof economy>

/** 人口の下限（どんなに暮らしにくくても、町を守る人は残る） */
export const MIN_POP = 20
/** 工場 1 つが 1 日に作る金属 */
export const FACTORY_METAL_PER_DAY = 6

export function sample(s: ColonySave): Sample {
  const e = economy(s)
  const pct = (x: number) => Math.round(x * 100)
  return { h: s.hour, pop: Math.round(s.pop), happy: Math.round(s.happy), food: pct(e.rFood), water: pct(e.rWater), power: pct(e.rPower), credits: Math.floor(s.credits) }
}

/** 1 時間すすめる。研究が終わったら、その id を返す */
export function stepHour(s: ColonySave): { s: ColonySave; finished: ResearchId | null; metal: number } {
  const e = economy(s)
  const growth = s.policy === 'growth' ? 0.06 : 0.035
  const pop = s.pop + (e.popTarget - s.pop) * (e.popTarget > s.pop ? growth : 0.05)
  const happy = s.happy + (e.happyTarget - s.happy) * 0.08
  const credits = Math.max(0, s.credits + e.income - e.upkeep)
  let made = s.made + (e.work * FACTORY_METAL_PER_DAY) / DAY_HOURS
  const metal = Math.floor(made)
  made -= metal
  let studying = s.studying
  let research = s.research
  let finished: ResearchId | null = null
  if (studying) {
    const left = studying.left - 1
    if (left <= 0) {
      finished = studying.id
      research = [...research, studying.id]
      studying = null
    } else studying = { ...studying, left }
  }
  const hour = s.hour + 1
  let next: ColonySave = { ...s, hour, pop: Math.max(MIN_POP, pop), happy: clamp(happy, 0, 100), credits, made, studying, research }
  if (hour % SAMPLE_HOURS === 0) next = { ...next, history: [...s.history, sample(next)].slice(-HISTORY_MAX) }
  return { s: next, finished, metal }
}

/** 現実の時刻 now まで進める（上限つき）。進めた時間・終わった研究・作った金属を返す */
export function advance(s: ColonySave, now: number, max = OFFLINE_MAX_HOURS) {
  if (!s.started) return { s, hours: 0, finished: [] as ResearchId[], metal: 0 }
  const due = Math.floor((now - s.at) / HOUR_MS)
  if (due <= 0) {
    // 時計が戻った（端末の時刻を変えた）ときは、いまに合わせ直すだけ
    return { s: now < s.at ? { ...s, at: now } : s, hours: 0, finished: [] as ResearchId[], metal: 0 }
  }
  const hours = Math.min(due, max)
  let cur = s
  const finished: ResearchId[] = []
  let metal = 0
  for (let i = 0; i < hours; i++) {
    const r = stepHour(cur)
    cur = r.s
    if (r.finished) finished.push(r.finished)
    metal += r.metal
  }
  // 上限を超えたぶんは捨てる（時計は now に合わせる）
  const at = due > max ? now : s.at + hours * HOUR_MS
  return { s: { ...cur, at }, hours, finished, metal }
}

/** 区画を建てられるか（土地と予算でなく、開拓の倉庫の資源で建てる） */
export const canBuild = (s: ColonySave, id: ZoneId, store: Amounts) =>
  s.started && landUsed(s.zones) < landSize(s) && (['metal', 'ice', 'gas'] as const).every((r) => store[r] >= ZONE_COST[id][r])

export function buildZone(s: ColonySave, id: ZoneId): ColonySave {
  return { ...s, zones: { ...s.zones, [id]: s.zones[id] + 1 } }
}
/** 区画をこわす（資源は戻らない。建て直しはできる） */
export function removeZone(s: ColonySave, id: ZoneId): ColonySave {
  if (s.zones[id] <= 0) return s
  return { ...s, zones: { ...s.zones, [id]: s.zones[id] - 1 } }
}

export type ResearchState = 'done' | 'studying' | 'ready' | 'locked'
export function researchState(s: Pick<ColonySave, 'research' | 'studying'>, id: ResearchId): ResearchState {
  if (s.research.includes(id)) return 'done'
  if (s.studying?.id === id) return 'studying'
  return researchDef(id).needs.every((n) => s.research.includes(n)) ? 'ready' : 'locked'
}
export const canStudy = (s: ColonySave, id: ResearchId) => s.started && !s.studying && researchState(s, id) === 'ready' && s.credits >= researchDef(id).cost

export function startStudy(s: ColonySave, id: ResearchId): ColonySave {
  if (!canStudy(s, id)) return s
  const d = researchDef(id)
  return { ...s, credits: s.credits - d.cost, studying: { id, left: d.hours } }
}

/** 住まいのうち人が住んでいる割合（歩く場面の家の灯りに使う） */
export const occupancy = (s: Pick<ColonySave, 'zones' | 'pop' | 'research'>) => {
  const cap = economy({ ...s, tax: 1, policy: 'balance' }).capacity
  return cap > 0 ? clamp(s.pop / cap, 0, 1) : 0
}

const isNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x)
const isZones = (z: unknown): z is Zones => !!z && typeof z === 'object' && ZONES.every((id) => isNum((z as Zones)[id]) && (z as Zones)[id] >= 0)
const RESEARCH_IDS = RESEARCH.map((r) => r.id) as string[]
const SAMPLE_KEYS = ['h', 'pop', 'happy', 'food', 'water', 'power', 'credits'] as const
const isSample = (x: unknown) => !!x && typeof x === 'object' && SAMPLE_KEYS.every((k) => isNum((x as Sample)[k]))

/** 読み込んだセーブが使える形か */
export function checkColony(v: unknown): v is ColonySave {
  if (!v || typeof v !== 'object') return false
  const s = v as ColonySave
  return (
    s.v === 1 &&
    typeof s.started === 'boolean' &&
    isNum(s.at) &&
    Number.isInteger(s.hour) &&
    s.hour >= 0 &&
    isZones(s.zones) &&
    isNum(s.pop) &&
    isNum(s.happy) &&
    isNum(s.credits) &&
    (TAX_LEVELS as readonly number[]).includes(s.tax) &&
    (POLICIES as readonly string[]).includes(s.policy) &&
    Array.isArray(s.research) &&
    s.research.every((id) => RESEARCH_IDS.includes(id)) &&
    (s.studying === null || (!!s.studying && RESEARCH_IDS.includes(s.studying.id) && isNum(s.studying.left))) &&
    Array.isArray(s.history) &&
    s.history.length <= HISTORY_MAX &&
    s.history.every(isSample) &&
    isNum(s.made)
  )
}

/** 費用の表示用（0 の資源を省く） */
export const costOf = (id: ZoneId): Amounts => ({ ...NONE, ...ZONE_COST[id] })
