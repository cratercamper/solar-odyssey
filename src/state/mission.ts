import { saveData } from './save'
import { create } from 'zustand'
import { CARGO_SPEED, CHAPTERS, LEGACY_ORDER, MECH_ID, MISSIONS, ROCK_ID, SAIL_SPEED, chapterOf, shipOf } from '../data/missions'
import type { ShipId } from '../data/ships'
import { missionText } from '../i18n'
import { playBeep } from '../audio/sfx'
import { raceActive } from './race'
import { useStore } from './store'
import { flightControl } from './flight'
import { closeEclipses, openEclipses, playEclipse } from './eclipse'

// ストーリーモード：章（船）を選ぶ → 任務の一覧 → 出発前の説明 → 手順を順番にこなす → まとめとクイズ → 星で評価。
// 任務を始めると章の船に乗り換え、ストーリーモードを閉じると元の船に戻す。
// 時間切れや失敗で終わることはない。星の数は任務の id ごとに端末に保存する

export type MissionPhase = 'closed' | 'chapters' | 'list' | 'briefing' | 'active' | 'debrief'

/** 撮影の枠：目標が枠の中か、遠すぎる・近すぎる・かくれているか。入港では far（輪の外）・fast（速すぎる）・ok */
export type Framing = 'ok' | 'out' | 'far' | 'near' | 'hidden' | 'fast'

const STARS_KEY = 'mission-stars'
/** 前のバージョンの保存（ソーラーボイジャーの8本を並びで） */
const LEGACY_KEY = 'missions'

type MissionState = {
  phase: MissionPhase
  /** 開いている章（CHAPTERS の順） */
  chapter: number
  /** 選んでいる任務の番号（MISSIONS の順） */
  index: number
  /** いまの手順 */
  step: number
  /** いまの手順の進み具合（0〜1。deflect では命中の数） */
  progress: number
  /** 航法AIのことば（いちばん新しいもの） */
  message: string
  messageId: number
  /** 確認クイズ：いまの問題と、選んだ答え */
  quizIndex: number
  picked: (number | null)[]
  /** 任務の id ごとの最高の星の数（ないものはまだ） */
  stars: Record<string, number>
  /** 今回の星（結果を見たあと） */
  earned: number | null
  /** 撮影の手順で、目標が枠に入っているか */
  framing: Framing | null
  /** 荷物を積んでいるか（ハコブネ） */
  cargo: boolean
  /** ストーリーモードに入る前に乗っていた船（閉じたら戻す） */
  prevShip: ShipId | null
  /** 探査艇・着陸艇を出せるところにいるか（launch・land の手順） */
  craftReady: boolean
  /** 探査艇・着陸艇が出ているあいだ（時計の秒で、出した時刻） */
  craftOut: number | null
}

function loadStars(): Record<string, number> {
  try {
    const saved = saveData.get(STARS_KEY)
    if (saved) return JSON.parse(saved)
    // 前のバージョンの星（並び）を、任務の id に移す
    const legacy: unknown[] = JSON.parse(saveData.get(LEGACY_KEY) ?? '[]')
    return Object.fromEntries(LEGACY_ORDER.map((id, i) => [id, Number(legacy[i]) || 0]).filter(([, n]) => n))
  } catch {
    return {}
  }
}

export const starsOf = (index: number) => useMission.getState().stars[MISSIONS[index]?.id] ?? 0

/** 星を記録する（前より多いときだけ） */
function saveStars(index: number, n: number) {
  const id = MISSIONS[index].id
  const stars = { ...useMission.getState().stars, [id]: Math.max(useMission.getState().stars[id] ?? 0, n) }
  try {
    saveData.set(STARS_KEY, JSON.stringify(stars))
  } catch {
    // 保存できなくても遊べる
  }
  useMission.setState({ stars })
}

export const useMission = create<MissionState>(() => ({
  phase: 'closed',
  chapter: 0,
  index: 0,
  step: 0,
  progress: 0,
  message: '',
  messageId: 0,
  quizIndex: 0,
  picked: [],
  stars: loadStars(),
  earned: null,
  framing: null,
  cargo: false,
  prevShip: null,
  craftReady: false,
  craftOut: null,
}))

export const missionActive = () => useMission.getState().phase === 'active'

/** 章の最初の任務か、章の中で一つ前の任務を終えていれば始められる */
export function isUnlocked(i: number) {
  const missions = chapterOf(i).missions
  const k = missions.findIndex((m) => m.id === MISSIONS[i].id)
  return k <= 0 || (useMission.getState().stars[missions[k - 1].id] ?? 0) > 0
}

const say = (message: string) => useMission.setState((s) => ({ message, messageId: s.messageId + 1 }))

export function openMissions() {
  if (document.pointerLockElement) document.exitPointerLock()
  useStore.getState().setLogOpen(false)
  // 任務の途中なら、一覧ではなく今の任務を表示したままにする
  if (useMission.getState().phase === 'active') return
  useMission.setState({ phase: 'chapters' })
}

/** 章を開く（任務の一覧へ） */
export function openChapter(chapter: number) {
  useMission.setState({ phase: 'list', chapter })
}

export function closeMissions() {
  if (useMission.getState().phase === 'active') return
  endMission()
}

/** 任務を終えて閉じる：荷物や日食の画面を片づけ、元の船に戻す */
function endMission() {
  const m = useMission.getState()
  setCargo(false)
  flightControl.speedScale = 1
  if (MISSIONS[m.index]?.steps.some((s) => s.kind === 'eclipse')) closeEclipses()
  if (m.prevShip && useStore.getState().settings.ship !== m.prevShip) useStore.getState().updateSettings({ ship: m.prevShip })
  useMission.setState({ phase: 'closed', message: '', prevShip: null, framing: null, craftOut: null, craftReady: false })
}

export function showBriefing(index: number) {
  if (!isUnlocked(index)) return
  const chapter = CHAPTERS.indexOf(chapterOf(index))
  useMission.setState({ phase: 'briefing', index, chapter })
}

export function startMission() {
  if (raceActive()) return
  const s = useStore.getState()
  const m = useMission.getState()
  // 章の船に乗り換える（はじめて乗り換えるときだけ、元の船を覚えておく）
  const ship = shipOf(m.index)
  if (s.settings.ship !== ship) {
    useMission.setState({ prevShip: m.prevShip ?? s.settings.ship })
    s.updateSettings({ ship })
  }
  setCargo(false)
  if (s.mode !== 'flight') s.setMode('flight')
  useMission.setState({ phase: 'active', step: 0, progress: 0, quizIndex: 0, picked: [], earned: null, framing: null, craftOut: null, craftReady: false })
  applySpeed()
  say(beginStep(0))
}

/** 荷物を積む・降ろす。積んでいるあいだは最高速度を落とす（重い船は速さが出にくい） */
function setCargo(cargo: boolean) {
  if (useMission.getState().cargo === cargo) return
  useMission.setState({ cargo })
  applySpeed()
}

/** 光の帆の手順なら、その場所の光の強さ */
export function sailLight() {
  const m = useMission.getState()
  const def = m.phase === 'active' ? MISSIONS[m.index].steps[m.step] : undefined
  return def?.kind === 'sail' ? (def.light ?? 1) : null
}

/** 最高速度の割合：荷物の重さと、光の帆の強さ */
function applySpeed() {
  const light = sailLight()
  const sail = light === null ? 1 : Math.min(SAIL_SPEED[1], Math.max(SAIL_SPEED[0], light))
  flightControl.speedScale = (useMission.getState().cargo ? CARGO_SPEED : 1) * sail
}

/** 探査艇・着陸艇を出す（L キーか、任務の表示のボタン） */
export function launchCraft() {
  const m = useMission.getState()
  if (m.phase !== 'active' || !m.craftReady || m.craftOut !== null) return
  useMission.setState({ craftOut: performance.now() / 1000, progress: 0 })
  playBeep(660, 0.12)
}

export function setCraftReady(craftReady: boolean) {
  if (useMission.getState().craftReady !== craftReady) useMission.setState({ craftReady })
}

/** 手順を始める：目標をセットして、説明を出す（小惑星の目標は、MissionRunner が出してからセットする） */
function beginStep(step: number) {
  const m = useMission.getState()
  const def = MISSIONS[m.index].steps[step]
  const text = missionText(MISSIONS[m.index].id).steps[step]
  if (def.kind === 'eclipse' && def.eclipse) {
    openEclipses()
    playEclipse(def.eclipse)
  } else if (def.body !== ROCK_ID && def.body !== MECH_ID && useStore.getState().targetId !== def.body) useStore.getState().setTarget(def.body)
  return text.start
}

/** いまの手順を終えて次へ。最後の手順なら結果の画面へ */
export function completeStep() {
  const m = useMission.getState()
  const mission = MISSIONS[m.index]
  const text = missionText(mission.id)
  const done = text.steps[m.step].done
  const kind = mission.steps[m.step].kind
  if (kind === 'load') setCargo(true)
  else if (kind === 'dock') setCargo(false)
  playBeep(880, 0.14)
  setTimeout(() => playBeep(1320, 0.22), 130)
  if (m.step + 1 >= mission.steps.length) {
    if (document.pointerLockElement) document.exitPointerLock()
    useStore.getState().setAutopilot(false)
    useStore.getState().setLogOpen(false)
    useMission.setState({ phase: 'debrief', progress: 0, quizIndex: 0, picked: text.quiz.map(() => null), framing: null, craftOut: null, craftReady: false })
    flightControl.speedScale = 1
    // クイズの途中で閉じても、任務を終えたぶんの星1つは残す（次の任務も開く）
    saveStars(m.index, 1)
    say(done)
    return
  }
  const next = m.step + 1
  useMission.setState({ step: next, progress: 0, framing: null, craftOut: null, craftReady: false })
  applySpeed()
  say(`${done}\n\n${beginStep(next)}`)
}

export function setProgress(progress: number) {
  useMission.setState({ progress })
}

/** 任務をやめる（星は記録しない） */
export function abortMission() {
  endMission()
}

export function setFraming(framing: Framing | null) {
  if (useMission.getState().framing !== framing) useMission.setState({ framing })
}

export function answerQuiz(choice: number) {
  const m = useMission.getState()
  if (m.picked[m.quizIndex] !== null) return
  const quiz = missionText(MISSIONS[m.index].id).quiz[m.quizIndex]
  const picked = [...m.picked]
  picked[m.quizIndex] = choice
  useMission.setState({ picked })
  if (choice === quiz.answer) {
    playBeep(880, 0.14)
    setTimeout(() => playBeep(1320, 0.2), 120)
  } else playBeep(260, 0.35)
}

/** 次の問題へ。最後なら星を数えて記録する */
export function nextQuiz() {
  const m = useMission.getState()
  const quiz = missionText(MISSIONS[m.index].id).quiz
  if (m.quizIndex + 1 < quiz.length) {
    useMission.setState({ quizIndex: m.quizIndex + 1 })
    return
  }
  const earned = 1 + quiz.filter((q, i) => m.picked[i] === q.answer).length
  saveStars(m.index, earned)
  useMission.setState({ earned, quizIndex: quiz.length })
}

export { say as missionSay }
