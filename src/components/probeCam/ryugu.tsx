import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { RYUGU_ROTATION_HOURS } from '../../data/probeView'

// 探査機の模型の画面の、小惑星リュウグウ（tools/blender/build_ryugu.py の模型、1単位 = 1 km、+Y が北極）。
//  ・地面の高さの表（ryugu-height.bin）から、探査機を地面にちょうど降ろす
//  ・表面へ降りる前後は、自転をゆるめて、降りる場所が探査機の真下にとどまるようにする（本物も、降りる場所の動きに合わせて降りた）
//  ・降りる場所のまわり（半径 130 m）だけ、細かい地面と小石を重ねる。太陽を背にして降りるので、探査機の影が地面に落ちる
//  ・タッチダウンでは、舞い上がる砂

export type Dip = { ms: number; hours: number }

/** 地面の高さの表：緯度 -90〜90°（181）× 経度 -180〜179°（360）。300 m からの cm */
const HEIGHT_URL = `${import.meta.env.BASE_URL}models/ryugu-height.bin`
let heights: Uint16Array | null = null
let loading: Promise<void> | null = null
function loadHeights() {
  loading ??= fetch(HEIGHT_URL)
    .then((r) => r.arrayBuffer())
    .then((b) => {
      heights = new Uint16Array(b)
    })
    .catch(() => {})
  return loading
}

/** 模型の向き（+Y が北極）の単位ベクトルの方向の、中心から地面までの距離（km）。表がまだなら平均の半径 */
export function groundKm(d: THREE.Vector3) {
  const h = heights
  if (!h) return 0.46
  const lat = (Math.asin(Math.max(-1, Math.min(1, d.y))) * 180) / Math.PI + 90
  let lon = (Math.atan2(d.z, d.x) * 180) / Math.PI + 180
  if (lon >= 360) lon -= 360
  const i = Math.min(179, Math.floor(lat))
  const j = Math.floor(lon)
  const fi = lat - i
  const fj = lon - j
  const j2 = (j + 1) % 360
  const at = (a: number, b: number) => 0.3 + h[a * 360 + b] / 1e5
  return (at(i, j) * (1 - fj) + at(i, j2) * fj) * (1 - fi) + (at(i + 1, j) * (1 - fj) + at(i + 1, j2) * fj) * fi
}

/** 地面の向き（外向きの法線、模型の向き）。表の 1° 先との差から */
export function groundNormal(d: THREE.Vector3, out: THREE.Vector3) {
  const t1 = new THREE.Vector3(0, 1, 0).cross(d)
  if (t1.lengthSq() < 1e-8) t1.set(1, 0, 0)
  t1.normalize()
  const t2 = new THREE.Vector3().crossVectors(d, t1)
  const e = Math.PI / 180
  const p0 = d.clone().multiplyScalar(groundKm(d))
  const d1 = d.clone().addScaledVector(t1, e).normalize()
  const d2 = d.clone().addScaledVector(t2, e).normalize()
  const a = d1.multiplyScalar(groundKm(d1)).sub(p0)
  const b = d2.multiplyScalar(groundKm(d2)).sub(p0)
  out.crossVectors(a, b).normalize()
  if (out.dot(d) < 0) out.negate()
  return out
}

/** 誤差関数（近似、誤差 1.5e-7） */
function erf(x: number) {
  const s = Math.sign(x)
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return s * y
}

/**
 * 自転の角度（ラジアン）。7.63 時間で1回だが、表面へ降りる前後（探査機の高さと同じ形のつりがね）だけゆるめ、
 * 降りる瞬間は止まって見えるように（回る速さ ×(1 − 降りる度合い) を足し合わせた角度）
 */
function spinAngle(ms: number, dips: Dip[]) {
  const omega = (2 * Math.PI) / (RYUGU_ROTATION_HOURS * 3_600_000)
  let t = ms
  for (const d of dips) {
    const sigma = d.hours * 3_600_000
    t -= ((sigma * Math.sqrt(Math.PI)) / 2) * erf((ms - d.ms) / sigma)
  }
  return (omega * t) % (2 * Math.PI)
}

/** リュウグウの向き（画面の軸で）：自転軸 axis（ほぼ黄道の南）のまわりを回す */
export function ryuguSpin(ms: number, dips: Dip[], axis: THREE.Vector3, out: THREE.Quaternion) {
  const base = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
  return out.setFromAxisAngle(axis, spinAngle(ms, dips)).multiply(base)
}

// ---- 細かい地面 ----

/** 決まった順の乱数（いつも同じ地面になるように） */
function random(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/** なめらかな値の雑音（m の平面の上） */
function valueNoise(seed: number, period = 0) {
  const hash = (x: number, y: number) => {
    if (period) {
      x = ((x % period) + period) % period
      y = ((y % period) + period) % period
    }
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const fx = x - xi
    const fy = y - yi
    const u = fx * fx * (3 - 2 * fx)
    const v = fy * fy * (3 - 2 * fy)
    const a = hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u
    const b = hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u
    return a * (1 - v) + b * v - 0.5
  }
}

/** 地面のこまかい模様（黒い砂と小石）。4 m で1枚 */
let regolith: THREE.CanvasTexture | null = null
function regolithTexture() {
  if (regolith) return regolith
  const n = 256
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  const img = g.createImageData(n, n)
  const rnd = random(11)
  const noise = valueNoise(5, 16)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      // くり返しても継ぎ目が出ないよう、周期のある雑音
      const v = 0.84 + noise((x / n) * 16, (y / n) * 16) * 0.3 + (rnd() - 0.5) * 0.22
      const k = (y * n + x) * 4
      const g8 = Math.max(0, Math.min(255, v * 255))
      img.data[k] = g8
      img.data[k + 1] = g8 * 0.97
      img.data[k + 2] = g8 * 0.93
      img.data[k + 3] = 255
    }
  g.putImageData(img, 0, 0)
  // 小石の点（明るいものと暗いもの）
  for (let i = 0; i < 900; i++) {
    const r = 0.6 + rnd() ** 3 * 3.5
    const shade = rnd() < 0.5 ? 120 + rnd() * 60 : 225 + rnd() * 30
    g.fillStyle = `rgb(${shade},${shade * 0.97},${shade * 0.93})`
    g.beginPath()
    g.ellipse(rnd() * n, rnd() * n, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2)
    g.fill()
  }
  regolith = new THREE.CanvasTexture(c)
  regolith.wrapS = regolith.wrapT = THREE.RepeatWrapping
  regolith.colorSpace = THREE.SRGBColorSpace
  regolith.anisotropy = 4
  return regolith
}

const PATCH_KM = 0.13
/** 細かい地面を、元の模型の地面より少し上に（真ん中 30 cm、はしは少し下に沈めて、元の地面へ消える） */
const lift = (rho: number) => 0.0003 * (1 - (rho / PATCH_KM) ** 2) - 0.0002 * (rho / PATCH_KM) ** 6
/** 探査機の真下に、こぶも小石もない広さ（km） */
const CLEAR_KM = 0.004

/** 降りる場所 center（模型の向きの単位ベクトル）のまわりの、細かい地面と小石 */
function buildPatch(center: THREE.Vector3, seed: number, ground: THREE.Color, rockColor: THREE.Color) {
  const t1 = new THREE.Vector3(0, 1, 0).cross(center)
  if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0)
  t1.normalize()
  const t2 = new THREE.Vector3().crossVectors(center, t1)
  const noise = valueNoise(seed)
  /** こぶの高さ（km）。x, y は km */
  const bump = (x: number, y: number) => {
    const rho = Math.hypot(x, y)
    const m = (rho - CLEAR_KM) / 0.004
    const keep = m <= 0 ? 0 : m >= 1 ? 1 : m * m * (3 - 2 * m)
    const mx = x * 1000
    const my = y * 1000
    return keep * (noise(mx / 6, my / 6) * 0.5 + noise(mx / 1.8, my / 1.8) * 0.16 + noise(mx / 0.6, my / 0.6) * 0.05) * 0.001
  }
  const dir = new THREE.Vector3()
  const at = (x: number, y: number, out: THREE.Vector3) => {
    dir.copy(center).multiplyScalar(0.46).addScaledVector(t1, x).addScaledVector(t2, y).normalize()
    return out.copy(dir).multiplyScalar(groundKm(dir) + lift(Math.hypot(x, y)) + bump(x, y))
  }
  // 地面：同心円のます目（真ん中ほど細かく）
  const RINGS = 70
  const SEG = 128
  const pos: number[] = []
  const uv: number[] = []
  const p = new THREE.Vector3()
  for (let i = 0; i <= RINGS; i++) {
    const rho = PATCH_KM * (i / RINGS) ** 1.6
    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2
      const x = Math.cos(a) * rho
      const y = Math.sin(a) * rho
      at(x, y, p)
      pos.push(p.x, p.y, p.z)
      uv.push((x * 1000) / 4, (y * 1000) / 4)
    }
  }
  const index: number[] = []
  for (let i = 0; i < RINGS; i++)
    for (let j = 0; j < SEG; j++) {
      const a = i * SEG + j
      const b = i * SEG + ((j + 1) % SEG)
      const c = a + SEG
      const d = b + SEG
      index.push(a, c, b, b, c, d)
    }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(index)
  geo.computeVertexNormals()
  const ground_ = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: ground.clone().multiplyScalar(1.45), map: regolithTexture(), roughness: 1, metalness: 0 }))
  ground_.receiveShadow = true
  ground_.frustumCulled = false

  // 小石と岩：大きさはべき乗の分布（小さいものほど多い）。岩の形は数種類
  const rnd = random(seed * 7 + 3)
  const shapes = [0, 1, 2].map((k) => {
    const g = new THREE.IcosahedronGeometry(1, 1)
    const r2 = random(k + 101)
    const v = g.attributes.position as THREE.BufferAttribute
    const seen = new Map<string, number>()
    for (let i = 0; i < v.count; i++) {
      const key = `${v.getX(i).toFixed(3)},${v.getY(i).toFixed(3)},${v.getZ(i).toFixed(3)}`
      const s = seen.get(key) ?? 0.75 + r2() * 0.45
      seen.set(key, s)
      v.setXYZ(i, v.getX(i) * s, v.getY(i) * s * 0.8, v.getZ(i) * s)
    }
    g.computeVertexNormals()
    return g
  })
  const rockMat = new THREE.MeshStandardMaterial({ color: rockColor, roughness: 0.95, metalness: 0, flatShading: true })
  const group = new THREE.Group()
  group.add(ground_)
  const COUNT = 260
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  for (const shape of shapes) {
    const rocks = new THREE.InstancedMesh(shape, rockMat, COUNT)
    rocks.receiveShadow = true
    rocks.frustumCulled = false
    for (let i = 0; i < COUNT; i++) {
      let x = 0
      let y = 0
      do {
        const rho = PATCH_KM * 0.92 * Math.sqrt(rnd())
        const a = rnd() * Math.PI * 2
        x = Math.cos(a) * rho
        y = Math.sin(a) * rho
      } while (Math.hypot(x, y) < CLEAR_KM + 0.002)
      // 直径 0.2 m 〜 6 m（km）
      const size = Math.min(0.003, 0.0001 * (1 - rnd()) ** -0.85)
      at(x, y, p)
      const normal = dir.clone()
      q.setFromUnitVectors(up, normal).multiply(new THREE.Quaternion().setFromAxisAngle(up, rnd() * 6.28))
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (rnd() - 0.5) * 0.8))
      s.set(size * (0.7 + rnd() * 0.6), size * (0.5 + rnd() * 0.4), size * (0.7 + rnd() * 0.6))
      p.addScaledVector(normal, -s.y * 0.35)
      rocks.setMatrixAt(i, m.compose(p, q, s))
    }
    rocks.instanceMatrix.needsUpdate = true
    group.add(rocks)
  }
  return group
}

/** タッチダウンで舞い上がる砂（画面の時間で 3 秒） */
function makeDust() {
  const N = 500
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3))
  const vel = new Float32Array(N * 3)
  const mat = new THREE.PointsMaterial({ color: 0x8a847c, size: 0.00012, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.visible = false
  return { points, vel, N }
}

/**
 * リュウグウ本体と、降りる場所の細かい地面。spin（自転の向き）は Encounter の側が毎フレーム決める。
 * sites は表面へ降りる場所（模型の向きの単位ベクトル）、touch は砂が舞い上がるタッチダウンの番号
 */
export function RyuguBody({
  spin,
  sites,
  active,
  burst,
}: {
  spin: React.MutableRefObject<THREE.Group>
  sites: THREE.Vector3[]
  /** 今、細かい地面を出す場所の番号（-1 で出さない）と、探査機の高さ（km） */
  active: React.MutableRefObject<{ site: number; height: number }>
  /** 砂を舞い上げる：場所の番号と、始めた時刻（performance.now()）。-1 で何もしない */
  burst: React.MutableRefObject<{ site: number; at: number }>
}) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/ryugu.glb`)
  const colors = useRef({ ground: new THREE.Color(0.14, 0.134, 0.129), rock: new THREE.Color(0.18, 0.172, 0.162) })
  const model = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
      // 本物は光を 4.5% しか返さない。画面では暗すぎるので、色を 3 倍ほどに
      mat.color.multiplyScalar(2.8)
      mat.roughness = 1
      mat.metalness = 0
      mesh.material = mat
      mesh.receiveShadow = true
      if (mat.name === 'Regolith') colors.current.ground.copy(mat.color)
      if (mat.name === 'Boulder') colors.current.rock.copy(mat.color)
    })
    return root
  }, [scene])
  const patches = useRef<(THREE.Group | null)[]>([])
  const holder = useRef<THREE.Group>(null!)
  const dust = useMemo(makeDust, [])
  useEffect(() => {
    let alive = true
    loadHeights().then(() => {
      if (!alive) return
      // 表が読めてから、場所ごとの地面を作る（重いので、使うときに1つずつ）
      patches.current = sites.map(() => null)
    })
    return () => {
      alive = false
      for (const g of patches.current)
        g?.traverse((o) => {
          const m = o as THREE.Mesh
          if (m.isMesh) m.geometry.dispose()
        })
      patches.current = []
    }
  }, [sites])
  useFrame(() => {
    const k = active.current.site
    const list = patches.current
    if (k >= 0 && k < list.length && heights && !list[k]) {
      list[k] = buildPatch(sites[k], 17 + k * 31, colors.current.ground, colors.current.rock)
      holder.current.add(list[k]!)
    }
    list.forEach((g, i) => g && (g.visible = i === k))
    // 細かい地面を出しているあいだは、元の模型の大きな岩（荒い形）を消す（細かい地面の岩に置きかえる）
    const coarse = model.getObjectByName('Rocks')
    if (coarse) coarse.visible = !(k >= 0 && list[k] && active.current.height < 0.12)
    // 砂
    const b = burst.current
    const age = (performance.now() - b.at) / 1000
    if (b.site >= 0 && age < 3.5) {
      const pos = dust.points.geometry.attributes.position as THREE.BufferAttribute
      if (!dust.points.visible) {
        // ホーンの先から、上と横へ（重力はほとんどないので、まっすぐ飛ぶ）
        const c = sites[b.site]
        const t1 = new THREE.Vector3(0, 1, 0).cross(c).normalize()
        const t2 = new THREE.Vector3().crossVectors(c, t1)
        const r = random(b.site * 13 + 1)
        const base = c.clone().multiplyScalar(groundKm(c) + lift(0))
        for (let i = 0; i < dust.N; i++) {
          const a = r() * Math.PI * 2
          const up = 0.3 + r() * 0.9
          const sp = (0.4 + r() ** 2 * 2.6) / 1000
          const v = c.clone().multiplyScalar(up).addScaledVector(t1, Math.cos(a)).addScaledVector(t2, Math.sin(a)).normalize().multiplyScalar(sp)
          dust.vel.set([v.x, v.y, v.z], i * 3)
          pos.setXYZ(i, base.x, base.y, base.z)
        }
        dust.points.visible = true
        dust.points.userData.base = base
      }
      const base = dust.points.userData.base as THREE.Vector3
      for (let i = 0; i < dust.N; i++) pos.setXYZ(i, base.x + dust.vel[i * 3] * age, base.y + dust.vel[i * 3 + 1] * age, base.z + dust.vel[i * 3 + 2] * age)
      pos.needsUpdate = true
      ;(dust.points.material as THREE.PointsMaterial).opacity = Math.min(1, age * 4) * Math.max(0, 1 - age / 3.5)
    } else if (dust.points.visible) dust.points.visible = false
  })
  return (
    <group ref={spin}>
      <primitive object={model} />
      <group ref={holder} />
      <primitive object={dust.points} />
    </group>
  )
}

/** 降りたときの地面の高さに足す分（細かい地面は少し上にある） */
export const PATCH_LIFT_KM = lift(0)
