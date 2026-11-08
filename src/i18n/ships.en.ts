import type { ShipsJa } from './ships.ja'
import type { Translation } from './translation'

// The texts of data/ships.ts, data/shipParts.ts (English). Same keys as ships.ja.ts

export const shipsEn: Translation<ShipsJa> = {
  sv01: {
    name: 'Solar Voyager',
    kind: 'Survey vessel',
    blurb: 'The flagship: a saucer and two nacelles. A well-balanced ship.',
    parts: {
      saucer: {
        name: 'Saucer section',
        text: 'In the story, this is where the crew live and work. It is about 390 m across. A disc shape gives lots of room inside with less outer hull.',
      },
      bridge: {
        name: 'Bridge',
        text: 'The room where the ship is commanded, on top of the saucer with a good view. The white light flashing above it is an anti-collision light.',
      },
      name: {
        name: 'Ship name',
        text: '“SV-01 SOLAR VOYAGER”: an original name meaning a ship that travels (voyager) the solar system. It is a nod to the Voyager probes.',
      },
      strobe: {
        name: 'Anti-collision strobes',
        text: 'They flash white twice at a time. Airplanes have these lights on their wing tips and tails too, so others can spot them from far away.',
      },
      navlights: {
        name: 'Navigation lights',
        text: 'Red on the left edge of the saucer, green on the right. Like on airplanes and ships, they tell others passing by which way you are facing.',
      },
      impulse: {
        name: 'Sublight engines',
        text: 'Imaginary engines for traveling slower than light (the parts glowing red). Real spacecraft use engines like Hayabusa’s ion engines, which speed up a little at a time over a long time.',
      },
      deflector: {
        name: 'Forward dish',
        text: 'An imaginary device that pushes dust and pebbles out of the way. At very high speed, even a single grain of sand would hit hard.',
      },
      secondary: {
        name: 'Engineering hull',
        text: 'In the story, this holds the engines and power systems. A neck connects it to the saucer.',
      },
      nacelle: {
        name: 'Nacelles (drive)',
        text: 'The two long pods on the sides, for an imaginary drive that moves by bending space itself. Physicist Miguel Alcubierre described a theoretical version in 1994, but it would need a kind of matter nobody has found yet.',
      },
      collector: {
        name: 'Collectors (red glow at the front)',
        text: 'An imaginary device based on the idea of scooping up the thin hydrogen drifting in space for fuel (the “ramjet” proposed by physicist Robert Bussard in 1960).',
      },
      coil: {
        name: 'Drive coils (blue glow)',
        text: 'The parts glowing blue in the grooves along the nacelles. They shine brighter when the ship gets ready to warp.',
      },
      bay: {
        name: 'Shuttle bay',
        text: 'The door at the back of the engineering hull. In the story, small craft launch and land here.',
      },
    },
  },
  heron: {
    name: 'White Heron',
    kind: 'Survey carrier',
    blurb: 'A white carrier whose two long forward "legs" hold small survey craft. It has no weapons.',
    parts: {
      legs: {
        name: 'Legs (hangars and launch decks)',
        text: 'In the story, each leg holds a hangar for small survey craft. The glowing line on top is a launch rail (catapult). Real aircraft carriers use catapults too, to launch planes from a short deck.',
      },
      bay: {
        name: 'Launch bay',
        text: 'The open mouth at the tip of each leg. You can see the hangar lights inside. Survey craft fly out forward here and come back the same way.',
      },
      bridge: {
        name: 'Bridge',
        text: 'The command room sits on the tall tower on the ship’s back. The parts sticking out to each side are bridge wings for looking outside directly, just like on real ships.',
      },
      sensors: {
        name: 'Antennas and sensors',
        text: 'The mast and small dish on top are for radio and observation. Real space probes also carry a dish (a high-gain antenna) to talk to Earth.',
      },
      engines: {
        name: 'Main engines',
        text: 'Two bell-shaped nozzles on each engine block at the back. Real rocket nozzles have this shape too: it lets the gas expand and shoot out faster.',
      },
      wings: {
        name: 'Wings and tail fins',
        text: 'Space has no air, so a ship does not really need wings. On this ship they double as radiators to shed heat, and steady the ship near worlds with air.',
      },
    },
  },
  sorakaze: {
    name: 'Sorakaze',
    kind: 'Light-sail courier',
    blurb: 'A small ship that spins six long, thin sails and is pushed along by sunlight. Light and nimble.',
    parts: {
      blades: {
        name: 'Light sails',
        text: 'Light gives a tiny push to whatever it hits. Thin mirror sails gather that push. In 2010 Japan’s IKAROS became the first spacecraft to travel through space on sunlight. Its sail was only 0.0075 mm thick.',
      },
      hub: {
        name: 'Sail hub',
        text: 'The sails turn slowly, and the spin keeps them stretched tight. This design is called a heliogyro, and NASA has studied it. IKAROS also spun to unfold its sail.',
      },
      capsule: {
        name: 'Crew module',
        text: 'A small module for a crew of two. The ship carries almost no fuel, so it can be very light.',
      },
      panels: {
        name: 'Solar panels and radiators',
        text: 'Panels that make power and get rid of extra heat. There is no air in space to cool things, so heat is thrown away as light (infrared).',
      },
      ion: {
        name: 'Ion thrusters',
        text: 'Small engines for turning and fine speed changes. In real life, Japan’s Hayabusa and Hayabusa2 used ion engines to reach asteroids.',
      },
    },
  },
  hakobune: {
    name: 'Hakobune',
    kind: 'Heavy freighter',
    blurb: 'A big freighter: a long frame packed with cargo containers, pushed by a fusion rocket at the back. It turns slowly and steadily.',
    parts: {
      cab: {
        name: 'Command module',
        text: 'Where the crew live and fly the ship. The yellow-and-black stripes at the front mark the docking port where it links to other ships and stations.',
      },
      cargo: {
        name: 'Cargo containers',
        text: 'Packing goods into boxes of one size is the same idea as cargo ships on Earth. Loading is fast, and every port can handle them with the same tools.',
      },
      radiators: {
        name: 'Radiators',
        text: 'Big panels that shed the reactor’s heat into space. The International Space Station also has large white radiators.',
      },
      reactor: {
        name: 'Fusion reactor and shield',
        text: 'In the story, the reactor makes energy by fusion, like the Sun. The gold plate in front shields the crew and cargo from radiation. Real fusion reactors are still being researched on Earth.',
      },
      nozzle: {
        name: 'Magnetic nozzle',
        text: 'Very hot gas (plasma) would melt any metal. So ring-shaped electromagnets make a magnetic field that pushes the plasma out the back without touching it.',
      },
    },
  },
  meguri: {
    name: 'Meguri',
    kind: 'Ring-ship explorer',
    blurb: 'A long-voyage ship whose ring of ten modules spins to make gravity on the floors. It carries two landers.',
    parts: {
      ring: {
        name: 'Spinning ring',
        text: 'When the ring, about 90 m across, turns once every 13.5 seconds, the outer floor feels like Earth’s gravity (1 g). It uses the push you feel toward the outside of a turning ride in place of gravity. Long stays without gravity weaken bones and muscles, so real scientists study this idea too.',
      },
      modules: {
        name: 'Crew and service modules',
        text: 'The white modules with rows of windows are crew quarters; the grey ones with gold insulation hold machines for water, air and power. They alternate so the ring stays balanced.',
      },
      hub: {
        name: 'Hub and spokes',
        text: 'The central spine does not turn; only the hub around it spins on bearings. The spokes are corridors, and you feel heavier the farther out you go.',
      },
      landers: {
        name: 'Landers',
        text: 'One above the spine and one below, docked belly-in. They are the 24 m, 12-crew landers that every ship uses. The four legs stay folded while docked and unfold to land on planets and moons.',
      },
      cab: {
        name: 'Command module',
        text: 'The non-spinning module at the front of the spine, with the flight deck and a docking port at the nose.',
      },
      engines: {
        name: 'Engines and radiators',
        text: 'Three nozzles at the back push the ship; the side panels shed the engines’ heat into space.',
      },
    },
  },
  amatsu: {
    name: 'Amatsukaze',
    kind: 'Ocean-hull starship',
    blurb: 'An observation starship shaped like a great ocean ship: silver hull, deep red bottom, a slim bridge tower with layered eaves, big engine at the stern. Its deck carries brass observatory domes instead of guns.',
    parts: {
      hull: {
        name: 'Hull',
        text: 'The hull is shaped like an ocean ship. In space there is no water or air, so a ship does not need this shape. In the story it can land on a sea, float, and be checked in harbour. The red bottom is the colour of the paint real ships use to keep shellfish and seaweed off.',
      },
      telescope: {
        name: 'Bow telescope',
        text: 'The round mouth at the bow is the opening of a big telescope. The whole ship turns to aim it at distant stars and galaxies. The Hubble Space Telescope also turns its whole body to point.',
      },
      domes: {
        name: 'Observatory domes',
        text: 'The round roofs on deck are observatories. A slot opens and the telescope inside looks at the sky, just like observatories on Earth.',
      },
      bridge: {
        name: 'Bridge tower',
        text: 'The command room is at the top of the tapering tower, behind the band of windows. The higher you are, the farther you can see, which is why ocean ships build tall bridges too.',
      },
      stack: {
        name: 'Heat stack',
        text: 'Where an ocean ship has its funnel, this ship has a tower that sheds engine heat. Space has no air to cool things, so heat is thrown away as light (infrared).',
      },
      engine: {
        name: 'Main engine',
        text: 'One big nozzle at the stern and small helpers on each side. The big one pushes the ship; the small ones fine-tune direction and speed.',
      },
    },
  },
  arcadia: {
    name: 'Arcadia',
    kind: 'Mobile carrier',
    blurb: 'A 1,200 m carrier. The launch deck runs between its two forward prongs and can send out a lander (L key or the Launch button). White armour, red keel, a tall stepped bridge.',
    parts: {
      prongs: {
        name: 'Twin prongs and launch deck',
        text: 'The launch deck runs between the two long forward prongs. Landers and small craft are pushed along rails and fly out past the blue guide lights. Real aircraft carriers also use catapults to get planes up to speed on a short deck.',
      },
      bridge: {
        name: 'Bridge tower',
        text: 'The ship is commanded from the top of the stepped tower. The long tubes reaching forward on each side are sensor arms that watch for other ships and asteroids.',
      },
      pods: {
        name: 'Hangar pods',
        text: 'The hexagonal tubes on each flank are hangars. Small craft are shot out through the tip of the dark cone at the front. In the story it carries 1,800 craft.',
      },
      wings: {
        name: 'Red-edged wings',
        text: 'The upswept wings do not catch air in space. They are radiators and antenna mounts: in space heat can only be thrown away as light (infrared), so wide surfaces help.',
      },
      engine: {
        name: 'Main engines',
        text: 'Inside the dark shroud at the stern are four big nozzles, with two helper nozzles below. A heavy ship needs many nozzles pushing together.',
      },
    },
  },
}
