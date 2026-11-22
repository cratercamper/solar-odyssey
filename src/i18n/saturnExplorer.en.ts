// Saturn V field guide (the look-around before launch, components/moonMission/SaturnExplorer.tsx) and the time-lapse to launch night

import type { saturnExplorerJa } from './saturnExplorer.ja'

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const saturnExplorerEn: typeof saturnExplorerJa = {
  title: 'Take a look at the Saturn V',
  where: 'Kennedy Space Center, Pad 39A · the evening of 20 November 1972',
  hint: 'Drag to turn, scroll to move in. Touch a glowing dot to see inside',
  hintTouch: 'Drag to turn, pinch to move in. Touch a glowing dot to see inside',
  cut: 'Cutaway',
  size: 'Size check',
  toNight: 'On to launch night ▶',
  whole: 'Whole rocket',
  skip: 'Skip ▶▶',
  sizeNote: 'Next to a person (1.8 m)… the Saturn V stands 111 m tall, like a 36-storey building',
  clock: (y, mo, d, h, mi) => `${MONTH[mo]} ${d}, ${y} · ${((h + 11) % 12) + 1}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`,
  zone: 'US Eastern Time',
  daysLeft: (n) => (n > 0 ? `${n} day${n === 1 ? '' : 's'} to launch` : 'Launch night'),
  dusk: 'The sun sets and the floodlights come on. A full moon rises in the east',
  waning: 'Each night the moon rises later and grows thinner',
  launchNight: '12:33 AM, 7 December 1972. A moonless night',
  parts: {
    les: {
      name: 'Launch escape tower',
      fact: '10 m tall',
      lines: ['If anything went wrong, its solid rocket would pull the command module and crew away to safety.', 'When it is not needed, it is thrown away after the second stage lights.'],
    },
    csm: {
      name: 'Command and service modules',
      fact: 'Command module "America"',
      lines: ['The cone-shaped command module carries the crew of three; the service module has the engine, fuel, oxygen and power.', 'During launch a white cover protects the command module.', 'Only the command module comes back to Earth.'],
    },
    lm: {
      name: 'Lunar module',
      fact: 'Lunar module "Challenger"',
      lines: ['It rides with its legs folded, inside an adapter.', 'On the way to the Moon the command module turns around and pulls it out (chapter 3).', 'It takes two astronauts down to a lunar valley and back up to orbit.'],
    },
    iu: {
      name: 'Instrument unit',
      fact: '0.9 m tall · 6.6 m across',
      lines: ['The brain of the whole rocket: a guidance computer and gyros measure direction and speed.', 'It swivels the engines bit by bit to keep the rocket on its planned path.'],
    },
    s3: {
      name: 'Third stage (S-IVB)',
      fact: '18 m tall · one J-2 engine',
      lines: ['It finishes the climb to Earth orbit, then lights again to send the ship to the Moon (chapter 2).', 'Inside: liquid hydrogen (−253 °C) and liquid oxygen (−183 °C). So cold that frost forms outside.'],
    },
    s2: {
      name: 'Second stage (S-II)',
      fact: '25 m tall · five J-2 engines',
      lines: ['It pushes the ship from about 70 km up to about 170 km, the edge of space.', 'Liquid hydrogen is very light, so it fills the big upper tank.', 'A single wall separates it from the liquid oxygen below.'],
    },
    s1: {
      name: 'First stage (S-IC)',
      fact: '42 m tall · 10 m across',
      lines: ['Kerosene (RP-1) below, liquid oxygen above: over 2,000 tonnes burned in two and a half minutes.', 'The oxygen flows down to the engines through five pipes that run through the kerosene tank.'],
    },
    f1: {
      name: 'F-1 engines',
      fact: '5.6 m tall · five of them',
      lines: ['Still the most powerful single-chamber rocket engine ever built.', 'Together the five could lift about 3,400 tonnes.', 'Each nozzle is 3.7 m wide, twice the height of a person.'],
    },
  },
}
