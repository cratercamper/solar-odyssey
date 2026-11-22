import { registerSave } from '../save'
import { ui } from '../../i18n'

// ローバーレースの仕上げ（メダル・相手の強さ・自動アクセル）の記録

registerSave({ name: 'rally-medals', label: () => ui().rallyPanel.saveMedals })
registerSave({ name: 'rally-level', label: () => ui().rallyPanel.saveLevel })
registerSave({ name: 'rally-auto', label: () => ui().rallyPanel.saveAuto })
