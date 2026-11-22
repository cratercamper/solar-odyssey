import type { ReactNode } from 'react'
import { ui } from '../../../i18n'
import { useStore } from '../../../state/store'
import { buyUpgrade, usePioneer } from '../../../state/pioneer'
import { canPay, MAX_LEVEL, RESOURCES, shipTrait, TRAIT_SHIPS, UPGRADE_IDS, upgradeCost, upgradeValue, type ShipTrait, type UpgradeId } from '../../../data/pioneer'
import { IconDock, IconGas, IconMine } from '../icons'

// 端末「船」：いまの船の得意と、ほかの船の得意の一覧。倉庫の資源で買える 3 つの改造（3 段まで）

const ICON: Record<UpgradeId, ReactNode> = { hold: <IconDock />, magnet: <IconMine />, scoop: <IconGas /> }

/** 得意の大きさ（積める量は数、ほかは倍率） */
function traitValue(tr: ShipTrait, times: (x: number) => string) {
  if (tr.strength === 'hold') return String(tr.hold)
  return times(tr[tr.strength])
}

export function ShipTab() {
  const p = usePioneer()
  const shipId = useStore((s) => s.settings.ship)
  const t = ui().pioneer
  const ts = t.term.ship
  const fmt = (id: UpgradeId, level: number) => {
    const v = upgradeValue(id, shipId, level)
    return id === 'hold' ? String(v) : ts.times(v)
  }

  return (
    <div className="pio-tab-ship">
      <h3>{ts.upgradesTitle}</h3>
      <div className="pio-upgrades">
        {UPGRADE_IDS.map((id) => {
          const level = p.upgrades?.[id] ?? 0
          const cost = upgradeCost(id, level)
          const ok = !!cost && canPay(p.store, cost)
          return (
            <div key={id} className="pio-upgrade">
              <span className="pio-place-icon">{ICON[id]}</span>
              <div className="pio-upgrade-text">
                <b>{ts.up[id].name}</b>
                <small>{ts.up[id].text}</small>
                <span className="pio-levels" role="img" aria-label={ts.level(level, MAX_LEVEL)}>
                  {Array.from({ length: MAX_LEVEL }, (_, i) => (
                    <i key={i} className={i < level ? 'on' : ''} />
                  ))}
                  <em>{cost ? ts.effect(fmt(id, level), fmt(id, level + 1)) : fmt(id, level)}</em>
                </span>
                {cost && (
                  <span className="pio-cost">
                    {RESOURCES.filter((r) => cost[r] > 0).map((r) => (
                      <span key={r} className={p.store[r] >= cost[r] ? '' : 'lack'}>
                        <i className={`pio-dot pio-${r}`} />
                        {t.term.amount(t.resource[r], cost[r])}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              {cost ? (
                <button type="button" className="pio-build" disabled={!ok} onClick={() => buyUpgrade(id)}>
                  {ts.buy}
                </button>
              ) : (
                <span className="pio-maxed">{ts.max}</span>
              )}
            </div>
          )
        })}
      </div>
      <p className="pio-science">{ts.note}</p>

      <h3>{ts.others}</h3>
      <ul className="pio-ships">
        {TRAIT_SHIPS.map((id) => {
          const tr = shipTrait(id)
          return (
            <li key={id} className={id === shipId ? 'on' : ''}>
              <b>{ui().ships[id].name}</b>
              <span>{ts.strength[tr.strength]}</span>
              <em>{traitValue(tr, ts.times)}</em>
              {id === shipId && <small>{ts.current}</small>}
            </li>
          )
        })}
      </ul>
      <p className="pio-science">{ts.science}</p>
    </div>
  )
}
