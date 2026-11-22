import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { colonyDay } from '../sf/colonyCity'
import { G, GROUND_LIFT, landPoint } from './park'
import { BRIDGE_HALF, BRIDGE_Y } from './cylinder'
import { parkTexture, standAt } from './WalkWorld'

// 窓の帯（ガラス）にかけた橋。3 本の窓の帯に 4 本ずつ、となりの大地の帯のふちからふちまで約 4.2 km。
// 床は歩く地面と同じ高さで、床の下はガラスまで数 m。両側にガラスの手すり、床のふちに夜に灯る光の線、
// 250 m ごとに窓の格子へ降りる脚。どこからでも見えるので、いつも描く（区画の仕組みとは別）。

const DEG = Math.PI / 180
/** 区切りの長さ m（地面が曲がるので、この長さごとに折る） */
const SEG = 20

type Profile = [number, number][]

/** 横断面（[軸の向きのずれ m, 地面からの高さ m] の列）を、橋の長さに沿って引き伸ばした形 */
function sweep(s0: number, s1: number, yb: number, profile: Profile, closed: boolean, uvScale = 0) {
  const n = Math.max(1, Math.ceil((s1 - s0) / SEG))
  const m = profile.length
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const p = new THREE.Vector3()
  // 面ごとに頂点を分けて、角をくっきりさせる
  const edges = closed ? m : m - 1
  for (let e = 0; e < edges; e++) {
    const [d0, h0] = profile[e]
    const [d1, h1] = profile[(e + 1) % m]
    const base = pos.length / 3
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n
      for (const [d, h] of [
        [d0, h0],
        [d1, h1],
      ]) {
        landPoint(s, yb + d, h, p)
        pos.push(p.x, p.y, p.z)
        uv.push(uvScale ? s / uvScale : i, uvScale ? (yb + d) / uvScale : 0)
      }
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

function merge(list: THREE.BufferGeometry[]) {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (const g of list) {
    const base = pos.length / 3
    pos.push(...(g.attributes.position.array as Float32Array))
    nor.push(...(g.attributes.normal.array as Float32Array))
    uv.push(...(g.attributes.uv.array as Float32Array))
    for (const i of g.index!.array) idx.push(i + base)
    g.dispose()
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

const W = BRIDGE_HALF
const TOP = GROUND_LIFT
/** 床（上面）と、床の板の横と下 */
const DECK: Profile = [
  [-W, TOP],
  [-W, TOP - 1.3],
  [W, TOP - 1.3],
  [W, TOP],
]
const TOP_FACE: Profile = [
  [W, TOP],
  [-W, TOP],
]
/** 手すりのガラス（両側）と、上の手すり */
const glassProfile = (side: number): Profile => [
  [side * (W - 0.15), TOP + 1.1],
  [side * (W - 0.15), TOP],
]
// 面の向き（外向き・上向き）がそろうよう、片側は点の順を逆にする
const railProfile = (side: number): Profile => {
  const p: Profile = [
    [side * (W - 0.22), TOP + 1.1],
    [side * (W - 0.08), TOP + 1.1],
    [side * (W - 0.08), TOP + 1.18],
    [side * (W - 0.22), TOP + 1.18],
  ]
  return side < 0 ? p.reverse() : p
}
/** 床のふちの光の線 */
const glowProfile = (side: number): Profile => {
  const p: Profile = [
    [side * (W - 0.55), TOP + 0.012],
    [side * (W - 0.35), TOP + 0.012],
  ]
  return side > 0 ? p.reverse() : p
}

const DAY_LINE = new THREE.Color(0.55, 0.62, 0.7)
const NIGHT_LINE = new THREE.Color(0.6, 1.6, 2.2)

export function WalkBridges() {
  const parts = useMemo(() => {
    const decks: THREE.BufferGeometry[] = []
    const tops: THREE.BufferGeometry[] = []
    const glass: THREE.BufferGeometry[] = []
    const rails: THREE.BufferGeometry[] = []
    const lines: THREE.BufferGeometry[] = []
    const legs: THREE.Matrix4[] = []
    for (let band = 0; band < 3; band++) {
      // 窓の帯 band は、角度 30° + 120°×band から 60° ぶん。床は両側の大地へ 12 m ずつのせる
      const s0 = (30 + band * 120) * DEG * G - 12
      const s1 = (90 + band * 120) * DEG * G + 12
      for (const yb of BRIDGE_Y) {
        decks.push(sweep(s0, s1, yb, DECK, false))
        tops.push(sweep(s0, s1, yb, TOP_FACE, false, 2.5))
        for (const side of [-1, 1]) {
          glass.push(sweep(s0 + 12, s1 - 12, yb, glassProfile(side), false))
          rails.push(sweep(s0, s1, yb, railProfile(side), true))
          lines.push(sweep(s0, s1, yb, glowProfile(side), false))
        }
        // 窓の格子へ降りる脚（床の下からガラスまで、約 5 m）
        const depth = 4000 - G + 0.5
        for (let s = s0 + 250; s < s1 - 100; s += 250) legs.push(standAt(s, yb, TOP - 1.3 - depth, 0, [1.4, depth, W * 1.2], new THREE.Matrix4()))
      }
    }
    const deckTex = parkTexture('paving').clone()
    deckTex.needsUpdate = true
    const legGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
    const legMat = new THREE.MeshLambertMaterial({ color: '#7d838c' })
    const legMesh = new THREE.InstancedMesh(legGeo, legMat, legs.length)
    legs.forEach((m, i) => legMesh.setMatrixAt(i, m))
    legMesh.computeBoundingSphere()
    const lineMat = new THREE.MeshBasicMaterial({ color: DAY_LINE.clone(), toneMapped: false })
    return {
      deck: merge(decks),
      top: merge(tops),
      glass: merge(glass),
      rails: merge(rails),
      lines: merge(lines),
      deckMat: new THREE.MeshLambertMaterial({ color: '#9aa0a8' }),
      topMat: new THREE.MeshLambertMaterial({ color: '#d6d2c8', map: deckTex }),
      glassMat: new THREE.MeshLambertMaterial({ color: '#cfe6f2', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
      railMat: new THREE.MeshLambertMaterial({ color: '#b9bec4' }),
      lineMat,
      legMesh,
      legGeo,
      legMat,
      deckTex,
    }
  }, [])
  useEffect(
    () => () => {
      for (const v of Object.values(parts)) if (v instanceof THREE.BufferGeometry || v instanceof THREE.Material || v instanceof THREE.Texture) v.dispose()
      parts.legMesh.dispose()
    },
    [parts],
  )
  useFrame(() => {
    parts.lineMat.color.lerpColors(DAY_LINE, NIGHT_LINE, colonyDay.night)
  })
  return (
    <>
      <mesh geometry={parts.deck} material={parts.deckMat} receiveShadow castShadow />
      <mesh geometry={parts.top} material={parts.topMat} receiveShadow />
      <mesh geometry={parts.rails} material={parts.railMat} castShadow />
      <mesh geometry={parts.lines} material={parts.lineMat} />
      <mesh geometry={parts.glass} material={parts.glassMat} renderOrder={3} />
      <primitive object={parts.legMesh} />
    </>
  )
}
