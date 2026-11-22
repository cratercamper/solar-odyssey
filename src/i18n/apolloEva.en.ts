import type { apolloEvaJa } from './apolloEva.ja'
import type { Translation } from './translation'

// The texts of the Apollo 17 chapter 7 (Moon walks and lift-off). Same keys as apolloEva.ja.ts

export const apolloEvaEn: Translation<typeof apolloEvaJa> = {
  chapter: 'Chapter 8 · Exploring the Moon',
  boarding: 'Climbing onto the Rover…',
  titleCard: ['Exploring the Moon', 'December 11, 1972 · Taurus–Littrow valley', 'Commander Cernan and Dr. Schmitt drove the lunar rover across the valley'] as [string, string, string],
  keysHint: 'W/↑ drive · S/↓ reverse · A D/← → steer · V commander’s eyes / outside',
  toSeat: '◉ Commander’s eyes',
  toChase: '◎ View from outside',
  badge: 'LRV',
  crew: 'Crew',
  crewValue: 'Cernan · Schmitt',
  battery: 'Battery',
  evaNo: (n: number) => `Moonwalk ${n} of 3`,
  evaLength: ['7 h 12 min', '7 h 37 min', '7 h 15 min'],
  next: 'Next stop',
  backToLm: 'Back to the lunar module Challenger',
  parkHint: 'Park about 100 m east of the lander so the TV camera faces it',
  distance: (km: string) => `${km} to go`,
  left: 'to the left',
  right: 'to the right',
  ahead: 'straight ahead',
  behind: 'behind you',
  skip: '⏩ Skip the drive',
  skipTip: 'The real Rover drove at about 10 km/h. This jumps to just before the stop',
  arrived: 'Arrived!',
  take: '🪨 Collect a sample',
  goNext: 'Next stop',
  goBack: 'Back to the lander',
  sampleLabel: 'Sample collected',
  samples: {
    st1: {
      title: 'Basalt from the valley floor',
      lines: [
        'The valley floor is dark basalt: lava that flowed out about 3.7 billion years ago and cooled.',
        'On the first moonwalk the crew unfolded the Rover and set up the science station (ALSEP) with its seismometers before driving here.',
      ],
    },
    st4: {
      title: '74220 · the orange soil',
      lines: [
        'The orange colour comes from glass beads about 0.1 mm across: spray from volcanic fountains on the Moon about 3.6 billion years ago that cooled in flight.',
        'It proved the Moon once had volcanoes. Sample 74220 is still being studied around the world.',
      ],
    },
    st6: {
      title: 'A piece of Tracy’s Rock',
      lines: [
        'A house-sized boulder that rolled down from the North Massif. It is rock melted by a giant impact, frozen about 3.9 billion years ago.',
        'The Rover could carry about 490 kg: two astronauts and their cargo. On Earth it weighs 210 kg; in the Moon’s gravity it weighs as much as 35 kg would on Earth.',
      ],
    },
  },
  closeoutTitle: 'Leaving the Moon',
  closeoutLines: [
    'December 14, 1972. Before climbing the ladder, Commander Cernan spoke his last words on the Moon in front of the TV camera.',
    'For more than 50 years since, nobody has walked on the Moon.',
  ],
  watch: '🚀 Watch the lift-off (17 hours later)',
  liftoffCap: 'Seen from the Rover’s TV camera. In Houston, Ed Fendell panned the camera from Earth to follow it',
  liftoffNote: 'Only the top half flies; the bottom half is its launch pad',
  doneTitle: 'End of chapter 8',
  doneLines: [
    'Over three moonwalks the crew spent about 22 hours outside and drove about 36 km in the Rover.',
    'They brought back about 111 kg of rock and soil, still used in research today.',
    'Next, Evans is waiting for them aboard the mothership America in lunar orbit.',
  ],
  toReturn: 'Next: chapter 9, back to the mothership and home',
  again: 'Play again',
  end: 'End the mission',
}
