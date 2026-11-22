// 探査機の旅（ボイジャー2号）の模型の画面を、決めた瞬間ごとに撮る（npm run build のあとに。PROBE=hayabusa2 で、はやぶさ2）
//   node tools/probes/capture.mjs <出力フォルダ> '[["名前", 通過の番号, 日数], ...]' [--phone]   （LANG_UI=en で英語）
import { chromium, devices } from 'playwright'
import { serve } from '../perf/serve.mjs'
const out = process.argv[2]
const phone = process.argv.includes('--phone')
const moments = JSON.parse(process.argv[3]) // [[name, encounterIndex, days]]
const server = await serve(new URL('../../dist/', import.meta.url).pathname)
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext(phone ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } })
const page = await ctx.newPage()
await page.addInitScript((id) => { window.__probeId = id }, process.env.PROBE || 'voyager2')
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(`http://localhost:${server.address().port}/#debug`)
await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 240000, polling: 500 })
await page.evaluate((l) => window.__sv.store.getState().updateSettings({ quality: 'low', lang: l }), process.env.LANG_UI || 'ja')
await page.evaluate(() => { window.__sv.probes.open(); window.__sv.probes.play(window.__probeId) })
await page.waitForFunction(() => document.querySelector('.probe-cam canvas'), null, { timeout: 60000 })
// 模型を読み込むまで、はじめの場面でひと待ち
await page.evaluate((m) => { const { probes } = window.__sv; probes.state.setState({ playing: false }); probes.clock.ms = window.__sv.probeTrajectory(window.__probeId).encounters[m[1]].ms + m[2] * 86400000 }, moments[0])
await new Promise((r) => setTimeout(r, 40000))
for (const [name, k, d] of moments) {
  await page.evaluate(([k, d]) => { const { probes } = window.__sv; probes.state.setState({ playing: false }); probes.clock.ms = window.__sv.probeTrajectory(window.__probeId).encounters[k].ms + d * 86400000 }, [k, d])
  await new Promise((r) => setTimeout(r, 7000))
  await page.screenshot({ path: `${out}/${name}.png` })
  console.log('shot', name)
}
await browser.close(); server.close()
