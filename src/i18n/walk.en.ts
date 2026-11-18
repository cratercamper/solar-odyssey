// components/walk/WalkView.tsx・state/walk.ts の文言（英語）
import type { walkJa } from './walk.ja'
import type { Translation } from './translation'

export const walkEn: Translation<typeof walkJa> = {
  park: 'Park by the pond',
  gravity: '1 g from the spin',
  day: 'Day',
  dusk: 'Dusk',
  night: 'Night',
  backToShip: 'Back to the ship',
  view: 'View',
  viewChase: 'Behind',
  viewEye: 'My eyes',
  sit: 'Sit on the bench',
  stand: 'Stand up',
  jump: 'Jump',
  run: 'Run',
  ride: 'Hover scooter',
  rideOff: 'Get off the scooter',
  boost: 'Boost',
  hop: 'Hop',
  kmh: (v: number) => `${v} km/h`,
  waterNote: 'You cannot get off over the water. Ride to the shore first',
  rideHint: 'W go · S brake/back · A D steer · Shift boost · Space hop · Mouse look · F get off',
  walkTo: (name: string) => `Go down and walk in ${name}`,
  keysHint: 'W A S D walk · Shift run · Space jump · Mouse look (click to lock) · Wheel distance · E sit · F hover scooter · V view · J ship',
  arrived: (name: string) => `You are in a park in ${name}. Look up: the land on the far side is your sky`,
}
