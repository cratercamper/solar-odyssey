import { describe, expect, it } from 'vitest'
import { DROGUE_ALT, EI_ANGLE, blackout, entryAuto, entryResult, entryStars, startEntry, stepEntry } from './reentry'

function fly(angle: number, pilot: (e: ReturnType<typeof startEntry>) => number) {
  const e = startEntry(angle)
  let r = null
  let bo = [-1, -1]
  while (!r && e.t < 3000) {
    stepEntry(e, 0.5, pilot(e))
    r = entryResult(e)
    if (blackout(e)) bo = [bo[0] < 0 ? e.t : bo[0], e.t]
  }
  return { e, r, bo }
}

describe('reentry', () => {
  it('本物の角度とおまかせ：約 8 分でパラシュートの高さ、G は 6〜7、道のり 約 2,200 km', () => {
    const { e, r, bo } = fly(EI_ANGLE, entryAuto)
    expect(r).toBe('ok')
    expect(e.h).toBeLessThanOrEqual(DROGUE_ALT)
    expect(e.t).toBeGreaterThan(400)
    expect(e.t).toBeLessThan(560)
    expect(e.peakG).toBeGreaterThan(5.5)
    expect(e.peakG).toBeLessThan(7.5)
    expect(e.range / 1000).toBeGreaterThan(1900)
    expect(e.range / 1000).toBeLessThan(2500)
    // 通信途絶：本物は 17 秒後から 3 分 20 秒
    expect(bo[0]).toBeLessThan(30)
    expect(bo[1] - bo[0]).toBeGreaterThan(150)
    expect(bo[1] - bo[0]).toBeLessThan(250)
  })
  it('浅すぎると、大気にはじかれる', () => {
    expect(fly(-4.8, entryAuto).r).toBe('skip')
  })
  it('揚力をずっと上に向けたままだと、はじかれる', () => {
    expect(fly(EI_ANGLE, () => 1).r).toBe('skip')
  })
  it('深すぎる・揚力を下へ向けたままだと、G が強すぎる', () => {
    expect(fly(-8.5, entryAuto).r).toBe('steep')
    expect(fly(EI_ANGLE, () => -1).r).toBe('steep')
  })
  it('星', () => {
    expect(entryStars(-6.5, 6.8)).toBe(3)
    expect(entryStars(-7.1, 9.8)).toBe(1)
  })
})
