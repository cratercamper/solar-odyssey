import { create } from 'zustand'
import { NATURAL, STAMP_IDS, TITLES, titleEarned, titleText } from '../data/stamps'
import { playBeep } from '../audio/sfx'
import { ui } from '../i18n'
import { bodies } from './registry'
import { useStore } from './store'

// 訪問スタンプ帳：行った天体（いつ初めて行ったか）と、もらった称号。端末に保存する

const STAMPS_KEY = 'solar-voyager:stamps'
const TITLES_KEY = 'solar-voyager:titles'

function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 保存できなくても遊べる
  }
}

type StampState = {
  /** 天体の id と、初めて行った日時（ミリ秒。スタンプ帳より前にクイズで探査済みにした天体は 0） */
  stamps: Record<string, number>
  /** もらった称号の id */
  titles: string[]
  open: boolean
}

const explored = () => useStore.getState().visited
const earnedNow = (stamps: Record<string, number>) => TITLES.filter((title) => titleEarned(title, stamps, explored())).map((title) => title.id)

function initial(): StampState {
  const stamps: Record<string, number> = { ...load<Record<string, number>>(STAMPS_KEY, {}) }
  // クイズに正解した天体は、そばまで行ったはずなので、スタンプも押しておく
  for (const id of explored()) if (STAMP_IDS.has(id) && !(id in stamps)) stamps[id] = 0
  // 前からそろっていた称号は、知らせずに入れておく
  const saved = load<string[]>(TITLES_KEY, [])
  const titles = [...new Set([...saved, ...earnedNow(stamps)])]
  if (titles.length !== saved.length) save(TITLES_KEY, titles)
  return { stamps, titles, open: false }
}

export const useStamps = create<StampState>(() => initial())

export const openStamps = () => {
  if (document.pointerLockElement) document.exitPointerLock()
  useStamps.setState({ open: true })
}
export const closeStamps = () => useStamps.setState({ open: false })

/** 知らせを出す。少し前に別の知らせ（望遠鏡を見つけた、など）が出ていたら、その下に足す */
function announce(lines: string[]) {
  const st = useStore.getState()
  const prev = st.toast && Date.now() - st.toast.id < 1500 ? st.toast.text + '\n' : ''
  st.showToast(prev + lines.join('\n'))
  playBeep(880, 0.16)
  setTimeout(() => playBeep(1320, 0.28), 130)
}

/** 新しくそろった称号を記録して、その名前を返す */
function newTitles(stamps: Record<string, number>) {
  const had = useStamps.getState().titles
  const fresh = earnedNow(stamps).filter((id) => !had.includes(id))
  if (fresh.length === 0) return []
  const titles = [...had, ...fresh]
  save(TITLES_KEY, titles)
  useStamps.setState({ titles })
  return fresh.map((id) => {
    const title = TITLES.find((x) => x.id === id)!
    return ui().stamps.newTitle(titleText(title).name)
  })
}

/** 天体のそばまで来たら呼ぶ。初めてならスタンプを押して知らせる */
export function collectStamp(id: string) {
  const { stamps } = useStamps.getState()
  if (!STAMP_IDS.has(id) || id in stamps) return
  const next = { ...stamps, [id]: Date.now() }
  save(STAMPS_KEY, next)
  useStamps.setState({ stamps: next })
  const name = bodies.get(id)?.name ?? id
  const count = NATURAL.filter((x) => x in next).length
  const line = NATURAL.includes(id)
    ? ui().stamps.stampCollectedCount(name, count, NATURAL.length)
    : ui().stamps.stampCollected(name)
  announce([line, ...newTitles(next)])
}

// 航海日誌のクイズに正解したら、クイズの称号を調べる
useStore.subscribe((s, prev) => {
  if (s.visited === prev.visited) return
  const { stamps } = useStamps.getState()
  // 正解した天体は、まだならスタンプも押す（ふつうはそばまで来たときに押してある）
  const missing = s.visited.filter((id) => STAMP_IDS.has(id) && !(id in stamps))
  const next = missing.length ? { ...stamps, ...Object.fromEntries(missing.map((id) => [id, Date.now()])) } : stamps
  if (missing.length) {
    save(STAMPS_KEY, next)
    useStamps.setState({ stamps: next })
  }
  const lines = newTitles(next)
  if (lines.length) announce(lines)
})
