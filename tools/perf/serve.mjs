// dist を配る小さなサーバー（測定・スクリーンショット確認用）。GitHub Pages と同じく文字のファイルは gzip で送る
import { createServer } from 'node:http'
import { gzipSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' }

/** dist を配り始めて、server を返す（port は server.address().port） */
export function serve(dist) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '')
    const file = !path || path === '.' ? 'index.html' : path
    try {
      const body = await readFile(join(dist, file))
      const type = TYPES[extname(file)] ?? 'application/octet-stream'
      if (/text|json|svg/.test(type)) {
        res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip' })
        res.end(gzipSync(body))
      } else {
        res.writeHead(200, { 'content-type': type })
        res.end(body)
      }
    } catch {
      res.writeHead(404)
      res.end()
    }
  })
  return new Promise((r) => server.listen(0, () => r(server)))
}
