import type { ChaptersJa, MissionsJa } from './missions.ja'
import type { Translation } from './translation'

// Story mode text (English). Same ids and order as missions.ja.ts. The narrator is the ship's navigation AI, NAVI.

export const missionsEn: Translation<MissionsJa> = {
  'moon-supply': {
    title: 'Supplies for the Moon base',
    client: 'Tranquility Station, Moon base',
    briefing: [
      'Welcome aboard, Captain. I am NAVI, this ship’s navigation AI.',
      'Our first mission is to deliver food and water to the Moon base. The Moon is about 384,000 km from Earth: 1.3 seconds for light, and about 3 days for the Apollo spacecraft.',
    ],
    steps: [
      {
        goal: 'Head to the Moon',
        start: 'I have set the Moon as our target. Press Warp (Enter) to jump there, or use autopilot (G). You can also fly there yourself.',
        done: 'We have reached the Moon. The Moon always shows the same face to Earth, because it takes the same 27 days to spin once and to circle Earth once.',
      },
      {
        goal: 'Stay near the Moon and unload',
        start: 'Please stay close to the Moon while we unload the cargo.',
        done: 'Unloading complete! The Moon’s gravity is about one sixth of Earth’s. A 60 kg package feels like about 10 kg there.',
      },
    ],
    summary: ['The Moon is about 384,000 km away: 1.3 seconds at the speed of light.', 'The Moon spins once and orbits once in the same 27 days, so the same face always points at Earth.', 'The Moon’s gravity is about one sixth of Earth’s.'],
    quiz: [
      {
        question: 'About how strong is the Moon’s gravity compared with Earth’s?',
        choices: ['Twice as strong', 'Half', 'One sixth'],
        answer: 2,
        explanation: 'The Moon is small and light, so its gravity is about one sixth of Earth’s. Astronauts bounced as they walked on it.',
      },
      {
        question: 'Why do we always see the same side of the Moon from Earth?',
        choices: ['The Moon does not spin', 'The Moon spins once in the same time it takes to orbit Earth', 'The far side is always dark'],
        answer: 1,
        explanation: 'The Moon spins once in about 27 days and orbits Earth in the same 27 days, so it always faces us the same way. The far side has day and night too.',
      },
    ],
  },

  'mars-parts': {
    title: 'Parts for the Mars base',
    client: 'Mars research base',
    briefing: [
      'The Mars research base is short of parts for its water-making machine. Let’s deliver them.',
      'A real rocket takes about 7 months to reach Mars, and the best “launch window”, when Earth and Mars line up well, comes only about once every 26 months.',
    ],
    steps: [
      {
        goal: 'Head to Mars',
        start: 'I have set Mars as our target.',
        done: 'We have reached Mars. It looks red because its sand and rocks contain a lot of rust (iron oxide).',
      },
      {
        goal: 'Stay near Mars and unload the parts',
        start: 'Please stay close to Mars while we unload the parts.',
        done: 'Parts delivered! Mars has the tallest mountain in the solar system, Olympus Mons, about 22,000 m high, roughly six times Mount Fuji.',
      },
      {
        goal: 'Observe the moon Phobos (stay close)',
        start: 'Before we leave, let’s study Mars’s moon Phobos. I have set it as our target. The scan starts when we get close.',
        done: 'Scan complete. Phobos is slowly getting closer to Mars. In 30 to 50 million years Mars’s gravity may break it apart into a ring.',
      },
    ],
    summary: ['Mars is about 7 months away, and the launch window comes about every 26 months.', 'Mars is red because of rusty sand and rocks.', 'The moon Phobos is slowly getting closer to Mars.'],
    quiz: [
      {
        question: 'Why does Mars look red?',
        choices: ['Its surface is very hot', 'Its sand and rocks contain a lot of rust', 'It is covered in red plants'],
        answer: 1,
        explanation: 'Mars’s sand and rocks contain a lot of iron oxide (rust), which gives them a reddish color.',
      },
      {
        question: 'How often does a good launch window from Earth to Mars come around?',
        choices: ['Every month', 'About every 26 months', 'About every 100 years'],
        answer: 1,
        explanation: 'Earth and Mars circle the Sun at different speeds, so they line up well only about once every 26 months (2 years and 2 months).',
      },
    ],
  },

  'asteroid-deflect': {
    title: 'Nudge the asteroid',
    client: 'Asteroid Watch Center, Earth',
    briefing: [
      'A small asteroid heading our way has been found. It is not dangerous right now, but decades from now its path crosses Earth’s.',
      'Real space agencies work on this problem too. In 2022, NASA’s DART spacecraft crashed into the asteroid Dimorphos and successfully changed its orbit.',
      'This time we will warm the asteroid’s surface with our beam, so the gas that shoots out gives it a small push and moves its path.',
    ],
    steps: [
      {
        goal: 'Head to Earth',
        start: 'I have set Earth as our target. We will look for the asteroid near Earth.',
        done: 'We have reached Earth... I see the asteroid nearby!',
      },
      {
        goal: 'Hit the asteroid with the beam to change its path',
        start:
          'I have set the asteroid as our target. Get close, aim, and fire the beam (F key or click, or the beam button on a phone). The orange dotted line shows where it is heading now.',
        hits: ['Hit! Gas is shooting out and its path has shifted a little.', 'Again! The dotted line is nearing the edge of Earth.', ''],
        done: 'Its path now misses Earth! The asteroid will pass by safely. The earlier we find one, the smaller the push we need.',
      },
    ],
    summary: ['A small push can change an asteroid’s path. The earlier we find it, the smaller the push.', 'In 2022, the DART spacecraft really did change an asteroid’s orbit.', 'Telescopes around the world watch for asteroids that come near Earth.'],
    quiz: [
      {
        question: 'What matters most when steering an asteroid away from Earth?',
        choices: ['Finding it as early as possible', 'Making the biggest explosion possible', 'Waiting until it gets very close'],
        answer: 0,
        explanation: 'While it is far away, a tiny push adds up to a big miss by the time it reaches Earth. That is why people watch for asteroids all around the world.',
      },
      {
        question: 'What did the DART spacecraft do in 2022?',
        choices: ['Landed on an asteroid and brought back rocks', 'Crashed into an asteroid and changed its orbit', 'Smashed an asteroid to pieces'],
        answer: 1,
        explanation: 'DART hit the asteroid Dimorphos at about 6 km per second and shortened the time it takes to circle its parent asteroid by about 32 minutes. Japan’s Hayabusa and Hayabusa2 were the ones that brought back rocks.',
      },
    ],
  },

  'jupiter-cargo': {
    title: 'Instruments for Jupiter’s moon',
    client: 'Ganymede Observatory',
    briefing: [
      'We are delivering new instruments to the observatory on Ganymede, Jupiter’s moon. Ganymede is the largest moon in the solar system, bigger than the planet Mercury.',
      'Real spacecraft save fuel by borrowing a planet’s gravity to change speed and direction. This is called a gravity assist, or swing-by. Let’s try one at Jupiter.',
    ],
    steps: [
      {
        goal: 'Head to Jupiter',
        start: 'I have set Jupiter as our target. Warp when ready.',
        done: 'We have reached Jupiter, the largest planet in the solar system. More than 1,300 Earths would fit inside it.',
      },
      {
        goal: 'Skim just above Jupiter’s clouds (swing-by)',
        start: 'Fly down toward Jupiter’s clouds yourself. Once your height drops to about Jupiter’s radius, the swing-by is a success. The ship slows down as you get closer.',
        done: 'Swing-by complete! Passing close to a planet lets its gravity change your speed and direction without using fuel. Voyager used this trick to travel from Jupiter to Saturn.',
      },
      {
        goal: 'Head to Ganymede',
        start: 'I have set Ganymede as our target.',
        done: 'We have reached Ganymede.',
      },
      {
        goal: 'Stay near Ganymede and unload the instruments',
        start: 'Please stay close to Ganymede while we unload the instruments.',
        done: 'Instruments delivered! Ganymede is the only moon known to make its own magnetic field.',
      },
    ],
    summary: ['Jupiter is the largest planet. More than 1,300 Earths would fit inside.', 'A swing-by borrows a planet’s gravity to change speed or direction without fuel.', 'Ganymede is the largest moon in the solar system, bigger than Mercury.'],
    quiz: [
      {
        question: 'What does a spacecraft borrow during a swing-by?',
        choices: ['The planet’s gravity', 'The planet’s air', 'Sunlight'],
        answer: 0,
        explanation: 'Passing close to a planet, its gravity pulls the spacecraft and changes its speed and direction, so it can travel far using very little fuel.',
      },
      {
        question: 'Which is the largest moon in the solar system?',
        choices: ['The Moon', 'Ganymede', 'Titan'],
        answer: 1,
        explanation: 'Ganymede is about 5,270 km across, bigger than Mercury (about 4,880 km). Saturn’s Titan comes second.',
      },
    ],
  },

  'io-europa': {
    title: 'The volcano moon and the ice moon',
    client: 'Planetary Science Institute',
    briefing: ['Jupiter’s moons are very different worlds. Let’s observe volcanic Io and icy Europa.'],
    steps: [
      {
        goal: 'Observe Io (stay close)',
        start: 'I have set Io as our target. The scan starts when we get close.',
        done: 'Io has more than 400 volcanoes, the most volcanically active place in the solar system. Jupiter’s strong gravity kneads it and heats its inside.',
      },
      {
        goal: 'Observe Europa (stay close)',
        start: 'Next is Europa. Target set.',
        done: 'Under Europa’s ice there may be an ocean with more water than all of Earth’s oceans combined. The Europa Clipper spacecraft is on its way to study it as a place where life might exist.',
      },
    ],
    summary: ['Io is the most volcanically active world. Jupiter’s gravity keeps its inside hot.', 'A large ocean of water is thought to lie under Europa’s ice.', 'Moons of the same planet can be completely different worlds.'],
    quiz: [
      {
        question: 'Why does Io have so many volcanoes?',
        choices: ['It is very close to the Sun', 'Jupiter’s gravity kneads it and heats its inside', 'Many meteorites hit it'],
        answer: 1,
        explanation: 'As Io orbits, Jupiter’s gravity stretches and relaxes it again and again, and the friction melts its inside.',
      },
      {
        question: 'What is thought to lie under Europa’s ice?',
        choices: ['A sea of lava', 'An ocean of water', 'A layer of diamonds'],
        answer: 1,
        explanation: 'A salty ocean is thought to lie under the thick ice. Because there is water, Europa is a key place to look for life.',
      },
    ],
  },

  'saturn-rings': {
    title: 'The secret of Saturn’s rings',
    client: 'Planetary Science Institute',
    briefing: ['We have a request to study Saturn’s rings. What are those beautiful rings made of?'],
    steps: [
      {
        goal: 'Observe Saturn’s rings (stay near Saturn)',
        start: 'I have set Saturn as our target. The scan starts when we get close.',
        done: 'The rings are made of countless pieces of ice, from grains of sand to chunks as big as a house. They are about 270,000 km from edge to edge, yet mostly less than 1 km thick.',
      },
      {
        goal: 'Observe the moon Mimas (stay close)',
        start: 'The rings have a big gap called the Cassini Division. Let’s study Mimas, the moon that makes it.',
        done: 'Mimas’s gravity tugs at the same spot again and again, pushing the ice pieces out and leaving a gap. Mimas also has a giant crater a third as wide as the moon itself.',
      },
    ],
    summary: ['Saturn’s rings are made of countless pieces of ice.', 'The rings are about 270,000 km across but less than 1 km thick.', 'A moon’s gravity can make gaps in the rings.'],
    quiz: [
      {
        question: 'What are Saturn’s rings made of?',
        choices: ['One solid plate', 'Countless pieces of ice', 'Clouds of gas'],
        answer: 1,
        explanation: 'The rings are a huge number of ice pieces, each orbiting Saturn on its own. They are not one solid plate.',
      },
      {
        question: 'How thick are Saturn’s rings in most places?',
        choices: ['Less than 1 km', 'About 10,000 km', 'About as wide as Earth'],
        answer: 0,
        explanation: 'They stretch about 270,000 km from edge to edge, but are only tens of meters to about 1 km thick in most places. A very thin disk.',
      },
    ],
  },

  'water-hunt': {
    title: 'Hunting for clues of water',
    client: 'Life Search Project',
    briefing: ['Our mission is to look for liquids, which life needs. Two of Saturn’s moons hold big clues.'],
    steps: [
      {
        goal: 'Observe Enceladus (stay close)',
        start: 'I have set Enceladus as our target. It is a small white moon.',
        done: 'Water from an ocean under the ice sprays out into space from Enceladus’s south pole. The Cassini spacecraft flew through these plumes and found salt and organic molecules.',
      },
      {
        goal: 'Observe Titan (stay close)',
        start: 'Next is Titan. Target set.',
        done: 'Like Earth, Titan has rain, rivers and lakes. But the liquid is methane, not water, which is liquid at −180 °C. The air pressure on its surface is about 1.5 times Earth’s.',
      },
    ],
    summary: ['Enceladus sprays water from an ocean under its ice.', 'Titan has methane rain, rivers and lakes.', 'Places with liquids are important targets in the search for life.'],
    quiz: [
      {
        question: 'What sprays out from Enceladus’s south pole?',
        choices: ['Lava', 'Water (ice grains and vapor)', 'Dust'],
        answer: 1,
        explanation: 'Water from the ocean under the ice sprays out through cracks. One of Saturn’s rings, the E ring, is made of ice grains from these plumes.',
      },
      {
        question: 'What liquid fills Titan’s lakes and rivers?',
        choices: ['Water', 'Methane', 'Molten iron'],
        answer: 1,
        explanation: 'Titan is about −180 °C. Water is frozen rock-hard there, but methane is liquid and forms rain, rivers and lakes.',
      },
    ],
  },

  'pluto-voyage': {
    title: 'The long trip to Pluto',
    client: 'Solar System Survey Bureau',
    briefing: [
      'Our final mission is to survey Pluto at the edge of the solar system.',
      'Pluto is about 40 times farther from the Sun than Earth. Even sunlight takes about 5 and a half hours to get there. The New Horizons spacecraft, launched in 2006, took nine and a half years to reach it.',
    ],
    steps: [
      {
        goal: 'Observe Pluto (stay close)',
        start: 'I have set Pluto as our target. It is a long journey.',
        done: 'Pluto has a white heart-shaped region. Its left half is a flat plain of frozen nitrogen. Pluto was classified as a dwarf planet in 2006.',
      },
      {
        goal: 'Observe the moon Charon (stay close)',
        start: 'Finally, let’s study Pluto’s moon Charon.',
        done: 'Charon is about half the size of Pluto. Pluto and Charon always keep the same faces turned toward each other as they go around.',
      },
    ],
    summary: ['Even sunlight takes about 5 and a half hours to reach Pluto.', 'The white heart-shaped region holds a plain of frozen nitrogen.', 'Pluto and Charon always face each other with the same sides.'],
    quiz: [
      {
        question: 'How long does sunlight take to reach Pluto?',
        choices: ['About 8 minutes', 'About 5 and a half hours', 'About 3 days'],
        answer: 1,
        explanation: 'Light travels about 300,000 km each second, but Pluto is about 5.9 billion km away, so it takes about 5 and a half hours. To Earth it takes about 8 minutes.',
      },
      {
        question: 'What is the plain in Pluto’s white heart made of?',
        choices: ['Water snow', 'Frozen nitrogen', 'Salt'],
        answer: 1,
        explanation: 'The left half of the heart, Sputnik Planitia, is made of frozen nitrogen and other ices. Nitrogen, which makes up about 80% of Earth’s air, is frozen solid on Pluto.',
      },
    ],
  },

  'amatsu-jupiter-spot': {
    title: 'Photograph Jupiter’s Great Red Spot',
    client: 'Planetary Weather Institute',
    briefing: [
      'Welcome aboard the Amatsukaze, Captain. The brass domes on deck are observatories. This ship’s job is to watch and to record.',
      'Our first photo is Jupiter’s Great Red Spot, a storm bigger than Earth that has been watched without a break for almost 190 years.',
    ],
    steps: [
      { goal: 'Head to Jupiter', start: 'I have set Jupiter as our target. Engage when ready.', done: 'We have reached Jupiter. The stripes are bands of cloud split apart by strong east–west winds.' },
      {
        goal: 'Keep Jupiter inside the camera frame',
        start: 'I have put a camera frame on the screen. Bring Jupiter inside it and hold it there for 4 seconds. Too close and it will not fit.',
        done: 'Photo taken! The Great Red Spot is a high-pressure whirlpool larger than Earth. It has been slowly shrinking for about 100 years.',
      },
    ],
    summary: ['The Great Red Spot is a storm (a high-pressure whirlpool) larger than Earth.', 'It has been watched without a break since about 1830.', 'In recent years it has been slowly shrinking.'],
    quiz: [
      { question: 'What is Jupiter’s Great Red Spot?', choices: ['A giant storm', 'A volcano', 'A big lake'], answer: 0, explanation: 'It is a swirling high-pressure storm. Jupiter has no solid ground, so nothing breaks it up and it lasts a very long time.' },
      {
        question: 'How big is the Great Red Spot?',
        choices: ['Big enough to hold Earth', 'About the size of the Moon', 'About the size of Japan'],
        answer: 0,
        explanation: 'Today it is about 14,000 km wide, wider than Earth (about 12,700 km). A hundred years ago it was big enough for two or three Earths side by side.',
      },
    ],
  },

  'amatsu-eclipse': {
    title: 'Watch a total solar eclipse from space',
    client: 'Solar Observation Center',
    briefing: ['On April 8, 2024, a total solar eclipse crossed North America. Let’s watch that day from space.', 'A solar eclipse happens when the Moon passes in front of the Sun and its shadow falls on Earth.'],
    steps: [
      {
        goal: 'Watch the Moon’s shadow cross Earth',
        start: 'I have opened the eclipse view and started playing that day. Watch the Moon’s shadow travel across Earth.',
        done: 'Maximum eclipse! Where the Moon’s dark shadow fell, daytime turned as dark as night for a few minutes, and the Sun’s corona appeared.',
      },
    ],
    summary: ['A solar eclipse is the Moon’s shadow falling on Earth.', 'The Sun is about 400 times bigger than the Moon but about 400 times farther away, so they look almost the same size.', 'A total eclipse can only be seen inside the narrow path of the shadow.'],
    quiz: [
      { question: 'During a solar eclipse, whose shadow falls on Earth?', choices: ['The Moon’s', 'Earth’s own', 'The Sun’s'], answer: 0, explanation: 'The Moon moves between the Sun and Earth and its shadow falls on Earth. A lunar eclipse is the opposite: Earth’s shadow falls on the Moon.' },
      {
        question: 'Why do the Sun and Moon look about the same size in the sky?',
        choices: ['The Sun is about 400 times bigger and about 400 times farther away', 'They really are the same size', 'The Moon makes its own light'],
        answer: 0,
        explanation: 'Size and distance are in almost the same ratio, so the Moon can just cover the Sun. That is why the corona shows during a total eclipse.',
      },
    ],
  },

  'amatsu-saturn-rings': {
    title: 'Photograph Saturn’s rings and Titan',
    client: 'Planetary Science Institute',
    briefing: [
      'Seen from Earth, the tilt of Saturn’s rings slowly changes. About every 15 years we see them exactly edge-on, and in 2025 they almost vanished from view.',
      'This time we will photograph the whole ring system and the moon Titan from space.',
    ],
    steps: [
      { goal: 'Head to Saturn', start: 'I have set Saturn as our target.', done: 'We have reached Saturn.' },
      {
        goal: 'Keep Saturn and its rings inside the frame',
        start: 'Back off a little so the whole ring system fits, then bring Saturn inside the frame. Too close and it will not fit.',
        done: 'Photo taken! The rings sit above Saturn’s equator, and Saturn is tilted about 27 degrees, so the rings look different with the seasons.',
      },
      {
        goal: 'Keep Titan inside the frame',
        start: 'Next is Titan. Target set.',
        done: 'Photo taken! Titan’s orange color is a thick haze. We learned about its surface from Cassini’s radar and from the Huygens lander, which touched down in 2005.',
      },
    ],
    summary: ['Saturn’s rings lie above its equator and look different with the seasons.', 'About every 15 years we see them edge-on and they almost disappear.', 'Titan is wrapped in thick haze. The Huygens lander touched down there in 2005.'],
    quiz: [
      {
        question: 'Why did Saturn’s rings almost vanish from Earth’s view in 2025?',
        choices: ['We saw them exactly edge-on', 'The rings disappeared', 'Saturn hid behind the Sun'],
        answer: 0,
        explanation: 'The rings are very thin, so seen edge-on they become a fine line that is hard to see. They did not go anywhere.',
      },
      { question: 'Which spacecraft landed on Titan?', choices: ['Huygens', 'Hayabusa', 'Apollo 11'], answer: 0, explanation: 'Huygens rode along with Cassini and landed on Titan in January 2005, the most distant landing ever made.' },
    ],
  },

  'hakobune-moon-water': {
    title: 'Moon water for Earth orbit',
    client: 'Earth-orbit supply station',
    briefing: [
      'Welcome aboard the Hakobune, Captain. She is an 800 m freighter.',
      'Deep craters at the Moon’s south pole never see sunlight, and ice is thought to remain there. We will carry that water to a supply station orbiting Earth.',
      'The Moon’s gravity is about one sixth of Earth’s, so launching cargo from the Moon takes far less fuel than launching from Earth.',
    ],
    steps: [
      { goal: 'Head to the Moon', start: 'I have set the Moon as our target.', done: 'We have reached the Moon.' },
      {
        goal: 'Stay near the Moon and load the ice',
        start: 'Please stay close to the Moon while we load ice from the south pole.',
        done: 'Loading complete! The ship is much heavier now. With the same push, heavier things speed up more slowly. I will keep our top speed down until we unload.',
      },
      { goal: 'Head to Earth', start: 'I have set Earth as our target. We are heavy, so let’s take it easy.', done: 'We have reached Earth. I can see the supply station’s docking ring.' },
      {
        goal: 'Fly slowly into the docking ring and stop',
        start: 'The glowing ring is the port entrance. Fly the last part yourself: ease into the middle of the ring and stop. If you are too fast you will not be able to stop.',
        done: 'Docked! A heavy ship needs a long distance to stop. In space, even stopping takes fuel, fired in the opposite direction.',
      },
    ],
    summary: ['Ice is thought to lie in dark craters at the Moon’s south pole.', 'With the same push, heavier things speed up and slow down less easily.', 'In space, you need fuel even to stop.'],
    quiz: [
      {
        question: 'Why is there ice in craters at the Moon’s south pole?',
        choices: ['Sunlight never reaches them, so they are extremely cold', 'It rains on the Moon', 'Ice was carried there from Earth'],
        answer: 0,
        explanation: 'At the Moon’s poles the Sun always skims the horizon, so the floors of deep craters are never lit. At below −200 °C, ice can last.',
      },
      {
        question: 'With the same push, what happens to a ship that has become heavier with cargo?',
        choices: ['It speeds up more slowly', 'It speeds up faster', 'Nothing changes'],
        answer: 0,
        explanation: 'For the same force, heavier things gain speed more slowly (force = mass × acceleration). Stopping works the same way: a heavier ship is harder to stop.',
      },
    ],
  },

  'hakobune-ring-ice': {
    title: 'Ring ice for Mars',
    client: 'Mars research base',
    briefing: [
      'The Mars research base needs more water. We will bring ice from Saturn’s rings.',
      'The Hakobune’s fusion rocket is still imaginary. In real life, scientists are working on fusion power, the same process that powers the Sun, at projects such as ITER in France.',
    ],
    steps: [
      { goal: 'Head to Saturn', start: 'I have set Saturn as our target.', done: 'We have reached Saturn.' },
      { goal: 'Stay near Saturn and load ring ice', start: 'Please stay close to Saturn while we gather ice grains from the outer rings.', done: 'Loading complete! More than 99% of the ring particles are water ice, and very clean water at that.' },
      { goal: 'Head to Mars', start: 'I have set Mars as our target. From Saturn to Mars is about 8 times the Earth–Sun distance.', done: 'We have reached Mars. I can see the base’s docking ring.' },
      {
        goal: 'Fly slowly into the docking ring and stop',
        start: 'Ease into the middle of the ring and stop.',
        done: 'Docked! Mars’s air is less than 1% as thick as Earth’s, so water on the surface quickly freezes or evaporates. The base will use it carefully.',
      },
    ],
    summary: ['More than 99% of Saturn’s ring particles are water ice.', 'From Saturn to Mars is about 8 times the Earth–Sun distance.', 'Mars’s air is less than 1% of Earth’s, so liquid water cannot stay on the surface.'],
    quiz: [
      { question: 'What are Saturn’s ring particles mostly made of?', choices: ['Water ice', 'Rock', 'Iron'], answer: 0, explanation: 'More than 99% is water ice, which is why the rings reflect sunlight so brightly.' },
      {
        question: 'Why can’t liquid water stay on the surface of Mars?',
        choices: ['The air is very thin and it is cold', 'Gravity is too strong', 'Mars has no water at all'],
        answer: 0,
        explanation: 'In thin air, water quickly evaporates or freezes. Mars does have water, as polar ice and ice underground.',
      },
    ],
  },

  'amatsu-moon-city': {
    title: 'Photograph the city on the Moon’s far side',
    client: 'Society for Moon Legends',
    briefing: [
      'Word has come of a glowing city on a crater floor on the far side of the Moon.',
      'The Moon Capital is where Princess Kaguya returned in the old Japanese “Tale of the Bamboo Cutter”. If it is really there, let’s record it.',
    ],
    steps: [
      { goal: 'Head to the Moon', start: 'I have set the Moon as our target.', done: 'We have reached the Moon. The city is on the far side, a place never visible from Earth.' },
      {
        goal: 'Keep the Moon Capital inside the frame',
        start: 'I have set the Moon Capital as our target. Swing around to the far side and bring the city into the frame.',
        done: 'Photo taken! In the tale, Princess Kaguya was taken home by a procession from the Moon Capital on the night of a full moon.',
      },
    ],
    summary: ['The Moon always shows Earth the same face, so we never see its far side from Earth.', 'A spacecraft first photographed the far side in 1959.', 'The Moon Capital is an imaginary place based on an old Japanese tale.'],
    real: ['The far side of the Moon was first photographed in 1959 by the Soviet probe Luna 3.', 'In 2019, China’s Chang’e 4 made the first landing on the far side.', 'Earth’s radio noise does not reach the far side, so there are plans to build quiet radio telescopes there.'],
    quiz: [
      {
        question: 'Which spacecraft first photographed the far side of the Moon?',
        choices: ['Luna 3 (1959)', 'Apollo 11 (1969)', 'Kaguya (2007)'],
        answer: 0,
        explanation: 'The Soviet Luna 3 looped around the Moon and took the pictures. Until then, no one had ever seen the far side.',
      },
      {
        question: 'Why can’t we see the far side of the Moon from Earth?',
        choices: ['The Moon spins once in the same time it takes to orbit Earth', 'The far side is always night', 'Clouds hide it'],
        answer: 0,
        explanation: 'The Moon spins once in about 27 days and circles Earth in the same 27 days, so the same face always points at us. The far side has daytime too.',
      },
    ],
  },

  'amatsu-radio-moon': {
    title: 'Observe the radio telescope moon',
    client: 'Radio Observatory',
    briefing: ['Our target is a man-made sphere as big as a moon: the Radio Telescope Moon.', 'The huge bowl at its north pole is not a weapon. It is an antenna that gathers faint radio waves from distant galaxies and black holes.'],
    steps: [
      { goal: 'Head to the Radio Telescope Moon', start: 'Target set.', done: 'We have arrived. I can see the hull bands wrapping its surface and the small antennas.' },
      { goal: 'Keep the Radio Telescope Moon inside the frame', start: 'Bring the whole sphere into the frame and take the photo.', done: 'Photo taken! Radio waves show us things visible light cannot, such as cold gas and the distant universe.' },
    ],
    summary: ['A radio telescope sees the universe in radio waves we cannot see.', 'The bigger the dish, the fainter the signals it can collect.', 'The Radio Telescope Moon is an imaginary structure.'],
    real: [
      'The largest radio dish in the world is China’s FAST, 500 m across, finished in 2016.',
      'Puerto Rico’s Arecibo radio telescope (305 m) collapsed in 2020 after its cables broke.',
      'In 2019 the Event Horizon Telescope, linking radio telescopes around the world, took the first picture of a black hole’s shadow.',
    ],
    quiz: [
      { question: 'How wide is the dish of FAST, the largest radio telescope?', choices: ['About 500 m', 'About 50 m', 'About 5 km'], answer: 0, explanation: 'FAST is a 500 m dish built into a natural hollow among the hills.' },
      {
        question: 'What was first photographed in 2019 by linking radio telescopes around the world?',
        choices: ['A black hole’s shadow', 'The surface of Mars', 'Sunspots'],
        answer: 0,
        explanation: 'Linking telescopes across the globe gave detail like one Earth-sized telescope. The target was the black hole at the center of galaxy M87.',
      },
    ],
  },

  'amatsu-railway': {
    title: 'Fly alongside the Galactic Railway',
    client: 'Museum of Star Stories',
    briefing: ['We have a request to photograph the Galactic Railway running on its rails of light.', 'The train will not stop for us. Fly alongside and keep it in the frame.'],
    steps: [
      { goal: 'Head to the Galactic Railway', start: 'I have set the Galactic Railway as our target. Warping puts us right beside the train.', done: 'We caught up! Its windows are lit.' },
      {
        goal: 'Keep the moving train inside the frame',
        start: 'Keep the train inside the frame for 5 seconds. If it pulls away, autopilot (G) can chase it.',
        done: 'Photo taken! In Kenji Miyazawa’s “Night on the Galactic Railroad”, Giovanni and Campanella ride this train along the Milky Way.',
      },
    ],
    summary: ['The Galactic Railway is an imaginary train from Kenji Miyazawa’s story.', 'The Milky Way is our own galaxy seen from inside.', 'To photograph something moving, fly alongside at the same speed.'],
    real: [
      'The Milky Way is our galaxy seen from inside. It holds 100 to 400 billion stars.',
      'Galileo was the first to show with a telescope that the Milky Way is made of stars (1610).',
      'Even light takes about 100,000 years to cross the Milky Way.',
    ],
    quiz: [
      { question: 'What is the Milky Way?', choices: ['A huge crowd of stars', 'High clouds', 'Reflected moonlight'], answer: 0, explanation: 'Countless distant stars blend into a faint glowing band across the sky.' },
      { question: 'Who first showed with a telescope that the Milky Way is made of stars?', choices: ['Galileo', 'Newton', 'Einstein'], answer: 0, explanation: 'In 1610 Galileo turned his handmade telescope to the Milky Way and found it was made of countless stars.' },
    ],
  },

  'hakobune-ore': {
    title: 'From the asteroid port to the shipyard',
    client: 'Lunar Shipyard',
    briefing: ['The lunar shipyard is short of metal for the hull of the sister ship SV-03.', 'We will load metal mined at the Cross Asteroid Port and deliver it to the shipyard.'],
    steps: [
      { goal: 'Head to the Cross Asteroid Port', start: 'I have set the Cross Asteroid Port as our target.', done: 'We have reached the asteroid port.' },
      { goal: 'Stay near the port and load metal', start: 'Please stay close to the port while we load the mined metal.', done: 'Loading complete! The ship is heavier now. I will keep our top speed down until we unload.' },
      { goal: 'Head to the Lunar Shipyard', start: 'I have set the shipyard as our target.', done: 'We have reached the shipyard. I can see the docking ring.' },
      { goal: 'Fly slowly into the docking ring and stop', start: 'Ease into the middle of the ring and stop.', done: 'Docked! This metal will become SV-03’s hull plates.' },
    ],
    summary: ['Using asteroid metal in space means less has to be launched from Earth.', 'Big spacecraft are assembled in space.', 'The asteroid port and the shipyard are imaginary structures.'],
    real: [
      'Hayabusa2 brought back samples from Ryugu, and NASA’s OSIRIS-REx from Bennu.',
      'NASA’s Psyche spacecraft is on its way to the asteroid Psyche, which may be made of metal. It should arrive in 2029.',
      'The International Space Station was built in space from parts carried up on more than 40 launches.',
    ],
    quiz: [
      { question: 'Which spacecraft is heading to Psyche, an asteroid that may be made of metal?', choices: ['Psyche', 'Hayabusa2', 'Voyager 1'], answer: 0, explanation: 'Psyche launched in 2023 and should reach the asteroid in 2029. It may be a piece of an ancient small planet’s core.' },
      {
        question: 'How was the International Space Station built?',
        choices: ['Parts were launched dozens of times and assembled in space', 'It was built on the ground and launched in one go', 'It was built on the Moon'],
        answer: 0,
        explanation: 'Between 1998 and 2011, more than 40 launches carried up parts, and astronauts joined them together in space.',
      },
    ],
  },

  'hakobune-ark': {
    title: 'Final supplies for the generation ship',
    client: 'Generation Ship',
    briefing: ['We are bringing final supplies to the generation ship before it leaves for Alpha Centauri, our nearest neighboring star.', 'Many generations will live aboard during the voyage. Let’s carry water and metal from the Engine Asteroid.'],
    steps: [
      { goal: 'Head to the Engine Asteroid', start: 'I have set the Engine Asteroid as our target.', done: 'We have reached the Engine Asteroid.' },
      { goal: 'Stay near the asteroid and load water and metal', start: 'Please stay close to the asteroid while we load.', done: 'Loading complete! The ship is heavier now.' },
      { goal: 'Head to the generation ship', start: 'I have set the generation ship as our target.', done: 'We have reached the generation ship. I can see the docking ring.' },
      { goal: 'Fly slowly into the docking ring and stop', start: 'Ease into the middle of the ring and stop.', done: 'Docked! This water will be cleaned and reused again and again on board. Safe travels!' },
    ],
    summary: ['Even the nearest star is extremely far away.', 'On long voyages, water and air are recycled again and again.', 'The generation ship is imaginary.'],
    real: [
      'The nearest star is about 4.2 light-years away. At Voyager 1’s speed the trip would take more than 70,000 years.',
      'The International Space Station turns sweat and urine back into water and reuses about 98% of its water.',
      'People have lived for long periods in sealed buildings on Earth as experiments, such as Biosphere 2 in the United States.',
    ],
    quiz: [
      { question: 'About how much of its water does the International Space Station reuse?', choices: ['About 98%', 'About 10%', 'About 50%'], answer: 0, explanation: 'It filters moisture from the air and even sweat and urine back into drinking water.' },
      { question: 'How far away is the nearest star?', choices: ['About 4.2 light-years', 'About 4.2 light-minutes', 'About 420 light-years'], answer: 0, explanation: 'Even light takes about 4.2 years, a distance of about 40 trillion km. Light from the Sun takes only about 8 minutes.' },
    ],
  },
  'heron-galilean': {
    title: 'Survey craft to Jupiter’s four moons',
    client: 'Jupiter system survey team',
    briefing: [
      'Welcome aboard the White Heron, Captain. She is a 400 m survey carrier. Her two forward legs hold hangars that launch small survey craft.',
      'In 1610 Galileo used a homemade telescope to discover four points of light circling Jupiter: Io, Europa, Ganymede and Callisto.',
      'Today we send one survey craft to each of those four moons.',
    ],
    steps: [
      {
        goal: 'Fly to Jupiter',
        start: 'Target set: Jupiter.',
        done: 'We have reached Jupiter. All four moons are in view.',
      },
      {
        goal: 'Launch a survey craft to Io',
        start: 'Target set: Io. Once you are close, press the launch button or L to send out a craft.',
        arrive: 'The craft has reached Io. Volcanoes are erupting all over it.',
        done: 'Io is the most volcanically active world in the solar system. Jupiter’s strong gravity squeezes it and heats its insides.',
      },
      {
        goal: 'Launch a survey craft to Europa',
        start: 'Next is Europa. Get close and launch a craft.',
        arrive: 'The craft has reached Europa. Its surface is cracked ice.',
        done: 'Under Europa’s ice there is thought to be an ocean of salty water.',
      },
      {
        goal: 'Launch a survey craft to Ganymede',
        start: 'Next is Ganymede.',
        arrive: 'The craft has reached Ganymede.',
        done: 'Ganymede is the largest moon in the solar system, bigger even than Mercury. It is a moon with its own magnetic field.',
      },
      {
        goal: 'Launch a survey craft to Callisto',
        start: 'Last is Callisto.',
        arrive: 'The craft has reached Callisto. It is covered in craters.',
        done: 'Callisto is one of the most heavily cratered places in the solar system, almost unchanged for over 4 billion years. All four craft arrived safely!',
      },
    ],
    summary: ['Galileo discovered Jupiter’s four big moons in 1610.', 'Io has volcanoes, Europa an ocean under ice, Ganymede is the largest moon, and Callisto is covered in craters.', 'The real probes JUICE and Europa Clipper are on their way to Jupiter now.'],
    quiz: [
      {
        question: 'Who first discovered Jupiter’s four big moons?',
        choices: ['Galileo Galilei', 'Isaac Newton', 'Albert Einstein'],
        answer: 0,
        explanation: 'Galileo found them with a telescope in 1610, so they are called the Galilean moons.',
      },
      {
        question: 'What is the largest moon in the solar system?',
        choices: ['Ganymede', 'The Moon', 'Io'],
        answer: 0,
        explanation: 'Ganymede is about 5,270 km across, larger than the planet Mercury (about 4,880 km).',
      },
    ],
  },

  'heron-saturn-moons': {
    title: 'Survey craft to Saturn’s moons',
    client: 'Saturn system survey team',
    briefing: [
      'We are going to study Saturn’s moons Enceladus and Titan.',
      'The real Cassini probe was a mothership too, just like the White Heron. In 2005 it released the small Huygens probe, which landed on Titan.',
    ],
    steps: [
      {
        goal: 'Fly to Saturn',
        start: 'Target set: Saturn.',
        done: 'We have reached Saturn.',
      },
      {
        goal: 'Launch a survey craft to Enceladus',
        start: 'Target set: Enceladus. Get close and launch a craft.',
        arrive: 'The craft is over Enceladus’s south pole. Water is spraying out of cracks in the ice into space!',
        done: 'There is an ocean under Enceladus’s ice, and its water sprays out. Cassini flew right through these plumes to study them.',
      },
      {
        goal: 'Launch a survey craft to Titan',
        start: 'Next is Titan.',
        arrive: 'The craft has reached Titan. A thick orange haze hides the ground.',
        done: 'Titan has an atmosphere thicker than Earth’s. Both craft arrived. Sending our report.',
      },
    ],
    summary: ['Cassini was a mothership that released Huygens to land on Titan.', 'Water from the ocean under the ice sprays out of Enceladus’s south pole.', 'Titan is wrapped in an atmosphere thicker than Earth’s.'],
    quiz: [
      {
        question: 'What was the probe that Cassini released to land on Titan?',
        choices: ['Huygens', 'Hayabusa', 'Voyager'],
        answer: 0,
        explanation: 'Huygens landed on Titan in January 2005. It is the only probe ever to land on a world in the outer solar system.',
      },
      {
        question: 'What sprays out of Enceladus’s south pole?',
        choices: ['Water (ice grains)', 'Lava', 'Sand'],
        answer: 0,
        explanation: 'Water from the ocean under the ice sprays into space through cracks. Some of it feeds Saturn’s E ring.',
      },
    ],
  },

  'sorakaze-mercury': {
    title: 'Sailing on light to Mercury',
    client: 'Mercury observation team',
    briefing: [
      'Welcome aboard the Sorakaze, Captain. She is a 150 m light-sail courier. Six mirror-like sails spin around her, and sunlight pushes her along.',
      'Light has a tiny pushing force. A light sail needs no fuel, but the stronger the light, the better it moves.',
      'Light gets stronger closer to the Sun. Feel the difference for yourself at Venus and Mercury.',
    ],
    steps: [
      {
        goal: 'Fly to Venus',
        start: 'Target set: Venus.',
        done: 'We have reached Venus. Sunlight here is about 1.9 times as strong as near Earth.',
      },
      {
        goal: 'Sail on light near Venus',
        start: 'Let’s fly by light sail. Any direction is fine; I will count the distance you travel. You should go faster than near Earth.',
        done: 'Nicely sailed. Next, Mercury, even closer to the Sun.',
      },
      {
        goal: 'Fly to Mercury',
        start: 'Target set: Mercury.',
        done: 'We have reached Mercury. The light here is about 6.6 times as strong as near Earth!',
      },
      {
        goal: 'Sail on light near Mercury',
        start: 'Fly by light sail once more. You will go even faster than at Venus.',
        done: 'That was quick! When your distance from the Sun halves, the light becomes four times as strong.',
      },
      {
        goal: 'Stop near Mercury and deliver the cargo',
        start: 'Unloading the cargo for the Mercury team. Please hold still.',
        done: 'Delivered!',
      },
    ],
    summary: ['Light has a small pushing force, so a light sail can travel without fuel.', 'Halve your distance from the Sun and the light is four times as strong.', 'In 2010 Japan’s IKAROS became the first spacecraft to travel through space by light sail.'],
    quiz: [
      {
        question: 'If your distance from the Sun halves, how does the strength of sunlight change?',
        choices: ['It becomes 4 times as strong', 'It becomes twice as strong', 'It stays the same'],
        answer: 0,
        explanation: 'Light spreads out in every direction, so its strength falls with the square of the distance. Half the distance means 2 × 2 = 4 times the light.',
      },
      {
        question: 'Which Japanese probe first traveled through space by light sail, in 2010?',
        choices: ['IKAROS', 'Hayabusa', 'Kaguya'],
        answer: 0,
        explanation: 'IKAROS unfurled a thin square sail 14 m on each side and proved light could speed it up on its way to Venus.',
      },
    ],
  },

  'sorakaze-outer': {
    title: 'Light is weak far away',
    client: 'Outer planets laboratory',
    briefing: [
      'This time we test what happens to a light sail far from the Sun.',
      'Let’s fly at Mars and Jupiter. If you cannot go as fast as you would like, that is today’s discovery.',
    ],
    steps: [
      {
        goal: 'Fly to Mars',
        start: 'Target set: Mars.',
        done: 'We have reached Mars. The light here is about 0.43 times as strong as near Earth.',
      },
      {
        goal: 'Sail on light near Mars',
        start: 'Fly by light sail. It should feel a little sluggish.',
        done: 'You made it, but much more slowly than at Mercury.',
      },
      {
        goal: 'Fly to Jupiter',
        start: 'Target set: Jupiter.',
        done: 'We have reached Jupiter. The light here is only about 1/27 as strong as near Earth.',
      },
      {
        goal: 'Sail on light near Jupiter',
        start: 'Try flying by light sail. The light is so weak that you will only creep along.',
        done: 'You managed it. Probes that travel far from the Sun need other kinds of power besides sunlight.',
      },
    ],
    summary: ['The farther from the Sun, the weaker the light. At Jupiter it is about 1/27 of what it is near Earth.', 'Jupiter’s Juno probe makes electricity with enormous solar panels.', 'Voyager, which travels much farther, uses a nuclear battery instead of sunlight.'],
    quiz: [
      {
        question: 'Near Jupiter, sunlight is about what fraction of its strength near Earth?',
        choices: ['About 1/27', 'About 1/2', 'About 1/1000'],
        answer: 0,
        explanation: 'Jupiter is about 5.2 times as far from the Sun as Earth. 5.2 × 5.2 ≈ 27, so the light is about 1/27 as strong.',
      },
      {
        question: 'What does Voyager use to make electricity far from the Sun?',
        choices: ['A nuclear battery', 'Solar panels', 'A wind turbine'],
        answer: 0,
        explanation: 'Voyager uses a battery (an RTG) that turns heat from plutonium into electricity, because sunlight out there is far too weak.',
      },
    ],
  },

  'meguri-titan': {
    title: 'Send a lander down to Titan',
    client: 'Titan research team',
    briefing: [
      'Welcome aboard the Meguri, Captain. She is a survey ship with a spinning ring. The ring turns once every 13.5 seconds, so the crew inside feel about as heavy as they do on Earth.',
      'Two landers are docked to the ship for trips down to the surface. Today we send one down to Titan.',
    ],
    steps: [
      {
        goal: 'Fly to Titan',
        start: 'Target set: Titan.',
        done: 'We have reached Titan. It is wrapped in a thick atmosphere.',
      },
      {
        goal: 'Send the lander down to Titan',
        start: 'Near Titan, press the lander button or L to release a lander. It will go down, take a look and come back.',
        arrive: 'The lander has touched down. It is about −180 °C, on the shore of a methane lake.',
        done: 'The lander is back! On Titan, the lakes and rivers are filled with methane, not water.',
      },
    ],
    summary: ['Titan has a thick atmosphere and lakes and rivers of methane.', 'The real Huygens probe landed in 2005, and NASA’s Dragonfly will fly through Titan’s skies.', 'A spinning ring can create a feeling of weight (artificial gravity).'],
    quiz: [
      {
        question: 'What fills Titan’s lakes?',
        choices: ['Liquid methane', 'Water', 'Molten iron'],
        answer: 0,
        explanation: 'At −180 °C, methane, which is a gas on Earth, turns liquid on Titan. It falls as rain and fills lakes and rivers.',
      },
      {
        question: 'How do people inside Meguri’s spinning ring feel?',
        choices: ['Pressed against the outer floor, so they feel weight', 'They float', 'Just dizzy'],
        answer: 0,
        explanation: 'Inside something that spins, you are pushed outward (centrifugal force). The ring’s floor is on the outside, so that push feels like weight.',
      },
    ],
  },

  'meguri-europa': {
    title: 'Down onto Europa’s ice',
    client: 'Europa ocean institute',
    briefing: [
      'Under Europa’s thick ice there may be more water than in all of Earth’s oceans combined.',
      'We will set a lander down on the ice and study it. No real spacecraft has landed on Europa yet.',
    ],
    steps: [
      {
        goal: 'Fly to Europa',
        start: 'Target set: Europa.',
        done: 'We have reached Europa.',
      },
      {
        goal: 'Send the lander down to Europa',
        start: 'Release the lander and set it down on the ice.',
        arrive: 'The lander is on the ice. Reddish-brown salts are seeping up through the cracks.',
        done: 'The lander is back! The color in the cracks may be salt that came up from the ocean below.',
      },
    ],
    summary: ['Under Europa’s ice there may be about twice as much water as in Earth’s oceans.', 'The reddish-brown color in its cracks may be salt from the ocean.', 'NASA’s Europa Clipper will fly past it many times starting around 2030.'],
    quiz: [
      {
        question: 'What is thought to lie under Europa’s ice?',
        choices: ['An ocean of salty water', 'A sea of lava', 'Caves full of air'],
        answer: 0,
        explanation: 'Jupiter’s gravity kneads Europa and warms its insides, so there is thought to be liquid water under the ice.',
      },
      {
        question: 'How much water might Europa’s ocean hold compared with Earth’s oceans?',
        choices: ['About twice as much', 'About 1/100 as much', 'About the same'],
        answer: 0,
        explanation: 'Europa is a bit smaller than our Moon, but its ocean is very deep, so it may hold about twice the water of Earth’s oceans.',
      },
    ],
  },

  'heron-rescue': {
    title: 'Rescue the work mech',
    client: 'Colony Group 1 construction office',
    briefing: [
      'At the colony construction site, a work mech’s thrusters failed and it drifted off into space. The pilot is safe and waiting for rescue.',
      'We will fly out in the White Heron’s survey craft, grab the mech and tow it home.',
    ],
    steps: [
      {
        goal: 'Fly to the L5 colony',
        start: 'Target set: Colony Group 1.',
        done: 'We have reached the colony. Can you see the blinking orange light? That is the work mech.',
      },
      {
        goal: 'Launch a craft to the work mech and bring it back',
        start: 'Target set: the work mech. Get close and launch a survey craft.',
        arrive: 'The craft has grabbed the work mech! Towing it back now.',
        done: 'Rescue complete! The mech is safe in our hangar and the pilot is fine.',
      },
    ],
    summary: ['In space, once something is pushed it keeps drifting, because nothing stops it.', 'Astronauts use safety tethers and small thrusters so they never drift away.'],
    real: [
      'During spacewalks from the International Space Station, astronauts are always clipped to the station by a safety tether.',
      'In case a tether comes loose, they wear a small thruster pack on their backs called SAFER.',
      'Cargo ships are caught by Canadarm2, a robotic arm about 17 m long, and attached to the station.',
    ],
    quiz: [
      {
        question: 'What do astronauts always use during spacewalks so they don’t drift away?',
        choices: ['A safety tether', 'Heavy boots', 'Suction cups'],
        answer: 0,
        explanation: 'They stay clipped to the station with a tether, because in space anything pushed keeps drifting without stopping.',
      },
      {
        question: 'What does the International Space Station use to catch cargo ships?',
        choices: ['A robotic arm', 'A net', 'Magnets'],
        answer: 0,
        explanation: 'The Canadarm2 robotic arm grabs the cargo ship and pulls it in to a docking port.',
      },
    ],
  },

  'heron-beacon': {
    title: 'Investigate the Europa Beacon',
    client: 'Fleet command',
    briefing: [
      'The mysterious beacon on Europa’s ice has suddenly started sending a strong signal.',
      'Send a survey craft close to record the signal and bring the recording back.',
    ],
    steps: [
      {
        goal: 'Fly to Europa',
        start: 'Target set: Europa.',
        done: 'We have reached Europa.',
      },
      {
        goal: 'Launch a craft to the beacon and bring back the recording',
        start: 'Target set: the beacon. Launch a craft to record the signal.',
        arrive: 'The craft has reached the beacon. Recording… the signal repeats in a regular pattern.',
        done: 'The recording is back. The signal comes from a single point beyond Neptune. Reporting to fleet command.',
      },
    ],
    summary: ['The signal came from a single point beyond Neptune.', 'A signal that repeats in a regular pattern is hard for nature to make.'],
    real: [
      'Searching radio waves from space for signals from civilizations on other worlds is called SETI.',
      'In 1974 the Arecibo radio telescope beamed a message about humanity toward the star cluster M13.',
      'So far, no signal from another civilization has been found.',
    ],
    quiz: [
      {
        question: 'What is the search for radio signals from other civilizations called?',
        choices: ['SETI', 'GPS', 'ISS'],
        answer: 0,
        explanation: 'SETI stands for the Search for Extraterrestrial Intelligence. Big radio telescopes are still listening today.',
      },
      {
        question: 'Has a signal from another civilization ever been found?',
        choices: ['Not yet', 'Many times', 'Exactly once'],
        answer: 0,
        explanation: 'People have searched for decades without finding a confirmed signal, and the search goes on.',
      },
    ],
  },

  'sorakaze-laser': {
    title: 'Rush medicine by laser sail',
    client: 'Migrant Fleet hospital',
    briefing: [
      'The Migrant Fleet has suddenly run short of medicine. The Sorakaze is our fastest way to get it there.',
      'If the Light-Sail Launcher shines its powerful laser on our sail, it will push us far harder than sunlight can.',
    ],
    steps: [
      {
        goal: 'Fly to the Light-Sail Launcher',
        start: 'Target set: the Light-Sail Launcher.',
        done: 'We have reached the launcher.',
      },
      {
        goal: 'Wait by the launcher while the laser gets ready',
        start: 'Please stay near the launcher. They are aiming the laser.',
        done: 'Ready. The laser is hitting our sail!',
      },
      {
        goal: 'Sail on the laser light',
        start: 'Fly by light sail. The laser pushes far harder than sunlight, so you will shoot ahead.',
        done: 'What speed!',
      },
      {
        goal: 'Fly to the Migrant Fleet',
        start: 'Target set: the Migrant Fleet.',
        done: 'We have reached the Migrant Fleet.',
      },
      {
        goal: 'Stop near the fleet and deliver the medicine',
        start: 'Delivering the medicine. Please hold still.',
        done: 'Delivered! The hospital is sending its thanks.',
      },
    ],
    summary: ['A light sail can be pushed by laser light as well as sunlight.', 'With a powerful laser, a ship can go very fast without carrying fuel.'],
    real: [
      'The Breakthrough Starshot project imagines shining powerful lasers from the ground to speed stamp-sized probes up to about one fifth of the speed of light.',
      'At that speed they would reach Alpha Centauri, the nearest star system (about 4.2 light-years away), in about 20 years.',
      'It is still only research: the giant lasers and the very light, strong sails have yet to be built.',
    ],
    quiz: [
      {
        question: 'How fast does Starshot hope to send its tiny probes?',
        choices: ['About 1/5 the speed of light', 'About as fast as a bullet train', 'Twice the speed of light'],
        answer: 0,
        explanation: 'About 20% of the speed of light. Nothing can travel faster than light.',
      },
      {
        question: 'Which nearby star system is Starshot aiming for?',
        choices: ['Alpha Centauri', 'Sirius', 'Polaris'],
        answer: 0,
        explanation: 'Alpha Centauri is about 4.2 light-years away and includes the stars closest to the Sun.',
      },
    ],
  },

  'sorakaze-dyson': {
    title: 'A sea of light by the Sun',
    client: 'Solar Mirror Power Station',
    briefing: [
      'Close to the Sun there is a swarm of light-collecting satellites: the Dyson Swarm.',
      'The light there is extremely strong. We will race through it by light sail, then deliver parts to the power station.',
    ],
    steps: [
      {
        goal: 'Fly to the Dyson Swarm',
        start: 'Target set: the Dyson Swarm.',
        done: 'We have reached the swarm. The light is dazzling.',
      },
      {
        goal: 'Sail on light near the swarm',
        start: 'Fly by light sail. The light here is dozens of times stronger than near Earth.',
        done: 'You flew through in no time!',
      },
      {
        goal: 'Fly to the Solar Mirror Power Station',
        start: 'Target set: the Solar Mirror Power Station.',
        done: 'We have reached the power station.',
      },
      {
        goal: 'Stop near the station and deliver the parts',
        start: 'Unloading the mirror parts. Please hold still.',
        done: 'Delivered!',
      },
    ],
    summary: ['The closer to the Sun, the stronger the light and the better a light sail moves.', 'The idea of surrounding the Sun with light-collecting satellites is called a Dyson swarm.'],
    real: [
      'The idea of surrounding a star with light-collecting structures was published by physicist Freeman Dyson in 1960.',
      'NASA’s Parker Solar Probe came within about 6.1 million km of the Sun’s surface in 2024.',
      'It was traveling at about 190 km per second, the fastest speed of anything people have ever built.',
    ],
    quiz: [
      {
        question: 'Who published the idea of surrounding the Sun with light-collecting structures?',
        choices: ['Freeman Dyson', 'Galileo', 'Newton'],
        answer: 0,
        explanation: 'In 1960 Dyson suggested that advanced civilizations might gather and use their star’s light.',
      },
      {
        question: 'What is the fastest object people have ever built?',
        choices: ['Parker Solar Probe', 'Voyager 1', 'Apollo 10'],
        answer: 0,
        explanation: 'Parker Solar Probe was sped up by the Sun’s gravity to about 190 km per second.',
      },
    ],
  },

  'meguri-blackhole': {
    title: 'Clocks by the black hole',
    client: 'Fleet science team',
    briefing: [
      'We are going beyond the gate, to the black hole.',
      'Near strong gravity, time runs more slowly. We will check this with the clock on board the Meguri.',
    ],
    steps: [
      {
        goal: 'Fly to the black hole',
        start: 'Target set: the black hole. Warp there, or fly through the gate beyond Neptune.',
        done: 'We have come out near the black hole. Look how its light bends.',
      },
      {
        goal: 'Stay by the black hole and compare clocks',
        start: 'Please stay close. I am comparing the ship’s clock with time signals from the solar system.',
        done: 'The result is in: our clock ran slower than the clocks back in the solar system.',
      },
    ],
    summary: ['The stronger the gravity, the more slowly time passes.', 'Near a black hole the difference becomes very large.'],
    real: [
      'Einstein’s general theory of relativity predicted that gravity slows time, and experiments have confirmed it.',
      'GPS satellite clocks run about 38 microseconds a day fast compared with clocks on the ground, so they are corrected every day.',
      'In 2019, radio telescopes around the world were linked together to take the first picture of a black hole’s shadow.',
    ],
    quiz: [
      {
        question: 'How does time pass where gravity is strong?',
        choices: ['More slowly', 'Faster', 'It stops'],
        answer: 0,
        explanation: 'The stronger the gravity, the slower time runs. Even on Earth there is a tiny difference between a mountaintop and a valley.',
      },
      {
        question: 'When was the first picture of a black hole’s shadow taken?',
        choices: ['2019', '1969', '2000'],
        answer: 0,
        explanation: 'The Event Horizon Telescope imaged the black hole at the center of the galaxy M87.',
      },
    ],
  },

  'meguri-desert': {
    title: 'The desert planet of two suns',
    client: 'Fleet science team',
    briefing: [
      'Beyond the gate there is a desert planet that circles two suns.',
      'We will send a lander down to study the sand.',
    ],
    steps: [
      {
        goal: 'Fly to the desert planet',
        start: 'Target set: the desert planet.',
        done: 'We have reached the desert planet. You can see both suns.',
      },
      {
        goal: 'Send the lander down to the desert planet',
        start: 'Release the lander and set it down on the sand.',
        arrive: 'The lander is on the sand. It casts two shadows!',
        done: 'The lander is back with a sample of sand.',
      },
    ],
    summary: ['On a planet with two suns, things cast two shadows.', 'Many planets beyond our solar system have already been found.'],
    real: [
      'Planets that orbit two stars really exist. Kepler-16b, found in 2011, is one of them.',
      'But Kepler-16b is not a desert world: it is thought to be a cold gas planet about the size of Saturn.',
      'More than 6,000 planets beyond the solar system (exoplanets) have been found.',
    ],
    quiz: [
      {
        question: 'What kind of planet is the real two-sun planet Kepler-16b thought to be?',
        choices: ['A cold gas planet', 'A desert planet', 'An ocean planet'],
        answer: 0,
        explanation: 'It is thought to be a very cold gas planet about the size of Saturn.',
      },
      {
        question: 'What is a common way to find planets around other stars?',
        choices: ['Measure the slight dimming when a planet passes in front of its star', 'Look at the ground with a telescope', 'Send a probe there'],
        answer: 0,
        explanation: 'When a planet crosses in front of its star, the star dims very slightly. This transit method has found thousands of planets.',
      },
    ],
  },

  'meguri-ice': {
    title: 'Landing on the ice planet',
    client: 'Fleet science team',
    briefing: [
      'Another world beyond the gate: a planet covered in ice from pole to pole.',
      'We will set a lander down on the ice and take a look.',
    ],
    steps: [
      {
        goal: 'Fly to the ice planet',
        start: 'Target set: the ice planet.',
        done: 'We have reached the ice planet.',
      },
      {
        goal: 'Send the lander down to the ice planet',
        start: 'Release the lander and set it down on the ice.',
        arrive: 'The lander is on the ice. Fine ice crystals are swirling in the wind.',
        done: 'The lander is back. That completes the Meguri chapter. Well done, Captain.',
      },
    ],
    summary: ['A planet far from its star can freeze over completely.', 'Some icy worlds might hide oceans beneath their ice.'],
    real: [
      'OGLE-2005-BLG-390Lb, announced in 2006, is thought to be an icy planet about 5 times Earth’s mass with a surface around −220 °C.',
      'It was found by gravitational microlensing, where a nearer star’s gravity brightens the light of a more distant star.',
    ],
    quiz: [
      {
        question: 'What is it called when a nearer star’s gravity makes a more distant star look brighter?',
        choices: ['Gravitational microlensing', 'An eclipse', 'An aurora'],
        answer: 0,
        explanation: 'Gravity bends light. The nearer star focuses the light like a lens, and a planet around it leaves a mark in how the brightness changes.',
      },
      {
        question: 'Which solar system world is thought to have an ocean under its ice?',
        choices: ['Europa', 'Mercury', 'Venus'],
        answer: 0,
        explanation: 'Europa and Enceladus are thought to have oceans under their ice. Icy planets around other stars might too.',
      },
    ],
  },
  'finale-observe': {
    title: 'Observe the gate',
    client: 'Fleet command',
    briefing: [
      'The signal picked up by the Europa Beacon came from the space-time gate beyond Neptune.',
      'The gate is unstable, and it only stays passable for short spells. The whole six-ship fleet will work together to open it for good.',
      'First, the Amatsukaze’s observatory will study the gate closely.',
    ],
    steps: [
      {
        goal: 'Fly to the space-time gate',
        start: 'Target set: the space-time gate.',
        done: 'We have reached the gate. Its rim is flickering faintly.',
      },
      {
        goal: 'Frame the gate and take its photo',
        start: 'Bring the gate into the photo frame and hold it there.',
        done: 'Got it. The photos show that to steady the gate we need a powerful energy core and a beacon to mark its position.',
      },
    ],
    summary: ['To steady the gate we need an energy core and a beacon.', 'All six ships will prepare, each using its own special skill.'],
    real: [
      'Wormholes (tunnels through space-time) come from the equations of Einstein’s general theory of relativity.',
      'No real wormhole has ever been found. Even if one existed, it would probably be very unstable.',
    ],
    quiz: [
      {
        question: 'Which theory’s equations gave us the idea of wormholes?',
        choices: ['General relativity', 'Evolution', 'Continental drift'],
        answer: 0,
        explanation: 'Einstein’s general relativity has solutions that look like tunnels linking faraway places.',
      },
      {
        question: 'Have real wormholes been found?',
        choices: ['Not yet', 'Many of them', 'There is one in our solar system'],
        answer: 0,
        explanation: 'They are possible on paper, but none has ever been found. The gate in this chapter is science fiction.',
      },
    ],
  },

  'finale-core': {
    title: 'Deliver the energy core',
    client: 'Lunar Shipyard',
    briefing: [
      'The Lunar Shipyard has finished a huge energy core to steady the gate.',
      'It is very heavy. Carry it in the Hakobune and ease it into the gate’s docking ring.',
    ],
    steps: [
      {
        goal: 'Fly to the Lunar Shipyard',
        start: 'Target set: the Lunar Shipyard.',
        done: 'We have reached the shipyard.',
      },
      {
        goal: 'Stop near the shipyard and load the core',
        start: 'Please hold still while we load the core.',
        done: 'Loaded. The ship feels much heavier now.',
      },
      {
        goal: 'Fly to the space-time gate',
        start: 'Target set: the gate. Warping is fine.',
        done: 'We have reached the gate. The docking ring is in view.',
      },
      {
        goal: 'Ease into the docking ring and stop',
        start: 'Slowly enter the middle of the ring and come to a stop.',
        done: 'The core is installed! The flicker around the gate’s rim has calmed a little.',
      },
    ],
    summary: ['Heavy cargo is moved slowly and stopped slowly.', 'The energy core is now fitted to the gate.'],
    real: [
      'Big structures in space are built by bringing up parts one at a time and assembling them there.',
      'The International Space Station took more than 40 launches and over ten years to assemble.',
    ],
    quiz: [
      {
        question: 'How was the International Space Station built?',
        choices: ['Parts were carried up many times and assembled in space', 'It was built on the ground and launched in one go', 'It was built on the Moon'],
        answer: 0,
        explanation: 'It was far too big for one launch, so its parts were carried up in more than 40 trips and assembled in orbit.',
      },
      {
        question: 'How does a heavy ship stop in space?',
        choices: ['It fires its engine the other way', 'It uses brakes', 'It stops on its own'],
        answer: 0,
        explanation: 'With no air or ground to push on, the only way to stop is to fire the engine backward. The heavier the ship, the longer the burn.',
      },
    ],
  },

  'finale-buoy': {
    title: 'Place the marker buoy',
    client: 'Fleet command',
    briefing: [
      'We will place a marker buoy so ships going through the gate never lose their way.',
      'Carry the buoy in the White Heron’s survey craft and set it beside the gate.',
    ],
    steps: [
      {
        goal: 'Fly to the space-time gate',
        start: 'Target set: the gate.',
        done: 'We have reached the gate.',
      },
      {
        goal: 'Launch a craft to the gate and place the buoy',
        start: 'Once you are close, launch a survey craft.',
        arrive: 'The craft has placed the buoy. It lights up and starts sending its position signal.',
        done: 'Buoy in place. Now we know exactly where the gate is.',
      },
    ],
    summary: ['In space, beacons that send signals help ships know where they are.'],
    real: [
      'To track faraway probes, big antennas on Earth send radio signals and time how long the reply takes to come back.',
      'NASA’s Deep Space Network has antennas in the USA, Spain and Australia, so as Earth turns one of them can always talk to a probe.',
    ],
    quiz: [
      {
        question: 'How is the distance to a faraway probe measured?',
        choices: ['By timing a radio signal’s round trip', 'With a tape measure', 'By how big it looks in a telescope'],
        answer: 0,
        explanation: 'Radio waves travel at the speed of light, so the round-trip time tells you the distance.',
      },
      {
        question: 'Why are NASA’s deep-space antennas in three places around the world?',
        choices: ['So one can always reach a probe as Earth turns', 'To avoid the rain', 'Because those countries are the same size'],
        answer: 0,
        explanation: 'As Earth spins, a single antenna loses sight of a probe for part of the day. With three sites, one is always in contact.',
      },
    ],
  },

  'finale-light': {
    title: 'The last part, by light sail',
    client: 'Lunar Shipyard',
    briefing: [
      'One last light but important part is needed to tune the gate. It has to get there fast.',
      'The Light-Sail Launcher’s laser will give the Sorakaze a huge boost.',
    ],
    steps: [
      {
        goal: 'Fly to the Light-Sail Launcher',
        start: 'Target set: the Light-Sail Launcher.',
        done: 'We have reached the launcher. The laser is hitting our sail!',
      },
      {
        goal: 'Sail on the laser light',
        start: 'Fly by light sail. You will pick up speed fast.',
        done: 'That is plenty of speed!',
      },
      {
        goal: 'Fly to the space-time gate',
        start: 'Target set: the gate.',
        done: 'We have reached the gate.',
      },
      {
        goal: 'Stop near the gate and deliver the part',
        start: 'Unloading the part. Please hold still.',
        done: 'Delivered! Now all that is left is to switch the gate on.',
      },
    ],
    summary: ['Light cargo can be carried very fast with a light sail and a laser.'],
    real: [
      'The lighter a light sail is, the faster it speeds up, so its cargo has to be very light too.',
      'The Starshot project imagines probes the size of a postage stamp that weigh just a few grams.',
    ],
    quiz: [
      {
        question: 'What kind of ship speeds up best on a light sail?',
        choices: ['A light one', 'A heavy one', 'One with a big engine'],
        answer: 0,
        explanation: 'Light pushes very gently, so the lighter the ship, the faster it speeds up.',
      },
      {
        question: 'How heavy are Starshot’s planned probes?',
        choices: ['A few grams', 'A few tonnes', 'A few hundred kilograms'],
        answer: 0,
        explanation: 'About the size of a postage stamp and a few grams in weight, so they can reach about one fifth of the speed of light.',
      },
    ],
  },

  'finale-open': {
    title: 'Open the gate',
    client: 'Fleet command',
    briefing: [
      'Everything is ready. Last of all, the Solar Voyager’s beam will light the three activation lights around the gate.',
      'The whole fleet is watching. Captain, over to you.',
    ],
    steps: [
      {
        goal: 'Fly to the space-time gate',
        start: 'Target set: the gate.',
        done: 'We have reached the gate. Three orange lights glow around the ring.',
      },
      {
        goal: 'Hit the three activation lights with the beam',
        start: 'Put an orange light in your sights and fire with F or a click (the beam button on a phone).',
        hits: ['The first one is lit!', 'The second! Just one more.'],
        done: 'All three are lit! The gate begins to glow softly, and the view through the ring turns into the sky of a faraway star. The gate is open and steady!',
      },
    ],
    summary: ['Together, the six ships’ skills opened the gate.', 'What one ship cannot do alone, a fleet can.'],
    real: [
      'Real space exploration is also carried out by many countries and people working together.',
      'The International Space Station is run by 15 countries, including the USA, Russia, Japan, Canada and European nations.',
    ],
    quiz: [
      {
        question: 'About how many countries work together on the International Space Station?',
        choices: ['15', '1', '100'],
        answer: 0,
        explanation: 'The USA, Russia, Japan, Canada and 11 member countries of the European Space Agency: 15 in all.',
      },
      {
        question: 'What is the name of Japan’s laboratory module on the space station?',
        choices: ['Kibo', 'Hayabusa', 'Himawari'],
        answer: 0,
        explanation: 'Kibo, which means “hope”, is the largest laboratory module on the station.',
      },
    ],
  },

  'finale-beyond': {
    title: 'Beyond the gate',
    client: 'Everyone in the fleet',
    briefing: [
      'The gate is open. The first ship through will be the Meguri, built for long journeys.',
      'Go through the gate to the planet of two suns and make the fleet’s first landing.',
    ],
    steps: [
      {
        goal: 'Fly to the space-time gate',
        start: 'Target set: the gate.',
        done: 'We are in front of the gate. The whole fleet is seeing us off.',
      },
      {
        goal: 'Go through the gate to the planet of two suns',
        start: 'Target set: the planet of two suns. Fly straight into the ring, or warp.',
        done: 'We have reached the planet of two suns.',
      },
      {
        goal: 'Send down the lander',
        start: 'Release the lander. This is the fleet’s first step.',
        arrive: 'The lander has touched down. Two suns are slowly setting.',
        done: 'The lander is back. Captain, that is the end of the fleet’s story. Each of the six ships’ skills brought us here. Well done!',
      },
    ],
    summary: ['The fleet took its first step on a planet beyond the gate.', 'The journey was only possible because every ship had its own skill.'],
    real: [
      'The Moon is still the only world beyond Earth where people have set foot (the Apollo missions, 1969–1972).',
      'NASA’s Artemis program is preparing to send people back to the Moon.',
    ],
    quiz: [
      {
        question: 'Besides Earth, where have people set foot?',
        choices: ['Only the Moon', 'The Moon and Mars', 'Nowhere yet'],
        answer: 0,
        explanation: 'Twelve astronauts walked on the Moon during the Apollo missions from 1969 to 1972.',
      },
      {
        question: 'What is the US program to send people back to the Moon called?',
        choices: ['Artemis', 'Apollo', 'Voyager'],
        answer: 0,
        explanation: 'In Greek myth, Artemis is the twin sister of Apollo.',
      },
    ],
  },
}

export const chaptersEn: Translation<ChaptersJa> = {
  'sv01-real': { title: 'Solar Voyager’s chapter', skill: 'Beam', how: 'Press F or click (the beam button on a phone) to fire the beam where you aim.', intro: 'The basic missions around the solar system: eight requests, from the Moon to Pluto.' },
  'amatsu-real': {
    title: 'Amatsukaze: the observatory ship',
    skill: 'Observatory photos',
    how: 'Bring the target inside the camera frame on the screen and hold it for a few seconds. Too close or too far and the photo will not work.',
    intro: 'Record Jupiter’s storm, a solar eclipse and Saturn’s rings from the deck observatories.',
  },
  'hakobune-real': {
    title: 'Hakobune: heavy cargo',
    skill: 'Docking a heavy ship',
    how: 'Cargo makes the ship heavy and slow to gain speed. Fly the last part into the glowing docking ring yourself, slowly, and stop.',
    intro: 'Deliver ice from the Moon and from Saturn’s rings to the places that need it.',
  },
  'amatsu-sf': { title: 'Amatsukaze, SF: landmarks of the future', skill: 'Observatory photos', how: 'Bring the target inside the camera frame and hold it for a few seconds.', intro: 'Photograph the landmarks of the SF world: the Moon Capital, the Radio Telescope Moon and the Galactic Railway.' },
  'hakobune-sf': { title: 'Hakobune, SF: shipping in future space', skill: 'Docking a heavy ship', how: 'Cargo makes the ship heavy. Fly the last part into the glowing docking ring yourself, slowly, and stop.', intro: 'Carry asteroid metal to the shipyard, then final supplies to the departing generation ship.' },
  'heron-real': {
    title: 'White Heron: The Survey Carrier',
    skill: 'Launch survey craft',
    how: 'When you get close to the target, a “Launch” button appears. Press it or L to send a survey craft out of the hangar in her legs.',
    intro: 'Send survey craft to Jupiter’s four big moons and to Saturn’s moons.',
  },
  'sorakaze-real': {
    title: 'Sorakaze: Sailing on Light',
    skill: 'Sail on light',
    how: 'Sunlight pushes the ship. She is faster near the Sun and slower far from it. In light-sail steps, the distance you fly yourself is counted.',
    intro: 'Feel how sunlight changes from Mercury out to Jupiter.',
  },
  'meguri-real': {
    title: 'Meguri: Sending Down the Lander',
    skill: 'Send down the lander',
    how: 'Near a world, press “Send down the lander” or L. The lander goes down to the surface, takes a look and comes back.',
    intro: 'Land beside Titan’s methane lakes and on Europa’s ice.',
  },
  'heron-sf': {
    title: 'White Heron SF: A Rescue and a Strange Signal',
    skill: 'Launch survey craft',
    how: 'When you get close to the target, a “Launch” button appears. In this chapter the craft brings something back with it.',
    intro: 'Rescue a drifting work mech and bring back the Europa Beacon’s signal.',
  },
  'sorakaze-sf': {
    title: 'Sorakaze SF: Lasers and a Sea of Light',
    skill: 'Sail on light',
    how: 'The stronger the light, the faster you go. The launcher’s laser and the Dyson Swarm’s light give you a big boost.',
    intro: 'Rush medicine by laser sail and race through the sea of light by the Sun.',
  },
  'meguri-sf': {
    title: 'Meguri SF: Beyond the Gate',
    skill: 'Send down the lander',
    how: 'Near a world, press “Send down the lander” or L to set the lander down on the surface.',
    intro: 'Measure time by the black hole beyond the gate, and land on planets of faraway stars.',
  },
  'finale-sf': {
    title: 'Finale SF: Opening the Gate',
    skill: 'Every ship’s skill',
    how: 'You switch between the fleet’s six ships from mission to mission.',
    intro: 'The beacon’s signal led to the space-time gate. Combine all six ships’ skills to open it.',
  },
}
