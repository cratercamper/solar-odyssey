// 効果音はすべて Web Audio で合成する（作品の音源は使わない）

import { useStore } from '../state/store'

let ctx: AudioContext | null = null
/** AudioContext が使えない（エラーは一度だけ出す） */
let noAudio = false
let master: GainNode | null = null
/** すべての音（BGM・効果音・艦橋の音）が最後に通る出口。裏に回ったときはここで絞る */
let bus: GainNode | null = null
/** タブが隠れているか、ウィンドウが前面にないとき true */
let away = false
let suspendTimer = 0

/** 裏に回ったとき・戻ったときの音の消え方・戻り方（秒） */
const FADE_OUT = 0.4
const FADE_IN = 0.8

/** 音を鳴らす AudioContext。ないブラウザ（Web Audio を切ってあるなど）では null を返し、音なしで遊べるようにする */
export function audio(): AudioContext | null {
  if (!ctx) {
    if (noAudio) return null
    try {
      ctx = new AudioContext()
    } catch (e) {
      // AudioContext が無い・作れない（ReferenceError など）。一度だけ知らせて音なしで続ける
      noAudio = true
      console.error('ERROR: AudioContext is not available; the game runs without sound', e)
      return null
    }
  }
  if (ctx.state === 'suspended' && !away) void ctx.resume()
  return ctx
}

/** 音の出口。c.destination の代わりにここへつなぐ */
export function output(c: AudioContext) {
  if (!bus) {
    bus = c.createGain()
    bus.gain.value = away ? 0 : 1
    bus.connect(c.destination)
  }
  return bus
}

/** ブラウザを裏に回したら音を消して止め、前に戻ったらまた鳴らす */
function setAway(next: boolean) {
  if (next === away) return
  away = next
  if (away && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  if (!ctx) return
  const c = ctx
  const g = output(c).gain
  window.clearTimeout(suspendTimer)
  g.cancelScheduledValues(c.currentTime)
  g.setValueAtTime(g.value, c.currentTime)
  if (away) {
    g.linearRampToValueAtTime(0, c.currentTime + FADE_OUT)
    // 消えきったら止めて、裏で CPU を使わないようにする
    suspendTimer = window.setTimeout(() => {
      if (away) void c.suspend()
    }, FADE_OUT * 1000 + 100)
  } else {
    void c.resume()
    g.linearRampToValueAtTime(1, c.currentTime + FADE_IN)
  }
}

if (typeof window !== 'undefined') {
  const check = () => setAway(document.hidden || !document.hasFocus())
  document.addEventListener('visibilitychange', check)
  window.addEventListener('blur', check)
  window.addEventListener('focus', check)
  window.addEventListener('pagehide', () => setAway(true))
  window.addEventListener('pageshow', check)
}

/** 設定の音の大きさ（0〜1。消音なら 0） */
export const volume = () => {
  const { volume, muted } = useStore.getState().settings
  return muted ? 0 : volume
}

/** すべての効果音の出口。設定の音の大きさをここで掛ける */
function out(c: AudioContext) {
  if (!master) {
    master = c.createGain()
    master.connect(output(c))
  }
  master.gain.value = volume()
  return master
}

function noiseBuffer(c: AudioContext, seconds: number) {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** ワープ：低いうなりが高まり、風切り音が抜けていく。seconds はワープ中の長さ */
export function playWarp(chargeSeconds: number, seconds: number) {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  const jump = now + chargeSeconds
  const end = jump + seconds + 1

  const hum = c.createOscillator()
  hum.type = 'sawtooth'
  hum.frequency.setValueAtTime(40, now)
  hum.frequency.exponentialRampToValueAtTime(160, jump)
  hum.frequency.exponentialRampToValueAtTime(60, end)
  const humFilter = c.createBiquadFilter()
  humFilter.type = 'lowpass'
  humFilter.frequency.value = 400
  const humGain = c.createGain()
  humGain.gain.setValueAtTime(0, now)
  humGain.gain.linearRampToValueAtTime(0.12, jump)
  humGain.gain.linearRampToValueAtTime(0, end)
  hum.connect(humFilter).connect(humGain).connect(out(c))
  hum.start(now)
  hum.stop(end)

  const rush = c.createBufferSource()
  rush.buffer = noiseBuffer(c, end - now)
  const rushFilter = c.createBiquadFilter()
  rushFilter.type = 'bandpass'
  rushFilter.Q.value = 0.8
  rushFilter.frequency.setValueAtTime(300, jump)
  rushFilter.frequency.exponentialRampToValueAtTime(2500, jump + 0.4)
  rushFilter.frequency.exponentialRampToValueAtTime(400, end)
  const rushGain = c.createGain()
  rushGain.gain.setValueAtTime(0, now)
  rushGain.gain.linearRampToValueAtTime(0.25, jump + 0.3)
  rushGain.gain.linearRampToValueAtTime(0.08, jump + seconds)
  rushGain.gain.linearRampToValueAtTime(0, end)
  rush.connect(rushFilter).connect(rushGain).connect(out(c))
  rush.start(now)
}

// 艦長の声：落ち着いた、低めのイギリス英語の男性の声。端末に入っている声から選ぶ
// （Chrome の Google UK English Male、Mac・iPhone の Daniel、Windows の George など）
const CAPTAIN_VOICES = ['Google UK English Male', 'Microsoft Ryan', 'Microsoft Thomas', 'Microsoft George', 'Daniel', 'Arthur', 'Oliver', 'Malcolm']
const FEMALE = /female|woman|serena|kate|stephanie|martha|libby|sonia|hazel|susan|mia|maisie|fiona|moira|karen|tessa|samantha|victoria|zira|aria|jenny/i

let captain: SpeechSynthesisVoice | null | undefined

function captainVoice() {
  if (captain !== undefined) return captain
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return null // まだ読み込み中。次の呼び出しで選ぶ
  const byName = CAPTAIN_VOICES.map((name) => voices.find((v) => v.name.includes(name) && v.lang.startsWith('en'))).find(Boolean)
  const british = voices.filter((v) => v.lang.replace('_', '-').startsWith('en-GB'))
  const english = voices.filter((v) => v.lang.startsWith('en'))
  captain = byName ?? british.find((v) => !FEMALE.test(v.name)) ?? english.find((v) => /male/i.test(v.name) && !FEMALE.test(v.name)) ?? british[0] ?? english[0] ?? null
  return captain
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    captain = undefined
  })
}

/** ブラウザの音声合成で、艦長の声（英語）で読み上げる */
export function speak(text: string, opts: { rate?: number; pitch?: number } = {}) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text)
  const voice = captainVoice()
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? 'en-GB'
  u.rate = opts.rate ?? 0.88
  u.pitch = opts.pitch ?? 0.6
  u.volume = volume()
  if (u.volume === 0 || away) return
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

/** ビーム：高めの音がすっと下がる */
export function playBeam() {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  const osc = c.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(1400, now)
  osc.frequency.exponentialRampToValueAtTime(500, now + 0.35)
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1200
  filter.Q.value = 2
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.12, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
  osc.connect(filter).connect(gain).connect(out(c))
  osc.start(now)
  osc.stop(now + 0.4)
}

/** 爆発：低いノイズが広がって消える */
export function playBlast() {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c, 1.2)
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(1800, now)
  filter.frequency.exponentialRampToValueAtTime(120, now + 1.1)
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.35, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2)
  src.connect(filter).connect(gain).connect(out(c))
  src.start(now)
}


/** 短い電子音（カウントダウンや輪の通過） */
export function playBeep(freq: number, seconds = 0.18) {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = freq
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds)
  osc.connect(gain).connect(out(c))
  osc.start(now)
  osc.stop(now + seconds + 0.02)
}

// ---------- チャージビーム ----------

/** 溜めの段階ごとのうなりの高さ（Hz） */
const CHARGE_PITCH = [90, 150, 240, 380]

export type ChargeHum = { setLevel: (level: number) => void; stop: () => void }

/** 溜めのうなり：段階が上がるたびに音程が上がる。stop で短く消える */
export function startChargeHum(): ChargeHum {
  const c = audio()
  if (!c) return { setLevel: () => {}, stop: () => {} }
  const now = c.currentTime
  const low = c.createOscillator()
  low.type = 'sawtooth'
  low.frequency.setValueAtTime(CHARGE_PITCH[0] * 0.6, now)
  low.frequency.exponentialRampToValueAtTime(CHARGE_PITCH[0], now + 0.45)
  const high = c.createOscillator()
  high.type = 'sine'
  high.frequency.setValueAtTime(CHARGE_PITCH[0] * 4, now)
  // うなりを細かく揺らす
  const lfo = c.createOscillator()
  lfo.frequency.value = 9
  const lfoGain = c.createGain()
  lfoGain.gain.value = 6
  lfo.connect(lfoGain).connect(low.frequency)
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(500, now)
  filter.Q.value = 6
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.09, now + 0.3)
  const shimmer = c.createGain()
  shimmer.gain.value = 0.025
  low.connect(filter).connect(gain)
  high.connect(shimmer).connect(gain)
  gain.connect(out(c))
  low.start(now)
  high.start(now)
  lfo.start(now)
  return {
    setLevel(level) {
      const t = c.currentTime
      const f = CHARGE_PITCH[Math.min(level, CHARGE_PITCH.length - 1)]
      low.frequency.cancelScheduledValues(t)
      low.frequency.setTargetAtTime(f, t, 0.08)
      high.frequency.setTargetAtTime(f * 4, t, 0.08)
      filter.frequency.setTargetAtTime(500 + level * 900, t, 0.1)
      lfo.frequency.setTargetAtTime(9 + level * 5, t, 0.1)
      gain.gain.setTargetAtTime(0.09 + level * 0.025, t, 0.1)
    },
    stop() {
      const t = c.currentTime
      gain.gain.cancelScheduledValues(t)
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
      for (const o of [low, high, lfo]) o.stop(t + 0.15)
    },
  }
}

/** 段階が上がった瞬間の、きらっとした短い音 */
export function playChargeStep(level: number) {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  const base = 660 * 2 ** ((level - 1) * 4 / 12)
  ;[1, 1.5].forEach((ratio, i) => {
    const osc = c.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = base * ratio
    const gain = c.createGain()
    gain.gain.setValueAtTime(0.0001, now + i * 0.05)
    gain.gain.exponentialRampToValueAtTime(0.09, now + i * 0.05 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 0.3)
    osc.connect(gain).connect(out(c))
    osc.start(now + i * 0.05)
    osc.stop(now + i * 0.05 + 0.32)
  })
}

/** 発射：低い「ドン」。段階が高いほど低く重い */
export function playChargeFire(level: number) {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(130 - level * 15, now)
  osc.frequency.exponentialRampToValueAtTime(32, now + 0.5)
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.5 + level * 0.08, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7)
  osc.connect(gain).connect(out(c))
  osc.start(now)
  osc.stop(now + 0.75)
  // 衝撃の空気感：こもったノイズ
  const noise = c.createBufferSource()
  noise.buffer = noiseBuffer(c, 0.6)
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(2400, now)
  filter.frequency.exponentialRampToValueAtTime(150, now + 0.5)
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.3, now)
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.55)
  noise.connect(filter).connect(ng).connect(out(c))
  noise.start(now)
}

/** ビームが出ているあいだのうなり。seconds たったらフェードアウトする。戻り値で途中でも止められる */
export function beamHum(seconds: number, level: number) {
  const c = audio()
  if (!c) return () => {}
  const now = c.currentTime
  const end = now + seconds + 0.45
  const a = c.createOscillator()
  a.type = 'sawtooth'
  a.frequency.value = 62 - level * 4
  const b = c.createOscillator()
  b.type = 'square'
  b.frequency.value = (62 - level * 4) * 1.5 + 0.7
  const lfo = c.createOscillator()
  lfo.frequency.value = 13
  const lfoGain = c.createGain()
  lfoGain.gain.value = 260
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 700 + level * 150
  filter.Q.value = 4
  lfo.connect(lfoGain).connect(filter.frequency)
  const mix = c.createGain()
  mix.gain.value = 0.5
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.08)
  gain.gain.setValueAtTime(0.16, now + seconds)
  gain.gain.exponentialRampToValueAtTime(0.0001, end)
  a.connect(filter)
  b.connect(mix).connect(filter)
  filter.connect(gain).connect(out(c))
  for (const o of [a, b, lfo]) {
    o.start(now)
    o.stop(end + 0.05)
  }
  return () => {
    const t = c.currentTime
    gain.gain.cancelScheduledValues(t)
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
  }
}
