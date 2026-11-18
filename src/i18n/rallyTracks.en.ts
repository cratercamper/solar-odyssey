import type { RallyTracksJa } from './rallyTracks.ja'
import type { Translation } from './translation'

// The texts of data/rallyTracks.ts (English). Same keys as rallyTracks.ja.ts

export const rallyTracksEn: Translation<RallyTracksJa> = {
  coprates: {
    title: 'Canyon trial',
    intro: 'Four rovers race about 1.2 km along the canyon floor. Pass the light gates in order to the finish. Driving onto rocks lifts the wheels: you slow down and can’t steer. Jump over them!',
    button: 'Canyon race',
    home: 'To Gale crater',
  },
  taurus: {
    title: 'Moon valley chase',
    intro: 'A chase through the valley where Apollo 17 landed! Three rovers get a head start: catch up and touch them before the finish, about 1.6 km away. Gravity is 1/6 of Earth’s, so jumps are long: in the air, ◀▶ thrusts you sideways and ▼ brings you down sooner.',
    button: 'Moon chase',
    home: 'Back to the landing site',
  },
  conamaraEasy: {
    title: 'Europa ice drift race (easy)',
    intro: 'Race about 1.6 km along the trough of a Europa ice ridge! Few gates and gentle bends: keep your foot down and let the back end slide through the corners (if it slides too far, steer a little the other way). Drive up the tilted ice slabs and you fly off their edge onto the higher ice behind them. Gravity is about 1/7 of Earth’s, so the 15 m slab sends you flying for a long time.',
    button: 'Ice race',
    home: 'Back to the landing site',
  },
  conamara: {
    title: 'Europa ice drift race (hard)',
    intro: 'Race about 1.7 km along the trough of a Europa ice ridge! The ice is slick: steer hard at speed and the back end slides out. When it starts to slide, steer a little the other way to catch it (counter-steer). Ease off before the corners. Gravity is about 1/7 of Earth’s, so the jumps send you flying.',
    button: 'Ice race',
    home: 'Back to the landing site',
  },
}
