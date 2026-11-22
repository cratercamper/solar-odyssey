import { describe, expect, it } from 'vitest'
import { FILM_CUTS, filmCut, filmShake } from './launchFilm'

const shot = (i: number) => FILM_CUTS[i].shot

describe('launch film cuts', () => {
  it('follows the countdown before ignition and the music after', () => {
    expect(shot(filmCut(0, 0, null))).toBe('press')
    expect(shot(filmCut(0, 6, null))).toBe('wide')
    // 点火の前は、曲のカットに進まない
    expect(shot(filmCut(0, 12, null))).toBe('deck')
    expect(shot(filmCut(0, 12, 0))).toBe('engine')
    // いちばん強い音（25.9 秒）で引きの絵
    expect(shot(filmCut(0, 40, 25.95))).toBe('reveal')
  })
  it('never goes back to an earlier cut when the music clock jumps back', () => {
    const i = filmCut(0, 30, 13)
    expect(shot(i)).toBe('tower')
    expect(filmCut(i, 30, 11)).toBe(i)
  })
})

describe('launch film shake', () => {
  it('reaches a far camera later, at the speed of sound, and weaker', () => {
    expect(filmShake(1, 1000, 0)).toBe(0)
    expect(filmShake(4, 1000, 0)).toBeGreaterThan(0)
    expect(filmShake(5, 20, 0)).toBeGreaterThan(filmShake(20, 4000, 0))
  })
})
