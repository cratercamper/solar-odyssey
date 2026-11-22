import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../../state/store'
import { useLayout } from '../../state/useLayout'
import { UNITS_PER_METER } from '../../data/sf'
import { CARRIER_ID, SPACE_TEXT, carrierName } from '../../data/sfSpace'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'
import { roomEnvironment } from '../telescope/parts'

// くさび形の鉱石輸送船（オリジナルのデザイン）。長さ約1.6km。前は -Z。
// 平たいくさびの背に1本の稜線、両側の斜面にコンテナを並べ、船の下の開いた荷室に鉱石を抱える。
// 稜線の後ろ寄りに低い操縦室と放熱板、船尾にエンジンが6つ横一列。形は m で決める。

const NOSE = -800
const STERN = 800
const HALF_WIDTH = 470
const TOP = 210
const BOTTOM = -120
/** 小惑星帯のどのあたりを回るか（天文単位） */
const ROUTE_AU = 2.75
/** 1秒に進む角度（表示単位で約0.03。1周に数時間） */
const SPEED = 0.03

const rng = (seed: number) => {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

/** くさびの船体：鼻先から船尾へ広がる、上下の斜面と船尾の面 */
function hullGeometry() {
  const nT = new THREE.Vector3(0, 18, NOSE)
  const nB = new THREE.Vector3(0, -10, NOSE)
  const sT = new THREE.Vector3(0, TOP, STERN)
  const sB = new THREE.Vector3(0, BOTTOM, STERN)
  const L = new THREE.Vector3(-HALF_WIDTH, 0, STERN)
  const R = new THREE.Vector3(HALF_WIDTH, 0, STERN)
  const nL = new THREE.Vector3(-12, 0, NOSE)
  const nR = new THREE.Vector3(12, 0, NOSE)
  const tris = [
    // 上の斜面（左・右）
    [nT, L, sT], [nT, nL, L],
    [nT, sT, R], [nT, R, nR],
    // 下の斜面
    [nB, sB, L], [nB, L, nL],
    [nB, R, sB], [nB, nR, R],
    // 船尾
    [L, sB, sT], [R, sT, sB],
  ]
  const pos: number[] = []
  const uv: number[] = []
  for (const tri of tris)
    for (const v of tri) {
      pos.push(v.x, v.y, v.z)
      uv.push(v.x / (HALF_WIDTH * 2) + 0.5, (v.z - NOSE) / (STERN - NOSE))
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** 外板の模様：パネルの継ぎ目と、細かい窓の灯 */
function hullTextures() {
  const W = 1024
  const H = 2048
  const make = () => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    return { c, g: c.getContext('2d')! }
  }
  const rand = rng(23)
  const base = make()
  base.g.fillStyle = '#9a9d9f'
  base.g.fillRect(0, 0, W, H)
  for (let y = 0; y < H; y += 48)
    for (let x = 0; x < W; x += 96) {
      const v = 125 + rand() * 45
      base.g.fillStyle = `rgb(${v + 6}, ${v + 2}, ${v - 4})`
      base.g.fillRect(x + 2, y + 2, 92, 44)
    }
  base.g.fillStyle = 'rgba(40, 40, 44, 0.7)'
  for (let i = 0; i < 160; i++) base.g.fillRect(rand() * W, rand() * H, 20 + rand() * 80, 6 + rand() * 20)
  const lights = make()
  lights.g.fillStyle = '#000'
  lights.g.fillRect(0, 0, W, H)
  for (let i = 0; i < 1400; i++) {
    lights.g.fillStyle = `rgba(255, 225, 170, ${0.4 + rand() * 0.6})`
    lights.g.fillRect(rand() * W, rand() * H, 3, 2)
  }
  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }
  return { map: tex(base.c), emissive: tex(lights.c) }
}

/** 上の斜面の上の点（x の割合 0〜1 は稜線から縁まで、z は前後） */
function onTop(side: 1 | -1, k: number, z: number) {
  const f = (z - NOSE) / (STERN - NOSE)
  const half = 12 + (HALF_WIDTH - 12) * f
  const ridge = 18 + (TOP - 18) * f
  return new THREE.Vector3(side * half * k, ridge * (1 - k), z)
}

const Y = new THREE.Vector3(0, 1, 0)
const tangent = new THREE.Vector3()
const look = new THREE.Vector3()

export function OreCarrier() {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const layout = useLayout()
  const size = STERN * UNITS_PER_METER
  const moved = useSite(group, {
    id: CARRIER_ID,
    radius: size,
    zoom: { start: size * 10, full: size * 4 },
    notice: { distance: size * 6, text: SPACE_TEXT.carrierFound },
  })
  const { gl } = useThree()
  const parts = useMemo(() => {
    const env = roomEnvironment(gl)
    const tex = hullTextures()
    const rand = rng(9)

    // コンテナ：両側の斜面に、斜面にそって並べる
    const box = new THREE.BoxGeometry(70, 34, 34)
    const containerMat = new THREE.MeshStandardMaterial({ metalness: 0.3, roughness: 0.6, envMap: env, envMapIntensity: 0.4 })
    const spots: { pos: THREE.Vector3; q: THREE.Quaternion }[] = []
    for (const side of [1, -1] as const) {
      // 斜面の向き（法線）
      const a = onTop(side, 0.3, 0)
      const b = onTop(side, 0.8, 0)
      const c = onTop(side, 0.3, 300)
      const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize()
      if (n.y < 0) n.negate()
      const q = new THREE.Quaternion().setFromUnitVectors(Y, n)
      for (let z = -380; z <= 640; z += 44)
        for (let k = 0.3; k <= 0.86; k += 0.11) {
          if (rand() < 0.18) continue
          if (k > 0.3 + ((z + 380) / 1020) * 0.6) continue // 前ほど細いので、縁からはみ出さない
          const p = onTop(side, k, z).addScaledVector(n, 18 + Math.floor(rand() * 2) * 34)
          spots.push({ pos: p, q })
        }
    }
    const containers = new THREE.InstancedMesh(box, containerMat, spots.length)
    const colors = ['#c8662e', '#2f7f86', '#8a8f96', '#b89a3a', '#6d4d8a', '#c8662e']
    const m = new THREE.Matrix4()
    spots.forEach((s, i) => {
      containers.setMatrixAt(i, m.compose(s.pos, s.q, new THREE.Vector3(1, 1, 1)))
      containers.setColorAt(i, new THREE.Color(colors[Math.floor(rand() * colors.length)]))
    })

    // 荷室の鉱石
    const ore = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#6e5a48', roughness: 0.95 }), 40)
    for (let i = 0; i < 40; i++) {
      const s = 25 + rand() * 30
      m.compose(
        new THREE.Vector3((rand() - 0.5) * 420, -95 + rand() * 30, -100 + rand() * 650),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6, rand() * 6, rand() * 6)),
        new THREE.Vector3(s, s * 0.8, s),
      )
      ore.setMatrixAt(i, m)
    }
    return {
      hull: hullGeometry(),
      hullMat: new THREE.MeshStandardMaterial({
        map: tex.map,
        emissiveMap: tex.emissive,
        emissive: new THREE.Color(1.3, 1.1, 0.8),
        metalness: 0.45,
        roughness: 0.55,
        envMap: env,
        envMapIntensity: 0.5,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
      containers,
      ore,
      bay: new THREE.BoxGeometry(480, 90, 720),
      bayMat: new THREE.MeshStandardMaterial({ color: '#1c1d20', metalness: 0.3, roughness: 0.8, side: THREE.BackSide }),
      bayLight: new THREE.BoxGeometry(460, 4, 8),
      glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.3), toneMapped: false }),
      bridge: new THREE.BoxGeometry(150, 46, 110),
      windows: new THREE.BoxGeometry(152, 8, 112),
      fin: new THREE.BoxGeometry(6, 70, 180),
      frame: new THREE.MeshStandardMaterial({ color: '#6c7078', metalness: 0.6, roughness: 0.4, envMap: env, envMapIntensity: 0.5 }),
      engine: new THREE.CylinderGeometry(44, 54, 90, 24, 1, true),
      engineGlow: new THREE.CircleGeometry(42, 24),
      engineMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.5), toneMapped: false }),
      nav: new THREE.SphereGeometry(10, 8, 8),
      red: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.2, 0.15), toneMapped: false }),
      green: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.6, 0.5), toneMapped: false }),
      white: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), toneMapped: false }),
    }
  }, [gl])
  useEffect(
    () => () => {
      parts.hull.dispose()
      parts.hullMat.map?.dispose()
      parts.hullMat.emissiveMap?.dispose()
      parts.containers.dispose()
      parts.ore.dispose()
    },
    [parts],
  )

  const angle = useRef(1.9)
  const strobe = useRef(parts.white)
  useFrame(({ clock }, rawDelta) => {
    const r = layout.belt(ROUTE_AU)
    angle.current += (Math.min(rawDelta, 0.1) * SPEED) / r
    const a = angle.current
    const g = group.current
    g.position.set(Math.cos(a) * r, 0.6, -Math.sin(a) * r)
    // 進む向き（角度が増える向き）へ船首（-Z）を向ける
    tangent.set(-Math.sin(a), 0, -Math.cos(a))
    g.lookAt(look.copy(g.position).sub(tangent))
    moved()
    const t = clock.getElapsedTime() % 3
    strobe.current.color.setScalar(t < 0.1 || (t > 0.3 && t < 0.4) ? 3 : 0.1)
  })

  const engines = [-375, -225, -75, 75, 225, 375]
  return (
    <group ref={group}>
      <group scale={UNITS_PER_METER}>
        <mesh geometry={parts.hull} material={parts.hullMat} castShadow receiveShadow />
        <primitive object={parts.containers} />
        {/* 船の下の開いた荷室と、中の鉱石 */}
        <mesh geometry={parts.bay} material={parts.bayMat} position={[0, -70, 260]} />
        <primitive object={parts.ore} />
        {[0, 240, 480].map((z) => (
          <mesh key={z} geometry={parts.bayLight} material={parts.glow} position={[0, -28, z - 90]} />
        ))}
        {/* 稜線の上の低い操縦室と放熱板 */}
        <group position={[0, 0, 0]}>
          <mesh geometry={parts.bridge} material={parts.frame} position={[0, 0.82 * TOP + 23, 480]} />
          <mesh geometry={parts.windows} material={parts.glow} position={[0, 0.82 * TOP + 30, 480]} />
          {[-120, -40, 40, 120, 200].map((z) => (
            <mesh key={z} geometry={parts.fin} material={parts.frame} position={[0, ((z - NOSE) / (STERN - NOSE)) * TOP + 50, z]} />
          ))}
        </group>
        {/* 船尾のエンジン（横一列に6つ） */}
        {engines.map((x) => (
          <group key={x} position={[x * 0.92, 20 - Math.abs(x) * 0.12, STERN + 40]}>
            <mesh geometry={parts.engine} material={parts.frame} rotation={[Math.PI / 2, 0, 0]} />
            {/* 噴射口の光（後ろ向き） */}
            <mesh geometry={parts.engineGlow} material={parts.engineMat} position={[0, 0, 30]} />
          </group>
        ))}
        {/* 航行灯（左舷が赤・右舷が緑）と、船首と船尾の白いストロボ */}
        <mesh geometry={parts.nav} material={parts.red} position={[-HALF_WIDTH, 0, STERN]} />
        <mesh geometry={parts.nav} material={parts.green} position={[HALF_WIDTH, 0, STERN]} />
        <mesh geometry={parts.nav} material={parts.white} position={[0, 20, NOSE]} />
        <mesh geometry={parts.nav} material={parts.white} position={[0, TOP + 10, STERN]} />
      </group>
      <Html position={[0, size * 0.8, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(CARRIER_ID)}>
          {carrierName()}
        </span>
      </Html>
    </group>
  )
}
