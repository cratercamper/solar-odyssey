import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { haloTexture } from '../ship/ShipModel'
import { lowMemory } from '../../state/quality'
import { MAP_KEYS, shrinkTexture } from '../surface/shrinkTexture'
import {
  DEPLOY_SEC,
  EVA_FADE,
  EVA_BOOST,
  EVA_SPEEDS,
  RETURN_FAR,
  RETURN_SEC,
  evaRecall,
  recallEva,
  LAUNCH_SEC,
  RECALL_SEC,
  TETHER_M,
  evaDebug,
  evaInput,
  evaNow,
  finishEva,
  setEvaPhase,
  useEva,
  type EvaFace,
  type EvaTool,
  EVA_TOOLS,
} from '../../state/eva'
import { AIRLOCK, evaSite, hullAlt, hullClearance } from './hull'
import { shipBoxDistance, shipCol, shipDistance, shipSweep } from './shipCollider'
import { jobsRt, useEvaJobs, workLink } from '../../state/evaJobs'

// 船外活動ロボット EVR-1「ツムギ」（全幅 0.8 m）。模型は tools/blender/build_eva_robot.py の eva-tsumugi.glb。
// 関節（肩・ひじ・手首・スラスター・首）は模型ではすべて 0 で、ここで回して「たたんだ姿 → 展開」、
// 作業・ツールの付け替えの姿勢を作る（角度は build_eva_robot.py の POSES と同じ。Blender の度で書く）。
// ツール 5 種と表情 6 つは模型に全部入っていて、1 つだけ見せる。

const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}`
const D = Math.PI / 180

// ---- 姿勢（build_eva_robot.py の POSES と同じ数字） ------------------------------------------------

type V3 = [number, number, number]
type Arm = { S: V3; F: V3; W: V3 }
type Pose = { R: Arm; L: Arm; pod: number; head: number }

const arm = (S: V3, F: V3, W: V3): Arm => ({ S, F, W })
const REST = arm([12, -55, 0], [28, 48, 0], [12, 0, 0])
const WORK = arm([72, -12, 0], [22, 6, 0], [8, 0, 0])
const SWAP = arm([-42, -8, 0], [-88, 0, 0], [-25, 0, 0])
const FOLD = arm([-8, 4, 38], [118, 0, 0], [75, 0, 0])
const pose = (R: Arm, L: Arm, pod = 0, head = 0): Pose => ({ R, L, pod, head })
const P_FOLDED = pose(FOLD, FOLD, -80, -0.03)
const P_REST = pose(REST, REST)

const ease = (a: number, b: number, t: number) => {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return u * u * (3 - 2 * u)
}
const lerp3 = (a: V3, b: V3, u: number): V3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
const mixArm = (a: Arm, b: Arm, u: number): Arm => ({ S: lerp3(a.S, b.S, u), F: lerp3(a.F, b.F, u), W: lerp3(a.W, b.W, u) })
const mixPose = (a: Pose, b: Pose, u: number): Pose => ({ R: mixArm(a.R, b.R, u), L: mixArm(a.L, b.L, u), pod: a.pod + (b.pod - a.pod) * u, head: a.head + (b.head - a.head) * u })
const copyPose = (p: Pose): Pose => mixPose(p, p, 0)

// Blender の回転（XYZ のオイラー角：X を回してから Y、Z）を three.js の向きに。
// 軸は Blender X → three X、Blender Y → three -Z、Blender Z → three Y
const AX = new THREE.Vector3(1, 0, 0)
const AY = new THREE.Vector3(0, 0, -1)
const AZ = new THREE.Vector3(0, 1, 0)
const qx = new THREE.Quaternion()
const qy = new THREE.Quaternion()
const qz = new THREE.Quaternion()
function setBlenderEuler(o: THREE.Object3D, [x, y, z]: V3, mirror: boolean) {
  const s = mirror ? -1 : 1
  qz.setFromAxisAngle(AZ, z * s * D)
  qy.setFromAxisAngle(AY, y * s * D)
  qx.setFromAxisAngle(AX, x * D)
  o.quaternion.copy(qz).multiply(qy).multiply(qx)
}

type Rig = {
  root: THREE.Object3D
  head: THREE.Object3D
  headY: number
  joints: Record<'R' | 'L', { S: THREE.Object3D; F: THREE.Object3D; W: THREE.Object3D }>
  pods: THREE.Object3D[]
  jet: THREE.Object3D
  tools: Record<'R' | 'L', Record<EvaTool, THREE.Object3D>>
  faces: Record<string, THREE.Object3D>
}

function applyPose(rig: Rig, p: Pose) {
  for (const side of ['R', 'L'] as const) {
    const j = rig.joints[side]
    const a = p[side]
    const m = side === 'L'
    setBlenderEuler(j.S, a.S, m)
    setBlenderEuler(j.F, a.F, m)
    setBlenderEuler(j.W, a.W, m)
  }
  for (const pod of rig.pods) pod.rotation.x = p.pod * D
  rig.head.position.y = rig.headY + p.head
}

function showFace(rig: Rig, face: EvaFace) {
  for (const [k, o] of Object.entries(rig.faces)) o.visible = k === face
}

function showTool(rig: Rig, side: 'R' | 'L', tool: EvaTool) {
  for (const k of EVA_TOOLS) rig.tools[side][k].visible = k === tool
}

// ---- 粒（スラスターのガス・溶接の火花） ---------------------------------------------------------

class Particles {
  readonly points: THREE.Points
  private pos: Float32Array
  private col: Float32Array
  private vel: Float32Array
  private life: Float32Array
  private max: Float32Array
  private base: THREE.Color[]
  private next = 0
  constructor(
    readonly n: number,
    size: number,
    private drag: number,
  ) {
    this.pos = new Float32Array(n * 3)
    this.col = new Float32Array(n * 3)
    this.vel = new Float32Array(n * 3)
    this.life = new Float32Array(n)
    this.max = new Float32Array(n).fill(1)
    this.base = Array.from({ length: n }, () => new THREE.Color())
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3))
    const m = new THREE.PointsMaterial({ size, map: haloTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false })
    this.points = new THREE.Points(g, m)
    this.points.frustumCulled = false
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, life: number, color: THREE.Color) {
    const i = this.next
    this.next = (this.next + 1) % this.n
    p.toArray(this.pos, i * 3)
    v.toArray(this.vel, i * 3)
    this.life[i] = life
    this.max[i] = life
    this.base[i].copy(color)
  }
  update(dt: number) {
    const k = Math.exp(-this.drag * dt)
    for (let i = 0; i < this.n; i++) {
      const o = i * 3
      if (this.life[i] <= 0) {
        this.col[o] = this.col[o + 1] = this.col[o + 2] = 0
        continue
      }
      this.life[i] -= dt
      this.vel[o] *= k
      this.vel[o + 1] *= k
      this.vel[o + 2] *= k
      this.pos[o] += this.vel[o] * dt
      this.pos[o + 1] += this.vel[o + 1] * dt
      this.pos[o + 2] += this.vel[o + 2] * dt
      const f = Math.max(0, this.life[i] / this.max[i])
      const c = this.base[i]
      this.col[o] = c.r * f
      this.col[o + 1] = c.g * f
      this.col[o + 2] = c.b * f
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.points.geometry.attributes.color.needsUpdate = true
  }
  dispose() {
    this.points.geometry.dispose()
    ;(this.points.material as THREE.Material).dispose()
  }
}

// ---- 命綱：エアロックからツムギの背中までの、たるんだ細い管 -------------------------------------------

const TETHER_SEG = 48
const TETHER_RAD = 6

class Tether {
  readonly mesh: THREE.Mesh
  private pos: Float32Array
  private curve = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3())
  constructor(radius: number) {
    const n = (TETHER_SEG + 1) * TETHER_RAD
    this.pos = new Float32Array(n * 3)
    const idx: number[] = []
    for (let i = 0; i < TETHER_SEG; i++)
      for (let j = 0; j < TETHER_RAD; j++) {
        const a = i * TETHER_RAD + j
        const b = i * TETHER_RAD + ((j + 1) % TETHER_RAD)
        idx.push(a, a + TETHER_RAD, b, b, a + TETHER_RAD, b + TETHER_RAD)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    g.setIndex(idx)
    this.radius = radius
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#d9822b', roughness: 0.7, metalness: 0.05 }))
    this.mesh.frustumCulled = false
    this.mesh.castShadow = true
  }
  private radius: number
  private t = new THREE.Vector3()
  private n = new THREE.Vector3()
  private b = new THREE.Vector3()
  private p = new THREE.Vector3()
  update(a: THREE.Vector3, aDir: THREE.Vector3, b: THREE.Vector3, bDir: THREE.Vector3, slack: number, side: THREE.Vector3) {
    const d = a.distanceTo(b)
    const c = this.curve
    c.v0.copy(a)
    c.v1.copy(a).addScaledVector(aDir, Math.min(2.5, d * 0.35 + 0.3)).addScaledVector(side, slack * d * 0.35)
    c.v2.copy(b).addScaledVector(bDir, Math.min(2, d * 0.3 + 0.2)).addScaledVector(side, -slack * d * 0.2)
    c.v3.copy(b)
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i <= TETHER_SEG; i++) {
      const u = i / TETHER_SEG
      c.getPoint(u, this.p)
      c.getTangent(u, this.t)
      this.n.crossVectors(this.t, up)
      if (this.n.lengthSq() < 1e-6) this.n.set(1, 0, 0)
      this.n.normalize()
      this.b.crossVectors(this.t, this.n).normalize()
      for (let j = 0; j < TETHER_RAD; j++) {
        const ang = (j / TETHER_RAD) * Math.PI * 2
        const o = (i * TETHER_RAD + j) * 3
        this.pos[o] = this.p.x + (this.n.x * Math.cos(ang) + this.b.x * Math.sin(ang)) * this.radius
        this.pos[o + 1] = this.p.y + (this.n.y * Math.cos(ang) + this.b.y * Math.sin(ang)) * this.radius
        this.pos[o + 2] = this.p.z + (this.n.z * Math.cos(ang) + this.b.z * Math.sin(ang)) * this.radius
      }
    }
    const g = this.mesh.geometry
    g.attributes.position.needsUpdate = true
    g.computeVertexNormals()
  }
  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}

// ---- 炎（スラスターの青い噴射） -----------------------------------------------------------

function flameGeometry() {
  // 先が細い円すい。根元が原点、-Y へ長さ 1
  const g = new THREE.ConeGeometry(1, 1, 14, 1, true)
  g.rotateX(Math.PI)
  g.translate(0, -0.5, 0)
  return g
}

// ---- 場所の決まり（three.js の座標。メートル。ツムギの前が -Z、上が +Y、右が +X） -----------------------

/** エアロックの中の待機位置（たたんだ姿）と、押し出された先 */
const INSIDE = new THREE.Vector3(AIRLOCK.x, -0.75, AIRLOCK.z)
const OUTSIDE = new THREE.Vector3(AIRLOCK.x, 1.15, AIRLOCK.z)
/** 命綱をつなぐ場所：エアロックの縁（外壁）と、ツムギの背中 */
const TETHER_A = new THREE.Vector3(AIRLOCK.x + 0.55, 0.08, AIRLOCK.z + 0.75)
const TETHER_BACK = new THREE.Vector3(0, 0.02, 0.29)
/** 腕とツールの大きさ（build_eva_robot.py の ARM_K と同じ） */
export const ARM_K = 1.4
/** ツールの先（手首の座標で）。Blender (0, 0.02, -0.225) × ARM_K */
const TOOL_TIP = new THREE.Vector3(0, -0.225 * ARM_K, -0.02 * ARM_K)
/** ツムギの体の大きさ（外壁に当たる距離） */
const BODY_R = 0.42
/** 背中の小さな姿勢制御の噴射口（体の座標）。Blender (±0.145, -0.27, 0.19 / -0.08) */
const RCS = [
  [0.15, 0.19, 0.27],
  [-0.15, 0.19, 0.27],
  [0.15, -0.08, 0.27],
  [-0.15, -0.08, 0.27],
].map((v) => new THREE.Vector3(...v))

const TURN = 1.1 // rad/s
/** 慣性のまま（自動ブレーキ OFF）のときの加速（最高速度の何倍 /s） */
const INERTIA_ACC = 0.5
/** 面のそばでは、面へ向かう速さをこれ（m/s、面までの距離 1 m あたり）までに抑える（ぶつからない） */
const NEAR_K = 1.4
const NEAR_MIN = 2.5
const SURF_PROBE = 60
const surfN = new THREE.Vector3()
/** いちばん近い面までの距離と外向き（母船のまわりは本物の形、ほかは足場の形） */
function surfaceDistance(p: THREE.Vector3, n: THREE.Vector3) {
  if (evaSite.id === 'ship') return shipDistance(p, n, SURF_PROBE)
  const depth = hullClearance(p, SURF_PROBE, n)
  return depth > 0 ? SURF_PROBE - depth : SURF_PROBE
}

export function Tsumugi({ shipTint }: { shipTint: THREE.Color }) {
  const { scene } = useGLTF(url('eva-tsumugi.glb'))
  const group = useRef<THREE.Group>(null)
  const phase = useEva((e) => e.phase)
  void shipTint

  const built = useMemo(() => {
    const model = scene.clone(true)
    const owned: { dispose: () => void }[] = []
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.9, 2.2), toneMapped: false })
    const hotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.9, 0.3), toneMapped: false })
    const screenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.6, 2.8), toneMapped: false })
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 1.5, 2.4), toneMapped: false })
    owned.push(glowMat, hotMat, screenMat, lampMat)
    const special: Record<string, THREE.Material> = { Glow: glowMat, Hot: hotMat, Screen: screenMat, Lamp: lampMat }
    const mats = new Map<THREE.Material, THREE.Material>()
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const src = mesh.material as THREE.MeshStandardMaterial
      if (!mats.has(src)) {
        if (special[src.name]) mats.set(src, special[src.name])
        else {
          // 焼き込んだ質感（色・ラフネス/メタリック・ノーマル）。スマホではテクスチャを 1024 に縮める
          const m = src.clone()
          m.envMapIntensity = 1.1
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
          owned.push(m)
          mats.set(src, m)
        }
      }
      mesh.material = mats.get(src)!
    })
    const get = (n: string) => {
      const o = model.getObjectByName(n)
      if (!o) throw new Error(`eva-tsumugi.glb: ${n} がない`)
      return o
    }
    const side = (s: 'R' | 'L') => ({ S: get(`Shoulder_${s}`), F: get(`Fore_${s}`), W: get(`Wrist_${s}`) })
    const tools = (s: 'R' | 'L') => Object.fromEntries(EVA_TOOLS.map((k) => [k, get(`Tool_${k}_${s}`)])) as Record<EvaTool, THREE.Object3D>
    const head = get('Head')
    const rig: Rig = {
      root: get('Body'),
      head,
      headY: head.position.y,
      joints: { R: side('R'), L: side('L') },
      pods: [get('Pod_R'), get('Pod_L')],
      jet: get('MainJet'),
      tools: { R: tools('R'), L: tools('L') },
      faces: Object.fromEntries(['normal', 'happy', 'focus', 'sweat', 'ouch', 'boot'].map((k) => [k, get(`Face_${k}`)])),
    }
    // 炎：下向きの 2 基と、後ろ向きのメイン
    const flameGeo = flameGeometry()
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.75, 1.8), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    owned.push(flameGeo, flameMat)
    const podFlames = rig.pods.map((pod) => {
      const f = new THREE.Mesh(flameGeo, flameMat)
      f.position.set(0, -0.1, 0)
      f.scale.set(0.024, 0.001, 0.024)
      pod.add(f)
      return f
    })
    const jetFlame = new THREE.Mesh(flameGeo, flameMat)
    jetFlame.position.set(0, -0.06, 0.115)
    jetFlame.rotation.x = -Math.PI / 2
    jetFlame.scale.set(0.035, 0.001, 0.035)
    rig.jet.add(jetFlame)
    // 溶接・カッターの光
    const arc = new THREE.PointLight('#bfe0ff', 0, 3, 2)
    model.add(arc)
    showTool(rig, 'L', 'hand')
    showTool(rig, 'R', useEva.getState().tool)
    showFace(rig, 'none')
    applyPose(rig, P_FOLDED)
    return { model, rig, owned, glowMat, hotMat, podFlames, jetFlame, arc }
  }, [scene])
  useEffect(() => () => built.owned.forEach((m) => m.dispose()), [built])

  const puffs = useMemo(() => new Particles(220, 0.09, 1.2), [])
  const sparks = useMemo(() => new Particles(160, 0.035, 0.6), [])
  const tether = useMemo(() => new Tether(0.011), [])
  useEffect(
    () => () => {
      puffs.dispose()
      sparks.dispose()
      tether.dispose()
    },
    [puffs, sparks, tether],
  )

  // 動きの状態（毎フレーム書き換えるので React の外に置く）
  const sim = useMemo(
    () => ({
      pos: INSIDE.clone(),
      vel: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      spin: new THREE.Vector3(),
      cur: copyPose(P_FOLDED),
      recallFrom: new THREE.Vector3(),
      recallQuat: new THREE.Quaternion(),
      swapT: -1,
      swapTo: 'hand' as EvaTool,
      happyUntil: 0,
      ouchUntil: 0,
      /** 前へ進み続けている時間（秒）。横回転を押すと 0 にもどる（頭を上へもどすのは、しばらく前へ進んでから） */
      cruise: 0,
      gas: 100,
      battery: 100,
      hudAt: 0,
      face: 'none' as EvaFace,
      camPos: new THREE.Vector3(2.6, 1.9, 3.4),
      camLook: new THREE.Vector3(0, 0.8, 0),
      camUp: new THREE.Vector3(0, 1, 0),
      hatch: 0,
      close: 0,
      pull: 0,
      /** いちばん近い面までの距離（m） */
      dSurf: 99,
      /** カメラの横ずれ（0 = ツムギがまんなか、1 = 作業向けに左寄せ） */
      side: 0,
      /** 飛んでいるときのカメラの向き（ツムギの向きを少し遅れて追う） */
      camQ: new THREE.Quaternion(),
      /** 発進のカメラから、ツムギの後ろのカメラへ移りきったか（0..1） */
      rigid: 0,
    }),
    [],
  )
  useEffect(() => {
    evaDebug.place = (x, y, z, yawDeg = 0) => {
      sim.pos.set(x, y, z)
      sim.vel.set(0, 0, 0)
      sim.quat.setFromAxisAngle(AZ, yawDeg * D)
    }
    evaDebug.state = () => ({ pos: sim.pos.toArray(), vel: sim.vel.toArray() })
    return () => {
      evaDebug.place = undefined
      evaDebug.state = undefined
    }
  }, [sim])

  // 回収のボタン・K：母船のまわりで遠くにいれば、暗転して連れもどす
  useEffect(() => {
    evaRecall.request = () => recallEva(evaSite.id === 'ship' && sim.pos.distanceTo(OUTSIDE) > RETURN_FAR)
    return () => {
      evaRecall.request = () => recallEva()
    }
  }, [sim])

  // 船外の場面から、ハッチの開き具合を読む
  useEffect(() => {
    hatchState.get = () => sim.hatch
  }, [sim])

  const tmp = useMemo(
    () => ({
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Vector3(),
      d: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      m: new THREE.Matrix4(),
      col: new THREE.Color(),
    }),
    [],
  )

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = group.current
    if (!g) return
    const { rig } = built
    const s = useEva.getState()
    const T = evaNow() - s.since
    const now = evaNow()
    let target: Pose = P_REST
    let thrustLocal = tmp.d.set(0, 0, 0)
    let face: EvaFace = 'normal'
    let podPuff = 0

    if (s.phase === 'launch') {
      // ハッチが開いて（0〜0.9 秒）、たたんだまま押し出される
      sim.hatch = ease(0.0, 0.9, T)
      sim.pos.lerpVectors(INSIDE, OUTSIDE, ease(0.7, LAUNCH_SEC, T))
      sim.quat.identity()
      sim.vel.set(0, 0, 0)
      target = P_FOLDED
      face = 'none'
      if (T >= LAUNCH_SEC) setEvaPhase('deploy')
    } else if (s.phase === 'deploy') {
      // スラスターを振り出し、腕を広げ、頭を上げ、画面がちらついて起動する
      sim.hatch = 1 - ease(1.6, DEPLOY_SEC, T)
      const p = copyPose(P_FOLDED)
      p.pod = -80 * (1 - ease(0.0, 0.8, T))
      const a = ease(0.6, 2.4, T)
      p.R = mixArm(FOLD, REST, a)
      p.L = mixArm(FOLD, REST, a)
      p.head = -0.03 * (1 - ease(0.6, 1.6, T))
      target = p
      podPuff = ease(0.2, 0.5, T) * (1 - ease(0.9, 1.3, T))
      sim.pos.y = OUTSIDE.y + 0.05 * Math.sin(T * 1.4)
      const flick = T > 2.0 && T < 2.9 && Math.sin(T * 40) > -0.2
      face = T < 2.0 ? 'none' : T < 3.0 ? (flick ? 'boot' : 'none') : 'normal'
      if (T >= DEPLOY_SEC) {
        sim.happyUntil = now + 1.4
        setEvaPhase('fly')
      }
    } else if (s.phase === 'fly') {
      sim.hatch = 0
      // ---- 入力 → 力（体の向きで） ----
      const fwd = THREE.MathUtils.clamp(evaInput.fwd - evaInput.stickY, -1, 1)
      const right = THREE.MathUtils.clamp(evaInput.right + evaInput.stickX, -1, 1)
      const up = THREE.MathUtils.clamp(evaInput.up + evaInput.padUp, -1, 1)
      thrustLocal = tmp.d.set(right, up, -fwd)
      if (thrustLocal.lengthSq() > 1) thrustLocal.normalize()
      const power = sim.gas > 0 ? 1 : 0.25
      const top = EVA_SPEEDS[s.speed] * (evaInput.boost ? EVA_BOOST : 1) * power
      // 速さの段階が上がるほど、強く噴かす
      const accel = Math.max(1.2, top * 0.9)
      const v0 = tmp.c.copy(sim.vel)
      if (s.assist) {
        // 飛行アシスト：押している向きへ、その段階の速さで進むように噴かす。手を離すと止まる
        tmp.a.copy(thrustLocal).applyQuaternion(sim.quat).multiplyScalar(top)
        tmp.a.sub(sim.vel)
        const k = evaInput.brake ? 2.5 : 1
        const lim = accel * k * dt
        if (tmp.a.length() > lim) tmp.a.setLength(lim)
        sim.vel.add(tmp.a)
      } else {
        // 慣性のまま：噴かしたぶんだけ速くなり、手を離しても進み続ける。X で止める
        tmp.a.copy(thrustLocal).applyQuaternion(sim.quat).multiplyScalar(top * INERTIA_ACC * dt)
        sim.vel.add(tmp.a)
        if (evaInput.brake) {
          const l = sim.vel.length()
          sim.vel.setLength(Math.max(0, l - accel * 2 * dt))
        }
        if (sim.vel.length() > top * 1.05) sim.vel.setLength(Math.max(top, sim.vel.length() - accel * dt))
      }
      // ガス：速さを変えたぶんだけ使う
      sim.gas = Math.max(0, sim.gas - v0.distanceTo(sim.vel) * 0.035)
      // ---- 面のそば：面へ向かう速さを抑える（速く飛んでいても、外壁にぶつからない） ----
      const dSurf = surfaceDistance(sim.pos, surfN)
      sim.dSurf = dSurf
      if (dSurf < SURF_PROBE) {
        const toward = -sim.vel.dot(surfN)
        const cap = Math.max(NEAR_MIN, NEAR_K * (dSurf - BODY_R))
        if (toward > cap) sim.vel.addScaledVector(surfN, toward - cap)
      }
      // ---- 向き ----
      sim.spin.x += (evaInput.pitch * TURN - sim.spin.x) * (1 - Math.exp(-dt * 6))
      sim.spin.y += (-evaInput.yaw * TURN - sim.spin.y) * (1 - Math.exp(-dt * 6))
      sim.spin.z += (-evaInput.roll * TURN - sim.spin.z) * (1 - Math.exp(-dt * 6))
      tmp.q.setFromEuler(new THREE.Euler(sim.spin.x * dt - evaInput.lookY, sim.spin.y * dt - evaInput.lookX, sim.spin.z * dt, 'YXZ'))
      sim.quat.multiply(tmp.q).normalize()
      evaInput.lookX = 0
      evaInput.lookY = 0
      // 飛行アシスト：前へしばらく（1.5 秒）進み続けたときだけ、母船の上（+Y）へ頭をゆっくりもどす（上下がわからなくならない）。
      // 止まっているときや、横回転（Z・C）で自分で向きを変えたあとは、その向きのまま（cratercamper さん：好きな向きでいたい）
      if (evaInput.roll) sim.cruise = 0
      else if (fwd > 0.3) sim.cruise += dt
      else sim.cruise = Math.max(0, sim.cruise - dt * 2)
      if (s.assist && !evaInput.roll && sim.cruise > 1.5) levelRoll(sim.quat, dt * Math.min(1, sim.cruise - 1.5))
      // ---- 動く（母船のまわりは、本物の形をすり抜けないように光線で確かめる） ----
      tmp.a.copy(sim.pos).addScaledVector(sim.vel, dt)
      const tHit = evaSite.id === 'ship' ? shipSweep(sim.pos, tmp.a, BODY_R, tmp.b) : null
      if (tHit !== null) {
        sim.pos.lerp(tmp.a, tHit)
        const into = sim.vel.dot(tmp.b)
        if (into < 0) {
          if (into < -1.2) sim.ouchUntil = now + 1.2
          sim.vel.addScaledVector(tmp.b, -into * 1.3)
        }
      } else sim.pos.copy(tmp.a)
      // ---- 外壁に当たる ----
      const hit = hullClearance(sim.pos, BODY_R, tmp.b)
      if (hit > 0) {
        sim.pos.addScaledVector(tmp.b, hit)
        const into = sim.vel.dot(tmp.b)
        if (into < 0) {
          if (into < -0.6) sim.ouchUntil = now + 1.2
          sim.vel.addScaledVector(tmp.b, -into * 1.3)
        }
      }
      // ---- 命綱（修理の場所）・母船からの距離（母船のまわり） ----
      // 母船のまわりの宇宙では、どこまでも離れられる（junji 2026-11-12、cratercamper さん：何 km も離れて、宇宙の広さと
      // 「迷子になった」気分を味わいたい）。活動範囲（shipCol.limit）の外では、距離と「回収して船にもどる」を目立たせるだけ
      let taut = false
      if (evaSite.id === 'ship') {
        const d = shipBoxDistance(sim.pos)
        const r = s.range
        const rd = Math.round(d)
        const warn = d > shipCol.limit
        const edge = false
        if (rd !== r.d || warn !== r.warn || edge !== r.edge) useEva.setState({ range: { d: rd, warn, edge } })
      } else {
        tmp.a.subVectors(sim.pos, TETHER_A)
        const dist = tmp.a.length()
        taut = dist > TETHER_M
        if (taut) {
          tmp.a.setLength(TETHER_M)
          sim.pos.copy(TETHER_A).add(tmp.a)
          const out = sim.vel.dot(tmp.a.normalize())
          if (out > 0) sim.vel.addScaledVector(tmp.a, -out * 1.2)
        }
      }
      if (taut !== s.taut) useEva.setState({ taut })
      // ---- 作業：故障の所へ体を寄せる（ツールの先が作業する点に来るように） ----
      if (workLink.assist && evaInput.work) {
        alignToWork(sim.quat, sim.pos, dt)
        sim.vel.multiplyScalar(Math.exp(-dt * 8))
        sim.spin.set(0, 0, 0)
      }
      // エアロックのそばでは、ガスを補給できる
      if (sim.pos.distanceTo(OUTSIDE) < 2.6 && sim.vel.length() < 0.6) sim.gas = Math.min(100, sim.gas + dt * 14)
      // ---- 腕：作業・ツールの付け替え ----
      if (evaInput.swapTo && sim.swapT < 0) {
        sim.swapTo = evaInput.swapTo
        sim.swapT = 0
        useEva.setState({ swapping: true })
      }
      evaInput.swapTo = null
      const working = evaInput.work && sim.swapT < 0
      if (working !== s.working) useEva.setState({ working })
      let R = working ? WORK : REST
      if (sim.swapT >= 0) {
        sim.swapT += dt
        if (sim.swapT < 0.7) R = SWAP
        if (sim.swapT >= 0.62 && s.tool !== sim.swapTo) {
          useEva.setState({ tool: sim.swapTo })
          showTool(rig, 'R', sim.swapTo)
        }
        if (sim.swapT > 1.3) {
          sim.swapT = -1
          sim.happyUntil = now + 1.2
          useEva.setState({ swapping: false })
        }
      }
      // ゆっくり漂う腕
      const sway = Math.sin(now * 0.8) * 3
      target = pose(R, arm([REST.S[0] + sway, REST.S[1], 0], [REST.F[0] - sway, REST.F[1], 0], REST.W))
      sim.battery = Math.max(0, sim.battery - dt * (100 / (8 * 3600)) * 20)
      const happy = now < Math.max(sim.happyUntil, workLink.happyUntil)
      face = now < sim.ouchUntil ? 'ouch' : happy ? 'happy' : taut || sim.gas < 15 ? 'sweat' : working ? 'focus' : 'normal'
    } else if (s.phase === 'return') {
      // 遠くから回収：暗転しているあいだに、エアロックの斜め上へ連れもどす
      sim.vel.set(0, 0, 0)
      face = 'happy'
      if (T >= RETURN_SEC / 2 && sim.pos.distanceTo(OUTSIDE) > 4) {
        sim.pos.copy(OUTSIDE).add(tmp.a.set(0, 2.2, 3.2))
        sim.quat.identity()
        sim.camPos.copy(sim.pos).add(tmp.a.set(0.35, 0.5, 1.65))
        sim.camLook.copy(sim.pos)
        sim.camUp.set(0, 1, 0)
      }
      if (T >= RETURN_SEC) setEvaPhase('recall')
    } else if (s.phase === 'recall') {
      // 命綱を巻き取って、たたみながらエアロックへ
      if (T < 0.05 || sim.recallFrom.lengthSq() === 0) {
        sim.recallFrom.copy(sim.pos)
        sim.recallQuat.copy(sim.quat)
      }
      const u = ease(0.3, RECALL_SEC - 0.6, T)
      tmp.a.lerpVectors(sim.recallFrom, OUTSIDE, u)
      if (T > RECALL_SEC - 0.9) tmp.a.lerp(INSIDE, ease(RECALL_SEC - 0.9, RECALL_SEC, T))
      sim.pos.copy(tmp.a)
      sim.quat.slerpQuaternions(sim.recallQuat, tmp.q.identity(), u)
      sim.vel.set(0, 0, 0)
      sim.hatch = ease(RECALL_SEC - 1.4, RECALL_SEC - 1.0, T)
      target = mixPose(P_REST, P_FOLDED, ease(RECALL_SEC - 1.6, RECALL_SEC - 0.8, T))
      face = T < RECALL_SEC - 1.0 ? 'happy' : 'none'
      if (T >= RECALL_SEC + EVA_FADE) {
        sim.recallFrom.set(0, 0, 0)
        finishEva()
      }
    }

    // ---- 姿勢：めざす姿勢へなめらかに ----
    const k = s.phase === 'deploy' || s.phase === 'launch' ? 1 : 1 - Math.exp(-dt * 7)
    sim.cur = mixPose(sim.cur, target, k)
    applyPose(rig, sim.cur)
    if (face !== sim.face) {
      sim.face = face
      showFace(rig, face)
      useEva.setState({ face })
    }
    g.position.copy(sim.pos)
    g.quaternion.copy(sim.quat)
    g.updateMatrixWorld(true)

    // ---- 噴射：前へ進むときはメイン、上へはスラスター 2 基、ほかは背中の小さな噴射口からガス ----
    const main = Math.max(0, -thrustLocal.z)
    const lift = Math.max(0, thrustLocal.y, podPuff)
    built.jetFlame.scale.y = 0.001 + main * (0.18 + 0.04 * Math.sin(now * 60))
    for (const f of built.podFlames) f.scale.y = 0.001 + lift * (0.14 + 0.03 * Math.sin(now * 53 + 1))
    const glow = 0.6 + 2.2 * Math.max(main, lift)
    built.glowMat.color.setRGB(0.3 * glow, 0.9 * glow, 2.2 * glow)
    const side = Math.abs(thrustLocal.x) + Math.max(0, thrustLocal.z) + Math.max(0, -thrustLocal.y) + (evaInput.yaw || evaInput.pitch || evaInput.roll ? 0.6 : 0)
    if (side > 0.05 && s.phase === 'fly') {
      for (let i = 0; i < 2; i++) {
        const nz = RCS[Math.floor(Math.random() * RCS.length)]
        tmp.a.copy(nz).applyMatrix4(g.matrixWorld)
        // ガスは押したい向きと反対へ
        tmp.b.set(-thrustLocal.x + (Math.random() - 0.5) * 0.6, -thrustLocal.y * 0.5 + (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.5).applyQuaternion(sim.quat).multiplyScalar(1.4)
        puffs.emit(tmp.a, tmp.b, 0.45 + Math.random() * 0.3, tmp.col.setRGB(0.55, 0.6, 0.68))
      }
    }
    puffs.update(dt)

    // ---- ツールを使う：ドリルは回る、溶接とカッターは光って、外壁の近くなら火花 ----
    const wrist = rig.joints.R.W
    tmp.c.copy(TOOL_TIP).applyMatrix4(wrist.matrixWorld)
    workLink.tip.copy(tmp.c)
    workLink.tipLocal.copy(tmp.c)
    g.worldToLocal(workLink.tipLocal)
    workLink.wrist.copy(wrist.matrixWorld)
    workLink.body.copy(sim.pos)
    const working = s.phase === 'fly' && useEva.getState().working
    const tool = useEva.getState().tool
    rig.tools.R.drill.rotation.y += working && tool === 'drill' ? dt * 32 : 0
    const hot = working && (tool === 'welder' || tool === 'cutter')
    const flick = 0.6 + 0.4 * Math.sin(now * 97) * Math.sin(now * 61)
    built.hotMat.color.setRGB(hot ? 6 * flick : 2.5, hot ? 5 * flick : 0.9, hot ? 4 * flick : 0.3)
    built.arc.position.copy(tmp.c)
    g.worldToLocal(built.arc.position)
    built.arc.intensity = hot ? 3.5 * flick : 0
    built.arc.color.set(tool === 'welder' ? '#bfe0ff' : '#ffb070')
    const nearHull = hullClearance(tmp.c, 0.35, tmp.b) > 0
    if (!nearHull && workLink.contact) tmp.b.copy(workLink.A)
    if (hot && (nearHull || workLink.contact)) {
      for (let i = 0; i < 4; i++) {
        tmp.a.copy(tmp.b).multiplyScalar(0.6 + Math.random()).add(tmp.d.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2.4))
        sparks.emit(tmp.c, tmp.a, 0.25 + Math.random() * 0.35, tool === 'welder' ? tmp.col.setRGB(2.2, 2.0, 1.6) : tmp.col.setRGB(2.4, 1.2, 0.35))
      }
    }
    // ドリルの削りかす（作業が進んでいるとき）
    if (working && tool === 'drill' && workLink.contact && Math.random() < 0.7) {
      tmp.a.copy(workLink.A).multiplyScalar(0.4 + Math.random() * 0.5).add(tmp.d.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.9))
      sparks.emit(tmp.c, tmp.a, 0.6 + Math.random() * 0.5, tmp.col.setRGB(0.55, 0.55, 0.6))
    }
    sparks.update(dt)

    // ---- 命綱 ----
    const back = tmp.a.copy(TETHER_BACK).applyMatrix4(g.matrixWorld)
    const backDir = tmp.b.set(0, 0, 1).applyQuaternion(sim.quat)
    const span = back.distanceTo(TETHER_A)
    const slack = Math.max(0, 1 - span / TETHER_M)
    tether.update(TETHER_A, UPV, back, backDir, slack, SIDE)
    // 母船のまわりを自由に飛ぶときは、命綱なし（何百 m も伸ばすと船体を突き抜けてしまう）
    tether.mesh.visible = evaSite.id !== 'ship' && (s.phase !== 'launch' || T > 0.8)

    // ---- カメラ ----
    const cam = state.camera as THREE.PerspectiveCamera
    if (s.phase === 'fly' && s.view === 'head') {
      cam.position.set(0, 0.17, -0.17).applyMatrix4(g.matrixWorld)
      cam.quaternion.copy(sim.quat)
      // 母船のまわりは奥行きが 1 km を超えるので、near を遠めにして遠くの面の精度を保つ
      cam.near = evaSite.id === 'ship' ? 0.08 : 0.02
      sim.camPos.copy(cam.position)
    } else {
      cam.near = evaSite.id === 'ship' ? 0.2 : 0.05
      let wantPos: THREE.Vector3
      let wantLook: THREE.Vector3
      let wantUp: THREE.Vector3
      if (s.phase === 'fly') {
        // 作業中は手もとに寄る
        sim.close += ((workLink.assist ? 1 : 0) - sim.close) * (1 - Math.exp(-dt * 2.5))
        const c = sim.close
        // 速く飛ぶほど、カメラを少し引いて広く見せる
        sim.pull += (Math.min(1.4, sim.vel.length() / 18) - sim.pull) * (1 - Math.exp(-dt * 1.5))
        const pz = 1 + sim.pull
        // 壁や作業ポイントのそばでは、手もとが見えるようにツムギを左寄せ。離れて飛ぶときはまんなか
        const ju = useEvaJobs.getState().ui
        const nearJob = jobsRt.list.length > 0 && ju.jobs.length > 0 && ju.dist < 7
        const wantSide = workLink.assist || nearJob || sim.dSurf < 4 ? 1 : sim.dSurf < 8 ? (8 - sim.dSurf) / 4 : 0
        sim.side += (wantSide - sim.side) * (1 - Math.exp(-dt * 2))
        const sx = sim.side * (0.35 + 0.35 * c)
        // カメラの向きはツムギの向きを少し遅れて追う。位置はいつもツムギから決めるので、旋回しながら速く飛んでも画面から外れない
        if (sim.rigid === 0) sim.camQ.copy(sim.quat)
        sim.camQ.slerp(sim.quat, 1 - Math.exp(-dt * 6))
        wantPos = tmp.a.set(sx * pz, (0.5 - 0.05 * c) * (1 + sim.pull * 0.6), (1.65 - 0.6 * c) * pz).applyQuaternion(sim.camQ).add(sim.pos)
        wantLook = tmp.b.set(sim.side * (0.1 - 0.1 * c), 0.2 - 0.35 * c, -1.2 + 0.6 * c).applyQuaternion(sim.camQ).add(sim.pos)
        wantUp = tmp.c.set(0, 1, 0).applyQuaternion(sim.camQ)
        sim.rigid = Math.min(1, sim.rigid + dt * 0.8)
      } else {
        // 発進・展開・回収：エアロックを斜め上から
        wantPos = tmp.a.set(AIRLOCK.x + 2.4, 1.7, AIRLOCK.z + 3.3)
        wantLook = tmp.b.copy(sim.pos).lerp(OUTSIDE, 0.5)
        wantUp = tmp.c.set(0, 1, 0)
        sim.rigid = 0
      }
      // 飛んでいるときは、発進のカメラから 1 秒ほどで移りきって、あとはツムギにぴったりつく
      const soft = 1 - Math.exp(-dt * (s.phase === 'fly' ? 5 : 2.5))
      const f = s.phase === 'fly' ? Math.max(soft, sim.rigid * sim.rigid) : soft
      sim.camPos.lerp(wantPos, f)
      sim.camLook.lerp(wantLook, f)
      sim.camUp.lerp(wantUp, f).normalize()
      cam.position.copy(sim.camPos)
      cam.up.copy(sim.camUp)
      cam.lookAt(sim.camLook)
      if (evaDebug.cam) {
        const [r, u, b] = evaDebug.cam
        cam.position.set(r, u, b).applyQuaternion(sim.quat).add(sim.pos)
        cam.lookAt(sim.pos)
      }
    }
    const fov = 62 + 10 * Math.min(1, sim.pull / 1.4)
    if (Math.abs(cam.fov - fov) > 0.05) cam.fov = fov
    cam.updateProjectionMatrix()
    focus.copy(sim.pos)

    // ---- 計器（ときどき） ----
    if (now - sim.hudAt > 0.15) {
      sim.hudAt = now
      tmp.a.set(0, 0, -1).applyQuaternion(sim.quat)
      const hdg = ((Math.atan2(tmp.a.x, -tmp.a.z) / D) % 360 + 360) % 360
      useEva.setState({
        hud: {
          speed: Math.round(sim.vel.length() * 100) / 100,
          dist: Math.round(sim.pos.distanceTo(TETHER_A) * 10) / 10,
          alt: Math.max(0, Math.round(hullAlt(sim.pos) * 10) / 10),
          gas: Math.round(sim.gas),
          battery: Math.round(sim.battery),
          x: Math.round(sim.pos.x * 10) / 10,
          z: Math.round(sim.pos.z * 10) / 10,
          hdg: Math.round(hdg),
        },
      })
    }
  })

  // 新しく出すたびに、最初の位置・姿勢から
  useEffect(() => {
    if (phase !== 'launch') return
    sim.pos.copy(INSIDE)
    sim.vel.set(0, 0, 0)
    sim.quat.identity()
    sim.cur = copyPose(P_FOLDED)
    sim.gas = 100
    sim.battery = 100
    sim.swapT = -1
    sim.recallFrom.set(0, 0, 0)
    sim.pull = 0
    sim.side = 0
    sim.rigid = 0
    sim.camPos.set(AIRLOCK.x + 2.4, 1.7, AIRLOCK.z + 3.3)
    sim.camLook.set(AIRLOCK.x, 0.6, AIRLOCK.z)
    sim.camUp.set(0, 1, 0)
    showTool(built.rig, 'R', useEva.getState().tool)
  }, [phase, sim, built])

  return (
    <>
      <group ref={group}>
        <primitive object={built.model} />
      </group>
      <primitive object={puffs.points} />
      <primitive object={sparks.points} />
      <primitive object={tether.mesh} />
    </>
  )
}

const UPV = new THREE.Vector3(0, 1, 0)

// ---- 横回転を水平へもどす（飛行アシスト） ----
const lv = { f: new THREE.Vector3(), r: new THREE.Vector3(), want: new THREE.Vector3(), c: new THREE.Vector3(), q: new THREE.Quaternion() }
function levelRoll(quat: THREE.Quaternion, dt: number) {
  const f = lv.f.set(0, 0, -1).applyQuaternion(quat)
  // 真上・真下を向いているときは、水平がない
  if (Math.abs(f.y) > 0.92) return
  const r = lv.r.set(1, 0, 0).applyQuaternion(quat)
  const want = lv.want.crossVectors(f, UPV).normalize()
  const ang = Math.atan2(lv.c.crossVectors(r, want).dot(f), r.dot(want))
  const k = Math.min(1, dt * 1.6) * (1 - Math.abs(f.y))
  quat.premultiply(lv.q.setFromAxisAngle(f, ang * k)).normalize()
}

// ---- 作業の姿勢へ寄せる ----
const al = { f: new THREE.Vector3(), x: new THREE.Vector3(), z: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), tilt: new THREE.Quaternion(), want: new THREE.Vector3() }
/** 上の向き = workLink.U、前 = 作業する点のほう。真上から作業するときは少し前かがみ。ツールの先が点に来る位置へ */
function alignToWork(quat: THREE.Quaternion, pos: THREE.Vector3, dt: number) {
  const { U, A, P, tipLocal } = workLink
  const f = al.f.copy(A).negate()
  f.addScaledVector(U, -f.dot(U))
  const fromAbove = Math.abs(A.dot(U)) > 0.9
  if (f.lengthSq() < 0.01) {
    f.set(0, 0, -1).applyQuaternion(quat)
    f.addScaledVector(U, -f.dot(U))
  }
  if (f.lengthSq() < 1e-4) f.set(0, 0, -1)
  f.normalize()
  al.z.copy(f).negate()
  al.x.crossVectors(U, al.z).normalize()
  al.m.makeBasis(al.x, U, al.z)
  al.q.setFromRotationMatrix(al.m)
  if (fromAbove) al.q.multiply(al.tilt.setFromAxisAngle(AX, -0.55))
  const k = 1 - Math.exp(-dt * 4)
  quat.slerp(al.q, k).normalize()
  al.want.copy(tipLocal).applyQuaternion(al.q).negate().add(P).addScaledVector(A, 0.03)
  pos.lerp(al.want, 1 - Math.exp(-dt * 3))
}
const SIDE = new THREE.Vector3(1, 0, 0.3).normalize()

/** ツムギのいる場所（日の光の影を描く範囲を合わせるため） */
export const focus = new THREE.Vector3()
/** ハッチの開き具合（0 = 閉、1 = 開）。Tsumugi が書き、外壁の場面が読む */
export const hatchState = { get: () => 0 }

useGLTF.preload(url('eva-tsumugi.glb'))
