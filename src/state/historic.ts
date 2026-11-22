import { saveData } from './save'
import { create } from 'zustand'

// アポロ17号の史跡（data/apollo17.ts）：訪ねた記録と、いま見せているカード・図鑑の画面

const KEY = 'apollo17'

function load(): string[] {
  try {
    const v = JSON.parse(saveData.get(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

type HistoricState = {
  found: string[]
  /** いま出している史跡のカード（近づいたとき・図鑑から） */
  card: string | null
  /** 図鑑を開いているか。sel は詳しく見ている史跡 */
  book: boolean
  sel: string | null
}

export const useHistoric = create<HistoricState>(() => ({ found: load(), card: null, book: false, sel: null }))

/** 史跡を訪ねた。初めてなら記録してカードを出す */
export function visitHistoric(id: string) {
  const s = useHistoric.getState()
  if (s.found.includes(id)) return false
  const found = [...s.found, id]
  try {
    saveData.set(KEY, JSON.stringify(found))
  } catch {
    /* 保存できなくても続ける */
  }
  useHistoric.setState({ found, card: id })
  return true
}

export const openHistoricBook = () => {
  if (document.pointerLockElement) document.exitPointerLock()
  useHistoric.setState({ book: true, sel: null })
}
export const closeHistoricBook = () => useHistoric.setState({ book: false, sel: null })
