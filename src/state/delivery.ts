import { create } from 'zustand'
import { saveSlot } from './save'
import { useStore } from './store'
import { emitPioneerFx } from './pioneerFx'
import { engage } from './flight'
import { colonyWalk, startWalkDirect } from './walk'
import { COLONY_ID } from '../data/sf'
import { receive, setTab, togglePanel } from './pioneer'
import { ui } from '../i18n'
import { today } from '../data/pioneer'
import { addRecord, board, checkDelivery, fastSeconds, LAB_STOP, NEW_DELIVERY, rewardFor, ruleOf, starsFor, type ActiveJob, type DeliverySave, type JobDef } from '../data/delivery'

// 配達の仕事の進み具合（決まりは data/delivery.ts）。共通のセーブの 'delivery' に入る。
// 行き先に着いて止まったか・ワープやビームを使ったかは、components/sf/pioneer/DeliveryRunner が見て、ここを呼ぶ
// （DeliveryRunner は、仕事を引き受けているあいだ、開拓をやめていても動く。約束と時間はいつも見ておく）

type DeliveryState = DeliverySave & {
  /** 行き先のそばで止まって待っている割合（0〜1。保存しない） */
  handoff: number
  /** 行き先の輪の中にいるが、速すぎて受け渡しができない（保存しない） */
  tooFast: boolean
  /** 次の行き先の近く（輪が見えるところ）にいる（保存しない） */
  near: boolean
}

const slot = saveSlot<DeliverySave>('delivery', NEW_DELIVERY, (v) => (checkDelivery(v) ? v : null))

export const useDelivery = create<DeliveryState>(() => ({ ...slot.load(), handoff: 0, tooFast: false, near: false }))

function persist() {
  const { v, active, done, history, skipped } = useDelivery.getState()
  slot.save({ v, active, done, history, skipped })
}

const t = () => ui().delivery

/** 積んでからの時間のうち、まだ画面へ渡していない分と、保存してからの分 */
let pending = 0
let sinceSave = 0

/** 掲示板に出ている仕事（今日の日付と、届けた・入れ替えた数で決まる） */
export const jobBoard = (s: Pick<DeliverySave, 'done' | 'skipped'> = useDelivery.getState()): JobDef[] => board(today(), s)

export const activeJob = () => useDelivery.getState().active
/** 次に向かう行き先（仕事がなければ null） */
export const nextStop = (job = activeJob()) => (job ? job.def.stops[job.stop] : null)

/** 仕事を引き受ける（1 件ずつ）。最初の行き先を目標にする */
export function acceptJob(def: JobDef) {
  if (activeJob()) return false
  const job: ActiveJob = { def, stop: 0, elapsed: 0, warped: false, beamed: false }
  pending = 0
  useDelivery.setState({ active: job, handoff: 0, tooFast: false, near: false })
  persist()
  useStore.getState().setTarget(def.stops[0])
  useStore.getState().showToast(t().accepted(t().kind[def.kind].title))
  return true
}

/** 仕事をやめる（罰はない。掲示板の仕事が入れ替わる） */
export function cancelJob() {
  const at = nextStop()
  if (!at) return
  pending = 0
  useDelivery.setState((s) => ({ active: null, skipped: s.skipped + 1, handoff: 0, tooFast: false, near: false }))
  persist()
  if (useStore.getState().targetId === at) useStore.getState().setTarget(null)
  useStore.getState().showToast(t().cancelled)
}

/** 掲示板の仕事を入れ替える */
export function refreshBoard() {
  useDelivery.setState((s) => ({ skipped: s.skipped + 1 }))
  persist()
}

/** 次の行き先へ向かう。積んだあとで「ワープを使わない」約束なら、ワープせず自動航行で */
export function goToStop() {
  const job = activeJob()
  const at = nextStop(job)
  if (!job || !at) return
  const st = useStore.getState()
  togglePanel(false)
  // 研究温室へは、1 号基の中を歩いて（ほかのコロニーにいるなら、まず 1 号基へ）
  if (at === LAB_STOP) {
    if (colonyWalk.inside && colonyWalk.inside.id !== COLONY_ID) {
      st.setTarget(COLONY_ID)
      engage()
    } else startWalkDirect()
    return
  }
  st.setTarget(at)
  if (job.stop > 0 && ruleOf(job.def.kind) === 'noWarp') {
    if (st.mode === 'map') st.setMode('flight')
    useStore.getState().setAutopilot(true)
  } else engage()
}

/** 積んでからの時間を進める（遊んでいるあいだだけ）。画面へは 1 秒おき、保存は 5 秒おき */
export function tickJob(dt: number) {
  const job = activeJob()
  if (!job || job.stop === 0) return
  pending += dt
  if (pending < 1) return
  useDelivery.setState({ active: { ...job, elapsed: job.elapsed + pending } })
  sinceSave += pending
  pending = 0
  if (sinceSave > 5) {
    sinceSave = 0
    persist()
  }
}

/** 積んだあとにワープ・ビームを使った（約束を破ったかどうかの記録） */
export function markUsed(what: 'warped' | 'beamed') {
  const job = activeJob()
  // 積む前と、コロニーで降ろして歩いて運ぶあいだ（船の外）は数えない
  if (!job || job.stop === 0 || job[what] || nextStop(job) === LAB_STOP) return
  useDelivery.setState({ active: { ...job, [what]: true } })
  persist()
  // 約束を破ったときだけ知らせる
  const rule = what === 'warped' ? 'noWarp' : 'noBeam'
  if (ruleOf(job.def.kind) === rule) useStore.getState().showToast(t().broke[rule])
}

/** 受け渡しの様子（輪の近くか・待っている割合・速すぎるか）。変わったときだけ画面へ */
export function setHandoff(handoff: number, tooFast: boolean, near: boolean) {
  const s = useDelivery.getState()
  const step = Math.round(handoff * 20) / 20
  if (s.handoff !== step || s.tooFast !== tooFast || s.near !== near) useDelivery.setState({ handoff: step, tooFast, near })
}

/** 今の行き先での受け渡しが済んだ：積む・降ろす・届け終える */
export function handoffDone() {
  const live = activeJob()
  if (!live) return
  // まだ画面へ渡していない時間も足してから
  const job = live.stop > 0 ? { ...live, elapsed: live.elapsed + pending } : live
  pending = 0
  const at = job.def.stops[job.stop]
  const last = job.stop === job.def.stops.length - 1
  if (!last) {
    const next = { ...job, stop: job.stop + 1 }
    useDelivery.setState({ active: next, handoff: 0, tooFast: false, near: false })
    persist()
    const walk = next.def.stops[next.stop] === LAB_STOP
    emitPioneerFx({ kind: job.stop === 0 ? 'jobLoad' : 'jobDrop', job: job.def.kind, at, walk })
    // 研究温室は宇宙の場面の行き先ではないので、目標はコロニーのまま
    if (!walk) useStore.getState().setTarget(next.def.stops[next.stop])
    return
  }
  const { kept, fast, stars } = starsFor(job)
  const reward = rewardFor(job.def, stars)
  receive(reward)
  useDelivery.setState((s) => ({ active: null, done: s.done + 1, history: addRecord(s.history, { at: Date.now(), kind: job.def.kind, stars }), handoff: 0, tooFast: false, near: false }))
  persist()
  emitPioneerFx({ kind: 'jobDone', job: job.def.kind, stars, kept, fast, reward, seconds: Math.round(job.elapsed), target: fastSeconds(job.def) })
}

/** 端末の「仕事」タブを開く */
export function openJobs() {
  setTab('jobs')
  togglePanel(true)
}
