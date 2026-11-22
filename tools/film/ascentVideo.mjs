// 上昇の後半（第2段・第3段）の確認動画：計器のカード・カメラの切り替えが入った画面を、画面の時間どおりに撮る（CI では使わない）
//   OUT=/tmp/ascvid SKIP=150 node tools/film/ascentVideo.mjs   → $OUT/frames/*.jpg と $OUT/ascent.mp4
//   SKIP：打ち上げから何秒（物理の秒）の所から撮るか。場面が STOP（ふつう orbit、第3章は outbound）になって END 秒（画面の秒）で終わる
//   月へ向かう点火は、窓が開いたらすぐ押す（dull.mjs と同じ）
import { chromium } from 'playwright'
import { serve } from '../perf/serve.mjs'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const OUT = process.env.OUT || '/tmp/ascvid'
const DIST = resolve(process.env.DIST || 'dist') + '/'
const W = Number(process.env.W || 960)
const H = Number(process.env.H || 540)
const FPS = Number(process.env.FPS || 20)
const SKIP = Number(process.env.SKIP || 150)
const END = Number(process.env.END || 4)
const STOP = process.env.STOP || 'orbit'
rmSync(`${OUT}/frames`, { recursive: true, force: true })
mkdirSync(`${OUT}/frames`, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const server = await serve(DIST)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: W, height: H } })
await ctx.addInitScript(
  ([lang, quality]) => {
    try {
      localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang, music: false, muted: true, quality }))
    } catch {}
  },
  [process.env.LANG_UI || 'ja', process.env.QUALITY || 'medium'],
)
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(`http://localhost:${server.address().port}/#debug`)
await page.waitForFunction(() => window.__sv && window.__sv.moonMission, null, { timeout: 120000 })
await sleep(3000)
await page.evaluate(() => window.__sv.moonMission.start())
await page.waitForFunction(() => window.__moonFilm && window.__sv.moonMission.state.getState().phase === 'pad', null, { timeout: 120000 })
await page.evaluate(() => window.__moonFilm.begin())
await sleep(2000)
await page.evaluate(() => {
  window.__sv.moonMission.state.setState({ countdown: 20 })
  window.__sv.moonMission.auto(true)
})
await page.evaluate((t) => window.__sv.moonMission.skip(t), SKIP)
let after = -1
for (let f = 0; f < FPS * 300; f++) {
  const phase = await page.evaluate((dt) => {
    const M = window.__sv.moonMission
    if (M.state.getState().phase === 'orbit' && M.sim.a.t - M.sim.orbitAt >= 2400) M.go()
    window.__moonFilm.step(dt)
    return M.state.getState().phase
  }, 1 / FPS)
  // 字幕・カードの React の描き直しを待つ
  if (f % 2 === 0) await sleep(30)
  await page.screenshot({ path: `${OUT}/frames/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 85 })
  if (f % (FPS * 5) === 0) console.log(f / FPS, phase)
  if (phase === STOP && after < 0) after = f
  if (after >= 0 && f - after >= END * FPS) break
}
await browser.close()
server.close()
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${OUT}/frames/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-r', '30', `${OUT}/ascent.mp4`])
console.log('done', `${OUT}/ascent.mp4`)
