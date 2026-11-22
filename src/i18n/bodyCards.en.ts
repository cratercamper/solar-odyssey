import type { Translation } from './translation'
import type { bodyCardsJa } from './bodyCards.ja'

// ui/BodyCards.tsx texts (English). Body cards: size, gravity, day and temperature next to Earth

const n = (v: number, digits = 2) => Number(v.toPrecision(digits)).toLocaleString('en-US', { maximumFractionDigits: 6 })

export const bodyCardsEn: Translation<typeof bodyCardsJa> = {
  title: 'Body cards',
  open: 'Body card',
  openHint: 'Compare size, gravity, day and temperature with Earth',
  close: 'Close',
  prev: 'Previous body',
  next: 'Next body',
  pickOther: 'Other bodies',
  goThere: 'Go there',
  kindStar: 'Star',
  kindPlanet: 'Planet',
  kindDwarf: 'Dwarf planet',
  kindMoonOf: (parent: string) => `A moon of ${parent}`,
  size: 'Size',
  gravity: 'Gravity',
  day: 'Length of a day',
  temperature: 'Temperature',
  earth: 'Earth',
  diameter: (km: string) => `${km} km across`,
  km: (v: number) => Math.round(v).toLocaleString('en-US'),
  timesEarth: (x: number) => (x >= 0.95 && x <= 1.05 ? 'About the same as Earth' : x >= 0.1 ? `About ${n(x, x >= 100 ? 3 : 2)} times Earth` : `About 1/${n(1 / x)} of Earth`),
  sizeNote: 'The circles are drawn to true scale.',
  tooSmall: ' (the smaller one is only a dot)',
  weight: (kg: number) => `Someone who weighs 30 kg on Earth would feel about ${kg >= 10 ? `${Math.round(kg)} kg` : kg >= 1 ? `${n(kg)} kg` : `${n(kg * 1000)} g`} here.`,
  jump: (m: number) => `Someone who can jump 50 cm on Earth could jump about ${m >= 1000 ? `${n(m / 1000)} km` : m >= 10 ? `${Math.round(m)} m` : m >= 1 ? `${n(m)} m` : `${Math.round(m * 100)} cm`} here.`,
  jumpLess: (m: number) => `Someone who can jump 50 cm on Earth could only jump about ${Math.round(m * 100)} cm here.`,
  cloudTops: 'There is no solid ground, so this is at the height of the cloud tops.',
  sunSurface: 'At the surface.',
  dayLength: (h: number) =>
    h >= 72
      ? `About ${n(h / 24, 3)} days`
      : `About ${Math.floor(h)} h${Math.round((h % 1) * 60) ? ` ${Math.round((h % 1) * 60)} min` : ''}`,
  dayVsEarth: (x: number) => (x >= 0.95 && x <= 1.05 ? 'About the same as Earth' : x >= 1 ? `About ${n(x, 3)} Earth days` : `About 1/${n(1 / x)} of an Earth day`),
  dayNoteSun: 'The Sun is gas, so it spins at different speeds in different places (about 25 days at the equator).',
  dayNoteMoon: 'It always shows the same face to its planet, so a day lasts about as long as one trip around the planet.',
  dayNoteRetro: 'It spins backwards, so the Sun rises in the west.',
  dayNote: 'From one sunrise to the next.',
  temp: (c: number) => `${c < 0 ? '−' : ''}${Math.abs(Math.round(c)).toLocaleString('en-US')} °C`,
  tempRange: (min: string, max: string) => `${min} to ${max}`,
  tempRangeMean: (min: string, max: string, mean: string) => `${min} to ${max} (average about ${mean})`,
  gravityValue: (v: number) => `${Number(v.toPrecision(v >= 0.1 ? 3 : 2)).toLocaleString('en-US', { maximumFractionDigits: 6 })} m/s²`,
  tempAbout: (c: string) => `About ${c}`,
  tempUnknown: 'Its temperature is not well known yet.',
  tempEarth: 'Earth (−89 to 57 °C, average 15 °C)',
  source: 'Numbers are rounded from NASA’s public data.',
}
