// 同じページの中で、森の見本を出したとき・隠したときの描画回数と三角形の数を比べる
//   npm run build のあと：node tools/forest/weigh.mjs [--phone] [--old] [--at=s,y,yaw]
//   --old：前の作りのラボの森（?forest=old）を、同じやり方で
import { chromium, devices } from 'playwright'
import { serve } from '../perf/serve.mjs'
const phone = process.argv.includes('--phone')
const old = process.argv.includes('--old')
const at = (process.argv.find((a) => a.startsWith('--at=')) ?? '--at=250,11766,3.14159').slice(5).split(',').map(Number)
// どちらも、ラボの森に属するもの全部（forest-* と、残した変わった植物などの jungle-*）を出す・隠す
const PREFIX = '^(forest|jungle)-'
const HOOK = () => {
  const s = (window.__perf = { draws: 0, tris: 0, perFrame: [] })
  const P = WebGL2RenderingContext.prototype
  const tri = (mode, count, inst = 1) => (mode === 4 ? (count / 3) * inst : 0)
  for (const [name, f] of [['drawArrays', (m, f, c) => tri(m, c)], ['drawElements', (m, c) => tri(m, c)], ['drawArraysInstanced', (m, f, c, i) => tri(m, c, i)], ['drawElementsInstanced', (m, c, t, o, i) => tri(m, c, i)]]) {
    const orig = P[name]
    P[name] = function (...a) { s.draws++; s.tris += f(...a); return orig.apply(this, a) }
  }
  // BatchedMesh は WEBGL_multi_draw でまとめて描く。1 回の呼び出しを 1 回と数え、三角形は全部足す
  const getExt = P.getExtension
  P.getExtension = function (name) {
    const e = getExt.call(this, name)
    if (name === 'WEBGL_multi_draw' && e && !e.__hooked) {
      e.__hooked = true
      const sum = (a, o, n) => { let x = 0; for (let i = 0; i < n; i++) x += a[o + i]; return x }
      const me = e.multiDrawElementsWEBGL.bind(e)
      e.multiDrawElementsWEBGL = (m, c, co, t, o, oo, n) => { s.draws++; s.tris += tri(m, sum(c, co, n)); return me(m, c, co, t, o, oo, n) }
      const ma = e.multiDrawArraysWEBGL.bind(e)
      e.multiDrawArraysWEBGL = (m, f, fo, c, co, n) => { s.draws++; s.tris += tri(m, sum(c, co, n)); return ma(m, f, fo, c, co, n) }
      if (e.multiDrawElementsInstancedWEBGL) {
        const mi = e.multiDrawElementsInstancedWEBGL.bind(e)
        e.multiDrawElementsInstancedWEBGL = (m, c, co, t, o, oo, i, io, n) => { s.draws++; let x = 0; for (let k = 0; k < n; k++) x += tri(m, c[co + k], i[io + k]); s.tris += x; return mi(m, c, co, t, o, oo, i, io, n) }
      }
    }
    return e
  }
  let d0 = 0, t0 = 0
  const tick = () => { s.perFrame.push([s.draws - d0, s.tris - t0]); d0 = s.draws; t0 = s.tris; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0
const server = await serve(new URL('../../dist/', import.meta.url).pathname)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const ctx = await browser.newContext(phone ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } })
await ctx.addInitScript(HOOK)
const page = await ctx.newPage()
const T0 = Date.now()
const lap = (m) => console.log(`${Math.round((Date.now() - T0) / 1000)} s`, m)
page.on('pageerror', (e) => console.error('pageerror', e.message))
await page.goto(`http://localhost:${server.address().port}/${old ? '?forest=old' : '?forest=jungle'}#debug&sf`)
await page.waitForFunction(() => !document.getElementById('boot') && window.__sv, null, { timeout: 180000, polling: 250 })
lap('app ready')
await page.evaluate(() => window.__sv.walk.start())
await page.waitForFunction(() => window.__sv.walk.debug.scene, null, { timeout: 120000 })
await page.waitForFunction((p) => { let n = 0; window.__sv.walk.debug.scene.traverse((o) => { if (new RegExp(p).test(o.name ?? '')) n++ }); return n > 0 }, old ? '^jungle-' : '^forest-floor', { timeout: 900000, polling: 2000 })
lap('forest built')
await page.waitForFunction(() => window.__sv.walk.mobs.mobs.some((m) => m.p.model), null, { timeout: 400000, polling: 2000 }).catch(() => console.log('mobs not loaded'))
await page.evaluate((at) => Object.assign(window.__sv.walk.walker, { s: at[0], y: at[1], turnTo: at[2] }), at)
await sleep(20000)
const measure = async () => {
  await page.evaluate(() => { window.__perf.perFrame.length = 0 })
  await sleep(4000)
  for (let i = 0; i < 40 && (await page.evaluate(() => window.__perf.perFrame.length)) < 6; i++) await sleep(2000)
  const f = (await page.evaluate(() => window.__perf.perFrame)).slice(1)
  return { draws: median(f.map((x) => x[0])), ktris: Math.round(median(f.map((x) => x[1])) / 1000), frames: f.length }
}
const info = await page.evaluate((p) => {
  const out = {}
  window.__sv.walk.debug.scene.traverse((o) => {
    if (!new RegExp(p).test(o.name ?? '')) return
    const g = o.geometry
    out[o.name] = [o.count ?? 1, Math.round(((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.count ?? 1)), o.castShadow]
  })
  return out
}, PREFIX)
console.log(JSON.stringify(info))
console.log('shown ', JSON.stringify(await measure()))
await page.evaluate((p) => window.__sv.walk.debug.scene.traverse((o) => { if (new RegExp(p).test(o.name ?? '')) o.visible = false }), PREFIX)
await sleep(6000)
console.log('hidden', JSON.stringify(await measure()))
await page.evaluate((p) => window.__sv.walk.debug.scene.traverse((o) => { if (new RegExp(p).test(o.name ?? '')) o.visible = true }), PREFIX)
await sleep(6000)
console.log('shown2', JSON.stringify(await measure()))
await browser.close()
server.close()
