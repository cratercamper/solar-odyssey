import { useEffect, useState } from 'react'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { isTouchDevice } from '../../state/input'
import { TIMELAPSE, missionNow, useMoonMission } from '../../state/moonMission'
import { pickPart, skipTimelapse, toLaunchNight, toggleCut, toggleSize, useExplorer } from '../../state/saturnExplorer'
import { APOLLO17_LIFTOFF } from '../../data/siteSky'
import { liveSky } from './launchClock'
import { orbit } from './explorerCam'
import './saturnExplorer.css'

// 観察パート（サターンV 図鑑）の画面：見出し、選んだ部品の説明（3 行まで）、断面・大きさくらべ・打ち上げの夜へのボタン。
// タイムラプスのあいだは、めくれていく日付と時刻。

/** 米東部時間（1972 年の冬は標準時、世界時 − 5 時間） */
function eastern(ms: number) {
  const d = new Date(ms - 5 * 3_600_000)
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }
}

/** 毎フレーム描き直す（時計・案内） */
function useTick(on: boolean) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!on) return
    let raf = 0
    const loop = () => {
      set((n) => n + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [on])
}

export function SaturnExplorer() {
  useLang()
  const t = ui().saturnExplorer
  const phase = useMoonMission((s) => s.phase)
  const since = useMoonMission((s) => s.since)
  const ex = useExplorer()
  const lapse = phase === 'timelapse'
  useTick(lapse || !ex.seen)
  if (lapse) {
    const u = (missionNow() - since) / TIMELAPSE
    const c = eastern(liveSky.ms)
    const days = Math.max(0, Math.round((APOLLO17_LIFTOFF - liveSky.ms) / 86_400_000))
    return (
      <div className="se-lapse">
        <div className="se-clock">{t.clock(c.y, c.mo, c.d, c.h, c.mi)}</div>
        <div className="se-zone">{t.zone}</div>
        <div className="se-days" key={days}>
          {t.daysLeft(days)}
        </div>
        <div className="se-lapse-note">{u < 0.46 ? t.dusk : u < 0.93 ? t.waning : t.launchNight}</div>
        <button className="se-skip" onClick={() => skipTimelapse()}>
          {t.skip}
        </button>
      </div>
    )
  }
  const p = ex.part ? t.parts[ex.part] : null
  return (
    <div className="se-root">
      <div className="se-head">
        <div className="se-title">{t.title}</div>
        <div className="se-where">{t.where}</div>
        {!ex.seen && !orbit.touched && <div className="se-hint">{isTouchDevice() ? t.hintTouch : t.hint}</div>}
      </div>
      {p && (
        <div className="se-card" key={ex.part}>
          <div className="se-card-name">{p.name}</div>
          <div className="se-card-fact">{p.fact}</div>
          {p.lines.map((l, i) => (
            <div className="se-card-line" key={i}>
              {l}
            </div>
          ))}
          <button className="se-card-back" onClick={() => pickPart(null)}>
            {t.whole}
          </button>
        </div>
      )}
      {ex.size && !p && <div className="se-size-note">{t.sizeNote}</div>}
      <div className="se-buttons">
        <button className={ex.cutAll ? 'on' : ''} onClick={() => toggleCut()}>
          {t.cut}
        </button>
        <button className={ex.size ? 'on' : ''} onClick={() => toggleSize()}>
          {t.size}
        </button>
        <button className="se-go" onClick={() => toLaunchNight()}>
          {t.toNight}
        </button>
      </div>
    </div>
  )
}
