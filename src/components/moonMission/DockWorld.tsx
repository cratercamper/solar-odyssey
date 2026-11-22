import { useEffect, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { loadCatalog } from '../Sky'
import { currentLevel, lowMemory } from '../../state/quality'
import { useMoonMission } from '../../state/moonMission'
import {
  CSM_START_Y,
  DROGUE_Y,
  DROGUE_Z,
  EJECT_AT,
  HASSELBLAD_FOV,
  KACHUNK_AT,
  LM_Y,
  PROBE,
  dock,
  dockGet,
  earthDistance,
  earthDrift,
  photoTaken,
  tickDock,
  useMoonDock,
} from '../../state/moonDock'
import { earthMaterial, atmosphereMaterial } from './earth'
import { s4bAft, skinParts } from './rocketSkin'
import { glowTexture } from './plume'
import { setLegs, useCraft, type Craft } from './craft'

// 章3（ドッキング）と章4（青い地球）の世界：第3段（S-IVB、saturn.glb の S3）・アダプタの板 4 枚・着陸船と司令船（apollo.glb）・地球。
// 座標は第3段のてっぺんが原点、+Y が第3段の前（state/moonDock.ts）。地球はほんとうの大きさと距離（数万 km 先）。

const base = import.meta.env.BASE_URL
const ROCKET_URL = `${base}models/saturn.glb`
const EARTH_R = 6_371_000
/** 宇宙船から地球への向き（地球は、第3段の横うしろ・少し下に見える） */
const EARTH_DIR = new THREE.Vector3(0.15, -0.2, -1).normalize()
/** 太陽の向き：宇宙船のうしろ（地球が満月のようにまるく光って見える）。少し東から */
const SUN_DIR = new THREE.Vector3(0.28, 0.32, 1).normalize()
/** 宇宙船に向いている地球の点（緯度・経度）：アフリカ南部の東、本物の写真と同じあたり */
const FACE_LAT = -22
const FACE_LON = 36
/** 司令船の照準（COAS）：左のランデブー窓。司令船の中の位置（先端が原点、機首が +Y） */
const COAS = new THREE.Vector3(0.75, -0.6, 0)
/** 着陸船の的：口の横、照準と同じだけずらした所（着陸船の中の位置。高さは上の面） */
const TARGET = new THREE.Vector3(COAS.x, DROGUE_Y, DROGUE_Z)
/** アダプタ（SLA）：第3段のてっぺん（半径 3.30）から機械船の下（半径 1.96）まで 8.5 m。下の 2.1 m は残る */
const SLA_H = 8.5
const SLA_FIX = 2.1
const slaR = (y: number) => 3.3 - (1.34 * y) / SLA_H
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)

const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _u = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _e2 = new THREE.Vector3()

/** 地球の向き：決めた緯度・経度の点が宇宙船を向き、北がおおむね上 */
function earthQuaternion() {
  const la = THREE.MathUtils.degToRad(FACE_LAT)
  const lo = THREE.MathUtils.degToRad(FACE_LON)
  // three の球の地図：経度 0 が +X、東経 90° が -Z、北が +Y
  const d = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo))
  const q = new THREE.Quaternion().setFromUnitVectors(d, EARTH_DIR.clone().negate())
  // 北（地軸）が画面の上を向くように、宇宙船から見た向きのまわりに回す
  const n = new THREE.Vector3(0, 1, 0).applyQuaternion(q).projectOnPlane(EARTH_DIR).normalize()
  const up = new THREE.Vector3(0, 1, 0).projectOnPlane(EARTH_DIR).normalize()
  const ang = Math.atan2(new THREE.Vector3().crossVectors(n, up).dot(EARTH_DIR), n.dot(up))
  return new THREE.Quaternion().setFromAxisAngle(EARTH_DIR, ang).multiply(q)
}

// ---- 光と空 -----------------------------------------------------------------------------------

function Lights() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.22
    return () => {
      if (scene.environment === env) scene.environment = null
      env.dispose()
      pmrem.dispose()
      room.dispose()
    }
  }, [gl, scene])
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff6ea', 4.2)
    const t = new THREE.Object3D()
    l.target = t
    return { l, t }
  }, [])
  useFrame(() => {
    light.t.position.copy(camera.position)
    light.t.updateMatrixWorld()
    light.l.position.copy(camera.position).addScaledVector(SUN_DIR, 1000)
  })
  return (
    <>
      <primitive object={light.l} />
      <primitive object={light.t} />
      {/* 地球の照り返し（地球の側から、青白く） */}
      <hemisphereLight args={['#06080c', '#2c3a55', 0.35]} />
    </>
  )
}

function Sky() {
  const camera = useThree((s) => s.camera)
  const small = lowMemory()
  // 打ち上げの場面と同じ地図（NASA Blue Marble の 12 月）と、光の散乱で描く大気
  const big = !small && currentLevel() !== 'low'
  const steps = small || currentLevel() === 'low' ? 8 : currentLevel() === 'medium' ? 12 : 16
  const [day, night, clouds, water] = useTexture([
    big ? `${base}textures/earth/bm_dec_8k.jpg` : `${base}textures/${small ? '2k' : '4k'}_earth_daymap.jpg`,
    `${base}textures/2k_earth_nightmap.jpg`,
    `${base}textures/${small ? '2k' : '4k'}_earth_clouds.jpg`,
    `${base}textures/earth/bm_water_4k.png`,
  ])
  const [stars, setStars] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    let alive = true
    loadCatalog().then((g) => alive && setStars(g), () => {})
    return () => {
      alive = false
    }
  }, [])
  const mats = useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace
    night.colorSpace = THREE.SRGBColorSpace
    day.anisotropy = 4
    const earth = earthMaterial(day, night, clouds, { scatter: true, steps, water })
    earth.uniforms.uSun.value.copy(SUN_DIR)
    earth.uniforms.uLights.value = 0.6
    earth.uniforms.uR.value = EARTH_R
    const atmo = atmosphereMaterial({ scatter: true, steps })
    atmo.uniforms.uSun.value.copy(SUN_DIR)
    atmo.uniforms.uR.value = EARTH_R
    atmo.uniforms.uSky.value = 1
    const star = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float mag;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          // 地球と宇宙船が明るいので、目（カメラ）は暗い星をとらえにくい
          float flux = pow(10.0, -0.4 * (mag - 1.0) * 0.6);
          vColor = color * min(flux * 0.9, 2.0);
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
          gl_Position.z = gl_Position.w * 0.999999;
          gl_PointSize = clamp(1.2 + 1.3 * sqrt(flux), 1.2, 4.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          gl_FragColor = vec4(vColor * exp(-r * r * 3.0), 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    return { earth, atmo, star }
  }, [day, night, clouds, water, steps])
  useEffect(
    () => () => {
      mats.earth.dispose()
      mats.atmo.dispose()
      mats.star.dispose()
    },
    [mats],
  )
  const earth = useMemo(() => {
    const g = new THREE.Group()
    g.name = 'dock-earth'
    g.quaternion.copy(earthQuaternion())
    const ball = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 96, 64), mats.earth)
    const air = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R + 100_000, 64, 40), mats.atmo)
    g.add(ball, air)
    return g
  }, [mats])
  useEffect(
    () => () =>
      earth.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) m.geometry.dispose()
      }),
    [earth],
  )
  const starPts = useMemo(() => (stars ? new THREE.Points(stars, mats.star) : null), [stars, mats])
  useFrame(() => {
    // 地球の距離：本物の経過時間から（数万 km。帯の数字と同じ）
    earth.position.copy(EARTH_DIR).multiplyScalar(earthDistance(dockGet()))
    mats.earth.uniforms.uCenter.value.copy(earth.position)
    mats.atmo.uniforms.uCenter.value.copy(earth.position)
    if (starPts) starPts.position.copy(camera.position)
  })
  return (
    <>
      <primitive object={earth} />
      {starPts && <primitive object={starPts} scale={1000} renderOrder={-3} frustumCulled={false} />}
    </>
  )
}

// ---- 第3段とアダプタ --------------------------------------------------------------------------

type Panel = { pivot: THREE.Group; mid: number; axis: THREE.Vector3; out: THREE.Vector3; spin: THREE.Vector3 }

function useStage() {
  const rocket = useGLTF(ROCKET_URL)
  return useMemo(() => {
    const owned: { dispose: () => void }[] = []
    const stage = new THREE.Group()
    stage.name = 'sivb'
    const s3 = rocket.scene.getObjectByName('S3')?.clone(true)
    if (s3) {
      // 第2段とつなぐ下のスカート（広がった部分、70 m より下）は第2段といっしょに捨てたので描かない。
      // 外板の細かさ（継ぎ目・リベット・筋）と照りは、打ち上げの場面と同じ（rocketSkin.ts）
      const skin = skinParts([s3], { keep: [70, 1e9], surface: true })
      for (const m of skin.made) (m as THREE.MeshStandardMaterial).envMapIntensity = 0.5
      owned.push(skin)
      // 第3段のうしろ：J-2 エンジン・支える梁・ヘリウムの球・タンクの底（展示の実機の写真に合わせた形）
      const aft = s4bAft()
      s3.add(aft.engine)
      owned.push(aft)
      s3.position.y = -85.6
      stage.add(s3)
    }

    // アダプタ：外は白、内がわは銀（アルミのハニカム）
    const white = new THREE.MeshStandardMaterial({ color: '#d9d9d4', roughness: 0.75, metalness: 0.05, side: THREE.FrontSide })
    const inner = new THREE.MeshStandardMaterial({ color: '#9ea3a8', roughness: 0.4, metalness: 0.7, side: THREE.BackSide })
    owned.push(white, inner)
    const prof = (y0: number, y1: number) => [new THREE.Vector2(slaR(y0), y0), new THREE.Vector2(slaR(y1), y1)]
    const fixed = new THREE.Group()
    const fixedGeo = new THREE.LatheGeometry(prof(0, SLA_FIX), 64)
    owned.push(fixedGeo)
    fixed.add(new THREE.Mesh(fixedGeo, white), new THREE.Mesh(fixedGeo, inner))
    stage.add(fixed)
    // 4 枚の板：下の端のちょうつがいで外へ開き、はずれて飛んでいく
    const panels: Panel[] = []
    for (let i = 0; i < 4; i++) {
      const start = i * (Math.PI / 2) + Math.PI / 4
      const mid = start + Math.PI / 4
      const g = new THREE.LatheGeometry(prof(SLA_FIX, SLA_H), 18, start, Math.PI / 2)
      owned.push(g)
      const rb = slaR(SLA_FIX)
      const hinge = new THREE.Vector3(rb * Math.sin(mid), SLA_FIX, rb * Math.cos(mid))
      const pivot = new THREE.Group()
      pivot.position.copy(hinge)
      const a = new THREE.Mesh(g, white)
      const b = new THREE.Mesh(g, inner)
      a.position.copy(hinge).negate()
      b.position.copy(hinge).negate()
      a.castShadow = true
      pivot.add(a, b)
      stage.add(pivot)
      const out = new THREE.Vector3(Math.sin(mid), 0, Math.cos(mid))
      panels.push({
        pivot,
        mid,
        axis: new THREE.Vector3(Math.cos(mid), 0, -Math.sin(mid)),
        out,
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      })
    }
    return { stage, panels, owned }
  }, [rocket])
}

// ---- 着陸船の的 -------------------------------------------------------------------------------

function useTarget() {
  return useMemo(() => {
    const g = new THREE.Group()
    g.name = 'dock-target'
    const black = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.8 })
    const white = new THREE.MeshBasicMaterial({ color: '#f4f4f0', toneMapped: false })
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 32), black)
    disc.position.y = 0.03
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 6, 40), white)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.045
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.33, 8), black)
    post.position.y = 0.2
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.025), white)
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, 0.2), white)
    h.position.y = v.position.y = 0.37
    g.add(disc, ring, post, h, v)
    g.position.copy(TARGET)
    return g
  }, [])
}

// ---- 場面 -------------------------------------------------------------------------------------

/** 司令船の位置と向き（第3段の座標） */
function csmPose(craft: Craft) {
  const s = useMoonDock.getState()
  const step = s.step
  const t = dock.t
  const csm = craft.csm
  const endY = LM_Y + DROGUE_Y + PROBE + 17 + 8
  if (step === 'sep') {
    // まっすぐ前へ離れる（ゆっくり加速して、すべる）
    const k = Math.min(1, t / 7)
    csm.position.set(0, CSM_START_Y + (endY - CSM_START_Y) * (k * k * (3 - 2 * k)), 0)
    csm.quaternion.identity()
    return
  }
  if (step === 'turn') {
    // 機械船のまんなかあたりを軸に、180° 回る。横のずれもすこしずつ
    const k = THREE.MathUtils.smootherstep(t / 7, 0, 1)
    _q.setFromAxisAngle(_v.set(1, 0, 0), Math.PI * k)
    const off = _w.set(0, 4, 0).applyQuaternion(_q)
    csm.position.set(0.9 * k, endY - 4, DROGUE_Z * k + 0.55 * k).add(off)
    csm.quaternion.copy(_q)
    return
  }
  // 近づく・つないだ・引き出す：先端が着陸船の口の上（gap の所）
  csm.quaternion.copy(FLIP)
  const docked = step !== 'approach'
  csm.position.set(docked ? 0 : dock.x, LM_Y + DROGUE_Y + PROBE + dock.gap + dock.out, DROGUE_Z - (docked ? 0 : dock.y))
}

function Scene() {
  const craft = useCraft()
  const stage = useStage()
  const target = useTarget()
  useEffect(() => () => stage.owned.forEach((o) => o.dispose()), [stage])
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  const rig = useMemo(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false, step: '' }), [])
  const glow = useMemo(() => {
    const m = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(7, 6.6, 6), depthWrite: false, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending })
    return new THREE.Sprite(m)
  }, [])
  useEffect(
    () => () => {
      glow.material.map?.dispose()
      glow.material.dispose()
    },
    [glow],
  )
  // 着陸船は第3段の中：脚はたたんだまま
  useEffect(() => {
    setLegs(craft, 0)
    craft.lm.position.set(0, LM_Y, 0)
    craft.lm.add(target)
    return () => {
      craft.lm.remove(target)
    }
  }, [craft, target])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    tickDock(dt)
    const ms = useMoonMission.getState()
    const marble = ms.phase === 'marble'
    const s = useMoonDock.getState()
    const step = s.step
    const t = dock.t

    // ---- 動き ----
    csmPose(craft)
    // 着陸船：つないだあとは司令船といっしょに第3段から出ていく
    craft.lm.position.set(0, LM_Y + (step === 'eject' || step === 'evade' || step === 'dockEnd' || marble ? dock.out : 0), 0)
    // 第3段：離れたあとは、ゆっくり向きを変えて遠ざかる
    const away = step === 'evade' || step === 'dockEnd' ? dock.t : 0
    stage.stage.visible = !marble
    stage.stage.position.set(-away * 0.5, -away * away * 0.35, 0)
    stage.stage.rotation.set(0, 0, away * 0.03)
    // アダプタの板
    const sepT = step === 'sep' ? t : 99
    for (const p of stage.panels) {
      p.pivot.visible = sepT < 30 && !marble
      if (!p.pivot.visible) continue
      const open = Math.min(1, sepT / 0.9)
      const free = Math.max(0, sepT - 0.9)
      const rb = slaR(SLA_FIX)
      p.pivot.position.set(rb * Math.sin(p.mid), SLA_FIX, rb * Math.cos(p.mid)).addScaledVector(p.out, free * 3.2).addScaledVector(_v.set(0, 1, 0), free * 1.4)
      p.pivot.quaternion.setFromAxisAngle(p.axis, open * 0.75 + free * 0.5).premultiply(_q.setFromAxisAngle(p.spin, free * 0.3))
    }
    target.visible = !marble || ms.cam !== 'window'

    // ---- カメラ ----
    const cam = ms.cam
    const lmTop = _u.set(0, LM_Y + DROGUE_Y + (marble ? dock.out : 0), 0)
    const want = _v
    const look = _w
    let fov = 40
    let snap = false
    let up: THREE.Vector3 | null = null
    craft.csm.visible = true
    if (marble && cam === 'window') {
      // ハッセルブラッド：窓から地球へ。四角（画面の短い辺の 8 割）がちょうど 38.6° になる画角
      const d = earthDrift(dock.drift)
      const yaw = THREE.MathUtils.degToRad(dock.aimYaw + d.yaw)
      const pitch = THREE.MathUtils.degToRad(dock.aimPitch + d.pitch)
      want.copy(lmTop).add(_e2.set(2.2, 3.0, 0))
      const fwd = EARTH_DIR.clone()
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
      const upv = new THREE.Vector3().crossVectors(right, fwd).normalize()
      fwd.applyAxisAngle(upv, -yaw)
      right.applyAxisAngle(upv, -yaw)
      fwd.applyAxisAngle(right, pitch)
      upv.applyAxisAngle(right, pitch)
      look.copy(want).add(fwd)
      up = upv
      const half = Math.tan(THREE.MathUtils.degToRad(HASSELBLAD_FOV / 2))
      const box = 0.8 * Math.min(size.width, size.height)
      fov = THREE.MathUtils.radToDeg(2 * Math.atan((half * size.height) / box))
      snap = true
      craft.csm.visible = false
      craft.lm.visible = false
    } else if (marble) {
      craft.lm.visible = true
      // 外から：つないだ 2 つの船と、うしろの地球
      want.copy(lmTop).add(_e2.set(19, 4, 34))
      look.copy(lmTop).add(_e2.set(0, 3, 0)).addScaledVector(EARTH_DIR, 4)
      fov = cam === 'wide' ? 60 : 45
    } else if (cam === 'window' && (step === 'approach' || step === 'capture' || step === 'latch' || step === 'eject')) {
      // 照準（COAS）：司令船の左の窓から、機首の向きにまっすぐ
      craft.lm.visible = true
      want.copy(COAS).applyQuaternion(craft.csm.quaternion).add(craft.csm.position)
      look.copy(want).add(_e2.set(0, -1, 0))
      up = new THREE.Vector3(0, 0, -1)
      fov = 34
      snap = true
      craft.csm.visible = false
    } else {
      craft.lm.visible = true
      const csmY = craft.csm.position.y
      const mid = (lmTop.y + csmY) / 2
      if (cam === 'wide') {
        want.set(46, mid + 14, 64)
        look.set(0, mid, 0)
        fov = 42
      } else if (step === 'sep' || step === 'turn') {
        // 離れていく司令船と、第3段の上の着陸船がいっしょに入るように
        const span = Math.max(14, csmY - lmTop.y + 8)
        look.set(0, (lmTop.y - 4 + csmY) / 2, 0)
        want.set(span * 0.62, look.y + span * 0.18, span * 1.05)
      } else if (step === 'approach') {
        const span = Math.max(8, csmY - lmTop.y + 4)
        look.set(0, mid, 0)
        want.set(span * 0.55, mid + 2, span * 0.85)
        fov = 44
      } else if (step === 'capture' || step === 'latch') {
        want.set(5.5, lmTop.y + 1.5, 8)
        look.set(0, lmTop.y + 0.6, 0)
        fov = 42
      } else {
        // 引き出し・第3段とお別れ：つないだ船について行く
        // 着陸船の口（つなぎ目）を中心に、上の司令船と下の第3段が入る広さ。離れるほど引く
        const back = 1 + Math.min(1.2, away * 0.12)
        look.set(0, lmTop.y - 1 - Math.min(5, away * 0.6), 0)
        want.set(17 * back, lmTop.y + 5, 30 * back)
        fov = 46
      }
    }
    // ガチャン：留め金が閉まった瞬間、画面がゆれる
    if (step === 'latch' && t > KACHUNK_AT && t < KACHUNK_AT + 0.6) {
      const k = (KACHUNK_AT + 0.6 - t) * 0.06
      want.x += (Math.random() - 0.5) * k
      want.y += (Math.random() - 0.5) * k
    }
    if (step === 'eject' && t > EJECT_AT && t < EJECT_AT + 0.4) want.y += (Math.random() - 0.5) * 0.05
    // カメラを切りかえたとき・窓からのときは、すぐその場所へ。同じカメラのあいだは、なめらかに追う
    if (!rig.init || snap || rig.step !== cam) {
      rig.pos.copy(want)
      rig.look.copy(look)
      rig.init = true
      rig.step = cam
    }
    if (!snap) {
      const k = 1 - Math.exp(-dt * 3)
      rig.pos.lerp(want, k)
      rig.look.lerp(look, k)
    }
    camera.position.copy(rig.pos)
    camera.up.copy(up ?? _e2.set(0, 1, 0))
    camera.lookAt(rig.look)
    camera.near = snap && !marble ? 0.05 : 0.3
    if (Math.abs(camera.fov - fov) > 0.01) camera.fov += (fov - camera.fov) * (snap ? 1 : Math.min(1, dt * 3))
    camera.updateProjectionMatrix()
    glow.position.copy(camera.position).addScaledVector(SUN_DIR, 4e9)
    glow.scale.setScalar(4e9 * 0.03)

    // ---- 写真 ----
    if (dock.shoot && marble) {
      dock.shoot = false
      gl.render(scene, camera)
      const src = gl.domElement
      const box = Math.round(0.8 * Math.min(src.width, src.height))
      const c = document.createElement('canvas')
      c.width = c.height = Math.min(720, box)
      const g2 = c.getContext('2d')
      let url = ''
      if (g2) {
        g2.drawImage(src, (src.width - box) / 2, (src.height - box) / 2, box, box, 0, 0, c.width, c.height)
        try {
          url = c.toDataURL('image/jpeg', 0.86)
        } catch {
          url = ''
        }
      }
      const d = earthDrift(dock.drift)
      const yaw = dock.aimYaw + d.yaw
      const pitch = dock.aimPitch + d.pitch
      const rho = THREE.MathUtils.radToDeg(Math.asin(EARTH_R / earthDistance(dockGet())))
      const half = HASSELBLAD_FOV / 2
      const cut = Math.abs(yaw) + rho > half || Math.abs(pitch) + rho > half
      photoTaken(url, Math.hypot(yaw, pitch), cut)
    }
  })

  return (
    <>
      <primitive object={stage.stage} />
      <primitive object={craft.lm} />
      <primitive object={craft.csm} />
      <primitive object={glow} />
    </>
  )
}

export function DockWorld() {
  return (
    <>
      <Lights />
      <Sky />
      <Scene />
    </>
  )
}
