import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { COLONY_LENGTH as L, COLONY_PORT as PORT, COLONY_RADIUS as R } from '../../data/sf'
import { cloudTexture, hullTexture, landTexture, lightsTexture } from './colonyTextures'
import { colonyDetail } from './colonyDetail'
import { ColonyInterior } from './ColonyInterior'
import { colonyDay } from './colonyCity'
import { roomEnvironment } from '../telescope/parts'

// 回転円筒型のスペースコロニー（オニールの「島3号」の構想をもとにした、オリジナルのデザイン）。
// 回転軸は +Y で、+Y の端を太陽へ向ける。円周を6つに分け、大地の帯3本と窓の帯3本が交互に並ぶ。
// 窓の外の3枚の鏡は、太陽と反対側の端（-Y）を支点に開き、太陽の光を窓から中へ送りこむ。
// 太陽と反対側の端には、回転軸の上に港があり、まわりを農業用の区画の輪が囲む。

const DEG = Math.PI / 180
/** 鏡を開く角度（回転軸から） */
export const MIRROR_ANGLE = 25 * DEG
const CAP = 0.03

/** 帯 i（0〜5）の中心の角度。偶数が大地、奇数が窓 */
const stripAngle = (i: number) => i * 60 * DEG

/** 内側の大地の絵（大きいので、どのコロニーでも同じものを使い回して捨てない） */
const lands = new Map<number, THREE.Texture>()
function sharedLand(seed: number, k: number) {
  let tex = lands.get(seed)
  if (!tex) lands.set(seed, (tex = landTexture(seed, k)))
  return tex
}
const nightLights: THREE.Texture[] = []
const sharedLights = (k: number) => (nightLights[k] ??= lightsTexture(k))

const LAND_DAY = new THREE.Color('#d8dcd0')
const LAND_NIGHT = new THREE.Color('#1d2434')
const HAZE_DAY = new THREE.Color('#a9cdf5')
const HAZE_NIGHT = new THREE.Color('#0a0f1c')
const CLOUD_NIGHT = new THREE.Color('#3a4250')
const WHITE = new THREE.Color('#ffffff')
/**
 * 夜の明るさ（昼を 1 として）。帯ごとに分けて決める。
 * 窓の帯：格子・ガラス・機器。映り込み（envMap）が昼のままだと夜でも白く光って見えるので、映り込みごと落とす。
 * 端の壁：太陽側の丸屋根と港側の壁。大地の帯は LAND_NIGHT（地面の色）で決める。
 */
export const STRUCTURE_NIGHT = { window: 0.1, ends: 0.14 }
type Dim = { mat: THREE.MeshStandardMaterial; color: THREE.Color; emissive: THREE.Color; env: number; band: keyof typeof STRUCTURE_NIGHT }
const dimOf = (mat: THREE.MeshStandardMaterial, band: Dim['band']): Dim => ({ mat, color: mat.color.clone(), emissive: mat.emissive.clone(), env: mat.envMapIntensity, band })

/** 映り込み用の環境マップ（ほかの構造物と共有。dispose しない） */
const envMapFor = (gl: THREE.WebGLRenderer) => roomEnvironment(gl)

/** 円筒の一部（角度は CylinderGeometry と同じく +Z から +X へ） */
const sector = (radius: number, center: number, width: number, segments = 24) =>
  new THREE.CylinderGeometry(radius, radius, L, segments, 1, true, center - width / 2, width)

/** cityTrees = false：街の木を描かない（コロニーの中を歩く場面が、近くの木を幹のある形で描く） */
export function ColonyModel({ interior = true, cityTrees = true }: { interior?: boolean; cityTrees?: boolean }) {
  const { gl } = useThree()
  const parts = useMemo(() => {
    const env = envMapFor(gl)
    const hullMap = hullTexture(3)
    hullMap.wrapS = hullMap.wrapT = THREE.RepeatWrapping
    hullMap.repeat.set(1, 6)
    const capProfile = (from: [number, number][]) => new THREE.LatheGeometry(from.map(([r, y]) => new THREE.Vector2(r, y)), 96)
    return {
      env,
      hullMap,
      hullMat: new THREE.MeshStandardMaterial({ map: hullMap, metalness: 0.45, roughness: 0.55, envMap: env, envMapIntensity: 0.4, emissive: '#16181d' }),
      capMat: new THREE.MeshStandardMaterial({ map: hullMap, metalness: 0.45, roughness: 0.55, envMap: env, envMapIntensity: 0.4, side: THREE.DoubleSide }),
      frameMat: new THREE.MeshStandardMaterial({ color: '#70757e', metalness: 0.6, roughness: 0.45, envMap: env, envMapIntensity: 0.5 }),
      glassMat: new THREE.MeshStandardMaterial({
        color: '#2a3d58',
        metalness: 0.9,
        roughness: 0.06,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
        envMap: env,
        envMapIntensity: 1.2,
      }),
      mirrorMat: new THREE.MeshStandardMaterial({ color: '#7f8ca2', metalness: 1, roughness: 0.12, envMap: env, envMapIntensity: 0.7, side: THREE.DoubleSide }),
      lands: [0, 2, 4].map((i) => ({
        // 細かく分ける：24 分割だと、平らな板の中ほどが外板の円より 1 m 近く内へ出て、
        // 中を歩く場面で、地面（円にそって細かく曲げた板）の上へ出てしまい、足もとや道を隠していた
        geometry: sector(R * 0.999, stripAngle(i), 60 * DEG, 192),
        material: new THREE.MeshBasicMaterial({ map: sharedLand(17 + i * 13, i / 2), side: THREE.BackSide, color: '#d8dcd0' }),
      })),
      // 夜の街の灯り：大地の少し上に、加算で重ねる（昼は見えない）
      nightLights: [0, 2, 4].map((i) => ({
        geometry: sector(R * 0.997, stripAngle(i), 60 * DEG, 48),
        material: new THREE.MeshBasicMaterial({
          map: sharedLights(i / 2),
          side: THREE.BackSide,
          color: new THREE.Color(1.8, 1.8, 1.8),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      })),
      hulls: [0, 2, 4].map((i) => sector(R * 1.004, stripAngle(i), 60 * DEG)),
      windows: [1, 3, 5].map((i) => sector(R, stripAngle(i), 60 * DEG)),
      // 中の空気のかすみ（向こう側の大地が少し青く遠く見える）
      haze: new THREE.MeshBasicMaterial({ color: '#a9cdf5', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.BackSide }),
      hazeGeometry: new THREE.CylinderGeometry(R * 0.96, R * 0.96, L, 48, 1, true),
      // 太陽側の端：ゆるい丸屋根
      sunCap: capProfile(Array.from({ length: 13 }, (_, k) => [R * Math.cos((k / 12) * Math.PI * 0.5), L / 2 + CAP * Math.sin((k / 12) * Math.PI * 0.5)] as [number, number]).reverse()),
      // 港側の端：真ん中に港の穴
      portCap: capProfile(Array.from({ length: 13 }, (_, k) => {
        const a = (k / 12) * Math.PI * 0.5
        return [PORT + (R - PORT) * Math.cos(a), -L / 2 - CAP * Math.sin(a)] as [number, number]
      })),
      portTube: new THREE.CylinderGeometry(PORT, PORT, 0.1, 48, 1, true),
      ring: new THREE.TorusGeometry(R * 1.01, 0.0018, 6, 128),
      mirror: new THREE.PlaneGeometry(R * 1.05, L),
      strut: new THREE.CylinderGeometry(0.0012, 0.0012, 1, 6),
      farmRing: new THREE.TorusGeometry(0.26, 0.004, 8, 128),
      spoke: new THREE.BoxGeometry(0.004, 0.26 - PORT, 0.004),
      light: new THREE.SphereGeometry(0.0016, 8, 8),
      lightMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 1.4), toneMapped: false }),
      portLightMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.8, 2.4), toneMapped: false }),
      equipMat: new THREE.MeshStandardMaterial({ color: '#9ca3ad', metalness: 0.5, roughness: 0.45, envMap: env, envMapIntensity: 0.5, emissive: '#1a1d22' }),
      greenhouseMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 1.5, 0.7), toneMapped: false }),
      cloud: new THREE.SpriteMaterial({ map: cloudTexture(), transparent: true, opacity: 0.85, depthWrite: false }),
    }
  }, [gl])

  useEffect(
    () => () => {
      for (const value of Object.values(parts)) {
        const list = Array.isArray(value) ? value.flatMap((v) => (v instanceof THREE.BufferGeometry ? [v] : [v.geometry, v.material])) : [value]
        for (const v of list) if (v !== parts.env && (v instanceof THREE.BufferGeometry || v instanceof THREE.Material || v instanceof THREE.Texture)) v.dispose()
      }
      parts.cloud.map?.dispose()
    },
    [parts],
  )

  const clouds = useMemo(() => {
    let s = 9
    const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    return Array.from({ length: 36 }, () => {
      const a = rand() * Math.PI * 2
      const r = R * (0.78 + rand() * 0.1)
      return { pos: [Math.sin(a) * r, (rand() - 0.5) * L * 0.85, Math.cos(a) * r] as [number, number, number], size: 0.012 + rand() * 0.018 }
    })
  }, [])

  // 構造の帯の材質（昼の値を覚えておいて、夜はそれに掛ける）
  const dims = useMemo(
    () => [dimOf(parts.frameMat, 'window'), dimOf(parts.glassMat, 'window'), dimOf(parts.equipMat, 'window'), dimOf(parts.capMat, 'ends')],
    [parts],
  )

  // 昼と夜：大地・かすみ・雲・構造の帯を暗くし、街の灯りをともす（建物と木の材質は ColonyInterior が共有の値で変える）
  const lastNight = useRef(-1)
  useFrame(() => {
    if (!interior) return
    const n = colonyDay.night
    if (n === lastNight.current) return
    lastNight.current = n
    for (const l of parts.lands) l.material.color.lerpColors(LAND_DAY, LAND_NIGHT, n)
    for (const l of parts.nightLights) l.material.opacity = n
    parts.haze.color.lerpColors(HAZE_DAY, HAZE_NIGHT, n)
    parts.haze.opacity = 0.16 - 0.06 * n
    parts.cloud.color.lerpColors(WHITE, CLOUD_NIGHT, n)
    parts.cloud.opacity = 0.85 - 0.5 * n
    for (const d of dims) {
      const f = 1 - n * (1 - STRUCTURE_NIGHT[d.band])
      d.mat.color.copy(d.color).multiplyScalar(f)
      d.mat.emissive.copy(d.emissive).multiplyScalar(f)
      d.mat.envMapIntensity = d.env * f
    }
  })

  const rings = Array.from({ length: 13 }, (_, k) => -L / 2 + (k / 12) * L)
  // 窓の格子・外板の機器・丸屋根の骨・温室・鏡の枠（colonyDetail.ts。材質ごとにまとめた形）
  const detail = colonyDetail(MIRROR_ANGLE)

  return (
    <group>
      {/* 大地の帯：外は外板、内は大地 */}
      {parts.hulls.map((g, i) => (
        <mesh key={`h${i}`} geometry={g} material={parts.hullMat} castShadow receiveShadow />
      ))}
      {interior && parts.lands.map((l, i) => <mesh key={`l${i}`} geometry={l.geometry} material={l.material} />)}
      {interior && parts.nightLights.map((l, i) => <mesh key={`n${i}`} geometry={l.geometry} material={l.material} renderOrder={1} />)}
      {interior && <ColonyInterior trees={cityTrees} />}
      {parts.windows.map((g, i) => (
        <mesh key={`w${i}`} geometry={g} material={parts.glassMat} renderOrder={2} />
      ))}
      {rings.map((y) => (
        <mesh key={`r${y}`} geometry={parts.ring} material={parts.frameMat} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} />
      ))}
      <mesh geometry={detail.frame} material={parts.frameMat} />
      <mesh geometry={detail.equip} material={parts.equipMat} />
      <mesh geometry={detail.lights} material={parts.lightMat} />
      <mesh geometry={detail.greenhouse} material={parts.greenhouseMat} />
      <mesh geometry={parts.sunCap} material={parts.capMat} />
      <mesh geometry={parts.portCap} material={parts.capMat} />

      {/* 港：回転軸の上の筒と、入口の誘導灯 */}
      <mesh geometry={parts.portTube} material={parts.capMat} position={[0, -L / 2 - CAP - 0.05, 0]} />
      {Array.from({ length: 16 }, (_, k) => {
        const a = (k / 16) * Math.PI * 2
        return <mesh key={`p${k}`} geometry={parts.light} material={parts.portLightMat} position={[Math.sin(a) * PORT * 1.08, -L / 2 - CAP - 0.1, Math.cos(a) * PORT * 1.08]} />
      })}

      {/* 農業区画の輪 */}
      <group position={[0, -L / 2 - CAP - 0.07, 0]}>
        <mesh geometry={parts.farmRing} material={parts.frameMat} rotation={[Math.PI / 2, 0, 0]} />
        {Array.from({ length: 6 }, (_, k) => {
          const a = (k / 6) * Math.PI * 2 + 30 * DEG
          const mid = (0.26 + PORT) / 2
          return <mesh key={`s${k}`} geometry={parts.spoke} material={parts.frameMat} position={[Math.sin(a) * mid, 0, Math.cos(a) * mid]} rotation={[0, a, Math.PI / 2]} />
        })}
      </group>

      {/* 鏡：窓の帯の外側。港側の端を支点に、太陽のほうへ開く */}
      {[1, 3, 5].map((i) => {
        const a = stripAngle(i)
        return (
          <group key={`mir${i}`} rotation={[0, a, 0]}>
            <group position={[0, -L / 2, R * 1.04]} rotation={[MIRROR_ANGLE, 0, 0]}>
              <mesh geometry={parts.mirror} material={parts.mirrorMat} position={[0, L / 2, 0]} />
            </group>
            {/* 鏡を支える支柱（鏡の途中から、円筒の外板へまっすぐ） */}
            {[0.45, 0.8].map((f) => {
              const y = -L / 2 + Math.cos(MIRROR_ANGLE) * L * f
              const z = R * 1.04 + Math.sin(MIRROR_ANGLE) * L * f
              return <mesh key={f} geometry={parts.strut} material={parts.frameMat} position={[0, y, (z + R) / 2]} rotation={[Math.PI / 2, 0, 0]} scale={[1, z - R, 1]} />
            })}
            {/* 鏡の先の航行灯 */}
            <mesh geometry={parts.light} material={parts.lightMat} position={[0, -L / 2 + Math.cos(MIRROR_ANGLE) * L, R * 1.04 + Math.sin(MIRROR_ANGLE) * L]} scale={2} />
          </group>
        )
      })}

      {interior && (
        <>
          <mesh geometry={parts.hazeGeometry} material={parts.haze} renderOrder={1} />
          {clouds.map((c, i) => (
            <sprite key={`c${i}`} position={c.pos} scale={c.size} material={parts.cloud} />
          ))}
        </>
      )}
    </group>
  )
}
