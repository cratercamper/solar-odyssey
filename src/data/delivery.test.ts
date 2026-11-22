import { describe, expect, it } from 'vitest'
import { addRecord, board, checkDelivery, fastSeconds, HISTORY_MAX, JOB_KINDS, KINDS, kindStats, LAB_STOP, legs, makeJob, NEW_DELIVERY, rewardFor, starsFor, timeLimit, walksToLab, type ActiveJob } from './delivery'

const job = (over: Partial<ActiveJob> = {}, kind: (typeof JOB_KINDS)[number] = 'parts'): ActiveJob => {
  const def = Array.from({ length: 50 }, (_, i) => makeJob('2026-11-20', i, 0)).find((d) => d.kind === kind)!
  return { def, stop: def.stops.length - 1, elapsed: 30, warped: false, beamed: false, ...over }
}

describe('delivery board', () => {
  it('is the same for the same day and round, and changes with the round', () => {
    const a = board('2026-11-20', { done: 0, skipped: 0 })
    expect(board('2026-11-20', { done: 0, skipped: 0 })).toEqual(a)
    expect(board('2026-11-20', { done: 1, skipped: 0 })).not.toEqual(a)
  })
  it('shows 3 different kinds, each with a pickup and distinct drops', () => {
    for (let r = 0; r < 40; r++) {
      const b = board('2026-11-21', { done: r, skipped: 0 })
      expect(new Set(b.map((d) => d.kind)).size).toBe(3)
      for (const d of b) {
        const k = KINDS[d.kind]
        const fly = d.stops.filter((s) => s !== LAB_STOP)
        expect(k.from).toContain(d.stops[0])
        expect(fly.length).toBe(1 + k.drops)
        expect(legs(d)).toBe(k.drops)
        expect(new Set(d.stops).size).toBe(d.stops.length)
        for (const s of fly.slice(1)) expect(k.to).toContain(s)
        // 試料と苗をコロニーへ届けるときだけ、最後に研究温室まで歩く
        expect(walksToLab(d)).toBe((d.kind === 'samples' || d.kind === 'seedlings') && fly[fly.length - 1] === 'colony')
      }
    }
  })
})

describe('stars', () => {
  it('gives 3 stars for a fast job that keeps its promise', () => {
    expect(starsFor(job()).stars).toBe(3)
  })
  it('loses the promise star when the rule is broken', () => {
    expect(starsFor(job({ warped: true }, 'parts'))).toMatchObject({ kept: false, stars: 2 })
    expect(starsFor(job({ beamed: true }, 'samples'))).toMatchObject({ kept: false, stars: 2 })
    // 約束と関係ないことは数えない
    expect(starsFor(job({ beamed: true }, 'parts')).kept).toBe(true)
  })
  it('times in-time jobs against their limit', () => {
    const j = job({}, 'medicine')
    expect(starsFor({ ...j, elapsed: timeLimit(j.def) + 1 }).kept).toBe(false)
    expect(starsFor({ ...j, elapsed: fastSeconds(j.def) + 1 })).toMatchObject({ kept: true, fast: false, stars: 2 })
  })
  it('always gives at least 1 star', () => {
    expect(starsFor(job({ warped: true, elapsed: 9999 })).stars).toBe(1)
  })
  it('scales the reward with stars', () => {
    const d = job().def
    expect(rewardFor(d, 1)).toEqual(d.reward)
    expect(rewardFor(d, 3).metal).toBe(Math.round(d.reward.metal * 1.6))
  })
})

describe('records and save', () => {
  it('keeps the last records and counts per kind', () => {
    let h: ReturnType<typeof addRecord> = []
    for (let i = 0; i < HISTORY_MAX + 5; i++) h = addRecord(h, { at: i, kind: 'fuel', stars: (i % 3) + 1 })
    expect(h.length).toBe(HISTORY_MAX)
    expect(kindStats(h).fuel).toMatchObject({ count: HISTORY_MAX, best: 3 })
    expect(kindStats(h).parts.count).toBe(0)
  })
  it('checks the save shape', () => {
    expect(checkDelivery(NEW_DELIVERY)).toBe(true)
    expect(checkDelivery({ ...NEW_DELIVERY, active: job() })).toBe(true)
    expect(checkDelivery({ ...NEW_DELIVERY, active: { ...job(), stop: 9 } })).toBe(false)
    expect(checkDelivery({ ...NEW_DELIVERY, history: [{ at: 1, kind: 'pizza', stars: 2 }] })).toBe(false)
    expect(checkDelivery(null)).toBe(false)
    // 研究温室は、コロニーのすぐあとの最後の行き先だけ
    const walk = { ...job(), def: { ...job().def, stops: ['spacedock', 'colony', LAB_STOP] }, stop: 2 }
    expect(checkDelivery({ ...NEW_DELIVERY, active: walk })).toBe(true)
    expect(checkDelivery({ ...NEW_DELIVERY, active: { ...walk, def: { ...walk.def, stops: ['spacedock', LAB_STOP, 'colony'] } } })).toBe(false)
    expect(checkDelivery({ ...NEW_DELIVERY, active: { ...walk, def: { ...walk.def, stops: ['spacedock', 'nowhere'] } } })).toBe(false)
  })
})
