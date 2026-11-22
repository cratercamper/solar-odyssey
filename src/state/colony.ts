import { create } from 'zustand'
import { saveSlot } from './save'
import { useStore } from './store'
import { receive, spend, usePioneer } from './pioneer'
import { ui } from '../i18n'
import { STAGE_COUNT } from '../data/pioneer'
import {
  advance,
  buildZone,
  canBuild,
  canStudy,
  checkColony,
  DAY_HOURS,
  HOUR_MS,
  NEW_COLONY,
  removeZone,
  startColony,
  startStudy,
  ZONE_COST,
  type ColonySave,
  type PolicyId,
  type ResearchId,
  type TaxLevel,
  type ZoneId,
} from '../data/colony'

// コロニー経営の進み具合（決まりは data/colony.ts）。共通のセーブの 'colony' に入る。
// 時間は現実の時計で進む：読み込んだとき・端末の経営タブを開いているあいだ（1 秒ごと）・歩く場面に入ったときに、いままでの分をまとめて進める。

/** 閉じていたあいだに起きたこと（戻ったときに一度だけ見せる。保存しない） */
export type Away = { hours: number; pop: number; happy: number; metal: number; finished: ResearchId[] }

type ColonyState = ColonySave & {
  away: Away | null
  /** 最後に建てた区画（画面で、その区画を光らせる。保存しない） */
  justBuilt: { id: ZoneId; at: number } | null
}

const slot = saveSlot<ColonySave>('colony', NEW_COLONY, (v) => (checkColony(v) ? v : null))

export const useColony = create<ColonyState>(() => ({ ...slot.load(), away: null, justBuilt: null }))

function persist() {
  const { away: _a, justBuilt: _j, ...save } = useColony.getState()
  slot.save(save)
}

/** 開拓でコロニーを完成させたか（経営はそのあと） */
export const colonyReady = () => usePioneer.getState().stage >= STAGE_COUNT

/** いまの時刻まで進める。閉じていたあいだの分が半日を超えたら、まとめを残す */
export function catchUp(now = Date.now()) {
  const s = useColony.getState()
  // 開拓をはじめからやり直した（コロニーがまだない）あいだは、町も止めておく（時計だけ合わせる）
  if (!s.started) return
  if (!colonyReady()) {
    useColony.setState({ at: now })
    return
  }
  const before = { pop: s.pop, happy: s.happy }
  const r = advance(s, now)
  if (r.s === s) return
  const t = ui().colony
  if (r.metal > 0) receive({ metal: r.metal, ice: 0, gas: 0 })
  const long = r.hours >= DAY_HOURS / 2
  if (!long) for (const id of r.finished) useStore.getState().showToast(t.researchDone(t.research[id].name))
  // まとめをまだ閉じていなければ、足していく
  const prev = s.away
  const away: Away | null = long
    ? {
        hours: r.hours + (prev?.hours ?? 0),
        pop: r.s.pop - before.pop + (prev?.pop ?? 0),
        happy: r.s.happy - before.happy + (prev?.happy ?? 0),
        metal: r.metal + (prev?.metal ?? 0),
        finished: [...(prev?.finished ?? []), ...r.finished],
      }
    : prev
  useColony.setState({ ...r.s, away })
  persist()
}

export function begin() {
  if (!colonyReady() || useColony.getState().started) return
  useColony.setState({ ...startColony(Date.now()), away: null, justBuilt: null })
  persist()
}

export function build(id: ZoneId) {
  catchUp()
  const s = useColony.getState()
  if (!canBuild(s, id, usePioneer.getState().store)) return false
  if (!spend(ZONE_COST[id])) return false
  useColony.setState({ ...buildZone(s, id), justBuilt: { id, at: Date.now() } })
  persist()
  return true
}

export function demolish(id: ZoneId) {
  catchUp()
  useColony.setState(removeZone(useColony.getState(), id))
  persist()
}

export function setTax(tax: TaxLevel) {
  catchUp()
  useColony.setState({ tax })
  persist()
}

export function setPolicy(policy: PolicyId) {
  catchUp()
  useColony.setState({ policy })
  persist()
}

export function study(id: ResearchId) {
  catchUp()
  const s = useColony.getState()
  if (!canStudy(s, id)) return false
  useColony.setState(startStudy(s, id))
  persist()
  return true
}

export function dismissAway() {
  useColony.setState({ away: null })
}

/** 経営をはじめからやり直す（開拓の記録はそのまま） */
export function resetColony() {
  useColony.setState({ ...NEW_COLONY, away: null, justBuilt: null })
  persist()
}

// 読み込んだときに、閉じていたあいだの分を進める。開いているあいだは、どの画面にいても 1 時間ごとに進める
// （7 日の上限は、閉じていたあいだだけに効くようにする）
catchUp()
if (typeof window !== 'undefined') window.setInterval(() => catchUp(), HOUR_MS)
