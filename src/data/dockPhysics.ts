// 章3（ドッキング）の物理と、地球からの距離。画面や音に頼らない計算だけ（state/moonDock.ts が使う。テストあり）

import { GET, R_EARTH } from './apolloTimeline'

/** 近づく場面の早送り（本物の速さで、時間だけ 4 倍） */
export const DOCK_WARP = 4
/** つなげる条件：近づく速さ（m/s）と、横のずれ（m）。本物の決まりは 1 ft/s・1 ft ほど */
export const CAPTURE_SPEED = 0.35
export const CAPTURE_OFF = 0.25
/** 横・前後の噴射の加速度（m/s²。機械船の姿勢制御ロケット） */
export const THRUST = 0.05

export type Approach = {
  /** 探り棒の先から着陸船の口までの距離（m）と、近づく速さ（+ が近づく） */
  gap: number
  vz: number
  /** 横のずれ（m）と速さ */
  x: number
  y: number
  vx: number
  vy: number
  /** 入力：横（-1〜1）2 つと、前後（+1 が近づく） */
  input: { x: number; y: number; z: number }
}

export type Contact = { kind: 'capture'; speed: number; off: number } | { kind: 'bounce'; why: 'fast' | 'off'; speed: number; off: number }

/** おまかせ：横のずれと速さを打ち消し、遠いうちは 0.3 m/s、近づいたら 0.12 m/s ほどで */
export function autoPilot(a: Approach) {
  const i = a.input
  i.x = Math.max(-1, Math.min(1, (-a.x * 0.6 - a.vx * 2.4) / THRUST))
  i.y = Math.max(-1, Math.min(1, (-a.y * 0.6 - a.vy * 2.4) / THRUST))
  const off = Math.hypot(a.x, a.y)
  const want = off > 0.15 && a.gap < 4 ? 0.02 : Math.min(0.3, 0.1 + a.gap * 0.02)
  i.z = Math.max(-1, Math.min(1, ((want - a.vz) * 1.5) / THRUST))
}

/** 1 こま進める（dt は画面の秒）。口に届いたら、つながったか・はね返されたかを返す */
export function stepApproach(a: Approach, dt: number, auto: boolean): Contact | null {
  const h = dt * DOCK_WARP
  if (auto) autoPilot(a)
  const i = a.input
  a.vx += i.x * THRUST * h
  a.vy += i.y * THRUST * h
  a.vz += i.z * THRUST * h
  a.x += a.vx * h
  a.y += a.vy * h
  a.gap -= a.vz * h
  // 遠ざかりすぎ：場面から外れないように止める
  if (a.gap > 40) {
    a.gap = 40
    a.vz = Math.max(a.vz, 0)
  }
  if (a.gap > 0) return null
  const off = Math.hypot(a.x, a.y)
  const speed = a.vz
  if (speed <= CAPTURE_SPEED && off <= CAPTURE_OFF) {
    a.gap = 0
    a.vx = a.vy = a.vz = 0
    return { kind: 'capture', speed, off }
  }
  // はね返される
  a.gap = 0.02
  a.vz = -Math.min(0.3, Math.max(0.08, speed * 0.5))
  a.vx *= 0.3
  a.vy *= 0.3
  return { kind: 'bounce', why: speed > CAPTURE_SPEED ? 'fast' : 'off', speed, off }
}

/** 星：ずれ 8 cm 以内・0.04〜0.25 m/s で ★★★。はね返されたら 1 つ減る。おまかせは ★ */
export function dockStars(speed: number, off: number, tries: number, auto: boolean) {
  if (auto) return 1
  const s = off < 0.08 && speed >= 0.04 && speed <= 0.25 ? 3 : off < 0.16 ? 2 : 1
  return tries > 0 ? Math.max(1, s - 1) : s
}

/** 地球の中心からの距離（m）：月へ向かう点火のあと、経過時間から（放物線に近い軌道の近似。005:21 で高さ 33,500 km の記録に合わせた） */
export function earthDistance(get: number) {
  const r0 = R_EARTH + 330_000
  const dt = Math.max(0, get - GET.tliEnd)
  return Math.pow(Math.pow(r0, 1.5) + 1.128 * Math.sqrt(2 * 3.986e14) * dt, 2 / 3)
}
