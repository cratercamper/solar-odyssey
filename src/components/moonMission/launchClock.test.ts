import { describe, expect, it } from 'vitest'
import { newSky, OBSERVE_AT, skyNow } from './launchClock'
import { APOLLO17_LIFTOFF } from '../../data/siteSky'

const deg = (y: number) => (Math.asin(y) * 180) / Math.PI

describe('launch clock (observe → time-lapse → launch night)', () => {
  it('observe: low evening sun in the west-southwest, full moon just risen in the east-northeast', () => {
    const s = skyNow('observe', 0, newSky())
    expect(s.ms).toBe(OBSERVE_AT)
    expect(deg(s.sun.y)).toBeGreaterThan(0)
    expect(deg(s.sun.y)).toBeLessThan(4)
    expect(s.sun.x).toBeLessThan(0) // west
    expect(deg(s.moon.y)).toBeGreaterThan(0)
    expect(s.moon.x).toBeGreaterThan(0.8) // east
    expect(s.moonLit).toBeGreaterThan(0.99)
    expect(s.lights).toBe(0)
  })

  it('time-lapse ends on the launch night, with the moon below the horizon and lights on', () => {
    const s = skyNow('timelapse', 1, newSky())
    expect(s.ms).toBe(APOLLO17_LIFTOFF)
    expect(s.moon.y).toBeLessThan(0)
    expect(s.lights).toBe(1)
    expect(s.frost).toBe(1)
    expect(s.crewArm).toBe(1)
  })

  it('moves smoothly: no jumps in the sun, moon or stars between neighbouring moments', () => {
    const a = newSky()
    const b = newSky()
    for (let u = 0; u < 1; u += 0.002) {
      skyNow('timelapse', u, a)
      skyNow('timelapse', u + 0.002, b)
      expect(a.moon.angleTo(b.moon)).toBeLessThan(0.08)
      expect(a.sun.angleTo(b.sun)).toBeLessThan(0.08)
      expect(a.stars.angleTo(b.stars)).toBeLessThan(0.08)
    }
  })

  it('the moon wanes night by night', () => {
    const lit = [0.5, 0.6, 0.7, 0.8, 0.9].map((u) => skyNow('timelapse', u, newSky()).moonLit)
    for (let i = 1; i < lit.length; i++) expect(lit[i]).toBeLessThan(lit[i - 1])
  })
})
