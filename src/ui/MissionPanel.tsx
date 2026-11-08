import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BEAM_NODES, CHAPTERS, DEFLECT_HITS, MISSIONS, chapterOf, missionIndexOf, shipOf, skillChapterOf, type ChapterDef } from '../data/missions'
import { shipLabel, shipSpec, type ShipId } from '../data/ships'
import { chapterText, missionText, ui } from '../i18n'
import { useLang } from '../i18n/lang'
import { useStore } from '../state/store'
import { abortMission, answerQuiz, closeMissions, isUnlocked, launchCraft, nextQuiz, openChapter, openMissions, showBriefing, startMission, useMission } from '../state/mission'
import { useRace } from '../state/race'
import { openEclipses, playEclipse, useEclipse } from '../state/eclipse'
import { PHOTO_FRAME } from '../components/mission/MissionRunner'

const thumb = (id: ShipId) => `${import.meta.env.BASE_URL}ships/${id}.jpg`

const Stars = ({ n, big }: { n: number; big?: boolean }) => (
  <span className={`stars${big ? ' big' : ''}`} aria-label={ui().starsLabel(n)}>
    {[0, 1, 2].map((i) => (
      <span key={i} className={i < n ? 'on' : ''}>
        ★
      </span>
    ))}
  </span>
)

/** 一覧・説明・結果のあいだは Esc で閉じる（クイズと同じく、ほかのキー操作より先に受け取る） */
function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      onEscape()
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, onEscape])
}

/** ストーリーモード：任務の一覧、出発前の説明、任務中の表示、結果とクイズ */
export function MissionPanel() {
  const phase = useMission((m) => m.phase)
  const mode = useStore((s) => s.mode)
  const scope = useStore((s) => s.scope)
  const modal = (phase === 'chapters' || phase === 'list' || phase === 'briefing' || phase === 'debrief') && mode !== 'gallery' && !scope
  useEscape(modal, closeMissions)
  useLang()

  if (phase === 'active') return mode === 'gallery' ? null : <MissionBar />
  if (!modal) return null
  return (
    <section className={`quiz-run mission-panel${phase === 'chapters' ? ' wide' : ''}`} aria-label={ui().missionsTitle}>
      {phase === 'chapters' ? <ChapterList /> : phase === 'list' ? <MissionList /> : phase === 'briefing' ? <Briefing /> : <Debrief />}
    </section>
  )
}

/** 章ごとの星の合計と、取れる星の数 */
function chapterStars(chapter: ChapterDef, stars: Record<string, number>) {
  return { got: chapter.missions.reduce((n, m) => n + (stars[m.id] ?? 0), 0), max: chapter.missions.length * 3 }
}

/** 章の一覧：船ごとのカード。SF 編は SF モードのときだけ */
function ChapterList() {
  const stars = useMission((m) => m.stars)
  const sf = useStore((s) => s.settings.world === 'sf')
  const t = ui()
  useLang()
  const chapters = CHAPTERS.map((c, i) => ({ c, i })).filter(({ c }) => c.world === 'real' || sf)
  return (
    <>
      <Header title={t.missionsTitle} />
      <p className="muted small">{sf ? t.chaptersIntroSF : t.chaptersIntro}</p>
      <ol className="chapter-list">
        {chapters.map(({ c, i }) => {
          const spec = shipSpec(c.ship)
          const text = chapterText(c.id)
          const { got, max } = chapterStars(c, stars)
          return (
            <li key={c.id}>
              <button onClick={() => openChapter(i)} className={c.world === 'sf' ? 'sf' : ''}>
                <img src={thumb(c.ship)} alt="" loading="lazy" />
                <span className="chapter-body">
                  <span className="chapter-ship">
                    {c.fleet ? t.fleet : shipLabel(spec)}
                    {c.world === 'sf' && <span className="chapter-tag">SF</span>}
                  </span>
                  <span className="mission-name">{text.title}</span>
                  <span className="muted small">
                    {t.labelled(t.skill, text.skill)}{t.gap}★ {got} / {max}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </>
  )
}

function Header({ title, onClose = closeMissions }: { title: string; onClose?: () => void }) {
  return (
    <header>
      <h2>{title}</h2>
      <button className="close" onClick={onClose} aria-label={ui().close}>
        ×
      </button>
    </header>
  )
}

/** 船と得意技の説明（最終章では、任務ごとの船の得意技） */
function ShipSkill({ chapter, ship = chapter.ship }: { chapter: ChapterDef; ship?: ShipId }) {
  const t = ui()
  useLang()
  const text = chapterText(chapter.fleet ? skillChapterOf(ship).id : chapter.id)
  return (
    <div className="chapter-skill">
      <img src={thumb(ship)} alt="" />
      <div>
        <div className="muted small">{chapter.fleet ? t.shipForMission(shipLabel(shipSpec(ship))) : t.shipForChapter(shipLabel(shipSpec(ship)))}</div>
        <div>
          <b>{t.labelled(t.skill, text.skill)}</b>
        </div>
        <div className="muted small">{text.how}</div>
      </div>
    </div>
  )
}

function MissionList() {
  const stars = useMission((m) => m.stars)
  const chapter = CHAPTERS[useMission((m) => m.chapter)]
  const t = ui()
  const text = chapterText(chapter.id)
  return (
    <>
      <Header title={text.title} />
      <p className="muted small">{text.intro}</p>
      {!chapter.fleet && <ShipSkill chapter={chapter} />}
      <ol className="mission-list">
        {chapter.missions.map((m, k) => {
          const i = missionIndexOf(m.id)
          const open = isUnlocked(i)
          return (
            <li key={m.id}>
              <button disabled={!open} onClick={() => showBriefing(i)}>
                <span className="mission-no">{t.missionNumber(k + 1)}</span>
                <span className="mission-name">{open ? missionText(m.id).title : t.locked}</span>
                {chapter.fleet && <img className="mission-ship" src={thumb(shipOf(i))} alt="" />}
                {open && <Stars n={stars[m.id] ?? 0} />}
              </button>
            </li>
          )
        })}
      </ol>
      <div className="quiz-actions">
        <button className="secondary" onClick={openMissions}>
          {t.backToChapters}
        </button>
      </div>
    </>
  )
}

function Briefing() {
  const index = useMission((m) => m.index)
  const racing = useRace((r) => r.phase === 'countdown' || r.phase === 'running')
  const text = missionText(MISSIONS[index].id)
  const chapter = chapterOf(index)
  const k = chapter.missions.findIndex((m) => m.id === MISSIONS[index].id)
  const t = ui()
  return (
    <>
      <Header title={`${t.missionNumber(k + 1)}${t.gap}${text.title}`} />
      <div className="muted small">{t.client(text.client)}</div>
      <div className="mission-comm">
        <b>{t.navi}</b>
        {text.briefing.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <div className="nav-heading">{t.goals}</div>
      <ol className="mission-goals">
        {text.steps.map((s) => (
          <li key={s.goal}>{s.goal}</li>
        ))}
      </ol>
      <ShipSkill chapter={chapter} ship={shipOf(index)} />
      {racing && <p className="muted small">{t.noRace}</p>}
      <div className="quiz-actions">
        <button className="engage" onClick={startMission} disabled={racing}>
          {t.depart}
        </button>
        <button className="secondary" onClick={openListFromBriefing}>
          {t.back}
        </button>
      </div>
    </>
  )
}

const openListFromBriefing = () => openChapter(useMission.getState().chapter)

/** 任務中：いまの目標と進み具合、航法AIのことば。トーストと重ならないよう、トーストをこの下へずらす */
function MissionBar() {
  const m = useMission()
  const def = MISSIONS[m.index]
  const text = missionText(def.id)
  const step = def.steps[m.step]
  const t = ui()
  const [folded, setFolded] = useState(false)
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => setFolded(false), [m.messageId])

  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const root = document.documentElement
    const place = () => {
      const rect = el.getBoundingClientRect()
      // 画面の上にあるときだけ（スマホの縦向きでは下にあるので、トーストはそのまま）
      if (rect.top < window.innerHeight / 2) root.style.setProperty('--toast-top', `${Math.round(rect.bottom + 10)}px`)
      else root.style.removeProperty('--toast-top')
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(el)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      root.style.removeProperty('--toast-top')
    }
  }, [])

  const craft = step.kind === 'launch' || step.kind === 'land'
  const timed = step.kind === 'unload' || step.kind === 'scan' || step.kind === 'load' || step.kind === 'photo' || step.kind === 'dock' || step.kind === 'sail' || craft
  let status: string
  if (step.kind === 'deflect') status = t.hits(m.progress, DEFLECT_HITS)
  else if (step.kind === 'beam') status = t.hits(m.progress, BEAM_NODES)
  else if (craft) status = m.craftOut !== null ? t.craftOut : m.craftReady ? '' : t.craftFar
  else if (step.kind === 'sail') status = t.sailMoved(Math.round(m.progress * 100))
  else if (step.kind === 'photo' || step.kind === 'dock') status = m.framing ? t.framing[m.framing] : ''
  else if (timed) status = m.progress > 0 ? t.progress(Math.round(m.progress * 100)) : t.waitNear
  else status = ''
  const fraction = step.kind === 'deflect' ? m.progress / DEFLECT_HITS : step.kind === 'beam' ? m.progress / BEAM_NODES : timed ? m.progress : 0

  const chapter = chapterOf(m.index)
  return (
    <>
    {step.kind === 'photo' && <Viewfinder />}
    <div className="mission-bar" ref={bar}>
      <div className="mission-head">
        <span className="mission-no">{t.missionNumber(chapter.missions.findIndex((x) => x.id === def.id) + 1)}</span>
        <span className="mission-name">{text.title}</span>
        <button className="race-quit" onClick={abortMission}>
          {t.quit}
        </button>
      </div>
      <div className="mission-goal">
        <span>▶ {text.steps[m.step].goal}</span>
        {status && <span className="mission-status">{status}</span>}
      </div>
      {fraction > 0 && (
        <div className="mission-meter">
          <div style={{ width: `${Math.round(fraction * 100)}%` }} />
        </div>
      )}
      {m.cargo && <div className="mission-cargo">{t.cargo}</div>}
      {step.kind === 'sail' && <div className="mission-cargo sail">{(step.light ?? 1) > 10 ? t.sailLaser : t.sailLight(sailRatio(step.light ?? 1))}</div>}
      {craft && m.craftReady && m.craftOut === null && (
        <button className="mission-launch" onClick={launchCraft}>
          {step.kind === 'land' ? t.land : t.launch} <kbd>L</kbd>
        </button>
      )}
      {step.kind === 'eclipse' && <EclipseAgain id={step.eclipse} />}
      {m.message && (
        <button className={`mission-comm${folded ? ' folded' : ''}`} key={m.messageId} onClick={() => setFolded(!folded)} aria-expanded={!folded}>
          <b>{t.navi}</b> {m.message}
        </button>
      )}
    </div>
    </>
  )
}

/** 光の強さの倍率を、読みやすい数に（1より小さいときは分数のように小数2けた） */
const sailRatio = (x: number) => (x >= 1 ? x.toFixed(1) : x.toFixed(x < 0.1 ? 3 : 2))

/** 日食の画面を閉じてしまったときに、もう一度開く */
function EclipseAgain({ id }: { id?: string }) {
  const open = useEclipse((e) => e.open && e.eclipseId === id)
  if (open || !id) return null
  return (
    <button className="secondary mission-again" onClick={() => (openEclipses(), playEclipse(id))}>
      {ui().eclipseAgain}
    </button>
  )
}

/** 撮影の枠：画面の真ん中に四すみのかぎ。目標が入ると緑になる */
function Viewfinder() {
  const framing = useMission((m) => m.framing)
  const mode = useStore((s) => s.mode)
  if (mode !== 'flight') return null
  const inset = `${Math.round((0.5 - PHOTO_FRAME / 2) * 100)}%`
  return (
    <div className={`viewfinder${framing === 'ok' ? ' ok' : ''}`} style={{ inset }} aria-hidden>
      <span />
      <span />
      <span />
      <span />
    </div>
  )
}

function Debrief() {
  const m = useMission()
  const def = MISSIONS[m.index]
  const text = missionText(def.id)
  const t = ui()
  const quiz = text.quiz[m.quizIndex]
  const picked = m.picked[m.quizIndex]
  const chapter = chapterOf(m.index)
  const last = chapter.missions[chapter.missions.length - 1].id === def.id

  return (
    <>
      <Header title={`${t.complete} ${text.title}`} />
      {m.message && (
        <div className="mission-comm">
          <b>{t.navi}</b> {m.message}
        </div>
      )}
      <div className="nav-heading">{t.learned}</div>
      <ul className="mission-summary">
        {text.summary.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      {text.real && (
        <div className="log-real">
          <h3>{t.realScience}</h3>
          <ul>
            {text.real.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {quiz ? (
        <>
          <div className="nav-heading">{t.quizTitle(m.quizIndex + 1, text.quiz.length)}</div>
          <div className="quiz-q">Q. {quiz.question}</div>
          <div className="quiz-choices">
            {quiz.choices.map((c, i) => (
              <button
                key={c}
                className={picked != null ? (i === quiz.answer ? 'right' : i === picked ? 'wrong' : '') : ''}
                disabled={picked != null}
                onClick={() => answerQuiz(i)}
              >
                {c}
              </button>
            ))}
          </div>
          {picked != null && (
            <>
              <div className="quiz-a">
                <strong>{picked === quiz.answer ? t.right : t.wrong(quiz.choices[quiz.answer])}</strong> {quiz.explanation}
              </div>
              <button className="engage" onClick={nextQuiz}>
                {m.quizIndex + 1 < text.quiz.length ? t.next : t.showResult}
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <div className="mission-result">
            <Stars n={m.earned ?? 1} big />
            <div className="muted small">{t.starsNote}</div>
            <div className="muted small">{t.best(m.stars[def.id] ?? 0)}</div>
          </div>
          {last && <p>{t.chapterDone}</p>}
          <div className="quiz-actions">
            {!last && (
              <button className="engage" onClick={() => showBriefing(m.index + 1)}>
                {t.nextMission}
              </button>
            )}
            <button className="secondary" onClick={() => showBriefing(m.index)}>
              {t.retry}
            </button>
            <button className="secondary" onClick={() => openChapter(CHAPTERS.indexOf(chapter))}>
              {t.back}
            </button>
            <button className="secondary" onClick={openMissions}>
              {t.backToChapters}
            </button>
          </div>
        </>
      )}
    </>
  )
}
