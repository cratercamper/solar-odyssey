import type { ephemerisJa } from './ephemeris.ja'
import type { Translation } from './translation'

// The texts of data/ephemeris.ts (English). Same keys as ephemeris.ja.ts

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const ephemerisEn: Translation<typeof ephemerisJa> = {
  date: (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
}
