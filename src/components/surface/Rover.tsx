import { campaignSample } from '../../state/campaign'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { FAR, LANDER_POS, Terrain, rockGeometry, seeded } from './terrain'
import { withRockDetail } from './groundMaterial'
import { dustFragment, dustVertex, puffTexture, windFor } from './landerFx'
import type { SkyNow } from './skyNow'
import { lowMemory, useLevel } from '../../state/quality'
import { MAP_KEYS, shrinkTexture } from './shrinkTexture'
import { useLanding } from '../../state/landing'
import { isWide, roverRangeFor, wideNow } from './wideGround'
import { DEPLOY_SEC, ROVER_RANGE, ROVER_TOP, driveInput, mouseSink, roverCtl, roverFocus, roverInput, roverDebug, roverNow, roverPose, roverQuick, setRoverPhase, useRover, useSampleLog } from '../../state/rover'
import { PAINT_PARTS, paintUniforms, withPaint } from './paint'
import { samplesFor, type RockSample } from '../../data/rockSamples'
import { rockSpots } from '../../data/rockSpots'
import type { Poi } from './pois'
import { WheelTracks } from './wheelTracks'
import { Sway } from './roverSway'

// 無人探査ローバー ORV-7（全長 1.8 m）。模型は tools/blender/build_rover.py で作った rover-orv7.glb。
// 関節（脚・太陽電池・マスト・アンテナ・アーム）は模型ではすべて 0 で、ここで回して
// 「たたんだ姿 → 展開」と、走っているあいだの姿勢を作る（角度は build_rover.py の deploy_pose と同じ）。

const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}`
const D = Math.PI / 180

// ---- 展開の動き（build_rover.py と同じ数字） -----------------------------------------------

const WHEEL_R = 0.2
/** アクセルオフの減速（m/s²）：どの星でも効く最低限の抵抗と、速さに比例するギアの抵抗（1/s） */
const ROLL_BASE = 0.8
/**
 * 空中の姿勢制御：横への加速度（m/s²）、向きを変える速さ（rad/s）、下へ押す加速度の下限（m/s²）、噴射剤が持つ時間（秒）。
 * 小さなガス噴射なので、横へはほんの少ししか動けない。向きを変えても進む向きはそのまま（着地してタイヤで曲がる）。
 * 地面で曲がるより空中のほうがよく曲がる、ということがないように
 */
const AIR_SIDE = 1.2
const AIR_YAW = 0.45
const AIR_DOWN_MIN = 6
const AIR_FUEL_SEC = 2.5
/**
 * 自分で跳ぶ（ジャンプボタン）と、サスペンションのけりに加えて噴射剤も少し使う（満タンの 4 割）。
 * 跳んだあとは空中で曲がれる分が減るので、いつ跳ぶか考えるようになる。残りが少ないと、跳ぶ高さも少し低い
 */
const JUMP_FUEL = 0.4
/**
 * 噴射剤の終わり際（cratercamper さんの案）：◀▶ の横噴射は、残りが AIR_RESERVE + AIR_FADE から AIR_RESERVE まで
 * だんだん弱まって止まる（ぷつっと切れない）。最後の AIR_RESERVE は ▼（下へ押して着地）だけに取っておく
 */
const AIR_FADE = 0.3
const AIR_RESERVE = 0.12
const smooth01 = (v: number) => {
  const t = Math.min(1, Math.max(0, v))
  return t * t * (3 - 2 * t)
}
const ROLL_GEAR = 0.35
/** 地面の転がり抵抗係数。ふかふかの砂ほど車輪が沈んで大きい（舗装路はおよそ 0.015） */
const SOIL_DRAG: Record<string, number> = {
  moon: 0.2, mercury: 0.2, mars: 0.22, earth: 0.25, titan: 0.25, venus: 0.12, io: 0.15,
  europa: 0.08, ganymede: 0.1, callisto: 0.12, enceladus: 0.07, triton: 0.09, pluto: 0.1,
}
const soilDrag = (id: string) => SOIL_DRAG[id] ?? 0.16
/** 氷の地面：タイヤの力の倍率（横すべりを止める力・加速・ブレーキ）。エウロパはつるつる */
const ICE_GRIP: Record<string, number> = { europa: 0.2 }
export const iceGrip = (id: string) => ICE_GRIP[id] ?? 1
/**
 * 横すべり（ドリフト）。タイヤが横に出せる力（m/s²）は、重力が強いほど大きい（車輪が地面に押しつけられる）。
 * すべり始めは、すべる速さに比例して止める（SLIP_LIN × g + …、1/s）。車体の向きと進む向きのずれが
 * SLIDE_MAX に近づくと、ハンドルが効きにくくなる（スピンしない）
 */
const latGrip = (g: number) => 10 + 2.5 * g
const slipLin = (g: number) => 4 + 1.6 * g
const SLIDE_MAX = 0.6
/** 脚ごとの、関節から車軸へのベクトル（前後, 上下）と、たたんだときの角度 */
const LEGS = {
  F: { vy: 0.3, vz: -0.32, fold: 122 * D },
  M: { vy: -0.42, vz: -0.32, fold: -69 * D },
  R: { vy: -0.36, vz: -0.32, fold: -117 * D },
} as const
type LegId = keyof typeof LEGS
const KNUCKLE_Z = 0.52
const BELLY_DROP = 0.32
const LINK_FOLD = 52 * D
const ARM_STOW = [0, 86, -86, 0].map((v) => v * D)
const ARM_WORK = [28, 38, -42, -78].map((v) => v * D)

const ease = (a: number, b: number, t: number) => {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return u * u * (3 - 2 * u)
}
const hubZ = (id: LegId, ang: number) => KNUCKLE_Z + LEGS[id].vy * Math.sin(ang) + LEGS[id].vz * Math.cos(ang)

type Pose = {
  dz: number
  legs: Record<LegId, number>
  link: number
  panelL: number
  panelR: number
  mast: number
  antenna: number
  head: number
  arm: number[]
}

export type { Pose }
export { ARM_STOW }

export function deployPose(t: number, arm = ARM_WORK): Pose {
  const s = ease(0.05, 0.5, t)
  const legs = { F: LEGS.F.fold * (1 - s), M: LEGS.M.fold * (1 - s), R: LEGS.R.fold * (1 - s) }
  const dz = Math.max(-BELLY_DROP, ...(['F', 'M', 'R'] as LegId[]).map((id) => WHEEL_R - hubZ(id, legs[id])))
  const h = ease(0.86, 1, t)
  const a = ease(0.8, 1, t)
  return {
    dz,
    legs,
    link: LINK_FOLD * (1 - s),
    panelL: Math.PI * (1 - ease(0.5, 0.66, t)),
    panelR: -Math.PI * (1 - ease(0.57, 0.74, t)),
    mast: (-Math.PI / 2) * (1 - ease(0.66, 0.84, t)),
    antenna: (-Math.PI / 2) * (1 - ease(0.72, 0.86, t)),
    head: 35 * D * Math.sin(h * Math.PI * 2) * (1 - h * 0.3),
    arm: ARM_STOW.map((p, i) => p + (arm[i] - p) * a),
  }
}

export type Rig = {
  body: THREE.Object3D
  legs: Record<string, THREE.Object3D>
  wheels: Record<string, THREE.Object3D>
  links: THREE.Object3D[]
  panelsL: THREE.Object3D[]
  panelsR: THREE.Object3D[]
  mast: THREE.Object3D
  head: THREE.Object3D
  antennas: THREE.Object3D[]
  arm: THREE.Object3D[]
}

/** 車輪の車軸の高さ（模型の座標）。車体を (tiltP, tiltR) 傾け、脚を a に回したとき */
function hubY(P: THREE.Vector3, h: THREE.Vector3, a: number, tiltP: number, tiltR: number) {
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const lx = P.x + h.x
  const ly = P.y + h.y * ca - h.z * sa
  const lz = P.z + h.y * sa + h.z * ca
  // 車体の回転は XYZ の順（Rx・Rz を、Rz から先にかける）
  const y1 = lx * Math.sin(tiltR) + ly * Math.cos(tiltR)
  return y1 * Math.cos(tiltP) - lz * Math.sin(tiltP)
}

/**
 * 姿勢を模型に。squash は車体の沈み込み（m）で、脚を少し回して表す。
 * tiltP／tiltR はサスペンションでの車体だけの傾き（前が上がる +、右が上がる +）。
 * 車輪が地面から離れないよう、脚ごとに回す角度を求め直す
 */
export function applyPose(rig: Rig, p: Pose, squash = 0, tiltP = 0, tiltR = 0) {
  rig.body.position.y = p.dz - squash
  rig.body.rotation.set(tiltP, 0, tiltR)
  const tilted = Math.abs(tiltP) > 1e-4 || Math.abs(tiltR) > 1e-4
  for (const k of ['FR', 'MR', 'RR', 'FL', 'ML', 'RL']) {
    const id = k[0] as LegId
    // 沈んだぶん、前の脚は前へ、中と後ろの脚は後ろへ開く（車輪は地面に着いたまま）
    const a0 = p.legs[id] + squash / LEGS[id].vy
    const leg = rig.legs[k]
    if (!tilted) {
      leg.rotation.x = a0
      continue
    }
    const P = leg.position
    const h = rig.wheels[k].position
    const want = hubY(P, h, a0, 0, 0)
    let a = a0
    for (let i = 0; i < 3; i++) {
      const f = hubY(P, h, a, tiltP, tiltR) - want
      const df = (hubY(P, h, a + 1e-3, tiltP, tiltR) - hubY(P, h, a, tiltP, tiltR)) / 1e-3
      if (Math.abs(df) < 1e-3) break
      a -= THREE.MathUtils.clamp(f / df, -0.4, 0.4)
    }
    leg.rotation.x = a
  }
  for (const l of rig.links) l.rotation.x = p.link
  // Blender の Y 軸まわり → three.js では -Z 軸まわり
  for (const o of rig.panelsL) o.rotation.z = -p.panelL
  for (const o of rig.panelsR) o.rotation.z = -p.panelR
  rig.mast.rotation.x = p.mast
  rig.head.rotation.y = p.head
  for (const a of rig.antennas) a.rotation.x = p.antenna
  const [yaw, a1, a2, a3] = p.arm
  rig.arm[0].rotation.y = -yaw
  rig.arm[1].rotation.x = a1
  rig.arm[2].rotation.x = a2 - a1
  rig.arm[3].rotation.x = a3 - a2
}

// ---- 地面の高さ（描いている地面の格子と同じ形で） --------------------------------------------

/**
 * 地面の格子（Terrain.geometry：中心ほど細かい円形の格子）の上での高さ。
 * terrain.height は本当の地形なので、格子の粗いところでは、描かれた地面と少しずれる。
 * 車輪が地面に浮いたり沈んだりしないよう、格子の 4 つの頂点から求める。
 */
export function meshHeight(terrain: Terrain, x: number, z: number) {
  // 広い天体：ローバーのまわりは 1〜2 m 間隔のタイルなので、本当の高さとほぼ同じ
  if (isWide(terrain)) return terrain.height(x, z)
  const RINGS = terrain.dem ? 190 : 150
  const SEG = terrain.dem ? 360 : 240
  const r = Math.hypot(x, z)
  const fi = RINGS * (r / FAR) ** (1 / 2.3)
  if (fi < 1) return terrain.height(x, z)
  const i0 = Math.floor(fi)
  const fr = fi - i0
  let a = Math.atan2(z, x)
  if (a < 0) a += Math.PI * 2
  const fj = (a / (Math.PI * 2)) * SEG
  const j0 = Math.floor(fj)
  const fa = fj - j0
  const at = (i: number, j: number) => {
    const rr = FAR * (i / RINGS) ** 2.3
    const aa = (j / SEG) * Math.PI * 2
    return terrain.height(Math.cos(aa) * rr, Math.sin(aa) * rr)
  }
  const h00 = at(i0, j0)
  const h01 = at(i0, j0 + 1)
  const h10 = at(i0 + 1, j0)
  const h11 = at(i0 + 1, j0 + 1)
  return (h00 * (1 - fa) + h01 * fa) * (1 - fr) + (h10 * (1 - fa) + h11 * fa) * fr
}

/**
 * 描いている地面の三角形の上の高さ（轍を地面にぴったり沿わせる）。広い天体のタイルは step 間隔の格子で、
 * 1 マスを (i+1, j)–(i, j+1) の対角線で 2 つの三角形に分けている（terrain.ts の tileJob）。それ以外は meshHeight
 */
export function drawnHeight(terrain: Terrain, x: number, z: number) {
  const world = isWide(terrain) ? wideNow.world : null
  if (!world) return meshHeight(terrain, x, z)
  const step = world.opt.step
  const i = Math.floor(x / step)
  const j = Math.floor(z / step)
  const fx = x / step - i
  const fz = z / step - j
  const h = (a: number, b: number) => terrain.height((i + a) * step, (j + b) * step)
  const h10 = h(1, 0)
  const h01 = h(0, 1)
  if (fx + fz <= 1) {
    const h00 = h(0, 0)
    return h00 + (h10 - h00) * fx + (h01 - h00) * fz
  }
  const h11 = h(1, 1)
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz)
}

// ---- 車輪が巻き上げる砂ぼこり ---------------------------------------------------------------

export class WheelDust {
  readonly points: THREE.Points
  readonly material: THREE.ShaderMaterial
  private geo = new THREE.BufferGeometry()
  private pos: Float32Array
  private vel: Float32Array
  private alpha: Float32Array
  private size: Float32Array
  private rot: Float32Array
  private vari: Float32Array
  private age: Float32Array
  private life: Float32Array
  private floor: Float32Array
  private next = 0

  constructor(readonly count: number, color: THREE.Color, private hasAir: boolean, private gravity: number, private wind: THREE.Vector3) {
    this.pos = new Float32Array(count * 3)
    this.vel = new Float32Array(count * 3)
    this.alpha = new Float32Array(count)
    this.size = new Float32Array(count)
    this.rot = new Float32Array(count)
    this.vari = new Float32Array(count)
    this.age = new Float32Array(count).fill(99)
    this.life = new Float32Array(count).fill(1)
    this.floor = new Float32Array(count)
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1))
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1))
    this.geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1))
    this.geo.setAttribute('aVar', new THREE.BufferAttribute(this.vari, 1))
    this.material = new THREE.ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      uniforms: {
        uMap: { value: puffTexture() },
        uColor: { value: color.clone() },
        uShadow: { value: color.clone().multiplyScalar(0.35) },
        uSunView: { value: new THREE.Vector3(0, 1, 0) },
        uScale: { value: 500 },
      },
      transparent: true,
      depthWrite: false,
    })
    this.points = new THREE.Points(this.geo, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 2
  }

  /** 1 つぶ。(x, y, z) は地面の上の点、(vx, vy, vz) は飛び出す勢い */
  puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number) {
    const j = this.next++ % this.count
    const i = j * 3
    this.pos[i] = x + (Math.random() - 0.5) * 0.3
    this.pos[i + 1] = y + 0.05 + Math.random() * 0.15
    this.pos[i + 2] = z + (Math.random() - 0.5) * 0.3
    this.vel[i] = vx + (Math.random() - 0.5) * 1.2
    this.vel[i + 1] = vy * (0.6 + Math.random() * 0.8)
    this.vel[i + 2] = vz + (Math.random() - 0.5) * 1.2
    this.floor[j] = y
    this.age[j] = 0
    this.rot[j] = Math.random() * Math.PI * 2
    this.vari[j] = Math.random() * 0.999
    this.life[j] = this.hasAir ? 2.5 + Math.random() * 3.5 : 0.6 + Math.random() * 0.6
    this.size[j] = size * (0.6 + Math.random() * 0.8)
  }

  update(dt: number) {
    const w = this.wind
    for (let j = 0; j < this.count; j++) {
      if (this.age[j] >= this.life[j]) {
        this.alpha[j] = 0
        continue
      }
      this.age[j] += dt
      const i = j * 3
      if (this.hasAir) {
        // 空気に引かれて勢いが落ち、風に流され、ゆっくり舞い上がる
        const k = Math.min(1, 1.8 * dt)
        this.vel[i] += (w.x - this.vel[i]) * k
        this.vel[i + 2] += (w.z - this.vel[i + 2]) * k
        this.vel[i + 1] += (0.25 - this.vel[i + 1]) * k * 0.8
      } else {
        this.vel[i + 1] -= 9.8 * this.gravity * dt
      }
      this.pos[i] += this.vel[i] * dt
      this.pos[i + 1] = Math.max(this.floor[j], this.pos[i + 1] + this.vel[i + 1] * dt)
      this.pos[i + 2] += this.vel[i + 2] * dt
      this.size[j] += dt * (this.hasAir ? 0.9 : 1.6)
      this.rot[j] += dt * 0.3
      const u = this.age[j] / this.life[j]
      const fadeIn = Math.min(1, this.age[j] / 0.12)
      this.alpha[j] = fadeIn * Math.max(0, 1 - u) ** 1.5 * (this.hasAir ? 0.38 : 0.2)
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.aAlpha.needsUpdate = true
    this.geo.attributes.aSize.needsUpdate = true
    this.geo.attributes.aRot.needsUpdate = true
    this.geo.attributes.aVar.needsUpdate = true
  }

  dispose() {
    this.geo.dispose()
    this.material.dispose()
  }
}

// ---- 走り ---------------------------------------------------------------------------------

/** 着陸船の 4 本の脚の足（ぶつからないように）。着陸船の模型の座標から */
function landerFeet(yaw: number) {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return [
    [4.5, -5.7],
    [-4.5, -5.7],
    [4.5, 5.9],
    [-4.5, 5.9],
  ].map(([x, z]) => new THREE.Vector2(LANDER_POS.x + x * c + z * s, LANDER_POS.y - x * s + z * c))
}

/** これより高い岩は乗り越えられない（m）。6 輪のロッカー・ボギーなので、車輪の直径の倍よりも高い岩まで登れる */
const BIG_ROCK = 1.1
/** これより高い岩は、まるい丘として車輪で乗り上げる（m）。低い岩は、車輪が当たってぴょんと跳ねるだけ */
const CLIMB_ROCK = 0.15
/** 車輪の位置（前後, 左右）。前後は ±0.72、左右は ±0.5 */
const WHEELS: [number, number][] = [
  [0.72, -0.5], [0.72, 0.5],
  [0, -0.5], [0, 0.5],
  [-0.72, -0.5], [-0.72, 0.5],
]
/** 車体の腹の高さ（車輪の下から）。車輪のあいだの岩も、これより高ければ車体を持ち上げる */
const BELLY = 0.38
const CELL = 5

/** t：岩のてっぺんの高さ（世界の y） */
type RockBody = { id: number; x: number; z: number; r: number; h: number; t: number }
type RockGrid = Map<string, RockBody[]>

export function rockBodies(terrain: Terrain): RockGrid {
  const grid: RockGrid = new Map()
  // 広い天体の岩は、地面のタイルといっしょに持つ（wideNow.world.cells）
  if (isWide(terrain)) return grid
  const rocks = terrain.rocks(Math.round(terrain.def.relief.rocks * 1400))
  rocks.forEach((r, i) => {
    if (Math.abs(r.x) > ROVER_RANGE + 4 || Math.abs(r.z) > ROVER_RANGE + 4) return
    // 岩の形は半径 0.7〜1.2 の球をつぶしたもの。中心は地面から 0.35 × 大きさ 下
    // 見えている地面（格子の高さ）からの高さで決める。DEM のある天体では、岩が地面に埋まっていることがある（埋まった岩は当たらない）
    const h = r.y + r.s * r.sy * 0.95 - meshHeight(terrain, r.x, r.z)
    if (h < 0.04) return
    const key = `${Math.floor(r.x / CELL)},${Math.floor(r.z / CELL)}`
    const list = grid.get(key) ?? []
    list.push({ id: i, x: r.x, z: r.z, r: r.s * 0.9, h, t: r.y + r.s * r.sy * 0.95 })
    grid.set(key, list)
  })
  return grid
}

const nearOut: RockBody[] = []
const siteBody: RockBody = { id: 0, x: 0, z: 0, r: 0, h: 0, t: 0 }
const siteBodies: RockBody[] = []
/** (x, z) のまわりの岩（採集用の岩も、まだ採っていなければ小石として入れる） */
/** 岩をまるい丘とみなしたときの、丘の広さ。高い岩ほど裾を広くして、なだらかに登る */
const hillR = (r: RockBody) => r.r + 0.3 + 0.25 * r.h

/** 岩の上に乗ったときの地面の高さ（岩をまるい丘とみなす）。岩の外なら base のまま */
export function onRocks(rocks: RockBody[], x: number, z: number, base: number) {
  let y = base
  for (const r of rocks) {
    const R = hillR(r)
    const d = Math.hypot(x - r.x, z - r.z)
    if (d < R) y = Math.max(y, r.t - r.h * (d / R) ** 2)
  }
  return y
}

const climbOut: RockBody[] = []
/**
 * (x, z) のまわりの、乗り上げる岩（CLIMB_ROCK より高い岩）。
 * 乗り越えられない大岩は、跳んで上に乗ったとき（車体 y が岩の根もとより十分高いとき）だけ入れる。
 * 下から近づくときに入れると、ぶつかって止まった大岩に前輪が登ってしまう
 */
function climbRocks(grid: RockGrid, x: number, z: number, y: number) {
  climbOut.length = 0
  for (const r of nearRocks(grid, x, z)) {
    if (r.h < CLIMB_ROCK || Math.hypot(x - r.x, z - r.z) > hillR(r) + 1) continue
    if (r.h >= BIG_ROCK && y < r.t - r.h + 0.3) continue
    climbOut.push(r)
  }
  return climbOut
}

const wheelH = new Float32Array(6)
/**
 * 岩に乗り上げて、車体がどれだけ持ち上がるか（m）と、6 つの車輪の下の高さ（wheelH）。
 * 今のかたむき（tanP：前が上がる向き、tanR：右が上がる向き）のまま、どの車輪も岩にめり込まない高さまで車体を上げる。
 * 岩の無い地面だけで同じように測った高さとの差なので、岩が無ければ 0（地面の上の動きは今までどおり）
 */
function rockLift(
  grid: RockGrid, terrain: Terrain, x: number, z: number, y: number,
  fx: number, fz: number, tanP: number, tanR: number,
) {
  const rocks = climbRocks(grid, x, z, y)
  const sx = -fz
  const sz = fx
  let withRocks = -Infinity
  let bare = -Infinity
  for (let i = 0; i < 6; i++) {
    const [wf, sd] = WHEELS[i]
    const wx = x + fx * wf + sx * sd
    const wz = z + fz * wf + sz * sd
    const m = meshHeight(terrain, wx, wz)
    const h = rocks.length ? onRocks(rocks, wx, wz, m) : m
    wheelH[i] = h
    const off = wf * tanP + sd * tanR
    withRocks = Math.max(withRocks, h - off)
    bare = Math.max(bare, m - off)
  }
  if (!rocks.length) return 0
  // 車輪のあいだの岩：腹がこすらない高さまで
  withRocks = Math.max(withRocks, onRocks(rocks, x, z, -Infinity) - BELLY)
  return Math.max(0, withRocks - bare)
}

export function nearRocks(grid: RockGrid, x: number, z: number, sites?: { x: number; z: number; size: number }[], taken?: Set<number>) {
  nearOut.length = 0
  const cx = Math.floor(x / CELL)
  const cz = Math.floor(z / CELL)
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const list = grid.get(`${cx + i},${cz + j}`)
    if (list) for (const r of list) nearOut.push(r)
  }
  if (sites) {
    sites.forEach((st, i) => {
      if (taken?.has(i) || Math.abs(st.x - x) > 3 || Math.abs(st.z - z) > 3) return
      const b = siteBodies[i] ?? (siteBodies[i] = { ...siteBody })
      Object.assign(b, { id: -10 - i, x: st.x, z: st.z, r: st.size, h: st.size * 0.6 })
      nearOut.push(b)
    })
  }
  return nearOut
}

type Drive = {
  x: number
  z: number
  y: number
  vy: number
  heading: number
  speed: number
  pitch: number
  roll: number
  grounded: boolean
  spin: number
  steer: number
  squash: number
  squashV: number
  arm: number
  still: number
  dropped: boolean
  burst: number
  hudT: number
  /** 採集の経過（秒）。-1 = 採集していない */
  sampleT: number
  sampleIdx: number
  /** 範囲の端に最後に当たった時刻（秒）。メッセージを少しのあいだ出す */
  edgeT: number
  /** 最後に乗り上げた岩と、そこからの時間（同じ岩で何度も跳ねないように） */
  bumpRock: number
  bumpT: number
  /**
   * 地面から離れるときに、上への速さをそのままにする。いまの上への速さが、ジャンプか小さな岩で跳ねたものか、
   * すでに一度向きをかえたもののとき。地面が上への速さを決めたとき（ふれて、地面の上がる速さが車体の上への速さ以上）に false にもどる
   */
  keepVy: boolean
  /** 岩に乗り上げている高さ（m）。0 は地面の上 */
  onRock: number
  /** 空中の噴射剤（0〜1）。地面にいると回復する */
  fuel: number
  /** 噴射している強さ（0〜1、見た目のガス用）と、左右（-1 左へ、+1 右へ）・下向き */
  thrust: number
  thrustSide: number
  thrustDown: number
  /** 空中で ▼（下へ押す噴射）を使った。着地しても、ボタンを離すまではブレーキにしない */
  downHeld: boolean
  /** 横すべりの速さ（m/s、右へ +） */
  slip: number
  /** タイヤが車体を横へ押す加速度（m/s²、右へ +）。車体の傾きに使う */
  aLat: number
  /** サスペンションでの車体だけの傾き */
  sway: Sway
}

/** 採集できる岩の置き場所 */
type Site = { x: number; y: number; z: number; size: number; rot: number; seed: number; kind: RockSample; poi?: Poi }

/** 採集の段取り（秒）：アームを伸ばす → つかむ → 持ち上げて車体へ */
const REACH = 1.1
const GRIP = 1.7
const DONE = 2.8
const ARM_REACH = [0, 30, -62, -86].map((v) => v * D)

const PROPS = { cam: new THREE.Vector3(), look: new THREE.Vector3(), fwd: new THREE.Vector3(), tmp: new THREE.Vector3(), q: new THREE.Quaternion() }

// ---- 噴射剤の残りを、車体の後ろの灯で見せる（cratercamper さん 2026-11-13：画面の計器より自然で、Shift+F12 でも見える） ----
// 後ろの面の上のほうに、左右対称の細い光の線を 2 本。真ん中から外へ向かって、残りの量だけ伸びる。
// 青 → 残りが少ないと橙 → ▼ だけの残り（AIR_RESERVE）で赤。空になると赤く点滅。満タンで地面にいるあいだは、ほのかに灯るだけ
/** 模型の座標（静止の姿勢）での、後ろの面の上の線の位置（模型の Body：x ±0.37、y 0.38〜1.005、後ろの面 z 0.78） */
const RCS_BAR = { y: 0.93, z: 0.783, inner: 0.07, outer: 0.34, h: 0.04 }
const RCS_BLUE = new THREE.Color(0.35, 1.6, 2.4)
const RCS_AMBER = new THREE.Color(2.4, 1.3, 0.25)
const RCS_RED = new THREE.Color(2.6, 0.3, 0.15)

class RcsLights {
  group = new THREE.Group()
  private base: THREE.MeshBasicMaterial
  private glow: THREE.MeshBasicMaterial
  private bars: THREE.Mesh[] = []
  private geo = new THREE.BoxGeometry(1, 1, 1)
  private dim = 0.25
  constructor() {
    this.group.name = 'rcs-lights'
    this.base = new THREE.MeshBasicMaterial({ color: '#0b0f14' })
    this.glow = new THREE.MeshBasicMaterial({ color: RCS_BLUE.clone(), toneMapped: false })
    const len = RCS_BAR.outer - RCS_BAR.inner
    for (const side of [-1, 1]) {
      // 消えているところも見えるよう、黒いみぞ
      const slot = new THREE.Mesh(this.geo, this.base)
      slot.scale.set(len + 0.02, RCS_BAR.h + 0.02, 0.01)
      slot.position.set(side * (RCS_BAR.inner + len / 2), RCS_BAR.y, RCS_BAR.z)
      const bar = new THREE.Mesh(this.geo, this.glow)
      bar.position.set(0, RCS_BAR.y, RCS_BAR.z + 0.004)
      bar.userData.side = side
      for (const m of [slot, bar]) {
        m.castShadow = false
        m.receiveShadow = false
        this.group.add(m)
      }
      this.bars.push(bar)
    }
  }
  /** fuel 0..1。air：宙にいる。thrust：いま噴いている（0..1） */
  update(fuel: number, air: boolean, thrust: number, t: number, dt: number) {
    const len = RCS_BAR.outer - RCS_BAR.inner
    const l = Math.max(0.004, len * fuel)
    for (const b of this.bars) {
      const side = b.userData.side as number
      b.scale.set(l, RCS_BAR.h, 0.012)
      b.position.x = side * (RCS_BAR.inner + l / 2)
      b.visible = fuel > 0.003
    }
    const c = this.glow.color
    if (fuel <= AIR_RESERVE) c.copy(RCS_RED)
    else if (fuel < 0.42) c.copy(RCS_AMBER).lerp(RCS_BLUE, smooth01((fuel - 0.3) / 0.12))
    else c.copy(RCS_BLUE)
    // 満タンで地面にいるときは控えめに。使っている・減っているときは明るく、噴くとさらに少し明るく
    const want = air || fuel < 0.99 ? 1 : 0.25
    this.dim += (want - this.dim) * Math.min(1, dt * 4)
    let k = this.dim * (1 + 0.35 * thrust)
    if (fuel <= AIR_RESERVE && air && Math.sin(t * 14) < 0) k *= 0.35
    c.multiplyScalar(k)
    if (fuel <= 0.003) {
      // 空：みぞだけが赤く点滅
      this.base.color.setRGB(Math.sin(t * 8) > 0 && air ? 0.6 : 0.05, 0.02, 0.02)
    } else this.base.color.set('#0b0f14')
  }
  dispose() {
    this.geo.dispose()
    this.base.dispose()
    this.glow.dispose()
  }
}

export function Rover({
  terrain,
  dustColor,
  sky,
  landerYaw,
  prepare,
}: {
  terrain: Terrain
  dustColor: string
  sky: SkyNow
  landerYaw: number
  /** 地表の場面の空気遠近・雲の影を、模型の素材にかける */
  prepare: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial
}) {
  const { scene } = useGLTF(url('rover-orv7.glb'))
  const group = useRef<THREE.Group>(null)
  const phase = useRover((r) => r.phase)
  const def = terrain.def
  const g = 9.8 * def.gravity

  const built = useMemo(() => {
    const model = scene.clone(true)
    const owned: { dispose: () => void }[] = []
    const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.7), toneMapped: false })
    owned.push(lamp)
    const mats = new Map<string, THREE.Material>()
    // 峡谷レースの色（roverCtl.paint）。ふだんは塗らない
    const paint = paintUniforms()
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const src = mesh.material as THREE.MeshStandardMaterial
      const full = PAINT_PARTS.has(mesh.name)
      const mk = src.uuid + (full ? ':full' : '')
      if (!mats.has(mk)) {
        if (src.name === 'Lamp') mats.set(mk, lamp)
        else {
          // 焼き込んだ質感（色・ラフネス/メタリック・ノーマル）の材質。金属の映り込みを少し強めに
          const m = src.clone()
          m.envMapIntensity = 1.15
          // スマホではテクスチャを 1024 に縮める（地表の場面は別の Canvas なので、メモリを食いすぎないように）
          if (lowMemory()) {
            for (const key of MAP_KEYS) {
              const tex = m[key]
              if (!tex) continue
              const small = shrinkTexture(tex, 1024)
              if (small) {
                m[key] = small
                owned.push(small)
              }
            }
          }
          prepare(withPaint(m, paint, full))
          owned.push(m)
          mats.set(mk, m)
        }
      }
      mesh.material = mats.get(mk)!
    })
    const get = (n: string) => model.getObjectByName(n)!
    const rig: Rig = {
      body: get('Body'),
      legs: Object.fromEntries(['FR', 'MR', 'RR', 'FL', 'ML', 'RL'].map((k) => [k, get('Leg_' + k)])),
      wheels: Object.fromEntries(['FR', 'MR', 'RR', 'FL', 'ML', 'RL'].map((k) => [k, get('Wheel_' + k)])),
      links: [get('Link_R'), get('Link_L')],
      panelsL: [get('Panel_L1'), get('Panel_L2')],
      panelsR: [get('Panel_R1'), get('Panel_R2')],
      mast: get('Mast'),
      head: get('Head'),
      antennas: [get('Antenna1'), get('Antenna2')],
      arm: [get('ArmYaw'), get('ArmUpper'), get('ArmFore'), get('ArmHand')],
    }
    for (const w of Object.values(rig.wheels)) w.rotation.order = 'YXZ'
    // 噴射剤の灯：車体（Body）に付けて、沈み込み・傾きに一緒に動かす。静止の姿勢での模型の座標から、車体の座標へ
    const rcs = new RcsLights()
    model.updateMatrixWorld(true)
    const toBody = new THREE.Matrix4().copy(rig.body.matrixWorld).invert().multiply(model.matrixWorld)
    rcs.group.applyMatrix4(toBody)
    rig.body.add(rcs.group)
    owned.push(rcs)
    return { model, rig, owned, paint, rcs }
  }, [scene, prepare])
  useEffect(() => () => built.owned.forEach((m) => m.dispose()), [built])

  const level = useLevel()
  const hasAir = !!def.sky
  const dust = useMemo(
    () => new WheelDust(level === 'high' ? 700 : level === 'medium' ? 450 : 220, new THREE.Color(dustColor), hasAir, def.gravity, windFor(def.id, hasAir)),
    [dustColor, level, hasAir, def],
  )
  useEffect(() => () => dust.dispose(), [dust])
  // 姿勢制御の噴射のガス（白く、すぐ消える。重力も風も受けない）
  const gas = useMemo(() => new WheelDust(level === 'low' ? 80 : 160, new THREE.Color('#e8eef5'), false, 0, new THREE.Vector3()), [level])
  useEffect(() => () => gas.dispose(), [gas])
  // 轍：この着陸のあいだ残す（回収して出しなおしても、前に走った跡はそのまま）
  const tracks = useMemo(() => new WheelTracks(def.id, level, (x, z) => drawnHeight(terrain, x, z)), [def.id, level, terrain])
  useEffect(() => () => tracks.dispose(), [tracks])
  const dustBase = useMemo(() => new THREE.Color(dustColor), [dustColor])
  const feet = useMemo(() => landerFeet(landerYaw), [landerYaw])

  // ---- 採集できる岩：着陸地点のまわりと、見どころのまわりにちらばらせる。1 つめは、ローバーが降りた正面の少し先に ----
  // 見どころには、その地形らしい岩を置く（rockSpots.ts）。着陸地点のまわりに無い岩は、見どころまで行かないと採れない
  const sites = useMemo<Site[]>(() => {
    const kinds = samplesFor(def.id)
    const byId = (id: string) => kinds.find((k) => k.id === id) ?? kinds[0]
    const spots = rockSpots(def.id)
    const range = roverRangeFor(terrain, ROVER_RANGE)
    const rnd = seeded(terrain.seed + 911)
    const h0 = landerYaw + Math.PI / 2
    const out: Site[] = []
    const push = (x: number, z: number, kind: RockSample, poi?: Poi) =>
      out.push({ x, z, y: meshHeight(terrain, x, z), size: 0.2 + rnd() * 0.12, rot: rnd() * Math.PI * 2, seed: Math.floor(rnd() * 1e6), kind, poi })
    const near = spots[0].kinds.map(byId)
    const n = Math.min(8, Math.max(4, near.length * 2))
    push(LANDER_POS.x - Math.sin(h0) * 14, LANDER_POS.y - Math.cos(h0) * 14, near[0])
    for (let tries = 0; out.length < n && tries < 500; tries++) {
      const x = (rnd() * 2 - 1) * (ROVER_RANGE - 8)
      const z = (rnd() * 2 - 1) * (ROVER_RANGE - 8)
      if (Math.hypot(x - LANDER_POS.x, z - LANDER_POS.y) < 14) continue
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 20)) continue
      push(x, z, near[out.length % near.length])
    }
    // 見どころ：岩の種類ごとに 1 つずつ（1 種類だけのところは 2 つ）。中心寄り（半径の 0.15〜0.55）に
    const pois = terrain.pois
    for (const spot of spots.slice(1)) {
      const p = pois.find((q) => q.id === spot.poi)
      if (!p || Math.abs(p.x) > range - 30 || Math.abs(p.z) > range - 30) continue
      const list = spot.kinds.length === 1 ? [spot.kinds[0], spot.kinds[0]] : spot.kinds
      const first = out.length
      for (let i = 0, tries = 0; i < list.length && tries < 200; tries++) {
        const a = rnd() * Math.PI * 2
        const d = p.r * (0.15 + rnd() * 0.4)
        const x = p.x + Math.cos(a) * d
        const z = p.z + Math.sin(a) * d
        if (Math.abs(x) > range - 10 || Math.abs(z) > range - 10) continue
        if (out.slice(first).some((o) => Math.hypot(o.x - x, o.z - z) < 25)) continue
        push(x, z, byId(list[i]), p)
        i++
      }
    }
    return out
  }, [terrain, def.id, landerYaw])
  const rocks = useMemo(() => {
    const beaconGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 8, 1, true)
    beaconGeo.translate(0, 0.5, 0)
    const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.0, 0.45), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    const items = sites.map((site) => {
      const geo = rockGeometry(site.seed, !!site.kind.round)
      // 地面の岩と同じ岩肌の凹凸（模様は岩の座標で貼るので、持ち上げてもずれない）。つやのある岩は凹凸を控えめに
      const gloss = site.kind.gloss ?? 0
      const mat = prepare(
        withRockDetail(new THREE.MeshStandardMaterial({ color: site.kind.color, roughness: 0.85 - gloss * 0.6, metalness: gloss * 0.3 }), {
          dust: site.kind.round ? null : new THREE.Color(def.ground),
          strength: site.kind.round ? 0.5 : 1.4 - gloss * 0.8,
          tile: 0.8,
        }),
      )
      return { geo, mat }
    })
    const chipMat = withRockDetail(new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.7 }), { tile: 0.8 })
    const chipGeo = rockGeometry(7, false)
    return { beaconGeo, beaconMat, items, chipMat, chipGeo }
  }, [sites, prepare, def.ground])
  useEffect(
    () => () => {
      rocks.beaconGeo.dispose()
      rocks.beaconMat.dispose()
      rocks.chipGeo.dispose()
      rocks.chipMat.dispose()
      for (const it of rocks.items) {
        it.geo.dispose()
        it.mat.dispose()
      }
    },
    [rocks],
  )
  const beacons = useRef<(THREE.Mesh | null)[]>([])
  const chip = useRef<THREE.Mesh>(null)
  /** この着陸で、もう採った岩（目印を消す） */
  const taken = useRef(new Set<number>())
  const lights = useRef<THREE.SpotLight>(null)
  const farLight = useRef<THREE.SpotLight>(null)
  // 地面の岩（SurfaceView の Ground と同じ並び）。走れる範囲の中のものだけ、5 m 四方のマスに分けて当たり判定に使う
  const staticBodies = useMemo(() => rockBodies(terrain), [terrain])
  /** 当たり判定の岩：広い天体ではローバーのまわりのタイルの岩 */
  const bodiesNow = () => (isWide(terrain) && wideNow.world ? wideNow.world.cells : staticBodies)
  const range = roverRangeFor(terrain, ROVER_RANGE)
  // 本物の地形を読み終えると地形が作り直され、範囲が変わることがある（走っている途中でも）
  useEffect(() => useRover.setState({ range }), [range])

  // 走りの状態。落とすたびに着陸船の真下から
  const st = useRef<Drive | null>(null)
  useEffect(() => {
    // i 番目の岩の手前（アームが届くところ）へ
    roverDebug.moveTo = (i) => {
      const d = st.current
      const site = sites[i]
      if (!d || !site) return
      Object.assign(d, { x: site.x + Math.sin(d.heading) * 1.1, z: site.z + Math.cos(d.heading) * 1.1, speed: 0, slip: 0 })
    }
    roverDebug.sites = () => sites.map(({ x, z }) => ({ x, z }))
    roverDebug.place = (x, z, heading) => {
      if (st.current) Object.assign(st.current, { x, z, y: meshHeight(terrain, x, z), vy: 0, speed: 0, slip: 0, heading: heading ?? st.current.heading })
    }
    roverDebug.rocks = () => [...bodiesNow().values()].flat().map(({ x, z, r, h }) => ({ x, z, r, h }))
    roverDebug.height = (x, z) => terrain.height(x, z)
    roverDebug.drive = () => (st.current ? { ...st.current } : null)
    // レース：スタートの列・直前の門へ置く（止まった状態で、地面の上に）
    roverCtl.place = (x, z, heading) => {
      const d = st.current
      if (!d) return
      Object.assign(d, { x, z, y: meshHeight(terrain, x, z), vy: 0, speed: 0, slip: 0, aLat: 0, heading, pitch: 0, roll: 0, grounded: true, steer: 0, sampleT: -1, sampleIdx: -1 })
      d.sway.reset()
    }
    return () => {
      roverCtl.place = undefined
      roverDebug.moveTo = undefined
      roverDebug.sites = undefined
      roverDebug.place = undefined
      roverDebug.rocks = undefined
      roverDebug.height = undefined
      roverDebug.drive = undefined
    }
  }, [sites, staticBodies, terrain])
  useEffect(() => {
    // 与圧ローバー（CrewRover.tsx）を出したときは、こちらは何もしない
    if (phase !== 'drop' || useRover.getState().vehicle !== 'orv7') return
    const x = LANDER_POS.x
    const z = LANDER_POS.y
    st.current = {
      x,
      z,
      y: meshHeight(terrain, x, z) + 1.3,
      vy: 0,
      heading: landerYaw + Math.PI / 2,
      speed: 0,
      pitch: 0,
      roll: 0,
      grounded: false,
      spin: 0,
      steer: 0,
      squash: 0,
      squashV: 0,
      arm: 1,
      still: 0,
      dropped: false,
      burst: 0,
      hudT: 0,
      sampleT: -1,
      sampleIdx: -1,
      edgeT: -9,
      bumpRock: -1,
      bumpT: 9,
      keepVy: false,
      onRock: 0,
      fuel: 1,
      thrust: 0,
      thrustSide: 0,
      thrustDown: 0,
      downHeld: false,
      slip: 0,
      aLat: 0,
      sway: new Sway(),
    }
    taken.current.clear()
    tracks.lift()
    useRover.setState({ sites: sites.map(({ x, z, poi }) => ({ x, z, poi: poi?.id })), taken: [], range })
  }, [phase, terrain, landerYaw, sites, range, tracks])

  useFrame((state, rawDt) => {
    const grp = group.current
    const s = st.current
    const { phase, since, view, vehicle } = useRover.getState()
    if (!grp) return
    grp.visible = phase !== 'none' && !!s && vehicle === 'orv7'
    if (!grp.visible || !s) {
      // 採集の岩の光の柱は、無人ローバーで走っているときだけ
      beacons.current.forEach((b) => b && (b.visible = false))
      return
    }
    const dt = Math.min(rawDt, 0.05)
    const T = roverNow() - since
    const rig = built.rig
    const fwd = PROPS.fwd.set(-Math.sin(s.heading), 0, -Math.cos(s.heading))
    const bodies = bodiesNow()

    // ---- 動き ----
    let pose: Pose
    if ((phase === 'drop' || phase === 'deploy') && roverQuick.on) {
      // レースのスタート：降ろす場面を飛ばして、展開した姿で地面に置く（このあとレースがスタートの列へ運ぶ）
      roverQuick.on = false
      s.y = meshHeight(terrain, s.x, s.z)
      s.vy = 0
      s.dropped = true
      s.grounded = true
      s.arm = 0
      pose = deployPose(1)
      setRoverPhase('drive')
    } else if (phase === 'drop' || phase === 'deploy') {
      pose = deployPose(phase === 'deploy' ? Math.min(1, T / DEPLOY_SEC) : 0)
      const ground = meshHeight(terrain, s.x, s.z)
      if (!s.dropped) {
        s.vy -= g * dt
        s.y += s.vy * dt
        if (s.y <= ground) {
          s.y = ground
          s.squashV = Math.min(1.2, -s.vy) * 0.6
          s.vy = 0
          s.dropped = true
          s.burst = 1
        }
      } else s.y = ground
      if (phase === 'drop' && s.dropped && T > 1.4) setRoverPhase('deploy')
      if (phase === 'deploy' && T >= DEPLOY_SEC) setRoverPhase('drive')
    } else {
      // 運転
      const inp = roverInput
      // レースのスタート前（3・2・1）は動けない
      const locked = roverCtl.locked
      if (locked) {
        s.speed = 0
        s.slip = 0
        inp.jump = false
      }
      const busy = s.sampleT >= 0 || locked
      // キーボード・ボタンに、マウスのハンドルと巡航を足したもの（state/rover.ts の driveInput）
      const di = driveInput(s.speed, dt)
      const steerTarget = busy ? 0 : di.steer
      s.steer += (steerTarget - s.steer) * Math.min(1, dt * 6)
      if (s.grounded) {
        // 空中で ▼ を押したまま着地したときは、離すまでブレーキにしない（下へ押す噴射のつもりで押しているので）
        if (inp.throttle >= 0) s.downHeld = false
        const th = busy || (s.downHeld && inp.throttle < 0) ? 0 : di.throttle
        if (busy) {
          s.speed *= 1 - Math.min(1, dt * 8)
          s.slip *= 1 - Math.min(1, dt * 8)
        }
        // 氷の上では車輪が空回りして、加速もブレーキも弱い
        const ice = iceGrip(def.id)
        const tq = 0.5 + 0.5 * ice
        if (th > 0) s.speed += (s.speed < 0 ? 14 * tq : 7 * tq * Math.max(0.15, 1 - s.speed / ROVER_TOP)) * dt
        else if (th < 0) s.speed -= (s.speed > 0 ? 14 * (0.35 + 0.65 * ice) : 4 * tq) * dt
        else {
          // アクセルオフ：柔らかい砂・レゴリスに車輪が沈む転がり抵抗（重力に比例）と、
          // 減速ギア付きモーターの逆回し抵抗（速さに比例）で、自然に止まる
          const v = Math.abs(s.speed)
          const decel = ROLL_BASE + soilDrag(def.id) * g + ROLL_GEAR * v
          s.speed -= Math.sign(s.speed) * Math.min(v, decel * dt)
        }
        // 坂：登りは遅く、下りは速く
        s.speed -= g * Math.sin(s.pitch) * dt * 0.6
        s.speed = THREE.MathUtils.clamp(s.speed, -6, ROVER_TOP)
        // 速いほど大回り。4 輪（前後）を逆向きに切るので、遅いときは小回りがきく
        const R = 2.6 + Math.abs(s.speed) * 0.32
        // 岩に乗り上げているあいだは車輪が浮いて、ハンドルがほとんど効かない（まっすぐ進んでしまう）。
        // 岩は、ちょっとジャンプして飛び越えるのがいちばん速い
        const grip = s.onRock > 0.05 ? 0.2 : 1
        // 横すべりが大きいほど、ハンドルが効きにくい
        const beta = Math.atan2(Math.abs(s.slip), Math.abs(s.speed) + 0.5)
        const dh = s.steer * (s.speed / R) * dt * grip * Math.max(0.35, 1 - beta / SLIDE_MAX)
        s.heading -= dh
        // 車体の向きが変わっても、進む向き（速度）はすぐには変わらない。そのぶんが横すべりになる
        const cs = Math.cos(dh)
        const sn = Math.sin(dh)
        const fw = s.speed * cs + s.slip * sn
        s.slip = s.slip * cs - s.speed * sn
        s.speed = fw
        // タイヤが横すべりを止める。止めたぶんの多くは前への速さにもどす（すべっても、あまり遅くならない）
        const v0 = Math.hypot(s.speed, s.slip)
        const stop = Math.min(Math.abs(s.slip), Math.min(latGrip(g) * (0.4 + 0.6 * grip) * ice, Math.abs(s.slip) * slipLin(g) * ice) * dt)
        s.aLat = -Math.sign(s.slip) * (stop / Math.max(dt, 1e-4))
        s.slip -= Math.sign(s.slip) * stop
        const v1 = Math.hypot(s.speed, s.slip)
        const vt = v1 + 0.75 * (v0 - v1)
        s.speed = Math.sign(s.speed) * Math.sqrt(Math.max(0, vt * vt - s.slip * s.slip))
        if (inp.jump && !busy) {
          // ぴょーん（重力の弱い星ほど高く、長く飛ぶ）
          // 右ボタンを押した長さで、小さなジャンプから大きなジャンプまで（キーとボタンはいつも 100%）
          const power = THREE.MathUtils.clamp(inp.jumpPower, 0.3, 1)
          const kick = (0.6 + 0.4 * Math.min(1, s.fuel / JUMP_FUEL)) * power
          s.vy = (3.2 + Math.abs(s.speed) * 0.08) * kick
          s.fuel = Math.max(0, s.fuel - JUMP_FUEL * power)
          s.grounded = false
          s.keepVy = true
          s.squashV = -0.4
        }
      }
      else {
        s.aLat = 0
        // 空中の姿勢制御：小さな噴射で、◀▶ は横へ動きながら向きを変え、▼ は下へ押して早く着地する。
        // 噴射剤は 1 回のジャンプで 2.5 秒ぶん。地面にいると回復する（押しっぱなしで飛び続けられない）
        // 横は終わり際に弱まり、最後のひと残り（AIR_RESERVE）は ▼ だけが使える
        const sideK = smooth01((s.fuel - AIR_RESERVE) / AIR_FADE)
        const downK = smooth01(s.fuel / 0.04)
        const side = busy ? 0 : di.steer * sideK
        // ▼ のほか、マウスだけでも降りられる（右ボタンを押し続ける・ホイールを手前に。巡航は止めない）
        const down = busy ? 0 : inp.throttle < 0 ? downK : mouseSink() * downK
        const on = s.fuel > 0 && (Math.abs(side) > 0.02 || down > 0)
        s.thrustSide = on ? side : 0
        s.thrustDown = on ? down : 0
        if (down) s.downHeld = true
        if (on) {
          s.slip += side * AIR_SIDE * dt
          // 車体だけが回る。速度（地面に対する向き）は変わらないので、そのぶんは横すべりになり、着地でタイヤが受け止める
          const dh = side * AIR_YAW * dt
          s.heading -= dh
          const cs = Math.cos(dh)
          const sn = Math.sin(dh)
          const fw = s.speed * cs + s.slip * sn
          s.slip = s.slip * cs - s.speed * sn
          s.speed = fw
          s.vy -= down * Math.max(AIR_DOWN_MIN, g * 2) * dt
          s.fuel = Math.max(0, s.fuel - (dt / AIR_FUEL_SEC) * Math.max(Math.abs(side), down))
        }
      }
      if (s.grounded) s.fuel = Math.min(1, s.fuel + dt * 0.6)
      s.thrust += ((s.thrustSide !== 0 || s.thrustDown ? 1 : 0) - s.thrust) * Math.min(1, dt * 12)
      if (s.grounded) {
        s.thrustSide = 0
        s.thrustDown = 0
      }
      inp.jump = false
      inp.jumpPower = 1
      const tanP = Math.tan(s.pitch)
      const tanR = Math.tan(s.roll)
      const prevBase = meshHeight(terrain, s.x, s.z)
      const prevLift = rockLift(bodies, terrain, s.x, s.z, s.y, fwd.x, fwd.z, tanP, tanR)
      // 進む向き：車体の前 ＋ 横すべり（右は (-fwd.z, fwd.x)）
      let nx = s.x + (fwd.x * s.speed - fwd.z * s.slip) * dt
      let nz = s.z + (fwd.z * s.speed + fwd.x * s.slip) * dt
      // 範囲の端と、着陸船の脚
      if (Math.abs(nx) > range || Math.abs(nz) > range) {
        nx = THREE.MathUtils.clamp(nx, -range, range)
        nz = THREE.MathUtils.clamp(nz, -range, range)
        s.speed *= 0.5
        s.slip *= 0.5
        s.edgeT = roverNow()
      }
      const atEdge = roverNow() - s.edgeT < 2.5
      if (atEdge !== useRover.getState().edge) useRover.setState({ edge: atEdge })
      // とても大きな岩（BIG_ROCK より高い）は走っては乗り越えられない（ぶつかって止まる）。ジャンプで岩のてっぺんより高く跳んでいれば越えられる
      for (const r of nearRocks(bodies, nx, nz)) {
        if (r.h < BIG_ROCK || s.y > r.t - 0.12 || Math.hypot(s.x - r.x, s.z - r.z) < r.r + 0.3) continue
        const dx = nx - r.x
        const dz = nz - r.z
        const d = Math.hypot(dx, dz)
        const min = r.r + 0.75
        if (d < min && d > 1e-4) {
          nx = r.x + (dx / d) * min
          nz = r.z + (dz / d) * min
          if (Math.abs(s.speed) > 3) s.burst = Math.max(s.burst, Math.min(0.6, Math.abs(s.speed) / 25))
          s.speed *= 0.3
          s.slip *= 0.3
        }
      }
      for (const f of feet) {
        const dx = nx - f.x
        const dz = nz - f.y
        const d = Math.hypot(dx, dz)
        if (d < 1.6 && d > 1e-4) {
          nx = f.x + (dx / d) * 1.6
          nz = f.y + (dz / d) * 1.6
          s.speed *= 0.7
          s.slip *= 0.7
        }
      }
      // ほかのローバー（レース）に押される
      const push = roverCtl.push
      if (push.x || push.z) {
        nx += push.x
        nz += push.z
        push.x = push.z = 0
      }
      s.x = nx
      s.z = nz
      // 地面（岩に乗り上げていれば、そのぶん持ち上がる）
      const base = meshHeight(terrain, s.x, s.z)
      const lift = rockLift(bodies, terrain, s.x, s.z, s.y, fwd.x, fwd.z, tanP, tanR)
      const ground = base + lift
      // 地面の起伏の速さ。岩に乗り上げるぶんは入れない（車輪とサスペンションが受け止めるので、岩で上に飛ばされない）
      const groundVy = (base - prevBase) / Math.max(dt, 1e-3)
      // 縦の動き：地面が落ちていく速さより遅く落ちれば宙に浮く（坂の頂上で飛び出す）
      s.vy -= g * dt
      s.y += s.vy * dt
      const wasAir = !s.grounded
      if (s.y <= ground) {
        const impact = Math.max(0, groundVy - s.vy)
        s.y = ground
        // 地面の上がる速さが車体の上への速さ以上なら、上への速さは地面が決める（岩に乗り上げるぶんは groundVy に入らないので、
        // ジャンプで上がっていく途中に岩の横にふれただけでは、ジャンプの速さのまま）
        if (Math.min(groundVy, 9) >= s.vy) s.keepVy = false
        s.vy = Math.max(s.vy, Math.min(groundVy, 9))
        if (wasAir && impact > 1.2) {
          // 着地：脚がぐっと縮んで、車体が沈む（強く落ちるほど深く）
          s.squashV = Math.min(2.2, impact * 0.26)
          s.burst = Math.min(1, impact / 5)
        }
        s.grounded = true
      } else if (!wasAir && s.vy < 1 && prevLift > lift && s.y - ground < prevLift - lift + 0.05) {
        // 岩から降りるときは、車輪が岩をなぞって下りる（岩のてっぺんから飛び出さない）
        s.y = ground
        s.vy = Math.min(s.vy, 0)
        s.grounded = true
      } else s.grounded = s.y - ground < 0.03
      // 地面から離れた瞬間：上への速さが地面の決めたものなら（keepVy でない）、速さの向き（上と水平の割合）はそのままで、
      // 大きさを離れる前の水平の速さ（前への速さと横すべり）にそろえる。坂で上へ動いていたぶんを、宙へ飛び出すときに足さない。
      // 地面の上を走っているあいだは何も変えない。向きをかえるのは、地面がまた上への速さを決めるまでに一度だけ
      if (!wasAir && !s.grounded && !s.keepVy && s.vy > 0) {
        const h = Math.hypot(s.speed, s.slip)
        const scale = h / Math.hypot(h, s.vy)
        s.speed *= scale
        s.slip *= scale
        s.vy *= scale
        s.keepVy = true
      }
      // 岩に登るぶん、少し遅くなる。乗っているあいだも、車輪が空回りして遅くなる
      if (s.grounded && lift > prevLift) s.speed *= 1 - Math.min(0.1, (lift - prevLift) * 0.3)
      s.onRock = s.grounded ? lift : 0
      if (s.onRock > 0.05 && s.speed > 4) s.speed -= Math.min(s.speed - 4, 2.2 * dt)
      // 地面の傾き（6 つの車輪の下の高さ。岩に乗っていれば、岩の上の高さ）
      const sideX = -fwd.z
      const sideZ = fwd.x
      {
        // wheelH は、いま測った rockLift の車輪の下の高さ（宙にいても、真下の地面の傾きがわかる）
        const hF = (wheelH[0] + wheelH[1]) / 2
        const hB = (wheelH[4] + wheelH[5]) / 2
        const hR = (wheelH[1] + wheelH[3] + wheelH[5]) / 3
        const hL = (wheelH[0] + wheelH[2] + wheelH[4]) / 3
        const slopeP = Math.atan2(hF - hB, 1.44)
        const slopeR = Math.atan2(hR - hL, 1.0)
        if (s.grounded) {
          const k = Math.min(1, dt * 14)
          s.pitch += (slopeP - s.pitch) * k
          s.roll += (slopeR - s.roll) * k
        } else {
          // 宙：地面のすぐ上（斜面を横切るときの小さな浮き）なら斜面の傾きのまま。高く飛んだときだけ、少しずつ水平に
          // （cratercamper さん 2026-11-13：斜面で一瞬浮くたびに水平へもどろうとして、かくっと揺れていた）
          const w = THREE.MathUtils.smoothstep(s.y - ground, 0.4, 2.5)
          const airP = Math.min(0.25, Math.max(-0.35, s.vy * 0.04))
          s.pitch += (THREE.MathUtils.lerp(slopeP, airP, w) - s.pitch) * Math.min(1, dt * THREE.MathUtils.lerp(8, 1.2, w))
          s.roll += (slopeR * (1 - w) - s.roll) * Math.min(1, dt * THREE.MathUtils.lerp(8, 1.5, w))
        }
      }
      // 小さな岩：車輪が乗り上げると、ぴょんと跳ねる（速いほど、岩が高いほど高く。でも飛び上がるほどではない）。かたむきも少し
      // 丘として登る岩（CLIMB_ROCK より高い）は、車輪が触れたときに車体が少し沈んで、ことんと揺れるだけ
      s.bumpT += dt
      if (s.grounded && Math.abs(s.speed) > 0.6) {
        hit: for (const [wf, sd] of WHEELS) {
          const wx = s.x + fwd.x * wf + sideX * sd
          const wz = s.z + fwd.z * wf + sideZ * sd
          for (const r of nearRocks(bodies, wx, wz, sites, taken.current)) {
            if (r.h >= BIG_ROCK || (r.id === s.bumpRock && s.bumpT < 0.6)) continue
            if (r.h >= CLIMB_ROCK && r.id > -10) {
              if (Math.hypot(wx - r.x, wz - r.z) > hillR(r) * 0.8) continue
              s.squashV = Math.min(s.squashV, -0.15 - 0.2 * r.h)
              s.pitch += Math.sign(wf) * Math.min(0.06, r.h * 0.06) * Math.sign(s.speed)
              s.speed *= 1 - Math.min(0.12, 0.1 * r.h)
              s.bumpRock = r.id
              s.bumpT = 0
              break hit
            }
            if (Math.hypot(wx - r.x, wz - r.z) > r.r * 0.85 + 0.08) continue
            const kick = Math.min(1.2, Math.min(0.3, r.h) * (2.2 + Math.abs(s.speed) * 0.25))
            if (kick < 0.25) continue
            s.vy = Math.max(s.vy, kick)
            s.grounded = false
            s.keepVy = true
            s.roll += sd * 2 * Math.min(0.35, r.h * 0.9) * (1 - Math.abs(wf))
            s.pitch += Math.sign(wf) * Math.min(0.3, r.h * 0.7) * Math.sign(s.speed)
            s.squashV = Math.min(s.squashV, -0.3 - r.h)
            s.bumpRock = r.id
            s.bumpT = 0
            break hit
          }
        }
      }
      s.spin -= (s.speed * dt) / WHEEL_R
      // 轍：真ん中の車輪の下に。宙に浮いているときと、岩に乗っている車輪は跡を付けない
      if (s.grounded) {
        for (const side of [0, 1] as const) {
          const sd = side === 0 ? -0.5 : 0.5
          const wx = s.x + sideX * sd
          const wz = s.z + sideZ * sd
          if (wheelH[2 + side] - meshHeight(terrain, wx, wz) > 0.06) tracks.lift(side)
          else tracks.touch(side, wx, wz)
        }
      } else tracks.lift()
      // 止まってしばらくするとアームを伸ばし、走り出すとたたむ
      s.still = Math.abs(s.speed) < 0.3 ? s.still + dt : 0
      s.arm += ((s.still > 1.5 ? 1 : 0) - s.arm) * Math.min(1, dt * (s.still > 1.5 ? 0.8 : 3))
      pose = deployPose(1)
      pose.arm = ARM_STOW.map((p, i) => p + (ARM_WORK[i] - p) * s.arm)

      // ---- 採集：アームの先が届く岩を探す。E／ボタンで採集 ----
      const reachX = s.x + fwd.x * 1.1 + sideX * 0.2
      const reachZ = s.z + fwd.z * 1.1 + sideZ * 0.2
      let near = -1
      // 岩の近く（アームの先から 3.9 m 以内）でゆっくり走っていれば採集できる。足りないぶんは採集の始めに寄っていく
      let nearD = 3.9
      let next = -1
      let nextD = Infinity
      for (let i = 0; i < sites.length; i++) {
        if (taken.current.has(i)) continue
        const st2 = sites[i]
        const d = Math.hypot(st2.x - s.x, st2.z - s.z)
        if (d < nextD) {
          nextD = d
          next = i
        }
        const r = Math.hypot(st2.x - reachX, st2.z - reachZ)
        if (r < nearD && s.grounded && Math.abs(s.speed) < 2.5) {
          nearD = r
          near = i
        }
      }
      if (inp.sample && near >= 0 && !busy) {
        s.sampleT = 0
        s.sampleIdx = near
        s.still = 0
      }
      inp.sample = false
      if (s.sampleT >= 0) {
        s.sampleT += dt
        const site = sites[s.sampleIdx]
        // アームの届くところまで、そっと寄る
        if (s.sampleT < REACH) {
          const k = Math.min(1, dt * 4)
          const ex = site.x - (s.x + fwd.x * 1.1 + sideX * 0.2)
          const ez = site.z - (s.z + fwd.z * 1.1 + sideZ * 0.2)
          s.x += ex * k
          s.z += ez * k
          s.y = Math.max(s.y, meshHeight(terrain, s.x, s.z))
        }
        // 岩の向き（ローバーの正面から右回り）に、肩を回す
        const dx = site.x - (s.x + sideX * 0.22)
        const dz = site.z - (s.z + sideZ * 0.22)
        const rel = Math.atan2(dx * sideX + dz * sideZ, dx * fwd.x + dz * fwd.z)
        const reach = [THREE.MathUtils.clamp(rel, -50 * D, 60 * D), ...ARM_REACH.slice(1)]
        const w = s.sampleT < REACH ? ease(0, REACH, s.sampleT) : s.sampleT < GRIP ? 1 : 1 - ease(GRIP, DONE, s.sampleT)
        pose.arm = pose.arm.map((p, i) => p + (reach[i] - p) * w)
        if (s.sampleT >= DONE) {
          taken.current.add(s.sampleIdx)
          useRover.setState({ taken: [...taken.current] })
          // 採った岩は、このフレームの「近い岩」「次の岩」から外す（次の岩は、計器を次に書き換えるときに選び直す）
          near = -1
          if (next === s.sampleIdx) next = -1
          useSampleLog.getState().add(def.id, site.kind.id)
          campaignSample(def.id)
          useRover.setState({ result: site.kind.id })
          s.sampleT = -1
          s.sampleIdx = -1
        }
      }
      if (useRover.getState().canSample !== (near >= 0 && s.sampleT < 0) || useRover.getState().sampling !== s.sampleT >= 0)
        useRover.setState({ canSample: near >= 0 && s.sampleT < 0, sampling: s.sampleT >= 0 })
      // 砂ぼこり：走っている車輪から（速いほど多く、後ろへ）
      if (s.grounded && def.dust && Math.abs(s.speed) > 1) {
        const k = Math.min(1, Math.abs(s.speed) / ROVER_TOP)
        const n = Math.floor(dt * (level === 'low' ? 40 : 90) * k + Math.random())
        for (let i = 0; i < n; i++) {
          const side = Math.random() < 0.5 ? 1 : -1
          const back = Math.random() < 0.5 ? -0.72 : 0
          const px = s.x + sideX * 0.5 * side + fwd.x * back
          const pz = s.z + sideZ * 0.5 * side + fwd.z * back
          dust.puff(px, ground, pz, -fwd.x * s.speed * 0.25, 0.6 + k * 1.6, -fwd.z * s.speed * 0.25, 0.35 + k * 0.6)
        }
      }
      // 横すべりの砂ぼこり：すべっていく側の車輪から、横へ巻き上げる
      if (s.grounded && def.dust && Math.abs(s.slip) > 1.2) {
        const k = Math.min(1, (Math.abs(s.slip) - 1.2) / 4)
        const out = Math.sign(s.slip)
        const n = Math.floor(dt * (level === 'low' ? 30 : 80) * k + Math.random() * k)
        for (let i = 0; i < n; i++) {
          const wf = [0.72, 0, -0.72][Math.floor(Math.random() * 3)]
          const px = s.x + sideX * 0.55 * out + fwd.x * wf
          const pz = s.z + sideZ * 0.55 * out + fwd.z * wf
          const sv = s.slip * (0.5 + Math.random() * 0.5)
          dust.puff(px, ground, pz, sideX * sv - fwd.x * s.speed * 0.15, 0.5 + k * 1.4, sideZ * sv - fwd.z * s.speed * 0.15, 0.45 + k * 0.7)
        }
      }
      // 計器：1 秒に 12 回だけ書き換える
      s.hudT += dt
      if (s.hudT > 1 / 12) {
        s.hudT = 0
        const deg = (v: number) => Math.round((v * 180) / Math.PI)
        useRover.setState({
          kmh: Math.round(Math.abs(s.speed) * 3.6),
          hud: {
            hdg: ((Math.round((-s.heading * 180) / Math.PI) % 360) + 360) % 360,
            pitch: deg(s.pitch),
            roll: deg(s.roll),
            dist: Math.round(Math.hypot(s.x - LANDER_POS.x, s.z - LANDER_POS.y)),
            air: !s.grounded,
            fuel: Math.round(s.fuel * 20) / 20,
            x: Math.round(s.x * 10) / 10,
            z: Math.round(s.z * 10) / 10,
          },
          next:
            next >= 0
              ? {
                  dist: Math.round(nextD),
                  where: sites[next].poi?.id ?? null,
                  rel: Math.round(
                    (Math.atan2((sites[next].x - s.x) * sideX + (sites[next].z - s.z) * sideZ, (sites[next].x - s.x) * fwd.x + (sites[next].z - s.z) * fwd.z) * 180) / Math.PI,
                  ),
                }
              : null,
        })
      }
    }
    // 着地の砂ぼこり
    if (s.burst > 0 && def.dust) {
      const n = Math.round(30 * s.burst)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const v = 1.5 + Math.random() * 2.5
        dust.puff(s.x + Math.cos(a) * 0.6, s.y, s.z + Math.sin(a) * 0.6, Math.cos(a) * v, 0.5 + Math.random(), Math.sin(a) * v, 0.6)
      }
      s.burst = 0
    }
    // サスペンションのばね（沈み込み → もどる）。宙では車輪の重さで脚が伸びきる
    const sag = phase === 'drive' && !s.grounded ? -0.045 : 0
    s.squashV += (-(s.squash - sag) * 160 - s.squashV * 14) * dt
    s.squash += s.squashV * dt
    s.squash = THREE.MathUtils.clamp(s.squash, -0.06, 0.15)
    // 車体の傾き：曲がると外へ、加速で後ろへ、ブレーキで前へ。岩や着地では遅れてゆれる
    if (phase === 'drive') s.sway.step(dt, s.speed, s.aLat, s.pitch, s.roll, s.grounded)
    else s.sway.reset()

    applyPose(rig, pose, s.squash, s.sway.pitch, s.sway.roll)
    built.rcs.group.visible = phase === 'drive'
    if (phase === 'drive') built.rcs.update(s.fuel, !s.grounded, s.thrust, roverNow(), dt)
    grp.position.set(s.x, s.y, s.z)
    grp.rotation.set(s.pitch, s.heading, s.roll, 'YXZ')
    for (const k of Object.keys(rig.wheels)) {
      const w = rig.wheels[k]
      w.rotation.x = s.spin
      w.rotation.y = k[0] === 'F' ? -s.steer * 0.35 : k[0] === 'R' ? s.steer * 0.35 : 0
    }
    roverFocus.set(s.x, s.y, s.z)
    Object.assign(roverPose, { x: s.x, y: s.y, z: s.z, heading: s.heading, speed: s.speed, slip: s.slip, grounded: s.grounded, pitch: s.pitch, roll: s.roll })
    const paint = built.paint
    paint.uPaintOn.value = roverCtl.paint ? 1 : 0
    if (roverCtl.paint) paint.uPaint.value.set(roverCtl.paint)

    // ---- 採集の小さなかけら：岩 → アームの先 → 車体の上の取り入れ口 ----
    const c = chip.current
    if (c) {
      c.visible = s.sampleT >= REACH * 0.9 && s.sampleT < DONE
      if (c.visible) {
        const site = sites[s.sampleIdx]
        built.model.updateMatrixWorld(true)
        const hand = rig.arm[3].localToWorld(PROPS.tmp.set(0, 0, -0.17))
        if (s.sampleT < GRIP) {
          const u = ease(REACH * 0.9, GRIP, s.sampleT)
          c.position.set(site.x, site.y + site.size * 0.8, site.z).lerp(hand, u)
        } else c.position.copy(hand)
        c.scale.setScalar(0.045 * (1 - ease(DONE - 0.25, DONE, s.sampleT)))
        ;(c.material as THREE.MeshStandardMaterial).color.set(site.kind.color)
      }
    }
    const tm = roverNow()
    beacons.current.forEach((b, i) => {
      if (!b) return
      b.visible = !taken.current.has(i) && phase === 'drive'
      if (!b.visible) return
      const d = Math.hypot(sites[i].x - s.x, sites[i].z - s.z)
      // 遠くからも見えるよう、遠いほど太く高く。近づくと薄く
      const k = THREE.MathUtils.clamp(d / 25, 0.6, 30)
      b.scale.set(k, 5 + k * (k > 3 ? 6 : 4), k)
      rocks.beaconMat.opacity = 0.22 + 0.12 * Math.sin(tm * 3)
    })

    // ---- ライト（夜は前照灯で地面を照らす） ----
    // 近くを広く照らす灯と、遠くまで届く細い灯の 2 つ
    const sp = lights.current
    const far = farLight.current
    // 遠くの地面は光が浅くあたって暗くなるので、遠くを照らす灯は距離で弱めず（decay 0）、マストの高さから
    for (const [l, power, aimZ, hy] of [
      [sp, 90, -8, 0.62],
      [far, 80, -70, 1.25],
    ] as const) {
      if (!l) continue
      l.intensity = sky.night * power
      l.visible = sky.night > 0.01
      PROPS.tmp.set(0, hy, -0.75)
      grp.localToWorld(l.position.copy(PROPS.tmp))
      grp.localToWorld(l.target.position.set(0, -0.6, aimZ))
      l.target.updateMatrixWorld()
    }

    // ---- 砂ぼこりの色と大きさ ----
    const cam = state.camera as THREE.PerspectiveCamera
    dust.material.uniforms.uScale.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360))
    dust.update(dt)
    gas.material.uniforms.uScale.value = dust.material.uniforms.uScale.value
    // 噴射のガス：横へ動くときは反対の横から、下へ押すときは車体の上から噴き出す
    if (s.thrust > 0.05) {
      const n = Math.floor(dt * 60 * s.thrust + Math.random())
      const sx = -fwd.z
      const sz = fwd.x
      for (let i = 0; i < n; i++) {
        const j = () => (Math.random() - 0.5) * 0.6
        if (s.thrustSide) {
          const k = -s.thrustSide
          gas.puff(s.x + sx * k * 0.75, s.y + 0.7, s.z + sz * k * 0.75, sx * k * 6 + j(), j(), sz * k * 6 + j(), 0.25)
        }
        if (s.thrustDown) gas.puff(s.x + j(), s.y + 1.1, s.z + j(), j() * 2, 6, j() * 2, 0.3)
      }
    }
    gas.update(dt)
    tracks.update(dt, sky.sunDir)
    const lit = Math.max(0.15, Math.min(1, sky.sunDir.y * 3 + 0.2))
    dust.material.uniforms.uColor.value.copy(dustBase).multiplyScalar(lit * 0.95)
    dust.material.uniforms.uShadow.value.copy(dustBase).multiplyScalar(lit * 0.4 + 0.04)
    dust.material.uniforms.uSunView.value.copy(sky.sunDir).transformDirection(cam.matrixWorldInverse)
    gas.material.uniforms.uColor.value.setRGB(0.9, 0.93, 0.97).multiplyScalar(lit)
    gas.material.uniforms.uShadow.value.setRGB(0.5, 0.53, 0.58).multiplyScalar(lit)
    gas.material.uniforms.uSunView.value.copy(dust.material.uniforms.uSunView.value)

    // ---- カメラ ----
    const lphase = useLanding.getState().phase
    if (lphase !== 'surface') return
    const dc = roverDebug.cam
    if (dc) {
      // 確認用：ローバーから見た位置（前・右・上、m）にカメラを置いて、ローバーの少し上を見る
      const sx = -fwd.z
      const sz = fwd.x
      cam.position.set(s.x + fwd.x * dc[0] + sx * dc[1], s.y + dc[2], s.z + fwd.z * dc[0] + sz * dc[1])
      cam.lookAt(s.x + fwd.x * 0.2, s.y + dc[3], s.z + fwd.z * 0.2)
      if (cam.fov !== 40) {
        cam.fov = 40
        cam.updateProjectionMatrix()
      }
      return
    }
    const camPos = PROPS.cam
    const look = PROPS.look
    const k = 1 - Math.exp(-dt * 5)
    if (phase === 'drive' && view === 'cam') {
      // マストのカメラから（頭は隠す）
      rig.head.visible = false
      rig.head.getWorldPosition(camPos)
      rig.head.getWorldQuaternion(PROPS.q)
      cam.position.copy(camPos).add(PROPS.tmp.set(0, 0.03, -0.08).applyQuaternion(PROPS.q))
      cam.quaternion.copy(PROPS.q)
      if (cam.fov !== 72) {
        cam.fov = 72
        cam.updateProjectionMatrix()
      }
      return
    }
    rig.head.visible = true
    if (phase === 'drive' && s.sampleT >= 0) {
      // 採集中：右ななめ前から、アームが岩を拾うところを見せる
      const sx = -fwd.z
      const sz = fwd.x
      camPos.set(s.x + fwd.x * 2.4 + sx * 2.3, s.y + 1.25, s.z + fwd.z * 2.4 + sz * 2.3)
      look.set(s.x + fwd.x * 0.9 + sx * 0.2, s.y + 0.35, s.z + fwd.z * 0.9 + sz * 0.2)
    } else if (phase === 'drive') {
      // 後ろから追う。速いほど少し引いて低く
      const v = Math.min(1, Math.abs(s.speed) / ROVER_TOP)
      const back = 5.2 + v * 2.2
      camPos.set(s.x - fwd.x * back, s.y + 2.1 - v * 0.4, s.z - fwd.z * back)
      look.set(s.x + fwd.x * 2, s.y + 0.9, s.z + fwd.z * 2)
    } else {
      // 落下と展開：着陸船の腹の下を、外（ローバーの前のななめ）から見る。展開中はゆっくり寄る
      const a = s.heading + 0.45 - (phase === 'deploy' ? Math.min(1, T / DEPLOY_SEC) * 0.35 : 0)
      const dist = phase === 'deploy' ? 8 - Math.min(1, T / DEPLOY_SEC) * 2.5 : 8
      camPos.set(s.x - Math.sin(a) * dist, s.y + 1.3, s.z - Math.cos(a) * dist)
      look.set(s.x, s.y + 0.6, s.z)
    }
    const minY = meshHeight(terrain, camPos.x, camPos.z) + 0.6
    if (camPos.y < minY) camPos.y = minY
    const first = (cam.userData.roverCam ?? 0) < roverNow() - 0.5
    cam.userData.roverCam = roverNow()
    if (first) cam.position.copy(camPos)
    else cam.position.lerp(camPos, k)
    cam.lookAt(look)
    const fov = phase === 'drive' ? 58 + Math.min(1, Math.abs(s.speed) / ROVER_TOP) * 8 : 50
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * k
      cam.updateProjectionMatrix()
    }
  })

  return (
    <>
      <group ref={group} visible={false} name="surface-rover">
        <primitive object={built.model} />
      </group>
      <spotLight ref={lights} color="#fff1dc" angle={0.75} penumbra={0.6} distance={45} decay={1.6} intensity={0} />
      <spotLight ref={farLight} color="#f4f6ff" angle={0.34} penumbra={0.5} distance={150} decay={0} intensity={0} />
      <primitive object={tracks.mesh} />
      <primitive object={dust.points} />
      <primitive object={gas.points} />
      {sites.map((site, i) => (
        <group key={i} position={[site.x, site.y, site.z]}>
          <mesh geometry={rocks.items[i].geo} material={rocks.items[i].mat} scale={[site.size, site.size * 0.7, site.size * 0.9]} rotation={[0, site.rot, 0]} castShadow receiveShadow />
          <mesh
            ref={(el) => {
              beacons.current[i] = el
            }}
            geometry={rocks.beaconGeo}
            material={rocks.beaconMat}
            renderOrder={3}
            frustumCulled={false}
          />
        </group>
      ))}
      <mesh ref={chip} geometry={rocks.chipGeo} material={rocks.chipMat} visible={false} castShadow />
    </>
  )
}

