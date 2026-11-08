import type { eclipsePanelJa } from './eclipsePanel.ja'
import type { Translation } from './translation'

// The texts of ui/EclipsePanel.tsx (English). Same keys as eclipsePanel.ja.ts

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const eclipsePanelEn: Translation<typeof eclipsePanelJa> = {
  date: (year: number, month: number, day: number) => `${MONTHS[month - 1]} ${day}, ${year}`,
  dateTime: (ms: string, time: string) => `${ms} ${time} UTC`,
  utcOffsetHours: 0,
  totalSolarEclipse: 'Total solar eclipse',
  annularSolarEclipse: 'Annular solar eclipse',
  partialSolarEclipse: 'Partial solar eclipse',
  totalLunarEclipse: 'Total lunar eclipse',
  partialLunarEclipse: 'Partial lunar eclipse',
  penumbralLunarEclipse: 'Penumbral lunar eclipse',
  solarBeforeNote: 'The Moon is moving between the Sun and Earth. Its shadow has not reached Earth yet.',
  solarAfterNote: 'The Moon’s shadow has moved off Earth.',
  solarPartialNote: 'The Moon’s faint outer shadow (the penumbra) is on Earth. People inside it see part of the Sun covered.',
  solarAnnularNote: 'The Moon is far from Earth, so its dark shadow falls short. People in the middle see a ring of sunlight around the Moon (an annular eclipse).',
  solarTotalNote: 'The Moon’s dark inner shadow (the umbra) is on Earth. Inside that small dark spot the daytime sky goes dark and stars come out: a total eclipse. The shadow races east.',
  lunarBeforeNote: 'The full Moon is moving toward Earth’s shadow.',
  lunarAfterNote: 'The Moon has left Earth’s shadow and is a normal full Moon again.',
  lunarPenumbralNote: 'The Moon is in Earth’s faint outer shadow (the penumbra). It dims a little, but it is hard to notice by eye.',
  lunarPartialNote: 'The Moon is entering Earth’s dark inner shadow (the umbra). From the ground it looks like a bite is being taken out of it.',
  lunarTotalNote: 'Total lunar eclipse: the whole Moon is inside Earth’s shadow. Only red light bent through Earth’s air reaches it, so it glows a coppery red.',
  eclipses: 'Eclipses',
  eclipsesFromSpace: 'Eclipses from space',
  separator: ': ',
  close: 'Close',
  introNote: 'Replay the real line-up of the Sun, Earth and Moon. Watch from space as the Moon’s shadow falls on Earth (a solar eclipse), or as the Moon slides into Earth’s shadow and turns red (a lunar eclipse).',
  pastSuffix: ' (past)',
  seenFrom: 'Seen from: ',
  time: 'Time',
  pause: 'Pause',
  replay: 'Replay',
  play: 'Play',
  otherEclipses: 'Other eclipses',
  lineUpNote: 'A solar eclipse happens when the Sun, Moon and Earth line up in that order, and a lunar eclipse when it is Sun, Earth, Moon. The Moon’s path is slightly tilted, so this does not happen every month. The Moon’s size and distance are changed for easy viewing, but the dates and where the shadows fall are calculated for real.',
}
