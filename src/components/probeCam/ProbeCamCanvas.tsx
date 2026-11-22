import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Sky } from '../Sky'
import { textureUrl } from '../../data/textures'
import { PLANETS } from '../../data/bodies'
import { encounterRelative, type Encounter, type Trajectory } from '../../data/trajectory'
import { earthHelio, earthPrimeMeridian, moonGeocentric, poleOf, probeNow, type ProbeNow } from '../../data/probeView'
import { groundKm, groundNormal, PATCH_LIFT_KM, RyuguBody, ryuguSpin } from './ryugu'
import { roomEnvironment } from '../telescope/parts'
import { moonFocus, OrbitTrail, SaturnMoons } from './saturn'
import { probeClock } from '../../state/probes'

// 探査機の模型の画面（右側）。探査機を真ん中に置き、まわりは本物の向きで並べる：
//  ・太陽の光の向き、星空（星表の本物の星）、地球の向き（大きなアンテナはいつも地球へ）
//  ・惑星のそばでは、その惑星を本物の見かけの大きさで、探査機の道すじ（惑星の重力で曲がる双曲線）と一緒に
//  ・太陽から見た速さの矢印（スイングバイで、のびて向きが変わる）
// 遠くの物は「同じ見かけの大きさのまま、近くに縮めて」置く（FAR の距離に、半径も同じ割合で）。
// 座標は画面の軸（黄道の x, 北, -y）。探査機の模型の1単位は1m。

const DAY_MS = 86_400_000
/** 遠くの物を置く距離（表示の単位） */
const FAR = 1000
/** 速さの矢印：1 km/s あたりの長さ（m） */
const ARROW_PER_KMS = 0.6
const ARROW_COLOR = new THREE.Color('#ffb347').multiplyScalar(1.6)

/** 黄道座標を画面の軸に */
const toScreen = (r: number[], out = new THREE.Vector3()) => out.set(r[0], r[2], -r[1])

/** 今の数字（毎フレーム。字幕や計器は、これを読む） */
export const probeLive: { now: ProbeNow | null; ground: THREE.Vector3 | null } = { now: null, ground: null }

/** 模型ごとの決まり */
type ModelSetup = {
  /** 地球へ向ける軸（大きなアンテナの開いた側）と、黄道の北の側へ倒す軸 */
  dish: THREE.Vector3
  boom: THREE.Vector3
  /** 小惑星にとどまるあいだは、dish の軸を小惑星と反対へ（下面のサンプラーを小惑星へ） */
  faceAway?: boolean
  /** 材質を、つやの弱い塗装らしく */
  matte?: boolean
  /** 金属の照り返し（金色の断熱材など） */
  env?: boolean
  /** 本体を真ん中に寄せる */
  recenter?: (root: THREE.Object3D) => void
  /** 速さの矢印の太さ・長さの倍率（模型の大きさに合わせる） */
  arrow: number
  /** カメラ：はじめの位置と、近づける・離れる限り（m） */
  camera: { start: [number, number, number]; min: number; max: number }
  /**
   * 途中で切りはなす部品（カッシーニのホイヘンス）：名前が suffix で終わる部品を、ms の時刻に、
   * 模型の axis の向きへ speed（m/s）で押し出し、spinRpm で回しながら離していく（far m より離れたら隠す）
   */
  detach?: { suffix: string; ms: number; axis: THREE.Vector3; speed: number; spinRpm: number; far: number }
}

const MODELS: Record<string, ModelSetup> = {
  // NASA の模型（Voyager Probe (B)）：大きなアンテナの開いた側が +Y、磁力計のさおが +Z
  'probe-voyager.glb': {
    dish: new THREE.Vector3(0, 1, 0),
    boom: new THREE.Vector3(0, 0, 1),
    matte: true,
    // 本体（アンテナの下の十角形の箱）を真ん中に
    recenter: (root) => {
      const box = new THREE.Box3().setFromObject(root)
      root.position.set((-(box.min.x + box.max.x) / 2) * 0.6, -0.6, (-(box.min.z + box.max.z) / 2) * 0.2)
    },
    arrow: 1,
    camera: { start: [26, 10, 22], min: 12, max: 90 },
  },
  // はやぶさ2（tools/blender/build_hayabusa2.py）：上面の平らなアンテナが +Y、太陽電池の翼が ±Z
  'probe-hayabusa2.glb': {
    dish: new THREE.Vector3(0, 1, 0),
    boom: new THREE.Vector3(0, 0, 1),
    faceAway: true,
    env: true,
    arrow: 0.3,
    camera: { start: [9, 4, 8], min: 4, max: 120 },
  },
  // NASA の模型（Cassini-Huygens (A)）：大きなアンテナの開いた側が +Y、磁力計のさお（11 m）が -Z、ホイヘンスが +X の側
  'probe-cassini.glb': {
    dish: new THREE.Vector3(0, 1, 0),
    boom: new THREE.Vector3(0, 0, -1),
    env: true,
    recenter: (root) => root.position.set(0, 0.6, 0),
    arrow: 0.7,
    camera: { start: [30, 12, 26], min: 10, max: 140 },
    // 2004年12月25日 02:00（世界時）、ばねで秒速 35 cm で押し出し、毎分7回転させて切りはなした
    detach: { suffix: '_h', ms: Date.UTC(2004, 11, 25, 2, 0), axis: new THREE.Vector3(1, 0, 0), speed: 0.35, spinRpm: 7, far: 3000 },
  },
}
const setupOf = (model: string): ModelSetup => MODELS[model] ?? MODELS['probe-voyager.glb']

function ProbeModel({ url, setup }: { url: string; setup: ModelSetup }) {
  const { scene } = useGLTF(url)
  const gl = useThree((s) => s.gl)
  const group = useRef<THREE.Group>(null!)
  const model = useMemo(() => {
    const root = scene.clone(true)
    const env = setup.env ? roomEnvironment(gl) : null
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshStandardMaterial
      if (setup.matte) {
        // 元の模型は少しつやが強い。断熱材や塗装らしく
        mat.roughness = 0.62
        mat.metalness = 0.15
      }
      mesh.castShadow = true
      if (env) {
        mat.envMap = env
        mat.envMapIntensity = 0.5
      }
    })
    setup.recenter?.(root)
    // 切りはなす部品：元の場所のものと、離れていく写し（回す中心は、部品の真ん中）
    const parts: THREE.Object3D[] = []
    let flying: THREE.Group | null = null
    let spinner: THREE.Group | null = null
    if (setup.detach) {
      const suffix = setup.detach.suffix
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.name.endsWith(suffix)) parts.push(o)
      })
      root.updateMatrixWorld(true)
      const box = new THREE.Box3()
      parts.forEach((o) => box.expandByObject(o))
      const center = box.getCenter(new THREE.Vector3())
      flying = new THREE.Group()
      spinner = new THREE.Group()
      flying.position.copy(center)
      flying.add(spinner)
      for (const o of parts) {
        const copy = o.clone()
        copy.matrixAutoUpdate = false
        copy.matrix.copy(o.matrixWorld).premultiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z))
        spinner.add(copy)
      }
      flying.visible = false
    }
    return { root, parts, flying, spinner, home: flying?.position.clone() ?? null }
  }, [scene, setup, gl])
  const m = new THREE.Matrix4()
  const toEarth = new THREE.Vector3()
  const north = new THREE.Vector3(0, 1, 0)
  const side = new THREE.Vector3()
  const up = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const local = useMemo(() => new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(setup.dish, setup.boom), setup.dish, setup.boom).invert(), [setup])
  useFrame(() => {
    const now = probeLive.now
    if (!now) return
    if (setup.faceAway && now.rel && now.encounter.until !== undefined && Math.hypot(...now.rel) < 200) {
      // 小惑星のそば：上面を小惑星と反対へ（下面のサンプラーが小惑星を向く）
      toScreen(now.rel, toEarth).normalize()
    } else {
      const e = earthHelio(now.ms)
      toScreen([e[0] - now.r[0], e[1] - now.r[1], e[2] - now.r[2]], toEarth).normalize()
    }
    // アンテナ → 地球、さお → 北（アンテナの向きに直角な成分）
    up.copy(north).addScaledVector(toEarth, -north.dot(toEarth))
    if (up.lengthSq() < 1e-6) up.set(1, 0, 0)
    up.normalize()
    side.crossVectors(toEarth, up)
    m.makeBasis(side, toEarth, up).multiply(local)
    q.setFromRotationMatrix(m)
    group.current.quaternion.slerp(q, 0.2)
    const dt = setup.detach
    if (dt && model.flying && model.spinner && model.home) {
      const sec = (now.ms - dt.ms) / 1000
      const gone = sec >= 0
      model.parts.forEach((o) => (o.visible = !gone))
      const dist = dt.speed * sec
      model.flying.visible = gone && dist < dt.far
      if (model.flying.visible) {
        model.flying.position.copy(model.home).addScaledVector(dt.axis, dist)
        model.spinner.quaternion.setFromAxisAngle(dt.axis, ((sec * dt.spinRpm) / 60) * Math.PI * 2)
      }
    }
  })
  return (
    <group ref={group}>
      <primitive object={model.root} />
      {model.flying && <primitive object={model.flying} />}
    </group>
  )
}

/** 速さの矢印（太陽から見た速度の向き。長さは速さに比例）。スイングバイで、のびて向きが変わるのが見える */
function SpeedArrow({ scale }: { scale: number }) {
  const group = useRef<THREE.Group>(null!)
  const shaft = useRef<THREE.Mesh>(null!)
  const head = useRef<THREE.Mesh>(null!)
  const dir = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  useFrame(() => {
    const now = probeLive.now
    if (!now) return
    toScreen(now.v, dir).normalize()
    group.current.quaternion.setFromUnitVectors(up, dir)
    const len = Math.max(2, now.speed * ARROW_PER_KMS)
    shaft.current.scale.set(1, len, 1)
    shaft.current.position.y = len / 2
    head.current.position.y = len
  })
  return (
    <group ref={group} scale={scale}>
      <mesh ref={shaft} renderOrder={2}>
        <cylinderGeometry args={[0.1, 0.1, 1, 12, 1, true]} />
        <meshBasicMaterial color={ARROW_COLOR} toneMapped={false} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh ref={head} renderOrder={2}>
        <coneGeometry args={[0.45, 1.4, 20]} />
        <meshBasicMaterial color={ARROW_COLOR} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** 太陽：光の向きと、まぶしい点 */
function SunLight() {
  const light = useRef<THREE.DirectionalLight>(null!)
  const glow = useRef<THREE.Sprite>(null!)
  const map = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,250,235,1)')
    grad.addColorStop(0.15, 'rgba(255,236,190,0.9)')
    grad.addColorStop(1, 'rgba(255,200,120,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  }, [])
  const d = new THREE.Vector3()
  useFrame(() => {
    const now = probeLive.now
    if (!now) return
    toScreen(now.r, d).normalize().negate()
    light.current.position.copy(d).multiplyScalar(100)
    glow.current.position.copy(d).multiplyScalar(FAR * 1.6)
    // 遠くなるほど小さく（ただし見失わない大きさは残す）
    glow.current.scale.setScalar(FAR * 1.6 * Math.max(0.025, 0.18 / now.sunAu))
    // 太陽から遠いほど光は弱いが、本物どおりだと海王星では 900 分の 1 で真っ暗になるので、やわらげる
    light.current.intensity = 3.2 / Math.pow(Math.max(1, now.sunAu), 0.25)
  })
  return (
    <>
      {/* 影：小惑星へ降りるとき、太陽を背にした探査機の影が地面に落ちる（探査機のまわり ±12 m） */}
      <directionalLight
        ref={light}
        intensity={3}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={50}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
      />
      <sprite ref={glow} renderOrder={-0.4}>
        <spriteMaterial map={map} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} toneMapped={false} />
      </sprite>
    </>
  )
}

function PlanetSphere({ id, ms }: { id: string; ms: number }) {
  const url = textureUrl(id)!
  const map = useTexture(url)
  map.colorSpace = THREE.SRGBColorSpace
  const ringMap = useTexture(textureUrl('saturnRing')!)
  const planet = PLANETS.find((p) => p.id === id)!
  const spin = useRef<THREE.Group>(null!)
  const orient = useMemo(() => {
    const pole = toScreen(poleOf(id)).normalize()
    // 経度0の向き：地球は本物（その時刻の恒星時から）、ほかは自転の速さで回す
    const pm = id === 'earth' ? toScreen(earthPrimeMeridian(ms)) : new THREE.Vector3(1, 0, 0)
    pm.addScaledVector(pole, -pm.dot(pole)).normalize()
    const east = new THREE.Vector3().crossVectors(pm, pole)
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(pm, pole, east))
  }, [id, ms])
  useFrame(() => {
    if (id === 'earth') {
      spin.current.quaternion.setFromRotationMatrix(
        (() => {
          const pole = toScreen(poleOf('earth')).normalize()
          const pm = toScreen(earthPrimeMeridian(probeClock.ms))
          pm.addScaledVector(pole, -pm.dot(pole)).normalize()
          return new THREE.Matrix4().makeBasis(pm, pole, new THREE.Vector3().crossVectors(pm, pole))
        })(),
      )
    } else spin.current.quaternion.copy(orient).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((probeClock.ms / 3_600_000) / planet.rotationHours) * Math.PI * 2))
  })
  const r = planet.radiusKm
  return (
    <group ref={spin}>
      <mesh scale={r}>
        <sphereGeometry args={[1, 96, 64]} />
        <meshStandardMaterial map={map} roughness={1} metalness={0} />
      </mesh>
      {planet.ring && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * planet.ring.inner, r * planet.ring.outer, 192, 1]} />
          <meshStandardMaterial map={ringMap} alphaMap={ringMap} transparent side={THREE.DoubleSide} depthWrite={false} roughness={1} />
        </mesh>
      )}
    </group>
  )
}

/** 地球の月（打ち上げの場面） */
function Moon() {
  const map = useTexture(textureUrl('moon')!)
  map.colorSpace = THREE.SRGBColorSpace
  const mesh = useRef<THREE.Mesh>(null!)
  useFrame(() => toScreen(moonGeocentric(probeClock.ms), mesh.current.position))
  return (
    <mesh ref={mesh} scale={1737}>
      <sphereGeometry args={[1, 48, 32]} />
      <meshStandardMaterial map={map} roughness={1} />
    </mesh>
  )
}

/** はやぶさ2が表面まで降りたときの、リュウグウの中心からの距離（km） */
const RYUGU_SURFACE_KM = 0.46
/** リュウグウの自転軸（画面の軸） */
const RYUGU_AXIS = toScreen(poleOf('ryugu')).normalize()

/** 下面のサンプラーホーンの先までの長さ（km）。タッチダウンで、ちょうど表面にふれる */
const HORN_KM = 0.0017

/** 通過する惑星と、その重力で曲がる道すじ（惑星中心、km の空間を、見かけの大きさを保って縮める） */
function Encounter({ encounter, launch }: { encounter: Encounter; launch: boolean }) {
  const group = useRef<THREE.Group>(null!)
  const spin = useRef<THREE.Group>(null!)
  const isRyugu = encounter.body === 'ryugu'
  // 土星を回るカッシーニ：道すじは今の前後だけを作る（13年分は描かない）
  const orbiting = !!encounter.samples
  const dips = useMemo(() => encounter.hover?.dips ?? [], [encounter])
  // 表面へ降りる場所（リュウグウの模型の向き）：降りる時刻の、探査機の真下
  const sites = useMemo(
    () =>
      dips.map((d) => {
        const q = ryuguSpin(d.ms, dips, RYUGU_AXIS, new THREE.Quaternion()).invert()
        return toScreen(encounterRelative(encounter, d.ms).r).normalize().applyQuaternion(q)
      }),
    [dips, encounter],
  )
  const active = useRef({ site: -1, height: 1e9 })
  const normal = new THREE.Vector3()
  const burst = useRef({ site: -1, at: 0 })
  const lastMs = useRef(0)
  const span = encounter.window * DAY_MS
  const { full, done, tail, times, pts } = useMemo(() => {
    const times: number[] = []
    const n = 600
    // 最接近（とどまる天体なら、着いた日と離れた日）のまわりほど細かく
    for (let i = 0; i <= n; i++) times.push(encounter.ms - (1 - i / n) ** 3 * span)
    if (encounter.until !== undefined && !orbiting) for (let ms = encounter.ms + 3_600_000; ms < encounter.until; ms += 3_600_000) times.push(ms)
    const end = encounter.until ?? encounter.ms
    if (!orbiting) for (let i = 1; i <= n; i++) times.push(end + (i / n) ** 3 * span)
    // 打ち上げの道すじは、打ち上げのあとだけ
    const list = launch ? times.filter((ms) => ms >= encounter.ms) : times
    const pts = list.map((ms) => toScreen(encounterRelative(encounter, ms).r))
    const geometry = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = (opacity: number) => new THREE.LineBasicMaterial({ color: 0xb59cff, transparent: true, opacity, depthWrite: false, toneMapped: false })
    // 通ったところの最後の点から、今の探査機までをつなぐ短い線（点と点の間が広いので、すき間が見えないように）
    const tail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), mat(0.95))
    tail.frustumCulled = false
    const full = new THREE.Line(geometry, mat(0.28))
    const done = new THREE.Line(geometry, mat(0.95))
    full.frustumCulled = done.frustumCulled = false
    return { full, done, tail, times: list, pts }
  }, [encounter, span, launch, orbiting])
  useEffect(
    () => () => {
      full.geometry.dispose()
      tail.geometry.dispose()
    },
    [full, tail],
  )
  const rel = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const qi = new THREE.Quaternion()
  useFrame(() => {
    const now = probeLive.now
    if (!now?.rel || now.encounter !== encounter) {
      group.current.visible = false
      if (isRyugu && now?.encounter !== encounter) probeLive.ground = null
      return
    }
    group.current.visible = true
    toScreen(now.rel, rel)
    let len = rel.length()
    if (isRyugu && spin.current) {
      ryuguSpin(now.ms, dips, RYUGU_AXIS, q)
      spin.current.quaternion.copy(q)
      // 模型の地面の高さに合わせる：表面まで降りたとき、サンプラーの先がちょうど地面にふれる
      const height = Math.max(0, len - (encounter.hover?.surfaceKm ?? 0))
      dir.copy(rel).normalize().applyQuaternion(qi.copy(q).invert())
      len = groundKm(dir) + PATCH_LIFT_KM + HORN_KM + height
      // 近くの細かい地面は、降りていく前後だけ
      active.current = { site: height < 0.6 ? dips.findIndex((d) => Math.abs(d.ms - now.ms) < d.hours * 2 * 3_600_000) : -1, height }
      // 真下の地面の向き（カメラの「上」に使う。そろばん玉の斜面では、中心から外への向きとずれる）
      probeLive.ground = groundNormal(dir, normal).applyQuaternion(q)
      // タッチダウン（3番目と4番目）の瞬間を過ぎたら、砂を舞い上げる
      dips.forEach((d, i) => {
        if (i >= 2 && (lastMs.current - d.ms) * (now.ms - d.ms) <= 0 && lastMs.current !== now.ms && Math.abs(now.ms - d.ms) < 3_600_000)
          burst.current = { site: i, at: performance.now() }
      })
      lastMs.current = now.ms
    }
    // 遠くの物は見かけの大きさを保って縮める。1 km より近いときは本当の大きさ（1単位 = 1 m）
    const k = Math.min(FAR / len, 1000)
    group.current.scale.setScalar(k)
    group.current.position.copy(rel).setLength(len * k).negate()
    // 二分探索で、過ぎた点の数
    let lo = 0
    let hi = times.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (times[mid] < now.ms) lo = mid + 1
      else hi = mid
    }
    done.geometry.setDrawRange(0, lo)
    tail.visible = !orbiting || now.ms < encounter.ms
    const end = tail.geometry.attributes.position as THREE.BufferAttribute
    const from = pts[Math.max(0, lo - 1)]
    rel.setLength(len)
    end.setXYZ(0, from.x, from.y, from.z)
    end.setXYZ(1, rel.x, rel.y, rel.z)
    end.needsUpdate = true
  })
  const live = () => (probeLive.now?.encounter === encounter && probeLive.now.rel ? probeLive.now.ms : null)
  const liveRel = () => (probeLive.now?.encounter === encounter && probeLive.now.rel ? { ms: probeLive.now.ms, rel: probeLive.now.rel } : null)
  return (
    <>
    {orbiting && <SaturnMoons encounter={encounter} now={liveRel} />}
    <group ref={group} visible={false}>
      <primitive object={full} />
      <primitive object={done} />
      <primitive object={tail} />
      {orbiting && <OrbitTrail encounter={encounter} now={live} />}
      <Suspense fallback={null}>
        {isRyugu ? <RyuguBody spin={spin} sites={sites} active={active} burst={burst} /> : <PlanetSphere id={encounter.body} ms={encounter.ms} />}
        {encounter.body === 'earth' && <Moon />}
      </Suspense>
    </group>
    </>
  )
}

/** カメラ：しばらく触っていなければ、惑星が探査機の向こうに見える位置へ、ゆっくり回り込む */
function CameraRig({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const camera = useThree((s) => s.camera)
  const touched = useRef(-1e9)
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const on = () => (touched.current = performance.now())
    c.addEventListener('start', on)
    c.addEventListener('end', on)
    return () => {
      c.removeEventListener('start', on)
      c.removeEventListener('end', on)
    }
  }, [controls])
  const want = new THREE.Vector3()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const north = new THREE.Vector3(0, 1, 0)
  const upWant = new THREE.Vector3()
  useFrame((_, delta) => {
    const now = probeLive.now
    if (!now || performance.now() - touched.current < 6000) return
    const dist = camera.position.length()
    upWant.copy(north)
    if (now.rel && moonFocus.dir && now.encounter.samples) {
      // 近くの衛星（エンケラドゥスなど）があれば、その衛星が探査機の少し奥に見える位置から
      a.copy(moonFocus.dir).negate()
      b.crossVectors(a, north)
      if (b.lengthSq() < 1e-6) b.set(1, 0, 0)
      b.normalize()
      want.copy(a).addScaledVector(b, 0.3).addScaledVector(north, 0.18)
    } else if (now.rel) {
      // 惑星の反対側の、少し横・上から（惑星が探査機の少し奥に見える。真うしろだと小さい惑星が模型に隠れる）
      toScreen(now.rel, a).normalize()
      b.crossVectors(a, north)
      if (b.lengthSq() < 1e-6) b.set(1, 0, 0)
      b.normalize()
      if (now.encounter.body === 'ryugu') {
        // 小さな小惑星（高さ alt km）：
        //  ・上空（1.5 km より上）… 遠くの横から望遠で。小惑星が探査機の横に、探査機に隠れずに見える
        //  ・降りていくとき … 探査機の斜め上から、下の地面を見下ろす
        //  ・地面すれすれ（20 m より下）… 横から、地面と探査機の影が見えるように
        const alt = Math.hypot(...now.rel) - RYUGU_SURFACE_KM
        const g = THREE.MathUtils.clamp(Math.log(Math.max(alt, 1e-4) / 0.02) / Math.log(60), 0, 1)
        const f = THREE.MathUtils.clamp((alt - 1.2) / 1.5, 0, 1)
        // カメラの、探査機の真上（小惑星と反対の向き）からの角度：地面すれすれ 76°、降りはじめ 14°、上空 6°
        // （小惑星は探査機の真うしろ。角度が小さいほど、小惑星が探査機のすぐ横に見える）
        const theta = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(THREE.MathUtils.lerp(76, 14, g), 6, f))
        const along = Math.cos(theta)
        const across = Math.sin(theta)
        // 低いところでは、真下の地面の向きを「上」に（斜面でも、地面が画面の下に来る）
        // （地面の向きを使うのは地面すれすれだけ。高くなるほど小惑星の中心と反対の向きへ。上空では小惑星が探査機の真うしろに来る）
        const ground = (probeLive.ground ?? a).clone().lerp(a, Math.max(f, g)).normalize()
        const c = b.clone().addScaledVector(ground, -b.dot(ground)).normalize()
        want.copy(ground).multiplyScalar(along).addScaledVector(c, across)
        upWant.copy(north).lerp(ground, 1 - f).normalize()
      } else want.copy(a).addScaledVector(b, 0.22).addScaledVector(north, 0.16)
    } else {
      // 進む向きの斜め後ろから
      toScreen(now.v, b).normalize()
      a.crossVectors(b, north).normalize()
      want.copy(b).multiplyScalar(-0.55).addScaledVector(a, 0.75).addScaledVector(north, 0.35)
    }
    // 小さな小惑星のそばでは、望遠で遠くから（20 km 上空のリュウグウは、本当は 3° ほどの大きさ）
    let tele = 1
    let far = dist
    if (now.rel && now.encounter.body === 'ryugu') {
      const km = Math.hypot(...now.rel)
      const f = THREE.MathUtils.clamp(Math.log(km / 1.5) / Math.log(15 / 1.5), 0, 1)
      tele = 1 + f
      far = THREE.MathUtils.lerp(16, 110, f)
    }
    camera.up.lerp(upWant, 1 - Math.exp(-delta * 1.2)).normalize()
    const cam = camera as THREE.PerspectiveCamera
    const zoom = THREE.MathUtils.lerp(cam.zoom, tele, 1 - Math.exp(-delta * 0.8))
    if (Math.abs(zoom - cam.zoom) > 1e-4) {
      cam.zoom = zoom
      cam.updateProjectionMatrix()
    }
    const len = THREE.MathUtils.lerp(dist, far, 1 - Math.exp(-delta * 0.8))
    want.normalize().multiplyScalar(len)
    camera.position.lerp(want, 1 - Math.exp(-delta * 0.6)).setLength(len)
    camera.lookAt(0, 0, 0)
  })
  return null
}

function Live({ trajectory }: { trajectory: Trajectory }) {
  useFrame(() => {
    probeLive.now = probeNow(trajectory, probeClock.ms)
  }, -10)
  return null
}

export default function ProbeCamCanvas({ trajectory, model }: { trajectory: Trajectory; model: string }) {
  const controls = useRef<OrbitControlsImpl | null>(null)
  probeLive.now = probeNow(trajectory, probeClock.ms)
  const dpr = Math.min(window.devicePixelRatio, 1.5)
  const setup = setupOf(model)
  return (
    <Canvas
      dpr={dpr}
      shadows
      camera={{ position: setup.camera.start, fov: 40, near: 0.1, far: 6000 }}
      gl={{ antialias: true }}
      // 確かめ用（#debug のときだけ）：カメラと場面を外から見られるように
      onCreated={(s) => {
        if (location.hash.includes('debug')) (window as unknown as { __probeCam: unknown }).__probeCam = s
      }}
    >
      <Live trajectory={trajectory} />
      <Sky />
      <ambientLight intensity={0.12} />
      <SunLight />
      <Suspense fallback={null}>
        <ProbeModel url={`${import.meta.env.BASE_URL}models/${model}`} setup={setup} />
      </Suspense>
      <SpeedArrow scale={setup.arrow} />
      {trajectory.encounters.map((e, i) => (
        <Encounter key={e.ms} encounter={e} launch={i === 0} />
      ))}
      <OrbitControls ref={controls} enablePan={false} minDistance={setup.camera.min} maxDistance={setup.camera.max} />
      <CameraRig controls={controls} />
    </Canvas>
  )
}
