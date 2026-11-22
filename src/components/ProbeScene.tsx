import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { dateMs, RYUGU, RYUGU_ID } from '../data/probes'
import { endMs, pathAt, probeById, probeClock, probePath, ryuguAu, useProbes } from '../state/probes'
import { useLayout } from '../state/useLayout'
import type { Layout } from '../data/layout'
import { LABEL_Z } from './labels'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'

// 探査機の旅：道すじの線（通ったところは明るく）、今いるところの光る点と名前、はやぶさ2のときはリュウグウ

const DAY_MS = 86_400_000
const OVERVIEW = new THREE.Vector3(0, 120, 220)
/** OVERVIEW の位置から全体が見える半径（Ship の全体マップと同じ） */
const OVERVIEW_FITS = 200

/** 天文単位の空間の点を、今の並べ方の位置に直す（向きはそのまま、太陽からの距離だけ並べ方に合わせる） */
function toWorld(p: THREE.Vector3, layout: Layout, out: THREE.Vector3) {
  const r = p.length()
  return r === 0 ? out.set(0, 0, 0) : out.copy(p).multiplyScalar(layout.au(r) / r)
}

function lineOf(points: THREE.Vector3[], color: string, opacity: number) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  return new THREE.Line(geometry, material)
}

function Ryugu({ layout }: { layout: Layout }) {
  useLang()
  const marker = useRef<THREE.Group>(null!)
  const orbit = useMemo(() => {
    const start = dateMs(RYUGU.epoch)
    const points = Array.from({ length: 129 }, (_, i) => toWorld(ryuguAu(start + (i / 128) * RYUGU.periodDays * DAY_MS), layout, new THREE.Vector3()))
    return lineOf(points, '#a89c8c', 0.35)
  }, [layout])
  const at = new THREE.Vector3()
  useFrame(() => toWorld(ryuguAu(probeClock.ms, at), layout, marker.current.position))
  return (
    <>
      <primitive object={orbit} />
      <group ref={marker}>
        <mesh>
          <sphereGeometry args={[0.35, 12, 12]} />
          <meshStandardMaterial color="#8d8378" roughness={1} />
        </mesh>
        <Html position={[0, 1.2, 0]} center className="label" zIndexRange={LABEL_Z}>
          <span>{ui().probeScene.ryugu}</span>
        </Html>
      </group>
    </>
  )
}

/** 太陽系が見えている範囲（説明のパネルと、模型の画面を除いたところ。画面の px） */
function visibleRegion(width: number, height: number) {
  const panel = document.querySelector('.probe-panel')?.getBoundingClientRect()
  const cam = document.querySelector('.probe-cam')?.getBoundingClientRect()
  const camRight = cam && cam.left > width / 3
  const camTop = cam && !camRight && cam.bottom < height * 0.6
  // 模型の画面があるときは、説明のパネルは下にあるので、その上まで
  const panelBelow = panel && (camRight || camTop || panel.top > height / 3)
  return {
    left: panel && !panelBelow && panel.right < width / 2 ? panel.right : 0,
    right: camRight ? cam.left : width,
    top: camTop ? cam.bottom : 0,
    bottom: panel && panelBelow ? panel.top : height,
  }
}

export function ProbeScene() {
  const { open, probeId, samples } = useProbes()
  const probe = open ? probeById(probeId) : null
  const layout = useLayout()
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const head = useRef<THREE.Group>(null!)
  useLang()

  const lines = useMemo(() => {
    if (!probe) return null
    const path = probePath(probe)
    const world = path.map((pt) => toWorld(pt.p, layout, new THREE.Vector3()))
    const full = lineOf(world, probe.color, 0.22)
    const done = lineOf(world, probe.color, 0.95)
    done.geometry.setDrawRange(0, 0)
    const reach = Math.max(...world.map((w) => w.length()))
    return { path, full, done, reach }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe, layout, samples])

  // 選んだら、道すじ全体が入るところまでカメラを引く（内側だけの旅は寄る）。
  // 右（スマホの縦では上）に模型の画面があるときは、残りの見える範囲に収まるように、もっと引く。
  // 模型の画面は描かれたあとでないと大きさが分からないので、次のフレームで合わせる
  const fit = useRef(false)
  useEffect(() => {
    if (!lines) return
    fit.current = true
  }, [lines, camera])

  useEffect(
    () => () => {
      lines?.full.geometry.dispose()
      lines?.done.geometry.dispose()
    },
    [lines],
  )

  // 説明のパネルにかからないよう、太陽系をパネルの横（せまい画面では上）へずらして見せる
  useEffect(() => {
    if (!open) return
    return () => {
      camera.clearViewOffset()
      camera.updateProjectionMatrix()
    }
  }, [open, camera])
  useFrame(() => {
    if (!open) return
    const region = visibleRegion(size.width, size.height)
    const shiftX = size.width / 2 - (region.left + region.right) / 2
    const shiftY = size.height / 2 - (region.top + region.bottom) / 2
    camera.setViewOffset(size.width, size.height, shiftX, shiftY, size.width, size.height)
    if (fit.current && lines) {
      fit.current = false
      const room = Math.max(1, size.height / Math.max(120, Math.min(region.right - region.left, region.bottom - region.top)))
      camera.position.copy(OVERVIEW).multiplyScalar(Math.max(0.35, (lines.reach * 1.25 * room) / OVERVIEW_FITS))
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 0, 0)
    }
  })

  const p = new THREE.Vector3()
  useFrame(() => {
    if (!lines || !probe) return
    const ms = Math.min(probeClock.ms, endMs(probe))
    const { index, point } = pathAt(lines.path, ms, p)
    toWorld(point, layout, head.current.position)
    // 遠くから見ても見失わないよう、離れるほど点を大きく
    head.current.scale.setScalar(Math.max(1, camera.position.distanceTo(head.current.position) / 120))
    // 通ったところまでを明るく（今の位置へは、最後の点から直線でつながって見える）
    lines.done.geometry.setDrawRange(0, index)
  })

  if (!probe || !lines) return null
  return (
    <>
      <primitive object={lines.full} />
      <primitive object={lines.done} />
      <group ref={head}>
        <mesh>
          <sphereGeometry args={[0.5, 12, 12]} />
          <meshBasicMaterial color={new THREE.Color(probe.color).multiplyScalar(2.5)} toneMapped={false} />
        </mesh>
        <Html position={[0, 1.6, 0]} center className="label probe-label" zIndexRange={LABEL_Z}>
          <span style={{ color: probe.color }}>{ui().probes[probe.id].name}</span>
        </Html>
      </group>
      {probe.stops.some((s) => s.body === RYUGU_ID) && <Ryugu layout={layout} />}
    </>
  )
}
