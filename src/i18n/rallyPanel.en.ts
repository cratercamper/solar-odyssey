import type { rallyPanelJa } from './rallyPanel.ja'
import type { Translation } from './translation'

// The texts of components/surface/RallyPanel.tsx (English). Same keys as rallyPanel.ja.ts

export const rallyPanelEn: Translation<typeof rallyPanelJa> = {
  roverColour: 'Rover colour',
  best: 'Best',
  start: 'Start',
  preparingRover: 'Getting the rover ready…',
  onYourMarks: 'On your marks',
  roversCaught: 'Rovers caught',
  caughtPrefix: 'Caught ',
  placeSuffix: '',
  finish: 'Finish',
  nextFinish: 'Next: finish',
  gateOfGates: (gate: number, gates: number) => `Gate ${gate}/${gates}`,
  finishSplit: 'Finish!',
  gateSplit: (gate: number) => `Gate ${gate}`,
  caughtRover: (name: string) => `Caught ${name}!`,
  missedGate: 'You missed a gate',
  missedGateHint: 'Head back to the arrowed gate, or press R (Back) to return to the last gate',
  caughtAll: 'You caught all three! 🏆',
  caughtSome: (count: number) => `You caught ${count} of 3`,
  youWon: 'You won! 🏆',
  finishedPlace: (place: number) => `Finished ${['1st', '2nd', '3rd', '4th'][place - 1]}`,
  newPersonalBest: 'New personal best!',
  bestTime: (best: string) => `Best ${best}`,
  caught: 'Caught!',
  gotAway: 'Got away',
  you: 'You',
  freeDrive: 'Free drive',
  raceAgain: 'Race again',
  backToLastGate: 'Back to the last gate',
  back: 'Back',
  quitRace: 'Quit race',
}
