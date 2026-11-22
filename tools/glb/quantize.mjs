// 形の数値を短い整数にして（量子化）、meshopt で圧縮する。当たり判定に使わない、見るだけの模型用（リュウグウなど）。
// compress.mjs は量子化しない（頂点の値をそのまま使う所があるので）。こちらは見た目がほぼ変わらないかわりに、ずっと小さい。
//   node tools/glb/quantize.mjs public/models/ryugu.glb
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt, quantize, weld, dedup, prune } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { statSync } from 'node:fs'

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
for (const file of process.argv.slice(2)) {
  const before = statSync(file).size
  const doc = await io.read(file)
  await doc.transform(dedup(), weld(), quantize({ quantizePosition: 14, quantizeNormal: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }), prune())
  await io.write(file, doc)
  console.log(`${file}: ${(before / 1e6).toFixed(2)} MB -> ${(statSync(file).size / 1e6).toFixed(2)} MB`)
}
