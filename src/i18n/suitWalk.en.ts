import type { Translation } from './translation'
import type { suitWalkJa } from './suitWalk.ja'

// Walking in the spacesuit (components/surface/SuitWalk.tsx, SuitWalkPanel.tsx), English

export const suitWalkEn: Translation<typeof suitWalkJa> = {
  button: '👨‍🚀 Step outside',
  buttonTip: 'Leave the lander and walk on your own feet',
  back: 'Back to the lander',
  /** Button next to the pressurized rover (E key on PC) */
  boardCrew: '🚐 Board Michikake',
  boardCrewKey: 'Or press E',
  run: 'Run',
  jump: 'Jump',
  hintPc: 'WASD to walk · Shift to run · Space to jump · drag to look around',
  hintTouch: 'Left stick to walk · drag to look around',
  gait: {
    walk: (g: string) => `Gravity ${g} G. You can walk just like on Earth`,
    hop: (g: string) => `Gravity ${g} G. Lope like the Apollo astronauts, bounding from foot to foot`,
    float: (g: string) => `Gravity ${g} G. One push and you float up off the ground`,
  },
  edge: 'You are too far from the lander',
  steps: (n: number) => `Footprints ${n}`,
}
