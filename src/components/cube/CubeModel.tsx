import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { cubeGeometry, cubeMaterial } from './cubeGeometry'
import { useFarLod } from '../../hooks/useFarLod'
import { roomEnvironment } from '../telescope/parts'

/** 画面でこの半径（ピクセル）より小さいときは、20万枚の三角形の船体の代わりにただの箱で描く */
const PROXY_PX = 30
const box = new THREE.BoxGeometry(0.97, 0.97, 0.97)

// 形は毎回同じなので、展示用とレースのライバル用で使い回す
let shared: ReturnType<typeof cubeGeometry> | null = null
const geometry = () => (shared ??= cubeGeometry())

/** 機械文明の立方体船（一辺 1）。緑の灯はゆっくり脈打つ */
export function CubeModel() {
  const { gl } = useThree()
  const envMap = useMemo(() => {
    const env = roomEnvironment(gl)
    return env
  }, [gl])
  const parts = useMemo(() => {
    const { hull, lights } = geometry()
    return {
      hull,
      lights,
      hullMat: cubeMaterial(envMap),
      lightMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 0.55), toneMapped: false }),
      // 遠くで小さく見えるときの代わりの箱（船体と同じくらいの暗い金属色）
      proxyMat: new THREE.MeshStandardMaterial({ color: '#3f4542', metalness: 0.75, roughness: 0.5, envMap, envMapIntensity: 0.35 }),
    }
  }, [envMap])
  useEffect(
    () => () => {
      parts.hullMat.dispose()
      parts.lightMat.dispose()
      parts.proxyMat.dispose()
    },
    [parts],
  )
  const light = useRef(parts.lightMat)
  const root = useRef<THREE.Group>(null)
  const detail = useRef<THREE.Group>(null)
  const proxy = useRef<THREE.Mesh>(null)
  useFarLod(root, 0.87, PROXY_PX, (far) => {
    if (detail.current) detail.current.visible = !far
    if (proxy.current) proxy.current.visible = far
  })
  useFrame(({ clock }) => {
    const k = 0.85 + 0.15 * Math.sin(clock.getElapsedTime() * 0.9)
    light.current.color.setRGB(0.3 * k, 1.6 * k, 0.55 * k)
  })
  return (
    <group ref={root}>
      <group ref={detail}>
        <mesh geometry={parts.hull} material={parts.hullMat} castShadow receiveShadow />
        <mesh geometry={parts.lights} material={parts.lightMat} />
      </group>
      <mesh ref={proxy} geometry={box} material={parts.proxyMat} visible={false} />
    </group>
  )
}
