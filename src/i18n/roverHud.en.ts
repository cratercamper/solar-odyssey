import type { roverHudJa } from './roverHud.ja'
import type { Translation } from './translation'

// The texts of components/surface/RoverHud.tsx (English). Same keys as roverHud.ja.ts

export const roverHudEn: Translation<typeof roverHudJa> = {
  heading: 'HDG',
  tilt: 'TILT',
  distance: 'DIST',
  rock: 'ROCK',
  done: 'done',
  air: 'AIR',
  rcsTip: 'Thruster propellant (◀▶ and ▼ in the air)',
  rcs: 'RCS',
  airReserve: '▼ only',
  cruise: (kmh: number) => `Cruise ${kmh} km/h`,
  cruiseTip: 'Wheel changes the speed · ▼ stops · C brings it back',
  mouseOff: 'Click the view to drive with the mouse',
  mouseOn: 'Mouse steers · Wheel cruise speed · Right click jump (hold for higher) · In the air: right button or wheel back sinks · Left click sample · Esc frees the mouse',
  showMinimap: 'Show the minimap',
  map: 'Map',
  minimap: 'Minimap',
  hideMinimap: 'Hide the minimap',
  near: 'Near',
  all: 'All',
}
