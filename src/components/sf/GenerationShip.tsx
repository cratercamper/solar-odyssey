import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useLayout } from '../../state/useLayout'
import { useStore } from '../../state/store'
import { sim } from '../../state/registry'
import { EARTH_YEAR_SECONDS } from '../../data/scale'
import { ARK_ID, SF_TEXT, UNITS_PER_METER, arkName } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'
import { roomEnvironment } from '../telescope/parts'

// 世代宇宙船（オリジナルのデザイン）。何世代もかけて、となりの恒星（ケンタウルス座アルファ星）をめざす。
// 前（+Z）に氷と岩の盾、長い背骨の途中に逆向きに回る2つの居住リング、燃料タンクの房、
// 後ろに核融合エンジンの磁気ノズルと、ほのかな青白い噴射。形は m で決める。

const LENGTH = 12000
/** 今、太陽から何天文単位か。海王星（約30天文単位）の外から、探査機ボイジャーほどの速さ（1年に約3.6天文単位）で遠ざかる */
const START_AU = 45
const AU_PER_YEAR = 3.6
/** ケンタウルス座アルファ星の向き（黄経約239.5度・黄緯約−42.6度） */
const LON = (239.5 * Math.PI) / 180
const LAT = (-42.6 * Math.PI) / 180
const DIR = new THREE.Vector3(Math.cos(LAT) * Math.cos(LON), Math.sin(LAT), -Math.cos(LAT) * Math.sin(LON))
const Z = new THREE.Vector3(0, 0, 1)
/** 居住リングの1Gの回転：半径2.2kmで約94秒に1回転 */
const RING_R = 2200
const SPIN = (2 * Math.PI) / (2 * Math.PI * Math.sqrt(RING_R / 9.8))

export function GenerationShip() {
  useLang()
  const layout = useLayout()
  const group = useRef<THREE.Group>(null!)
  const ringA = useRef<THREE.Group>(null!)
  const ringB = useRef<THREE.Group>(null!)
  const flame = useRef<THREE.MeshBasicMaterial>(null)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const size = (LENGTH / 2) * UNITS_PER_METER
  const moved = useSite(group, {
    id: ARK_ID,
    radius: size,
    zoom: { start: size * 6, full: size * 2.5 },
    notice: { distance: size * 4, text: SF_TEXT.arkFound },
  })
  const { gl } = useThree()
  const parts = useMemo(() => {
    const env = roomEnvironment(gl)
    const metal = new THREE.MeshStandardMaterial({ color: '#b9bdc4', metalness: 0.55, roughness: 0.45, envMap: env, envMapIntensity: 0.5 })
    return {
      metal,
      dark: new THREE.MeshStandardMaterial({ color: '#4c5058', metalness: 0.6, roughness: 0.5, envMap: env, envMapIntensity: 0.4 }),
      ice: new THREE.MeshStandardMaterial({ color: '#c9d6e2', metalness: 0.05, roughness: 0.9, envMap: env, envMapIntensity: 0.3 }),
      tank: new THREE.MeshStandardMaterial({ color: '#d9a85a', metalness: 0.4, roughness: 0.35, envMap: env, envMapIntensity: 0.6 }),
      radiator: new THREE.MeshStandardMaterial({ color: '#6a3a28', metalness: 0.2, roughness: 0.6, emissive: '#5a1a08', emissiveIntensity: 0.8, side: THREE.DoubleSide }),
      windows: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.3, 0.85), toneMapped: false }),
      shield: new THREE.SphereGeometry(1800, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.32),
      spine: new THREE.CylinderGeometry(130, 130, LENGTH * 0.82, 16),
      rib: new THREE.TorusGeometry(260, 30, 8, 32),
      ring: new THREE.TorusGeometry(RING_R, 190, 16, 128),
      band: new THREE.TorusGeometry(RING_R - 175, 40, 6, 128),
      spoke: new THREE.CylinderGeometry(45, 45, RING_R - 200, 8),
      tankBall: new THREE.SphereGeometry(420, 24, 16),
      radiatorPanel: new THREE.PlaneGeometry(700, 2600),
      nozzle: new THREE.CylinderGeometry(500, 1500, 1500, 48, 1, true),
      coil: new THREE.TorusGeometry(1100, 70, 8, 64),
      plume: new THREE.ConeGeometry(1100, 3600, 32, 1, true),
      light: new THREE.SphereGeometry(40, 8, 8),
      lightMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.5, 0.3), toneMapped: false }),
    }
  }, [gl])

  const ahead = new THREE.Vector3()
  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05)
    const years = Math.max(0, sim.time / EARTH_YEAR_SECONDS)
    group.current.position.copy(DIR).multiplyScalar(layout.au(START_AU + AU_PER_YEAR * years))
    group.current.quaternion.setFromUnitVectors(Z, ahead.copy(DIR))
    ringA.current.rotation.z += SPIN * dt
    ringB.current.rotation.z -= SPIN * dt
    const t = clock.getElapsedTime()
    if (flame.current) flame.current.opacity = 0.09 + 0.025 * Math.sin(t * 5) + 0.012 * Math.sin(t * 17)
    moved()
  })

  const H = LENGTH / 2
  return (
    <group ref={group}>
      <group scale={UNITS_PER_METER}>
        {/* 前の盾：星間のちりから船を守る、氷と岩の厚い盾 */}
        <mesh geometry={parts.shield} material={parts.ice} position={[0, 0, H - 2200]} rotation={[Math.PI / 2, 0, 0]} />
        {/* 背骨と、一定の間隔の輪 */}
        <mesh geometry={parts.spine} material={parts.metal} rotation={[Math.PI / 2, 0, 0]} />
        {Array.from({ length: 14 }, (_, k) => (
          <mesh key={k} geometry={parts.rib} material={parts.dark} position={[0, 0, -H * 0.8 + (k / 13) * H * 1.6]} />
        ))}
        {/* 居住リング2つ（逆向きに回して、回転のくせを打ち消す） */}
        {[
          { ref: ringA, z: H * 0.38 },
          { ref: ringB, z: H * 0.05 },
        ].map(({ ref, z }, i) => (
          <group key={i} ref={ref} position={[0, 0, z]}>
            <mesh geometry={parts.ring} material={parts.metal} />
            <mesh geometry={parts.band} material={parts.windows} />
            {[0, 1, 2, 3, 4, 5].map((k) => {
              const a = (k / 6) * Math.PI * 2
              return <mesh key={k} geometry={parts.spoke} material={parts.dark} position={[Math.cos(a) * (RING_R / 2), Math.sin(a) * (RING_R / 2), 0]} rotation={[0, 0, a - Math.PI / 2]} />
            })}
          </group>
        ))}
        {/* 燃料タンクの房 */}
        {Array.from({ length: 6 }, (_, k) => {
          const a = (k / 6) * Math.PI * 2
          return (
            <group key={k}>
              <mesh geometry={parts.tankBall} material={parts.tank} position={[Math.cos(a) * 560, Math.sin(a) * 560, -H * 0.35]} />
              <mesh geometry={parts.tankBall} material={parts.tank} position={[Math.cos(a + 0.5) * 560, Math.sin(a + 0.5) * 560, -H * 0.5]} />
            </group>
          )
        })}
        {/* 放熱板（エンジンの熱を宇宙へ捨てる。ほのかに赤く光る） */}
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k} geometry={parts.radiatorPanel} material={parts.radiator} position={[Math.cos((k * Math.PI) / 2) * 520, Math.sin((k * Math.PI) / 2) * 520, -H * 0.65]} rotation={new THREE.Euler(Math.PI / 2, 0, (k * Math.PI) / 2, 'ZYX')} />
        ))}
        {/* 核融合エンジンの磁気ノズルと噴射 */}
        <mesh geometry={parts.nozzle} material={parts.dark} position={[0, 0, -H - 300]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={parts.coil} material={parts.metal} position={[0, 0, -H - 900]} />
        <mesh geometry={parts.plume} position={[0, 0, -H - 2800]} rotation={[-Math.PI / 2, 0, 0]}>
          <meshBasicMaterial ref={flame} color={new THREE.Color(0.45, 0.7, 1.3)} transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        {[1, -1].map((s) => (
          <mesh key={s} geometry={parts.light} material={parts.lightMat} position={[s * 1800, 0, H - 2200]} />
        ))}
      </group>
      <Html position={[0, size * 0.5, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(ARK_ID)}>
          {arkName()}
        </span>
      </Html>
    </group>
  )
}
