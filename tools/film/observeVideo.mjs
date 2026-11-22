// 観察パート → タイムラプス → 秒読みの始まりの確認動画（CI では使わない）
//   OUT=/tmp/obsvid node tools/film/observeVideo.mjs   → $OUT/frames/*.jpg と $OUT/observe.mp4
// 台本（秒）：全体を回す → 第1段の断面 → 着陸船 → 全体の断面 → 打ち上げの夜へ（タイムラプス 12 秒）→ 秒読み
import { chromium } from 'playwright'
import { serve } from '../perf/serve.mjs'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const OUT = process.env.OUT || '/tmp/obsvid'
const DIST = resolve(process.env.DIST || 'dist') + '/'
const W = Number(process.env.W || 960)
const H = Number(process.env.H || 540)
const FPS = Number(process.env.FPS || 24)
rmSync(`${OUT}/frames`, { recursive: true, force: true })
mkdirSync(`${OUT}/frames`, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const server = await serve(DIST)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: W, height: H } })
await ctx.addInitScript(
  ([lang]) => {
    try {
      localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang, music: false, muted: true, quality: 'medium' }))
    } catch {}
  },
  [process.env.LANG_UI || 'ja'],
)
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(`http://localhost:${server.address().port}/#debug`)
await page.waitForFunction(() => window.__sv && window.__sv.moonMission, null, { timeout: 120000 })
await sleep(3000)
await page.evaluate(() => window.__sv.moonMission.start('launch', window.__sv.moonMission.observe))
await page.waitForFunction(() => window.__moonFilm && window.__sv.moonMission.state.getState().phase === 'observe', null, { timeout: 120000 })
await page.evaluate(() => window.__moonFilm.begin())
await sleep(5000)
await page.evaluate(() => {
  for (let i = 0; i < 20; i++) window.__moonFilm.step(0.1)
})
// 台本：[秒, 動作]
const SCRIPT = [
  [0, { az: 230 }],
  [3.5, { part: 's1' }],
  [7.5, { part: 'lm' }],
  [11, { part: null, cutAll: true }],
  [14.5, { night: true }],
  [30, { end: true }],
]
let n = 0
let next = 0
const dt = 1 / FPS
for (let t = 0; ; t += dt) {
  while (next < SCRIPT.length && SCRIPT[next][0] <= t + 1e-6) {
    const a = SCRIPT[next++][1]
    if (a.end) break
    await page.evaluate((a) => {
      const M = window.__sv.moonMission
      if (a.az !== undefined) M.orbit.az = a.az
      if ('part' in a) M.explorer.setState({ part: a.part, cutAll: !!a.cutAll })
      if (a.night) M.toNight()
    }, a)
  }
  if (next >= SCRIPT.length && SCRIPT[SCRIPT.length - 1][0] <= t) break
  await page.evaluate(
    ([dt, t]) => {
      const M = window.__sv.moonMission
      // 全体を見ているあいだは、ゆっくり回る
      if (t < 3.5) M.orbit.az += 14 * dt
      window.__moonFilm.step(dt)
    },
    [dt, t],
  )
  await page.screenshot({ path: `${OUT}/frames/${String(n++).padStart(5, '0')}.jpg`, quality: 85, type: 'jpeg' })
  if (n % 48 === 0) console.log('frame', n, t.toFixed(1))
}
await browser.close()
server.close()
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${OUT}/frames/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', `${OUT}/observe.mp4`])
console.log(`${OUT}/observe.mp4`)
