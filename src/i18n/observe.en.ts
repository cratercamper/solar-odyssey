import type { observeJa } from './observe.ja'
import type { Translation } from './translation'
import { theEn } from './article'

// The texts of state/observe.ts (English). Same keys as observe.ja.ts

export const observeEn: Translation<typeof observeJa> = {
  tooFar: (name: string) => `Get closer to ${theEn(name)} first (warp or autopilot)`,
  noTarget: 'Choose a target and get close to it first',
  insideStructure: 'Not available inside a structure',
  observing: (name: string) => `Observing ${theEn(name)}`,
  atPortEntrance: 'At the port entrance. Thrust forward (W) to go inside',
}
