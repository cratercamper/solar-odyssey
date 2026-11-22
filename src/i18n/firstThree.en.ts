import type { firstThreeJa } from './firstThree.ja'
import type { Translation } from './translation'

// The texts of ui/FirstThree.tsx (English). Same keys as firstThree.ja.ts

export const firstThreeEn: Translation<typeof firstThreeJa> = {
  title: 'First three things to try',
  intro: 'In any order, or just fly around freely.',
  moon: 'Warp to the Moon',
  moonGo: 'To the Moon',
  mars: 'Land on Mars',
  marsGo: 'To Mars',
  marsHint: 'When you reach Mars, press the Land button.',
  rover: 'Pick up a rock with the rover',
  roverHint: 'After landing, send out the rover and drive up to a rock.',
  done: 'Done',
  fold: 'Collapse',
  close: 'Close',
  allDone: 'All three done! Enjoy the journey. There is much more under Play and Learn in the nav computer.',
}
