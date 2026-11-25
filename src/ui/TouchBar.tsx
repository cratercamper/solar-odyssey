import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useTouchUI, type Sheet } from '../state/touchUI'
import { isTouchDevice } from '../state/input'
import { canOpenGallery, closeGallery, openGallery } from '../state/gallery'
import { enterBridge, leaveBridge } from '../state/bridge'
import { factsFor } from '../data/facts'
import { setWorld, useSF } from '../data/sf'
import { useRace } from '../state/race'
import { useLang } from '../i18n/lang'
import { ScaleSheet } from './ScaleToggle'
import { canStartEva, startEva } from '../state/eva'
import { landed } from '../state/landing'
import { ui } from '../i18n'

/** 中で指を動かすとスクロールしてよい画面（ほかの場所では、なぞってもページは動かさない） */
const SCROLLABLE = '.nav-panel, .log-panel, .quiz-run, .probe-panel, .stamp-book, .rock-book, .scope-view, .lang-picker, .new-content, .bridge-panel, .race-bar, .notice-panel, .surface-left'

/** お知らせを何件まで覚えておくか */
const NOTICE_KEEP = 20

/**
 * スマホのブラウザが、なぞる操作でページごと動いたり（引っぱって再読み込み・端からのスワイプで戻る）、
 * 2本指で画面ごと拡大したりしないようにする
 */
function useTouchGuards(on: boolean) {
  useEffect(() => {
    if (!on) return
    document.body.classList.add('touch')
    const move = (e: TouchEvent) => {
      const el = e.target instanceof Element ? e.target.closest(SCROLLABLE) : null
      // パネルの中は、そのパネルがスクロールできるときだけ指で動かせる
      if (el && el.scrollHeight > el.clientHeight + 1) return
      if (e.cancelable) e.preventDefault()
    }
    // 画面の左右の端から始めたスワイプは、ブラウザの「戻る」にしない（3D の画面の上だけ）
    const start = (e: TouchEvent) => {
      const x = e.touches[0]?.clientX ?? 100
      if (e.target instanceof HTMLCanvasElement && (x < 24 || x > window.innerWidth - 24) && e.cancelable) e.preventDefault()
    }
    const gesture = (e: Event) => e.preventDefault()
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchstart', start, { passive: false })
    document.addEventListener('gesturestart', gesture)
    return () => {
      document.body.classList.remove('touch')
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchstart', start)
      document.removeEventListener('gesturestart', gesture)
    }
  }, [on])
}

/** お知らせ（パソコンでは画面のまんなかに出すメッセージ）を覚えておき、まだ見ていない数を数える */
function useNotices(on: boolean) {
  const toast = useStore((s) => s.toast)
  const [list, setList] = useState<{ id: number; text: string }[]>([])
  const [unread, setUnread] = useState(0)
  // 届いたときに、アイコン列の下に少しだけ出す1行（タップで全文）
  const [ticker, setTicker] = useState<string | null>(null)
  useEffect(() => {
    if (!on || !toast) return
    setList((l) => [toast, ...l.filter((n) => n.id !== toast.id)].slice(0, NOTICE_KEEP))
    setUnread((n) => n + 1)
    setTicker(toast.text)
    const timer = setTimeout(() => setTicker(null), 3500)
    return () => clearTimeout(timer)
  }, [on, toast])
  return { list, unread, ticker, read: () => (setUnread(0), setTicker(null)) }
}

function Icon(props: { glyph: string; label: string; on?: boolean; badge?: number | boolean; disabled?: boolean; onClick: () => void }) {
  const { glyph, label, on, badge, disabled, onClick } = props
  return (
    <button className={`bar-icon${on ? ' on' : ''}`} onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={on}>
      <span className="bar-glyph">
        {glyph}
        {!!badge && <span className="bar-badge">{typeof badge === 'number' ? badge : ''}</span>}
      </span>
      <span className="bar-label">{label}</span>
    </button>
  )
}

/**
 * スマホ・タブレットの画面の上のアイコン列：マップ・航法・スケール・日誌・お知らせ・船を見る・船外（ツムギ）・現実｜SF。
 * 押すとその下にメニューが開く。ふだんの画面には、これと操縦のボタンだけを出す
 */
export function TouchBar() {
  useLang()
  const touch = isTouchDevice()
  useTouchGuards(touch)
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const targetId = useStore((s) => s.targetId)
  const logOpen = useStore((s) => s.logOpen)
  const setLogOpen = useStore((s) => s.setLogOpen)
  const warpPhase = useStore((s) => s.warpPhase)
  const scope = useStore((s) => s.scope)
  const inBridge = useStore((s) => s.cameraMode === 'bridge')
  const sheet = useTouchUI((u) => u.sheet)
  const setSheet = useTouchUI((u) => u.setSheet)
  const sf = useSF()
  const racePhase = useRace((r) => r.phase)
  const racing = racePhase === 'countdown' || racePhase === 'running'
  const notices = useNotices(touch)

  // 目標が変わったり、日誌が閉じられたりしたら、日誌のメニューもしまう
  useEffect(() => {
    if (sheet === 'log' && !logOpen) setSheet(null)
  }, [sheet, logOpen, setSheet])
  // 全体マップ・鑑賞モードに移ったら、メニューはしまう
  useEffect(() => setSheet(null), [mode, setSheet])
  // 画面ごとの見た目の切り替え（touch.css）
  useEffect(() => {
    document.body.dataset.mode = mode
    document.body.dataset.sheet = sheet ?? ''
  }, [mode, sheet])

  if (!touch || scope) return null
  const hasLog = !!targetId && !!factsFor(targetId)
  const toggle = (s: NonNullable<Sheet>) => {
    if (sheet === s) {
      setSheet(null)
      return
    }
    if (s === 'log') setLogOpen(true)
    if (s === 'notice') notices.read()
    setSheet(s)
  }

  return (
    <>
      {sheet && <div className="sheet-backdrop" onClick={() => setSheet(null)} />}
      <nav className="touch-bar" aria-label={ui().touchBar.menu}>
        {mode === 'gallery' ? (
          <Icon glyph="◀" label={ui().touchBar.cockpit} onClick={closeGallery} />
        ) : (
          <>
            <Icon
              glyph={mode === 'map' ? '◀' : '◎'}
              label={mode === 'map' ? ui().touchBar.cockpit : ui().touchBar.map}
              onClick={() => setMode(mode === 'map' ? 'flight' : 'map')}
            />
            <Icon glyph="✦" label={ui().touchBar.navigate} on={sheet === 'nav'} onClick={() => toggle('nav')} />
            <Icon glyph="⇔" label={ui().touchBar.scale} on={sheet === 'scale'} onClick={() => toggle('scale')} />
            <Icon glyph="❒" label={ui().touchBar.log} on={sheet === 'log'} badge={logOpen && sheet !== 'log'} disabled={!hasLog} onClick={() => toggle('log')} />
            <Icon glyph="✉" label={ui().touchBar.news} on={sheet === 'notice'} badge={notices.unread} disabled={notices.list.length === 0} onClick={() => toggle('notice')} />
            {mode === 'flight' &&
              (inBridge ? (
                <Icon glyph="◀" label={ui().touchBar.outside} on onClick={leaveBridge} />
              ) : (
                <Icon glyph="⌂" label={ui().touchBar.bridge} disabled={racing} onClick={() => (setSheet(null), enterBridge())} />
              ))}
            {mode === 'flight' && <Icon glyph="◇" label={ui().touchBar.ship} disabled={warpPhase !== 'idle' || !canOpenGallery()} onClick={openGallery} />}
            {mode === 'flight' && (
              <Icon
                glyph="◉"
                label={ui().touchBar.eva}
                disabled={warpPhase !== 'idle' || racing}
                onClick={() => {
                  if (!canStartEva(landed())) return
                  setSheet(null)
                  startEva()
                }}
              />
            )}
          </>
        )}
        <button className={`bar-world${sf ? ' sf' : ''}`} onClick={() => setWorld(sf ? 'real' : 'sf')} disabled={racing} aria-label={ui().touchBar.switchRealSf}>
          <span className={sf ? '' : 'on'}>{ui().touchBar.real}</span>
          <span className={sf ? 'on' : ''}>SF</span>
        </button>
      </nav>
      {notices.ticker && !sheet && (
        <button className="notice-ticker" onClick={() => toggle('notice')}>
          {notices.ticker}
        </button>
      )}
      {sheet === 'scale' && <ScaleSheet />}
      {sheet === 'notice' && (
        <section className="notice-panel" aria-label={ui().touchBar.news}>
          <header>
            <h2>{ui().touchBar.news}</h2>
            <button className="close" onClick={() => setSheet(null)} aria-label={ui().touchBar.close}>
              ×
            </button>
          </header>
          <ul>
            {notices.list.map((n) => (
              <li key={n.id}>{n.text}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
