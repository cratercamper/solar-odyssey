import * as THREE from 'three'
import { frameAt, landPoint } from './park'

// 公園を速く走るためのホバースクーター（このアプリのオリジナル）。
// 立って乗る、ハンドルつきの浮く板：真珠色の板のふちに水色の光の帯、板の下に前後 2 つの浮上ポッド。
// 前の柱の先にハンドルと小さな速度の画面。地面には浮上ポッドの光が落ち、走ると後ろに輪（水の上ではさざ波、芝生では砂ぼこり）が残る。
// 座標は人と同じ：原点が地面、-z が前、+y が上。

/** 浮いている高さ（地面から板の上面まで、m） */
export const DECK_TOP = 0.36
/** ハンドルのにぎり（板の上面から） */
const GRIP = { x: 0.21, y: 0.98, z: -0.25 }
/** 乗る人の足の位置（板の中心より少し後ろ） */
export const RIDER_Z = 0.1

const DECK_L = 1.24
const DECK_W = 0.46
const DECK_H = 0.07

function roundRect(w: number, l: number, r: number) {
  const s = new THREE.Shape()
  const x = w / 2
  const y = l / 2
  s.moveTo(-x + r, -y)
  s.lineTo(x - r, -y)
  s.quadraticCurveTo(x, -y, x, -y + r)
  s.lineTo(x, y - r)
  s.quadraticCurveTo(x, y, x - r, y)
  s.lineTo(-x + r, y)
  s.quadraticCurveTo(-x, y, -x, y - r)
  s.lineTo(-x, -y + r)
  s.quadraticCurveTo(-x, -y, -x + r, -y)
  return s
}

/** 平らな形を、厚み h の板にして寝かせる（上面が y = 0） */
function slab(shape: THREE.Shape, h: number, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 10 })
  g.rotateX(Math.PI / 2)
  return g
}

let glowTex: THREE.Texture | null = null
function glowTexture() {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 64, 64)
  glowTex = new THREE.CanvasTexture(c)
  return glowTex
}

const RINGS = 18

export class HoverScooter {
  /** 地面に置く（placePerson と同じ置き方） */
  readonly group = new THREE.Group()
  /** 浮いて傾く本体 */
  readonly body = new THREE.Group()
  private glows: THREE.Mesh[] = []
  private glowMat: THREE.MeshBasicMaterial
  private emit: THREE.MeshStandardMaterial
  private screen: THREE.MeshStandardMaterial
  private disposables: { dispose(): void }[] = []
  private rings: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number }[] = []
  private ringGeo = new THREE.RingGeometry(0.62, 0.7, 40)
  private nextRing = 0
  private ringIdx = 0
  /** 浮き沈みの位相 */
  private t = Math.random() * 10

  constructor(world: THREE.Object3D) {
    const own = <T extends { dispose(): void }>(x: T) => (this.disposables.push(x), x)
    const shell = own(new THREE.MeshStandardMaterial({ color: '#e8ecef', roughness: 0.32, metalness: 0.08 }))
    const pad = own(new THREE.MeshStandardMaterial({ color: '#272c33', roughness: 0.92 }))
    const metal = own(new THREE.MeshStandardMaterial({ color: '#59616b', roughness: 0.38, metalness: 0.75 }))
    const rubber = own(new THREE.MeshStandardMaterial({ color: '#1b1d21', roughness: 0.85 }))
    this.emit = own(new THREE.MeshStandardMaterial({ color: '#0d2a33', emissive: '#55dcff', emissiveIntensity: 1.6, roughness: 0.4 }))
    this.screen = own(new THREE.MeshStandardMaterial({ color: '#06121a', emissive: '#3aa8ff', emissiveIntensity: 0.9, roughness: 0.2 }))
    const tail = own(new THREE.MeshStandardMaterial({ color: '#2a0606', emissive: '#ff3b30', emissiveIntensity: 1.4 }))
    const head = own(new THREE.MeshStandardMaterial({ color: '#333', emissive: '#fff2d8', emissiveIntensity: 1.8 }))
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true) => {
      own(g)
      const o = new THREE.Mesh(g, m)
      o.castShadow = shadow
      o.receiveShadow = true
      this.body.add(o)
      return o
    }

    // 板：真珠色の殻、上に黒いすべり止め、ふちに光の帯
    mesh(slab(roundRect(DECK_W, DECK_L, 0.2), DECK_H, 0.012), shell)
    mesh(slab(roundRect(DECK_W - 0.07, DECK_L - 0.2, 0.16), 0.004), pad).position.y = 0.016
    const band = roundRect(DECK_W + 0.018, DECK_L + 0.018, 0.209)
    band.holes.push(roundRect(DECK_W - 0.004, DECK_L - 0.004, 0.198))
    mesh(slab(band, 0.014), this.emit, false).position.y = -0.03
    // 前の鼻：少し反り上がった覆い
    const nose = mesh(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell)
    nose.scale.set(1.05, 0.32, 0.9)
    nose.position.set(0, -0.012, -DECK_L / 2 + 0.2)
    // 浮上ポッド（前後）：金属の筒、下に光る円盤と輪
    for (const z of [-0.4, 0.4]) {
      const pod = mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.08, 28), metal)
      pod.position.set(0, -DECK_H - 0.04, z)
      const disc = mesh(new THREE.CircleGeometry(0.12, 28), this.emit, false)
      disc.rotation.x = Math.PI / 2
      disc.position.set(0, -DECK_H - 0.081, z)
      const ring = mesh(new THREE.TorusGeometry(0.155, 0.012, 8, 32), this.emit, false)
      ring.rotation.x = Math.PI / 2
      ring.position.set(0, -DECK_H - 0.075, z)
    }
    // 前の柱：板の前から、乗る人の方へ少し倒れてハンドルまで
    const base = new THREE.Vector3(0, 0.02, -DECK_L / 2 + 0.12)
    const top = new THREE.Vector3(0, GRIP.y, GRIP.z)
    const stemLen = base.distanceTo(top)
    const stem = mesh(new THREE.CylinderGeometry(0.024, 0.032, stemLen, 16), shell)
    stem.position.copy(base).add(top).multiplyScalar(0.5)
    stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(base).normalize())
    const collar = mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.08, 16), metal)
    collar.position.copy(base).lerp(top, 0.06)
    collar.quaternion.copy(stem.quaternion)
    // ハンドル・にぎり・真ん中の小さな画面
    const bar = mesh(new THREE.CylinderGeometry(0.016, 0.016, GRIP.x * 2 + 0.14, 12), metal)
    bar.rotation.z = Math.PI / 2
    bar.position.copy(top)
    for (const s of [-1, 1]) {
      const g = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.11, 12), rubber)
      g.rotation.z = Math.PI / 2
      g.position.set(s * (GRIP.x + 0.02), top.y, top.z)
    }
    const dash = mesh(new THREE.BoxGeometry(0.11, 0.055, 0.024), rubber)
    dash.position.set(0, top.y + 0.035, top.z - 0.01)
    dash.rotation.x = -0.6
    const scr = mesh(new THREE.PlaneGeometry(0.09, 0.038), this.screen, false)
    dash.add(scr)
    scr.position.set(0, 0, 0.0125)
    // 前の灯りと、後ろの赤い灯り
    const lamp = mesh(new THREE.CircleGeometry(0.035, 16), head, false)
    lamp.position.set(0, -0.01, -DECK_L / 2 + 0.005)
    lamp.rotation.x = Math.PI - 0.15
    const tl = mesh(new THREE.BoxGeometry(0.2, 0.018, 0.01), tail, false)
    tl.position.set(0, -0.03, DECK_L / 2 + 0.006)

    this.body.position.y = DECK_TOP
    this.group.add(this.body)

    // 地面に落ちる浮上ポッドの光
    this.glowMat = own(new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#6fe4ff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }))
    const gg = own(new THREE.PlaneGeometry(1, 1))
    for (const z of [-0.4, 0.4]) {
      const g = new THREE.Mesh(gg, this.glowMat)
      g.rotation.x = -Math.PI / 2
      g.position.set(0, 0.02, z)
      g.renderOrder = 3
      this.glows.push(g)
      this.group.add(g)
    }
    // 後ろに残る輪
    for (let i = 0; i < RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
      own(mat)
      const m = new THREE.Mesh(this.ringGeo, mat)
      m.visible = false
      m.renderOrder = 3
      world.add(m)
      this.rings.push({ m, mat, age: 9 })
    }
    own(this.ringGeo)
  }

  /** ハンドルのにぎり（世界の位置）。左・右 */
  grips(left: THREE.Vector3, right: THREE.Vector3) {
    this.body.updateMatrixWorld(true)
    left.set(GRIP.x, GRIP.y, GRIP.z).applyMatrix4(this.body.matrixWorld)
    right.set(-GRIP.x, GRIP.y, GRIP.z).applyMatrix4(this.body.matrixWorld)
  }

  /**
   * 毎フレーム。lift：浮いている高さの倍率（0 で地面に伏せる、1 でふつう）、speed：m/s、
   * roll・pitch：傾き（ラジアン）、s・y・yaw：地面の上の位置と向き（輪を残す場所）、water：水の上
   */
  update(dt: number, o: { lift: number; hop: number; speed: number; roll: number; pitch: number; s: number; y: number; yaw: number; water: boolean; active: boolean }) {
    this.t += dt
    const bob = Math.sin(this.t * 2.3) * 0.018 + Math.sin(this.t * 5.1) * 0.006
    this.body.position.y = (DECK_TOP + bob) * o.lift + o.hop
    this.body.rotation.set(o.pitch + Math.sin(this.t * 1.7) * 0.012, 0, o.roll + Math.sin(this.t * 2.1) * 0.01)
    const k = Math.min(1, o.speed / 14)
    const glow = o.lift * (o.active ? 1 : 0.6)
    this.emit.emissiveIntensity = (1.1 + k * 1.4 + Math.sin(this.t * 31) * 0.08) * glow + 0.15
    this.screen.emissiveIntensity = o.active ? 0.9 : 0.25
    const h = this.body.position.y
    for (const g of this.glows) {
      g.position.y = o.water ? 0.1 : 0.02
      g.scale.setScalar(0.55 + h * 1.6)
    }
    this.glowMat.opacity = 0.55 * glow * THREE.MathUtils.clamp(1.2 - h * 1.2, 0.25, 1)
    // 輪：速く走るほど間をつめて出す
    this.nextRing -= dt
    if (o.speed > 2 && o.lift > 0.5 && this.nextRing <= 0) {
      this.nextRing = THREE.MathUtils.clamp(1.4 / o.speed, 0.06, 0.25)
      const r = this.rings[this.ringIdx++ % RINGS]
      const bs = o.s + Math.sin(o.yaw) * 0.45
      const by = o.y + Math.cos(o.yaw) * 0.45
      landPoint(bs, by, o.water ? 0.16 : 0.075, r.m.position)
      frameAt(bs, r.m.quaternion).multiply(flat)
      r.mat.color.set(o.water ? '#e6f6ff' : '#cbb89a')
      r.m.userData.peak = o.water ? 0.5 : 0.22
      r.age = 0
      r.m.visible = true
    }
    for (const r of this.rings) {
      if (r.age > 1.2) continue
      r.age += dt
      const a = r.age / 1.2
      r.m.scale.setScalar(0.5 + a * 2.2)
      r.mat.opacity = (r.m.userData.peak as number) * (1 - a) * (1 - a)
      if (r.age > 1.2) r.m.visible = false
    }
  }

  dispose() {
    this.group.removeFromParent()
    for (const r of this.rings) r.m.removeFromParent()
    for (const d of this.disposables) d.dispose()
  }
}

const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
