import { create } from 'zustand'
import type { Quiz } from '../data/facts'
import { FACTS } from '../i18n/facts.ja'
import { FACTS_EN } from '../i18n/facts.en'
import { PLANETS, type Planet } from '../data/bodies'
import { isSFObject } from '../data/sf'
import { bodyInfo, engage } from './flight'
import { useStore } from './store'
import { closeProbes } from './probes'
import { getLang } from '../i18n/lang'
import { ui, uiEn, uiJa } from '../i18n'

// 連続クイズ：航海日誌のクイズと、天体のデータから作る「くらべる」問題を混ぜて10問続けて出す。
// まちがえた天体は、終わったあとにワープして見に行ける

export const QUIZ_LENGTH = 10
/** 10問のうち、天体のデータから作る問題の数 */
const MADE_COUNT = 4

const BEST_KEY = 'solar-voyager:quiz-best'

type QuizText = Omit<Quiz, 'answer'>

export type QuizQuestion = Quiz & {
  /** この問題の天体（まちがえたらワープで見に行く先） */
  bodyId: string
  /** 英語の問題文（選択肢は同じ順番）。途中で言語を変えても続けられるよう、両方持っておく */
  en: QuizText
}

/** 今の言語の問題文 */
export const quizText = (q: QuizQuestion): QuizText => (getLang() === 'en' ? q.en : q)

type QuizState = {
  open: boolean
  questions: QuizQuestion[]
  index: number
  /** 選んだ答え（まだなら null） */
  picked: number | null
  score: number
  streak: number
  bestStreak: number
  /** 答えた問題ごとの正解・不正解 */
  results: boolean[]
  /** まちがえた問題の天体（同じ天体は一度だけ） */
  missed: string[]
  finished: boolean
  /** これまでの最高点 */
  best: number | null
  newBest: boolean
}

function loadBest(): number | null {
  try {
    const v = localStorage.getItem(BEST_KEY)
    return v === null ? null : Number(v)
  } catch {
    return null
  }
}

export const useQuiz = create<QuizState>(() => ({
  open: false,
  questions: [],
  index: 0,
  picked: null,
  score: 0,
  streak: 0,
  bestStreak: 0,
  results: [],
  missed: [],
  finished: false,
  best: loadBest(),
  newBest: false,
}))

const shuffle = <T,>(items: T[]) => {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 選択肢の順番を混ぜる（正解の位置も一緒に動かす） */
function shuffleChoices(q: QuizQuestion): QuizQuestion {
  const order = shuffle(q.choices.map((_, i) => i))
  return { ...q, choices: order.map((i) => q.choices[i]), answer: order.indexOf(q.answer), en: { ...q.en, choices: order.map((i) => q.en.choices[i]) } }
}

const num = (v: number) => (v >= 100 ? Math.round(v).toLocaleString('en-US') : String(Number(v.toPrecision(2))))

/** 問題を作る言語の辞書（問題は両方の言語で作る：uiJa と uiEn） */
type Words = typeof uiJa

/** 時間を、日か時間のわかりやすい方で */
const duration = (w: Words, hours: number) => (hours >= 72 ? w.quiz.aboutDays(num(hours / 24)) : w.quiz.aboutHours(num(hours)))

/** 太陽の光が届く時間 */
const lightTime = (w: Words, au: number) => {
  const minutes = Math.round(au * 8.317)
  return minutes < 60 ? w.quiz.aboutMinutes(minutes) : w.quiz.aboutHoursMinutes(Math.floor(minutes / 60), minutes % 60)
}

const MAJOR = PLANETS.filter((p) => !p.dwarf)
const WITH_MOONS = PLANETS.filter((p) => p.moons.length > 0)

/** 天体のデータから作る「くらべる」問題。答えの天体を bodyId にする。text(w) が一つの言語の問題文 */
const MAKERS: (() => QuizQuestion)[] = [
  () => {
    const three = shuffle(MAJOR).slice(0, 3)
    const top = three.reduce((a, b) => (b.radiusKm > a.radiusKm ? b : a))
    const text = (w: Words): QuizText => ({
      question: w.quiz.biggest.question,
      choices: three.map((p) => w.bodies[p.id].name),
      explanation: w.quiz.biggest.explanation(w.bodies[top.id].name, num(top.radiusKm * 2), num(top.radiusKm / 6371)),
    })
    return { bodyId: top.id, ...text(uiJa), answer: three.indexOf(top), en: text(uiEn) }
  },
  () => {
    const three = shuffle(MAJOR).slice(0, 3)
    const top = three.reduce((a, b) => (b.distanceAu > a.distanceAu ? b : a))
    const text = (w: Words): QuizText => ({
      question: w.quiz.farthest.question,
      choices: three.map((p) => w.bodies[p.id].name),
      explanation: w.quiz.farthest.explanation(w.bodies[top.id].name, num(top.distanceAu), lightTime(w, top.distanceAu)),
    })
    return { bodyId: top.id, ...text(uiJa), answer: three.indexOf(top), en: text(uiEn) }
  },
  () => {
    const three = shuffle(MAJOR).slice(0, 3)
    const top = three.reduce((a, b) => (b.orbitDays > a.orbitDays ? b : a))
    const years = top.orbitDays / 365.25
    const text = (w: Words): QuizText => ({
      question: w.quiz.longestYear.question,
      choices: three.map((p) => w.bodies[p.id].name),
      explanation: w.quiz.longestYear.explanation(w.bodies[top.id].name, years >= 1 ? w.quiz.aboutYears(num(years)) : w.quiz.aboutDays(num(top.orbitDays))),
    })
    return { bodyId: top.id, ...text(uiJa), answer: three.indexOf(top), en: text(uiEn) }
  },
  () => {
    const three = shuffle(MAJOR).slice(0, 3)
    const spin = (p: Planet) => Math.abs(p.rotationHours)
    const top = three.reduce((a, b) => (spin(b) < spin(a) ? b : a))
    const text = (w: Words): QuizText => ({
      question: w.quiz.shortestDay.question,
      choices: three.map((p) => w.bodies[p.id].name),
      explanation: w.quiz.shortestDay.explanation(w.bodies[top.id].name, duration(w, spin(top))),
    })
    return { bodyId: top.id, ...text(uiJa), answer: three.indexOf(top), en: text(uiEn) }
  },
  () => {
    const parent = shuffle(WITH_MOONS)[0]
    const moon = shuffle(parent.moons)[0]
    const others = shuffle(WITH_MOONS.filter((p) => p !== parent)).slice(0, 2)
    const choices = shuffle([parent, ...others])
    const text = (w: Words): QuizText => ({
      question: w.quiz.moonOf.question(w.bodies[moon.id].name),
      choices: choices.map((p) => w.bodies[p.id].name),
      explanation: w.quiz.moonOf.explanation(w.bodies[moon.id].name, w.bodies[parent.id].name, duration(w, Math.abs(moon.orbitDays) * 24), moon.orbitDays < 0),
    })
    return { bodyId: moon.id, ...text(uiJa), answer: choices.indexOf(parent), en: text(uiEn) }
  },
]

/** 10問を選ぶ。同じ天体の問題は続けて出さないよう、一つの天体から一問だけ */
function makeQuestions(): QuizQuestion[] {
  const used = new Set<string>()
  const made: QuizQuestion[] = []
  for (const make of shuffle(MAKERS)) {
    if (made.length >= MADE_COUNT) break
    // 答えの天体がほかの問題と重ならないものを、何回か作り直して探す
    for (let tries = 0; tries < 8; tries++) {
      const q = make()
      if (used.has(q.bodyId)) continue
      used.add(q.bodyId)
      made.push(q)
      break
    }
  }
  const fromLog = shuffle(Object.entries(FACTS).filter(([id]) => !isSFObject(id) && !used.has(id)))
    .slice(0, QUIZ_LENGTH - made.length)
    .map(([id, f]) => ({ ...f.quiz, bodyId: id, en: FACTS_EN[id]?.quiz ?? f.quiz }))
  return shuffle([...fromLog, ...made]).map(shuffleChoices)
}

export function startQuiz() {
  closeProbes()
  if (document.pointerLockElement) document.exitPointerLock()
  useStore.getState().setLogOpen(false)
  useQuiz.setState({ open: true, questions: makeQuestions(), index: 0, picked: null, score: 0, streak: 0, bestStreak: 0, results: [], missed: [], finished: false, newBest: false })
}

export function closeQuiz() {
  useQuiz.setState({ open: false })
}

export function pickAnswer(choice: number) {
  const q = useQuiz.getState()
  const question = q.questions[q.index]
  if (!question || q.picked !== null || q.finished) return
  const right = choice === question.answer
  const streak = right ? q.streak + 1 : 0
  useQuiz.setState({
    picked: choice,
    score: q.score + (right ? 1 : 0),
    streak,
    bestStreak: Math.max(q.bestStreak, streak),
    results: [...q.results, right],
    missed: right || q.missed.includes(question.bodyId) ? q.missed : [...q.missed, question.bodyId],
  })
}

export function nextQuestion() {
  const q = useQuiz.getState()
  if (q.picked === null) return
  if (q.index + 1 < q.questions.length) {
    useQuiz.setState({ index: q.index + 1, picked: null })
    return
  }
  const newBest = q.best === null || q.score > q.best
  const best = newBest ? q.score : q.best
  try {
    localStorage.setItem(BEST_KEY, String(best))
  } catch {
    // 保存できなくても遊べる
  }
  useQuiz.setState({ finished: true, best, newBest })
}

/** 点数に応じた称号 */
export function quizTitle(score: number) {
  const title = ui().quiz.title
  if (score >= QUIZ_LENGTH) return title.master
  if (score >= 8) return title.veteran
  if (score >= 5) return title.skilled
  return title.trainee
}

/** まちがえた天体へワープする（クイズを閉じて目標に設定し、ワープを始める） */
export function warpToMissed(id: string) {
  closeQuiz()
  const s = useStore.getState()
  if (s.mode === 'gallery') s.setMode('flight')
  s.setTarget(id)
  engage()
}

export const quizBodyName = (id: string) => bodyInfo(id)?.name ?? id
