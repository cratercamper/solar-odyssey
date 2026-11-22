import { useLayoutEffect, type RefObject } from 'react'

// お知らせ（.toast）を、画面の上にあるバーやカードの下に出す。
// いくつかのバー（任務・開拓など）が同時に出ても取り合わないよう、いちばん下のものに合わせる

const bottoms = new Map<string, number>()

function apply() {
  const root = document.documentElement
  if (bottoms.size === 0) root.style.removeProperty('--toast-top')
  else root.style.setProperty('--toast-top', `${Math.max(...bottoms.values()) + 10}px`)
}

/** key のバーの下端（px）。null で外す */
export function setToastBelow(key: string, bottom: number | null) {
  if (bottom === null) bottoms.delete(key)
  else bottoms.set(key, bottom)
  apply()
}

/**
 * el が画面の上半分にあるあいだ、お知らせをその下へ。onPlace で下端（上半分にないときは null）も知らせる
 */
export function useToastBelow(key: string, el: RefObject<HTMLElement | null>, onPlace?: (bottom: number | null) => void) {
  useLayoutEffect(() => {
    const node = el.current
    if (!node) return
    const place = () => {
      const r = node.getBoundingClientRect()
      const bottom = r.top < window.innerHeight / 2 ? Math.round(r.bottom) : null
      setToastBelow(key, bottom)
      onPlace?.(bottom)
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(node)
    window.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
      setToastBelow(key, null)
      onPlace?.(null)
    }
    // onPlace は最初に渡されたものを使う（毎回作り直しても、つけ直さない）
  }, [key, el])
}
