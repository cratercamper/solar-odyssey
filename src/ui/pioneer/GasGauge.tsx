import { useEffect, useRef, useState } from 'react'
import { ui } from '../../i18n'
import { proximity } from '../../state/proximity'
import { thrustFx } from '../../state/flight'
import { useStore } from '../../state/store'
import { GAS_BAND, GAS_MIN_SPEED, GAS_TOO_DEEP } from '../../data/pioneer'

// 木星のそばで出る、雲からの高さのメーター。ガスがたまる帯（紫）・深すぎ（赤）・自分の高さ（三角）と、速さが足りているか

/** メーターの上と下（雲からの高さ ÷ 半径） */
const TOP = 0.15
const BOTTOM = -0.09
/** この高さより下に来たら出す */
const SHOW_BELOW = 0.3

const y = (h: number) => (1 - (Math.min(TOP, Math.max(BOTTOM, h)) - BOTTOM) / (TOP - BOTTOM)) * 100

export function GasGauge() {
  const [show, setShow] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const marker = useRef<HTMLSpanElement>(null)
  const showing = useRef(false)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const st = useStore.getState()
      const h = proximity.radius > 0 ? proximity.altitude / proximity.radius : Infinity
      const on = proximity.id === 'jupiter' && h < SHOW_BELOW && st.mode === 'flight' && st.warpPhase === 'idle'
      if (on !== showing.current) {
        showing.current = on
        setShow(on)
      }
      if (!on || !box.current || !marker.current) return
      marker.current.style.top = `${y(h)}%`
      const inBand = h >= GAS_BAND.low && h < GAS_BAND.high
      const fast = thrustFx.speed >= GAS_MIN_SPEED
      box.current.dataset.zone = h < GAS_TOO_DEEP ? 'deep' : inBand ? 'band' : 'above'
      box.current.dataset.fast = fast ? '1' : '0'
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const t = ui().pioneer.gauge
  return (
    <div ref={box} className="pio-gauge" hidden={!show} role="img" aria-label={t.title}>
      <span className="pio-gauge-title">{t.title}</span>
      <span className="pio-gauge-track">
        <span className="pio-gauge-band" style={{ top: `${y(GAS_BAND.high)}%`, bottom: `${100 - y(GAS_BAND.low)}%` }} />
        <span className="pio-gauge-deep" style={{ top: `${y(GAS_TOO_DEEP)}%` }} />
        <span ref={marker} className="pio-gauge-ship" />
      </span>
      <span className="pio-gauge-legend">
        <span className="band">{t.band}</span>
        <span className="deep">{t.deep}</span>
      </span>
      <span className="pio-gauge-speed">
        <span className="fast">{t.fast}</span>
        <span className="slow">{t.slow}</span>
      </span>
      <span className="pio-gauge-on">{t.collecting}</span>
    </div>
  )
}
