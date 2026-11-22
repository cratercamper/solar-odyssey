import { describe, expect, it } from 'vitest'
import { BACKUP_KEY, BROKEN_KEY, createSaveStore, exportFileName, readSaveText, registerSave, SAVE_KEY, SaveError, saveSlot, summarize, type KeyValueStorage } from './save'

/** localStorage の代わり（メモリ） */
function fakeStorage(init: Record<string, string> = {}, opts: { full?: boolean } = {}): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(init))
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (opts.full) throw new Error('QuotaExceededError')
      map.set(k, v)
    },
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

// 前の版（2026-11-19 まで）が残していた記録の例
const LEGACY = {
  'solar-voyager:settings': JSON.stringify({ lang: 'en', world: 'sf', ship: 'heron' }),
  'solar-voyager:visited': JSON.stringify(['moon', 'mars']),
  'solar-voyager:stamps': JSON.stringify({ moon: 1, mars: 2 }),
  'solar-voyager:titles': JSON.stringify(['first-step']),
  'solar-voyager:rover-samples': JSON.stringify({ moon: { basalt: 2 } }),
  'solar-voyager:campaign': JSON.stringify({ v: 1, stage: 2, counts: { moon: 3 } }),
  'solar-voyager:mission-stars': JSON.stringify({ m1: 3 }),
  'solar-voyager:quiz-best': '7',
  'solar-voyager:race-best': '81.5',
  'solar-voyager:rally-best:coprates:12:3400.0': JSON.stringify({ time: 70, splits: [] }),
  'solar-voyager:rally-ghost:coprates': JSON.stringify({ v: 1, course: 'x', time: 70, hz: 10, b64: 'AAAA' }),
  'solar-voyager:rally-results:coprates': JSON.stringify({ v: 1, course: 'x', results: [] }),
  'solar-voyager:photo-note-hidden': '1',
  'other-app:thing': 'not ours',
}

describe('migration from the old keys', () => {
  it('brings every solar-voyager key over, under its short name, and keeps the old keys', () => {
    const storage = fakeStorage(LEGACY)
    const save = createSaveStore(storage, () => 1000)
    expect(save.migrated()).toBe(13)
    expect(save.get('stamps')).toBe(LEGACY['solar-voyager:stamps'])
    expect(save.get('quiz-best')).toBe('7')
    expect(save.get('rally-best:coprates:12:3400.0')).toBe(LEGACY['solar-voyager:rally-best:coprates:12:3400.0'])
    expect(save.get('other-app:thing')).toBeNull()
    // 元のキーはバックアップとして残る
    expect(storage.map.get('solar-voyager:stamps')).toBe(LEGACY['solar-voyager:stamps'])
    // 共通のセーブに書いてある
    const stored = JSON.parse(storage.map.get(SAVE_KEY)!)
    expect(stored).toMatchObject({ app: 'solar-odyssey', v: 1, savedAt: 1000 })
    expect(Object.keys(stored.data)).toHaveLength(13)
  })

  it('migrates only once: later changes to the old keys are ignored', () => {
    const storage = fakeStorage(LEGACY)
    createSaveStore(storage).set('quiz-best', '9')
    storage.setItem('solar-voyager:quiz-best', '1')
    const again = createSaveStore(storage)
    expect(again.migrated()).toBe(0)
    expect(again.get('quiz-best')).toBe('9')
  })

  it('starts empty without writing anything on a new device', () => {
    const storage = fakeStorage()
    const save = createSaveStore(storage)
    expect(save.names()).toEqual([])
    expect(storage.map.has(SAVE_KEY)).toBe(false)
  })

  it('keeps a broken save under its own key and starts again from the old keys', () => {
    const storage = fakeStorage({ ...LEGACY, [SAVE_KEY]: '{not json' })
    const save = createSaveStore(storage, () => 42)
    expect(storage.map.get(`${BROKEN_KEY}:42`)).toBe('{not json')
    expect(save.recovered()).toBe(true)
    expect(save.get('quiz-best')).toBe('7')
    // バックアップ（1 回分）とは別なので、読み込みや消去で上書きされない
    save.clear()
    expect(storage.map.get(`${BROKEN_KEY}:42`)).toBe('{not json')
  })

  it('never overwrites a save written by a newer version', () => {
    const newerSave = JSON.stringify({ app: 'solar-odyssey', v: 99, savedAt: 1, data: { stamps: 'new' } })
    const storage = fakeStorage({ ...LEGACY, [SAVE_KEY]: newerSave })
    const save = createSaveStore(storage)
    expect(save.newer()).toBe(true)
    expect(save.migrated()).toBe(0)
    save.set('quiz-best', '1')
    expect(save.get('quiz-best')).toBe('1')
    expect(storage.map.get(SAVE_KEY)).toBe(newerSave)
  })
})

describe('reading and writing', () => {
  it('writes through to storage at once (autosave)', () => {
    const storage = fakeStorage()
    const save = createSaveStore(storage, () => 5)
    save.set('stamps', '{"moon":1}')
    expect(JSON.parse(storage.map.get(SAVE_KEY)!).data.stamps).toBe('{"moon":1}')
    expect(save.savedAt()).toBe(5)
    save.remove('stamps')
    expect(JSON.parse(storage.map.get(SAVE_KEY)!).data).toEqual({})
  })

  it('keeps playing in memory when storage is full', () => {
    const save = createSaveStore(fakeStorage({}, { full: true }))
    save.set('stamps', '{}')
    expect(save.get('stamps')).toBe('{}')
    expect(save.failed()).toBe(true)
  })

  it('works with no storage at all, and still tells listeners', () => {
    const save = createSaveStore(null)
    let told = 0
    save.subscribe(() => told++)
    save.set('a', 'b')
    expect(save.get('a')).toBe('b')
    expect(told).toBe(1)
  })

  it('saveSlot reads typed values and falls back on bad ones', () => {
    const save = createSaveStore(fakeStorage())
    const slot = saveSlot('pioneer', { metal: 0 }, (v) => (v && typeof (v as { metal: unknown }).metal === 'number' ? (v as { metal: number }) : null), save)
    expect(slot.load()).toEqual({ metal: 0 })
    slot.save({ metal: 4 })
    expect(slot.load()).toEqual({ metal: 4 })
    save.set('pioneer', '"oops"')
    expect(slot.load()).toEqual({ metal: 0 })
  })
})

describe('export and import', () => {
  it('a file exported on one device restores everything on another', () => {
    const pc = createSaveStore(fakeStorage(LEGACY))
    const text = JSON.stringify(pc.snapshot())
    const phoneStorage = fakeStorage({ 'solar-voyager:quiz-best': '1' })
    const phone = createSaveStore(phoneStorage)
    phone.replace(readSaveText(text))
    for (const name of ['stamps', 'rover-samples', 'rally-results:coprates', 'campaign', 'settings']) expect(phone.get(name)).toBe(pc.get(name))
    // 上書きの前の中身はバックアップに
    expect(JSON.parse(phoneStorage.map.get(BACKUP_KEY)!).data['quiz-best']).toBe('1')
  })

  it.each([
    ['not json', 'hello', 'notSave'],
    ['another app', JSON.stringify({ app: 'x', v: 1, data: {} }), 'notSave'],
    ['newer version', JSON.stringify({ app: 'solar-odyssey', v: 99, data: {} }), 'newer'],
    ['data not strings', JSON.stringify({ app: 'solar-odyssey', v: 1, data: { a: 1 } }), 'broken'],
    ['no data', JSON.stringify({ app: 'solar-odyssey', v: 1 }), 'broken'],
  ])('refuses a file that is %s', (_, text, kind) => {
    expect(() => readSaveText(text)).toThrow(SaveError)
    try {
      readSaveText(text)
    } catch (e) {
      expect((e as SaveError).kind).toBe(kind)
    }
  })

  it('clear empties the save, removes the old keys so they do not come back, and keeps a backup', () => {
    const storage = fakeStorage(LEGACY)
    const save = createSaveStore(storage)
    save.clear()
    expect(save.names()).toEqual([])
    expect(storage.map.has('solar-voyager:stamps')).toBe(false)
    expect(storage.map.get('other-app:thing')).toBe('not ours')
    expect(createSaveStore(storage).names()).toEqual([])
    expect(JSON.parse(storage.map.get(BACKUP_KEY)!).data.stamps).toBe(LEGACY['solar-voyager:stamps'])
  })

  it('names the file by date', () => {
    expect(exportFileName(new Date(2026, 10, 5))).toBe('solar-odyssey-save-2026-11-05.json')
  })
})

describe('registry', () => {
  it('groups prefixed records and lists unknown names last', () => {
    registerSave({ name: 'stamps', label: () => 'Stamps' })
    registerSave({ name: 'rally-best', prefix: true, label: () => 'Bests' })
    const rows = summarize({ 'rally-best:a': '1', 'rally-best:b': '2', stamps: '{}', mystery: 'x' })
    expect(rows.map((r) => [r.name, r.count])).toEqual([
      ['stamps', 1],
      ['rally-best', 2],
      ['mystery', 1],
    ])
  })
})
