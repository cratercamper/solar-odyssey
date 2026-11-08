import type { SurfaceSitesJa } from './surfaceSites.ja'
import type { Translation } from './translation'

// The texts of data/surfaces.ts (English). Same keys as surfaceSites.ja.ts

export const surfaceSitesEn: Translation<SurfaceSitesJa> = {
  coprates: {
    name: 'Valles Marineris',
    note: 'The floor of Coprates Chasma in Valles Marineris. The canyon is about 4,000 km long and up to about 7 km deep. The wall rising to the south climbs 8 km above you.',
  },
  taurus: {
    name: 'Taurus-Littrow valley',
    note: 'The valley where Apollo 17 landed in 1972, between mountains (the North and South Massifs) rising over 2 km. It is the last place people walked on the Moon, and the astronauts drove their lunar rover through this valley. Follow the light beams with the rover to visit what they left behind and the stations where they stopped.',
  },
  conamara: {
    name: 'Ice ridge near Conamara Chaos',
    note: 'The central trough of one of Europa’s big double ridges, with crests about 100 m high on both sides. The ice is very slippery. To the north-west lies chaos terrain, where the ice crust broke into tilted rafts. Europa has no detailed height measurements, so this landscape is a reconstruction based on Galileo spacecraft photos.',
  },
}
