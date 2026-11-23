import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { bodies } from '../../state/registry'
import { useStore } from '../../state/store'
import { JAPAN_TEXT, MOON_CITY_ID, moonCityName } from '../../data/sfJapan'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'
import { useFarLod } from '../../hooks/useFarLod'
import { moonCityModel } from './moonCityModel'
import { radialGlowTexture } from '../radialGlow'

// 月の都（『竹取物語』から。オリジナルのデザイン）。月の裏側の真ん中、クレーターの底にある光の都。
// 建物（御殿・門・塀・太鼓橋の架かる光る池・五重の塔・桂の大木・町並み）は moonCityModel.ts。
// 空には灯がいくつも浮かび、ゆっくり昇っていく。
// 月はいつも同じ面を地球へ向けているので、「地球と反対の向き」がいつも裏側の真ん中になる。
// 都の模型は1単位で作り、MODEL 倍して置く（さしわたし約0.2。月の表示の半径は約0.78）。

const MODEL = 0.01
const Y = new THREE.Vector3(0, 1, 0)
/** 目標にしたときに止まる点（都の真上、この高さ）。ここが低いと、地球側から来たワープが月の中で止まってしまう */
const ANCHOR = 1.0
/** 浮かぶ灯の数 */
const LANTERNS = 56

const moonPos = new THREE.Vector3()
const earthPos = new THREE.Vector3()
const up = new THREE.Vector3()

/** 灯や後光に使う、まるくぼけた光 */
function softTexture() {
  return radialGlowTexture(
    [
      [0, 255, 255, 255, 1],
      [0.35, 255, 255, 255, 0.55],
      [1, 255, 255, 255, 0],
    ],
    64,
    true,
  )
}

/** 月の丸みに合わせた、地面の高さ（模型の単位） */
let SPHERE = 78
function ground(x: number, z: number) {
  return -(x * x + z * z) / (2 * SPHERE)
}


function makeParts() {
  const soft = softTexture()
  return {
    soft,
    floor: new THREE.MeshStandardMaterial({ color: '#77736c', roughness: 1, emissive: '#2a2618', emissiveIntensity: 0.5, userData: { noDetail: true } }),
    lanternMat: new THREE.PointsMaterial({
      map: soft,
      color: new THREE.Color(2.2, 1.4, 0.6),
      size: 0.009,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    haloMat: new THREE.SpriteMaterial({ map: soft, color: new THREE.Color(1.0, 0.82, 0.45), transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  }
}

function City({ moonRadius }: { moonRadius: number }) {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const anchor = useRef<THREE.Group>(null!)
  const lanternRef = useRef<THREE.Points>(null!)
  // 都が画面で小さいときは、建物と灯を描かない（月の上の数ピクセルでは見分けられない。遠くからは光の暈だけ）
  const city = useRef<THREE.Group>(null)
  const buildings = useRef<THREE.Group>(null)
  const far = useFarLod(city, 10, 14, (isFar) => {
    if (buildings.current) buildings.current.visible = !isFar
    if (lanternRef.current) lanternRef.current.visible = !isFar
  })
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const moved = useSite(anchor, { id: MOON_CITY_ID, radius: 0.05, notice: { distance: ANCHOR + 0.15, text: JAPAN_TEXT.moonCityFound } })
  SPHERE = moonRadius / MODEL

  const parts = useMemo(makeParts, [])
  const model = useMemo(() => moonCityModel(ground), [moonRadius]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => model.dispose(), [model])
  const floorGeo = useMemo(() => {
    const R = moonRadius / MODEL
    // 都の下の、平らにならしたクレーターの底（月の表面より少しだけ上に、丸みをそろえた皿）
    return new THREE.SphereGeometry(R + 0.12, 64, 6, 0, Math.PI * 2, 0, Math.asin(12 / R))
  }, [moonRadius])
  const lanterns = useMemo(() => {
    const n = LANTERNS
    const pos = new Float32Array(n * 3)
    const seed = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 1.5 + Math.random() * 8
      seed[i * 3] = Math.cos(a) * r
      seed[i * 3 + 1] = Math.random()
      seed[i * 3 + 2] = Math.sin(a) * r
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { geo, seed }
  }, [])
  useEffect(
    () => () => {
      Object.values(parts).forEach((p) => (p as { dispose?: () => void }).dispose?.())
      floorGeo.dispose()
      lanterns.geo.dispose()
    },
    [parts, floorGeo, lanterns],
  )

  useFrame(({ clock }) => {
    const m = bodies.get('moon')
    const e = bodies.get('earth')
    const g = group.current
    if (!m || !e || !g) return
    m.object.getWorldPosition(moonPos)
    e.object.getWorldPosition(earthPos)
    up.copy(moonPos).sub(earthPos).normalize()
    g.position.copy(moonPos).addScaledVector(up, m.radius)
    g.quaternion.setFromUnitVectors(Y, up)

    moved()
    if (far.current) return
    // 灯はゆっくり昇り、高くなるほど薄れて、また下から現れる
    const t = clock.getElapsedTime()
    const p = lanterns.geo.attributes.position as THREE.BufferAttribute
    const s = lanterns.seed
    for (let i = 0; i < LANTERNS; i++) {
      const k = (s[i * 3 + 1] + t * 0.012) % 1
      const x = s[i * 3] + Math.sin(t * 0.2 + i) * 0.3
      const z = s[i * 3 + 2] + Math.cos(t * 0.17 + i * 1.3) * 0.3
      p.setXYZ(i, x, ground(x, z) + 0.6 + k * 6, z)
    }
    p.needsUpdate = true
  })

  return (
    <group ref={group}>
      <group ref={city} scale={MODEL}>
        <mesh geometry={floorGeo} material={parts.floor} position={[0, -SPHERE, 0]} />
        {/* 建物は皿（月の表面より 0.12 上）の上に建てる */}
        <group ref={buildings} position={[0, 0.12, 0]}>
          {model.meshes.map((m) => (
            <mesh key={m.key} geometry={m.geometry} material={m.material} />
          ))}
        </group>
        <points ref={lanternRef} geometry={lanterns.geo} material={parts.lanternMat} frustumCulled={false} />
        <sprite material={parts.haloMat} position={[0, 1.5, 0]} scale={[26, 26, 1]} />
      </group>
      <group ref={anchor} position={[0, ANCHOR, 0]} />
      <Html position={[0, 0.09, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(MOON_CITY_ID)}>
          {moonCityName()}
        </span>
      </Html>
    </group>
  )
}

/** 月が登録されるまでは何も描かない */
export function MoonCity() {
  const [radius, setRadius] = useState(0)
  useEffect(() => {
    if (radius) return
    const find = () => {
      const b = bodies.get('moon')
      if (b) setRadius(b.radius)
    }
    find()
    const id = window.setInterval(find, 500)
    return () => window.clearInterval(id)
  }, [radius])
  if (!radius) return null
  return <City moonRadius={radius} />
}
