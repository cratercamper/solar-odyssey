import { registerSave } from '../save'
import { ui } from '../../i18n'

// 起動したときの「新しい遊び」のお知らせ（ui/NewContent.tsx）：もう見たもの
registerSave({ name: 'new-content-seen', label: () => ui().saveData.entries.newContentSeen })
