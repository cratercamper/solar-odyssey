import * as THREE from 'three'
import { create } from 'zustand'
import { PLANETS } from '../data/bodies'
import { isTelescope, scopeName } from '../data/telescopes'
import { SF_OBJECTS, sfEntry } from '../data/sf'
import { RACE_TEXT, raceActive } from './race'
import { bodies } from './registry'
import { blockedByCampaign } from './campaign'
import { useStore } from './store'
import { playWarp, speak } from '../audio/sfx'
import { planetLongitude, simDays } from '../data/ephemeris'
import { ui } from '../i18n'

const UP = new THREE.Vector3(0, 1, 0)

/** 自機の状態。毎フレーム書き換えるので React の state にはしない */
/** 自機の表示の大きさ（ShipModel の座標の1が、この長さになる） */
export const SHIP_SCALE = 0.3

export const ship = {
  position: new THREE.Vector3(30, 4, 70),
  quaternion: new THREE.Quaternion(),
  velocity: new THREE.Vector3(),
}

// 惑星は今日の本当の位置に並ぶので、出発点も地球と一緒に回して、地球との位置関係を保つ（そのあと Ship が、地球のそばで太陽を斜め後ろにした出発点に置き直す）。
// 4.78 は、惑星を決まった角度に並べていたころの地球の向き
{
  const turn = planetLongitude('earth', simDays(0)) - 4.78
  ship.position.applyAxisAngle(UP, turn)
  ship.quaternion.setFromAxisAngle(UP, turn)
}

/** 操縦の制限（レースのカウントダウン中は止める、スイングバイ後は最高速度を上げる） */
export const flightControl = {
  locked: false,
  speedScale: 1,
  releaseHold: false,
  holding: false,
  /** 全体マップでワープを押したとき：この天体の前へ、ワープの演出なしで移る（Ship が次のフレームで動かす） */
  jumpTo: null as string | null,
  /** プレイヤーがマップから移った回数（配達の「ワープを使わない」約束が見る。jumpTo はすぐ消えるので数で） */
  jumps: 0,
}

/** ワープ演出の共有値（光の筋・ナセルの発光が参照する） */
export const warpFx = { intensity: 0, glow: 0, seconds: 3 }

/**
 * 噴射の演出に渡す操縦の様子（Ship が毎フレーム書き、components/ship/EngineFx.tsx が読む）。どれも船の座標で
 * - throttle：前進の噴かし具合 0〜1（W・自動航行）
 * - move：並進の入力（右・上・後ろが +、-1〜1）
 * - turn：回る速さ（ピッチ・ヨー・ロール。旋回の上限を 1 とする）
 * - speed：速さ（最高速度を 1 とする）
 * - power：EngineFx がなめらかにした噴射の強さ（ナセルや噴射口の光が参照する。演出オフなら 0）
 */
export const thrustFx = { throttle: 0, move: new THREE.Vector3(), turn: new THREE.Vector3(), speed: 0, power: 0 }

export const CHARGE_SECONDS = 1.8
export const EXIT_SECONDS = 0.9

/** これより小さい目標（ハッブルなど、船より小さい物）は、少し離れて止まる。近すぎると、後ろから見たときに船と重なって見える */
const SMALL_TARGET = 0.2
/** 到着点（目標の手前で止まる距離） */
export const standoff = (radius: number) => radius * 3 + (radius < SMALL_TARGET ? 1 : 0.6)

/** ワープ速度が上がるほど短時間で着く */
export const warpSeconds = (distance: number, factor: number) => THREE.MathUtils.clamp(distance / (factor * factor * 2), 1.5, 8)

const tmp = new THREE.Vector3()

export function distanceToBody(id: string) {
  const body = bodies.get(id)
  if (!body) return null
  body.object.getWorldPosition(tmp)
  return Math.max(0, tmp.distanceTo(ship.position) - body.radius)
}

/**
 * ワープの準備ができたか。起動した直後は、模型やテクスチャの読み込みとシェーダー作りがまだ続いていて、
 * そこでワープすると声だけ先に流れて演出が止まる。準備が終わるまでは押されたことだけ覚えておき
 * （ボタンは「準備中」）、終わったら声と演出を一緒に始める。QualityGovernor が ready にする
 */
export const useWarpPrep = create<{ ready: boolean; pending: boolean }>(() => ({ ready: false, pending: false }))

/** 準備ができた。待っていたワープがあれば、ここで始める */
export function warpPrepDone() {
  if (useWarpPrep.getState().ready) return
  const pending = useWarpPrep.getState().pending
  useWarpPrep.setState({ ready: true, pending: false })
  if (pending) engage()
}

export function engage() {
  const s = useStore.getState()
  if (!s.targetId || s.warpPhase !== 'idle') return
  // キャンペーン：まだ開いていない星へは、ワープもマップからの移動もできない
  if (blockedByCampaign(s.targetId)) return
  // 全体マップからは、声も光の筋も出さず、カメラがその天体の前の船まで約1秒ですっと寄るだけにする
  // （マップから操縦席への切り替えとワープの演出が重なると、重くて止まりやすいので）
  if (s.mode === 'map' && !raceActive()) {
    if (!bodies.get(s.targetId)) return
    s.setAutopilot(false)
    flightControl.jumpTo = s.targetId
    flightControl.jumps++
    s.setMode('flight')
    return
  }
  if (!useWarpPrep.getState().ready) {
    useWarpPrep.setState({ pending: true })
    return
  }
  if (raceActive()) {
    s.showToast(RACE_TEXT.noWarp)
    return
  }
  const distance = distanceToBody(s.targetId)
  if (distance === null) return
  warpFx.seconds = warpSeconds(distance, s.warpFactor)
  s.setAutopilot(false)
  if (s.mode === 'map') s.setMode('flight')
  s.setWarpPhase('charge')
  // 艦長の号令は、低く力強く（声の高さは 0〜2。下げすぎると機械のような声になる）
  speak(warpCall(s.targetId, s.warpFactor), { rate: 0.9, pitch: 0.5 })
  playWarp(CHARGE_SECONDS, warpFx.seconds)
}

/** 英語の掛け声で呼ぶ行き先の名前 */
const SPOKEN: Record<string, string> = { sun: 'the Sun', moon: 'the Moon', hubble: 'the Hubble Space Telescope', webb: 'the Webb Space Telescope', ...Object.fromEntries(SF_OBJECTS.map((e) => [e.id, e.spoken])) }
const spokenName = (id: string) => SPOKEN[id] ?? id[0].toUpperCase() + id.slice(1)

/** ワープの掛け声（艦長の号令。英語。セリフはこのアプリのオリジナル） */
function warpCall(id: string, factor: number) {
  const name = spokenName(id)
  const lines = [
    `Warp ${factor}. Set course for ${name}... Engage!`,
    `Course: ${name}. Warp ${factor}... Engage!`,
    `${name}, warp ${factor}. All hands... Engage!`,
  ]
  return lines[Math.floor(Math.random() * lines.length)]
}

/** 天体の名前と、太陽からの実際の距離（衛星は親の惑星の距離） */
export function bodyInfo(id: string) {
  if (id === 'sun') return { name: ui().flight.sun, au: 0, parent: null as string | null }
  const sf = sfEntry(id)
  if (sf) return { name: sf.name(), au: 0, parent: null }
  if (isTelescope(id)) return { name: scopeName(id), au: 0, parent: null }
  for (const p of PLANETS) {
    if (p.id === id) return { name: ui().bodies[p.id].name, au: p.distanceAu, parent: null }
    const moon = p.moons.find((m) => m.id === id)
    if (moon) return { name: ui().bodies[moon.id].name, au: p.distanceAu, parent: ui().bodies[p.id].name }
  }
  // 任務の小惑星など、一時的に加わったもの
  const extra = bodies.get(id)
  if (extra) return { name: extra.name, au: 0, parent: null }
  return null
}

/** 太陽からの光の到達時間（分）と、探査機（秒速17km）での年数 */
export function travelFacts(au: number) {
  return { lightMinutes: au * 8.317, probeYears: (au * 149.6e6) / 17 / 3.156e7 }
}
