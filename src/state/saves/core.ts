import { registerSave } from '../save'
import { ui } from '../../i18n'

// いまある機能の記録（セーブデータ画面に、この順に出る）。新しい機能は、このフォルダに自分のファイルを足して registerSave を呼ぶ
// （ui/SaveDataPanel.tsx が state/saves/*.ts をまとめて読む。ほかのファイルは触らなくてよい）

const t = () => ui().saveData.entries

registerSave({ name: 'settings', label: () => t().settings })
registerSave({ name: 'visited', label: () => t().visited })
registerSave({ name: 'stamps', label: () => t().stamps })
registerSave({ name: 'titles', label: () => t().titles })
registerSave({ name: 'rover-samples', label: () => t().roverSamples })
registerSave({ name: 'apollo17', label: () => t().apollo17 })
registerSave({ name: 'campaign', label: () => t().campaign })
registerSave({ name: 'mission-stars', label: () => t().missionStars })
registerSave({ name: 'missions', label: () => t().missionsOld })
registerSave({ name: 'quiz-best', label: () => t().quizBest })
registerSave({ name: 'race-best', label: () => t().raceBest })
registerSave({ name: 'rally-best', prefix: true, label: () => t().rallyBest })
registerSave({ name: 'rally-results', prefix: true, label: () => t().rallyResults })
registerSave({ name: 'rally-ghost', prefix: true, label: () => t().rallyGhost })
registerSave({ name: 'rally-color', label: () => t().rallyColor })
registerSave({ name: 'rally-course', label: () => t().rallyCourse })
registerSave({ name: 'eva-log', label: () => t().evaLog })
registerSave({ name: 'first-three', label: () => t().firstThree })
registerSave({ name: 'news-seen', label: () => t().newsSeen })
registerSave({ name: 'photo-note-hidden', label: () => t().photoNoteHidden })
