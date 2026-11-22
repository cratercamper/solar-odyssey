import * as THREE from 'three'
import { buildWater, type Water } from './water'
import { glowTexture } from './plume'

// 打ち上げの場面の「地面の組」に置く、発射台のまわりの土地：陸（西）・海（東）・発射台の盛り土と炎の溝・夜の町の明かり。
// 座標は地面の組の中（x 東、y 上、z 南、ロケットの根元が原点）。地面の組ごと、地球の自転と一緒に回る。
//
// 本物の 39A 発射台は、まわりの土地より 12 m ほど高い盛り土の上にある（写真 S72-54813 で、台の左右に照らされた斜面が見える）。
// 盛り土のまん中を南北に炎の溝が通り、溝の底には炎を南北に分ける山形の板（デフレクター）。
// 移動発射台を運ぶクローラーの道は、西から 5 % の坂で上がってくる。

/** 移動発射台の甲板の下の、発射台の地面（盛り土の上）の高さ（m、ロケットの根元が 0） */
export const GROUND_Y = -13.8
/** まわりの土地の高さ（盛り土の下） */
export const LAND_Y = GROUND_Y - 12
/** 盛り土の上の平らな所（半分の幅：東西・南北） */
const TOP_X = 66
const TOP_Z = 78
/** 斜面の水平の長さ */
const SLOPE = 42
/** 炎の溝（半分の幅）と、底の高さ */
const TRENCH = 9
const TRENCH_Y = GROUND_Y - 13
/** クローラーの道（半分の幅）と坂 */
const CRAWLER = 20
const CRAWLER_GRADE = 0.05

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** 盛り土の高さ（炎の溝を除く）。投光器などを地面に置くのに使う */
export function moundHeight(x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x) - TOP_X)
  const dz = Math.max(0, Math.abs(z) - TOP_Z)
  const d = Math.hypot(dx, dz)
  let y = GROUND_Y - 12 * smooth(0, SLOPE, d)
  // クローラーの道：西のふちから 5 % で下る
  if (x < -TOP_X && Math.abs(z) < CRAWLER + 6) {
    const ramp = GROUND_Y - (-TOP_X - x) * CRAWLER_GRADE
    const edge = 1 - smooth(CRAWLER, CRAWLER + 6, Math.abs(z))
    y = Math.max(y, y + (Math.max(ramp, LAND_Y) - y) * edge)
  }
  return y
}

/** 炎の溝も入れた地面の高さと、表面の種類（0 コンクリート、1 溝の中、2 土と草、3 クローラーの道の砂利） */
function surface(x: number, z: number): [number, number] {
  let y = moundHeight(x, z)
  let kind = y > LAND_Y + 0.3 ? 0 : 2
  if (x < -TOP_X && Math.abs(z) < CRAWLER && y > LAND_Y + 0.05) kind = 3
  // 炎の溝：盛り土を南北に切る。外の土地へ抜ける所で、底がまわりの高さに上がる
  const inTrench = 1 - smooth(TRENCH - 0.6, TRENCH + 0.6, Math.abs(x))
  if (inTrench > 0 && Math.abs(z) < TOP_Z + SLOPE + 30) {
    const out = smooth(TOP_Z + SLOPE - 10, TOP_Z + SLOPE + 30, Math.abs(z))
    const floor = TRENCH_Y + (LAND_Y - 0.4 - TRENCH_Y) * out
    if (floor < y) {
      y = y + (floor - y) * inTrench
      if (inTrench > 0.5) kind = 1
    }
  }
  return [y, kind]
}

/** 溝の縁が切り立つよう、x の格子は溝の縁のところで細かくする */
function gridXs(): number[] {
  const xs = new Set<number>()
  for (let x = -330; x <= 150; x += 3) xs.add(x)
  for (const e of [TRENCH - 0.7, TRENCH - 0.3, TRENCH, TRENCH + 0.3, TRENCH + 0.7]) {
    xs.add(e)
    xs.add(-e)
  }
  for (let x = -TRENCH + 1.5; x < TRENCH - 1; x += 1.5) xs.add(Math.round(x * 10) / 10)
  return [...xs].sort((a, b) => a - b)
}

const COLORS = [
  new THREE.Color('#5c5a55'), // コンクリート
  new THREE.Color('#2a2724'), // 溝の中（すす）
  new THREE.Color('#2a2d22'), // 土と草
  new THREE.Color('#6d6a63'), // 砂利
]

/** 盛り土・斜面・炎の溝・クローラーの道を 1 枚の高さの網で */
function moundGeometry() {
  const xs = gridXs()
  const zs: number[] = []
  for (let z = -200; z <= 200; z += 3) zs.push(z)
  const nx = xs.length
  const nz = zs.length
  const pos = new Float32Array(nx * nz * 3)
  const col = new Float32Array(nx * nz * 3)
  const uv = new Float32Array(nx * nz * 2)
  const c = new THREE.Color()
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      const [y, kind] = surface(xs[i], zs[j])
      pos.set([xs[i], y, zs[j]], k * 3)
      // 盛り土のふちほど、まわりの土に少しずつなじむ
      c.copy(COLORS[kind])
      if (kind === 0) c.lerp(COLORS[2], smooth(GROUND_Y - 4, LAND_Y + 0.3, y) * 0.7)
      // 甲板の下の、炎で焦げたところ
      if (kind === 0) c.multiplyScalar(0.55 + 0.45 * smooth(16, 40, Math.hypot(xs[i], zs[j])))
      col.set([c.r, c.g, c.b], k * 3)
      uv.set([xs[i] / 6, zs[j] / 6], k * 2)
    }
  }
  const idx: number[] = []
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i
      idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** コンクリートの細かな模様（6 m 四方で繰り返す）：継ぎ目、しみ、ざらつき */
function concreteTexture() {
  const n = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = n
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(n, n)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const blot = new Float32Array(n * n)
  for (let b = 0; b < 40; b++) {
    const cx = rnd() * n
    const cy = rnd() * n
    const r = 6 + rnd() * 30
    const v = (rnd() - 0.5) * 0.16
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / r
        if (d > 1) continue
        const px = (Math.floor(cx + x) + n) % n
        const py = (Math.floor(cy + y) + n) % n
        blot[py * n + px] += v * (1 - d * d)
      }
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = 0.86 + blot[y * n + x] + (rnd() - 0.5) * 0.1
      if (x < 2 || y < 2) v *= 0.55 // 板の継ぎ目
      const k = (y * n + x) * 4
      const g = Math.max(0, Math.min(255, v * 255))
      img.data[k] = img.data[k + 1] = img.data[k + 2] = g
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** 炎の溝の底の山形の板（南北へ炎を分ける）。ロケットの真下、稜線は東西 */
function deflectorGeometry() {
  const w = TRENCH - 0.4
  const top = GROUND_Y - 4.5
  const half = 14
  const v = new Float32Array([
    -w, TRENCH_Y, -half, w, TRENCH_Y, -half, w, top, 0, -w, top, 0,
    -w, top, 0, w, top, 0, w, TRENCH_Y, half, -w, TRENCH_Y, half,
  ])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(v, 3))
  g.setIndex([0, 3, 1, 1, 3, 2, 4, 7, 5, 5, 7, 6])
  g.computeVertexNormals()
  return g
}

/** 海岸線（発射台から東へ m）。39A の東 1.4 km ほどが大西洋の砂浜 */
const COAST_X = 1400

/**
 * まわりの夜の明かり。本物の地図の位置にだいたい合わせる（x 東、z 南、m）：
 * - タイタスビルの町：西のインディアン川の向こう、南北に長い（オレンジのナトリウム灯）
 * - ココアとココアビーチ：ずっと南
 * - ケープカナベラルの発射場：南南東の海沿いに、白い照明の塊がぽつぽつ
 * - 組み立て棟（VAB）のまわり：西南西 4.6 km
 */
const LIGHT_GROUPS: { x: number; z: number; rx: number; rz: number; n: number; warm: number }[] = [
  { x: -18500, z: 2000, rx: 1800, rz: 11000, n: 520, warm: 1 },
  { x: -15000, z: 30000, rx: 4000, rz: 5000, n: 260, warm: 1 },
  { x: -2000, z: 36000, rx: 1500, rz: 6000, n: 220, warm: 0.8 },
  { x: 2600, z: 11000, rx: 900, rz: 5000, n: 90, warm: 0.15 },
  { x: 3800, z: 19000, rx: 900, rz: 3000, n: 70, warm: 0.2 },
  { x: -4600, z: 2400, rx: 500, rz: 600, n: 80, warm: 0.4 },
  { x: -6500, z: 8000, rx: 2500, rz: 2500, n: 60, warm: 0.9 },
]

function cityLightsGeometry(small: boolean) {
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const pts: number[] = []
  const cols: number[] = []
  for (const g of LIGHT_GROUPS) {
    const n = Math.round(g.n * (small ? 0.4 : 1))
    for (let i = 0; i < n; i++) {
      // 町の中ほど密に（まん中に寄せる）
      const r = Math.sqrt(rnd()) * (0.4 + 0.6 * rnd())
      const a = rnd() * Math.PI * 2
      const x = g.x + Math.cos(a) * r * g.rx
      if (x > COAST_X - 40 && g.x < COAST_X) continue
      pts.push(x, LAND_Y + 2 + rnd() * 6, g.z + Math.sin(a) * r * g.rz)
      const w = 0.6 + rnd() * 0.4
      const warm = g.warm * (0.7 + 0.3 * rnd())
      cols.push(w, w * (1 - 0.3 * warm), w * (1 - 0.6 * warm))
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3))
  return geo
}

/** 湿地の池と入り江（メリット島は水と草の湿地。写真では、手前の水に炎や照明が映る） */
function marshWater(group: THREE.Group, mat: THREE.Material, geos: THREE.BufferGeometry[]) {
  let seed = 5
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const disc = new THREE.CircleGeometry(1, 40)
  geos.push(disc)
  const add = (x: number, z: number, sx: number, sz: number, rot: number) => {
    const m = new THREE.Mesh(disc, mat)
    m.rotation.set(-Math.PI / 2, 0, rot)
    m.scale.set(sx, sz, 1)
    m.position.set(x, LAND_Y + 0.12, z)
    group.add(m)
  }
  // 西のバナナ川の入り江（南北に長い水面）と、インディアン川
  add(-7800, 1000, 1400, 9000, 0.1)
  add(-14500, 4000, 2200, 16000, 0.05)
  // まわりの池：発射台の 0.7〜6 km、クローラーの道は避ける
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2
    const d = 700 + rnd() * 5200
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    if (x > COAST_X - 200) continue
    if (x < -300 && x > -4800 && Math.abs(z - x * -0.52) < 260) continue
    if (Math.hypot(x - PAD_B.x, z - PAD_B.y) < 420) continue
    add(x, z, 60 + rnd() * 260, 30 + rnd() * 140, rnd() * Math.PI)
  }
}

/** 組み立て棟（VAB）と発射管制センター：西南西 4.6 km。高さ 160 m の箱は、夜も窓の明かりと赤い航空灯 */
function vehicleAssemblyBuilding(group: THREE.Group, geos: THREE.BufferGeometry[], mats: THREE.Material[]): THREE.PointsMaterial {
  const vab = new THREE.Group()
  vab.position.set(-4600, LAND_Y, 2400)
  vab.rotation.y = -0.08
  const box = new THREE.BoxGeometry(218, 160, 158)
  box.translate(0, 80, 0)
  const low = new THREE.BoxGeometry(130, 64, 135)
  low.translate(-165, 32, 0)
  const lcc = new THREE.BoxGeometry(110, 24, 55)
  lcc.translate(70, 12, -160)
  const wall = new THREE.MeshStandardMaterial({ color: '#4a4c4e', roughness: 0.85 })
  geos.push(box, low, lcc)
  mats.push(wall)
  for (const g of [box, low, lcc]) vab.add(new THREE.Mesh(g, wall))
  // 窓とドアの明かり、てっぺんの赤い航空灯
  const pts: number[] = []
  const cols: number[] = []
  let seed = 3
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 90; i++) {
    const side = rnd() < 0.5 ? 1 : -1
    pts.push(-100 + rnd() * 200, 4 + rnd() * 150, side * 79.5)
    cols.push(0.9, 0.85, 0.7)
  }
  for (let i = 0; i < 30; i++) {
    pts.push(105 + rnd() * 10, 4 + rnd() * 18, -170 + rnd() * 30)
    cols.push(1, 0.95, 0.85)
  }
  for (const [x, z] of [[-109, -79], [109, -79], [-109, 79], [109, 79]]) {
    pts.push(x, 161, z)
    cols.push(1.6, 0.05, 0.02)
  }
  const lg = new THREE.BufferGeometry()
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
  lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3))
  const lm = new THREE.PointsMaterial({ vertexColors: true, size: 2.4, sizeAttenuation: false, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  geos.push(lg)
  mats.push(lm)
  vab.add(new THREE.Points(lg, lm))
  group.add(vab)
  return lm
}

/** クローラーの道：発射台の坂の下から、西南西の組み立て棟へ（砂利の 2 本の道） */
function crawlerway(group: THREE.Group, mat: THREE.Material, geos: THREE.BufferGeometry[]) {
  gravelRoad(group, mat, geos, new THREE.Vector2(-330, 0), new THREE.Vector2(-4500, 2300))
}

/** 39B 発射台：39A の北北西 2.7 km（x 東、z 南）。1972 年 12 月は使っていない（アポロ 10 号のあと空き）ので、台の上は空で、投光器だけ */
const PAD_B = new THREE.Vector2(-900, -2550)
/** 2 つの発射台へのクローラーの道が分かれる所 */
const FORK = new THREE.Vector2(-2400, 1142)
/** 移動整備塔（MSS、高さ 125 m）：打ち上げの間は、クローラーの道のわきの待避所（発射台から約 2.1 km）に下がっている */
const MSS = new THREE.Vector2(-2050, 1080)

/** 砂利の 2 本の道を from から to へ */
function gravelRoad(group: THREE.Group, mat: THREE.Material, geos: THREE.BufferGeometry[], from: THREE.Vector2, to: THREE.Vector2) {
  const len = from.distanceTo(to)
  const ang = Math.atan2(to.y - from.y, to.x - from.x)
  for (const off of [-12, 12]) {
    const g = new THREE.PlaneGeometry(len, 12)
    geos.push(g)
    const m = new THREE.Mesh(g, mat)
    m.rotation.set(-Math.PI / 2, 0, -ang)
    m.position.set((from.x + to.x) / 2 - Math.sin(ang) * off, LAND_Y + 0.04, (from.y + to.y) / 2 + Math.cos(ang) * off)
    group.add(m)
  }
}

/** 光の点の組（窓・投光器・航空灯）。夜の明るさに合わせて opacity を変える */
function lightPoints(pts: number[], cols: number[], size: number, geos: THREE.BufferGeometry[], mats: THREE.Material[]) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3))
  const m = new THREE.PointsMaterial({ vertexColors: true, size, sizeAttenuation: false, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  geos.push(g)
  mats.push(m)
  return { points: new THREE.Points(g, m), material: m }
}

/** 39B の盛り土（39A と同じ形）・投光器と、移動整備塔 */
function padB(group: THREE.Group, moundGeo: THREE.BufferGeometry, moundMat: THREE.Material, deflGeo: THREE.BufferGeometry, deflMat: THREE.Material, gravel: THREE.Material, geos: THREE.BufferGeometry[], mats: THREE.Material[]) {
  const pad = new THREE.Group()
  pad.position.set(PAD_B.x, 0, PAD_B.y)
  pad.add(new THREE.Mesh(moundGeo, moundMat), new THREE.Mesh(deflGeo, deflMat))
  group.add(pad)
  gravelRoad(group, gravel, geos, new THREE.Vector2(PAD_B.x - 330, PAD_B.y), FORK)
  const pts: number[] = []
  const cols: number[] = []
  // 盛り土の上のふちの投光器（白とナトリウムのオレンジ）
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2
    const x = Math.cos(a) * 90
    const z = Math.sin(a) * 100
    pts.push(PAD_B.x + x, GROUND_Y + 12, PAD_B.y + z)
    const warm = i % 3 === 0 ? 0 : 1
    cols.push(1.3, 1.25 - 0.35 * warm, 1.15 - 0.75 * warm)
  }
  // 移動整備塔：鉄骨の箱（夜は黒いかたまり）に、作業灯と赤い航空灯
  const tower = new THREE.Group()
  tower.position.set(MSS.x, LAND_Y, MSS.y)
  tower.rotation.y = -0.5
  const wall = new THREE.MeshStandardMaterial({ color: '#3c3a36', roughness: 0.9 })
  mats.push(wall)
  const body = new THREE.BoxGeometry(40, 125, 34)
  body.translate(0, 62.5, 0)
  const legs = new THREE.BoxGeometry(46, 14, 40)
  legs.translate(0, 7, 0)
  geos.push(body, legs)
  tower.add(new THREE.Mesh(body, wall), new THREE.Mesh(legs, wall))
  group.add(tower)
  const tp: number[] = []
  const tc: number[] = []
  let seed = 9
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 24; i++) {
    tp.push((rnd() - 0.5) * 38, 10 + rnd() * 110, 17.5)
    tc.push(1, 0.92, 0.75)
  }
  for (const [x, z] of [[-20, -17], [20, 17]]) {
    tp.push(x, 126, z)
    tc.push(1.6, 0.05, 0.02)
  }
  const tl = lightPoints(tp, tc, 2.2, geos, mats)
  tower.add(tl.points)
  const pl = lightPoints(pts, cols, 2.6, geos, mats)
  group.add(pl.points)
  return [pl.material, tl.material]
}

export type LaunchSite = {
  group: THREE.Group
  /** 溝の炎の強さ k（0〜1）と時刻 t */
  update(k: number, t: number): void
  /** 水面（毎フレーム、映るものを渡す） */
  water: Water
  /** 夕方の明るさ（day 0 夜〜1 昼）と、町の明かりがついた割合 */
  setDusk(day: number, lights: number): void
  dispose(): void
}

export function buildSite(small: boolean): LaunchSite {
  const group = new THREE.Group()
  group.name = 'LaunchSite'
  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  /** 地面に平らに寝かせた板 */
  const flat = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    geos.push(geo)
    mats.push(mat)
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = -Math.PI / 2
    m.position.set(x, y, z)
    group.add(m)
    return m
  }
  // 陸（西）と海（東）。盛り土の網の下に少しもぐらせる
  flat(new THREE.PlaneGeometry(30000, 80000), new THREE.MeshStandardMaterial({ color: '#1a1c16', roughness: 0.95 }), COAST_X - 15000, LAND_Y - 0.05, 0)
  // 砂浜
  flat(new THREE.PlaneGeometry(60, 80000), new THREE.MeshStandardMaterial({ color: '#5a554a', roughness: 0.95 }), COAST_X - 30, LAND_Y - 0.03, 0)
  // 大西洋と湿地の水：さざ波が空・月・投光器・炎・ロケットを映す（water.ts）
  const waterFx = buildWater(COAST_X)
  const water = waterFx.material
  mats.push(water)
  flat(new THREE.PlaneGeometry(40000, 80000), water, COAST_X + 20000, LAND_Y - 0.5, 0)
  marshWater(group, water, geos)
  const gravel = new THREE.MeshStandardMaterial({ color: '#3a3833', roughness: 0.95 })
  mats.push(gravel)
  crawlerway(group, gravel, geos)
  const vabLights = vehicleAssemblyBuilding(group, geos, mats)
  // 発射台の盛り土・斜面・炎の溝・クローラーの道
  const moundGeo = moundGeometry()
  const concrete = concreteTexture()
  const moundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: concrete, roughness: 0.92 })
  geos.push(moundGeo)
  mats.push(moundMat)
  group.add(new THREE.Mesh(moundGeo, moundMat))
  const deflGeo = deflectorGeometry()
  const deflMat = new THREE.MeshStandardMaterial({ color: '#3a3530', roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide })
  geos.push(deflGeo)
  mats.push(deflMat)
  group.add(new THREE.Mesh(deflGeo, deflMat))
  // 北北西の 39B 発射台と、待避所の移動整備塔
  const padBLights = padB(group, moundGeo, moundMat, deflGeo, deflMat, gravel, geos, mats)
  // 炎の溝の火：点火すると溝が炎で満たされ、南北の出口から噴き出す
  const fireMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffc47e', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  const trenchFire = flat(new THREE.PlaneGeometry(30, 150), fireMat, 0, GROUND_Y - 3, 0)
  trenchFire.visible = false
  // 町の明かり
  const cityGeo = cityLightsGeometry(small)
  const cityMat = new THREE.PointsMaterial({ vertexColors: true, size: 2.2, sizeAttenuation: false, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  geos.push(cityGeo)
  mats.push(cityMat)
  group.add(new THREE.Points(cityGeo, cityMat))

  return {
    group,
    water: waterFx,
    setDusk(_day, lights) {
      cityMat.opacity = lights
      cityMat.visible = lights > 0.01
      vabLights.opacity = 0.3 + 0.7 * lights
      for (const m of padBLights) m.opacity = 0.3 + 0.7 * lights
    },
    update(k, t) {
      trenchFire.visible = k > 0.01
      fireMat.opacity = Math.min(1, k * 1.4) * (0.85 + 0.15 * Math.sin(t * 29))
    },
    dispose() {
      waterFx.dispose()
      for (const g of geos) g.dispose()
      for (const m of mats) m.dispose()
      concrete.dispose()
    },
  }
}
