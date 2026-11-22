import * as THREE from 'three'
import type { SurfaceDef } from '../../data/surfaces'
import { SkyFrame } from './skyClock'

// 日の出の時刻と方角（sunrise.ts が使う。空の回り方 SkyFrame から、太陽が地平線を下から上へ越える時を探す）

export type Sunrise = {
  /** 日の出の地方の時刻（0〜24） */
  clock: number
  /** 太陽がのぼる方角（場面の向き、水平の単位ベクトル） */
  dir: THREE.Vector3
  /** 場面の向きでの東と北 */
  east: THREE.Vector3
  north: THREE.Vector3
  /** 西からのぼる */
  west: boolean
}

const cache = new Map<string, Sunrise | null>()

/** その星の日の出（太陽が沈まない・のぼらない場所なら null） */
export function sunriseOf(def: SurfaceDef): Sunrise | null {
  const key = `${def.id}:${def.site ?? ''}`
  if (cache.has(key)) return cache.get(key)!
  const f = new SkyFrame(def)
  const day = Math.abs(f.day)
  const sun = new THREE.Vector3()
  const N = 1440
  let prev = 0
  let out: Sunrise | null = null
  for (let i = 0; i <= N; i++) {
    f.at((i / N) * day)
    f.sunLocal(sun)
    if (i > 0 && prev <= 0 && sun.y > 0) {
      const east = new THREE.Vector3(1, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -f.azOffset)
      const north = new THREE.Vector3(0, 0, -1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -f.azOffset)
      const dir = new THREE.Vector3(sun.x, 0, sun.z).normalize()
      out = { clock: f.localClock(), dir, east, north, west: dir.dot(east) < 0 }
      break
    }
    prev = sun.y
  }
  cache.set(key, out)
  return out
}

