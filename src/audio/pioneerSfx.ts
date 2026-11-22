import { audio, output, volume } from './sfx'
import type { Resource } from '../data/pioneer'

// 開拓の効果音（Web Audio で作る。録音した音は使わない）。音の大きさは設定に従う
// - 拾う：資源ごとの高さの短い「ポン」。続けて拾うと少しずつ高くなる
// - いっぱい：低い 2 音
// - ガス：雲をかすめているあいだの、やわらかい風の音
// - 納品：上がっていく 4 音のチャイム
// - いまやることが変わった：小さな 2 音
// - 改造：カチッと組む音と、段の数だけ上がる音
// - 珍しい岩：きらきら上がる音。今日の依頼：短いファンファーレ

let master: GainNode | null = null
function out(c: AudioContext) {
  if (!master) {
    master = c.createGain()
    master.connect(output(c))
  }
  master.gain.value = volume()
  return master
}

function tone(c: AudioContext, freq: number, at: number, seconds: number, peak: number, type: OscillatorType = 'sine') {
  const osc = c.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
  osc.connect(g).connect(out(c))
  osc.start(at)
  osc.stop(at + seconds + 0.02)
}

const BASE: Record<Resource, number> = { metal: 523.25, ice: 698.46, gas: 440 }
let streak = 0
let lastPickup = 0

/** 資源を拾った */
export function playPickup(resource: Resource) {
  const c = audio()
  if (!c || volume() === 0) return
  const now = c.currentTime
  if (now - lastPickup < 0.06) return // 同じ瞬間にいくつも拾っても 1 回
  streak = now - lastPickup < 1.2 ? Math.min(streak + 1, 7) : 0
  lastPickup = now
  const f = BASE[resource] * 2 ** (([0, 2, 4, 5, 7, 9, 11, 12][streak] ?? 12) / 12)
  tone(c, f, now, 0.16, 0.09, 'triangle')
  tone(c, f * 2, now, 0.08, 0.03)
}

/** 積み荷がいっぱい */
export function playFull() {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  tone(c, 330, now, 0.18, 0.1, 'square')
  tone(c, 247, now + 0.2, 0.26, 0.1, 'square')
}

/** 納品のチャイム */
export function playDeliver() {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    tone(c, f, now + i * 0.11, 0.6, 0.08, 'triangle')
    tone(c, f * 3, now + i * 0.11, 0.25, 0.015)
  })
}

/** 船を改造した：機械が組み上がる「カチッ」と、段の数だけ上がる音 */
export function playUpgrade(level: number) {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  tone(c, 180, now, 0.08, 0.08, 'square')
  tone(c, 120, now + 0.06, 0.1, 0.06, 'square')
  for (let i = 0; i < level; i++) tone(c, 659.25 * 2 ** ((i * 4) / 12), now + 0.16 + i * 0.09, 0.35, 0.07, 'triangle')
}

/** 珍しい岩：きらきら上がっていく音 */
export function playRare() {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  ;[1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => tone(c, f, now + i * 0.06, 0.5, 0.05, 'sine'))
  tone(c, 523.25, now, 0.9, 0.06, 'triangle')
}

/** 今日の依頼を果たした：短いファンファーレ */
export function playDaily() {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  ;[
    [523.25, 0],
    [523.25, 0.12],
    [783.99, 0.24],
    [1046.5, 0.42],
  ].forEach(([f, at]) => tone(c, f, now + at, 0.5, 0.08, 'triangle'))
}

/** いまやることが変わった */
export function playGoal() {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  tone(c, 880, now, 0.14, 0.05)
  tone(c, 1318.5, now + 0.09, 0.2, 0.05)
}

/** ガスの風の音（集めているあいだ）。stop で止める */
/** 風の音のもとになる雑音。一度作れば使い回す */
let noise: AudioBuffer | null = null
function noiseBuffer(c: AudioContext) {
  if (noise && noise.sampleRate === c.sampleRate) return noise
  noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return noise
}

export function startGasWind() {
  const c = audio()
  if (!c) return null
  const now = c.currentTime
  const buffer = noiseBuffer(c)
  const src = c.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 700
  band.Q.value = 0.8
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.05, now + 0.5)
  src.connect(band).connect(g).connect(out(c))
  src.start(now)
  return {
    stop() {
      const t = c.currentTime
      g.gain.cancelScheduledValues(t)
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)
      src.stop(t + 0.45)
    },
  }
}

/** 建設：金属を打つ音が数回、そのあと明るい和音 */
export function playBuild() {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  ;[0, 0.28, 0.5, 0.9].forEach((at, i) => {
    tone(c, 180 + i * 20, now + at, 0.12, 0.08, 'square')
    tone(c, 1200 + i * 90, now + at, 0.05, 0.03)
  })
  ;[392, 493.88, 587.33].forEach((f) => tone(c, f, now + 1.3, 1.6, 0.06, 'triangle'))
}

/** 完成：ファンファーレ（5 音のあと、長い和音） */
export function playFanfare() {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  const notes: [number, number, number][] = [
    [523.25, 0, 0.18],
    [523.25, 0.2, 0.18],
    [523.25, 0.4, 0.18],
    [659.25, 0.6, 0.5],
    [587.33, 1.1, 0.2],
    [659.25, 1.32, 0.2],
  ]
  for (const [f, at, len] of notes) {
    tone(c, f, now + at, len + 0.1, 0.08, 'sawtooth')
    tone(c, f * 2, now + at, len, 0.02)
  }
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(c, f, now + 1.6, 2.4, 0.06, 'triangle'))
}

/** 配達：荷物を積んだ・降ろした（ガコン、と 2 音） */
export function playJobHandoff(load: boolean) {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  tone(c, 140, now, 0.12, 0.09, 'square')
  tone(c, 95, now + 0.05, 0.16, 0.07, 'square')
  const [a, b] = load ? [587.33, 880] : [880, 587.33]
  tone(c, a, now + 0.18, 0.18, 0.06, 'triangle')
  tone(c, b, now + 0.3, 0.28, 0.06, 'triangle')
}

/** 配達完了：星の数だけ、上がっていく鈴の音（星が光るのに合わせる。STAR_GAP 秒おき） */
export const STAR_GAP = 0.42
export function playJobDone(stars: number) {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  ;[523.25, 659.25, 783.99].forEach((f, i) => tone(c, f, now + i * 0.09, 0.4, 0.06, 'triangle'))
  for (let i = 0; i < stars; i++) {
    const at = now + 0.5 + i * STAR_GAP
    tone(c, 1046.5 * 2 ** ((i * 4) / 12), at, 0.5, 0.06, 'sine')
    tone(c, 2093 * 2 ** ((i * 4) / 12), at, 0.2, 0.02, 'sine')
  }
}
