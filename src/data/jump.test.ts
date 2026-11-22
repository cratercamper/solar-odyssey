import { describe, expect, it } from 'vitest'
import { V0, heightAt, jumpOn, playbackSpeed } from './jump'

describe('gravity jump', () => {
  it('a 50 cm jump on Earth stays 50 cm', () => {
    const e = jumpOn('earth')!
    expect(e.height).toBeCloseTo(0.5, 1)
    expect(e.airtime).toBeCloseTo(0.64, 1)
  })

  it('the Moon gives about a 3 m jump for about 4 s', () => {
    const m = jumpOn('moon')!
    expect(m.height).toBeGreaterThan(2.9)
    expect(m.height).toBeLessThan(3.2)
    expect(m.airtime).toBeGreaterThan(3.7)
    expect(m.airtime).toBeLessThan(4.0)
  })

  it('Mars is about 2.6 times the Earth', () => {
    const m = jumpOn('mars')!
    expect(m.height / 0.5).toBeGreaterThan(2.5)
    expect(m.height / 0.5).toBeLessThan(2.8)
  })

  it('tiny Phobos throws you hundreds of metres up for many minutes, but you come back', () => {
    const p = jumpOn('phobos')!
    expect(Number.isFinite(p.height)).toBe(true)
    expect(p.height).toBeGreaterThan(500)
    expect(p.airtime).toBeGreaterThan(600)
    expect(playbackSpeed(p.airtime)).toBeGreaterThanOrEqual(100)
  })

  it('the height over time peaks at the top and returns to the ground', () => {
    const m = jumpOn('moon')!
    const R = 1_737_000
    expect(heightAt(m.airtime / 2, m.g, R)).toBeCloseTo(m.height, 1)
    expect(heightAt(m.airtime, m.g, R)).toBeLessThan(0.05)
    expect(heightAt(0.1, m.g, R)).toBeCloseTo(V0 * 0.1 - (m.g * 0.01) / 2, 3)
  })

  it('no jump where you cannot land', () => {
    expect(jumpOn('jupiter')).toBeNull()
    expect(jumpOn('sun')).toBeNull()
  })
})
