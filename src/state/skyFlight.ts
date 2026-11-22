import { create } from 'zustand'
import { saveData, saveSlot } from './save'
import { startLanding, useLanding } from './landing'
import { checkTitles } from './stamps'
import { SPEEDS } from '../components/flight/flightControl'

// 着陸船で月の空を飛ぶ（components/flight/FlightView.tsx）。月の地表から「空を飛ぶ」で始め、「地表へ戻る」で着陸地点へ。
// 一周できたら saveData の 'moon-lap'（はじめて回った日・回数・いちばん速い時間）に残す（称号に使う）

export type FlightPhase = 'off' | 'loading' | 'fly'

type Laps = { first: number; times: number; best: number }
const lapSlot = saveSlot<Laps | null>('moon-lap', null, (v) => {
  const l = v as Laps | null
  return l && l.first > 0 && Number.isInteger(l.times) && l.best > 0 ? l : null
})
const gearSlot = saveSlot<number>('sky-flight-gear', 2, (v) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < SPEEDS.length ? (v as number) : null))

type FlightState = {
  phase: FlightPhase
  /** 速さの段 */
  gear: number
  /** 表示用（ときどき書き換える）：高さ m、速さ m/s、一周の進み 0〜1、一周の向きとのずれ（ラジアン、右が +） */
  alt: number
  speed: number
  lap: number
  off: number
  /** 今の一周を始めた時刻（performance.now() / 1000） */
  lapSince: number
  /** 一周の記録 */
  laps: Laps | null
  /** 一周したばかり（お祝いを出す、秒） */
  justLapped: number | null
  /** はかり直す合図（FlightView が受け取って 0 に戻す） */
  restart: number
}

export const flightNow = () => performance.now() / 1000

export const useSkyFlight = create<FlightState>(() => ({
  phase: 'off',
  gear: gearSlot.load(),
  alt: 0,
  speed: 0,
  lap: 0,
  off: 0,
  lapSince: 0,
  laps: lapSlot.load(),
  justLapped: null,
  restart: 0,
}))

/** 空を飛べる天体（いまは月だけ） */
export const canFly = (bodyId: string | null) => bodyId === 'moon'

/** 月の地表から飛び立つ */
export function startFlight() {
  const l = useLanding.getState()
  if (l.phase !== 'surface' || !canFly(l.bodyId)) return
  useSkyFlight.setState({ phase: 'loading', lap: 0, justLapped: null, lapSince: flightNow() })
}

/** 地表（着陸地点）へ戻る */
export function endFlight() {
  useSkyFlight.setState({ phase: 'off', justLapped: null })
}

export function setGear(gear: number) {
  const g = Math.max(0, Math.min(SPEEDS.length - 1, Math.round(gear)))
  if (g === useSkyFlight.getState().gear) return
  gearSlot.save(g)
  useSkyFlight.setState({ gear: g })
}

/** 一周をはかり直す（今の向きから） */
export const restartLap = () => useSkyFlight.setState((s) => ({ restart: s.restart + 1, lap: 0, lapSince: flightNow(), justLapped: null }))

/** 一周した（FlightView が呼ぶ）。sec：かかった秒 */
export function lapDone(sec: number) {
  const prev = useSkyFlight.getState().laps
  const laps = { first: prev?.first ?? Date.now(), times: (prev?.times ?? 0) + 1, best: Math.min(prev?.best ?? Infinity, Math.round(sec)) }
  lapSlot.save(laps)
  useSkyFlight.setState({ laps, justLapped: Math.round(sec), lapSince: flightNow(), lap: 0 })
  checkTitles()
}

/** 確かめる用（#debug）：一周した記録を消す */
export function forgetLaps() {
  saveData.remove('moon-lap')
  useSkyFlight.setState({ laps: null })
}

/** ナビから来た：月に着いたら飛び立つ */
let pending = false

/** ナビの「遊ぶ」から：月にいればすぐ飛び立つ。どこにも降りていなければ、月に着陸してから */
export function goFly() {
  const l = useLanding.getState()
  if (l.phase === 'surface' && canFly(l.bodyId)) return startFlight()
  startLanding('moon')
  const now = useLanding.getState()
  // 着陸を始められたときだけ（ほかの星にいる・キャンペーンでまだ開いていない、なら何もしない）
  pending = now.phase === 'fadeIn' && now.bodyId === 'moon'
}

/** ナビのボタンを押せるか：月にいる、またはどこにも降りていない */
export const canGoFly = (l = useLanding.getState()) => l.phase === 'idle' || (l.phase === 'surface' && canFly(l.bodyId))

// 地表から離れたら（離陸・別の星）、空の飛行もおしまい
useLanding.subscribe((l, prev) => {
  if (useSkyFlight.getState().phase !== 'off' && (l.phase !== 'surface' || !canFly(l.bodyId))) endFlight()
  if (l.phase === 'idle') pending = false
  if (pending && l.phase === 'surface' && prev.phase !== 'surface' && canFly(l.bodyId)) {
    pending = false
    window.setTimeout(() => {
      const n = useLanding.getState()
      if (n.phase === 'surface' && canFly(n.bodyId)) startFlight()
    }, 1200)
  }
})
