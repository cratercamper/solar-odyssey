import * as THREE from 'three'
import { SATURN_PARTS, type PartId } from './saturnCutaway'
import { GROUND_Y } from './launchSite'

// 観察パートのカメラ：ロケットのまわりを回る（ドラッグで回す、ホイール・2 本指で寄る）。
// 部品を選ぶと、その高さへ上がって寄る。タイムラプスのあいだは、西南西の遠くから夕日の側を見る（東から昇る月がロケットの向こうに入る）。
//
// 方位は北から東回り（度）。three の座標は x 東、z 南。

const DEG = Math.PI / 180

export const orbit = {
  /** カメラの方位・仰角（度）・距離（m）・見る高さ（m） */
  az: 236,
  el: 5,
  dist: 205,
  focus: 50,
  /** 目標（部品を選ぶと変わる。ホイールで dist の目標も変わる） */
  tDist: 205,
  tFocus: 50,
  /** 回って行く方位・仰角（null は指で回したまま） */
  tAz: null as number | null,
  tEl: null as number | null,
  /** 選んでいた部品（変わったら目標を入れかえる） */
  part: null as PartId | null,
  /** 触った（さわり方の案内を消すのに使う） */
  touched: false,
}

const MIN_DIST = 16
const MAX_DIST = 520

/** 観察を始めるとき */
export function resetOrbit() {
  Object.assign(orbit, { az: 236, el: 5, dist: 205, focus: 50, tDist: 205, tFocus: 50, part: null, touched: false, tAz: null, tEl: null })
}

/** 部品を選んだ・はずしたとき：寄る距離と高さ */
function aimAt(part: PartId | null) {
  orbit.part = part
  const p = SATURN_PARTS.find((x) => x.id === part)
  orbit.tDist = p ? p.dist : 205
  orbit.tFocus = p ? p.y : 50
  // エンジンは甲板の高さから、少し見上げる。押さえの腕と配管塔のあいだ（真南）から
  if (p?.id === 'f1') {
    orbit.tEl = 0
    orbit.tAz = 180
    return
  }
  // 塔（北）の側からは見えにくいので、北寄りにいたら南西へ回る
  const a = ((orbit.az % 360) + 360) % 360
  if (p && (a > 300 || a < 60)) orbit.tAz = a > 300 ? 280 : 100
}

/** 画面の上の指・マウスで回す。もどり値で外す */
export function bindOrbit(el: HTMLElement) {
  const pts = new Map<number, { x: number; y: number }>()
  let pinch = 0
  const down = (e: PointerEvent) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    el.setPointerCapture?.(e.pointerId)
    if (pts.size === 2) {
      const [a, b] = [...pts.values()]
      pinch = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }
  const move = (e: PointerEvent) => {
    const p = pts.get(e.pointerId)
    if (!p) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    p.x = e.clientX
    p.y = e.clientY
    if (pts.size === 1) {
      orbit.tAz = orbit.tEl = null
      orbit.az = orbit.az - dx * 0.28
      orbit.el = THREE.MathUtils.clamp(orbit.el + dy * 0.2, -6, 72)
      if (Math.abs(dx) + Math.abs(dy) > 2) orbit.touched = true
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch > 0 && d > 0) orbit.tDist = THREE.MathUtils.clamp(orbit.tDist * (pinch / d), MIN_DIST, MAX_DIST)
      pinch = d
      orbit.touched = true
    }
  }
  const up = (e: PointerEvent) => {
    pts.delete(e.pointerId)
    pinch = 0
  }
  const wheel = (e: WheelEvent) => {
    orbit.tDist = THREE.MathUtils.clamp(orbit.tDist * Math.exp(e.deltaY * 0.0012), MIN_DIST, MAX_DIST)
    orbit.touched = true
    e.preventDefault()
  }
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  el.addEventListener('wheel', wheel, { passive: false })
  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
    el.removeEventListener('wheel', wheel)
  }
}

/** タイムラプスの構図 */
// 少し下から見上げて、東の空（月の通り道）を高さ 35° ほどまで入れる
const TL = { az: 240, el: -9, dist: 300, focus: 90 }

/**
 * 観察・タイムラプスのカメラの位置と見る点。timelapse は 0（観察）〜1（タイムラプスの構図）。もどり値は画角（度）
 */
export function explorerCamera(dt: number, part: PartId | null, timelapse: number, want: THREE.Vector3, look: THREE.Vector3) {
  if (part !== orbit.part) aimAt(part)
  const k = 1 - Math.exp(-dt * 2.2)
  orbit.dist += (orbit.tDist - orbit.dist) * k
  orbit.focus += (orbit.tFocus - orbit.focus) * k
  if (orbit.tAz !== null) {
    let d = orbit.tAz - orbit.az
    d -= 360 * Math.round(d / 360)
    orbit.az += d * k
    if (Math.abs(d) < 0.2) orbit.tAz = null
  }
  if (orbit.tEl !== null) {
    orbit.el += (orbit.tEl - orbit.el) * k
    if (Math.abs(orbit.tEl - orbit.el) < 0.05) orbit.tEl = null
  }
  const tl = THREE.MathUtils.smoothstep(timelapse, 0, 1)
  // 方位は近い回り方で
  let daz = TL.az - orbit.az
  daz -= 360 * Math.round(daz / 360)
  const az = (orbit.az + daz * tl) * DEG
  const el = THREE.MathUtils.lerp(orbit.el, TL.el, tl) * DEG
  const dist = THREE.MathUtils.lerp(orbit.dist, TL.dist, tl)
  const focus = THREE.MathUtils.lerp(orbit.focus, TL.focus, tl)
  look.set(0, focus, 0)
  want.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(dist).add(look)
  // 地面・移動発射台の甲板にもぐらない
  const r = Math.hypot(want.x, want.z)
  want.y = Math.max(want.y, r < 26 ? 2.2 : GROUND_Y + 3)
  return THREE.MathUtils.lerp(44, 56, tl)
}
