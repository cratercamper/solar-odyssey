import type { Translation } from './translation'
import type { todayJa } from './today.ja'

// ui/TodayPanel.tsx texts (English). Today in space: the Moon's phase, planets in tonight's sky, where the probes are

const dist = (km: number) =>
  km >= 1e9 ? `about ${Number((km / 1e9).toPrecision(3))} billion km` : `about ${Number((km / 1e6).toPrecision(km >= 1e8 ? 3 : 2))} million km`
const light = (sec: number) => (sec < 60 ? `${Math.round(sec)} seconds` : sec < 3600 ? `${Math.round(sec / 60)} minutes` : `${Number((sec / 3600).toPrecision(2))} hours`)

export const todayEn: Translation<typeof todayJa> = {
  title: 'Today in space',
  navButton: 'Today in space',
  close: 'Close',
  date: (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  moonTitle: 'Tonight’s Moon',
  phase: {
    new: 'New Moon',
    waxingCrescent: 'Waxing crescent',
    firstQuarter: 'First quarter (right half lit)',
    waxingGibbous: 'Waxing gibbous',
    full: 'Full Moon',
    waningGibbous: 'Waning gibbous',
    lastQuarter: 'Last quarter (left half lit)',
    waningCrescent: 'Waning crescent',
  },
  moonAge: (age: number, lit: number) => `${age.toFixed(1)} days since New Moon, about ${Math.round(lit * 100)}% lit`,
  moonWhen: {
    new: 'It is in the same direction as the Sun, so you can hardly see it today.',
    waxingCrescent: 'Look west in the evening, just after sunset.',
    firstQuarter: 'It is in the south at sunset and sets around midnight.',
    waxingGibbous: 'Visible from evening until after midnight.',
    full: 'It rises in the east at sunset and is up all night.',
    waningGibbous: 'It rises after dark and stays up until morning.',
    lastQuarter: 'It rises around midnight and is in the south at dawn.',
    waningCrescent: 'Look east before sunrise.',
  },
  moonNote: 'The shape is shown as seen from the northern hemisphere.',
  planetsTitle: 'Planets in tonight’s sky',
  planetsNote: 'The five planets you can see with your eyes. Uranus and Neptune need a telescope.',
  evening: 'Evening, in the west',
  morning: 'Before dawn, in the east',
  allNight: 'All night',
  eveningLate: 'Evening into the night',
  morningEarly: 'Late night until dawn',
  hidden: 'Too close to the Sun to see well',
  fromEarth: (km: number, sec: number) => `${dist(km)[0].toUpperCase()}${dist(km).slice(1)} from Earth (light takes ${light(sec)})`,
  probesTitle: 'Where the probes are now',
  probeNow: (km: number, hours: number) => `${dist(km)[0].toUpperCase()}${dist(km).slice(1)} from the Sun. Radio takes about ${Number(hours.toPrecision(2))} hours to reach it`,
  watchJourney: 'Watch the journey',
  earthTitle: 'Earth and the Sun today',
  earthSun: (km: number) => `The Sun is ${dist(km)} away.`,
  earthNear: 'Earth is closest in early January and farthest in early July. The seasons come from the tilt of Earth’s axis, not from the distance.',
  goThere: 'Go',
  source: 'Positions are worked out from the date and are approximate (the Moon’s phase can be off by about half a day).',
}
