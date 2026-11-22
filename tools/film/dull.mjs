// 月ミッション（第1〜3章、打ち上げの Canvas）の「画面が変わらない時間」を測る（確認用。CI では使わない）
//   DIST=dist OUT=/tmp/dull MAX=400 node tools/film/dull.mjs && python3 tools/film/dull.py /tmp/dull
// 秒読みから、おまかせの操縦でコマ送り（window.__moonFilm.step）し、画面の 1 秒ごとに
//   ・3D の絵（canvas だけ。数字の変わる計器は入れない）を小さく撮る
//   ・字幕・カメラ・場面（phase）・機体の段を記録する
// 絵の変わり方は dull.py が調べる。MAX は画面の秒（打ち上げから地球を回って月へ向かう燃焼の終わりまでで約 400 秒）。
import { chromium } from 'playwright'
import { serve } from '../perf/serve.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = process.env.OUT || '/tmp/dull'
const DIST = resolve(process.env.DIST || 'dist') + '/'
const MAX = Number(process.env.MAX || 400)
// SKIP=150：秒読みと第1段を飛ばして、打ち上げ 150 秒後から測る（第1段は煙が重くて、コマ送りがとても遅い）
const SKIP = Number(process.env.SKIP || 0)
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const server = await serve(DIST)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } })
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang: 'ja', music: false, muted: true, quality: 'light' }))
  } catch {}
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(`http://localhost:${server.address().port}/#debug`)
await page.waitForFunction(() => window.__sv && window.__sv.moonMission, null, { timeout: 120000 })
await sleep(3000)
await page.evaluate(() => window.__sv.moonMission.start())
await page.waitForFunction(() => window.__moonFilm && window.__sv.moonMission.state.getState().phase === 'pad', null, { timeout: 120000 })
await page.evaluate(() => window.__moonFilm.begin())
await sleep(3000)
await page.evaluate(() => {
  window.__sv.moonMission.state.setState({ countdown: 20 })
  window.__sv.moonMission.auto(true)
})
if (SKIP > 0) await page.evaluate((t) => window.__sv.moonMission.skip(t), SKIP)
const canvas = page.locator('.mm-root canvas').first()
const log = []
for (let sec = 0; sec < MAX; sec++) {
  const info = await page.evaluate(() => {
    const M = window.__sv.moonMission
    for (let i = 0; i < 10; i++) {
      const s = M.state.getState()
      if (s.phase === 'pad' && s.ignitedAt === null && s.countdown <= 8.9) M.go()
      // 月へ向かう点火は、窓が開いたらすぐ押す（おまかせのとき人が押すのと同じ）
      if (s.phase === 'orbit' && M.sim.a.t - M.sim.orbitAt >= 2400) M.go()
      window.__moonFilm.step(0.1)
    }
    const s = M.state.getState()
    const hud = document.querySelector('.mm-hud')
    return {
      phase: s.phase,
      cam: s.cam,
      caption: s.caption ? `${s.caption.key}@${s.caption.at.toFixed(1)}` : '',
      t: +M.sim.a.t.toFixed(1),
      stage: M.sim.a.stage,
      warp: +M.sim.warp.toFixed(1),
      // 3D の外の、絵として見える部品（断面図・計器など）の数。増えたり減ったりも「変化」に数える
      panels: hud ? [...hud.querySelectorAll('[data-dull]')].map((e) => e.getAttribute('data-dull')).join(',') : '',
    }
  })
  await canvas.screenshot({ path: `${OUT}/${String(sec).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 80 })
  log.push({ sec, ...info })
  if (sec % 20 === 0) console.log(sec, JSON.stringify(info))
  if (info.phase === 'outbound' || info.phase === 'none') break
}
writeFileSync(`${OUT}/log.json`, JSON.stringify(log, null, 1))
await browser.close()
server.close()
