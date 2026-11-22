// 樹冠の「葉の房」の絵（public/textures/forest/canopy.webp、2×2 の 4 枚）を作る。tools/forest/bake.mjs --canopy から呼ぶ。
// 本物の木（Poly Haven の island_tree_02、CC0）の枝先を、葉を切らずに丸く取り出して、上や横からまっすぐ撮る（canopy.html）。
import { chromium } from 'playwright'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { serve } from '../perf/serve.mjs'

const here = new URL('.', import.meta.url).pathname
const R = 0.66
/** 取り出す所（木の中の m）。左上・右上・左下・右下の順 */
const SHOTS = [
  { dir: 'top', c: [0.7, 2.5, 1.6], r: [R, 1.2, R] }, // こんもり茂った房
  { dir: 'top', c: [-0.6, 2.5, 0.4], r: [R, 1.2, R] }, // 枝の見える、ややまばらな房
  { dir: 'side', c: [1.3, 2.0, 1.4], r: [0.8, R, R] }, // 横から見た房（樹冠のふち用）
  { dir: 'top', c: [-1.3, 2.5, 1.2], r: [R, 1.2, R] }, // 枝先
]
const server = await serve(join(here, '../..'))
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const page = await browser.newPage()
page.on('pageerror', (e) => console.error(e))
await page.goto(`http://localhost:${server.address().port}/tools/forest/canopy.html`)
await page.waitForFunction(() => window.result, null, { timeout: 600000 })
const state = await page.evaluate(() => window.result)
if (state !== 'ok') throw new Error(state)
const tmp = join(here, 'raw/_canopy')
mkdirSync(tmp, { recursive: true })
for (const [i, s] of SHOTS.entries()) {
  const url = await page.evaluate((s) => window.shot({ ...s, size: 1024 }), s)
  writeFileSync(join(tmp, `${i}.png`), Buffer.from(url.split(',')[1], 'base64'))
}
await browser.close()
server.close()
const r = spawnSync('python3', ['-I', join(here, 'canopy.py'), tmp, join(here, '../../public/textures/forest')], { stdio: 'inherit' })
if (r.status !== 0) throw new Error('canopy.py failed')
