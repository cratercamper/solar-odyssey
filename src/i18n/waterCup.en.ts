import type { Translation } from './translation'
import type { waterCupJa } from './waterCup.ja'

// Water cup experiment (components/surface/WaterCup.tsx, WaterCupPanel.tsx), English

export const waterCupEn: Translation<typeof waterCupJa> = {
  button: '💧 Set out water',
  buttonTip: 'Put a cup of water on a little table. Will it freeze, boil or vanish here?',
  temp: (c: number) => `${c} °C`,
  gone: 'Empty',
  state: { liquid: 'Water', boiling: 'Boiling', freezing: 'Freezing', ice: 'Ice', slush: 'Ice and water', subliming: 'Ice turning to gas' },
  head: {
    placed: 'A cup of 20 °C water. What happens?',
    vacuumBoil: 'No air! The water boils at once',
    thinBoil: 'The air is too thin! The water boils at once',
    flashFrozen: 'It boiled, cooled and froze already',
    subliming: 'Sunlight turns the ice straight into gas',
    vacuumGone: 'All the ice escaped into space',
    boiling: (tb: number) => `Boiling at ${tb} °C! The water is going`,
    boiledAway: 'All the water boiled away',
    heating: 'The water is heating up fast…',
    cooling: 'The water is cooling fast…',
    freezing: 'Freezing…',
    frozen: 'Frozen solid',
    melting: 'The ice is melting',
    liquid: 'Water stays water',
  },
  why: {
    vacuum: 'Almost zero pressure. Water cannot stay liquid',
    thin: 'Mars air is about 1/170 of Earth’s. Water cannot stay liquid',
    subliming: 'In a vacuum, ice skips melting and turns straight into gas (sublimation)',
    moonGone: 'In the Moon’s polar craters that never see the Sun, ice has lasted billions of years',
    vacuumGone: 'Gravity here is too weak to hold on to the vapour',
    venus: 'At 92 atmospheres water boils near 300 °C, but the ground is 460 °C',
    boil: (t: number) => `It is ${t} °C around it, hotter than boiling point`,
    titan: 'A −180 °C world. On Titan, ice is as hard as rock',
    frozen: (t: number) => `It is ${t} °C around it, below 0 °C`,
    earth: 'Earth is the only world in the Solar System with liquid water on the ground',
    liquid: (t: number) => `It is ${t} °C around it: above 0 °C and below boiling point`,
  },
  hint: {
    waitDay: 'Fast-forward to noon. What happens to the ice?',
    staysIce: 'In this cold, the ice will stay forever',
  },
  fastForward: '⏩ 1 day in 1 minute',
  speed: (s: string) => `1 s = ${s}`,
  minutes: (n: number) => `${n} min`,
  hours: (n: string) => `${n} h`,
  again: 'Again',
  close: 'Put away',
}
