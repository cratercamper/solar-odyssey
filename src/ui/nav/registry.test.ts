import { describe, expect, it, vi } from 'vitest'

// registry.ts は store などを読み込むので、ここでは軽い偽物にする
vi.mock('../../state/store', () => ({ useStore: () => null }))
vi.mock('../../state/race', () => ({ useRace: () => null }))
vi.mock('../../state/mission', () => ({ useMission: () => null }))

const { navEntries, registerNav } = await import('./registry')

describe('nav registry', () => {
  it('sorts by order inside a tab and filters by world', () => {
    const run = () => {}
    registerNav({ id: 'b', tab: 'play', order: 20, label: () => 'B', run })
    registerNav({ id: 'a', tab: 'play', order: 10, label: () => 'A', run })
    registerNav({ id: 'sf-only', tab: 'play', order: 15, world: 'sf', label: () => 'S', run })
    registerNav({ id: 'q', tab: 'learn', order: 5, label: () => 'Q', run })
    expect(navEntries('play', 'real').map((e) => e.id)).toEqual(['a', 'b'])
    expect(navEntries('play', 'sf').map((e) => e.id)).toEqual(['a', 'sf-only', 'b'])
    expect(navEntries('learn').map((e) => e.id)).toEqual(['q'])
  })

  it('replaces an entry registered twice with the same id', () => {
    registerNav({ id: 'a', tab: 'see', order: 1, label: () => 'A2', run: () => {} })
    expect(navEntries('play').map((e) => e.id)).not.toContain('a')
    expect(navEntries('see')[0].label()).toBe('A2')
  })
})
