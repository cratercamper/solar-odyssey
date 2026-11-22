import * as THREE from 'three'
import { ship } from './flight'
import { shipZoom } from './zoom'

// チャージビーム：ビームのボタン（F・クリック・スマホのボタン）を長押しして溜め、離して撃つ。
// 短く押したときは、これまでどおりの細いビーム（components/Phaser.tsx）。
// 入力は Phaser、見た目と破壊は ChargeBeam、ゲージや画面の暗さ・フラッシュは ui/BeamGauge が、ここの値を毎フレーム読む。

/** 段階が上がるまでの長押しの秒数（1段・2段・3段） */
export const CHARGE_STEPS = [0.5, 1.2, 2.0]

/** 段階ごとのビーム（添字 0 は使わない）。太さは自機の大きさに対する割合、広がりは半径の広がる角度 */
export const CHARGE_LEVELS = [
  null,
  { radius: 0.05, spread: 1.6, seconds: 1.0, range: 30, cooldown: 2.5, color: new THREE.Color(0.25, 0.55, 3.2) },
  { radius: 0.08, spread: 2.6, seconds: 1.4, range: 42, cooldown: 3.5, color: new THREE.Color(0.25, 2.1, 3.2) },
  { radius: 0.12, spread: 4.0, seconds: 1.8, range: 56, cooldown: 4.5, color: new THREE.Color(1.2, 2.2, 3.4) },
] as const

/** 撃ち終わってから、細くなって消えるまでの秒数 */
export const FADE_SECONDS = 0.45

/** 長押し・ビーム・クールダウンの今の様子（時刻は実時間の秒、performance.now() / 1000） */
export const beamCharge = {
  /** 溜めている最中か */
  charging: false,
  /** 溜め始めた時刻 */
  start: 0,
  /** 今の段階（0 はまだ溜まっていない） */
  level: 0,
  /** 撃っているビームの段階（0 は撃っていない。細くなって消えるあいだも段階を残す） */
  firing: 0,
  /** 撃ち始めた時刻（ヒットストップの分だけ後ろにずらす） */
  fireStart: 0,
  /** 次に溜められる時刻と、そのクールダウンの長さ */
  readyAt: 0,
  cooldown: 0,
  /** 撃った回数（細いビームもチャージビームも。配達の「ビームを撃たない」約束が見る） */
  shots: 0,
}

/** 画面や船を揺らす演出。Ship.tsx（船とカメラ）と BeamGauge（暗さとフラッシュ）が読む */
export const beamFx = {
  /** この時刻まで時間を止める（発射の瞬間のヒットストップ） */
  hitStopUntil: 0,
  /** 船体の小刻みな震え（0〜1） */
  tremble: 0,
  /** カメラの揺れ（0〜1、時間で減る） */
  shake: 0,
  /** 発射の瞬間の画面の白さ（0〜1、時間で減る） */
  flash: 0,
  /** 溜めているあいだ、周りを暗くする量（0〜1） */
  dim: 0,
  /** 追いかけカメラを少し上・後ろへ引く量（0〜1）。溜め始めから撃ち終わりまで */
  pose: 0,
}

export const now = () => performance.now() / 1000

/** 長押しの秒数から段階を出す */
export function levelFor(seconds: number) {
  let level = 0
  CHARGE_STEPS.forEach((s, i) => {
    if (seconds >= s) level = i + 1
  })
  return level
}

/** 溜められる（クールダウンが終わっている）か */
export const chargeReady = () => now() >= beamCharge.readyAt

/**
 * 発射口：円盤の前の縁の少し先（自機の模型の座標に、スケール 0.3 を掛けた値）。
 * 円盤の下にあると、後ろからのカメラでは溜めの光もビームの出だしも円盤に隠れてしまう
 */
const EMITTER = new THREE.Vector3(0, 0.05 * 0.3, -0.53 * 0.3)

/** 発射口の今の位置（world） */
export function muzzle(out: THREE.Vector3) {
  return out.copy(EMITTER).divideScalar(shipZoom.factor).applyQuaternion(ship.quaternion).add(ship.position)
}

const shakeDir = new THREE.Vector3()

/**
 * カメラの揺れとズームアウト。Ship.tsx がカメラを置いたあとに毎フレーム呼ぶ。
 * scale はカメラの揺れの大きさ（自機の大きさに合わせる）
 */
export function shakeCamera(camera: THREE.PerspectiveCamera, dt: number, scale: number) {
  const s = beamFx.shake
  if (s <= 0.001) return
  shakeDir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(s * scale * 0.06)
  camera.position.add(shakeDir)
  beamFx.shake = Math.max(0, s - dt * 2.2)
}

/** 発射の瞬間に時間を止める長さ */
export const HIT_STOP = 0.05

/** チャージビームを撃つ（長押しを離したとき） */
export function fireCharge(level: number) {
  const spec = CHARGE_LEVELS[level]
  if (!spec) return
  const t = now()
  beamCharge.firing = level
  beamCharge.fireStart = t + HIT_STOP
  beamCharge.cooldown = spec.cooldown
  beamCharge.readyAt = t + HIT_STOP + spec.seconds + FADE_SECONDS + spec.cooldown
  beamFx.hitStopUntil = t + HIT_STOP
  beamFx.flash = 1
  beamFx.shake = 0.5 + level * 0.25
}

/** ヒットストップで止まっているか */
export const hitStopped = () => now() < beamFx.hitStopUntil
