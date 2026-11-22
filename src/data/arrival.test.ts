import { describe, expect, it } from 'vitest'
import { arrivalOf, roundCount } from './arrival'

describe('arrival sizes', () => {
  it('lines Earths across the giants (real diameter ratios)', () => {
    expect(arrivalOf('sun')).toMatchObject({ kind: 'giant', count: 109 })
    expect(arrivalOf('jupiter')).toMatchObject({ kind: 'giant', count: 11 })
    expect(arrivalOf('saturn')).toMatchObject({ kind: 'giant', count: 9 })
    expect(arrivalOf('uranus')).toMatchObject({ kind: 'giant', count: 4 })
    expect(arrivalOf('neptune')).toMatchObject({ kind: 'giant', count: 4 })
  })

  it('lines smaller worlds across the Earth', () => {
    expect(arrivalOf('earth')).toMatchObject({ kind: 'earth', count: 3.5 })
    expect(arrivalOf('moon')).toMatchObject({ kind: 'small', count: 3.5 })
    expect(arrivalOf('mars')).toMatchObject({ kind: 'small', count: 2 })
    expect(arrivalOf('venus')).toMatchObject({ kind: 'small', count: 1 })
    expect(arrivalOf('pluto')?.count).toBe(5.5)
  })

  it('uses walking time for the tiny moons', () => {
    const phobos = arrivalOf('phobos')!
    expect(phobos.kind).toBe('tiny')
    // 2π × 11.1 km ÷ 4.5 km/h ≈ 15.5 h
    expect(phobos.walkHours).toBeGreaterThan(15)
    expect(phobos.walkHours).toBeLessThan(16)
    expect(arrivalOf('deimos')?.kind).toBe('tiny')
    expect(arrivalOf('miranda')?.kind).toBe('small')
  })

  it('has nothing for things that are not worlds', () => {
    expect(arrivalOf('hubble')).toBeNull()
    expect(arrivalOf(null)).toBeNull()
  })

  it('rounds to halves below 10', () => {
    expect(roundCount(3.67)).toBe(3.5)
    expect(roundCount(3.8)).toBe(4)
    expect(roundCount(10.97)).toBe(11)
    expect(roundCount(0.2)).toBe(0.5)
  })
})
