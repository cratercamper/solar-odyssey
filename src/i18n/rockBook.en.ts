import type { rockBookJa } from './rockBook.ja'
import type { Translation } from './translation'
import { theEn } from './article'
import { listEn } from './list'

// The texts of ui/RockBook.tsx (English). Same keys as rockBook.ja.ts

export const rockBookEn: Translation<typeof rockBookJa> = {
  landerHint: (where: string) => `Land on ${theEn(where)} and look for the rocks marked by light beams with the rover.`,
  // The spots are place labels ("Large crater"), so they go in quotes, as the Japanese puts them in 「」
  spotsHint: (where: string, spots: string[]) => `Try ${listEn(spots.map((s) => `“${s}”`))} on ${theEn(where)}. Drive to the ◆ on the minimap.`,
  back: 'Back',
  unknownName: '???',
  foundOn: 'Found on: ',
  notFoundYet: 'Not found yet. ',
  rockCollection: 'Rock collection',
  close: 'Close',
  howToCollect: 'Land, send out the rover and collect rocks to fill this collection. Rocks you have not found yet show only as silhouettes. Tap one to read about it.',
}
