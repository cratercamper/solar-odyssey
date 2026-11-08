import type { EclipsesJa } from './eclipses.ja'
import type { Translation } from './translation'

// The texts of data/eclipses.ts (English). Same keys as eclipses.ja.ts

export const eclipsesEn: Translation<EclipsesJa> = {
  'solar-2024-04': {
    where: 'Mexico, the United States and Canada',
    note: 'A total eclipse that crossed North America. Tens of millions of people watched it.',
  },
  'lunar-2025-09': {
    where: 'Japan (early on September 8), Asia, Europe, Africa and Australia',
    note: 'All of Japan could watch this total lunar eclipse from start to finish.',
  },
  'lunar-2026-03': {
    where: 'Japan (early evening), East Asia, Australia and the Americas',
    note: 'In Japan, the red Moon could be seen early in the evening.',
  },
  'solar-2026-08': {
    where: 'Greenland, Iceland and Spain',
    note: 'The Moon’s shadow came in near the Arctic and swept down to Spain in the evening.',
  },
  'solar-2027-02': {
    where: 'Chile, Argentina, the Atlantic and West Africa',
    note: 'The Moon is far from Earth, so it cannot cover the whole Sun, and a ring of sunlight shines around it: an annular eclipse.',
  },
  'solar-2027-08': {
    where: 'Southern Spain, North Africa, Egypt and Saudi Arabia',
    note: 'The Moon is very close to Earth, so totality lasts over 6 minutes, one of the longest this century.',
  },
  'solar-2028-07': {
    where: 'Australia (including Sydney) and New Zealand',
    note: 'The Moon’s shadow cuts across Australia and passes right over the big city of Sydney.',
  },
  'lunar-2028-12': {
    where: 'Japan (early on New Year’s Day), Asia, Europe, Africa and Australia',
    note: 'In Japan, the Moon turns red in the middle of the night on New Year’s Day 2029.',
  },
  'lunar-2029-06': {
    where: 'The Americas, western Europe and western Africa',
    note: 'The Moon passes almost through the middle of Earth’s shadow, so totality lasts about 1 hour 40 minutes.',
  },
  'solar-2030-06': {
    where: 'North Africa, Greece, Turkey, Russia, China and Japan (Hokkaido)',
    note: 'Hokkaido will see the ring of fire, and the rest of Japan will see a big partial eclipse.',
  },
  'solar-2035-09': {
    where: 'China, Korea and Japan (Hokuriku and the north of Kanto)',
    note: 'A total eclipse over Japan’s main island, Honshu, the first there since 1887, 148 years earlier.',
  },
}
