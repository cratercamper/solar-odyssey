import { create } from 'zustand'
import { GET, EARTH_MOON, R_EARTH, R_MOON_M, coastDistance, coastSpeed } from '../data/apolloTimeline'
import {
  CORRIDOR,
  DROGUE_ALT,
  EI_ALT,
  EI_ANGLE,
  MAIN_ALT,
  chuteSpeed,
  entryAuto,
  entryResult,
  entryStars,
  heating,
  blackout,
  startEntry,
  stepEntry,
  type Entry,
  type EntryEnd,
} from '../data/reentry'
import { stopRadio } from '../audio/radio'
import { playMusic, preloadMusic, stopMusic } from '../audio/missionMusic'
import { missionNow, saveMissionRecord, setCaption, useMoonMission } from './moonMission'

// アポロ17号の追体験・章8「離陸・再会・地球へ帰還」（components/moonMission/ReturnWorld.tsx・ReturnHud.tsx）。
// 流れ（phase 'home' の中の段階）：
//   rdv（月を回る司令船アメリカ号へ、上の段チャレンジャー号が近づく）→ docked（つないだ）→ lmGone（上の段を切り離す。あとで月に落とす）
//   → teiWait（月の裏で、地球へ向かう点火を待つ）→ tei（143.7 秒の点火）→ coast（2 日半の帰り道）
//   → cmSep（司令船だけになる）→ corridor（大気に入る角度を守る）→ entry（火の玉。揚力の向きで G をおさえる）
//   → chutes（ドローグ → 主パラシュート 3 つ）→ splash（太平洋に着水）→ end
//   失敗（大気にはじかれた・G が強すぎた）は fail。角度からやり直せる
// 物理は data/reentry.ts。時間は段階ごとに早送りする。

export type ReturnStep =
  | 'rdv'
  | 'docked'
  | 'lmGone'
  | 'teiWait'
  | 'tei'
  | 'coast'
  | 'eva'
  | 'cmSep'
  | 'corridor'
  | 'entry'
  | 'fail'
  | 'chutes'
  | 'splash'
  | 'recovery'
  | 'end'

/** 場面の長さ（秒） */
export const RDV_TIME = 16
const DOCKED_TIME = 6
export const LMGONE_TIME = 10
/** 点火を待つ（押さなければ、この秒でおまかせ点火） */
const TEI_WAIT = 14
/** 本物の点火 143.7 秒を、12 倍で */
export const TEI_BURN = 143.7
export const TEI_WARP = 12
/** 帰り道は 2 つに分ける：船外活動の前（月が遠ざかる）と後（地球が近づく） */
export const COAST_A = 7
export const COAST_B = 10
/** エバンス飛行士の船外活動（本物は 1 時間 5 分 44 秒。ここでは約 160 倍の早送り） */
export const EVA_TIME = 24
/** 船外活動の中で、フィルムを取り出す時刻（秒） */
export const EVA_FILM_AT = 9
export const CMSEP_TIME = 8
export const CORRIDOR_TIME = 15
const SPLASH_TIME = 9
/** 回収：ヘリコプターが来て、潜水員が浮き輪をつける（本物は何十分もかかった。ここでは短く） */
export const RECOVERY_TIME = 26
/** 回収の中で、潜水員が飛びこむ時刻（秒） */
export const SWIMMERS_AT = 10
/** 再突入の早送り */
export const ENTRY_WARP = 10
/** ランデブーの始まりの、2 つの船のへだたり（m） */
export const RDV_GAP = 60

type ReturnState = {
  step: ReturnStep
  since: number
  /** 大気に入った角度（度）。corridor のあいだは動く */
  angle: number | null
  /** 失敗のわけ */
  fail: EntryEnd
  peakG: number
  stars: number
  /** 主パラシュートが開いた */
  mains: boolean
}

export const useMoonReturn = create<ReturnState>(() => ({ step: 'rdv', since: 0, angle: null, fail: null, peakG: 0, stars: 0, mains: false }))

/** 毎フレーム書きかえる数字 */
export const ret = {
  /** その段階に入ってからの秒（画面の時間） */
  t: 0,
  /** ランデブー：探り棒の先から口まで（m） */
  gap: RDV_GAP,
  /** 角度の目盛り（度）と、そのゆれの速さ */
  angle: EI_ANGLE,
  drift: 0,
  /** 入力：上（+1）・下（-1） */
  input: 0,
  auto: false,
  /** 再突入の物理（entry のあいだ） */
  e: null as Entry | null,
  /** 揚力の向き（いまの目標） */
  want: 1,
  /** 熱の強さ（0〜1）と、たまった熱（焦げ） */
  heat: 0,
  char: 0,
  /** パラシュート：高さ（m）、ドローグ・主パラシュートを開いた画面の時刻（秒） */
  h: DROGUE_ALT,
  drogueAt: -1,
  mainAt: -1,
  /** 着水してからの秒 */
  splashT: 0,
  /** 本物の経過時間（帯の時計） */
  get: GET.lunarDock - 600,
  /** 帰り道の、船外活動の前（0）・後（1） */
  coastLeg: 0,
}

/** 帰り道の進み具合（0：点火の直後 〜 1：機械船を切り離す時）。船外活動は本物の時刻の所 */
const P_EVA = (GET.evaStart - GET.tei - TEI_BURN) / (GET.cmSep - GET.tei - TEI_BURN)
export function coastK(step: ReturnStep, t: number) {
  if (step === 'eva') return P_EVA
  if (step !== 'coast') return 1
  return ret.coastLeg === 0 ? P_EVA * Math.min(1, t / COAST_A) : P_EVA + (1 - P_EVA) * Math.min(1, t / COAST_B)
}

const set = (step: ReturnStep, more: Partial<ReturnState> = {}) => {
  ret.t = 0
  useMoonReturn.setState({ step, since: missionNow(), ...more })
}

const inHome = () => useMoonMission.getState().phase === 'home'

/** 章8 を始める */
export function startReturn() {
  stopRadio()
  stopMusic(1)
  Object.assign(ret, { t: 0, gap: RDV_GAP, angle: EI_ANGLE, drift: 0, input: 0, auto: false, e: null, want: 1, heat: 0, char: 0, h: DROGUE_ALT, drogueAt: -1, mainAt: -1, splashT: 0, get: GET.lunarDock - 600, coastLeg: 0 })
  useMoonReturn.setState({ step: 'rdv', since: missionNow(), angle: null, fail: null, peakG: 0, stars: 0, mains: false })
  useMoonMission.setState({ phase: 'home', since: missionNow(), cam: 'chase', camLocked: false, auto: false, caption: null })
  setCaption('rvApproach')
}

export function setReturnAuto(on: boolean) {
  ret.auto = on
  useMoonMission.setState({ auto: on })
}

/** 地球へ向かう点火（ボタン・スペース） */
export function pressTei() {
  if (!inHome() || useMoonReturn.getState().step !== 'teiWait') return
  set('tei')
  setCaption('tei')
  // 家へ帰る：「新世界より」の第2楽章（同じ曲は 2 度使わない。junji 2026-11-22）
  playMusic('newWorld')
}

/** 角度を決める段階から、もう一度 */
export function retryEntry() {
  ret.e = null
  ret.heat = 0
  ret.char = 0
  beginCorridor()
}

function beginCorridor() {
  // 本物の角度から少しずれた所から（自分で戻す）
  const off = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.6)
  ret.angle = EI_ANGLE + off
  ret.drift = -off * 0.02
  ret.input = 0
  set('corridor', { angle: null, fail: null, peakG: 0, mains: false })
  setCaption('corridor')
}

/** 帯の数字：本物の経過時間、地球の表面から、月の表面まで、速さ、どちらの近く */
export function returnJourney() {
  const step = useMoonReturn.getState().step
  const t = ret.t
  const lunar = step === 'rdv' || step === 'docked' || step === 'lmGone' || step === 'teiWait' || step === 'tei'
  if (lunar) {
    const far = EARTH_MOON - R_EARTH - R_MOON_M
    // 月を回る高さ 約 115 km、速さ 約 1.63 km/s。点火で 928 m/s 加わる
    const dv = step === 'tei' ? Math.min(1, (t * TEI_WARP) / TEI_BURN) * 928 : 0
    return { get: ret.get, fromEarth: far, toMoon: 115_000 + (step === 'tei' ? t * t * 60 : 0), speed: 1630 + dv, near: 'moon' as const }
  }
  let r: number
  if (step === 'coast' || step === 'eva') r = coastDistance(1 - coastK(step, t))
  else if (step === 'cmSep') r = R_EARTH + 36_000_000 - (27_000_000 * Math.min(1, t / CMSEP_TIME))
  else if (step === 'corridor') r = R_EARTH + EI_ALT + (9_000_000 - EI_ALT) * Math.pow(1 - Math.min(1, t / CORRIDOR_TIME), 1.5)
  else if (step === 'entry' || step === 'fail') {
    const e = ret.e
    return { get: ret.get, fromEarth: e ? e.h : EI_ALT, toMoon: EARTH_MOON, speed: e ? e.v : 11_000, near: 'earth' as const }
  } else {
    const h = step === 'chutes' ? ret.h : 0
    return { get: ret.get, fromEarth: h, toMoon: EARTH_MOON, speed: step === 'chutes' ? chuteSpeed(h) : 0, near: 'earth' as const }
  }
  return { get: ret.get, fromEarth: r - R_EARTH, toMoon: Math.max(0, EARTH_MOON - r - R_MOON_M), speed: coastSpeed(r), near: 'earth' as const }
}

/** いまの高さ（パラシュート・海の場面で使う） */
export const chuteAlt = () => ret.h

// ---- 毎フレーム -----------------------------------------------------------------------------------

export function tickReturn(dt: number) {
  if (!inHome()) return
  ret.t += dt
  const s = useMoonReturn.getState()
  const t = ret.t
  switch (s.step) {
    case 'rdv': {
      // 最後の 60 m：はじめ秒速 1 m ほど、つなぐ前はゆっくり
      const k = Math.min(1, t / RDV_TIME)
      ret.gap = RDV_GAP * Math.pow(1 - k, 2.2)
      ret.get = GET.lunarDock - 600 + k * 600
      if (t >= RDV_TIME) {
        ret.gap = 0
        set('docked')
        setCaption('rvDock')
      }
      break
    }
    case 'docked':
      ret.get = GET.lunarDock + t * 20
      if (t >= DOCKED_TIME) {
        set('lmGone')
        setCaption('lmJettison')
      }
      break
    case 'lmGone':
      ret.get = GET.lmJettison + t * 6
      if (t >= LMGONE_TIME) {
        set('teiWait')
        preloadMusic('newWorld')
        preloadMusic('newWorldFinale')
        preloadMusic('venus')
        setCaption('teiWait')
      }
      break
    case 'teiWait':
      ret.get = GET.tei - Math.max(0, TEI_WAIT - t) * 10
      if (t >= TEI_WAIT) pressTei()
      break
    case 'tei':
      ret.get = GET.tei + Math.min(TEI_BURN, t * TEI_WARP)
      if (t * TEI_WARP >= TEI_BURN + 18) {
        ret.coastLeg = 0
        set('coast')
        setCaption('coastHome')
      }
      break
    case 'coast':
      ret.get = GET.tei + TEI_BURN + (GET.cmSep - GET.tei - TEI_BURN) * coastK('coast', t)
      if (ret.coastLeg === 0 && t >= COAST_A) {
        set('eva')
        setCaption('evaOut')
      } else if (ret.coastLeg === 1 && t >= COAST_B) {
        set('cmSep')
        setCaption('cmSep')
      }
      break
    case 'eva':
      ret.get = GET.evaStart + (GET.evaEnd - GET.evaStart) * Math.min(1, t / EVA_TIME)
      if (t >= EVA_FILM_AT && t - dt < EVA_FILM_AT) setCaption('evaFilm')
      if (t >= EVA_TIME) {
        ret.coastLeg = 1
        set('coast')
        setCaption('coastEarth')
      }
      break
    case 'cmSep':
      ret.get = GET.cmSep + (t / CMSEP_TIME) * 300
      if (t >= CMSEP_TIME) beginCorridor()
      break
    case 'corridor': {
      ret.get = GET.cmSep + 300 + (GET.entry - GET.cmSep - 300) * Math.min(1, t / CORRIDOR_TIME)
      // 目盛りのゆれ（小さな力の積み重ね）。手で戻す
      ret.drift += (Math.random() - 0.5) * dt * 0.25
      ret.drift = Math.max(-0.12, Math.min(0.12, ret.drift))
      let inp = ret.input
      if (ret.auto) inp = Math.max(-1, Math.min(1, (EI_ANGLE - ret.angle) * 3 - ret.drift * 4))
      ret.angle += (ret.drift + inp * 0.45) * dt
      ret.angle = Math.max(-9.5, Math.min(-3.5, ret.angle))
      if (t >= CORRIDOR_TIME) {
        ret.e = startEntry(ret.angle)
        ret.want = 1
        set('entry', { angle: ret.angle })
        setCaption('entryInterface')
      }
      break
    }
    case 'entry': {
      const e = ret.e!
      const wasBlack = blackout(e)
      const want = ret.auto ? entryAuto(e) : ret.input !== 0 ? ret.input : ret.want
      if (!ret.auto && ret.input !== 0) ret.want = ret.input
      stepEntry(e, dt * ENTRY_WARP, want)
      ret.get = GET.entry + e.t
      ret.heat = heating(e)
      ret.char = Math.min(1, ret.char + ret.heat * dt * ENTRY_WARP * 0.012)
      const black = blackout(e)
      if (black && !wasBlack) setCaption('blackout')
      if (!black && wasBlack) setCaption('blackoutEnd')
      const r = entryResult(e)
      if (r === 'ok') {
        ret.h = e.h
        ret.drogueAt = t
        const stars = entryStars(useMoonReturn.getState().angle ?? EI_ANGLE, e.peakG)
        set('chutes', { peakG: e.peakG, stars })
        saveMissionRecord({ stars, reached: 8 })
        ret.drogueAt = 0
        setCaption('drogue')
      } else if (r) {
        set('fail', { fail: r, peakG: e.peakG })
        setCaption(r === 'skip' ? 'skipOut' : 'tooSteep')
      }
      break
    }
    case 'chutes': {
      // 早送り：ドローグのあいだ 4 倍、主パラシュートが開いて少ししたら 22 倍、海の近くで等倍
      const opening = ret.mainAt >= 0 && t - ret.mainAt < 7
      const warp = ret.h > MAIN_ALT ? 4 : opening ? 1.5 : ret.h > 260 ? 22 : ret.h > 70 ? 4 : 1
      ret.h -= chuteSpeed(ret.h) * dt * warp
      ret.get = Math.min(GET.splash, ret.get + dt * warp)
      if (ret.h <= MAIN_ALT && ret.mainAt < 0) {
        ret.mainAt = t
        ret.get = GET.mains
        useMoonReturn.setState({ mains: true })
        setCaption('mains')
      }
      if (ret.h <= 0) {
        ret.h = 0
        ret.get = GET.splash
        ret.splashT = 0
        set('splash')
        setCaption('splash')
      }
      break
    }
    case 'splash':
      ret.splashT = t
      if (t >= SPLASH_TIME) {
        set('recovery')
        setCaption('recoveryHeli')
      }
      break
    case 'recovery':
      ret.splashT = SPLASH_TIME + t
      if (t >= SWIMMERS_AT && t - dt < SWIMMERS_AT) setCaption('recoveryCollar')
      if (t >= RECOVERY_TIME) set('end')
      break
    default:
      break
  }
}

/** 回廊の中か（目盛りの色） */
export const inCorridor = (a: number) => a <= CORRIDOR.shallow && a >= CORRIDOR.steep

/** キー（章8 のあいだ）：↑W 上・↓S 下、スペースで点火 */
function onKey(e: KeyboardEvent, down: boolean) {
  if (!inHome()) return
  const k = e.key.toLowerCase()
  if (k === 'arrowup' || k === 'w') ret.input = down ? 1 : ret.input > 0 ? 0 : ret.input
  else if (k === 'arrowdown' || k === 's') ret.input = down ? -1 : ret.input < 0 ? 0 : ret.input
  else if (k === ' ') {
    if (down && !e.repeat) pressTei()
  } else return
  if (ret.auto && down && k !== ' ') setReturnAuto(false)
  e.preventDefault()
  e.stopImmediatePropagation()
}

export function bindReturnKeys() {
  const d = (e: KeyboardEvent) => onKey(e, true)
  const u = (e: KeyboardEvent) => onKey(e, false)
  window.addEventListener('keydown', d, true)
  window.addEventListener('keyup', u, true)
  return () => {
    window.removeEventListener('keydown', d, true)
    window.removeEventListener('keyup', u, true)
  }
}

/** 確かめる用：その段階まで飛ばす（再突入はおまかせで） */
export function returnSkip(to: ReturnStep) {
  if (!inHome()) startReturn()
  const order: ReturnStep[] = ['rdv', 'docked', 'lmGone', 'teiWait', 'tei', 'coast', 'eva', 'cmSep', 'corridor', 'entry', 'chutes', 'splash', 'recovery', 'end']
  let guard = 0
  while (order.indexOf(useMoonReturn.getState().step) < order.indexOf(to) && guard++ < 40000) {
    const st = useMoonReturn.getState().step
    if (st === 'teiWait') pressTei()
    if (st === 'corridor' || st === 'entry') setReturnAuto(true)
    if (st === 'fail') retryEntry()
    tickReturn(0.05)
  }
}
