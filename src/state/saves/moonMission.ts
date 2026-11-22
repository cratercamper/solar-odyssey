import { registerSave } from '../save'
import { ui } from '../../i18n'

// 月ミッション（state/moonMission.ts）の記録：いちばん良い星の数と、たどり着いた所
registerSave({ name: 'moon-mission', label: () => ui().moonMission.saveLabel })
