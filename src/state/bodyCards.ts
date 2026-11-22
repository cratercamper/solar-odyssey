import { create } from 'zustand'
import { BODY_CARDS, hasCard } from '../data/bodyCards'

/** 天体カード：開いているか、どの天体のカードか */
export const useBodyCards = create<{ open: boolean; id: string }>(() => ({ open: false, id: 'earth' }))

/** カードを開く（id がなければ、今の目標、それもなければ地球） */
export function openBodyCard(id?: string | null) {
  if (document.pointerLockElement) document.exitPointerLock()
  useBodyCards.setState({ open: true, id: hasCard(id) ? id! : useBodyCards.getState().id })
}
export const closeBodyCard = () => useBodyCards.setState({ open: false })

/** となりのカードへ（step は +1 / −1、端まで行くと反対の端へ） */
export function stepBodyCard(step: number) {
  const i = BODY_CARDS.findIndex((c) => c.id === useBodyCards.getState().id)
  const n = BODY_CARDS.length
  useBodyCards.setState({ id: BODY_CARDS[(i + step + n) % n].id })
}
