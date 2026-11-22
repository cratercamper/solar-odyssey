import { ui } from '../../../i18n'
import { acceptJob, cancelJob, goToStop, jobBoard, refreshBoard, useDelivery } from '../../../state/delivery'
import { RESOURCES } from '../../../data/pioneer'
import { fastSeconds, JOB_KINDS, LAB_STOP, kindStats, ruleOf, starsFor, timeLimit, type ActiveJob, type JobDef } from '../../../data/delivery'
import { JOB_ICON, placeName, Stars } from '../jobKind'

// 端末「仕事」：天の湊の掲示板（3 件）・進行中の仕事（行き先の順・時間・約束）・配達の記録

/** 荷物との約束の短い言い方 */
function ruleText(def: JobDef) {
  const t = ui().delivery
  const rule = ruleOf(def.kind)
  return rule === 'inTime' ? t.rule.inTime(timeLimit(def)) : t.rule[rule]
}

/** 行き先の順（積む所・降ろす所）。active なら、済んだ所と次の所に印 */
function Route({ def, at }: { def: JobDef; at?: number }) {
  const t = ui().delivery
  return (
    <ol className="pio-job-route" aria-label={t.route}>
      {def.stops.map((id, i) => (
        <li key={`${id}-${i}`} className={at === undefined ? '' : i < at ? 'done' : i === at ? 'now' : ''}>
          <small>{i === 0 ? t.load : id === LAB_STOP ? t.walk : t.drop}</small>
          <b>{placeName(id)}</b>
        </li>
      ))}
    </ol>
  )
}

function Reward({ def }: { def: JobDef }) {
  const t = ui().pioneer
  return (
    <span className="pio-cost">
      {RESOURCES.filter((r) => def.reward[r] > 0).map((r) => (
        <span key={r}>
          <i className={`pio-dot pio-${r}`} />
          {t.term.amount(t.resource[r], def.reward[r])}
        </span>
      ))}
    </span>
  )
}

/** 進行中の仕事：行き先の順、積んでからの時間（制限時間のある仕事は残りのバー）、星の見込み */
function Current({ job }: { job: ActiveJob }) {
  const t = ui().delivery
  const def = job.def
  const rule = ruleOf(def.kind)
  const { kept, fast } = starsFor(job)
  const loaded = job.stop > 0
  const limit = rule === 'inTime' ? timeLimit(def) : fastSeconds(def)
  return (
    <section className="pio-job pio-job-now" aria-label={t.now}>
      <header>
        <span className="pio-place-icon">{JOB_ICON[def.kind](26)}</span>
        <span>
          <small>{t.now}</small>
          <b>{t.kind[def.kind].title}</b>
        </span>
        <button type="button" className="pio-goal-go" onClick={goToStop}>
          {def.stops[job.stop] === LAB_STOP ? t.walkButton : t.go}
        </button>
      </header>
      <Route def={def} at={job.stop} />
      <div className="pio-job-clock">
        <span>
          {t.elapsed} <b>{t.time(loaded ? job.elapsed : 0)}</b>
        </span>
        <span className="pio-job-time" aria-hidden>
          <i style={{ width: `${Math.min(1, job.elapsed / limit) * 100}%` }} className={job.elapsed > limit ? 'over' : ''} />
        </span>
        <span>{t.time(limit)}</span>
      </div>
      <ul className="pio-job-checks">
        <li className="on">
          {t.starDone}
        </li>
        <li className={kept ? 'on' : 'off'}>
          {ui().labelled(t.starKept, ruleText(def))}
          <em>{kept ? t.ok : t.broken}</em>
        </li>
        <li className={fast ? 'on' : 'off'}>
          {t.starFast(fastSeconds(def))}
          <em>{fast ? t.fastYes : t.fastNo}</em>
        </li>
      </ul>
      <button type="button" className="pio-reset" onClick={() => cancelJob()}>
        {t.cancel}
      </button>
    </section>
  )
}

export function JobsTab() {
  const active = useDelivery((d) => d.active)
  const done = useDelivery((d) => d.done)
  const skipped = useDelivery((d) => d.skipped)
  const history = useDelivery((d) => d.history)
  const d = { active, done, history }
  const t = ui().delivery
  const jobs = jobBoard({ done, skipped })
  const stats = kindStats(d.history)
  const totalStars = d.history.reduce((n, r) => n + r.stars, 0)
  const most = Math.max(1, ...JOB_KINDS.map((k) => stats[k].count))

  return (
    <div className="pio-tab-jobs">
      {d.active && <Current job={d.active} />}
      <h3>{t.board}</h3>
      <p className="pio-note">{d.active ? t.busy : t.boardNote}</p>
      <div className="pio-jobs">
        {jobs.map((def) => {
          const rule = ruleOf(def.kind)
          return (
            <article key={def.id} className={`pio-job pio-job-${def.kind}`}>
              <header>
                <span className="pio-place-icon">{JOB_ICON[def.kind](26)}</span>
                <b>{t.kind[def.kind].title}</b>
              </header>
              <p>{t.kind[def.kind].story}</p>
              <Route def={def} />
              <span className={`pio-job-rule pio-rule-${rule}`}>
                <b>{ruleText(def)}</b>
                <small>{t.ruleWhy[rule]}</small>
              </span>
              <small className="pio-job-reward-label">{t.reward}</small>
              <Reward def={def} />
              <button type="button" className="pio-build" disabled={!!d.active} aria-label={t.acceptAria(t.kind[def.kind].title)} onClick={() => acceptJob(def)}>
                {t.accept}
              </button>
            </article>
          )
        })}
      </div>
      <div className="pio-jobs-foot">
        <small>{t.rewardNote}</small>
        {!d.active && (
          <button type="button" className="pio-reset" onClick={() => refreshBoard()}>
            {t.refresh}
          </button>
        )}
      </div>
      <h3>{t.history}</h3>
      {d.history.length === 0 ? (
        <p className="pio-note">{t.historyEmpty}</p>
      ) : (
        <>
          <p className="pio-note">{t.totalDone(d.done, totalStars)}</p>
          <div className="pio-job-stats">
            {JOB_KINDS.map((k) => {
              const s = stats[k]
              return (
                <div key={k} className="pio-job-stat">
                  <span className="pio-place-icon">{JOB_ICON[k](18)}</span>
                  <span className="pio-job-stat-name">{t.kind[k].title}</span>
                  <span className="pio-job-stat-bar" aria-hidden>
                    <i style={{ width: `${(s.count / most) * 100}%` }} />
                  </span>
                  <span className="pio-job-stat-num">{t.kindDone(s.count)}</span>
                  <Stars n={s.best} size={13} label={`${t.best} ${t.starsAria(s.best)}`} />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
