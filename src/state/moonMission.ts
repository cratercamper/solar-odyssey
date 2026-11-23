import { create } from 'zustand'
import { useStore } from './store'
import { saveSlot } from './save'
import { playRadio, preloadRadio, stopRadio } from '../audio/radio'
import { LIFTOFF_AT } from '../data/apolloRadio'
import { playMusic, preloadMusic, stopMusic, type MusicCue } from '../audio/missionMusic'
import { holdBgm } from '../audio/music'
import {
  R_EARTH,
  altitude,
  guidePitch,
  orbitOf,
  progradePitch,
  startAscent,
  startTli,
  stepAscent,
  velocities,
  type Ascent,
  type AscentEvent,
} from '../data/saturnAscent'

// 月ミッション（アポロ17号の追体験）。第1弾は「打ち上げ」：夜の発射台 → 上昇 → 地球を回る → 月へ向けて点火。
// 宇宙の場面を止めて、別の Canvas（components/moonMission/MoonMissionView）で描く。
// 流れ：none → fadeIn →（observe 観察 → timelapse）→ pad（カウントダウン）→ ascent（上昇）→ orbit（地球を回る）→ tli（月へ向かう燃焼）→ outbound（地球が遠ざかる）→ leave → none
//
// 物理は data/saturnAscent.ts（本物の推力・重さ・燃える時間）。時間は場面ごとに早送りする（warp）。

export type MissionPhase =
  | 'none'
  | 'fadeIn'
  // 章0 の始まり（state/saturnExplorer.ts）：夕方の発射台でサターンV を見る → タイムラプスで打ち上げの夜へ
  | 'observe'
  | 'timelapse'
  | 'pad'
  | 'ascent'
  | 'orbit'
  | 'tli'
  | 'outbound'
  // 章3・4（state/moonDock.ts）
  | 'dock'
  | 'marble'
  // 第2弾（state/moonLunar.ts）
  | 'coast'
  | 'loi'
  | 'undock'
  | 'descent'
  | 'landed'
  // 章8（state/moonReturn.ts）
  | 'home'
  | 'leave'
/**
 * pad：地上から見上げる、chase：ロケット・宇宙船のうしろから、onboard：ロケットにつけたカメラで後ろを見る、
 * window：着陸船の船長の窓から、wide：遠くから、film：打ち上げの映画（曲に合わせて自動でカットを切りかえる）
 */
export type MissionCam = 'film' | 'pad' | 'chase' | 'onboard' | 'window' | 'wide'

export const MISSION_FADE = 0.8
/** 観察パートから打ち上げの夜へのタイムラプスの長さ（秒） */
export const TIMELAPSE = 12
/** カウントダウンを始める時刻（打ち上げの何秒前） */
export const COUNT_FROM = 20
/** 点火の手順を始める時刻（本物は T-8.9 秒） */
export const IGNITION_AT = 8.9
/** この時刻（T-）までに点火しなければ、自動で点火する */
export const AUTO_IGNITE = 6
/** 地球を回ってから、月へ向かう点火の「窓」が開くまで（軌道の秒） */
export const TLI_WINDOW_OPEN = 2400
/** 窓の幅（軌道の秒）。窓の真ん中で押すと ★ */
export const TLI_WINDOW = 600
/** 月へ向かう燃焼が終わってから、絵の時計を止めるまで（秒）。本物の第3段からの切り離しは燃焼の約 24 分後 */
export const OUTBOUND_STOP = 1440
/** 機首を動かす速さ（度/秒） */
export const PITCH_RATE = 7

/** 記録（いちばん良い星の数と、たどり着いた所。land：着陸のいちばん良い星） */
type MissionRecord = { stars: number; reached: number; land?: number; chapter?: number }
const record = saveSlot<MissionRecord>('moon-mission', { stars: 0, reached: 0 }, (v) =>
  typeof v === 'object' && v !== null && typeof (v as MissionRecord).stars === 'number' ? (v as MissionRecord) : null,
)

type MissionState = {
  phase: MissionPhase
  since: number
  cam: MissionCam
  /** カメラを自分で選んだ（自動の切り替えをしない） */
  camLocked: boolean
  /** おまかせ（機首を自動で手本に合わせる） */
  auto: boolean
  /** 打ち上げまでの残り秒（pad のあいだ）。打ち上げ後は 0 */
  countdown: number
  /** 点火した（エンジンの火が入った）時刻（T-）。まだなら null */
  ignitedAt: number | null
  /** 画面の字幕（出来事） */
  caption: { key: CaptionKey; at: number } | null
  /** 手本とのずれの平均（度）と、その時間 */
  errSum: number
  errTime: number
  /** 月へ向かう点火の押しどころ（窓の中心からのずれ、軌道の秒）。null はまだ */
  tliTiming: number | null
  /** 星（0〜3）。終わりのカードで出す */
  stars: number
  best: MissionRecord
}

export type CaptionKey =
  | 'ignition'
  | 'liftoff'
  | 'towerClear'
  | 'maxQ'
  | 'centerCutoff'
  | 's2CenterCutoff'
  | 'stage1Sep'
  | 'stage2Ign'
  | 'interstage'
  | 'les'
  | 'stage2Sep'
  | 'stage3Ign'
  | 'orbit'
  | 'sunrise'
  | 'tliWindow'
  | 'tliIgnition'
  | 'tliCutoff'
  // 章3・4
  | 'tdSep'
  | 'tdTurn'
  | 'tdApproach'
  | 'capture'
  | 'hardDock'
  | 'bounceFast'
  | 'bounceOff'
  | 'ejectLater'
  | 'ejected'
  | 'evade'
  | 'marble'
  // 章8
  | 'rvApproach'
  | 'rvDock'
  | 'lmJettison'
  | 'teiWait'
  | 'tei'
  | 'coastHome'
  | 'cmSep'
  | 'corridor'
  | 'entryInterface'
  | 'blackout'
  | 'blackoutEnd'
  | 'skipOut'
  | 'tooSteep'
  | 'drogue'
  | 'mains'
  | 'splash'
  | 'recoveryHeli'
  | 'recoveryCollar'
  // 第2弾
  | 'coast'
  | 'coastMoon'
  | 'approach'
  | 'los'
  | 'aos'
  | 'loiWindow'
  | 'loiIgnition'
  | 'loiCutoff'
  | 'undock'
  | 'legs'
  | 'separation'
  | 'pdiWindow'
  | 'pdi'
  | 'landLong'
  | 'radar'
  | 'throttleDown'
  | 'highGate'
  | 'lowGate'
  | 'manual'
  | 'lowFuel'
  | 'call60'
  | 'call30'
  | 'contact'
  | 'touchdown'
  | 'outOfFuel'

/** 確認用の動画を撮るときは、画面の時計をコマ送りの時計にする（film.t が null でなければそれを使う） */
export const film = { t: null as number | null }
export const missionNow = () => film.t ?? performance.now() / 1000

export const useMoonMission = create<MissionState>(() => ({
  phase: 'none',
  since: 0,
  cam: 'film',
  camLocked: false,
  auto: false,
  countdown: COUNT_FROM,
  ignitedAt: null,
  caption: null,
  errSum: 0,
  errTime: 0,
  tliTiming: null,
  stars: 0,
  best: record.load(),
}))

/** 宇宙の場面を止めて、この場面を出しているか */
export const missionScene = (p: MissionPhase) => p !== 'none' && p !== 'fadeIn'

// ---- 動いている物理（毎フレーム書きかえるので、zustand の外に置く） ----------------------------

export const sim = {
  a: startAscent(),
  /** 機首の向き（度、真上から東へ） */
  pitch: 0,
  /** 時間の早送り（物理の秒 / 画面の秒） */
  warp: 1,
  /** 地球を回り始めた時刻（物理の秒） */
  orbitAt: 0,
  /** 月へ向かう燃焼を始めた時刻 */
  tliAt: 0,
  /** 月へ向かう燃焼が終わった時刻 */
  tliEnd: 0,
  /** マックスQ を過ぎたか */
  maxQ: false,
  qPeak: 0,
  /** 日の出を見たか */
  sunrise: false,
  /** 段を切り離した時刻（演出のため） */
  sepAt: { s1: -1, ring: -1, les: -1, s2: -1 },
  /** 物理の出来事（場面の部品が読む。読み終わったら空にする） */
  events: [] as AscentEvent[],
  /** 手本の道すじ（打ち上げから軌道まで、物理の座標） */
  path: [] as [number, number][],
  /** 飛んできた道すじ（[打ち上げ場からの距離 km, 高さ km]、物理の 2 秒ごと）。断面図に描く */
  track: [] as [number, number][],
  /** 切り離した第1段が海へ落ちていく道（[物理の秒, 距離 km, 高さ km]）。切り離しの瞬間に計算しておく */
  s1Fall: [] as [number, number, number][],
  /** 第1段を切り離した映像が終わり、計器やカメラの切り替えを始めた画面の時刻（missionNow）。まだなら -1 */
  showAt: -1,
}

/** 断面図の座標：打ち上げ場からの距離（km）と高さ（km） */
export const trackPoint = (x: number, y: number): [number, number] => [(Math.atan2(y, x) * R_EARTH) / 1000, (Math.hypot(x, y) - R_EARTH) / 1000]

/** 切り離した第1段の落ちる道（重さと空気の抵抗だけ。LaunchWorld の破片と同じ式） */
function fallPath(a: Ascent) {
  let { x, y, vx, vy } = a
  const out: [number, number, number][] = []
  for (let t = 0; t < 1200; t += 0.5) {
    const r = Math.hypot(x, y)
    if (r < R_EARTH) break
    if (t % 4 === 0) out.push([a.t + t, ...trackPoint(x, y)])
    const g = 3.986004e14 / (r * r)
    const rho = r - R_EARTH < 120_000 ? 1.225 * Math.exp(-(r - R_EARTH) / 7200) : 0
    const drag = rho * Math.hypot(vx, vy) * 0.004
    vx += (-g * (x / r) - drag * vx) * 0.5
    vy += (-g * (y / r) - drag * vy) * 0.5
    x += vx * 0.5
    y += vy * 0.5
  }
  out.push([a.t + out.length * 4, ...trackPoint(x, y)])
  return out
}

/** 計器のカードとカメラの切り替えの拍（画面の秒）。まだ始まっていなければ null */
export function showBeat() {
  return sim.showAt < 0 ? null : missionNow() - sim.showAt
}

/** 手本どおりに飛んだときの道すじ（線で見せる） */
function idealPath() {
  const a = startAscent()
  const pts: [number, number][] = []
  for (let i = 0; i < 20 * 900 && !a.cutoff; i++) {
    stepAscent(a, 0.05, guidePitch(a))
    if (i % 20 === 0) pts.push([a.x, a.y])
  }
  pts.push([a.x, a.y])
  return pts
}

// ---- 入力 -----------------------------------------------------------------------------------

/** -1（立てる）〜 +1（倒す）。キー・画面のボタン */
export const missionInput = { tilt: 0, ignite: false }

function onKey(e: KeyboardEvent, down: boolean) {
  const k = e.key.toLowerCase()
  const s = useMoonMission.getState()
  if (s.phase === 'none') return
  if (k === 'arrowright' || k === 'd') missionInput.tilt = down ? 1 : missionInput.tilt === 1 ? 0 : missionInput.tilt
  else if (k === 'arrowleft' || k === 'a') missionInput.tilt = down ? -1 : missionInput.tilt === -1 ? 0 : missionInput.tilt
  else if (k === ' ' || k === 'enter') {
    missionInput.ignite = down
    if (down) pressGo()
  } else if (k === 'c' && down) cycleCam()
  else if (k === 'escape' && down) endMission()
  else return
  e.preventDefault()
}

export function bindMissionKeys() {
  const d = (e: KeyboardEvent) => onKey(e, true)
  const u = (e: KeyboardEvent) => onKey(e, false)
  window.addEventListener('keydown', d)
  window.addEventListener('keyup', u)
  return () => {
    window.removeEventListener('keydown', d)
    window.removeEventListener('keyup', u)
  }
}

// ---- 流れ -----------------------------------------------------------------------------------

/** 第2弾（月の近くから）を始める関数。state/moonLunar.ts が入れる（読み込みの順のため） */
export const chapterHooks = { startLunar: null as null | (() => void) }

/** ナビから：発射台から始める。moon なら第2弾（月に近づくところ）から */
export function startMoonMission(chapter: 'launch' | 'moon' = 'launch', after?: () => void) {
  if (useMoonMission.getState().phase !== 'none') return
  sim.a = startAscent()
  sim.pitch = 0
  sim.warp = 1
  sim.orbitAt = 0
  sim.tliAt = 0
  sim.tliEnd = 0
  sim.maxQ = false
  sim.qPeak = 0
  sim.sunrise = false
  sim.sepAt = { s1: -1, ring: -1, les: -1, s2: -1 }
  sim.events = []
  sim.track = []
  sim.s1Fall = []
  sim.showAt = -1
  if (!sim.path.length) sim.path = idealPath()
  missionInput.tilt = 0
  missionInput.ignite = false
  useMoonMission.setState({
    phase: 'fadeIn',
    since: missionNow(),
    cam: 'film',
    camLocked: false,
    auto: false,
    countdown: COUNT_FROM,
    ignitedAt: null,
    caption: null,
    errSum: 0,
    errTime: 0,
    tliTiming: null,
    stars: 0,
    best: record.load(),
  })
  useStore.getState().setMode('flight')
  stopRadio()
  stopMusic()
  holdBgm('mission', true)
  preloadRadio(chapter === 'moon' ? 'landed' : 'liftoff')
  if (chapter !== 'moon') preloadRadio('tli')
  preloadMusic(chapter === 'moon' ? 'mars' : 'jupiterOpening')
  setTimeout(() => {
    if (useMoonMission.getState().phase !== 'fadeIn') return
    if (chapter === 'moon' && chapterHooks.startLunar) chapterHooks.startLunar()
    else useMoonMission.setState({ phase: 'pad', since: missionNow() })
    after?.()
  }, MISSION_FADE * 1000)
}

/** どの章まで進んだかを残す（次に開いたとき「続きから」を出す） */
export function saveChapter(chapter: number) {
  const b = useMoonMission.getState().best
  if (b.chapter === chapter) return
  const best = { ...b, chapter }
  record.save(best)
  useMoonMission.setState({ best })
}

/** 第1弾の終わりから、続けて月へ */
export function continueToMoon() {
  chapterHooks.startLunar?.()
}

/** 記録を足す（星は良いほうを残す） */
export function saveMissionRecord(r: { stars?: number; land?: number; reached: number }) {
  const b = useMoonMission.getState().best
  const best = { ...b, stars: Math.max(b.stars, r.stars ?? 0), reached: Math.max(b.reached, r.reached), land: Math.max(b.land ?? 0, r.land ?? 0) }
  record.save(best)
  useMoonMission.setState({ best })
}

export function endMission() {
  const s = useMoonMission.getState()
  if (s.phase === 'none' || s.phase === 'leave') return
  stopRadio()
  stopMusic(MISSION_FADE)
  holdBgm('mission', false)
  useMoonMission.setState({ phase: 'leave', since: missionNow() })
  setTimeout(() => useMoonMission.setState({ phase: 'none', since: missionNow() }), MISSION_FADE * 1000)
}

/** もう一度、発射台から */
export function restartMission() {
  stopRadio()
  stopMusic()
  useMoonMission.setState({ phase: 'none' })
  startMoonMission()
  useMoonMission.setState({ phase: 'pad', since: missionNow() })
}

/** 見出しをきっかけに始める曲（ホルスト「惑星」）。着陸の瞬間は音楽を止めて、本物の声だけにする */
const MUSIC_AT: Partial<Record<CaptionKey, MusicCue | 'stop'>> = {
  ignition: 'jupiterOpening',
  orbit: 'jupiterHymn',
  // 章3：第3段から離れて向きを変え、着陸船を迎えに行く（宇宙のワルツ）。章4：青い地球と 3 日の旅
  tdSep: 'blueDanube',
  marble: 'neptune',
  lowGate: 'mars',
  contact: 'stop',
  touchdown: 'stop',
  outOfFuel: 'stop',
  // 章8：火の玉のあいだは音楽を止める（パラシュートの曲は、新しい曲を取りこむときに決める）
  // 主旋律（賛歌）は軌道の日の出の 1 回だけ（junji 2026-11-22「主旋律を使うのは一回でいい」）
  entryInterface: 'stop',
}

export function setCaption(key: CaptionKey) {
  useMoonMission.setState({ caption: { key, at: missionNow() } })
  const cue = MUSIC_AT[key]
  if (cue === 'stop') stopMusic(0.6)
  else if (cue) playMusic(cue)
}

export function setAuto(auto: boolean) {
  useMoonMission.setState({ auto })
}

const CAMS: MissionCam[] = ['film', 'pad', 'chase', 'onboard']
/** 第2弾のカメラ（着陸船が離れてからは窓も） */
const LUNAR_CAMS: MissionCam[] = ['chase', 'window', 'wide']
/** 章3・4 のカメラ（state/moonDock.ts の DOCK_CAMS と同じ。読み込みの順のためここにも） */
const DOCK_CAMS: MissionCam[] = ['window', 'chase', 'wide']
const LM_CAMS: MissionCam[] = ['chase', 'window', 'wide']
/** いまの場面で選べるカメラ（順番どおり。先頭がおすすめ） */
export function camChoices(): MissionCam[] {
  const s = useMoonMission.getState()
  if (s.phase === 'dock' || s.phase === 'marble' || s.phase === 'home') return DOCK_CAMS
  if (s.phase === 'coast' || s.phase === 'loi' || s.phase === 'undock' || s.phase === 'descent' || s.phase === 'landed') return s.phase === 'descent' || s.phase === 'landed' ? LM_CAMS : LUNAR_CAMS
  // 宇宙に出たら（地球を回る・月へ向かう）、司令船の窓からの眺めも選べる。自動のカメラは、発射台と上がっていくあいだだけ
  const cams: MissionCam[] = s.phase === 'orbit' || s.phase === 'tli' || s.phase === 'outbound' ? [...CAMS.filter((c) => c !== 'film'), 'window'] : CAMS
  // 高く上がったら、地上のカメラからは小さな点にしか見えないので出さない
  return s.phase !== 'pad' && altitude(sim.a) > 30_000 ? cams.filter((c) => c !== 'pad') : cams
}

/** カメラを選ぶ（自分で選んだら、自動の切り替えはしない。自動のカメラを選んだときは、また自動にまかせる） */
export function pickCam(cam: MissionCam) {
  useMoonMission.setState({ cam, camLocked: cam !== 'film' })
}

/** 次のカメラへ（キーボードの C） */
export function cycleCam() {
  const s = useMoonMission.getState()
  const list = camChoices()
  pickCam(list[(list.indexOf(s.cam) + 1) % list.length])
}

/** 自動のカメラの切り替え（自分で選んでいないとき） */
export function autoCam(cam: MissionCam) {
  const s = useMoonMission.getState()
  if (!s.camLocked && s.cam !== cam) useMoonMission.setState({ cam })
}

/** 「点火」ボタン・スペース：発射台では点火、地球を回っているあいだは月へ向かう点火 */
export function pressGo() {
  const s = useMoonMission.getState()
  if (s.phase === 'pad' && s.ignitedAt === null && s.countdown <= IGNITION_AT + 0.6) ignite(s.countdown)
  else if (s.phase === 'orbit') {
    const t = sim.a.t - sim.orbitAt
    if (t >= TLI_WINDOW_OPEN) beginTli(t - (TLI_WINDOW_OPEN + TLI_WINDOW / 2))
  }
}

function ignite(at: number) {
  useMoonMission.setState({ ignitedAt: at })
  setCaption('ignition')
}

function beginTli(offset: number) {
  startTli(sim.a)
  sim.tliAt = sim.a.t
  useMoonMission.setState({ phase: 'tli', since: missionNow(), tliTiming: offset })
  setCaption('tliIgnition')
}

// ---- 毎フレーム -------------------------------------------------------------------------------

/** 場面ごとの早送り（物理の秒 / 画面の秒）。出来事の前後はゆっくり見せる */
function warpFor(phase: MissionPhase, a: Ascent) {
  if (phase === 'ascent') {
    const near = (t: number) => t >= 0 && Math.abs(a.t - t) < 4
    if (a.t < 22) return 1
    if (near(sim.sepAt.s1) || near(sim.sepAt.ring) || near(sim.sepAt.les) || near(sim.sepAt.s2)) return 1.5
    if (a.stage === 0) return a.t > 150 ? 2 : 4
    // 第2段・第3段は、計器とカメラの切り替えを見せながら、少し速く（前は 10 倍・5 倍で、同じ絵が 40 秒・30 秒続いていた）
    if (a.stage === 1) return 14
    return 7
  }
  if (phase === 'orbit') {
    const t = a.t - sim.orbitAt
    if (t < 8) return 2
    // 窓の前後はゆっくり（押しやすく）
    if (t > TLI_WINDOW_OPEN - 200 && t < TLI_WINDOW_OPEN + TLI_WINDOW + 60) return 30
    return 140
  }
  if (phase === 'tli') return a.cutoff ? 20 : 10
  if (phase === 'outbound') {
    // 章3（第3段からの切り離し・燃焼の 24 分後）の時刻で止める。終わりのカードのうしろで時計が進みすぎないように
    const t = a.t - sim.tliEnd
    return Math.max(0, Math.min(60 + Math.min(1600, t * 4), (OUTBOUND_STOP - t) * 0.6))
  }
  return 1
}

/** 画面の dt 秒ぶん進める（MoonMissionView の useFrame から呼ぶ） */
export function tickMission(dt: number) {
  const s = useMoonMission.getState()
  const a = sim.a
  dt = Math.min(dt, 0.1)
  if (s.phase === 'timelapse') {
    if (missionNow() - s.since >= TIMELAPSE) useMoonMission.setState({ phase: 'pad', since: missionNow(), countdown: COUNT_FROM })
    return
  }
  if (s.phase === 'pad') {
    const countdown = s.countdown - dt
    let ignitedAt = s.ignitedAt
    if (ignitedAt === null && countdown <= AUTO_IGNITE) {
      ignite(countdown)
      ignitedAt = countdown
    }
    // 本物の実況：秒読み 10 秒前から流し、離昇の瞬間を合わせる
    if (s.countdown > LIFTOFF_AT && countdown <= LIFTOFF_AT) playRadio('liftoff', LIFTOFF_AT - countdown)
    if (countdown <= 0) {
      useMoonMission.setState({ phase: 'ascent', since: missionNow(), countdown: 0 })
      setCaption('liftoff')
      return
    }
    useMoonMission.setState({ countdown })
    return
  }
  if (s.phase !== 'ascent' && s.phase !== 'orbit' && s.phase !== 'tli' && s.phase !== 'outbound') return
  sim.warp = warpFor(s.phase, a)
  // 機首
  const guide = s.phase === 'ascent' ? guidePitch(a) : progradePitch(a)
  // 映画のカメラのあいだは、手本どおりに自動で飛ぶ（星の数には数えない）
  const filmAuto = s.cam === 'film'
  if (s.phase === 'ascent' && !s.auto && !filmAuto && a.t > 12 && !a.cutoff) {
    sim.pitch += missionInput.tilt * PITCH_RATE * dt
    // 第3段は誘導におまかせ（本物も最後は自動）
    if (a.stage === 2) sim.pitch += (guide - sim.pitch) * Math.min(1, dt * 2)
  } else if (s.phase === 'ascent') {
    sim.pitch += (guide - sim.pitch) * Math.min(1, dt * 3)
  } else {
    // 軌道の上では、いつも進む向き（月へ向かう燃焼も、早送りの中で遅れないように）
    sim.pitch = guide
  }
  sim.pitch = Math.max(-10, Math.min(110, sim.pitch))
  // ずれの記録（操縦する第1・第2段だけ）
  if (s.phase === 'ascent' && !s.auto && !filmAuto && a.t > 14 && a.stage < 2 && a.thrust > 0) {
    useMoonMission.setState({ errSum: s.errSum + Math.abs(sim.pitch - guide) * dt, errTime: s.errTime + dt })
  }
  // 物理
  let left = dt * sim.warp
  const maxStep = a.cutoff ? (altitude(a) > 1_000_000 ? 20 : 1) : 0.05
  const out: AscentEvent[] = []
  while (left > 1e-6) {
    const h = Math.min(maxStep, left)
    stepAscent(a, h, s.phase === 'ascent' ? sim.pitch : a.cutoff ? progradePitch(a) : sim.pitch, out)
    left -= h
  }
  if (!sim.maxQ && a.t > 30) {
    if (a.q > sim.qPeak) sim.qPeak = a.q
    else if (a.q < sim.qPeak * 0.97) {
      sim.maxQ = true
      setCaption('maxQ')
    }
  }
  if (s.phase === 'ascent' && a.t > 9 && a.t - dt * sim.warp <= 9) setCaption('towerClear')
  if (s.phase === 'ascent') {
    if (a.t >= sim.track.length * 2) sim.track.push(trackPoint(a.x, a.y))
    // 第1段を切り離した映像（機体カメラ）が終わったら、計器のカードとカメラの切り替えを始める
    if (sim.showAt < 0 && sim.sepAt.s1 > 0 && a.t - sim.sepAt.s1 > 14) sim.showAt = missionNow()
  }
  for (const e of out) {
    sim.events.push(e)
    if (e === 'stage1Sep') {
      sim.sepAt.s1 = a.t
      sim.s1Fall = fallPath(a)
    }
    if (e === 'interstage') sim.sepAt.ring = a.t
    if (e === 'les') sim.sepAt.les = a.t
    if (e === 'stage2Sep') sim.sepAt.s2 = a.t
    if (e === 'orbit') {
      sim.orbitAt = a.t
      useMoonMission.setState({ phase: 'orbit', since: missionNow() })
      setCaption('orbit')
    } else if (e === 'tliCutoff') {
      sim.tliEnd = a.t
      useMoonMission.setState({ phase: 'outbound', since: missionNow() })
      setCaption('tliCutoff')
      finish()
    } else setCaption(e)
  }
  // 地球を回っているあいだ：窓が開いたら知らせ、閉じても押さなければ自動で点火
  if (useMoonMission.getState().phase === 'orbit') {
    const t = a.t - sim.orbitAt
    const before = t - dt * sim.warp
    if (t >= TLI_WINDOW_OPEN && before < TLI_WINDOW_OPEN) {
      setCaption('tliWindow')
      // 本物の「月へ行っていいぞ」
      playRadio('tli')
    }
    if (t >= TLI_WINDOW_OPEN + TLI_WINDOW) beginTli(TLI_WINDOW / 2)
  }
}

/** 終わり：星を決めて記録する */
function finish() {
  const s = useMoonMission.getState()
  const mean = s.errTime > 0 ? s.errSum / s.errTime : 99
  let stars = s.auto || s.errTime < 30 ? 1 : mean < 3 ? 3 : mean < 7 ? 2 : 1
  // 月へ向かう点火がぴったりなら、そのぶん 1 つ減らさない（ずれが大きいと 1 つ減る）
  if (s.tliTiming !== null && Math.abs(s.tliTiming) > TLI_WINDOW * 0.35) stars = Math.max(1, stars - 1)
  useMoonMission.setState({ stars })
  saveMissionRecord({ stars, reached: 1 })
}

/** HUD に出す数字（毎フレーム読む） */
export function missionReadout() {
  const a = sim.a
  const v = velocities(a)
  const o = orbitOf(a)
  return {
    t: a.t,
    alt: altitude(a),
    speed: v.speed,
    g: a.accel / 9.80665,
    stage: a.stage,
    guide: guidePitch(a),
    pitch: sim.pitch,
    peri: o.peri,
    apo: o.apo,
    prop: a.prop,
    thrust: a.thrust,
    warp: sim.warp,
  }
}

/** テスト・確認用：物理の時刻 t（打ち上げからの秒）まで一気に進める（おまかせで） */
export function debugSkip(t: number) {
  const s = useMoonMission.getState()
  if (s.phase === 'pad') useMoonMission.setState({ phase: 'ascent', countdown: 0, ignitedAt: 1 })
  useMoonMission.setState({ auto: true })
  let guard = 0
  while (sim.a.t < t && guard++ < 200_000 && useMoonMission.getState().phase !== 'none') tickMission(0.1)
}
