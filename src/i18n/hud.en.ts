import type { hudJa } from './hud.ja'
import type { Translation } from './translation'
import { theEn } from './article'

// The texts of ui/Hud.tsx (English). Same keys as hud.ja.ts

export const hudEn: Translation<typeof hudJa> = {
  landOn: (name: string) => `Land on ${theEn(name)}`,
  aboveClouds: 'above the clouds of',
  aboveStarSurface: 'above the surface of',
  aboveGround: 'above the surface of',
  diveDepth: (name: string, km: string, bar: string, celsius: number) => `About ${km} km under the clouds of ${theEn(name)} · ${bar} bar · ${celsius} °C`,
  altitude: (name: string, where: string, altitudeKm: string) => `About ${altitudeKm} km ${where} ${theEn(name)}`,
  diameterVsShip: (big: boolean, timesEarth: string, timesShip: string) => `Diameter: ${big ? `about ${timesEarth} × Earth, ` : ''}about ${timesShip} × this ship`,
  closeUpNote: (zoom: number, name: string) => `Close-up zoom: the ship is shown at 1/${zoom} so ${theEn(name)} looks closer to its real size`,
  hideSizeComparison: 'Hide size comparison',
  compareSizes: 'Compare sizes',
  backOffHint: 'Back off a little to see them side by side',
  lightTimeNote: (name: string, minutes: number, underAYear: boolean, months: number, years: number, manyMonths: boolean, manyYears: boolean) => `Even real light takes about ${minutes} minutes from the Sun to ${theEn(name)}. A real probe would take about ${underAYear ? `${months} month${manyMonths ? 's' : ''}` : `${years} year${manyYears ? 's' : ''}`}.`,
  warpFictionNote: ' (Warp is imaginary technology.)',
  mapTouchHint: 'Drag to rotate · pinch to zoom · tap a name to target it',
  galleryTouchHint: 'Drag to rotate · pinch to zoom',
  flyTouchHint: 'Left stick to move · drag the screen to turn',
  mapMouseHint: 'Drag to rotate · scroll to zoom · click a name to target it',
  galleryMouseHint: 'Viewing mode: drag to rotate · scroll to zoom · V to go back',
  clickToFly: 'Click to start flying (Esc to release)',
  moveKeysHint: 'W/S forward/back · A/D left/right · Space/Shift up/down · Q/E roll · mouse to steer',
  actionKeysHint: 'F or click to fire the beam (hold to charge) · I for the ship’s log · C to switch camera',
  thrustKeysHint: 'Mouse wheel to change thrust (speed) · O to observe the target up close',
  speed: 'Speed',
  cockpit: 'Cockpit',
  map: 'Map',
  leaveBridge: '◀ Leave the bridge',
  enterBridge: 'Enter the bridge',
  launchLander: 'Launch lander',
  viewShip: 'View the ship',
  lookThrough: (scopeNear: string) => `Look through ${theEn(scopeNear)}`,
  warpFactor: (warpFactor: number) => `Warp ${warpFactor}`,
  destination: (name: string) => `To ${theEn(name)}`,
  bigNumber: (n: number) => (n >= 1e9 ? `${Number((n / 1e9).toPrecision(2))} billion` : n >= 1e6 ? `${Number((n / 1e6).toPrecision(2))} million` : n >= 1e4 ? (Math.round(n / 1e4) * 1e4).toLocaleString('en-US') : null),
}
