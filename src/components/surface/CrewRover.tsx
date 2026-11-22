import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { LANDER_POS, type Terrain } from './terrain'
import { windFor } from './landerFx'
import type { SkyNow } from './skyNow'
import { lowMemory, useLevel } from '../../state/quality'
import { MAP_KEYS, shrinkTexture } from './shrinkTexture'
import { useLanding } from '../../state/landing'
import { isWide, roverRangeFor, wideNow } from './wideGround'
import { BOARD_SEC, CREW_TOP, ROVER_RANGE, driveInput, roverFocus, roverInput, roverNow, roverPose, setRoverPhase, useRover, crewPose } from '../../state/rover'
import { WheelDust, meshHeight, drawnHeight, nearRocks, rockBodies } from './Rover'
import { WheelTracks } from './wheelTracks'
import { Sway } from './roverSway'

// 人が乗る与圧ローバー PR-2「ミチカケ」（全長 6 m、6 輪）。模型は tools/blender/build_crew_rover.py で作った rover-crew.glb。
// アルテミス計画で日本が開発している有人与圧ローバー（中では宇宙服なしで暮らせる月面の車）を参考にした、オリジナルのデザイン。
// 実在の計画と同じように、宇宙飛行士より先に月へ届いていて、着陸船のそばに止まっている。乗りこんで走る。
// 無人ローバー（Rover.tsx）と、計器・ミニマップ・キー・轍・砂ぼこり・岩の当たり判定を共有する。ジャンプと採集はない。

const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}`

/** 車輪の位置（前後, 左右）と半径。build_crew_rover.py の WHEEL_Y / WHEEL_X / WHEEL_R と同じ */
const WHEELS: [number, number][] = [
  [2.05, -1.95], [2.05, 1.95],
  [0, -1.95], [0, 1.95],
  [-2.05, -1.95], [-2.05, 1.95],
]
const WHEEL_R = 0.62
/** 車輪が上下に動ける幅（m）：縮み・伸び */
const SUS_UP = 0.35
const SUS_DOWN = 0.3
const wheelD = new Float32Array(6)
const WHEEL_NAMES = ['FL', 'FR', 'ML', 'MR', 'RL', 'RR']
/** これより高い岩にはぶつかって止まる（m）。大きな車輪なので、低い岩はそのまま乗りこえる（車体がゆれる） */
const BIG_ROCK = 0.9
/** 車体の半径（ぶつかる岩・着陸船の脚との距離、m） */
const BODY_R = 2.6
/** 着陸船の脚（模型の座標）。脚のまわり 1.6 m ＋ 車体の半径はぶつかる */
const FEET = [[4.5, -5.7], [-4.5, -5.7], [4.5, 5.9], [-4.5, 5.9]]
/** 停めてある場所：着陸船の中心から、走り出す向き（無人ローバーが走り出す向き）へ PARK_FWD、右へ PARK_SIDE（m）。
 * 着陸船の翼の外で、無人ローバーの走り出す道もふさがない */
const PARK_FWD = 19
const PARK_SIDE = 9
/** 運転席の目の位置（車の座標、three の向き：右 +x、上 +y、前 -z） */
const EYE = new THREE.Vector3(-0.55, 2.62, -0.9)

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
  edgeT: number
  sway: Sway
}

const P = { cam: new THREE.Vector3(), look: new THREE.Vector3(), tmp: new THREE.Vector3(), wv: new THREE.Vector3(), q: new THREE.Quaternion() }

/** 停めてある場所と向き（着陸船の向きから） */
export function crewPark(landerYaw: number) {
  const heading = landerYaw + Math.PI / 2
  const fx = -Math.sin(heading)
  const fz = -Math.cos(heading)
  return { x: LANDER_POS.x - fz * PARK_SIDE + fx * PARK_FWD, z: LANDER_POS.y + fx * PARK_SIDE + fz * PARK_FWD, heading }
}

/** 角の丸い四角（Shape・穴に使う）。中心 (cx, cy)、幅 w、高さ h、角の半径 r */
function roundRect(path: THREE.Path, cx: number, cy: number, w: number, h: number, r: number) {
  const x0 = cx - w / 2
  const y0 = cy - h / 2
  path.moveTo(x0 + r, y0)
  path.lineTo(x0 + w - r, y0)
  path.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r)
  path.lineTo(x0 + w, y0 + h - r)
  path.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h)
  path.lineTo(x0 + r, y0 + h)
  path.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r)
  path.lineTo(x0, y0 + r)
  path.quadraticCurveTo(x0, y0, x0 + r, y0)
  return path
}

/** 運転席から見たときの、車の中（窓の枠・計器盤・天井・横の壁・室内灯）。外の模型はかくして、これだけを見せる */
function buildCockpit() {
  const g = new THREE.Group()
  const owned: { dispose: () => void }[] = []
  // 車の中は日なたの外より暗い。外の太陽の光が壁の外側から当たらないよう、光を受けない色だけの材質にする
  const wall = new THREE.MeshBasicMaterial({ color: '#40444b', side: THREE.DoubleSide })
  const frameMat = new THREE.MeshBasicMaterial({ color: '#25282d', side: THREE.DoubleSide })
  const trim = new THREE.MeshBasicMaterial({ color: '#33373d', side: THREE.DoubleSide })
  const dash = new THREE.MeshBasicMaterial({ color: '#1c1e22', side: THREE.DoubleSide })
  const screen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.55, 0.85), toneMapped: false })
  const screen2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.42, 0.3), toneMapped: false })
  const amber = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.75, 0.2), toneMapped: false })
  const ceil = new THREE.MeshBasicMaterial({ color: '#fff4e0' })
  owned.push(frameMat, wall, trim, dash, screen, screen2, amber, ceil)
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.set(rx, ry, rz, 'YXZ')
    g.add(m)
    owned.push(geo)
    return m
  }
  // 前の窓の面：下の縁 (y 2.25, z -2.55) → 上の縁 (y 3.28, z -1.55)。運転席のほうへ寝ている
  const lean = Math.atan2(1.0, 1.03)
  const len = Math.hypot(1.0, 1.03)
  // 窓の枠：大きな板に、角の丸い窓の穴 2 つ（外の模型の窓と同じ大きさ）
  const frame = new THREE.Shape()
  roundRect(frame, 0, 0, 2.75, len + 0.16, 0.2)
  for (const sx of [-1, 1]) frame.holes.push(roundRect(new THREE.Path(), sx * 0.6, 0.0, 1.08, 1.16, 0.16))
  add(new THREE.ShapeGeometry(frame, 6), frameMat, 0, (2.25 + 3.28) / 2, -(2.55 + 1.55) / 2 + 0.06, lean)
  // 横の壁：窓の穴 2 つずつ。Shape の x を前へ（y 軸まわりに回す）
  for (const sx of [-1, 1]) {
    const side = new THREE.Shape()
    side.moveTo(-2.4, 1.05)
    side.lineTo(2.55, 1.05)
    side.lineTo(2.55, 2.25)
    side.lineTo(1.55, 3.28)
    side.lineTo(-2.4, 3.28)
    side.closePath()
    for (const c of [1.45, 0.55]) side.holes.push(roundRect(new THREE.Path(), c, 2.55, 0.6, 0.48, 0.1))
    add(new THREE.ShapeGeometry(side, 4), wall, sx * 1.36, 0, 0, 0, Math.PI / 2)
  }
  // 天井（前は窓の上の縁まで）と、天井の灯
  add(new THREE.PlaneGeometry(2.8, 4.0), wall, 0, 3.26, 0.45, Math.PI / 2)
  add(new THREE.PlaneGeometry(1.6, 0.12), ceil, 0, 3.24, -0.6, Math.PI / 2)
  // 計器盤：窓の下の縁にそって低く。画面 3 枚と小さな灯（運転席のほうへ起こしてある）
  add(new THREE.BoxGeometry(2.6, 0.08, 0.7), dash, 0, 2.08, -2.15, -0.12)
  add(new THREE.BoxGeometry(2.6, 0.5, 0.05), dash, 0, 1.8, -1.82)
  add(new THREE.PlaneGeometry(0.3, 0.17), screen, -0.62, 2.17, -1.92, -0.75)
  add(new THREE.PlaneGeometry(0.3, 0.17), screen2, -0.22, 2.17, -1.95, -0.75, -0.12)
  add(new THREE.PlaneGeometry(0.24, 0.14), screen, 0.35, 2.15, -1.98, -0.75, -0.25)
  for (let i = 0; i < 6; i++) add(new THREE.PlaneGeometry(0.025, 0.025), i % 3 ? amber : screen, -1.0 + i * 0.06, 2.14, -1.88, -0.75)
  // 窓の下の壁（計器盤の奥。外の地面が透けないように）
  add(new THREE.PlaneGeometry(2.75, 1.25), dash, 0, 1.66, -2.55)
  // 操縦かん（運転席の前、小さな握り）
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), trim, -0.55, 2.02, -1.62, 0.5)
  add(new THREE.BoxGeometry(0.22, 0.05, 0.05), trim, -0.55, 2.12, -1.56)
  // 床
  add(new THREE.PlaneGeometry(2.8, 4.8), dash, 0, 1.05, 0, -Math.PI / 2)
  g.visible = false
  return { group: g, owned }
}

export function CrewRover({
  terrain,
  dustColor,
  sky,
  landerYaw,
  prepare,
}: {
  terrain: Terrain
  dustColor: string
  sky: SkyNow
  landerYaw: number
  prepare: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial
}) {
  const { scene } = useGLTF(url('rover-crew.glb'))
  const group = useRef<THREE.Group>(null)
  const phase = useRover((r) => r.phase)
  const vehicle = useRover((r) => r.vehicle)
  const def = terrain.def
  const g = 9.8 * def.gravity

  const built = useMemo(() => {
    const model = scene.clone(true)
    const owned: { dispose: () => void }[] = []
    const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.7), toneMapped: false })
    owned.push(lamp)
    const mats = new Map<string, THREE.Material>()
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const src = mesh.material as THREE.MeshStandardMaterial
      if (!mats.has(src.uuid)) {
        if (src.name === 'Lamp') mats.set(src.uuid, lamp)
        else {
          // 焼き込んだ質感（色・ラフネス/メタリック・ノーマル）。スマホではテクスチャを 1024 に縮める
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
      }
      mesh.material = mats.get(src.uuid)!
    })
    const wheels = WHEEL_NAMES.map((n) => model.getObjectByName('Wheel_' + n)!)
    for (const w of wheels) w.rotation.order = 'YXZ'
    const restY = wheels.map((w) => w.position.y)
    const cockpit = buildCockpit()
    owned.push(...cockpit.owned)
    return { model, wheels, restY, owned, cockpit: cockpit.group }
  }, [scene, prepare])
  useEffect(() => () => built.owned.forEach((m) => m.dispose()), [built])

  const level = useLevel()
  const hasAir = !!def.sky
  const dust = useMemo(
    () => new WheelDust(level === 'high' ? 800 : level === 'medium' ? 500 : 240, new THREE.Color(dustColor), hasAir, def.gravity, windFor(def.id, hasAir)),
    [dustColor, level, hasAir, def],
  )
  useEffect(() => () => dust.dispose(), [dust])
  const tracks = useMemo(() => new WheelTracks(def.id, level, (x, z) => drawnHeight(terrain, x, z), 0.48), [def.id, level, terrain])
  useEffect(() => () => tracks.dispose(), [tracks])
  const dustBase = useMemo(() => new THREE.Color(dustColor), [dustColor])
  const feet = useMemo(() => {
    const c = Math.cos(landerYaw)
    const s = Math.sin(landerYaw)
    return FEET.map(([x, z]) => new THREE.Vector2(LANDER_POS.x + x * c + z * s, LANDER_POS.y - x * s + z * c))
  }, [landerYaw])
  const staticBodies = useMemo(() => rockBodies(terrain), [terrain])
  const bodiesNow = () => (isWide(terrain) && wideNow.world ? wideNow.world.cells : staticBodies)
  const range = roverRangeFor(terrain, ROVER_RANGE)
  const lights = useRef<THREE.SpotLight>(null)
  const farLight = useRef<THREE.SpotLight>(null)

  // 着陸船のそばに停めてある（降りても、そこに停まったまま）。着陸するたびに停めた場所から
  const st = useRef<Drive | null>(null)
  useEffect(() => () => void (crewPose.on = false), [])
  useEffect(() => {
    const p = crewPark(landerYaw)
    st.current = {
      x: p.x,
      z: p.z,
      y: meshHeight(terrain, p.x, p.z),
      vy: 0,
      heading: p.heading,
      speed: 0,
      steer: 0,
      pitch: 0,
      roll: 0,
      spin: 0,
      grounded: true,
      aLat: 0,
      hudT: 9,
      edgeT: -9,
      sway: new Sway(),
    }
  }, [terrain, landerYaw])
  useEffect(() => {
    if (phase !== 'drop' || vehicle !== 'crew' || !st.current) return
    Object.assign(st.current, { speed: 0, steer: 0, vy: 0 })
    st.current.sway.reset()
    tracks.lift()
    // 採集の岩は無人ローバーの仕事。ミニマップには出さない
    useRover.setState({ sites: [], taken: [], next: null, range })
  }, [phase, vehicle, range, tracks])

  /** 6 つの車輪の下の地面の高さ（低い岩の上なら、岩の上） */
  const wheelH = useMemo(() => new Float32Array(6), [])
  const groundAt = (s: Drive, fx: number, fz: number) => {
    const sx = -fz
    const sz = fx
    const bodies = bodiesNow()
    for (let i = 0; i < 6; i++) {
      const [wf, sd] = WHEELS[i]
      const wx = s.x + fx * wf + sx * sd
      const wz = s.z + fz * wf + sz * sd
      // 描かれている地面（三角形）の高さ。meshHeight だとタイルの間で少しずれて、車輪がめり込んで見える
      let h = drawnHeight(terrain, wx, wz)
      for (const r of nearRocks(bodies, wx, wz)) {
        if (r.h >= BIG_ROCK) continue
        // 岩の上を車輪がこえる：岩のまわり（岩の半径 ＋ 車輪の半径の半分）で、なだらかな丘として
        const R = r.r + WHEEL_R * 0.6
        const d = Math.hypot(wx - r.x, wz - r.z)
        if (d < R) h = Math.max(h, r.t - r.h * (d / R) ** 2)
      }
      wheelH[i] = h
    }
    return (wheelH[0] + wheelH[1] + wheelH[2] + wheelH[3] + wheelH[4] + wheelH[5]) / 6
  }

  useFrame((state, rawDt) => {
    const grp = group.current
    const s = st.current
    const { phase, since, view, vehicle } = useRover.getState()
    if (!grp) return
    grp.visible = !!s
    if (!s) return
    /** いま運転している（乗りこむところも） */
    const mine = phase !== 'none' && vehicle === 'crew'
    const dt = Math.min(rawDt, 0.05)
    const T = roverNow() - since
    const fwd = P.tmp.set(-Math.sin(s.heading), 0, -Math.cos(s.heading))
    const fx = fwd.x
    const fz = fwd.z
    const sideX = -fz
    const sideZ = fx

    if (!mine || phase !== 'drive') {
      // 停めてある・乗りこむところ：止まったまま。乗りこんで少したったら運転へ
      s.speed = 0
      s.steer *= 0.9
      s.aLat = 0
      s.y = groundAt(s, fx, fz)
      s.pitch = Math.atan2((wheelH[0] + wheelH[1]) / 2 - (wheelH[4] + wheelH[5]) / 2, 4.1)
      s.roll = Math.atan2((wheelH[1] + wheelH[3] + wheelH[5]) / 3 - (wheelH[0] + wheelH[2] + wheelH[4]) / 3, 3.9)
      s.grounded = true
      if (mine && T >= BOARD_SEC) setRoverPhase('drive')
    } else {
      const inp = roverInput
      inp.jump = false
      inp.sample = false
      const di = driveInput(s.speed, dt)
      s.steer += (di.steer - s.steer) * Math.min(1, dt * 3.5)
      const battery = useRover.getState().battery
      // 電池が空になると、ゆっくりしか走れない
      const top = CREW_TOP * (battery > 0.02 ? 1 : 0.35)
      if (s.grounded) {
        const th = di.throttle
        if (th > 0) s.speed += (s.speed < 0 ? 5 : 2.0 * th * Math.max(0.1, 1 - s.speed / top)) * dt
        else if (th < 0) s.speed -= (s.speed > 0 ? 4.5 : 1.0) * dt
        else {
          // アクセルを離すと、転がり抵抗とモーターの抵抗で止まる
          const v = Math.abs(s.speed)
          s.speed -= Math.sign(s.speed) * Math.min(v, (0.5 + 0.12 * g + 0.15 * v) * dt)
        }
        // 坂
        s.speed -= g * Math.sin(s.pitch) * dt * 0.6
        s.speed = THREE.MathUtils.clamp(s.speed, -2.2, top)
        // 前と後ろの車輪を逆に切る 6 輪：遅いときは小回り、速いほど大回り
        const R = 6 + Math.abs(s.speed) * 0.9
        const yaw = s.steer * (s.speed / R)
        s.heading -= yaw * dt
        s.aLat = s.speed * yaw
      } else s.aLat = 0
      // 電池：走ると減り（速いほど多く）、昼は太陽電池で少しずつもどる。満タンから 4 km ほど
      const use = (Math.abs(s.speed) * dt) / 4000
      const sun = Math.max(0, Math.min(1, sky.sunDir.y * 4))
      const nb = THREE.MathUtils.clamp(battery - use + sun * dt * 0.0008, 0, 1)
      if (Math.abs(nb - battery) > 0.002 || (nb === 0) !== (battery === 0)) useRover.setState({ battery: nb })
      else useRover.getState().battery = nb

      // 進む
      let nx = s.x + fx * s.speed * dt
      let nz = s.z + fz * s.speed * dt
      if (Math.abs(nx) > range || Math.abs(nz) > range) {
        nx = THREE.MathUtils.clamp(nx, -range, range)
        nz = THREE.MathUtils.clamp(nz, -range, range)
        s.speed *= 0.5
        s.edgeT = roverNow()
      }
      const atEdge = roverNow() - s.edgeT < 2.5
      if (atEdge !== useRover.getState().edge) useRover.setState({ edge: atEdge })
      // 大きな岩と着陸船の脚にはぶつかる
      for (const r of [...nearRocks(bodiesNow(), nx, nz)]) {
        if (r.h < BIG_ROCK) continue
        const dx = nx - r.x
        const dz = nz - r.z
        const d = Math.hypot(dx, dz)
        const min = r.r + BODY_R * 0.75
        if (d < min && d > 1e-4) {
          nx = r.x + (dx / d) * min
          nz = r.z + (dz / d) * min
          s.speed *= 0.3
        }
      }
      for (const f of feet) {
        const dx = nx - f.x
        const dz = nz - f.y
        const d = Math.hypot(dx, dz)
        const min = 1.6 + BODY_R
        if (d < min && d > 1e-4) {
          nx = f.x + (dx / d) * min
          nz = f.y + (dz / d) * min
          s.speed *= 0.6
        }
      }
      s.x = nx
      s.z = nz
      // 縦：地面に沿う。坂の頂上を速く越えると、月の弱い重力で少し浮く
      // 重い車で、サスペンションが長いので、地面が下がっても 0.3 m までは車輪が伸びて地面をとらえる。
      // それより急に下がる（大きな段差・坂の頂上を速く越える）ときだけ、少し宙に浮く
      const ground = groundAt(s, fx, fz)
      const wasAir = !s.grounded
      s.vy -= g * dt
      s.y += s.vy * dt
      if (s.y <= ground || (!wasAir && s.y - ground < 0.3)) {
        const impact = s.vy
        const rise = (ground - s.y) / Math.max(dt, 1e-3)
        s.y = ground
        s.vy = Math.max(0, Math.min(rise * 0.5, 2))
        if (wasAir && impact < -1.5) s.sway.kick(-impact * 0.04, 0)
        s.grounded = true
      } else s.grounded = false
      // 傾き：前後・左右の車輪の高さから
      const hF = (wheelH[0] + wheelH[1]) / 2
      const hB = (wheelH[4] + wheelH[5]) / 2
      const hR = (wheelH[1] + wheelH[3] + wheelH[5]) / 3
      const hL = (wheelH[0] + wheelH[2] + wheelH[4]) / 3
      const k = Math.min(1, dt * (s.grounded ? 8 : 2))
      s.pitch += (Math.atan2(hF - hB, 4.1) - s.pitch) * k
      s.roll += (Math.atan2(hR - hL, 3.9) - s.roll) * k
      s.spin -= (s.speed * dt) / WHEEL_R
      // 轍（真ん中の車輪の下）
      if (s.grounded) {
        for (const side of [0, 1] as const) {
          const sd = side === 0 ? -1.95 : 1.95
          tracks.touch(side, s.x + sideX * sd, s.z + sideZ * sd)
        }
      } else tracks.lift()
      // 砂ぼこり：6 つの車輪から、後ろへ
      if (s.grounded && def.dust && Math.abs(s.speed) > 0.8) {
        const kk = Math.min(1, Math.abs(s.speed) / CREW_TOP)
        const n = Math.floor(dt * (level === 'low' ? 50 : 120) * kk + Math.random())
        for (let i = 0; i < n; i++) {
          const [wf, sd] = WHEELS[Math.floor(Math.random() * 6)]
          const px = s.x + fx * (wf - 0.4) + sideX * sd
          const pz = s.z + fz * (wf - 0.4) + sideZ * sd
          dust.puff(px, s.y, pz, -fx * s.speed * 0.35, 0.8 + kk * 1.8, -fz * s.speed * 0.35, 0.5 + kk * 0.7)
        }
      }
      // 計器
      s.hudT += dt
      if (s.hudT > 1 / 12) {
        s.hudT = 0
        const deg = (v: number) => Math.round((v * 180) / Math.PI)
        useRover.setState({
          kmh: Math.round(Math.abs(s.speed) * 3.6),
          hud: {
            hdg: ((Math.round((-s.heading * 180) / Math.PI) % 360) + 360) % 360,
            pitch: deg(s.pitch),
            roll: deg(s.roll),
            dist: Math.round(Math.hypot(s.x - LANDER_POS.x, s.z - LANDER_POS.y)),
            air: !s.grounded,
            fuel: 1,
            x: Math.round(s.x * 10) / 10,
            z: Math.round(s.z * 10) / 10,
          },
        })
      }
    }
    if (mine) s.sway.step(dt, s.speed, s.aLat, s.pitch, s.roll, s.grounded)

    // ---- 姿 ----
    grp.position.set(s.x, s.y, s.z)
    Object.assign(crewPose, { on: true, x: s.x, y: s.y, z: s.z, heading: s.heading })
    grp.rotation.set(s.pitch + s.sway.pitch * 0.5, s.heading, s.roll + s.sway.roll * 0.5, 'YXZ')
    // サスペンション：車体は 6 つの車輪の平均の高さなので、でこぼこの上では車輪ごとに地面とずれる。
    // 車輪を上下に動かして（伸び 0.3 m・縮み 0.35 m まで）地面にのせる。縮みきってもめり込むなら車体ごと持ち上げる
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
      const front = i < 2
      const rear = i >= 4
      w.rotation.y = front ? -s.steer * 0.3 : rear ? s.steer * 0.3 : 0
    })
    if (mine) roverFocus.set(s.x, s.y, s.z)
    if (mine) Object.assign(roverPose, { x: s.x, y: s.y, z: s.z, heading: s.heading, speed: s.speed, slip: 0, grounded: s.grounded, pitch: s.pitch, roll: s.roll })

    // ---- 前照灯（夜） ----
    for (const [l, power, aimZ, hy] of [
      [lights.current, 160, -12, 1.7],
      [farLight.current, 120, -80, 3.3],
    ] as const) {
      if (!l) continue
      // 停めてあるときは消しておく（乗ると点く）
      l.intensity = sky.night * power
      l.visible = mine && sky.night > 0.01
      grp.localToWorld(l.position.set(0, hy, -2.9))
      grp.localToWorld(l.target.position.set(0, -0.5, aimZ))
      l.target.updateMatrixWorld()
    }

    // ---- 砂ぼこり・轍 ----
    const cam = state.camera as THREE.PerspectiveCamera
    dust.material.uniforms.uScale.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360))
    dust.update(dt)
    tracks.update(dt, sky.sunDir)
    const lit = Math.max(0.15, Math.min(1, sky.sunDir.y * 3 + 0.2))
    dust.material.uniforms.uColor.value.copy(dustBase).multiplyScalar(lit * 0.95)
    dust.material.uniforms.uShadow.value.copy(dustBase).multiplyScalar(lit * 0.4 + 0.04)
    dust.material.uniforms.uSunView.value.copy(sky.sunDir).transformDirection(cam.matrixWorldInverse)

    // ---- カメラ ----
    const cockpit = mine && phase === 'drive' && view === 'cam'
    built.model.visible = !cockpit
    built.cockpit.visible = cockpit
    if (!mine || useLanding.getState().phase !== 'surface') return
    const camPos = P.cam
    const look = P.look
    if (cockpit) {
      // 運転席から：外の模型はかくし、車の中（計器盤と窓の枠）を見せる
      grp.updateMatrixWorld(true)
      camPos.copy(EYE)
      grp.localToWorld(camPos)
      grp.getWorldQuaternion(P.q)
      cam.position.copy(camPos)
      cam.quaternion.copy(P.q)
      cam.rotateX(-0.08)
      if (cam.fov !== 70) {
        cam.fov = 70
        cam.updateProjectionMatrix()
      }
      return
    }
    const kc = 1 - Math.exp(-dt * 4)
    if (phase === 'drive') {
      const v = Math.min(1, Math.abs(s.speed) / CREW_TOP)
      const back = 13 + v * 3
      camPos.set(s.x - fx * back, s.y + 5.2 - v * 0.6, s.z - fz * back)
      look.set(s.x + fx * 3, s.y + 2.0, s.z + fz * 3)
    } else {
      // 乗りこむ：ななめ後ろから、ゆっくり回りこむ（後ろのエアロックが見える）
      const u = Math.min(1, T / BOARD_SEC)
      const a = s.heading + Math.PI + 0.9 - u * 0.6
      const dist = 15 - u * 2
      camPos.set(s.x - Math.sin(a) * dist, s.y + 3.4, s.z - Math.cos(a) * dist)
      look.set(s.x, s.y + 1.9, s.z)
    }
    const minY = meshHeight(terrain, camPos.x, camPos.z) + 0.8
    if (camPos.y < minY) camPos.y = minY
    const first = (cam.userData.roverCam ?? 0) < roverNow() - 0.5
    cam.userData.roverCam = roverNow()
    if (first) cam.position.copy(camPos)
    else cam.position.lerp(camPos, kc)
    cam.lookAt(look)
    const fov = phase === 'drive' ? 55 + Math.min(1, Math.abs(s.speed) / CREW_TOP) * 5 : 50
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * kc
      cam.updateProjectionMatrix()
    }
  })

  return (
    <>
      <group ref={group} visible={false} name="surface-crew-rover">
        <primitive object={built.model} />
        <primitive object={built.cockpit} />
      </group>
      <spotLight ref={lights} color="#fff1dc" angle={0.8} penumbra={0.6} distance={60} decay={1.5} intensity={0} />
      <spotLight ref={farLight} color="#f4f6ff" angle={0.32} penumbra={0.5} distance={180} decay={0} intensity={0} />
      <primitive object={tracks.mesh} />
      <primitive object={dust.points} />
    </>
  )
}
