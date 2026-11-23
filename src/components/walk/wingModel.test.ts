import { describe, expect, it } from 'vitest'
import { WING_PITCH_TRIM, wingStep, type WingState } from './wingModel'

const fresh = (): WingState => ({ gs: 8, wp: WING_PITCH_TRIM, fp: 0, bank: 0, vh: 0 })
/** secs 秒、同じ操作で飛ぶ。高さの変わりと、回った角度（rad）を返す */
function fly(s: WingState, secs: number, fwd: number, right: number, g: number) {
  let dh = 0
  let yaw = 0
  for (let t = 0; t < secs; t += 1 / 60) {
    yaw += wingStep(s, fwd, right, 0, false, g, 1500, 1 / 60) / 60
    dh += s.vh / 60
  }
  return { dh, yaw }
}

describe('wing flight', () => {
  for (const g of [9.8, 5]) {
    it(`W trades height for speed, S speed for height (g ${g})`, () => {
      const s = fresh()
      fly(s, 20, 0, 0, g)
      const trim = s.gs
      expect(s.vh).toBeLessThan(0)
      expect(s.vh).toBeGreaterThan(-2)
      const dive = fly(s, 5, 1, 0, g)
      expect(s.gs).toBeGreaterThan(trim * 1.6)
      expect(dive.dh).toBeLessThan(-20)
      const fast = s.gs
      const climb = fly(s, 3, -1, 0, g)
      expect(climb.dh).toBeGreaterThan(3)
      expect(s.gs).toBeLessThan(fast * 0.75)
    })
  }
  it('A/D banks and turns (D turns right)', () => {
    const s = fresh()
    const { yaw } = fly(s, 4, 0, 1, 9.8)
    expect(s.bank).toBeGreaterThan(0.4)
    expect(yaw).toBeLessThan(-1)
  })
  it('near the axis, with almost no weight, diving does not speed you up', () => {
    const s = fresh()
    fly(s, 10, 1, 0, 0.06)
    expect(s.gs).toBeLessThan(8)
  })
})
