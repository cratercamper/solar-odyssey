import * as THREE from 'three'
import { create } from 'zustand'
import type { SurfaceDef } from '../../data/surfaces'
import { sunriseOf } from './sunriseDir'
import { useLanding } from '../../state/landing'
import { dayHours, useSkyClock, type TimeRate } from './skyClock'
import { aimToward } from './viewAim'

// 日の出を見る：時刻バーの「日の出」で、日の出の少し前まで時間を進め、早回しにして、太陽がのぼる方角を向く。
// 地平線に東西南北の文字を出す（HorizonCompass）。金星・冥王星・トリトンは逆向きに回るので、太陽は西からのぼる

type SunriseState = { id: string | null; at: number }
export const useSunrise = create<SunriseState>(() => ({ id: null, at: 0 }))

/** 日の出の案内を出している長さ（秒） */
export const SUNRISE_SHOW = 14
/** 日の出の何時間前（地方の時刻）から見はじめるか */
const LEAD = 1.1

let restore: ReturnType<typeof setTimeout> | null = null

export { sunriseOf }

export function watchSunrise(def: SurfaceDef) {
  const r = sunriseOf(def)
  if (!r) return
  const c = useSkyClock.getState()
  const ahead = (((r.clock - LEAD - c.clock) % 24) + 24) % 24
  const prevRate: TimeRate = c.rate
  useSkyClock.setState({ seek: c.hours + (ahead / 24) * Math.abs(dayHours(def.id)), rate: 'day' })
  useLanding.setState({ view: 'eye' })
  // 地平線の少し上を見る
  aimToward(new THREE.Vector3(r.dir.x, 0.1, r.dir.z), 6, 60)
  useSunrise.setState({ id: def.id, at: performance.now() })
  // 太陽がのぼりきったら、もとの速さへ
  if (restore) clearTimeout(restore)
  restore = setTimeout(() => {
    restore = null
    if (prevRate !== 'day' && useSkyClock.getState().rate === 'day') useSkyClock.getState().setRate(prevRate)
  }, 9000)
}
