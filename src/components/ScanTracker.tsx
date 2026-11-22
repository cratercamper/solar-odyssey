import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { asteroids } from '../state/registry'
import { ship } from '../state/flight'
import { useStore } from '../state/store'
import { useLayout } from '../state/useLayout'
import { BELT_AU } from '../data/layout'
import { SCAN_RANGE, SCAN_SECONDS, discoveryDebug, finishScan, useDiscovery, type ScanCandidate } from '../state/discovery'
import type { RockKind } from '../data/discovery'

const m = new THREE.Matrix4()
const p = new THREE.Vector3()
const s = new THREE.Vector3()
const q = new THREE.Quaternion()
const best = new THREE.Vector3()
const fwd = new THREE.Vector3()
const to = new THREE.Vector3()
const MARGIN = 40
/** 近くの岩を探し直す間隔（秒）。3000 個を毎フレーム調べないように */
const SEARCH_EVERY = 0.2

/** スキャナーを入れているあいだ：いちばん近い岩を探して印（DOM の #scan-marker）を重ね、スキャンを進める */
export function ScanTracker() {
  const { belt } = useLayout()
  const since = useRef(SEARCH_EVERY)
  const found = useRef<ScanCandidate | null>(null)

  useFrame(({ camera, size }, dt) => {
    const st = useDiscovery.getState()
    const el = document.getElementById('scan-marker')
    if (!st.on || useStore.getState().mode !== 'flight') {
      if (el) el.style.display = 'none'
      found.current = null
      return
    }
    let cand = found.current
    since.current += dt
    if (since.current >= SEARCH_EVERY && st.progress === null) {
      since.current = 0
      // 帯からの距離（遠いときは探さずに「帯へ行こう」と出す）
      const r = Math.hypot(ship.position.x, ship.position.z)
      const away = Math.max(0, belt(BELT_AU.inner) - r, r - belt(BELT_AU.outer), Math.abs(ship.position.y) - 2)
      cand = null as ScanCandidate | null
      if (away < SCAN_RANGE) {
        // 船の前にある岩を選びやすくする（岩の表面までの距離で、真後ろの岩は 2.2 倍遠いものとして比べる）
        fwd.set(0, 0, -1).applyQuaternion(ship.quaternion)
        let bestScore = Infinity
        for (let shape = 0; shape < asteroids.meshes.length; shape++) {
          const mesh = asteroids.meshes[shape]
          const types = asteroids.types.get(mesh)
          for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, m)
            m.premultiply(mesh.matrixWorld).decompose(p, q, s)
            if (s.x < 1e-4) continue // ビームで壊した岩
            const d = p.distanceTo(ship.position)
            if (d >= SCAN_RANGE) continue
            const score = Math.max(0, d - s.x) * (1 + 0.6 * (1 - to.copy(p).sub(ship.position).normalize().dot(fwd)))
            if (score < bestScore) {
              bestScore = score
              best.copy(p)
              cand = { key: `${shape}-${i}`, kind: (types?.[i] ?? 0) as RockKind, size: s.x, distance: d }
            }
          }
        }
      }
      found.current = cand
      const same = st.candidate?.key === cand?.key && Math.abs((st.candidate?.distance ?? 0) - (cand?.distance ?? 0)) < 0.3
      if (!same || Math.abs(st.beltAway - away) > 0.5) useDiscovery.setState({ candidate: cand, beltAway: away })
    }
    // スキャン中：岩が離れすぎたら取りやめ、時間がたてば発見
    if (st.progress !== null) {
      if (!cand || ship.position.distanceTo(best) > SCAN_RANGE * 1.2) useDiscovery.setState({ progress: null })
      else if (discoveryDebug.hold) {
        // 動作確認用：進みを止めておく
      } else if (st.progress + dt / SCAN_SECONDS >= 1) finishScan(cand)
      else useDiscovery.setState({ progress: st.progress + dt / SCAN_SECONDS })
    }
    if (!el) return
    if (!cand) {
      el.style.display = 'none'
      return
    }
    p.copy(best).project(camera)
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) {
      el.style.display = 'none'
      return
    }
    el.style.display = 'block'
    const sx = THREE.MathUtils.clamp(((p.x + 1) / 2) * size.width, MARGIN, size.width - MARGIN)
    const sy = THREE.MathUtils.clamp(((1 - p.y) / 2) * size.height, MARGIN, size.height - MARGIN)
    el.style.transform = `translate(${sx}px, ${sy}px)`
  })
  return null
}
