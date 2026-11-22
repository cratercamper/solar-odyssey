// 公園の近くの木を、ez-tree（MIT）で作った形の glb にする。アプリは ez-tree（4 MB の JS）を読まずに、この glb を読む。
//   node tools/trees/bake.mjs
// 形は量子化（16 bit）して meshopt で圧縮、画像は WebP（透明つき）にする。木なので数 mm の誤差は見えない
// 木の種類（型と種）は src/components/walk/WalkWorld.tsx の TREE_KINDS と同じ順にする
import { chromium } from 'playwright'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions'
import { dedup, prune, quantize, reorder } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import { spawnSync } from 'node:child_process'
import { serve } from '../perf/serve.mjs'

const KINDS = [
  ['Oak Medium', 11],
  ['Oak Medium', 23],
  ['Ash Medium', 37],
  ['Ash Large', 41],
  ['Oak Large', 67],
  ['Pine Medium', 53],
]
const root = new URL('../../', import.meta.url).pathname
const server = await serve(root)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const page = await browser.newPage()
page.on('pageerror', (e) => console.error(e))
await page.goto(`http://localhost:${server.address().port}/tools/trees/bake.html?kinds=${encodeURIComponent(JSON.stringify(KINDS))}`)
await page.waitForFunction(() => window.result, null, { timeout: 180000 })
const r = await page.evaluate(() => window.result)
if (r.startsWith('ERR')) throw new Error(r)
await browser.close()
server.close()

const TO_WEBP = 'import sys,io\nfrom PIL import Image\nim=Image.open(io.BytesIO(sys.stdin.buffer.read()))\nb=io.BytesIO(); im.save(b,"WEBP",quality=82,method=6); sys.stdout.buffer.write(b.getvalue())'
await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
const doc = await io.readBinary(new Uint8Array(Buffer.from(r, 'base64')))
for (const tex of doc.getRoot().listTextures()) {
  const w = spawnSync('python3', ['-I', '-c', TO_WEBP], { input: tex.getImage(), maxBuffer: 1 << 28 })
  if (w.status !== 0) throw new Error(w.stderr.toString())
  tex.setImage(new Uint8Array(w.stdout)).setMimeType('image/webp')
}
doc.createExtension(EXTTextureWebP).setRequired(true)
await doc.transform(dedup(), prune(), reorder({ encoder: MeshoptEncoder, target: 'size' }), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }))
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER })
const out = new URL('../../public/models/park-trees.glb', import.meta.url).pathname
await io.write(out, doc)
const { statSync } = await import('node:fs')
console.log(`wrote public/models/park-trees.glb (${(statSync(out).size / 1e6).toFixed(2)} MB)`)
