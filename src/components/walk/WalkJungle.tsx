import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { colonyDay } from '../sf/colonyCity'
import { Batch, place, seeded } from '../sf/batch'
import { currentLevel, lowMemory } from '../../state/quality'
import { JUNGLE, JUNGLE_GATE, jungleLayout, type Plant } from './jungle'
import { standAt } from './WalkWorld'

// お試しのジャングル（ラボの森）の植物。読み込むものはなく、形も葉の絵もここで作る。
// 種類ごとに 1 つの形を、場所・向き・大きさ・色を変えて並べる（InstancedMesh）ので、描く回数は種類の数だけ。
// 巨木（板根・つる）、木性シダ、大きなハート形の葉、光る実、らせんの角、巨大キノコ、下草。
// 夜は光る実とキノコの斑点が明るくなり、根元の地面がほのかに光る。

/* ---------- 葉の絵（キャンバスで描く。白っぽい緑で描いて、1 本ごとの色を掛ける） ---------- */

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  draw(g)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** シダの葉：まん中の軸と、左右に並ぶ小葉（先へ行くほど小さい）。軸は v の向き、根元が v = 0 */
function frondTexture() {
  return canvasTexture(128, 512, (g) => {
    const rand = seeded(11)
    g.strokeStyle = '#b9c79a'
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(64, 512)
    g.lineTo(64, 6)
    g.stroke()
    for (let y = 470; y > 14; y -= 13) {
      const t = 1 - y / 512
      const len = 58 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.95) + 6
      for (const side of [-1, 1]) {
        g.fillStyle = `hsl(${92 + rand() * 14}, ${45 + rand() * 15}%, ${72 + rand() * 10}%)`
        g.beginPath()
        g.ellipse(64 + side * len * 0.5, y - 6, len * 0.5, 5.5, side * -0.35, 0, Math.PI * 2)
        g.fill()
      }
    }
  })
}

/** ハート形の大きな葉（クワズイモのような）。葉柄の付く所が下のまん中 */
function heartTexture() {
  return canvasTexture(256, 256, (g) => {
    const path = new Path2D()
    path.moveTo(128, 250)
    path.bezierCurveTo(60, 230, 4, 150, 16, 70)
    path.bezierCurveTo(26, 14, 100, 6, 128, 46)
    path.bezierCurveTo(156, 6, 230, 14, 240, 70)
    path.bezierCurveTo(252, 150, 196, 230, 128, 250)
    const grad = g.createLinearGradient(0, 256, 0, 0)
    grad.addColorStop(0, '#cfe3b4')
    grad.addColorStop(1, '#eef7dc')
    g.fillStyle = grad
    g.fill(path)
    g.save()
    g.clip(path)
    g.strokeStyle = 'rgba(120,140,90,0.55)'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(128, 250)
    g.lineTo(128, 50)
    g.stroke()
    g.lineWidth = 2
    for (let i = 0; i < 7; i++) {
      const y = 220 - i * 26
      for (const side of [-1, 1]) {
        g.beginPath()
        g.moveTo(128, y)
        g.quadraticCurveTo(128 + side * 50, y - 30, 128 + side * 115, y - 60)
        g.stroke()
      }
    }
    g.restore()
  })
}

/** 下草：細長い葉が何本も（根元が v = 0） */
function bladeTexture() {
  return canvasTexture(128, 256, (g) => {
    const rand = seeded(23)
    for (let i = 0; i < 9; i++) {
      const x = 14 + rand() * 100
      const top = 20 + rand() * 80
      const bend = (rand() - 0.5) * 50
      g.fillStyle = `hsl(${88 + rand() * 20}, 40%, ${66 + rand() * 18}%)`
      g.beginPath()
      g.moveTo(x - 5, 256)
      g.quadraticCurveTo(x - 3 + bend * 0.5, 140, x + bend, top)
      g.quadraticCurveTo(x + 3 + bend * 0.5, 140, x + 5, 256)
      g.fill()
    }
  })
}

/** 樹冠の葉の房：丸く集まった、たくさんの小さな葉 */
function foliageTexture() {
  return canvasTexture(256, 256, (g) => {
    const rand = seeded(41)
    for (let i = 0; i < 150; i++) {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * 100
      const x = 128 + Math.cos(a) * r
      const y = 128 + Math.sin(a) * r
      g.fillStyle = `hsl(${85 + rand() * 25}, ${35 + rand() * 20}%, ${48 + rand() * 30}%)`
      g.beginPath()
      g.ellipse(x, y, 7 + rand() * 7, 3.5 + rand() * 3, rand() * Math.PI, 0, Math.PI * 2)
      g.fill()
    }
  })
}

/* ---------- 形 ---------- */

/** 根元から +x へ伸びて、先が垂れる帯（シダの葉・大きな葉）。uv の v が根元→先 */
function bentStrip(L: number, W: number, rise: number, droop: number, seg = 8, cup = 0) {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let j = 0; j <= seg; j++) {
    const t = j / seg
    const x = t * L * Math.cos(rise)
    const y = t * L * Math.sin(rise) - droop * t * t * L
    for (const [side, u] of [
      [-1, 0],
      [1, 1],
    ]) {
      pos.push(x, y - cup * Math.sin(t * Math.PI) * 0.5, (side * W) / 2)
      uv.push(u, t)
    }
    // まん中の線（少し盛り上げて、葉に折り目をつける）
    if (cup) {
      pos.push(x, y + cup * Math.sin(t * Math.PI) * 0.2, 0)
      uv.push(0.5, t)
    }
  }
  const per = cup ? 3 : 2
  for (let j = 0; j < seg; j++) {
    const a = j * per
    const b = a + per
    if (cup) idx.push(a, a + 2, b, a + 2, b + 2, b, a + 2, a + 1, b + 2, a + 1, b + 1, b + 2)
    else idx.push(a, a + 1, b, a + 1, b + 1, b)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** 巨木（高さ 26 m ほど）：幹・板根・枝・つる、と樹冠 */
function giantGeometry() {
  const wood = new Batch()
  wood.add(new THREE.CylinderGeometry(0.75, 1.2, 22, 12, 1, true), place([0, 11, 0]))
  wood.add(new THREE.CylinderGeometry(1.2, 2.6, 2.4, 12, 1, true), place([0, 1.2, 0]))
  // 板根：根元から放射状に出る三角の板
  const fin = new THREE.Shape()
  fin.moveTo(0, 0)
  fin.lineTo(3.4, 0)
  fin.quadraticCurveTo(1.2, 0.8, 0, 4.6)
  fin.lineTo(0, 0)
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.35, bevelEnabled: false })
  finGeo.translate(0.6, 0, -0.175)
  for (let i = 0; i < 6; i++) wood.add(finGeo, place([0, 0, 0], [0, (i / 6) * Math.PI * 2 + 0.3, 0]))
  // 枝
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.5
    const m = new THREE.Matrix4().makeRotationY(a).multiply(place([2.4, 20.5, 0], [0, 0, -0.85], [1, 1, 1]))
    wood.add(new THREE.CylinderGeometry(0.22, 0.42, 7, 6, 1, true), m)
  }
  // 樹冠：葉の房の板をたくさん重ね（中が透けないように、暗い芯の丸もいくつか）
  const leaves = new Batch()
  const core = new Batch()
  const rand = seeded(7)
  const card = new THREE.PlaneGeometry(1, 1)
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * 8
    const y = 22.5 + rand() * 4.5 - (r / 8) ** 2 * 2.5
    const sz = 3.2 + rand() * 2.4
    leaves.add(card, place([Math.cos(a) * r, y, Math.sin(a) * r], [-Math.PI / 2 + (rand() - 0.5) * 1.6, rand() * Math.PI * 2, (rand() - 0.5) * 1.2], sz))
  }
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2
    const r = i === 0 ? 0 : 3.5
    core.add(new THREE.IcosahedronGeometry(3, 1), place([Math.cos(a) * r, 24.2, Math.sin(a) * r], [0, 0, 0], [1, 0.45, 1]))
  }
  // つる：樹冠の下から垂れる細い線
  const vines = new Batch()
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2
    const r = 2.2 + rand() * 5
    const len = 7 + rand() * 12
    vines.add(new THREE.CylinderGeometry(0.045, 0.06, len, 4, 1, true), place([Math.cos(a) * r, 22.5 - len / 2, Math.sin(a) * r], [(rand() - 0.5) * 0.12, 0, (rand() - 0.5) * 0.12]))
  }
  // 葉の板の向きは、光の当たり方がそろうように、みな上向きの法線にする
  const crown = leaves.build()
  const nor = crown.attributes.normal
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0)
  return { wood: wood.build(), crown, core: core.build(), vines: vines.build() }
}

/** 木性シダ（高さ 5 m ほど）：細い幹と、先の垂れる葉 11 枚 */
function fernGeometry() {
  const trunk = new Batch()
  trunk.add(new THREE.CylinderGeometry(0.13, 0.22, 4.6, 7, 1, true), place([0, 2.3, 0]))
  trunk.add(new THREE.SphereGeometry(0.28, 8, 6), place([0, 4.6, 0]))
  const fronds = new Batch()
  const rand = seeded(19)
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rand() * 0.3
    const rise = 0.75 - rand() * 0.6
    fronds.add(bentStrip(2.6 + rand() * 0.6, 0.75, rise, 0.38, 8), new THREE.Matrix4().makeTranslation(0, 4.6, 0).multiply(new THREE.Matrix4().makeRotationY(a)))
  }
  return { trunk: trunk.build(), fronds: fronds.build() }
}

/** 大きなハート形の葉の株（高さ 2 m ほど） */
function earGeometry() {
  const stems = new Batch()
  const blades = new Batch()
  const rand = seeded(29)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand() * 0.5
    const tilt = 0.25 + rand() * 0.35
    const len = 1.1 + rand() * 0.5
    const rot = new THREE.Matrix4().makeRotationY(a)
    // 葉柄：外へ傾いて伸びる
    const tip = new THREE.Vector3(Math.sin(tilt) * len, Math.cos(tilt) * len, 0).applyMatrix4(rot)
    stems.add(new THREE.CylinderGeometry(0.025, 0.045, len, 5, 1, true), rot.clone().multiply(place([Math.sin(tilt) * len * 0.5, Math.cos(tilt) * len * 0.5, 0], [0, 0, -tilt])))
    // 葉：葉柄の先から外へ、垂れ下がる
    blades.add(bentStrip(1.25 + rand() * 0.4, 1.05, 0.35, 0.75, 7, 0.18), new THREE.Matrix4().makeTranslation(tip.x, tip.y, tip.z).multiply(rot))
  }
  return { stems: stems.build(), blades: blades.build() }
}

/** 光る実の株（高さ 2.5 m ほど）：曲がった細い茎の先に光る玉 */
function bulbGeometry() {
  const stalks = new Batch()
  const bulbs = new Batch()
  const rand = seeded(31)
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2
    const h = 1.4 + rand() * 1.3
    const out = 0.3 + rand() * 0.6
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * out * 0.2, h * 0.6, Math.sin(a) * out * 0.2), new THREE.Vector3(Math.cos(a) * out, h, Math.sin(a) * out))
    stalks.add(new THREE.TubeGeometry(curve, 8, 0.03, 4, false))
    const r = 0.16 + rand() * 0.14
    bulbs.add(new THREE.SphereGeometry(1, 8, 6), place([Math.cos(a) * out, h + r * 0.6, Math.sin(a) * out], [0, 0, 0], [r, r * 1.25, r]))
    // 茎の途中にも小さな玉
    const p = curve.getPoint(0.6)
    bulbs.add(new THREE.SphereGeometry(1, 6, 4), place([p.x, p.y, p.z], [0, 0, 0], r * 0.45))
  }
  return { stalks: stalks.build(), bulbs: bulbs.build() }
}

/** らせんの角（高さ 4 m ほど）：ねじれながら細くなる円錐。色は段ごとに濃淡（頂点の色） */
function spiralGeometry() {
  const g = new THREE.ConeGeometry(0.42, 4, 9, 40).translate(0, 2, 0)
  const pos = g.attributes.position
  const col: number[] = []
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const t = y / 4
    const a = y * 1.7
    const r = 0.5 * (1 - t)
    const tw = y * 0.9
    const x = pos.getX(i) * Math.cos(tw) - pos.getZ(i) * Math.sin(tw)
    const z = pos.getX(i) * Math.sin(tw) + pos.getZ(i) * Math.cos(tw)
    pos.setXYZ(i, x + Math.cos(a) * r, y, z + Math.sin(a) * r)
    const band = 0.72 + 0.28 * (Math.floor(y / 0.28) % 2)
    const tip = 1 + 0.4 * t
    col.push(band * tip, band * tip, band * tip)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

/** 巨大キノコ（高さ 4.5 m ほど）：柄・つば、かさ、かさの裏、光る斑点 */
function mushroomGeometry() {
  const stalk = new Batch()
  stalk.add(new THREE.CylinderGeometry(0.26, 0.42, 4, 10, 1, true), place([0, 2, 0]))
  stalk.add(new THREE.CylinderGeometry(0.55, 0.3, 0.16, 12), place([0, 3.3, 0]))
  stalk.add(new THREE.CylinderGeometry(2.2, 0.35, 0.35, 20, 1, true), place([0, 3.85, 0]))
  const cap = new THREE.SphereGeometry(2.35, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 3.95, 0)
  const spots = new Batch()
  const rand = seeded(37)
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2
    const el = 0.25 + rand() * 1.0
    const x = Math.cos(a) * Math.cos(el) * 2.36
    const z = Math.sin(a) * Math.cos(el) * 2.36
    const y = 3.95 + Math.sin(el) * 2.35 * 0.55
    spots.add(new THREE.SphereGeometry(1, 6, 4), place([x, y, z], [0, 0, 0], [0.16 + rand() * 0.12, 0.06, 0.16 + rand() * 0.12]))
  }
  return { stalk: stalk.build(), cap, spots: spots.build() }
}

/** 下草（高さ 1.2 m ほど）：十字に組んだ 3 枚の板 */
function grassGeometry() {
  const b = new Batch()
  for (let i = 0; i < 3; i++) b.add(new THREE.PlaneGeometry(1.1, 1.2).translate(0, 0.6, 0), place([0, 0, 0], [0, (i / 3) * Math.PI, 0]))
  return b.build()
}

/** 入口のアーチ（白い金属の輪と、光の帯）と、森を囲む苔むした石垣 */
function gateGeometry() {
  const frame = new Batch()
  for (const x of [-3.6, 3.6]) frame.add(new THREE.CylinderGeometry(0.22, 0.28, 4.2, 10), place([x, 2.1, 0]))
  frame.add(new THREE.TorusGeometry(3.6, 0.22, 8, 32, Math.PI), place([0, 4.2, 0]))
  const glow = new THREE.TorusGeometry(3.6, 0.07, 6, 40, Math.PI).translate(0, 4.2, 0.24)
  return { frame: frame.build(), glow }
}

/* ---------- 置く ---------- */

const NIGHT_GLOW = new THREE.Color('#7af0d8')

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: Plant[], base: number, opts: { colors?: (p: Plant) => number; shadow?: boolean; lift?: number } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length))
  mesh.count = list.length
  const m = new THREE.Matrix4()
  const c = new THREE.Color()
  list.forEach((p, i) => {
    mesh.setMatrixAt(i, standAt(p.s, p.y, opts.lift ?? 0, p.yaw, p.k * base, m))
    if (opts.colors) mesh.setColorAt(i, c.setHex(opts.colors(p)))
  })
  mesh.castShadow = opts.shadow ?? true
  mesh.receiveShadow = true
  mesh.computeBoundingSphere()
  return mesh
}

/** 色を少しずらす（同じ色の株が並ばないように） */
function vary(hex: number, v: number, amount = 0.12) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  return c.setHSL((hsl.h + (v - 0.5) * amount * 0.4 + 1) % 1, hsl.s, Math.max(0, Math.min(1, hsl.l * (1 + (v - 0.5) * amount * 2)))).getHex()
}

export function WalkJungle() {
  const data = useMemo(() => {
    const J = jungleLayout()
    const shadows = currentLevel() === 'high' && !lowMemory()
    const tex = { frond: frondTexture(), heart: heartTexture(), blade: bladeTexture(), foliage: foliageTexture() }
    const leaf = (map: THREE.Texture) => new THREE.MeshLambertMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide })
    const solid = () => new THREE.MeshLambertMaterial({ color: '#ffffff' })
    const glowMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
    const giant = giantGeometry()
    const fern = fernGeometry()
    const ear = earGeometry()
    const bulb = bulbGeometry()
    const mush = mushroomGeometry()
    const gate = gateGeometry()
    const bark = [0x6b5a48, 0x5e5246, 0x7a6a58, 0x55524a]
    const meshes: THREE.Object3D[] = [
      instanced(giant.wood, solid(), J.giants, 1, { colors: (p) => bark[Math.floor(p.v * bark.length)] }),
      instanced(giant.crown, leaf(tex.foliage), J.giants, 1, { colors: (p) => vary(p.color, p.v) }),
      instanced(giant.core, solid(), J.giants, 1, { colors: (p) => new THREE.Color(vary(p.color, p.v)).multiplyScalar(0.45).getHex(), shadow: false }),
      instanced(giant.vines, solid(), J.giants, 1, { colors: () => 0x4a5a30, shadow: false }),
      instanced(fern.trunk, solid(), J.ferns, 1, { colors: () => 0x5a4a38 }),
      instanced(fern.fronds, leaf(tex.frond), J.ferns, 1, { colors: (p) => vary(p.color, p.v), shadow: shadows }),
      instanced(ear.stems, solid(), J.ears, 1, { colors: (p) => vary(p.color, p.v), shadow: false }),
      instanced(ear.blades, leaf(tex.heart), J.ears, 1, { colors: (p) => vary(p.color, p.v, 0.2), shadow: shadows }),
      instanced(bulb.stalks, solid(), J.bulbs, 1, { colors: () => 0x3f5a3a, shadow: false }),
      instanced(bulb.bulbs, glowMat, J.bulbs, 1, { colors: (p) => p.color, shadow: false }),
      instanced(spiralGeometry(), new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }), J.spirals, 1, { colors: (p) => vary(p.color, p.v) }),
      instanced(mush.stalk, solid(), J.mushrooms, 1, { colors: (p) => (p.v < 0.5 ? 0xe8e0cc : 0xd8cfb8) }),
      instanced(mush.cap, solid(), J.mushrooms, 1, { colors: (p) => vary(p.color, p.v) }),
      instanced(mush.spots, glowMat, J.mushrooms, 1, { colors: (p) => (p.color === 0xe9e2d0 ? 0x9af0ff : 0xfff0b0), shadow: false }),
      instanced(grassGeometry(), leaf(tex.blade), J.grass, 1, { colors: (p) => vary(p.color, p.v, 0.25), shadow: false }),
    ]
    // 入口のアーチ
    const at = standAt(JUNGLE_GATE.s, JUNGLE_GATE.y, 0, 0, 1, new THREE.Matrix4())
    const frame = new THREE.Mesh(gate.frame, new THREE.MeshLambertMaterial({ color: '#e8ecef' }))
    const ring = new THREE.Mesh(gate.glow, glowMat)
    for (const m of [frame, ring]) {
      m.matrixAutoUpdate = false
      m.matrix.copy(at)
      m.castShadow = m === frame
    }
    meshes.push(frame, ring)
    // 森のまわりの石垣（西・北・東。円周の向きは 16 m ごとに区切る）
    const walls: THREE.Matrix4[] = []
    const alongS = (y: number, s0: number, s1: number) => {
      const n = Math.ceil((s1 - s0) / 16)
      const l = (s1 - s0) / n
      for (let i = 0; i < n; i++) walls.push(standAt(s0 + l * (i + 0.5), y, 0, 0, [l + 0.05, 0.9, 0.6], new THREE.Matrix4()))
    }
    alongS(JUNGLE.y1 + 0.5, JUNGLE.s0 - 0.8, JUNGLE.s1 + 0.8)
    for (const s of [JUNGLE.s0 - 0.5, JUNGLE.s1 + 0.5]) walls.push(standAt(s, (JUNGLE.y0 + JUNGLE.y1) / 2 + 0.4, 0, Math.PI / 2, [JUNGLE.y1 - JUNGLE.y0 + 1, 0.9, 0.6], new THREE.Matrix4()))
    const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: '#6c7660' }), walls.length)
    walls.forEach((m, i) => wallMesh.setMatrixAt(i, m))
    wallMesh.receiveShadow = true
    wallMesh.computeBoundingSphere()
    meshes.push(wallMesh)
    // 夜、光る実とキノコの根元の地面がほのかに光る
    const glowSpots = [...J.bulbs, ...J.mushrooms]
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: NIGHT_GLOW, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
    const pools = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), poolMat, Math.max(1, glowSpots.length))
    const pm = new THREE.Matrix4()
    glowSpots.forEach((p, i) => pools.setMatrixAt(i, standAt(p.s, p.y, 0.1, 0, 3.2 * p.k, pm)))
    pools.count = glowSpots.length
    pools.renderOrder = 3
    pools.computeBoundingSphere()
    meshes.push(pools)
    meshes.forEach((m, i) => (m.name = `jungle-${i}`))
    return { meshes, glowMat, poolMat, textures: Object.values(tex) }
  }, [])
  useEffect(
    () => () => {
      for (const o of data.meshes) {
        const m = o as THREE.Mesh
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
        if (m instanceof THREE.InstancedMesh) m.dispose()
      }
      for (const t of data.textures) t.dispose()
    },
    [data],
  )
  useFrame(() => {
    const n = colonyDay.night
    // 昼もうっすら光って見え、夜はぐっと明るく
    data.glowMat.color.setScalar(0.8 + 1.3 * n)
    data.poolMat.opacity = 0.55 * n
  })
  return (
    <>
      {data.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

/** まん中が明るく、外へ向かって消える丸（夜の光のたまり） */
function poolTexture() {
  return canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,255,255,0.8)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
  })
}
