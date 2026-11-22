import { saveData } from './save'
import { create } from 'zustand'
import { launchRover, recallRover, roverActive, useRover } from './rover'
import { goToSite, useLanding } from './landing'
import { TRACKS, tracksAt } from '../data/rallyTracks'
import { coursePrint } from './rallyGhost'
import { isTouchDevice } from './input'
import type { Medal } from './rallyMedals'
import type { RallyColorsJa } from '../i18n/rallyColors.ja'

// 火星の峡谷レース（マリネリス峡谷のレース場）：色違いの ORV-7 が 4 台で、光の門を順にくぐってゴールを目指す。
// 自分の 1 台のほかの 3 台はコンピューター（それぞれ性格がちがう）。
// 流れ：off → deploy（ローバーを降ろして展開）→ count（スタートの列に並んで 3・2・1）→ run → done（結果）

export type RallyPhase = 'off' | 'deploy' | 'count' | 'run' | 'done'

/** 4 色のローバー（文言は src/i18n/rallyColors、色の id ごと） */
export const RALLY_COLORS = [
  { id: 'red', hex: '#d63a2c' },
  { id: 'blue', hex: '#2f6fe0' },
  { id: 'yellow', hex: '#f0c22c' },
  { id: 'green', hex: '#3aa64c' },
  // id は src/i18n/rallyColors.ja.ts と同じ：文言のない色は型エラー
] as const satisfies readonly { id: keyof RallyColorsJa; hex: string }[]

/** RALLY_COLORS の文言（日本語は src/i18n/rallyColors.ja.ts、英語は rallyColors.en.ts） */
export type RallyColorText = {
  /** 色の名前 */
  color: string
  /** コンピューターが運転するときの名前 */
  name: string
  trait: string
}

export const COUNT_SEC = 3.6

export type RallyEntry = { color: number; time: number | null; you: boolean }

/** コンピューターの強さ（スタート欄で選ぶ。やさしいは、いちばん遅い 1 台が自分を待つので最下位にならない） */
export const RALLY_LEVELS = ['easy', 'normal', 'hard'] as const
export type RallyLevel = (typeof RALLY_LEVELS)[number]

type RallyState = {
  phase: RallyPhase
  /** 今の段階を始めた時刻（performance.now() / 1000） */
  since: number
  /** 自分の色（RALLY_COLORS の番号） */
  color: number
  /** 次にくぐる門（0 から）と、門の数（最後の門がゴール） */
  gate: number
  gates: number
  /** 走っている時間（秒）。ときどき書き換える */
  time: number
  /** 今の順位（1〜4） */
  place: number
  /** 次の門までの距離（m）と、ローバーの正面から右回りの角度（度） */
  toGate: { dist: number; rel: number } | null
  /** 門をくぐったときの表示：自己ベストとの差（秒）。null は初めて */
  split: { gate: number; time: number; diff: number | null; at: number } | null
  /** ゴールの結果。at はハイスコア表に入れた日時、rank は表での順位（state/rallyHiscore.ts） */
  result: {
    time: number
    place: number
    best: number
    newBest: boolean
    order: RallyEntry[]
    at: number
    rank: number
    /** 取ったメダル（state/rallyMedals.ts）と、前より良いメダルか */
    medal: Medal | null
    newMedal: boolean
    /** 金メダルで初めてもらった、ごほうびの岩の id */
    rock: string | null
  } | null
  /** 門から外れて戻る（R）の案内を出す */
  lost: boolean
  /** 追いかけっこ（月）：つかまえたローバーと、ゴールまで逃げきったローバー（色の番号）、最後につかまえた時刻と色 */
  chase: { caught: number[]; escaped: number[]; at: number; last: number } | null
  /** ミニマップ用：コンピューターのローバーの位置（色の番号, x, z） */
  bots: { c: number; x: number; z: number }[]
  /** レース場ごとに選んだコース（着陸地点の名前 → TRACKS の名前）。コースがひとつのレース場には無い */
  picked: Record<string, string>
  /** コンピューターの強さ */
  level: RallyLevel
  /** 自動アクセル：レース中は ▲ を押さなくても進む（▼ でブレーキ）。スマホは最初から入れておく */
  auto: boolean
}

/** そのレース場で今選んでいるコース（TRACKS の名前）。選んでいなければ、いちばんやさしいコース */
export function trackAt(site: string, picked = useRally.getState().picked): string {
  const list = tracksAt(site)
  const p = picked[site]
  return p && list.includes(p) ? p : (list[0] ?? site)
}

/** 今いるレース場の、今選んでいるコース（React から：選び直すと書き換わる） */
export const useRallyTrack = (site: string | null | undefined) => useRally((r) => (site && tracksAt(site).length ? trackAt(site, r.picked) : null))

/** 自己ベストはコースごと。コースを作り直したら（門の数も変わる）別の名前にして、前のベストと比べない */
const bestKey = () => {
  const track = trackAt(useLanding.getState().site ?? 'coprates')
  const tr = TRACKS[track]
  return `rally-best:${track}${tr ? `:${coursePrint(tr.line)}` : ''}`
}
const COLOR_KEY = 'rally-color'
const PICK_KEY = 'rally-course'
const LEVEL_KEY = 'rally-level'
const AUTO_KEY = 'rally-auto'

function loadLevel(): RallyLevel {
  const v = saveData.get(LEVEL_KEY) as RallyLevel | null
  return v && RALLY_LEVELS.includes(v) ? v : 'normal'
}

function loadAuto(): boolean {
  const v = saveData.get(AUTO_KEY)
  if (v === '1' || v === '0') return v === '1'
  // まだ選んでいなければ、端末に合わせる（スマホは入）
  return isTouchDevice()
}

/** コンピューターの強さを選ぶ（スタート前に） */
export function setRallyLevel(level: RallyLevel) {
  useRally.setState({ level })
  saveData.set(LEVEL_KEY, level)
}

/** 自動アクセルの入・切 */
export function setRallyAuto(auto: boolean) {
  useRally.setState({ auto })
  saveData.set(AUTO_KEY, auto ? '1' : '0')
}

function loadPicked(): Record<string, string> {
  try {
    const v = JSON.parse(saveData.get(PICK_KEY) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** レース場のコースを選ぶ（スタート前だけ） */
export function pickRallyTrack(site: string, track: string) {
  const picked = { ...useRally.getState().picked, [site]: track }
  useRally.setState({ picked })
  try {
    saveData.set(PICK_KEY, JSON.stringify(picked))
  } catch {
    // 保存できなくても遊べる
  }
}

export type RallyBest = { time: number; splits: number[] }

export function loadBest(): RallyBest | null {
  try {
    const v = JSON.parse(saveData.get(bestKey()) ?? 'null')
    return v && v.time > 0 ? v : null
  } catch {
    return null
  }
}

export function saveBest(b: RallyBest) {
  try {
    saveData.set(bestKey(), JSON.stringify(b))
  } catch {
    // 保存できなくても遊べる
  }
}

function loadColor() {
  try {
    const v = Number(saveData.get(COLOR_KEY))
    return v >= 0 && v < RALLY_COLORS.length ? v : 0
  } catch {
    return 0
  }
}

export const rallyNow = () => performance.now() / 1000

/**
 * レースの時計（秒）：走り出してから、ゲームが進めた時間の合計。
 * 1 フレームの歩みは 0.05 s まで（Rally.tsx・Rover.tsx の dt の上限）なので、20 fps を下回るとレースはゆっくり進む。
 * 時計もそれに合わせて進むので、遅いパソコンでもタイムは走った分だけになる（壁の時計ではない）。
 * Rally.tsx が毎フレーム進め、ゴールのあとも進み続ける（ゴーストが走りの終わりまで走るため）。
 */
export const rallyClock = { t: 0 }

export const useRally = create<RallyState>(() => ({
  phase: 'off',
  since: 0,
  color: loadColor(),
  gate: 0,
  gates: 0,
  time: 0,
  place: 1,
  toGate: null,
  split: null,
  result: null,
  lost: false,
  chase: null,
  bots: [],
  picked: loadPicked(),
  level: loadLevel(),
  auto: loadAuto(),
}))

export const setRallyPhase = (phase: RallyPhase) => useRally.setState({ phase, since: rallyNow() })

export function setRallyColor(color: number) {
  useRally.setState({ color })
  try {
    saveData.set(COLOR_KEY, String(color))
  } catch {
    // 保存できなくても遊べる
  }
}

/** レースを始める。ローバーがまだ出ていなければ降ろして展開してから、スタートの列へ */
export function startRally() {
  useRally.setState({ gate: 0, time: 0, place: 1, toGate: null, split: null, result: null, lost: false, chase: null })
  // レースは無人ローバーで走る（与圧ローバーに乗っていたら、乗りかえる）
  if (roverActive() && useRover.getState().vehicle !== 'orv7') recallRover()
  if (!roverActive()) launchRover(true)
  setRallyPhase('deploy')
}

export function quitRally() {
  useRally.setState({ toGate: null, split: null, result: null, lost: false, chase: null })
  setRallyPhase('off')
}

/** レース中か（スタートの列に並んでから、結果を出すまで） */
export const rallyRacing = () => {
  const p = useRally.getState().phase
  return p === 'count' || p === 'run'
}

/** レース場へ着いたら、ローバーを出した状態にする（ローバーを運転中に「峡谷レースへ」を押したとき） */
export const rallyArrive = { rover: false }

/** ローバーを運転しているところから、その天体のレース場へ。着いたらすぐローバーで走れる（色えらびとスタートは画面に出る） */
export function goToRally(site: string) {
  if (useLanding.getState().phase !== 'surface') return
  rallyArrive.rover = true
  goToSite(site)
}
