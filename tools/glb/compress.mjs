// public/models の glb を軽くする：形のデータを EXT_meshopt_compression で可逆圧縮し、JPEG の画像を WebP にする。
// 量子化（数値を短い整数にする）はしない：当たり判定や部品の位置を glb の数値から作っている所があるので、
// 頂点の値はそのまま。圧縮は可逆で、読み込みは drei の useGLTF（meshopt の復号を最初から持っている）。
//   node tools/glb/compress.mjs public/models/ship-hull.glb [...]
//   node tools/glb/compress.mjs --plain public/models/ship-hull.glb   … 圧縮を外す（Blender の bake_ship.py などで読み込む前に）
// JPEG の画像は WebP（品質 90）に置き換える（Python の Pillow を使う）。すでに圧縮済みのファイルは飛ばす。Blender から書き出し直したら、もう一度かける。
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions'
import { reorder } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const TO_WEBP = 'import sys,io\nfrom PIL import Image\nim=Image.open(io.BytesIO(sys.stdin.buffer.read()))\nb=io.BytesIO(); im.save(b,"WEBP",quality=90,method=6); sys.stdout.buffer.write(b.getvalue())'

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const plain = process.argv.includes('--plain')
for (const file of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  if (plain) {
    // Blender などで読み直す前に、形の圧縮だけ外す（画像は WebP のまま）
    const doc = await io.read(file)
    doc.getRoot().listExtensionsUsed().filter((e) => e.extensionName === 'EXT_meshopt_compression').forEach((e) => e.dispose())
    await io.write(file, doc)
    console.log(`plain ${file}`)
    continue
  }
  const before = statSync(file).size
  const doc = await io.read(file)
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression')) {
    console.log(`skip (already compressed) ${file}`)
    continue
  }
  let webp = false
  for (const tex of doc.getRoot().listTextures()) {
    if (tex.getMimeType() !== 'image/jpeg') continue
    const r = spawnSync('python3', ['-I', '-c', TO_WEBP], { input: tex.getImage(), maxBuffer: 1 << 28 })
    if (r.status !== 0) throw new Error(r.stderr.toString())
    tex.setImage(new Uint8Array(r.stdout)).setMimeType('image/webp')
    if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.jpe?g$/i, '.webp'))
    webp = true
  }
  if (webp) doc.createExtension(EXTTextureWebP).setRequired(true)
  await doc.transform(reorder({ encoder: MeshoptEncoder, target: 'performance' }))
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  await io.write(file, doc)
  const after = statSync(file).size
  console.log(`${file}: ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB`)
}
