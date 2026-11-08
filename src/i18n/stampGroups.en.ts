import type { stampGroupsJa } from './stampGroups.ja'
import type { Translation } from './translation'

// The texts of data/stamps.ts (English): the pages of the stamp book. Same keys as stampGroups.ja.ts

export const stampGroupsEn: Translation<typeof stampGroupsJa> = {
  planets: 'The Sun and planets',
  moonsOf: (planet: string, count: number) => (count === 1 ? `${planet}’s moon` : `Moons of ${planet}`),
  dwarf: 'Dwarf planet and its moon',
  scopes: 'Space telescopes',
  sf: 'SF (imaginary)',
}
