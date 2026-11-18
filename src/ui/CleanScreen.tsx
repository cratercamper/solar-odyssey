// Shift+F12 か右上の小さなボタン：画面の文字とボタンをぜんぶ消して、3D の場面だけにする（スクリーンショットや、景色をながめるとき）。
// もう一度押すと戻る。<html> に clean-screen をつけるだけで、消すのは index.css。ゲームの中身は何も変えない
// （止めない・レースの時計もそのまま・ほかのキーも効く）。覚えておかないので、読み込み直すと、ふつうの画面に戻る
import { useSyncExternalStore } from 'react'
import { ui } from '../i18n'
import { useLang } from '../i18n/lang'

const CLEAN = 'clean-screen'

// 右上のボタンをいつ出すか：off（出さない）・clean（消したときだけ、戻すため）・hud（ふだんの画面のときだけ、消すため）・both（いつでも）。
// ここで決める。リンクでも試せる（#cleanbutton=clean など）
type ButtonWhen = 'off' | 'clean' | 'hud' | 'both'
const BUTTON_WHEN: ButtonWhen = 'both'
const buttonWhen = (/[?&#]cleanbutton=(off|clean|hud|both)\b/.exec(location.search + location.hash)?.[1] as ButtonWhen | undefined) ?? BUTTON_WHEN

const listeners = new Set<() => void>()
const isClean = () => document.documentElement.classList.contains(CLEAN)

/** 消す・戻すを切り替える（キーとボタンの両方から） */
export function toggleCleanScreen() {
  document.documentElement.classList.toggle(CLEAN)
  for (const f of listeners) f()
}

const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}

export function setupCleanScreen() {
  window.addEventListener(
    'keydown',
    (e) => {
      // Ctrl・Alt・Meta もいっしょに押したときは、ブラウザのキーとして残す
      if (e.code !== 'F12' || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return
      e.preventDefault()
      if (!e.repeat) toggleCleanScreen()
    },
    true,
  )
}

/** 右上の小さなボタン。どの画面でも同じ場所。いつ出すかは buttonWhen。ふだんはほとんど見えず、マウスを重ねるとはっきり見える */
export function CleanScreenButton() {
  useLang()
  const clean = useSyncExternalStore(subscribe, isClean)
  if (buttonWhen === 'off' || (buttonWhen === 'clean' && !clean) || (buttonWhen === 'hud' && clean)) return null
  const t = ui().cleanScreen
  return (
    <button className="clean-screen-button" onClick={toggleCleanScreen} title={t.tip}>
      {clean ? t.show : t.hide}
      <kbd>Shift+F12</kbd>
    </button>
  )
}
