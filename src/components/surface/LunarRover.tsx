import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { type Terrain } from './terrain'
import { windFor } from './landerFx'
import type { SkyNow } from './skyNow'
import { lowMemory, useLevel } from '../../state/quality'
import { MAP_KEYS, shrinkTexture } from './shrinkTexture'
import { useLanding } from '../../state/landing'
import { roverRangeFor } from './wideGround'
import { BOARD_SEC, LRV_TOP, ROVER_RANGE, driveInput, roverFocus, roverInput, roverNow, roverPose, setRoverPhase, useRover } from '../../state/rover'
import { LRV_START, lrvTeleport, tickEva, useApolloEva } from '../../state/apolloEva'
import { APOLLO17 } from '../../data/apollo17'
import { WheelDust, meshHeight, drawnHeight, nearRocks, rockBodies } from './Rover'
import { WheelTracks } from './wheelTracks'
import { Sway } from './roverSway'
import { loadSuit, makeSuitRig } from './suitModel'
import type { Rig } from './astronaut'

// アポロ15〜17号の月面車 LRV（全長 3.1 m、4 輪、乗員 2 人）。模型は tools/blender/build_lrv.py で作った lrv.glb。
// アポロ17号の追体験の章7（state/apolloEva.ts）だけで出る。サーナン船長（左）とシュミット飛行士（右）が座っている。
// 与圧ローバー（CrewRover.tsx）と同じ作り：計器・ミニマップ・キー・轍・砂ぼこり・岩の当たり判定を共有する。

const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}`

/** 車輪の位置（前後, 左右）と半径。build_lrv.py の WHEEL_Y / WHEEL_X / WHEEL_R と同じ */
const WHEELS: [number, number][] = [
  [1.145, -0.915], [1.145, 0.915],
  [-1.145, -0.915], [-1.145, 0.915],
]
const WHEEL_R = 0.409
const WHEEL_NAMES = ['FL', 'FR', 'RL', 'RR']
/** 車輪が上下に動ける幅（m） */
const SUS_UP = 0.16
const SUS_DOWN = 0.14
const wheelD = new Float32Array(4)
/** これより高い岩にはぶつかって止まる（m） */
const BIG_ROCK = 0.4
/** 車体の半径（ぶつかる岩・着陸船との距離、m） */
const BODY_R = 1.5
/** 着陸船（下の段の脚の広がり 9.4 m）。真ん中からこの半径はぶつかる */
const LM = APOLLO17.find((h) => h.id === 'lm')!
const LM_R = 4.4
/** 座席の上の、腰の高さ（車の座標、m）と、左右の位置（左が船長） */
const SEAT_Y = 0.78
const SEAT_X = [-0.3, 0.3]
const SEAT_Z = 0.32
/** 船長の目（車の座標、three の向き：右 +x、上 +y、前 -z） */
// 座った宇宙服のヘルメットの中の高さ。高利得アンテナの皿（左前の柱の上、高さ約 1.7 m）が画面の上のほうに来て、前の地面が見える
const EYE = new THREE.Vector3(-0.3, 1.4, 0.12)
/** テレビカメラ（車の座標）。離陸を見送るときの目 */
export const TV_EYE = new THREE.Vector3(0.06, 1.35, -1.78)

type Drive = {
  x: number
  z: number
  y: number
  vy: number
  heading: number
  speed: number
  steer: number
  pitch: number
  roll: number
  spin: number
  grounded: boolean
  aLat: number
  hudT: number
  sway: Sway
}

const P = { cam: new THREE.Vector3(), look: new THREE.Vector3(), tmp: new THREE.Vector3(), wv: new THREE.Vector3(), q: new THREE.Quaternion() }

/** 月面車のいまの場所（離陸の場面で、テレビカメラの位置に使う） */
export const lrvPose = { on: false, x: 0, y: 0, z: 0, heading: 0, matrix: new THREE.Matrix4() }

/** 座った姿勢：ももを前へ、すねを下へ、腕はひざの上（船長は操縦かんへ） */
function seat(r: Rig, driver: boolean) {
  r.body.position.y = SEAT_Y
  for (let i = 0; i < 2; i++) {
    r.hips[i].rotation.x = -1.45
    r.knees[i].rotation.x = 1.35
    r.shoulders[i].rotation.x = -0.55
    r.shoulders[i].rotation.z = (i === 0 ? 1 : -1) * 0.18
    r.elbows[i].rotation.x = -0.9
  }
  if (driver) {
    // 右手（i=1）を真ん中の操縦かんへ
    r.shoulders[1].rotation.x = -0.75
    r.shoulders[1].rotation.z = 0.25
  }
  r.torso.rotation.x = -0.12
  r.update?.()
}

export function LunarRover({
  terrain,
  dustColor,
  sky,
  prepare,
}: {
  terrain: Terrain
  dustColor: string
  sky: SkyNow
  prepare: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial
}) {
  const { scene } = useGLTF(url('lrv.glb'))
  const group = useRef<THREE.Group>(null)
  const phase = useRover((r) => r.phase)
  const vehicle = useRover((r) => r.vehicle)
  const def = terrain.def
  const g = 9.8 * def.gravity

  const built = useMemo(() => {
    const model = scene.clone(true)
    const owned: { dispose: () => void }[] = []
    const mats = new Map<string, THREE.Material>()
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const src = mesh.material as THREE.MeshStandardMaterial
      if (!mats.has(src.uuid)) {
        const m = src.clone()
        m.envMapIntensity = 1.2
        if (lowMemory()) {
          for (const key of MAP_KEYS) {
            const tex = m[key]
            if (!tex) continue
            const small = shrinkTexture(tex, 1024)
            if (small) {
              m[key] = small
              owned.push(small)
            }
          }
        }
        prepare(m)
        owned.push(m)
        mats.set(src.uuid, m)
      }
      mesh.material = mats.get(src.uuid)!
    })
    const wheels = WHEEL_NAMES.map((n) => model.getObjectByName('Wheel_' + n)!)
    for (const w of wheels) w.rotation.order = 'YXZ'
    const restY = wheels.map((w) => w.position.y)
    const crew = new THREE.Group()
    return { model, wheels, restY, owned, crew }
  }, [scene, prepare])
  useEffect(() => () => built.owned.forEach((m) => m.dispose()), [built])

  // 座っている 2 人（宇宙服のモデルを読みこんでから）。船長は左、シュミット飛行士は右
  const rigs = useRef<Rig[]>([])
  useEffect(() => {
    let dead = false
    void loadSuit().then(async (src) => {
      if (!src || dead) return
      for (let i = 0; i < 2; i++) {
        const r = await makeSuitRig(src, false)
        if (!r || dead) return
        r.root.position.set(SEAT_X[i], 0, SEAT_Z)
        r.root.rotation.y = Math.PI
        seat(r, i === 0)
        built.crew.add(r.root)
        rigs.current.push(r)
      }
    })
    return () => {
      dead = true
      for (const r of rigs.current) built.crew.remove(r.root)
      rigs.current = []
    }
  }, [built])

  const level = useLevel()
  const dust = useMemo(
    () => new WheelDust(level === 'high' ? 700 : level === 'medium' ? 420 : 200, new THREE.Color(dustColor), false, def.gravity, windFor(def.id, false)),
    [dustColor, level, def],
  )
  useEffect(() => () => dust.dispose(), [dust])
  const tracks = useMemo(() => new WheelTracks(def.id, level, (x, z) => drawnHeight(terrain, x, z), 0.23), [def.id, level, terrain])
  useEffect(() => () => tracks.dispose(), [tracks])
  const dustBase = useMemo(() => new THREE.Color(dustColor), [dustColor])
  const staticBodies = useMemo(() => rockBodies(terrain), [terrain])
  const range = roverRangeFor(terrain, ROVER_RANGE)

  const st = useRef<Drive | null>(null)
  useEffect(() => () => void (lrvPose.on = false), [])
  useEffect(() => {
    st.current = {
      x: LRV_START.x,
      z: LRV_START.z,
      y: meshHeight(terrain, LRV_START.x, LRV_START.z),
      vy: 0,
      heading: LRV_START.heading,
      speed: 0,
      steer: 0,
      pitch: 0,
      roll: 0,
      spin: 0,
      grounded: true,
      aLat: 0,
      hudT: 9,
      sway: new Sway(),
    }
  }, [terrain])
  useEffect(() => {
    if (phase !== 'drop' || vehicle !== 'lrv' || !st.current) return
    Object.assign(st.current, { speed: 0, steer: 0, vy: 0 })
    st.current.sway.reset()
    tracks.lift()
    useRover.setState({ sites: [], taken: [], next: null, range })
  }, [phase, vehicle, range, tracks])

  const wheelH = useMemo(() => new Float32Array(4), [])
  const groundAt = (s: Drive, fx: number, fz: number) => {
    const sx = -fz
    const sz = fx
    for (let i = 0; i < 4; i++) {
      const [wf, sd] = WHEELS[i]
      const wx = s.x + fx * wf + sx * sd
      const wz = s.z + fz * wf + sz * sd
      let h = drawnHeight(terrain, wx, wz)
      for (const r of nearRocks(staticBodies, wx, wz)) {
        if (r.h >= BIG_ROCK) continue
        const R = r.r + WHEEL_R * 0.6
        const d = Math.hypot(wx - r.x, wz - r.z)
        if (d < R) h = Math.max(h, r.t - r.h * (d / R) ** 2)
      }
      wheelH[i] = h
    }
    return (wheelH[0] + wheelH[1] + wheelH[2] + wheelH[3]) / 4
  }

  useFrame((state, rawDt) => {
    const grp = group.current
    const s = st.current
    const { phase, since, view, vehicle } = useRover.getState()
    if (!grp || !s) return
    grp.visible = true
    const mine = phase !== 'none' && vehicle === 'lrv'
    const dt = Math.min(rawDt, 0.05)
    const T = roverNow() - since
    // 移動を飛ばす：そこへ置きなおす
    if (lrvTeleport.to) {
      const to = lrvTeleport.to
      lrvTeleport.to = null
      Object.assign(s, { x: to.x, z: to.z, heading: to.heading, speed: 0, steer: 0, vy: 0, y: meshHeight(terrain, to.x, to.z) })
      s.sway.reset()
      tracks.lift()
      state.camera.userData.roverCam = 0
    }
    const fwd = P.tmp.set(-Math.sin(s.heading), 0, -Math.cos(s.heading))
    const fx = fwd.x
    const fz = fwd.z
    const sideX = -fz
    const sideZ = fx
    const evaStep = useApolloEva.getState().step
    // 着いた場所・離陸の場面では止まっている
    const parked = evaStep === 'stop' || evaStep === 'sample' || evaStep === 'closeout' || evaStep === 'liftoff' || evaStep === 'done'

    if (!mine || phase !== 'drive' || parked) {
      s.speed *= parked ? 0.85 : 0
      s.steer *= 0.9
      s.aLat = 0
      s.y = groundAt(s, fx, fz)
      s.pitch = Math.atan2((wheelH[0] + wheelH[1]) / 2 - (wheelH[2] + wheelH[3]) / 2, 2.29)
      s.roll = Math.atan2((wheelH[1] + wheelH[3]) / 2 - (wheelH[0] + wheelH[2]) / 2, 1.83)
      s.grounded = true
      if (mine && phase === 'drop' && T >= BOARD_SEC) setRoverPhase('drive')
      if (parked && Math.abs(s.speed) > 0.05) {
        s.x += fx * s.speed * dt
        s.z += fz * s.speed * dt
      }
    } else {
      const inp = roverInput
      inp.jump = false
      inp.sample = false
      const di = driveInput(s.speed, dt)
      s.steer += (di.steer - s.steer) * Math.min(1, dt * 4)
      const battery = useRover.getState().battery
      const top = LRV_TOP * (battery > 0.02 ? 1 : 0.35)
      if (s.grounded) {
        const th = di.throttle
        if (th > 0) s.speed += (s.speed < 0 ? 3 : 1.1 * th * Math.max(0.1, 1 - s.speed / top)) * dt
        else if (th < 0) s.speed -= (s.speed > 0 ? 2.5 : 0.8) * dt
        else {
          const v = Math.abs(s.speed)
          s.speed -= Math.sign(s.speed) * Math.min(v, (0.3 + 0.1 * g + 0.12 * v) * dt)
        }
        s.speed -= g * Math.sin(s.pitch) * dt * 0.6
        s.speed = THREE.MathUtils.clamp(s.speed, -1.5, top)
        // 前と後ろの車輪を逆に切る：いちばん小さく回ると半径 3.1 m
        const R = 3.1 + Math.abs(s.speed) * 0.9
        const yaw = s.steer * (s.speed / R)
        s.heading -= yaw * dt
        s.aLat = s.speed * yaw
      } else s.aLat = 0
      // 電池（銀亜鉛電池 2 つ）：満タンで約 90 km。この章の道のりでは、ほとんど減らない
      const nb = THREE.MathUtils.clamp(battery - (Math.abs(s.speed) * dt) / 90000, 0, 1)
      if (Math.abs(nb - battery) > 0.002) useRover.setState({ battery: nb })
      else useRover.getState().battery = nb

      let nx = s.x + fx * s.speed * dt
      let nz = s.z + fz * s.speed * dt
      if (Math.abs(nx) > range || Math.abs(nz) > range) {
        nx = THREE.MathUtils.clamp(nx, -range, range)
        nz = THREE.MathUtils.clamp(nz, -range, range)
        s.speed *= 0.5
      }
      for (const r of [...nearRocks(staticBodies, nx, nz)]) {
        if (r.h < BIG_ROCK) continue
        const dx = nx - r.x
        const dz = nz - r.z
        const d = Math.hypot(dx, dz)
        const min = r.r + BODY_R * 0.7
        if (d < min && d > 1e-4) {
          nx = r.x + (dx / d) * min
          nz = r.z + (dz / d) * min
          s.speed *= 0.3
        }
      }
      {
        const dx = nx - LM.x
        const dz = nz - LM.z
        const d = Math.hypot(dx, dz)
        const min = LM_R + BODY_R
        if (d < min && d > 1e-4) {
          nx = LM.x + (dx / d) * min
          nz = LM.z + (dz / d) * min
          s.speed *= 0.5
        }
      }
      s.x = nx
      s.z = nz
      // 縦：軽い車なので、坂の頂上を速く越えると、月の弱い重力でふわっと浮く（本物の映像のように）
      const ground = groundAt(s, fx, fz)
      const wasAir = !s.grounded
      s.vy -= g * dt
      s.y += s.vy * dt
      if (s.y <= ground || (!wasAir && s.y - ground < 0.12)) {
        const impact = s.vy
        const rise = (ground - s.y) / Math.max(dt, 1e-3)
        s.y = ground
        s.vy = Math.max(0, Math.min(rise * 0.7, 2.2))
        if (wasAir && impact < -1) s.sway.kick(-impact * 0.05, 0)
        s.grounded = true
      } else s.grounded = false
      const hF = (wheelH[0] + wheelH[1]) / 2
      const hB = (wheelH[2] + wheelH[3]) / 2
      const hR = (wheelH[1] + wheelH[3]) / 2
      const hL = (wheelH[0] + wheelH[2]) / 2
      const k = Math.min(1, dt * (s.grounded ? 9 : 2))
      s.pitch += (Math.atan2(hF - hB, 2.29) - s.pitch) * k
      s.roll += (Math.atan2(hR - hL, 1.83) - s.roll) * k
      if (s.grounded) {
        for (const side of [0, 1] as const) {
          const sd = side === 0 ? -0.915 : 0.915
          tracks.touch(side, s.x + sideX * sd, s.z + sideZ * sd)
        }
      } else tracks.lift()
      // 砂ぼこり：網のタイヤが、後ろへ高く「にわとりのしっぽ」のように投げ上げる（泥よけがないと乗員にかかる）
      if (s.grounded && def.dust && Math.abs(s.speed) > 0.6) {
        const kk = Math.min(1, Math.abs(s.speed) / LRV_TOP)
        const n = Math.floor(dt * (level === 'low' ? 40 : 100) * kk + Math.random())
        for (let i = 0; i < n; i++) {
          const [wf, sd] = WHEELS[Math.floor(Math.random() * 4)]
          const px = s.x + fx * (wf - 0.3) + sideX * sd
          const pz = s.z + fz * (wf - 0.3) + sideZ * sd
          dust.puff(px, s.y, pz, -fx * s.speed * 0.45, 1.0 + kk * 2.2, -fz * s.speed * 0.45, 0.35 + kk * 0.5)
        }
      }
    }
    s.spin -= (s.speed * dt) / WHEEL_R
    // 計器
    s.hudT += dt
    if (mine && s.hudT > 1 / 12) {
      s.hudT = 0
      const deg = (v: number) => Math.round((v * 180) / Math.PI)
      useRover.setState({
        kmh: Math.round(Math.abs(s.speed) * 3.6),
        hud: {
          hdg: ((Math.round((-s.heading * 180) / Math.PI) % 360) + 360) % 360,
          pitch: deg(s.pitch),
          roll: deg(s.roll),
          dist: Math.round(Math.hypot(s.x - LM.x, s.z - LM.z)),
          air: !s.grounded,
          fuel: 1,
          x: Math.round(s.x * 10) / 10,
          z: Math.round(s.z * 10) / 10,
        },
      })
    }
    if (mine) s.sway.step(dt, s.speed, s.aLat, s.pitch, s.roll, s.grounded)

    // ---- 姿 ----
    grp.position.set(s.x, s.y, s.z)
    grp.rotation.set(s.pitch + s.sway.pitch * 0.6, s.heading, s.roll + s.sway.roll * 0.6, 'YXZ')
    grp.updateMatrixWorld(true)
    let lift = 0
    built.wheels.forEach((w, i) => {
      P.wv.set(w.position.x, built.restY[i], w.position.z)
      w.parent!.localToWorld(P.wv)
      const d = wheelH[i] + WHEEL_R - P.wv.y
      wheelD[i] = d
      if (d - SUS_UP > lift) lift = d - SUS_UP
    })
    if (lift > 0) grp.position.y += lift
    built.wheels.forEach((w, i) => {
      w.position.y = built.restY[i] + Math.max(-SUS_DOWN, Math.min(SUS_UP, wheelD[i] - lift))
      w.rotation.x = s.spin
      w.rotation.y = i < 2 ? -s.steer * 0.35 : s.steer * 0.35
    })
    grp.updateMatrixWorld(true)
    Object.assign(lrvPose, { on: true, x: s.x, y: s.y, z: s.z, heading: s.heading })
    lrvPose.matrix.copy(grp.matrixWorld)
    if (mine) roverFocus.set(s.x, s.y, s.z)
    if (mine) Object.assign(roverPose, { x: s.x, y: s.y, z: s.z, heading: s.heading, speed: s.speed, slip: 0, grounded: s.grounded, pitch: s.pitch, roll: s.roll })
    if (mine) tickEva()

    // ---- 砂ぼこり・轍 ----
    const cam = state.camera as THREE.PerspectiveCamera
    dust.material.uniforms.uScale.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360))
    dust.update(dt)
    tracks.update(dt, sky.sunDir)
    const lit = Math.max(0.15, Math.min(1, sky.sunDir.y * 3 + 0.2))
    dust.material.uniforms.uColor.value.copy(dustBase).multiplyScalar(lit * 0.95)
    dust.material.uniforms.uShadow.value.copy(dustBase).multiplyScalar(lit * 0.4 + 0.04)
    dust.material.uniforms.uSunView.value.copy(sky.sunDir).transformDirection(cam.matrixWorldInverse)

    // ---- カメラ（離陸の場面は LunarModule が受け持つ） ----
    const seatView = mine && phase === 'drive' && view === 'cam' && evaStep !== 'liftoff' && evaStep !== 'done'
    // 船長の目のときは、船長の体はかくす（ヘルメットの中から見ているので）
    // 離陸のときは 2 人とも着陸船の中（月面車には誰も乗っていない）
    const aboard = evaStep !== 'liftoff' && evaStep !== 'done'
    if (rigs.current[0]) rigs.current[0].root.visible = !seatView && aboard
    if (rigs.current[1]) rigs.current[1].root.visible = aboard
    if (!mine || useLanding.getState().phase !== 'surface' || evaStep === 'liftoff' || evaStep === 'done') return
    const camPos = P.cam
    const look = P.look
    if (seatView) {
      camPos.copy(EYE)
      grp.localToWorld(camPos)
      grp.getWorldQuaternion(P.q)
      cam.position.copy(camPos)
      cam.quaternion.copy(P.q)
      cam.rotateX(-0.14)
      if (cam.fov !== 72) {
        cam.fov = 72
        cam.updateProjectionMatrix()
      }
      return
    }
    const kc = 1 - Math.exp(-dt * 4)
    if (parked) {
      // 着いた場所：ゆっくり回りこむ
      const a = s.heading + Math.PI * 0.75 + (roverNow() - since) * 0.03
      camPos.set(s.x - Math.sin(a) * 7.5, s.y + 2.6, s.z - Math.cos(a) * 7.5)
      look.set(s.x, s.y + 0.9, s.z)
    } else if (phase === 'drive') {
      const v = Math.min(1, Math.abs(s.speed) / LRV_TOP)
      const back = 7 + v * 2
      camPos.set(s.x - fx * back, s.y + 2.8 - v * 0.3, s.z - fz * back)
      look.set(s.x + fx * 2, s.y + 1.0, s.z + fz * 2)
    } else {
      // 乗りこむ：ななめ前から
      const u = Math.min(1, T / BOARD_SEC)
      const a = s.heading + 0.9 - u * 0.5
      const dist = 8 - u * 1.5
      camPos.set(s.x - Math.sin(a) * dist, s.y + 2.2, s.z - Math.cos(a) * dist)
      look.set(s.x, s.y + 1.0, s.z)
    }
    const minY = meshHeight(terrain, camPos.x, camPos.z) + 0.6
    if (camPos.y < minY) camPos.y = minY
    const first = (cam.userData.roverCam ?? 0) < roverNow() - 0.5
    cam.userData.roverCam = roverNow()
    if (first) cam.position.copy(camPos)
    else cam.position.lerp(camPos, kc)
    cam.lookAt(look)
    const fov = 55
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * kc
      cam.updateProjectionMatrix()
    }
  })

  return (
    <>
      <group ref={group} visible={false} name="surface-lrv">
        <primitive object={built.model} />
        <primitive object={built.crew} />
      </group>
      <primitive object={tracks.mesh} />
      <primitive object={dust.points} />
    </>
  )
}
