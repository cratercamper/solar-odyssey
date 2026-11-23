// 打ち上げの映画のカットを、決めた時刻で 1 枚ずつ撮る（確認用。CI では使わない）
//   SHOTS="3:press,12:engine,30:refLiftoff" DIST=dist OUT=/tmp/shots node tools/film/shots.mjs
// 時刻は秒読みを始めてからの秒（秒読み 20 秒、T-8.9 で点火ボタンを押す）。名前は launchFilm.ts の Shot。
// SwiftShader でコマ送り（window.__moonFilm.step）するので、遅いけれど毎回同じ絵になる。
// 決めうちしたカットは、切りかえの瞬間のように「飛ばない」：遠いカットのすぐ後の近いカットは、6 コマ進めてから撮る。
import { chromium } from 'playwright'
import { serve } from '../perf/serve.mjs'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = process.env.OUT || '/tmp/shots'
const DIST = resolve(process.env.DIST || 'dist') + '/'
const W = Number(process.env.W || 960)
const H = Number(process.env.H || 540)
const QUALITY = process.env.QUALITY || 'medium'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const server = await serve(DIST)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
// DPR：画面の細かさ（スマホは 3）。HASH：#debug に足す（phone でスマホの軽い設定）
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DPR || 1) })
await ctx.addInitScript((q) => {
  try {
    localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang: 'ja', music: false, muted: true, quality: q }))
  } catch {}
}, QUALITY)
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(`http://localhost:${server.address().port}/#debug${process.env.HASH ? ',' + process.env.HASH : ''}`)
await page.waitForFunction(() => window.__sv && window.__sv.moonMission, null, { timeout: 120000 })
await sleep(3000)
await page.evaluate(() => window.__sv.moonMission.start())
await page.waitForFunction(() => window.__moonFilm && window.__sv.moonMission.state.getState().phase === 'pad', null, { timeout: 120000 })
await page.evaluate(() => window.__moonFilm.begin())
await sleep(4000)
await page.evaluate(() => window.__sv.moonMission.state.setState({ countdown: 20 }))
// AUTO=1：上昇の操縦をおまかせにする（手で傾けないと、まっすぐ上がりすぎる）
if (process.env.AUTO) await page.evaluate(() => window.__sv.moonMission.auto(true))
const shots = process.env.SHOTS.split(',').map((x) => {
  const [t, s] = x.split(':')
  return { t: Number(t), s }
})
let f = 0
for (const sh of shots) {
  await page.evaluate(
    ([until, from]) => {
      const M = window.__sv.moonMission
      let f = from
      while (f < until - 0.6) {
        const s = M.state.getState()
        if (s.phase === 'pad' && s.ignitedAt === null && s.countdown <= 8.9) M.go()
        window.__moonFilm.step(0.1)
        f += 0.1
      }
    },
    [sh.t, f],
  )
  await page.evaluate((shot) => (window.__sv.moonMission.filmForce.shot = shot === 'auto' ? null : shot), sh.s)
  await page.evaluate(() => {
    for (let i = 0; i < 6; i++) window.__moonFilm.step(0.1)
  })
  f = sh.t
  const file = `${OUT}/${String(sh.t).padStart(4, '0')}-${sh.s}.jpg`
  await page.screenshot({ path: file, quality: 88, type: 'jpeg' })
  console.log(file)
}
await browser.close()
server.close()
