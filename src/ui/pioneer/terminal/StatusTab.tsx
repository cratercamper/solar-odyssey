import { ui } from '../../../i18n'
import { build, capacity, usePioneer } from '../../../state/pioneer'
import { canPay, dailyFor, overallProgress, RESOURCES, STAGE_COUNT, STAGES, today, total } from '../../../data/pioneer'

// 端末「状況」：コロニー完成までの輪、次の段階に要る資源のメーター（倉庫＝塗り、積み荷＝斜線）、建設ボタン

const R = 34
const C = 2 * Math.PI * R

export function StatusTab() {
  const p = usePioneer()
  const t = ui().pioneer
  const tt = t.term
  const cap = capacity()
  const pct = Math.round(overallProgress(p) * 100)
  const next = STAGES[p.stage] ?? null
  const ready = !!next && canPay(p.store, next.cost)
  const load = total(p.hold)

  return (
    <div className="pio-tab-status">
      <div className="pio-overall">
        <svg viewBox="0 0 84 84" className="pio-donut" role="img" aria-label={tt.and(tt.overall, tt.pct(pct))}>
          <circle cx="42" cy="42" r={R} className="pio-donut-track" />
          <circle cx="42" cy="42" r={R} className="pio-donut-fill" strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 42 42)" />
          {STAGES.map((_, i) => {
            // 段階の切れ目（資源の量で）に小さな目盛り
            const upTo = STAGES.slice(0, i + 1).reduce((n, s) => n + total(s.cost), 0)
            const all = STAGES.reduce((n, s) => n + total(s.cost), 0)
            const a = (upTo / all) * Math.PI * 2 - Math.PI / 2
            return <circle key={i} cx={42 + Math.cos(a) * R} cy={42 + Math.sin(a) * R} r="2.2" className={i < p.stage ? 'pio-tick done' : 'pio-tick'} />
          })}
          <text x="42" y="47" textAnchor="middle" className="pio-donut-num">
            {tt.pct(pct)}
          </text>
        </svg>
        <div className="pio-overall-text">
          <b>{p.stage >= STAGE_COUNT ? tt.allDone : tt.overall}</b>
          <small>{tt.overallNote}</small>
          <span className="pio-cargo" aria-label={tt.cargo(load, cap)}>
            <span className="pio-cargo-label">{tt.cargo(load, cap)}</span>
            <span className="pio-cargo-track">
              {RESOURCES.map((r) => (p.hold[r] > 0 ? <span key={r} className={`pio-${r}`} style={{ width: `${(p.hold[r] / cap) * 100}%` }} /> : null))}
            </span>
          </span>
        </div>
      </div>

      <DailyCard />

      {next && (
        <div className="pio-next">
          <h3>{t.nextStage(t.stageName[next.id])}</h3>
          <div className="pio-meters">
            {RESOURCES.filter((r) => next.cost[r] > 0).map((r) => {
              const need = next.cost[r]
              const inStore = Math.min(p.store[r], need)
              const inHold = Math.min(p.hold[r], need - inStore)
              const ok = inStore >= need
              return (
                <div key={r} className={`pio-bigmeter${ok ? ' ok' : ''}`} role="img" aria-label={tt.meter(t.resource[r], p.store[r], p.hold[r], need)}>
                  <span className="pio-bigmeter-name">
                    <i className={`pio-dot pio-${r}`} />
                    {t.resource[r]}
                  </span>
                  <span className="pio-bigmeter-track">
                    <span className={`pio-meter-store pio-${r}`} style={{ width: `${(inStore / need) * 100}%` }} />
                    <span className={`pio-meter-hold pio-${r}`} style={{ width: `${(inHold / need) * 100}%` }} />
                  </span>
                  <span className="pio-bigmeter-num">
                    {inStore}
                    {inHold > 0 && <em>{tt.plus(inHold)}</em>}
                    <span>{tt.of(need)}</span>
                    {ok && (
                      <svg className="pio-ok" viewBox="0 0 12 12" aria-hidden>
                        <path d="M2 6.5l2.5 2.5L10 3.5" />
                      </svg>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="pio-legend" aria-hidden>
            <span>
              <i className="pio-sw-store" />
              {tt.legendStore}
            </span>
            <span>
              <i className="pio-sw-hold" />
              {tt.legendHold}
            </span>
          </div>
          <p className="pio-science">{t.stageScience[next.id]}</p>
          <button type="button" className="pio-build" disabled={!ready} onClick={() => build()}>
            {ready ? t.build : t.short(tt.shortList(RESOURCES.filter((r) => next.cost[r] > p.store[r]).map((r) => tt.amount(t.resource[r], next.cost[r] - p.store[r]))))}
          </button>
        </div>
      )}
    </div>
  )
}

/** 今日の依頼：内容・進み具合・ごほうび */
function DailyCard() {
  const p = usePioneer()
  const t = ui().pioneer
  const td = t.daily
  // 端末を開いたまま日付が変わっても、今日の依頼を見せる（進みは 0 から）
  const day = today()
  const d = p.daily?.day === day ? p.daily : { day, progress: 0, done: false }
  const def = dailyFor(day)
  const k = Math.min(1, d.progress / def.target)
  return (
    <div className={`pio-daily${d.done ? ' done' : ''}`}>
      <div className="pio-daily-head">
        <small>{td.title}</small>
        <b>{td.task[def.kind](def.target)}</b>
      </div>
      <span className="pio-daily-bar" role="img" aria-label={td.progress(d.progress, def.target)}>
        <span style={{ width: `${k * 100}%` }} />
      </span>
      <div className="pio-daily-foot">
        <span>{d.done ? td.done : td.progress(d.progress, def.target)}</span>
        <span className="pio-cost">
          <small>{td.reward}</small>
          {RESOURCES.filter((r) => def.reward[r] > 0).map((r) => (
            <span key={r}>
              <i className={`pio-dot pio-${r}`} />
              {t.term.amount(t.resource[r], def.reward[r])}
            </span>
          ))}
        </span>
        {(p.dailyDone ?? 0) > 0 && <small>{td.total(p.dailyDone ?? 0)}</small>}
      </div>
    </div>
  )
}
