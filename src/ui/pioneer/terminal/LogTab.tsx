import { useRef, useState } from 'react'
import { ui } from '../../../i18n'
import { capacity, usePioneer } from '../../../state/pioneer'
import { RARE_IDS, RESOURCES, total, tripStats } from '../../../data/pioneer'

// 端末「記録」：納めた回ごとの量の積み上げ棒グラフ（積める量の線つき、建てた回に星）と、まとめの数字

const W = 340
const H = 170
const PL = 30
const PR = 8
const PT = 16
const PB = 20
const SEG_GAP = 2

export function LogTab() {
  const p = usePioneer()
  const t = ui().pioneer
  const tl = t.term.log
  const [hover, setHover] = useState<number | null>(null)
  const pointer = useRef('mouse')
  const log = p.log ?? []
  const trips = Math.max(p.trips ?? 0, log.length)
  const cap = capacity()

  // 古いセーブ（記録を付ける前に進めていた）なら、記録はここから始まると伝える
  if (log.length === 0) return <p className="pio-empty">{p.stage > 0 || (p.trips ?? 0) > 0 ? tl.emptyOld : tl.empty}</p>

  const st = tripStats(log)
  const first = trips - log.length + 1
  const top = Math.max(cap, st.best) * 1.12
  const plotW = W - PL - PR
  const plotH = H - PT - PB
  const slot = plotW / Math.max(log.length, 6)
  const barW = Math.min(18, slot - 3)
  const y = (v: number) => PT + plotH - (v / top) * plotH
  const capY = y(cap)
  const hv = hover !== null ? log[hover] : null

  return (
    <div className="pio-tab-log">
      <div className="pio-stats">
        <div>
          <small>{tl.trips}</small>
          <b>{trips}</b>
        </div>
        <div>
          <small>{tl.total}</small>
          <b>{total(st.sum)}</b>
        </div>
        <div>
          <small>{tl.average}</small>
          <b>
            {st.average}
            <span>{t.term.of(cap)}</span>
          </b>
        </div>
        <div>
          <small>{tl.best}</small>
          <b>{st.best}</b>
        </div>
      </div>
      <div className="pio-chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="pio-bars" role="img" aria-label={tl.title} onMouseLeave={() => setHover(null)}>
          <line x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} className="pio-axis" />
          <text x={PL - 5} y={y(0) + 3} textAnchor="end" className="pio-tick-label">
            0
          </text>
          <line x1={PL} x2={W - PR} y1={capY} y2={capY} className="pio-cap-line" />
          <text x={PL - 5} y={capY + 3} textAnchor="end" className="pio-tick-label">
            {cap}
          </text>
          <text x={W - PR} y={capY - 4} textAnchor="end" className="pio-tick-label">
            {tl.capacity(cap)}
          </text>
          {log.map((trip, i) => {
            const cx = PL + slot * i + slot / 2
            const x = cx - barW / 2
            let base = y(0)
            const segs = RESOURCES.filter((r) => trip.a[r] > 0).map((r, j) => {
              const h = (trip.a[r] / top) * plotH
              const gap = j > 0 ? SEG_GAP : 0
              const seg = { r, y: base - h, h: Math.max(1, h - gap) }
              base -= h
              return seg
            })
            const sum = total(trip.a)
            return (
              <g key={i} className={hover === i ? 'pio-tbar hover' : 'pio-tbar'}>
                <clipPath id={`pio-bar-${i}`}>
                  <rect x={x} y={y(sum)} width={barW} height={y(0) - y(sum) + 4} rx="3" />
                </clipPath>
                <g clipPath={`url(#pio-bar-${i})`}>
                  {segs.map((sg) => (
                    <rect key={sg.r} x={x} y={sg.y} width={barW} height={sg.h} className={`pio-node-${sg.r}`} />
                  ))}
                </g>
                {trip.built && (
                  <path d="M0 -5l1.5 3.1 3.4.5-2.5 2.4.6 3.4L0 2.8l-3 1.6.6-3.4L-4.9-1.4l3.4-.5z" transform={`translate(${cx} ${y(sum) - 8})`} className="pio-star" />
                )}
                <rect
                  x={cx - slot / 2}
                  y={PT}
                  width={slot}
                  height={plotH}
                  className="pio-bar-hit"
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse') setHover(i)
                  }}
                  onPointerDown={(e) => {
                    pointer.current = e.pointerType
                  }}
                  onClick={() => {
                    // マウスは乗せるだけで出る。指で触ったときは、押すたびに出す・消す
                    if (pointer.current !== 'mouse') setHover(hover === i ? null : i)
                  }}
                />
              </g>
            )
          })}
          <text x={PL + slot / 2} y={H - 5} textAnchor="middle" className="pio-tick-label">
            {first}
          </text>
          {log.length > 1 && (
            <text x={PL + slot * (log.length - 1) + slot / 2} y={H - 5} textAnchor="middle" className="pio-tick-label">
              {trips}
            </text>
          )}
        </svg>
        {hv && hover !== null && (
          <div className="pio-tip" style={{ left: `${Math.min(80, Math.max(20, ((PL + slot * hover + slot / 2) / W) * 100))}%` }} role="status">
            <b>{tl.tripN(first + hover)}</b>
            {RESOURCES.filter((r) => hv.a[r] > 0).map((r) => (
              <span key={r}>
                <i className={`pio-dot pio-${r}`} />
                {t.term.amount(t.resource[r], hv.a[r])}
              </span>
            ))}
            {hv.built && <em>{tl.built(hv.built.map((b) => t.stageName[b]))}</em>}
          </div>
        )}
      </div>
      <div className="pio-legend">
        {RESOURCES.map((r) => (
          <span key={r}>
            <i className={`pio-dot pio-${r}`} />
            {t.resource[r]}
          </span>
        ))}
        <span>
          <i className="pio-sw-cap" />
          {tl.capacity(cap)}
        </span>
      </div>
      {RARE_IDS.some((id) => (p.rare?.[id] ?? 0) > 0) && (
        <p className="pio-built-chips pio-rares">
          <small>{t.rare.collection}</small>
          {RARE_IDS.filter((id) => (p.rare?.[id] ?? 0) > 0).map((id) => (
            <span key={id}>{t.term.amount(t.rare.name[id], p.rare![id])}</span>
          ))}
        </p>
      )}
      <p className="pio-science">
        {first > 1 ? t.term.and(tl.tip, tl.older(first - 1)) : tl.tip}
      </p>
    </div>
  )
}
