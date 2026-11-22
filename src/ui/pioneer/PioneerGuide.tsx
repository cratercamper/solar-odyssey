import { useState } from 'react'
import { ui } from '../../i18n'
import { showGuide } from '../../state/pioneer'

// 開拓の遊び方（初めて始めたとき・カードの「？」）。4 枚の絵で、砕く → 集める → 納める → 建てる

const Ship = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M0 0l-16 -7 4 7 -4 7z" fill="#e8ecf6" />
    <circle cx="-15" cy="0" r="2.5" fill="#7fd3ff" className="g-engine" />
  </g>
)

const Rock = ({ x, y, r, res }: { x: number; y: number; r: number; res: 'metal' | 'ice' }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d={`M${-r} 0l${r * 0.4} ${-r * 0.8} ${r} ${-r * 0.1} ${r * 0.5} ${r * 0.7} ${-r * 0.6} ${r * 0.8} ${-r * 0.9} ${-r * 0.2}z`} fill="#6b6170" />
    <circle r={r * 1.6} fill="none" stroke={`var(--pio-${res})`} strokeWidth="2" className="g-ring" />
  </g>
)

const Shard = ({ x, y, res, d }: { x: number; y: number; res: string; d: number }) => (
  <path d={`M${x} ${y - 4}l3 4 -3 4 -3 -4z`} fill={`var(--pio-${res})`} className="g-shard" style={{ animationDelay: `${d}s` }} />
)

const pictures = [
  // 砕く
  <svg key="0" viewBox="0 0 240 120">
    <Ship x={50} y={64} />
    <path d="M52 64L150 50" stroke="#7fb8ff" strokeWidth="3" className="g-beam" />
    <Rock x={156} y={48} r={14} res="metal" />
    <Rock x={196} y={86} r={10} res="ice" />
    <Rock x={120} y={98} r={7} res="metal" />
  </svg>,
  // 集める
  <svg key="1" viewBox="0 0 240 120">
    <path d="M150 120a90 90 0 0 1 90 -60v60z" fill="#d9a877" />
    <path d="M160 112c20 -22 50 -34 80 -36" stroke="var(--pio-gas)" strokeWidth="3" fill="none" strokeDasharray="5 5" className="g-flow" />
    <Ship x={70} y={60} />
    <path d="M150 30C120 30 100 50 76 58" stroke="#ffffff33" strokeDasharray="3 4" fill="none" />
    <Shard x={140} y={32} res="metal" d={0} />
    <Shard x={118} y={38} res="ice" d={0.4} />
    <Shard x={98} y={48} res="metal" d={0.8} />
  </svg>,
  // 納める
  <svg key="2" viewBox="0 0 240 120">
    <g transform="translate(170 60)">
      <circle r="34" fill="none" stroke="#c9d6ee" strokeWidth="5" />
      <path d="M0 -34v68M-34 0h68" stroke="#c9d6ee" strokeWidth="2" />
      <rect x="-8" y="-8" width="16" height="16" rx="2" fill="var(--pio-ice)" className="g-pulse" />
    </g>
    <Ship x={70} y={60} />
    <path d="M80 60h46" stroke="#ffd86b" strokeWidth="2.5" markerEnd="url(#pio-arrow)" className="g-flow" strokeDasharray="6 4" />
    <defs>
      <marker id="pio-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0 0l10 5 -10 5z" fill="#ffd86b" />
      </marker>
    </defs>
  </svg>,
  // 建てる
  <svg key="3" viewBox="0 0 240 120">
    {[0, 1, 2, 3, 4].map((i) => (
      <rect key={i} x={40 + i * 33} y={44} width={30} height={32} rx={i === 0 || i === 4 ? 12 : 3} fill={i < 3 ? 'var(--accent)' : 'none'} stroke="#c9d6ee" strokeWidth="1.5" strokeDasharray={i < 3 ? undefined : '4 3'} className={i === 2 ? 'g-pulse' : undefined} opacity={i < 3 ? 0.85 : 0.6} />
    ))}
    <path d="M120 18l3 6 6.5 1 -4.7 4.5 1.1 6.5 -5.9 -3 -5.9 3 1.1 -6.5 -4.7 -4.5 6.5 -1z" fill="#ffd86b" className="g-pulse" />
  </svg>,
]

export function PioneerGuide() {
  const [i, setI] = useState(0)
  const t = ui().pioneer.guide
  const steps = t.steps
  const last = i === steps.length - 1
  return (
    <div className="pioneer-panel pio-guide" role="dialog" aria-label={t.title}>
      <header>
        <h2>{t.title}</h2>
        <button type="button" className="pio-skip" onClick={() => showGuide(false)}>
          {t.skip}
        </button>
      </header>
      <div className="pio-guide-pic" key={i}>
        {pictures[i]}
      </div>
      <h3 className="pio-guide-step">
        <span>{i + 1}</span>
        {steps[i].title}
      </h3>
      <p className="pio-guide-text">{steps[i].text}</p>
      <div className="pio-guide-dots" aria-hidden>
        {steps.map((s, k) => (
          <i key={s.title} className={k === i ? 'now' : k < i ? 'done' : ''} />
        ))}
      </div>
      <footer>
        <button type="button" disabled={i === 0} onClick={() => setI(i - 1)}>
          {t.back}
        </button>
        <button type="button" className="pio-build" onClick={() => (last ? showGuide(false) : setI(i + 1))}>
          {last ? t.start : t.next}
        </button>
      </footer>
    </div>
  )
}
