import { registerSave } from '../save'
import { ui } from '../../i18n'

// 着陸船で月の空を飛ぶ：一周の記録と、選んだ速さ

registerSave({ name: 'moon-lap', label: () => ui().skyFlight.saveLaps })
registerSave({ name: 'sky-flight-gear', label: () => ui().skyFlight.saveGear })
