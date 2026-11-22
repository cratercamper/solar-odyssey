// 峡谷レースのゴースト：前に走った記録を、半透明のローバーとしていっしょに走らせる。
// ここは記録・再生・保存だけ（three.js も React も使わない）。描くのは components/surface/RallyGhost.tsx。
//
// 時計：レースの時刻 = state/rally.ts の rallyClock.t（走り出してから、ゲームが進めた時間）。
// Rally.tsx のタイマーと同じ時計なので、遅いパソコン（20 fps 未満）でもずれない。記録のタイムは、レースの結果そのもの。

/** 1 秒あたりの記録の数（レースの時刻で） */
export const GHOST_HZ = 10
/** 1 つの記録の数：x, y, z（m）、向き・縦の傾き・横の傾き（ラジアン） */
export const GHOST_STRIDE = 6
/**
 * となりの記録がこれより離れていたら、走ったのではなく移動（R で直前の門へ・スタートの列）。
 * 再生では間をつながずに跳ぶ。最高速 16.7 m/s でも 0.1 秒で 2 m 未満しか進まない
 */
const TELEPORT_M = 8

export type GhostPose = { x: number; y: number; z: number; heading: number; pitch: number; roll: number }

/**
 * 1 回の走り。記録 k はレースの時刻 k / hz（最後の 1 つをのぞく）。最後の記録はゴールの瞬間（time）なので、
 * 再生はちょうど走りが終わった所で終わる
 */
export type GhostRun = {
  time: number
  hz: number
  data: Float32Array
  /** その走りの結果の日時（state/rallyHiscore.ts の RallyResult.at）。ハイスコア表の行と同じ走りかを見る */
  at?: number
}

export const ghostSamples = (run: GhostRun) => run.data.length / GHOST_STRIDE

const sampleTime = (run: GhostRun, k: number) => (k === ghostSamples(run) - 1 ? run.time : k / run.hz)

/** a から b への、いちばん近い回り方（ラジアン、符号つき） */
const angleDiff = (a: number, b: number) => {
  const d = (b - a) % (2 * Math.PI)
  return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d
}

function put(out: number[], p: GhostPose) {
  out.push(p.x, p.y, p.z, p.heading, p.pitch, p.roll)
}

function lerpPose(a: GhostPose, b: GhostPose, f: number, out: GhostPose) {
  out.x = a.x + (b.x - a.x) * f
  out.y = a.y + (b.y - a.y) * f
  out.z = a.z + (b.z - a.z) * f
  out.heading = a.heading + angleDiff(a.heading, b.heading) * f
  out.pitch = a.pitch + (b.pitch - a.pitch) * f
  out.roll = a.roll + (b.roll - a.roll) * f
  return out
}

const far = (a: GhostPose, b: GhostPose) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > TELEPORT_M

/**
 * ちょうど k / hz の時刻の姿を記録する。フレームの時刻はばらばらなので、その前と後のフレームの間で
 * 補間する（移動をはさむときは後のフレームの姿）
 */
export class GhostRecorder {
  private out: number[] = []
  private next = 0
  private prevT = 0
  private prev: GhostPose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 }
  private tmp: GhostPose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 }
  private started = false

  readonly hz: number
  constructor(hz = GHOST_HZ) {
    this.hz = hz
  }

  /** スタート前（3・2・1）：スタートの列に並んだ姿。これが時刻 0 の記録になる */
  hold(p: GhostPose) {
    this.out.length = 0
    this.next = 0
    this.prevT = 0
    Object.assign(this.prev, p)
    this.started = true
  }

  /** レースの時刻 t（秒、前のフレーム以上）のフレームで、ローバーは p */
  frame(t: number, p: GhostPose) {
    if (!this.started) throw new Error('GhostRecorder.frame before hold()')
    if (!(t >= this.prevT)) throw new Error(`GhostRecorder.frame: time went back (${t} < ${this.prevT})`)
    const jump = far(this.prev, p)
    while (this.next / this.hz <= t) {
      const ts = this.next / this.hz
      if (jump || t === this.prevT) put(this.out, ts <= this.prevT ? this.prev : p)
      else put(this.out, lerpPose(this.prev, p, (ts - this.prevT) / (t - this.prevT), this.tmp))
      this.next++
    }
    this.prevT = t
    Object.assign(this.prev, p)
  }

  /** レースの時刻 time にゴール、そのときローバーは p */
  finish(time: number, p: GhostPose): GhostRun {
    this.frame(time, p)
    // 最後の記録はゴールそのもの。同じ瞬間に重なった k / hz の記録は捨てる
    if (this.next > 0 && (this.next - 1) / this.hz === time) this.out.length -= GHOST_STRIDE
    put(this.out, p)
    const run: GhostRun = { time, hz: this.hz, data: Float32Array.from(this.out) }
    this.started = false
    return run
  }
}

const scratchA: GhostPose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 }
const scratchB: GhostPose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 }

/** レースの時刻 t のゴーストの姿（スタートより前はスタート、ゴールより後はゴールの姿） */
export function ghostAt(run: GhostRun, t: number, out: GhostPose): GhostPose {
  const n = ghostSamples(run)
  if (n === 0) throw new Error('ghostAt: empty run')
  const d = run.data
  const read = (k: number, o: GhostPose) => {
    const i = k * GHOST_STRIDE
    o.x = d[i]
    o.y = d[i + 1]
    o.z = d[i + 2]
    o.heading = d[i + 3]
    o.pitch = d[i + 4]
    o.roll = d[i + 5]
    return o
  }
  if (n === 1 || t <= 0) return read(0, out)
  if (t >= run.time) return read(n - 1, out)
  const k = Math.min(Math.floor(t * run.hz), n - 2)
  const a = read(k, scratchA)
  const b = read(k + 1, scratchB)
  if (far(a, b)) return read(t - sampleTime(run, k) < sampleTime(run, k + 1) - t ? k : k + 1, out)
  return lerpPose(a, b, (t - sampleTime(run, k)) / (sampleTime(run, k + 1) - sampleTime(run, k)), out)
}

// ---- 保存：自分のいちばん速い走りを 1 つ、このブラウザに ----

/** コースを線で見分ける。コースが変わったら、前のコースのゴーストは線から外れて走るので使わない */
export function coursePrint(line: [number, number][]) {
  let len = 0
  for (let i = 1; i < line.length; i++) len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
  return `${line.length}:${len.toFixed(1)}`
}

import { saveData } from './save'

const VERSION = 1
/** 自分のベストのゴーストを残す名前（レース場ごと。キーは TRACKS の名前） */
export const ghostKey = (track: string) => `rally-ghost:${track}`

type Stored = { v: number; course: string; time: number; hz: number; b64: string; at?: number }

/** Float32Array の中身を base64 に（記録 1 つで 24 バイト、70 秒の走りで約 22 KB） */
export function packSamples(data: Float32Array) {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export function unpackSamples(b64: string) {
  const bin = atob(b64)
  if (bin.length % (4 * GHOST_STRIDE) !== 0) throw new Error(`ghost data is ${bin.length} bytes, not whole samples`)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}

export function encodeGhost(run: GhostRun, course: string): string {
  const s: Stored = { v: VERSION, course, time: run.time, hz: run.hz, b64: packSamples(run.data) }
  if (run.at !== undefined) s.at = run.at
  return JSON.stringify(s)
}

/** 保存した走り。無い・別のコースのものなら null。読めない形なら投げる（呼ぶ側が捨てる） */
export function decodeGhost(text: string, course: string): GhostRun | null {
  const s = JSON.parse(text) as Stored
  if (s.v !== VERSION) throw new Error(`stored ghost has format v${s.v}, this build reads v${VERSION}`)
  if (s.course !== course) return null
  const run: GhostRun = { time: s.time, hz: s.hz, data: unpackSamples(s.b64) }
  if (s.at !== undefined) run.at = s.at
  if (!(run.time > 0) || ghostSamples(run) < 1) throw new Error(`stored ghost is empty (time ${s.time})`)
  return run
}

export function loadGhost(track: string, course: string): GhostRun | null {
  try {
    const text = saveData.get(ghostKey(track))
    return text === null ? null : decodeGhost(text, course)
  } catch (e) {
    console.warn(`rally ghost (${track}): stored run not used (${(e as Error).message})`)
    return null
  }
}

export function saveGhost(run: GhostRun, track: string, course: string) {
  try {
    saveData.set(ghostKey(track), encodeGhost(run, course))
  } catch {
    // 保存できなくても遊べる
  }
}
