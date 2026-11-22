import * as THREE from 'three'

// 自分の目の高さで見ているとき、しばらく決まった点の方へ向き直す（SurfaceView の Look が読む）。
// 水のコップを置いたとき（WaterCup）や、日の出を見るとき（sunrise.ts）に使う。fov が 0 でなければ、その画角へ寄せる

export const viewAim = { until: 0, point: new THREE.Vector3(), fov: 0, dir: null as THREE.Vector3 | null }

const now = () => performance.now() / 1000

export function aimAt(point: THREE.Vector3, seconds: number, fov = 0) {
  viewAim.point.copy(point)
  viewAim.until = now() + seconds
  viewAim.fov = fov
  viewAim.dir = null
}

/** 点ではなく向き（地方の向きの単位ベクトル）で向き直す：遠くの日の出の方角など */
export function aimToward(dir: THREE.Vector3, seconds: number, fov = 0) {
  aimAt(dir, seconds, fov)
  viewAim.dir = viewAim.point
}

export const aiming = () => viewAim.until > now()

export const stopAim = () => void (viewAim.until = 0)
