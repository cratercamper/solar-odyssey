import { saveData } from '../state/save'
import { useEffect } from 'react'
import { ui } from '../i18n'
import { useStore } from '../state/store'
import { campaignFocus } from '../state/campaign'

// 新しい遊び方のお知らせ。起動して読み込みの画面が消えたら、まだ見ていないものを1回だけ出す
// （スマホでは「お知らせ」の一覧に入る）。見たものはセーブ（state/save.ts）に覚える
const NEWS = ['raceSites', 'colonyLap', 'bodyCards', 'raceMedals', 'today', 'discovery', 'pioneer', 'arrival', 'colonyAxis', 'colonyWings', 'colonyPeople'] as const
const KEY = 'news-seen'

function seen(): string[] {
  try {
    return JSON.parse(saveData.get(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function News() {
  const lang = useStore((s) => s.settings.lang)
  useEffect(() => {
    if (lang === null) return
    const todo = NEWS.filter((id) => !seen().includes(id))
    if (!todo.length) return
    let wait = 0
    const timer = setInterval(() => {
      // 読み込みの画面が消えてから、少し待って出す
      if (document.getElementById('boot')) return
      if (++wait < 4) return
      // キャンペーンの集中モードのあいだは出さない（あとで自由探検のときに出す）
      if (campaignFocus()) return
      // 起動時の「新しい遊び」のお知らせ（ui/NewContent.tsx）が出ているあいだは待つ
      if (document.querySelector('.new-content')) return
      clearInterval(timer)
      const id = todo[0]
      useStore.getState().showToast(ui().news[id])
      try {
        saveData.set(KEY, JSON.stringify([...seen(), id]))
      } catch {
        // 覚えられなくても、出すだけは出す
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [lang])
  return null
}
