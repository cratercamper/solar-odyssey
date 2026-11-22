// 月ミッションの音楽：ホルスト「惑星」と、宇宙の気分のクラシック（どれも著作権は切れている）。同じ曲は 2 度使わない。
// 録音と使用許可は public/audio/README.md（パブリックドメイン・CC0。ツァラトゥストラだけ CC BY 3.0 で、名前を出す）。
// 場面のきっかけ（画面の見出し）で曲を始め、本物の交信音声が流れている間は小さくする。

import { create } from 'zustand'
import { useStore } from '../state/store'
import { audio, output, volume } from './sfx'
import { useRadio } from './radio'

export type MusicCue = 'jupiterOpening' | 'jupiterHymn' | 'mars' | 'saturn' | 'neptune' | 'blueDanube' | 'zarathustra' | 'clairDeLune' | 'newWorld'

const FILES: Record<MusicCue, string> = {
  jupiterOpening: 'audio/planets/jupiter-opening.mp3',
  jupiterHymn: 'audio/planets/jupiter-hymn.mp3',
  mars: 'audio/planets/mars.mp3',
  saturn: 'audio/planets/saturn.mp3',
  neptune: 'audio/planets/neptune.mp3',
  blueDanube: 'audio/classics/blue-danube.mp3',
  zarathustra: 'audio/classics/zarathustra.mp3',
  clairDeLune: 'audio/classics/clair-de-lune.mp3',
  newWorld: 'audio/classics/new-world-largo.mp3',
}

/** いま流れ始めた曲（画面の「いま流れている曲」のカード用。at は performance.now() の秒） */
export const useNowPlaying = create<{ cue: MusicCue | null; at: number }>(() => ({ cue: null, at: 0 }))

/** 効果音とのつりあい（設定の音の大きさに掛ける） */
const LEVEL = 1.6
/** 交信音声が流れている間の大きさ（もとの何倍か） */
const DUCK = 0.3

const cache = new Map<MusicCue, Promise<AudioBuffer | null>>()
let gain: GainNode | null = null
let source: AudioBufferSourceNode | null = null
let current: MusicCue | null = null
/** 流れている曲を始めた時刻（AudioContext の秒） */
let startedAt = 0
/** 始める合図の通し番号（読み込み中に別の曲・停止が来たら古いほうは流さない） */
let ticket = 0

const level = () => {
  const s = useStore.getState().settings
  const base = s.music ? Math.min(1, volume() * LEVEL) : 0
  return useRadio.getState().playing ? base * DUCK : base
}

function load(cue: MusicCue) {
  let p = cache.get(cue)
  if (!p) {
    const c = audio()
    p = c
      ? fetch(`${import.meta.env.BASE_URL}${FILES[cue]}`)
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            return r.arrayBuffer()
          })
          .then((b) => c.decodeAudioData(b))
          .catch((e) => {
            console.error(`ERROR: mission music "${cue}" could not be loaded; the scene runs without it`, e)
            return null
          })
      : Promise.resolve(null)
    cache.set(cue, p)
  }
  return p
}

export function preloadMusic(cue: MusicCue) {
  if (useStore.getState().settings.music) void load(cue)
}

function retune(seconds = 0.25) {
  const c = audio()
  if (c && gain) gain.gain.setTargetAtTime(level(), c.currentTime, seconds)
}

/** 曲を始める（流れている曲は 1 秒で消す） */
export function playMusic(cue: MusicCue) {
  if (current === cue) return
  stopMusic(1)
  if (!useStore.getState().settings.music) return
  current = cue
  const mine = ++ticket
  void load(cue).then((buffer) => {
    const c = audio()
    if (!buffer || !c || mine !== ticket) return
    const g = c.createGain()
    g.gain.value = level()
    g.connect(output(c))
    const s = c.createBufferSource()
    s.buffer = buffer
    s.connect(g)
    s.start()
    startedAt = c.currentTime
    useNowPlaying.setState({ cue, at: performance.now() / 1000 })
    s.onended = () => {
      if (source === s) {
        source = null
        gain = null
        current = null
      }
    }
    source = s
    gain = g
  })
}

/** 曲 cue が流れていれば、始まりからの秒（カメラのカットを曲に合わせる）。読み込み中・止まっていれば null */
export function musicTime(cue: MusicCue): number | null {
  const c = audio()
  if (!c || c.state !== 'running' || !source || current !== cue) return null
  return c.currentTime - startedAt
}

/** 曲を fade 秒で消して止める */
export function stopMusic(fade = 0.5) {
  ticket++
  current = null
  if (useNowPlaying.getState().cue) useNowPlaying.setState({ cue: null })
  const c = audio()
  const s = source
  const g = gain
  source = null
  gain = null
  if (!c || !s || !g) return
  g.gain.cancelScheduledValues(c.currentTime)
  g.gain.setValueAtTime(g.gain.value, c.currentTime)
  g.gain.linearRampToValueAtTime(0, c.currentTime + fade)
  try {
    s.stop(c.currentTime + fade + 0.05)
  } catch {
    // すでに止まっている
  }
}

// 交信音声の始まり・終わり、設定の変更で大きさを合わせる
useRadio.subscribe(() => retune(0.3))
useStore.subscribe((s, prev) => {
  if (s.settings !== prev.settings) retune()
})
