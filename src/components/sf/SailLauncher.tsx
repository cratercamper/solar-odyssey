import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { bodies } from '../../state/registry'
import { useStore } from '../../state/store'
import { SAIL_LAUNCHER_ID, SF_TEXT, sailLauncherName } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { hullTexture } from './colonyTextures'
import { useSite } from './useSite'
import { roomEnvironment } from '../telescope/parts'

// 光帆の発射台（オリジナルのデザイン）。古い円筒形の居住区を改造した、レーザーの発射台。
// 先端（+Z）の六角形のタイルが並んだ面が、たくさんの小さなレーザーを束ねる発射口（フェーズドアレイ）。
// 地球と月の L3 点（月と反対側）に浮かび、発射口をいつもケンタウルス座アルファ星の方へ向けている。
// 10秒ごとに、切手ほどの探査機を付けた薄い帆を、レーザーの光の圧力で押し出す（何も壊さない）。
// 大きさは SITE_ZOOM のときに本物の比率：長さ 0.47 が約20km。

const LENGTH = 0.47
const RADIUS = 0.047
const EMITTER = 0.075
/** 打ち出しの周期（秒）と、ためる時間・光を当てる時間 */
const CYCLE = 10
const CHARGE = 1.6
const PUSH = 2.2
/** 帆が見えなくなるまでの距離 */
const FADE_OUT = 14
const DEG = Math.PI / 180

/** ケンタウルス座アルファ星の方向（黄経 239.5度・黄緯 -42.5度）。画面の座標は (cosβcosλ, sinβ, -cosβsinλ) */
const ALPHA_CEN = new THREE.Vector3(Math.cos(-42.5 * DEG) * Math.cos(239.5 * DEG), Math.sin(-42.5 * DEG), -Math.cos(-42.5 * DEG) * Math.sin(239.5 * DEG)).normalize()

const Z = new THREE.Vector3(0, 0, 1)
const earth = new THREE.Vector3()
const moon = new THREE.Vector3()

/** 発射の光：先へ行くほど細く薄くなる、やわらかい光の柱 */
function beamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { strength: { value: 0 }, time: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vFacing;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float strength;
      uniform float time;
      varying vec2 vUv;
      varying float vFacing;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float fade = pow(1.0 - vUv.y, 1.5);
        float shimmer = 0.8 + 0.2 * sin(vUv.y * 120.0 - time * 20.0);
        gl_FragColor = vec4(vec3(0.75, 0.55, 1.8) * shimmer, 0.5 * strength * fade * pow(vFacing, 2.0));
      }
    `,
  })
}

type Sail = { mesh: THREE.Group; start: number }

export function SailLauncher() {
  useLang()
  const { gl } = useThree()
  const group = useRef<THREE.Group>(null!)
  const beam = useRef<THREE.Mesh>(null!)
  const sails = useRef<Sail[]>([])
  const sailGroup = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  const ready = useRef(false)
  useHideBehindSun(label, group)
  const moved = useSite(group, {
    id: SAIL_LAUNCHER_ID,
    radius: LENGTH * 0.6,
    zoom: { start: 2.2, full: 0.7 },
    notice: { distance: 2.2, text: SF_TEXT.sailLauncherFound },
  })

  const parts = useMemo(() => {
    const env = roomEnvironment(gl)
    const hullMap = hullTexture(41)
    hullMap.wrapS = hullMap.wrapT = THREE.RepeatWrapping
    hullMap.repeat.set(1, 4)
    // 発射口のタイル：六角形の格子
    const tiles: THREE.Matrix4[] = []
    const step = 0.0068
    for (let j = -14; j <= 14; j++)
      for (let i = -14; i <= 14; i++) {
        const x = (i + (j % 2 ? 0.5 : 0)) * step
        const y = j * step * 0.866
        if (Math.hypot(x, y) < EMITTER - step * 0.6) tiles.push(new THREE.Matrix4().makeTranslation(x, y, 0))
      }
    const tileMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(step * 0.46, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), tiles.length)
    tiles.forEach((m, i) => {
      tileMesh.setMatrixAt(i, m)
      tileMesh.setColorAt(i, new THREE.Color(0.12, 0.1, 0.35))
    })
    // 発射の光の柱：+Z 方向に長さ1（あとで伸ばす）
    const beamGeometry = new THREE.CylinderGeometry(0.004, EMITTER * 0.7, 1, 32, 1, true)
    beamGeometry.rotateX(Math.PI / 2)
    beamGeometry.translate(0, 0, 0.5)
    return {
      env,
      hullMap,
      hullMat: new THREE.MeshStandardMaterial({ map: hullMap, metalness: 0.45, roughness: 0.55, envMap: env, envMapIntensity: 0.45 }),
      // 改造前の窓の帯を、黒い板でふさいだあと
      platedMat: new THREE.MeshStandardMaterial({ color: '#2b2f38', metalness: 0.7, roughness: 0.35, envMap: env, envMapIntensity: 0.6 }),
      frameMat: new THREE.MeshStandardMaterial({ color: '#70757e', metalness: 0.6, roughness: 0.45, envMap: env, envMapIntensity: 0.5 }),
      // 熱を逃がす放熱板（強いレーザーは熱をたくさん出す）。うっすら赤く光る
      radiatorMat: new THREE.MeshStandardMaterial({ color: '#4a4c52', metalness: 0.5, roughness: 0.55, emissive: '#4a160a', emissiveIntensity: 0.35, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.5 }),
      panelMat: new THREE.MeshStandardMaterial({ color: '#1d2b52', metalness: 0.5, roughness: 0.35, emissive: '#0b1430', side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.8 }),
      hull: new THREE.CylinderGeometry(RADIUS, RADIUS, LENGTH, 48, 1, true),
      strip: new THREE.CylinderGeometry(RADIUS * 1.003, RADIUS * 1.003, LENGTH * 0.9, 8, 1, true, 0, 40 * DEG),
      ring: new THREE.TorusGeometry(RADIUS * 1.02, 0.0016, 6, 64),
      face: new THREE.CylinderGeometry(EMITTER, RADIUS, 0.03, 48),
      back: new THREE.SphereGeometry(RADIUS, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      radiator: new THREE.PlaneGeometry(0.055, LENGTH * 0.55),
      panel: new THREE.PlaneGeometry(0.2, 0.09),
      truss: new THREE.BoxGeometry(0.002, 0.002, 1),
      tileMesh,
      beamGeometry,
      beamMat: beamMaterial(),
      sail: new THREE.PlaneGeometry(0.004, 0.004),
      sailMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 2.6), side: THREE.DoubleSide, toneMapped: false, transparent: true }),
      trail: new THREE.CylinderGeometry(0.0001, 0.0006, 1, 6, 1, true),
      trailMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.7, 2.2), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    }
  }, [gl])

  useEffect(
    () => () => {
      parts.hullMap.dispose()
      parts.tileMesh.geometry.dispose()
      ;(parts.tileMesh.material as THREE.Material).dispose()
      parts.tileMesh.dispose()
      for (const v of Object.values(parts)) if (v instanceof THREE.BufferGeometry || v instanceof THREE.Material) v.dispose()
    },
    [parts],
  )

  /** 帆を1枚つくる：四角い薄い帆と、うしろに伸びる光の尾 */
  const makeSail = () => {
    const g = new THREE.Group()
    const sail = new THREE.Mesh(parts.sail, parts.sailMat)
    const trail = new THREE.Mesh(parts.trail, parts.trailMat)
    trail.rotation.x = -Math.PI / 2
    trail.name = 'trail'
    g.add(sail, trail)
    return g
  }

  useFrame(({ clock }) => {
    const e = bodies.get('earth')
    const m = bodies.get('moon')
    if (!e || !m) return
    e.object.getWorldPosition(earth)
    m.object.getWorldPosition(moon)
    const g = group.current
    // L3：地球をはさんで月の反対側、月と同じ距離
    g.position.copy(earth).sub(moon).add(earth)
    g.quaternion.setFromUnitVectors(Z, ALPHA_CEN)
    moved()

    // 打ち出しの周期：ためる（タイルが明るくなる）→ 光を当てる（光の柱）→ 休む
    const t = clock.getElapsedTime()
    const phase = t % CYCLE
    const cycle = Math.floor(t / CYCLE)
    const charge = phase < CHARGE ? phase / CHARGE : phase < CHARGE + PUSH ? 1 : Math.max(0, 1 - (phase - CHARGE - PUSH) / 1.5)
    const pushing = phase >= CHARGE && phase < CHARGE + PUSH
    const tiles = parts.tileMesh
    const c = new THREE.Color(0.12 + 0.4 * charge, 0.1 + 0.25 * charge, 0.35 + 1.25 * charge)
    for (let i = 0; i < tiles.count; i++) tiles.setColorAt(i, c)
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true
    const strength = pushing ? Math.sin(((phase - CHARGE) / PUSH) * Math.PI) : 0
    parts.beamMat.uniforms.strength.value = strength
    parts.beamMat.uniforms.time.value = t
    beam.current.visible = strength > 0.01
    beam.current.scale.set(1, 1, 5)

    // 新しい帆：光を当て始めた瞬間に発射口から出る
    if (pushing && (!ready.current || sails.current.every((s) => s.start !== cycle))) {
      ready.current = true
      const mesh = makeSail()
      sailGroup.current.add(mesh)
      sails.current.push({ mesh, start: cycle })
    }
    // 帆は光に押されるあいだ加速し、そのあとは同じ速さで星へ向かって遠ざかる
    sails.current = sails.current.filter((s) => {
      const age = t - (s.start * CYCLE + CHARGE)
      const accel = 1.2
      const z = age < PUSH ? 0.5 * accel * age * age : 0.5 * accel * PUSH * PUSH + accel * PUSH * (age - PUSH)
      s.mesh.position.set(0, 0, 0.02 + z)
      s.mesh.rotation.z = age * 0.6
      const trail = s.mesh.getObjectByName('trail')!
      const len = Math.min(z, 0.4)
      trail.scale.set(1, len + 0.001, 1)
      trail.position.z = -len / 2
      const gone = z > FADE_OUT || age < 0
      if (gone) {
        sailGroup.current.remove(s.mesh)
        return false
      }
      return true
    })
    parts.sailMat.opacity = 1
  })

  const strips = [0, 1, 2, 3, 4, 5].map((k) => (k / 6) * Math.PI * 2)
  const rings = Array.from({ length: 9 }, (_, k) => -LENGTH / 2 + (k / 8) * LENGTH)

  return (
    <group ref={group}>
      {/* 円筒の胴（Z 方向に寝かせる） */}
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh geometry={parts.hull} material={parts.hullMat} />
        {strips.map((a) => (
          <mesh key={`s${a}`} geometry={parts.strip} material={parts.platedMat} rotation={[0, a, 0]} />
        ))}
        {rings.map((y) => (
          <mesh key={`r${y}`} geometry={parts.ring} material={parts.frameMat} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} />
        ))}
        {/* うしろの丸い端 */}
        <mesh geometry={parts.back} material={parts.hullMat} position={[0, -LENGTH / 2, 0]} rotation={[Math.PI, 0, 0]} />
      </group>
      {/* 放熱板：胴から6方向へ */}
      {strips.map((a) => (
        <group key={`f${a}`} rotation={[0, 0, a + Math.PI / 6]}>
          <mesh geometry={parts.radiator} material={parts.radiatorMat} position={[RADIUS + 0.03, 0, -0.04]} rotation={[Math.PI / 2, 0, 0]} />
        </group>
      ))}
      {/* うしろの太陽電池の翼 */}
      {[1, -1].map((s) => (
        <group key={`p${s}`} position={[0, 0, -LENGTH / 2 + 0.03]}>
          <mesh geometry={parts.truss} material={parts.frameMat} position={[s * (RADIUS + 0.06), 0, 0]} rotation={[0, Math.PI / 2, 0]} scale={[1, 1, 0.12]} />
          <mesh geometry={parts.panel} material={parts.panelMat} position={[s * (RADIUS + 0.14), 0, 0]} rotation={[-Math.PI / 2, 0, 0]} />
        </group>
      ))}
      {/* 発射口：胴より少し広い面に、六角形のレーザーのタイル */}
      <mesh geometry={parts.face} material={parts.frameMat} position={[0, 0, LENGTH / 2 + 0.015]} rotation={[Math.PI / 2, 0, 0]} />
      <primitive object={parts.tileMesh} position={[0, 0, LENGTH / 2 + 0.031]} />
      <group position={[0, 0, LENGTH / 2 + 0.032]}>
        <mesh ref={beam} geometry={parts.beamGeometry} material={parts.beamMat} visible={false} frustumCulled={false} renderOrder={3} />
        <group ref={sailGroup} />
      </group>
      <Html position={[0, RADIUS * 4, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(SAIL_LAUNCHER_ID)}>
          {sailLauncherName()}
        </span>
      </Html>
    </group>
  )
}
