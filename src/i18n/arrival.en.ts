import type { Translation } from './translation'
import type { arrivalJa } from './arrival.ja'

// Arrival moment texts (ui/ArrivalMoment.tsx), English. The numbers come from data/arrival.ts

/** 3.5 → "3½" */
const count = (n: number) => `${Math.floor(n)}${n % 1 ? '½' : ''}`

export const arrivalEn: Translation<typeof arrivalJa> = {
  giant: (n: number) => `${count(n)} Earths fit across it`,
  earth: (n: number) => `Line up ${count(n)} Moons to span the Earth`,
  small: (_name: string, n: number) => (n <= 1 ? 'Almost exactly the size of the Earth' : `Line up ${count(n)} of them to span the Earth`),
  tiny: (hours: number) => (hours < 48 ? `Walk all the way around in about ${Math.round(hours)} hours` : `Walk all the way around in about ${Math.round(hours / 24)} days`),
  countingWhat: (name: string) => `${name} ×`,
  earthName: 'Earth',
  moonName: 'Moon',
  more: 'Learn more',
  close: 'Close',
  wow: {
    sun: 'The Sun alone holds 99.8% of all the mass in the solar system.',
    mercury: 'One day, sunrise to sunrise, lasts two of its years.',
    venus: 'Under the clouds it is about 460 °C, hot enough to melt lead.',
    earth: 'The only world we know of where anything lives.',
    moon: 'It drifts about 3.8 cm farther from the Earth every year.',
    mars: 'Olympus Mons here is about 2.5 times as tall as Mount Everest.',
    phobos: 'It creeps about 1.8 m closer to Mars every hundred years.',
    deimos: 'From Mars it looks like little more than a bright star.',
    jupiter: 'The Great Red Spot, one storm, is wider than the whole Earth.',
    io: 'The most volcanic world in the solar system, with 400+ active volcanoes.',
    europa: 'Under the ice there may be more water than in all of Earth’s oceans.',
    ganymede: 'Bigger than the planet Mercury: the largest moon in the solar system.',
    callisto: 'One of the most heavily cratered worlds in the solar system.',
    saturn: 'So light that it would float in a big enough bathtub.',
    mimas: 'One giant crater makes it look like a huge eye.',
    enceladus: 'It sprays jets of ice grains into space from its south pole.',
    tethys: 'A canyon runs three quarters of the way around it.',
    dione: 'Bright streaks across it are tall cliffs of ice.',
    rhea: 'Saturn’s second largest moon.',
    titan: 'It has rivers and lakes, but they are liquid methane, not water.',
    iapetus: 'One half is dark and the other half bright, like a two-tone ball.',
    uranus: 'It rolls around the Sun tipped over on its side.',
    miranda: 'Home of the tallest cliff in the solar system, about 20 km high.',
    ariel: 'The brightest, whitest of Uranus’s moons.',
    umbriel: 'The darkest of Uranus’s big moons.',
    titania: 'The largest moon of Uranus.',
    oberon: 'The outermost of Uranus’s big moons.',
    neptune: 'Winds here blow over 2,000 km/h, the fastest in the solar system.',
    proteus: 'Big, yet never pulled itself into a ball: a lumpy world.',
    triton: 'It orbits backwards, against the way its planet spins.',
    pluto: 'A huge heart-shaped plain of ice covers part of it.',
    charon: 'It and Pluto always keep the same face toward each other.',
  } as Record<string, string>,
}
