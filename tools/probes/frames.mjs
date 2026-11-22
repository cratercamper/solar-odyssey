// 探査機の旅の動画用に、再生の速さどおりに1コマずつ時計を進めて撮る（npm run build のあとに）。
//   node tools/probes/frames.mjs <出力フォルダ> <通過の番号> <始まりの日数> <終わりの日数> [--phone]
// できたコマは ffmpeg -framerate 24（FPS=… で変える） -i %04d.png で動画にする
import { chromium, devices } from 'playwright'
import { serve } from '../perf/serve.mjs'
const [out, k, from, to] = process.argv.slice(2)
const phone = process.argv.includes('--phone')
const FPS = Number(process.env.FPS ?? 24)
const server = await serve(new URL('../../dist/', import.meta.url).pathname)
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext(phone ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(`http://localhost:${server.address().port}/#debug`)
await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 240000, polling: 500 })
await page.evaluate((l) => window.__sv.store.getState().updateSettings({ quality: 'low', lang: l }), process.env.LANG_UI || 'ja')
await page.evaluate(() => { window.__sv.probes.open(); window.__sv.probes.play('voyager2') })
await page.waitForFunction(() => document.querySelector('.probe-cam canvas'), null, { timeout: 60000 })
// 再生の時計を止めて、こちらで進める
const start = await page.evaluate(([k, d]) => { const { probes } = window.__sv; probes.state.setState({ playing: false }); const e = window.__sv.probeTrajectory('voyager2').encounters[k]; probes.clock.ms = e.ms + d * 86400000; return e.ms }, [Number(k), Number(from)])
await new Promise((r) => setTimeout(r, 15000))
const end = start + Number(to) * 86400000
let i = 0
for (;;) {
  const ms = await page.evaluate((FPS) => {
    const { probes } = window.__sv
    const t = window.__sv.probeTrajectory('voyager2')
    probes.clock.ms += window.__sv.probePace(t, probes.clock.ms) * 86400000 / FPS
    return probes.clock.ms
  }, FPS)
  // 字幕と計器は 0.2 秒おきに読むので、少し待つ
  await page.evaluate(() => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 220)))
  await page.screenshot({ path: `${out}/${String(i++).padStart(4, '0')}.png` })
  if (ms >= end) break
}
console.log('frames', i)
await browser.close(); server.close()
