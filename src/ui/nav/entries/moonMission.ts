import { registerNav, useNavContext, type NavTab } from '../registry'
import { ui } from '../../../i18n'
import { closeEclipses } from '../../../state/eclipse'
import { startMoonMission } from '../../../state/moonMission'
import { startSaturnObserve } from '../../../state/saturnExplorer'
import { useStore } from '../../../state/store'

// 月への有人飛行（アポロ17号の追体験）。「遊ぶ」と「学ぶ」の両方に置く（junji 2026-11-22：学ぶにあると思った）

function register(id: string, tab: NavTab, order: number, className: string) {
  registerNav({
    id,
    tab,
    order,
    className,
    label: () => ui().moonMission.navLabel,
    use: () => {
      const { busy } = useNavContext()
      const mode = useStore((s) => s.mode)
      // 全体マップを開いたままでも押せる（押すとマップを閉じて始まる）
      return { disabled: busy || (mode !== 'flight' && mode !== 'map') }
    },
    // 夕方の発射台でサターンV を見るところから（「打ち上げの夜へ」ですぐ秒読みにも行ける）
    run: () => {
      const s = useStore.getState()
      if (s.mode === 'map') s.setMode('flight')
      closeEclipses()
      startMoonMission('launch', startSaturnObserve)
    },
  })
}

register('moonMission', 'play', 15, 'moon-mission-start')
register('moonMission-learn', 'learn', 3, 'moon-mission-start-learn')
