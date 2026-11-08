import type { BridgePartsJa } from './bridgeParts.ja'
import type { Translation } from './translation'

// The texts of data/bridgeParts.ts (English). Same keys as bridgeParts.ja.ts

export const bridgePartsEn: Translation<BridgePartsJa> = {
  captain: {
    name: 'Captain’s chair',
    text: 'The seat of the person who decides where the ship goes. It sits in the lower middle of the room, with a clear view of the window and every other station. The armrests have small control panels.',
  },
  seats: {
    name: 'Side seats',
    text: 'Seats for the advisers beside the captain. The low consoles between them show the ship’s status and course.',
  },
  helm: {
    name: 'Helm',
    text: 'The station that steers the ship and sets its speed. Its screen shows the target, distance, time to arrival and warp status.',
  },
  ops: {
    name: 'Operations',
    text: 'This station watches the ship’s machines and power: warp core output, shields and life support.',
  },
  window: {
    name: 'Front window',
    text: 'A large curved glass window. Press Z (or “Zoom”) to turn the glass into a big screen showing the target through a telescope. Real spacecraft windows tend to be small and thick to block radiation.',
  },
  skylight: {
    name: 'Skylight',
    text: 'A round window in the ceiling. You can see the stars overhead and the anti-collision light blinking on top of the ship.',
  },
  tactical: {
    name: 'Defence and sensors',
    text: 'The long desk behind the rail. It watches nearby bodies on radar and manages the shields. This is a survey ship, so observing matters more than weapons.',
  },
  rail: {
    name: 'Wooden rail',
    text: 'The rail between the lower centre and the raised aft deck. Real wood makes even a starship feel calm. Gentle ramps on each side lead up and down.',
  },
  map: {
    name: 'Solar system map',
    text: 'The big screen on the back wall shows where the planets are now, seen from above, with this ship marked by a square. Distances are squeezed so the inner planets show.',
  },
  stations: {
    name: 'Wall stations',
    text: 'Engineering, science, environment and records. The science screen shows facts about the target; the environment screen shows cabin temperature and oxygen.',
  },
  lift: {
    name: 'Lift and plaque',
    text: 'The doors on each side lead to lifts that move through the ship. The plaque beside the left door carries the ship’s name: “SV-01 Solar Voyager, survey vessel”.',
  },
}
