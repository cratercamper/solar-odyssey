import { useStore } from '../../state/store'
import { engage } from '../../state/flight'
import { togglePanel } from '../../state/pioneer'

/** 開拓の行き先へ（目標にして自動航行。端末は閉じる） */
export function go(id: string) {
  useStore.getState().setTarget(id)
  togglePanel(false)
  engage()
}
