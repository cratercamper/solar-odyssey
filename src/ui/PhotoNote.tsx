import { saveData } from '../state/save'
import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'

// 写真モードに切り替えたときの短い解説。閉じられて、「次回から表示しない」も選べる

const HIDE_KEY = 'photo-note-hidden'

const hidden = () => {
  try {
    return saveData.get(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

export function PhotoNote() {
  useLang()
  const [open, setOpen] = useState(false)
  const [never, setNever] = useState(false)

  // 図鑑モードから写真モードへ切り替えた瞬間に出す（開いたときから写真モードのときは出さない）
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.settings.look === 'photo' && prev.settings.look !== 'photo' && !hidden()) setOpen(true)
        if (s.settings.look !== 'photo') setOpen(false)
      }),
    [],
  )
  if (!open) return null

  const close = () => {
    if (never) {
      try {
        saveData.set(HIDE_KEY, '1')
      } catch {
        // 保存できなくても閉じる
      }
    }
    setOpen(false)
  }

  const notes = [
    ui().photoNote.noStars,
    ui().photoNote.gasGiantEdge,
    ui().photoNote.airlessWorlds,
    ui().photoNote.enhancedColor,
  ]

  return (
    <div className="photo-note" role="dialog" aria-label={ui().photoNote.label}>
      <h3>{ui().photoNote.title}</h3>
      <ul>
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <div className="photo-note-foot">
        <label>
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} />
          {ui().photoNote.neverAgain}
        </label>
        <button className="secondary" onClick={close}>{ui().photoNote.close}</button>
      </div>
    </div>
  )
}
