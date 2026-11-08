import { useEffect } from 'react'
import { ROCK_GROUPS, ROCK_TOTAL, foundAt, rockCount, rockImage, type RockGroup } from '../data/rockCollection'
import { compLabel, type RockSample } from '../data/rockSamples'
import { PLANETS } from '../data/bodies'
import { nearLander, spotsOf } from '../data/rockSpots'
import { useSampleLog } from '../state/rover'
import { closeRocks, useRockBook } from '../state/rockBook'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'

function bodyName(id: string) {
  for (const p of PLANETS) {
    if (p.id === id) return ui().bodies[p.id].name
    const m = p.moons.find((x) => x.id === id)
    if (m) return ui().bodies[m.id].name
  }
  return id
}

const groupName = (g: RockGroup) => ui().rockGroups[g.id] ?? bodyName(g.id)

function RockCard({ g, k, found }: { g: RockGroup; k: RockSample; found: boolean }) {
  return (
    <button className={`rock-card${found ? ' got' : ''}`} onClick={() => useRockBook.setState({ sel: `${g.id}:${k.id}` })}>
      <span className="rock-pic">
        <img src={rockImage(k.id)} alt="" loading="lazy" draggable={false} />
        {!found && <span className="rock-q">?</span>}
      </span>
      <span className="rock-name">{found ? ui().rockSamples[k.id].name : ui().rockBook.unknownName}</span>
    </button>
  )
}

function RockDetail({ g, k }: { g: RockGroup; k: RockSample }) {
  const log = useSampleLog((l) => l.log)
  const at = foundAt(g, k.id, log)
  const found = at.length > 0
  // 着陸するのはどれか一つ。天体の多いページは、まとめた言い方（なければページの名前）
  const where = g.bodies.length > 3 ? (ui().rockGroupsWhere[g.id] ?? groupName(g)) : ui().listOr(g.bodies.map(bodyName))
  // どこで採れるか：着陸地点のまわりか、見どころ（名前がかぶるものは 1 つに）
  const atLander = g.bodies.some((b) => nearLander(b, k.id))
  const spots = [...new Set(g.bodies.flatMap((b) => spotsOf(b, k.id).map((p) => ui().pois[p.id].name)))].slice(0, 3)
  const hint = atLander
    ? ui().rockBook.landerHint(where)
    : ui().rockBook.spotsHint(where, spots)
  const max = Math.max(...k.comp.map((c) => c[1]))
  return (
    <div className={`rock-detail${found ? ' got' : ''}`}>
      <button className="secondary rock-back" onClick={() => useRockBook.setState({ sel: null })}>
        ◀ {ui().rockBook.back}
      </button>
      <div className="rock-detail-body">
        <span className="rock-pic big">
          <img src={rockImage(k.id)} alt={found ? ui().rockSamples[k.id].name : ''} draggable={false} />
          {!found && <span className="rock-q">?</span>}
        </span>
        <div className="rock-text">
          <h3>{found ? ui().rockSamples[k.id].name : ui().rockBook.unknownName}</h3>
          {found ? (
            <>
              <p>{ui().rockSamples[k.id].note}</p>
              <div className="sample-comp">
                {k.comp.map(([label, v]) => (
                  <div className="sample-bar" key={label}>
                    <span className="sb-k">{compLabel(label)}</span>
                    <span className="sb-track">
                      <span className="sb-fill" style={{ width: `${(v / max) * 100}%` }} />
                    </span>
                    <span className="sb-v">{v}%</span>
                  </div>
                ))}
              </div>
              <p className="muted small">
                {ui().rockBook.foundOn}
                {ui().list(at.map(bodyName))}
              </p>
            </>
          ) : (
            <p className="muted">
              {ui().rockBook.notFoundYet}
              {hint}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** 岩石コレクション：ローバーで採集した岩の図鑑。まだの岩はシルエットと ？？？ */
export function RockBook() {
  const open = useRockBook((r) => r.open)
  const sel = useRockBook((r) => r.sel)
  const log = useSampleLog((l) => l.log)
  useLang()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      e.stopPropagation()
      if (useRockBook.getState().sel) useRockBook.setState({ sel: null })
      else closeRocks()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null
  const [gid, kid] = sel?.split(':') ?? []
  const g = ROCK_GROUPS.find((x) => x.id === gid)
  const k = g?.samples.find((s) => s.id === kid)

  return (
    <section className="rock-book" role="dialog" aria-label={ui().rockBook.rockCollection}>
      <header>
        <h2>{ui().rockBook.rockCollection}</h2>
        <span className="rock-total">
          {rockCount(log)} / {ROCK_TOTAL}
        </span>
        <button className="close" onClick={closeRocks} aria-label={ui().rockBook.close}>
          ×
        </button>
      </header>
      {g && k ? (
        <RockDetail g={g} k={k} />
      ) : (
        <>
          <p className="muted small">
            {ui().rockBook.howToCollect}
          </p>
          {ROCK_GROUPS.map((grp) => {
            const got = grp.samples.filter((s) => foundAt(grp, s.id, log).length > 0).length
            return (
              <div key={grp.id} className="rock-group">
                <h3>
                  {groupName(grp)} <span className="muted">{got}/{grp.samples.length}</span>
                </h3>
                <div className="rock-grid">
                  {grp.samples.map((s) => (
                    <RockCard key={s.id} g={grp} k={s} found={foundAt(grp, s.id, log).length > 0} />
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}
