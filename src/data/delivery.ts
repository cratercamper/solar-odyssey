import { hashText, isAmounts, type Amounts } from './pioneer'

// SF の開拓の「配達の仕事」の決まり（言葉は i18n/delivery.*.ts）。
// 天の湊の掲示板に、いつも 3 件の仕事が出ている。1 件引き受けると、行き先を順にまわる：
// 最初の行き先で荷物を積み、あとの行き先で降ろす。行き先のそばで止まって数秒待つと、積む・降ろすが済む。
// 評価は星 3 つ：届けた・荷物との約束を守った・早く届けた。報酬は開拓の資源で、天の湊の倉庫に入る。
// 失敗で終わることはない（約束を破っても、時間をこえても、届ければ星 1 つ）

export type JobKind = 'samples' | 'seedlings' | 'parts' | 'medicine' | 'fuel'
export const JOB_KINDS: readonly JobKind[] = ['samples', 'seedlings', 'parts', 'medicine', 'fuel']

/**
 * 荷物との約束
 * - noWarp：ワープを使わない（揺らすとこわれる精密部品）
 * - inTime：決まった時間までに届ける（苗・薬）
 * - noBeam：ビームを撃たない（熱に弱い氷の試料、燃えやすい燃料）
 */
export type JobRule = 'noWarp' | 'inTime' | 'noBeam'

type KindDef = {
  rule: JobRule
  /** 積む所の候補 */
  from: readonly string[]
  /** 降ろす所の候補（drops か所。同じ所は選ばない） */
  to: readonly string[]
  drops: number
  /** 1 区間あたりの報酬 */
  reward: Amounts
  /** inTime の制限時間（1 区間あたりの秒） */
  limit?: number
}

// 行き先（data/sf.ts・sfJapan.ts の id と同じ。あちらは言葉を読み込むので、ここでは文字で書く。
// smoke が、行き先がすべて世界にあることを確かめる）
const COLONY_ID = 'colony'
const TORUS_ID = 'torus'
const CROSS_ID = 'rock-port'
const UMBRELLA_ID = 'rock-base'
const YARD_ID = 'shipyard'
const DOCK_ID = 'spacedock'
const ELEVATOR_ID = 'elevator'
const SOLAR_PLANT_ID = 'solar-plant'
const SAIL_LAUNCHER_ID = 'sail-launcher'
const MOON_CITY_ID = 'moon-city'
/** コロニーの中の研究温室（歩く場面の公園にある。宇宙の場面の行き先ではない）。試料と苗は、ここまで歩いて届ける */
export const LAB_STOP = 'colony-lab'
/** 歩いて届ける荷物 */
const WALK_KINDS: readonly JobKind[] = ['samples', 'seedlings']
/** 仕事の行き先になる所（smoke で、どれも世界にあるか確かめる） */
export const JOB_PLACES = [COLONY_ID, TORUS_ID, CROSS_ID, UMBRELLA_ID, YARD_ID, DOCK_ID, ELEVATOR_ID, SOLAR_PLANT_ID, SAIL_LAUNCHER_ID, MOON_CITY_ID] as const

const a = (metal: number, ice: number, gas: number): Amounts => ({ metal, ice, gas })

export const KINDS: Record<JobKind, KindDef> = {
  // 月の都や小惑星の基地で掘った氷の試料を、コロニーの研究所へ
  samples: { rule: 'noBeam', from: [MOON_CITY_ID, UMBRELLA_ID, CROSS_ID], to: [COLONY_ID, TORUS_ID], drops: 1, reward: a(10, 22, 0) },
  // 天の湊の温室で育てた苗を、コロニーの畑へ
  seedlings: { rule: 'inTime', from: [DOCK_ID], to: [COLONY_ID, TORUS_ID], drops: 1, reward: a(18, 6, 10), limit: 150 },
  // 月の造船所で作った精密部品を、軌道の施設へ
  parts: { rule: 'noWarp', from: [YARD_ID], to: [ELEVATOR_ID, SOLAR_PLANT_ID, SAIL_LAUNCHER_ID, DOCK_ID], drops: 1, reward: a(28, 0, 6) },
  // 天の湊の薬を、遠くの基地へ急いで
  medicine: { rule: 'inTime', from: [DOCK_ID], to: [UMBRELLA_ID, CROSS_ID, MOON_CITY_ID], drops: 1, reward: a(8, 16, 12), limit: 110 },
  // 太陽光ミラー発電所で作った燃料を、2 か所に配る
  fuel: { rule: 'noBeam', from: [SOLAR_PLANT_ID], to: [YARD_ID, ELEVATOR_ID, DOCK_ID, TORUS_ID], drops: 2, reward: a(4, 4, 24) },
}

/** 行き先のそばで止まって待つ秒数（積む・降ろす） */
export const HANDOFF_SECONDS = 3
/** 止まっているとみなす速さ（最高速度を 1 として） */
export const HANDOFF_SPEED = 0.12
/** 「早く届けた」の目安（積んでからの、1 区間あたりの秒） */
export const FAST_SECONDS = 70
/** 掲示板に出ている仕事の数 */
export const BOARD_SIZE = 3
/** 星の数ごとの報酬の倍率 */
export const STAR_BONUS = [0, 1, 1.3, 1.6] as const
export const HISTORY_MAX = 20

export type JobDef = {
  /** 掲示板の何番目か（同じ掲示板の中で区別する） */
  id: string
  kind: JobKind
  /** まわる順の行き先。最初で積み、あとで降ろす */
  stops: string[]
  /** 星 1 つのときの報酬 */
  reward: Amounts
}

export type ActiveJob = {
  def: JobDef
  /** 次に行く行き先の番号（stops の添字） */
  stop: number
  /** 積んでからの秒（遊んでいるあいだだけ数える。積む前は 0） */
  elapsed: number
  /** ワープを使った・ビームを撃った（積んだあと） */
  warped: boolean
  beamed: boolean
}

export type JobRecord = { at: number; kind: JobKind; stars: number }

export type DeliverySave = {
  v: 1
  active: ActiveJob | null
  /** これまでに届けた数（掲示板の仕事を入れ替えるのにも使う） */
  done: number
  /** 届けた仕事の記録（新しいものが後ろ） */
  history: JobRecord[]
  /** 断った・やめた回数（掲示板を入れ替える） */
  skipped: number
}

export const NEW_DELIVERY: DeliverySave = { v: 1, active: null, done: 0, history: [], skipped: 0 }

/** 船で飛ぶ区間の数（積む所から最後の降ろす所まで。研究温室へ歩く分は数えない。歩いているあいだは時間も止まる） */
export const legs = (def: JobDef) => def.stops.filter((s) => s !== LAB_STOP).length - 1
/** 研究温室まで歩いて届ける仕事か */
export const walksToLab = (def: JobDef) => def.stops[def.stops.length - 1] === LAB_STOP
export const ruleOf = (kind: JobKind) => KINDS[kind].rule
/** inTime の制限時間（秒） */
export const timeLimit = (def: JobDef) => (KINDS[def.kind].limit ?? 0) * legs(def)
export const fastSeconds = (def: JobDef) => FAST_SECONDS * legs(def)

/** 掲示板の仕事を作る（日付・届けた数・入れ替えた数・何番目かで決まる。同じなら同じ仕事） */
export function makeJob(day: string, round: number, slot: number): JobDef {
  const h = (salt: string) => hashText(`${day}:${round}:${slot}:${salt}`)
  // 3 件は種類が重ならないようにする
  const first = hashText(`${day}:${round}:kind`) % JOB_KINDS.length
  const kind = JOB_KINDS[(first + slot * 2) % JOB_KINDS.length]
  const k = KINDS[kind]
  const from = k.from[h('from') % k.from.length]
  const choices = k.to.filter((id) => id !== from)
  const stops = [from]
  for (let i = 0; i < k.drops && choices.length; i++) {
    const pick = choices.splice(h(`to${i}`) % choices.length, 1)[0]
    stops.push(pick)
  }
  const n = stops.length - 1
  // コロニーへ届ける試料と苗は、最後に降りて歩き、研究温室へ手渡す（その分、報酬も少し多い）
  const walk = WALK_KINDS.includes(kind) && stops[stops.length - 1] === COLONY_ID
  if (walk) stops.push(LAB_STOP)
  const m = walk ? n + 0.5 : n
  return { id: `${day}:${round}:${slot}`, kind, stops, reward: a(Math.round(k.reward.metal * m), Math.round(k.reward.ice * m), Math.round(k.reward.gas * m)) }
}

/** 掲示板（BOARD_SIZE 件） */
export function board(day: string, s: Pick<DeliverySave, 'done' | 'skipped'>): JobDef[] {
  const round = s.done + s.skipped
  return Array.from({ length: BOARD_SIZE }, (_, i) => makeJob(day, round, i))
}

/** 届けたときの星の数（1〜3） */
export function starsFor(job: ActiveJob): { kept: boolean; fast: boolean; stars: number } {
  const rule = ruleOf(job.def.kind)
  const kept = rule === 'noWarp' ? !job.warped : rule === 'noBeam' ? !job.beamed : job.elapsed <= timeLimit(job.def)
  const fast = job.elapsed <= fastSeconds(job.def)
  return { kept, fast, stars: 1 + (kept ? 1 : 0) + (fast ? 1 : 0) }
}

/** 星の数に合わせた報酬 */
export function rewardFor(def: JobDef, stars: number): Amounts {
  const k = STAR_BONUS[stars] ?? 1
  return a(Math.round(def.reward.metal * k), Math.round(def.reward.ice * k), Math.round(def.reward.gas * k))
}

/** 記録を足す（古いものは捨てる） */
export function addRecord(history: readonly JobRecord[], r: JobRecord): JobRecord[] {
  return [...history, r].slice(-HISTORY_MAX)
}

/** 種類ごとの、届けた数と星の合計 */
export function kindStats(history: readonly JobRecord[]) {
  const out = Object.fromEntries(JOB_KINDS.map((k) => [k, { count: 0, stars: 0, best: 0 }])) as Record<JobKind, { count: number; stars: number; best: number }>
  for (const r of history) {
    const o = out[r.kind]
    o.count++
    o.stars += r.stars
    o.best = Math.max(o.best, r.stars)
  }
  return out
}

const isKind = (k: unknown): k is JobKind => typeof k === 'string' && (JOB_KINDS as readonly string[]).includes(k)
const isDef = (d: unknown): d is JobDef => {
  const x = d as JobDef
  return !!x && typeof x.id === 'string' && isKind(x.kind) && Array.isArray(x.stops) && x.stops.length >= 2 && x.stops.length <= 4 && x.stops.every((s, i) => (JOB_PLACES as readonly string[]).includes(s) || (s === LAB_STOP && i === x.stops.length - 1 && x.stops[i - 1] === COLONY_ID)) && isAmounts(x.reward)
}
const isActive = (j: unknown): j is ActiveJob => {
  const x = j as ActiveJob
  return (
    !!x &&
    isDef(x.def) &&
    Number.isInteger(x.stop) &&
    x.stop >= 0 &&
    x.stop < x.def.stops.length &&
    Number.isFinite(x.elapsed) &&
    x.elapsed >= 0 &&
    typeof x.warped === 'boolean' &&
    typeof x.beamed === 'boolean'
  )
}
const isRecord = (r: unknown): r is JobRecord => {
  const x = r as JobRecord
  return !!x && Number.isFinite(x.at) && isKind(x.kind) && Number.isInteger(x.stars) && x.stars >= 1 && x.stars <= 3
}

export function checkDelivery(v: unknown): v is DeliverySave {
  const s = v as DeliverySave
  return (
    !!s &&
    s.v === 1 &&
    (s.active === null || isActive(s.active)) &&
    Number.isInteger(s.done) &&
    s.done >= 0 &&
    Number.isInteger(s.skipped) &&
    s.skipped >= 0 &&
    Array.isArray(s.history) &&
    s.history.every(isRecord)
  )
}
