import * as THREE from 'three'
import { COLONY_LENGTH as L, COLONY_RADIUS as R, COLONY_REAL_KM } from '../../data/sf'
import { currentLevel, lowMemory } from '../../state/quality'
import { seeded } from './batch'

// スペースコロニーの中の街（3本の大地の帯の上）。
// 実際の円筒型コロニーの構想にならって、
// - 港（太陽と反対側の端）の軸からエレベーターで降りた所に駅と都心があり、
// - 帯のまん中を長さに沿って大通りと鉄道が走り、
// - 都心から離れるにつれて住宅地・公園・畑と森・村へ変わっていく。
// 回転で生まれる重力は上へ行くほど弱く、回転の影響（コリオリの力）も出るので、建物は低めで緑が多い。
// 地面の絵（道・区画・川・畑）と、立体の建物・木・夜の灯りは、同じ街の計画から作るので位置がそろう。

/** 1 m がコロニーの座標でいくつか */
export const M = L / (COLONY_REAL_KM * 1000)
const DEG = Math.PI / 180
/** 大地の帯の幅（m）。円周の 60° ぶん */
const STRIP_W = R / M * 60 * DEG
const STRIP_L = L / M

export type ZoneKind = 'hill' | 'downtown' | 'town' | 'urban' | 'suburb' | 'park' | 'farm' | 'lake'
type Zone = { t0: number; t1: number; kind: ZoneKind }

/** 帯ごとの区画（t は港側の端 0 から太陽側の端 1 まで） */
const ZONES: Zone[][] = [
  [
    { t0: 0, t1: 0.02, kind: 'hill' },
    { t0: 0.02, t1: 0.15, kind: 'downtown' },
    { t0: 0.15, t1: 0.32, kind: 'urban' },
    { t0: 0.32, t1: 0.42, kind: 'park' },
    { t0: 0.42, t1: 0.5, kind: 'town' },
    { t0: 0.5, t1: 0.64, kind: 'suburb' },
    { t0: 0.64, t1: 0.92, kind: 'farm' },
    { t0: 0.92, t1: 1, kind: 'lake' },
  ],
  [
    { t0: 0, t1: 0.02, kind: 'hill' },
    { t0: 0.02, t1: 0.11, kind: 'downtown' },
    { t0: 0.11, t1: 0.24, kind: 'urban' },
    { t0: 0.24, t1: 0.4, kind: 'suburb' },
    { t0: 0.4, t1: 0.52, kind: 'park' },
    { t0: 0.52, t1: 0.6, kind: 'town' },
    { t0: 0.6, t1: 0.7, kind: 'suburb' },
    { t0: 0.7, t1: 0.94, kind: 'farm' },
    { t0: 0.94, t1: 1, kind: 'lake' },
  ],
  [
    { t0: 0, t1: 0.02, kind: 'hill' },
    { t0: 0.02, t1: 0.12, kind: 'downtown' },
    { t0: 0.12, t1: 0.28, kind: 'urban' },
    { t0: 0.28, t1: 0.36, kind: 'park' },
    { t0: 0.36, t1: 0.5, kind: 'suburb' },
    { t0: 0.5, t1: 0.58, kind: 'town' },
    { t0: 0.58, t1: 0.9, kind: 'farm' },
    { t0: 0.9, t1: 1, kind: 'lake' },
  ],
]

/** 帯の中の建物 1 棟（s: 帯の中心からの横の位置 m、y: 港側の端からの長さ m） */
export type Building = { s: number; y: number; w: number; d: number; h: number; color: number }
export type Block = { s0: number; s1: number; y0: number; y1: number; kind: ZoneKind; park: boolean }
export type Tree = { s: number; y: number; h: number; color: number }
export type CityPlan = {
  zones: Zone[]
  blocks: Block[]
  buildings: Building[]
  trees: Tree[]
  /** 村（畑の中の小さな集落）の中心 */
  villages: { s: number; y: number; r: number }[]
  /** 川の中心の横の位置（m） */
  river: (y: number) => number
  /** 湖（公園の中と、太陽側の端） */
  lakes: { s: number; y: number; rs: number; ry: number }[]
}

/** 大通り（鉄道を含む）の半分の幅 */
export const AVENUE = 40
export const STREET = 14
export const RIVER_W = 70
export const EDGE = 140

const BUILD_COLORS = [0xe9e6de, 0xd9d4c8, 0xc9ccd0, 0xb8c2cc, 0xe4dccb, 0xd0c4b0, 0xa9b6c4, 0xf2f0ea, 0xc2b8a6]
const HOUSE_COLORS = [0xeae4d8, 0xd8cfbf, 0xc9b9a0, 0xb9c3c8, 0xe6dfd3, 0xb7a68c]
const TREE_COLORS = [0x3f6a36, 0x4a7a3c, 0x365d30, 0x55803f, 0x2f5530]

const plans: (CityPlan | undefined)[] = []

/** 帯 k（0〜2）の街の計画。どのコロニーも同じなので、いちど作って使い回す */
export function cityPlan(k: number): CityPlan {
  const cached = plans[k]
  if (cached) return cached
  const rand = seeded(101 + k * 37)
  const zones = ZONES[k]
  const ph = rand() * 6
  const riverSide = k === 1 ? 1 : -1
  const river = (y: number) => {
    const t = y / STRIP_L
    return riverSide * STRIP_W * (0.3 + 0.06 * Math.sin(t * 9 + ph) + 0.02 * Math.sin(t * 31 + ph * 2))
  }
  const lakes: CityPlan['lakes'] = []
  const blocks: Block[] = []
  const buildings: Building[] = []
  const trees: Tree[] = []
  const villages: CityPlan['villages'] = []
  const pick = (list: number[]) => list[Math.floor(rand() * list.length)]

  for (const z of zones) {
    const y0 = z.t0 * STRIP_L
    const y1 = z.t1 * STRIP_L
    if (z.kind === 'lake') {
      lakes.push({ s: -riverSide * STRIP_W * 0.18, y: (y0 + y1) / 2, rs: 420, ry: (y1 - y0) * 0.32 })
      continue
    }
    if (z.kind === 'park') {
      lakes.push({ s: -riverSide * STRIP_W * 0.2, y: (y0 + y1) / 2, rs: 260, ry: (y1 - y0) * 0.22 })
      // 公園の木立
      for (let i = 0; i < 900; i++) {
        const s = (rand() - 0.5) * (STRIP_W - EDGE * 2)
        const y = y0 + rand() * (y1 - y0)
        if (Math.abs(s) < AVENUE + 20 || Math.abs(s - river(y)) < RIVER_W) continue
        const lake = lakes[lakes.length - 1]
        if (((s - lake.s) / lake.rs) ** 2 + ((y - lake.y) / lake.ry) ** 2 < 1.15) continue
        if (rand() < 0.35) continue
        trees.push({ s, y, h: 10 + rand() * 12, color: pick(TREE_COLORS) })
      }
      continue
    }
    if (z.kind === 'hill') continue
    if (z.kind === 'farm') {
      // 畑の中の村と、まわりの木
      const n = 5 + Math.floor(rand() * 3)
      for (let i = 0; i < n; i++) {
        const y = y0 + ((i + 0.3 + rand() * 0.4) / n) * (y1 - y0)
        let s = (rand() - 0.5) * (STRIP_W - EDGE * 3)
        if (Math.abs(s) < AVENUE + 120) s = Math.sign(s || 1) * (AVENUE + 160 + rand() * 300)
        if (Math.abs(s - river(y)) < RIVER_W + 120) s = river(y) + Math.sign(s - river(y) || 1) * (RIVER_W + 180)
        const r = 140 + rand() * 120
        villages.push({ s, y, r })
        for (let j = 0; j < 40; j++) {
          const a = rand() * Math.PI * 2
          const d = Math.sqrt(rand()) * r
          buildings.push({ s: s + Math.cos(a) * d, y: y + Math.sin(a) * d, w: 9 + rand() * 6, d: 10 + rand() * 8, h: 6 + rand() * 4, color: pick(HOUSE_COLORS) })
        }
        for (let j = 0; j < 30; j++) {
          const a = rand() * Math.PI * 2
          const d = r * (1 + rand() * 0.6)
          trees.push({ s: s + Math.cos(a) * d, y: y + Math.sin(a) * d, h: 9 + rand() * 9, color: pick(TREE_COLORS) })
        }
      }
      // 畑のあいだの林（防風林）
      for (let i = 0; i < 700; i++) {
        const y = y0 + rand() * (y1 - y0)
        const row = Math.round(y / 900) * 900
        const s = (rand() - 0.5) * (STRIP_W - EDGE * 2)
        if (Math.abs(s) < AVENUE + 20 || Math.abs(s - river(row)) < RIVER_W) continue
        trees.push({ s, y: row + (rand() - 0.5) * 30, h: 10 + rand() * 8, color: pick(TREE_COLORS) })
      }
      continue
    }

    // 街：碁盤の目の区画
    const dense = z.kind === 'downtown' ? 1 : z.kind === 'town' ? 0.7 : z.kind === 'urban' ? 0.45 : 0.2
    const along = z.kind === 'suburb' ? 190 : z.kind === 'urban' ? 160 : 140
    const across = z.kind === 'suburb' ? 150 : 120
    const mid = (y0 + y1) / 2
    for (let y = y0 + 40; y + along <= y1 - 20; y += along) {
      // 何区画かごとに、横切る広い通り
      const blockRow = Math.round((y - y0) / along)
      const by0 = y + (blockRow % 6 === 0 ? STREET * 1.8 : STREET / 2)
      const by1 = y + along - STREET / 2
      for (let s = -STRIP_W / 2 + EDGE; s + across <= STRIP_W / 2 - EDGE; s += across) {
        const bs0 = s + STREET / 2
        const bs1 = s + across - STREET / 2
        const cs = (bs0 + bs1) / 2
        const cy = (by0 + by1) / 2
        if (bs1 > -AVENUE - 10 && bs0 < AVENUE + 10) continue
        if (Math.abs(cs - river(cy)) < RIVER_W + across / 2) continue
        const park = rand() < (z.kind === 'downtown' ? 0.06 : 0.09)
        blocks.push({ s0: bs0, s1: bs1, y0: by0, y1: by1, kind: z.kind, park })
        if (park) {
          for (let i = 0; i < 14; i++) trees.push({ s: bs0 + rand() * (bs1 - bs0), y: by0 + rand() * (by1 - by0), h: 9 + rand() * 9, color: pick(TREE_COLORS) })
          continue
        }
        // 大通りと区画の中心に近いほど高い
        const nearAve = 1 - Math.min(1, Math.abs(cs) / (STRIP_W * 0.45))
        const nearMid = 1 - Math.min(1, Math.abs(cy - mid) / ((y1 - y0) / 2))
        const tall = dense * (0.35 + 0.65 * nearAve * (0.4 + 0.6 * nearMid))
        if (z.kind === 'suburb') {
          // 庭のある家と、低い集合住宅
          for (let i = 0; i < 4; i++)
            for (let j = 0; j < 5; j++) {
              if (rand() < 0.22) continue
              const w = 10 + rand() * 6
              const d = 10 + rand() * 7
              const s0 = bs0 + ((i + 0.5) / 4) * (bs1 - bs0)
              const y0b = by0 + ((j + 0.5) / 5) * (by1 - by0)
              buildings.push({ s: s0, y: y0b, w, d, h: 6 + rand() * 4, color: pick(HOUSE_COLORS) })
              if (rand() < 0.35) trees.push({ s: s0 + (rand() - 0.5) * 20, y: y0b + (rand() - 0.5) * 20, h: 7 + rand() * 6, color: pick(TREE_COLORS) })
            }
          continue
        }
        // 区画を 2×2 か 2×3 に分けて、それぞれに 1 棟
        const nx = 2
        const ny = z.kind === 'urban' ? 3 : 2
        for (let i = 0; i < nx; i++)
          for (let j = 0; j < ny; j++) {
            if (z.kind === 'urban' && rand() < 0.12) continue
            const lw = (bs1 - bs0) / nx
            const ld = (by1 - by0) / ny
            const w = lw * (0.6 + rand() * 0.3)
            const d = ld * (0.6 + rand() * 0.3)
            const s0 = bs0 + (i + 0.5) * lw + (rand() - 0.5) * (lw - w) * 0.8
            const y0b = by0 + (j + 0.5) * ld + (rand() - 0.5) * (ld - d) * 0.8
            const h = z.kind === 'urban' ? 9 + rand() * 18 + tall * 12 : 14 + Math.pow(rand(), 1.6) * 70 * tall + tall * 22
            const color = pick(BUILD_COLORS)
            buildings.push({ s: s0, y: y0b, w, d, h, color })
            // 高い建物には、ひとまわり細い上の階
            if (h > 45 && rand() < 0.6) buildings.push({ s: s0, y: y0b, w: w * 0.62, d: d * 0.62, h: h + 8 + rand() * 18, color })
          }
        // 街路樹
        if (rand() < 0.7) for (let i = 0; i < 6; i++) trees.push({ s: rand() < 0.5 ? bs0 - 4 : bs1 + 4, y: by0 + rand() * (by1 - by0), h: 7 + rand() * 4, color: pick(TREE_COLORS) })
      }
    }
  }
  // 大通りの並木
  for (let y = 0.02 * STRIP_L; y < 0.92 * STRIP_L; y += 60)
    for (const side of [-1, 1]) if (rand() < 0.8) trees.push({ s: side * (AVENUE - 6), y, h: 8 + rand() * 4, color: pick(TREE_COLORS) })
  // 川沿いの木
  for (let y = 0; y < STRIP_L; y += 50) for (const side of [-1, 1]) if (rand() < 0.5) trees.push({ s: river(y) + side * (RIVER_W / 2 + 12), y, h: 9 + rand() * 8, color: pick(TREE_COLORS) })
  // エレベーターの下の駅（港側の端、大通りの始まり）
  buildings.push({ s: 0, y: 0.02 * STRIP_L - 160, w: 260, d: 240, h: 34, color: 0xdfe4ea })
  buildings.push({ s: 0, y: 0.02 * STRIP_L - 160, w: 120, d: 120, h: 58, color: 0xc4ccd6 })

  const plan: CityPlan = { zones, blocks, buildings, trees, villages, river, lakes }
  plans[k] = plan
  return plan
}

/** 帯の上の (s, y) を、キャンバスの (x, y) へ */
export const toCanvas = (s: number, y: number, W: number, H: number) => [(s / STRIP_W + 0.5) * W, (1 - y / STRIP_L) * H] as const
export const meters = { width: STRIP_W, length: STRIP_L }

/* ---------- 昼と夜 ---------- */

/** コロニーの 1 日（秒）。昼が長く、夕方・夜・朝を経て戻る */
const DAY = 300
const hashTime = new URLSearchParams(location.hash.split('?')[1] ?? '').get('colonytime')
/** 0 = 昼、1 = 夜。override があればそれを使う（確認用。#...?colonytime=night） */
export const colonyDay = { night: hashTime === 'night' ? 1 : 0, override: hashTime === 'night' ? 1 : hashTime === 'day' ? 0 : (null as number | null) }

export function updateColonyDay(elapsed: number) {
  if (colonyDay.override !== null) {
    colonyDay.night = colonyDay.override
    return
  }
  // 最初の 3 分は昼。そのあと 20 秒で日が暮れ、80 秒の夜、20 秒で夜明け
  const t = (elapsed + 20) % DAY
  const n = t < 180 ? 0 : t < 200 ? (t - 180) / 20 : t < 280 ? 1 : 1 - (t - 280) / 20
  colonyDay.night = n * n * (3 - 2 * n)
}

/* ---------- 立体の建物 ---------- */

/**
 * コロニーの中を歩く場面で、歩く人のまわりを細かく描いている範囲（そこにある遠くの建物と木は消す）。
 * x = 角度の中心、y = 角度の半分の幅（0 なら何も消さない）、z = コロニーの座標の長さの向きの中心、w = その半分の幅
 */
export const farHide = { value: new THREE.Vector4(0, 0, 0, 0) }
const FAR_HIDE = `
#ifdef USE_INSTANCING
if (uFarHide.y > 0.0) {
  vec3 ic = instanceMatrix[3].xyz;
  float da = atan(ic.x, ic.z) - uFarHide.x;
  da -= 6.2831853 * floor((da + 3.14159265) / 6.2831853);
  if (abs(da) < uFarHide.y && abs(ic.y - uFarHide.z) < uFarHide.w) transformed = vec3(0.0);
}
#endif`

/** 建物の材質：昼は窓の並ぶ壁、夜は暗い壁にともる窓。形は 1×1×1 の箱を、置き場所ごとの大きさに引き伸ばす */
export const buildingMaterial = (() => {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const uniforms = { uNight: { value: 0 }, uCell: { value: new THREE.Vector2(4.2 * M, 3.6 * M) }, uFarHide: farHide }
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec2 uCell;
uniform vec4 uFarHide;
varying vec2 vFac;
varying float vRoof;
varying float vShade;
varying vec2 vSeed;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vSeed = instanceMatrix[3].xz * 3000.0;
#else
vec3 sc = vec3(1.0);
vSeed = vec2(0.0);
#endif
vec3 p = position * sc;
vRoof = step(0.5, abs(normal.y));
vShade = normal.y > 0.5 ? 1.0 : normal.y < -0.5 ? 0.4 : abs(normal.x) > 0.5 ? 0.8 : 0.66;
vFac = vec2(abs(normal.x) > 0.5 ? p.z : p.x, p.y + 0.5 * sc.y) / uCell;
${FAR_HIDE}`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uNight;
varying vec2 vFac;
varying float vRoof;
varying float vShade;
varying vec2 vSeed;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec2 fw = fwidth(vFac);
vec2 f = fract(vFac);
vec2 cell = floor(vFac);
float inWin = step(0.16, f.x) * step(f.x, 0.84) * step(0.3, f.y) * step(f.y, 0.84);
// 窓が画面で点より小さいときは、ちらつかないよう平均の明るさにする
float blur = clamp(max(fw.x, fw.y) * 1.2 - 0.3, 0.0, 1.0);
float ground = step(1.0, cell.y);
float win = mix(inWin * ground, 0.36, blur) * (1.0 - vRoof);
float h = fract(sin(dot(cell + floor(vSeed), vec2(12.9898, 78.233))) * 43758.5453);
float lit = mix(step(0.5, h), 0.5, blur);
vec3 base = diffuseColor.rgb * vShade;
vec3 dayC = mix(base, base * vec3(0.38, 0.46, 0.58), win);
vec3 warm = mix(vec3(1.7, 1.25, 0.7), vec3(1.2, 1.35, 1.6), step(0.85, h));
vec3 nightC = base * 0.05 + win * lit * warm + (1.0 - ground) * (1.0 - vRoof) * vec3(0.9, 0.7, 0.4) * 0.5;
diffuseColor.rgb = mix(dayC, nightC, uNight);`,
      )
  }
  mat.customProgramCacheKey = () => 'colony-building'
  return Object.assign(mat, { uniforms })
})()

/** 木：丸い樹冠（上が明るい）。夜は暗くなる */
export const treeMaterial = (() => {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFarHide = farHide
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 uFarHide;').replace('#include <begin_vertex>', `#include <begin_vertex>\n${FAR_HIDE}`)
  }
  mat.customProgramCacheKey = () => 'colony-tree'
  return mat
})()
const TREE_DAY = new THREE.Color(1, 1, 1)
const TREE_NIGHT = new THREE.Color(0.06, 0.07, 0.1)

export function applyNight(n: number) {
  buildingMaterial.uniforms.uNight.value = n
  treeMaterial.color.lerpColors(TREE_DAY, TREE_NIGHT, n)
}

/** 帯の中心角 angle の上の (s, y, 地面からの高さ) を、コロニーの座標へ */
export function onLand(angle: number, s: number, y: number, up: number, out = new THREE.Vector3()) {
  const a = angle + (s * M) / R
  const r = R * 0.999 - up * M
  return out.set(Math.sin(a) * r, -L / 2 + y * M, Math.cos(a) * r)
}

const basis = new THREE.Matrix4()
const pos = new THREE.Vector3()
const side = new THREE.Vector3()
const upV = new THREE.Vector3()
const along = new THREE.Vector3(0, 1, 0)
const scaleM = new THREE.Matrix4()
const color = new THREE.Color()

/** 地面に立てる行列（箱の x が円周、y が上＝軸の向き、z が長さの向き） */
function standing(angle: number, s: number, y: number, w: number, h: number, d: number, out: THREE.Matrix4) {
  const a = angle + (s * M) / R
  onLand(angle, s, y, h / 2 - 2, pos)
  upV.set(-Math.sin(a), 0, -Math.cos(a))
  side.set(Math.cos(a), 0, -Math.sin(a))
  basis.makeBasis(side, upV, along).setPosition(pos)
  return out.multiplyMatrices(basis, scaleM.makeScale(w * M, h * M, d * M))
}

export type Instances = { matrix: THREE.InstancedBufferAttribute; color: THREE.InstancedBufferAttribute; count: number }
let buildingSet: Instances | null = null
let treeSet: Instances | null = null

/** 画質が低いときは、住宅地の小さな建物と木を間引く */
const density = () => (lowMemory() ? 0.4 : currentLevel() === 'low' ? 0.5 : currentLevel() === 'medium' ? 0.75 : 1)

function instances<T>(list: (T & { angle: number })[], toMatrix: (item: T & { angle: number }, m: THREE.Matrix4) => void, toColor: (item: T) => number): Instances {
  const matrix = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 16), 16)
  const col = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3)
  const m = new THREE.Matrix4()
  list.forEach((item, i) => {
    toMatrix(item, m)
    m.toArray(matrix.array as Float32Array, i * 16)
    color.setHex(toColor(item))
    color.toArray(col.array as Float32Array, i * 3)
  })
  return { matrix, color: col, count: list.length }
}

const stripCenter = (k: number) => k * 120 * DEG

export function buildingInstances(): Instances {
  if (buildingSet) return buildingSet
  const keep = density()
  const rand = seeded(7)
  const list: (Building & { angle: number })[] = []
  for (let k = 0; k < 3; k++)
    for (const b of cityPlan(k).buildings) {
      // 小さな建物（家）だけを間引く
      if (b.h < 12 && rand() > keep) continue
      list.push({ ...b, angle: stripCenter(k) })
    }
  buildingSet = instances(list, (b, m) => standing(b.angle, b.s, b.y, b.w, b.h, b.d, m), (b) => b.color)
  return buildingSet
}

export function treeInstances(): Instances {
  if (treeSet) return treeSet
  treeSet = treeInstancesWhere(() => true)
  return treeSet
}

/** 木の配置のうち、keepTree が true のものだけ（コロニーの中を歩く場面で、近くの木を別の形で描くとき）。共有しない */
export function treeInstancesWhere(keepTree: (k: number, t: Tree) => boolean): Instances {
  const keep = density()
  const rand = seeded(8)
  const list: (Tree & { angle: number })[] = []
  for (let k = 0; k < 3; k++) for (const t of cityPlan(k).trees) if (rand() < keep && keepTree(k, t)) list.push({ ...t, angle: stripCenter(k) })
  return instances(list, (t, m) => standing(t.angle, t.s, t.y, t.h * 0.8, t.h, t.h * 0.8, m), (t) => t.color)
}

let boxGeo: THREE.BoxGeometry | null = null
let treeGeo: THREE.BufferGeometry | null = null

/** 箱（建物）。底の面はいらないが、簡単のため箱のまま */
export function buildingGeometry() {
  return (boxGeo ??= new THREE.BoxGeometry(1, 1, 1))
}

let treeLiteGeo: THREE.BufferGeometry | null = null

/** 樹冠：少しつぶれた丸。上が明るく、下が暗い（頂点の色） */
export function treeGeometry() {
  return (treeGeo ??= crownGeometry(1))
}

/** 樹冠の粗い版（三角形 20 枚。細かい版の 4 分の 1）。コロニーの外から窓ごしに見るとき用 */
export function treeLiteGeometry() {
  return (treeLiteGeo ??= crownGeometry(0))
}

function crownGeometry(detail: number) {
  const g = new THREE.IcosahedronGeometry(0.5, detail)
  g.translate(0, 0.1, 0)
  const p = g.attributes.position
  const c = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const v = 0.55 + (p.getY(i) + 0.4) * 0.6
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = Math.min(1.1, v)
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  return g
}

/** 共有の配置（行列と色）を使う InstancedMesh。コロニーごとに 1 つ作るが、中身は共有 */
export function sharedInstancedMesh(geo: THREE.BufferGeometry, mat: THREE.Material, set: Instances) {
  const mesh = new THREE.InstancedMesh(geo, mat, 0)
  mesh.instanceMatrix = set.matrix
  mesh.instanceColor = set.color
  mesh.count = set.count
  // 帯の全体を包む球（中にいると常に見えるので、ほぼ省けないが、外からの判定用）
  mesh.frustumCulled = false
  return mesh
}

/* ---------- 地面の絵 ---------- */

const ZONE_GROUND: Record<ZoneKind, string> = {
  hill: '#4f6b3c',
  downtown: '#a7a59e',
  town: '#a9a69a',
  urban: '#9c9c90',
  suburb: '#7f9161',
  park: '#5d8a46',
  farm: '#6d8f47',
  lake: '#5a7d44',
}

/** 区画・道・川・湖・畑を、大地のキャンバスに描く */
export function drawCityGround(g: CanvasRenderingContext2D, W: number, H: number, k: number, rand: () => number) {
  const plan = cityPlan(k)
  const px = (s: number, y: number) => toCanvas(s, y, W, H)
  const sx = W / STRIP_W
  const sy = H / STRIP_L
  // 区画ごとの地面
  for (const z of plan.zones) {
    const [, ya] = px(0, z.t1 * STRIP_L)
    const [, yb] = px(0, z.t0 * STRIP_L)
    g.fillStyle = ZONE_GROUND[z.kind]
    g.fillRect(0, ya, W, yb - ya)
    if (z.kind === 'farm' || z.kind === 'hill' || z.kind === 'lake') {
      // 畑：細長い区画を、少しずつ色を変えて敷きつめる
      const fields = ['#6d8f47', '#7f9c4c', '#a4a556', '#c2b267', '#5d8a43', '#8e8a4f', '#93ac5a', '#6a7d3e']
      for (let y = ya; y < yb; ) {
        const rowH = 10 + rand() * 22
        for (let x = 0; x < W; ) {
          const w = 16 + rand() * 60
          g.fillStyle = fields[Math.floor(rand() * fields.length)]
          g.fillRect(x + 1, y + 1, w - 2, Math.min(rowH, yb - y) - 2)
          x += w
        }
        y += rowH
      }
    }
    if (z.kind === 'park' || z.kind === 'hill' || z.kind === 'lake') {
      // 森のかたまり
      const n = Math.round((yb - ya) * 0.25)
      for (let i = 0; i < n; i++) {
        const x = rand() * W
        const y = ya + rand() * (yb - ya)
        const r = 4 + rand() * 14
        g.fillStyle = `rgba(${40 + rand() * 15}, ${70 + rand() * 20}, ${38 + rand() * 10}, 0.8)`
        g.beginPath()
        g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  // 街の区画：歩道に囲まれた明るい区画（公園は緑、住宅地は庭の緑まじり）
  for (const b of plan.blocks) {
    const [x0, y1] = px(b.s0, b.y0)
    const [x1, y0] = px(b.s1, b.y1)
    g.fillStyle = b.park ? '#5f8f48' : b.kind === 'suburb' ? '#8a9a6a' : b.kind === 'urban' ? '#bdb9ae' : '#c8c5bc'
    g.fillRect(x0, y0, x1 - x0, y1 - y0)
  }
  // 村
  for (const v of plan.villages) {
    const [x, y] = px(v.s, v.y)
    g.fillStyle = 'rgba(150, 150, 120, 0.85)'
    g.beginPath()
    g.ellipse(x, y, v.r * sx, v.r * sy, 0, 0, Math.PI * 2)
    g.fill()
  }
  // 湖
  for (const l of plan.lakes) {
    const [x, y] = px(l.s, l.y)
    g.fillStyle = '#3f6f99'
    g.beginPath()
    g.ellipse(x, y, l.rs * sx, l.ry * sy, 0, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(210, 200, 170, 0.8)'
    g.lineWidth = 1.5
    g.stroke()
  }
  // 川：長さに沿って曲がりながら流れる
  g.strokeStyle = '#46769f'
  g.lineCap = 'round'
  g.lineWidth = Math.max(3, RIVER_W * sx)
  g.beginPath()
  for (let y = 0; y <= STRIP_L; y += 120) {
    const [x, cy] = px(plan.river(y), y)
    if (y === 0) g.moveTo(x, cy)
    else g.lineTo(x, cy)
  }
  g.stroke()
  // 大通り（まん中に鉄道の高架）
  const [ax0] = px(-AVENUE, 0)
  const [ax1] = px(AVENUE, 0)
  const [, aTop] = px(0, 0.95 * STRIP_L)
  g.fillStyle = '#77756f'
  g.fillRect(ax0, aTop, ax1 - ax0, H - aTop)
  g.fillStyle = '#56545a'
  g.fillRect((ax0 + ax1) / 2 - 1, aTop, 2, H - aTop)
}

/** 夜の灯り（黒地に道と街の明かり）。加算で重ねる */
export function drawCityLights(g: CanvasRenderingContext2D, W: number, H: number, k: number) {
  const plan = cityPlan(k)
  const px = (s: number, y: number) => toCanvas(s, y, W, H)
  g.fillStyle = '#000'
  g.fillRect(0, 0, W, H)
  const rand = seeded(500 + k)
  // 区画のまわりの街灯（区画の縁を細い線で）
  for (const b of plan.blocks) {
    const [x0, y1] = px(b.s0, b.y0)
    const [x1, y0] = px(b.s1, b.y1)
    const a = b.kind === 'downtown' ? 0.75 : b.kind === 'town' ? 0.6 : b.kind === 'urban' ? 0.5 : 0.32
    g.strokeStyle = `rgba(255, ${170 + rand() * 40}, 100, ${a})`
    g.lineWidth = 1
    g.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1)
    if (b.kind === 'suburb' && !b.park)
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `rgba(255, 210, 140, ${0.4 + rand() * 0.4})`
        g.fillRect(x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0), 1, 1)
      }
  }
  // 村の明かり
  for (const v of plan.villages) {
    const [x, y] = px(v.s, v.y)
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(255, 200, 130, ${0.5 + rand() * 0.5})`
      g.fillRect(x + (rand() - 0.5) * v.r * 1.6 * (W / STRIP_W), y + (rand() - 0.5) * v.r * 1.6 * (H / STRIP_L), 1, 1)
    }
  }
  // 大通り：明るい2本の線と、鉄道の青白い灯
  const [ax0] = px(-AVENUE, 0)
  const [ax1] = px(AVENUE, 0)
  const [, aTop] = px(0, 0.95 * STRIP_L)
  g.fillStyle = 'rgba(255, 200, 120, 0.95)'
  g.fillRect(ax0, aTop, 1.5, H - aTop)
  g.fillRect(ax1 - 1.5, aTop, 1.5, H - aTop)
  g.fillStyle = 'rgba(150, 200, 255, 0.8)'
  g.fillRect((ax0 + ax1) / 2 - 0.5, aTop, 1, H - aTop)
}
