import * as THREE from 'three'
import { seeded } from '../sf/batch'
/** 木の形の数：胸の高さの幹の半径 m、幹の高さ m、形の種（根元の位置 s, y は形を作るときは 0） */
type Tree = { s: number; y: number; r: number; h: number; seed: number }

// 森の見本の一角の、高い木（板根のある巨木）と細い若木の形を作る。読み込みは無く、その場で作る。
// 幹・枝・つるは「木の部分」、葉は「葉の房の板」（本物の木の枝先を撮った絵を貼る）の 2 つの形にまとめる。
// 座標は見本の一角のまん中を原点にした x = 東、y = 上、z = 北（30 m ほどなら、地面の丸みは 3 cm もない）。

/** 形を足していく入れ物 */
class Build {
  pos: number[] = []
  uv: number[] = []
  col: number[] = []
  idx: number[] = []
  /** 葉の板だけ：向き（光の当たり方をなだらかにするため、板の向きではなく樹冠の外向き）と、風のゆれ（位相、幅 m） */
  nor: number[] = []
  sway: number[] = []
  /** つなぎ目（同じ場所の 2 つの頂点）。向きを平均して、筋が出ないようにする */
  seams: [number, number][] = []
  get count() {
    return this.pos.length / 3
  }
  geometry(computeNormals: boolean) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setIndex(this.idx)
    if (computeNormals) {
      g.computeVertexNormals()
      const n = g.attributes.normal as THREE.BufferAttribute
      for (const [a, b] of this.seams) {
        const x = n.getX(a) + n.getX(b)
        const y = n.getY(a) + n.getY(b)
        const z = n.getZ(a) + n.getZ(b)
        const l = Math.hypot(x, y, z) || 1
        n.setXYZ(a, x / l, y / l, z / l)
        n.setXYZ(b, x / l, y / l, z / l)
      }
    } else {
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
      g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 2))
    }
    g.computeBoundingSphere()
    return g
  }
}

const UP = new THREE.Vector3(0, 1, 0)
const a = new THREE.Vector3()
const b = new THREE.Vector3()
const c = new THREE.Vector3()

/** 遠く用の軽い形を作っているとき：管の区切りと葉の板の区切りを減らす（乱数の使い方は同じなので、形は近く用と同じになる） */
let far = false

/** 樹皮の絵 1 枚の大きさ m（横・縦） */
const BARK = { u: 1.5, v: 2.1 }

/** 点の列に沿った管（枝・幹の上の方・つる）。shade は頂点の色の明るさ */
function tube(B: Build, pts: THREE.Vector3[], radii: number[], seg: number, shade = 1, uRep = 2) {
  if (far) seg = Math.max(3, Math.ceil(seg / 2))
  const n = new THREE.Vector3()
  const t = new THREE.Vector3()
  const bi = new THREE.Vector3()
  let len = 0
  const base = B.count
  for (let i = 0; i < pts.length; i++) {
    t.subVectors(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]).normalize()
    // 管の向きに合わせて、前の輪の向きを引き継ぐ（ねじれないように）
    if (i === 0) n.set(1, 0, 0).addScaledVector(t, -t.x).normalize()
    else n.addScaledVector(t, -n.dot(t)).normalize()
    if (n.lengthSq() < 0.5) n.set(0, 0, 1).addScaledVector(t, -t.z).normalize()
    bi.crossVectors(t, n)
    if (i) len += pts[i].distanceTo(pts[i - 1])
    for (let j = 0; j <= seg; j++) {
      const f = (j / seg) * Math.PI * 2
      a.copy(pts[i]).addScaledVector(n, Math.cos(f) * radii[i]).addScaledVector(bi, Math.sin(f) * radii[i])
      B.pos.push(a.x, a.y, a.z)
      B.uv.push((j / seg) * uRep, len / BARK.v)
      B.col.push(shade, shade, shade)
    }
    B.seams.push([base + i * (seg + 1), base + i * (seg + 1) + seg])
  }
  for (let i = 0; i < pts.length - 1; i++)
    for (let j = 0; j < seg; j++) {
      const p = base + i * (seg + 1) + j
      const q = p + seg + 1
      B.idx.push(p, p + 1, q, p + 1, q + 1, q)
    }
}

/** 葉の房の絵（2×2）のどれを使うか：0 こんもり、1 枝の見える房、2 横から見た房、3 枝先 */
type Cell = 0 | 1 | 2 | 3

/**
 * 葉の房の板 1 枚。centre を中心に、u・v の向きへ size m 四方。grid ごとに区切って、まん中から外へ sag m 垂らす（かさの形）。
 * crown = 樹冠のまん中と上下（光と色を決める）
 */
function card(B: Build, rand: () => number, centre: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, size: number, cell: Cell, grid: number, sag: number, crown: { c: THREE.Vector3; y0: number; y1: number }) {
  if (far) grid = 1
  const base = B.count
  const flip = rand() < 0.5
  const nrm = c.crossVectors(v, u).normalize().clone()
  const phase = rand() * Math.PI * 2
  const amp = 0.05 + rand() * 0.07
  const tone = 0.9 + rand() * 0.18
  const tint = [tone * (0.9 + rand() * 0.14), tone, tone * (0.82 + rand() * 0.16)]
  for (let i = 0; i <= grid; i++)
    for (let j = 0; j <= grid; j++) {
      const x = j / grid - 0.5
      const z = i / grid - 0.5
      a.copy(centre)
        .addScaledVector(u, x * size)
        .addScaledVector(v, z * size)
        .addScaledVector(nrm, -sag * (x * x + z * z) * 4)
      B.pos.push(a.x, a.y, a.z)
      const fu = 0.012 + (flip ? 0.5 - x : x + 0.5) * 0.976
      const fv = 0.012 + (0.5 - z) * 0.976
      B.uv.push(((cell % 2) + fu) / 2, (Math.floor(cell / 2) + fv) / 2)
      // 光は、板の向きではなく「樹冠の外向き＋上」で受ける（板ごとにバラバラに光らないように）
      b.subVectors(a, crown.c).normalize().multiplyScalar(0.7).addScaledVector(UP, 0.7).addScaledVector(nrm, 0.25).normalize()
      B.nor.push(b.x, b.y, b.z)
      // 樹冠の下の方・内側ほど暗い
      const f = Math.min(1, Math.max(0, (a.y - crown.y0) / (crown.y1 - crown.y0)))
      const k = 0.64 + 0.36 * f
      B.col.push(tint[0] * k, tint[1] * k, tint[2] * k)
      B.sway.push(phase, amp)
    }
  for (let i = 0; i < grid; i++)
    for (let j = 0; j < grid; j++) {
      const p = base + i * (grid + 1) + j
      const q = p + grid + 1
      // 表（決めた向きで光を受ける側）が、板の上の面になるように
      B.idx.push(p, q, p + 1, p + 1, q, q + 1)
    }
}

/** 枝先などの 1 か所に、葉の房をひとかたまり付ける。out = 樹冠の外へ向かう水平の向き */
function cluster(B: Build, rand: () => number, at: THREE.Vector3, out: THREE.Vector3, size: number, crown: { c: THREE.Vector3; y0: number; y1: number }, tip: boolean) {
  const u = new THREE.Vector3()
  const v = new THREE.Vector3()
  const p = new THREE.Vector3()
  const side = new THREE.Vector3().crossVectors(UP, out).normalize()
  /** ほぼ水平な「かさ」の板：外へ少し傾ける */
  const cap = (centre: THREE.Vector3, s: number, cell: Cell) => {
    const yaw = rand() * Math.PI * 2
    const tilt = 0.12 + rand() * 0.3
    const n = new THREE.Vector3().copy(UP).multiplyScalar(Math.cos(tilt)).addScaledVector(out, Math.sin(tilt)).normalize()
    u.set(Math.cos(yaw), 0, Math.sin(yaw))
    u.addScaledVector(n, -u.dot(n)).normalize()
    v.crossVectors(u, n)
    card(B, rand, centre, u, v, s, cell, 3, s * 0.2, crown)
  }
  cap(p.copy(at).addScaledVector(UP, 0.4), size, rand() < 0.6 ? 0 : 1)
  if (size > 2.6) cap(p.copy(at).addScaledVector(side, (rand() - 0.5) * size * 0.6).addScaledVector(out, (rand() - 0.5) * size * 0.4).addScaledVector(UP, 0.9 + rand() * 0.7), size * (0.72 + rand() * 0.2), rand() < 0.5 ? 0 : 3)
  // 外へ向いて立った板（横から見たときに、薄い皿の重なりに見えないように）
  {
    const tilt = 0.9 + rand() * 0.45
    const n = new THREE.Vector3().copy(UP).multiplyScalar(Math.cos(tilt)).addScaledVector(out, Math.sin(tilt)).addScaledVector(side, (rand() - 0.5) * 0.6).normalize()
    u.copy(side).addScaledVector(n, -side.dot(n)).normalize()
    v.crossVectors(u, n)
    card(B, rand, p.copy(at).addScaledVector(out, size * 0.22).addScaledVector(UP, -0.2), u, v, size * 0.9, rand() < 0.5 ? 1 : 3, 2, size * 0.08, crown)
  }
  // 枝先から垂れる房（横から撮った絵。上が枝の側）
  if (tip) {
    const yaw = rand() * Math.PI
    u.copy(side).multiplyScalar(Math.cos(yaw)).addScaledVector(out, Math.sin(yaw))
    v.copy(UP)
    card(B, rand, p.copy(at).addScaledVector(out, size * 0.25).addScaledVector(UP, -size * 0.3), u, v, size * 0.85, 2, 1, 0, crown)
  }
}

/** 枝 1 本の点の列：start から、水平の向き out へ reach m、上へ rise m。先へ行くほど横に寝る */
function limbPath(start: THREE.Vector3, out: THREE.Vector3, reach: number, rise: number, rand: () => number, n = 6) {
  const side = new THREE.Vector3().crossVectors(UP, out).normalize()
  const wob = (rand() - 0.5) * reach * 0.22
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    pts.push(
      start
        .clone()
        .addScaledVector(out, reach * Math.pow(t, 1.15))
        .addScaledVector(UP, rise * (1 - Math.pow(1 - t, 1.7)))
        .addScaledVector(side, wob * Math.sin(t * Math.PI)),
    )
  }
  return pts
}
const along = (pts: THREE.Vector3[], t: number) => {
  const f = Math.min(pts.length - 1.001, Math.max(0, t * (pts.length - 1)))
  const i = Math.floor(f)
  return pts[i].clone().lerp(pts[i + 1], f - i)
}

/** 高い木：板根の張った太い幹、高い所で分かれる大枝、その先の葉の房、垂れるつる、幹をはい登るつる */
function tallTree(wood: Build, leaves: Build, t: Tree, ox: number, oz: number) {
  const rand = seeded(t.seed)
  const H = t.h
  const r0 = t.r
  const lean = [(rand() - 0.5) * 0.05, (rand() - 0.5) * 0.05]
  const bendA = rand() * Math.PI * 2
  const bend = 0.25 + rand() * 0.35
  const centre = (h: number, out = new THREE.Vector3()) => {
    const k = bend * Math.sin((Math.max(0, h) / H) * Math.PI)
    return out.set(ox + lean[0] * h + Math.cos(bendA) * k, h, oz + lean[1] * h + Math.sin(bendA) * k)
  }
  /** 幹の半径：上へ行くほど細く、根元で少し広がる */
  const rb = (h: number) => r0 * (0.62 + 0.38 * Math.pow(1 - Math.min(1, Math.max(0, h) / H), 0.7)) * (1 + 0.5 * Math.exp(-Math.max(0, h) / 0.7))
  // 板根：幹から外へ張り出す薄い板。根元で大きく、上へ行くと幹に溶ける
  const fins: { th: number; reach: number; top: number }[] = []
  const nf = 4 + Math.floor(rand() * 3)
  const th0 = rand() * Math.PI * 2
  for (let i = 0; i < nf; i++) fins.push({ th: th0 + (i / nf) * Math.PI * 2 + (rand() - 0.5) * 0.5, reach: r0 * (1.9 + rand() * 1.7), top: 2.8 + rand() * 2.2 })
  const ph1 = rand() * 6
  const ph2 = rand() * 6
  const finAt = (th: number, h: number) => {
    let e = 0
    for (const f of fins) {
      if (h >= f.top) continue
      let d = Math.abs(th - f.th) % (Math.PI * 2)
      if (d > Math.PI) d = Math.PI * 2 - d
      const w = 0.09 + 0.24 * (h / f.top)
      e += f.reach * Math.pow(1 - h / f.top, 2.3) * Math.exp(-((d / w) ** 2))
    }
    return e
  }
  const TOP = 5.6
  const radius = (th: number, h: number) => {
    const hh = Math.max(0, h)
    const fade = 1 - Math.min(1, hh / TOP)
    return rb(hh) * (1 + fade * (0.05 * Math.sin(2 * th + ph1) + 0.03 * Math.sin(5 * th + ph2))) + finAt(th, hh)
  }
  // まわりの区切り：等間隔に、板根のまわりだけ細かく
  let ths: number[] = []
  const ring = far ? 10 : 22
  for (let i = 0; i < ring; i++) ths.push((i / ring) * Math.PI * 2)
  for (const f of fins) for (const d of far ? [-0.16, 0, 0.16] : [-0.3, -0.16, -0.07, 0, 0.07, 0.16, 0.3]) ths.push((((f.th + d) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2))
  ths.sort((p, q) => p - q)
  ths = ths.filter((v, i) => i === 0 || v - ths[i - 1] > 0.025)
  ths.push(ths[0] + Math.PI * 2)
  // 樹皮の絵の横の位置：高さ 0.9 m の輪の周の長さで決める（どの高さでも同じにして、絵が斜めにずれないように）
  const us = [0]
  for (let j = 1; j < ths.length; j++) {
    const r1 = radius(ths[j - 1], 0.9)
    const r2 = radius(ths[j], 0.9)
    us.push(us[j - 1] + Math.hypot(r2 * Math.cos(ths[j]) - r1 * Math.cos(ths[j - 1]), r2 * Math.sin(ths[j]) - r1 * Math.sin(ths[j - 1])) / BARK.u)
  }
  const hs = far ? [-0.4, 0, 0.5, 1.4, 3, TOP] : [-0.4, 0, 0.2, 0.5, 0.9, 1.4, 2.1, 3, 4, 5, TOP]
  const base = wood.count
  const cen = new THREE.Vector3()
  hs.forEach((h, i) => {
    centre(h, cen)
    ths.forEach((th, j) => {
      const r = radius(th, h) * (h < 0 ? 1.06 : 1)
      wood.pos.push(cen.x + Math.cos(th) * r, h, cen.z + Math.sin(th) * r)
      wood.uv.push(us[j], h / BARK.v)
      // 根元と、板根のあいだの谷は暗い
      const low = 0.5 + 0.5 * Math.min(1, Math.max(0, h) / 3.2)
      const valley = h < 4 ? 0.72 + 0.28 * Math.min(1, finAt(th, Math.max(0, h)) / (r0 * 0.6) + Math.max(0, h) / 4) : 1
      const sh = low * valley
      wood.col.push(sh, sh, sh)
    })
    wood.seams.push([base + i * ths.length, base + i * ths.length + ths.length - 1])
  })
  for (let i = 0; i < hs.length - 1; i++)
    for (let j = 0; j < ths.length - 1; j++) {
      const p = base + i * ths.length + j
      const q = p + ths.length
      wood.idx.push(p, q, p + 1, p + 1, q, q + 1)
    }
  // 幹の上の方
  {
    const pts: THREE.Vector3[] = []
    const rs: number[] = []
    for (let i = 0; i <= 7; i++) {
      const h = TOP - 0.4 + ((H - TOP + 0.4) * i) / 7
      pts.push(centre(h))
      rs.push(rb(h) * 0.985)
    }
    tube(wood, pts, rs, 12, 1, 3)
  }
  // 大枝と葉
  const top = centre(H)
  const crown = { c: top.clone().addScaledVector(UP, 2.5), y0: H - 3.5, y1: H + 8 }
  const scale = H / 17
  const limbs: THREE.Vector3[][] = []
  const dir = (az: number) => new THREE.Vector3(Math.cos(az), 0, Math.sin(az))
  const grow = (start: THREE.Vector3, az: number, reach: number, rise: number, r: number, anchors: number[], size: number, n = 6) => {
    const out = dir(az)
    const pts = limbPath(start, out, reach, rise, rand, n)
    tube(
      wood,
      pts,
      pts.map((_, i) => r * (1 - 0.84 * (i / (pts.length - 1)))),
      7,
      0.92,
      1,
    )
    limbs.push(pts)
    for (const f of anchors) cluster(leaves, rand, along(pts, f), out, size * (0.85 + rand() * 0.3), crown, f > 0.95)
    return pts
  }
  const nl = 3 + Math.floor(rand() * 2)
  const az0 = rand() * Math.PI * 2
  for (let i = 0; i < nl; i++) {
    const az = az0 + (i / nl) * Math.PI * 2 + (rand() - 0.5) * 0.5
    const L = (6.5 + rand() * 3) * scale
    const pts = grow(top.clone().addScaledVector(UP, -0.3), az, L * 0.85, L * 0.6, r0 * 0.42, [0.55, 0.8, 1], 4.4 * scale)
    for (const [f, sgn] of [
      [0.4, 1],
      [0.68, -1],
    ]) {
      const L2 = L * (0.5 + rand() * 0.15)
      grow(along(pts, f), az + sgn * (0.7 + rand() * 0.45), L2 * 0.9, L2 * 0.4, r0 * 0.2, [0.6, 1], 3.6 * scale, 4)
    }
  }
  // まん中を上へ伸びる枝（樹冠のまん中を埋める）
  grow(top.clone().addScaledVector(UP, -0.2), rand() * Math.PI * 2, 1.2 * scale, 5.2 * scale, r0 * 0.4, [0.6, 1], 4.4 * scale, 4)
  // 下の方の横枝
  for (let i = 0; i < 2; i++) {
    const h = H * (0.6 + rand() * 0.2)
    const L = (4 + rand() * 1.8) * scale
    grow(centre(h), az0 + 1 + i * 2.6 + rand(), L, L * 0.28, r0 * 0.22, [0.7, 1], 3.2 * scale, 4)
  }
  // 樹冠のすき間を埋める房（下から見上げたとき、空が見えすぎないように）
  for (let i = 0; i < 11; i++) {
    const az = az0 + i * 2.4 + rand()
    const d = (2.5 + rand() * 6.5) * scale
    const at = top.clone().addScaledVector(dir(az), d)
    at.y = H + (1.2 + rand() * 4.2 - d * 0.28) * scale
    cluster(leaves, rand, at, dir(az), (3.8 + rand() * 1.6) * scale, crown, false)
  }
  // 枝から垂れるつる（何本かは地面まで届く）
  for (let i = 0; i < 3; i++) {
    const limb = limbs[Math.floor(rand() * limbs.length)]
    const s = along(limb, 0.35 + rand() * 0.55)
    const end = rand() < 0.4 ? 0.05 : 1.5 + rand() * 6
    const az = rand() * Math.PI * 2
    const off = 0.4 + rand() * 1.8
    const e = new THREE.Vector3(s.x + Math.cos(az) * off, end, s.z + Math.sin(az) * off)
    const sagDir = dir(rand() * Math.PI * 2)
    const sag = 0.25 + rand() * 0.7
    const pts: THREE.Vector3[] = []
    for (let j = 0; j <= 8; j++) {
      const f = j / 8
      pts.push(
        s
          .clone()
          .lerp(e, f)
          .addScaledVector(sagDir, Math.sin(f * Math.PI) * sag + Math.sin(f * 9 + i) * 0.06),
      )
    }
    const r = 0.016 + rand() * 0.02
    tube(
      wood,
      pts,
      pts.map(() => r),
      4,
      0.75,
      0.5,
    )
  }
  // 幹をはい登るつる
  for (let i = 0; i < 3; i++) {
    const th1 = rand() * Math.PI * 2
    const turn = (rand() < 0.5 ? -1 : 1) * (0.8 + rand() * 1.4)
    const upTo = 6 + rand() * 6
    const pts: THREE.Vector3[] = []
    for (let j = 0; j <= 11; j++) {
      const f = j / 11
      const h = 0.1 + upTo * f
      const th = th1 + turn * f + Math.sin(f * 7 + i) * 0.12
      const r = (h < TOP ? radius(th, h) : rb(h)) + 0.045
      centre(h, cen)
      pts.push(new THREE.Vector3(cen.x + Math.cos(th) * r, h, cen.z + Math.sin(th) * r))
    }
    const r = 0.04 + rand() * 0.035
    tube(
      wood,
      pts,
      pts.map((_, j) => r * (1 - 0.5 * (j / 11))),
      4,
      0.6,
      0.5,
    )
  }
}

/** 細い若木：まっすぐな細い幹と、上の小さな樹冠 */
function poleTree(wood: Build, leaves: Build, t: Tree, ox: number, oz: number) {
  const rand = seeded(t.seed)
  const H = t.h
  const wa = rand() * Math.PI * 2
  const wob = 0.12 + rand() * 0.25
  const pts: THREE.Vector3[] = []
  const rs: number[] = []
  for (let i = 0; i <= 6; i++) {
    const f = i / 6
    const h = -0.25 + (H + 0.25) * f
    pts.push(new THREE.Vector3(ox + Math.cos(wa) * wob * Math.sin(f * Math.PI * 1.3), h, oz + Math.sin(wa) * wob * Math.sin(f * Math.PI * 1.3)))
    rs.push(t.r * (1.15 - 0.7 * f))
  }
  tube(wood, pts, rs, 6, 0.9, 1)
  const top = pts[pts.length - 1]
  const crown = { c: top.clone().addScaledVector(UP, 0.6), y0: H - 1.5, y1: H + 2.5 }
  const az0 = rand() * Math.PI * 2
  for (let i = 0; i < 3; i++) {
    const out = new THREE.Vector3(Math.cos(az0 + i * 2.1), 0, Math.sin(az0 + i * 2.1))
    const L = 1.4 + rand() * 1.3
    const twig = limbPath(along(pts, 0.82 + rand() * 0.15), out, L, L * 0.7, rand, 3)
    tube(
      wood,
      twig,
      twig.map((_, j) => t.r * 0.4 * (1 - 0.8 * (j / 3))),
      5,
      0.9,
      1,
    )
    cluster(leaves, rand, twig[twig.length - 1], out, 2.2 + rand() * 1, crown, rand() < 0.5)
  }
  cluster(leaves, rand, top.clone().addScaledVector(UP, 0.5), new THREE.Vector3(Math.cos(az0 + 1), 0, Math.sin(az0 + 1)), 2.4 + rand() * 0.8, crown, false)
  // 幹の途中から出る横枝（目の高さより上の、中ほどの層を埋める）
  const mid = { c: along(pts, 0.6), y0: H * 0.3, y1: H * 0.9 }
  for (let i = 0; i < 2; i++) {
    const az = az0 + 0.9 + i * 2.7 + rand()
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az))
    const L = 1 + rand() * 1.1
    const twig = limbPath(along(pts, 0.45 + i * 0.16 + rand() * 0.1), out, L, L * 0.35, rand, 3)
    tube(
      wood,
      twig,
      twig.map((_, j) => t.r * 0.3 * (1 - 0.8 * (j / 3))),
      4,
      0.9,
      1,
    )
    cluster(leaves, rand, twig[twig.length - 1], out, 1.7 + rand() * 0.9, mid, true)
  }
}

/** 木 1 本の形（根元が原点、x = 東、y = 上、z = 北）。kind = 高い木か細い若木。lod = 1 で遠く用の軽い形 */
export function treeShape(kind: 'tall' | 'pole', t: Pick<Tree, 'r' | 'h' | 'seed'>, lod: 0 | 1) {
  const wood = new Build()
  const leaves = new Build()
  far = lod === 1
  const tree = { ...t, s: 0, y: 0 }
  if (kind === 'tall') tallTree(wood, leaves, tree, 0, 0)
  else poleTree(wood, leaves, tree, 0, 0)
  far = false
  return { wood: wood.geometry(true), leaves: leaves.geometry(false) }
}
