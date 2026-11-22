import type { skyFlightJa } from './skyFlight.ja'
import type { Translation } from './translation'

// components/flight/FlightPanel.tsx strings (English): flying the lander over the Moon

export const skyFlightEn: Translation<typeof skyFlightJa> = {
  title: '✈ Fly over the Moon',
  start: '✈ Fly',
  startTip: 'Take off in the lander and fly freely over the Moon. Fly all the way around to earn a title',
  loading: 'Loading the map of the whole Moon…',
  failed: 'Could not load the Moon map. Check your connection and try again.',
  altitude: 'Altitude',
  speed: 'Speed',
  slower: 'Slower',
  faster: 'Faster',
  m: (n: number) => `${n} m`,
  km: (n: number | string) => `${n} km`,
  kmh: (n: number) => `${n} km/h`,
  kms: (n: string) => `${n} km/s`,
  lap: 'Lap',
  onCourse: 'On course for the lap',
  turnRight: (deg: number) => `Lap course: ${deg}° to the right`,
  turnLeft: (deg: number) => `Lap course: ${deg}° to the left`,
  best: (time: string, times: number) => `Fastest lap ${time} (${times} ${times === 1 ? 'lap' : 'laps'})`,
  lapped: '🌕 You flew all the way around the Moon!',
  lapTime: (time: string) => `Time ${time}`,
  ok: 'OK',
  keys: 'W / S (↑↓): climb / dive   A / D (←→): turn   E / Q or wheel: speed   Drag: look around. The higher you fly, the faster you can go',
  restart: 'Start a lap from here',
  restartTip: 'Measure a new lap in the direction you are facing now',
  back: 'Back to the landing site',
  toSpace: 'Back to space',
  navButton: '✈ Fly over the Moon',
  saveLaps: 'Laps around the Moon',
  saveGear: 'Moon flight speed',
}
