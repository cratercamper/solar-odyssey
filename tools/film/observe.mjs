// 観察パート（サターンV 図鑑）とタイムラプスの確認の絵（CI では使わない）
//   VIEWS="whole,s1,cut,size,lapse:0.3,lapse:0.7" OUT=/tmp/obs node tools/film/observe.mjs
// whole：全体、部品の id（f1 s1 s2 s3 iu lm csm les）：その部品を選ぶ、cut：全体の断面、size：大きさくらべ、
// az=236：カメラの方位、lapse:u：タイムラプスの u（0〜1）の所。SwiftShader でコマ送りするので、毎回同じ絵になる。
import { chromium } from 'playwright'
import { serve } from '../perf/serve.mjs'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = process.env.OUT || '/tmp/obs'
const DIST = resolve(process.env.DIST || 'dist') + '/'
const W = Number(process.env.W || 960)
const H = Number(process.env.H || 540)
const QUALITY = process.env.QUALITY || 'medium'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const server = await serve(DIST)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: W, height: H } })
await ctx.addInitScript(
  ([q, lang]) => {
    try {
      localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang, music: false, muted: true, quality: q }))
    } catch {}
  },
  [QUALITY, process.env.LANG_UI || 'ja'],
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
const step = (n) => page.evaluate((n) => {
  for (let i = 0; i < n; i++) window.__moonFilm.step(0.1)
}, n)
await step(30)
let i = 0
for (const v of (process.env.VIEWS || 'whole').split(',')) {
  const [name, arg] = v.split(':')
  if (name === 'hold') {
    await step(Number(arg) * 10)
  }
  if (name === 'lapse') {
    await page.evaluate((u) => {
      const M = window.__sv.moonMission
      if (M.state.getState().phase === 'observe') M.toNight()
      // 時計（コマ送りの時計）を u の所へ
      M.state.setState({ since: M.now() - u * 12 })
    }, Number(arg))
    await step(3)
  } else if (name.startsWith('o=')) {
    // o=方位/仰角/距離/見る高さ
    const [az, el, dist, focus] = name.slice(2).split('/').map(Number)
    await page.evaluate(([az, el, dist, focus]) => Object.assign(window.__sv.moonMission.orbit, { az, el, dist, tDist: dist, focus, tFocus: focus, tAz: null, tEl: null }), [az, el, dist, focus])
    await step(3)
  } else if (name.startsWith('az=')) {
    await page.evaluate((a) => (window.__sv.moonMission.orbit.az = a), Number(name.slice(3)))
    await step(2)
  } else {
    await page.evaluate((name) => {
      const E = window.__sv.moonMission.explorer
      if (name === 'whole') E.setState({ part: null, cutAll: false, size: false })
      else if (name === 'cut') E.setState({ part: null, cutAll: true })
      else if (name === 'size') E.setState({ part: null, size: true })
      else E.setState({ part: name, cutAll: false })
    }, name)
    await step(40)
    await sleep(800)
  }
  if (process.env.SKYLOG) console.log(JSON.stringify(await page.evaluate(() => ({ moon: window.__sv.moonMission.sky.moon, lit: window.__sv.moonMission.sky.moonLit, ms: new Date(window.__sv.moonMission.sky.ms).toISOString() }))))
  const file = `${OUT}/${String(i++).padStart(2, '0')}-${v.replace(/[:=/]/g, '_')}.jpg`
  await page.screenshot({ path: file, quality: 88, type: 'jpeg' })
  console.log(file)
}
await browser.close()
server.close()
