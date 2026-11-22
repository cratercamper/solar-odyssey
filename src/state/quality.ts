import { create } from 'zustand'
import { useStore } from './store'

// 画質：重いパソコン（内蔵 GPU のノートなど）では描画が追いつかず、惑星や構造物がちらついて消えることがある。
// 「自動」では FPS を測って、遅ければ一段ずつ下げ、余裕があれば戻す。

/** 実際に使う画質 */
export type Level = 'high' | 'medium' | 'low'
/** 設定の画質（auto は FPS を見て選ぶ） */
export type QualitySetting = 'auto' | Level

const ORDER: Level[] = ['low', 'medium', 'high']

/** 画質ごとの描き方 */
export const QUALITY: Record<Level, { dpr: number; msaa: number; bloom: boolean; ao: 'full' | 'half' | null; shadow: number; closeTextures: boolean }> = {
  // 画面の細かさ（端末の倍率の上限）・後処理のアンチエイリアス・後処理（光のにじみなど）を使えるか・陰影（SSAO）の細かさ・
  // 船の影の細かさ（0 で影なし）・近づいたときの 4K テクスチャ
  high: { dpr: 2, msaa: 4, bloom: true, ao: 'full', shadow: 2048, closeTextures: true },
  // 標準（内蔵 GPU で自動的に選ぶ）：後処理の全画面の処理が多いので、画面の細かさは等倍まで、陰影（SSAO）なし
  medium: { dpr: 1, msaa: 0, bloom: true, ao: null, shadow: 1024, closeTextures: true },
  low: { dpr: 0.85, msaa: 0, bloom: false, ao: null, shadow: 0, closeTextures: false },
}

/** スマホ・タブレットは画面が細かいので、標準でも 1.25 倍までは細かく描く（これまでと同じ見た目） */
const touchMedium = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
export const dprFor = (level: Level) => Math.min(window.devicePixelRatio || 1, level === 'medium' && touchMedium() ? 1.25 : QUALITY[level].dpr)

/**
 * 「軽量」でもまだ遅いとき（古いノートやスマホで重い場面）に、さらに画面を粗く描く倍率の段。
 * 自動のときだけ使い、余裕が出たら 1 に戻す
 */
export const SCALE_STEPS = [1, 0.8, 0.65, 0.5]

/** Canvas の dpr：画質と、遅いときの倍率から（cap はその場面の上限） */
export function useDpr(cap = Infinity) {
  const level = useQuality((q) => q.level)
  const scale = useQuality((q) => SCALE_STEPS[q.scaleStep])
  return Math.min(cap, dprFor(level)) * scale
}

/**
 * メモリの少ない端末（スマホ）か。iPhone の Safari は、ページが使うメモリが上限を超えると、
 * 警告なしにページごと落として読み込み直す（「問題が繰り返し起きました」）。
 * そうした端末では、4K テクスチャや大きなテクスチャを使わない。#phone を付けると、パソコンでも試せる
 */
export const lowMemory = () =>
  typeof window !== 'undefined' &&
  ((window.matchMedia('(hover: none) and (pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600) || location.hash.includes('phone'))

type QualityState = {
  /** 自動のときに選んでいる画質 */
  auto: Level
  /**
   * 今、実際に描き方に使っている画質。設定（または自動）が変わっても、新しい画質のシェーダーを
   * 裏で用意し終わるまでは前の画質のまま描く（QualityGovernor が切り替える）。
   * いきなり切り替えると、全部の材質のシェーダーをその場で作り直すあいだ何秒も描けず、
   * 画面の大きさも変わるので、3D が真っ黒のまま名前だけ残ってしまう（全体マップで天体が消える）
   */
  level: Level
  /** 直近の FPS（測れていなければ 0） */
  fps: number
  /** 「軽量」でも遅いときに、画面を粗くしている段（SCALE_STEPS の番号。0 でそのまま） */
  scaleStep: number
  setAuto: (auto: Level) => void
  setFps: (fps: number) => void
}

/** 設定と自動の選択から決まる、使いたい画質 */
export function wantedLevel(): Level {
  const setting = useStore.getState().settings.quality
  return setting === 'auto' ? useQuality.getState().auto : setting
}

const initialWanted = (): Level => {
  const setting = useStore.getState().settings.quality
  return setting === 'auto' ? 'high' : setting
}

export const useQuality = create<QualityState>((set) => ({
  auto: 'high',
  level: initialWanted(),
  fps: 0,
  scaleStep: 0,
  setAuto: (auto) => set({ auto }),
  setFps: (fps) => set({ fps }),
}))

/** シェーダーを先に用意してから画質を切り替える係（QualityGovernor）がいくつ動いているか */
let switchers = 0
export function registerSwitcher() {
  switchers++
  return () => {
    switchers--
  }
}

// 切り替え係がいない画面（模型の確認ページなど）では、そのまま切り替える
const applyIfAlone = () => {
  if (switchers === 0 && useQuality.getState().level !== wantedLevel()) useQuality.setState({ level: wantedLevel() })
}
useStore.subscribe(applyIfAlone)
useQuality.subscribe(applyIfAlone)
// 画質の設定を手で変えたら、粗くした分は元に戻す
useStore.subscribe((s, prev) => {
  if (s.settings.quality !== prev.settings.quality && useQuality.getState().scaleStep !== 0) useQuality.setState({ scaleStep: 0 })
})

/** 内蔵 GPU やスマホの GPU か（はじめから「標準」で始める） */
export function looksIntegrated(renderer: string) {
  return /intel|uhd|iris|hd graphics|mali|adreno|powervr|apple gpu|swiftshader|llvmpipe|microsoft basic/i.test(renderer)
}

/** 自動の画質を一段下げる・上げる（端なら変えない） */
export const stepDown = (level: Level): Level => ORDER[Math.max(0, ORDER.indexOf(level) - 1)]
export const stepUp = (level: Level): Level => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(level) + 1)]

/** 今の画質（描き方に使っているもの） */
export function useLevel(): Level {
  return useQuality((q) => q.level)
}

/** useFrame の外から今の画質を読む */
export function currentLevel(): Level {
  return useQuality.getState().level
}
