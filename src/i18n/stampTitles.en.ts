import type { StampTitlesJa } from './stampTitles.ja'
import type { Translation } from './translation'

// The texts of data/stamps.ts (English): the titles (count: how many it takes). Same ids as stampTitles.ja.ts

/** a title for visiting count bodies */
const visitEn = (count: number) => `Visit ${count} bod${count === 1 ? 'y' : 'ies'}`

export const stampTitlesEn: Translation<StampTitlesJa> = {
  rookie: { name: 'Space Rookie', how: visitEn },
  apprentice: { name: 'Apprentice Explorer', how: visitEn },
  skilled: { name: 'Skilled Explorer', how: visitEn },
  veteran: { name: 'Veteran Explorer', how: visitEn },
  'grand-tour': { name: 'Grand Tour of the Solar System', how: (count: number) => `Visit every sun, planet and moon (${count})` },
  rocky: { name: 'Rocky Planets Tour', how: () => 'Visit Mercury, Venus, Earth and Mars' },
  giants: { name: 'Giant Planets Tour', how: () => 'Visit Jupiter, Saturn, Uranus and Neptune' },
  nearby: { name: 'Nearby Moons Tour', how: () => 'Visit the Moon and both moons of Mars' },
  galilean: { name: 'All Four Galilean Moons', how: () => 'Visit the four moons of Jupiter that Galileo found in 1610' },
  'saturn-moons': { name: 'Moons of Saturn', how: (count: number) => `Visit all ${count} moons of Saturn` },
  'ice-moons': { name: 'Moons of the Ice Giants', how: () => 'Visit every moon of Uranus and Neptune' },
  far: { name: 'Out to Pluto', how: () => 'Visit Pluto and Charon' },
  scopes: { name: 'Telescope Spotter', how: () => 'Visit both space telescopes, Hubble and Webb' },
  mystery: { name: 'Mystery Finder', how: () => 'Find the strange ship floating somewhere out there' },
  colonist: { name: 'Colony Visitor', how: () => 'Visit the L5 Space Colony' },
  scholar: { name: 'Budding Scientist', how: (count: number) => `Answer ${count} ship’s log quizzes correctly` },
  professor: { name: 'Solar System Professor', how: (count: number) => `Answer the ship’s log quiz for every sun, planet and moon (${count})` },
}
