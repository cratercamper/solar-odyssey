import { describe, expect, it } from 'vitest'
import { boilingPoint, freshWater, regimeOf, stepWater, waterGone, type Env, type Water } from './water'

const run = (env: Env, seconds: number, sim = 60, w: Water = freshWater()) => {
  for (let t = 0; t < seconds; t += 1 / 30) w = stepWater(w, env, 1 / 30, sim)
  return w
}

describe('water cup', () => {
  it('boils at 100 °C on Earth and near 300 °C under Venus air', () => {
    expect(boilingPoint(101.325)).toBeCloseTo(100, 1)
    const v = boilingPoint(9200)!
    expect(v).toBeGreaterThan(280)
    expect(v).toBeLessThan(320)
    expect(boilingPoint(0.3)).toBeNull()
  })

  it('stays liquid on a mild Earth day', () => {
    const w = run({ id: 'earth', temp: 18, sun: 0.8 }, 20)
    expect(w.liquid).toBeCloseTo(1, 3)
    expect(w.ice).toBe(0)
    expect(regimeOf('earth', 18)).toBe('liquid')
  })

  it('on the Moon it boils, then freezes within a few seconds, leaving most of it as ice', () => {
    let w = run({ id: 'moon', temp: -170, sun: 0 }, 0.5)
    expect(w.boil).toBe(1)
    expect(w.liquid).toBeGreaterThan(0.5)
    w = run({ id: 'moon', temp: -170, sun: 0 }, 5, 60, w)
    expect(w.liquid).toBe(0)
    expect(w.ice).toBeGreaterThan(0.75)
    expect(w.ice).toBeLessThan(0.9)
    // 夜の月面では、氷は残る
    const night = run({ id: 'moon', temp: -170, sun: 0 }, 30, 40000, w)
    expect(night.ice).toBeCloseTo(w.ice, 3)
    // 昼の日ざしでは、昇華して消える
    const day = run({ id: 'moon', temp: 110, sun: 1 }, 5, 40000, w)
    expect(waterGone(day)).toBe(true)
  })

  it('Mars air is too thin: the water boils and freezes too', () => {
    expect(regimeOf('mars', 10)).toBe('thin')
    const w = run({ id: 'mars', temp: 10, sun: 0.4 }, 6)
    expect(w.flashed).toBe(true)
    expect(w.liquid).toBe(0)
    expect(w.ice).toBeGreaterThan(0.7)
  })

  it('boils away on Venus in about ten seconds at 6 minutes a second', () => {
    const env = { id: 'venus', temp: 464, sun: 0.1 }
    expect(regimeOf('venus', 464)).toBe('boil')
    const mid = run(env, 3, 360)
    expect(mid.temp).toBeGreaterThan(100)
    expect(waterGone(mid)).toBe(false)
    const end = run(env, 14, 360)
    expect(waterGone(end)).toBe(true)
  })

  it('freezes solid on Titan and stays frozen', () => {
    const w = run({ id: 'titan', temp: -179, sun: 0.01 }, 30, 360)
    expect(w.liquid).toBe(0)
    expect(w.ice).toBeCloseTo(1, 3)
    expect(w.temp).toBeLessThan(-100)
  })
})
