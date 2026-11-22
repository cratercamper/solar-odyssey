import { describe, expect, it, vi } from 'vitest'

// 文言の辞書は画面のもの（ブラウザの location などを読む）なので、ここでは使わない
vi.mock('../i18n', () => ({ ui: () => ({}) }))
const { daysAt, planetLongitude, trueAnomaly } = await import('./ephemeris')

const deg = (r: number) => ((((r * 180) / Math.PI) % 360) + 360) % 360
/** 角度の差（度、-180..180） */
const diff = (a: number, b: number) => ((a - b + 540) % 360) - 180

describe('ephemeris', () => {
  it('a circular orbit has true anomaly = mean anomaly', () => {
    expect(trueAnomaly(1.234, 0).nu).toBeCloseTo(1.234, 10)
  })

  it('solves Kepler: E - e sin E = M', () => {
    const M = 2.1
    const e = 0.2
    const { E } = trueAnomaly(M, e)
    expect(E - e * Math.sin(E)).toBeCloseTo(M, 9)
  })

  it('puts the Earth at about 100° heliocentric longitude at J2000', () => {
    expect(Math.abs(diff(deg(planetLongitude('earth', 0)), 100.4))).toBeLessThan(1)
  })

  it('lines up the Earth and Mars at the 2025-01-16 opposition', () => {
    const d = daysAt(Date.UTC(2025, 0, 16))
    expect(Math.abs(diff(deg(planetLongitude('mars', d)), deg(planetLongitude('earth', d))))).toBeLessThan(2)
  })

  it('lines up the Earth and Jupiter at the 2024-12-07 opposition', () => {
    const d = daysAt(Date.UTC(2024, 11, 7))
    expect(Math.abs(diff(deg(planetLongitude('jupiter', d)), deg(planetLongitude('earth', d))))).toBeLessThan(2)
  })
})
