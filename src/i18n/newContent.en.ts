import type { newContentJa } from './newContent.ja'
import type { Translation } from './translation'

// The texts of ui/NewContent.tsx (English). Same keys as newContent.ja.ts

export const newContentEn: Translation<typeof newContentJa> = {
  badge: 'NEW',
  apollo17: {
    title: 'Apollo 17: crewed flight to the Moon',
    body: 'Relive the last Moon mission of 1972, from lift-off and the Moon walks to the return to Earth.',
    photo: 'Earth seen from Apollo 17 (NASA)',
    play: 'Play',
    close: 'Close',
    later: 'You can also start it later from the Play tab in the menu.',
  },
}
