import { registerSave } from '../save'
import { ui } from '../../i18n'

// 発見スキャンで見つけた小惑星（state/discovery.ts）
registerSave({ name: 'discoveries', label: () => ui().discovery.saveLabel })
