import { describe, expect, it } from 'vitest'
import { APOLLO17_LIFTOFF, equatorialToGround, groundFromEquatorial, siteSky } from './siteSky'

describe('発射場の空', () => {
  it('アポロ17号の離昇のとき、月は地平線の下（月齢 1 日ほど）', () => {
    const s = siteSky(APOLLO17_LIFTOFF)
    expect(s.moon.alt).toBeLessThan(-10)
    expect(s.moonAge).toBeGreaterThan(0.6)
    expect(s.moonAge).toBeLessThan(2)
    // 真夜中なので太陽も深く沈んでいる
    expect(s.sun.alt).toBeLessThan(-40)
  })

  it('離昇のとき、オリオン座のベテルギウスは南の高い空', () => {
    // ベテルギウス：赤経 88.79°、赤緯 +7.41°
    const b = equatorialToGround(88.79, 7.41, APOLLO17_LIFTOFF)
    expect(b.alt).toBeGreaterThan(55)
    expect(b.az).toBeGreaterThan(150)
    expect(b.az).toBeLessThan(260)
  })

  it('1972 年 11 月 20 日の夕方は満月で、日の入りのころ東から上る', () => {
    // 米東部時間 17 時 30 分 = 22:30 UTC
    const s = siteSky(Date.UTC(1972, 10, 20, 22, 30))
    expect(s.moonLit).toBeGreaterThan(0.97)
    expect(s.sun.alt).toBeLessThan(5)
    expect(s.sun.alt).toBeGreaterThan(-12)
    expect(s.moon.alt).toBeGreaterThan(-8)
    expect(s.moon.alt).toBeLessThan(12)
    expect(s.moon.az).toBeGreaterThan(45)
    expect(s.moon.az).toBeLessThan(110)
  })

  it('向きの長さは 1', () => {
    const s = siteSky(Date.UTC(1972, 10, 21, 3, 0))
    for (const v of [s.sun, s.moon]) expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 6)
  })

  it('星をまとめて回す行列は、1 つずつの変換と同じ向きになる', () => {
    const m = groundFromEquatorial(APOLLO17_LIFTOFF)
    for (const [ra, dec] of [[88.79, 7.41], [101.29, -16.72], [37.95, 89.26], [279.23, 38.78]]) {
      const r = (ra * Math.PI) / 180
      const d = (dec * Math.PI) / 180
      const q = [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)]
      const g = [0, 1, 2].map((i) => m[i * 3] * q[0] + m[i * 3 + 1] * q[1] + m[i * 3 + 2] * q[2])
      const e = equatorialToGround(ra, dec, APOLLO17_LIFTOFF)
      expect(g[0]).toBeCloseTo(e.x, 6)
      expect(g[1]).toBeCloseTo(e.y, 6)
      expect(g[2]).toBeCloseTo(e.z, 6)
    }
  })
})
