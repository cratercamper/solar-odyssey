import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { exoAirMaterial, exoSurfaceMaterial } from './exoShader'
import { GateModel, GATE_RING, useGateTrigger } from './Gate'
import { useSite } from './useSite'
import { ship } from '../../state/flight'
import { colliders } from '../../state/registry'
import { useStore } from '../../state/store'
import { DESERT_ID, DESERT_POS, EXO_RADIUS as R, EXO_TEXT, GATE_ID, ICE_ID, ICE_POS, sfEntry } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z } from '../labels'
import { ui } from '../../i18n'
import { radialGlowTexture } from '../radialGlow'

type Star = {
  /** 星の色（明るさこみ）と、見かけの大きさ（表示単位の半径） */
  color: THREE.Color
  size: number
  /** 惑星から見た向き：着く場所（太陽系の側）から見て、惑星のふちの外へどれだけずらすか（ラジアン）と、上下 */
  side: number
  lift: number
}

type Props = {
  id: string
  position: [number, number, number]
  kind: 0 | 1
  air: THREE.Color
  stars: Star[]
  /** 2つの太陽が互いのまわりを回る速さ（ラジアン/秒。見た目用） */
  binarySpin?: number
  arrived: () => string
}

/** 恒星をどれだけ遠くに置くか（表示単位） */
const STAR_DISTANCE = 1500
const UP = new THREE.Vector3(0, 1, 0)

function glowTexture() {
  return radialGlowTexture(
    [
      [0, 255, 255, 255, 1],
      [0.2, 255, 255, 255, 0.5],
      [1, 255, 255, 255, 0],
    ],
    128,
  )
}

/**
 * 太陽系の外の惑星と、その恒星。太陽系の側から着くと、惑星のふちのすぐ外に恒星が見えるよう置く
 * （低い軌道まで降りると、恒星が地平線にしずんでいく）
 */
function Exoplanet({ id, position, kind, air, stars, binarySpin = 0, arrived }: Props) {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const back = useRef<THREE.Group>(null!)
  const planet = useRef<THREE.Mesh>(null!)
  const starRefs = useRef<THREE.Group[]>([])
  const center = useMemo(() => new THREE.Vector3(...position), [position])
  const labels = useRef<HTMLSpanElement[]>([])
  const labelRef = (el: HTMLSpanElement | null) => {
    if (el && !labels.current.includes(el)) labels.current.push(el)
  }

  // 着く向き（太陽系 → 惑星の逆向き）と、それに直交する横・上
  const frame = useMemo(() => {
    const toHome = center.clone().negate().normalize()
    const side = new THREE.Vector3().crossVectors(UP, toHome).normalize()
    const up = new THREE.Vector3().crossVectors(toHome, side).normalize()
    return { toHome, side, up }
  }, [center])

  const parts = useMemo(() => {
    const glow = glowTexture()
    return {
      sphere: new THREE.SphereGeometry(R, 160, 120),
      airSphere: new THREE.SphereGeometry(R * 1.06, 96, 64),
      starGeometry: new THREE.SphereGeometry(1, 32, 24),
      surface: exoSurfaceMaterial(kind),
      air: exoAirMaterial(air),
      glow,
      starMats: stars.map((s) => new THREE.MeshBasicMaterial({ color: s.color, toneMapped: false })),
      haloMats: stars.map((s) => new THREE.SpriteMaterial({ map: glow, color: s.color.clone().multiplyScalar(0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })),
    }
  }, [kind, air, stars])
  useEffect(
    () => () => {
      Object.values(parts).forEach((p) => {
        if (Array.isArray(p)) p.forEach((m) => m.dispose())
        else p.dispose()
      })
    },
    [parts],
  )

  const moved = useSite(group, { id, radius: R, notice: { distance: R * 4, text: arrived } })
  useGateTrigger(back, GATE_ID)

  // 大気より下へは降りない
  useEffect(() => {
    const rel = new THREE.Vector3()
    let warned = 0
    const collide = () => {
      rel.copy(ship.position).sub(center)
      const min = R * 1.03
      if (rel.length() >= min) return
      ship.position.copy(center).add(rel.setLength(min))
      const into = ship.velocity.dot(rel.normalize())
      if (into < 0) ship.velocity.addScaledVector(rel, -into)
      if (performance.now() - warned > 15000) {
        warned = performance.now()
        useStore.getState().showToast(EXO_TEXT.low())
      }
    }
    colliders.add(collide)
    return () => {
      colliders.delete(collide)
    }
  }, [center])

  const dir = new THREE.Vector3()
  const lights = [new THREE.Vector3(), new THREE.Vector3()]
  useFrame(({ clock, camera }) => {
    // 光の計算が重い惑星なので、近くにいるときだけ描く（太陽系からは遠すぎて見えない）
    body.current.visible = camera.position.distanceTo(center) < 4000
    const time = clock.getElapsedTime()
    // 恒星：着く場所から見て、惑星の向こう側のふちのすぐ外
    stars.forEach((s, i) => {
      const spin = binarySpin * time
      const a = s.side + Math.sin(spin + i * Math.PI) * 0.02
      dir
        .copy(frame.toHome)
        .negate()
        .multiplyScalar(Math.cos(a))
        .addScaledVector(frame.side, -Math.sin(a)) // 画面の左側（右は航法コンピュータに隠れる）
        .addScaledVector(frame.up, s.lift + Math.cos(spin + i * Math.PI) * 0.01)
        .normalize()
      const g = starRefs.current[i]
      if (g) g.position.copy(dir).multiplyScalar(STAR_DISTANCE)
      lights[i].copy(dir)
    })
    const u = parts.surface.uniforms
    u.uTime.value = time
    u.uL1.value.copy(lights[0])
    u.uC1.value.copy(stars[0].color).multiplyScalar(0.32)
    u.uL2.value.copy(stars[1] ? lights[1] : lights[0])
    u.uC2.value.copy(stars[1] ? stars[1].color : new THREE.Color(0, 0, 0)).multiplyScalar(stars[1] ? 0.32 : 0)
    const a = parts.air.uniforms
    a.uCenter.value.copy(center)
    a.uRadius.value = R
    a.uL1.value.copy(u.uL1.value)
    a.uC1.value.copy(u.uC1.value)
    a.uL2.value.copy(u.uL2.value)
    a.uC2.value.copy(u.uC2.value)
    planet.current.rotation.y = time * 0.004
    moved()
    const show = ship.position.distanceTo(center) < R * 20 ? '' : 'none'
    labels.current.forEach((el) => (el.style.display = show))
  })

  const gatePos = useMemo(
    () => center.clone().addScaledVector(frame.toHome, R * 2.4).addScaledVector(frame.side, R * 0.9).addScaledVector(frame.up, R * 0.2),
    [center, frame],
  )

  return (
    <>
      <group ref={group} position={position}>
        <group ref={body}>
          <mesh ref={planet} geometry={parts.sphere} material={parts.surface} />
          <mesh geometry={parts.airSphere} material={parts.air} renderOrder={1} />
          {stars.map((s, i) => (
            <group
              key={i}
              ref={(g: THREE.Group | null) => {
                if (g) starRefs.current[i] = g
              }}
            >
              <mesh geometry={parts.starGeometry} material={parts.starMats[i]} scale={s.size} />
              <sprite material={parts.haloMats[i]} scale={s.size * 9} />
            </group>
          ))}
        </group>
        <Html position={[0, R * 1.25, 0]} center className="label" zIndexRange={LABEL_Z}>
          <span ref={labelRef} onClick={() => useStore.getState().setTarget(id)}>
            {sfEntry(id)?.name()}
          </span>
        </Html>
      </group>
      {/* 帰りのゲート：くぐると太陽系の側のゲートへもどる */}
      <group ref={back} position={gatePos} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), frame.toHome)}>
        <GateModel />
        <Html position={[0, GATE_RING + 0.6, 0]} center className="label" zIndexRange={LABEL_Z}>
          <span ref={labelRef}>{ui().exoplanet.gateHome}</span>
        </Html>
      </group>
    </>
  )
}

// 砂の惑星：ケプラー16b がもと。橙色のK型星（太陽の約0.7倍の重さ）と、赤いM型星（約0.2倍）の2つの太陽
const DESERT_STARS: Star[] = [
  { color: new THREE.Color(3.2, 2.1, 1.1), size: 9, side: 0.46, lift: 0.04 },
  { color: new THREE.Color(2.6, 0.9, 0.45), size: 5, side: 0.53, lift: 0.075 },
]
// 氷の惑星：遠くの小さな赤みがかった恒星をめぐる、冷たい世界
const ICE_STARS: Star[] = [{ color: new THREE.Color(2.4, 2.0, 1.7), size: 6, side: 0.5, lift: 0.18 }]

export function DesertPlanet() {
  const air = useMemo(() => new THREE.Color(0.9, 0.55, 0.3), [])
  return <Exoplanet id={DESERT_ID} position={DESERT_POS} kind={0} air={air} stars={DESERT_STARS} binarySpin={0.05} arrived={EXO_TEXT.desertArrived} />
}

export function IcePlanet() {
  const air = useMemo(() => new THREE.Color(0.45, 0.7, 1.0), [])
  return <Exoplanet id={ICE_ID} position={ICE_POS} kind={1} air={air} stars={ICE_STARS} arrived={EXO_TEXT.iceArrived} />
}
