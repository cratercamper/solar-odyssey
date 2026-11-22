// NASA 3D Resources の「Cassini-Huygens (A)」をアプリ用の glb にする（一度だけ使う取り込みの手順）。
//   元: https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Cassini-Huygens%20(A)
//   node tools/probes/import-nasa-cassini.mjs "<元の glb>" public/models/probe-cassini.glb
//   node tools/glb/compress.mjs public/models/probe-cassini.glb
// やること：Draco の圧縮を外す（アプリは meshopt で読む）／同じ絵の PNG（WebP の控え）を捨てて WebP だけにする。
// 名前の終わりが _h の部品（foil_gold_h、tex_01_h）がホイヘンス探査機（アプリは切りはなしたあと隠す）。ロゴは入っていない
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune } from '@gltf-transform/functions'
import draco3d from 'draco3d'

const [src, out] = process.argv.slice(2)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
const doc = await io.read(src)
const root = doc.getRoot()
root.listExtensionsUsed().filter((e) => e.extensionName === 'KHR_draco_mesh_compression').forEach((e) => e.dispose())
// WebP があれば、PNG の控えを外す（材質が PNG を指していたら WebP に差しかえる）
const webp = new Map(root.listTextures().filter((t) => t.getMimeType() === 'image/webp').map((t) => [t.getName(), t]))
for (const png of root.listTextures().filter((t) => t.getMimeType() === 'image/png')) {
  const w = webp.get(png.getName())
  if (!w) continue
  png.listParents().forEach((p) => p !== root && p.swap(png, w))
  png.dispose()
}
await doc.transform(prune())
await io.write(out, doc)
console.log('wrote', out)
