import type { Apollo17Ja } from './apollo17.ja'
import type { Translation } from './translation'

// The texts of data/apollo17.ts (English). Same keys as apollo17.ja.ts

export const apollo17En: Translation<Apollo17Ja> = {
  lm: {
    name: 'Challenger, the descent stage',
    when: 'Landed 11 December 1972',
    story: 'The lander that carried commander Eugene Cernan and geologist Harrison Schmitt. To go home, only the top half flew off, using this bottom half as its launch pad, so the descent stage is still here. A plaque on the ladder leg reads: "Here Man completed his first explorations of the Moon, December 1972 AD. May the spirit of peace in which we came be reflected in the lives of all mankind."',
  },
  flag: {
    name: 'The flag',
    when: 'First moonwalk',
    story: 'The American flag planted next to the lander. Photos from the Lunar Reconnaissance Orbiter still show its shadow today. After more than 50 years of harsh sunlight with no air to filter it, its colours have probably faded to almost white.',
  },
  lrv: {
    name: 'The lunar rover',
    when: 'About 36 km over three moonwalks',
    story: 'A two-seat electric car that drove about 36 km around this valley, at up to about 18 km/h. On the first moonwalk Cernan caught a fender with his hammer and broke it, and dust sprayed everywhere. The crew fixed it with four map pages, tape and clamps. At the end it was parked here, and its TV camera sent pictures of the lander lifting off back to Earth.',
  },
  alsep: {
    name: 'ALSEP science station',
    when: 'Set up on the first moonwalk',
    story: 'An unmanned station powered by a nuclear battery. Until 1977 it sent back measurements of the heat flowing out of the Moon, its very thin "atmosphere", flying dust and ground shaking. The crew also left eight small explosive charges; after they left, a signal from Earth set them off, and the shaking revealed what lies under the valley.',
  },
  st1: {
    name: 'Station 1, Steno crater',
    when: 'First moonwalk',
    story: 'The only stop of the first moonwalk. The crew collected rocks and soil at the crater rim and left explosive charge number 6 here for the seismic experiment.',
  },
  st2: {
    name: 'Station 2, foot of the South Massif',
    when: 'Second moonwalk',
    story: 'About 7.4 km from the lander, the farthest Apollo 17 went. The crew studied big boulders that had rolled down the South Massif, a mountain over 2 km high. Mountain rocks like these date from soon after the Moon formed.',
  },
  st3: {
    name: 'Station 3, Lara crater',
    when: 'Second moonwalk',
    story: 'This spot sits on the "light mantle", a landslide that poured off the South Massif long ago and spread bright soil kilometres across the valley floor.',
  },
  st4: {
    name: 'Station 4, Shorty crater',
    when: 'Second moonwalk',
    story: 'On the grey Moon, Schmitt shouted that there was orange soil here. It turned out to be tiny glass beads sprayed out by a volcanic eruption about 3.6 billion years ago, proof that the Moon once had volcanoes.',
  },
  st5: {
    name: 'Station 5, Camelot crater',
    when: 'Second moonwalk',
    story: 'Big dark basalt boulders litter the rim of this crater. They are lava that once flooded and filled the valley, dug back up by an impact.',
  },
  st6: {
    name: "Station 6, Tracy's Rock",
    when: 'Third moonwalk',
    story: "A house-sized boulder that rolled down the North Massif and split into pieces. Cernan called it Tracy's Rock after his daughter. The track it left rolling down the slope is still visible above it.",
    photoCaption: 'Schmitt beside the boulder. Behind him is the valley back to the lunar module, the ground you drove across in this game.',
    photoCredit: 'Photo: NASA (Eugene Cernan, AS17-140-21493 + 21497 joined), public domain, via Wikimedia Commons',
  },
  st7: {
    name: 'Station 7, foot of the North Massif',
    when: 'Third moonwalk',
    story: 'Another boulder at the foot of the North Massif. Sampling the mountain in several places lets geologists compare how it formed.',
  },
  st8: {
    name: 'Station 8, Sculptured Hills',
    when: 'Third moonwalk',
    story: 'The foot of the lumpy Sculptured Hills, which look different from the North and South Massifs. The crew collected rocks here to learn how they formed.',
  },
  st9: {
    name: 'Station 9, Van Serg crater',
    when: 'Third moonwalk, the last stop',
    story: 'The last stop of Apollo 17. This dark crater was thought to be volcanic, but it turned out to be soil crushed and welded by an impact. Charge number 5 was left here too. Then the crew went back to the lander, and Cernan became the last person to walk on the Moon.',
  },
}
