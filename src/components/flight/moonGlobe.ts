import * as THREE from 'three'
import { pixels } from '../surface/dem'

// 月を丸ごと一つの球として描く（着陸船で月の空を飛ぶ：FlightView.tsx）。
//  ・高さ：月全体の標高地図（LRO の LOLA、2048×1024、tools/terrain/pack_moon_global.py）を双線形で読み、
//    その下の細かさ（5 km より小さな起伏）は決まった乱数の重ね合わせで足す。同じ場所はいつも同じ高さ
//  ・形：立方体の 6 面を四分木で分け、目に近いところほど細かいかけら（33×33 点）にする。かけらの頂点は
//    かけらの中心からの位置で持つので、月の半径（1,737 km）の大きさでも、低く飛んで地面がぶるぶるしない
//  ・月の向き：y が北極、x が経度 0（地球のほう）、経度は東が -z へ回る向き

export const MOON_R = 1_737_400

/** 標高地図（読み終わるまでは null） */
export type GlobalMap = { w: number; h: number; data: Float32Array }

const STEP = 4
const OFFSET = 9200

let mapPromise: Promise<GlobalMap> | null = null
export function loadMoonMap(): Promise<GlobalMap> {
  mapPromise ??= pixels(`${import.meta.env.BASE_URL}terrain/moon_global.webp`).then((px) => {
    const w = 2048
    const h = 1024
    const data = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) data[i] = (px[i * 4] * 256 + px[i * 4 + 1]) * STEP - OFFSET
    return { w, h, data }
  })
  mapPromise.catch(() => (mapPromise = null))
  return mapPromise
}

/** 単位ベクトル → 緯度・経度（ラジアン） */
export function latLon(d: THREE.Vector3) {
  return { lat: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)), lon: Math.atan2(-d.z, d.x) }
}

/** 緯度・経度 → 単位ベクトル */
export function dirOf(lat: number, lon: number, out = new THREE.Vector3()) {
  return out.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon))
}

function mapHeight(m: GlobalMap, x: number, y: number, z: number) {
  const lat = Math.asin(Math.max(-1, Math.min(1, y)))
  const lon = Math.atan2(-z, x)
  const u = ((lon + Math.PI) / (Math.PI * 2)) * m.w - 0.5
  const v = ((Math.PI / 2 - lat) / Math.PI) * m.h - 0.5
  let i0 = Math.floor(u)
  const fu = u - i0
  let j0 = Math.floor(v)
  const fv = v - j0
  const j1 = Math.min(m.h - 1, Math.max(0, j0 + 1))
  j0 = Math.min(m.h - 1, Math.max(0, j0))
  i0 = ((i0 % m.w) + m.w) % m.w
  const i1 = (i0 + 1) % m.w
  const a = m.data[j0 * m.w + i0]
  const b = m.data[j0 * m.w + i1]
  const c = m.data[j1 * m.w + i0]
  const d = m.data[j1 * m.w + i1]
  return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv
}

// ---- 細かい起伏（決まった乱数） ----
function hash(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function smooth(t: number) {
  return t * t * (3 - 2 * t)
}
/** 3 次元の値ノイズ（0〜1） */
function noise(x: number, y: number, z: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const fx = smooth(x - xi)
  const fy = smooth(y - yi)
  const fz = smooth(z - zi)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  return l(
    l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), fx), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), fx), fy),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), fx), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), fx), fy),
    fz,
  )
}
/** 波長（m）と高さ（m）。尾根の形（1 - |2n - 1|）で、クレーターのふちや丘のような起伏にする */
const OCTAVES: [number, number][] = [
  [6000, 150],
  [2400, 70],
  [900, 28],
  [350, 10],
  [120, 3],
]
function detail(x: number, y: number, z: number, upTo: number, maxWave = Infinity) {
  let h = 0
  for (const [wave, amp] of OCTAVES) {
    if (wave > maxWave) continue
    if (wave < upTo) break
    const k = MOON_R / wave
    const n = noise(x * k, y * k, z * k)
    h += (1 - Math.abs(2 * n - 1) - 0.5) * 2 * amp
  }
  return h
}

/**
 * クレーター（標高地図の 1 画素 5 km より小さなもの）。空間を立方体の升目に分け、升目ごとに 1 つまで、決まった乱数で置く。
 * 半径は升目の 1/4 まで、中心は升目のまんなか寄りなので、ふちの盛り上がりまで含めて升目の外へはみ出さない（となりを見なくてよい）
 */
const CRATER_CELLS: [number, number][] = [
  // 升目の大きさ（m）、ある確率
  [16000, 0.55],
  [5000, 0.6],
  [1600, 0.65],
  [500, 0.7],
  [160, 0.7],
]
function craters(x: number, y: number, z: number, minWave: number, maxCell = Infinity) {
  let h = 0
  for (let s = 0; s < CRATER_CELLS.length; s++) {
    const [cell, chance] = CRATER_CELLS[s]
    if (cell > maxCell) continue
    if (cell * 0.5 < minWave) break
    const k = MOON_R / cell
    const px = x * k
    const py = y * k
    const pz = z * k
    const cx = Math.floor(px)
    const cy = Math.floor(py)
    const cz = Math.floor(pz)
    if (hash(cx + 17 * s, cy, cz) > chance) continue
    // 中心（升目のまんなか ±0.1）と半径（升目の 0.06〜0.25、小さいものほど多い）
    const ox = cx + 0.4 + 0.2 * hash(cx, cy + 31 * s, cz)
    const oy = cy + 0.4 + 0.2 * hash(cx, cy, cz + 57 * s)
    const oz = cz + 0.4 + 0.2 * hash(cx + 91 * s, cy + 3, cz)
    const r = 0.06 + 0.19 * hash(cx + 5, cy + 7 * s, cz + 11) ** 2
    const d = Math.hypot(px - ox, py - oy, pz - oz) / r
    if (d > 1.45) continue
    const R = r * cell
    // おわん形の底と、盛り上がったふち（深さは直径の 1/5、ふちは深さの 1/4）
    const depth = R * 0.4
    let c: number
    if (d < 1) c = depth * (d * d - 1) + depth * 0.25 * smooth(d)
    else c = depth * 0.25 * (1 - smooth((d - 1) / 0.45))
    h += c
  }
  return h
}

/**
 * 細かい起伏だけ（決まった乱数）：本物の地図が maxWave（m）までの起伏を持っている所で、それより細かいぶんを足す。
 * 升目 maxWave より大きなクレーターと、波長 maxWave より長い起伏は足さない
 */
export function fineRelief(x: number, y: number, z: number, minWave: number, maxWave: number) {
  return detail(x, y, z, minWave, maxWave) + craters(x, y, z, minWave, maxWave)
}

/** その向き（単位ベクトル）の地面の高さ（月の球から、m）。minWave より小さな起伏は足さない（遠いかけら用） */
export function heightAt(m: GlobalMap, x: number, y: number, z: number, minWave = 0) {
  return mapHeight(m, x, y, z) + detail(x, y, z, minWave) + craters(x, y, z, minWave)
}

// ---- かけら（四分木） ----

/** かけらの一辺の点の数 - 1 */
export const SEG = 32
/** 立方体の面の基底（中心・u・v） */
const FACES: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
  [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1)],
  [new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
  [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)],
]

/** 面の上の点（-1〜1）→ 球の上の単位ベクトル。tan で引きのばして、かけらの大きさをそろえる */
export function cubeDir(face: number, s: number, t: number, out: THREE.Vector3) {
  const [c, u, v] = FACES[face]
  const a = Math.tan((s * Math.PI) / 4)
  const b = Math.tan((t * Math.PI) / 4)
  return out.set(c.x + u.x * a + v.x * b, c.y + u.y * a + v.y * b, c.z + u.z * a + v.z * b).normalize()
}

export type ChunkKey = { face: number; level: number; i: number; j: number }
export const keyOf = (k: ChunkKey) => `${k.face}/${k.level}/${k.i}/${k.j}`

/** かけらの一辺のおよその長さ（m） */
export const chunkSize = (level: number) => ((Math.PI / 2) * MOON_R) / 2 ** level

/** かけらの中心の向き（単位ベクトル） */
export function chunkCenterDir(k: ChunkKey, out = new THREE.Vector3()) {
  const n = 2 ** k.level
  return cubeDir(k.face, ((k.i + 0.5) / n) * 2 - 1, ((k.j + 0.5) / n) * 2 - 1, out)
}

const _d = new THREE.Vector3()

/**
 * かけらの形を作る。position はかけらの中心（返す center）からの位置。
 * dir は月の中心から見た向き（色の地図を読む）、normal は高さから求めた向き。ふちには下へ垂らした「すそ」を付けて、
 * 細かさのちがうかけらどうしのすき間をふさぐ。height を渡すと、地面の高さをそれで決める（月ミッションの谷の本物の地形など）
 */
export function buildChunk(m: GlobalMap, k: ChunkKey, height: (x: number, y: number, z: number, minWave: number) => number = (x, y, z, w) => heightAt(m, x, y, z, w)) {
  const n = 2 ** k.level
  const size = chunkSize(k.level)
  // 頂点の間隔より細かい起伏は足さない（遠くのかけらがざらつかない）
  const minWave = (size / SEG) * 2.5
  const G = SEG + 3 // まわりに 1 列ずつ余分に（法線をかけらのふちでもなめらかに）
  const pos = new Float64Array(G * G * 3)
  for (let jj = 0; jj < G; jj++)
    for (let ii = 0; ii < G; ii++) {
      const s = ((k.i + (ii - 1) / SEG) / n) * 2 - 1
      const t = ((k.j + (jj - 1) / SEG) / n) * 2 - 1
      cubeDir(k.face, s, t, _d)
      const r = MOON_R + height(_d.x, _d.y, _d.z, minWave)
      const o = (jj * G + ii) * 3
      pos[o] = _d.x * r
      pos[o + 1] = _d.y * r
      pos[o + 2] = _d.z * r
    }
  const cDir = chunkCenterDir(k)
  const ci = ((SEG / 2 + 1) * G + SEG / 2 + 1) * 3
  const center = new THREE.Vector3(pos[ci], pos[ci + 1], pos[ci + 2])
  const V = SEG + 1
  const skirt = 4 * V
  const count = V * V + skirt
  const position = new Float32Array(count * 3)
  const normal = new Float32Array(count * 3)
  const dir = new Float32Array(count * 3)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const nn = new THREE.Vector3()
  const p = (ii: number, jj: number, out: THREE.Vector3) => {
    const o = (jj * G + ii) * 3
    return out.set(pos[o], pos[o + 1], pos[o + 2])
  }
  const at = (ii: number, jj: number) => (jj * G + ii) * 3
  for (let j = 0; j < V; j++)
    for (let i = 0; i < V; i++) {
      const ii = i + 1
      const jj = j + 1
      const o = at(ii, jj)
      const v = j * V + i
      position[v * 3] = pos[o] - center.x
      position[v * 3 + 1] = pos[o + 1] - center.y
      position[v * 3 + 2] = pos[o + 2] - center.z
      p(ii + 1, jj, a).sub(p(ii - 1, jj, b))
      const dx = a.clone()
      p(ii, jj + 1, a).sub(p(ii, jj - 1, b))
      nn.crossVectors(dx, a).normalize()
      // 外向きに
      _d.set(pos[o], pos[o + 1], pos[o + 2]).normalize()
      if (nn.dot(_d) < 0) nn.negate()
      nn.toArray(normal, v * 3)
      _d.toArray(dir, v * 3)
    }
  // すそ：ふちの点を、かけらの大きさに応じて下へ
  const drop = Math.max(20, size * 0.03)
  const edge: number[] = []
  for (let i = 0; i < V; i++) edge.push(i) // 下のふち（j = 0）
  for (let j = 1; j < V; j++) edge.push(j * V + SEG) // 右
  for (let i = SEG - 1; i >= 0; i--) edge.push(SEG * V + i) // 上
  for (let j = SEG - 1; j >= 1; j--) edge.push(j * V) // 左
  edge.forEach((src, e) => {
    const v = V * V + e
    _d.fromArray(dir, src * 3)
    position[v * 3] = position[src * 3] - _d.x * drop
    position[v * 3 + 1] = position[src * 3 + 1] - _d.y * drop
    position[v * 3 + 2] = position[src * 3 + 2] - _d.z * drop
    normal.copyWithin(v * 3, src * 3, src * 3 + 3)
    dir.copyWithin(v * 3, src * 3, src * 3 + 3)
  })
  const index: number[] = []
  for (let j = 0; j < SEG; j++)
    for (let i = 0; i < SEG; i++) {
      const v0 = j * V + i
      const v1 = v0 + 1
      const v2 = v0 + V
      const v3 = v2 + 1
      index.push(v0, v1, v3, v0, v3, v2)
    }
  const E = edge.length
  for (let e = 0; e < E; e++) {
    const s0 = edge[e]
    const s1 = edge[(e + 1) % E]
    const k0 = V * V + e
    const k1 = V * V + ((e + 1) % E)
    // どちら向きでも見えるように両面（すそは細い帯なので安い）
    index.push(s0, k0, k1, s0, k1, s1, s0, k1, k0, s0, s1, k1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(position, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  g.setAttribute('dir', new THREE.BufferAttribute(dir, 3))
  g.setIndex(index)
  // 中心からいちばん遠い点まで（見えるかどうかの判定）
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), size * 0.75 + drop)
  return { geometry: g, center, cDir }
}
