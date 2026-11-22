import { useEffect, useState } from 'react'
import { SCAN_RANGE, beginScan, closeFresh, nameDiscovery, openNote, stopScanner, useDiscovery } from '../state/discovery'
import { EVEREST_KM, NAME_MAX } from '../data/discovery'
import { playBeep } from '../audio/sfx'
import { useStore } from '../state/store'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'
import './discovery.css'

/** 発見の写真（まだ撮れていなければ、種類の色の丸） */
export function RockPhoto({ photo, kind, className }: { photo?: string; kind: number; className?: string }) {
  const t = ui().discovery
  return (
    <span className={`rock-photo kind-${kind}${className ? ` ${className}` : ''}`}>
      {photo ? <img src={photo} alt={t.photo} /> : <i aria-label={t.noPhoto} />}
    </span>
  )
}

/** 見つけたばかりの岩：写真がポンと出て、仮符号、種類と大きさ（エベレストとくらべて）、名前を付ける */
function FreshCard() {
  const fresh = useDiscovery((s) => s.fresh)
  const again = useDiscovery((s) => s.freshKnown)
  // 写真は 1 フレームあとで撮れるので、記録から読み直す
  const photo = useDiscovery((s) => (s.fresh ? s.found.find((d) => d.key === s.fresh!.key)?.photo : undefined))
  const [name, setName] = useState('')
  const [more, setMore] = useState(false)
  useEffect(() => (setName(fresh?.name ?? ''), setMore(false)), [fresh])
  // シャッターの音と、ピロリンという発見の音
  useEffect(() => {
    if (!fresh || again) return
    playBeep(1800, 0.05)
    const a = setTimeout(() => playBeep(784, 0.14), 260)
    const b = setTimeout(() => playBeep(1175, 0.3), 400)
    return () => (clearTimeout(a), clearTimeout(b))
  }, [fresh, again])
  if (!fresh) return null
  const t = ui().discovery
  return (
    <>
      {!again && <div className="scan-flash" aria-hidden="true" />}
      <section className={`scan-fresh${again ? ' again' : ''}`} role="dialog" aria-label={again ? t.known : t.newFind}>
        <div className="fresh-top">
          <figure className="fresh-polaroid">
            <RockPhoto photo={photo} kind={fresh.kind} />
            <figcaption>{fresh.code}</figcaption>
          </figure>
          <div className="fresh-facts">
            <h2>{again ? t.known : t.newFind}</h2>
            <p className="scan-code">
              <b>{t.label(fresh.name, fresh.code)}</b>
            </p>
            <p>
              <span className={`kind-chip kind-${fresh.kind}`}>{t.kind[fresh.kind]}</span>
            </p>
            <p className="fresh-size">{t.sizeVs(fresh.sizeKm, fresh.sizeKm / EVEREST_KM)}</p>
          </div>
        </div>
        <label className="scan-name">
          <span>{t.namePrompt}</span>
          <input
            value={name}
            maxLength={NAME_MAX}
            placeholder={t.namePlaceholder}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') nameDiscovery(fresh.key, name)
            }}
          />
        </label>
        <div className="scan-actions">
          <button className="scan-primary" onClick={() => nameDiscovery(fresh.key, name)}>{t.save}</button>
          <button className="secondary" onClick={closeFresh}>
            {t.later}
          </button>
          <button className="secondary fresh-more" onClick={() => setMore((v) => !v)} aria-expanded={more}>
            {more ? t.less : `ℹ ${t.more}`}
          </button>
        </div>
        {more && (
          <div className="fresh-notes">
            <p className="small">{t.kindNote[fresh.kind]}</p>
            <p className="muted small">{t.codeNote}</p>
            <p className="muted small">{t.realNaming}</p>
          </div>
        )}
      </section>
    </>
  )
}

/** スキャナーを入れているあいだの表示：近くの岩の印、スキャンのボタン（H）、発見ノート、切る */
export function ScannerHud() {
  const on = useDiscovery((s) => s.on)
  const candidate = useDiscovery((s) => s.candidate)
  const progress = useDiscovery((s) => s.progress)
  const away = useDiscovery((s) => s.beltAway)
  const count = useDiscovery((s) => s.found.length)
  const flight = useStore((s) => s.mode === 'flight')
  useLang()

  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyH' || e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return
      beginScan()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on])

  if (!on || !flight) return <FreshCard />
  const t = ui().discovery
  const status = candidate ? t.rockInRange : away > SCAN_RANGE ? t.goBelt : t.noRock
  return (
    <>
      <div id="scan-marker" className="scan-marker" aria-hidden="true">
        <span>◇</span>
      </div>
      <section className="scanner-hud" aria-label={t.scanner}>
        <p className="scanner-status">{progress !== null ? t.scanning : status}</p>
        {progress !== null && (
          <div className="scan-bar">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        <div className="scan-actions">
          <button className="scan-primary scan-go" onClick={beginScan} disabled={!candidate || progress !== null}>
            📡 {t.scan} <kbd>H</kbd>
          </button>
          <button className="secondary" onClick={openNote}>
            {t.note} {count > 0 && <span className="muted">{t.noteCount(count)}</span>}
          </button>
          <button className="secondary scan-stop" onClick={stopScanner} aria-label={t.stop} title={t.stop}>
            ×
          </button>
        </div>
      </section>
      <FreshCard />
    </>
  )
}
