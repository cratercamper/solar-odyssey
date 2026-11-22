// BGM：このアプリのために作ったオリジナル曲（tools/music/bgm.py でシンセ合成）。
// 終わりが頭につながるように作ってあるので、Web Audio ですき間なくくり返す。

import { useStore } from '../state/store'
import { audio, output, volume } from './sfx'

/** 効果音とのつりあい（設定の音の大きさに掛ける） */
const LEVEL = 0.55
/** 曲の長さ（秒）。mp3 は頭に無音がつくので、ここで区切ってくり返す */
const LOOP_SECONDS = 66
/** mp3 の頭の無音（LAME の標準的な遅れ 1105 サンプル） */
const MP3_DELAY = 1105 / 44100

let gain: GainNode | null = null
let started = false

/** 自分の音楽を流している場面（月ミッション・月面の探検など）。1 つでもあれば、この BGM は消す。
 * 場面ごとに分けて持つ（月面から発射台の章へ飛ぶと、月面の場面が閉じるのは新しい場面が始まったあとなので、
 * ひとつの true/false だと、閉じた場面が BGM をもどしてしまっていた） */
const holders = new Set<string>()

const level = () => (useStore.getState().settings.music && holders.size === 0 ? volume() * LEVEL : 0)

/** 場面の音楽に場所をゆずる・もどす（who：場面の名前） */
export function holdBgm(who: string, on: boolean) {
  if (on) holders.add(who)
  else holders.delete(who)
  fadeTo(0.6)
}

/** いまの大きさ（level）へなめらかに。流しはじめのフェードイン（2 秒）の途中でも、先の予定を消してから */
function fadeTo(tc: number) {
  const c = audio()
  if (!c || !gain) return
  const g = gain.gain
  g.cancelScheduledValues(c.currentTime)
  g.setValueAtTime(g.value, c.currentTime)
  g.setTargetAtTime(level(), c.currentTime, tc)
}

async function start() {
  if (started) return
  started = true
  const c = audio()
  if (!c) return
  const ogg = new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== ''
  const url = `${import.meta.env.BASE_URL}music/bgm-loop.${ogg ? 'ogg' : 'mp3'}`
  try {
    const buffer = await c.decodeAudioData(await (await fetch(url)).arrayBuffer())
    const src = c.createBufferSource()
    src.buffer = buffer
    src.loop = true
    if (!ogg) {
      src.loopStart = MP3_DELAY
      src.loopEnd = Math.min(buffer.duration, MP3_DELAY + LOOP_SECONDS)
    }
    gain = c.createGain()
    gain.gain.setValueAtTime(0, c.currentTime)
    gain.gain.linearRampToValueAtTime(level(), c.currentTime + 2)
    src.connect(gain).connect(output(c))
    src.start(c.currentTime, ogg ? 0 : MP3_DELAY)
  } catch {
    // 読み込めなくても遊べる
  }
}

/** ブラウザは操作の前に音を出せないので、最初のクリック・キー・タッチで流しはじめる */
export function setupMusic() {
  const kick = () => {
    if (!useStore.getState().settings.music) return
    void start()
    window.removeEventListener('pointerdown', kick)
    window.removeEventListener('keydown', kick)
  }
  window.addEventListener('pointerdown', kick)
  window.addEventListener('keydown', kick)
  // 音の大きさ・消音・BGM の切り替えに合わせる
  useStore.subscribe((s, prev) => {
    if (s.settings === prev.settings) return
    if (s.settings.music && !started) void start()
    fadeTo(0.2)
  })
}
