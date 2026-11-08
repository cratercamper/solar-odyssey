import type { approachJa } from './approach.ja'
import type { Translation } from './translation'
import { theEn } from './article'

// The texts of data/approach.ts (English). Same keys as approach.ja.ts

export const approachEn: Translation<typeof approachJa> = {
  starLimit: 'The Sun’s heat and light are too strong to go any closer. Its surface is about 6,000 °C.',
  rockLimit: (name: string) => `Below here is the surface of ${theEn(name)}. This is a low orbit, the height probes observe from too.`,
  diveStart: (name: string) => `Into the clouds of ${theEn(name)}. Gas giants have no solid ground, and the pressure and temperature rise the deeper you go.`,
  gasLimit: (name: string, LIMIT_BAR: number) => `Under the clouds of ${theEn(name)}, about ${LIMIT_BAR} times Earth’s air pressure. The pressure is too strong to go deeper. In 1995 the Galileo probe’s descent capsule lost contact at about this depth in Jupiter because of the heat and pressure.`,
}
