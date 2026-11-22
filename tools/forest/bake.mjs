// 森の見本の一角で使う「森の部品」を作る。素材は Poly Haven（CC0）の、本物をスキャンした植物と小物。
//   node tools/forest/bake.mjs            … 部品の形（public/models/forest-kit.glb）と画像（public/textures/forest/）
//   node tools/forest/bake.mjs --canopy   … 樹冠の葉の房の絵（canopy.webp）も作り直す（時間がかかる）
// 元の素材は tools/forest/raw/ に取ってくる（git には入れない）。形は三角形を減らして、量子化と meshopt で圧縮する。
// glb には画像を入れない。画像は別のファイルにして、スマホでは半分の大きさのものを読めるようにする。
import { NodeIO, Document, PropertyType } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { copyToDocument, dedup, prune, quantize, reorder, simplifyPrimitive, weldPrimitive, transformPrimitive, getBounds } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const here = new URL('.', import.meta.url).pathname
const RAW = join(here, 'raw')
const PUB = join(here, '../../public')
const UA = 'asset-fetch/1.0'

/**
 * 部品の一覧。from = Poly Haven の名前、nodes = glTF の中の部品の名前、tris = 減らした後の三角形の数、
 * far = 遠く用の形（.1）の三角形の数（0 = 作らない）、atlas と cell = 画像をまとめた 1 枚のどこを使うか。
 * plant = 根元と奥を暗くする（頂点の色）。base = いちばん下を地面（y = 0）に、まん中を x = z = 0 にそろえる。
 * crop = 横（x）に何株も並んだ素材から、この範囲（0〜1）の株だけを取り出す
 */
const PARTS = [
  // 下草：オオタニワタリのようなシダ（葉は切り抜き）
  { name: 'fern_a', from: 'fern_02', nodes: ['fern_02_b'], tris: 900, far: 260, atlas: 'leavesB', cell: 0, plant: true },
  { name: 'fern_b', from: 'fern_02', nodes: ['fern_02_d'], tris: 360, far: 120, atlas: 'leavesB', cell: 0, plant: true },
  // 下草：丸い大きな葉（カラテア）
  { name: 'calathea_a', from: 'calathea_orbifolia_01', nodes: ['calathea_orbifolia_01_a'], tris: 700, far: 220, atlas: 'leavesA', cell: 0, plant: true },
  { name: 'calathea_b', from: 'calathea_orbifolia_01', nodes: ['calathea_orbifolia_01_b'], tris: 460, far: 150, atlas: 'leavesA', cell: 0, plant: true },
  { name: 'calathea_c', from: 'calathea_orbifolia_01', nodes: ['calathea_orbifolia_01_e'], tris: 280, far: 0, atlas: 'leavesA', cell: 0, plant: true },
  // 下草：つやのある長い葉（アンスリウム）
  { name: 'anthurium_a', from: 'anthurium_botany_01', nodes: ['anthurium_botany_01_a'], tris: 700, far: 220, atlas: 'leavesA', cell: 1, plant: true },
  { name: 'anthurium_b', from: 'anthurium_botany_01', nodes: ['anthurium_botany_01_c'], tris: 480, far: 150, atlas: 'leavesA', cell: 1, plant: true },
  { name: 'anthurium_c', from: 'anthurium_botany_01', nodes: ['anthurium_botany_06_f'], tris: 300, far: 0, atlas: 'leavesA', cell: 1, plant: true },
  // 下草：矢じりの形の大きな葉（鉢植えの株から、葉だけ）
  { name: 'arrow', from: 'potted_plant_02', nodes: ['potted_plant_02_leaves'], tris: 1300, far: 400, atlas: 'leavesA', cell: 3, plant: true, base: true },
  // 下草：葉の茂る低い木
  { name: 'shrub', from: 'shrub_04', nodes: ['shrub_04'], tris: 1100, far: 350, atlas: 'leavesB', cell: 2, plant: true, base: true, crop: [0.74, 1] },
  // 地面をはう草（広げて、地面のすき間を埋める）
  { name: 'creeper_a', from: 'weed_plant_02', nodes: ['weed_plant_02_a_LOD0'], tris: 380, far: 0, atlas: 'leavesB', cell: 1, plant: true },
  { name: 'creeper_b', from: 'weed_plant_02', nodes: ['weed_plant_02_b_LOD0'], tris: 300, far: 0, atlas: 'leavesB', cell: 1, plant: true },
  // 中くらいの木（パキラ。幹と葉は別の画像）
  { name: 'pachira_a_bark', from: 'pachira_aquatica_01', nodes: ['pachira_aquatica_01_bark_d'], tris: 900, far: 240, atlas: 'props', cell: 0 },
  { name: 'pachira_a_leaves', from: 'pachira_aquatica_01', nodes: ['pachira_aquatica_01_leaves_d'], tris: 2000, far: 600, atlas: 'leavesA', cell: 2, plant: true },
  { name: 'pachira_b_bark', from: 'pachira_aquatica_01', nodes: ['pachira_aquatica_01_bark_c'], tris: 700, far: 200, atlas: 'props', cell: 0 },
  { name: 'pachira_b_leaves', from: 'pachira_aquatica_01', nodes: ['pachira_aquatica_01_leaves_c'], tris: 1500, far: 450, atlas: 'leavesA', cell: 2, plant: true },
  // 地面の小物
  { name: 'roots', from: 'root_cluster_01', nodes: ['root_cluster_01'], tris: 1400, far: 300, atlas: 'props', cell: 1 },
  { name: 'stump', from: 'tree_stump_01', nodes: ['tree_stump_01'], tris: 1000, far: 260, atlas: 'props', cell: 2 },
  { name: 'log', from: 'dead_tree_trunk_02', nodes: ['dead_tree_trunk_02'], tris: 1400, far: 320, atlas: 'props', cell: 3 },
  { name: 'log_b', from: 'dead_tree_trunk', nodes: ['dead_tree_trunk'], tris: 800, far: 200, atlas: 'props', cell: 5 },
  { name: 'rock_a', from: 'rock_moss_set_01', nodes: ['rock_moss_set_01_rock01'], tris: 450, far: 140, atlas: 'props', cell: 4 },
  { name: 'rock_b', from: 'rock_moss_set_01', nodes: ['rock_moss_set_01_rock04'], tris: 450, far: 140, atlas: 'props', cell: 4 },
  { name: 'rock_c', from: 'rock_moss_set_02', nodes: ['rock_moss_set_02_rock13'], tris: 450, far: 140, atlas: 'props', cell: 6 },
  { name: 'rock_d', from: 'rock_moss_set_02', nodes: ['rock_moss_set_02_rock11'], tris: 450, far: 140, atlas: 'props', cell: 6 },
]

/** 画像をまとめた 1 枚：cols × rows のます目、1 ます cell px。ます目の中の uv は、ふちを少しあけて縮める */
const ATLAS = {
  leavesA: { cols: 2, rows: 2, cell: 1024 },
  leavesB: { cols: 2, rows: 2, cell: 512 },
  props: { cols: 4, rows: 2, cell: 512 },
}
const INSET = 4

/** 画像の一覧。out = 出すファイル名、src = 元の画像（raw からの道）、alpha = 切り抜きの画像、size = 大きい方の一辺。小さい方（半分）も出す */
const model = (id, file) => `${id}/textures/${id}_${file}_1k.jpg`
const map = (id, name) => `${id}/maps/${name}.jpg`
const leaf = (id, diff, alpha) => ({ src: model(id, diff), alpha: map(id, alpha) })
const IMAGES = [
  // 葉（切り抜き）。A は大きい葉（1 ます 1024 px）、B は細かい葉（512 px）
  { out: 'leavesA', atlas: ATLAS.leavesA, items: [leaf('calathea_orbifolia_01', 'diff', 'Alpha'), leaf('anthurium_botany_01', 'diff', 'Alpha'), leaf('pachira_aquatica_01', 'leaves_diff', 'leaves_alpha'), leaf('potted_plant_02', 'leaves_diff', 'leaves_alpha')] },
  { out: 'leavesB', atlas: ATLAS.leavesB, items: [leaf('fern_02', 'diff', 'Alpha'), leaf('weed_plant_02', 'diff', 'Alpha'), leaf('shrub_04', 'diff', 'Alpha')] },
  // 葉の凹凸（高画質のときだけ読む。A だけ）
  { out: 'leavesA_n', atlas: { ...ATLAS.leavesA, cell: 512 }, data: true, half: false, items: [{ src: model('calathea_orbifolia_01', 'nor_gl') }, { src: model('anthurium_botany_01', 'nor_gl') }, { src: model('pachira_aquatica_01', 'leaves_nor_gl') }, { src: model('potted_plant_02', 'leaves_nor_gl') }] },
  // 幹や小物
  {
    out: 'props',
    atlas: ATLAS.props,
    items: [{ src: model('pachira_aquatica_01', 'bark_diff') }, { src: model('root_cluster_01', 'diff') }, { src: model('tree_stump_01', 'diff') }, { src: model('dead_tree_trunk_02', 'diff') }, { src: model('rock_moss_set_01', 'diff') }, { src: model('dead_tree_trunk', 'diff') }, { src: model('rock_moss_set_02', 'diff') }],
  },
  // 高い木の樹皮（くり返して貼る）
  { out: 'bark', src: map('chinese_hackberry_bark', 'Diffuse'), size: 1024 },
  { out: 'bark_n', src: map('chinese_hackberry_bark', 'nor_gl'), size: 1024, data: true, half: false },
  // 地面（くり返して貼る）：落ち葉、苔、ぬれた土
  { out: 'floor_leaves', src: map('forest_leaves_04', 'Diffuse'), size: 1024 },
  { out: 'floor_moss', src: map('forrest_ground_01', 'Diffuse'), size: 512 },
  { out: 'floor_mud', src: map('mud_forest', 'Diffuse'), size: 512 },
]
/** 樹冠の葉の房の絵のもと（tools/forest/canopy.html が使う） */
const CANOPY = { from: 'island_tree_02', maps: ['leaves_alpha'] }

/* ---------- 元の素材を取ってくる ---------- */

function curl(url, to) {
  if (existsSync(to) && statSync(to).size > 0) return
  mkdirSync(dirname(to), { recursive: true })
  const r = spawnSync('curl', ['-s', '-f', '-A', UA, '-o', to, url])
  if (r.status !== 0) throw new Error(`download failed: ${url}`)
}
const fileLists = new Map()
function files(id) {
  if (!fileLists.has(id)) {
    const to = join(RAW, `${id}.json`)
    curl(`https://api.polyhaven.com/files/${id}`, to)
    fileLists.set(id, JSON.parse(readFileSync(to, 'utf8')))
  }
  return fileLists.get(id)
}
/** glTF（1k）とその画像・形 */
function fetchModel(id) {
  const e = files(id).gltf['1k'].gltf
  curl(e.url, join(RAW, id, `${id}.gltf`))
  for (const [path, v] of Object.entries(e.include ?? {})) curl(v.url, join(RAW, id, path))
}
/** 画像 1 枚（1k の jpg） */
function fetchMap(id, name) {
  curl(files(id)[name]['1k'].jpg.url, join(RAW, id, 'maps', `${name}.jpg`))
}
function fetchAll() {
  for (const id of new Set([...PARTS.map((p) => p.from), CANOPY.from])) fetchModel(id)
  for (const im of IMAGES)
    for (const path of [im.src, im.alpha, ...(im.items ?? []).flatMap((i) => [i.src, i.alpha])]) {
      const m = path?.match(/^([^/]+)\/maps\/(.+)\.jpg$/)
      if (m) fetchMap(m[1], m[2])
    }
  for (const m of CANOPY.maps) fetchMap(CANOPY.from, m)
}

/* ---------- 形 ---------- */

async function bakeKit() {
  await MeshoptEncoder.ready
  await MeshoptSimplifier.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  const out = new Document()
  const buffer = out.createBuffer()
  const scene = out.createScene('forest-kit')
  const sources = new Map()
  const mats = new Map()
  const report = []
  for (const part of PARTS) {
    if (!sources.has(part.from)) sources.set(part.from, await io.read(join(RAW, part.from, `${part.from}.gltf`)))
    const src = sources.get(part.from)
    if (!mats.has(part.atlas)) mats.set(part.atlas, out.createMaterial(part.atlas).setDoubleSided(true))
    const node = src.getRoot().listNodes().find((n) => n.getName() === part.nodes[0])
    if (!node) throw new Error(`${part.from}: no node ${part.nodes[0]} (have ${src.getRoot().listNodes().map((n) => n.getName()).join(', ')})`)
    // 近く用（そのままの名前）と遠く用（.1）の 2 つを、同じ元から作る
    for (const [tag, tris] of [['', part.tris], ['.1', part.far]]) {
      if (!tris) continue
      const copied = copyToDocument(out, src, [node.getMesh()])
      const mesh = copied.get(node.getMesh())
      const before = mesh.listPrimitives().reduce((n, p) => n + p.getIndices().getCount() / 3, 0)
      for (const prim of mesh.listPrimitives()) {
        // 部品の向き・大きさ（位置は使わない：並べて置いてあるだけなので）を形に焼きこむ
        const m = node.getMatrix()
        m[12] = m[13] = m[14] = 0
        transformPrimitive(prim, m)
        if (part.crop) crop(prim, part.crop)
        if (part.base) {
          const b = bounds(prim)
          transformPrimitive(prim, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2, 1])
        }
        for (const sem of prim.listSemantics()) if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(sem)) prim.setAttribute(sem, null)
        weldPrimitive(prim, {})
        const now = prim.getIndices().getCount() / 3
        if (now > tris) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: tris / now, error: tag ? 0.5 : 0.2 })
        if (part.plant) shade(out, prim)
        toAtlas(prim, ATLAS[part.atlas], part.cell)
        prim.setMaterial(mats.get(part.atlas))
      }
      const after = mesh.listPrimitives().reduce((n, p) => n + p.getIndices().getCount() / 3, 0)
      const made = out.createNode(part.name + tag).setMesh(mesh.setName(part.name + tag))
      scene.addChild(made)
      const b = getBounds(made)
      report.push(`${(part.name + tag).padEnd(20)} ${String(before).padStart(7)} → ${String(after).padStart(6)} tris   ${b.max.map((v, i) => (v - b.min[i]).toFixed(2)).join(' × ')} m`)
    }
  }
  for (const a of out.getRoot().listAccessors()) a.setBuffer(buffer)
  // 材質は名前で画像を決めるので、まとめない。画像のない材質でも uv は残す
  await out.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR] }), prune({ keepAttributes: true }), reorder({ encoder: MeshoptEncoder, target: 'size' }), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 14, quantizeColor: 8 }))
  out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER })
  const to = join(PUB, 'models/forest-kit.glb')
  await io.write(to, out)
  console.log(report.join('\n'))
  console.log(`wrote public/models/forest-kit.glb (${(statSync(to).size / 1e6).toFixed(2)} MB)`)
}

function bounds(prim) {
  const pos = prim.getAttribute('POSITION')
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const v = [0, 0, 0]
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, v)
    for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k], v[k])), (max[k] = Math.max(max[k], v[k]))
  }
  return { min, max }
}

/** 三角形のまん中の x が、範囲 [f0, f1]（形の幅に対する割合）にあるものだけ残す */
function crop(prim, [f0, f1]) {
  const b = bounds(prim)
  const pos = prim.getAttribute('POSITION')
  const idx = prim.getIndices()
  const x0 = b.min[0] + (b.max[0] - b.min[0]) * f0
  const x1 = b.min[0] + (b.max[0] - b.min[0]) * f1
  const keep = []
  const v = [0, 0, 0]
  for (let i = 0; i < idx.getCount(); i += 3) {
    let x = 0
    for (let k = 0; k < 3; k++) x += pos.getElement(idx.getScalar(i + k), v)[0] / 3
    if (x >= x0 && x <= x1) keep.push(idx.getScalar(i), idx.getScalar(i + 1), idx.getScalar(i + 2))
  }
  idx.setArray(new Uint32Array(keep))
}

/** uv（0〜1）を、画像をまとめた 1 枚の中の、その部品のます目へ移す。ふちは INSET px あける（縮めた絵がとなりのますににじまないように） */
function toAtlas(prim, atlas, cell) {
  const uv = prim.getAttribute('TEXCOORD_0')
  const col = cell % atlas.cols
  const row = Math.floor(cell / atlas.cols)
  const k = 1 - (2 * INSET) / atlas.cell
  const t = [0, 0]
  const arr = new Float32Array(uv.getCount() * 2)
  let out = 0
  for (let i = 0; i < uv.getCount(); i++) {
    uv.getElement(i, t)
    if (t[0] < -0.001 || t[0] > 1.001 || t[1] < -0.001 || t[1] > 1.001) out++
    const u = Math.min(1, Math.max(0, t[0]))
    const v = Math.min(1, Math.max(0, t[1]))
    arr[i * 2] = (col + INSET / atlas.cell + u * k) / atlas.cols
    arr[i * 2 + 1] = (row + INSET / atlas.cell + v * k) / atlas.rows
  }
  if (out) console.warn(`  uv outside 0..1 on ${out} vertices (clamped)`)
  uv.setNormalized(false).setArray(arr)
}

/** 植物の「根元と奥の暗がり」を頂点の色に入れる：低いところ・株のまん中に近いところほど暗い */
function shade(doc, prim) {
  const pos = prim.getAttribute('POSITION')
  const n = pos.getCount()
  let top = 0
  let far = 0
  const p = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    pos.getElement(i, p)
    top = Math.max(top, p[1])
    far = Math.max(far, Math.hypot(p[0], p[2]))
  }
  const col = new Uint8Array(n * 4)
  for (let i = 0; i < n; i++) {
    pos.getElement(i, p)
    const h = Math.min(1, Math.max(0, p[1] / (top * 0.6)))
    const r = Math.min(1, Math.hypot(p[0], p[2]) / (far * 0.6))
    const ao = (0.38 + 0.62 * h * h * (3 - 2 * h)) * (0.7 + 0.3 * r)
    const v = Math.round(255 * Math.min(1, ao))
    col.set([v, v, v, 255], i * 4)
  }
  prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(col).setNormalized(true))
}

/* ---------- 画像 ---------- */

function bakeImages() {
  const r = spawnSync('python3', ['-I', join(here, 'images.py'), RAW, join(PUB, 'textures/forest'), JSON.stringify(IMAGES)], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error('images.py failed')
}

fetchAll()
await bakeKit()
bakeImages()
if (process.argv.includes('--canopy')) await import('./canopy.mjs')
