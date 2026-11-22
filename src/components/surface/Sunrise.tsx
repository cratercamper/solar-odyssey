import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { SurfaceDef } from '../../data/surfaces'
import { SUNRISE_SHOW, sunriseOf, useSunrise } from './sunrise'
import { dayHours } from './skyClock'
import { ui } from '../../i18n'
import { useLang } from '../../i18n/lang'

// 日の出の案内：地平線の東西南北の文字（場面の中）と、上のカード（画面）。sunrise.ts の watchSunrise で始まる

const showing = (at: number) => at > 0 && performance.now() - at < SUNRISE_SHOW * 1000

/** 地平線の方角の文字（日の出を見ているあいだ） */
export function HorizonCompass({ def }: { def: SurfaceDef }) {
  useLang()
  const at = useSunrise((s) => s.at)
  const id = useSunrise((s) => s.id)
  const { camera } = useThree()
  const group = useRef<THREE.Group>(null)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!at) return
    const t = setTimeout(() => setTick((n) => n + 1), SUNRISE_SHOW * 1000 + 50)
    return () => clearTimeout(t)
  }, [at])
  useFrame(() => group.current?.position.copy(camera.position))
  const r = sunriseOf(def)
  if (!r || id !== def.id || !showing(at)) return null
  const tx = ui().sunrise
  const D = 400
  const marks = [
    { v: r.north, label: tx.north },
    { v: r.east, label: tx.east },
    { v: r.north.clone().negate(), label: tx.south },
    { v: r.east.clone().negate(), label: tx.west },
  ]
  return (
    <group ref={group}>
      {marks.map((m) => {
        const rise = m.v.dot(r.dir) > 0.92
        return (
          <group key={m.label} position={[m.v.x * D, 14, m.v.z * D]}>
            <Html center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
              <div className={`compass-mark${rise ? ' rise' : ''}`}>{m.label}</div>
            </Html>
          </group>
        )
      })}
      <group position={[r.dir.x * D, 2, r.dir.z * D]}>
        <Html center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <div className="compass-sun">▼</div>
        </Html>
      </group>
    </group>
  )
}

/** 上のカード：太陽はどちらからのぼるか、なぜか */
export function SunriseCard({ def }: { def: SurfaceDef }) {
  useLang()
  const at = useSunrise((s) => s.at)
  const id = useSunrise((s) => s.id)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!at) return
    const t = setTimeout(() => setTick((n) => n + 1), SUNRISE_SHOW * 1000 + 50)
    return () => clearTimeout(t)
  }, [at])
  const r = sunriseOf(def)
  if (!r || id !== def.id || !showing(at)) return null
  const tx = ui().sunrise
  const h = Math.abs(dayHours(def.id))
  const day = h < 48 ? ui().timeBar.dayInEarthHours(h.toFixed(1)) : ui().timeBar.dayInEarthDays((h / 24).toFixed(h > 240 ? 0 : 1))
  const why = r.west ? (tx.whyWest as Record<string, string>)[def.id] ?? tx.whyWest.other : tx.whyEast
  return (
    <section className={`sunrise-card${r.west ? ' west' : ''}`} role="status">
      <p className="sunrise-head">{r.west ? tx.fromWest : tx.fromEast}</p>
      <p className="sunrise-why">{why}</p>
      <p className="sunrise-day">{day}</p>
    </section>
  )
}
