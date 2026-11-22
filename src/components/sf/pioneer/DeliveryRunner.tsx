import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../../../state/store'
import { bodies } from '../../../state/registry'
import { flightControl, ship, standoff } from '../../../state/flight'
import { MAX_SPEED } from '../../../state/throttle'
import { usePioneer } from '../../../state/pioneer'
import { beamCharge } from '../../../state/beam'
import { activeJob, handoffDone, markUsed, nextStop, setHandoff, tickJob } from '../../../state/delivery'
import { HANDOFF_SECONDS, HANDOFF_SPEED, LAB_STOP } from '../../../data/delivery'

// 配達の仕事を見張る（仕事を引き受けているあいだ、SF の世界の中に置く。開拓をやめていても約束と時間は見る）：
// - 積んだあとにワープ・ビームを使ったか（約束）、積んでからの時間
// - 次の行き先のそばで止まったら、数秒で積む・降ろす（受け渡しの輪を行き先のまわりに出す）

/** 受け渡しができる距離（行き先の着く距離の何倍まで） */
export const HANDOFF_RANGE = 1.25
const COLOR = new THREE.Color('#ffd27a')

const at = new THREE.Vector3()
const rel = new THREE.Vector3()

export function DeliveryRunner() {
  const ring = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => new THREE.RingGeometry(0.96, 1, 96), [])
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    [],
  )
  const s = useRef({ hold: 0, shots: beamCharge.shots, jumps: flightControl.jumps, prevId: '', prev: new THREE.Vector3() })

  useFrame(({ camera, clock }, raw) => {
    const dt = Math.min(raw, 0.1)
    const st = useStore.getState()
    const job = activeJob()
    const r = ring.current
    if (!r) return
    r.visible = false
    // 撃った回数は、仕事が無いときも追いかけておく（引き受ける前に撃った分を数えない）
    const shot = beamCharge.shots !== s.current.shots
    s.current.shots = beamCharge.shots
    const jumped = flightControl.jumps !== s.current.jumps
    s.current.jumps = flightControl.jumps
    if (!job) {
      s.current.hold = 0
      setHandoff(0, false, false)
      return
    }
    if (st.warpPhase !== 'idle' || jumped) markUsed('warped')
    if (shot) markUsed('beamed')
    if ((st.mode === 'flight' || st.mode === 'map') && nextStop(job) !== LAB_STOP) tickJob(dt)

    const id = nextStop(job)
    // 研究温室へは歩いて届ける（歩く場面の WalkErrand が見る）。歩いているあいだは時間も止める
    if (id === LAB_STOP) {
      s.current.hold = 0
      setHandoff(0, false, false)
      return
    }
    const body = id ? bodies.get(id) : undefined
    if (!body) return
    body.object.getWorldPosition(at)
    // 行き先の動く速さ（公転している所でも、行き先に対して止まっていれば受け渡せる）
    const moved = s.current.prevId === id && dt > 0
    rel.copy(ship.velocity)
    if (moved) rel.sub(s.current.prev.sub(at).multiplyScalar(-1 / dt))
    s.current.prevId = id ?? ''
    s.current.prev.copy(at)
    const range = standoff(body.radius) * HANDOFF_RANGE
    const d = ship.position.distanceTo(at)
    // 輪：行き先の近くまで来たら、止まる範囲を見せる（いつもカメラの方を向く）
    const near = d < range * 3 && st.mode === 'flight'
    if (near) {
      r.visible = true
      r.position.copy(at)
      r.quaternion.copy(camera.quaternion)
      r.scale.setScalar(range)
      const inside = d < range
      material.opacity = inside ? 0.35 + 0.35 * Math.min(1, s.current.hold / HANDOFF_SECONDS) : 0.25 + 0.15 * Math.sin(clock.elapsedTime * 3)
    }
    // 受け渡しは開拓で遊んでいるときだけ（カードが出ていないと、何が起きたかわからないので）
    const ready = usePioneer.getState().active && st.mode === 'flight' && st.warpPhase === 'idle' && d < range
    if (!ready) {
      s.current.hold = 0
      setHandoff(0, false, near)
      return
    }
    const slow = rel.length() / MAX_SPEED < HANDOFF_SPEED
    s.current.hold = slow ? s.current.hold + dt : 0
    setHandoff(Math.min(1, s.current.hold / HANDOFF_SECONDS), !slow, near)
    if (s.current.hold >= HANDOFF_SECONDS) {
      s.current.hold = 0
      handoffDone()
    }
  })

  return <mesh ref={ring} geometry={geometry} material={material} frustumCulled={false} renderOrder={5} visible={false} />
}
