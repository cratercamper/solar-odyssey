import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useLayout } from '../state/useLayout'
import { BLACK_HOLE_POS, DESERT_POS, ICE_POS } from '../data/sf'
import { colonyWalk } from '../state/walk'
import { useStore } from '../state/store'

/**
 * 天体の名札（drei の Html）の重なり順。既定ではとても大きな z-index になり、
 * 航法コンピュータや航海日誌の上に名札がかぶるので、画面の部品より下にする
 */
export const LABEL_Z: [number, number] = [0, 0]

const at = new THREE.Vector3()
const sight = new THREE.Vector3()

/** カメラから見て、その位置が太陽（原点）の向こうに隠れているか */
export function behindSun(eye: THREE.Vector3, p: THREE.Vector3, sun: number) {
  sight.subVectors(p, eye)
  const len = sight.length()
  sight.divideScalar(len)
  // 視線のうち、太陽にいちばん近づくところ
  const t = -eye.dot(sight)
  return t > 0 && t < len && eye.lengthSq() - t * t < sun * sun
}

const FAR_PLACES = [BLACK_HOLE_POS, DESERT_POS, ICE_POS].map((p) => new THREE.Vector3(...p))
const FAR_NEAR = 3000

/** 太陽系の外の遠い場所（ブラックホール・系外惑星）の近くにいるか。そこでは太陽系の名札を出さない */
export function nearFarPlace(eye: THREE.Vector3) {
  return FAR_PLACES.some((p) => eye.distanceToSquared(p) < FAR_NEAR * FAR_NEAR)
}

/**
 * コロニーの円筒の中を飛んでいるか。中からは外の天体や船は壁で見えないのに、名札（HTML）は壁を透けて
 * 見えてしまうので、中にいるあいだは名札を出さない（全体マップでは出す）
 */
export const insideColony = () => colonyWalk.inside !== null && useStore.getState().mode === 'flight'

/** 名札は奥まで透けて見えるので、太陽の向こうに隠れたら消す（太陽を大きくしたときに目立つ）。コロニーの中でも消す */
export function useHideBehindSun(span: RefObject<HTMLElement | null>, anchor: RefObject<THREE.Object3D | null>) {
  const sun = useLayout().sun
  useFrame(({ camera }) => {
    if (!span.current || !anchor.current) return
    const hide = insideColony() || nearFarPlace(camera.position) || behindSun(camera.position, anchor.current.getWorldPosition(at), sun)
    span.current.style.display = hide ? 'none' : ''
  })
}
