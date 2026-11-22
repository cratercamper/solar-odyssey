import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLONY_LENGTH } from '../../data/sf'
import { AVENUE, EDGE, M, RIVER_W, cityPlan, colonyDay, farHide, type Building, type Tree } from '../sf/colonyCity'
import { currentLevel, lowMemory } from '../../state/quality'
import { G, GROUND_LIFT, POND, landPoint, upAt } from './park'
import { FOOTBRIDGE_HALF, FOOTBRIDGE_REACH, FOOTBRIDGE_Y, RP, STRIP_HALF_PS, STRIP_LEN, itemsIn, stripCenterA, wrapA } from './cylinder'
import { barkTexture, crownGeometry, detailTexture, parkTexture, standAt } from './WalkWorld'
import { box, gableGeometry, houseMaterial, roofMaterial, slopeGeometry } from './WalkTown'

// コロニーの円筒ぜんぶを歩くための「歩く人のまわりだけ細かく描く」仕組み。
// 地面を 200 m 四方の区画（チャンク）に分け、自分のまわりの区画だけ、写真の質感の地面・家・ビル・幹のある木・川の歩道橋を作る。
// 遠くは今までどおり宇宙の場面のコロニーの形（粗い大地の絵と箱の建物）で、細かく描いた範囲の遠くの建物と木は消す（farHide）。
// どこに何があるかは、遠くの絵と同じ街の計画（colonyCity.ts）から決めるので、近づくと粗い絵がそのまま細かくなる。

/** 区画の大きさ m */
export const CH = 200
/** 細かく描く範囲の外側の、地面を遠くの絵へ溶かす幅 m */
const FADE = 60
/** 自分の区画から何区画先まで作るか */
const ringN = () => (currentLevel() === 'high' && !lowMemory() ? 3 : 2)
/** 区分けの絵の細かさ（1 m に何画素） */
const pxPerM = () => (lowMemory() || currentLevel() === 'low' ? 0.5 : currentLevel() === 'medium' ? 0.8 : 1)
/** 質感の座標を、このくり返しの倍数ずつずらして小さい数に保つ（質感の大きさがみなこれで割り切れるので、区画の境で模様がずれない） */
const SNAP = 3465

const LAWN = new THREE.Color('#4f8a38').convertSRGBToLinear()

/* ---------- 区分けの絵 ---------- */

// 絵 A：R = アスファルト、G = 石畳・歩道、B = 水（川・湖）
// 絵 B：R = 畑、G = 砂利（岸・村）、B = 庭の芝（手入れした明るい芝）
// 何もない所は草地。

type Masks = { a: THREE.CanvasTexture; b: THREE.CanvasTexture }

function drawMasks(s0: number, y0: number, strips: { k: number; sc: number }[]): Masks {
  const k = pxPerM()
  const N = Math.round(CH * k)
  const make = () => {
    const c = document.createElement('canvas')
    c.width = c.height = N
    const g = c.getContext('2d')!
    g.fillStyle = '#000'
    g.fillRect(0, 0, N, N)
    return { c, g }
  }
  const A = make()
  const B = make()
  const y1 = y0 + CH
  const Y = (y: number) => (y1 - y) * k
  for (const { k: strip, sc } of strips) {
    const plan = cityPlan(strip)
    const X = (ps: number) => (sc + (ps * G) / RP - s0) * k
    const W = (dps: number) => ((dps * G) / RP) * k
    const rect = (g: CanvasRenderingContext2D, ps0: number, ps1: number, ya: number, yb: number) => g.fillRect(X(ps0), Y(yb), W(ps1 - ps0), (yb - ya) * k)
    // 帯の計画の範囲で、この区画にかかる所（計画の m）
    const ps0 = ((s0 - sc) * RP) / G - 20
    const ps1 = ((s0 + CH - sc) * RP) / G + 20
    for (const z of plan.zones) {
      const za = Math.max(z.t0 * STRIP_LEN, y0 - 5)
      const zb = Math.min(z.t1 * STRIP_LEN, y1 + 5)
      if (za >= zb) continue
      if (z.kind === 'farm') {
        B.g.fillStyle = '#f00'
        rect(B.g, -STRIP_HALF_PS + EDGE * 0.5, STRIP_HALF_PS - EDGE * 0.5, za, zb)
      }
      if (z.kind === 'downtown' || z.kind === 'town' || z.kind === 'urban' || z.kind === 'suburb') {
        // 街：碁盤の目の道（区画のあいだ）をアスファルトに
        A.g.fillStyle = '#f00'
        rect(A.g, -STRIP_HALF_PS + EDGE - 8, STRIP_HALF_PS - EDGE + 8, Math.max(za, z.t0 * STRIP_LEN + 30), Math.min(zb, z.t1 * STRIP_LEN - 12))
      }
    }
    // 川のまわりの草地（街の区画は川のそばを空けてある）
    const riverPoly = (g: CanvasRenderingContext2D, half: number) => {
      g.beginPath()
      for (let y = y0 - 20; y <= y1 + 20; y += 10) {
        const x = X(plan.river(y) - half)
        if (y === y0 - 20) g.moveTo(x, Y(y))
        else g.lineTo(x, Y(y))
      }
      for (let y = y1 + 20; y >= y0 - 20; y -= 10) g.lineTo(X(plan.river(y) + half), Y(y))
      g.closePath()
      g.fill()
    }
    A.g.fillStyle = '#000'
    riverPoly(A.g, RIVER_W / 2 + 46)
    // 区画：まわりの歩道（石畳）と、中（ビル街は石畳の広場、住宅地と公園は芝）
    for (const b of plan.blocks) {
      if (b.s1 < ps0 || b.s0 > ps1 || b.y1 < y0 - 5 || b.y0 > y1 + 5) continue
      A.g.fillStyle = '#0f0'
      rect(A.g, b.s0, b.s1, b.y0, b.y1)
      if (b.park || b.kind === 'suburb') {
        A.g.fillStyle = '#000'
        rect(A.g, b.s0 + 3, b.s1 - 3, b.y0 + 3, b.y1 - 3)
        B.g.fillStyle = '#00f'
        rect(B.g, b.s0 + 3, b.s1 - 3, b.y0 + 3, b.y1 - 3)
      }
    }
    // 村（畑の中の集落）：砂利の広場
    for (const v of plan.villages) {
      if (Math.abs(v.y - (y0 + y1) / 2) > v.r + CH) continue
      B.g.fillStyle = '#0f0'
      B.g.beginPath()
      B.g.ellipse(X(v.s), Y(v.y), W(v.r * 0.85), v.r * 0.85 * k, 0, 0, Math.PI * 2)
      B.g.fill()
    }
    // 川：岸の砂利と、水
    B.g.fillStyle = '#0f0'
    riverPoly(B.g, RIVER_W / 2 + 4)
    A.g.fillStyle = '#00f'
    riverPoly(A.g, RIVER_W / 2)
    // 湖（公園の池は park.ts の地面が描く）
    for (const l of plan.lakes) {
      if (Math.abs(l.y - (y0 + y1) / 2) > l.ry + CH || (strip === 0 && l === POND)) continue
      B.g.fillStyle = '#0f0'
      B.g.beginPath()
      B.g.ellipse(X(l.s), Y(l.y), W(l.rs + 6), (l.ry + 6) * k, 0, 0, Math.PI * 2)
      B.g.fill()
      A.g.fillStyle = '#00f'
      A.g.beginPath()
      A.g.ellipse(X(l.s), Y(l.y), W(l.rs), l.ry * k, 0, 0, Math.PI * 2)
      A.g.fill()
    }
    // 大通り（まん中に鉄道の高架）と両側の歩道
    const aTop = 0.95 * STRIP_LEN
    if (y0 < aTop) {
      A.g.fillStyle = '#f00'
      rect(A.g, -AVENUE + 2, AVENUE - 2, 0, aTop)
      A.g.fillStyle = '#0f0'
      for (const side of [-1, 1]) rect(A.g, side > 0 ? AVENUE - 2 : -AVENUE - 6, side > 0 ? AVENUE + 6 : -AVENUE + 2, 0, aTop)
    }
    // 窓のそばの縁（白っぽい土手）
    A.g.fillStyle = '#0f0'
    rect(A.g, -STRIP_HALF_PS, -STRIP_HALF_PS + 48, 0, STRIP_LEN)
    rect(A.g, STRIP_HALF_PS - 48, STRIP_HALF_PS, 0, STRIP_LEN)
  }
  const soft = (src: HTMLCanvasElement) => {
    const c = document.createElement('canvas')
    c.width = c.height = N
    const g = c.getContext('2d')!
    g.filter = `blur(${Math.max(0.5, 0.6 * k)}px)`
    g.drawImage(src, 0, 0)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.NoColorSpace
    tex.anisotropy = 4
    return tex
  }
  return { a: soft(A.c), b: soft(B.c) }
}

/* ---------- 地面 ---------- */

let detail: THREE.Texture | null = null

function groundMaterial(masks: Masks, s0: number, y0: number) {
  detail ??= detailTexture()
  const mat = new THREE.MeshLambertMaterial({ map: masks.a, transparent: true })
  const uniforms = {
    uMaskB: { value: masks.b },
    uDetail: { value: detail },
    uGrass: { value: parkTexture('grass') },
    uPaving: { value: parkTexture('paving') },
    uShore: { value: parkTexture('shore') },
    uAsphalt: { value: parkTexture('asphalt') },
    uLawn: { value: LAWN },
    uOrigin: { value: new THREE.Vector2(s0 - Math.floor(s0 / SNAP) * SNAP, y0 - Math.floor(y0 / SNAP) * SNAP) },
    // 細かく描いている範囲（この区画の左下からの m）。外へ向かって溶かす
    uRect: { value: new THREE.Vector4(-1e5, -1e5, 1e5, 1e5) },
  }
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uMaskB;
uniform sampler2D uDetail;
uniform sampler2D uGrass;
uniform sampler2D uPaving;
uniform sampler2D uShore;
uniform sampler2D uAsphalt;
uniform vec3 uLawn;
uniform vec2 uOrigin;
uniform vec4 uRect;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 lp = vMapUv * ${CH.toFixed(1)};
vec2 wp = uOrigin + lp;
vec4 mA = texture2D(map, vMapUv);
vec4 mB = texture2D(uMaskB, vMapUv);
float n1 = texture2D(uDetail, wp / 5.5).r;
float n2 = texture2D(uDetail, wp / 38.5 + 0.37).r;
vec3 g1 = texture2D(uGrass, wp / 2.2).rgb;
vec3 g2 = texture2D(uGrass, wp / 7.7 + 0.21).rgb;
vec3 gr = mix(g1, g2, 0.35);
float lum = dot(gr, vec3(0.3, 0.59, 0.11));
// 草地（少し野原っぽく）と、庭の刈りそろえた芝
vec3 col = mix(gr, uLawn * lum / 0.265, 0.55) * (0.72 + n2 * 0.55);
col = mix(col, mix(gr, uLawn * lum / 0.265, 0.8) * (0.85 + n2 * 0.3), mB.b);
// 畑：21 m ごとの畝の列、99 m ごとに作物が変わる
float row = floor(wp.y / 21.0);
float fh = fract(sin(row * 12.9898 + floor(wp.x / 99.0) * 78.233) * 43758.5453);
vec3 crop = fh < 0.3 ? vec3(0.36, 0.5, 0.2) : fh < 0.55 ? vec3(0.55, 0.58, 0.25) : fh < 0.8 ? vec3(0.72, 0.62, 0.32) : vec3(0.45, 0.36, 0.24);
float furrow = 0.82 + 0.18 * sin(wp.x * 6.2832 / 0.9);
vec3 farm = lum / 0.265 * crop * furrow * (0.8 + n1 * 0.35);
farm = mix(farm, vec3(0.42, 0.38, 0.3), step(fract(wp.y / 21.0), 0.06));
col = mix(col, farm, smoothstep(0.3, 0.7, mB.r));
float edge = (n1 - 0.67) * 0.9;
float wShore = clamp(mB.g + edge * mB.g * (1.0 - mB.g) * 4.0, 0.0, 1.0);
float wPave = smoothstep(0.35, 0.65, mA.g);
float wAsph = smoothstep(0.3, 0.7, mA.r);
float wWater = smoothstep(0.35, 0.65, mA.b);
col = mix(col, texture2D(uShore, wp / 2.5).rgb, wShore);
col = mix(col, texture2D(uPaving, wp / 2.5).rgb * 1.6, wPave);
col = mix(col, texture2D(uAsphalt, wp / 3.0).rgb, wAsph);
col = mix(col, mix(vec3(0.05, 0.13, 0.17), vec3(0.16, 0.3, 0.38), n2) * (0.9 + n1 * 0.2), wWater);
diffuseColor.rgb *= col;
vec2 e = min(lp - uRect.xy, uRect.zw - lp);
diffuseColor.a *= smoothstep(0.0, ${FADE.toFixed(1)}, min(e.x, e.y));`,
      )
  }
  mat.customProgramCacheKey = () => 'walk-chunk-ground-1'
  return Object.assign(mat, { uniforms })
}

/** 曲がった地面の一枚（s0〜s1、y0〜y1）。uv は区画の左下 (cs0, cy0) からの CH 四方 */
function groundGeometry(s0: number, s1: number, y0: number, y1: number, cs0: number, cy0: number) {
  const segS = Math.max(1, Math.ceil((s1 - s0) / 20))
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let j = 0; j <= 2; j++)
    for (let i = 0; i <= segS; i++) {
      const s = s0 + ((s1 - s0) * i) / segS
      const y = y0 + ((y1 - y0) * j) / 2
      landPoint(s, y, GROUND_LIFT * 0.5, p)
      upAt(s, n)
      pos.push(p.x, p.y, p.z)
      nor.push(n.x, n.y, n.z)
      uv.push((s - cs0) / CH, (y - cy0) / CH)
    }
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < segS; i++) {
      const a = j * (segS + 1) + i
      const b = a + segS + 1
      // 上（軸の側）から見て表になる向き
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

/* ---------- 共有の形と材質 ---------- */

type Shared = {
  night: { value: number }
  houseMat: THREE.Material
  roofMat: THREE.Material
  plain: THREE.MeshLambertMaterial
  capMat: THREE.MeshLambertMaterial
  deckMat: THREE.MeshLambertMaterial
  railMat: THREE.MeshLambertMaterial
  trunkMat: THREE.MeshLambertMaterial
  crownMat: THREE.MeshLambertMaterial
  slope: THREE.BufferGeometry
  gable: THREE.BufferGeometry
  box: THREE.BufferGeometry
  trunk: THREE.BufferGeometry
  crown: THREE.BufferGeometry
}

function makeShared(): Shared {
  const night = { value: 0 }
  return {
    night,
    houseMat: houseMaterial(night),
    roofMat: roofMaterial(),
    plain: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
    capMat: new THREE.MeshLambertMaterial({ color: '#8d9094' }),
    deckMat: new THREE.MeshLambertMaterial({ color: '#c9c4ba', map: parkTexture('paving') }),
    railMat: new THREE.MeshLambertMaterial({ color: '#5a6068' }),
    trunkMat: new THREE.MeshLambertMaterial({ color: '#d8ccbe', map: barkTexture() }),
    crownMat: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
    slope: slopeGeometry(),
    gable: gableGeometry(),
    box: box(),
    trunk: new THREE.CylinderGeometry(0.42, 0.5, 1, 7),
    crown: crownGeometry(),
  }
}

/* ---------- 1 区画 ---------- */

type Chunk = { i: number; j: number; group: THREE.Group; grounds: (THREE.Mesh & { material: ReturnType<typeof groundMaterial> })[]; dispose: () => void }

const hash = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], colors?: number[], shadow = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, mats.length)
  mats.forEach((m, i) => mesh.setMatrixAt(i, m))
  if (colors) {
    const c = new THREE.Color()
    colors.forEach((col, i) => mesh.setColorAt(i, c.setHex(col)))
  }
  mesh.castShadow = shadow
  mesh.receiveShadow = true
  mesh.computeBoundingSphere()
  return mesh
}

function buildChunk(i: number, j: number, sh: Shared): Chunk {
  const s0 = i * CH
  const y0 = j * CH
  const y1 = Math.min(STRIP_LEN, y0 + CH)
  const group = new THREE.Group()
  group.visible = false
  const grounds: Chunk['grounds'] = []
  const owned: { dispose: () => void }[] = []
  // この区画にかかる大地の帯（ふつうは 1 本、窓の帯の上なら 0 本）
  const strips: { k: number; sc: number; sa: number; sb: number }[] = []
  for (let k = 0; k < 3; k++) {
    const c = stripCenterA(k) * G
    const mid = s0 + CH / 2
    const sc = c + 2 * Math.PI * G * Math.round((mid - c) / (2 * Math.PI * G))
    const half = (STRIP_HALF_PS * G) / RP
    const sa = Math.max(s0, sc - half)
    const sb = Math.min(s0 + CH, sc + half)
    if (sb > sa + 0.5) strips.push({ k, sc, sa, sb })
  }
  if (strips.length && y1 > y0) {
    const masks = drawMasks(s0, y0, strips)
    owned.push(masks.a, masks.b)
    for (const st of strips) {
      const geo = groundGeometry(st.sa, st.sb, y0, y1, s0, y0)
      const mat = groundMaterial(masks, s0, y0)
      const mesh = new THREE.Mesh(geo, mat) as Chunk['grounds'][number]
      mesh.receiveShadow = true
      mesh.renderOrder = 0
      group.add(mesh)
      grounds.push(mesh)
      owned.push(geo, mat)
    }
    // 建物・木・歩道橋
    const walls: THREE.Matrix4[] = []
    const wallColors: number[] = []
    const doors: number[] = []
    const seeds: number[] = []
    const slopes: THREE.Matrix4[] = []
    const roofColors: number[] = []
    const gables: THREE.Matrix4[] = []
    const gableColors: number[] = []
    const caps: THREE.Matrix4[] = []
    const trunks: THREE.Matrix4[] = []
    const crowns: THREE.Matrix4[] = []
    const crownColors: number[] = []
    const decks: THREE.Matrix4[] = []
    const rails: THREE.Matrix4[] = []
    const ROOFS = [0x3a3f46, 0x4b4f55, 0x7a4a36, 0x5a3a2e, 0x3f4a5a, 0x5d6b5a, 0x2f3338, 0x6b5b4e]
    for (const st of strips) {
      const toS = (ps: number) => st.sc + (ps * G) / RP
      const ps0 = ((st.sa - st.sc) * RP) / G
      const ps1 = ((st.sb - st.sc) * RP) / G
      for (const b of itemsIn(st.k, 'buildings', ps0, ps1, y0, y1, [] as Building[])) {
        const s = toS(b.s)
        const r = hash(b.s, b.y)
        const yaw = r < 0.5 ? 0 : Math.PI
        const house = b.h < 12
        const flat = !house || r > 0.78
        const wallH = house ? b.h * 0.62 : b.h
        walls.push(standAt(s, b.y, 0, yaw, [b.w, wallH, b.d], new THREE.Matrix4()))
        wallColors.push(b.color)
        doors.push((hash(b.y, b.s) - 0.5) * (b.w - 3))
        seeds.push(hash(b.s * 0.7, b.y * 1.3))
        if (flat) caps.push(standAt(s, b.y, wallH, yaw, [b.w + 0.3, house ? 0.35 : 0.8, b.d + 0.3], new THREE.Matrix4()))
        else {
          const rh = b.d * 0.29
          const over = 0.8
          const lift = (rh * over) / (b.d + over)
          slopes.push(standAt(s, b.y, wallH - lift, yaw, [b.w + 0.6, rh, b.d + over], new THREE.Matrix4()))
          roofColors.push(ROOFS[Math.floor(hash(b.w, b.d) * ROOFS.length)])
          gables.push(standAt(s, b.y, wallH, yaw, [b.w, rh - lift, b.d], new THREE.Matrix4()))
          gableColors.push(b.color)
        }
        // ビルの屋上の機械室
        if (!house && r < 0.6) caps.push(standAt(s + (r - 0.3) * b.w * 0.5, b.y, wallH, yaw, [b.w * 0.3, 3.2, b.d * 0.3], new THREE.Matrix4()))
      }
      for (const t of itemsIn(st.k, 'trees', ps0, ps1, y0, y1, [] as Tree[])) {
        const s = toS(t.s)
        const yaw = hash(t.s, t.y) * Math.PI * 2
        const w = t.h * (0.55 + hash(t.y, t.s) * 0.2)
        trunks.push(standAt(s, t.y, t.h * 0.22, yaw, [0.16 + t.h * 0.012, t.h * 0.44, 0.16 + t.h * 0.012], new THREE.Matrix4()))
        crowns.push(standAt(s, t.y, t.h * 0.62, yaw, [w, t.h * 0.62, w], new THREE.Matrix4()))
        crownColors.push(t.color)
      }
      // 川の歩道橋
      const plan = cityPlan(st.k)
      for (const fy of FOOTBRIDGE_Y) {
        if (fy < y0 || fy >= y1) continue
        const rv = plan.river(fy)
        if (rv < ps0 - FOOTBRIDGE_REACH || rv > ps1 + FOOTBRIDGE_REACH) continue
        // 長さの向きに数枚の板に分ける（地面が曲がるので）
        const n = 6
        const len = (FOOTBRIDGE_REACH * 2 * G) / RP
        for (let q = 0; q < n; q++) {
          const s = toS(rv - FOOTBRIDGE_REACH) + (len * (q + 0.5)) / n
          if (s < st.sa - 20 || s > st.sb + 20) continue
          decks.push(standAt(s, fy, 0.05, 0, [len / n + 0.05, 0.35, FOOTBRIDGE_HALF * 2], new THREE.Matrix4()))
          for (const side of [-1, 1]) rails.push(standAt(s, fy + side * (FOOTBRIDGE_HALF - 0.06), 0.4, 0, [len / n + 0.05, 1.0, 0.08], new THREE.Matrix4()))
        }
      }
    }
    const meshes: THREE.InstancedMesh[] = []
    if (walls.length) {
      const wallGeo = sh.box.clone()
      wallGeo.setAttribute('aDoor', new THREE.InstancedBufferAttribute(new Float32Array(doors), 1))
      wallGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1))
      owned.push(wallGeo)
      meshes.push(instanced(wallGeo, sh.houseMat, walls, wallColors))
    }
    if (slopes.length) meshes.push(instanced(sh.slope, sh.roofMat, slopes, roofColors), instanced(sh.gable, sh.plain, gables, gableColors))
    if (caps.length) meshes.push(instanced(sh.box, sh.capMat, caps))
    if (trunks.length) meshes.push(instanced(sh.trunk, sh.trunkMat, trunks), instanced(sh.crown, sh.crownMat, crowns, crownColors))
    if (decks.length) meshes.push(instanced(sh.box, sh.deckMat, decks), instanced(sh.box, sh.railMat, rails))
    for (const m of meshes) {
      group.add(m)
      owned.push(m)
    }
  }
  return {
    i,
    j,
    group,
    grounds,
    dispose: () => {
      group.removeFromParent()
      for (const o of owned) o.dispose()
    },
  }
}

/* ---------- 区画を作る・捨てる ---------- */

/** テスト用：作った区画の数、細かく描いている範囲 */
export const chunkDebug = { built: 0, shown: null as null | { i0: number; i1: number; j0: number; j1: number }, lastBuildMs: 0 }

const keyOf = (i: number, j: number) => `${i},${j}`
const J_MAX = Math.ceil(STRIP_LEN / CH) - 1

export function WalkChunks({ follow }: { follow: { current: THREE.Vector3 } }) {
  const sh = useMemo(makeShared, [])
  const group = useRef<THREE.Group>(null!)
  const st = useMemo(() => ({ chunks: new Map<string, Chunk>(), shown: null as null | { i0: number; i1: number; j0: number; j1: number } }), [])
  useEffect(
    () => () => {
      for (const c of st.chunks.values()) c.dispose()
      st.chunks.clear()
      farHide.value.set(0, 0, 0, 0)
      for (const v of Object.values(sh)) if (v instanceof THREE.Material || v instanceof THREE.BufferGeometry) v.dispose()
    },
    [st, sh],
  )
  useFrame(() => {
    sh.night.value = colonyDay.night
    sh.crownMat.color.setScalar(1 - 0.75 * colonyDay.night)
    const p = follow.current
    if (!p.lengthSq()) return
    // 自分のいる区画（s は -半周〜半周に直して数える。区画の中身は角度で決まるので、何周しても同じ）
    const s = wrapA(Math.atan2(p.x, p.z)) * G
    const y = p.y + COLONY_LENGTH / M / 2
    const ic = Math.floor(s / CH)
    const jc = Math.min(J_MAX, Math.max(0, Math.floor(y / CH)))
    const n = ringN()
    const want = { i0: ic - n, i1: ic + n, j0: Math.max(0, jc - n), j1: Math.min(J_MAX, jc + n) }
    // まだない区画を、近い順に 1 フレームに 2 つまで作る
    const missing: [number, number, number][] = []
    for (let i = want.i0; i <= want.i1; i++) for (let j = want.j0; j <= want.j1; j++) if (!st.chunks.has(keyOf(i, j))) missing.push([i, j, Math.hypot(i - ic, j - jc)])
    missing.sort((a, b) => a[2] - b[2])
    const t0 = performance.now()
    for (const [i, j] of missing.slice(0, 2)) {
      const c = buildChunk(i, j, sh)
      st.chunks.set(keyOf(i, j), c)
      group.current.add(c.group)
      if (performance.now() - t0 > 8) break
    }
    if (missing.length) chunkDebug.lastBuildMs = performance.now() - t0
    chunkDebug.built = st.chunks.size
    const all = missing.every(([i, j]) => st.chunks.has(keyOf(i, j)))
    const same = st.shown && st.shown.i0 === want.i0 && st.shown.i1 === want.i1 && st.shown.j0 === want.j0 && st.shown.j1 === want.j1
    if (!all || same) return
    // 全部そろったら、細かく描く範囲を切りかえる
    st.shown = want
    chunkDebug.shown = want
    const rs0 = want.i0 * CH
    const rs1 = (want.i1 + 1) * CH
    const ry0 = want.j0 * CH
    const ry1 = Math.min(STRIP_LEN, (want.j1 + 1) * CH)
    for (const [k, c] of st.chunks) {
      const inside = c.i >= want.i0 && c.i <= want.i1 && c.j >= want.j0 && c.j <= want.j1
      // 少し離れた区画は、戻ってきたときのために 1 区画ぶん残す
      if (c.i < want.i0 - 1 || c.i > want.i1 + 1 || c.j < want.j0 - 1 || c.j > want.j1 + 1) {
        c.dispose()
        st.chunks.delete(k)
        continue
      }
      c.group.visible = inside
      const fs0 = rs0 - c.i * CH
      const fy0 = ry0 - c.j * CH
      // 端の壁のほう（港側・太陽側）は溶かさない
      for (const g of c.grounds) g.material.uniforms.uRect.value.set(fs0, want.j0 === 0 ? -1e5 : fy0, rs1 - c.i * CH, want.j1 === J_MAX ? 1e5 : ry1 - c.j * CH)
    }
    // 細かく描いた範囲の、遠くの建物と木を消す（近くの形と、ちょうど範囲の境で入れかわる）
    farHide.value.set((rs0 + rs1) / 2 / G, (rs1 - rs0) / 2 / G, -COLONY_LENGTH / 2 + ((ry0 + ry1) / 2) * M, ((ry1 - ry0) / 2) * M)
  })
  return <group ref={group} />
}
