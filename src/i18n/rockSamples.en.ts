import type { RockSamplesJa } from './rockSamples.ja'
import type { Translation } from './translation'

// The texts of data/rockSamples.ts (English). Same keys as rockSamples.ja.ts

export const rockSamplesEn: Translation<RockSamplesJa> = {
  mudstone: {
    name: 'Mudstone',
    note: 'Fine mud that settled at the bottom of water and hardened. Curiosity found rocks like this in Gale Crater, showing a lake once filled it.',
  },
  basalt: {
    name: 'Basalt',
    note: 'Dark rock from cooled volcanic lava. Much of Mars is made of it, and when it breaks down it becomes the red sand.',
  },
  blueberry: {
    name: 'Hematite "blueberries"',
    note: 'Millimetre-sized iron-rich spheres. Opportunity found them on Meridiani Planum; they formed where groundwater seeped through rock.',
  },
  vein: {
    name: 'Gypsum vein',
    note: 'White mineral that formed when water flowed through cracks and left dissolved salts behind — clear evidence of liquid water on Mars.',
  },
  meteorite: {
    name: 'Iron meteorite',
    note: 'A lump of iron and nickel that fell from space. Mars rovers have come across several meteorites like this.',
  },
  anorthosite: {
    name: 'Anorthosite',
    note: 'The rock of the bright lunar highlands. Light crystals floated to the top of the young Moon\'s magma ocean and hardened.',
  },
  'mare-basalt': {
    name: 'Mare basalt',
    note: 'The dark lunar "seas" are lava that flooded out 3–4 billion years ago. Apollo 11 brought this rock home.',
  },
  breccia: {
    name: 'Breccia',
    note: 'Broken rock fragments welded back together by meteorite impacts — a record of the Moon\'s violent history.',
  },
  'orange-soil': {
    name: 'Orange glass beads',
    note: 'Tiny glass beads from ancient fire fountains. Apollo 17 astronauts were amazed to find this orange soil.',
  },
  sandstone: {
    name: 'Red sandstone',
    note: 'The sandstone of Monument Valley\'s buttes: desert sand turned to stone, coloured red by iron oxide.',
  },
  shale: {
    name: 'Shale',
    note: 'Mud hardened in thin layers. Fossils of ancient life are often found in rocks like this.',
  },
  quartz: {
    name: 'Quartz',
    note: 'One of the most common minerals in Earth\'s crust. Clear crystals of it are called rock crystal.',
  },
  'venus-basalt': {
    name: 'Scorched basalt',
    note: 'Venus\'s surface is 460 °C. Soviet Venera landers analysed basalt like this on the ground.',
  },
  'mercury-crust': {
    name: 'Sulfur-rich crust',
    note: 'NASA\'s MESSENGER found surprisingly high sulfur and other volatile elements in Mercury\'s crust.',
  },
  sulfur: {
    name: 'Sulfur crust',
    note: 'Io is the most volcanically active world in the Solar System. Its yellows and reds are sulfur compounds from the eruptions.',
  },
  ice: {
    name: 'Water-ice bedrock',
    note: 'At these temperatures water ice is as hard as rock. Some icy moons are thought to hide oceans beneath.',
  },
  salt: {
    name: 'Reddish salt streak',
    note: 'Coloured streaks along cracks in the ice — perhaps salts that rose from an ocean below.',
  },
  'titan-pebble': {
    name: 'Ice pebble',
    note: 'Rounded pebbles like those seen by the Huygens probe: rock-hard water ice, worn smooth by methane rivers.',
  },
  'regolith-rock': {
    name: 'Surface rock',
    note: 'A fragment broken off by impacts. Its surface slowly darkens under radiation from space.',
  },
}
