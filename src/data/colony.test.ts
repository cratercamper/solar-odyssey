import { describe, expect, test } from 'vitest'
import {
  advance,
  buildZone,
  canBuild,
  canStudy,
  checkColony,
  economy,
  HISTORY_MAX,
  HOUR_MS,
  landSize,
  MIN_POP,
  NEW_COLONY,
  NO_ZONES,
  OFFLINE_MAX_HOURS,
  removeZone,
  researchState,
  startColony,
  startStudy,
  type ColonySave,
} from './colony'

const days = (s: ColonySave, d: number, max = OFFLINE_MAX_HOURS) => advance(s, s.at + d * 24 * HOUR_MS, max)

describe('colony management', () => {
  test('nothing moves before it starts', () => {
    const r = advance(NEW_COLONY, 1e12)
    expect(r.hours).toBe(0)
    expect(r.s).toBe(NEW_COLONY)
  })

  test('a fresh colony grows and settles without help', () => {
    const s = startColony(0)
    const week = days(s, 7).s
    expect(week.pop).toBeGreaterThan(s.pop)
    expect(week.pop).toBeLessThanOrEqual(economy(week).capacity + 1)
    expect(week.history.length).toBeGreaterThan(10)
    expect(checkColony(week)).toBe(true)
  })

  test('left alone for a long time it stays sane (no NaN, floors hold)', () => {
    // 住宅だけの町（食べ物も水も足りない）を、何十日も放っておく
    let s = startColony(0)
    s = { ...s, zones: { ...NO_ZONES, housing: 10 } }
    const r = days(s, 60, 1e9).s
    expect(Number.isFinite(r.pop)).toBe(true)
    expect(r.pop).toBeGreaterThanOrEqual(MIN_POP)
    expect(r.happy).toBeGreaterThanOrEqual(0)
    expect(r.credits).toBeGreaterThanOrEqual(0)
    expect(r.history.length).toBeLessThanOrEqual(HISTORY_MAX)
  })

  test('offline catch-up is capped, and the clock jumps to now', () => {
    const s = startColony(0)
    const r = days(s, 30)
    expect(r.hours).toBe(OFFLINE_MAX_HOURS)
    expect(r.s.at).toBe(30 * 24 * HOUR_MS)
  })

  test('a clock that went backwards does not break it', () => {
    const s = { ...startColony(10 * HOUR_MS) }
    const r = advance(s, 0)
    expect(r.hours).toBe(0)
    expect(r.s.at).toBe(0)
  })

  test('shortages lower the happiness target', () => {
    const s = startColony(0)
    const thirsty = { ...s, zones: { ...s.zones, water: 0 } }
    expect(economy(thirsty).happyTarget).toBeLessThan(economy(s).happyTarget)
    const park = buildZone(s, 'park')
    expect(economy(park).happyTarget).toBeGreaterThan(economy(s).happyTarget)
    expect(economy({ ...s, tax: 2 }).happyTarget).toBeLessThan(economy({ ...s, tax: 0 }).happyTarget)
  })

  test('land and resources limit building', () => {
    const s = startColony(0)
    const rich = { metal: 999, ice: 999, gas: 999 }
    expect(canBuild(s, 'housing', rich)).toBe(true)
    expect(canBuild(s, 'housing', { metal: 0, ice: 0, gas: 0 })).toBe(false)
    let full = s
    while (canBuild(full, 'park', rich)) full = buildZone(full, 'park')
    expect(Object.values(full.zones).reduce((a, b) => a + b, 0)).toBe(landSize(full))
    expect(removeZone(full, 'park').zones.park).toBe(full.zones.park - 1)
    expect(removeZone(s, 'park')).toBe(s)
  })

  test('research needs its parents, costs credits and finishes over time', () => {
    let s = { ...startColony(0), credits: 1000 }
    expect(researchState(s, 'recycling')).toBe('locked')
    expect(canStudy(s, 'hydroponics')).toBe(true)
    s = startStudy(s, 'hydroponics')
    expect(s.credits).toBeLessThan(1000)
    expect(canStudy(s, 'mirrors')).toBe(false) // 1 つずつ
    const r = days(s, 1)
    expect(r.finished).toEqual(['hydroponics'])
    expect(researchState(r.s, 'recycling')).toBe('ready')
    expect(economy(r.s).food).toBeGreaterThan(economy(s).food)
  })

  test('factories send metal home', () => {
    const r = days(startColony(0), 2)
    expect(r.metal).toBeGreaterThan(0)
  })

  test('save check rejects broken data', () => {
    expect(checkColony(NEW_COLONY)).toBe(true)
    expect(checkColony({ ...NEW_COLONY, tax: 5 })).toBe(false)
    expect(checkColony({ ...NEW_COLONY, research: ['nope'] })).toBe(false)
    expect(checkColony({ ...NEW_COLONY, zones: { housing: -1 } })).toBe(false)
  })
})
