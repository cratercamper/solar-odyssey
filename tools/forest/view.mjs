// 素材の確認用：node tools/forest/view.mjs <glTF の道（リポジトリの根から）> <出す画像> [az] [el] [only]
import { chromium } from 'playwright'
import { serve } from '../perf/serve.mjs'
const [m, out, az = '30', el = '15', only = '', tex = ''] = process.argv.slice(2)
const root = new URL('../../', import.meta.url).pathname
const server = await serve(root)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } })
page.on('pageerror', (e) => console.error(e))
await page.goto(`http://localhost:${server.address().port}/tools/forest/view.html?m=/${m}&az=${az}&el=${el}&only=${encodeURIComponent(only)}&tex=${tex}`)
await page.waitForFunction(() => window.result, null, { timeout: 300000 })
console.log(await page.evaluate(() => window.result))
await page.screenshot({ path: out, type: 'jpeg', quality: 85 })
await browser.close()
server.close()
