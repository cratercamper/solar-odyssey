import { create } from 'zustand'
import { playRadio, preloadRadio, stopRadio, useRadio } from '../audio/radio'
import type { RadioClipId } from '../data/apolloRadio'
import { playMusic, preloadMusic, stopMusic } from '../audio/missionMusic'
import { playStatic } from '../audio/sfx'
import * as THREE from 'three'
import {
  cloneDescent,
  emptyInput,
  ignitePdi,
  landingStars,
  orbitOf,
  orbitPlane,
  sideSpeeds,
  startArrival,
  startDescent,
  stepDescent,
  stepStack,
  takeOver,
  targetOffset,
  BINGO,
  LM_PROP,
  LOI_IDEAL,
  PDI_EARLY,
  PDI_IDEAL,
  PDI_LATE,
  R_MOON,
  type Descent,
  type DescentEvent,
  type Stack,
} from '../data/lunarDescent'
import { FRAME, ground, loadLunarMaps, lunarMaps } from '../components/moonMission/lunarTerrain'
import { autoCam, chapterHooks, endMission, missionNow, saveChapter, saveMissionRecord, setCaption, useMoonMission, MISSION_FADE, type CaptionKey } from './moonMission'
import { beginApolloEva } from './apolloEva'

// 月ミッション第2弾：月の裏での減速（LOI）→ 着陸船の切り離し → 動力降下 → タウルス・リトロウ谷へ着陸。
// 流れ（useMoonMission の phase）：coast（3 日の旅を短く）→ loi（月に近づき、裏で減速）→ undock（12 周後、着陸船が離れる）
//   → descent（降下の点火から着陸まで）→ landed（着いた）
// 物理は data/lunarDescent.ts。時間は場面ごとに早送りする（warp）。

/** 3 日の旅を見せる時間（画面の秒） */
export const COAST_TIME = 14
/** LOI の窓（近月点の時刻 = 0 から、手本の LOI_IDEAL の前後）。窓の終わりで自動で点火 */
export const LOI_OPEN = LOI_IDEAL - 70
export const LOI_CLOSE = LOI_IDEAL + 40
/** 切り離しの場面を始める時刻（PDI の何秒前） */
export const UNDOCK_BEFORE = 330
/** 間の黒い幕（「12 周後」など）を出す時間（画面の秒） */
export const INTERLUDE = 3.4

export type LunarCam = 'chase' | 'window' | 'wide'

type LunarState = {
  /** LOI・PDI の押しどころ（手本からのずれ、物理の秒）。null はまだ */
  loiTiming: number | null
  pdiTiming: number | null
  /** 黒い幕に出す字（null は出さない） */
  interlude: { key: 'loi' | 'undock'; at: number } | null
  /** 終わりの星（着陸のうまさ + 点火のタイミング） */
  stars: number
  /** 地図を読み終わった */
  ready: boolean
  /** 早送りをしない */
  realTime: boolean
}

export const useMoonLunar = create<LunarState>(() => ({
  loiTiming: null,
  pdiTiming: null,
  interlude: null,
  stars: 0,
  ready: false,
  realTime: false,
}))

const plane = orbitPlane(FRAME)

/** 動いている物理（毎フレーム書きかえるので、zustand の外に置く） */
export const lunar = {
  plane,
  stack: startArrival(plane) as Stack,
  desc: null as Descent | null,
  /** 司令船（切り離したあと、別に回る） */
  csm: { r: new THREE.Vector3(), v: new THREE.Vector3() },
  /** 切り離した時刻（物理の秒） */
  sepAt: null as number | null,
  /** 脚の展開（0〜1） */
  legs: 0,
  warp: 1,
  /** 3 日の旅の進み（0〜1） */
  coast: 0,
  /** 地球が月に隠れている（通信が切れている） */
  los: false,
  /**
   * 管制室の 2 つの時計（物理の秒）：地球が隠れる時刻、ブレーキが成功したら地球がまた見える時刻、ブレーキしなかったら見える時刻。
   * 本物の管制室も、月の裏から出てくる時刻で成功か失敗かを知った
   */
  clocks: null as null | { los: number | null; aosBurn: number | null; aosNoBurn: number | null },
  input: emptyInput(),
  /** 出来事（場面の部品が読む） */
  events: [] as DescentEvent[],
}

export const lunarPhase = (p: string) => p === 'coast' || p === 'loi' || p === 'undock' || p === 'descent' || p === 'landed'

/** 第2弾を始める（第1弾の終わりから、または発射台のカードから） */
export function startLunar() {
  preloadMusic('saturn')
  preloadMusic('zarathustra')
  preloadRadio('landed')
  preloadRadio('aos')
  preloadRadio('pdi')
  for (const id of DESCENT_RADIO) preloadRadio(id)
  void loadLunarMaps().then(
    () => useMoonLunar.setState({ ready: true }),
    () => useMoonLunar.setState({ ready: true }),
  )
  lunar.stack = startArrival(plane)
  lunar.desc = null
  lunar.sepAt = null
  lunar.legs = 0
  heard.clear()
  callNext = 0
  lunar.coast = 0
  lunar.los = false
  lunar.clocks = predictClocks(lunar.stack)
  lunar.input = emptyInput()
  lunar.events = []
  useMoonLunar.setState({ loiTiming: null, pdiTiming: null, interlude: null, stars: 0, ready: !!lunarMaps() })
  useMoonMission.setState({ phase: 'coast', since: missionNow(), cam: 'chase', camLocked: false, auto: false, caption: null })
  setCaption('coast')
}

chapterHooks.startLunar = startLunar

/** 「点火」ボタン・スペース：LOI・PDI の点火、接近のあいだは手動に切り替え */
export function lunarGo() {
  const phase = useMoonMission.getState().phase
  const s = lunar.stack
  if (phase === 'loi' && !s.burning && s.burnEnd === null && s.t >= LOI_OPEN) beginLoi()
  else if (phase === 'descent' && lunar.desc) {
    const d = lunar.desc
    if (d.mode === 'coast' && d.t >= PDI_EARLY) beginPdi()
    else if (d.mode === 'approach' || (d.mode === 'terminal' && !d.manual)) manual()
  }
}

/** 今の状態から、地球が隠れる・見える時刻を先読みする（burnAt：その時刻にブレーキを始めたことにする。null ならブレーキしない） */
function predictSight(s0: Stack, burnAt: number | null) {
  const c: Stack = { ...s0, r: s0.r.clone(), v: s0.v.clone() }
  let hid = earthHidden(c.r)
  let los: number | null = hid ? c.t : null
  let guard = 0
  while (guard++ < 6000 && c.t < s0.t + 14_000) {
    if (burnAt !== null && !c.burning && c.burnEnd === null && c.t >= burnAt) {
      c.burning = true
      c.burnStart = c.t
    }
    stepStack(c, c.burning ? 2 : 10)
    const h = earthHidden(c.r)
    if (h && !hid) los = c.t
    if (!h && hid && los !== null) return { los, aos: c.t }
    hid = h
  }
  return { los, aos: null }
}

function predictClocks(s: Stack) {
  const yes = predictSight(s, LOI_IDEAL)
  const no = predictSight(s, null)
  return { los: no.los, aosBurn: yes.aos, aosNoBurn: no.aos }
}

function beginLoi() {
  const s = lunar.stack
  s.burning = true
  s.burnStart = s.t
  useMoonLunar.setState({ loiTiming: s.t - LOI_IDEAL })
  setCaption('loiIgnition')
}

function beginPdi() {
  const d = lunar.desc!
  if (!ignitePdi(d)) return
  useMoonLunar.setState({ pdiTiming: d.t - PDI_IDEAL })
  setCaption('pdi')
  playRadio('pdi', 3.6)
}

/** 手動に切り替えた瞬間の写し（うまく着けなかったら、ここからやり直せる。切り離しからだと長すぎた） */
let manualSnap: Descent | null = null
/** 手動に切り替えた所からやり直せるか */
export const canRetryManual = () => manualSnap !== null

/** 手動（P66）に切り替える */
export function manual() {
  const d = lunar.desc
  if (!d || !takeOver(d)) return
  manualSnap = cloneDescent(d)
  useMoonMission.setState({ auto: false })
  setCaption('manual')
  autoCam('window')
  playRadio('p66')
}

/** 手動に切り替えた所（高さ約 300 m）から、もう一度 */
export function retryManual() {
  if (!manualSnap) return
  lunar.desc = cloneDescent(manualSnap)
  callNext = 0
  lunar.input = emptyInput()
  useMoonLunar.setState({ stars: 0 })
  useMoonMission.setState({ phase: 'descent', since: missionNow(), auto: false, cam: 'window', camLocked: false })
  setCaption('manual')
}

/** おまかせ（自動で最後まで） */
export function setLunarAuto(auto: boolean) {
  useMoonMission.setState({ auto })
  if (lunar.desc && !lunar.desc.manual) lunar.desc.auto = auto
}

// ---- 入力 ------------------------------------------------------------------------------------

const held = { up: 0, down: 0, left: 0, right: 0 }
/** 画面のボタン（スマホ）から：前後・左右（-1〜1） */
export const lunarPad = { fwd: 0, right: 0 }

function onKey(e: KeyboardEvent, down: boolean) {
  const phase = useMoonMission.getState().phase
  if (!lunarPhase(phase)) return
  const k = e.key.toLowerCase()
  const d = lunar.desc
  const v = down ? 1 : 0
  if (k === 'arrowup') held.up = v
  else if (k === 'arrowdown') held.down = v
  else if (k === 'arrowleft') held.left = v
  else if (k === 'arrowright') held.right = v
  else if (k === 'w' || k === 's') {
    // 降りる速さ（W：ゆっくり、S：はやく）
    if (down && d?.manual) lunar.input.rod += k === 'w' ? 1 : -1
  } else if (k === ' ' || k === 'enter') {
    if (down && !e.repeat) lunarGo()
  } else return
  // 接近のあいだは、矢印で降りる場所を動かす（1 回押すごとに 40 m）
  if (down && !e.repeat && d?.mode === 'approach' && k.startsWith('arrow')) moveTarget(k === 'arrowup' ? 1 : k === 'arrowdown' ? -1 : 0, k === 'arrowright' ? 1 : k === 'arrowleft' ? -1 : 0)
  e.preventDefault()
}

/** 降りる場所をずらす（前・右に何段） */
export function moveTarget(fwd: number, right: number) {
  const d = lunar.desc
  if (!d || d.mode !== 'approach') return
  lunar.input.lpdFwd += fwd
  lunar.input.lpdRight += right
}

/** 降りる速さの指示を 1 段変える（+1：ゆっくり） */
export function rod(step: number) {
  if (lunar.desc?.manual) lunar.input.rod += step
}

export function bindLunarKeys() {
  const d = (e: KeyboardEvent) => onKey(e, true)
  const u = (e: KeyboardEvent) => onKey(e, false)
  const blur = () => Object.assign(held, { up: 0, down: 0, left: 0, right: 0 })
  window.addEventListener('keydown', d)
  window.addEventListener('keyup', u)
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', d)
    window.removeEventListener('keyup', u)
    window.removeEventListener('blur', blur)
  }
}

// ---- 毎フレーム -------------------------------------------------------------------------------

function warpFor(phase: string) {
  if (useMoonLunar.getState().realTime && (phase === 'descent' || phase === 'loi')) return 1
  if (phase === 'loi') {
    const s = lunar.stack
    const c = lunar.clocks
    if (s.burning) return 12
    // 地球が月の向こうに沈む・昇るところは、ゆっくり見せる
    const near = (at: number | null | undefined, before: number, after: number) => at != null && s.t > at - before && s.t < at + after
    if (s.burnEnd !== null) return near(c?.aosBurn, 40, 40) ? 4 : 40
    if (near(c?.los, 30, 30)) return 4
    if (s.t < -2600) return 400
    if (s.t < -1300) return 160
    if (s.t < LOI_OPEN - 60) return 50
    if (s.t < LOI_OPEN) return 6
    return 3
  }
  const d = lunar.desc
  if (!d) return 1
  if (phase === 'undock') {
    const since = d.t + UNDOCK_BEFORE
    // 脚を出して離れるところ（約 18 秒）だけ等速。そのあと PDI の窓までは大きく早送り（2026-11-24 junji「着陸が長くて退屈」）
    if (since < 18) return 1
    return d.t < PDI_EARLY - 60 ? 60 : 10
  }
  if (phase === 'descent') {
    // 降下の窓：初めは少し早送りして、手本の時刻（0）が近づいたら等速（タイミングを合わせやすく）
    if (d.mode === 'coast') return d.t < PDI_IDEAL - 14 ? 2 : 1
    const pdi = d.t - (d.pdiAt ?? d.t)
    // 2026-11-23：着陸が退屈すぎた（junji）。制動は速く早送りし、接近・最後の降下も少し速く
    // 2026-11-24：まだ長い（junji）。制動の早送りをさらに強め、最後の降下も高いところは 3〜4 倍
    if (d.mode === 'braking') {
      if (pdi < 14) return 1
      // 本物の交信が聞こえているあいだは、早送りをゆるめる（声のあいだに場面が飛びすぎないように）
      const w = d.tgo < 30 ? 4 : d.tgo < 70 ? 12 : 32
      return useRadio.getState().playing ? Math.min(w, 8) : w
    }
    if (d.mode === 'approach') return 3
    // 最後の降下：高さ 100 m までは 3 倍（おまかせは 4 倍）、40 m までは 2 倍、15 m までは 1.5 倍。接地のまぎわだけ等速
    if (d.mode === 'terminal') return d.alt > 100 ? (d.manual ? 3 : 4) : d.alt > 40 ? (d.manual ? 2 : 2.5) : d.alt > 15 ? 1.5 : 1
    return 1
  }
  return 1
}

/** 地球（経度 0 の向き、38.4 万 km）が月に隠れているか */
const EARTH = new THREE.Vector3(384_400_000, 0, 0)
function earthHidden(r: THREE.Vector3) {
  const d = _e.copy(EARTH).sub(r)
  const L = d.length()
  d.divideScalar(L)
  const t = -r.dot(d)
  if (t < 0 || t > L) return false
  const closest = _c.copy(r).addScaledVector(d, t).length()
  return closest < R_MOON
}
const _e = new THREE.Vector3()
const _c = new THREE.Vector3()

const CAPTION_OF: Partial<Record<DescentEvent, CaptionKey>> = {
  landLong: 'landLong',
  radar: 'radar',
  throttleDown: 'throttleDown',
  highGate: 'highGate',
  lowGate: 'lowGate',
  lowFuel: 'lowFuel',
  call60: 'call60',
  call30: 'call30',
  contact: 'contact',
  touchdown: 'touchdown',
  outOfFuel: 'outOfFuel',
}

/** 画面の dt 秒ぶん進める */
export function tickLunar(dt: number) {
  const ms = useMoonMission.getState()
  const phase = ms.phase
  if (!lunarPhase(phase)) return
  dt = Math.min(dt, 0.1)
  const L = useMoonLunar.getState()
  if (L.interlude && missionNow() - L.interlude.at > INTERLUDE) useMoonLunar.setState({ interlude: null })
  if (phase === 'coast') {
    lunar.coast = Math.min(1, lunar.coast + dt / COAST_TIME)
    if (lunar.coast > 0.55 && lunar.coast - dt / COAST_TIME <= 0.55) setCaption('coastMoon')
    if (lunar.coast >= 1) {
      useMoonMission.setState({ phase: 'loi', since: missionNow() })
      setCaption('approach')
    }
    return
  }
  lunar.warp = warpFor(phase)
  const step = dt * lunar.warp
  if (phase === 'loi') {
    const s = lunar.stack
    const before = s.t
    const ev = stepStack(s, step)
    // 地球が隠れた・見えた
    const hid = earthHidden(s.r)
    if (hid !== lunar.los) {
      lunar.los = hid
      setCaption(hid ? 'los' : 'aos')
      // 月の裏：無線がザッと切れて、音楽も消える。表に出たら、ザッのあとに本物の声
      playStatic(hid ? 1.4 : 0.6)
      if (hid) {
        stopRadio()
        stopMusic(2.5)
        // 地球と話せない月の裏：静かな「土星」
        setTimeout(() => lunar.los && playMusic('saturn'), 3500)
      } else if (s.burnEnd !== null) {
        // 月の裏から出て、地球が昇る：「ツァラトゥストラ」の日の出と、本物の交信（同じ曲は 2 度使わない。junji 2026-11-22）
        playMusic('zarathustra')
        setTimeout(() => playRadio('aos'), 2500)
      }
    }
    if (before < LOI_OPEN && s.t >= LOI_OPEN) setCaption('loiWindow')
    if (!s.burning && s.burnEnd === null && s.t >= LOI_CLOSE) beginLoi()
    if (ev === 'loiCutoff') {
      setCaption('loiCutoff')
      // 実際にブレーキした軌道で、地球が見える時刻を先読みし直す
      if (lunar.clocks) lunar.clocks.aosBurn = predictSight(s, null).aos
    }
    // 減速が終わって、地球が昇るのを見てから、「12 周後」へ（地球が見えない軌道なら、少し待って）
    const aos = lunar.clocks?.aosBurn
    const done = aos != null ? s.t > aos + 40 : s.burnEnd !== null && s.t - s.burnEnd > 280
    if (s.burnEnd !== null && done && !L.interlude) {
      useMoonLunar.setState({ interlude: { key: 'undock', at: missionNow() } })
      window.setTimeout(() => beginUndock(), 900)
    }
    return
  }
  const d = lunar.desc
  if (!d) return
  // 地図があとから読めたら、降りる場所の高さを本物の地面に合わせなおす（読む前は仮の高さ）
  if (!d.groundOk && lunarMaps()) {
    d.groundOk = true
    for (const v of [d.target, d.spot]) v.setLength(R_MOON + ground(_dir.copy(v).normalize()))
  }
  // 手動のとき：押している矢印（キーと画面のボタン）
  lunar.input.fwd = THREE.MathUtils.clamp(held.up - held.down + lunarPad.fwd, -1, 1)
  lunar.input.right = THREE.MathUtils.clamp(held.right - held.left + lunarPad.right, -1, 1)
  if (!d.manual) {
    lunar.input.fwd = 0
    lunar.input.right = 0
  }
  d.auto = ms.auto && !d.manual
  const before = d.t
  const out: DescentEvent[] = []
  stepDescent(d, step, lunar.input, ground, out)
  // 司令船（切り離したあと）
  if (lunar.sepAt !== null) coastCsm(step)
  else lunar.csm.r.copy(d.r)
  if (phase === 'undock') {
    const since = d.t + UNDOCK_BEFORE
    lunar.legs = Math.min(1, Math.max(0, (since - 2) / 7))
    if (since > 10 && lunar.sepAt === null) separate()
    if (since > 2 && before + UNDOCK_BEFORE <= 2) setCaption('legs')
    if (d.t >= PDI_EARLY) {
      useMoonMission.setState({ phase: 'descent', since: missionNow() })
      setCaption('pdiWindow')
    }
    return
  }
  // descent
  if (d.mode === 'coast' && d.t >= PDI_LATE) beginPdi()
  for (const e of out) {
    lunar.events.push(e)
    const key = CAPTION_OF[e]
    if (key) setCaption(key)
    if (e === 'highGate') {
      autoCam('window')
      playRadio('pitchover')
    }
    if (e === 'throttleDown') playRadio('throttle')
    if (e === 'contact') playRadio('contact')
    if (e === 'lowGate' && !d.manual && !ms.auto) {
      // 自分で操縦するつもりなら、ここで手動へ
      manual()
    }
    if (e === 'contact') autoCam('chase')
  }
  descentRadio(d)
  if (d.mode === 'landed' && ms.phase === 'descent') land()
  if (d.mode === 'abort' && ms.phase === 'descent') {
    useMoonMission.setState({ phase: 'landed', since: missionNow() })
    useMoonLunar.setState({ stars: 0 })
  }
}

const _dir = new THREE.Vector3()

/**
 * 降下の本物の交信（アポロ17号、data/apolloRadio.ts）。制動のあいだは、ピッチオーバーまでの残り時間が本物と同じ所で流す
 * （点火から 5 分の「窓の正面に地球」は残り約 250 秒、谷の目印と山は残り約 45 秒）。
 * 最後の降下は、シュミット飛行士の高さの読み上げを、本物とだいたい同じ高さで（200 フィート ≈ 61 m など）。
 * ピッチオーバー・推力を絞る・P66・接地は、その出来事のところで流す
 */
const DESCENT_RADIO: RadioClipId[] = ['earthWindow', 'throttle', 'massifs', 'pitchover', 'p66', 'at200', 'forward', 'touchdown', 'tenFeet', 'contact']
const heard = new Set<RadioClipId>()
/** 高さ（m）と流す切り抜き。上から順に */
const CALLOUTS: [number, RadioClipId][] = [
  [61, 'at200'],
  [34, 'forward'],
  [17, 'touchdown'],
  [4.5, 'tenFeet'],
]
let callNext = 0
function once(id: RadioClipId) {
  if (heard.has(id)) return
  heard.add(id)
  playRadio(id)
}
function descentRadio(d: Descent) {
  if (d.mode === 'braking') {
    if (d.tgo <= 250 && d.tgo > 150) once('earthWindow')
    if (d.tgo <= 45 && d.tgo > 15) once('massifs')
  }
  while (callNext < CALLOUTS.length && d.alt <= CALLOUTS[callNext][0]) {
    const [h, id] = CALLOUTS[callNext++]
    // 手動からやり直したときなど、もう通りすぎた高さのものは流さない
    if (d.mode === 'terminal' && d.alt > h * 0.6) playRadio(id)
  }
}

/** 12 周後：着陸船の物理を、PDI の少し前から始める */
function beginUndock() {
  if (useMoonMission.getState().phase !== 'loi') return
  manualSnap = null
  lunar.desc = startDescent(plane, FRAME, ground, UNDOCK_BEFORE)
  lunar.desc.groundOk = !!lunarMaps()
  lunar.desc.auto = useMoonMission.getState().auto
  lunar.csm.r.copy(lunar.desc.r)
  lunar.csm.v.copy(lunar.desc.v)
  lunar.sepAt = null
  lunar.legs = 0
  useMoonMission.setState({ phase: 'undock', since: missionNow(), cam: 'chase', camLocked: false })
  setCaption('undock')
}

/** もう一度降りる（切り離しから） */
export function retryDescent() {
  useMoonLunar.setState({ pdiTiming: null, interlude: null })
  useMoonMission.setState({ phase: 'loi', auto: false })
  beginUndock()
}

/** 月面に出る：この場面を閉じて、章7（タウルス・リトロー谷の船外活動。state/apolloEva.ts）へ */
export function stepOutside() {
  endMission()
  saveChapter(7)
  window.setTimeout(() => beginApolloEva(), MISSION_FADE * 1000 + 120)
}

/** 着陸船が司令船から離れる：まず、つながっていた軸（着陸船のてっぺんの向き d.dir）に沿ってまっすぐ後ろへ。上（月から離れる向き）へは少しだけ */
function separate() {
  const d = lunar.desc!
  lunar.sepAt = d.t
  lunar.csm.r.copy(d.r)
  lunar.csm.v.copy(d.v).addScaledVector(d.dir, 0.4).addScaledVector(_c.copy(d.r).normalize(), 0.08)
  setCaption('separation')
}

function coastCsm(step: number) {
  // 司令船はふつうの軌道（重力だけ）
  const r = lunar.csm.r
  const v = lunar.csm.v
  let left = step
  while (left > 0) {
    const h = Math.min(2, left)
    const g = -4.9048695e12 / Math.pow(r.length(), 3)
    v.addScaledVector(r, g * h)
    r.addScaledVector(v, h)
    left -= h
  }
}

function land() {
  const d = lunar.desc!
  const L = useMoonLunar.getState()
  let stars = landingStars(d)
  // 点火のタイミングがずれすぎていたら 1 つ減らす
  if ((L.loiTiming !== null && Math.abs(L.loiTiming) > 30) || (L.pdiTiming !== null && Math.abs(L.pdiTiming) > 15)) stars = stars > 0 ? Math.max(1, stars - 1) : 0
  useMoonLunar.setState({ stars })
  useMoonMission.setState({ phase: 'landed', since: missionNow() })
  // 無事に着いたときだけ、本物の「チャレンジャー号、着陸した」を流す
  if (stars > 0) setTimeout(() => useMoonMission.getState().phase === 'landed' && playRadio('landed'), 1600)
  saveMissionRecord({ land: stars, reached: 2 })
}

/** HUD に出す数字 */
export function lunarReadout() {
  const phase = useMoonMission.getState().phase
  const d = lunar.desc
  if ((phase === 'descent' || phase === 'undock' || phase === 'landed') && d) {
    const side = sideSpeeds(d)
    const to = targetOffset(d)
    return {
      kind: 'lm' as const,
      t: d.t,
      mode: d.mode,
      alt: d.alt,
      vUp: d.vUp,
      vSide: d.vSide,
      fwd: side.fwd,
      right: side.right,
      toFwd: to.fwd,
      toRight: to.right,
      toDist: to.dist,
      // 押している向き（十字の計器のふちの矢印を光らせる）
      inFwd: lunar.input.fwd,
      inRight: lunar.input.right,
      fuel: d.prop / LM_PROP,
      hover: Math.max(0, d.hover - BINGO),
      throttle: d.throttle,
      tgo: d.tgo,
      vCmd: d.vCmd,
      manual: d.manual,
      pdiAt: d.pdiAt,
      warp: lunar.warp,
      touch: d.touch,
    }
  }
  const s = lunar.stack
  const o = orbitOf(s.r, s.v)
  return {
    kind: 'stack' as const,
    t: s.t,
    alt: s.r.length() - R_MOON,
    speed: s.v.length(),
    peri: o.peri,
    apo: o.apo,
    burning: s.burning,
    burnEnd: s.burnEnd,
    warp: lunar.warp,
    los: lunar.los,
    clocks: lunar.clocks,
    // 軌道の面の上の位置と速さ（月を真上から見た図）
    x: s.r.dot(plane.P),
    y: s.r.dot(plane.Q),
    vx: s.v.dot(plane.P),
    vy: s.v.dot(plane.Q),
    ex: EARTH.dot(plane.P),
    ey: EARTH.dot(plane.Q),
  }
}

/** テスト・確認用：場面を飛ばす */
export function lunarSkip(to: 'loi' | 'undock' | 'pdi' | 'highGate' | 'lowGate' | 'land', auto = true) {
  setLunarAuto(auto)
  let guard = 0
  const tick = () => tickLunar(0.1)
  if (useMoonMission.getState().phase === 'coast') lunar.coast = 1
  tick()
  if (to === 'loi') {
    while (lunar.stack.t < LOI_OPEN && guard++ < 50_000) tick()
    return
  }
  if (useMoonMission.getState().phase === 'loi') {
    if (!lunar.stack.burning && lunar.stack.burnEnd === null) {
      while (lunar.stack.t < LOI_IDEAL && guard++ < 50_000) tick()
      beginLoi()
    }
    while (lunar.stack.burnEnd === null && guard++ < 50_000) tick()
    useMoonLunar.setState({ interlude: null })
    beginUndock()
  }
  if (to === 'undock') return
  const d = lunar.desc!
  const stop = () =>
    (to === 'pdi' && d.t >= PDI_IDEAL - 2) ||
    (to === 'highGate' && d.mode === 'approach') ||
    (to === 'lowGate' && d.mode === 'terminal') ||
    (to === 'land' && useMoonMission.getState().phase === 'landed')
  while (!stop() && guard++ < 200_000) tick()
}
