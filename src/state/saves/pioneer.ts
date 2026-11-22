import { registerSave } from '../save'
import { ui } from '../../i18n'

// 開拓（state/pioneer.ts）の記録：積み荷・倉庫・建設の段階・コロニーの名前
registerSave({ name: 'pioneer', label: () => ui().pioneer.saveLabel })
