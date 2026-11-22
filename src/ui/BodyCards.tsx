import { useEffect, useState } from 'react'
import { BODY_CARDS, EARTH_G, cardOf, parentOf, type BodyCard } from '../data/bodyCards'
import { PLANETS, SUN } from '../data/bodies'
import { closeBodyCard, stepBodyCard, useBodyCards } from '../state/bodyCards'
import { useStore } from '../state/store'
import { useLanding } from '../state/landing'
import { warpToMissed } from '../state/quiz'
import { openSizeCompare } from '../state/sizeCompare'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'
import './bodyCards.css'

const EARTH = cardOf('earth')!
const EARTH_COLOR = '#3a7bd5'

const nameOf = (id: string) => ui().bodies[id].name

function colorOf(id: string) {
  if (id === 'sun') return SUN.color
  for (const p of PLANETS) {
    if (p.id === id) return p.color
    const m = p.moons.find((x) => x.id === id)
    if (m) return m.color
  }
  return '#ccc'
}

function kindOf(id: string) {
  const t = ui().bodyCards
  if (id === 'sun') return t.kindStar
  const parent = parentOf(id)
  if (parent) return t.kindMoonOf(nameOf(parent))
  return PLANETS.find((p) => p.id === id)?.dwarf ? t.kindDwarf : t.kindPlanet
}

/** 大きさ：地球と本当の比で並べた円 */
function SizeCompare({ c }: { c: BodyCard }) {
  const t = ui().bodyCards
  const ratio = c.radiusKm / EARTH.radiusKm
  const R = 62
  const rBody = ratio >= 1 ? R : Math.max(R * ratio, 1.2)
  const rEarth = ratio >= 1 ? Math.max(R / ratio, 1.2) : R
  const dot = Math.min(rBody, rEarth) <= 1.2
  const w = 2 * rBody + 2 * rEarth + 48
  return (
    <div className="bc-row">
      <h3>{t.size}</h3>
      <svg className="bc-size" viewBox={`0 0 ${w} ${2 * R + 22}`} role="img" aria-label={t.timesEarth(ratio)}>
        <circle cx={rBody + 8} cy={R} r={rBody} fill={colorOf(c.id)} />
        <circle cx={2 * rBody + 40 + rEarth} cy={R} r={rEarth} fill={EARTH_COLOR} />
        <text x={rBody + 8} y={2 * R + 18} textAnchor="middle">
          {nameOf(c.id)}
        </text>
        <text x={2 * rBody + 40 + rEarth} y={2 * R + 18} textAnchor="middle">
          {t.earth}
        </text>
      </svg>
      <p>
        <b>{t.diameter(t.km(c.radiusKm * 2))}</b>
        {ui().gap}
        {t.timesEarth(ratio)}
        {dot && t.tooSmall}
      </p>
      <p className="muted small">{t.sizeNote}</p>
      <button className="secondary bc-3d" onClick={() => openSizeCompare(c.id)}>
        {ui().sizeCompare.open3d}
      </button>
    </div>
  )
}

/** 2本の棒で地球とくらべる（長いほうを全幅に） */
function Bars({ body, earth, label }: { body: number; earth: number; label: string }) {
  const max = Math.max(body, earth)
  const pct = (v: number) => `${Math.max((v / max) * 100, 0.8)}%`
  return (
    <div className="bc-bars">
      <div className="bc-bar">
        <span className="bc-k">{label}</span>
        <span className="bc-track">
          <span className="bc-fill" style={{ width: pct(body) }} />
        </span>
      </div>
      <div className="bc-bar">
        <span className="bc-k">{ui().bodyCards.earth}</span>
        <span className="bc-track">
          <span className="bc-fill earth" style={{ width: pct(earth) }} />
        </span>
      </div>
    </div>
  )
}

function Gravity({ c }: { c: BodyCard }) {
  const t = ui().bodyCards
  const x = c.gravity / EARTH_G
  const jump = 0.5 / x
  return (
    <div className="bc-row">
      <h3>{t.gravity}</h3>
      <Bars body={x} earth={1} label={nameOf(c.id)} />
      <p>
        <b>{t.gravityValue(c.gravity)}</b>
        {ui().gap}
        {t.timesEarth(x)}
      </p>
      {c.id !== 'earth' && <p>{t.weight(30 * x)}</p>}
      {c.id !== 'earth' && !c.noGround && <p>{x < 1 ? t.jump(jump) : t.jumpLess(jump)}</p>}
      {c.noGround && <p className="muted small">{c.id === 'sun' ? t.sunSurface : t.cloudTops}</p>}
    </div>
  )
}

function Day({ c }: { c: BodyCard }) {
  const t = ui().bodyCards
  const x = c.dayHours / 24
  const note = c.id === 'sun' ? t.dayNoteSun : parentOf(c.id) ? t.dayNoteMoon : c.retrograde ? t.dayNoteRetro : t.dayNote
  return (
    <div className="bc-row">
      <h3>{t.day}</h3>
      <Bars body={x} earth={1} label={nameOf(c.id)} />
      <p>
        <b>{t.dayLength(c.dayHours)}</b>
        {ui().gap}
        {t.dayVsEarth(x)}
      </p>
      <p className="muted small">{note}</p>
    </div>
  )
}

// 温度の目盛り：−273℃（いちばん低い温度）から 600℃ まで。太陽の表面は右の端の外
const T_MIN = -273
const T_MAX = 600
const at = (c: number) => `${((Math.min(Math.max(c, T_MIN), T_MAX) - T_MIN) / (T_MAX - T_MIN)) * 100}%`

function Temperature({ c }: { c: BodyCard }) {
  const t = ui().bodyCards
  const tp = c.temp
  const text = !tp
    ? null
    : tp.min !== undefined && tp.max !== undefined
      ? tp.mean !== undefined
        ? t.tempRangeMean(t.temp(tp.min), t.temp(tp.max), t.temp(tp.mean))
        : t.tempRange(t.temp(tp.min), t.temp(tp.max))
      : t.tempAbout(t.temp(tp.mean!))
  const span = (min: number, max: number, cls: string) => (
    <span className={`bc-span ${cls}`} style={{ left: at(min), width: `calc(${at(max)} - ${at(min)} + 4px)` }} />
  )
  return (
    <div className="bc-row">
      <h3>{t.temperature}</h3>
      <div className="bc-thermo" aria-hidden="true">
        <span className="bc-zero" style={{ left: at(0) }} />
        {span(-89, 57, 'earth')}
        {tp && (tp.min !== undefined && tp.max !== undefined ? span(tp.min, tp.max, 'body') : span(tp.mean!, tp.mean!, 'body'))}
        {tp?.mean !== undefined && tp.mean > T_MAX && <span className="bc-off">▶</span>}
      </div>
      <div className="bc-scale muted small">
        <span>{t.temp(T_MIN)}</span>
        <span style={{ left: at(0) }}>{t.temp(0)}</span>
        <span>{t.temp(T_MAX)}</span>
      </div>
      <p>{text ? <b>{text}</b> : <span className="muted">{t.tempUnknown}</span>}</p>
      <p className="muted small">
        <span className="bc-key earth" /> {t.tempEarth} <span className="bc-key body" /> {nameOf(c.id)}
      </p>
    </div>
  )
}

/** 天体カード：大きさ・重力・1日の長さ・気温を、地球と並べてくらべる */
export function BodyCards() {
  const open = useBodyCards((s) => s.open)
  const id = useBodyCards((s) => s.id)
  const mode = useStore((s) => s.mode)
  const landing = useLanding((l) => l.phase)
  const [list, setList] = useState(false)
  useLang()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') closeBodyCard()
      else if (e.code === 'ArrowLeft') stepBodyCard(-1)
      else if (e.code === 'ArrowRight') stepBodyCard(1)
      else return
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  useEffect(() => setList(false), [id])

  const c = cardOf(id)
  if (!open || !c) return null
  const t = ui().bodyCards
  const canGo = landing === 'idle' && mode !== 'gallery' && useStore.getState().targetId !== id

  return (
    <section className="body-cards" role="dialog" aria-label={t.title}>
      <header>
        <button className="secondary bc-step" onClick={() => stepBodyCard(-1)} aria-label={t.prev}>
          ◀
        </button>
        <div className="bc-title">
          <h2>{nameOf(c.id)}</h2>
          <span className="muted small">{kindOf(c.id)}</span>
        </div>
        <button className="secondary bc-step" onClick={() => stepBodyCard(1)} aria-label={t.next}>
          ▶
        </button>
        <button className="close" onClick={closeBodyCard} aria-label={t.close}>
          ×
        </button>
      </header>
      <div className="bc-grid">
        <SizeCompare c={c} />
        <Gravity c={c} />
        <Day c={c} />
        <Temperature c={c} />
      </div>
      <footer>
        <button className="secondary" onClick={() => setList(!list)} aria-expanded={list}>
          {t.pickOther} {list ? '▲' : '▼'}
        </button>
        {canGo && (
          <button
            className="secondary"
            onClick={() => {
              closeBodyCard()
              warpToMissed(c.id)
            }}
          >
            🚀 {t.goThere}
          </button>
        )}
        <span className="muted small bc-source">{t.source}</span>
      </footer>
      {list && (
        <div className="bc-list">
          {BODY_CARDS.map((b) => (
            <button key={b.id} className={`bc-chip${b.id === id ? ' on' : ''}${parentOf(b.id) ? ' moon' : ''}`} onClick={() => useBodyCards.setState({ id: b.id })}>
              {nameOf(b.id)}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
