import { describe, expect, it } from 'vitest'
import { GET, R_EARTH } from './apolloTimeline'
import { CAPTURE_OFF, CAPTURE_SPEED, dockStars, earthDistance, stepApproach, type Approach, type Contact } from './dockPhysics'

const start = (): Approach => ({ gap: 17, vz: 0.05, x: 0.9, y: -0.55, vx: 0.004, vy: -0.003, input: { x: 0, y: 0, z: 0 } })

describe('ドッキングの物理', () => {
  it('地球からの距離：005:21 に高さ約 33,500 km（本物の記録）', () => {
    const alt = earthDistance(5 * 3600 + 21 * 60 + 24) - R_EARTH
    expect(alt).toBeGreaterThan(32_000_000)
    expect(alt).toBeLessThan(35_000_000)
    expect(earthDistance(GET.marble) - R_EARTH).toBeGreaterThan(27_000_000)
  })

  it('おまかせなら、ずれを直してそっとつなぐ（1 分ほどで）', () => {
    const a = start()
    let c: Contact | null = null
    let t = 0
    while (!c && t < 120) {
      c = stepApproach(a, 0.05, true)
      t += 0.05
    }
    expect(c?.kind).toBe('capture')
    expect(c!.speed).toBeLessThanOrEqual(CAPTURE_SPEED)
    expect(c!.off).toBeLessThanOrEqual(CAPTURE_OFF)
    expect(t).toBeLessThan(60)
  })

  it('速すぎると、はね返されて下がる', () => {
    const a = { ...start(), x: 0, y: 0, vx: 0, vy: 0, gap: 1, vz: 0.6 }
    let c: Contact | null = null
    for (let i = 0; i < 200 && !c; i++) c = stepApproach(a, 0.05, false)
    expect(c).toMatchObject({ kind: 'bounce', why: 'fast' })
    expect(a.vz).toBeLessThan(0)
  })

  it('ずれたままだと、はね返される', () => {
    const a = { ...start(), x: 0.4, y: 0, vx: 0, vy: 0, gap: 0.5, vz: 0.1 }
    let c: Contact | null = null
    for (let i = 0; i < 200 && !c; i++) c = stepApproach(a, 0.05, false)
    expect(c).toMatchObject({ kind: 'bounce', why: 'off' })
  })

  it('星の数', () => {
    expect(dockStars(0.15, 0.05, 0, false)).toBe(3)
    expect(dockStars(0.15, 0.05, 1, false)).toBe(2)
    expect(dockStars(0.3, 0.12, 0, false)).toBe(2)
    expect(dockStars(0.1, 0.2, 0, false)).toBe(1)
    expect(dockStars(0.1, 0.01, 0, true)).toBe(1)
  })
})
