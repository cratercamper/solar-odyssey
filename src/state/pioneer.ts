import { create } from 'zustand'
import { saveSlot } from './save'
import { cinemaClock, emitPioneerFx } from './pioneerFx'
import { useStore } from './store'
import { ui } from '../i18n'
import {
  addToHold,
  addTrip,
  markBuilt,
  dailyFor,
  hashText,
  dailyProgress,
  today,
  NO_RARE,
  type RareId,
  MAX_LEVEL,
  NO_UPGRADES,
  upgradeCost,
  type UpgradeId,
  canPay,
  checkSave,
  holdCapacity,
  NAME_MAX,
  NEW_SAVE,
  NONE,
  pay,
  plus,
  STAGE_COUNT,
  STAGES,
  total,
  type Amounts,
  type PioneerSave,
  type Resource,
} from '../data/pioneer'

// SF の「開拓」の進み具合（data/pioneer.ts の決まりで動く）。共通のセーブの 'pioneer' に入る。
// active：いま開拓で遊んでいるか（保存しない。毎回ナビの「遊ぶ」から入る。自由探検が基本）
// panel：開拓の端末（倉庫・建設）を開いているか

type PioneerState = PioneerSave & {
  active: boolean
  panel: boolean
  /** 建設の演出中（この段階に進んだ時刻、ミリ秒。演出が終わったら 0） */
  builtAt: number
  /** 完成して名前を付けるところ */
  naming: boolean
  /** 建設の場面（カメラが建設中のコロニーを回る）を見せているところ */
  cinema: boolean
  /** 遊び方の案内（初めて始めたとき・？ボタン）を出しているか */
  guide: boolean
  /** いまいる場所（採掘場・木星・天の湊のそば）。「いまやること」の言い方を変える */
  near: Near
  /** 端末で開いているタブ（保存しない） */
  tab: TerminalTab
}

export type TerminalTab = 'status' | 'jobs' | 'colony' | 'route' | 'flow' | 'log' | 'ship'
export const TERMINAL_TABS: readonly TerminalTab[] = ['status', 'jobs', 'colony', 'route', 'flow', 'log', 'ship']

export type Near = 'field' | 'jupiter' | 'dock' | null

const slot = saveSlot<PioneerSave>('pioneer', NEW_SAVE, (v) => (checkSave(v) ? v : null))

/** 完成したのに名前がまだ（名前を付ける前に閉じた・読み込み直した）なら、また名前を聞く */
const needsName = (s: PioneerSave) => s.stage >= STAGE_COUNT && !s.colonyName

export const usePioneer = create<PioneerState>(() => {
  const saved = slot.load()
  return { log: [], trips: 0, dailyDone: 0, ...saved, upgrades: { ...NO_UPGRADES, ...saved.upgrades }, rare: { ...NO_RARE, ...saved.rare }, active: false, panel: false, builtAt: 0, naming: needsName(saved), guide: false, near: null, cinema: false, tab: 'status' }
})

function persist() {
  const { v, hold, store, stage, colonyName, introSeen, log, trips, upgrades, rare, rareTaken, daily, dailyDone } = usePioneer.getState()
  slot.save({ v, hold, store, stage, colonyName, introSeen, log, trips, upgrades, rare, rareTaken, daily, dailyDone })
}

export function setTab(tab: TerminalTab) {
  usePioneer.setState({ tab })
}

const t = () => ui().pioneer

export const capacity = () => holdCapacity(useStore.getState().settings.ship, usePioneer.getState().upgrades?.hold ?? 0)
export const upgradeLevel = (id: UpgradeId) => usePioneer.getState().upgrades?.[id] ?? 0
export const pioneerActive = () => usePioneer.getState().active
export const nextStage = () => STAGES[usePioneer.getState().stage] ?? null
export const finished = () => usePioneer.getState().stage >= STAGE_COUNT

/** 開拓を始める（SF モードのときだけ）。初めてなら説明を出す */
export function startPioneer() {
  const st = useStore.getState()
  if (st.settings.world !== 'sf') return
  // 初めてなら遊び方の案内。2 回目からは「いまやること」のカードだけ（端末はカードのボタンから）
  usePioneer.setState((p) => ({ active: true, panel: false, naming: needsName(p), guide: !p.introSeen }))
  ensureDaily()
  st.showToast(t().started)
}

/** 開拓をやめる（進み具合は残る。建設中のコロニーは元の見た目に戻る） */
export function stopPioneer() {
  usePioneer.setState({ active: false, panel: false, naming: false, guide: false, near: null, cinema: false })
  useStore.getState().showToast(t().stopped)
}

export function togglePanel(open = !usePioneer.getState().panel) {
  // 案内を開いたまま端末へ行っても、案内は見たことにする（次に始めたとき、また出ないように）
  if (usePioneer.getState().guide) showGuide(false)
  usePioneer.setState({ panel: open })
}

/** 遊び方の案内を開く・閉じる（閉じたら、もう自動では出さない） */
export function showGuide(open: boolean) {
  usePioneer.setState({ guide: open, panel: false })
  if (!open && !usePioneer.getState().introSeen) {
    usePioneer.setState({ introSeen: true })
    persist()
  }
}

export function setNear(near: Near) {
  if (usePioneer.getState().near !== near) usePioneer.setState({ near })
}

/** 積み荷に足す。入らなかったら一度だけ「いっぱい」と知らせる */
let fullWarned = false
export function collect(resource: Resource, amount: number) {
  const s = usePioneer.getState()
  if (!s.active) return 0
  const cap = capacity()
  const { hold, added } = addToHold(s.hold, resource, amount, cap)
  if (added > 0) {
    usePioneer.setState({ hold })
    persist()
    emitPioneerFx({ kind: 'pickup', resource, amount: added })
  }
  if (total(hold) >= cap && !fullWarned) {
    fullWarned = true
    useStore.getState().showToast(t().holdFull)
    emitPioneerFx({ kind: 'full' })
  }
  return added
}

/** 天の湊に着いたとき：積み荷を全部倉庫へ */
export function deliver() {
  const s = usePioneer.getState()
  if (!s.active || total(s.hold) === 0) return false
  const store = plus(s.store, s.hold)
  usePioneer.setState({ store, hold: { ...NONE }, log: addTrip(s.log ?? [], s.hold, Date.now()), trips: (s.trips ?? 0) + 1 })
  fullWarned = false
  persist()
  // 今日の依頼を先に進める（ごほうびで次の段階を建てられるようになるかもしれない）
  advanceDaily({ delivered: s.hold })
  const next = nextStage()
  const ready = next && canPay(usePioneer.getState().store, next.cost)
  // 納品は画面の演出（数字が増えていくカード）で見せる。読み上げ用に文も渡す
  emitPioneerFx({ kind: 'deliver', amounts: s.hold, ready: !!ready })
  return true
}

/** 倉庫の資源で、次の段階を建てる */
export function build() {
  const s = usePioneer.getState()
  const next = STAGES[s.stage]
  if (!s.active || !next || !canPay(s.store, next.cost)) return false
  // ワープの途中は建てない（建設の場面とワープが、船の位置を取り合う）
  if (useStore.getState().warpPhase !== 'idle') return false
  const stage = s.stage + 1
  // 建設の場面へ（終わったら、完成なら名前を聞く）。文は場面の字幕で見せる
  cinemaClock.t = 0
  usePioneer.setState({ store: pay(s.store, next.cost), stage, builtAt: Date.now(), naming: false, panel: false, cinema: true, log: markBuilt(s.log ?? [], next.id) })
  persist()
  return true
}

/** 今日の依頼の記録を、今日のものにする（日付が変わったら新しい依頼） */
export function ensureDaily() {
  const day = today()
  const d = usePioneer.getState().daily
  if (d?.day === day) return d
  const fresh = { day, progress: 0, done: false }
  usePioneer.setState({ daily: fresh })
  persist()
  return fresh
}

/** 今日の依頼を進める。果たしたら倉庫にごほうびを入れて知らせる */
export function advanceDaily(e: { delivered?: Amounts; rare?: boolean }) {
  const d = ensureDaily()
  if (d.done) return
  const def = dailyFor(d.day)
  const progress = dailyProgress(def, d.progress, e)
  if (progress === d.progress) return
  const done = progress >= def.target
  const s = usePioneer.getState()
  usePioneer.setState({
    daily: { ...d, progress: Math.min(progress, def.target), done },
    ...(done ? { store: plus(s.store, def.reward), dailyDone: (s.dailyDone ?? 0) + 1 } : {}),
  })
  persist()
  if (done) emitPioneerFx({ kind: 'daily', reward: def.reward })
}

/** 今日の珍しい岩の場所を決める数（日付から。日付が変わると入れ替わる） */
let saltDay = ''
let saltValue = 0
export function rareSalt() {
  const day = today()
  if (day !== saltDay) {
    saltDay = day
    saltValue = hashText(day)
  }
  return saltValue
}

/** その珍しい岩を、今日もう砕いたか */
export function rareTakenToday(key: string) {
  const t = usePioneer.getState().rareTaken
  return !!t && t.day === today() && t.keys.includes(key)
}

/** 珍しい岩を砕いた（記録に足し、依頼を進める）。かけらは PioneerScene が出す。amount は実際に出るかけらの合計 */
export function foundRare(id: RareId, key: string, amount: number) {
  const s = usePioneer.getState()
  if (!s.active || rareTakenToday(key)) return false
  const day = today()
  const keys = s.rareTaken?.day === day ? s.rareTaken.keys : []
  usePioneer.setState({ rare: { ...NO_RARE, ...s.rare, [id]: (s.rare?.[id] ?? 0) + 1 }, rareTaken: { day, keys: [...keys, key].slice(-200) } })
  persist()
  emitPioneerFx({ kind: 'rare', id, amount })
  advanceDaily({ rare: true })
  return true
}

/** 倉庫の資源で船を改造する（1 段上げる）。買えたら true */
export function buyUpgrade(id: UpgradeId) {
  const s = usePioneer.getState()
  const level = s.upgrades?.[id] ?? 0
  const cost = upgradeCost(id, level)
  if (!s.active || !cost || level >= MAX_LEVEL || !canPay(s.store, cost)) return false
  usePioneer.setState({ store: pay(s.store, cost), upgrades: { ...NO_UPGRADES, ...s.upgrades, [id]: level + 1 } })
  // 積める量が増えたら、また「いっぱい」と知らせられるように
  if (id === 'hold') fullWarned = false
  persist()
  emitPioneerFx({ kind: 'upgrade', id, level: level + 1 })
  return true
}

/** 建設の場面を終える（最後まで見た・とばした）。とばしたときは、形も伸びきった姿にする */
export function endCinema(skipped = false) {
  const p = usePioneer.getState()
  if (!p.cinema) return
  usePioneer.setState({ cinema: false, naming: needsName(p), ...(skipped ? { builtAt: 0 } : {}) })
}

/** 完成したコロニーの名前を決める（空なら「開拓地 1号」） */
export function nameColony(name: string) {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  usePioneer.setState({ colonyName: clean || t().defaultName, naming: false })
  persist()
  useStore.getState().showToast(t().named(usePioneer.getState().colonyName))
}

/** 最初からやり直す（倉庫・積み荷・段階を消す） */
export function resetPioneer() {
  usePioneer.setState({ ...NEW_SAVE, introSeen: true, builtAt: 0, naming: false, guide: false, cinema: false, tab: 'status' })
  fullWarned = false
  persist()
}

/** 配達の仕事の報酬を倉庫に入れる（state/delivery.ts から） */
export function receive(a: Amounts) {
  const s = usePioneer.getState()
  usePioneer.setState({ store: plus(s.store, a) })
  persist()
}

/** 倉庫から払う（コロニー経営の区画など）。足りなければ払わずに false */
export function spend(cost: Amounts) {
  const s = usePioneer.getState()
  if (!canPay(s.store, cost)) return false
  usePioneer.setState({ store: pay(s.store, cost) })
  persist()
  return true
}

/** 自動テスト・録画用：資源を足す */
export function debugGive(a: Partial<Amounts>) {
  const s = usePioneer.getState()
  usePioneer.setState({ store: plus(s.store, { ...NONE, ...a }) })
  persist()
}
