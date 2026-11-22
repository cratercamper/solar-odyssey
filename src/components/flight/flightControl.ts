import * as THREE from 'three'

// 着陸船の空の操縦（ゲームらしい、やさしい操縦）。球の上を飛ぶ：位置 p（月の中心から、m）、進む向き fwd（地面に平行）、
// 機首の上げ下げ pitch（地平からの角度）、速さ speed。高く上がるほど速く飛べる（一周を数分で）。
// 地面より下には行けない（ふわっと押し上げる）。ほかの場面（月への着陸の追体験など）でも使えるよう、描画とは分けてある。

export type FlightInput = {
  /** -1〜1：右が + */
  turn: number
  /** -1〜1：機首上げが + */
  pitch: number
  /** 速さの段（0〜SPEEDS.length - 1） */
  gear: number
}

/** 速さの段：その高さで出せる最高の速さに対する割合 */
export const SPEEDS = [0.04, 0.1, 0.2, 0.35, 0.5, 0.7, 0.85, 1]

/** 地面からいちばん低く飛べる高さ（m） */
export const FLOOR = 18
/** いちばん高く上がれる高さ（m） */
export const CEILING = 2_500_000

/** その高さで出せる最高の速さ（m/s）。地面すれすれで 240 m/s、高さ 50 km より上で 50 km/s（月を 4 分ほどで一周） */
export function topSpeed(alt: number) {
  return THREE.MathUtils.clamp(240 + alt * 1.0, 240, 50_000)
}

const TURN_RATE = 0.9 // rad/s（遅いとき）
const PITCH_RATE = 0.8
const MAX_PITCH = 1.1

export class FlightCtl {
  p = new THREE.Vector3()
  fwd = new THREE.Vector3()
  up = new THREE.Vector3()
  pitch = 0
  speed = 0
  /** 機体の傾き（曲がるときに傾ける、見た目だけ） */
  bank = 0
  /** 今の地面からの高さ（step のたびに書き換える） */
  alt = 0

  constructor(
    /** 半径（m） */
    readonly radius: number,
  ) {}

  /** 位置と向きを決める（dir：月の中心から見た向き、heading：fwd の向き。地面に平行にそろえる） */
  place(dir: THREE.Vector3, height: number, heading: THREE.Vector3, speed = 0) {
    this.up.copy(dir).normalize()
    this.p.copy(this.up).multiplyScalar(this.radius + height)
    this.fwd.copy(heading).addScaledVector(this.up, -heading.dot(this.up)).normalize()
    this.pitch = 0
    this.speed = speed
    this.bank = 0
  }

  /** 進む向き（機首の向き。fwd を pitch だけ上げたもの） */
  velocityDir(out = new THREE.Vector3()) {
    return out.copy(this.fwd).multiplyScalar(Math.cos(this.pitch)).addScaledVector(this.up, Math.sin(this.pitch))
  }

  /** dt 秒すすめる。ground：その向きの地面の高さ（m、球から） */
  step(dt: number, input: FlightInput, ground: (dir: THREE.Vector3) => number) {
    dt = Math.min(dt, 0.1)
    const groundH = ground(this.up)
    this.alt = this.p.length() - this.radius - groundH
    // 速さ：段の割合 × その高さの最高。ゆっくり近づける（速いほど、変わるのに時間がかかる）
    const target = SPEEDS[THREE.MathUtils.clamp(Math.round(input.gear), 0, SPEEDS.length - 1)] * topSpeed(Math.max(0, this.alt))
    const k = 1 - Math.exp(-dt * (target > this.speed ? 0.9 : 1.6))
    this.speed += (target - this.speed) * k
    // 曲がる：速いほどゆるく（目で追える回り方に）
    const turnRate = TURN_RATE / (1 + this.speed / 2500)
    const turn = input.turn * turnRate * dt
    if (turn) this.fwd.applyAxisAngle(this.up, -turn)
    this.bank += (THREE.MathUtils.clamp(input.turn, -1, 1) * 0.6 - this.bank) * Math.min(1, dt * 3)
    // 機首：押しているあいだ上げ下げ。離すとゆっくり水平へ戻る
    if (input.pitch) this.pitch += input.pitch * PITCH_RATE * dt
    else this.pitch *= Math.exp(-dt * 0.8)
    this.pitch = THREE.MathUtils.clamp(this.pitch, -MAX_PITCH, MAX_PITCH)
    // 地面が近いのに下を向いていたら、機首を起こす
    if (this.alt < FLOOR * 3 && this.pitch < 0) this.pitch *= Math.max(0, (this.alt - FLOOR) / (FLOOR * 2))
    // 進む：地面に平行な分と、上下の分
    const v = this.velocityDir(_v).multiplyScalar(this.speed * dt)
    this.p.add(v)
    // 新しい場所の「上」に合わせて、進む向きを地面に平行に（球を回っても向きがずれない）
    this.up.copy(this.p).normalize()
    this.fwd.addScaledVector(this.up, -this.fwd.dot(this.up)).normalize()
    // 高さの上下限
    const r = this.p.length()
    const g = ground(this.up)
    const minR = this.radius + g + FLOOR
    if (r < minR) {
      this.p.setLength(minR)
      if (this.pitch < 0) this.pitch = 0
    } else if (r > this.radius + CEILING) {
      this.p.setLength(this.radius + CEILING)
      if (this.pitch > 0) this.pitch = 0
    }
    this.alt = this.p.length() - this.radius - g
  }
}
const _v = new THREE.Vector3()

/**
 * 一周のはかり方：始めたときの進む向きで決まる大円（axis = 上 × 進む向き）のまわりに、何度回ったか。
 * 大円から外れて飛んだ分は数えない（逆向きに飛ぶと減る）
 */
export class LapMeter {
  axis = new THREE.Vector3()
  prev = new THREE.Vector3()
  /** 回った角度（ラジアン） */
  angle = 0

  start(p: THREE.Vector3, fwd: THREE.Vector3) {
    this.prev.copy(p).normalize()
    this.axis.crossVectors(this.prev, fwd).normalize()
    this.angle = 0
  }

  /** 位置が変わった：回った角度を足す */
  update(p: THREE.Vector3) {
    const cur = _c.copy(p).normalize()
    // 大円の面に映した、前の点から今の点までの角度
    const a = _a.copy(this.prev).addScaledVector(this.axis, -this.prev.dot(this.axis))
    const b = _b.copy(cur).addScaledVector(this.axis, -cur.dot(this.axis))
    if (a.lengthSq() > 1e-12 && b.lengthSq() > 1e-12) {
      const cross = _x.crossVectors(a, b).dot(this.axis)
      this.angle += Math.atan2(cross, a.dot(b))
    }
    this.prev.copy(cur)
  }

  /** 一周の向き（今いる場所での、大円に沿った進む向き） */
  along(up: THREE.Vector3, out = new THREE.Vector3()) {
    return out.crossVectors(this.axis, up).normalize()
  }
}
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _x = new THREE.Vector3()
