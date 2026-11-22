import { useEffect, useState } from 'react'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { useRadio } from '../../audio/radio'
import { RADIO } from '../../data/apolloRadio'
import './radioSubtitle.css'

/** 本物の交信音声の字幕：だれの声か・原文・訳・本物の経過時間 */
export function RadioSubtitle() {
  useLang()
  const playing = useRadio((s) => s.playing)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => tick((n) => n + 1), 100)
    return () => clearInterval(id)
  }, [playing])
  if (!playing) return null
  const T = ui().moonMission.radio
  const clip = RADIO[playing.id]
  const t = performance.now() / 1000 - playing.at
  const line = clip.lines.find((l) => t >= l.from && t < l.to)
  const text = line ? T.lines[line.key] : null
  return (
    <div className="radio-sub" role="status">
      <div className="radio-sub-source">
        <span className="radio-sub-dot" />
        {T.source} · {clip.get}
      </div>
      {line && text && (
        <div className="radio-sub-line" key={line.key}>
          <div className="radio-sub-who">{T.who[line.who]}</div>
          {text[0] && <div className="radio-sub-orig">{text[0]}</div>}
          {text[1] && <div className="radio-sub-tr">{text[1]}</div>}
        </div>
      )}
    </div>
  )
}
