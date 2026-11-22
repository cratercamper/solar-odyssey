import { registerNav, useNavContext } from '../registry'
import { ui } from '../../../i18n'
import { startScanner, stopScanner, useDiscovery } from '../../../state/discovery'

// 発見スキャン（レーンD）：押すとスキャナーが入る。もう一度押すと切る
registerNav({
  id: 'discovery',
  tab: 'learn',
  order: 25,
  className: 'discovery-start',
  label: () => ui().discovery.navButton,
  use: () => ({ on: useDiscovery((s) => s.on), disabled: !useNavContext().flight, badge: `${useDiscovery((s) => s.found.length)}` }),
  run: () => (useDiscovery.getState().on ? stopScanner() : startScanner()),
})
