import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// 宇宙船に寄る：外から見るカメラのとき、ホイール・2 本指でつまむと、宇宙船に近づく（テープの筋、フィルムのしわまで見える）。
// 寄る量 z は 1（ふつう）〜 MIN_Z（いちばん近く）。カメラは「船の中心から今のカメラへの向き」のまま距離だけ縮め、見る点も船へ寄せる。
// 場面（章・段階）がかわったら 1 にもどす（呼ぶ側で reset）

export const MIN_Z = 0.12
export const craftZoom = { z: 1, want: 1 }

export function resetCraftZoom() {
  craftZoom.z = craftZoom.want = 1
}

/** want（カメラの位置）と look（見る点）を、center（船の中心）へ寄せる。minDist より近くには寄らない */
export function applyCraftZoom(want: THREE.Vector3, look: THREE.Vector3, center: THREE.Vector3, minDist = 5) {
  const z = craftZoom.z
  if (z > 0.999) return
  const d = want.distanceTo(center)
  if (d < 1e-3) return
  const nd = Math.max(Math.min(minDist, d), d * z)
  want.sub(center).multiplyScalar(nd / d).add(center)
  look.lerp(center, THREE.MathUtils.clamp((1 - z) * 1.3, 0, 1))
}

/** ホイール・2 本指を、いまの画面（Canvas）に結ぶ。毎フレーム、なめらかに目標へ */
export function useCraftZoom() {
  const el = useThree((s) => s.gl.domElement)
  useEffect(() => {
    resetCraftZoom()
    const pts = new Map<number, { x: number; y: number }>()
    let pinch = 0
    const set = (k: number) => (craftZoom.want = THREE.MathUtils.clamp(craftZoom.want * k, MIN_Z, 1))
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        pinch = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId)
      if (!p) return
      p.x = e.clientX
      p.y = e.clientY
      if (pts.size !== 2) return
      const [a, b] = [...pts.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch > 0 && d > 0) set(pinch / d)
      pinch = d
    }
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId)
      pinch = 0
    }
    const wheel = (e: WheelEvent) => {
      set(Math.exp(e.deltaY * 0.0015))
      e.preventDefault()
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      resetCraftZoom()
    }
  }, [el])
  useFrame((_, dt) => {
    craftZoom.z += (craftZoom.want - craftZoom.z) * (1 - Math.exp(-Math.min(dt, 0.1) * 5))
  })
}
