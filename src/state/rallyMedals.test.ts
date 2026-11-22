import { describe, expect, it } from 'vitest'
import { TRACKS } from '../data/rallyTracks'
import { medalFor, nextMedal } from './rallyMedals'

describe('rally medals', () => {
  it('every timed course has gold < silver < bronze, and chase courses need none', () => {
    for (const [id, tr] of Object.entries(TRACKS)) {
      if (tr.chase) continue
      expect(tr.medals, id).toBeDefined()
      const [g, s, b] = tr.medals!
      expect(g).toBeGreaterThan(0)
      expect(g).toBeLessThan(s)
      expect(s).toBeLessThan(b)
    }
  })
  it('gives medals by time', () => {
    const [g, s, b] = TRACKS.coprates.medals!
    expect(medalFor('coprates', g)).toBe(1)
    expect(medalFor('coprates', g + 0.1)).toBe(2)
    expect(medalFor('coprates', s + 0.1)).toBe(3)
    expect(medalFor('coprates', b + 0.1)).toBeNull()
    expect(nextMedal('coprates', g)).toBeNull()
    expect(nextMedal('coprates', s)?.medal).toBe(1)
    expect(nextMedal('coprates', s)?.need).toBeCloseTo(s - g)
    expect(nextMedal('coprates', b + 5)).toEqual({ medal: 3, need: 5 })
  })
  it('gives chase medals by rovers caught', () => {
    expect(medalFor('taurus', 99, 0)).toBeNull()
    expect(medalFor('taurus', 99, 1)).toBe(3)
    expect(medalFor('taurus', 99, 2)).toBe(2)
    expect(medalFor('taurus', 99, 3)).toBe(1)
    expect(nextMedal('taurus', 99, 1)).toEqual({ medal: 2, need: 1 })
    expect(nextMedal('taurus', 99, 0)).toEqual({ medal: 3, need: 1 })
  })
})
