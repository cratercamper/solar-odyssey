import { describe, expect, it } from 'vitest'
import { PICKS, across, defaultPicks, lineup } from './sizeCompare'

describe('size compare', () => {
  it('lines things up from small to large without overlapping', () => {
    const items = lineup('jupiter', ['earth', 'moon'])
    expect(items.map((i) => i.id)).toEqual(['moon', 'earth', 'jupiter'])
    for (let i = 1; i < items.length; i++) expect(items[i].x - items[i].width / 2).toBeGreaterThan(items[i - 1].x + items[i - 1].width / 2)
  })
  it('lines up only the picks when the body itself is not shown, and nothing when nothing is picked', () => {
    expect(lineup(null, ['jupiter', 'moon']).map((i) => i.id)).toEqual(['moon', 'jupiter'])
    expect(lineup(null, [])).toEqual([])
  })
  it('counts how many fit across', () => {
    const [moon, earth, jupiter] = lineup('jupiter', ['earth', 'moon'])
    expect(across(jupiter, earth)).toBe(11)
    expect(across(earth, moon)).toBe(3.5)
  })
  it('shows the Moon next to small worlds, and a similar-sized world next to tiny moons', () => {
    expect(defaultPicks('phobos')).toEqual(['earth', 'moon', 'deimos'])
    expect(defaultPicks('mars')).toEqual(['earth', 'moon'])
    expect(defaultPicks('jupiter')).toContain('sun')
  })
  it('offers every body with a card, without Everest', () => {
    expect(PICKS.length).toBeGreaterThan(25)
    expect(PICKS).not.toContain('everest')
    expect(PICKS).toContain('pluto')
  })
})
