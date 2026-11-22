import { describe, expect, it } from 'vitest'
import { surfaceFor } from '../../data/surfaces'
import { sunriseOf } from './sunriseDir'

describe('sunrise', () => {
  it('rises in the east on Earth, Mars and the Moon', () => {
    for (const id of ['earth', 'mars', 'moon']) {
      const r = sunriseOf(surfaceFor(id)!)!
      expect(r.west).toBe(false)
      expect(r.dir.dot(r.east)).toBeGreaterThan(0.5)
      expect(r.clock).toBeGreaterThan(4)
      expect(r.clock).toBeLessThan(8)
    }
  })
  it('rises in the west on Venus and Pluto', () => {
    for (const id of ['venus', 'pluto']) expect(sunriseOf(surfaceFor(id)!)!.west).toBe(true)
  })
})
