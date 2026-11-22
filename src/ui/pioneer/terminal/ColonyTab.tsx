import { useEffect, useRef, useState } from 'react'
import { ui } from '../../../i18n'
import { usePioneer } from '../../../state/pioneer'
import { begin, build, catchUp, colonyReady, demolish, dismissAway, resetColony, setPolicy, setTax, study, useColony } from '../../../state/colony'
import { RESOURCES, STAGE_COUNT } from '../../../data/pioneer'
import {
  canBuild,
  canStudy,
  DAY_HOURS,
  economy,
  landSize,
  landUsed,
  POLICIES,
  RESEARCH,
  researchState,
  sample,
  TAX_LEVELS,
  ZONE_COST,
  ZONES,
  type ColonySave,
  type Sample,
  type ZoneId,
} from '../../../data/colony'
import { IconFlask, ZONE_ICON } from '../colonyIcons'

// 端末「経営」：完成したコロニーの町づくり。
// 上から：るすのあいだのまとめ・数字（人口・満足度・予算）・グラフ 2 つ（人口／暮らし）・区画（土地の帯と建てる）・
// 作る量と使う量・満足度の内わけ・税と方針・研究の木

const H = 140
const PL = 32
const PR = 68
const PT = 12
const PB = 18

const LIFE = ['water', 'power', 'food', 'happy'] as const
type LifeKey = (typeof LIFE)[number]

const dayOf = (h: number) => ({ d: Math.floor(h / DAY_HOURS) + 1, h: h % DAY_HOURS })

export function ColonyTab() {
  const stage = usePioneer((p) => p.stage)
  const name = usePioneer((p) => p.colonyName)
  const c = useColony()
  const t = ui().colony
  // 開いているあいだは 1 秒ごとに時間を進める（コロニーの 1 時間は 10 秒）
  useEffect(() => {
    catchUp()
    const id = window.setInterval(() => catchUp(), 1000)
    return () => window.clearInterval(id)
  }, [])

  if (stage < STAGE_COUNT || !colonyReady())
    return (
      <div className="col-locked">
        <TownArt pop={0} />
        <p>
          <b>{t.locked}</b>
        </p>
        <p className="pio-note">{t.lockedNote}</p>
      </div>
    )
  if (!c.started)
    return (
      <div className="col-intro">
        <TownArt pop={0.4} />
        <h3>{t.introTitle(name)}</h3>
        <p>{t.intro}</p>
        <button type="button" className="pio-build" onClick={begin}>
          {t.begin}
        </button>
      </div>
    )
  return <Town c={c} />
}

function Town({ c }: { c: ColonySave & { away: ReturnType<typeof useColony.getState>['away']; justBuilt: ReturnType<typeof useColony.getState>['justBuilt'] } }) {
  const t = ui().colony
  const e = economy(c)
  const store = usePioneer((p) => p.store)
  const now = dayOf(c.hour)
  const last = c.history[c.history.length - 2]
  const trend = last ? c.pop - last.pop : 0
  const net = e.income - e.upkeep
  const size = landSize(c)
  const used = landUsed(c.zones)
  const tp = ui().pioneer
  // グラフの右端は、いまの値（点は 6 時間ごとだが、線の端はいつもいまに合わせる）
  const end = c.history[c.history.length - 1]
  const hist = end && end.h === c.hour ? c.history : [...c.history, sample(c)]

  return (
    <div className="col-tab">
      {c.away && (
        <section className="col-away" role="status">
          <b>{t.awayTitle}</b>
          <span>{t.away(c.away.hours)}</span>
          <span className="col-away-chips">
            <em className={c.away.pop >= 0 ? 'up' : 'down'}>{t.awayPop(Math.round(c.away.pop))}</em>
            <em className={c.away.happy >= 0 ? 'up' : 'down'}>{t.awayHappy(Math.round(c.away.happy))}</em>
            {c.away.metal > 0 && <em>{t.awayMetal(c.away.metal)}</em>}
            {c.away.finished.length > 0 && <em>{t.awayResearch(c.away.finished.map((id) => t.research[id].name))}</em>}
          </span>
          <button type="button" className="pio-reset" onClick={dismissAway}>
            {t.ok}
          </button>
        </section>
      )}

      <div className="col-kpis">
        <div className="col-kpi">
          <small>{t.kpi.pop}</small>
          <b>
            {Math.round(c.pop)}
            <i className={`col-trend ${trend > 1 ? 'up' : trend < -1 ? 'down' : 'flat'}`} aria-label={trend > 1 ? t.trendUp : trend < -1 ? t.trendDown : t.trendFlat} />
          </b>
          <span>{t.kpi.capacity(Math.round(e.capacity))}</span>
        </div>
        <div className="col-kpi">
          <small>{t.kpi.happy}</small>
          <b>
            <HappyFace v={c.happy} />
            {Math.round(c.happy)}
          </b>
          <span>{t.target(Math.round(e.happyTarget))}</span>
        </div>
        <div className="col-kpi">
          <small>{t.kpi.credits}</small>
          <b>{Math.floor(c.credits)}</b>
          <span className={net < 0 ? 'down' : ''}>{t.kpi.perHour(Math.round(net * 10) / 10)}</span>
        </div>
        <div className="col-kpi col-clock">
          <small>{t.day(now.d, now.h)}</small>
          <DayDial hour={now.h} />
        </div>
      </div>

      <PopChart history={hist} capacity={e.capacity} hour={c.hour} />
      <LifeChart history={hist} hour={c.hour} />

      <h3>
        {t.zonesTitle}
        <small>{t.land(used, size)}</small>
      </h3>
      <div className="col-land" aria-hidden>
        {Array.from({ length: size }, (_, i) => {
          const z = plotZone(c.zones, i)
          const fresh = z && c.justBuilt && c.justBuilt.id === z && i === lastIndexOf(c.zones, z)
          return (
            <span key={`${i}-${z ?? 'free'}`} className={`col-plot${z ? ` col-z-${z}` : ''}${fresh ? ' fresh' : ''}`}>
              {z && ZONE_ICON[z](14)}
            </span>
          )
        })}
      </div>
      {used >= size && <p className="pio-note">{t.landFull}</p>}
      <div className="col-zones">
        {ZONES.map((id) => {
          const ok = canBuild(c, id, store)
          return (
            <article key={id} className={`col-zone col-z-${id}`}>
              <header>
                <span className="col-zone-icon">{ZONE_ICON[id](22)}</span>
                <span>
                  <b>{t.zone[id].name}</b>
                  <small>{t.zone[id].effect}</small>
                </span>
                <em className="col-zone-count">×{c.zones[id]}</em>
              </header>
              <p className="col-why">{t.zone[id].why}</p>
              <span className="pio-cost">
                {RESOURCES.filter((r) => ZONE_COST[id][r] > 0).map((r) => (
                  <span key={r} className={store[r] < ZONE_COST[id][r] ? 'short' : ''}>
                    <i className={`pio-dot pio-${r}`} />
                    {tp.term.amount(tp.resource[r], ZONE_COST[id][r])}
                  </span>
                ))}
              </span>
              <div className="col-zone-actions">
                <button type="button" className="pio-build" disabled={!ok} aria-label={t.buildAria(t.zone[id].name)} onClick={() => build(id)}>
                  {t.build}
                </button>
                {c.zones[id] > 0 && (
                  <button type="button" className="pio-reset" aria-label={t.removeAria(t.zone[id].name)} title={t.removeNote} onClick={() => demolish(id)}>
                    {t.remove}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      <h3>{t.supplyTitle}</h3>
      <div className="col-supply">
        <Supply label={t.supply.food} have={e.food} need={e.foodNeed} kind="food" />
        <Supply label={t.supply.water} have={e.water} need={e.waterNeed} kind="water" />
        <Supply label={t.supply.power} have={e.power} need={e.powerNeed} kind="power" />
        <Supply label={t.supply.jobs} have={e.jobs} need={c.pop} kind="jobs" />
      </div>

      <h3>{t.happyWhy}</h3>
      <HappyParts parts={e.parts} target={e.happyTarget} />

      <div className="col-controls">
        <section>
          <h3>{t.taxTitle}</h3>
          <div className="col-seg" role="radiogroup" aria-label={t.taxTitle}>
            {TAX_LEVELS.map((lv) => (
              <button key={lv} type="button" role="radio" aria-checked={c.tax === lv} className={c.tax === lv ? 'on' : ''} onClick={() => setTax(lv)}>
                {t.tax[lv]}
              </button>
            ))}
          </div>
          <p className="pio-note">{t.taxNote[c.tax]}</p>
        </section>
        <section>
          <h3>{t.policyTitle}</h3>
          <div className="col-policies" role="radiogroup" aria-label={t.policyTitle}>
            {POLICIES.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={c.policy === id} className={c.policy === id ? 'on' : ''} onClick={() => setPolicy(id)}>
                <b>{t.policy[id].name}</b>
                <small>{t.policy[id].note}</small>
              </button>
            ))}
          </div>
        </section>
      </div>

      <h3>{t.researchTitle}</h3>
      <p className="pio-note">{t.researchNote}</p>
      <ResearchTree c={c} />

      <p className="pio-science">{t.walkNote}</p>
      <div className="pio-jobs-foot">
        <span />
        <button
          type="button"
          className="pio-reset"
          onClick={() => {
            if (window.confirm(t.resetConfirm)) resetColony()
          }}
        >
          {t.reset}
        </button>
      </div>
    </div>
  )
}

/** 土地の i 番目に建っている区画（区画の順に左から並べる） */
function plotZone(z: ColonySave['zones'], i: number): ZoneId | null {
  let n = 0
  for (const id of ZONES) {
    n += z[id]
    if (i < n) return id
  }
  return null
}
function lastIndexOf(z: ColonySave['zones'], id: ZoneId) {
  let n = 0
  for (const k of ZONES) {
    n += z[k]
    if (k === id) return n - 1
  }
  return -1
}

/** 満足度の顔（口の曲がり具合が変わる） */
function HappyFace({ v }: { v: number }) {
  const k = (v - 50) / 50
  return (
    <svg className="col-face" width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="8.5" />
      <circle cx="7" cy="8" r="1" className="eye" />
      <circle cx="13" cy="8" r="1" className="eye" />
      <path d={`M6 ${12.5 - k} Q10 ${12.5 + 3 * k} 14 ${12.5 - k}`} />
    </svg>
  )
}

/** 1 日の時計（コロニーの昼と夜） */
function DayDial({ hour }: { hour: number }) {
  const a = (hour / DAY_HOURS) * Math.PI * 2 - Math.PI / 2
  return (
    <svg className="col-dial" width="34" height="34" viewBox="0 0 34 34" aria-hidden>
      <circle cx="17" cy="17" r="14" className="ring" />
      <path d="M17 3a14 14 0 0 1 0 28" className="night" />
      <circle cx={17 + Math.cos(a) * 14} cy={17 + Math.sin(a) * 14} r="3.2" className={hour >= 6 && hour < 18 ? 'sun' : 'moon'} />
    </svg>
  )
}

/** 町の絵（円筒の中の断面。人が増えるほど窓が灯る） */
function TownArt({ pop }: { pop: number }) {
  const houses = [16, 34, 52, 70, 88, 106, 124, 142, 160, 178, 196, 214]
  return (
    <svg className="col-art" viewBox="0 0 240 80" aria-hidden>
      <path d="M4 66 Q120 84 236 66" className="ground" />
      {houses.map((x, i) => (
        <g key={x} transform={`translate(${x} ${58 + Math.sin(i) * 2})`}>
          <rect x="0" y="-12" width="12" height="12" rx="1" className="house" />
          <path d="M-1 -12 L6 -18 L13 -12" className="roof" />
          <rect x="4" y="-8" width="4" height="4" className={i / houses.length < pop ? 'win on' : 'win'} />
        </g>
      ))}
      <path d="M4 12 Q120 -6 236 12" className="sky" />
    </svg>
  )
}

function Supply({ label, have, need, kind }: { label: string; have: number; need: number; kind: string }) {
  const t = ui().colony
  const top = Math.max(have, need, 1)
  const short = have < need
  return (
    <div className={`col-sup${short ? ' short' : ''}`}>
      <span className="col-sup-label">{label}</span>
      <span className="col-sup-bar">
        <i className={`col-c-${kind}`} style={{ width: `${(have / top) * 100}%` }} />
        <em style={{ left: `${(need / top) * 100}%` }} />
      </span>
      <span className="col-sup-num">
        {t.supplyRow(Math.round(have), Math.round(need))}
        {short && <strong>{t.short}</strong>}
      </span>
    </div>
  )
}

function HappyParts({ parts, target }: { parts: ReturnType<typeof economy>['parts']; target: number }) {
  const t = ui().colony
  const rows = (Object.keys(parts) as (keyof typeof parts)[]).filter((k) => k === 'base' || Math.round(parts[k]) !== 0)
  return (
    <div className="col-parts">
      {rows.map((k) => {
        const v = parts[k]
        return (
          <div key={k} className="col-part">
            <span>{t.part[k]}</span>
            <span className="col-part-bar">
              <i className={v >= 0 ? 'plus' : 'minus'} style={{ width: `${Math.min(100, Math.abs(v))}%` }} />
            </span>
            <b>{v > 0 && k !== 'base' ? `+${Math.round(v)}` : Math.round(v)}</b>
          </div>
        )
      })}
      <div className="col-part col-part-total">
        <span>{t.target(Math.round(target))}</span>
        <span className="col-part-bar">
          <i className="total" style={{ width: `${target}%` }} />
        </span>
        <b>{Math.round(target)}</b>
      </div>
    </div>
  )
}

/** グラフの横軸（何日前か） */
function useChartHover() {
  const [hover, setHover] = useState<number | null>(null)
  const pointer = useRef('mouse')
  return { hover, setHover, pointer }
}

function xAt(i: number, n: number, w: number) {
  return PL + (n <= 1 ? 0 : (i / (n - 1)) * (w - PL - PR))
}

/** グラフの幅を、置いた場所の幅（CSS の px）に合わせる（文字の大きさがどの画面でもそろう） */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(340)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(240, Math.round(el.clientWidth))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, w }
}

function HoverLayer({ n, w, hover, setHover, pointer }: { n: number; w: number } & ReturnType<typeof useChartHover>) {
  const step = (w - PL - PR) / Math.max(1, n - 1)
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect
          key={i}
          x={xAt(i, n, w) - step / 2}
          y={PT}
          width={step}
          height={H - PT - PB}
          className="pio-bar-hit"
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') setHover(i)
          }}
          onPointerDown={(e) => {
            pointer.current = e.pointerType
          }}
          onClick={() => {
            if (pointer.current !== 'mouse') setHover(hover === i ? null : i)
          }}
        />
      ))}
    </>
  )
}

function Axis({ history, hour, ticks, w }: { history: Sample[]; hour: number; ticks: { v: number; y: number }[]; w: number }) {
  const t = ui().colony
  const n = history.length
  const first = history[0]
  const ago = first ? Math.round((hour - first.h) / DAY_HOURS) : 0
  return (
    <>
      {ticks.map((k) => (
        <g key={k.v}>
          <line x1={PL} x2={w - PR} y1={k.y} y2={k.y} className="pio-grid" />
          <text x={PL - 5} y={k.y + 3} textAnchor="end" className="pio-tick-label">
            {k.v}
          </text>
        </g>
      ))}
      {n > 1 && (
        <>
          <text x={PL} y={H - 4} textAnchor="start" className="pio-tick-label">
            {ago > 0 ? t.daysAgo(ago) : ''}
          </text>
          <text x={w - PR} y={H - 4} textAnchor="end" className="pio-tick-label">
            {t.now}
          </text>
        </>
      )}
    </>
  )
}

function Tip({ s, i, n, w, children }: { s: Sample; i: number; n: number; w: number; children: React.ReactNode }) {
  const t = ui().colony
  const at = dayOf(s.h)
  return (
    <div className="pio-tip" style={{ left: `${Math.min(78, Math.max(22, (xAt(i, n, w) / w) * 100))}%` }} role="status">
      <b>{t.tipAt(at.d, at.h)}</b>
      {children}
    </div>
  )
}

function PopChart({ history, capacity, hour }: { history: Sample[]; capacity: number; hour: number }) {
  const t = ui().colony
  const hv = useChartHover()
  const { ref, w } = useWidth()
  const n = history.length
  const top = niceTop(Math.max(capacity, ...history.map((s) => s.pop)) * 1.1)
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / top)
  const line = history.map((s, i) => `${i ? 'L' : 'M'}${xAt(i, n, w).toFixed(1)} ${y(s.pop).toFixed(1)}`).join('')
  const area = n > 1 ? `${line}L${xAt(n - 1, n, w)} ${y(0)}L${xAt(0, n, w)} ${y(0)}Z` : ''
  const cur = history[n - 1]
  const h = hv.hover !== null ? history[hv.hover] : null
  return (
    <figure className="col-chart">
      <figcaption>{t.chartPop}</figcaption>
      <div className="pio-chart-wrap" ref={ref}>
        <svg viewBox={`0 0 ${w} ${H}`} role="img" aria-label={t.chartPop} onMouseLeave={() => hv.setHover(null)}>
          <Axis w={w} history={history} hour={hour} ticks={[0, top / 2, top].map((v) => ({ v: Math.round(v), y: y(v) }))} />
          <line x1={PL} x2={w - PR} y1={y(capacity)} y2={y(capacity)} className="pio-cap-line" />
          <text x={w - PR + 4} y={y(capacity) + 3} className="pio-tick-label">
            {t.capacityLine}
          </text>
          {n > 1 && <path d={area} className="col-area" />}
          {n > 1 && <path d={line} className="col-line col-c-pop" pathLength={1} />}
          {cur && <circle cx={xAt(n - 1, n, w)} cy={y(cur.pop)} r="4" className="col-dot col-c-pop" />}
          {cur && (
            <text x={xAt(n - 1, n, w) + 7} y={y(cur.pop) + 4} className="col-end-label">
              {cur.pop}
            </text>
          )}
          {h && hv.hover !== null && <line x1={xAt(hv.hover, n, w)} x2={xAt(hv.hover, n, w)} y1={PT} y2={H - PB} className="col-cross" />}
          <HoverLayer n={n} w={w} {...hv} />
        </svg>
        {h && hv.hover !== null && (
          <Tip s={h} i={hv.hover} n={n} w={w}>
            <span>
              {t.kpi.pop} {h.pop}
            </span>
          </Tip>
        )}
      </div>
      {n < 2 && <p className="pio-note">{t.chartEmpty}</p>}
    </figure>
  )
}

function LifeChart({ history, hour }: { history: Sample[]; hour: number }) {
  const t = ui().colony
  const hv = useChartHover()
  const { ref, w } = useWidth()
  const n = history.length
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / 100)
  const path = (k: LifeKey) => history.map((s, i) => `${i ? 'L' : 'M'}${xAt(i, n, w).toFixed(1)} ${y(s[k]).toFixed(1)}`).join('')
  const cur = history[n - 1]
  // 線の端の名前が重ならないよう、上から順に少しずつずらす
  const ends = cur
    ? LIFE.map((k) => ({ k, y: y(cur[k]) }))
        .sort((a, b) => a.y - b.y)
        .reduce<{ k: LifeKey; y: number }[]>((acc, e) => [...acc, { k: e.k, y: acc.length ? Math.max(e.y, acc[acc.length - 1].y + 13) : e.y }], [])
    : []
  const h = hv.hover !== null ? history[hv.hover] : null
  return (
    <figure className="col-chart">
      <figcaption>{t.chartLife}</figcaption>
      <div className="pio-chart-wrap" ref={ref}>
        <svg viewBox={`0 0 ${w} ${H}`} role="img" aria-label={t.chartLife} onMouseLeave={() => hv.setHover(null)}>
          <Axis w={w} history={history} hour={hour} ticks={[0, 50, 100].map((v) => ({ v, y: y(v) }))} />
          {n > 1 && LIFE.map((k) => <path key={k} d={path(k)} className={`col-line col-c-${k}`} pathLength={1} />)}
          {cur && LIFE.map((k) => <circle key={k} cx={xAt(n - 1, n, w)} cy={y(cur[k])} r="3" className={`col-dot col-c-${k}`} />)}
          {ends.map((e) => (
            <text key={e.k} x={xAt(n - 1, n, w) + 7} y={e.y + 4} className="col-end-label">
              {t.series[e.k]}
            </text>
          ))}
          {h && hv.hover !== null && <line x1={xAt(hv.hover, n, w)} x2={xAt(hv.hover, n, w)} y1={PT} y2={H - PB} className="col-cross" />}
          <HoverLayer n={n} w={w} {...hv} />
        </svg>
        {h && hv.hover !== null && (
          <Tip s={h} i={hv.hover} n={n} w={w}>
            {LIFE.map((k) => (
              <span key={k}>
                <i className={`pio-dot col-c-${k}`} />
                {t.series[k]} {h[k]}%
              </span>
            ))}
          </Tip>
        )}
      </div>
      <div className="pio-legend">
        {LIFE.map((k) => (
          <span key={k}>
            <i className={`pio-dot col-c-${k}`} />
            {t.series[k]}
          </span>
        ))}
      </div>
    </figure>
  )
}

function niceTop(v: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(1, v)))
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p
  return 10 * p
}

function ResearchTree({ c }: { c: ColonySave }) {
  const t = ui().colony
  const cols = 3
  const rows = 3
  const cw = 100 / cols
  const rh = 100 / rows
  return (
    <div className="col-tree">
      <svg className="col-tree-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {RESEARCH.flatMap((r) =>
          r.needs.map((n) => {
            const from = RESEARCH.find((x) => x.id === n)!
            const done = c.research.includes(n)
            const x1 = from.col * cw + cw * 0.9
            const y1 = from.row * rh + rh / 2
            const x2 = r.col * cw + cw * 0.1
            const y2 = r.row * rh + rh / 2
            return <path key={`${n}-${r.id}`} d={`M${x1} ${y1}C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`} className={done ? 'on' : ''} vectorEffect="non-scaling-stroke" />
          }),
        )}
      </svg>
      {RESEARCH.map((r) => {
        const st = researchState(c, r.id)
        const ok = canStudy(c, r.id)
        const left = c.studying?.id === r.id ? c.studying.left : 0
        return (
          <div key={r.id} className={`col-node ${st}`} style={{ gridColumn: r.col + 1, gridRow: r.row + 1 }}>
            <span className="col-node-head">
              <IconFlask size={14} />
              <b>{t.research[r.id].name}</b>
            </span>
            <small>{t.research[r.id].effect}</small>
            <small className="col-why">{t.research[r.id].why}</small>
            {st === 'done' && <em className="col-node-done">{t.done}</em>}
            {st === 'studying' && (
              <>
                <span className="col-node-progress" aria-hidden>
                  <i style={{ width: `${(1 - left / r.hours) * 100}%` }} />
                </span>
                <em>{t.studying(left)}</em>
              </>
            )}
            {st === 'ready' && (
              <>
                <em className={c.credits < r.cost ? 'col-node-cost short' : 'col-node-cost'}>
                  {t.cost(r.cost)} · {t.hours(r.hours)}
                </em>
                <button type="button" className="pio-build" disabled={!ok} aria-label={t.studyAria(t.research[r.id].name)} onClick={() => study(r.id)}>
                  {t.study}
                </button>
              </>
            )}
            {st === 'locked' && <em>{t.locked2}</em>}
          </div>
        )
      })}
    </div>
  )
}
