import * as THREE from 'three'
import { fineRelief, heightAt as globalHeight, loadMoonMap, type GlobalMap } from '../flight/moonGlobe'
import { detailAt, heightAt as demHeight, loadDem, pixels, type Dem } from '../surface/dem'
import { localXZ, orbitPlane, siteFrame, R_MOON } from '../../data/lunarDescent'

// 月ミッション第2弾の地面の高さ。月全体は LOLA の標高地図（moonGlobe.ts）、着陸地点のまわり 100 km 四方は
// タウルス・リトロウ谷の本物の地形（地表の場面と同じ moon_taurus：遠く 100 km・近く 16 km・細かい 3.2 km）に差しかえる。
// 境目はなめらかにつなぐ。高さは月の半径（1,737.4 km）からの m。

export const FRAME = siteFrame()

/** 地形の地図の範囲（半分、m）と、つなぎの幅 */
const FAR_HALF = 50_000
const FAR_BLEND = 9_000
const NEAR_HALF = 8_000
const NEAR_BLEND = 1_200

/**
 * 降下の道すじに沿った帯（tools/terrain/pack_moon_track.py）：着陸地点の 1,350 km 手前から 100 km 先まで、幅 240 km。
 * 本物の高さ（LRO の LOLA）と明るさ（かぐやの MI。影を含まない）、着陸の日の太陽の日なた・影。1 画素 238 m。
 * 座標は軌道の面（data/lunarDescent.ts orbitPlane）：th = 軌道に沿った角度（0 が着陸地点の真上、負が手前＝東）、ph = 横の角度
 */
export const TRACK = { th0: -0.78, th1: 0.06, ph: 0.07, w: 6144, h: 1024, step: 1, offset: 9200, albedoScale: 0.3750603497028351 }
export const TRACK_PLANE = orbitPlane(FRAME)
/** 帯の地図が持っている起伏の細かさ（m）。これより細かいぶんは、決まった乱数で足す */
const TRACK_WAVE = 700
export type TrackMap = { heights: Float32Array; sun: Uint8Array }

export type LunarMaps = {
  global: GlobalMap
  dem: Dem | null
  track: TrackMap | null
  /** 着陸地点（地図の原点）の、まわりの地図（帯、なければ月全体）での高さ */
  base: number
}

let maps: LunarMaps | null = null
let loading: Promise<LunarMaps> | null = null

/** 地図を読む（読み終わったら ground() が本物の高さを返す）。谷の地図が読めなくても、月全体の地図で続ける */
export function loadLunarMaps() {
  loading ??= Promise.all([loadMoonMap(), loadDem('moon_taurus').catch(() => null), loadTrack().catch(() => null)]).then(([global, dem, track]) => {
    const u = FRAME.up
    const base = track ? (trackHeight(track, u) ?? 0) : globalHeight(global, u.x, u.y, u.z, 20_000)
    maps = { global, dem, track, base }
    return maps
  })
  loading.catch(() => (loading = null))
  return loading
}

export const lunarMaps = () => maps

async function loadTrack(): Promise<TrackMap> {
  const px = await pixels(`${import.meta.env.BASE_URL}terrain/moon_track_h.webp`)
  const n = TRACK.w * TRACK.h
  const heights = new Float32Array(n)
  const sun = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    heights[i] = (px[i * 4] * 256 + px[i * 4 + 1]) * TRACK.step - TRACK.offset
    sun[i] = px[i * 4 + 2]
  }
  return { heights, sun }
}

/** 向き → 帯の上の位置（0〜1、0〜1）。帯の外も値を返す */
export function trackUV(d: THREE.Vector3) {
  const th = Math.atan2(d.dot(TRACK_PLANE.Q), d.dot(TRACK_PLANE.P))
  const ph = Math.asin(Math.max(-1, Math.min(1, d.dot(TRACK_PLANE.N))))
  return { u: (th - TRACK.th0) / (TRACK.th1 - TRACK.th0), v: (TRACK.ph - ph) / (2 * TRACK.ph) }
}

/** 帯のふちで、まわりの地図へなめらかにつなぐ重み（1 = 帯の中、0 = 外） */
function trackWeight(u: number, v: number) {
  if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return 0
  const eu = Math.min(u, 1 - u) * TRACK.w
  const ev = Math.min(v, 1 - v) * TRACK.h
  return smooth(0, 60, Math.min(eu, ev))
}

/** 帯の高さ（双線形）。帯の外は null */
function trackHeight(t: TrackMap, d: THREE.Vector3) {
  const { u, v } = trackUV(d)
  if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return null
  const x = u * TRACK.w - 0.5
  const y = v * TRACK.h - 0.5
  const i0 = Math.max(0, Math.min(TRACK.w - 2, Math.floor(x)))
  const j0 = Math.max(0, Math.min(TRACK.h - 2, Math.floor(y)))
  const fx = Math.max(0, Math.min(1, x - i0))
  const fy = Math.max(0, Math.min(1, y - j0))
  const H = t.heights
  const a = H[j0 * TRACK.w + i0]
  const b = H[j0 * TRACK.w + i0 + 1]
  const c = H[(j0 + 1) * TRACK.w + i0]
  const e = H[(j0 + 1) * TRACK.w + i0 + 1]
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy
}

/** 谷の地図の外の高さ：帯の中は本物の地図（＋細かい起伏）、外は月全体の地図 */
function outerHeight(d: THREE.Vector3, minWave: number) {
  const g = () => globalHeight(maps!.global, d.x, d.y, d.z, minWave)
  const t = maps!.track
  if (!t) return g()
  const { u, v } = trackUV(d)
  const w = trackWeight(u, v)
  if (w <= 0) return g()
  const h = (trackHeight(t, d) ?? 0) + fineRelief(d.x, d.y, d.z, minWave, TRACK_WAVE)
  return w >= 1 ? h : h * w + g() * (1 - w)
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** 谷の地図の高さ（地図の原点を 0）。範囲の外は null */
function valley(dem: Dem, x: number, z: number) {
  const far = demHeight(dem.far, x, z)
  if (far === null) return null
  const m = Math.max(Math.abs(x), Math.abs(z))
  if (m > NEAR_HALF) return far
  const near = demHeight(dem.near, x, z)
  if (near === null) return far
  let h = far + (near - far) * (1 - smooth(NEAR_HALF - NEAR_BLEND, NEAR_HALF - 50, m))
  if (dem.detail) h += detailAt(dem.detail, x, z)
  return h
}

/**
 * その向き（単位ベクトル）の地面の高さ（m、月の半径から）。minWave：それより小さな起伏は足さない（遠いかけら用）。
 * 地図を読む前は、着陸地点のおよその高さ
 */
export function groundAt(d: THREE.Vector3, minWave = 0) {
  if (!maps) return -2_945
  const k = d.dot(FRAME.up)
  if (maps.dem && k > 0.99) {
    const { x, z } = localXZ(FRAME, d)
    const m = Math.max(Math.abs(x), Math.abs(z))
    if (m < FAR_HALF) {
      const v = valley(maps.dem, x, z)
      if (v !== null) {
        const local = maps.base + v
        const w = smooth(FAR_HALF - FAR_BLEND, FAR_HALF - 200, m)
        if (w <= 0) return local
        return local + (outerHeight(d, Math.max(minWave, maps.track ? minWave : 2000)) - local) * w
      }
    }
  }
  return outerHeight(d, minWave)
}

/** 物理用（いつも細かく） */
export const ground = (d: THREE.Vector3) => groundAt(d, 0)

/** 谷の地図の中か（かけらを細かく分けるときに使う。0〜1：1 は近くの地図の中） */
export function valleyWeight(d: THREE.Vector3) {
  if (!maps?.dem || d.dot(FRAME.up) < 0.99) return 0
  const { x, z } = localXZ(FRAME, d)
  return 1 - smooth(NEAR_HALF, FAR_HALF, Math.max(Math.abs(x), Math.abs(z)))
}

export { R_MOON }

// ---- 太陽の影（谷の地図の上に、前もって計算しておく） ----

/**
 * 太陽の向き（月の中心から）。1972 年 12 月 11 日の着陸のとき、谷では太陽が東の空の低い所（約 13°）にあった。
 * 赤道の上、経度 107° の真上に太陽がある向き
 */
export const SUN_DIR = new THREE.Vector3(Math.cos((107 * Math.PI) / 180), -0.02, -Math.sin((107 * Math.PI) / 180)).normalize()

export type ShadowMap = { tex: THREE.DataTexture; half: number }

/**
 * 地図の各点から太陽の向きへ地形をたどり、山にさえぎられるかを調べる（1 = 日なた、0 = 影）。
 * 遠いほど月の丸みで地面が下がるぶんも入れる。影のふちは、さえぎる角度の差でぼかす。
 * 重いので、少しずつ（ほかの処理を止めないように）計算する
 */
export async function bakeShadow(dem: Dem, half: number, size: number, near: boolean): Promise<ShadowMap> {
  const data = new Uint8Array(size * size)
  const sx = SUN_DIR.dot(FRAME.east)
  const sz = -SUN_DIR.dot(FRAME.north)
  const su = SUN_DIR.dot(FRAME.up)
  const flat = Math.hypot(sx, sz)
  const dx = sx / flat
  const dz = sz / flat
  const tanEl = su / flat
  const cell = (half * 2) / size
  const h = near ? (x: number, z: number) => valley(dem, x, z) ?? 0 : (x: number, z: number) => demHeight(dem.far, x, z) ?? 0
  const reach = near ? 9_000 : 40_000
  let t0 = performance.now()
  for (let j = 0; j < size; j++) {
    const z = -half + (j + 0.5) * cell
    for (let i = 0; i < size; i++) {
      const x = -half + (i + 0.5) * cell
      const h0 = h(x, z) + 1
      let lit = 1
      let t = cell
      while (t < reach) {
        const px = x + dx * t
        const pz = z + dz * t
        const g = near && (Math.abs(px) > NEAR_HALF || Math.abs(pz) > NEAR_HALF) ? (demHeight(dem.far, px, pz) ?? -1e9) : h(px, pz)
        const ray = h0 + t * tanEl + (t * t) / (2 * R_MOON)
        // さえぎる高さの差を、距離に対する角度にして、ぼかす（太陽の見かけの大きさ 0.5° ほど）
        const k = (ray - g) / (t * 0.009) + 0.5
        if (k < lit) lit = k
        if (lit <= 0) break
        t *= 1.07
        t += cell * 0.3
      }
      data[j * size + i] = Math.round(Math.max(0, Math.min(1, lit)) * 255)
    }
    // 8 ms ごとにひと休み
    if (performance.now() - t0 > 8) {
      await new Promise((r) => setTimeout(r, 0))
      t0 = performance.now()
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return { tex, half }
}

let shadows: Promise<{ far: ShadowMap; near: ShadowMap } | null> | null = null
/** 谷の影（地図を読んだあと 1 回だけ） */
export function valleyShadows() {
  shadows ??= loadLunarMaps().then(async (m) => {
    if (!m.dem) return null
    const far = await bakeShadow(m.dem, 50_000, 384, false)
    const near = await bakeShadow(m.dem, NEAR_HALF, 512, true)
    return { far, near }
  })
  return shadows
}
