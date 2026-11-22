import type { sceneErrorJa } from './sceneError.ja'
import type { Translation } from './translation'

// The texts of ui/SceneBoundary.tsx (English). Same keys as sceneError.ja.ts

export const sceneErrorEn: Translation<typeof sceneErrorJa> = {
  title: 'Something went wrong',
  body: 'This scene could not be shown. Press Back to return to free exploration in space. Your progress is saved.',
  bodyApp: 'The screen could not be shown. Reload to carry on where you left off. Your progress is saved.',
  back: 'Back',
  reload: 'Reload',
  detail: 'Details',
}
