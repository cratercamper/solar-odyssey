import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { bodies } from '../../state/registry'
import { ship } from '../../state/flight'
import { useStore } from '../../state/store'
import { SF_TEXT, SOLAR_PLANT_ID, solarPlantName } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'
import { roomEnvironment } from '../telescope/parts'

// 太陽光ミラー発電所（オリジナルのデザイン）。太陽と地球の L1 点（地球から太陽の側）に浮かぶ。
// 浅いお椀の形に並べた約3800枚の鏡が太陽の光を焦点の受光部へ集め、受光部で電気に変えて、
// 裏の送電アンテナからマイクロ波で地球へ送る。鏡の面（+Z）はいつも太陽を向く。
// 大きさは SITE_ZOOM のときに本物の比率：お椀の半径 0.3 が約13km。

/** お椀の半径・焦点の距離・真ん中の穴（送電の通り道）の半径 */
const DISH = 0.3
const FOCUS = 0.34
const HOLE = 0.035
/** 鏡の並びの間隔と、鏡1枚の半径（約190m） */
const STEP = 0.0092
const MIRROR = 0.0044
/** 地球から太陽の側へ、L1 点までの距離（ウェッブがいる L2 と同じ。本物は約150万km） */
const L1_DISTANCE = 7
/** この距離より近いと、鏡のきらめきを動かす */
const NEAR_DETAIL = 4
/** これより近いと（カメラから、表示単位）鏡を 1 枚ずつ描く。遠くではなめらかなお椀 1 つ */
const MIRROR_DETAIL = 5

const Z = new THREE.Vector3(0, 0, 1)
const earth = new THREE.Vector3()
const toSun = new THREE.Vector3()
const here = new THREE.Vector3()
const color = new THREE.Color()

/** 鏡の並び：六角形の格子で、穴の外・お椀の縁の内側。面は放物面の法線（太陽の光を焦点へはね返す向き） */
function mirrorLayout() {
  const list: { matrix: THREE.Matrix4; r: number }[] = []
  const q = new THREE.Quaternion()
  const n = new THREE.Vector3()
  const p = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const rows = Math.ceil(DISH / (STEP * 0.866))
  for (let j = -rows; j <= rows; j++) {
    const y = j * STEP * 0.866
    for (let i = -rows; i <= rows; i++) {
      const x = (i + (j % 2 ? 0.5 : 0)) * STEP
      const r = Math.hypot(x, y)
      if (r < HOLE || r > DISH) continue
      p.set(x, y, (r * r) / (4 * FOCUS))
      n.set(-x / (2 * FOCUS), -y / (2 * FOCUS), 1).normalize()
      q.setFromUnitVectors(up, n)
      list.push({ matrix: new THREE.Matrix4().compose(p.clone(), q.clone(), new THREE.Vector3(1, 1, 1)), r })
    }
  }
  return list
}

/** 送電のビーム：やわらかく光る帯が、ゆっくり地球の方へ流れていく（本物のマイクロ波は目に見えない） */
function beamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, length: { value: 6 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vFacing;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vFacing = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float length;
      varying vec2 vUv;
      varying float vFacing;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        // 長さに沿って流れる光の粒（1単位あたり8本）。両端はなめらかに消す
        float along = vUv.y * length;
        float wave = 0.55 + 0.45 * sin(along * 50.0 + time * 6.0);
        float ends = smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
        float soft = pow(vFacing, 1.6);
        gl_FragColor = vec4(vec3(0.45, 0.75, 1.6) * wave, 0.28 * soft * ends);
      }
    `,
  })
}

export function SolarPlant() {
  useLang()
  const { gl } = useThree()
  const group = useRef<THREE.Group>(null!)
  const beam = useRef<THREE.Mesh>(null!)
  const dish = useRef<THREE.Mesh>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const moved = useSite(group, {
    id: SOLAR_PLANT_ID,
    radius: DISH * 1.1,
    zoom: { start: 2.2, full: 0.7 },
    notice: { distance: 2.2, text: SF_TEXT.solarPlantFound },
  })

  const parts = useMemo(() => {
    const env = roomEnvironment(gl)
    const layout = mirrorLayout()
    const mirrors = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(MIRROR, MIRROR, 0.0004, 6),
      new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.95, roughness: 0.12, envMap: env, envMapIntensity: 1.1 }),
      layout.length,
    )
    layout.forEach((m, i) => {
      mirrors.setMatrixAt(i, m.matrix)
      mirrors.setColorAt(i, color.setScalar(0.7))
    })
    mirrors.frustumCulled = false
    // 遠くでは、鏡 3800 枚の代わりに、同じ形のなめらかなお椀を 1 つ描く（鏡 1 枚が 1 ピクセルより小さいので見た目は同じ）
    const bowl: THREE.Vector2[] = []
    for (let k = 0; k <= 12; k++) {
      const r = HOLE + ((DISH - HOLE) * k) / 12
      bowl.push(new THREE.Vector2(r, (r * r) / (4 * FOCUS)))
    }
    const dish = new THREE.LatheGeometry(bowl, 48)
    dish.rotateX(Math.PI / 2)
    // 集めた光の円すい（お椀の縁から焦点へ）
    const rimZ = (DISH * DISH) / (4 * FOCUS)
    const cone = new THREE.ConeGeometry(DISH, FOCUS - rimZ, 64, 1, true)
    cone.rotateX(-Math.PI / 2)
    cone.translate(0, 0, rimZ + (FOCUS - rimZ) / 2)
    // 送電のビーム：Z 方向に長さ1（地球への距離で伸ばす）。細い先から地球の受電所へ少し広がる
    const beamGeometry = new THREE.CylinderGeometry(0.03, 0.01, 1, 32, 1, true)
    beamGeometry.rotateX(-Math.PI / 2)
    beamGeometry.translate(0, 0, -0.5)
    // 円柱の uv.y が太い側（地球の側）で 1 になるよう、向きをそろえる
    const uv = beamGeometry.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
    return {
      env,
      mirrors,
      dish,
      dishMat: new THREE.MeshStandardMaterial({ color: new THREE.Color().setScalar(0.62), metalness: 0.95, roughness: 0.2, envMap: env, envMapIntensity: 1.1, side: THREE.DoubleSide }),
      radii: layout.map((m) => m.r),
      cone,
      coneMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.4), transparent: true, opacity: 0.03, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      beamGeometry,
      beamMat: beamMaterial(),
      truss: new THREE.BoxGeometry(0.0025, 0.0025, 1),
      ring: (r: number) => new THREE.TorusGeometry(r, 0.0018, 6, 96),
      frameMat: new THREE.MeshStandardMaterial({ color: '#6f747d', metalness: 0.6, roughness: 0.45, envMap: env, envMapIntensity: 0.5 }),
      collector: new THREE.CylinderGeometry(0.016, 0.02, 0.026, 32),
      hot: new THREE.CircleGeometry(0.014, 32),
      hotMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 1.2), toneMapped: false }),
      antenna: new THREE.CircleGeometry(0.026, 6),
      antennaMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.7, 1.4), toneMapped: false }),
      light: new THREE.SphereGeometry(0.0016, 8, 8),
      lightMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.5, 0.3), toneMapped: false }),
    }
  }, [gl])

  useEffect(
    () => () => {
      parts.mirrors.geometry.dispose()
      ;(parts.mirrors.material as THREE.Material).dispose()
      parts.mirrors.dispose()
      for (const v of Object.values(parts)) if (v instanceof THREE.BufferGeometry || v instanceof THREE.Material) v.dispose()
    },
    [parts],
  )

  useFrame(({ clock, camera }) => {
    const e = bodies.get('earth')
    if (!e) return
    e.object.getWorldPosition(earth)
    const g = group.current
    // L1：地球から太陽の側へ。鏡の面（+Z）は太陽を向く
    toSun.copy(earth).negate().normalize()
    g.position.copy(earth).addScaledVector(toSun, L1_DISTANCE)
    g.quaternion.setFromUnitVectors(Z, toSun)
    moved()

    // 送電ビーム：焦点の受光部の裏から、地球の表面まで
    const t = clock.getElapsedTime()
    const length = Math.max(0.1, g.position.distanceTo(earth) - e.radius)
    beam.current.scale.set(1, 1, length)
    parts.beamMat.uniforms.time.value = t
    parts.beamMat.uniforms.length.value = length

    // 近くでは鏡を 1 枚ずつ、遠くではなめらかなお椀を描く
    g.getWorldPosition(here)
    const detail = camera.position.distanceTo(here) < MIRROR_DETAIL
    parts.mirrors.visible = detail
    dish.current.visible = !detail
    // 近くでは、鏡のきらめきが波のようにお椀を横切る（鏡が少しずつ向きを直しているところ）
    if (ship.position.distanceTo(here) < NEAR_DETAIL && useStore.getState().mode !== 'map') {
      const m = parts.mirrors
      parts.radii.forEach((r, i) => {
        const k = Math.max(0, Math.sin(t * 0.8 - r * 30)) ** 12
        m.setColorAt(i, color.setScalar(0.7 + k * 0.9))
      })
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  })

  const rimZ = (DISH * DISH) / (4 * FOCUS)
  const spokes = Array.from({ length: 12 }, (_, k) => (k / 12) * Math.PI * 2)
  const legs = [0, 1, 2].map((k) => (k / 3) * Math.PI * 2 + Math.PI / 6)
  // 縁から焦点への支柱：長さと向き
  const legLength = Math.hypot(DISH, FOCUS - rimZ)
  const legTilt = Math.atan2(DISH, FOCUS - rimZ)

  return (
    <group ref={group}>
      <primitive object={parts.mirrors} />
      <mesh ref={dish} geometry={parts.dish} material={parts.dishMat} visible={false} />
      {/* 鏡を支える裏の骨組み：同心の輪と放射状の梁 */}
      {[0.1, 0.2, DISH].map((r) => (
        <mesh key={`r${r}`} geometry={parts.ring(r)} material={parts.frameMat} position={[0, 0, (r * r) / (4 * FOCUS) - 0.004]} />
      ))}
      {spokes.map((a) => (
        <group key={`s${a}`} rotation={[0, 0, a]}>
          <mesh geometry={parts.truss} material={parts.frameMat} position={[(DISH + HOLE) / 2, 0, rimZ / 2 - 0.005]} rotation={[0, Math.PI / 2 - Math.atan2(rimZ, DISH), 0]} scale={[1, 1, DISH - HOLE]} />
        </group>
      ))}
      {/* 受光部からお椀の真ん中の送電アンテナへ電気を送る柱 */}
      <mesh geometry={parts.truss} material={parts.frameMat} position={[0, 0, FOCUS / 2]} scale={[2, 2, FOCUS]} />
      {/* 縁から焦点の受光部へ伸びる3本の支柱と、縁の航行灯 */}
      {legs.map((a) => (
        <group key={`l${a}`} rotation={[0, 0, a]}>
          <mesh geometry={parts.truss} material={parts.frameMat} position={[DISH / 2, 0, (rimZ + FOCUS) / 2]} rotation={[0, -legTilt, 0]} scale={[1, 1, legLength]} />
          <mesh geometry={parts.light} material={parts.lightMat} position={[DISH * 1.01, 0, rimZ]} scale={2} />
        </group>
      ))}
      <mesh geometry={parts.cone} material={parts.coneMat} renderOrder={2} />
      {/* 焦点の受光部：お椀の側が光を受けて白く光る。裏（地球の側）は送電アンテナ */}
      <group position={[0, 0, FOCUS]}>
        <mesh geometry={parts.collector} material={parts.frameMat} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={parts.hot} material={parts.hotMat} position={[0, 0, -0.0135]} rotation={[Math.PI, 0, 0]} />
      </group>
      <mesh geometry={parts.antenna} material={parts.antennaMat} position={[0, 0, -0.002]} rotation={[Math.PI, 0, 0]} />
      <mesh ref={beam} geometry={parts.beamGeometry} material={parts.beamMat} frustumCulled={false} renderOrder={3} />
      <Html position={[0, DISH * 1.25, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(SOLAR_PLANT_ID)}>
          {solarPlantName()}
        </span>
      </Html>
    </group>
  )
}
