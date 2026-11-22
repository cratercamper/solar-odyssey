import { saveData } from './save'
import { create } from 'zustand'
import type { Near } from './proximity'
import type { ScopeId } from '../data/telescopes'
import { DEFAULT_RATE } from '../data/scale'
import type { ShipId } from '../data/ships'
import type { QualitySetting } from './quality'
import { THROTTLE_DEFAULT, THROTTLE_STEPS } from './throttle'

/** 全体マップ・操縦席・鑑賞モード（止まった自機のまわりを回って眺める） */
export type Mode = 'map' | 'flight' | 'gallery'
/** 追いかけ・見上げ（ヒーローショット）・ブリッジ（艦橋の中から窓ごしに見る） */
export type CameraMode = 'chase' | 'hero' | 'bridge'
const CAMERA_ORDER: CameraMode[] = ['chase', 'hero', 'bridge']
/** C キーやカメラボタンで次のカメラへ */
export const nextCameraMode = (mode: CameraMode) => CAMERA_ORDER[(CAMERA_ORDER.indexOf(mode) + 1) % CAMERA_ORDER.length]
export type WarpPhase = 'idle' | 'charge' | 'warp' | 'exit'

type Telemetry = { distance: number | null; speed: number; eta: number | null; near?: Near | null }

type State = {
  mode: Mode
  targetId: string | null
  warpFactor: number
  /** 推進の段階（flight.ts の THROTTLE_STEPS の番号） */
  throttle: number
  warpPhase: WarpPhase
  autopilot: boolean
  /** 時間の速さ：1秒に何時間進むか（data/scale.ts の TIME_RATES） */
  timeScale: number
  telemetry: Telemetry
  /** クイズに正解した天体 */
  visited: string[]
  logOpen: boolean
  cameraMode: CameraMode
  toast: { id: number; text: string } | null
  /** そばにいる宇宙望遠鏡（のぞける） */
  scopeNear: ScopeId | null
  /** のぞいている望遠鏡（写真の画面を開いている） */
  scope: ScopeId | null
  /** 表示の設定（端末に保存する） */
  settings: Settings
  setMode: (mode: Mode) => void
  setTarget: (id: string | null) => void
  setWarpFactor: (factor: number) => void
  setThrottle: (step: number) => void
  setWarpPhase: (phase: WarpPhase) => void
  setAutopilot: (on: boolean) => void
  setTimeScale: (scale: number) => void
  setTelemetry: (t: Telemetry) => void
  markVisited: (id: string) => void
  setLogOpen: (open: boolean) => void
  setCameraMode: (mode: CameraMode) => void
  showToast: (text: string) => void
  setScopeNear: (id: ScopeId | null) => void
  setScope: (id: ScopeId | null) => void
  updateSettings: (patch: Partial<Settings>) => void
}

export type Settings = {
  /** 旋回するとき船体を少し傾ける（映画のような見た目。宇宙では本当は傾けなくても曲がれる） */
  banking: boolean
  /** 距離の広さ：0 は見やすい距離、1 は衛星が本物の比率・惑星どうしが本物の約20〜50分の1（data/layout.ts） */
  distance: number
  /** 大きさ：0 は差を縮めた見やすい大きさ、1 は地球を基準にした本物の比率（data/layout.ts） */
  size: number
  /** 音の大きさ（0〜1）。開いた人がびっくりしないよう、初めは小さめ */
  volume: number
  /** 音を消す */
  muted: boolean
  /** BGM を流す */
  music: boolean
  /** 画面の言語。まだ選んでいなければ null（初めて開いたときに選んでもらう） */
  lang: 'ja' | 'en' | null
  /** 世界：本物の太陽系だけ（real）か、架空の船や構造物も出す SF モード（sf） */
  world: 'real' | 'sf'
  /** 乗る船（data/ships.ts） */
  ship: ShipId
  /** 画質（state/quality.ts）。auto は FPS を見て自動で選ぶ */
  quality: QualitySetting
  /** 天体の見え方（state/look.ts）：見やすく強調した図鑑モード（illustrated）か、カメラで撮ったような写真モード（photo） */
  look: 'illustrated' | 'photo'
  /** 後処理（components/PostFx.tsx）：光のにじみ・陰影（SSAO）・フィルムの粒子と周辺減光。画質が「軽量」のときはどれも使わない */
  fx: PostFxSettings
  /** エンジン噴射と姿勢制御の演出の量（components/ship/EngineFx.tsx） */
  thrust: ThrustFxLevel
  /** チャージビームの演出：発射の瞬間の白いフラッシュと、カメラの揺れ（光の点滅や揺れが苦手な人は切れる） */
  beamFx: { flash: boolean; shake: boolean }
}

export type ThrustFxLevel = 'many' | 'normal' | 'off'

export type PostFxSettings = { bloom: boolean; ao: boolean; film: boolean }

const SETTINGS_KEY = 'settings'
const DEFAULT_SETTINGS: Settings = { banking: true, distance: 0, size: 0, volume: 0.3, muted: false, music: true, lang: null, world: 'real', ship: 'sv01', quality: 'auto', look: 'illustrated', fx: { bloom: true, ao: true, film: true }, thrust: 'normal', beamFx: { flash: true, shake: true } }

// リンクで世界を決めて開ける（#sf や #real）
const worldFromUrl = /[?&#](sf|real)\b/.exec(location.search + location.hash)?.[1] as Settings['world'] | undefined

// リンクで見え方を決めて開ける（#look=photo）
const lookFromUrl = /[?&#]look=(illustrated|photo)\b/.exec(location.search + location.hash)?.[1] as Settings['look'] | undefined

// リンクで船を決めて開ける（#ship=heron など）
const shipFromUrl = /[?&#]ship=(sv01|heron|sorakaze|hakobune|meguri|amatsu|arcadia)\b/.exec(location.search + location.hash)?.[1] as ShipId | undefined

function loadSettings(): Settings {
  let saved: Partial<Settings> = {}
  try {
    saved = JSON.parse(saveData.get(SETTINGS_KEY) ?? '{}')
  } catch {
    // 読めなければ初めの設定で
  }
  // 距離と大きさは、ひとつのスケールでいっしょに動かす（前に別々に保存した値は距離にそろえる）
  if (typeof saved.distance === 'number') saved.size = saved.distance
  else delete saved.size
  // 古い版や壊れた保存値で、起動できなくならないように（知らない画質・船は初めの設定にもどす）
  if (!['auto', 'high', 'medium', 'low'].includes(saved.quality as string)) delete saved.quality
  if (!['sv01', 'heron', 'sorakaze', 'hakobune', 'meguri', 'amatsu', 'arcadia'].includes(saved.ship as string)) delete saved.ship
  return { ...DEFAULT_SETTINGS, ...saved, ...(worldFromUrl ? { world: worldFromUrl } : {}), ...(shipFromUrl ? { ship: shipFromUrl } : {}), ...(lookFromUrl ? { look: lookFromUrl } : {}) }
}

const VISITED_KEY = 'visited'

function loadVisited(): string[] {
  try {
    return JSON.parse(saveData.get(VISITED_KEY) ?? '[]')
  } catch {
    return []
  }
}

export const useStore = create<State>((set) => ({
  mode: 'flight',
  targetId: null,
  warpFactor: 6,
  throttle: THROTTLE_DEFAULT,
  warpPhase: 'idle',
  autopilot: false,
  timeScale: DEFAULT_RATE,
  telemetry: { distance: null, speed: 0, eta: null },
  visited: loadVisited(),
  logOpen: false,
  cameraMode: 'chase',
  toast: null,
  scopeNear: null,
  scope: null,
  settings: loadSettings(),
  setMode: (mode) => set({ mode }),
  setTarget: (targetId) => set({ targetId, autopilot: false, logOpen: false }),
  setWarpFactor: (warpFactor) => set({ warpFactor }),
  setThrottle: (step) => set({ throttle: Math.max(0, Math.min(THROTTLE_STEPS.length - 1, Math.round(step))) }),
  setWarpPhase: (warpPhase) => set({ warpPhase }),
  setAutopilot: (autopilot) => set({ autopilot }),
  setTimeScale: (timeScale) => set({ timeScale }),
  setTelemetry: (telemetry) => set({ telemetry }),
  markVisited: (id) =>
    set((s) => {
      if (s.visited.includes(id)) return s
      const visited = [...s.visited, id]
      try {
        saveData.set(VISITED_KEY, JSON.stringify(visited))
      } catch {
        // 保存できなくても遊べる
      }
      return { visited }
    }),
  setLogOpen: (logOpen) => set({ logOpen }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  showToast: (text) => set({ toast: { id: Date.now(), text } }),
  setScopeNear: (scopeNear) => set({ scopeNear }),
  setScope: (scope) => set(scope ? { scope, logOpen: false, autopilot: false } : { scope }),
  updateSettings: (patch) =>
    set((s) => {
      const settings = { ...s.settings, ...patch }
      try {
        saveData.set(SETTINGS_KEY, JSON.stringify(settings))
      } catch {
        // 保存できなくても遊べる
      }
      return { settings }
    }),
}))

// 動作確認用：URL に #debug を付けると、ブラウザのコンソールから状態を見られる
if (location.hash.includes('debug')) (window as unknown as { __store: typeof useStore }).__store = useStore
