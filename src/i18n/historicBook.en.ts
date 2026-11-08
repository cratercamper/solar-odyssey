import type { historicBookJa } from './historicBook.ja'
import type { Translation } from './translation'

// The texts of ui/HistoricBook.tsx (English). Same keys as historicBook.ja.ts

export const historicBookEn: Translation<typeof historicBookJa> = {
  fromLandingSpot: (dir: string, dist: string) => `${dist} ${dir} of the landing spot`,
  back: 'Back',
  notVisitedYet: 'Not visited yet. ',
  notVisitedWhere: (where: string) => `In the Taurus-Littrow valley on the Moon (the Moon chase track), ${where}. Drive the rover to the light beam.`,
  title: 'Apollo 17 site book',
  close: 'Close',
  intro: 'In December 1972, Apollo 17 astronauts Eugene Cernan and Harrison Schmitt explored this valley for three days in their lunar rover. It is still the last time people walked on the Moon. Drive the rover to what they left behind and to the stations where they stopped.',
  station: (no: number) => `Station ${no}`,
  unknownIcon: '?',
  unknownName: '???',
  directions: ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'],
}
