import { useEffect, useState } from 'react'
import { saveData, saveSlot } from '../state/save'
import { useStore } from '../state/store'
import { useLanding } from '../state/landing'
import { useEva } from '../state/eva'
import { useWalk } from '../state/walk'
import { useCampaign, campaignFocus } from '../state/campaign'
import { useMoonMission, startMoonMission } from '../state/moonMission'
import { startSaturnObserve } from '../state/saturnExplorer'
import { closeEclipses } from '../state/eclipse'
import { ui } from '../i18n'
import { useLang } from '../i18n/lang'
import './newContent.css'

// 起動したときに一度だけ出す「新しい遊び」のお知らせ（junji 2026-11-25：アポロ17号へ案内。プレイするか閉じるか選べる）。
// 押しつけない：読み込みの画面が消えて少したってから、ふつうに飛んでいるときだけ出す。
// どちらを押しても、二度と出さない（セーブの 'new-content-seen'）。もう遊んだことがある人には出さない。
// 自由に飛ぶのがふつうなので、「閉じる」でそのまま自由探検に戻る

/** いま案内する新しい遊び（あとで増やすときは、ここに足して i18n の newContent に文言を足す） */
const CURRENT = 'apollo17'
const PHOTO = `${import.meta.env.BASE_URL}textures/as17-148-22727.jpg`

const slot = saveSlot<string[]>('new-content-seen', [], (v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null))
const markSeen = () => {
  const seen = slot.load()
  if (!seen.includes(CURRENT)) slot.save([...seen, CURRENT])
}

export function NewContent() {
  useLang()
  const lang = useStore((s) => s.settings.lang)
  const [open, setOpen] = useState(false)
  const mode = useStore((s) => s.mode)
  const landing = useLanding((l) => l.phase !== 'idle')
  const eva = useEva((e) => e.phase !== 'none')
  const walk = useWalk((w) => w.phase !== 'none')
  const picking = useCampaign((c) => c.picking)
  const mission = useMoonMission((m) => m.phase !== 'none')
  const calm = mode === 'flight' && !landing && !eva && !walk && !picking && !mission

  useEffect(() => {
    if (lang === null || open) return
    if (slot.load().includes(CURRENT)) return
    // 行き先つきのリンク（#… や ?…）で開いたときは、その人の目的をじゃましない（覚えずに、次のふつうの起動で出す）
    if (location.hash.length > 1 || location.search.length > 1) return
    // もう月ミッションで遊んだことがあれば、案内はいらない
    if (saveData.get('moon-mission') !== null) {
      markSeen()
      return
    }
    let wait = 0
    const timer = setInterval(() => {
      // 読み込みの画面が消えてから、少し待って出す
      if (document.getElementById('boot')) return
      if (++wait < 3) return
      if (!calm || campaignFocus()) return
      clearInterval(timer)
      setOpen(true)
    }, 1000)
    return () => clearInterval(timer)
  }, [lang, open, calm])

  // 開いているあいだに別のことが始まったら、しまう（まだ選んでいないので、次の起動でまた出す）
  useEffect(() => {
    if (open && !calm) setOpen(false)
  }, [open, calm])

  // Esc でも閉じる
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      markSeen()
      setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null
  const t = ui().newContent
  const c = t.apollo17
  const close = () => {
    markSeen()
    setOpen(false)
  }
  const play = () => {
    markSeen()
    setOpen(false)
    closeEclipses()
    startMoonMission('launch', startSaturnObserve)
  }
  return (
    <div className="new-content-back" onClick={close}>
      <section
        className="new-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-content-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="new-content-photo">
          <img src={PHOTO} alt={c.photo} />
          <span className="new-content-badge">{t.badge}</span>
        </div>
        <h2 id="new-content-title">{c.title}</h2>
        <p>{c.body}</p>
        <div className="new-content-buttons">
          <button className="secondary" onClick={close}>
            {c.close}
          </button>
          <button className="new-content-play" onClick={play} autoFocus>
            {c.play}
          </button>
        </div>
        <p className="muted small new-content-later">{c.later}</p>
      </section>
    </div>
  )
}
