import type { timeBarJa } from './timeBar.ja'
import type { Translation } from './translation'

// The texts of components/surface/TimeBar.tsx (English). Same keys as timeBar.ja.ts

export const timeBarEn: Translation<typeof timeBarJa> = {
  degrees: (t: number) => `${t} °C`,
  dayInEarthHours: (h: string) => `1 day = ${h} Earth hours`,
  dayInEarthDays: (h: string) => `1 day ≈ ${h} Earth days`,
  newMoon: 'New moon',
  fullMoon: 'Full moon',
  firstQuarter: 'First quarter',
  lastQuarter: 'Last quarter',
  waxingCrescent: 'Waxing crescent',
  waningCrescent: 'Waning crescent',
  waxingGibbous: 'Waxing gibbous',
  waningGibbous: 'Waning gibbous',
  moonFromEarth: 'The Moon from Earth now',
  earthPhase: (earthFull: boolean) => `Earth in this sky looks ${earthFull ? 'full-ish' : 'thin'}`,
  luxLarge: (lx: number) => `~${Math.round(lx / 1000)}k`,
  luxValue: (lx: number | string) => `~${lx}`,
  brightSummerSun: 'bright summer sun',
  overcastDay: 'an overcast day',
  brightRoom: 'a bright room',
  dusk: 'dusk',
  fullMoonNight: 'a full-moon night',
  starlightOnly: 'starlight only',
  luxUnit: ' lux',
  ground: 'Ground',
  light: 'Light',
  luxLike: (like: string) => `About like ${like}`,
  groundTemp: 'Ground temp',
  night: 'Night',
  weather: 'Weather',
  localTime: 'Local time',
  rate: { pause: 'Pause', sixMinutes: '1 s = 6 min', dayPerMinute: '1 day / min' },
  jump: { noon: 'Noon', sunset: 'Sunset', night: 'Night' },
  weatherButton: {
    mars: { auto: 'Auto', storm: 'Storm', clear: 'Clear' },
    earth: { auto: 'Auto', storm: 'Sandstorm', clear: 'Clear' },
    titan: { auto: 'Auto', storm: 'Rain', clear: 'Stop' },
  },
  weatherNow: {
    mars: { strong: 'Dust storm', weak: 'Dusty', calm: 'Clear' },
    earth: { strong: 'Sandstorm', weak: 'Windy', calm: 'Clear' },
    titan: { strong: 'Methane rain', weak: 'Drizzle', calm: 'Hazy' },
  },
}
