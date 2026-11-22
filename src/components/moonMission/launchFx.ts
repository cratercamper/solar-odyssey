import * as THREE from 'three'
import { ICE, STEAM, type Smoke } from './smoke'
import { GROUND_Y } from './launchSite'

// 打ち上げの煙・湯気・氷のかけらを出すところ（LaunchWorld の毎コマから呼ぶ）。
// 煙の粒は「地面の組」の座標で動くので、ロケットの近くの点は地面の組へ直してから出す。

/** 液体酸素の換気口（機体の高さ m、半径 m、1 秒に出す湯気の数）。発射台では白い蒸気が流れ出て、ゆっくり沈む */
const VENTS: [number, number, number][] = [
  [38, 5.2, 7],
  [63, 5.2, 6],
  [83, 3.4, 5],
]
const Z = new THREE.Vector3(0, 0, 1)
const _v = new THREE.Vector3()
/** 煙の時計（噴き出しの強弱のゆらぎに使う） */
let clock = 0
/** 0〜1 のゆっくりした不規則なゆらぎ（いくつかの sin の重ね） */
const wobble = (t: number, k: number) => 0.5 + 0.25 * Math.sin(t * 0.9 + k * 1.7) + 0.15 * Math.sin(t * 2.3 + k * 4.1) + 0.1 * Math.sin(t * 5.1 + k * 0.6)

/** dt 秒に平均 rate 個（端数は確率で） */
export const count = (rate: number, dt: number) => Math.floor(rate * dt + Math.random())

export type FxCtx = {
  smoke: Smoke
  ground: THREE.Object3D
  nose: THREE.Vector3
  east: THREE.Vector3
  /** 高さ（m） */
  h: number
  /** 第1段の炎（0〜1） */
  s1On: number
  /** 点火してからの炎の育ち（0〜1） */
  ignite: number
  onPad: boolean
  dt: number
}

/** 煙の明かり（炎の位置と強さ・照明）を合わせ、このコマの煙を出す */
export function launchSmoke(c: FxCtx) {
  const { smoke, ground, nose, east, h, s1On, ignite, dt } = c
  ground.worldToLocal(_v.set(0, 0, 0).addScaledVector(nose, -20))
  smoke.material.uniforms.uFlame.value.copy(_v)
  smoke.material.uniforms.uFlamePower.value = s1On > 0 ? 1.4 * Math.max(0.15, 1 - h / 6000) : 0
  smoke.material.uniforms.uAmb.value = h < 20_000 ? 1 : 0
  // 液体酸素の冷たい蒸気：離昇まで、換気口から東西へ流れ出る
  if (c.onPad) {
    for (const [y, r, rate] of VENTS) {
      for (let i = count(rate, dt); i > 0; i--) {
        const side = Math.random() < 0.5 ? -1 : 1
        smoke.emit(side * r, y + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, side * (1.2 + Math.random() * 1.6), -0.3, (Math.random() - 0.5) * 1.2, 2 + Math.random() * 2, 6 + Math.random() * 3, 1.5, STEAM)
      }
    }
  }
  if (s1On > 0 && h < 900) {
    // 炎の溝から南北へ吹き出す。本物の写真（S72-55070）では、煙は地面をはって数百 m 広がり、
    // 炎に照らされた大きな入道雲のように、ロケットの高さを越えてもくもく立ち上がる。3 つに 1 つは、溝に撒く水の白い湯気
    // 粒の数は同じまま、出し方を不ぞろいにする：南北の強さがゆらいで、ときどき大きな塊（入道雲の芽）がどっと出る
    clock += dt
    const n = count(60 * (1 - h / 900) * ignite, dt)
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1
      const gust = wobble(clock, side)
      const steam = Math.random() < 0.3
      const big = Math.random() < 0.18
      const out = (60 + Math.random() * 170) * (0.55 + 0.9 * gust)
      // 大きさは 対数でばらつく（小さな粒がたくさん、大きな塊が少し）
      const size = (20 + 26 * Math.exp((Math.random() - 0.5) * 1.6)) * (big ? 1.6 : 1)
      const up = big ? 14 + Math.random() * 26 : 2 + Math.random() * 14
      const spread = (Math.random() - 0.5) * (big ? 46 : 30)
      smoke.emit((Math.random() - 0.5) * 24, GROUND_Y + 3, side * (45 + Math.random() * 50), spread, up, side * out, size, 26 + Math.random() * 22, big ? 2.2 : 1.5 + Math.random() * 0.6, steam ? STEAM : undefined)
    }
    // 甲板の穴のまわりからも、湯気が噴き上がる
    if (h < 60) {
      for (let i = count(14 * ignite, dt); i > 0; i--) {
        const ang = Math.random() * Math.PI * 2
        const r = 10 + Math.random() * 8
        smoke.emit(Math.cos(ang) * r, 1.5, Math.sin(ang) * r, Math.cos(ang) * 6, 3 + Math.random() * 4, Math.sin(ang) * 6, 5 + Math.random() * 4, 7, 1.6, STEAM)
      }
    }
  }
  // 氷のかけら：点火の揺れで、冷えた機体の霜がはがれて落ちる（離昇して少しのあいだ）
  if (s1On > 0 && ignite > 0.6 && h < 120) {
    for (let i = count(45, dt); i > 0; i--) {
      const ang = Math.random() * Math.PI * 2
      const r = 5.15
      _v.copy(nose).multiplyScalar(6 + Math.random() * 70).addScaledVector(east, Math.cos(ang) * r).addScaledVector(Z, Math.sin(ang) * r)
      ground.worldToLocal(_v)
      smoke.emit(_v.x, _v.y, _v.z, Math.cos(ang) * (0.5 + Math.random() * 2), -1 - Math.random() * 3, Math.sin(ang) * (0.5 + Math.random() * 2), 0.5 + Math.random() * 0.6, 4, 0, ICE)
    }
  }
  if (s1On > 0 && h > 60 && h < 7000) {
    // 上がっていく後ろに残る煙の柱。炎（長さ 100 m ほど）の先から下に残る（炎を隠さないように）
    const n = Math.ceil(dt * 30)
    for (let i = 0; i < n; i++) {
      ground.worldToLocal(_v.set((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10).addScaledVector(nose, -115 - Math.random() * 50))
      smoke.emit(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 4, -2, (Math.random() - 0.5) * 4, 16 + h * 0.004, 24, 1.8)
    }
  }
}
