import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { asteroids, beamTargets, rockBreaks } from '../state/registry'
import { useStore } from '../state/store'
import { playBeam, playBlast } from '../audio/sfx'
import { touchInput } from '../state/input'
import { beamCharge, chargeReady, fireCharge, levelFor, muzzle, now } from '../state/beam'
import { shipScale } from '../state/zoom'
import { ui } from '../i18n'

const RANGE = 40
const BEAM_SECONDS = 0.35
const DEBRIS = 80
const DEBRIS_SECONDS = 1.6
/** 任務の目標には、照準から約10°以内なら当たる */
const AIM_ASSIST = Math.cos(THREE.MathUtils.degToRad(10))

const tmpM = new THREE.Matrix4()
const zero = new THREE.Matrix4().makeScale(0, 0, 0)
const from = new THREE.Vector3()
const to = new THREE.Vector3()
const mid = new THREE.Vector3()
const up = new THREE.Vector3(0, 1, 0)
const center = new THREE.Vector2(0, 0)

/** ビームで小惑星を撃つ（F キー、または操縦中のクリック）。短く押すと細いビーム、長押しで溜めてチャージビーム（ChargeBeam） */
export function Phaser() {
  const { camera, gl } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const beam = useRef<THREE.Mesh>(null!)
  const beamMat = useRef<THREE.MeshBasicMaterial>(null!)
  const held = useRef({ key: false, mouse: false, was: false, pressed: false })
  const beamState = useRef({ t: BEAM_SECONDS, target: new THREE.Vector3() })
  const destroyedCount = useRef(0)

  const debris = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DEBRIS * 3), 3))
    const velocity = new Float32Array(DEBRIS * 3)
    return { geometry, velocity, t: DEBRIS_SECONDS, origin: new THREE.Vector3() }
  }, [])
  const debrisMat = useRef<THREE.PointsMaterial>(null!)

  useEffect(() => {
    const h = held.current
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyF') return
      h.key = e.type === 'keydown'
      if (h.key && !e.repeat) h.pressed = true
    }
    const onDown = (e: MouseEvent) => {
      if (e.button === 0 && document.pointerLockElement === gl.domElement) h.mouse = h.pressed = true
    }
    const onUp = (e: MouseEvent) => {
      if (e.button === 0) h.mouse = false
    }
    const onBlur = () => {
      h.key = false
      h.mouse = false
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [gl])

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const st = useStore.getState()
    const canFire = st.mode === 'flight' && st.warpPhase === 'idle'
    const h = held.current
    const down = h.key || h.mouse || touchInput.beam
    // フレームのあいだに押して離した（とても短い押し）も、1回の押しとして数える
    const tapped = (h.pressed || touchInput.beamPressed) && !down && !h.was
    h.pressed = touchInput.beamPressed = false
    const c = beamCharge
    // 押した：溜められるなら溜め始める（クールダウン中やビームを撃っている最中は、短いビームだけ）
    if (down && !h.was && canFire && chargeReady() && !c.firing) {
      c.charging = true
      c.start = now()
      c.level = 0
    }
    if (c.charging) {
      if (canFire) c.level = levelFor(now() - c.start)
      else c.charging = false
    }
    // 離した：1段以上溜まっていればチャージビーム、そうでなければ従来の細いビーム
    if ((!down && h.was) || tapped) {
      if (c.charging && c.level > 0) {
        fireCharge(c.level)
        c.shots++
      } else if (canFire) {
        shoot(clock.getElapsedTime())
        c.shots++
      }
      c.charging = false
      c.level = 0
    }
    h.was = down

    // ビーム：発射口から命中点へ。短時間で細く消える
    const b = beamState.current
    b.t += delta
    const k = Math.max(0, 1 - b.t / BEAM_SECONDS)
    beam.current.visible = k > 0
    if (k > 0) {
      muzzle(from)
      const length = from.distanceTo(b.target)
      mid.copy(from).add(b.target).multiplyScalar(0.5)
      beam.current.position.copy(mid)
      beam.current.quaternion.setFromUnitVectors(up, to.copy(b.target).sub(from).normalize())
      const r = k * (shipScale() / 0.3)
      beam.current.scale.set(r, length, r)
      beamMat.current.opacity = k
    }

    // 破片：外へ飛び散りながら消える
    debris.t += delta
    const dk = Math.max(0, 1 - debris.t / DEBRIS_SECONDS)
    debrisMat.current.opacity = dk
    if (dk > 0) {
      const pos = debris.geometry.attributes.position.array as Float32Array
      for (let i = 0; i < DEBRIS * 3; i++) pos[i] += debris.velocity[i] * delta
      debris.geometry.attributes.position.needsUpdate = true
    }
  })

  function shoot(now: number) {
    raycaster.setFromCamera(center, camera)
    raycaster.far = RANGE
    const b = beamState.current
    b.t = 0
    playBeam()
    // 任務の小惑星など：壊さずに、当たったことだけ知らせる。照準が少しずれていても当たる（スマホでも当てやすく）
    for (const t of beamTargets) {
      t.object.getWorldPosition(to)
      const d = to.distanceTo(raycaster.ray.origin)
      if (d > RANGE || mid.copy(to).sub(raycaster.ray.origin).normalize().dot(raycaster.ray.direction) < AIM_ASSIST) continue
      b.target.copy(to)
      burst(to)
      playBlast()
      t.onHit()
      return
    }
    const hit = raycaster.intersectObjects(asteroids.meshes, false)[0]
    if (!hit || hit.instanceId === undefined) {
      b.target.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, RANGE)
      return
    }
    b.target.copy(hit.point)
    const mesh = hit.object as THREE.InstancedMesh
    mesh.getMatrixAt(hit.instanceId, tmpM)
    asteroids.destroyed.push({ mesh, index: hit.instanceId, matrix: tmpM.clone(), at: now })
    mesh.setMatrixAt(hit.instanceId, zero)
    mesh.instanceMatrix.needsUpdate = true
    burst(hit.point)
    playBlast()

    const type = asteroids.types.get(mesh)?.[hit.instanceId] ?? 0
    const rock = { shape: asteroids.meshes.indexOf(mesh), index: hit.instanceId }
    for (const f of rockBreaks) f(type, Math.hypot(tmpM.elements[0], tmpM.elements[1], tmpM.elements[2]), hit.point, rock)
    destroyedCount.current += 1
    useStore.getState().showToast(destroyedCount.current === 1 ? `${ui().phaserFacts[type]}\n${ui().phaserFacts.sparse}` : ui().phaserFacts[type])
  }

  function burst(at: THREE.Vector3) {
    const pos = debris.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < DEBRIS; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      const speed = 0.5 + Math.random() * 2.5
      pos.set([at.x, at.y, at.z], i * 3)
      debris.velocity.set([dir.x * speed, dir.y * speed, dir.z * speed], i * 3)
    }
    debris.geometry.attributes.position.needsUpdate = true
    debris.t = 0
  }

  return (
    <>
      <mesh ref={beam} visible={false} frustumCulled={false}>
        <cylinderGeometry args={[0.012, 0.012, 1, 8, 1, true]} />
        <meshBasicMaterial ref={beamMat} color={new THREE.Color(2.4, 0.8, 0.2)} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <points geometry={debris.geometry} frustumCulled={false}>
        <pointsMaterial ref={debrisMat} color={new THREE.Color(1.8, 1.1, 0.6)} size={0.06} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </points>
    </>
  )
}
