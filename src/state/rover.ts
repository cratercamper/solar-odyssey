import { saveData } from './save'
import { create } from 'zustand'

// 無人探査ローバー ORV-7。着陸したあと、着陸船の腹からたたんだまま落とされ、地面で展開して走り出す。
// 流れ：none → drop（落ちる）→ deploy（展開）→ drive（運転）。回収すると none にもどる。

export type RoverPhase = 'none' | 'drop' | 'deploy' | 'drive'
/**
 * どの車を出しているか：orv7（無人探査ローバー）・crew（人が乗る与圧ローバー PR-2、月だけ。components/surface/CrewRover.tsx）。
 * crew の流れ：none → drop（着陸船のそばに先に届いていた車へ乗りこむ）→ drive。deploy は使わない。
 * lrv（アポロの月面車、アポロ17号の追体験の船外活動だけ。components/surface/LunarRover.tsx）も crew と同じ流れ
 */
export type RoverVehicle = 'orv7' | 'crew' | 'lrv'
/** 運転中の見方：後ろから追う・マストのカメラから */
export type RoverView = 'chase' | 'cam'

export const DEPLOY_SEC = 6
/** 走り回れる範囲（着陸地点を中心にした正方形の半分の幅、m）。広い天体（火星）は wideGround.ts の WIDE_RANGE */
export const ROVER_RANGE = 100
/** 最高速度（m/s）。時速 60 km */
export const ROVER_TOP = 60 / 3.6
/** 与圧ローバーの最高速度（m/s）。時速 20 km（重さ数トンの、人が中で暮らせる車） */
export const CREW_TOP = 20 / 3.6
/** アポロの月面車の最高速度（m/s）。時速 18 km（アポロ17号でサーナンが出した記録の速さ） */
export const LRV_TOP = 18 / 3.6
/** いま出している車の最高速度（m/s） */
export const roverTop = () => {
  const v = useRover.getState().vehicle
  return v === 'crew' ? CREW_TOP : v === 'lrv' ? LRV_TOP : ROVER_TOP
}
/** 与圧ローバーに乗りこむ場面の長さ（秒） */
export const BOARD_SEC = 3.2
/** 月だけで出せる（実在の計画が月面用なので） */
export const crewRoverOn = (bodyId: string) => bodyId === 'moon'
/**
 * 走りの版。運転のしかた・地面・岩など、レースのタイムが変わる変更をしたら、同じコミットで 1 増やす
 * （見た目だけ・コメントだけの変更では増やさない）。レースのハイスコア表・ゴースト・ゲームに入っている記録は、
 * 同じ版で走ったものだけを使う（state/rallyHiscore.ts の courseOf）。だから版が同じなら、どのバージョンのゲームでも使える
 */
export const DRIVE_VERSION = 7

type RoverState = {
  phase: RoverPhase
  vehicle: RoverVehicle
  /** 与圧ローバー：電池の残り（0〜1）。走ると減り、昼は太陽電池で少しずつもどる */
  battery: number
  since: number
  view: RoverView
  /** 画面に出す速さ（km/h）。毎フレームではなく、ときどき書き換える */
  kmh: number
  /** 計器の表示（ときどき書き換える）：向き（度、0〜359）、前後・左右の傾き（度）、着陸船からの距離（m）、宙に浮いているか */
  hud: { hdg: number; pitch: number; roll: number; dist: number; air: boolean; fuel: number; x: number; z: number }
  /** 走れる範囲（正方形の半分の幅、m）。天体で変わる */
  range: number
  /** 走れる範囲の端に当たっている（メッセージを出す） */
  edge: boolean
  /** ミニマップ用：採集の岩の位置と、採ったものの番号 */
  sites: { x: number; z: number; poi?: string }[]
  taken: number[]
  /** 運転中に、時刻・天気などのメニューを開いているか（ふだんはたたんで景色を広く） */
  menu: boolean
  /** ミニマップを出しているか（右上の「－」でたたむと、小さな「地図」ボタンだけになる） */
  map: boolean
  /** 採集：アームの届く岩があるか・採集中か・いま見せている分析結果（試料の id）・この天体で集めた種類 */
  canSample: boolean
  sampling: boolean
  result: string | null
  /** いちばん近い、まだ採っていない岩（距離 m と、ローバーの正面から右回りの角度、近くの見どころの id（pois.ts）） */
  next: { dist: number; rel: number; where?: string | null } | null
  setView: (v: RoverView) => void
  /** マウスを固定して運転しているか（PC） */
  mouse: boolean
}

export const roverNow = () => performance.now() / 1000

export const useRover = create<RoverState>((set) => ({
  phase: 'none',
  vehicle: 'orv7',
  battery: 1,
  since: 0,
  view: 'chase',
  mouse: false,
  kmh: 0,
  hud: { hdg: 0, pitch: 0, roll: 0, dist: 0, air: false, fuel: 1, x: 0, z: 0 },
  edge: false,
  range: ROVER_RANGE,
  sites: [],
  taken: [],
  menu: false,
  map: true,
  canSample: false,
  sampling: false,
  result: null,
  next: null,
  setView: (view) => set({ view }),
}))

export const roverActive = () => useRover.getState().phase !== 'none'

/** quick：着陸船から降ろす場面を飛ばし、展開した姿ですぐ走れるように（レースのスタート） */
export function launchRover(quick = false, vehicle: RoverVehicle = 'orv7') {
  if (roverActive()) return
  roverQuick.on = quick === true
  useRover.setState({ vehicle, phase: 'drop', since: roverNow(), view: 'chase', kmh: 0, menu: false, canSample: false, sampling: false, result: null, next: null, edge: false })
}

/** 次の展開を飛ばすか（launchRover の quick） */
export const roverQuick = { on: false }

/** 与圧ローバー（ミチカケ）のいまの場所。CrewRover が毎フレーム書く（on = この星に出ている）。
 * 宇宙服で歩くとき、車体にぶつかる・後ろのエアロックから乗りこむのに使う */
export const crewPose = { on: false, x: 0, y: 0, z: 0, heading: 0 }

export function recallRover() {
  useRover.setState({ phase: 'none', since: roverNow(), kmh: 0, canSample: false, sampling: false, result: null, next: null, edge: false })
}

export const setRoverPhase = (phase: RoverPhase) => useRover.setState({ phase, since: roverNow() })

/** 運転の入力（キーボードと画面のボタンの両方から書き込む）。-1..1 */
export const roverInput = { throttle: 0, steer: 0, jump: false, sample: false, reset: false, jumpPower: 1 }
const keys = new Set<string>()

function fromKeys() {
  const f = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0
  const b = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0
  const l = keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0
  const r = keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0
  roverInput.throttle = f - b
  roverInput.steer = r - l
}

const DRIVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyV', 'KeyE', 'KeyR', 'KeyC'])

// ---- マウスで運転（PC、cratercamper さんの案 2026-11-12） ----
// 3D の画面をクリックするとマウスを固定（宇宙船・船外活動と同じ）。左右に動かすとハンドルが切れ、離すと少しずつまっすぐに戻る。
// ホイールで巡航の速さ（5 km/h ずつ）を決めると、アクセルを押さなくてもその速さで走る（右手だけで運転できる）。
// 右クリックでジャンプ、左クリックで採集（E）。Esc かホイールのクリックで固定をはずす。
// キーボードの ◀▶・▲▼ を押しているあいだは、キーのほうが勝つ。▼（ブレーキ）を押すと巡航は止まり、C でさっきの速さにもどる
// 2026-11-13（cratercamper さん）：マウスだけで空中から降りられるように。
//   地上：右クリックで小さなジャンプ、右ボタンを押し続けるほど大きく（1 秒で 100%）。離したときに跳ぶ
//   空中：右ボタンを押しているあいだ ▼ と同じく下へ噴射。ホイールを手前に回すと少しのあいだ下へ噴射。どちらも巡航は止めない
//   ホイールで巡航の速さが変わるのは、地上にいるときだけ

/** 巡航の速さの刻み（km/h） */
export const CRUISE_STEP = 5
/** マウスの動き（px）あたりのハンドルの切れ（-1..1） */
const MOUSE_STEER = 0.0045
/** 手を止めたとき、ハンドルがまっすぐに戻る速さ（1 秒あたり） */
const MOUSE_CENTER = 0.9

/** マウス運転の状態（steer は毎フレーム Rover が読む。cruise は km/h、0 は巡航なし） */
export const roverMouse = { locked: false, steer: 0, lastMove: 0, chargeAt: 0, sinkHold: false, sinkUntil: 0 }

/** 右ボタンで跳ぶ力をためきる時間（ms）と、いちばん小さいジャンプの力 */
const CHARGE_MS = 1000
const JUMP_MIN = 0.45
/** 空中でホイールを手前に 1 回まわしたときの、下への噴射の長さ（ms） */
const SINK_PULSE_MS = 350

/** 右ボタンでためているジャンプの力（0..1）。ためていなければ -1 */
export function jumpCharge() {
  const m = roverMouse
  if (!m.chargeAt) return -1
  return Math.min(1, (performance.now() - m.chargeAt) / CHARGE_MS)
}

/**
 * マウスで空中から降りる強さ（0..1、Rover が空中で毎フレーム読む）。
 * 地上でジャンプをためたまま宙に出た（崖から落ちた）ときは、そのまま下への噴射に切り替える
 */
export function mouseSink() {
  const m = roverMouse
  if (!m.locked) return 0
  if (m.chargeAt) {
    m.chargeAt = 0
    m.sinkHold = true
  }
  if (m.sinkHold) return 1
  return performance.now() < m.sinkUntil ? 0.6 : 0
}
export const useRoverCruise = create<{ cruise: number; last: number }>(() => ({ cruise: 0, last: 0 }))

const setCruise = (kmh: number) => {
  const cruise = Math.max(0, Math.min(Math.round(roverTop() * 3.6), kmh))
  useRoverCruise.setState((c) => ({ cruise, last: cruise > 0 ? cruise : c.last }))
}

/** 巡航を止める（速さは覚えておいて、C でもどせる） */
export const stopCruise = () => useRoverCruise.setState({ cruise: 0 })
/** C：さっきの巡航の速さにもどす（巡航中なら止める） */
export const toggleCruise = () => {
  const { cruise, last } = useRoverCruise.getState()
  if (cruise > 0) stopCruise()
  else if (last > 0) setCruise(last)
}

/**
 * Rover が毎フレーム読む、運転の入力：キーボード・画面のボタン（roverInput）に、マウスのハンドルと巡航を足したもの。
 * speed はローバーの今の速さ（m/s）
 */
/** 自動アクセル（レース中に Rally.tsx が毎フレーム入れる）：▲ を押していなくてもアクセル。▼ はブレーキのまま */
export const roverAutoGas = { on: false }

export function driveInput(speed: number, dt: number): { steer: number; throttle: number } {
  const m = roverMouse
  if (m.locked && performance.now() - m.lastMove > 80) m.steer -= Math.sign(m.steer) * Math.min(Math.abs(m.steer), MOUSE_CENTER * dt)
  const steer = roverInput.steer !== 0 ? roverInput.steer : m.locked ? m.steer : 0
  let throttle = roverInput.throttle
  if (throttle === 0 && roverAutoGas.on) return { steer, throttle: 1 }
  if (throttle < 0 && useRoverCruise.getState().cruise > 0) stopCruise()
  const cruise = useRoverCruise.getState().cruise / 3.6
  if (throttle === 0 && cruise > 0) {
    // 巡航：決めた速さより遅ければアクセル、速すぎればアクセルを離す（坂を下って速すぎるときだけ、軽くブレーキ）
    const dv = cruise - speed
    throttle = dv > 0.15 ? Math.min(1, dv / 1.5 + 0.25) : dv < -2.5 ? -0.4 : 0
  }
  return { steer, throttle }
}

/** マウスの固定をはずす */
export const releaseRoverMouse = () => {
  if (document.pointerLockElement) document.exitPointerLock()
}

/**
 * マウスで運転するための、3D の画面（canvas）のイベント。運転中（drive）だけ効く。
 * 固定していないときのホイールとドラッグは、今までどおり（カメラ）
 */
export function bindRoverMouse(el: HTMLElement) {
  const driving = () => useRover.getState().phase === 'drive'
  const lockChange = () => {
    roverMouse.locked = document.pointerLockElement === el
    roverMouse.steer = 0
    roverMouse.chargeAt = 0
    roverMouse.sinkHold = false
    useRover.setState({ mouse: roverMouse.locked })
  }
  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !driving()) return
    if (!roverMouse.locked) {
      if (e.button === 0) void el.requestPointerLock?.()
      return
    }
    e.preventDefault()
    e.stopImmediatePropagation()
    if (e.button === 0) roverInput.sample = true
    else if (e.button === 2) {
      // 地上ならジャンプをためはじめ、空中なら下へ噴射
      if (roverPose.grounded) roverMouse.chargeAt = performance.now()
      else roverMouse.sinkHold = true
    } else if (e.button === 1) releaseRoverMouse()
  }
  const up = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 2) return
    const m = roverMouse
    if (m.chargeAt && driving()) {
      roverInput.jumpPower = JUMP_MIN + (1 - JUMP_MIN) * Math.max(0, jumpCharge())
      roverInput.jump = true
    }
    m.chargeAt = 0
    m.sinkHold = false
  }
  const move = (e: PointerEvent) => {
    if (!roverMouse.locked) return
    e.stopImmediatePropagation()
    roverMouse.steer = Math.max(-1, Math.min(1, roverMouse.steer + e.movementX * MOUSE_STEER))
    if (e.movementX !== 0) roverMouse.lastMove = performance.now()
  }
  const wheel = (e: WheelEvent) => {
    if (!roverMouse.locked || !driving()) return
    e.preventDefault()
    e.stopImmediatePropagation()
    if (!roverPose.grounded) {
      // 空中：手前に回すと少しのあいだ下へ噴射（巡航の速さは変えない）
      if (e.deltaY > 0) roverMouse.sinkUntil = performance.now() + SINK_PULSE_MS
      return
    }
    const { cruise } = useRoverCruise.getState()
    setCruise(cruise + (e.deltaY < 0 ? CRUISE_STEP : -CRUISE_STEP))
  }
  const menu = (e: Event) => {
    if (roverMouse.locked) e.preventDefault()
  }
  // 運転をやめたら固定をはずす
  const unsub = useRover.subscribe((r, prev) => {
    if (r.phase !== prev.phase && r.phase !== 'drive') {
      releaseRoverMouse()
      stopCruise()
    }
  })
  document.addEventListener('pointerlockchange', lockChange)
  el.addEventListener('pointerdown', down, true)
  el.addEventListener('pointermove', move, true)
  el.addEventListener('pointerup', up, true)
  el.addEventListener('wheel', wheel, { capture: true, passive: false })
  el.addEventListener('contextmenu', menu)
  return () => {
    unsub()
    document.removeEventListener('pointerlockchange', lockChange)
    el.removeEventListener('pointerdown', down, true)
    el.removeEventListener('pointermove', move, true)
    el.removeEventListener('pointerup', up, true)
    el.removeEventListener('wheel', wheel, true)
    el.removeEventListener('contextmenu', menu)
    if (document.pointerLockElement === el) document.exitPointerLock()
    roverMouse.locked = false
  }
}

/** キーボード：WASD／矢印で走る、スペースでジャンプ、V で見方を切り替え */
export function bindRoverKeys() {
  const down = (e: KeyboardEvent) => {
    if (useRover.getState().phase !== 'drive' || !DRIVE_KEYS.has(e.code)) return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    e.preventDefault()
    e.stopPropagation()
    if (e.code === 'Space') {
      if (!e.repeat) roverInput.jump = true
      return
    }
    if (e.code === 'KeyR') {
      // レース：直前の門へ戻る
      if (!e.repeat) roverInput.reset = true
      return
    }
    if (e.code === 'KeyE') {
      if (!e.repeat) roverInput.sample = true
      return
    }
    if (e.code === 'KeyC') {
      if (!e.repeat) toggleCruise()
      return
    }
    if (e.code === 'KeyV') {
      if (!e.repeat) useRover.setState({ view: useRover.getState().view === 'chase' ? 'cam' : 'chase' })
      return
    }
    // ▼（ブレーキ）で巡航を止める
    if (e.code === 'KeyS' || e.code === 'ArrowDown') stopCruise()
    keys.add(e.code)
    fromKeys()
  }
  const up = (e: KeyboardEvent) => {
    if (!keys.delete(e.code)) return
    fromKeys()
  }
  const blur = () => {
    keys.clear()
    fromKeys()
  }
  window.addEventListener('keydown', down, true)
  window.addEventListener('keyup', up, true)
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', down, true)
    window.removeEventListener('keyup', up, true)
    window.removeEventListener('blur', blur)
    blur()
  }
}

/** 運転しているローバーの今の姿（レースの門の判定と順位、ゴーストの記録に使う）。Rover が毎フレーム書き込む */
export const roverPose = { x: 0, y: 0, z: 0, heading: 0, speed: 0, slip: 0, grounded: true, pitch: 0, roll: 0 }

/**
 * レースからローバーを動かす：place（スタートの列・直前の門へ置く）、locked（スタート前は動けない）、
 * paint（車体の色。null は白いまま）、push（ほかのローバーとぶつかったときの押し返し、m）
 */
export const roverCtl: {
  place?: (x: number, z: number, heading: number) => void
  locked: boolean
  paint: string | null
  push: { x: number; z: number }
} = { locked: false, paint: null, push: { x: 0, z: 0 } }

/** ローバーのいる場所（太陽の影を描く範囲をローバーに合わせるため） */
export const roverFocus = { x: 0, y: 0, z: -15, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z } }

// ---- 採集した岩の記録（天体ごとに、集めた種類の id。ブラウザに残す） ----

const LOG_KEY = 'rover-samples'

function readLog(): Record<string, string[]> {
  try {
    return JSON.parse(saveData.get(LOG_KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** 試料の記録（集めた種類の数を画面に出すため、変わったら数を増やす） */
export const useSampleLog = create<{ log: Record<string, string[]>; add: (bodyId: string, id: string) => boolean }>((set, get) => ({
  log: readLog(),
  /** 新しい種類なら true */
  add: (bodyId, id) => {
    const log = { ...get().log }
    const list = log[bodyId] ?? []
    if (list.includes(id)) return false
    log[bodyId] = [...list, id]
    set({ log })
    try {
      saveData.set(LOG_KEY, JSON.stringify(log))
    } catch {
      // 保存できなくても遊べる
    }
    return true
  },
}))

/** テスト用（#debug）：ローバーの位置を動かす */
export const roverDebug: {
  /** 確認用のカメラ：ローバーから見た [前, 右, 上, 見る高さ]（m） */
  cam?: [number, number, number, number]
  moveTo?: (site: number) => void; sites?: () => { x: number; z: number }[]; place?: (x: number, z: number, heading?: number) => void; rocks?: () => { x: number; z: number; r: number; h: number }[]; height?: (x: number, z: number) => number; drive?: () => Record<string, unknown> | null } = {}
