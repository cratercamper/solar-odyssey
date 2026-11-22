import type { Translation } from './translation'
import type { sunriseJa } from './sunrise.ja'

// Watching the sunrise (components/surface/Sunrise.tsx, sunrise.ts), English

export const sunriseEn: Translation<typeof sunriseJa> = {
  button: 'Sunrise',
  north: 'N',
  east: 'E',
  south: 'S',
  west: 'W',
  fromEast: '🌅 The Sun rises in the east',
  fromWest: '🌅 The Sun rises in the west!',
  whyEast: 'This world spins from west to east, just like Earth',
  whyWest: {
    venus: 'Venus spins backwards, and very slowly, compared with the other planets',
    pluto: 'Pluto lies on its side and spins backwards',
    charon: 'Charon spins backwards together with Pluto',
    triton: 'Triton orbits Neptune backwards',
    other: 'This world spins the opposite way to Earth',
  },
}
