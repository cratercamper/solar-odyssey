import { create } from 'zustand'
import { GET, R_EARTH, coastSpeed } from '../data/apolloTimeline'
import { dockStars, earthDistance, stepApproach } from '../data/dockPhysics'
export { CAPTURE_OFF, CAPTURE_SPEED, DOCK_WARP, earthDistance } from '../data/dockPhysics'
import { playRadio, preloadRadio, stopRadio } from '../audio/radio'
import { preloadMusic, stopMusic } from '../audio/missionMusic'
import { chapterHooks, missionNow, saveMissionRecord, setCaption, useMoonMission } from './moonMission'

// アポロ17号の追体験・章3「向きを変えてドッキング」と章4「青い地球」（components/moonMission/DockWorld.tsx・DockHud.tsx）。
// 章3（phase 'dock'）：第3段（S-IVB）から司令船が離れ、アダプタ（SLA）の板が飛び、司令船が 180° 向きを変える
//   → 自分で近づいてつなぐ（探り棒が着陸船の口に入る）→ 本物の「キャプチャー」「ガチャン（12 個の留め金）」
//   → 48 分後、つないだ着陸船を第3段から引き出す → 第3段は離れていく
// 章4（phase 'marble'）：窓のハッセルブラッドで、まるく光る地球を撮る（本物の AS17-148-22727 と見くらべる）→ 3 日の旅へ（moonLunar の coast）
//
// 座標：第3段のてっぺん（計器リングの上）が原点、+Y が第3段の前。着陸船の足の裏は y = LM_Y。
// 司令船は先端（探り棒の付け根）を原点にした模型。つないだとき、先端が着陸船の口（DROGUE）に来る。

export type DockStep = 'sep' | 'turn' | 'approach' | 'capture' | 'latch' | 'eject' | 'evade' | 'dockEnd' | 'aim' | 'shot'

/** 着陸船の足の裏の高さ（第3段のてっぺんから） */
export const LM_Y = -0.3
/** 着陸船の口（LM の中）。craft.ts の DROGUE と同じ */
export const DROGUE_Y = 6.16
export const DROGUE_Z = 0.2
/** 探り棒の長さ（司令船の先端から） */
export const PROBE = 0.5
/** 離れる前の司令船の先端の高さ（アダプタ 8.5 m の上に機械船 7.45 m） */
export const CSM_START_Y = 8.5 + 7.45
/** 場面の長さ（秒） */
const SEP_TIME = 7
const TURN_TIME = 7
const CAPTURE_TIME = 3.6
const LATCH_TIME = 14
const EJECT_TIME = 16.5
const EVADE_TIME = 7
/** 引き出しの切り抜きの中で、ばねが押し出す瞬間（秒） */
export const EJECT_AT = 6.6
/** ドッキングの切り抜きの中で、留め金が閉まる「ガチャン」（秒） */
export const KACHUNK_AT = 4.4

/** ハッセルブラッド（80 mm、6×6 cm）の写る角度（度、1 辺） */
export const HASSELBLAD_FOV = 38.6

type DockState = {
  step: DockStep
  since: number
  /** はね返された回数と、最後のわけ */
  tries: number
  bounce: null | 'fast' | 'off'
  /** つないだときの速さ・ずれ */
  hit: null | { speed: number; off: number }
  stars: number
  /** 撮った写真（四角に切り抜いた画像）と、地球のずれ（度）・はみ出したか */
  photo: null | { url: string; off: number; cut: boolean }
  photoStars: number
}

export const useMoonDock = create<DockState>(() => ({ step: 'sep', since: 0, tries: 0, bounce: null, hit: null, stars: 0, photo: null, photoStars: 0 }))

/** 毎フレーム書きかえる数字 */
export const dock = {
  /** その段階に入ってからの秒 */
  t: 0,
  /** 探り棒の先から着陸船の口までの距離（m）と、近づく速さ（+ が近づく） */
  gap: 0,
  vz: 0,
  /** 横のずれ（m）と速さ */
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  /** 入力：横（-1〜1）2 つと、前後（+1 が近づく） */
  input: { x: 0, y: 0, z: 0 },
  auto: false,
  /** ばねで押し出されてからの、第3段とのへだたり（m） */
  out: 0,
  /** 写真：カメラの向き（度。地球の方向からのずれ）と、撮る合図 */
  aimYaw: 0,
  aimPitch: 0,
  shoot: false,
  /** 写真のための揺れ（宇宙船のゆっくりした回転） */
  drift: 0,
}

const set = (step: DockStep, more: Partial<DockState> = {}) => {
  dock.t = 0
  useMoonDock.setState({ step, since: missionNow(), ...more })
}

/** いまの本物の経過時間（帯の時計） */
export function dockGet() {
  const s = useMoonDock.getState()
  const t = dock.t
  switch (s.step) {
    case 'sep':
      return GET.sep + t * 4
    case 'turn':
      return GET.sep + SEP_TIME * 4 + t * 20
    case 'approach': {
      // 近づくあいだ：残りの距離で、本物のつないだ時刻（003:57:03）へ
      const k = Math.min(1, Math.max(0, 1 - dock.gap / 17))
      return GET.sep + SEP_TIME * 4 + TURN_TIME * 20 + k * (GET.softDock - GET.sep - SEP_TIME * 4 - TURN_TIME * 20)
    }
    case 'capture':
      return GET.softDock + t
    case 'latch':
      return GET.softDock + CAPTURE_TIME + t
    case 'eject':
      return GET.ejection - EJECT_AT + t
    case 'evade':
    case 'dockEnd':
      return GET.ejection + 10 + t * 30
    default:
      return GET.marble + t
  }
}

export function dockJourney() {
  const get = dockGet()
  const r = earthDistance(get)
  return { get, fromEarth: r - R_EARTH, speed: coastSpeed(r) }
}

/** 章3 を始める（第1弾の終わりのカード、章の一覧から） */
export function startDock() {
  preloadMusic('blueDanube')
  preloadMusic('neptune')
  preloadRadio('capture')
  preloadRadio('hardDock')
  preloadRadio('ejection')
  preloadRadio('earthView')
  stopRadio()
  stopMusic(1)
  Object.assign(dock, { t: 0, gap: 30, vz: 0, x: 0, y: 0, vx: 0, vy: 0, out: 0, auto: false, shoot: false })
  dock.input = { x: 0, y: 0, z: 0 }
  useMoonDock.setState({ step: 'sep', since: missionNow(), tries: 0, bounce: null, hit: null, stars: 0, photo: null, photoStars: 0 })
  useMoonMission.setState({ phase: 'dock', since: missionNow(), cam: 'chase', camLocked: false, auto: false, caption: null })
  setCaption('tdSep')
}

/** 章4 を始める */
export function startMarble() {
  preloadMusic('neptune')
  preloadRadio('earthView')
  stopRadio()
  Object.assign(dock, { t: 0, gap: -0.3, out: 30, aimYaw: -14, aimPitch: 9, shoot: false, drift: 0 })
  dock.input = { x: 0, y: 0, z: 0 }
  useMoonDock.setState({ step: 'aim', since: missionNow(), photo: null, photoStars: 0 })
  useMoonMission.setState({ phase: 'marble', since: missionNow(), cam: 'window', camLocked: false, auto: false, caption: null })
  setCaption('marble')
  // 同じ曲は 2 度使わない（junji 2026-11-22）。この場面の曲は、新しい曲を取りこむときに決める
  window.setTimeout(() => useMoonMission.getState().phase === 'marble' && playRadio('earthView'), 6000)
}

/** 3 日の旅へ（章5 の始まり：moonLunar の coast） */
export function marbleToCoast() {
  stopRadio()
  chapterHooks.startLunar?.()
}

export function setDockAuto(on: boolean) {
  dock.auto = on
  useMoonMission.setState({ auto: on })
}

/** 写真を撮る（スペース・シャッターのボタン） */
export function pressShutter() {
  const s = useMoonDock.getState()
  if (useMoonMission.getState().phase !== 'marble' || (s.step !== 'aim' && s.step !== 'shot')) return
  if (s.step === 'shot') {
    // 撮りなおす
    set('aim', { photo: null })
    return
  }
  dock.shoot = true
}

/** DockWorld が写真を切り抜いたら呼ぶ */
export function photoTaken(url: string, off: number, cut: boolean) {
  const stars = cut ? 0 : off < 3 ? 3 : off < 6 ? 2 : 1
  const best = Math.max(useMoonDock.getState().photoStars, stars)
  set('shot', { photo: { url, off, cut }, photoStars: best })
  if (stars > 0) saveMissionRecord({ stars, reached: 4 })
}

/** 写真の場面の、地球の位置（カメラの正面からのずれ、度）。宇宙船のゆっくりした揺れで、すこしずつ流れる */
export function earthDrift(t: number) {
  return { yaw: Math.sin(t * 0.21) * 7 + Math.sin(t * 0.53 + 1) * 2, pitch: Math.sin(t * 0.17 + 2) * 5 + Math.sin(t * 0.47) * 1.5 }
}

// ---- 毎フレーム -----------------------------------------------------------------------------------

function tickApproach(dt: number) {
  const c = stepApproach(dock, dt, dock.auto)
  if (!c) return
  const s = useMoonDock.getState()
  if (c.kind === 'capture') {
    const stars = dockStars(c.speed, c.off, s.tries, useMoonMission.getState().auto)
    set('capture', { hit: { speed: c.speed, off: c.off }, stars, bounce: null })
    setCaption('capture')
    playRadio('capture')
    saveMissionRecord({ stars, reached: 3 })
    return
  }
  useMoonDock.setState({ tries: s.tries + 1, bounce: c.why })
  setCaption(c.why === 'fast' ? 'bounceFast' : 'bounceOff')
}

export function tickDock(dt: number) {
  const phase = useMoonMission.getState().phase
  if (phase !== 'dock' && phase !== 'marble') return
  dock.t += dt
  const s = useMoonDock.getState()
  const t = dock.t
  switch (s.step) {
    case 'sep':
      if (t >= SEP_TIME) {
        set('turn')
        setCaption('tdTurn')
      }
      break
    case 'turn':
      if (t >= TURN_TIME) {
        // 向きを変え終わった所から：先端の探り棒から着陸船の口まで約 17 m、少しずれている
        dock.gap = 17
        dock.vz = 0.05
        dock.x = 0.9
        dock.y = -0.55
        dock.vx = 0.004
        dock.vy = -0.003
        set('approach')
        useMoonMission.setState({ cam: useMoonMission.getState().camLocked ? useMoonMission.getState().cam : 'window' })
        setCaption('tdApproach')
      }
      break
    case 'approach':
      tickApproach(dt)
      break
    case 'capture':
      if (t >= CAPTURE_TIME) {
        set('latch')
        playRadio('hardDock')
        setCaption('hardDock')
      }
      break
    case 'latch':
      // 探り棒を引きこむ：先端が口の奥へ
      dock.gap = -Math.min(1, Math.max(0, (t - 2.6) / (KACHUNK_AT - 2.6))) * 0.3
      if (t >= LATCH_TIME) {
        dock.gap = -0.3
        set('eject')
        useMoonMission.setState({ cam: 'chase', camLocked: false })
        setCaption('ejectLater')
        playRadio('ejection')
      }
      break
    case 'eject':
      // ばねで押し出す（秒速 0.3 m 前後）。早送りで見せる
      if (t > EJECT_AT) dock.out += dt * 1.2
      if (t > EJECT_AT && t - dt <= EJECT_AT) setCaption('ejected')
      if (t >= EJECT_TIME) {
        set('evade')
        setCaption('evade')
      }
      break
    case 'evade':
      dock.out += dt * 1.2
      if (t >= EVADE_TIME) set('dockEnd')
      break
    case 'aim': {
      dock.drift += dt
      const i = dock.input
      dock.aimYaw += i.x * dt * 9
      dock.aimPitch += i.y * dt * 9
      dock.aimYaw = Math.max(-40, Math.min(40, dock.aimYaw))
      dock.aimPitch = Math.max(-30, Math.min(30, dock.aimPitch))
      break
    }
    default:
      break
  }
}

/** キー（章3・4 のあいだ）：WASD・矢印で横、スペースで前へ・X で後ろへ（章4 はシャッター） */
function onKey(e: KeyboardEvent, down: boolean) {
  const phase = useMoonMission.getState().phase
  if (phase !== 'dock' && phase !== 'marble') return
  const k = e.key.toLowerCase()
  const i = dock.input
  const v = down ? 1 : 0
  if (k === 'arrowleft' || k === 'a') i.x = down ? -1 : i.x < 0 ? 0 : i.x
  else if (k === 'arrowright' || k === 'd') i.x = down ? 1 : i.x > 0 ? 0 : i.x
  else if (k === 'arrowup' || k === 'w') i.y = down ? 1 : i.y > 0 ? 0 : i.y
  else if (k === 'arrowdown' || k === 's') i.y = down ? -1 : i.y < 0 ? 0 : i.y
  else if (k === ' ' && phase === 'marble') {
    if (down && !e.repeat) pressShutter()
  } else if (k === ' ' || k === 'e') i.z = v
  else if (k === 'x' || k === 'q' || k === 'shift') i.z = down ? -1 : i.z < 0 ? 0 : i.z
  else return
  if (dock.auto && phase === 'dock' && down && k !== ' ') setDockAuto(false)
  e.preventDefault()
  e.stopImmediatePropagation()
}

export function bindDockKeys() {
  const d = (e: KeyboardEvent) => onKey(e, true)
  const u = (e: KeyboardEvent) => onKey(e, false)
  // 月ミッション全体のキー（スペースで点火など）より先に受ける
  window.addEventListener('keydown', d, true)
  window.addEventListener('keyup', u, true)
  return () => {
    window.removeEventListener('keydown', d, true)
    window.removeEventListener('keyup', u, true)
  }
}

/** 確かめる用：近づく場面まで飛ばす・つなぐ所まで */
export function dockSkip(to: DockStep) {
  if (useMoonMission.getState().phase !== 'dock') startDock()
  const order: DockStep[] = ['sep', 'turn', 'approach', 'capture', 'latch', 'eject', 'evade', 'dockEnd']
  let guard = 0
  while (order.indexOf(useMoonDock.getState().step) < order.indexOf(to) && guard++ < 20000) {
    if (useMoonDock.getState().step === 'approach') setDockAuto(true)
    tickDock(0.05)
  }
}
