import { evaActive } from '../state/eva'
import { useEffect } from 'react'
import { useStore } from '../state/store'
import { THROTTLE_STEPS } from '../state/throttle'
import { raceActive } from '../state/race'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'

/** 推進の段階の名前 */
const stepName = (step: number) =>
  [
    ui().throttle.deadSlow,
    ui().throttle.slow,
    ui().throttle.half,
    ui().throttle.cruise,
    ui().throttle.fast,
    ui().throttle.full,
  ][step]

/** 倍率の表示（×0.1・×1・×4） */
const times = (step: number) => `×${THROTTLE_STEPS[step]}`

/** ホイールのひと目盛り（ピクセル）。トラックパッドの細かい量はためてから1段にする */
const WHEEL_NOTCH = 60
/** 1段切り替えたあと、次を受け付けるまで（トラックパッドの慣性で何段も飛ばないように） */
const WHEEL_PAUSE_MS = 120

/**
 * 操縦中のマウスホイールで推進の段階を切り替える（奥へ回すと速く、手前で遅く）。
 * ホイールは全体マップ・鑑賞モード・望遠鏡ではズームに使うので、操縦席で画面（canvas）の上を回したときだけ。
 * 航法コンピュータなどの一覧の上では、ふつうにスクロールする
 */
export function useThrottleWheel() {
  useEffect(() => {
    let acc = 0
    let pausedUntil = 0
    const onWheel = (e: WheelEvent) => {
      const s = useStore.getState()
      if (s.mode !== 'flight' || s.scope || raceActive() || evaActive()) return
      if (!(e.target instanceof HTMLCanvasElement) && !document.pointerLockElement) return
      const now = performance.now()
      if (now < pausedUntil) return
      acc += e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1)
      if (Math.abs(acc) < WHEEL_NOTCH) return
      s.setThrottle(s.throttle + (acc < 0 ? 1 : -1))
      acc = 0
      pausedUntil = now + WHEEL_PAUSE_MS
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])
}

/** パソコン：ワープのボタンの上に、推進の段階と今の速さ（目盛りはクリックでも選べる） */
export function ThrottleMeter() {
  useLang()
  const throttle = useStore((s) => s.throttle)
  const setThrottle = useStore((s) => s.setThrottle)
  const speed = useStore((s) => s.telemetry.speed)
  const mode = useStore((s) => s.mode)
  if (mode !== 'flight') return null
  return (
    <div className="nav-throttle" title={ui().throttle.wheelTip}>
      <div className="nav-throttle-head">
        <span>
          {ui().throttle.thrust} <b>{stepName(throttle)}</b> <span className="muted">{times(throttle)}</span>
        </span>
        <span className="nav-throttle-speed">
          {ui().throttle.speed} <b>{speed.toFixed(1)}</b>
        </span>
      </div>
      <div className="nav-throttle-bar" role="group" aria-label={ui().throttle.thrustLevel}>
        {THROTTLE_STEPS.map((_, i) => (
          <button key={i} className={i <= throttle ? 'on' : ''} onClick={() => setThrottle(i)} aria-pressed={i === throttle} title={`${stepName(i)} ${times(i)}`} />
        ))}
      </div>
      <div className="nav-throttle-hint muted">{ui().throttle.wheelHint}</div>
    </div>
  )
}

/** スマホ・タブレット：ワープのボタンの上に、−／＋ と推進の段階・今の速さ */
export function TouchThrottle() {
  useLang()
  const throttle = useStore((s) => s.throttle)
  const setThrottle = useStore((s) => s.setThrottle)
  const speed = useStore((s) => s.telemetry.speed)
  return (
    <div className="touch-throttle" role="group" aria-label={ui().throttle.thrustLevel}>
      <button onClick={() => setThrottle(throttle - 1)} disabled={throttle === 0} aria-label={ui().throttle.slower}>
        −
      </button>
      <span className="touch-throttle-read">
        <b>{stepName(throttle)}</b>
        <span>
          {ui().throttle.speed} {speed.toFixed(1)}
        </span>
      </span>
      <button onClick={() => setThrottle(throttle + 1)} disabled={throttle === THROTTLE_STEPS.length - 1} aria-label={ui().throttle.faster}>
        ＋
      </button>
    </div>
  )
}
