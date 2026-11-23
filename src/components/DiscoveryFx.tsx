import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { asteroids } from '../state/registry'
import { ship } from '../state/flight'
import { useStore } from '../state/store'
import { momentAge, setPhoto, useDiscovery } from '../state/discovery'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'
import { radialGlowTexture } from './radialGlow'

// 発見の瞬間（A2）：スキャン中は船から岩へ光の線と、岩をなでる輪。見つけた瞬間に岩が光って、写真を撮る。
// 見つけた岩には、名前（なければ仮符号）の札が残る。札・ボタンの文言は i18n/discovery

const m = new THREE.Matrix4()
const p = new THREE.Vector3()
const s = new THREE.Vector3()
const q = new THREE.Quaternion()
const at = new THREE.Vector3()
const dir = new THREE.Vector3()
const up = new THREE.Vector3(0, 1, 0)

/** 岩の見分け（"帯の形-番号"）から、いまの位置。戻り値は大きさ（壊れていたり無ければ 0） */
export function rockAt(key: string, out: THREE.Vector3) {
  const [a, b] = key.split('-').map(Number)
  const mesh = asteroids.meshes[a]
  if (!mesh || !(b < mesh.count)) return 0
  mesh.getMatrixAt(b, m)
  m.premultiply(mesh.matrixWorld).decompose(out, q, s)
  return s.x < 1e-4 ? 0 : s.x
}

/** 札を出す数と距離（場面の単位） */
const LABELS = 6
const LABEL_RANGE = 30
/** 写真の大きさ（px、正方形） */
const PHOTO_PX = 220

const photoCam = new THREE.PerspectiveCamera(30, 1, 0.0005, 200_000)

/** 岩を、太陽の当たる斜めから撮る（いつもの画面と同じ描き方で、正方形に切り抜く） */
function takePhoto(gl: THREE.WebGLRenderer, scene: THREE.Scene, rock: THREE.Vector3, size: number, from: THREE.Vector3) {
  // 太陽（原点）の方と、見ていた方のあいだから
  dir.copy(rock).negate().normalize().multiplyScalar(0.65).add(p.copy(from).sub(rock).normalize().multiplyScalar(0.35)).normalize()
  photoCam.position.copy(rock).addScaledVector(dir, Math.max(size * 5.5, 0.03))
  photoCam.up.copy(up)
  photoCam.lookAt(rock)
  const c = gl.domElement
  photoCam.aspect = c.width / c.height
  photoCam.updateProjectionMatrix()
  gl.render(scene, photoCam)
  const out = document.createElement('canvas')
  out.width = out.height = PHOTO_PX
  const side = Math.min(c.width, c.height)
  out.getContext('2d')?.drawImage(c, (c.width - side) / 2, (c.height - side) / 2, side, side, 0, 0, PHOTO_PX, PHOTO_PX)
  return out.toDataURL('image/jpeg', 0.82)
}

/** 光の輪・線・ひかりの粒の見た目 */
function useFxObjects() {
  return useMemo(() => {
    const glow = (color: string, opacity: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    const scan = new THREE.Group()
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(1, 0.01, 6, 72), glow('#3fbfa6', 0.75))
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.006, 6, 72), glow('#5fd8c0', 0.5))
    const sweep = new THREE.Mesh(new THREE.RingGeometry(0.2, 1.05, 48), glow('#3fbfa6', 0.12))
    sweep.rotation.x = Math.PI / 2
    const sweepHolder = new THREE.Group()
    sweepHolder.add(sweep)
    const rings = new THREE.Group()
    rings.add(ringA, ringB, sweepHolder)
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), glow('#6fe0c8', 0.35))
    scan.add(rings, beam)
    scan.visible = false
    // 見つけた瞬間：光の玉と、外へ飛ぶ粒
    const burst = new THREE.Group()
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#bff8ec', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }))
    halo.renderOrder = 5
    const n = 48
    const pos = new Float32Array(n * 3)
    const vel: THREE.Vector3[] = []
    for (let i = 0; i < n; i++) vel.push(new THREE.Vector3().randomDirection().multiplyScalar(0.6 + Math.random() * 0.8))
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const sparks = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffe9a8', size: 3, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }))
    sparks.frustumCulled = false
    sparks.renderOrder = 5
    burst.add(halo, sparks)
    burst.visible = false
    return { scan, rings, ringA, ringB, sweepHolder, beam, burst, halo, sparks, vel }
  }, [])
}

let haloTex: THREE.Texture | null = null
function haloTexture() {
  if (haloTex) return haloTex
  haloTex = radialGlowTexture(
    [
      [0, 255, 255, 255, 1],
      [0.25, 200, 255, 240, 0.7],
      [1, 120, 230, 210, 0],
    ],
    128,
  )
  return haloTex
}

export function DiscoveryFx() {
  const { gl, scene, camera } = useThree()
  const fx = useFxObjects()
  const shot = useRef<string | null>(null)
  const labelRefs = useRef<(THREE.Group | null)[]>([])
  const textRefs = useRef<(HTMLSpanElement | null)[]>([])
  const since = useRef(1)
  const picked = useRef<string[]>([])
  useLang()

  useEffect(() => () => void (fx.scan.removeFromParent(), fx.burst.removeFromParent()), [fx])

  useFrame(({ clock }, dt) => {
    const st = useDiscovery.getState()
    const flight = useStore.getState().mode === 'flight'
    const time = clock.elapsedTime

    // スキャン中：船から岩へ光の線、岩のまわりを回る輪と、上下になでる面
    const scanKey = flight && st.progress !== null ? st.candidate?.key : undefined
    const size = scanKey ? rockAt(scanKey, at) : 0
    fx.scan.visible = size > 0
    if (size > 0) {
      const r = Math.max(size * 1.35, 0.012)
      fx.rings.position.copy(at)
      fx.rings.scale.setScalar(r)
      fx.ringA.rotation.set(time * 1.3, time * 0.7, 0)
      fx.ringB.rotation.set(-time * 0.9, 0, time * 1.1)
      fx.sweepHolder.position.y = Math.sin(time * 5) * 0.8
      const k = 0.5 + 0.5 * (st.progress ?? 0)
      ;(fx.ringA.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.4 * k
      // 線：船の少し前から岩まで
      p.copy(ship.position)
      const len = p.distanceTo(at)
      fx.beam.position.copy(p).add(at).multiplyScalar(0.5)
      fx.beam.scale.set(0.004, len, 0.004)
      fx.beam.quaternion.setFromUnitVectors(up, dir.copy(at).sub(p).normalize())
      ;(fx.beam.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.25 * Math.abs(Math.sin(time * 9))
    }

    // 見つけた瞬間
    const age = momentAge()
    const fresh = st.fresh
    const burstSize = fresh && !st.freshKnown && age !== null && age < 3 ? rockAt(fresh.key, at) : 0
    if (burstSize > 0 && fresh && shot.current !== fresh.key && !fresh.photo) {
      // 写真：光の演出を入れずに、まず一枚
      shot.current = fresh.key
      fx.scan.visible = false
      fx.burst.visible = false
      try {
        setPhoto(fresh.key, takePhoto(gl, scene as THREE.Scene, at, burstSize, camera.position))
      } catch {
        // 写真が撮れなくても発見はそのまま
      }
    }
    fx.burst.visible = burstSize > 0
    if (burstSize > 0 && age !== null) {
      fx.burst.position.copy(at)
      const grow = Math.min(1, age / 0.25)
      const fade = age < 0.4 ? 1 : Math.max(0, 1 - (age - 0.4) / 2)
      fx.halo.scale.setScalar(Math.max(burstSize, 0.01) * (2.5 + 5 * grow))
      fx.halo.material.opacity = fade
      const arr = fx.sparks.geometry.attributes.position as THREE.BufferAttribute
      const reach = Math.max(burstSize, 0.01) * 6 * (1 - Math.exp(-age * 2.5))
      fx.vel.forEach((v, i) => arr.setXYZ(i, v.x * reach, v.y * reach, v.z * reach))
      arr.needsUpdate = true
      ;(fx.sparks.material as THREE.PointsMaterial).opacity = fade
    }

    // 見つけた岩の札（近いものから LABELS 個）
    since.current += dt
    if (since.current > 0.25) {
      since.current = 0
      const near: { key: string; d: number }[] = []
      if (flight)
        for (const d of st.found) {
          if (!rockAt(d.key, p)) continue
          const dist = p.distanceTo(ship.position)
          if (dist < LABEL_RANGE) near.push({ key: d.key, d: dist })
        }
      near.sort((a, b) => a.d - b.d)
      picked.current = near.slice(0, LABELS).map((n) => n.key)
    }
    for (let i = 0; i < LABELS; i++) {
      const g = labelRefs.current[i]
      const el = textRefs.current[i]
      const key = picked.current[i]
      const d = key ? st.found.find((f) => f.key === key) : undefined
      const sz = d ? rockAt(d.key, p) : 0
      if (!g || !el) continue
      if (!d || !sz) {
        g.visible = false
        el.style.display = 'none'
        continue
      }
      g.visible = true
      el.style.display = ''
      g.position.copy(p).addScaledVector(up, sz * 1.6)
      const text = ui().discovery.label(d.name, d.code)
      if (el.textContent !== text) el.textContent = text
      el.dataset.kind = String(d.kind)
    }
  })

  return (
    <>
      <primitive object={fx.scan} />
      <primitive object={fx.burst} />
      {Array.from({ length: LABELS }, (_, i) => (
        <group key={i} ref={(g) => void (labelRefs.current[i] = g)} visible={false}>
          <Html center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
            <span className="rock-tag" ref={(el) => void (textRefs.current[i] = el)} style={{ display: 'none' }} />
          </Html>
        </group>
      ))}
    </>
  )
}
