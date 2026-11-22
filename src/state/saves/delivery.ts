import { registerSave } from '../save'
import { ui } from '../../i18n'

// 配達の仕事（state/delivery.ts）の記録：引き受けている仕事・届けた数と星
registerSave({ name: 'delivery', label: () => ui().delivery.saveLabel })
