// 素材の中身を見る：node tools/forest/inspect.mjs <Poly Haven の名前>...（raw/ に取ってきて、部品・材質・uv の範囲を出す）
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const RAW = join(new URL('.', import.meta.url).pathname, 'raw')
const curl = (url, to) => {
  if (existsSync(to) && statSync(to).size > 0) return
  mkdirSync(dirname(to), { recursive: true })
  if (spawnSync('curl', ['-s', '-f', '-A', 'asset-fetch/1.0', '-o', to, url]).status !== 0) throw new Error(`download failed: ${url}`)
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
for (const id of process.argv.slice(2)) {
  curl(`https://api.polyhaven.com/files/${id}`, join(RAW, `${id}.json`))
  const list = JSON.parse(readFileSync(join(RAW, `${id}.json`), 'utf8'))
  const e = list.gltf['1k'].gltf
  curl(e.url, join(RAW, id, `${id}.gltf`))
  for (const [path, v] of Object.entries(e.include ?? {})) curl(v.url, join(RAW, id, path))
  console.log(`== ${id}  maps: ${Object.keys(list).filter((k) => !['gltf', 'blend', 'fbx', 'usd'].includes(k)).join(', ')}`)
  const doc = await io.read(join(RAW, id, `${id}.gltf`))
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    for (const prim of mesh.listPrimitives()) {
      const uv = prim.getAttribute('TEXCOORD_0')
      const mn = [Infinity, Infinity]
      const mx = [-Infinity, -Infinity]
      const t = [0, 0]
      for (let i = 0; uv && i < uv.getCount(); i++) {
        uv.getElement(i, t)
        mn[0] = Math.min(mn[0], t[0]); mn[1] = Math.min(mn[1], t[1]); mx[0] = Math.max(mx[0], t[0]); mx[1] = Math.max(mx[1], t[1])
      }
      const mat = prim.getMaterial()
      const pos = prim.getAttribute('POSITION')
      const bmin = pos.getMinNormalized ? pos.getMin([]) : []
      const bmax = pos.getMax([])
      const s = node.getScale()
      console.log(`  ${node.getName().padEnd(34)} tris ${String(prim.getIndices().getCount() / 3).padStart(7)}  mat ${mat?.getName()}  uv [${mn.map((v) => v.toFixed(2))}]..[${mx.map((v) => v.toFixed(2))}]  size ${bmax.map((v, i) => ((v - bmin[i]) * s[i]).toFixed(2)).join('×')}  tex ${mat?.getBaseColorTexture()?.getURI()}`)
    }
  }
}
