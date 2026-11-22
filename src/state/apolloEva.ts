import { create } from 'zustand'
import { APOLLO17 } from '../data/apollo17'
import { launchRover, recallRover, roverPose, useRover } from './rover'
import { preloadRadio, playRadio, stopRadio } from '../audio/radio'
import { playMusic, preloadMusic, stopMusic } from '../audio/missionMusic'
import { holdBgm } from '../audio/music'
import { leaveSurface, skipDescent, startLanding, useLanding } from './landing'

// アポロ17号の追体験・章7「月面の探検」と、月からの離陸。地表の場面（タウルス・リトロー谷）の上で動く。
// 実際の 3 回の船外活動から 1 か所ずつ：観測点1（1 回目）・ショーティ・クレーターのオレンジの土（2 回目・観測点4）・
// 割れた大岩（3 回目・観測点6）。月面車 LRV（components/surface/LunarRover.tsx）で行き、石を採って戻る。
// 最後に着陸船のそばで本物の「月を去る言葉」、月面車のテレビカメラが見送る離陸。
// 流れ：board（月面車に乗る）→ drive（次の場所へ）→ stop（着いた）→ sample（石を採る）→ … → back（着陸船へ）
//      → closeout（月を去る言葉）→ liftoff（離陸）→ done

export type EvaStep = 'off' | 'board' | 'drive' | 'stop' | 'sample' | 'back' | 'closeout' | 'liftoff' | 'done'

export type EvaStop = {
  /** 史跡（data/apollo17.ts）の id */
  id: string
  /** 何回目の船外活動か */
  eva: 1 | 2 | 3
  /** 着いたときに流す本物の交信 */
  clip?: 'orange'
}

export const EVA_STOPS: EvaStop[] = [
  { id: 'st1', eva: 1 },
  { id: 'st4', eva: 2, clip: 'orange' },
  { id: 'st6', eva: 3 },
]

/** 史跡の位置 */
export const evaSite = (id: string) => APOLLO17.find((h) => h.id === id)!

/** 月面車を最後に停めた場所（着陸船の東 約 100 m。テレビカメラが着陸船を向く、本物の場所） */
export const EVA_PARK = { x: 255, z: -150 }
/** 着いたことにする距離（m） */
export const ARRIVE_R = 28
/** 月面車が乗りこむのを待っている場所（着陸船のそば）と向き（観測点1 のほう） */
export const LRV_START = { x: 168, z: -127, heading: Math.atan2(-(578 - 168), -(891 + 127)) }

type EvaState = {
  step: EvaStep
  /** いま向かっている、または いる場所（EVA_STOPS の番号。3 なら着陸船へ戻る） */
  leg: number
  /** その段階に入った時刻（performance.now() / 1000） */
  since: number
  /** 採った試料（EVA_STOPS の id） */
  got: string[]
  /** 次の場所までの距離（m）と、向き（月面車の向きからの角度、右が +） */
  dist: number
  turn: number
  /** 離陸の場面を始めた時刻 */
  liftAt: number
}

export const evaNow = () => performance.now() / 1000

export const useApolloEva = create<EvaState>(() => ({ step: 'off', leg: 0, since: 0, got: [], dist: 0, turn: 0, liftAt: 0 }))

/** 船外活動の場面の中か（地表の場面がアポロの月面車・着陸船を出す・ふつうの着陸船をかくす） */
export const evaOn = () => useApolloEva.getState().step !== 'off'

/** 月面車をそこへ動かす（移動を飛ばすとき）。LunarRover が次のコマで読む */
export const lrvTeleport: { to: null | { x: number; z: number; heading: number } } = { to: null }

const set = (step: EvaStep, more: Partial<EvaState> = {}) => useApolloEva.setState({ step, since: evaNow(), ...more })

/** 章7 を始める（地表の場面に入ったあと） */
export function startApolloEva() {
  set('board', { leg: 0, got: [], dist: 0, turn: 0 })
  holdBgm('eva', true)
  preloadRadio('orange')
  preloadRadio('lastWords')
  preloadRadio('ascent')
  recallRover()
  launchRover(false, 'lrv')
}

/** 船外活動の場面を終える（地表の場面を出るとき） */
export function endApolloEva() {
  if (!evaOn()) return
  stopRadio()
  stopMusic(1)
  holdBgm('eva', false)
  lrvTeleport.to = null
  useApolloEva.setState({ step: 'off' })
}

/** いまの目的地 */
export function evaTarget(leg = useApolloEva.getState().leg) {
  if (leg >= EVA_STOPS.length) return EVA_PARK
  const h = evaSite(EVA_STOPS[leg].id)
  return { x: h.x, z: h.z }
}

/** 毎フレーム（LunarRover から）：目的地までの距離・向きと、着いたか */
export function tickEva() {
  const s = useApolloEva.getState()
  if (s.step === 'board' && useRover.getState().phase === 'drive') set('drive')
  if (s.step !== 'drive' && s.step !== 'back') return
  const t = evaTarget()
  const dx = t.x - roverPose.x
  const dz = t.z - roverPose.z
  const dist = Math.hypot(dx, dz)
  // 月面車の前は (-sin h, -cos h)。右が +
  const want = Math.atan2(-dx, -dz)
  let turn = roverPose.heading - want
  turn = Math.atan2(Math.sin(turn), Math.cos(turn))
  if (Math.abs(dist - s.dist) > 2 || Math.abs(turn - s.turn) > 0.05) useApolloEva.setState({ dist, turn })
  if (dist < ARRIVE_R && Math.abs(roverPose.speed) < 1.6) {
    if (s.step === 'drive') {
      set('stop')
      const clip = EVA_STOPS[s.leg].clip
      if (clip) window.setTimeout(() => useApolloEva.getState().step === 'stop' && playRadio(clip), 1200)
    } else {
      set('closeout')
      window.setTimeout(() => useApolloEva.getState().step === 'closeout' && playRadio('lastWords'), 2500)
    }
  }
}

/** 移動を飛ばす：目的地のすぐ手前へ（目的地を向いて。着いたことになる） */
export function skipDrive() {
  const s = useApolloEva.getState()
  if (s.step !== 'drive' && s.step !== 'back') return
  const t = evaTarget()
  const dx = t.x - roverPose.x
  const dz = t.z - roverPose.z
  const d = Math.max(1, Math.hypot(dx, dz))
  const back = Math.min(ARRIVE_R - 6, d)
  const x = t.x - (dx / d) * back
  const z = t.z - (dz / d) * back
  lrvTeleport.to = { x, z, heading: Math.atan2(-dx, -dz) }
}

/** 石を採る */
export function takeSample() {
  const s = useApolloEva.getState()
  if (s.step !== 'stop') return
  set('sample', { got: [...s.got, EVA_STOPS[s.leg].id] })
}

/** 次へ（採ったあと） */
export function nextLeg() {
  const s = useApolloEva.getState()
  if (s.step !== 'sample') return
  stopRadio()
  const leg = s.leg + 1
  set(leg >= EVA_STOPS.length ? 'back' : 'drive', { leg })
}

/** 月を去る言葉のあと：離陸へ（月面車のテレビカメラから） */
export function watchLiftoff() {
  if (useApolloEva.getState().step !== 'closeout') return
  stopRadio()
  set('liftoff', { liftAt: evaNow() })
  // 月面車はテレビカメラ（前）を着陸船へ向けて停めてある
  const lm = evaSite('lm')
  lrvTeleport.to = { x: roverPose.x, z: roverPose.z, heading: Math.atan2(-(lm.x - roverPose.x), -(lm.z - roverPose.z)) }
  useRover.setState({ view: 'chase' })
  // 秒読みの切り抜きの 6.8 秒が点火（LIFTOFF_AT）
  window.setTimeout(() => useApolloEva.getState().step === 'liftoff' && playRadio('ascent'), 400)
  // 月を離れる：「月の光」（同じ曲は 2 度使わない。junji 2026-11-22）
  preloadMusic('clairDeLune')
  window.setTimeout(() => useApolloEva.getState().step === 'liftoff' && playMusic('clairDeLune'), (LIFTOFF_AT + 9) * 1000)
  window.setTimeout(() => useApolloEva.getState().step === 'liftoff' && set('done'), (LIFTOFF_AT + 26) * 1000)
}

/** 離陸の場面の、点火までの秒（切り抜きの声に合わせる。0.4 秒おくれて流し始める） */
export const LIFTOFF_AT = 7.4

/** もう一度、最初の場所から */
export function restartEva() {
  stopRadio()
  stopMusic(0.5)
  set('drive', { leg: 0, got: [] })
  lrvTeleport.to = { ...LRV_START }
}

/** 章7 を始める：月面（タウルス・リトロー谷）に降りて、地表の場面の用意ができたら船外活動を始める */
let pending = false
export function beginApolloEva() {
  pending = true
  startLanding('moon')
  if (useLanding.getState().bodyId === 'moon') useLanding.setState({ site: 'taurus' })
  else pending = false
}

// 地表の場面の進み具合を見る：用意ができたら、ふつうの着陸船が降りてくる演出は飛ばして船外活動へ。地表を出たら終える
useLanding.subscribe((l, prev) => {
  if (pending && l.phase === 'descent' && l.ready && !prev.ready) skipDescent()
  if (pending && l.phase === 'surface' && l.site === 'taurus') {
    pending = false
    startApolloEva()
  }
  if (l.phase === 'idle' && prev.phase !== 'idle') {
    pending = false
    endApolloEva()
  }
})

/** ミッションを終える（宇宙の場面へもどる） */
export function leaveApolloEva() {
  endApolloEva()
  leaveSurface()
}
