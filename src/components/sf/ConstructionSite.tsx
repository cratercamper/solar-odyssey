import { useMemo, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { COLONY_LENGTH as L, COLONY_RADIUS as R } from '../../data/sf'
import { WorkMech } from './WorkMech'
import { roomEnvironment } from '../telescope/parts'
import { LABEL_Z } from '../labels'
import { usePioneer } from '../../state/pioneer'
import { GROW_SECONDS } from '../../data/pioneer'
import { cinemaClock } from '../../state/pioneerFx'

// 建設中の2号基：骨組みだけの円筒に、作業機が外板を1枚ずつ取りつけている。
// オニールの構想では、コロニーは2本1組で逆向きに回して、回転のくせ（こまのように向きを保とうとする力）を打ち消す。
// 開拓（state/pioneer.ts）で遊んでいるあいだは、終えた段階に合わせて見た目が進む：
// 0 骨組みの途中 → 1 骨組み → 2 外板 → 3 窓と鏡 → 4 回転 → 5 空気と水（中に灯り、銘板）。開拓をやめると元の見た目に戻る。

/** 作業機の高さ（表示単位）。本物は約18mの想定だが、自機（640m）のそばでも見えるよう約10倍に描く */
export const MECH_SIZE = 0.0056
/** 外板を張り終えたところ（長さに対する割合）。開拓していないときの見た目 */
const BUILT = 0.35

const H = L / 2

/** 開拓の段階ごとの見た目：梁の長さ（割合。輪はその長さまで付く）、外板（割合） */
function stageLook(active: boolean, stage: number) {
  if (!active) return { girder: 1, plating: BUILT }
  if (stage === 0) return { girder: 0.4, plating: 0 }
  if (stage === 1) return { girder: 1, plating: 0.08 }
  return { girder: 1, plating: 1 }
}
/** 建設中のコロニー（録画・自動テストでカメラを向けるため） */
export const constructionSite = { object: null as THREE.Object3D | null }

/** 回転を始めたあとの 1 周の秒数（見た目。本物の 1g なら約 2 分） */
const SPIN_SECONDS = 127
/** 鏡を開いたときの角度 */
const MIRROR_OPEN = 0.55

/** 建てた直後の伸び具合（0 → 1）。建設の場面の時計に合わせる。場面の外では伸びきった形 */
function growth(cinema: boolean) {
  return cinema ? THREE.MathUtils.smoothstep(cinemaClock.t, 0, GROW_SECONDS) : 1
}

export function ConstructionSite() {
  const { gl } = useThree()
  const active = usePioneer((p) => p.active)
  const stage = usePioneer((p) => (p.active ? p.stage : 0))
  const name = usePioneer((p) => p.colonyName)
  const cinema = usePioneer((p) => p.active && p.cinema)
  const look = stageLook(active, stage)
  // 建てた直後は、ひとつ前の段階の形から伸ばす
  const prev = stageLook(active, Math.max(0, stage - 1))
  const done = active && stage >= 5
  const parts = useMemo(() => {
    // 横から光が当たらなくても形がわかるよう、映り込みの環境を入れる
    const env = roomEnvironment(gl)
    return {
      ring: new THREE.TorusGeometry(R, 0.0016, 6, 96),
      girder: new THREE.BoxGeometry(0.0026, L, 0.0026),
      plating: new THREE.CylinderGeometry(R * 1.002, R * 1.002, L, 48, 1, true),
      endCap: new THREE.RingGeometry(R * 0.3, R, 48),
      light: new THREE.SphereGeometry(0.0012, 8, 8),
      pallet: new THREE.BoxGeometry(0.004, 0.0006, 0.003),
      // 窓の帯（陸の帯と交互に 3 本）と、外へ開いた鏡
      window: new THREE.CylinderGeometry(R * 1.004, R * 1.004, L * 0.92, 12, 1, true, -0.28, 0.56),
      mirror: new THREE.BoxGeometry(R * 0.95, L * 0.92, 0.0012),
      frameMat: new THREE.MeshStandardMaterial({ color: '#7d828b', metalness: 0.6, roughness: 0.45, envMap: env, envMapIntensity: 0.5 }),
      plateMat: new THREE.MeshStandardMaterial({ color: '#a3a7ae', metalness: 0.45, roughness: 0.55, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.4 }),
      windowMat: new THREE.MeshStandardMaterial({ color: '#1d2a3a', metalness: 0.2, roughness: 0.15, envMap: env, envMapIntensity: 1, emissive: '#000000', side: THREE.DoubleSide }),
      mirrorMat: new THREE.MeshStandardMaterial({ color: '#8fa6bf', metalness: 1, roughness: 0.12, envMap: env, envMapIntensity: 1.1 }),
      lightMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 1.4), toneMapped: false }),
      warnMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.9, 0.2), toneMapped: false }),
    }
  }, [gl])
  const warn = useRef(parts.warnMat)
  const spin = useRef<THREE.Group>(null!)
  const plating = useRef<THREE.Mesh>(null!)
  const shown = useRef(look.plating)
  const plate = useRef<HTMLSpanElement>(null)
  const ringGroup = useRef<THREE.Group>(null!)
  const girderGroup = useRef<THREE.Group>(null!)
  const mirrorGroup = useRef<THREE.Group>(null!)
  useFrame(({ clock }, dt) => {
    const g = growth(cinema)
    // 梁が伸び、輪が 1 本ずつ付いていく（骨組みの段階）
    const girder = THREE.MathUtils.lerp(prev.girder, look.girder, g)
    const rs = ringGroup.current.children
    for (let k = 0; k < rs.length; k++) rs[k].visible = k / 14 <= girder + 0.01
    for (const m of girderGroup.current.children) {
      m.scale.y = girder
      m.position.y = -H + (L * girder) / 2
    }
    // 鏡がゆっくり開く（窓と鏡の段階）
    const open = stage === 3 ? g : 1
    for (const holder of mirrorGroup.current.children) {
      const m = holder.children[0]
      if (!m) continue
      m.rotation.y = MIRROR_OPEN * open
      m.scale.set(0.3 + 0.7 * open, 1, 1)
    }
    // 中の灯りがともる（空気と水の段階）
    parts.windowMat.emissiveIntensity = done ? 0.9 * (stage === 5 ? g : 1) : 0
    // 工事の場所を知らせる、ゆっくり点滅する橙色の灯
    const k = Math.sin(clock.getElapsedTime() * 3) > 0 ? 1 : 0.12
    warn.current.color.setRGB(2.6 * k, 0.9 * k, 0.2 * k)
    // 外板は、張った分まで伸びる（建てた直後は建設の場面に合わせて。ほかの変化は数秒かけてなめらかに）
    if (g < 1) shown.current = THREE.MathUtils.lerp(prev.plating, look.plating, g)
    else {
      shown.current += (look.plating - shown.current) * Math.min(1, dt * 0.4)
      if (Math.abs(look.plating - shown.current) < 0.002) shown.current = look.plating
    }
    const f = Math.max(shown.current, 1e-4)
    plating.current.scale.set(1, f, 1)
    plating.current.position.y = -H + (L * f) / 2
    plating.current.visible = shown.current > 0.002
    // 銘板（HTML）は親の visible に従わないので、建設中のコロニーが隠れているあいだ（遠いとき）は自分で隠す
    if (plate.current) {
      let o: THREE.Object3D | null = spin.current
      let seen = true
      while (o) {
        if (!o.visible) seen = false
        o = o.parent
      }
      plate.current.style.display = seen ? '' : 'none'
    }
    // 回り始めはゆっくり（回転の段階で、だんだん速く）
    if (active && stage >= 4) spin.current.rotation.y += ((Math.min(dt, 0.1) * Math.PI * 2) / SPIN_SECONDS) * (stage === 4 ? g : 1)
    else spin.current.rotation.y = 0
  })

  // 輪はいつも 15 本作り、梁の伸びた所までだけ見せる（毎コマ useFrame で）
  const rings = Array.from({ length: 15 }, (_, k) => -H + (k / 14) * L)
  const girders = Array.from({ length: 12 }, (_, k) => (k / 12) * Math.PI * 2)
  const at = (a: number, r: number, y: number) => [Math.sin(a) * r, y, Math.cos(a) * r] as [number, number, number]
  const glassAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]
  parts.windowMat.emissive.set(done ? '#ffd9a0' : '#000000')

  // 作業機の場所：外板の端（外板を張り終えたら、窓と鏡の取りつけで、なかほど）
  const edge = look.plating > 0.02 && look.plating < 1 ? look.plating : stage === 0 && active ? look.girder : 0.5
  const front = Math.min(-H + L * edge, H - MECH_SIZE)
  const welders = [0.3, 1.5, 2.6, 3.9, 5.1].map((a, i) => ({ a, y: front - MECH_SIZE * 0.8 + (i % 2) * MECH_SIZE * 0.5 }))
  const working = !done

  return (
    <group
      ref={(g) => {
        spin.current = g!
        constructionSite.object = g
      }}
    >
      <group ref={ringGroup}>
        {rings.map((y) => (
          <mesh key={`r${y}`} geometry={parts.ring} material={parts.frameMat} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} />
        ))}
      </group>
      <group ref={girderGroup}>
        {girders.map((a) => (
          <mesh key={`g${a}`} geometry={parts.girder} material={parts.frameMat} position={at(a, R, -H + (L * look.girder) / 2)} scale={[1, look.girder, 1]} />
        ))}
      </group>
      <mesh ref={plating} geometry={parts.plating} material={parts.plateMat} />
      <mesh geometry={parts.endCap} material={parts.plateMat} position={[0, -H, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <group ref={mirrorGroup}>
        {active &&
          stage >= 3 &&
          glassAngles.map((a) => (
            // 窓の帯の横で、外へ斜めに開いた鏡（太陽の光を窓から中へ返す）。開く角度は useFrame で
            <group key={`m${a}`} rotation={[0, a + 0.28, 0]}>
              <mesh geometry={parts.mirror} material={parts.mirrorMat} position={[R * 0.28, 0, R * 1.3]} rotation={[0, MIRROR_OPEN, 0]} />
            </group>
          ))}
      </group>
      {active &&
        stage >= 3 &&
        glassAngles.map((a) => <mesh key={`w${a}`} geometry={parts.window} material={parts.windowMat} rotation={[0, a, 0]} />)}
      {/* 作業灯：外板の端の輪と、その先の輪の上 */}
      {working &&
        girders.map((a) => (
          <group key={`l${a}`}>
            <mesh geometry={parts.light} material={parts.lightMat} position={at(a, R * 1.02, front)} />
            <mesh geometry={parts.light} material={parts.warnMat} position={at(a + 0.26, R * 1.02, Math.min(front + L / 14, H))} />
          </group>
        ))}
      {working &&
        welders.map((w, i) => (
          <group key={`w${i}`} position={at(w.a, R + MECH_SIZE * 0.6, w.y)} rotation={[0, w.a, 0]}>
            {/* 頭を長さの向き（+Y）に、前を円筒の外板に向けて取りつく */}
            <group rotation={[0, Math.PI, 0]} scale={MECH_SIZE}>
              <WorkMech pose="weld" phase={i * 1.7} />
            </group>
          </group>
        ))}
      {working && <Carrier phase={0} angle={0.9} front={front} />}
      {working && <Carrier phase={3.1} angle={3.3} front={front} />}
      {/* 外板を積んだ置き場 */}
      {working &&
        [0.9, 3.3].map((a) => (
          <group key={`p${a}`} position={at(a, R + 0.025, front + 0.03)} rotation={[0, a, 0]}>
            {[0, 1, 2, 3].map((k) => (
              <mesh key={k} geometry={parts.pallet} material={parts.plateMat} position={[0, k * 0.0009, 0]} />
            ))}
            <mesh geometry={parts.light} material={parts.warnMat} position={[0.003, 0.004, 0]} />
          </group>
        ))}
      {done && (
        <Html position={[0, -H - R * 0.6, 0]} center className="label pioneer-plate" zIndexRange={LABEL_Z}>
          <span ref={plate}>{name}</span>
        </Html>
      )}
    </group>
  )
}

/** 置き場から外板の端まで、外板を抱えて行き来する作業機 */
function Carrier({ phase, angle, front }: { phase: number; angle: number; front: number }) {
  const ref = useRef<THREE.Group>(null!)
  const from = new THREE.Vector3(Math.sin(angle) * (R + 0.025), front + 0.03, Math.cos(angle) * (R + 0.025))
  const to = new THREE.Vector3(Math.sin(angle + 0.25) * (R + 0.008), front + 0.002, Math.cos(angle + 0.25) * (R + 0.008))
  const p = new THREE.Vector3()
  const look = new THREE.Vector3()
  useFrame(({ clock }) => {
    // 往復（端でひと休み）
    const a = (clock.getElapsedTime() + phase) * 0.25
    const k = THREE.MathUtils.smoothstep(0.5 - 0.5 * Math.cos(a), 0.1, 0.9)
    p.lerpVectors(from, to, k)
    ref.current.position.copy(p)
    // 進む向きを向く（行きは外板の端、帰りは置き場）
    ref.current.lookAt(ref.current.parent!.localToWorld(look.copy(Math.sin(a) > 0 ? to : from)))
  })
  return (
    <group ref={ref}>
      <group scale={MECH_SIZE} rotation={[0, 0, 0]}>
        <WorkMech pose="carry" phase={phase} />
      </group>
    </group>
  )
}
