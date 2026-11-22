import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { colliders, sim } from '../../state/registry'
import { ship } from '../../state/flight'
import { useStore } from '../../state/store'
import { useLayout } from '../../state/useLayout'
import { planetLongitude, simDays } from '../../data/ephemeris'
import { RADIO_MOON_ID, SPACE_TEXT, radioMoonName } from '../../data/sfSpace'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'
import { roomEnvironment } from '../telescope/parts'

// 電波望遠鏡の人工の月（オリジナルのデザイン）。直径約150kmの球に外板を張り、緯度にそって帯を巻く。
// 北極には直径約50kmのお皿（くぼみ）があり、縁の3本の塔からケーブルで受信機をつり下げる（アレシボ電波望遠鏡と同じしくみ）。
// 中くらいの緯度に小さなお皿、低い緯度に船の出入り口。武器は持たない。
// 球の半径を 1 として作り、表示では RADIUS 倍にする。

/** 表示の半径（地球は 1.2） */
const RADIUS = 1.5
const REAL_KM = 150
/** そばで自機を縮める割合：自機（表示 0.3 で 640m）を、本物の比率にする */
const ZOOM = 0.3 / ((0.64 / REAL_KM) * RADIUS * 2)
/** お皿の縁の、北極からの角度（直径50km / 直径150km） */
const DISH = Math.asin(25 / 75)
const RIM_Y = Math.cos(DISH)
const RIM_R = Math.sin(DISH)
/** お皿の深さと、お皿の面をなす球 */
const DEPTH = 0.08
const BOWL_R = (RIM_R * RIM_R + DEPTH * DEPTH) / (2 * DEPTH)
const BOWL_Y = RIM_Y - DEPTH + BOWL_R
const BOWL_ANGLE = Math.asin(RIM_R / BOWL_R)
/** 塔の高さと、受信機をつり下げる高さ */
const TOWER_TOP = RIM_Y + 0.3
const RECEIVER_Y = RIM_Y + 0.17
/** 自機が近づける、表面からの高さ（半径に対する割合） */
const CLEARANCE = 0.012

const rng = (seed: number) => {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

/** 外板：灰色のパネル（繰り返して貼る） */
function panelTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  const rand = rng(41)
  g.fillStyle = '#8d9097'
  g.fillRect(0, 0, 512, 512)
  for (let y = 0; y < 512; y += 32)
    for (let x = 0; x < 512; x += 64) {
      const v = 120 + rand() * 50
      g.fillStyle = `rgb(${v}, ${v + 2}, ${v + 6})`
      g.fillRect(x + 1, y + 1, 62, 30)
    }
  g.fillStyle = 'rgba(30, 33, 40, 0.75)'
  for (let i = 0; i < 40; i++) g.fillRect(rand() * 512, rand() * 512, 10 + rand() * 50, 4 + rand() * 10)
  g.fillRect(0, 254, 512, 4)
  g.fillRect(254, 0, 4, 512)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(32, 16)
  tex.anisotropy = 8
  return tex
}

/** 街の灯（正距円筒の地図。帯のそばと、出入り口のまわりに多い） */
function lightsTexture() {
  const W = 2048
  const H = 1024
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const rand = rng(77)
  g.fillStyle = '#000'
  g.fillRect(0, 0, W, H)
  const latY = (lat: number) => ((90 - lat) / 180) * H
  for (const lat of [-55, -30, 30, 55]) {
    for (let i = 0; i < 900; i++) {
      const x = rand() * W
      const y = latY(lat) + (rand() - 0.5) * 60
      const v = 140 + rand() * 115
      g.fillStyle = `rgb(${v}, ${v * 0.85}, ${v * 0.55})`
      g.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2)
    }
  }
  for (let i = 0; i < 2500; i++) {
    const x = rand() * W
    const y = latY(-70 + rand() * 130)
    g.fillStyle = `rgba(255, 220, 160, ${0.2 + rand() * 0.5})`
    g.fillRect(x, y, 1, 1)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** お皿の面：同心円と放射の継ぎ目 */
function dishTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 1024
  const g = c.getContext('2d')!
  g.fillStyle = '#b7bcc5'
  g.fillRect(0, 0, 1024, 1024)
  g.strokeStyle = 'rgba(60, 64, 72, 0.7)'
  g.lineWidth = 2
  for (let r = 40; r < 724; r += 40) {
    g.beginPath()
    g.arc(512, 512, r, 0, Math.PI * 2)
    g.stroke()
  }
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2
    g.beginPath()
    g.moveTo(512, 512)
    g.lineTo(512 + Math.cos(a) * 724, 512 + Math.sin(a) * 724)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** 球の上の位置（緯度・経度は度） */
const onSphere = (lat: number, lon: number, r = 1) => {
  const la = (lat * Math.PI) / 180
  const lo = (lon * Math.PI) / 180
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo) * r, Math.sin(la) * r, Math.cos(la) * Math.sin(lo) * r)
}
const UP = new THREE.Vector3(0, 1, 0)

const local = new THREE.Vector3()
const center = new THREE.Vector3()
const bowlCenter = new THREE.Vector3(0, BOWL_Y, 0)
const push = new THREE.Vector3()

export function RadioMoon() {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const layout = useLayout()
  const moved = useSite(group, {
    id: RADIO_MOON_ID,
    radius: RADIUS,
    zoom: { start: RADIUS * 4, full: RADIUS * 1.8, factor: ZOOM },
    notice: { distance: RADIUS * 4, text: SPACE_TEXT.radioMoonFound },
  })
  const { gl } = useThree()

  const parts = useMemo(() => {
    const env = roomEnvironment(gl)
    const rand = rng(5)
    const smallDishes = Array.from({ length: 9 }, () => ({ lat: -60 + rand() * 105, lon: rand() * 360 }))
    const ports = Array.from({ length: 8 }, (_, k) => ({ lat: k % 2 ? 12 : -12, lon: k * 45 + rand() * 10 }))
    return {
      env,
      smallDishes,
      ports,
      // 北極のお皿の部分をあけた球
      shell: new THREE.SphereGeometry(1, 192, 96, 0, Math.PI * 2, DISH, Math.PI - DISH),
      shellMat: new THREE.MeshStandardMaterial({
        map: panelTexture(),
        emissiveMap: lightsTexture(),
        emissive: new THREE.Color(1.4, 1.2, 0.9),
        metalness: 0.35,
        roughness: 0.65,
        envMap: env,
        envMapIntensity: 0.35,
      }),
      // お皿：大きな球の下の部分を、内側から見る
      bowl: new THREE.SphereGeometry(BOWL_R, 128, 32, 0, Math.PI * 2, Math.PI - BOWL_ANGLE, BOWL_ANGLE),
      bowlMat: new THREE.MeshStandardMaterial({ map: dishTexture(), color: '#9da2aa', metalness: 0.5, roughness: 0.55, envMap: env, envMapIntensity: 0.25, side: THREE.BackSide }),
      band: new THREE.TorusGeometry(1, 0.0055, 8, 256),
      rim: new THREE.TorusGeometry(RIM_R, 0.006, 8, 160),
      frame: new THREE.MeshStandardMaterial({ color: '#6f747d', metalness: 0.6, roughness: 0.4, envMap: env, envMapIntensity: 0.5 }),
      tower: new THREE.CylinderGeometry(0.006, 0.012, TOWER_TOP - RIM_Y + 0.01, 8),
      cable: new THREE.CylinderGeometry(0.0012, 0.0012, 1, 4),
      receiver: new THREE.SphereGeometry(0.03, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      truss: new THREE.TorusGeometry(0.05, 0.004, 6, 3),
      small: new THREE.SphereGeometry(0.035, 24, 8, 0, Math.PI * 2, Math.PI * 0.7, Math.PI * 0.3),
      mast: new THREE.CylinderGeometry(0.002, 0.002, 0.04, 4),
      port: new THREE.PlaneGeometry(0.05, 0.022),
      portMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.4, 0.8), toneMapped: false, side: THREE.DoubleSide }),
      beacon: new THREE.SphereGeometry(0.004, 8, 8),
      beaconMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.4, 0.3), toneMapped: false }),
    }
  }, [gl])
  useEffect(
    () => () => {
      for (const v of Object.values(parts)) if (v instanceof THREE.BufferGeometry || v instanceof THREE.Material) v.dispose()
      parts.shellMat.map?.dispose()
      parts.shellMat.emissiveMap?.dispose()
      parts.bowlMat.map?.dispose()
    },
    [parts],
  )

  // 表面とお皿に当たる判定（塔とケーブルはくぐれる）
  useEffect(() => {
    const collide = () => {
      const g = body.current
      if (!g) return
      g.getWorldPosition(center)
      local.copy(ship.position)
      g.worldToLocal(local)
      const r = local.length()
      if (r > 1.3) return
      let target: THREE.Vector3 | null = null
      // 北極の上（お皿の真上）では、お皿の面より下へは行けない
      const overDish = Math.hypot(local.x, local.z) < RIM_R && local.y > 0
      if (overDish) {
        if (local.y < BOWL_Y) {
          const d = local.distanceTo(bowlCenter)
          const max = BOWL_R - CLEARANCE
          if (d > max) target = local.clone().sub(bowlCenter).setLength(max).add(bowlCenter)
        }
      } else if (r < 1 + CLEARANCE) target = local.clone().setLength(1 + CLEARANCE)
      if (!target) return
      g.localToWorld(target)
      push.copy(target).sub(ship.position)
      ship.position.copy(target)
      push.normalize()
      const into = ship.velocity.dot(push)
      if (into < 0) ship.velocity.addScaledVector(push, -into)
    }
    colliders.add(collide)
    return () => {
      colliders.delete(collide)
    }
  }, [])

  const beaconMat = useRef(parts.beaconMat)
  useFrame(({ clock }) => {
    // 火星の公転の道すじの上、火星より60度うしろ（火星のトロヤ点 L5。本物の火星にもトロヤ群の小惑星がある）
    const a = planetLongitude('mars', simDays(sim.time)) - Math.PI / 3
    const d = layout.orbit.get('mars') ?? 70
    group.current.position.set(Math.cos(a) * d, RADIUS * 1.5, -Math.sin(a) * d)
    // ゆっくり自転（10分で1回転）。北極のお皿は少し太陽の反対側の空へ傾ける
    body.current.rotation.y = clock.getElapsedTime() * ((Math.PI * 2) / 600)
    moved()
    const t = clock.getElapsedTime()
    const on = t % 2 < 0.12 || (t % 2 > 0.35 && t % 2 < 0.47)
    beaconMat.current.color.setRGB(on ? 2.6 : 0.2, on ? 0.4 : 0.03, on ? 0.3 : 0.02)
  })

  const towers = [0, 1, 2].map((k) => {
    const a = (k / 3) * Math.PI * 2
    return { a, base: new THREE.Vector3(Math.cos(a) * RIM_R * 1.02, RIM_Y, Math.sin(a) * RIM_R * 1.02) }
  })
  const receiver = new THREE.Vector3(0, RECEIVER_Y, 0)

  return (
    <group ref={group}>
      <group ref={body} scale={RADIUS} rotation={[0.35, 0, 0.2]}>
        <mesh geometry={parts.shell} material={parts.shellMat} castShadow receiveShadow />
        <mesh geometry={parts.bowl} material={parts.bowlMat} position={[0, BOWL_Y, 0]} />
        <mesh geometry={parts.rim} material={parts.frame} position={[0, RIM_Y, 0]} rotation={[Math.PI / 2, 0, 0]} />
        {/* 緯度にそって巻いた帯（赤道はあけておく） */}
        {[-55, -30, 30, 55].map((lat) => {
          const la = (lat * Math.PI) / 180
          return <mesh key={lat} geometry={parts.band} material={parts.frame} position={[0, Math.sin(la), 0]} rotation={[Math.PI / 2, 0, 0]} scale={[Math.cos(la), Math.cos(la), 1]} />
        })}
        {/* 縁の3本の塔と、受信機をつり下げるケーブル */}
        {towers.map(({ a, base }) => {
          const top = new THREE.Vector3(base.x, TOWER_TOP, base.z)
          const mid = top.clone().add(receiver).multiplyScalar(0.5)
          const dir = receiver.clone().sub(top)
          const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize())
          return (
            <group key={a}>
              <mesh geometry={parts.tower} material={parts.frame} position={[base.x, (RIM_Y + TOWER_TOP) / 2, base.z]} />
              <mesh geometry={parts.beacon} material={parts.beaconMat} position={top} />
              <mesh geometry={parts.cable} material={parts.frame} position={mid} quaternion={q} scale={[1, dir.length(), 1]} />
            </group>
          )
        })}
        <group position={receiver}>
          <mesh geometry={parts.truss} material={parts.frame} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={parts.receiver} material={parts.frame} rotation={[Math.PI, 0, 0]} />
        </group>
        {/* 小さなお皿のアンテナ */}
        {parts.smallDishes.map((s, i) => {
          const p = onSphere(s.lat, s.lon, 1.003)
          const q = new THREE.Quaternion().setFromUnitVectors(UP, p.clone().normalize())
          return (
            <group key={i} position={p} quaternion={q}>
              <mesh geometry={parts.mast} material={parts.frame} position={[0, 0.02, 0]} />
              <mesh geometry={parts.small} material={parts.bowlMat} position={[0, 0.07, 0]} />
            </group>
          )
        })}
        {/* 船の出入り口 */}
        {parts.ports.map((s, i) => {
          const p = onSphere(s.lat, s.lon, 1.002)
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.clone().normalize())
          return <mesh key={i} geometry={parts.port} material={parts.portMat} position={p} quaternion={q} />
        })}
      </group>
      <Html position={[0, RADIUS * 1.35, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(RADIO_MOON_ID)}>
          {radioMoonName()}
        </span>
      </Html>
    </group>
  )
}
