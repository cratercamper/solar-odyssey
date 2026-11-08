import type { RockGroupsJa, RockGroupsWhereJa } from './rockGroups.ja'
import type { Translation } from './translation'

// The texts of data/rockCollection.ts (English): the pages with a name of their own (the others use their first body's name)

export const rockGroupsEn: Translation<RockGroupsJa> = {
  europa: 'Icy moons & Pluto',
  phobos: 'Other rocky worlds',
}

// The bodies of a page with 4 or more of them, as they are named inside a sentence ("Land on …")
export const rockGroupsWhereEn: Translation<RockGroupsWhereJa> = {
  europa: 'an icy moon or Pluto',
}
