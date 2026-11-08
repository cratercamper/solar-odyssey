import type { EvaJobsJa } from './evaJobs.ja'
import type { Translation } from './translation'

// The texts of state/evaJobs.ts (English). Same keys as evaJobs.ja.ts

export const evaJobsEn: Translation<EvaJobsJa> = {
  hole: {
    name: 'Patch a micrometeoroid hole',
    note: 'Space-station modules carry “Whipple shields”: thin bumper sheets spaced away from the wall that shatter incoming specks of dust. In 2021 a small hole was found in the Canadarm2 robotic arm, which kept on working.',
    steps: [
      { text: 'Trim the torn edges with the cutter' },
      { text: 'Pick up a patch plate from the parts rack with the suction pad' },
      { text: 'Hold the patch over the hole' },
      { text: 'Weld around the patch' },
    ],
  },
  panel: {
    name: 'Refasten a loose hull panel',
    note: 'In orbit a bolt you let go of simply drifts away. Spacewalk tools are tethered, and bolts are made “captive” so they stay in their holes even when loosened.',
    steps: [
      { text: 'Hold the loose panel down with the suction pad' },
      { text: 'Drive the bolts back in with the drill' },
    ],
  },
  cable: {
    name: 'Reconnect a loose cable',
    note: 'Spacesuit gloves are thick and stiff. Connectors used outside are built with big knobs and handles so they can be gripped and turned with gloved hands.',
    steps: [{ text: 'Cut off the scorched end of the cable' }, { text: 'Plug the connector back in' }],
  },
  antenna: {
    name: 'Realign an antenna',
    note: 'A high-rate antenna loses signal if it points even slightly off. The space station’s dish keeps tracking relay satellites automatically to stay in touch with the ground.',
    steps: [
      { text: 'Loosen the locking bolt' },
      { text: 'Turn the dish back to the right direction' },
      { text: 'Tighten the locking bolt' },
    ],
  },
  radiator: {
    name: 'Repair a cracked radiator',
    note: 'A small round “stop hole” drilled at the tip of a crack keeps it from spreading — the same trick is used on aircraft. Welding outside a spacecraft was first tried in 1984 by Soviet cosmonauts including Svetlana Savitskaya.',
    steps: [{ text: 'Drill a stop hole at the tip of the crack' }, { text: 'Weld the crack shut' }],
  },
  sensor: {
    name: 'Replace a broken sensor',
    note: 'Many station parts are “orbital replacement units” (ORUs): boxes swapped out whole when they fail. Canada’s robot Dextre does some of these swaps outside, so astronauts don’t have to.',
    steps: [
      { text: 'Back out the stuck bolts with the drill' },
      { text: 'Pull out the broken sensor and stow it' },
      { text: 'Take a new sensor from the parts rack' },
      { text: 'Plug in the new sensor' },
    ],
  },
}
