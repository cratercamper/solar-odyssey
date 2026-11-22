import * as THREE from 'three'

// サターンV の断面（観察パート）。図鑑の切り抜き図のように、カメラの側の外板を扇形に切り取って、中のタンク・エンジン・
// 着陸船・宇宙船を見せる。
//
// 切り方：three の切り取り面（clippingPlanes）を 4 枚。縦の 2 枚でカメラ側の扇形（開く角度 ±α）、横の 2 枚で高さの帯。
// clipIntersection で「4 枚ぜんぶの内側」だけを切るので、α が 0 なら何も切らない（シェーダーを作り直さずに開け閉めできる）。
// 外板は両面を描く（切り口から、向こう側の壁の内側が見える）。
//
// 高さは build_saturn.py と同じ（ロケットの根元 = エンジンの口が 0 m）。

export type PartId = 'f1' | 's1' | 's2' | 's3' | 'iu' | 'lm' | 'csm' | 'les'

export type SaturnPart = {
  id: PartId
  /** 印を置く高さ（m）と、そこの外板の半径 */
  y: number
  r: number
  /** 切り取る高さの帯（null は切らない：外から見る部品） */
  cut: [number, number] | null
  /** カメラの距離（m） */
  dist: number
}

export const SATURN_PARTS: SaturnPart[] = [
  { id: 'les', y: 106, r: 0.45, cut: null, dist: 24 },
  { id: 'csm', y: 97, r: 1.96, cut: [91.2, 100.9], dist: 26 },
  { id: 'lm', y: 89.5, r: 2.6, cut: [85.4, 94.2], dist: 28 },
  { id: 'iu', y: 85.1, r: 3.3, cut: [83.6, 86.4], dist: 22 },
  { id: 's3', y: 77, r: 3.3, cut: [66.8, 85.0], dist: 48 },
  { id: 's2', y: 56, r: 5.03, cut: [42.0, 67.0], dist: 64 },
  { id: 's1', y: 24, r: 5.03, cut: [5.8, 42.1], dist: 82 },
  { id: 'f1', y: 3.6, r: 5.4, cut: null, dist: 21 },
]

/** 全体を切るときの帯 */
export const CUT_ALL: [number, number] = [5.8, 100.9]

const Y = new THREE.Vector3(0, 1, 0)

// ---- 中身（タンク・エンジン・着陸船・宇宙船） --------------------------------------------------

/** 回転体：（高さ, 半径）の点の列を回す */
function lathe(points: [number, number][], n = 48) {
  return new THREE.LatheGeometry(
    points.map(([y, r]) => new THREE.Vector2(r, y)),
    n,
  )
}

/** 楕円のふたのついたタンク：y0〜y1 の円筒に、高さ dome の丸いふた */
function tank(y0: number, y1: number, r: number, domeBottom: number, domeTop: number) {
  const pts: [number, number][] = []
  const N = 10
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2)
    pts.push([y0 + domeBottom - Math.cos(a) * domeBottom, Math.sin(a) * r + 0.001])
  }
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2)
    pts.push([y1 - domeTop + Math.sin(a) * domeTop, Math.cos(a) * r + 0.001])
  }
  pts[0][1] = 0.001
  pts[pts.length - 1][1] = 0.001
  return lathe(pts)
}

/** 上下 2 つのタンクがひとつの隔壁（共通隔壁）を分け合う形（第2段・第3段）。下のタンクは、上のタンクの丸い底の中に入りこむ */
function commonBulkhead(y0: number, yMid: number, y1: number, r: number, dome: number) {
  // 下（液体酸素）：底は丸く、上は上のタンクの底（下へふくらんだ隔壁）
  const lower: [number, number][] = []
  const upper: [number, number][] = []
  const N = 12
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2)
    lower.push([y0 + dome - Math.cos(a) * dome, Math.sin(a) * r])
  }
  for (let i = N; i >= 0; i--) {
    const a = (i / N) * (Math.PI / 2)
    lower.push([yMid - Math.cos(a) * dome * 0.9 + 0.02, Math.sin(a) * r * 0.995])
  }
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2)
    upper.push([yMid - Math.cos(a) * dome * 0.9, Math.sin(a) * r])
  }
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2)
    upper.push([y1 - dome + Math.sin(a) * dome, Math.cos(a) * r])
  }
  for (const p of [lower, upper]) {
    p[0][1] = 0.001
    p[p.length - 1][1] = 0.001
  }
  return { lower: lathe(lower), upper: lathe(upper) }
}

/** エンジンのノズル（口が下） */
function bell(y: number, h: number, r: number) {
  return lathe(
    [
      [y, r],
      [y + h * 0.35, r * 0.72],
      [y + h * 0.75, r * 0.42],
      [y + h * 0.88, r * 0.3],
      [y + h, r * 0.38],
      [y + h * 1.25, r * 0.38],
      [y + h * 1.25, 0.001],
    ],
    24,
  )
}

export type Cutaway = {
  /** 中身（断面を開いているときだけ見せる） */
  interior: THREE.Group
  /** 切り口の向き（ロケットの軸からカメラへの水平の向き）、高さの帯、開いた割合（0〜1） */
  set(toCamera: THREE.Vector3, band: [number, number], open: number): void
  dispose(): void
}

/** ロケットの部品（three の材質を持つメッシュ）に、切り取り面を付ける。材質はこの場面だけの複製にする（owned は複製済みの材質） */
export function buildCutaway(root: THREE.Object3D, owned: Set<THREE.Material>): Cutaway {
  const planes = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane(), new THREE.Plane()]
  const made: THREE.Material[] = []
  const copies = new Map<THREE.Material, THREE.Material>()
  const prep = (m: THREE.Material) => {
    let c = owned.has(m) ? m : copies.get(m)
    if (!c) {
      c = m.clone()
      copies.set(m, c)
      made.push(c)
    }
    c.clippingPlanes = planes
    c.clipIntersection = true
    c.side = THREE.DoubleSide
    return c
  }
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(prep) : prep(mesh.material)
  })

  // 中身
  const interior = new THREE.Group()
  interior.name = 'SaturnInterior'
  interior.visible = false
  const geos: THREE.BufferGeometry[] = []
  const mat = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...o })
    // 影の中でも色が読めるように、少しだけ自分で光る
    m.emissive.set(color).multiplyScalar(0.12)
    made.push(m)
    return m
  }
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, z = 0) => {
    geos.push(g)
    const mesh = new THREE.Mesh(g, m)
    mesh.position.set(x, 0, z)
    interior.add(mesh)
    return mesh
  }
  const lox = mat('#4a86d8')
  const rp1 = mat('#d0902c')
  const lh2 = mat('#d6ecf6')
  const steel = mat('#7c7f84', { metalness: 0.6, roughness: 0.4 })
  const dark = mat('#2a2b2e', { metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide })
  const gold = mat('#c9a043', { metalness: 0.7, roughness: 0.35 })
  const silver = mat('#b9bcc0', { metalness: 0.7, roughness: 0.3 })
  const green = mat('#7f9a72')

  // 第1段：下に灯油（RP-1）、上に液体酸素。液体酸素は 5 本の管で灯油のタンクの中を通って、エンジンへ
  add(tank(8.6, 19.8, 4.78, 1.8, 1.8), rp1)
  add(tank(22.2, 39.4, 4.78, 2.0, 2.2), lox)
  const tube = new THREE.CylinderGeometry(0.22, 0.22, 14.2, 10)
  tube.translate(0, 8.6 + 7.1, 0)
  for (const [x, z] of [
    [0, 0],
    [2.1, 2.1],
    [-2.1, 2.1],
    [-2.1, -2.1],
    [2.1, -2.1],
  ])
    add(x === 0 && z === 0 ? tube : tube.clone(), steel, x, z)
  // 推力構造（エンジンを支える梁）
  add(lathe([[5.7, 4.9], [6.4, 4.9], [6.4, 0.6], [5.7, 0.6]], 32), dark)
  // 第2段：下に液体酸素、上に液体水素（とても軽いので大きい）。間は 1 枚の共通隔壁
  const s2 = commonBulkhead(47.4, 52.8, 64.4, 4.78, 2.4)
  add(s2.lower, lox)
  add(s2.upper, lh2)
  // 第2段の J-2 エンジン 5 基（段間部の中）
  const j2 = bell(43.2, 3.4, 1.0)
  for (const [x, z] of [
    [0, 0],
    [1.9, 1.9],
    [-1.9, 1.9],
    [-1.9, -1.9],
    [1.9, -1.9],
  ])
    add(x === 0 && z === 0 ? j2 : j2.clone(), dark, x, z)
  // 第3段：下に液体酸素、上に液体水素。J-2 エンジン 1 基（月へ向かう燃焼にも使う）
  const s3 = commonBulkhead(70.3, 73.9, 84.2, 3.1, 1.6)
  add(s3.lower, lox)
  add(s3.upper, lh2)
  add(bell(66.9, 3.3, 1.0), dark)
  // 計器リング：ロケットの頭脳（誘導のコンピュータ・ジャイロ）の箱が、輪の内側にならぶ
  add(lathe([[84.65, 3.26], [85.55, 3.26], [85.55, 2.9], [84.65, 2.9]], 48), steel)
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2
    const g = new THREE.BoxGeometry(0.7, 0.62, 0.32)
    const m = add(g, i % 3 === 0 ? silver : green, Math.cos(a) * 2.7, Math.sin(a) * 2.7)
    m.position.y = 85.1
    m.rotation.y = -a
  }
  // 着陸船（脚をたたんで、アダプタの中に）：金色の箔の下降段と、銀色の上昇段
  {
    const d = new THREE.CylinderGeometry(2.05, 2.05, 1.7, 8)
    const m = add(d, gold)
    m.position.y = 87.3
    m.rotation.y = Math.PI / 8
    const a1 = new THREE.BoxGeometry(2.7, 1.7, 2.4)
    const am = add(a1, silver)
    am.position.y = 89.0
    const a2 = new THREE.CylinderGeometry(1.0, 1.15, 1.0, 12)
    const am2 = add(a2, silver)
    am2.position.y = 90.3
    // 前の窓の三角の面と、上のドッキングの口
    const dock = new THREE.CylinderGeometry(0.45, 0.5, 0.5, 12)
    const dm = add(dock, steel)
    dm.position.y = 91.05
    // たたんだ脚（4 本）
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const leg = new THREE.BoxGeometry(0.18, 2.4, 0.18)
      const lm = add(leg, gold, Math.cos(a) * 2.15, Math.sin(a) * 2.15)
      lm.position.y = 87.6
      lm.rotation.z = 0.25 * Math.cos(a)
      lm.rotation.x = -0.25 * Math.sin(a)
    }
  }
  // 機械船のエンジン（ノズルが着陸船の上に下がっている）と、機械船の燃料タンク
  add(bell(91.6, 2.5, 1.15), dark)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const g = new THREE.CylinderGeometry(0.55, 0.55, 3.1, 16)
    const m = add(g, i % 2 ? rp1 : lox, Math.cos(a) * 1.18, Math.sin(a) * 1.18)
    m.position.y = 95.85
  }
  const he = new THREE.SphereGeometry(0.45, 16, 10)
  const hm = add(he, steel)
  hm.position.y = 96.6
  // 司令船（白いカバーの中の、銀色の円すい）。3 人が乗る
  add(lathe([[97.7, 1.9], [97.95, 1.92], [100.45, 0.42], [100.7, 0.32], [100.7, 0.001]], 48), silver)

  const tmp = new THREE.Vector3()
  return {
    interior,
    set(toCamera, band, open) {
      const alpha = THREE.MathUtils.clamp(open, 0, 1) * THREE.MathUtils.degToRad(62)
      const c = tmp.copy(toCamera).setY(0)
      if (c.lengthSq() < 1e-6) c.set(0, 0, 1)
      c.normalize()
      const b = (90 * Math.PI) / 180 - alpha
      planes[0].normal.copy(c).applyAxisAngle(Y, b).negate()
      planes[0].constant = 0
      planes[1].normal.copy(c).applyAxisAngle(Y, -b).negate()
      planes[1].constant = 0
      // 高さの帯：y > y0 かつ y < y1 の所だけ
      planes[2].normal.set(0, -1, 0)
      planes[2].constant = band[0]
      planes[3].normal.set(0, 1, 0)
      planes[3].constant = -band[1]
      // 閉じているあいだは、縦の 2 枚が同じ向きの反対になって、切る所が無くなる
      interior.visible = open > 0.01
    },
    dispose() {
      for (const g of geos) g.dispose()
      for (const m of made) m.dispose()
    },
  }
}
