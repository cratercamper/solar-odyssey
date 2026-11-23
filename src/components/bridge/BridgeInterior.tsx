import { Suspense, useEffect, useMemo } from 'react'
import { createPortal, useFrame, useLoader } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { ROOM } from '../../data/bridge'
import { bridgeAnchors, bridgeEye, useBridge, viewscreenInfo } from '../../state/bridge'
import { useStore } from '../../state/store'
import { bodies } from '../../state/registry'
import { isTouchDevice } from '../../state/input'
import { Consoles, orientScreen, screenRoles } from './consoles'
import { chirp, setBridgeAmbience } from '../../audio/bridge'
import { usePostFxActive } from '../SpaceLighting'

/**
 * 艦橋の中の部屋。船は 1 単位が約 2 km の縮尺なので、16 m の部屋はそのままでは近すぎて描けない。
 * そこで宇宙をいつも通り描いたあと、奥行きだけ消して、m 単位の別のシーンとして部屋を重ねて描く。
 * 窓と天窓は部屋に穴が開いているだけなので、その向こうに先に描いた宇宙が見える。
 */
export function BridgeInterior() {
  const scene = useMemo(() => new THREE.Scene(), [])
  const camera = useMemo(() => new THREE.PerspectiveCamera(60, 1, 0.05, 60), [])
  const viewscreen = useBridge((b) => b.viewscreen)
  const zoom = useMemo(() => new ZoomView(), [])
  // 後処理を使わないとき（画質「軽量」や、後処理をすべて切ったとき）は、宇宙を描く人がいないので、ここで先に描く
  // （優先度つきの useFrame があると、R3F は自分では描かない。ないと窓の外が真っ黒になる）
  const postFx = usePostFxActive()
  useEffect(() => () => zoom.dispose(), [zoom])
  // 艦橋の音（入っているあいだだけ）。見どころを移ったり拡大画面を切り替えたりすると、短く鳴る
  useEffect(() => {
    setBridgeAmbience(true)
    const unsub = useBridge.subscribe((b, prev) => {
      if (b.viewpoint !== prev.viewpoint || b.viewscreen !== prev.viewscreen) chirp(2, 1.6)
    })
    return () => {
      unsub()
      setBridgeAmbience(false)
    }
  }, [])

  useFrame(({ gl, camera: main, scene: space }, dt) => {
    const cam = main as THREE.PerspectiveCamera
    // 拡大画面：窓の位置から目標（なければ正面）へ望遠のカメラを向けて、宇宙をもう一度描いておく
    if (useBridge.getState().viewscreen) zoom.render(gl, space, cam, dt)
    camera.fov = cam.fov
    camera.aspect = cam.aspect
    camera.updateProjectionMatrix()
    camera.position.copy(bridgeEye.pos)
    camera.quaternion.copy(bridgeEye.quaternion)
    camera.updateMatrixWorld()
    if (!postFx) {
      // 宇宙は窓と天窓から見える四角だけ描く（壁の裏は部屋で上書きされるので、描くだけむだ）。
      // 窓が画面の外なら宇宙は描かない
      const rect = openingRect(camera, gl)
      if (rect === 'all') gl.render(space, cam)
      else if (rect) {
        gl.setScissor(rect.x, rect.y, rect.w, rect.h)
        gl.setScissorTest(true)
        gl.render(space, cam)
        gl.setScissorTest(false)
      } else gl.clear()
    }
    const autoClear = gl.autoClear
    gl.autoClear = false
    gl.clearDepth()
    gl.render(scene, camera)
    gl.autoClear = autoClear
    placeLabels(camera, gl.domElement)
    // 後処理（ブルーム）のあとに描くので、優先度を上げる
  }, 2)

  return createPortal(
    <Suspense fallback={null}>
      <Room viewscreen={viewscreen ? zoom.target.texture : null} />
    </Suspense>,
    scene,
  )
}

/** 窓（正面の帯）と天窓のふちの点（部屋の座標、m） */
const OPENING_POINTS = (() => {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 8; i++) {
    const th = -Math.PI / 2 - ROOM.windowHalf + (2 * ROOM.windowHalf * i) / 8
    for (const y of [ROOM.windowBottom, ROOM.windowTop]) pts.push(new THREE.Vector3(ROOM.rx * Math.cos(th), y, ROOM.rz * Math.sin(th)))
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * ROOM.skylight, ROOM.height, Math.sin(a) * ROOM.skylight))
  }
  return pts
})()
const op = new THREE.Vector3()
const opSize = new THREE.Vector2()
const opRect = { x: 0, y: 0, w: 0, h: 0 }

/**
 * 窓と天窓が見える、画面の四角（描画の画素で、左下が原点）。
 * 窓のふちが目の後ろに回るとき（窓のそばに立って横を見るなど）は 'all'（全部描く）、窓が画面に入っていなければ null
 */
export function openingRect(camera: THREE.PerspectiveCamera, gl: THREE.WebGLRenderer): typeof opRect | 'all' | null {
  const size = gl.getDrawingBufferSize(opSize)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of OPENING_POINTS) {
    op.copy(p).applyMatrix4(camera.matrixWorldInverse)
    if (op.z > -0.05) return 'all'
    op.applyMatrix4(camera.projectionMatrix)
    x0 = Math.min(x0, op.x)
    x1 = Math.max(x1, op.x)
    y0 = Math.min(y0, op.y)
    y1 = Math.max(y1, op.y)
  }
  // 窓のふちのあいだの曲がり（弧）と、拡大のずれのぶん、少し広く
  const pad = 0.04
  x0 = Math.max(-1, x0 - pad)
  y0 = Math.max(-1, y0 - pad)
  x1 = Math.min(1, x1 + pad)
  y1 = Math.min(1, y1 + pad)
  if (x0 >= x1 || y0 >= y1) return null
  opRect.x = Math.floor(((x0 + 1) / 2) * size.x)
  opRect.y = Math.floor(((y0 + 1) / 2) * size.y)
  opRect.w = Math.ceil(((x1 - x0) / 2) * size.x)
  opRect.h = Math.ceil(((y1 - y0) / 2) * size.y)
  return opRect
}

const projected = new THREE.Vector3()
/** 見どころの名札を、部屋の中の位置に合わせて画面の上で動かす */
function placeLabels(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
  if (!bridgeAnchors.size) return
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  for (const a of bridgeAnchors.values()) {
    projected.fromArray(a.pos).project(camera)
    const behind = projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1
    a.el.style.visibility = behind ? 'hidden' : 'visible'
    if (!behind) a.el.style.transform = `translate(${((projected.x + 1) / 2) * w}px, ${((1 - projected.y) / 2) * h}px)`
  }
}

/** 拡大画面の幅と高さの比（正面の窓の弧の長さ ÷ 高さ） */
const SCREEN_ASPECT = (2 * ROOM.windowHalf * ((ROOM.rx + ROOM.rz) / 2) * 0.93) / (ROOM.windowTop - ROOM.windowBottom)
const WIDEST = 40 // 拡大画面のいちばん広い画角（度）
const NARROWEST = 0.05

/** 拡大画面のための望遠カメラと、描いた絵を受けとる板 */
class ZoomView {
  target: THREE.WebGLRenderTarget
  camera = new THREE.PerspectiveCamera(20, SCREEN_ASPECT, 0.0004, 200_000)
  private fov = WIDEST
  private p = new THREE.Vector3()
  private up = new THREE.Vector3()
  private fwd = new THREE.Vector3()
  private q = new THREE.Quaternion()
  private qHead = new THREE.Quaternion()

  constructor() {
    // スマホでは絵を小さめにして軽くする（窓の幅は画面の半分ほどなので、これで足りる）
    const w = isTouchDevice() ? 768 : 1280
    this.target = new THREE.WebGLRenderTarget(w, Math.round(w / SCREEN_ASPECT), { colorSpace: THREE.SRGBColorSpace, samples: isTouchDevice() ? 0 : 4 })
  }

  /** 1 コマおきに描く（センサーの映像なので 30 コマで十分）。とばしたコマの時間はためておく */
  private skip = false
  private acc = 0

  render(gl: THREE.WebGLRenderer, space: THREE.Scene, eye: THREE.PerspectiveCamera, frameDt: number) {
    this.acc += frameDt
    this.skip = !this.skip
    if (this.skip) return
    const dt = this.acc
    this.acc = 0
    const st = useStore.getState()
    const target = st.targetId ? bodies.get(st.targetId) : undefined
    const cam = this.camera
    cam.position.copy(eye.position)
    // 大画面は船に付いたセンサー：目のカメラの向きから首の向き（bridgeEye）を外して、船の向きだけで向ける
    this.q.copy(eye.quaternion).multiply(this.qHead.copy(bridgeEye.quaternion).invert())
    this.up.set(0, 1, 0).applyQuaternion(this.q)
    cam.up.copy(this.up)
    let want: number
    if (target) {
      target.object.getWorldPosition(this.p)
      cam.lookAt(this.p)
      // 天体が画面の高さの 6 割ほどに映る画角
      const d = Math.max(this.p.distanceTo(cam.position), target.radius * 1.01)
      want = THREE.MathUtils.radToDeg(2 * Math.atan(target.radius / d)) / 0.6
    } else {
      // 目標がなければ、船の正面を 4 倍に
      this.fwd.set(0, 0, -1).applyQuaternion(this.q)
      cam.lookAt(this.p.copy(cam.position).add(this.fwd))
      want = 62 / 4
    }
    want = THREE.MathUtils.clamp(want, NARROWEST, WIDEST)
    this.fov += (want - this.fov) * (1 - Math.exp(-4 * Math.min(dt, 0.1)))
    cam.fov = this.fov
    // 惑星のそばで船が縮むときは、手前の限界も目のカメラに合わせる
    cam.near = eye.near
    cam.updateProjectionMatrix()
    viewscreenInfo.zoom = eye.fov / this.fov
    // 大画面は船の外のセンサーの映像という見立てなので、自分の船体は映さない
    const own = space.getObjectByName('ownship')
    if (own) own.visible = false
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(this.target)
    gl.clear()
    gl.render(space, cam)
    gl.setRenderTarget(prev)
    if (own) own.visible = true
  }

  dispose() {
    this.target.dispose()
  }
}

const SEGMENTS = 96
const FRONT = -Math.PI / 2
/** 楕円の壁の上の点（θ=-π/2 が正面、π/2 が後ろ） */
const onWall = (theta: number, inset = 0, out = new THREE.Vector3()) =>
  out.set((ROOM.rx - inset) * Math.cos(theta), 0, (ROOM.rz - inset) * Math.sin(theta))

/** 壁ぞいの帯（θ の範囲 × 高さの範囲）。窓のガラスに使う */
function wallBand(from: number, to: number, y0: number, y1: number, inset = 0) {
  const pos: number[] = []
  const uv: number[] = []
  const steps = Math.max(2, Math.round((SEGMENTS * (to - from)) / (Math.PI * 2)))
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  for (let i = 0; i < steps; i++) {
    const t0 = from + ((to - from) * i) / steps
    const t1 = from + ((to - from) * (i + 1)) / steps
    onWall(t0, inset, a)
    onWall(t1, inset, b)
    pos.push(a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z, a.x, y0, a.z, b.x, y1, b.z, a.x, y1, a.z)
    const u0 = i / steps
    const u1 = (i + 1) / steps
    uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** 入口の銘板 */
function plaqueTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 512, 256)
  grad.addColorStop(0, '#b89a62')
  grad.addColorStop(0.5, '#e0c88e')
  grad.addColorStop(1, '#a78a55')
  g.fillStyle = grad
  g.fillRect(0, 0, 512, 256)
  g.strokeStyle = '#5a4527'
  g.lineWidth = 4
  g.strokeRect(10, 10, 492, 236)
  g.fillStyle = '#3d2e18'
  g.textAlign = 'center'
  g.font = 'bold 44px serif'
  g.fillText('SV-01', 256, 70)
  g.font = 'bold 34px serif'
  g.fillText('SOLAR VOYAGER', 256, 118)
  g.font = '22px serif'
  g.fillText('SURVEY VESSEL', 256, 158)
  g.font = 'italic 18px serif'
  g.fillText('“To see the worlds of the Sun for ourselves”', 256, 206)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const MODEL_URL = `${import.meta.env.BASE_URL}models/bridge.glb`
const LIGHT_URL = `${import.meta.env.BASE_URL}models/bridge-light.jpg`

/**
 * Blender で作った部屋（tools/blender/build_bridge.py）。照明は 1 枚の絵に焼き込んであるので、
 * 光の計算をせずに絵を貼るだけで描ける。画面と銘板には、ここで描いた絵を貼る
 */
function Room({ viewscreen }: { viewscreen: THREE.Texture | null }) {
  const gltf = useGLTF(MODEL_URL)
  const light = useLoader(THREE.TextureLoader, LIGHT_URL)

  const parts = useMemo(() => {
    light.flipY = false
    light.colorSpace = THREE.SRGBColorSpace
    light.anisotropy = 4
    const room = new THREE.MeshBasicMaterial({ map: light, toneMapped: false, side: THREE.DoubleSide })
    const plaque = new THREE.MeshBasicMaterial({ map: plaqueTexture(), toneMapped: false, color: new THREE.Color(0.85, 0.8, 0.72) })
    const screens: THREE.MeshBasicMaterial[] = []
    const scene = gltf.scene.clone(true)
    scene.updateMatrixWorld(true)
    const meshes: THREE.Mesh[] = []
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o)
    })
    // 画面には、いまの飛行のようすを描いた絵（consoles.ts）
    const consoles = new Consoles()
    const roles = screenRoles(meshes.filter((m) => m.name.startsWith('screen')))
    meshes.forEach((o, i) => {
      const role = roles.get(o)
      if (role) {
        const map = consoles.make(role, i)
        orientScreen(o, map, role)
        const m = new THREE.MeshBasicMaterial({ map, toneMapped: false, side: THREE.DoubleSide })
        screens.push(m)
        o.material = m
      } else if (o.name.startsWith('plaque')) o.material = plaque
      else o.material = room
    })
    const screen = new THREE.MeshBasicMaterial()
    const glass = new THREE.MeshPhysicalMaterial({ color: '#a9c4dc', transparent: true, opacity: 0.06, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide })
    return {
      scene,
      materials: [room, plaque, glass, screen, ...screens],
      screen,
      consoles,
      glass,
      glassPane: wallBand(FRONT - ROOM.windowHalf, FRONT + ROOM.windowHalf, ROOM.windowBottom, ROOM.windowTop, 0.01),
    }
  }, [gltf, light])

  useEffect(
    () => () => {
      parts.consoles.dispose()
      parts.materials.forEach((m) => {
        if (m !== parts.materials[0]) (m as THREE.MeshBasicMaterial).map?.dispose()
        m.dispose()
      })
      parts.glassPane.dispose()
    },
    [parts],
  )

  useFrame((_, dt) => parts.consoles.update(dt))

  return (
    <>
      <primitive object={parts.scene} />
      {/* 正面の窓と天窓のガラス（ほんのり色が付くだけ。枠はなし）。拡大画面にすると、窓ガラスに望遠の絵を映す */}
      {viewscreen ? <ViewscreenPane geometry={parts.glassPane} material={parts.screen} texture={viewscreen} /> : <mesh geometry={parts.glassPane} material={parts.glass} />}
      <mesh position={[0, ROOM.height + 0.3, 0]} rotation={[Math.PI / 2, 0, 0]} material={parts.glass}>
        <circleGeometry args={[ROOM.skylight, 48]} />
      </mesh>
    </>
  )
}

function ViewscreenPane({ geometry, material, texture }: { geometry: THREE.BufferGeometry; material: THREE.MeshBasicMaterial; texture: THREE.Texture }) {
  useEffect(() => {
    material.map = texture
    material.needsUpdate = true
  }, [material, texture])
  return <mesh geometry={geometry} material={material} />
}
