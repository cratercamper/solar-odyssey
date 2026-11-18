import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ColonyModel } from '../sf/ColonyModel'
import { AVENUE, M, colonyDay, treeInstancesWhere, sharedInstancedMesh, treeGeometry, treeMaterial } from '../sf/colonyCity'
import { Batch, place, seeded } from '../sf/batch'
import { currentLevel, lowMemory } from '../../state/quality'
import { EW_END, EW_Y, FADE, G, GROUND_LIFT, LOOP, NS_S, PATCH, PATH_W, PLAY, PLAZA, POND, frameAt, inBoundsTree, landPoint, parkLayout, upAt } from './park'

// コロニーの中を歩く場面の、動かないもの：遠くのコロニー全体（宇宙の場面の形を 1/M 倍）、
// 公園の地面・池・木・ベンチ・街灯・遊具・噴水、空気のかすみ、昼と夜の光。

const HAZE_DAY = new THREE.Color('#9fc2e6')
const HAZE_NIGHT = new THREE.Color('#06090f')
const SKY_DAY = new THREE.Color('#d6e6ff')
const SKY_NIGHT = new THREE.Color('#41548a')
const GROUND_DAY = new THREE.Color('#5d6b45')
const GROUND_NIGHT = new THREE.Color('#1a1d24')
const LAMP_DAY = new THREE.Color(0.85, 0.85, 0.8)
const LAMP_NIGHT = new THREE.Color(2.6, 2.1, 1.4)

const q = new THREE.Quaternion()
const q2 = new THREE.Quaternion()
const Y = new THREE.Vector3(0, 1, 0)
const v = new THREE.Vector3()
const sc = new THREE.Vector3()
const m4 = new THREE.Matrix4()

/** 帯の上の (s, y) に、向き yaw で立てる行列（h は地面の板の上からの高さ。人と同じく GROUND_LIFT の上に置く） */
export function standAt(s: number, y: number, h: number, yaw: number, scale: number | [number, number, number], out = m4) {
  frameAt(s, q).multiply(q2.setFromAxisAngle(Y, yaw))
  landPoint(s, y, h + GROUND_LIFT, v)
  if (typeof scale === 'number') sc.setScalar(scale)
  else sc.set(...scale)
  return out.compose(v, q, sc)
}

/* ---------- 地面 ---------- */

// 地面は、写真から作った質感（Poly Haven、CC0）をくり返し貼り、どこに何を出すかは「区分けの絵」で決める。
// 区分けの絵 A：R = 小道（砂利）、G = 石畳（広場・歩道）、B = 砂（遊び場）
// 区分けの絵 B：R = アスファルト（大通り）、G = 池の岸の砂利、B = 道路の白線
// 何もないところは芝生。境目は少しぼかして、さらに細かいまだらで崩す。

const PX_PER_M = () => (lowMemory() || currentLevel() === 'low' ? 0.9 : currentLevel() === 'medium' ? 1.3 : 1.7)

/** 質感 1 枚が何 m 四方か（Poly Haven の実寸に近く） */
const TILE = { grass: 2.2, path: 3, paving: 2.5, sand: 2.1, shore: 2.5, asphalt: 3 }

const textureLoader = new THREE.TextureLoader()
const parkTextures = new Map<string, THREE.Texture>()
/** 公園の質感（public/textures/park/。一度読んだら、また歩くときのために捨てない） */
export function parkTexture(name: string, color = true) {
  let tex = parkTextures.get(name)
  if (!tex) {
    tex = textureLoader.load(`${import.meta.env.BASE_URL}textures/park/${name}.jpg`)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = 8
    if (color) tex.colorSpace = THREE.SRGBColorSpace
    parkTextures.set(name, tex)
  }
  return tex
}

function maskCanvases() {
  const k = PX_PER_M()
  const W = Math.round((PATCH.s1 - PATCH.s0) * k)
  const H = Math.round((PATCH.y1 - PATCH.y0) * k)
  const X = (s: number) => (s - PATCH.s0) * k
  const Yc = (y: number) => (PATCH.y1 - y) * k
  const make = () => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    g.fillStyle = '#000'
    g.fillRect(0, 0, W, H)
    g.globalCompositeOperation = 'lighter'
    g.lineCap = 'round'
    return { c, g }
  }
  const a = make()
  const b = make()
  // 小道（R）
  a.g.strokeStyle = '#f00'
  a.g.lineWidth = PATH_W * k
  a.g.beginPath()
  a.g.moveTo(X(AVENUE + 6), Yc(EW_Y))
  a.g.lineTo(X(EW_END), Yc(EW_Y))
  a.g.moveTo(X(NS_S), 0)
  a.g.lineTo(X(NS_S), H)
  a.g.moveTo(X(NS_S), Yc(PLAY.y))
  a.g.lineTo(X(PLAY.s - PLAY.r), Yc(PLAY.y))
  a.g.stroke()
  a.g.beginPath()
  a.g.ellipse(X(LOOP.s), Yc(LOOP.y), LOOP.rs * k, LOOP.ry * k, 0, 0, Math.PI * 2)
  a.g.stroke()
  // 石畳（G）：広場と大通りの歩道。広場は小道を消して上書き
  a.g.globalCompositeOperation = 'source-over'
  a.g.fillStyle = '#0f0'
  a.g.beginPath()
  a.g.arc(X(PLAZA.s), Yc(PLAZA.y), PLAZA.r * k, 0, Math.PI * 2)
  a.g.fill()
  for (const side of [-1, 1]) a.g.fillRect(X(side > 0 ? AVENUE - 2 : -AVENUE - 6), 0, 8 * k, H)
  // 砂（B）：遊び場
  a.g.fillStyle = '#00f'
  a.g.beginPath()
  a.g.arc(X(PLAY.s), Yc(PLAY.y), PLAY.r * k, 0, Math.PI * 2)
  a.g.fill()
  // アスファルト（R）と白線（B）
  b.g.fillStyle = '#f00'
  b.g.fillRect(X(-AVENUE + 2), 0, (AVENUE - 2) * 2 * k, H)
  b.g.strokeStyle = '#00f'
  b.g.lineWidth = Math.max(1, 0.18 * k)
  b.g.setLineDash([3 * k, 4 * k])
  for (const s of [-AVENUE / 2, AVENUE / 2]) {
    b.g.beginPath()
    b.g.moveTo(X(s), 0)
    b.g.lineTo(X(s), H)
    b.g.stroke()
  }
  b.g.setLineDash([])
  // 池の岸（G）
  b.g.fillStyle = '#0f0'
  b.g.beginPath()
  b.g.ellipse(X(POND.s), Yc(POND.y), (POND.rs + 5) * k, (POND.ry + 5) * k, 0, 0, Math.PI * 2)
  b.g.fill()
  // 境目をぼかす（0.6 m ほど）
  const soft = (src: HTMLCanvasElement) => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    g.filter = `blur(${Math.max(0.5, 0.6 * k)}px)`
    g.drawImage(src, 0, 0)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.NoColorSpace
    tex.anisotropy = 8
    return tex
  }
  return { a: soft(a.c), b: soft(b.c) }
}

/** 境目を崩す・くり返しを目立たなくする細かいまだら（6 m ごとにくり返す） */
function detailTexture() {
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  const img = g.createImageData(N, N)
  const rand = seeded(5)
  for (let i = 0; i < N * N; i++) {
    const n = 0.75 + rand() * 0.5
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.round(n * 170)
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  g.filter = 'blur(2px)'
  g.drawImage(c, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** 曲がった地面の一枚（円筒の内側に沿う）。uv は範囲の (0,0)〜(1,1) */
function patchGeometry(segS: number, segY: number, lift: number) {
  const geo = new THREE.PlaneGeometry(1, 1, segS, segY)
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    const s = PATCH.s0 + (pos.getX(i) + 0.5) * (PATCH.s1 - PATCH.s0)
    const y = PATCH.y0 + (pos.getY(i) + 0.5) * (PATCH.y1 - PATCH.y0)
    landPoint(s, y, lift, p)
    upAt(s, n)
    pos.setXYZ(i, p.x, p.y, p.z)
    nor.setXYZ(i, n.x, n.y, n.z)
  }
  // PlaneGeometry の面は +z を向くので、円筒の内側（上）から見えるように面の向きを返す
  const idx = geo.index!
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1)
    idx.setX(i + 1, idx.getX(i + 2))
    idx.setX(i + 2, a)
  }
  geo.computeBoundingSphere()
  return geo
}

function Ground() {
  const parts = useMemo(() => {
    const masks = maskCanvases()
    const detail = detailTexture()
    const mat = new THREE.MeshLambertMaterial({ map: masks.a, transparent: true })
    const size = new THREE.Vector2(PATCH.s1 - PATCH.s0, PATCH.y1 - PATCH.y0)
    const uniforms = {
      uMaskB: { value: masks.b },
      uDetail: { value: detail },
      uGrass: { value: parkTexture('grass') },
      uPath: { value: parkTexture('path') },
      uPaving: { value: parkTexture('paving') },
      uSand: { value: parkTexture('sand') },
      uShore: { value: parkTexture('shore') },
      uAsphalt: { value: parkTexture('asphalt') },
      uSize: { value: size },
      // 芝生を刈りそろえた緑に寄せる色（線形）
      uLawn: { value: new THREE.Color('#4f8a38').convertSRGBToLinear() },
      uFade: { value: new THREE.Vector2(FADE / size.x, FADE / size.y) },
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
uniform sampler2D uPath;
uniform sampler2D uPaving;
uniform sampler2D uSand;
uniform sampler2D uShore;
uniform sampler2D uAsphalt;
uniform vec2 uSize;
uniform vec3 uLawn;
uniform vec2 uFade;`,
        )
        .replace(
          '#include <map_fragment>',
          `vec2 wp = vMapUv * uSize;
vec4 mA = texture2D(map, vMapUv);
vec4 mB = texture2D(uMaskB, vMapUv);
float n1 = texture2D(uDetail, wp / 6.0).r;
float n2 = texture2D(uDetail, wp / 41.0 + 0.37).r;
// 芝生：2 つの大きさで重ね、色を刈りそろえた緑へ寄せる
vec3 g1 = texture2D(uGrass, wp / ${TILE.grass.toFixed(1)}).rgb;
vec3 g2 = texture2D(uGrass, wp / ${(TILE.grass * 3.7).toFixed(1)} + 0.21).rgb;
vec3 gr = mix(g1, g2, 0.35);
float lum = dot(gr, vec3(0.3, 0.59, 0.11));
vec3 col = mix(gr, uLawn * lum / 0.265, 0.75) * (0.75 + n2 * 0.55);
// 境目をまだらで崩す
float edge = (n1 - 0.67) * 0.9;
float wPath = clamp(mA.r + edge * mA.r * (1.0 - mA.r) * 4.0, 0.0, 1.0);
float wPave = smoothstep(0.35, 0.65, mA.g);
float wSand = clamp(mA.b + edge * mA.b * (1.0 - mA.b) * 4.0, 0.0, 1.0);
float wAsph = smoothstep(0.3, 0.7, mB.r);
float wShore = clamp(mB.g + edge * mB.g * (1.0 - mB.g) * 4.0, 0.0, 1.0);
col = mix(col, texture2D(uShore, wp / ${TILE.shore.toFixed(1)}).rgb, wShore);
col = mix(col, texture2D(uPath, wp / ${TILE.path.toFixed(1)}).rgb * 1.05, wPath);
col = mix(col, texture2D(uSand, wp / ${TILE.sand.toFixed(1)}).rgb * 1.35, wSand);
col = mix(col, texture2D(uPaving, wp / ${TILE.paving.toFixed(1)}).rgb * 1.6, wPave);
col = mix(col, texture2D(uAsphalt, wp / ${TILE.asphalt.toFixed(1)}).rgb, wAsph);
col = mix(col, vec3(0.75), smoothstep(0.3, 0.7, mB.b) * wAsph);
diffuseColor.rgb *= col;
vec2 e = min(vMapUv, 1.0 - vMapUv) / uFade;
diffuseColor.a *= smoothstep(0.0, 1.0, min(e.x, e.y));`,
        )
    }
    mat.customProgramCacheKey = () => 'walk-ground-2'
    mat.userData.maskB = masks.b
    // 池の水：楕円の網（中心から外へ）
    const ring = 40
    const segA = 96
    const wpos: number[] = []
    const wnor: number[] = []
    const widx: number[] = []
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    for (let i = 0; i <= ring; i++)
      for (let j = 0; j <= segA; j++) {
        const r = i / ring
        const a = (j / segA) * Math.PI * 2
        const s = POND.s + Math.cos(a) * POND.rs * r
        const y = POND.y + Math.sin(a) * POND.ry * r
        landPoint(s, y, 0.14, p)
        upAt(s, n)
        wpos.push(p.x, p.y, p.z)
        wnor.push(n.x, n.y, n.z)
      }
    for (let i = 0; i < ring; i++)
      for (let j = 0; j < segA; j++) {
        const a = i * (segA + 1) + j
        const b = a + segA + 1
        widx.push(a, a + 1, b, a + 1, b + 1, b)
      }
    const water = new THREE.BufferGeometry()
    water.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3))
    water.setAttribute('normal', new THREE.Float32BufferAttribute(wnor, 3))
    water.setIndex(widx)
    water.computeBoundingSphere()
    return {
      geo: patchGeometry(96, 110, GROUND_LIFT),
      mat,
      water,
      waterMat: new THREE.MeshPhongMaterial({ color: '#2f6378', specular: '#b8cde0', shininess: 90, transparent: true, opacity: 0.93, side: THREE.DoubleSide }),
    }
  }, [])
  useEffect(
    () => () => {
      parts.geo.dispose()
      parts.mat.map?.dispose()
      ;(parts.mat.userData.maskB as THREE.Texture | undefined)?.dispose()
      parts.mat.dispose()
      parts.water.dispose()
      parts.waterMat.dispose()
    },
    [parts],
  )
  return (
    <>
      <mesh geometry={parts.geo} material={parts.mat} receiveShadow renderOrder={1} />
      <mesh geometry={parts.water} material={parts.waterMat} renderOrder={2} />
    </>
  )
}

/* ---------- 木・ベンチ・街灯・遊具・噴水 ---------- */

function useInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], colors?: number[]) {
  return useMemo(() => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length)
    list.forEach((m, i) => mesh.setMatrixAt(i, m))
    if (colors) {
      const c = new THREE.Color()
      colors.forEach((col, i) => mesh.setColorAt(i, c.setHex(col)))
    }
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.computeBoundingSphere()
    return mesh
  }, [geo, mat, list, colors])
}

/** 木の幹の皮（ケヤキ）。幹の円柱に、周りに 2 回・高さに 3 回くり返す */
function barkTexture() {
  const t = parkTexture('bark')
  t.repeat.set(2, 3)
  return t
}

/** 幹のある木（近くの木）。樹冠は 2 つの丸を重ねて、上が明るい */
function crownGeometry() {
  const a = new THREE.IcosahedronGeometry(0.5, 2)
  const b = new THREE.IcosahedronGeometry(0.36, 1).translate(0.18, 0.28, 0.08)
  const c = new THREE.IcosahedronGeometry(0.32, 1).translate(-0.2, 0.18, -0.12)
  const batch = new Batch()
  for (const g of [a, b, c]) batch.add(g)
  const geo = batch.build()
  // 少しでこぼこに
  const pos = geo.attributes.position
  const rand = seeded(3)
  const jitter = new Map<string, number>()
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`
    let j = jitter.get(key)
    if (j === undefined) jitter.set(key, (j = 0.9 + rand() * 0.2))
    pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j, pos.getZ(i) * j)
  }
  geo.computeVertexNormals()
  return geo
}

/**
 * 公園の木。近く（NEAR m 以内）は ez-tree（MIT）で作った枝と葉のある木、遠くは幹＋丸い樹冠の軽い木。
 * ez-tree は大きい（質感こみで 4 MB）ので、歩く場面に来たときに読み込む。読み終わるまでは全部を軽い木で描く。
 * 木の種類は、型（カシ・トネリコ・ポプラ）と乱数の種を変えて 6 種類。1 本ごとに向きと大きさも変える
 */
/** [ez-tree の型, 種, 出る割合]。Aspen は葉が秋の色なので使わない。松はところどころに */
const TREE_KINDS: [string, number, number][] = [
  ['Oak Medium', 11, 3],
  ['Oak Medium', 23, 3],
  ['Ash Medium', 37, 2],
  ['Ash Large', 41, 2],
  ['Oak Large', 67, 2],
  ['Pine Medium', 53, 1],
]
const KIND_TOTAL = TREE_KINDS.reduce((a, k) => a + k[2], 0)
function pickKind(r: number) {
  let x = r * KIND_TOTAL
  for (let i = 0; i < TREE_KINDS.length; i++) if ((x -= TREE_KINDS[i][2]) < 0) return i
  return 0
}
const nearDistance = () => (lowMemory() || currentLevel() === 'low' ? 70 : currentLevel() === 'medium' ? 110 : 150)

type TreeKind = { branches: THREE.InstancedMesh; leaves: THREE.InstancedMesh; update: (t: number) => void; height: number }

function Trees({ follow }: { follow: { current: THREE.Vector3 } }) {
  const park = parkLayout()
  const data = useMemo(() => {
    const rand = seeded(41)
    const items = park.trees.map((t) => {
      const yaw = rand() * Math.PI * 2
      const w = t.h * (0.55 + rand() * 0.2)
      return {
        t,
        yaw,
        kind: pickKind(rand()),
        trunk: standAt(t.s, t.y, t.h * 0.22, yaw, [0.16 + t.h * 0.012, t.h * 0.44, 0.16 + t.h * 0.012], new THREE.Matrix4()),
        crown: standAt(t.s, t.y, t.h * 0.62, yaw, [w, t.h * 0.62, w], new THREE.Matrix4()),
      }
    })
    const n = items.length
    const trunkMat = new THREE.MeshLambertMaterial({ color: '#d8ccbe', map: barkTexture() })
    const crownMat = new THREE.MeshLambertMaterial({ color: '#ffffff' })
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.5, 1, 7), trunkMat, n)
    const crowns = new THREE.InstancedMesh(crownGeometry(), crownMat, n)
    const c = new THREE.Color()
    items.forEach((it, i) => {
      trunks.setMatrixAt(i, it.trunk)
      crowns.setMatrixAt(i, it.crown)
      crowns.setColorAt(i, c.setHex(it.t.color))
    })
    for (const m of [trunks, crowns]) {
      m.castShadow = m.receiveShadow = true
      m.frustumCulled = false
    }
    return { items, trunks, crowns, crownMat }
  }, [park])
  const group = useRef<THREE.Group>(null!)
  const kinds = useRef<TreeKind[] | null>(null)
  const st = useRef({ next: 0, near: new Uint8Array(data.items.length) })

  // ez-tree を読み込んで、種類ごとの木を作る
  useEffect(() => {
    let dead = false
    const made: TreeKind[] = []
    void import('@dgreenheck/ez-tree')
      .then(({ Tree }) => {
        if (dead) return
        for (const [preset, seed] of TREE_KINDS) {
          const tree = new Tree()
          tree.loadPreset(preset)
          tree.options.seed = seed
          tree.generate()
          const box = new THREE.Box3().setFromObject(tree)
          const cap = data.items.length
          const branches = new THREE.InstancedMesh(tree.branchesMesh.geometry, tree.branchesMesh.material, cap)
          // ez-tree の葉の材質は、風で揺らすために project_vertex を書き換えていて、instanceMatrix を掛けない。
          // そのままだと葉がぜんぶ原点に集まって見えないので、書き換えのあとに instanceMatrix を足す
          const leafMat = tree.leavesMesh.material as THREE.Material
          const ezCompile = leafMat.onBeforeCompile.bind(leafMat)
          leafMat.onBeforeCompile = (shader, renderer) => {
            ezCompile(shader, renderer)
            shader.vertexShader = shader.vertexShader.replace(
              'mvPosition = modelViewMatrix * mvPosition;',
              '#ifdef USE_INSTANCING\n mvPosition = instanceMatrix * mvPosition;\n#endif\n mvPosition = modelViewMatrix * mvPosition;',
            )
          }
          leafMat.customProgramCacheKey = () => 'eztree-leaves-instanced'
          const leaves = new THREE.InstancedMesh(tree.leavesMesh.geometry, leafMat, cap)
          for (const m of [branches, leaves]) {
            m.count = 0
            m.castShadow = m.receiveShadow = true
            m.frustumCulled = false
          }
          made.push({ branches, leaves, update: (t) => tree.update(t), height: Math.max(1, box.max.y - box.min.y) })
          group.current?.add(branches, leaves)
        }
        kinds.current = made
        st.current.next = 0
      })
      .catch((e) => console.error('[walk] ez-tree failed, keeping simple trees', e))
    return () => {
      dead = true
      for (const k of made) {
        k.branches.removeFromParent()
        k.leaves.removeFromParent()
        k.branches.geometry.dispose()
        k.leaves.geometry.dispose()
        ;(k.branches.material as THREE.Material).dispose()
        ;(k.leaves.material as THREE.Material).dispose()
      }
      kinds.current = null
    }
  }, [data])

  const m = useMemo(() => new THREE.Matrix4(), [])
  useFrame(({ clock }) => {
    // 夜は軽い木の葉を暗く
    data.crownMat.color.setScalar(1 - 0.75 * colonyDay.night)
    const ks = kinds.current
    if (ks) for (const k of ks) k.update(clock.elapsedTime)
    // 近い木・遠い木を、ときどき分け直す
    const s = st.current
    if (clock.elapsedTime < s.next) return
    s.next = clock.elapsedTime + 0.5
    const near = nearDistance()
    const p = follow.current
    let far = 0
    if (ks) for (const k of ks) k.branches.count = k.leaves.count = 0
    data.items.forEach((it) => {
      landPoint(it.t.s, it.t.y, 0, v)
      const close = !!ks && v.distanceTo(p) < near
      if (close && ks) {
        const k = ks[it.kind]
        const sc = (it.t.h / k.height) * 1.15
        standAt(it.t.s, it.t.y, -0.2, it.yaw, sc, m)
        k.branches.setMatrixAt(k.branches.count++, m)
        k.leaves.setMatrixAt(k.leaves.count++, m)
        return
      }
      data.trunks.setMatrixAt(far, it.trunk)
      data.crowns.setMatrixAt(far, it.crown)
      data.crowns.setColorAt(far, c.setHex(it.t.color))
      far++
    })
    data.trunks.count = data.crowns.count = far
    data.trunks.instanceMatrix.needsUpdate = data.crowns.instanceMatrix.needsUpdate = true
    if (data.crowns.instanceColor) data.crowns.instanceColor.needsUpdate = true
    if (ks)
      for (const k of ks) {
        k.branches.instanceMatrix.needsUpdate = true
        k.leaves.instanceMatrix.needsUpdate = true
      }
  })
  return (
    <group ref={group}>
      <primitive object={data.trunks} />
      <primitive object={data.crowns} />
    </group>
  )
}
const c = new THREE.Color()

function benchGeometry() {
  const box = new THREE.BoxGeometry(1, 1, 1)
  const wood = new Batch()
  // 座面と背もたれ（板 3 枚ずつ）。座る人の前は -z
  for (let i = 0; i < 3; i++) wood.add(box, place([0, 0.44, -0.08 + i * 0.15], [0, 0, 0], [1.7, 0.04, 0.12]))
  for (let i = 0; i < 3; i++) wood.add(box, place([0, 0.62 + i * 0.14, 0.27], [-0.18, 0, 0], [1.7, 0.1, 0.035]))
  const iron = new Batch()
  for (const x of [-0.75, 0.75]) {
    iron.add(box, place([x, 0.22, -0.12], [0, 0, 0], [0.05, 0.44, 0.05]))
    iron.add(box, place([x, 0.22, 0.2], [0, 0, 0], [0.05, 0.44, 0.05]))
    iron.add(box, place([x, 0.6, 0.27], [-0.18, 0, 0], [0.05, 0.5, 0.05]))
    iron.add(box, place([x, 0.56, 0.02], [0, 0, 0], [0.05, 0.04, 0.42]))
  }
  return { wood: wood.build(), iron: iron.build() }
}

/** まん中が明るく、外へ向かって消える丸 */
function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function lampGeometry() {
  const pole = new Batch()
  pole.add(new THREE.CylinderGeometry(0.05, 0.08, 3.6, 8), place([0, 1.8, 0]))
  pole.add(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 10), place([0, 3.62, 0]))
  return { pole: pole.build(), head: new THREE.SphereGeometry(0.17, 12, 8).translate(0, 3.78, 0) }
}

function Furniture() {
  const park = parkLayout()
  const data = useMemo(() => {
    const bench = benchGeometry()
    const lamp = lampGeometry()
    const benches = park.benches.map((b) => standAt(b.s, b.y, 0, b.yaw, 1, new THREE.Matrix4()))
    const lamps = park.lamps.map((l) => standAt(l.s, l.y, 0, 0, 1, new THREE.Matrix4()))
    return {
      bench,
      lamp,
      benches,
      lamps,
      woodMat: new THREE.MeshLambertMaterial({ color: '#e0b98a', map: parkTexture('planks') }),
      ironMat: new THREE.MeshLambertMaterial({ color: '#2f3336' }),
      headMat: new THREE.MeshBasicMaterial({ color: LAMP_DAY.clone(), toneMapped: false }),
      // 夜、街灯の下の地面を照らす光の輪（加算で重ねる）
      pool: { geo: new THREE.CircleGeometry(9, 32).rotateX(-Math.PI / 2), mat: new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffcf8a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }) },
    }
  }, [park])
  const pools = useMemo(() => {
    const mesh = new THREE.InstancedMesh(data.pool.geo, data.pool.mat, data.lamps.length)
    park.lamps.forEach((l, i) => mesh.setMatrixAt(i, standAt(l.s, l.y, 0.12, 0, 1, new THREE.Matrix4())))
    mesh.computeBoundingSphere()
    mesh.renderOrder = 3
    return mesh
  }, [data, park])
  const wood = useInstanced(data.bench.wood, data.woodMat, data.benches)
  const iron = useInstanced(data.bench.iron, data.ironMat, data.benches)
  const poles = useInstanced(data.lamp.pole, data.ironMat, data.lamps)
  const heads = useInstanced(data.lamp.head, data.headMat, data.lamps)
  heads.castShadow = false
  useFrame(() => {
    data.headMat.color.lerpColors(LAMP_DAY, LAMP_NIGHT, colonyDay.night)
    data.pool.mat.opacity = colonyDay.night * 0.85
    pools.visible = colonyDay.night > 0.02
  })
  return (
    <>
      <primitive object={wood} />
      <primitive object={iron} />
      <primitive object={poles} />
      <primitive object={heads} />
      <primitive object={pools} />
    </>
  )
}

/** 遊び場（すべり台・ぶらんこ・ジャングルジムの丸屋根）と、広場の噴水 */
function PlayAndPlaza() {
  const meshes = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1)
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10)
    const out: { geo: THREE.BufferGeometry; mat: THREE.Material; at: THREE.Matrix4 }[] = []
    const add = (b: Batch, color: string, s: number, y: number, yaw: number) => out.push({ geo: b.build(), mat: new THREE.MeshLambertMaterial({ color }), at: standAt(s, y, 0, yaw, 1, new THREE.Matrix4()) })
    // すべり台
    const slide = new Batch()
    slide.add(box, place([0, 1.0, 0], [0, 0, 0], [1.2, 0.08, 1.2]))
    for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) slide.add(cyl, place([x, 0.5, z], [0, 0, 0], [0.08, 1.0, 0.08]))
    const slideRed = new Batch()
    slideRed.add(box, place([0, 0.55, -1.85], [-0.42, 0, 0], [0.8, 0.06, 2.6]))
    for (const x of [-0.42, 0.42]) slideRed.add(box, place([x, 0.68, -1.85], [-0.42, 0, 0], [0.06, 0.25, 2.6]))
    const ladder = new Batch()
    for (const x of [-0.3, 0.3]) ladder.add(cyl, place([x, 0.6, 1.0], [0.3, 0, 0], [0.06, 1.3, 0.06]))
    for (let i = 0; i < 4; i++) ladder.add(cyl, place([0, 0.2 + i * 0.27, 0.86 + i * 0.08], [0, 0, Math.PI / 2], [0.05, 0.6, 0.05]))
    add(slide, '#e0b43c', PLAY.s - 8, PLAY.y + 6, 0.6)
    add(slideRed, '#d8452f', PLAY.s - 8, PLAY.y + 6, 0.6)
    add(ladder, '#3a78c8', PLAY.s - 8, PLAY.y + 6, 0.6)
    // ぶらんこ
    const frame = new Batch()
    for (const x of [-1.8, 1.8]) {
      frame.add(cyl, place([x, 1.1, -0.6], [0.5, 0, 0], [0.09, 2.5, 0.09]))
      frame.add(cyl, place([x, 1.1, 0.6], [-0.5, 0, 0], [0.09, 2.5, 0.09]))
    }
    frame.add(cyl, place([0, 2.2, 0], [0, 0, Math.PI / 2], [0.1, 3.8, 0.1]))
    const seats = new Batch()
    for (const x of [-0.8, 0.8]) {
      seats.add(box, place([x, 0.45, 0], [0, 0, 0], [0.5, 0.05, 0.22]))
      for (const dx of [-0.22, 0.22]) seats.add(cyl, place([x + dx, 1.33, 0], [0, 0, 0], [0.015, 1.75, 0.015]))
    }
    add(frame, '#3f8f5a', PLAY.s + 9, PLAY.y - 4, -0.3)
    add(seats, '#33363a', PLAY.s + 9, PLAY.y - 4, -0.3)
    // ジャングルジムの丸屋根（格子の帯）
    const dome = new Batch()
    for (let i = 0; i < 8; i++) dome.add(new THREE.TorusGeometry(1.8, 0.04, 6, 24, Math.PI), place([0, 0, 0], [0, (i / 8) * Math.PI, 0]))
    for (const h of [0.6, 1.2]) {
      const r = Math.sqrt(1.8 * 1.8 - h * h)
      dome.add(new THREE.TorusGeometry(r, 0.04, 6, 32), place([0, h, 0], [Math.PI / 2, 0, 0]))
    }
    add(dome, '#c85a9a', PLAY.s + 2, PLAY.y + 11, 0)
    // 噴水：丸い池の縁と、まん中の柱、水
    const basin = new Batch()
    basin.add(new THREE.TorusGeometry(4.6, 0.32, 8, 40), place([0, 0.32, 0], [Math.PI / 2, 0, 0]))
    basin.add(new THREE.CylinderGeometry(0.45, 0.6, 1.4, 12), place([0, 0.7, 0]))
    basin.add(new THREE.CylinderGeometry(1.3, 1.1, 0.2, 20), place([0, 1.45, 0]))
    add(basin, '#c9c3b6', PLAZA.s, PLAZA.y, 0)
    const pool = new Batch()
    pool.add(new THREE.CylinderGeometry(4.5, 4.5, 0.05, 40), place([0, 0.42, 0]))
    out.push({ geo: pool.build(), mat: new THREE.MeshPhongMaterial({ color: '#3a7a92', specular: '#ffffff', shininess: 80 }), at: standAt(PLAZA.s, PLAZA.y, 0, 0, 1, new THREE.Matrix4()) })
    const spray = new THREE.CylinderGeometry(0.06, 0.5, 2.6, 16, 1, true).translate(0, 2.6, 0)
    out.push({ geo: spray, mat: new THREE.MeshBasicMaterial({ color: '#dff2ff', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }), at: standAt(PLAZA.s, PLAZA.y, 0, 0, 1, new THREE.Matrix4()) })
    return out
  }, [])
  useEffect(
    () => () => {
      for (const m of meshes) {
        m.geo.dispose()
        m.mat.dispose()
      }
    },
    [meshes],
  )
  return (
    <>
      {meshes.map((m, i) => (
        <mesh key={i} geometry={m.geo} material={m.mat} matrixAutoUpdate={false} matrix={m.at} castShadow receiveShadow />
      ))}
    </>
  )
}

/* ---------- 遠くのコロニー ---------- */

function FarColony() {
  const trees = useMemo(() => sharedInstancedMesh(treeGeometry(), treeMaterial, treeInstancesWhere((k, t) => !(k === 0 && inBoundsTree(t)))), [])
  useEffect(() => () => trees.dispose(), [trees])
  return (
    <group scale={1 / M}>
      <ColonyModel interior cityTrees={false} />
      <primitive object={trees} />
    </group>
  )
}

/* ---------- 光と空気 ---------- */

/** 昼と夜の光。follow の位置（自分）のまわりだけ影を作る */
function Lights({ follow }: { follow: { current: THREE.Vector3 } }) {
  const { scene } = useThree()
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const sun = useRef<THREE.DirectionalLight>(null!)
  // 夜：向こう側の街の灯りが、ぼんやり全体を照らす
  const glow = useRef<THREE.AmbientLight>(null!)
  const level = currentLevel()
  const shadows = level !== 'low' && !lowMemory()
  const center = useMemo(() => {
    const s = (PATCH.s0 + PATCH.s1) / 2
    return { up: upAt(s), east: new THREE.Vector3(Math.cos(s / G), 0, -Math.sin(s / G)) }
  }, [])
  // 光は窓（大地の帯のとなり）から斜めに入ってくる：上から東へ 35°、少し太陽の側（北）から
  const dir = useMemo(() => center.up.clone().multiplyScalar(Math.cos(0.6)).addScaledVector(center.east, Math.sin(0.6)).add(new THREE.Vector3(0, 0.25, 0)).normalize(), [center])
  useEffect(() => {
    scene.fog = new THREE.FogExp2(HAZE_DAY.clone(), 0.000055)
    scene.background = HAZE_DAY.clone()
    return () => {
      scene.fog = null
      scene.background = null
    }
  }, [scene])
  useFrame(() => {
    const n = colonyDay.night
    const fog = scene.fog as THREE.FogExp2
    fog.color.lerpColors(HAZE_DAY, HAZE_NIGHT, n)
    ;(scene.background as THREE.Color).copy(fog.color)
    hemi.current.color.lerpColors(SKY_DAY, SKY_NIGHT, n)
    hemi.current.groundColor.lerpColors(GROUND_DAY, GROUND_NIGHT, n)
    hemi.current.intensity = 1.25 - 0.8 * n
    hemi.current.position.copy(center.up)
    glow.current.intensity = 0.9 * n
    const s = sun.current
    s.intensity = 1.7 * (1 - n)
    s.position.copy(follow.current).addScaledVector(dir, 120)
    s.target.position.copy(follow.current)
    s.target.updateMatrixWorld()
  })
  return (
    <>
      <hemisphereLight ref={hemi} />
      <ambientLight ref={glow} color="#9aa6d0" intensity={0} />
      <directionalLight
        ref={sun}
        castShadow={shadows}
        shadow-mapSize={[level === 'high' ? 2048 : 1024, level === 'high' ? 2048 : 1024]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={1}
        shadow-camera-far={300}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  )
}

/** テスト用：歩く場面の scene と renderer */
export const walkDebug = { scene: null as THREE.Scene | null, gl: null as THREE.WebGLRenderer | null }

function Debug() {
  const { scene, gl } = useThree()
  useEffect(() => {
    walkDebug.scene = scene
    walkDebug.gl = gl
    return () => {
      walkDebug.scene = null
      walkDebug.gl = null
    }
  }, [scene, gl])
  return null
}

export function WalkWorld({ follow }: { follow: { current: THREE.Vector3 } }) {
  return (
    <>
      <Debug />
      <Lights follow={follow} />
      <FarColony />
      <Ground />
      <Trees follow={follow} />
      <Furniture />
      <PlayAndPlaza />
    </>
  )
}
