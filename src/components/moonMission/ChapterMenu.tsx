import { useState } from 'react'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { useMoonMission } from '../../state/moonMission'
import { CHAPTERS, chapterOf, nextChapter, startChapter } from '../../state/missionChapters'
import './chapterMenu.css'

/** 章の一覧：どの章からでも始められる。いまの章の次へ飛ばすボタンつき */
export function ChapterMenu() {
  useLang()
  const [open, setOpen] = useState(false)
  const phase = useMoonMission((s) => s.phase)
  const T = ui().moonMission.chapters
  const now = chapterOf(phase)
  const next = nextChapter(phase)
  const go = (n: number) => {
    setOpen(false)
    startChapter(n)
  }
  return (
    <>
      <button className={`cm-open ${open ? 'on' : ''}`} aria-expanded={open} aria-label={T.title} onClick={() => setOpen(!open)}>
        {now === null ? T.button : <span className="cm-open-name">{T.buttonAt(now + 1, CHAPTERS.length, T.names[now])}</span>} ▾
      </button>
      {open && (
        <div className="cm-panel" role="dialog" aria-label={T.title}>
          <div className="cm-head">
            <span>{T.title}</span>
            <button className="cm-close" onClick={() => setOpen(false)} aria-label={T.close}>
              ×
            </button>
          </div>
          {next && (
            <button className="cm-next" onClick={() => go(next.n)}>
              {T.next} ▶
            </button>
          )}
          <ol className="cm-list">
            {CHAPTERS.map((c) => (
              <li key={c.n} className={`${c.n === now ? 'now' : ''} ${c.start ? '' : 'soon'}`}>
                <button disabled={!c.start} onClick={() => go(c.n)}>
                  <span className="cm-n">{c.n + 1}</span>
                  <span className="cm-text">
                    <b>{T.names[c.n]}</b>
                    <i>{T.lines[c.n]}</i>
                  </span>
                  {c.n === now && <span className="cm-tag now">{T.now}</span>}
                  {!c.start && <span className="cm-tag">{T.soon}</span>}
                </button>
              </li>
            ))}
          </ol>
          <p className="cm-music">♪ {T.music}</p>
        </div>
      )}
    </>
  )
}

/** 発射台のカードに出す「続きから」（前に先の章まで進んでいたとき） */
export function ResumeButton() {
  useLang()
  const saved = useMoonMission((s) => s.best.chapter)
  const T = ui().moonMission.chapters
  if (!saved || !CHAPTERS[saved]?.start) return null
  return (
    <button className="mm-chapter" onClick={() => startChapter(saved)}>
      {T.resume(T.names[saved])}
    </button>
  )
}
