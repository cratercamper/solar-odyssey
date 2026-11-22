import { registerSave } from '../save'
import { ui } from '../../i18n'

// コロニー経営（state/colony.ts）の記録：区画・人口・満足度・予算・税と方針・研究・グラフの点
registerSave({ name: 'colony', label: () => ui().colony.saveLabel })
