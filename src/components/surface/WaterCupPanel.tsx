import { useEffect, useMemo } from 'react'
import type { SurfaceDef } from '../../data/surfaces'
import { boilingPoint, pressureKPa, waterGone, TRIPLE_KPA } from '../../data/water'
import { placeCup, removeCup, useWaterCup } from '../../state/waterCup'
import { stopJump, useJump } from '../../state/jump'
import { useLanding } from '../../state/landing'
import { useRover } from '../../state/rover'
import { useSuitWalk } from '../../state/suitWalk'
import { dayProfile } from './dayProfile'
import { useSkyClock } from './skyClock'
import { playBeep } from '../../audio/sfx'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import './waterCup.css'

// 水のコップ：着陸船のまわりのボタンと、上のカード（見出し・なぜ・早回しのすすめ、の 3 行まで）

export function WaterCupButton({ bodyId }: { bodyId: string }) {
  useLang()
  return (
    <button
      className="secondary cup-start"
      onClick={() => {
        stopJump()
        placeCup(bodyId)
        playBeep(880, 0.08)
      }}
      title={ui().waterCup.buttonTip}
    >
      {ui().waterCup.button}
    </button>
  )
}

const speedText = (sim: number) => {
  const tx = ui().waterCup
  if (sim < 3600) return tx.speed(tx.minutes(Math.round(sim / 60)))
  const h = sim / 3600
  return tx.speed(tx.hours(h < 10 ? h.toFixed(1) : String(Math.round(h))))
}

export function WaterCupCard({ def }: { def: SurfaceDef }) {
  useLang()
  const id = useWaterCup((c) => c.id)
  const at = useWaterCup((c) => c.at)
  const w = useWaterCup((c) => c.water)
  const env = useWaterCup((c) => c.env)
  const sim = useWaterCup((c) => c.sim)
  const rate = useSkyClock((c) => c.rate)
  const phase = useLanding((l) => l.phase)
  const rover = useRover((r) => r.phase)
  const walking = useSuitWalk((s) => s.on)
  const jumping = useJump((j) => j.id)
  const profile = useMemo(() => dayProfile(def), [def])

  // 地表を離れる・ほかの星へ・ローバーや宇宙服で出る・ジャンプを始めたら、片づける
  useEffect(() => {
    if (id && (phase !== 'surface' || id !== def.id || rover !== 'none' || walking || jumping)) removeCup()
  }, [id, def.id, phase, rover, walking, jumping])

  // スマホでは、置いているあいだ下のボタンの列をしまう（コップが隠れないように。waterCup.css）
  useEffect(() => {
    if (!id) return
    document.documentElement.classList.add('cup-on')
    return () => document.documentElement.classList.remove('cup-on')
  }, [id])

  if (!id || id !== def.id) return null
  const tx = ui().waterCup
  const kPa = pressureKPa(def.id)
  const thin = kPa < TRIPLE_KPA
  const tb = boilingPoint(kPa)
  const T = Math.round(env)
  const gone = waterGone(w)
  const fresh = performance.now() - at < 700
  let head: string
  let why = ''
  let hint: 'waitDay' | 'staysIce' | null = null
  if (fresh) head = tx.head.placed
  else if (thin) {
    const mars = def.id === 'mars'
    const base = mars ? tx.why.thin : tx.why.vacuum
    if (gone) {
      head = tx.head.vacuumGone
      why = def.id === 'moon' ? tx.why.moonGone : tx.why.vacuumGone
    } else if (w.liquid > 0) {
      head = mars ? tx.head.thinBoil : tx.head.vacuumBoil
      why = base
    } else if (w.sublime > 0.05) {
      head = tx.head.subliming
      why = tx.why.subliming
    } else {
      head = tx.head.flashFrozen
      why = base
      // 昼に暖まる星なら、昼まで待つと消えていく
      hint = profile.max > -60 ? 'waitDay' : 'staysIce'
    }
  } else if (gone) {
    head = tx.head.boiledAway
    why = def.id === 'venus' ? tx.why.venus : tx.why.boil(T)
  } else if (w.boil > 0.3) {
    head = tx.head.boiling(Math.round(tb!))
    why = def.id === 'venus' ? tx.why.venus : tx.why.boil(T)
  } else if (w.freezing) {
    head = tx.head.freezing
    why = def.id === 'titan' ? tx.why.titan : tx.why.frozen(T)
  } else if (w.liquid === 0) {
    head = tx.head.frozen
    why = def.id === 'titan' ? tx.why.titan : tx.why.frozen(T)
    hint = def.id === 'titan' ? 'staysIce' : profile.max > 0 ? 'waitDay' : 'staysIce'
  } else if (tb !== null && env > tb) {
    head = tx.head.heating
    why = def.id === 'venus' ? tx.why.venus : tx.why.boil(T)
  } else if (env < 0 && w.liquid > 0) {
    head = tx.head.cooling
    why = def.id === 'titan' ? tx.why.titan : tx.why.frozen(T)
  } else if (w.ice > 0 && env > 0) {
    head = tx.head.melting
    why = tx.why.liquid(T)
  } else {
    head = tx.head.liquid
    why = def.id === 'earth' ? tx.why.earth : tx.why.liquid(T)
  }
  return (
    <section className="cup-card" role="status">
      <p className="cup-head" key={head}>{head}</p>
      {why && <p className="cup-why">{why}</p>}
      <div className="cup-row">
        {hint && <span className="cup-hint">{tx.hint[hint]}</span>}
        {hint && hint !== 'staysIce' && rate !== 'day' ? (
          <button className="cup-ff" onClick={() => useSkyClock.getState().setRate('day')}>
            {tx.fastForward}
          </button>
        ) : (
          <span className="cup-speed">⏩ {speedText(sim)}</span>
        )}
      </div>
      <div className="cup-actions">
        <button className="cup-again" onClick={() => placeCup(def.id)}>
          ↻ {tx.again}
        </button>
        <button className="secondary" onClick={removeCup}>
          {tx.close}
        </button>
      </div>
    </section>
  )
}
