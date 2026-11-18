import { useHistoric } from './state/historic'
import * as THREE from 'three'
import { _roots } from '@react-three/fiber'
import { useStore } from './state/store'
import { POND } from './components/walk/park'
import { flightControl, ship, thrustFx, warpFx } from './state/flight'
import { bodies, markerOverride, beamTargets, ports, sim } from './state/registry'
import { useRace } from './state/race'
import { useMission } from './state/mission'
import { MISSIONS } from './data/missions'
import { useBridge } from './state/bridge'
import { shipZoom } from './state/zoom'
import { dockAtPort, observeRun, startObserve, stopObserve, useObserve } from './state/observe'
import { useQuality } from './state/quality'
import { setGoal, toggleAuto, toggleCompare, useGallery, openGallery, closeGallery, selectPart } from './state/gallery'
import { probeClock, useProbes } from './state/probes'
import { goToSite, skipDescent, startLanding, startTakeoff, useLanding } from './state/landing'
import { quitRally, startRally, useRally } from './state/rally'
import { useSurfaceLab } from './state/surfaceLab'
import { launchRover, recallRover, roverCtl, roverDebug, roverFocus, roverInput, roverPose, useRover } from './state/rover'
import { shipCol } from './components/eva/shipCollider'
import { evaDebug, evaInput, recallEva, startEva, useEva } from './state/eva'
import { evaJobsDebug, jobsRt, useEvaJobs } from './state/evaJobs'
import { evaSite } from './components/eva/hull'
import { colonyWalk, endWalk, startWalk, useWalk, walkInput } from './state/walk'
import { mobDebug, walker } from './components/walk/WalkActors'
import { walkDebug } from './components/walk/WalkWorld'
import { useSkyClock } from './components/surface/skyClock'
import { wideNow } from './components/surface/wideGround'
import { weatherNow } from './components/surface/weather'
import { eclipseClock, eclipseNow, eclipseUniforms, openEclipses, playEclipse, seekEclipse, useEclipse } from './state/eclipse'

// 録画・動作確認用（#debug のときだけ読み込む）：アプリの中身をブラウザのコンソールや録画スクリプトから動かせるようにする。
// __sv.camera に関数を入れると、毎フレームの最後にカメラを上書きできる（紹介動画のカメラワーク用）

type CameraFn = (camera: THREE.PerspectiveCamera, dt: number) => void
const sv = {
  THREE,
  store: useStore,
  race: useRace,
  mission: useMission,
  missions: MISSIONS,
  bridge: useBridge,
  gallery: { state: useGallery, setGoal, toggleAuto, toggleCompare, openGallery, closeGallery, selectPart },
  probes: { state: useProbes, clock: probeClock },
  eclipse: { state: useEclipse, clock: eclipseClock, now: eclipseNow, uniforms: eclipseUniforms, open: openEclipses, play: playEclipse, seek: seekEclipse },
  landing: { state: useLanding, start: startLanding, skip: skipDescent, takeoff: startTakeoff, site: goToSite },
  rally: { state: useRally, start: startRally, quit: quitRally },
  surfaceLab: useSurfaceLab,
  wide: wideNow,
  rover: { state: useRover, launch: launchRover, recall: recallRover, input: roverInput, debug: roverDebug, focus: roverFocus, ctl: roverCtl, pose: roverPose },
  // コロニーの中を歩く。start('colony') でコロニーの中にいることにして始める（テスト用）
  walk: {
    state: useWalk,
    input: walkInput,
    walker,
    mobs: mobDebug,
    debug: walkDebug,
    pond: POND,
    start: (id = 'colony', name = 'Colony') => {
      colonyWalk.inside = { id, name: () => name }
      startWalk()
    },
    end: endWalk,
    inside: () => colonyWalk.inside?.id ?? null,
  },
  eva: { site: evaSite, state: useEva, start: startEva, recall: recallEva, input: evaInput, debug: evaDebug, jobs: evaJobsDebug, jobsRt, jobsState: useEvaJobs, col: shipCol },
  historic: useHistoric,
  skyClock: useSkyClock,
  weather: weatherNow,
  ship,
  shipZoom,
  observe: { state: useObserve, start: startObserve, stop: stopObserve, dock: dockAtPort, run: observeRun },
  quality: useQuality,
  flightControl,
  warpFx,
  thrustFx,
  bodies,
  ports,
  markerOverride,
  beamTargets,
  sim,
  camera: null as CameraFn | null,
  setCamera: null as unknown as (fn: CameraFn | null) => void,
  /** i 番目の canvas（0：宇宙、着陸中は 1 が地表）の R3F の状態 */
  root: (i = 0) => {
    const canvas = document.querySelectorAll('canvas')[i]
    return canvas ? _roots.get(canvas)?.store.getState() : undefined
  },
}
;(window as unknown as { __sv: typeof sv }).__sv = sv

// カメラの上書き：入れるたびに登録し直して、ほかの useFrame（追いかけカメラ・マップの操作など）より後に動かす
let unsubscribe: (() => void) | null = null
export function setCamera(fn: CameraFn | null) {
  sv.camera = fn
  unsubscribe?.()
  unsubscribe = null
  const canvas = document.querySelector('canvas')
  const root = canvas && _roots.get(canvas)
  if (!fn || !root) return
  const state = root.store.getState()
  const ref = { current: (_: unknown, dt: number) => sv.camera?.(state.camera as THREE.PerspectiveCamera, dt) }
  unsubscribe = state.internal.subscribe(ref as never, 0, root.store)
}
Object.assign(sv, { setCamera })
