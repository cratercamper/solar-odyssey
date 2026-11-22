import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { seeded } from '../sf/batch'
import { currentLevel, lowMemory } from '../../state/quality'
import { isTouchDevice } from '../../state/input'
import { G, GROUND_LIFT, HALF_L, landPoint, upAt } from './park'
import { standAt } from './WalkWorld'
import { JUNGLE, JUNGLE_GATE, TRAIL_W, jungleForest, jungleLayout } from './jungle'
import { KIT, POLE, TALL, type Forest, type KitName, type Spot } from './forestLayout'
import { treeShape } from './forestTree'

// 「本格的な森」（?forest=old のときは出ない。置き場所は forestLayout.ts）。ラボの森の全体を作り直す。
// ・植物と小物：本物をスキャンした形（public/models/forest-kit.glb、Poly Haven CC0）。画像は何種類かを 1 枚にまとめてある
// ・高い木と若木：幹と枝はその場で作り（forestTree.ts）、樹皮は写真、葉は本物の木の枝先を撮った絵の板
// ・同じ画像を使う物は、BatchedMesh で 1 回の描画にまとめる。1 本ずつ、近くは細かい形・遠くは軽い形・もっと遠くは出さない
//   （出しはじめと消えぎわは、点々に溶かして、ぱっと出たり消えたりしないようにする）
// ・地面：落ち葉・苔・ぬれた土の写真を混ぜた床を、今の地面の上に 1 枚重ねる。小道と植物の根元の暗がりは絵に描いておく
// ・光：木もれ日は「動く模様の絵 1 枚」を日の向きに沿って落とす（葉の影は計算しない）。葉は日を透かして明るくなる
// 読み込むのは、このファイルが使われたとき（お試しを付けて歩く場面に入ったとき）だけ。

const BASE = import.meta.env.BASE_URL
/** 日の向き（WalkWorld の Lights と同じ）：x = 東、y = 上、z = 北 */
const SUN = new THREE.Vector3(Math.sin(0.6), Math.cos(0.6), 0.25).normalize()
/** 床を、歩く地面よりどれだけ上に重ねるか m */
const FLOOR_LIFT = 0.035
/** 床の、森の外へのはみ出し m（ふちをまだらに溶かす） */
const FLOOR_PAD = 3
/** 床（と、根元の暗がり・小道の絵）の範囲 */
const FLOOR = { s0: JUNGLE.s0 - FLOOR_PAD, y0: JUNGLE.y0 - FLOOR_PAD, w: JUNGLE.s1 - JUNGLE.s0 + FLOOR_PAD * 2, h: JUNGLE.y1 - JUNGLE.y0 + FLOOR_PAD * 2 }
const f1 = (v: number) => v.toFixed(4)

/* ---------- 光の模様（木もれ日）と、床の絵 ---------- */

/** R = 木もれ日（明るい丸の集まり。くり返せる）、G = なだらかなまだら（苔の出方・ふちの崩し方に使う） */
function cookieTexture() {
  const N = 512
  const layer = (draw: (g: CanvasRenderingContext2D, wrap: (x: number, y: number, f: (x: number, y: number) => void) => void) => void, blur: number) => {
    const c = document.createElement('canvas')
    c.width = c.height = N
    const g = c.getContext('2d')!
    g.fillStyle = '#000'
    g.fillRect(0, 0, N, N)
    g.globalCompositeOperation = 'lighter'
    // はしにかかる丸は、反対側にも描く（くり返したときに、つなぎ目が出ないように）
    draw(g, (x, y, f) => {
      for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) f(x + dx, y + dy)
    })
    const out = document.createElement('canvas')
    out.width = out.height = N
    const o = out.getContext('2d')!
    o.filter = `blur(${blur}px)`
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) o.drawImage(c, dx, dy)
    return o.getImageData(0, 0, N, N).data
  }
  const rand = seeded(97)
  const blob = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, a: number) => {
    g.save()
    g.translate(x, y)
    g.rotate(rot)
    g.scale(1, ry / rx)
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx)
    grad.addColorStop(0, `rgba(255,255,255,${a})`)
    grad.addColorStop(0.55, `rgba(255,255,255,${a * 0.7})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(0, 0, rx, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
  // 木もれ日：樹冠のすき間ごとに、大小の丸がかたまって落ちる
  const sun = layer((g, wrap) => {
    for (let i = 0; i < 40; i++) {
      const cx = rand() * N
      const cy = rand() * N
      const n = 2 + Math.floor(rand() * 6)
      for (let j = 0; j < n; j++) {
        const r = 8 + rand() * 30
        const x = cx + (rand() - 0.5) * 90
        const y = cy + (rand() - 0.5) * 90
        const rot = rand() * Math.PI
        const k = 0.6 + rand() * 0.4
        const a = 0.55 + rand() * 0.45
        wrap(x, y, (px, py) => blob(g, px, py, r, r * k, rot, a))
      }
    }
  }, 2.2)
  const soft = layer((g, wrap) => {
    for (let i = 0; i < 90; i++) {
      const r = 30 + rand() * 60
      const x = rand() * N
      const y = rand() * N
      const a = 0.12 + rand() * 0.2
      wrap(x, y, (px, py) => blob(g, px, py, r, r, 0, a))
    }
  }, 6)
  const data = new Uint8Array(N * N * 4)
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = sun[i * 4]
    data[i * 4 + 1] = soft[i * 4]
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

/** 床の絵：R = 根元の暗がり（白いほど暗い）、G = 小道。上が北（床の uv の v が北へ増える。flipY はしない） */
function maskTexture(F: Forest, paths: { s: number; y: number }[][]) {
  const PX = 5
  const Wp = Math.round(FLOOR.w * PX)
  const Hp = Math.round(FLOOR.h * PX)
  const layer = (draw: (g: CanvasRenderingContext2D) => void, blur: number) => {
    const c = document.createElement('canvas')
    c.width = Wp
    c.height = Hp
    const g = c.getContext('2d')!
    g.fillStyle = '#000'
    g.fillRect(0, 0, Wp, Hp)
    g.filter = `blur(${blur}px)`
    draw(g)
    return g.getImageData(0, 0, Wp, Hp).data
  }
  const X = (s: number) => (s - FLOOR.s0) * PX
  const Y = (y: number) => (y - FLOOR.y0) * PX
  const shade = layer((g) => {
    g.globalCompositeOperation = 'lighter'
    for (const b of F.shade) {
      const r = Math.max(2, b.r * PX)
      const grad = g.createRadialGradient(X(b.s), Y(b.y), 0, X(b.s), Y(b.y), r)
      grad.addColorStop(0, `rgba(255,255,255,${b.a})`)
      grad.addColorStop(0.6, `rgba(255,255,255,${b.a * 0.55})`)
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.beginPath()
      g.arc(X(b.s), Y(b.y), r, 0, Math.PI * 2)
      g.fill()
    }
  }, 1)
  const path = layer((g) => {
    g.strokeStyle = '#fff'
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.lineWidth = TRAIL_W * 0.85 * PX
    for (const p of paths) {
      g.beginPath()
      p.forEach((q, i) => (i ? g.lineTo(X(q.s), Y(q.y)) : g.moveTo(X(q.s), Y(q.y))))
      g.stroke()
    }
  }, PX * 0.45)
  const data = new Uint8Array(Wp * Hp * 4)
  for (let i = 0; i < Wp * Hp; i++) {
    data[i * 4] = shade[i * 4]
    data[i * 4 + 1] = path[i * 4]
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, Wp, Hp, THREE.RGBAFormat)
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

/* ---------- 材質 ---------- */

type Shared = {
  uFTime: { value: number }
  uFCookie: { value: THREE.Texture }
  /** 見える距離の倍率（画質・スマホ。BatchedMesh の出し入れと同じ数） */
  uFSee: { value: number }
}
type Kind = 'leaf' | 'canopy' | 'bark' | 'prop' | 'floor'

const V_PARS = /* glsl */ `
uniform float uFTime;
uniform float uFSway;
uniform float uFSee;
varying vec3 vForest;
#ifdef FOREST_SWAY_ATTR
attribute vec2 aSway;
#endif
#ifdef FOREST_FADE
attribute float aFade;
varying float vFade;
#endif`

/** 風のゆれ：株ごとに位相をずらして、ゆっくり揺らす（株の中の高さ・まん中からの距離で、根元は動かない） */
const V_WIND = /* glsl */ `
#ifdef FOREST_WIND
{
  float fPh = 0.0;
  #ifdef USE_BATCHING
  fPh = batchingMatrix[3].x * 0.37 + batchingMatrix[3].y * 0.23 + batchingMatrix[3].z * 0.31;
  #endif
  float fAmp = uFSway * max(0.0, transformed.y) * (0.4 + length(transformed.xz));
  transformed.x += sin(uFTime * 1.3 + fPh + transformed.y * 2.0) * fAmp;
  transformed.z += sin(uFTime * 1.7 + fPh * 1.3 + transformed.x * 2.5) * fAmp * 0.7;
}
#endif
#ifdef FOREST_SWAY_ATTR
transformed.x += sin(uFTime * 0.9 + aSway.x) * aSway.y;
transformed.z += cos(uFTime * 0.7 + aSway.x * 1.7) * aSway.y;
transformed.y += sin(uFTime * 1.1 + aSway.x * 2.3) * aSway.y * 0.5;
#endif`

/**
 * 森の中での位置（x = 森の南西の角から東へ m、y = 地面からの高さ m、z = 北へ m）。円筒の内側なので、
 * ワールドの位置から、円筒のまわりの長さ・半径・軸の向きの位置にそのまま戻す（森が広くても、ずれない）
 */
const V_MAIN = /* glsl */ `
{
  vec4 fW = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
  fW = batchingMatrix * fW;
  #endif
  fW = modelMatrix * fW;
  vForest = vec3(atan(fW.x, fW.z) * ${f1(G)} - ${f1(FLOOR.s0)}, ${f1(G - GROUND_LIFT)} - length(fW.xz), fW.y + ${f1(HALF_L)} - ${f1(FLOOR.y0)});
  #ifdef FOREST_FADE
  {
    vec4 fO = modelMatrix * batchingMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float fR = aFade * length(batchingMatrix[0].xyz) * uFSee;
    vFade = clamp((fR - distance(fO.xyz, cameraPosition)) / (fR * 0.2), 0.0, 1.0);
  }
  #endif
}`

const F_PARS = /* glsl */ `
uniform sampler2D uFCookie;
uniform float uFTime;
varying vec3 vForest;
#ifdef FOREST_FADE
varying float vFade;
#endif
// 木もれ日：その点から日の向きに沿って地面まで下ろした場所の、光の模様を読む（幹や葉の上でも、光の筋がつながる）
float forestDapple() {
  vec2 g = vForest.xz - vForest.y * vec2(${f1(SUN.x / SUN.y)}, ${f1(SUN.z / SUN.y)});
  vec2 w = vec2(sin(uFTime * 0.6 + g.y * 0.21), cos(uFTime * 0.47 + g.x * 0.17)) * 0.14;
  float a = texture2D(uFCookie, (g + w) / 13.0).r;
  float b = texture2D(uFCookie, (g.yx - w * 0.7) / 5.3 + 0.37).r;
  return clamp(a * (0.55 + 0.9 * b) * 1.5, 0.0, 1.0);
}`

/** 出しはじめ・消えぎわ：点々に溶かす */
const F_FADE = /* glsl */ `
#ifdef FOREST_FADE
if (vFade < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > vFade) discard;
#endif`

/** 写真の色の明るさ合わせと、根元の苔 */
const F_BARK = /* glsl */ `
#ifdef FOREST_GAIN
// 写真から取った色は、本物どおりに暗い。このアプリの光（公園の木や芝と同じ光）で同じ明るさに見えるように持ち上げる
diffuseColor.rgb *= FOREST_GAIN;
#endif
#ifdef FOREST_MOSS
{
  float fN = texture2D(uFCookie, vForest.xz * 0.23 + vForest.y * 0.11).g + texture2D(uFCookie, vForest.zy * 0.9).g * 0.5;
  float fM = smoothstep(4.5, 0.3, vForest.y) * smoothstep(0.3, 0.75, fN);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.85, 0.3) + vec3(0.012, 0.03, 0.0), fM * 0.85);
}
#endif`

const F_LIGHT = /* glsl */ `
{
  float fD = forestDapple();
  // 樹冠の下 = 1、樹冠の上 = 0
  float fIn = 1.0 - smoothstep(9.0, 20.0, vForest.y);
  // 日の光：木もれ日の外にも、葉を透けてきた弱い光が残る
  float fSun = mix(1.0, mix(0.2, 1.15, fD), fIn);
  reflectedLight.directDiffuse *= fSun;
  #ifdef FOREST_SPEC
  reflectedLight.directSpecular *= fSun;
  #endif
  // 空からの光は、樹冠を抜けるあいだに葉の色（黄緑）がかかる
  reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(0.8, 0.98, 0.66), fIn);
  #if defined( FOREST_LEAF ) && NUM_DIR_LIGHTS > 0
  // 葉は日を透かす：裏から日が当たった葉は、黄緑に明るくなる
  float fBack = saturate( dot( -normal, directionalLights[ 0 ].direction ) );
  float fToSun = pow( saturate( dot( -geometryViewDir, directionalLights[ 0 ].direction ) ), 3.0 );
  reflectedLight.directDiffuse += directionalLights[ 0 ].color * BRDF_Lambert( diffuseColor.rgb * vec3( 0.85, 1.0, 0.35 ) ) * ( fBack * 0.9 + fToSun * 0.4 ) * fSun;
  #endif
}`

function patch<T extends THREE.Material>(mat: T, kind: Kind, shared: Shared, defines: Record<string, string>, sway = 0, extra?: (sh: THREE.WebGLProgramParametersWithUniforms) => void) {
  const own = { uFSway: { value: sway } }
  mat.defines = { ...(mat.defines ?? {}), ...defines }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, own)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${V_PARS}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${V_WIND}`).replace('#include <project_vertex>', `#include <project_vertex>\n${V_MAIN}`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${F_PARS}`)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>\n${F_FADE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${F_BARK}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${F_LIGHT}`)
    extra?.(sh)
  }
  mat.customProgramCacheKey = () => `forest2-${kind}-${Object.entries(defines).map(([k, v]) => k + v).sort().join('.')}`
  return mat
}

/* ---------- 形をまとめて並べる（BatchedMesh） ---------- */

/** glb の形は量子化してあるので、ふつうの数に戻す（部品の拡大・回転も焼きこむ）。色の無い形には白を入れる */
function unpack(m: THREE.Mesh) {
  const geo = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const src = m.geometry.attributes[name] as THREE.BufferAttribute | undefined
    const size = name === 'uv' ? 2 : 3
    const n = m.geometry.attributes.position.count
    const arr = new Float32Array(n * size)
    if (!src) arr.fill(1)
    else {
      const get = [src.getX, src.getY, src.getZ].map((f) => f.bind(src))
      for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) arr[i * size + k] = get[k](i)
    }
    geo.setAttribute(name, new THREE.BufferAttribute(arr, size))
  }
  geo.setIndex(m.geometry.index)
  m.updateWorldMatrix(true, false)
  geo.applyMatrix4(m.matrixWorld)
  m.geometry.dispose()
  return geo
}

/** 1 種類の物：近く用と遠く用の形、置き場所、地面からの高さ、見える距離（倍率 1 のとき m。Infinity = いつも）、近く用を使う割合 */
type Item = { geos: THREE.BufferGeometry[]; spots: Spot[]; lift: number; see: number; near: number; tint: boolean }

/** 1 本ずつの出し入れの記録 */
type Lod = { mesh: THREE.BatchedMesh; pos: Float32Array; far: Float32Array; near: Float32Array; g0: Int32Array; g1: Int32Array; state: Uint8Array }

function makeBatch(name: string, mat: THREE.Material, items: Item[], see: number, fade: boolean, cast: boolean): Lod | null {
  items = items.filter((it) => it.spots.length && it.geos.length)
  const count = items.reduce((n, it) => n + it.spots.length, 0)
  if (!count) return null
  let nv = 0
  let ni = 0
  for (const it of items)
    for (const g of it.geos) {
      if (fade) g.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(Math.min(it.see, 1e4)), 1))
      nv += g.attributes.position.count
      ni += g.index!.count
    }
  const mesh = new THREE.BatchedMesh(count, nv, ni, mat)
  const L: Lod = { mesh, pos: new Float32Array(count * 3), far: new Float32Array(count), near: new Float32Array(count), g0: new Int32Array(count), g1: new Int32Array(count), state: new Uint8Array(count) }
  const m4 = new THREE.Matrix4()
  const col = new THREE.Color()
  for (const it of items) {
    const ids = it.geos.map((g) => mesh.addGeometry(g))
    for (const p of it.spots) {
      const id = mesh.addInstance(ids[0])
      standAt(p.s, p.y, it.lift * p.k + (p.h ?? 0), p.yaw, p.k, m4)
      mesh.setMatrixAt(id, m4)
      // 株ごとに、色を少しずつ変える
      const b = it.tint ? 0.86 + p.v * 0.26 : 0.9 + p.v * 0.16
      mesh.setColorAt(id, it.tint ? col.setRGB(b * (0.9 + ((p.v * 7) % 1) * 0.16), b, b * (0.84 + ((p.v * 13) % 1) * 0.2)) : col.setRGB(b, b, b))
      L.pos[id * 3] = m4.elements[12]
      L.pos[id * 3 + 1] = m4.elements[13]
      L.pos[id * 3 + 2] = m4.elements[14]
      L.far[id] = it.see * p.k * see
      L.near[id] = L.far[id] * it.near
      L.g0[id] = ids[0]
      L.g1[id] = ids[1] ?? -1
      L.state[id] = 1
    }
  }
  for (const it of items) for (const g of it.geos) g.dispose()
  mesh.castShadow = cast
  mesh.receiveShadow = true
  mesh.name = `forest-${name}`
  return L
}

/** 自分からの距離で、1 本ずつ「近く用・遠く用・出さない」を決める */
function updateLod(L: Lod, x: number, y: number, z: number) {
  const { mesh, pos, far, near, g0, g1, state } = L
  for (let i = 0; i < state.length; i++) {
    const dx = pos[i * 3] - x
    const dy = pos[i * 3 + 1] - y
    const dz = pos[i * 3 + 2] - z
    const d2 = dx * dx + dy * dy + dz * dz
    const want = d2 > far[i] * far[i] ? 0 : g1[i] >= 0 && d2 > near[i] * near[i] ? 2 : 1
    if (want === state[i]) continue
    if (want === 0) mesh.setVisibleAt(i, false)
    else {
      if (state[i] === 0) mesh.setVisibleAt(i, true)
      mesh.setGeometryIdAt(i, want === 1 ? g0[i] : g1[i])
    }
    state[i] = want
  }
}

/* ---------- 読み込み ---------- */

type Made = { objects: THREE.Object3D[]; lods: Lod[]; dispose: () => void }

async function build(shared: Shared, see: number): Promise<Made> {
  const level = currentLevel()
  // 高画質：葉のつや・凹凸あり。スマホ・軽い画質：画像は半分の大きさ
  const fine = level === 'high' && !lowMemory() && !isTouchDevice()
  const half = lowMemory() || isTouchDevice() || level === 'low'
  const shadows = level !== 'low' && !lowMemory()
  const J = jungleLayout()
  const F = jungleForest()!
  const loader = new THREE.TextureLoader()
  const textures: THREE.Texture[] = []
  const tex = async (name: string, opts: { color?: boolean; repeat?: boolean; small?: boolean } = {}) => {
    const t = await loader.loadAsync(`${BASE}textures/forest/${name}${half && opts.small !== false ? '.half' : ''}.webp`)
    t.flipY = false
    if (opts.color !== false) t.colorSpace = THREE.SRGBColorSpace
    if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = half ? 2 : 8
    textures.push(t)
    return t
  }
  const [{ GLTFLoader }, { MeshoptDecoder }, leavesA, leavesB, props, canopy, bark, floorLeaves, floorMoss, floorMud, normals] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    tex('leavesA'),
    tex('leavesB'),
    tex('props'),
    tex('canopy'),
    tex('bark', { repeat: true }),
    tex('floor_leaves', { repeat: true }),
    tex('floor_moss', { repeat: true }),
    tex('floor_mud', { repeat: true }),
    fine ? Promise.all([tex('leavesA_n', { color: false, small: false }), tex('bark_n', { color: false, repeat: true, small: false })]) : Promise.resolve(null),
  ])
  const gl = new GLTFLoader()
  gl.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await gl.loadAsync(`${BASE}models/forest-kit.glb`)
  const geos = new Map<string, THREE.BufferGeometry>()
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) geos.set(m.name, unpack(m))
  })

  const materials: THREE.Material[] = []
  const FLIP = new THREE.Vector2(1, -1)
  /** 葉：高画質はつやと凹凸あり。切り抜きのふちは、なめらかにする（アンチエイリアスがあるとき） */
  const leaf = (m: THREE.Texture, normal: THREE.Texture | null, sway: number) => {
    const base = { map: m, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, alphaToCoverage: fine }
    const mat = normal ? new THREE.MeshPhongMaterial({ ...base, normalMap: normal, normalScale: FLIP, specular: new THREE.Color(0.2, 0.22, 0.18), shininess: 34 }) : new THREE.MeshLambertMaterial(base)
    materials.push(mat)
    return patch(mat, 'leaf', shared, { FOREST_GAIN: '2.4', FOREST_LEAF: '', FOREST_WIND: '', FOREST_FADE: '', ...(normal ? { FOREST_SPEC: '' } : {}) }, sway)
  }
  const leafA = leaf(leavesA, normals?.[0] ?? null, 0.018)
  const leafB = leaf(leavesB, null, 0.028)
  const propMat = patch(new THREE.MeshLambertMaterial({ map: props, side: THREE.DoubleSide, vertexColors: true }), 'prop', shared, { FOREST_GAIN: '1.8', FOREST_MOSS: '', FOREST_FADE: '' })
  const barkMat = patch(new THREE.MeshLambertMaterial({ map: bark, vertexColors: true, ...(normals ? { normalMap: normals[1], normalScale: FLIP } : {}) }), 'bark', shared, { FOREST_GAIN: '2.0', FOREST_MOSS: '' })
  const canopyMat = patch(new THREE.MeshLambertMaterial({ map: canopy, alphaTest: 0.3, side: THREE.DoubleSide, vertexColors: true, alphaToCoverage: fine, color: new THREE.Color(0.78, 1, 0.66) }), 'canopy', shared, { FOREST_GAIN: '2.1', FOREST_LEAF: '', FOREST_SWAY_ATTR: '' })
  materials.push(propMat, barkMat, canopyMat)

  // 部品：近く用（名前そのまま）と遠く用（.1）。同じ形を何度も使うので、使うたびに写しを渡す（BatchedMesh が中に写し取る）
  const kitGeo = (n: string) => [geos.get(n), geos.get(`${n}.1`)].filter((g): g is THREE.BufferGeometry => !!g).map((g) => g.clone())
  const K = F.kit
  const item = (name: KitName, part = name as string): Item => ({ geos: kitGeo(part), spots: K[name], lift: KIT[name].lift, see: KIT[name].see, near: KIT[name].near, tint: true })
  const solid = (name: KitName, part = name as string): Item => ({ ...item(name, part), tint: false })
  const lods: (Lod | null)[] = [
    makeBatch('leavesA', leafA, [item('calathea_a'), item('calathea_b'), item('calathea_c'), item('anthurium_a'), item('anthurium_b'), item('anthurium_c'), item('arrow'), item('pachira_a', 'pachira_a_leaves'), item('pachira_b', 'pachira_b_leaves')], see, true, false),
    makeBatch('leavesB', leafB, [item('fern_a'), item('fern_b'), item('shrub'), item('creeper_a'), item('creeper_b')], see, true, false),
    makeBatch(
      'props',
      propMat,
      [solid('pachira_a', 'pachira_a_bark'), solid('pachira_b', 'pachira_b_bark'), solid('roots'), solid('stump'), solid('log'), solid('log_b'), solid('rock_a'), solid('rock_b'), solid('rock_c'), solid('rock_d')],
      see,
      true,
      shadows,
    ),
  ]
  for (const g of geos.values()) g.dispose()

  // 高い木と若木：形の種類ごとに、近く用と遠く用を作って並べる。高い木はいつも出す
  const trees = (kind: 'tall' | 'pole') => {
    const list = kind === 'tall' ? TALL : POLE
    const spots = kind === 'tall' ? F.tall : F.poles
    const wood: Item[] = []
    const crown: Item[] = []
    list.forEach((shape, variant) => {
      const near = shapeOf(kind, shape, 0)
      const far = shapeOf(kind, shape, 1)
      const mine = spots.filter((p) => p.variant === variant)
      // 高い木は 30 m（倍率 1 のとき）より遠くで軽い形。若木は 120 m より遠くでは出さない
      const see = kind === 'tall' ? Infinity : 120
      const nearFrac = kind === 'tall' ? 0 : 0.2
      wood.push({ geos: [near.wood, far.wood], spots: mine, lift: 0, see, near: nearFrac, tint: false })
      crown.push({ geos: [near.leaves, far.leaves], spots: mine, lift: 0, see, near: nearFrac, tint: false })
    })
    return { wood, crown }
  }
  const shapeOf = (kind: 'tall' | 'pole', shape: { r: number; h: number; seed: number }, lod: 0 | 1) => treeShape(kind, shape, lod)
  const tall = trees('tall')
  const pole = trees('pole')
  const woodL = makeBatch('wood', barkMat, [...tall.wood, ...pole.wood], see, false, shadows)
  const crownL = makeBatch('crown', canopyMat, [...tall.crown, ...pole.crown], see, false, false)
  // 高い木：近く用を使うのは 32 m まで（いつも出すので、far は無限。near だけ決める）
  for (const L of [woodL, crownL]) {
    if (!L) continue
    for (let i = 0; i < L.far.length; i++) if (!Number.isFinite(L.far[i])) L.near[i] = 32 * see
  }
  lods.push(woodL, crownL)

  // 床：落ち葉・苔・ぬれた土。今の地面のすぐ上に重ねて、ふちはまだらに溶かす
  const NS = JUNGLE_GATE.s
  const loop = [...J.trail, J.trail[0]]
  const mask = maskTexture(F, [
    [
      { s: NS, y: FLOOR.y0 - 2 },
      { s: NS, y: FLOOR.y0 + FLOOR.h + 2 },
    ],
    loop,
  ])
  textures.push(mask)
  const segX = 70
  const segY = 48
  const fg = new THREE.PlaneGeometry(1, 1, segX, segY)
  {
    const pos = fg.attributes.position as THREE.BufferAttribute
    const nor = fg.attributes.normal as THREE.BufferAttribute
    const uv = fg.attributes.uv as THREE.BufferAttribute
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      const fs = (pos.getX(i) + 0.5) * FLOOR.w
      const fy = (pos.getY(i) + 0.5) * FLOOR.h
      landPoint(FLOOR.s0 + fs, FLOOR.y0 + fy, GROUND_LIFT + FLOOR_LIFT, p)
      upAt(FLOOR.s0 + fs, n)
      pos.setXYZ(i, p.x, p.y, p.z)
      nor.setXYZ(i, n.x, n.y, n.z)
      // uv = 床の南西の角からの m
      uv.setXY(i, fs, fy)
    }
    // PlaneGeometry の面は +z 向きなので、円筒の内側（上）から見えるように面の向きを返す
    const idx = fg.index!
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1)
      idx.setX(i + 1, idx.getX(i + 2))
      idx.setX(i + 2, a)
    }
    fg.computeBoundingSphere()
  }
  const floorMat = new THREE.MeshLambertMaterial({ map: floorLeaves, transparent: true })
  materials.push(floorMat)
  const floorU = { uFMoss: { value: floorMoss }, uFMud: { value: floorMud }, uFMask: { value: mask } }
  patch(floorMat, 'floor', shared, {}, 0, (sh) => {
    Object.assign(sh.uniforms, floorU)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uFMoss;\nuniform sampler2D uFMud;\nuniform sampler2D uFMask;').replace(
      '#include <map_fragment>',
      /* glsl */ `
vec2 fp = vMapUv;
float n1 = texture2D(uFCookie, fp / 7.3 + 0.11).g;
float n2 = texture2D(uFCookie, fp / 23.0 + 0.53).g;
// 落ち葉：2 つの大きさで重ねて、くり返しを目立たなくする
vec3 fLit = mix(texture2D(map, fp / 2.6).rgb, texture2D(map, fp.yx / 6.7 + 0.31).rgb, 0.35);
vec3 fMoss = texture2D(uFMoss, fp / 2.3).rgb;
vec3 fMud = texture2D(uFMud, fp / 2.4).rgb;
vec4 fMask = texture2D(uFMask, fp / vec2(${f1(FLOOR.w)}, ${f1(FLOOR.h)}));
// 根元の暗がり（1 = 暗い）。暗く湿った所ほど苔が出る
float fSh = fMask.r;
float wMoss = smoothstep(0.38, 0.72, n2 * 0.9 + n1 * 0.35 + fSh * 0.4);
vec3 fCol = mix(fLit, fMoss * vec3(0.8, 0.95, 0.7), wMoss * 0.8);
// 小道：踏まれて落ち葉の少ない、ぬれた土
float wPath = smoothstep(0.3, 0.7, fMask.g + (n1 - 0.45) * 0.6);
fCol = mix(fCol, mix(fMud * 3.2, fLit * 0.8, 0.45), wPath * 0.9);
fCol *= 1.0 - 0.62 * fSh;
diffuseColor.rgb *= fCol * 1.25;
// ふち：まだらに崩して、今の地面へ溶かす
vec2 fE = min(fp, vec2(${f1(FLOOR.w)}, ${f1(FLOOR.h)}) - fp);
diffuseColor.a *= smoothstep(-2.2, 1.2, min(fE.x, fE.y) - ${f1(FLOOR_PAD)} + (n1 - 0.45) * 3.5 + (n2 - 0.45) * 2.0);`,
    )
  })
  const floor = new THREE.Mesh(fg, floorMat)
  floor.receiveShadow = true
  floor.renderOrder = 1
  floor.name = 'forest-floor'

  const live = lods.filter((l): l is Lod => !!l)
  return {
    objects: [...live.map((l) => l.mesh), floor],
    lods: live,
    dispose: () => {
      for (const l of live) l.mesh.dispose()
      fg.dispose()
      for (const m of materials) m.dispose()
      for (const t of textures) t.dispose()
    },
  }
}

/** 見える距離の倍率：画質・スマホ・まとめ描き（WEBGL_multi_draw）の無いブラウザでは近くだけ */
function seeScale(multiDraw: boolean) {
  let k = 1
  if (lowMemory() || currentLevel() === 'low') k = 0.6
  else if (isTouchDevice()) k = 0.8
  else if (currentLevel() === 'medium') k = 0.85
  // まとめ描きが無いと、1 本ずつ描くことになるので、数を減らす
  if (!multiDraw) k *= 0.65
  return k
}

export default function WalkForest() {
  const group = useRef<THREE.Group>(null!)
  const { gl, camera } = useThree()
  const see = useMemo(() => seeScale(gl.extensions.has('WEBGL_multi_draw')), [gl])
  const shared = useMemo<Shared>(() => ({ uFTime: { value: 0 }, uFCookie: { value: cookieTexture() }, uFSee: { value: see } }), [see])
  const made = useRef<Made | null>(null)
  useEffect(() => {
    let dead = false
    build(shared, see)
      .then((m) => {
        if (dead) return m.dispose()
        made.current = m
        group.current?.add(...m.objects)
      })
      .catch((e) => console.error('[walk] forest failed', e))
    return () => {
      dead = true
      const m = made.current
      if (m) {
        for (const o of m.objects) o.removeFromParent()
        m.dispose()
        made.current = null
      }
      shared.uFCookie.value.dispose()
    }
  }, [shared, see])
  const cam = useMemo(() => ({ p: new THREE.Vector3(), last: new THREE.Vector3(1e9, 0, 0), t: 0 }), [])
  useFrame(({ clock }) => {
    shared.uFTime.value = clock.elapsedTime
    const m = made.current
    if (!m) return
    // 出し入れは、1 m 動いたか 0.5 秒たったときだけ決め直す
    camera.getWorldPosition(cam.p)
    if (cam.p.distanceToSquared(cam.last) < 1 && clock.elapsedTime - cam.t < 0.5) return
    cam.last.copy(cam.p)
    cam.t = clock.elapsedTime
    for (const L of m.lods) updateLod(L, cam.p.x, cam.p.y, cam.p.z)
  })
  return <group ref={group} />
}
