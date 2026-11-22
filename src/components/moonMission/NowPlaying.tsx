import { useEffect, useState } from 'react'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { useNowPlaying } from '../../audio/missionMusic'
import './nowPlaying.css'

/** 曲が流れ始めたら、しばらく曲名と作曲者を出す（子どもが名曲の名前にふれられるように。junji 2026-11-22） */
const SHOW = 8

export function NowPlaying() {
  useLang()
  const { cue, at } = useNowPlaying()
  const [, tick] = useState(0)
  useEffect(() => {
    if (!cue) return
    const id = setTimeout(() => tick((n) => n + 1), SHOW * 1000 + 50)
    return () => clearTimeout(id)
  }, [cue, at])
  if (!cue || performance.now() / 1000 - at > SHOW) return null
  const T = ui().moonMission.nowPlaying
  const m = T.cues[cue]
  return (
    <div className="np-card" role="status" key={at}>
      <div className="np-label">♪ {T.label}</div>
      <div className="np-title">{m.title}</div>
      <div className="np-by">{m.by}</div>
    </div>
  )
}
