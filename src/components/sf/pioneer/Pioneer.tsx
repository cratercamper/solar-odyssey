import { lazy, Suspense } from 'react'
import { usePioneer } from '../../../state/pioneer'
import { useDelivery } from '../../../state/delivery'

// 開拓の入口（App から置く）。開拓で遊んでいるときだけ、3D の部分と画面を読み込む（ふだんの起動を重くしない）
const Scene = lazy(() => import('./PioneerScene').then((m) => ({ default: m.PioneerScene })))
const Runner = lazy(() => import('./DeliveryRunner').then((m) => ({ default: m.DeliveryRunner })))
const Panel = lazy(() => import('../../../ui/pioneer/PioneerPanel').then((m) => ({ default: m.PioneerPanel })))

/** Canvas の中（SF の世界の中）に置く */
export function PioneerWorld() {
  const active = usePioneer((p) => p.active)
  // 配達の仕事は、開拓をやめていても約束と時間を見ておく
  const job = useDelivery((d) => d.active !== null)
  if (!active && !job) return null
  return (
    <Suspense fallback={null}>
      {active && <Scene />}
      {job && <Runner />}
    </Suspense>
  )
}

/** 画面（Canvas の外）に置く */
export function PioneerUi() {
  const active = usePioneer((p) => p.active)
  if (!active) return null
  return (
    <Suspense fallback={null}>
      <Panel />
    </Suspense>
  )
}
