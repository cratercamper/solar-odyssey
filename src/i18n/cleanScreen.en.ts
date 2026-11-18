import type { cleanScreenJa } from './cleanScreen.ja'
import type { Translation } from './translation'

// The texts of ui/CleanScreen.tsx (English). Same keys as cleanScreen.ja.ts

export const cleanScreenEn: Translation<typeof cleanScreenJa> = {
  hide: 'Hide HUD',
  show: 'Show HUD',
  tip: 'Hide all text and buttons, for screenshots. Press again to bring them back',
}
