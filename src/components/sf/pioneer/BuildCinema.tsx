import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { constructionSite } from '../ConstructionSite'
import { flightControl, ship } from '../../../state/flight'
import { useStore } from '../../../state/store'
import { endCinema, usePioneer } from '../../../state/pioneer'
import { COLONY_ID } from '../../../data/sf'
import { CINEMA_SECONDS, STAGE_COUNT } from '../../../data/pioneer'
import { playBuild, playFanfare } from '../../../audio/pioneerSfx'
import { cinemaClock } from '../../../state/pioneerFx'

// 建設の場面（約 10 秒・とばせる）：建てたら建設中のコロニーへ移り、カメラがゆっくり回りこむ。
// そのあいだに形が伸びる（ConstructionSite の GROW_SECONDS）。最後の段階では花火。
// 画面の字幕・とばすボタンは ui/pioneer/BuildCinemaUi.tsx

const p = new THREE.Vector3()
const q = new THREE.Quaternion()
const s = new THREE.Vector3()
const axis = new THREE.Vector3()
const side = new THREE.Vector3()
const fwd = new THREE.Vector3()
const dir = new THREE.Vector3()
const burstAt = new THREE.Vector3()

/** 親までたどって、見えているか（建設中のコロニーは、自機が近いときだけ描かれる） */
const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function shown(o: THREE.Object3D) {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) if (!x.visible) return false
  return true
}

export function BuildCinema() {
  const stage = usePioneer((st) => st.stage)
  const state = useRef({ t: 0, started: false, near: 0, up: new THREE.Vector3(), camera: null as THREE.PerspectiveCamera | null })

  useEffect(() => {
    const st = useStore.getState()
    if (st.mode !== 'flight') st.setMode('flight')
    st.setAutopilot(false)
    st.setTarget(COLONY_ID)
    flightControl.jumpTo = COLONY_ID
    document.documentElement.classList.add('pio-cinema')
    if (stage >= STAGE_COUNT) playFanfare()
    else playBuild()
    // マウスを画面につかまえていたら放す（Esc が最初の 1 回で届かない・とばすボタンを押せない、をなくす）
    if (document.pointerLockElement) document.exitPointerLock()
    // 場面のあいだは、ほかのキー（マップ・ワープ・船外活動など）を効かせない。Esc でとばす
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation()
      if (e.key !== 'Escape') return
      e.preventDefault()
      endCinema(true)
    }
    window.addEventListener('keydown', onKey, true)
    const saved = state.current
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.documentElement.classList.remove('pio-cinema')
      const cam = saved.camera
      if (cam) {
        cam.near = saved.near
        cam.up.set(0, 1, 0)
        cam.updateProjectionMatrix()
      }
    }
    // 場面の始まりに 1 回だけ
  }, [])

  useFrame(({ camera, size }, raw) => {
    const site = constructionSite.object
    if (!site) return
    const cam = camera as THREE.PerspectiveCamera
    const st = state.current
    if (!st.camera) {
      st.camera = cam
      st.near = cam.near
      st.up.copy(cam.up)
    }
    site.updateWorldMatrix(true, false)
    site.matrixWorld.decompose(p, q, s)
    const len = s.x
    axis.set(0, 1, 0).applyQuaternion(q)
    side.set(1, 0, 0).applyQuaternion(q)
    fwd.set(0, 0, 1).applyQuaternion(q)
    // 自機はカメラの後ろに止めておく（建設中のコロニーは自機が近いときだけ描かれる）
    ship.position.copy(p).addScaledVector(side, len * 2.2).addScaledVector(axis, len * 0.3)
    ship.velocity.set(0, 0, 0)
    // マップ・着陸など、ほかの場面に移ったら終える
    const g = useStore.getState()
    if (st.started && (g.mode !== 'flight' || g.warpPhase !== 'idle')) {
      endCinema(true)
      return
    }
    if (!shown(site)) return
    st.started = true
    st.t += Math.min(raw, 0.1)
    cinemaClock.t = st.t
    const k = Math.min(1, st.t / CINEMA_SECONDS)
    // 動きを減らす設定では、カメラは止めたまま
    const ease = reduced ? 0.5 : k * k * (3 - 2 * k)
    // 外側から、斜め上をゆっくり回りこみながら寄る
    const a = -0.65 + 1.2 * ease
    dir.copy(side).multiplyScalar(Math.cos(a)).addScaledVector(fwd, Math.sin(a))
    // 縦長の画面（スマホ）では横が狭いので、少し離れて全体を入れる
    const narrow = Math.max(1, (1.2 / (size.width / size.height)) ** 0.8)
    cam.position.copy(p).addScaledVector(dir, len * (1.3 - 0.35 * ease) * narrow).addScaledVector(axis, len * (0.42 - 0.17 * ease))
    cam.up.copy(axis)
    cam.lookAt(p)
    cam.near = len * 0.01
    cam.updateProjectionMatrix()
    if (st.t >= CINEMA_SECONDS) endCinema()
  })

  return stage >= STAGE_COUNT && !reduced ? <Fireworks /> : null
}

/** 完成の花火：建設中のコロニーのまわりで、色とりどりの光が開く */
const SPARKS = 360
const BURST = 60
const SPARK_LIFE = 1.8
const PALETTE = [new THREE.Color(2.4, 1.9, 0.7), new THREE.Color(0.6, 1.8, 2.6), new THREE.Color(2.4, 1.0, 0.4), new THREE.Color(1.8, 1.0, 2.4)]

function Fireworks() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3))
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(SPARKS), 1))
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        vertexShader: `attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC;
          void main() { vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 2.0 + 5.0 * alpha; }`,
        fragmentShader: `varying float vA; varying vec3 vC;
          void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC * vA * (1.0 - d * 2.0), 1.0); }`,
      }),
    [],
  )
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  const sparks = useRef(Array.from({ length: SPARKS }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: SPARK_LIFE })))
  const clock = useRef({ next: 0.6, slot: 0 })
  const pts = useRef<THREE.Points>(null!)
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1)
    const site = constructionSite.object
    const list = sparks.current
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const col = geo.getAttribute('color') as THREE.BufferAttribute
    const alpha = geo.getAttribute('alpha') as THREE.BufferAttribute
    const c = clock.current
    c.next -= dt
    if (site && c.next <= 0) {
      c.next = 0.7 + Math.random() * 0.6
      site.matrixWorld.decompose(p, q, s)
      const len = s.x
      // コロニーのまわりのどこか
      dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      const at = burstAt.copy(p).addScaledVector(dir, len * (0.3 + Math.random() * 0.25))
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)]
      for (let i = 0; i < BURST; i++) {
        const k = (c.slot + i) % SPARKS
        const sp = list[k]
        sp.pos.copy(at)
        sp.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(len * (0.12 + Math.random() * 0.06))
        sp.age = 0
        col.setXYZ(k, color.r, color.g, color.b)
      }
      c.slot = (c.slot + BURST) % SPARKS
      col.needsUpdate = true
    }
    let any = false
    for (let i = 0; i < SPARKS; i++) {
      const sp = list[i]
      if (sp.age >= SPARK_LIFE) {
        alpha.setX(i, 0)
        continue
      }
      any = true
      sp.age += dt
      sp.pos.addScaledVector(sp.vel, dt)
      sp.vel.multiplyScalar(1 - dt * 1.2)
      pos.setXYZ(i, sp.pos.x, sp.pos.y, sp.pos.z)
      alpha.setX(i, 1 - sp.age / SPARK_LIFE)
    }
    pos.needsUpdate = true
    alpha.needsUpdate = true
    pts.current.visible = any
  })
  return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} />
}
