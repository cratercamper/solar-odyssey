import { useState } from 'react'
import { ui } from '../../i18n'
import { useLang } from '../../i18n/lang'
import { useStore } from '../../state/store'
import { nameColony, resetPioneer, setTab, stopPioneer, TERMINAL_TABS, togglePanel, usePioneer } from '../../state/pioneer'
import { NAME_MAX, STAGE_COUNT, STAGES } from '../../data/pioneer'
import { PioneerHud } from './PioneerHud'
import { PioneerGuide } from './PioneerGuide'
import { GasGauge } from './GasGauge'
import { PioneerFx } from './PioneerFx'
import { BuildCinemaUi } from './BuildCinemaUi'
import { StatusTab } from './terminal/StatusTab'
import { RouteTab } from './terminal/RouteTab'
import { FlowTab } from './terminal/FlowTab'
import { LogTab } from './terminal/LogTab'
import { ShipTab } from './terminal/ShipTab'
import { JobsTab } from './terminal/JobsTab'
import { ColonyTab } from './terminal/ColonyTab'
import './pioneer.css'

// 開拓の画面：飛んでいるあいだのカード（PioneerHud）・木星の高さのメーター・遊び方の案内と、
// 開いたときの端末（状況・仕事・経営・航路・流れ・記録・船のタブ。ui/pioneer/terminal/）

export function PioneerPanel() {
  useLang()
  const p = usePioneer()
  const world = useStore((s) => s.settings.world)
  const mode = useStore((s) => s.mode)
  const [name, setName] = useState('')
  if (!p.active || world !== 'sf') return null
  const t = ui().pioneer
  // 着陸・EVA・公園などの場面では、ゲージだけ隠す（開拓は続いている）
  const flying = mode === 'flight' || mode === 'map'

  return (
    <>
      {flying && !p.guide && !p.cinema && <PioneerHud />}
      {flying && !p.cinema && <GasGauge />}
      <BuildCinemaUi />
      <PioneerFx />
      {p.guide && !p.naming && <PioneerGuide />}
      {p.panel && !p.naming && !p.guide && (
        <div
          className="pioneer-panel"
          role="dialog"
          aria-label={t.terminal}
          onKeyDown={(e) => {
            // 端末の中で押したキー（Enter・スペース・矢印）を、操縦（window のキー）へ渡さない。Esc は閉じるのに使うので通す
            if (e.key !== 'Escape') e.stopPropagation()
          }}
        >
          <header>
            <h2>{t.terminal}</h2>
            <span className="pio-stage">{p.stage >= STAGE_COUNT ? `${t.doneBadge} · ${p.colonyName}` : t.stages(p.stage, STAGE_COUNT)}</span>
            <button type="button" className="close" onClick={() => togglePanel(false)} aria-label={t.close}>
              ×
            </button>
          </header>
          <div className="pio-steps" aria-hidden>
            {STAGES.map((s, i) => (
              <span key={s.id} className={i < p.stage ? 'done' : i === p.stage ? 'now' : ''}>
                {t.stageName[s.id]}
              </span>
            ))}
          </div>
          <div className="pio-tabs" role="tablist" aria-label={t.term.tabsLabel}>
            {TERMINAL_TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`pio-tab-${id}`}
                aria-selected={p.tab === id}
                aria-controls="pio-tabpanel"
                tabIndex={p.tab === id ? 0 : -1}
                className={p.tab === id ? 'on' : ''}
                onClick={() => setTab(id)}
                onKeyDown={(e) => {
                  // 左右の矢印でタブを移る
                  const i = TERMINAL_TABS.indexOf(id)
                  const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
                  if (!d) return
                  e.preventDefault()
                  const nextTab = TERMINAL_TABS[(i + d + TERMINAL_TABS.length) % TERMINAL_TABS.length]
                  setTab(nextTab)
                  document.getElementById(`pio-tab-${nextTab}`)?.focus()
                }}
              >
                {t.term.tabs[id]}
              </button>
            ))}
          </div>
          <div id="pio-tabpanel" role="tabpanel" aria-labelledby={`pio-tab-${p.tab}`} className="pio-tabpanel" key={p.tab}>
            {p.tab === 'status' && <StatusTab />}
            {p.tab === 'jobs' && <JobsTab />}
            {p.tab === 'colony' && <ColonyTab />}
            {p.tab === 'route' && <RouteTab />}
            {p.tab === 'flow' && <FlowTab />}
            {p.tab === 'log' && <LogTab />}
            {p.tab === 'ship' && <ShipTab />}
          </div>
          <footer>
            <button type="button" className="pio-quit" onClick={() => stopPioneer()}>
              {t.quit}
            </button>
            <button
              type="button"
              className="pio-reset"
              onClick={() => {
                if (window.confirm(t.resetConfirm)) resetPioneer()
              }}
            >
              {t.reset}
            </button>
          </footer>
        </div>
      )}
      {p.naming && !p.cinema && (
        <form
          className="pioneer-panel pio-naming"
          role="dialog"
          aria-label={t.complete}
          onSubmit={(e) => {
            e.preventDefault()
            nameColony(name)
          }}
        >
          <h2>{t.complete}</h2>
          <p>{t.completeText}</p>
          <input value={name} maxLength={NAME_MAX} placeholder={t.namePlaceholder} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} autoFocus />
          <button type="submit" className="pio-build">
            {t.nameOk}
          </button>
        </form>
      )}
    </>
  )
}
