// 重さを測る（ヘッドレス Chromium・SwiftShader）。npm run build のあと、dist を配って場面ごとに数える。
//   node tools/perf/measure.mjs [scenario...] [--phone] [--out file.json]
// 数えるもの：届いたバイト数、準備完了までの秒数、最長の固まり（long task）、作ったシェーダーの数、
// 1 コマの描画回数と三角形の数、コマの間隔（SwiftShader なので絶対値ではなく前後の比べ用）
import { chromium, devices } from 'playwright'
import { writeFile } from 'node:fs/promises'
import { serve } from './serve.mjs'

const args = process.argv.slice(2)
const phone = args.includes('--phone')
const outAt = args.indexOf('--out')
const out = outAt >= 0 ? args[outAt + 1] : null
const wanted = args.filter((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1))
const DIST = process.env.DIST ?? new URL('../../dist/', import.meta.url).pathname

// ページの前に入れる：描画命令とシェーダーを数える
const HOOK = () => {
  const s = (window.__perf = { draws: 0, tris: 0, links: 0, linkMs: 0, frames: [], long: [], tex: 0 })
  const P = WebGL2RenderingContext.prototype
  const tri = (mode, count, inst = 1) => (mode === 4 ? (count / 3) * inst : 0)
  for (const [name, f] of [
    ['drawArrays', (m, f, c) => tri(m, c)],
    ['drawElements', (m, c) => tri(m, c)],
    ['drawArraysInstanced', (m, f, c, i) => tri(m, c, i)],
    ['drawElementsInstanced', (m, c, t, o, i) => tri(m, c, i)],
  ]) {
    const orig = P[name]
    P[name] = function (...a) {
      s.draws++
      s.tris += f(...a)
      return orig.apply(this, a)
    }
  }
  const link = P.linkProgram
  P.linkProgram = function (p) {
    s.links++
    return link.call(this, p)
  }
  const tex = P.texImage2D
  P.texImage2D = function (...a) {
    s.tex++
    return tex.apply(this, a)
  }
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => s.long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true })
  } catch {}
  // コマごとの描画回数（rAF の頭で区切る）
  s.perFrame = []
  let last = performance.now()
  let d0 = 0
  let t0 = 0
  const tick = (t) => {
    s.frames.push(t - last)
    s.perFrame.push([s.draws - d0, s.tris - t0])
    if (s.frames.length > 600) s.frames.shift(), s.perFrame.shift()
    d0 = s.draws
    t0 = s.tris
    last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  try {
    localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang: 'ja', music: false, muted: true, ...JSON.parse(localStorage.getItem('solar-voyager:settings') || '{}') }))
  } catch {}
}

const median = (a) => {
  const b = [...a].sort((x, y) => x - y)
  return b.length ? b[Math.floor(b.length / 2)] : 0
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 準備完了（読み込み画面が消える）まで待つ */
async function booted(page, t0) {
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 180000, polling: 250 })
  return (Date.now() - t0) / 1000
}

async function snapshot(page, net, label) {
  // 少し落ち着かせてから、直近 60 コマを測る
  await sleep(4000)
  const p = await page.evaluate(() => {
    const s = window.__perf
    s.frames.length = 0
    s.perFrame.length = 0
    return null
  })
  await sleep(5000)
  // 重い場面は 1 コマに何秒もかかる：数コマたまるまで待つ（長くて 1 分）
  for (let i = 0; i < 28 && (await page.evaluate(() => window.__perf.frames.length)) < 4; i++) await sleep(2000)
  const r = await page.evaluate(() => {
    const s = window.__perf
    return { frames: s.frames.slice(1), perFrame: s.perFrame.slice(1), links: s.links, long: s.long, tex: s.tex, heap: performance.memory?.usedJSHeapSize ?? 0 }
  })
  return {
    label,
    mb: +(net.bytes / 1e6).toFixed(2),
    glbMb: +(net.glb / 1e6).toFixed(2),
    jsMb: +(net.js / 1e6).toFixed(2),
    programs: r.links,
    textures: r.tex,
    longestTaskMs: Math.max(0, ...r.long),
    longTasksMs: r.long.reduce((a, b) => a + b, 0),
    frameMs: +median(r.frames).toFixed(1),
    draws: median(r.perFrame.map((f) => f[0])),
    ktris: Math.round(median(r.perFrame.map((f) => f[1])) / 1000),
    heapMb: Math.round(r.heap / 1e6),
  }
}

const SCENARIOS = {
  real: { hash: '#debug' },
  sf: { hash: '#debug&sf' },
  map: { hash: '#debug', after: async (page) => page.evaluate(() => window.__sv.store.getState().setMode('map')) },
  // 艦橋の中（宇宙は窓から見える所だけ描く）。bridgeLight は後処理なしの「軽量」
  bridge: { hash: '#debug', after: async (page) => page.evaluate(() => window.__sv.store.getState().setCameraMode('bridge')) },
  bridgeLight: {
    hash: '#debug',
    after: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      await page.evaluate(() => window.__sv.store.getState().setCameraMode('bridge'))
    },
  },
  walk: {
    hash: '#debug&sf',
    after: async (page) => {
      await page.evaluate(() => window.__sv.walk.start())
      await page.waitForFunction(() => window.__sv.walk.debug.scene, null, { timeout: 120000 })
      await sleep(8000)
    },
  },
  jungle: {
    hash: '#debug&sf',
    after: async (page) => {
      await page.evaluate(() => window.__sv.walk.start())
      await page.waitForFunction(() => window.__sv.walk.debug.scene, null, { timeout: 120000 })
      await sleep(3000)
      // ジャングルの入口の先へ
      await page.evaluate(() => {
        const w = window.__sv.walk.walker
        // ジャングルの中の小道のあたり（components/walk/jungle.ts の JUNGLE）
        w.s = 300
        w.y = 11800
      })
      await sleep(8000)
    },
  },
  // 「本格的な森」に作り直したラボの森（?forest=jungle）と、同じ場所・同じ向きの前の森（?forest=old）。この 2 つを比べる
  forestOff: { query: '?forest=old', hash: '#debug&sf', after: (page) => forestCorner(page) },
  forestOn: { query: '?forest=jungle', hash: '#debug&sf', after: (page) => forestCorner(page) },
}

/** 森の入口から少し入った小道の上で、北（森の奥）を向く */
async function forestCorner(page) {
  await page.evaluate(() => window.__sv.walk.start())
  await page.waitForFunction(() => window.__sv.walk.debug.scene, null, { timeout: 120000 })
  await sleep(3000)
  await page.evaluate(() => Object.assign(window.__sv.walk.walker, { s: 250, y: 11766, turnTo: Math.PI }))
  await sleep(12000)
}

const server = await serve(DIST)
const port = server.address().port
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-precise-memory-info'] })
const results = []
for (const name of wanted.length ? wanted : Object.keys(SCENARIOS)) {
  const sc = SCENARIOS[name]
  const ctx = await browser.newContext(phone ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } })
  await ctx.addInitScript(HOOK)
  const page = await ctx.newPage()
  const net = { bytes: 0, glb: 0, js: 0 }
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  const urls = new Map()
  cdp.on('Network.responseReceived', (e) => urls.set(e.requestId, e.response.url))
  cdp.on('Network.loadingFinished', (e) => {
    net.bytes += e.encodedDataLength
    const u = urls.get(e.requestId) ?? ''
    if (u.endsWith('.glb')) net.glb += e.encodedDataLength
    if (u.endsWith('.js')) net.js += e.encodedDataLength
  })
  page.on('pageerror', (e) => console.error(`[${name}] pageerror`, e.message))
  const t0 = Date.now()
  await page.goto(`http://localhost:${port}/${sc.query ?? ''}${sc.hash}`)
  const bootS = await booted(page, t0)
  if (sc.after) await sc.after(page)
  const r = await snapshot(page, net, name)
  r.bootS = +bootS.toFixed(1)
  results.push(r)
  console.log(JSON.stringify(r))
  if (args.includes('--shot')) await page.screenshot({ path: `${name}${phone ? '-phone' : ''}.png` })
  await ctx.close()
}
await browser.close()
server.close()
if (out) await writeFile(out, JSON.stringify(results, null, 2))
