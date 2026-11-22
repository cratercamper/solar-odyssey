import { useEffect, useState } from 'react'
import { closeNote, nameDiscovery, useDiscovery } from '../state/discovery'
import { NAME_MAX } from '../data/discovery'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'
import { RockPhoto } from './ScannerHud'
import './discovery.css'

/** 発見ノート：見つけた小惑星の写真帳（発見したときの写真・名前・種類・大きさ）。名前はあとから変えられる */
export function DiscoveryNote() {
  const open = useDiscovery((s) => s.noteOpen)
  const found = useDiscovery((s) => s.found)
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  useLang()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      e.stopPropagation()
      closeNote()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null
  const t = ui().discovery
  return (
    <section className="discovery-note" role="dialog" aria-label={t.noteTitle}>
      <header>
        <h2>
          {t.noteTitle} <span className="muted small">{t.noteCount(found.length)}</span>
        </h2>
        <button className="close" onClick={closeNote} aria-label={t.close}>
          ×
        </button>
      </header>
      {found.length === 0 ? (
        <p className="muted">{t.noteEmpty}</p>
      ) : (
        <ul className="photo-book">
          {[...found].reverse().map((d) => (
            <li key={d.key} className={`kind-${d.kind}`}>
              <RockPhoto photo={d.photo} kind={d.kind} />
              {editing === d.key ? (
                <span className="scan-name inline">
                  <input
                    autoFocus
                    value={name}
                    maxLength={NAME_MAX}
                    placeholder={t.namePlaceholder}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') (nameDiscovery(d.key, name), setEditing(null))
                    }}
                  />
                  <button className="scan-primary" onClick={() => (nameDiscovery(d.key, name), setEditing(null))}>{t.save}</button>
                </span>
              ) : (
                <b>{t.label(d.name, d.code)}</b>
              )}
              <span className="small">
                <span className={`kind-chip kind-${d.kind}`}>{t.kind[d.kind]}</span> {t.size(d.sizeKm)}
              </span>
              <span className="muted small">{t.foundOn(new Date(d.at))}</span>
              {editing !== d.key && (
                <button className="secondary small-button" onClick={() => (setEditing(d.key), setName(d.name))}>
                  {t.rename}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">{t.realNaming}</p>
    </section>
  )
}
