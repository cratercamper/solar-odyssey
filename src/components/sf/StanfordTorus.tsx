import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { COLONY_LENGTH, COLONY_REAL_KM, COLONY_ZOOM, SF_TEXT, TORUS_ID } from '../../data/sf'
import { useStore } from '../../state/store'
import { useSite } from './useSite'
import { roomEnvironment } from '../telescope/parts'

// ドーナツ型のスペースコロニー（1975年の NASA の研究「スタンフォード・トーラス」をもとにしたオリジナルのデザイン）。
// 直径約1.8kmの輪が1分に1回転して、輪の中の床で1Gになる。中央のハブから6本のスポークが出る。
// 太陽側（+Y）に45度傾けた大きな鏡があり、光を輪の上の二つめの鏡の輪へ送り、窓から中へ入れる。
// コロニー群の座標（1 = 円筒コロニーの長さ = 32km）で作る。

const KM = COLONY_LENGTH / COLONY_REAL_KM
const RING = 0.9 * KM
const TUBE = 0.065 * KM
const SPIN_SECONDS = 60

export function StanfordTorus({ position }: { position: [number, number, number] }) {
  const group = useRef<THREE.Group>(null!)
  const spin = useRef<THREE.Group>(null!)
  const moved = useSite(group, {
    id: TORUS_ID,
    radius: RING * 1.3,
    zoom: { start: 0.4, full: 0.1, factor: COLONY_ZOOM },
    notice: { distance: 0.25, text: SF_TEXT.torusFound },
  })
  const { gl } = useThree()
  const parts = useMemo(() => {
    const env = roomEnvironment(gl)
    // 輪の内側（回転軸を向いた側）の窓：細い光の帯
    return {
      ring: new THREE.TorusGeometry(RING, TUBE, 24, 160),
      window: new THREE.TorusGeometry(RING - TUBE * 0.82, TUBE * 0.3, 8, 160),
      spoke: new THREE.CylinderGeometry(TUBE * 0.16, TUBE * 0.16, RING - TUBE * 2.2, 8),
      hub: new THREE.SphereGeometry(TUBE * 2.2, 24, 16),
      dock: new THREE.CylinderGeometry(TUBE * 0.8, TUBE * 0.8, TUBE * 9, 16),
      mirror: new THREE.CircleGeometry(RING * 0.75, 64),
      secondary: new THREE.CylinderGeometry(RING * 1.08, RING * 0.92, TUBE * 2.5, 96, 1, true),
      light: new THREE.SphereGeometry(TUBE * 0.12, 6, 6),
      shell: new THREE.MeshStandardMaterial({ color: '#b3b8c1', metalness: 0.4, roughness: 0.5, envMap: env, envMapIntensity: 0.5 }),
      glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.3, 0.9), toneMapped: false }),
      mirrorMat: new THREE.MeshStandardMaterial({ color: '#8090a8', metalness: 1, roughness: 0.1, envMap: env, envMapIntensity: 0.8, side: THREE.DoubleSide }),
      lightMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.8, 2.4), toneMapped: false }),
    }
  }, [gl])

  useFrame((_, rawDelta) => {
    if (useStore.getState().timeScale > 0) spin.current.rotation.y += (Math.min(rawDelta, 0.05) * Math.PI * 2) / SPIN_SECONDS
    moved()
  })

  return (
    <group ref={group} position={position}>
      {/* 回る部分：輪・スポーク・ハブ（回転軸は +Y、太陽の向き） */}
      <group ref={spin}>
        <mesh geometry={parts.ring} material={parts.shell} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={parts.window} material={parts.glow} rotation={[Math.PI / 2, 0, 0]} />
        {Array.from({ length: 6 }, (_, k) => {
          const a = (k / 6) * Math.PI * 2
          const mid = (RING + TUBE * 2.2) / 2
          return <mesh key={k} geometry={parts.spoke} material={parts.shell} position={[Math.sin(a) * mid, 0, Math.cos(a) * mid]} rotation={[0, a, Math.PI / 2]} />
        })}
        <mesh geometry={parts.hub} material={parts.shell} />
        <mesh geometry={parts.dock} material={parts.shell} />
        {Array.from({ length: 12 }, (_, k) => {
          const a = (k / 12) * Math.PI * 2
          return <mesh key={`l${k}`} geometry={parts.light} material={parts.lightMat} position={[Math.sin(a) * (RING + TUBE), 0, Math.cos(a) * (RING + TUBE)]} />
        })}
      </group>
      {/* 回らない部分：輪の上の二つめの鏡と、太陽側に45度傾けた大きな鏡 */}
      <mesh geometry={parts.secondary} material={parts.mirrorMat} position={[0, TUBE * 3, 0]} />
      <mesh geometry={parts.mirror} material={parts.mirrorMat} position={[0, RING * 2, 0]} rotation={[-Math.PI / 4, 0, 0]} />
    </group>
  )
}
