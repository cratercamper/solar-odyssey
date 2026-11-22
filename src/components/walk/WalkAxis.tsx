import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { colonyDay } from '../sf/colonyCity'
import { HALF_L, frameAt, landPoint } from './park'
import { CORE, DECK_END, STATION, STATION_H, STATION_R, TOWER, elevCar, elevH } from './axis'

// 港側の端の壁の前に立つ、回転の軸へのエレベーターの塔と、軸のまわりの駅（内側の床に立つ細い円筒）。
// 塔は約 4 km。かごはガラス張りで、のぼるにつれて足もとのコロニーが円筒の形に見えてくる。

const LIGHT_DAY = new THREE.Color(0.9, 0.35, 0.3)
const LIGHT_NIGHT = new THREE.Color(2.4, 0.4, 0.3)
const STRIP_DAY = new THREE.Color(0.75, 0.8, 0.85)
const STRIP_NIGHT = new THREE.Color(1.6, 1.5, 1.2)

export function WalkAxis() {
  const parts = useMemo(() => {
    const coreMat = new THREE.MeshLambertMaterial({ color: '#8d939b' })
    // 駅の壁（床）はガラス張り：軸から、まわりの大地がぐるりと見える
    const stationMat = new THREE.MeshLambertMaterial({ color: '#d6ecf6', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })
    const capMat = new THREE.MeshLambertMaterial({ color: '#c3c8ce', emissive: '#30343a', side: THREE.DoubleSide })
    const glassMat = new THREE.MeshLambertMaterial({ color: '#cfe6f2', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide })
    const frameMat = new THREE.MeshLambertMaterial({ color: '#d8dade' })
    const lightMat = new THREE.MeshBasicMaterial({ color: LIGHT_DAY.clone(), toneMapped: false })
    const stripMat = new THREE.MeshBasicMaterial({ color: STRIP_DAY.clone(), toneMapped: false, side: THREE.DoubleSide })

    // 塔の柱：地面から駅の床まで（場所 s = TOWER.s の上向き = -z）
    const coreGeo = new THREE.CylinderGeometry(CORE.r, CORE.r * 1.6, STATION_H + 2, 16, 1, true)
    // 駅：軸のまわりの円筒（内側に立つ）と、両端のふた
    const len = STATION.y1 - STATION.y0
    const stationGeo = new THREE.CylinderGeometry(STATION_R, STATION_R, len, 64, 8, true)
    const capGeo = new THREE.CircleGeometry(STATION_R, 64)
    // 床の光の線（駅の円周に 6 本）
    const stripGeo = new THREE.CylinderGeometry(STATION_R - 0.05, STATION_R - 0.05, 0.25, 64, 1, true)
    // 床の骨（軸の向きに 16 本）。ガラスの床でも、どこが床か分かるように
    const ribGeo = new THREE.BoxGeometry(0.35, 1, 0.12)
    // かご：ガラスの箱と床（屋根なし。後ろから見るカメラをさえぎらない）
    const carGlass = new THREE.BoxGeometry(4.4, 3, 4.4).translate(0, 1.5, 0)
    const carPlate = new THREE.BoxGeometry(4.6, 0.2, 4.6)
    const lightGeo = new THREE.SphereGeometry(0.6, 8, 6)
    // 駅の先の発着デッキ：壁のない、すけた床（格子）の円筒
    const deckLen = DECK_END - STATION.y1
    const deckGeo = new THREE.CylinderGeometry(STATION_R, STATION_R, deckLen, 64, 1, true)
    const deckMat = new THREE.MeshLambertMaterial({ color: '#8e959e', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    const edgeGeo = new THREE.TorusGeometry(STATION_R - 0.1, 0.12, 6, 96)
    return { deckLen, deckGeo, deckMat, edgeGeo, coreMat, stationMat, capMat, glassMat, frameMat, lightMat, stripMat, coreGeo, stationGeo, capGeo, stripGeo, ribGeo, carGlass, carPlate, lightGeo, len }
  }, [])
  useEffect(
    () => () => {
      for (const v of Object.values(parts)) if (v instanceof THREE.BufferGeometry || v instanceof THREE.Material) v.dispose()
    },
    [parts],
  )

  const layout = useMemo(() => {
    const coreAt = landPoint(TOWER.s, CORE.y, STATION_H / 2)
    const stationY = -HALF_L + (STATION.y0 + STATION.y1) / 2
    // 塔の灯り（500 m ごと）
    const lights: THREE.Vector3[] = []
    for (let h = 250; h < STATION_H - 100; h += 500) lights.push(landPoint(TOWER.s, CORE.y, h).add(new THREE.Vector3(CORE.r + 0.3, 0, 0)))
    return { coreAt, stationY, lights }
  }, [])

  const car = useMemo(() => new THREE.Group(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  useFrame(() => {
    const n = colonyDay.night
    parts.lightMat.color.lerpColors(LIGHT_DAY, LIGHT_NIGHT, n)
    parts.stripMat.color.lerpColors(STRIP_DAY, STRIP_NIGHT, n)
    landPoint(TOWER.s, TOWER.y + 1.2, elevH(elevCar.t), car.position)
    car.quaternion.copy(frameAt(TOWER.s, q))
  })

  return (
    <>
      {/* 柱は場所 s=0 の上向き（-z）へ立てる */}
      <mesh geometry={parts.coreGeo} material={parts.coreMat} position={layout.coreAt} rotation={[-Math.PI / 2, 0, 0]} castShadow />
      <group position={[0, layout.stationY, 0]}>
        <mesh geometry={parts.stationGeo} material={parts.stationMat} renderOrder={3} />
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2
          return <mesh key={`r${i}`} geometry={parts.ribGeo} material={parts.frameMat} position={[Math.sin(a) * (STATION_R - 0.08), 0, Math.cos(a) * (STATION_R - 0.08)]} rotation={[0, a, 0]} scale={[1, parts.len, 1]} />
        })}
        <mesh geometry={parts.capGeo} material={parts.capMat} position={[0, -parts.len / 2, 0]} rotation={[-Math.PI / 2, 0, 0]} />
        <group position={[0, parts.len / 2 + parts.deckLen / 2, 0]}>
          <mesh geometry={parts.deckGeo} material={parts.deckMat} renderOrder={3} />
          {Array.from({ length: 16 }, (_, i) => {
            const a = ((i + 0.5) / 16) * Math.PI * 2
            return <mesh key={`d${i}`} geometry={parts.ribGeo} material={parts.frameMat} position={[Math.sin(a) * (STATION_R - 0.08), 0, Math.cos(a) * (STATION_R - 0.08)]} rotation={[0, a, 0]} scale={[1, parts.deckLen, 1]} />
          })}
          <mesh geometry={parts.edgeGeo} material={parts.stripMat} position={[0, parts.deckLen / 2, 0]} rotation={[Math.PI / 2, 0, 0]} />
        </group>
        {[-0.4, -0.24, -0.08, 0.08, 0.24, 0.4].map((f) => (
          <mesh key={f} geometry={parts.stripGeo} material={parts.stripMat} position={[0, f * parts.len, 0]} />
        ))}
      </group>
      <primitive object={car}>
        <mesh geometry={parts.carGlass} material={parts.glassMat} renderOrder={3} />
        <mesh geometry={parts.carPlate} material={parts.frameMat} position={[0, -0.1, 0]} receiveShadow />
      </primitive>
      {layout.lights.map((p, i) => (
        <mesh key={i} geometry={parts.lightGeo} material={parts.lightMat} position={p} />
      ))}
    </>
  )
}
