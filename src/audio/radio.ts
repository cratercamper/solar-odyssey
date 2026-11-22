// 本物の交信音声を流す（アポロ17号。NASA の録音）。字幕は RadioSubtitle が useRadio を見て出す

import { create } from 'zustand'
import { RADIO, type RadioClipId } from '../data/apolloRadio'
import { audio, output, volume } from './sfx'

type RadioState = {
  /** いま流している切り抜きと、始めた時刻（performance.now() の秒）。音が出せなくても字幕のために入れる */
  playing: { id: RadioClipId; at: number } | null
}
export const useRadio = create<RadioState>(() => ({ playing: null }))

const cache = new Map<RadioClipId, Promise<AudioBuffer | null>>()
let source: AudioBufferSourceNode | null = null
let endTimer = 0

function load(id: RadioClipId) {
  let p = cache.get(id)
  if (!p) {
    const c = audio()
    p = c
      ? fetch(`${import.meta.env.BASE_URL}${RADIO[id].file}`)
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            return r.arrayBuffer()
          })
          .then((b) => c.decodeAudioData(b))
          .catch((e) => {
            console.error(`ERROR: radio clip "${id}" could not be loaded; subtitles only`, e)
            return null
          })
      : Promise.resolve(null)
    cache.set(id, p)
  }
  return p
}

/** 先に読み込んでおく（流す瞬間に遅れないように） */
export function preloadRadio(id: RadioClipId) {
  void load(id)
}

/** 切り抜きを流す。skip 秒目から（秒読みの途中から始めるとき） */
export function playRadio(id: RadioClipId, skip = 0) {
  stopRadio()
  const clip = RADIO[id]
  if (skip >= clip.length) return
  const at = performance.now() / 1000 - skip
  useRadio.setState({ playing: { id, at } })
  endTimer = window.setTimeout(() => {
    if (useRadio.getState().playing?.at === at) useRadio.setState({ playing: null })
  }, (clip.length - skip + 0.6) * 1000)
  void load(id).then((buffer) => {
    const c = audio()
    // 読み込みの間に止められた・別のが始まったら流さない
    if (!buffer || !c || useRadio.getState().playing?.at !== at) return
    const late = performance.now() / 1000 - at
    if (late >= buffer.duration) return
    const gain = c.createGain()
    // 声は効果音より少し大きめに（設定の音量 0.3 が標準）
    gain.gain.value = Math.min(1, volume() * 2.6)
    gain.connect(output(c))
    const s = c.createBufferSource()
    s.buffer = buffer
    s.connect(gain)
    s.start(0, Math.max(0, late))
    source = s
    s.onended = () => {
      if (source === s) source = null
    }
  })
}

export function stopRadio() {
  window.clearTimeout(endTimer)
  if (source) {
    try {
      source.stop()
    } catch {
      // すでに止まっている
    }
    source = null
  }
  if (useRadio.getState().playing) useRadio.setState({ playing: null })
}
