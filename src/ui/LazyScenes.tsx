import { lazy, Suspense, useEffect } from 'react'
import { useLanding } from '../state/landing'
import { labEnabled } from '../state/surfaceLab'
import { useEva } from '../state/eva'
import { useWalk } from '../state/walk'
import { useMoonMission } from '../state/moonMission'
import { SceneBoundary } from './SceneBoundary'
import { recallRover } from '../state/rover'

// 地表・船外活動・コロニーの中を歩く場面は、それぞれ別のファイルに分けて、使うときに読み込む。
// 起動のときに読むプログラムが減り、スマホのメモリにも優しい。
// 場面に入る前（暗転しているあいだ）に読み終わるように、起動して落ち着いたら裏でゆっくり先読みもしておく。

const loadSurface = () => import('../components/surface/SurfaceView')
const loadEva = () => import('../components/eva/EvaView')
const loadWalk = () => import('../components/walk/WalkView')
const loadMoonMission = () => import('../components/moonMission/MoonMissionView')

const SurfaceView = lazy(() => loadSurface().then((m) => ({ default: m.SurfaceView })))
const EvaView = lazy(() => loadEva().then((m) => ({ default: m.EvaView })))
const WalkView = lazy(() => loadWalk().then((m) => ({ default: m.WalkView })))
const MoonMissionView = lazy(() => loadMoonMission().then((m) => ({ default: m.MoonMissionView })))

/** 起動してからこの秒数たったら、場面のプログラムを先読みする（起動の読み込みと重ならないように） */
const PREFETCH_AFTER = 12

function usePrefetch() {
  useEffect(() => {
    // Safari には requestIdleCallback がない
    const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 200))
    const timer = setTimeout(() => {
      // 1 つずつ、間をあけて読む
      idle(() => void loadSurface().then(() => idle(() => void loadEva().then(() => idle(() => void loadWalk())))))
    }, PREFETCH_AFTER * 1000)
    return () => clearTimeout(timer)
  }, [])
}

/** 地表の場面を閉じて母船へ（失敗したとき。離陸の演出は飛ばす） */
function backFromSurface() {
  try {
    recallRover()
  } catch {
    // ローバーが壊れていても母船へはもどる
  }
  useLanding.setState({ phase: 'idle', bodyId: null, site: null })
}

export function LazyScenes() {
  usePrefetch()
  const landing = useLanding((l) => l.phase !== 'idle') || labEnabled()
  const eva = useEva((e) => e.phase !== 'none')
  const walk = useWalk((w) => w.phase !== 'none')
  const moon = useMoonMission((m) => m.phase !== 'none')
  return (
    <>
      {/* 場面が失敗したら「問題が起きました。もどる」：その場面を閉じて、宇宙の自由探索へ */}
      <SceneBoundary name="surface" onBack={backFromSurface}>
        <Suspense fallback={null}>{landing && <SurfaceView />}</Suspense>
      </SceneBoundary>
      <SceneBoundary name="eva" onBack={() => useEva.setState({ phase: 'none' })}>
        <Suspense fallback={null}>{eva && <EvaView />}</Suspense>
      </SceneBoundary>
      <SceneBoundary name="walk" onBack={() => useWalk.setState({ phase: 'none' })}>
        <Suspense fallback={null}>{walk && <WalkView />}</Suspense>
      </SceneBoundary>
      <SceneBoundary name="moonMission" onBack={() => useMoonMission.setState({ phase: 'none' })}>
        <Suspense fallback={null}>{moon && <MoonMissionView />}</Suspense>
      </SceneBoundary>
    </>
  )
}
