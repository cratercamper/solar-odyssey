import { useEffect } from 'react'
import { APOLLO17, APOLLO17_TOTAL, type Historic } from '../data/apollo17'
import { closeHistoricBook, useHistoric } from '../state/historic'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'
import { HistoricPhoto } from './HistoricPhoto'

// アポロ17号の史跡ずかん：タウルス・リットロウ谷で訪ねた場所の話。まだの場所は ？？？ と、着陸船からの向きと距離だけ

/** 着陸地点（レース場のスタート）からの向きと距離 */
function where(it: Historic) {
  const d = Math.hypot(it.x, it.z)
  const k = Math.round(((Math.atan2(it.x, -it.z) * 180) / Math.PI + 360) / 45) % 8
  const dist = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 10) * 10} m`
  return ui().historicBook.fromLandingSpot(ui().historicBook.directions[k], dist)
}

function Detail({ it, got }: { it: Historic; got: boolean }) {
  return (
    <div className={`rock-detail${got ? ' got' : ''}`}>
      <button className="secondary rock-back" onClick={() => useHistoric.setState({ sel: null })}>
        ◀ {ui().historicBook.back}
      </button>
      <div className="historic-detail">
        <span className="historic-icon big">{got ? it.icon : ui().historicBook.unknownIcon}</span>
        <div className="rock-text">
          <h3>{got ? ui().apollo17[it.id].name : ui().historicBook.unknownName}</h3>
          {got ? (
            <>
              <p className="historic-when">{ui().apollo17[it.id].when}</p>
              <p>{ui().apollo17[it.id].story}</p>
              <HistoricPhoto it={it} />
            </>
          ) : (
            <p className="muted">
              {ui().historicBook.notVisitedYet}
              {ui().historicBook.notVisitedWhere(where(it))}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export function HistoricBook() {
  useLang()
  const open = useHistoric((s) => s.book)
  const sel = useHistoric((s) => s.sel)
  const found = useHistoric((s) => s.found)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      e.stopPropagation()
      if (useHistoric.getState().sel) useHistoric.setState({ sel: null })
      else closeHistoricBook()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null
  const it = APOLLO17.find((x) => x.id === sel)
  return (
    <section className="rock-book historic-book" role="dialog" aria-label={ui().historicBook.title}>
      <header>
        <h2>{ui().historicBook.title}</h2>
        <span className="rock-total">
          {found.length} / {APOLLO17_TOTAL}
        </span>
        <button className="close" onClick={closeHistoricBook} aria-label={ui().historicBook.close}>
          ×
        </button>
      </header>
      {it ? (
        <Detail it={it} got={found.includes(it.id)} />
      ) : (
        <>
          <p className="muted small">
            {ui().historicBook.intro}
          </p>
          <div className="rock-grid historic-grid">
            {APOLLO17.map((x) => {
              const got = found.includes(x.id)
              return (
                <button key={x.id} className={`rock-card historic-item${got ? ' got' : ''}`} onClick={() => useHistoric.setState({ sel: x.id })}>
                  <span className="historic-icon">{got ? x.icon : ui().historicBook.unknownIcon}</span>
                  <span className="rock-name">{got ? ui().apollo17[x.id].name : x.no ? ui().historicBook.station(x.no) : ui().historicBook.unknownName}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
