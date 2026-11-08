import type { RallyColorsJa } from './rallyColors.ja'
import type { Translation } from './translation'

// The texts of state/rally.ts (English): the four rovers. Same keys as rallyColors.ja.ts

export const rallyColorsEn: Translation<RallyColorsJa> = {
  red: { color: 'Red', name: 'Akatsume', trait: 'Speedster' },
  blue: { color: 'Blue', name: 'Minamo', trait: 'Careful' },
  yellow: { color: 'Yellow', name: 'Inazuma', trait: 'Jumper' },
  green: { color: 'Green', name: 'Kokemomo', trait: 'Shortcut fan' },
}
