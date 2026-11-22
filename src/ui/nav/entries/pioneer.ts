import { registerNav, useNavContext } from '../registry'
import { ui } from '../../../i18n'
import { startPioneer, togglePanel, usePioneer } from '../../../state/pioneer'
import { STAGE_COUNT } from '../../../data/pioneer'

// SF モードの「遊ぶ」：開拓（資源を集めて、建設中のコロニーを建てる）。遊んでいる最中なら端末を開く
registerNav({
  id: 'pioneer',
  tab: 'play',
  order: 70,
  world: 'sf',
  className: 'pioneer-start',
  label: () => ui().pioneer.navButton,
  use: () => {
    const active = usePioneer((p) => p.active)
    const stage = usePioneer((p) => p.stage)
    return { on: active, disabled: useNavContext().racing, badge: `${stage}/${STAGE_COUNT}` }
  },
  run: () => {
    if (usePioneer.getState().active) togglePanel(true)
    else startPioneer()
  },
})
