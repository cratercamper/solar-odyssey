import type { Facts, Quiz } from '../data/facts'
import { RADIO_MOON_ID, CARRIER_ID, FREIGHTER_ID } from '../data/sfSpace'
import { RAILWAY_ID, MOON_CITY_ID } from '../data/sfJapan'
import { HOURGLASS_ID } from '../data/sfHourglass'
import type { LagrangePoint } from '../components/sf/lagrange'
import { type ColonyGroup, COLONY_GROUPS } from '../data/sfSides'
import { ENGINE_ROCK_ID } from '../data/sfEngine'

// The log-book texts and quizzes of the SF objects (English). Same keys as sfFacts.ja.ts; they go into FACTS_EN (facts.en.ts)

export const SPACE_FACTS_EN: Record<string, Facts> = {
  [RADIO_MOON_ID]: {
    rows: [
      ['Size', 'About 150 km across (about 230 times your ship)'],
      ['Dish', 'A bowl about 50 km wide at the north pole, with a receiver hung from three towers'],
      ['Where', 'On Mars’s orbit, 60° behind Mars (a Mars trojan point)'],
    ],
    fiction: true,
    notes: [
      'A man-made moon: a hollowed rocky ball covered in hull plates. Bands wrap it along lines of latitude, with small radio dishes and ship entrances here and there.',
      'The big dish at the north pole gathers faint radio waves from distant galaxies and black holes. It is not a weapon.',
      'As you come close, your ship shrinks so the moon is shown at its real size compared with the ship.',
    ],
    real: [
      'The largest real radio dish is China’s FAST, 500 m across, finished in 2016 in a natural hollow among the hills.',
      'The Arecibo radio telescope in Puerto Rico (305 m) hung its receiver from three towers. Its cables broke and it collapsed in 2020.',
      'The far side of the Moon is shielded from Earth’s radio noise, so it is a very quiet place. NASA has studied building a radio telescope inside a crater there (LCRT).',
      'The biggest thing people have built in space is the International Space Station, about 109 m wide.',
    ],
    quiz: {
      question: 'Why is the far side of the Moon interesting for radio telescopes?',
      choices: ['Earth’s radio noise cannot reach it', 'It is warm there', 'It is closest to the Sun'],
      answer: 0,
      explanation: 'Earth is never in the sky on the far side, so the Moon itself blocks TV, phone and other radio noise from Earth. Even very faint radio waves from space can be heard.',
    },
  },
  [CARRIER_ID]: {
    rows: [
      ['Size', 'About 1.6 km long (about 2.5 times your ship)'],
      ['Cargo', 'Iron, nickel and water ice mined from asteroids'],
      ['Route', 'A slow loop around the asteroid belt (a few hours per lap)'],
    ],
    fiction: true,
    notes: [
      'Containers are stacked on its sloping sides, and the big bay underneath holds chunks of mined ore.',
      'Along its back are radiator panels to shed heat and a low bridge. Six engines sit side by side at the stern.',
    ],
    real: [
      'Today, cargo in space is carried by supply ships to the International Space Station, such as SpaceX’s Dragon, Japan’s HTV-X and Northrop Grumman’s Cygnus.',
      'Some asteroids hold lots of metals such as iron, nickel and platinum, or water ice. Materials and fuel (hydrogen and oxygen from water) for use in space might not need to be launched from Earth.',
      'NASA’s Psyche spacecraft left in 2023 to study Psyche, an asteroid thought to be made largely of metal.',
    ],
    quiz: {
      question: 'Why could water ice on asteroids be useful?',
      choices: ['It can be made into rocket fuel (hydrogen and oxygen)', 'For swimming in space', 'To cool the Sun'],
      answer: 0,
      explanation: 'Splitting water with electricity gives hydrogen and oxygen. Both are rocket fuel, and they also give drinking water and air.',
    },
  },
  [FREIGHTER_ID]: {
    rows: [
      ['Size', 'About 250 m across'],
      ['Route', 'The Moon ↔ the L5 colonies'],
    ],
    fiction: true,
    notes: ['A small freighter carrying iron and glass made on the Moon to the L5 colonies. The round dome in the middle is the cockpit, and it holds cargo boxes underneath.'],
    real: [
      'Moon dust (regolith) contains oxygen, silicon, iron and aluminium, which can be made into glass and metal.',
      'The Moon has weak gravity and no air, so one idea is a “mass driver” that speeds cargo along a rail and flings it into space (part of O’Neill’s colony plans).',
    ],
    quiz: {
      question: 'Why is it easier to send materials into space from the Moon than from Earth?',
      choices: ['The Moon’s gravity is about one sixth of Earth’s', 'The Moon is closer to the Sun', 'The Moon has oceans'],
      answer: 0,
      explanation: 'The weaker the gravity, the less speed and energy a launch needs. And with no air, there is no air resistance either.',
    },
  },
}

export const JAPAN_FACTS_EN: Record<string, Facts> = {
  [RAILWAY_ID]: {
    rows: [
      ['Story', 'Kenji Miyazawa’s “Night on the Galactic Railroad” (written around 1927, published after his death in 1934)'],
      ['Route', 'Rails of light from near Earth out past Saturn and back'],
      ['Train', 'One locomotive and three coaches'],
    ],
    fiction: true,
    notes: [
      'In the story, a boy named Giovanni and his best friend Campanella ride a train along the Milky Way from star to star.',
      'This train runs a slow loop through the solar system. Warp to it as a target and you can fly alongside.',
    ],
    real: [
      'The Milky Way is our own galaxy seen edge-on from inside. Its disk holds about 100 to 400 billion stars.',
      'The “Northern Cross” in the story is the star pattern of Cygnus, the swan. Albireo, the star at its beak, really is a double star of gold and blue, easy to see in a small telescope.',
      'Kenji Miyazawa loved astronomy and even wrote a song about the constellations, “Song of the Circling Stars”.',
    ],
    quiz: {
      question: 'Why does the Milky Way look like a band across the night sky?',
      choices: ['We see the disk of our galaxy edge-on from inside', 'A huge cloud is glowing', 'Moonlight is reflecting off it'],
      answer: 0,
      explanation: 'The solar system sits inside the disk of the galaxy. Looking along the disk, the stars pile up into a band of light.',
    },
  },
  [MOON_CITY_ID]: {
    rows: [
      ['Story', '“The Tale of the Bamboo Cutter” (Heian period, said to be Japan’s oldest story)'],
      ['Where', 'A crater floor on the far side of the Moon (never visible from Earth)'],
      ['Sight', 'Palaces with white walls and gold roofs, gates, a pond and floating lanterns'],
    ],
    fiction: true,
    notes: [
      'In the story, Princess Kaguya, found inside a bamboo stalk, is taken home by envoys from the Moon on a night of the full moon.',
      'Fly over the far side of the Moon and you will see the lights of the capital.',
    ],
    real: [
      'The Moon always shows the same face to Earth, because it turns exactly once for every trip around Earth (tidal locking). So its far side is never seen from Earth.',
      'In 2019 China’s Chang’e 4 made the first landing on the far side. In 2024 Chang’e 6 brought far-side soil back to Earth.',
      'Japan’s lunar orbiter Kaguya (2007) was named after the princess. In 2024 Japan’s SLIM made a “pinpoint landing” within about 100 m of its target.',
      'The far side is not the “dark side”. At new moon, the far side is in full sunlight.',
    ],
    quiz: {
      question: 'Why can’t we see the far side of the Moon from Earth?',
      choices: ['It turns exactly once for each trip around Earth', 'The far side is always at night', 'The Moon does not spin'],
      answer: 0,
      explanation: 'Its orbit and its spin take the same time (about 27 days), so the same face always points at Earth. This is called tidal locking.',
    },
  },
}

export const HOURGLASS_FACTS_EN: Record<string, Facts> = {
  [HOURGLASS_ID]: {
    rows: [
      ['Size', 'Each about 40 km long and about 16 km across at the widest'],
      ['Number', '10, arranged in a ring'],
      ['Spin', 'About one turn every 3 minutes (Earth-like weight on the outermost ground)'],
      ['Where', 'Sun–Earth L5 point (on Earth’s orbit, 60° behind Earth)'],
    ],
    fiction: true,
    notes: [
      'Two bowls joined back to back at a narrow waist. The waist is close to the spin axis, where you feel almost no weight, so it is the spaceport where ships come and go.',
      'Inside the bowls, bands of fields, seas and towns alternate with clear window bands that let in sunlight. The farther out you go, the faster the ground moves and the heavier you feel.',
      'The thin column through the middle carries an elevator between the two bowls and holds the mirrors that send light into the window bands.',
    ],
    real: [
      'People have long sketched big spinning homes in space: the Bernal sphere (1929), NASA’s Stanford torus (1975, a ring) and Gerard O’Neill’s “Island Three” (1976, long cylinders).',
      'Spin gravity equals (spin rate)² × radius. With a radius of 8 km, turning once about every 3 minutes gives Earth’s gravity (9.8 m/s²).',
      'At the Sun–Earth L4 and L5 points, the pulls of the Sun and Earth balance so that objects tend to stay there. Two Earth “Trojan asteroids” have been found: 2010 TK7 (found in 2010, confirmed in 2011) and 2020 XL5 (found in 2020, confirmed in 2021).',
      'NASA’s twin STEREO spacecraft passed near Earth’s L4 and L5 regions around 2009, watching the Sun from the side.',
    ],
    quiz: {
      question: 'Inside a spinning colony, what gives you weight when you stand on the ground?',
      choices: ['The outward push from the spin', 'The weight of the air inside', 'Earth’s gravity'],
      answer: 0,
      explanation: 'As the colony spins, everything inside is pressed outward. That push works like gravity on the outer ground. The bigger the radius, the slower it can spin for the same weight.',
    },
  },
}

const POINT_EN: Record<LagrangePoint, string> = {
  L1: 'Earth–Moon L1 (between Earth and the Moon)',
  L2: 'Earth–Moon L2 (beyond the Moon, seen from Earth)',
  L3: 'Earth–Moon L3 (on the far side of Earth from the Moon)',
  L4: 'Earth–Moon L4 (on the Moon’s orbit, 60° ahead of the Moon)',
  L5: 'Earth–Moon L5 (on the Moon’s orbit, 60° behind the Moon)',
}

const stableQuizEn: Quiz = {
  question: 'Of the five Earth–Moon Lagrange points, which ones can hold an object in place stably?',
  choices: ['L1 and L2', 'L4 and L5', 'All five'],
  answer: 1,
  explanation: 'At L4 and L5, something that drifts a little keeps circling back around the point. At L1, L2 and L3 it drifts away, so spacecraft there keep correcting their position with thrusters.',
}

const unstableQuizEn: Quiz = {
  question: 'Why do real spacecraft at L1, L2 and L3 fire their thrusters now and then?',
  choices: ['A small drift grows, so they correct their position', 'Air drag slows them down', 'They get cold far from the Sun'],
  answer: 0,
  explanation: 'L1, L2 and L3 are like a ball balanced on top of a hill: a small drift grows. Small burns keep the spacecraft in place (station-keeping).',
}

const relayQuizEn: Quiz = {
  question: 'In 2019, Chang’e 4 made the first landing on the far side of the Moon. Where was the satellite that relayed its signals to Earth?',
  choices: ['Around Earth–Moon L2', 'In geostationary orbit', 'Around Mars'],
  answer: 0,
  explanation: 'The far side can’t see Earth, so the relay satellite Queqiao, circling near L2 beyond the Moon, passed the signals along.',
}

function factsEn(g: ColonyGroup): Facts {
  const lastNote = g.building
    ? 'The third colony is still only a frame. When it is finished it will get hull plates and mirrors like the other two.'
    : g.point === 'L4' || g.point === 'L5'
      ? 'L4 and L5 each hold two colony groups.'
      : 'Things drift away from this point easily, so the whole group keeps correcting its position with small engines.'
  return {
    rows: [
      ['Where', POINT_EN[g.point]],
      ['Members', g.building ? 'Two cylinder colonies and the frame of a third' : `${g.count} cylinder colonies`],
      ['Size', 'Each about 16 km long and 4 km across (half the length of the Group 1 cylinders)'],
      ['Spin', 'Once every 1.5 minutes or so (1 g on the inner ground)'],
    ],
    fiction: true,
    notes: [
      'Colony Groups 1 to 7 are spread over the five Earth–Moon Lagrange points: two each at L4 and L5, one each at L1, L2 and L3.',
      'The only colony you can fly inside is Colony 1 of Group 1, at L5.',
      lastNote,
    ],
    real: [
      'Lagrange points are places where the pull of two bodies and the motion of orbiting balance out, so a small object can travel along with them in the same arrangement. The Earth–Moon pair has five.',
      'L4 and L5 are stable: something that drifts a little comes back. L1, L2 and L3 are unstable, so real spacecraft there keep correcting their position with small burns.',
      'Clouds of dust (the Kordylewski clouds) have been reported at Earth–Moon L4 and L5: first in 1961, with supporting observations by a Hungarian team in 2018. Scientists are still debating them.',
      'In 2018 China’s relay satellite Queqiao went to Earth–Moon L2 to pass along signals from Chang’e 4, which landed on the far side of the Moon.',
      'At Sun–Earth L1, SOHO (since 1995) watches the Sun and DSCOVR (since 2015) watches Earth’s day side. At Sun–Earth L2, the James Webb Space Telescope (launched 2021) observes the universe.',
    ],
    quiz: g.point === 'L2' ? relayQuizEn : g.point === 'L4' || g.point === 'L5' ? stableQuizEn : unstableQuizEn,
  }
}

export const SIDE_FACTS_EN: Record<string, Facts> = Object.fromEntries(COLONY_GROUPS.map((g) => [g.id, factsEn(g)]))

export const ENGINE_FACTS_EN: Record<string, Facts> = {
  [ENGINE_ROCK_ID]: {
    rows: [
      ['Size', 'A spinning-top-shaped rock about 30 km wide and 30 km tall'],
      ['Where', 'Between the orbits of Mars and Earth, creeping toward Earth over many years'],
      ['Equipment', 'A mining base, a domed living area, a ship dock and four plasma engines in a row'],
    ],
    fiction: true,
    notes: [
      'It shows a future plan to bring a whole asteroid home and mine it for metal and water.',
      'The engines blow out bluish-white plasma, pushing very gently for a very long time.',
      'It is wide and flat on top and narrows to a point underneath, like a spinning top. On top are a sharp rocky peak and a dome where the workers live. The engines sit in a row on the flat back face.',
      'Under the side rim: It has a ship dock. In observe mode (O), use Dock to fly to its mouth automatically. A ship is resting inside for repairs.',
    ],
    real: [
      'In the 2010s NASA studied the Asteroid Redirect Mission (ARM), which would have grabbed a boulder from an asteroid and moved it into orbit around the Moon. It was cancelled in 2017.',
      'Japan’s Hayabusa2 brought back sand from Ryugu (2020), and NASA’s OSIRIS-REx brought back sand from Bennu (2023): about 5 grams and about 120 grams.',
      'NASA’s Psyche probe is on its way to the asteroid Psyche, which may be made of metal. It should arrive in 2029.',
      'Moving an asteroid kilometres across is extremely hard. Today’s ion engines push about as hard as the weight of a sheet of paper (tens of millinewtons), so changing an orbit even a little takes years of pushing.',
    ],
    quiz: {
      question: 'Which asteroid did Hayabusa2 bring sand back from?',
      choices: ['Ryugu', 'Bennu', 'Psyche'],
      answer: 0,
      explanation: 'Hayabusa2 delivered sand from Ryugu to Earth in 2020. Bennu was OSIRIS-REx’s target, and Psyche is where the Psyche probe is heading.',
    },
  },
}
