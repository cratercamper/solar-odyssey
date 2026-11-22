import { describe, expect, it } from 'vitest'
import { checkDiscoveries, cleanName, countInHalfMonth, provisionalCode, type Discovery, PHOTO_KEEP, trimPhotos } from './discovery'

describe('provisionalCode', () => {
  it('follows the real half-month letters', () => {
    expect(provisionalCode(new Date(2026, 0, 3), 0)).toBe('2026 AA')
    expect(provisionalCode(new Date(2026, 0, 20), 1)).toBe('2026 BB')
    // 11月後半は W（I を飛ばす）
    expect(provisionalCode(new Date(2026, 10, 20), 0)).toBe('2026 WA')
    expect(provisionalCode(new Date(2026, 11, 31), 0)).toBe('2026 YA')
  })
  it('skips I in the order letter and adds a number after 25', () => {
    expect(provisionalCode(new Date(2026, 10, 20), 8)).toBe('2026 WJ')
    expect(provisionalCode(new Date(2026, 10, 20), 25)).toBe('2026 WA1')
    expect(provisionalCode(new Date(2026, 10, 20), 52)).toBe('2026 WC2')
  })
})

describe('countInHalfMonth', () => {
  it('counts only the same half month', () => {
    const d = (code: string): Discovery => ({ key: code, code, name: '', kind: 0, sizeKm: 1, at: 0 })
    const found = [d('2026 WA'), d('2026 WB'), d('2026 VA'), d('2025 WA')]
    expect(countInHalfMonth(found, new Date(2026, 10, 20))).toBe(2)
  })
})

describe('names and save data', () => {
  it('cleans names', () => {
    expect(cleanName('  ほし   の  たま  ')).toBe('ほし の たま')
    expect(cleanName('x'.repeat(40))).toHaveLength(20)
  })
  it('drops broken records', () => {
    expect(checkDiscoveries('nope')).toBeNull()
    expect(checkDiscoveries([{ key: 'a', code: '2026 WA', name: '', kind: 1, sizeKm: 3, at: 1 }, { key: 1 }])).toHaveLength(1)
  })
  it('keeps photos that are images, drops anything else', () => {
    const rec = { key: 'a', code: '2026 WA', name: '', kind: 0, sizeKm: 3, at: 1 }
    expect(checkDiscoveries([{ ...rec, photo: 'data:image/jpeg;base64,xx' }])![0].photo).toBe('data:image/jpeg;base64,xx')
    expect(checkDiscoveries([{ ...rec, photo: 'javascript:alert(1)' }])![0].photo).toBeUndefined()
  })
  it('keeps only the newest photos', () => {
    const many = Array.from({ length: PHOTO_KEEP + 5 }, (_, i) => ({ key: `k${i}`, code: '2026 WA', name: '', kind: 0 as const, sizeKm: 3, at: i, photo: 'data:image/jpeg;base64,x' }))
    const out = trimPhotos(many)
    expect(out.filter((d) => d.photo)).toHaveLength(PHOTO_KEEP)
    expect(out[0].photo).toBeUndefined()
    expect(out[out.length - 1].photo).toBeDefined()
  })
})
