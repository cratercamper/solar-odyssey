// SF の「開拓」：資源を集めて、L5 の建設中のコロニーを完成させる遊び（数と決まりだけ。動きは state/pioneer.ts）。
// 資源は 3 つ：金属（小惑星帯の石質・金属の岩）、氷（水を含む炭素質の岩）、ガス（木星の雲のすぐ上をかすめて集める）。
// 1 回の往復は約 3 分。積める量 60 の船で約 8 往復、25 分ほどで 1 基目が完成する（設計メモ 2026-11-20）。

import type { RockType } from '../state/registry'
import type { ShipId } from './ships'

/** 小惑星帯の採掘場の目印（ワープの行き先として天体に登録する） */
export const FIELD_ID = 'pioneer-field'

export type Resource = 'metal' | 'ice' | 'gas'
export const RESOURCES: readonly Resource[] = ['metal', 'ice', 'gas']

export type Amounts = Record<Resource, number>
export const NONE: Amounts = { metal: 0, ice: 0, gas: 0 }

/** 建設の段階（順に進む）。cost を倉庫から払うと 1 段進む */
export type StageId = 'frame' | 'hull' | 'mirror' | 'spin' | 'air'
export const STAGES: readonly { id: StageId; cost: Amounts }[] = [
  { id: 'frame', cost: { metal: 60, ice: 0, gas: 0 } },
  { id: 'hull', cost: { metal: 90, ice: 0, gas: 0 } },
  { id: 'mirror', cost: { metal: 50, ice: 0, gas: 30 } },
  { id: 'spin', cost: { metal: 0, ice: 0, gas: 60 } },
  { id: 'air', cost: { metal: 40, ice: 120, gas: 0 } },
]
export const STAGE_COUNT = STAGES.length

/** 船の得意（どの船でも遊べるが、船ごとに 1 つ得意なことがある） */
export type Strength = 'hold' | 'magnet' | 'scoop' | 'yield' | 'scan'
export type ShipTrait = { strength: Strength; hold: number; magnet: number; scoop: number; yield: number; scan: number }
export const DEFAULT_HOLD = 60
const BASE: Omit<ShipTrait, 'strength'> = { hold: DEFAULT_HOLD, magnet: 1, scoop: 1, yield: 1, scan: 1 }
/** 輸送船ハコブネと母艦アルカディアは多く積める。調査船は岩を遠くから見分け、光帆の船は軽くてガスを速く集める…… */
const TRAITS: Record<ShipId, Partial<ShipTrait> & { strength: Strength }> = {
  sv01: { strength: 'scan', scan: 1.6 },
  heron: { strength: 'magnet', magnet: 1.6 },
  sorakaze: { strength: 'scoop', scoop: 1.6 },
  hakobune: { strength: 'hold', hold: 150 },
  meguri: { strength: 'yield', yield: 1.3 },
  amatsu: { strength: 'hold', hold: 90 },
  arcadia: { strength: 'hold', hold: 150 },
}
export const shipTrait = (shipId: string): ShipTrait => ({ ...BASE, ...(TRAITS[shipId as ShipId] ?? { strength: 'hold' }) })
export const TRAIT_SHIPS = Object.keys(TRAITS) as ShipId[]

/** 珍しい岩：帯の岩のおよそ RARE_EVERY 個に 1 個。種類は岩の種類で決まる。砕くとたくさん取れて、記録に残る */
export type RareId = 'crystal' | 'olivine' | 'platinum'
export const RARE_IDS: readonly RareId[] = ['crystal', 'olivine', 'platinum']
export const RARE_BY_TYPE: Record<RockType, RareId> = { 0: 'crystal', 1: 'olivine', 2: 'platinum' }
export const RARE_BONUS: Record<RareId, { resource: Resource; amount: number }> = {
  crystal: { resource: 'ice', amount: 40 },
  olivine: { resource: 'metal', amount: 30 },
  platinum: { resource: 'metal', amount: 50 },
}
export const RARE_EVERY = 40
export const NO_RARE: Record<RareId, number> = { crystal: 0, olivine: 0, platinum: 0 }

/** 決まった数から、ばらけた数を作る（同じ岩はいつも同じ答え） */
function mix(n: number) {
  let x = n | 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  return (x ^ (x >>> 16)) >>> 0
}
/** 文字から数を作る（日付で珍しい岩の場所を変えるため） */
export function hashText(text: string) {
  let h = 0
  for (let i = 0; i < text.length; i++) h = Math.imul(h, 31) + text.charCodeAt(i)
  return mix(h)
}
/** その岩（何番目の形の何番目）は珍しいか。salt（日付から作る数）で、日ごとに珍しい岩が入れ替わる */
export const isRare = (shape: number, index: number, salt = 0) => mix((shape * 7919 + index + 1) ^ salt) % RARE_EVERY === 0

/** 今日の依頼：日付で決まる（同じ日なら誰でも同じ依頼）。果たすと倉庫にごほうび */
export type DailyKind = 'metal' | 'ice' | 'gas' | 'bigTrip' | 'trips' | 'rare'
export type DailyDef = { kind: DailyKind; target: number; reward: Amounts }
export type DailyState = { day: string; progress: number; done: boolean }
const DAILIES: readonly DailyDef[] = [
  { kind: 'metal', target: 80, reward: { metal: 0, ice: 20, gas: 20 } },
  { kind: 'ice', target: 50, reward: { metal: 30, ice: 0, gas: 10 } },
  { kind: 'gas', target: 40, reward: { metal: 30, ice: 10, gas: 0 } },
  { kind: 'bigTrip', target: 50, reward: { metal: 20, ice: 20, gas: 10 } },
  { kind: 'trips', target: 3, reward: { metal: 25, ice: 15, gas: 15 } },
  { kind: 'rare', target: 1, reward: { metal: 30, ice: 20, gas: 20 } },
]
/** その日の依頼（日付の文字 YYYY-MM-DD から） */
export function dailyFor(day: string): DailyDef {
  return DAILIES[hashText(day) % DAILIES.length]
}
/** 遊んでいる人の、その土地の今日 */
export function today(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
/** 依頼の進み：納品・珍しい岩のたびに足す（bigTrip だけは 1 回の量のいちばん大きいもの） */
export function dailyProgress(def: DailyDef, progress: number, e: { delivered?: Amounts; rare?: boolean }): number {
  if (def.kind === 'rare') return progress + (e.rare ? 1 : 0)
  if (!e.delivered) return progress
  if (def.kind === 'trips') return progress + 1
  if (def.kind === 'bigTrip') return Math.max(progress, total(e.delivered))
  return progress + e.delivered[def.kind]
}

/** 船の改造（天の湊の倉庫の資源で買う。3 段まで） */
export type UpgradeId = 'hold' | 'magnet' | 'scoop'
export const UPGRADE_IDS: readonly UpgradeId[] = ['hold', 'magnet', 'scoop']
export const MAX_LEVEL = 3
export type Upgrades = Record<UpgradeId, number>
export const NO_UPGRADES: Upgrades = { hold: 0, magnet: 0, scoop: 0 }
export const UPGRADE_COST: Record<UpgradeId, readonly Amounts[]> = {
  hold: [
    { metal: 30, ice: 0, gas: 0 },
    { metal: 60, ice: 0, gas: 0 },
    { metal: 90, ice: 20, gas: 0 },
  ],
  magnet: [
    { metal: 20, ice: 10, gas: 0 },
    { metal: 40, ice: 20, gas: 0 },
    { metal: 60, ice: 30, gas: 10 },
  ],
  scoop: [
    { metal: 20, ice: 0, gas: 10 },
    { metal: 40, ice: 0, gas: 20 },
    { metal: 60, ice: 10, gas: 30 },
  ],
}
/** 次の段の値段（もう最後の段なら null） */
export const upgradeCost = (id: UpgradeId, level: number) => UPGRADE_COST[id][level] ?? null

/** 積める量：船の量に、改造 1 段ごとに 3 分の 1 ずつ足す */
export const holdCapacity = (shipId: string, level = 0) => {
  const base = shipTrait(shipId).hold
  return base + Math.round(base / 3) * level
}
/** かけらを吸い寄せる距離の倍率 */
export const magnetFactor = (shipId: string, level = 0) => shipTrait(shipId).magnet * (1 + 0.4 * level)
/** ガスのたまる速さの倍率 */
export const scoopFactor = (shipId: string, level = 0) => shipTrait(shipId).scoop * (1 + 0.3 * level)
/** 改造の効き目（画面の「60 → 80」に使う） */
export function upgradeValue(id: UpgradeId, shipId: string, level: number): number {
  if (id === 'hold') return holdCapacity(shipId, level)
  if (id === 'magnet') return magnetFactor(shipId, level)
  return scoopFactor(shipId, level)
}

/**
 * 砕いた岩 1 個から出る資源。size は岩の大きさ（表示単位、0.04〜0.44）。
 * 炭素質は水を含む鉱物が多いので氷、石質は少しの金属、金属の岩はたくさんの金属
 */
export function rockYield(type: RockType, size: number): { resource: Resource; amount: number } {
  const big = 1 + Math.min(Math.max(size, 0), 0.5) * 4
  if (type === 0) return { resource: 'ice', amount: Math.round(3 * big) }
  if (type === 1) return { resource: 'metal', amount: Math.round(3 * big) }
  return { resource: 'metal', amount: Math.round(8 * big) }
}

/** ガス集め：雲の上（1気圧）からの高さが、半径に対してこの範囲のあいだだけたまる */
export const GAS_BAND = { low: -0.05, high: 0.03 }
/** これより深いと熱くて集められない（案内を出す） */
export const GAS_TOO_DEEP = -0.05
/** 1 秒にたまる量（最高速度の GAS_MIN_SPEED 倍以上で飛んでいるとき） */
export const GAS_RATE = 5
export const GAS_MIN_SPEED = 0.05

export const total = (a: Amounts) => a.metal + a.ice + a.gas

/** 積み荷に足す（積める量を超える分は入らない）。入った量を返す */
export function addToHold(hold: Amounts, resource: Resource, amount: number, capacity: number): { hold: Amounts; added: number } {
  const room = Math.max(0, capacity - total(hold))
  const added = Math.max(0, Math.min(room, amount))
  return { hold: { ...hold, [resource]: hold[resource] + added }, added }
}

export const canPay = (store: Amounts, cost: Amounts) => RESOURCES.every((r) => store[r] >= cost[r])

/** 次の段階に足りない量（足りていれば全部 0） */
export const shortfall = (store: Amounts, cost: Amounts): Amounts => ({
  metal: Math.max(0, cost.metal - store.metal),
  ice: Math.max(0, cost.ice - store.ice),
  gas: Math.max(0, cost.gas - store.gas),
})

export const pay = (store: Amounts, cost: Amounts): Amounts => ({ metal: store.metal - cost.metal, ice: store.ice - cost.ice, gas: store.gas - cost.gas })
export const plus = (a: Amounts, b: Amounts): Amounts => ({ metal: a.metal + b.metal, ice: a.ice + b.ice, gas: a.gas + b.gas })

/** 保存する形 */
export type PioneerSave = {
  v: 1
  /** いま積んでいるもの */
  hold: Amounts
  /** 天の湊の倉庫 */
  store: Amounts
  /** 終えた段階の数（0〜STAGE_COUNT） */
  stage: number
  /** 完成したコロニーの名前（空なら未定） */
  colonyName: string
  /** 初めての説明を見たか */
  introSeen: boolean
  /** 納めた回の記録（新しいものが後ろ、LOG_MAX 回まで）。端末の「記録」のグラフに使う。古いセーブには無い */
  log?: Trip[]
  /** これまでに納めた回数（log より古い分も数える） */
  trips?: number
  /** 船の改造の段（0〜MAX_LEVEL）。古いセーブには無い */
  upgrades?: Upgrades
  /** 見つけた珍しい岩の数 */
  rare?: Record<RareId, number>
  /** その日に砕いた珍しい岩（「形-番号」）。読み込み直しても同じ岩で二度取れないように */
  rareTaken?: { day: string; keys: string[] }
  /** 今日の依頼の進み具合 */
  daily?: DailyState
  /** これまでに果たした依頼の数 */
  dailyDone?: number
}

/** 1 回の納品。built は、この納品のあとに建てた段階 */
export type Trip = { at: number; a: Amounts; built?: StageId[] }
export const LOG_MAX = 30

export const NEW_SAVE: PioneerSave = { v: 1, hold: { ...NONE }, store: { ...NONE }, stage: 0, colonyName: '', introSeen: false, log: [], trips: 0, upgrades: { ...NO_UPGRADES } }

const STAGE_IDS = new Set<string>(['frame', 'hull', 'mirror', 'spin', 'air'])
const isTrip = (t: unknown): t is Trip => {
  const x = t as Trip
  return !!x && Number.isFinite(x.at) && isAmounts(x.a) && (x.built === undefined || (Array.isArray(x.built) && x.built.every((b) => STAGE_IDS.has(b))))
}

export const isAmounts = (a: unknown): a is Amounts =>
  !!a && typeof a === 'object' && RESOURCES.every((r) => Number.isFinite((a as Amounts)[r]) && (a as Amounts)[r] >= 0)

/** 読んだセーブが正しい形か */
export function checkSave(v: unknown): v is PioneerSave {
  const s = v as PioneerSave
  return (
    !!s &&
    s.v === 1 &&
    isAmounts(s.hold) &&
    isAmounts(s.store) &&
    Number.isInteger(s.stage) &&
    s.stage >= 0 &&
    s.stage <= STAGE_COUNT &&
    typeof s.colonyName === 'string' &&
    typeof s.introSeen === 'boolean' &&
    (s.log === undefined || (Array.isArray(s.log) && s.log.every(isTrip))) &&
    (s.trips === undefined || (Number.isInteger(s.trips) && s.trips >= 0)) &&
    (s.rare === undefined || (!!s.rare && RARE_IDS.every((id) => Number.isInteger(s.rare![id]) && s.rare![id] >= 0))) &&
    (s.daily === undefined ||
      (!!s.daily && typeof s.daily.day === 'string' && Number.isFinite(s.daily.progress) && s.daily.progress >= 0 && typeof s.daily.done === 'boolean')) &&
    (s.rareTaken === undefined ||
      (!!s.rareTaken && typeof s.rareTaken.day === 'string' && Array.isArray(s.rareTaken.keys) && s.rareTaken.keys.every((k) => typeof k === 'string'))) &&
    (s.dailyDone === undefined || (Number.isInteger(s.dailyDone) && s.dailyDone >= 0)) &&
    (s.upgrades === undefined ||
      (!!s.upgrades && UPGRADE_IDS.every((id) => Number.isInteger(s.upgrades![id]) && s.upgrades![id] >= 0 && s.upgrades![id] <= MAX_LEVEL)))
  )
}

/** 納品を記録に足す（古いものは捨てる） */
export function addTrip(log: readonly Trip[], a: Amounts, at: number): Trip[] {
  return [...log, { at, a: { ...a } }].slice(-LOG_MAX)
}

/** 建てた段階を、いちばん新しい納品の記録に付ける（まだ納品が無ければそのまま） */
export function markBuilt(log: readonly Trip[], id: StageId): Trip[] {
  if (log.length === 0) return [...log]
  const last = log[log.length - 1]
  return [...log.slice(0, -1), { ...last, built: [...(last.built ?? []), id] }]
}

/** ここまでの段階で使った資源 */
export function usedBy(stage: number): Amounts {
  return STAGES.slice(0, stage).reduce((sum, st) => plus(sum, st.cost), { ...NONE })
}

/** 5 段階ぜんぶに要る資源 */
export const ALL_COST: Amounts = usedBy(STAGES.length)

/** 資源の流れ：集めた量 = 建設に使った + 倉庫 + 積み荷 */
export function flow(s: Pick<PioneerSave, 'hold' | 'store' | 'stage'>) {
  const used = usedBy(s.stage)
  const gathered = plus(plus(used, s.store), s.hold)
  return { used, gathered }
}

/** 全体の進み具合（0〜1）：建てた段階の資源と、倉庫・積み荷のうち次に使える分を、全部に要る量で割る */
export function overallProgress(s: Pick<PioneerSave, 'hold' | 'store' | 'stage'>): number {
  const all = total(ALL_COST)
  if (all === 0) return 1
  const left = shortfall(usedBy(s.stage), ALL_COST)
  const have = plus(s.store, s.hold)
  const useful = RESOURCES.reduce((n, r) => n + Math.min(have[r], left[r]), 0)
  return Math.min(1, (total(usedBy(s.stage)) + useful) / all)
}

/** 記録のまとめ：回数、合計、1 回の平均、いちばん多かった回 */
export function tripStats(log: readonly Trip[]) {
  const sums = log.map((t) => total(t.a))
  const sum = log.reduce((a, t) => plus(a, t.a), { ...NONE })
  const best = sums.length ? Math.max(...sums) : 0
  return { count: log.length, sum, average: sums.length ? Math.round(total(sum) / sums.length) : 0, best }
}

/** コロニーの名前の長さの上限（銘板に入る長さ） */
export const NAME_MAX = 24

/** いまやること（画面の「いまやること」カードに出す 1 つ） */
export type Goal =
  | { kind: 'name' }
  | { kind: 'done' }
  | { kind: 'build' }
  | { kind: 'deliver'; full: boolean }
  | { kind: 'mine'; resource: 'metal' | 'ice' }
  | { kind: 'gas' }

/**
 * 進み具合から、次にやることを 1 つ決める。
 * 建てられる → 建てる。積み荷がいっぱい、または積み荷で足りる → 納める。
 * まだ足りない → いちばん多く足りない資源を集めに行く（ガスは木星、金属と氷は採掘場）
 */
export function goal(s: Pick<PioneerSave, 'hold' | 'store' | 'stage' | 'colonyName'>, capacity: number): Goal {
  const next = STAGES[s.stage]
  if (!next) return s.colonyName ? { kind: 'done' } : { kind: 'name' }
  if (canPay(s.store, next.cost)) return { kind: 'build' }
  if (total(s.hold) >= capacity) return { kind: 'deliver', full: true }
  const need = shortfall(plus(s.store, s.hold), next.cost)
  if (total(need) === 0) return { kind: 'deliver', full: false }
  let pick: Resource = 'metal'
  for (const r of RESOURCES) if (need[r] > need[pick]) pick = r
  return pick === 'gas' ? { kind: 'gas' } : { kind: 'mine', resource: pick }
}

/** 資源ごとの、岩の種類（0 炭素質 1 石質 2 金属）から出るもの。画面の輪の色分けに使う */
export const rockResource = (type: RockType): Resource => (type === 0 ? 'ice' : 'metal')

/** 砕ける岩に重ねる輪の数（画面の .pio-ring の数） */
export const RING_COUNT = 8

/** 建設の場面の長さ（秒。とばせる） */
export const CINEMA_SECONDS = 10
/** 建てた直後、前の段階の形から今の段階の形へ伸びていく秒数（建設の場面と合わせる） */
export const GROW_SECONDS = 7
