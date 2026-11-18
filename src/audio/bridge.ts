// 艦橋の中の音：低い空調・機関のうなりと、ときどき鳴る短い電子音。すべて Web Audio で合成（作品の音源は使わない）

import { audio, output, volume } from './sfx'
import { useStore } from '../state/store'

/** うなりの大きさ（音の大きさの設定に掛ける）。BGM の邪魔をしないよう、ごく小さく */
const HUM = 0.09
const CHIRP = 0.035

let nodes: { gain: GainNode; stop: () => void } | null = null
let chirpTimer = 0
let unsubscribe: (() => void) | null = null

function loopNoise(c: AudioContext) {
  // ブラウンノイズ（低い音が多いノイズ）を 4 秒ぶん作って繰り返す
  const buffer = c.createBuffer(1, c.sampleRate * 4, c.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    data[i] = last * 3.5
  }
  const src = c.createBufferSource()
  src.buffer = buffer
  src.loop = true
  return src
}

/** ブリッジに入ったら鳴らし、出たら止める */
export function setBridgeAmbience(on: boolean) {
  if (on === !!nodes) return
  const c = audio()
  if (!c) return
  if (!on && nodes) {
    nodes.gain.gain.setTargetAtTime(0, c.currentTime, 0.4)
    const n = nodes
    setTimeout(() => n.stop(), 2000)
    nodes = null
    window.clearTimeout(chirpTimer)
    unsubscribe?.()
    unsubscribe = null
    return
  }
  const gain = c.createGain()
  gain.gain.value = 0
  gain.connect(output(c))
  const air = loopNoise(c)
  const lowpass = c.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 260
  air.connect(lowpass).connect(gain)
  // 機関の低いうなり（二つの音をわずかにずらして、ゆっくりうねらせる）
  const hums = [55, 55.4, 110.3].map((f, i) => {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const g = c.createGain()
    g.gain.value = i === 2 ? 0.08 : 0.22
    o.connect(g).connect(gain)
    o.start()
    return o
  })
  air.start()
  const level = () => HUM * volume()
  gain.gain.setTargetAtTime(level(), c.currentTime, 0.8)
  nodes = {
    gain,
    stop: () => {
      air.stop()
      hums.forEach((o) => o.stop())
      gain.disconnect()
    },
  }
  unsubscribe = useStore.subscribe((s, prev) => {
    if (s.settings !== prev.settings && nodes) nodes.gain.gain.setTargetAtTime(level(), c.currentTime, 0.2)
  })
  scheduleChirp()
}

function scheduleChirp() {
  chirpTimer = window.setTimeout(() => {
    if (!nodes) return
    chirp()
    scheduleChirp()
  }, 5000 + Math.random() * 9000)
}

/** 画面のさえずり：高めの短い音が 2〜4 つ */
export function chirp(count = 2 + Math.floor(Math.random() * 3), loud = 1) {
  const v = volume() * CHIRP * loud
  if (v === 0) return
  const c = audio()
  if (!c) return
  let at = c.currentTime + 0.02
  for (let i = 0; i < count; i++) {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = [1320, 1568, 1760, 2093][Math.floor(Math.random() * 4)]
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(v, at + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07)
    o.connect(g).connect(output(c))
    o.start(at)
    o.stop(at + 0.09)
    at += 0.085
  }
}
