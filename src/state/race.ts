import { saveData } from './save'
import { create } from 'zustand'
import { ui } from '../i18n'

// レース：火星を出発し、木星のそばを通って土星でスイングバイし、火星へ戻る。
// コースには光る輪（ゲート）が並び、順番にくぐっていく。

export type RacePhase = 'idle' | 'countdown' | 'running' | 'finished'

export type RaceResult = { time: number; rivalTime: number | null; win: boolean; best: number; newBest: boolean }

const BEST_KEY = 'race-best'

function loadBest(): number | null {
  try {
    const v = Number(saveData.get(BEST_KEY))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

type RaceState = {
  phase: RacePhase
  /** 次にくぐるゲートの番号（0 から） */
  gate: number
  gateCount: number
  rivalGate: number
  /** カウントダウンの残り（秒） */
  countdown: number
  elapsed: number
  boosted: boolean
  result: RaceResult | null
  best: number | null
  start: () => void
  stop: () => void
  update: (patch: Partial<Pick<RaceState, 'phase' | 'gate' | 'gateCount' | 'rivalGate' | 'countdown' | 'elapsed' | 'boosted'>>) => void
  finish: (time: number, rivalTime: number | null) => void
}

export const useRace = create<RaceState>((set, get) => ({
  phase: 'idle',
  gate: 0,
  gateCount: 0,
  rivalGate: 0,
  countdown: 0,
  elapsed: 0,
  boosted: false,
  result: null,
  best: loadBest(),
  start: () => set({ phase: 'countdown', gate: 0, rivalGate: 0, countdown: 3.5, elapsed: 0, boosted: false, result: null }),
  stop: () => set({ phase: 'idle', result: null }),
  update: (patch) => set(patch),
  finish: (time, rivalTime) => {
    const prev = get().best
    const newBest = prev === null || time < prev
    const best = newBest ? time : prev
    try {
      saveData.set(BEST_KEY, String(best))
    } catch {
      // 保存できなくても遊べる
    }
    set({ phase: 'finished', elapsed: time, best, result: { time, rivalTime, win: rivalTime === null || time < rivalTime, best, newBest } })
  },
}))

export const raceActive = () => {
  const p = useRace.getState().phase
  return p === 'countdown' || p === 'running'
}

export const RACE_TEXT = {
  get start() {
    return ui().race.raceStart
  },
  get jupiter() {
    return ui().race.pastJupiter
  },
  get swingby() {
    return ui().race.swingByComplete
  },
  get finish() {
    return ui().race.finishNote
  },
  get noWarp() {
    return ui().race.noWarp
  },
}

export const formatTime = (t: number) => {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}
