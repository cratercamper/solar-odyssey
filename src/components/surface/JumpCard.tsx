import { useEffect, useState } from 'react'
import { jumpOn, playbackSpeed } from '../../data/jump'
import { CROUCH, LAND, startJump, stopJump, useJump } from '../../state/jump'
import { useLanding } from '../../state/landing'
import { useRover } from '../../state/rover'
import { playBeep } from '../../audio/sfx'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import './jump.css'

/** 重力ジャンプのボタン（着陸船のまわりのボタンの列に入れる） */
export function JumpButton({ bodyId }: { bodyId: string }) {
  useLang()
  if (!jumpOn(bodyId)) return null
  return (
    <button className="secondary jump-start" onClick={() => startJump(bodyId)} title={ui().jump.buttonTip}>
      {ui().jump.button}
    </button>
  )
}

/** 跳んでいるあいだの一言と、着地したあとの結果（高さ・空中の時間・地球なら何回） */
export function JumpCard() {
  const id = useJump((s) => s.id)
  const at = useJump((s) => s.at)
  const landed = useJump((s) => s.landed)
  const phase = useLanding((l) => l.phase)
  const rover = useRover((r) => r.phase)
  const [, setTick] = useState(0)
  useLang()

  // 地表を離れたり、ローバーを出したりしたら終わる
  useEffect(() => {
    if (id && (phase !== 'surface' || rover !== 'none')) stopJump()
  }, [id, phase, rover])

  // スマホでは、跳んでいるあいだ下のボタンの列をしまう（二人が隠れないように。jump.css）
  useEffect(() => {
    if (!id) return
    document.documentElement.classList.add('jumping')
    return () => document.documentElement.classList.remove('jumping')
  }, [id])

  // 着地の音
  useEffect(() => {
    if (!landed) return
    playBeep(660, 0.12)
    const t = setTimeout(() => playBeep(990, 0.25), 120)
    return () => clearTimeout(t)
  }, [landed])

  // 「せーの」から跳ぶまでの音
  useEffect(() => {
    if (!id) return
    const t = setTimeout(() => playBeep(520, 0.1), CROUCH * 1000 - 60)
    const r = setInterval(() => setTick((n) => n + 1), 250)
    return () => (clearTimeout(t), clearInterval(r))
  }, [id, at])

  const j = id ? jumpOn(id) : null
  if (!j) return null
  const tx = ui().jump
  const speed = playbackSpeed(j.airtime)
  const earth = jumpOn('earth')!
  const times = j.height / earth.height
  const earthJumps = Math.floor(j.airtime / (CROUCH + j.earthAirtime + LAND))
  return (
    <section className={`jump-card${landed ? ' done' : ''}`} role="status">
      {!landed ? (
        <p className="jump-now">
          {tx.jumping}
          {speed > 1 && <span className="jump-ff">⏩ {tx.fastForward(speed)}</span>}
        </p>
      ) : (
        <>
          <p className="jump-result">{tx.result(j.height, times)}</p>
          <p className="jump-air">{tx.airtime(j.airtime, j.airtime / j.earthAirtime)}</p>
          {earthJumps > 1 && <p className="jump-earth">{tx.earthJumps(earthJumps)}</p>}
          <div className="jump-actions">
            <button className="jump-again" onClick={() => startJump(j.id)}>
              ↻ {tx.again}
            </button>
            <button className="secondary" onClick={stopJump}>
              {tx.close}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
