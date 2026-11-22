import { useEffect, useRef, useState } from 'react'
import { factsFor } from '../data/facts'
import { PLANETS } from '../data/bodies'
import { useStore } from '../state/store'
import { bodyInfo } from '../state/flight'
import { isSFObject } from '../data/sf'
import { isTelescope } from '../data/telescopes'
import { raceActive } from '../state/race'
import { useMission } from '../state/mission'
import { openScope } from './Hud'
import { useQuiz } from '../state/quiz'
import { useProbes } from '../state/probes'
import { useLang } from '../i18n/lang'
import { isTouchDevice } from '../state/input'
import { useTouchUI } from '../state/touchUI'
import { ui } from '../i18n'
import { hasCard } from '../data/bodyCards'
import { openBodyCard } from '../state/bodyCards'
import { hasArrival } from '../data/arrival'

const TOTAL = 1 + PLANETS.reduce((n, p) => n + 1 + p.moons.length, 0)
const NEAR = 10

/** 航海日誌：目標に近づくと開き、解説とクイズを出す */
export function LogPanel() {
  const targetId = useStore((s) => s.targetId)
  const logOpen = useStore((s) => s.logOpen)
  const setLogOpen = useStore((s) => s.setLogOpen)
  const distance = useStore((s) => s.telemetry.distance)
  const warpPhase = useStore((s) => s.warpPhase)
  const visited = useStore((s) => s.visited)
  const scopeNear = useStore((s) => s.scopeNear)
  const markVisited = useStore((s) => s.markVisited)
  const quizOpen = useQuiz((q) => q.open)
  const probesOpen = useProbes((p) => p.open)
  // 船を眺めているあいだは、船の説明の邪魔をしない
  const gallery = useStore((s) => s.mode === 'gallery')
  const [picked, setPicked] = useState<number | null>(null)
  const autoOpened = useRef<string | null>(null)
  // スマホ・タブレットでは、近づいても画面下の「日誌」ボタンに印を付けるだけで、押したときに引き出す
  const touch = isTouchDevice()
  const sheet = useTouchUI((u) => u.sheet)
  useLang()

  // 目標に近づいたら一度だけ自動で開く（ストーリーモードを開いているあいだは航法AIが話すので開かない。I キーでは開ける）
  useEffect(() => {
    if (!targetId || warpPhase !== 'idle' || distance === null || raceActive() || useMission.getState().phase !== 'closed') return
    if (distance < NEAR && autoOpened.current !== targetId) {
      autoOpened.current = targetId
      // パソコンでは、星に着いたらまず「到着の瞬間」（ui/ArrivalMoment.tsx）を見せる。日誌は「もっと知る」か I キーで
      if (!touch && hasArrival(targetId)) return
      setLogOpen(true)
    }
  }, [targetId, distance, warpPhase, setLogOpen, touch])

  useEffect(() => setPicked(null), [targetId])

  // パソコンでは、左上の操縦の説明（近くの天体の表示で背が伸びる）の下から始めて、重ならないようにする
  useEffect(() => {
    const hud = logOpen ? document.querySelector('.hud') : null
    if (!hud) return
    const set = () => document.documentElement.style.setProperty('--hud-bottom', `${Math.round(hud.getBoundingClientRect().bottom)}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(hud)
    return () => ro.disconnect()
  }, [logOpen, targetId])

  // I キーで開閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyI' && useStore.getState().targetId && !useStore.getState().scope) setLogOpen(!useStore.getState().logOpen)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setLogOpen])

  const facts = targetId ? factsFor(targetId) : undefined
  const info = targetId ? bodyInfo(targetId) : null
  if (!logOpen || gallery || (touch && sheet !== 'log') || quizOpen || probesOpen || !facts || !info || !targetId) return null

  const done = visited.includes(targetId)
  const answered = picked !== null
  const correct = picked === facts.quiz.answer

  const rows: [string, string | undefined][] = facts.rows ?? [
    [ui().logPanel.diameter, facts.diameter],
    [ui().logPanel.temperature, facts.temperature],
    [ui().logPanel.gravity, facts.gravity],
    [ui().logPanel.dayLength, facts.day],
    [ui().logPanel.yearLength, facts.year],
    [ui().logPanel.moons, facts.moons],
  ]

  return (
    <section className="log-panel" aria-label={ui().logPanel.shipsLog}>
      <header>
        <h2>
          {ui().logPanel.shipsLogPrefix}
          {info.name}
          {facts.fiction && <span className="log-fiction">{ui().logPanel.fictionBadge}</span>}
          {done && <span className="badge">{ui().logPanel.explored}</span>}
        </h2>
        <button className="close" onClick={() => setLogOpen(false)} aria-label={ui().logPanel.close}>
          ×
        </button>
      </header>
      <dl>
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      <ul className="notes">
        {facts.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {facts.real && (
        <div className="log-real">
          <h3>{ui().logPanel.inRealScience}</h3>
          <ul>
            {facts.real.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {hasCard(targetId) && (
        <button className="secondary card-open" onClick={() => openBodyCard(targetId)} title={ui().bodyCards.openHint}>
          📇 {ui().bodyCards.open}
        </button>
      )}
      {isTelescope(targetId) && (
        <button className="secondary scope-open" onClick={() => openScope(targetId)} disabled={scopeNear !== targetId}>
          {scopeNear === targetId ? ui().logPanel.lookThroughScope : ui().logPanel.flyCloseToScope} <kbd>T</kbd>
        </button>
      )}
      <div className="quiz">
        <div className="quiz-q">Q. {facts.quiz.question}</div>
        <div className="quiz-choices">
          {facts.quiz.choices.map((c, i) => (
            <button
              key={c}
              className={answered ? (i === facts.quiz.answer ? 'right' : i === picked ? 'wrong' : '') : ''}
              disabled={answered}
              onClick={() => {
                setPicked(i)
                if (i === facts.quiz.answer) markVisited(targetId)
              }}
            >
              {c}
            </button>
          ))}
        </div>
        {answered && (
          <div className="quiz-a">
            {correct ? ui().logPanel.correct : ui().logPanel.notQuite} {facts.quiz.explanation}
            {!correct && (
              <button className="retry" onClick={() => setPicked(null)}>
                {ui().logPanel.tryAgain}
              </button>
            )}
          </div>
        )}
      </div>
      <footer className="muted">
        {ui().logPanel.explored} {visited.filter((id) => !isSFObject(id) && !isTelescope(id)).length} / {TOTAL}
        {ui().logPanel.keyHintStart}
        <kbd>I</kbd>
        {ui().logPanel.keyHintEnd}
      </footer>
    </section>
  )
}
