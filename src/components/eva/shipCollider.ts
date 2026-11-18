import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MeshBVH } from 'three-mesh-bvh'

// 母船のまわりを自由に飛ぶとき（作業場所 'ship'）の、本物の船の形での当たり判定。
// 船の模型（実寸、m）の面をひとつにまとめて BVH を作り、ツムギとの距離・すり抜け防止の光線を調べる。
// 場面の座標（エアロックが原点、上が +Y、前が -Z）と船の座標（m）は、平行移動だけちがう：場面 = 船 + offset。

/** エアロックの小屋（船の背中に立てた箱）の高さと幅（m）。ハッチは小屋の上面（y = 0） */
export const MODULE_H = 1.45
export const MODULE_W = 2.3

export type Silhouette = { x0: number; z0: number; cell: number; rows: [number, number, number][] }

export const shipCol = {
  bvh: null as MeshBVH | null,
  /** 船の座標 → 場面の座標 */
  offset: new THREE.Vector3(),
  /** 場面の座標での、船の外形の箱 */
  box: new THREE.Box3(),
  /** 船の全長（m） */
  L: 0,
  /** これより離れると警告、これ以上は離れられない（船の外形の箱からの距離、m） */
  warn: 0,
  limit: 0,
  /** 真上から見た船の形（ミニマップ）。rows：[z の行, x の始まりの列, 列の数] */
  sil: null as Silhouette | null,
}

const tri = new THREE.Triangle()
const va = new THREE.Vector3()
const vb = new THREE.Vector3()
const vc = new THREE.Vector3()
const ray = new THREE.Ray()
const q = new THREE.Vector3()
const hit = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 }

/** 模型の面を、root の座標（m）でひとつの形にまとめて BVH にする。光る板・半透明の札は入れない */
export function buildShipCollider(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const parts: THREE.BufferGeometry[] = []
  const m = new THREE.Matrix4()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.visible) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (mats.every((x) => x.transparent || x.depthWrite === false)) return
    const src = mesh.geometry
    const pos = src.getAttribute('position')
    if (!pos) return
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', pos.clone())
    if (src.index) g.setIndex(src.index.clone())
    g.applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld))
    parts.push(g)
  })
  // 番号つき・番号なしが混ざるとまとめられないので、そろえる
  const anyIndexed = parts.some((g) => g.index)
  const same = parts.map((g) => {
    if (anyIndexed && !g.index) {
      const n = g.getAttribute('position').count
      g.setIndex(Array.from({ length: n }, (_, i) => i))
    }
    return g
  })
  const merged = mergeGeometries(same, false)
  same.forEach((g) => g.dispose())
  if (!merged) return null
  return new MeshBVH(merged, { maxLeafTris: 8 })
}

/** 船の背中の、平らでまわりに物がない所（船の座標）。真上から光線を当てて探す */
export function findAirlockSpot(bvh: MeshBVH, box: THREE.Box3) {
  const size = box.getSize(new THREE.Vector3())
  const c = box.getCenter(new THREE.Vector3())
  const top = box.max.y + 10
  const down = new THREE.Vector3(0, -1, 0)
  const probe = (x: number, z: number) => {
    ray.origin.set(x, top, z)
    ray.direction.copy(down)
    const h = bvh.raycastFirst(ray, THREE.DoubleSide)
    return h ? h.point.y : null
  }
  let best: THREE.Vector3 | null = null
  let bestScore = Infinity
  const nx = 13
  const nz = 41
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x = c.x + (i / (nx - 1) - 0.5) * size.x * 0.5
      const z = c.z + (j / (nz - 1) - 0.5) * size.z * 0.8
      const y = probe(x, z)
      if (y === null) continue
      // まわり 1.6 m が同じ高さ（小屋が置ける平ら）で、ツムギの通る 6 m 上まで何もない
      let flat = true
      for (const [dx, dz] of [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6], [1.2, 1.2], [-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2]]) {
        const y2 = probe(x + dx, z + dz)
        if (y2 === null || Math.abs(y2 - y) > 0.25) {
          flat = false
          break
        }
      }
      if (!flat) continue
      // 背中の高い所で、まんなかに近い所ほどよい
      const score = Math.abs(x - c.x) * 2 + Math.abs(z - c.z) * 0.7 - (y - c.y) * 1.5
      if (score < bestScore) {
        bestScore = score
        best = new THREE.Vector3(x, y, z)
      }
    }
  if (!best) {
    const y = probe(c.x, c.z)
    best = new THREE.Vector3(c.x, y ?? box.max.y, c.z)
  }
  return best
}

/** 真上から見た形（ミニマップ） */
function silhouette(bvh: MeshBVH, box: THREE.Box3): Silhouette {
  const size = box.getSize(new THREE.Vector3())
  const N = 72
  const cell = Math.max(size.x, size.z) / N
  const nx = Math.ceil(size.x / cell)
  const nz = Math.ceil(size.z / cell)
  const rows: [number, number, number][] = []
  ray.direction.set(0, -1, 0)
  for (let j = 0; j < nz; j++) {
    let start = -1
    for (let i = 0; i <= nx; i++) {
      let on = false
      if (i < nx) {
        ray.origin.set(box.min.x + (i + 0.5) * cell, box.max.y + 5, box.min.z + (j + 0.5) * cell)
        on = !!bvh.raycastFirst(ray, THREE.DoubleSide)
      }
      if (on && start < 0) start = i
      if (!on && start >= 0) {
        rows.push([j, start, i - start])
        start = -1
      }
    }
  }
  return { x0: box.min.x, z0: box.min.z, cell, rows }
}

/** 母船の形を読みこんだあと、エアロックの場所と範囲を決める。返すのは船の模型を置く位置（場面の座標） */
export function setupShipSite(bvh: MeshBVH, lengthM: number) {
  shipCol.bvh?.geometry.dispose()
  shipCol.bvh = bvh
  const box = new THREE.Box3()
  bvh.getBoundingBox(box)
  const spot = findAirlockSpot(bvh, box)
  // エアロックの小屋の分だけ持ち上げる（小屋の上面が原点）
  shipCol.offset.copy(spot).negate().add(va.set(0, -MODULE_H, 0))
  shipCol.box.copy(box).translate(shipCol.offset)
  // 小屋も船の一部として、外形の箱に入れる
  shipCol.box.expandByPoint(va.set(0, 0.2, 0))
  const size = box.getSize(va)
  shipCol.L = Math.max(lengthM, size.x, size.z)
  shipCol.warn = Math.max(35, shipCol.L * 0.18)
  shipCol.limit = Math.max(60, shipCol.L * 0.3)
  const sil = silhouette(bvh, box)
  sil.x0 += shipCol.offset.x
  sil.z0 += shipCol.offset.z
  shipCol.sil = sil
  return shipCol.offset.clone()
}

export function clearShipSite() {
  shipCol.bvh?.geometry.dispose()
  shipCol.bvh = null
  shipCol.sil = null
}

/** 小屋（エアロックのまわりの箱）からの距離と外向き */
function moduleDistance(p: THREE.Vector3, n: THREE.Vector3) {
  const h = MODULE_W / 2
  const cx = THREE.MathUtils.clamp(p.x, -h, h)
  const cy = THREE.MathUtils.clamp(p.y, -MODULE_H - 0.5, 0)
  const cz = THREE.MathUtils.clamp(p.z, -h, h)
  n.set(p.x - cx, p.y - cy, p.z - cz)
  const d = n.length()
  if (d > 1e-6) {
    n.divideScalar(d)
    return d
  }
  // 箱の中：いちばん近い面から外へ
  const dx = h - Math.abs(p.x)
  const dz = h - Math.abs(p.z)
  const dy = -p.y
  if (dy <= dx && dy <= dz) {
    n.set(0, 1, 0)
    return -dy
  }
  if (dx < dz) {
    n.set(Math.sign(p.x) || 1, 0, 0)
    return -dx
  }
  n.set(0, 0, Math.sign(p.z) || 1)
  return -dz
}

const nm = new THREE.Vector3()

/** 場面の点 p から、船の面（と小屋）までの距離（m）。n に外向き。遠すぎる（maxD より先）なら maxD */
export function shipDistance(p: THREE.Vector3, n: THREE.Vector3, maxD = 1e6) {
  const bvh = shipCol.bvh
  let best = maxD
  n.set(0, 1, 0)
  // エアロックの穴の中（発進・回収のとき）は当たらない
  const inHole = Math.abs(p.x) < 0.75 && Math.abs(p.z) < 0.75 && p.y < 0.2
  if (!inHole) {
    const dm = moduleDistance(p, nm)
    if (dm < best) {
      best = dm
      n.copy(nm)
    }
  }
  if (!bvh) return best
  q.copy(p).sub(shipCol.offset)
  const h = bvh.closestPointToPoint(q, hit, 0, Math.min(best, maxD))
  if (h && h.distance < best) {
    best = h.distance
    if (best > 1e-5) n.subVectors(q, h.point).divideScalar(best)
    else faceNormal(bvh, h.faceIndex, n)
  }
  return best
}

function faceNormal(bvh: MeshBVH, face: number, out: THREE.Vector3) {
  const g = bvh.geometry
  const idx = g.index!
  const pos = g.getAttribute('position')
  va.fromBufferAttribute(pos, idx.getX(face * 3))
  vb.fromBufferAttribute(pos, idx.getX(face * 3 + 1))
  vc.fromBufferAttribute(pos, idx.getX(face * 3 + 2))
  tri.set(va, vb, vc).getNormal(out)
  return out
}

/** from → to のあいだで、半径 r の玉が船の面に当たるか（すり抜け防止）。当たれば 0..1 の割合、なければ null */
export function shipSweep(from: THREE.Vector3, to: THREE.Vector3, r: number, nOut: THREE.Vector3) {
  const bvh = shipCol.bvh
  if (!bvh) return null
  const len = from.distanceTo(to)
  if (len < 1e-4) return null
  ray.origin.copy(from).sub(shipCol.offset)
  ray.direction.subVectors(to, from).divideScalar(len)
  const h = bvh.raycastFirst(ray, THREE.DoubleSide, 0, len + r)
  if (!h) return null
  if (h.face) nOut.copy(h.face.normal)
  else nOut.copy(ray.direction).negate()
  if (nOut.dot(ray.direction) > 0) nOut.negate()
  return Math.max(0, (h.distance - r) / len)
}

/** 船の外形の箱からの距離（m）。範囲の警告と限界に使う */
export function shipBoxDistance(p: THREE.Vector3) {
  return shipCol.box.distanceToPoint(p)
}
