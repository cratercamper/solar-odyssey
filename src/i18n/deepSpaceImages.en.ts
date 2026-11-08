import type { DeepSpaceImagesJa } from './deepSpaceImages.ja'
import type { Translation } from './translation'

// The texts of data/deepSpace.ts (English). Same keys as deepSpaceImages.ja.ts

export const deepSpaceImagesEn: Translation<DeepSpaceImagesJa> = {
  'hubble-andromeda': {
    name: 'Andromeda Galaxy',
    kind: 'Galaxy (our Milky Way’s neighbor)',
    distance: 'About 2.5 million light-years',
    lookback: 'About 2.5 million years ago, around when our human ancestors began using stone tools.',
    notes: [
        'A big spiral galaxy right next to our Milky Way. Under a dark sky you can even see it faintly with your own eyes.',
        'This picture of part of the galaxy was stitched together from hundreds of shots. More than 100 million individual stars are in it.',
        'The bright area on the left is the center of the galaxy. Farther right is the outer part, with lanes of dust and clusters of young blue stars.',
      ],
  },
  'hubble-pillars': {
    name: 'Pillars of Creation (Eagle Nebula)',
    kind: 'A cloud where stars are born',
    distance: 'About 6,500 light-years',
    lookback: 'About 6,500 years ago, when people were first starting to make tools from metal.',
    notes: [
        'These pillars are made of gas and dust. The tallest is about 4 light-years long (even light takes 4 years to cross it).',
        'Inside the pillars, gravity is pulling gas together and new stars are being born.',
        'In visible light, the dust blocks the light, so you can hardly see inside the pillars.',
      ],
  },
  'hubble-crab': {
    name: 'Crab Nebula',
    kind: 'What is left after a star exploded (a supernova)',
    distance: 'About 6,500 light-years',
    lookback: 'About 6,500 years ago. The light of this explosion reached Earth in the year 1054.',
    notes: [
        'This is the gas thrown out when a heavy star exploded at the end of its life (a supernova).',
        'Chinese records tell of a star that appeared in 1054, bright enough to see in daytime. Japanese records mention it too, copied into the poet Fujiwara no Teika’s diary.',
        'At its center is a tiny, very heavy star (a neutron star) that spins about 30 times a second.',
      ],
  },
  'hubble-sombrero': {
    name: 'Sombrero Galaxy',
    kind: 'Galaxy',
    distance: 'About 28 million light-years',
    lookback: 'About 28 million years ago, roughly 40 million years after the dinosaurs died out.',
    notes: [
        'It is named after the sombrero, a wide-brimmed Mexican hat, because it looks like one.',
        'The dark band is a ring of dust around the galaxy’s edge. We are seeing it almost exactly edge-on.',
        'At its center there is thought to be a black hole about a billion times as heavy as the Sun.',
      ],
  },
  'hubble-udf': {
    name: 'Hubble Ultra Deep Field',
    kind: 'Deep space',
    distance: 'The farthest galaxies: about 13 billion light-years',
    lookback: 'The light from the farthest galaxies left about 13 billion years ago, when the universe was only about 800 million years old.',
    notes: [
        'Hubble stared at a tiny patch of sky that looks empty (about a tenth the width of the full Moon) for a total of about 11 days.',
        'The dots and swirls of light are not stars: almost all of them are galaxies. About 10,000 galaxies are in this picture.',
        'The farther away a galaxy is, the further back in time we are seeing it, as it was when its light set out.',
      ],
  },
  'webb-deepfield': {
    name: 'Webb’s First Deep Field',
    kind: 'Deep space (galaxy cluster SMACS 0723)',
    distance: 'The cluster in front: about 4.6 billion light-years',
    lookback: 'The light from the cluster in front left about 4.6 billion years ago, just when Earth was forming. Galaxies more than 13 billion years old are behind it.',
    notes: [
        'This patch of sky is about the size of a grain of sand held at arm’s length. Webb took the picture in about 12 and a half hours.',
        'The gravity of the cluster in front bends light like a lens, stretching faraway galaxies behind it into arcs (gravitational lensing).',
        'It was the first picture Webb released, in July 2022.',
      ],
  },
  'webb-pillars': {
    name: 'Pillars of Creation (Eagle Nebula)',
    kind: 'A cloud where stars are born',
    distance: 'About 6,500 light-years',
    lookback: 'About 6,500 years ago, when people were first starting to make tools from metal.',
    notes: [
        'Webb photographed the same pillars Hubble did, this time in infrared.',
        'Infrared passes through dust more easily, so many more stars beyond the pillars show up.',
        'The red dots and wavy lines along the edges are gas blown out by stars that are still being born.',
      ],
  },
  'webb-cliffs': {
    name: 'Carina Nebula “Cosmic Cliffs”',
    kind: 'A cloud where stars are born',
    distance: 'About 7,600 light-years',
    lookback: 'About 7,600 years ago, when farming was spreading around the world.',
    notes: [
        'It looks like mountains at sunset, but it is the edge of a cloud of gas and dust. The tallest “peak” is about 7 light-years high.',
        'In the part that looks like blue sky above, strong light and winds from hot young stars outside the cloud are wearing it away.',
        'In infrared, hundreds of newborn stars that were hidden inside the cloud appear.',
      ],
  },
  'webb-stephan': {
    name: 'Stephan’s Quintet',
    kind: 'A group of galaxies',
    distance: 'About 290 million light-years',
    lookback: 'About 290 million years ago, before the first dinosaurs appeared.',
    notes: [
        'Five galaxies seem to be together, but the one on the left is actually much closer (about 40 million light-years) and just happens to line up.',
        'The other four are pulling on each other with gravity and colliding.',
        'It is one of Webb’s biggest pictures, stitched together from about 1,000 images.',
      ],
  },
}
