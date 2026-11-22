import type { probePanelJa } from './probePanel.ja'
import type { Translation } from './translation'

// The texts of ui/ProbePanel.tsx (English). Same keys as probePanel.ja.ts

export const probePanelEn: Translation<typeof probePanelJa> = {
  distanceToday: (today: string, au: number, _au2: number, hours: number, au3: string) => `Today (${today}) it is about ${au} AU from the Sun, about ${au3} billion km. Its radio signals take about ${hours} hours to reach us.`,
  probeJourneys: 'Probe journeys',
  separator: ': ',
  close: 'Close',
  introNote: 'Replay the paths real probes took, starting on launch day. The planets move to where they really were on each date.',
  sunDistancePrefix: 'About ',
  sunDistanceSuffix: ' AU from the Sun',
  replay: 'Replay',
  pause: 'Pause',
  play: 'Play',
  otherProbes: 'Other probes',
  realPathNote: 'The path is the real one, from NASA JPL Horizons. Tap an event to jump to that day.',
  pathsNote: 'The paths are rough shapes made by joining the bodies each probe passed with arcs around the Sun. The dates and the bodies visited are real.',
}
