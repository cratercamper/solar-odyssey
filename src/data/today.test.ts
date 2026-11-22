import { describe, expect, it } from 'vitest'
import { earthSunAu, moonPhase, planetSky } from './today'

const at = (iso: string) => Date.parse(iso)

describe('moonPhase', () => {
  it('finds known full and new moons', () => {
    // 2024-04-08 皆既日食（新月）、2024-09-18 満月
    expect(moonPhase(at('2024-04-08T18:00:00Z')).name).toBe('new')
    expect(moonPhase(at('2024-09-18T03:00:00Z')).name).toBe('full')
    expect(moonPhase(at('2024-09-18T03:00:00Z')).lit).toBeGreaterThan(0.97)
  })
  it('finds a first quarter', () => {
    // 2025-01-06 上弦
    const m = moonPhase(at('2025-01-06T23:56:00Z'))
    expect(m.name).toBe('firstQuarter')
    expect(m.lit).toBeGreaterThan(0.4)
    expect(m.lit).toBeLessThan(0.6)
  })
})

describe('planetSky', () => {
  it('puts Mars opposite the Sun at its 2025 opposition', () => {
    const s = planetSky('mars', at('2025-01-16T00:00:00Z'))
    expect(s.elongation).toBeGreaterThan(170)
    expect(s.allNight).toBe(true)
  })
  it('puts Jupiter behind the Sun at its 2025 conjunction', () => {
    expect(planetSky('jupiter', at('2025-06-24T00:00:00Z')).elongation).toBeLessThan(5)
  })
  it('knows Venus is an evening star at its 2025 greatest eastern elongation', () => {
    const s = planetSky('venus', at('2025-01-10T00:00:00Z'))
    expect(s.evening).toBe(true)
    expect(s.elongation).toBeGreaterThan(44)
    expect(s.elongation).toBeLessThan(49)
  })
})

describe('earthSunAu', () => {
  it('is smallest in early January', () => {
    expect(earthSunAu(at('2025-01-04T00:00:00Z'))).toBeCloseTo(0.9833, 3)
    expect(earthSunAu(at('2025-07-03T00:00:00Z'))).toBeCloseTo(1.0167, 3)
  })
})
