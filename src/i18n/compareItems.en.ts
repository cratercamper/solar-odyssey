import type { CompareItemsJa } from './compareItems.ja'
import type { Translation } from './translation'

// The texts of data/shipParts.ts (English). Same keys as compareItems.ja.ts

export const compareItemsEn: Translation<CompareItemsJa> = {
  skytree: { name: 'Tokyo Skytree', note: '634 m tall, laid on its side' },
  iss: { name: 'International Space Station', note: 'the biggest structure in space where people live' },
  jet: { name: 'Jumbo jet', note: 'Boeing 747' },
  hubble: { name: 'Hubble Space Telescope', note: 'about as long as a big bus' },
}
