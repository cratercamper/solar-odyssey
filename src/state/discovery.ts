import { create } from 'zustand'
import { saveSlot } from './save'
import { checkDiscoveries, cleanName, countInHalfMonth, provisionalCode, rockSizeKm, trimPhotos, type Discovery, type RockKind } from '../data/discovery'

// 発見スキャン：スキャナーを入れて小惑星帯の岩に近づき、スキャンすると発見になる。記録は共通のセーブ（'discoveries'）

const slot = saveSlot<Discovery[]>('discoveries', [], checkDiscoveries)

/** いちばん近い、スキャンできる岩（components/ScanTracker.tsx が毎フレーム近くの岩を探して入れる） */
export type ScanCandidate = { key: string; kind: RockKind; size: number; distance: number }

type DiscoveryState = {
  /** スキャナーを入れているか */
  on: boolean
  /** スキャンの進み具合（0〜1。スキャン中でなければ null） */
  progress: number | null
  candidate: ScanCandidate | null
  /** 小惑星帯からの距離（場面の単位。帯の中なら 0） */
  beltAway: number
  found: Discovery[]
  /** 見つけたばかりで、名前を付けているところ */
  fresh: Discovery | null
  /** fresh が前に見つけていた岩（もう一度スキャンした） */
  freshKnown: boolean
  /** 発見ノートを開いているか */
  noteOpen: boolean
  /** 新しく見つけた瞬間（performance.now()。光る・写真を撮る演出は components/DiscoveryFx.tsx） */
  moment: number | null
}

export const useDiscovery = create<DiscoveryState>(() => ({
  on: false,
  progress: null,
  candidate: null,
  beltAway: Infinity,
  found: slot.load(),
  fresh: null,
  freshKnown: false,
  noteOpen: false,
  moment: null,
}))

/** 動作確認用：発見の瞬間からの時間（秒）を止める・スキャンの進みを止める（#debug の __sv.discovery.debug） */
export const discoveryDebug = { freeze: null as number | null, hold: false }

/** 発見の瞬間からの時間（秒。瞬間でなければ null） */
export function momentAge() {
  const m = useDiscovery.getState().moment
  if (m === null) return null
  return discoveryDebug.freeze ?? (performance.now() - m) / 1000
}

/** スキャンできる距離（場面の単位） */
export const SCAN_RANGE = 8
/** スキャンにかかる秒数 */
export const SCAN_SECONDS = 1.6

export const startScanner = () => useDiscovery.setState({ on: true, progress: null })
export const stopScanner = () => useDiscovery.setState({ on: false, progress: null, candidate: null })
export const openNote = () => {
  if (document.pointerLockElement) document.exitPointerLock()
  useDiscovery.setState({ noteOpen: true })
}
export const closeNote = () => useDiscovery.setState({ noteOpen: false })

export const isFound = (key: string) => useDiscovery.getState().found.some((d) => d.key === key)

/** スキャンを始める（近くに岩があるときだけ。進み具合は ScanTracker が進める） */
export function beginScan() {
  const s = useDiscovery.getState()
  if (!s.on || !s.candidate || s.progress !== null || s.fresh) return
  useDiscovery.setState({ progress: 0 })
}

/** スキャンが終わった：まだ見つけていない岩なら発見として記録する */
export function finishScan(c: ScanCandidate) {
  const s = useDiscovery.getState()
  const known = s.found.find((d) => d.key === c.key)
  if (known) {
    useDiscovery.setState({ progress: null, fresh: known, freshKnown: true })
    return
  }
  const now = new Date()
  const d: Discovery = { key: c.key, code: provisionalCode(now, countInHalfMonth(s.found, now)), name: '', kind: c.kind, sizeKm: rockSizeKm(c.size), at: now.getTime() }
  const found = [...s.found, d]
  slot.save(found)
  useDiscovery.setState({ progress: null, found, fresh: d, freshKnown: false, moment: performance.now() })
}

/** 見つけた岩に名前を付ける（空なら仮符号のまま） */
export function nameDiscovery(key: string, name: string) {
  const found = useDiscovery.getState().found.map((d) => (d.key === key ? { ...d, name: cleanName(name) } : d))
  slot.save(found)
  useDiscovery.setState({ found, fresh: null })
}

export const closeFresh = () => useDiscovery.setState({ fresh: null })

/** 発見したときの写真を残す */
export function setPhoto(key: string, photo: string) {
  const found = trimPhotos(useDiscovery.getState().found.map((d) => (d.key === key ? { ...d, photo } : d)))
  slot.save(found)
  useDiscovery.setState({ found })
}
