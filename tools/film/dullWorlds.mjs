// 月ミッションの第4〜9章（打ち上げの Canvas 以外の場面）の「画面が変わらない時間」を測る（確認用。CI では使わない）
//   CH=4 MAX=240 OUT=/tmp/dull4 node tools/film/dullWorlds.mjs && python3 tools/film/dull.py /tmp/dull4
// CH は UI の章の番号（1 から）。おまかせ（自動）で進め、本物の時間で 1 秒ごとに 3D の絵と、字幕・カメラ・場面・画面の部品を記録する。
// 人が押すボタン（写真のシャッター、月へのブレーキ、地球へ帰る点火など）は、押せるようになって 3 秒で押す。
// 時計は Playwright の作りものの時計（page.clock）で、絵は 1 秒に 20 コマ（dt 0.05 秒）ずつ進める。
// SwiftShader が遅くても、場面の時間（字幕・無線・カメラ）は本物の速さどおりにそろう。
import { chromium } from 'playwright'
import { serve } from '../perf/serve.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = process.env.OUT || '/tmp/dullw'
const DIST = resolve(process.env.DIST || 'dist') + '/'
const MAX = Number(process.env.MAX || 240)
const CH = Number(process.env.CH || 4)
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const server = await serve(DIST)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: Number(process.env.W || 480), height: Math.round(Number(process.env.W || 480) * 9 / 16) } })
await ctx.addInitScript(() => {
  // 次のコマは 50 ms 後（作りものの時計の setTimeout。呼ぶたびに今の setTimeout を使う）
  window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 50)
  window.cancelAnimationFrame = (id) => window.clearTimeout(id)
  // 絵を撮るコマのほかは、GPU で描かない（SwiftShader の描画がいちばん重い。場面の動きは JS なのでそのまま進む）
  window.__draw = true
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    for (const k of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'clear']) {
      const f = C.prototype[k]
      if (!f) continue
      C.prototype[k] = function (...a) {
        if (window.__draw) return f.apply(this, a)
      }
    }
  }
  try {
    localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang: 'ja', music: false, muted: true, quality: 'light' }))
  } catch {}
})
await ctx.clock.install()
const page = await ctx.newPage()
/** 作りものの時計を ms 進める（そのあいだのコマを描く） */
const run = (ms) => page.clock.runFor(ms)
/** f() が true になるまで、時計を進めながら待つ */
async function until(f, arg, max = 120) {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(f, arg).catch(() => false)) return
    await run(500)
    await sleep(200)
  }
  throw new Error('timeout: ' + f)
}
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(`http://localhost:${server.address().port}/#debug`)
await until(() => !!(window.__sv && window.__sv.moonMission))
await run(3000)
await page.evaluate((n) => window.__sv.moonMission.chapter(n), CH - 1)
// 3D の模型・絵を読みこむ（本物の時間がかかる）あいだも、少しずつ時計を進める
for (let i = 0; i < 16; i++) {
  await run(500)
  await sleep(500)
}
const log = []
let ends = 0
for (let sec = 0; sec < MAX; sec++) {
  const info = await page.evaluate(() => {
    const S = window.__sv
    const M = S.moonMission
    const s = M.state.getState()
    const w = (window.__dw = window.__dw || { since: {} })
    const waited = (k) => {
      w.since[k] = w.since[k] ?? performance.now()
      return performance.now() - w.since[k] > 3000
    }
    if (!s.auto) M.auto(true)
    if (s.phase === 'dock' && !S.moonDock.sim.auto) S.moonDock.auto(true)
    if (s.phase === 'marble' && S.moonDock.state.getState().step === 'aim' && waited('marble')) S.moonDock.shutter()
    if (s.phase === 'home' && !S.moonReturn.sim.auto) S.moonReturn.auto(true)
    const rs = S.moonReturn.state.getState().step
    if (s.phase === 'home' && rs === 'teiWait' && waited('tei')) S.moonReturn.tei()
    if ((s.phase === 'loi' || s.phase === 'coast' || s.phase === 'descent') && waited('lgo' + s.phase)) S.moonLunar.go()
    const ev = S.apolloEva.state.getState()
    const hud = document.querySelector('.mm-hud')
    return {
      phase: s.phase,
      cam: s.cam,
      caption: s.caption ? `${s.caption.key}@${s.caption.at.toFixed(1)}` : '',
      t: +(performance.now() / 1000).toFixed(1),
      stage: `${S.moonDock.state.getState().step}/${rs}/${S.moonLunar.state.getState().step ?? ''}/${ev.step}`,
      warp: 0,
      panels: hud ? [...hud.querySelectorAll('[data-dull]')].map((e) => e.getAttribute('data-dull')).join(',') : '',
      end: !!document.querySelector('.mm-continue'),
      ch: Number(/^(\d+)\//.exec(document.querySelector('.cm-open-name')?.textContent ?? '')?.[1] ?? 0),
      sub: document.querySelector('.rs-card, .mm-caption')?.textContent?.slice(0, 40) ?? '',
    }
  })
  // 3D の Canvas は複数ある（小さな地図など）ので、画面全体を撮る（字幕やカードの変化も「変化」に入る）
  await page.screenshot({ path: `${OUT}/${String(sec).padStart(4, "0")}.jpg`, type: "jpeg", quality: 80, timeout: 15000 }).catch((e) => console.log("SHOT", e.message.slice(0, 200)))
  log.push({ sec, ...info })
  if (sec % 20 === 0) {
    console.log(sec, JSON.stringify(info))
    writeFileSync(`${OUT}/log.json`, JSON.stringify(log, null, 1))
  }
  if (info.phase === 'none' || info.phase === 'leave') break
  // 別の章に移ったら、おしまい
  // UNTIL=loi なら、章が変わっても、その場面になるまで続ける
  if (process.env.UNTIL ? info.phase === process.env.UNTIL : info.ch && info.ch !== CH) break
  // 「次へ」のボタン（#debug では数えて自動で進まない）は、本物の数え（6〜10 秒）のかわりに 8 秒で押す
  ends = info.end ? ends + 1 : 0
  if (ends >= 8) {
    await page.evaluate(() => document.querySelector('.mm-continue')?.click())
    ends = 0
  }
  // 1 秒のうち、最後のコマだけ描く
  await page.evaluate(() => (window.__draw = false))
  await run(950)
  await page.evaluate(() => (window.__draw = true))
  await run(50)
}
writeFileSync(`${OUT}/log.json`, JSON.stringify(log, null, 1))
await browser.close()
server.close()
