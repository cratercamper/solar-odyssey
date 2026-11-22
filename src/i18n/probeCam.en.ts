import type { probeCamJa } from './probeCam.ja'
import type { Translation } from './translation'

// The texts of ui/ProbeCamPane.tsx (English). Same keys as probeCam.ja.ts. Captions stay within two lines

const planet: Record<string, string> = { venus: 'Venus', earth: 'Earth', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', ryugu: 'Ryugu' }
const km = (v: number) =>
  v >= 1e9
    ? `${(v / 1e9).toFixed(1)} billion km`
    : v >= 1e6
      ? `${(v / 1e6).toFixed(1)} million km`
      : v >= 100
        ? `${Math.round(v).toLocaleString('en-US')} km`
        : v >= 1
          ? `${v.toFixed(1)} km`
          : `${Math.max(0, Math.round(v * 1000))} m`
const kms = (v: number) => `${v.toFixed(1)} km/s`

export const probeCamEn: Translation<typeof probeCamJa> = {
  planet,
  distance: km,
  title: 'Probe',
  speed: 'Speed relative to the Sun',
  speedValue: (v: number) => `${v.toFixed(1)} km/s`,
  toPlanet: (name: string, d: string) => `${d} to ${name}`,
  toSurface: (name: string, d: string) => `${d} above ${name}'s ground`,
  fromEarth: (d: string, t: string) => `${d} from Earth · radio takes ${t}`,
  lightTime: (minutes: number) => (minutes < 1 ? `${(minutes * 60).toFixed(1)} s` : minutes < 60 ? `${Math.round(minutes)} min` : `${(minutes / 60).toFixed(1)} h`),
  arrow: 'speed arrow',
  loading: 'Loading the model…',
  dragHint: 'Drag to turn it around',
  launch: {
    burnout: (v: number) => `About an hour after launch. The last rocket burn is over, and it leaves Earth at ${kms(v)}.`,
    moon: (d: string) => `Already ${d} from Earth. It passed the Moon's orbit (about 380,000 km) in half a day.`,
    helio: (v: number) => `Earth's own orbital speed (30 km/s) adds to the rocket's, so seen from the Sun it heads out at ${kms(v)}.`,
  },
  flyby: (name: string, n: { speedBefore: number; speedAfter: number; relSpeed: number; turnPlanet: number; turnSun: number; altitudeKm: number; planetSpeed: number }) => {
    const change =
      n.speedAfter > n.speedBefore + 0.5
        ? `Seen from the Sun, it sped up from ${kms(n.speedBefore)} to ${kms(n.speedAfter)}! It borrowed a little of ${name}'s motion. That's a gravity assist.`
        : n.speedAfter < n.speedBefore - 0.5
          ? `Seen from the Sun: ${kms(n.speedBefore)} → ${kms(n.speedAfter)}. To turn sharply it gave a little speed back to ${name}.`
          : `Seen from the Sun the speed hardly changed; only the direction turned by ${Math.round(n.turnSun)}°.`
    return [
      `Approaching ${name}. Its gravity pulls the probe in, slowly speeding it up.`,
      `${name}'s gravity bends the path hard (${Math.round(n.turnPlanet)}° as seen from ${name}).`,
      `Closest approach! About ${km(n.altitudeKm)} above ${name}'s clouds.`,
      `Seen from ${name}, it leaves at the same ${kms(n.relSpeed)} it came in with. But ${name} itself is moving around the Sun at ${kms(n.planetSpeed)}.`,
      change,
    ]
  },
  probes: {
    voyager2: {
      credit: 'Model: NASA 3D Resources / Trajectory: NASA JPL Horizons',
      extra: [
        '',
        "At Jupiter it photographed Io's volcanoes and the swirl of the Great Red Spot.",
        "Saturn's gravity put it on the road to Uranus.",
        'Uranus spins on its side. Voyager 2 is still the only probe to have seen it up close.',
        "It skimmed over Neptune's north pole toward the moon Triton and was bent south of the planets' plane.",
      ],
      cruise: [
        'Its big dish antenna (3.7 m across) always points at Earth.',
        (d: string, t: string) => `${d} from Earth. Radio from Earth takes ${t} to get here.`,
        'Power comes from nuclear batteries (RTGs). The Sun is too far away for solar panels.',
        'The Golden Record carries Earth’s music, voices and pictures, in case someone finds it one day.',
        "It hardly uses its engines: it borrows each planet's gravity to reach the next one.",
      ],
      beyond: (v: number) => `Now it keeps going south of the planets' plane at ${kms(v)}.`,
    },
    hayabusa2: {
      credit: 'Model: original reconstruction from photos and data / Trajectory: NASA JPL Horizons',
      extra: [
        "In a year it comes back to Earth and uses Earth's gravity to turn.",
        "Earth's gravity bent its path onto the road to Ryugu.",
        'With pieces of Ryugu (5.4 g) packed in its capsule, it heads home to Earth.',
        '',
      ],
      cruise: [
        'Its four ion engines push out xenon gas at 30 km/s.',
        'An ion engine pushes about as hard as the weight of a sheet of paper. But it keeps pushing for months and slowly speeds up.',
        (d: string, t: string) => `${d} from Earth. Radio from Earth takes ${t} to get here.`,
        'It points its two solar wings at the Sun to make electricity.',
      ],
      beyond: () => 'Leaving Earth for its next asteroid. It should reach 1998 KY26, about 30 m across, in 2031.',
    },
    cassini: {
      credit: 'Model: NASA 3D Resources / Trajectory: NASA JPL Horizons',
      extra: [
        'It weighs 5.6 tonnes: too heavy for any rocket to send straight to Saturn.',
        "Venus's gravity sped it up. A year later it comes back to Venus again.",
        'Venus for the second time. Next is Earth, only two months later.',
        'It passes very close to Earth and gains a lot of speed. Next stop: Jupiter.',
        'At Jupiter it worked together with Galileo, the probe orbiting Jupiter.',
        '',
      ],
      cruise: [
        '6.8 m tall and 5.6 tonnes, built together by the USA, Europe and Italy.',
        (d: string, t: string) => `${d} from Earth. Radio from Earth takes ${t} to get here.`,
        'Three nuclear batteries (RTGs) make its power. Sunlight at Saturn is only about 1/100 as bright as at Earth.',
        'The disc on its side is Huygens, a European probe it carries to drop on the moon Titan.',
      ],
      beyond: () => "Cassini's journey ended in Saturn's atmosphere.",
      stay: {
        approach: 'Saturn! It crossed a gap in the rings and fired its engine for 96 minutes to go into orbit.',
        home: [
          'It went around Saturn 294 times in 13 years, using the moons’ gravity to keep changing its orbit.',
          "It flew past the big moon Titan more than 100 times. Titan's gravity was its steering wheel.",
          (t: string) => `Commands from Earth take ${t} to reach Cassini.`,
          'Saturn is so light it would float in water. Its rings are mostly grains of ice.',
        ],
        dips: [
          'It let go of Huygens, which spins as it drifts toward Titan for three weeks.',
          'Huygens landed on Titan! The most distant landing ever made from Earth.',
          'It passed 175 km above Enceladus and found water vapour spraying from its south pole.',
          'The Grand Finale begins: a dive through the gap, about 2,000 km wide, between Saturn and its rings.',
          'Before its fuel ran out, it dove into Saturn, sending data to Earth until the very last moment.',
        ],
        depart: 'Before its fuel ran out, it dove into Saturn, sending data to Earth until the very last moment.',
      },
    },
  },
  stay: {
    approach: 'Ryugu comes into view: an asteroid about 900 m across, shaped like a spinning top.',
    home: [
      'From its home position 20 km above Ryugu, it travels around the Sun side by side with the asteroid.',
      'The ground is as black as charcoal and reflects only 4.5% of the light. Big boulders are everywhere.',
      'Ryugu turns once every 7.6 hours, backwards compared with most bodies.',
      (t: string) => `Radio from Earth takes ${t} one way, so the probe makes its landings on its own.`,
    ],
    dips: [
      'It dropped two tiny MINERVA-II robots. They hop around: the first rovers ever on an asteroid.',
      'It dropped MASCOT, a lander from Germany and France, which studied the ground for 17 hours.',
      'First touchdown! It touched the ground for a moment, fired a bullet and caught the dust that flew up.',
      'Second touchdown, next to its own artificial crater, catching dust from under the surface too.',
    ],
    depart: 'November 2019: it leaves Ryugu and heads home with the sample capsule.',
  },
  homecoming: (altitudeKm: number) => [
    'Back at Earth after six years.',
    "220,000 km from Earth, it let go of the capsule holding Ryugu's sand.",
    `The capsule falls like a shooting star toward the Australian desert. The probe passes about ${km(altitudeKm)} above the ground.`,
    "Earth's gravity turns the probe, and it carries on with its journey.",
    'The capsule was found, and 5.4 g of Ryugu reached Earth.',
  ],
}
