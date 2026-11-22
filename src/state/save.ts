// 共通のセーブデータ。遊びの記録はぜんぶ、端末の 1 か所（localStorage の SAVE_KEY）に、版番号つきで入れる。
//
// - 読み書き：saveData.get(name) / saveData.set(name, text) / saveData.remove(name)。中身は文字列（JSON にするかは各機能が決める）。
//   型つきで使うなら saveSlot(name, 初期値, 確かめ方)。書くとすぐ保存される（自動保存）。
// - 登録：新しい機能は registerSave({ name, label }) を 1 行足すだけで、セーブデータ画面（ui/SaveDataPanel.tsx）の一覧に出る。
//   書き出し・読み込み・引き継ぎは名前に関係なく全部の記録を運ぶので、登録を忘れても記録は消えない。
//   レース場ごとの記録のように名前の後ろが変わるものは prefix: true（'rally-best' なら 'rally-best:…' がぜんぶ入る）。
// - 引き継ぎ：前の版は記録を 'solar-voyager:…' の 16 種類以上のキーにばらばらに置いていた。共通のセーブがまだ無い端末では、
//   はじめての起動でそれを読み込んで入れる（名前は 'solar-voyager:' を取ったもの）。元のキーは消さずにバックアップとして残す。
// - 読み込み（ファイル）と「記録を消す」の前の中身は BACKUP_KEY に 1 回分残す。

export const SAVE_KEY = 'solar-odyssey:save'
export const BACKUP_KEY = 'solar-odyssey:save-backup'
/** 読めなかったセーブを残す名前の頭（後ろに時刻） */
export const BROKEN_KEY = 'solar-odyssey:save-broken'
export const LEGACY_PREFIX = 'solar-voyager:'
export const SAVE_APP = 'solar-odyssey'
/** セーブの形の版。形を変えたら上げて、migrate() に前の版からの直し方を書く */
export const SAVE_VERSION = 1

export type SaveFile = {
  app: typeof SAVE_APP
  v: number
  /** 最後に保存した時刻（ミリ秒）。まだ一度も保存していなければ 0 */
  savedAt: number
  /** 記録の名前 → 中身（文字列） */
  data: Record<string, string>
}

/** localStorage と同じ形（テストでは偽物を渡す） */
export type KeyValueStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

export type SaveEntry = {
  /** 記録の名前（prefix なら名前の頭） */
  name: string
  /** セーブデータ画面に出す名前（ui() を呼ぶ関数にして、言語を切り替えても合うように） */
  label: () => string
  /** 名前の後ろが変わる記録（'name:…'）をまとめて 1 つとして数える */
  prefix?: boolean
}

const entries: SaveEntry[] = []

/** 機能の記録を登録する（セーブデータ画面の一覧に出る）。同じ名前を 2 回登録したら後のほうで置きかえる */
export function registerSave(entry: SaveEntry) {
  const at = entries.findIndex((e) => e.name === entry.name)
  if (at >= 0) entries[at] = entry
  else entries.push(entry)
}

export const saveEntries = (): readonly SaveEntry[] => entries

/** その名前の記録が、登録のどれに入るか（無ければ undefined） */
export const entryOf = (name: string) => entries.find((e) => (e.prefix ? name === e.name || name.startsWith(`${e.name}:`) : name === e.name))

/** ファイルや端末から読んだものがセーブの形かを確かめて、今の版の形にする。だめなら理由つきで投げる */
export function parseSave(raw: unknown): SaveFile {
  if (!raw || typeof raw !== 'object') throw new SaveError('notSave')
  const r = raw as Partial<SaveFile>
  if (r.app !== SAVE_APP) throw new SaveError('notSave')
  if (typeof r.v !== 'number' || !Number.isInteger(r.v) || r.v < 1) throw new SaveError('notSave')
  if (r.v > SAVE_VERSION) throw new SaveError('newer')
  if (!r.data || typeof r.data !== 'object' || Array.isArray(r.data)) throw new SaveError('broken')
  const data: Record<string, string> = {}
  for (const [k, v] of Object.entries(r.data)) {
    if (typeof v !== 'string') throw new SaveError('broken')
    data[k] = v
  }
  return migrate({ app: SAVE_APP, v: r.v, savedAt: typeof r.savedAt === 'number' && Number.isFinite(r.savedAt) ? r.savedAt : 0, data })
}

/** 前の版のセーブを今の版の形に（今は版 1 だけなので、そのまま） */
function migrate(save: SaveFile): SaveFile {
  return { ...save, v: SAVE_VERSION }
}

export type SaveErrorKind = 'notSave' | 'newer' | 'broken'
export class SaveError extends Error {
  constructor(readonly kind: SaveErrorKind) {
    super(`save: ${kind}`)
  }
}

/** 前の版のばらばらのキーを集める（'solar-voyager:stamps' → 'stamps'） */
export function collectLegacy(storage: KeyValueStorage): Record<string, string> {
  const data: Record<string, string> = {}
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k && k.startsWith(LEGACY_PREFIX)) keys.push(k)
  }
  for (const k of keys) {
    const v = storage.getItem(k)
    if (v !== null) data[k.slice(LEGACY_PREFIX.length)] = v
  }
  return data
}

/**
 * セーブの入れ物。アプリでは 1 つ（saveData）だけ作る。テストでは偽の storage で作る。
 * 中身はメモリに持ち、書くたびに storage へ書く（保存できない端末でも、その回は遊べる）
 */
export function createSaveStore(storage: KeyValueStorage | null, now: () => number = Date.now) {
  let file: SaveFile = { app: SAVE_APP, v: SAVE_VERSION, savedAt: 0, data: {} }
  /** 最後に保存できなかったか（容量いっぱいなど） */
  let failed = false
  /** 起動したとき前の版から引き継いだ記録の数（引き継がなかったら 0） */
  let migrated = 0
  /** 端末のセーブが壊れていて、前の版のキーから作り直したか */
  let recovered = false
  const listeners = new Set<() => void>()

  /** 端末のセーブが新しい版のアプリのもの：上書きしないように、この回はメモリだけで遊ぶ */
  let newer = false

  const write = () => {
    file = { ...file, savedAt: now() }
    if (storage && !newer) {
      try {
        storage.setItem(SAVE_KEY, JSON.stringify(file))
        failed = false
      } catch (e) {
        failed = true
        console.warn(`save: not stored (${(e as Error).message})`)
      }
    }
    listeners.forEach((f) => f())
  }

  // 起動：共通のセーブがあれば読む。無ければ前の版のキーから引き継ぐ
  if (storage) {
    let text: string | null = null
    try {
      text = storage.getItem(SAVE_KEY)
    } catch {
      // 読めない端末（プライベートモードなど）：この回だけの記録で遊ぶ
    }
    if (text !== null) {
      try {
        file = parseSave(JSON.parse(text))
      } catch (e) {
        console.warn(`save: stored save not used (${(e as Error).message})`)
        if (e instanceof SaveError && e.kind === 'newer') {
          // 新しい版のアプリが書いたセーブ（古いページが開いたまま、など）：消さずに、この回は保存しない
          newer = true
        } else {
          // 壊れたセーブは捨てずに BROKEN_KEY へ移してから（バックアップとは別。上書きされない）、前の版のキーで始めなおす
          try {
            storage.setItem(`${BROKEN_KEY}:${now()}`, text)
          } catch {
            // 残せなくても遊べる
          }
          recovered = true
          text = null
        }
      }
    }
    if (text === null && !newer) {
      let legacy: Record<string, string> = {}
      try {
        legacy = collectLegacy(storage)
      } catch {
        // 読めなければ、はじめから
      }
      migrated = Object.keys(legacy).length
      file = { ...file, data: legacy }
      if (migrated > 0) write()
    }
  }

  // ほかのタブが保存したら、その中身を取りこむ（全体を書き戻すので、古い中身でほかのタブの記録を消さないように）
  if (storage && typeof window !== 'undefined') {
    window.addEventListener('storage', (ev) => {
      if (ev.key !== SAVE_KEY || ev.newValue === null) return
      try {
        file = parseSave(JSON.parse(ev.newValue))
        newer = false
        listeners.forEach((f) => f())
      } catch {
        // 読めない中身は取りこまない
      }
    })
  }

  return {
    get(name: string): string | null {
      return Object.prototype.hasOwnProperty.call(file.data, name) ? file.data[name] : null
    },
    set(name: string, value: string) {
      if (file.data[name] === value) return
      file = { ...file, data: { ...file.data, [name]: value } }
      write()
    },
    remove(name: string) {
      if (!(name in file.data)) return
      const data = { ...file.data }
      delete data[name]
      file = { ...file, data }
      write()
    },
    /** 記録の名前の一覧 */
    names: () => Object.keys(file.data),
    /** いまのセーブ全体（書き出し用） */
    snapshot: (): SaveFile => ({ ...file, data: { ...file.data } }),
    savedAt: () => file.savedAt,
    failed: () => failed,
    migrated: () => migrated,
    recovered: () => recovered,
    /** 新しい版のセーブがあるので、この回は保存していない */
    newer: () => newer,
    /** セーブ全体を置きかえる（ファイルの読み込み）。前の中身は BACKUP_KEY に残す */
    replace(next: SaveFile) {
      backup()
      file = { ...parseSave(next) }
      newer = false
      write()
    },
    /** 記録をぜんぶ消す（前の版のキーも消して、引き継ぎで戻ってこないようにする）。前の中身は BACKUP_KEY に残す */
    clear() {
      backup()
      if (storage) {
        try {
          for (const k of Object.keys(collectLegacy(storage))) storage.removeItem(LEGACY_PREFIX + k)
        } catch {
          // 消せなくても、共通のセーブは空になる
        }
      }
      file = { ...file, data: {} }
      newer = false
      write()
    },
    subscribe(f: () => void) {
      listeners.add(f)
      return () => listeners.delete(f)
    },
  }

  function backup() {
    if (!storage) return
    try {
      storage.setItem(BACKUP_KEY, JSON.stringify(file))
    } catch {
      // 残せなくても続ける
    }
  }
}

export type SaveStore = ReturnType<typeof createSaveStore>

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** アプリのセーブ */
export const saveData: SaveStore = createSaveStore(browserStorage())

/**
 * 型つきの記録。check は読んだ値を確かめて、使える形にして返す（だめなら null で、初期値になる）。
 * 例：const best = saveSlot('quiz-best', 0, (v) => (typeof v === 'number' ? v : null))
 */
export function saveSlot<T>(name: string, fallback: T, check: (v: unknown) => T | null = (v) => (v as T) ?? null, store: SaveStore = saveData) {
  return {
    load(): T {
      const text = store.get(name)
      if (text === null) return fallback
      try {
        return check(JSON.parse(text)) ?? fallback
      } catch {
        return fallback
      }
    },
    save(value: T) {
      store.set(name, JSON.stringify(value))
    },
  }
}

/** 書き出すファイルの中身 */
export const exportText = (store: SaveStore = saveData) => JSON.stringify(store.snapshot(), null, 1)

/** 書き出すファイルの名前（solar-odyssey-save-2026-11-20.json） */
export const exportFileName = (at: Date) => `solar-odyssey-save-${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}.json`

/** 読み込むファイルを確かめる（だめなら SaveError を投げる） */
export function readSaveText(text: string): SaveFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new SaveError('notSave')
  }
  return parseSave(raw)
}

/** 登録ごとの記録の数（セーブデータ画面の一覧と、読み込む前の確認に） */
export function summarize(data: Record<string, string>): { entry: SaveEntry | null; name: string; count: number }[] {
  const rows = new Map<string, { entry: SaveEntry | null; name: string; count: number }>()
  for (const name of Object.keys(data)) {
    const entry = entryOf(name) ?? null
    const key = entry ? entry.name : name
    const row = rows.get(key) ?? { entry, name: key, count: 0 }
    row.count++
    rows.set(key, row)
  }
  // 登録した順に、登録に無いもの（前の版の名前など）は後ろに
  const order = (r: { entry: SaveEntry | null }) => (r.entry ? entries.indexOf(r.entry) : entries.length)
  return [...rows.values()].sort((a, b) => order(a) - order(b))
}
