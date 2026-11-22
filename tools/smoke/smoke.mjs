// スクリーンショットで動作を確かめる（CI でも動かす）。npm run build のあとに
//   node tools/smoke/smoke.mjs [場面...] [--out dir] [--firefox]
// 場面ごとに、起動して準備完了まで待ち、ページのエラーが出ていないこと・3D が真っ黒や一色でないことを確かめて、
// 画面を PNG に残す（CI では成果物として保存）。SwiftShader（GPU なし）なので遅いが、壊れたかどうかは分かる
import { chromium, firefox, devices } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serve } from '../perf/serve.mjs'
import { decodePng, imageStats } from './png.mjs'

const args = process.argv.slice(2)
const outAt = args.indexOf('--out')
const outDir = outAt >= 0 ? args[outAt + 1] : 'smoke-shots'
const useFirefox = args.includes('--firefox')
// --shard i/n：場面の一覧を n 個に分けた i 番目（1 から）だけ動かす。CI で並べて走らせて、1 本 30 分の壁を越えないようにする
const shardAt = args.indexOf('--shard')
const shard = shardAt >= 0 ? args[shardAt + 1].split('/').map(Number) : null
const wanted = args.filter((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1) && (shardAt < 0 || i !== shardAt + 1))
const DIST = process.env.DIST ?? new URL('../../dist/', import.meta.url).pathname

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const desktop = { viewport: { width: 1280, height: 720 } }
// Firefox は isMobile を使えないので、スマホは画面の大きさと指の操作だけまねる
const phone = useFirefox ? { viewport: { width: 390, height: 664 }, hasTouch: true } : { ...devices['iPhone 13'], deviceScaleFactor: 1 }

/** 月に降りてジャンプし、着地後の結果を確かめる */
async function jumpScene(page) {
  await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
  await page.evaluate(() => window.__sv.landing.start('moon'))
  await sleep(3000)
  await page.evaluate(() => window.__sv.landing.skip())
  await page.waitForFunction(() => window.__sv.landing.state.getState().phase === 'surface', null, { timeout: 180000, polling: 500 })
  await sleep(2000)
  await visibleButton(page, '.jump-start')
  await page.evaluate(() => {
    window.__sv.jump.debug.freeze = 0
    document.querySelector('.jump-start').click()
  })
  await page.waitForFunction(() => window.__sv.jump.state.getState().id === 'moon', null, { timeout: 30000 })
  await page.evaluate(() => (window.__sv.jump.debug.freeze = 6))
  await page.waitForFunction(() => window.__sv.jump.state.getState().landed, null, { timeout: 60000, polling: 300 })
  await page.waitForFunction(() => document.querySelector('.jump-card .jump-result'), null, { timeout: 30000 })
  for (const sel of ['.jump-card .jump-again', '.jump-card .jump-actions .secondary']) await visibleButton(page, sel)
}

/** 探査機の旅：ボイジャー2号を選び、encounter 番目の通過の days 日前後で止める。模型の画面が出て、字幕と閉じるボタンが見える */
async function probeScene(page, encounter, days, id = 'voyager2') {
  await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
  await page.evaluate((id) => {
    window.__sv.probes.open()
    window.__sv.probes.play(id)
  }, id)
  await page.waitForFunction(() => document.querySelector('.probe-cam canvas'), null, { timeout: 60000 })
  await page.evaluate(
    ([k, d, id]) => {
      const { probes } = window.__sv
      probes.state.setState({ playing: false })
      probes.clock.ms = window.__sv.probeTrajectory(id).encounters[k].ms + d * 86_400_000
    },
    [encounter, days, id],
  )
  await sleep(6000)
  await page.waitForFunction(() => document.querySelector('.probe-cam .pc-caption')?.textContent, null, { timeout: 30000 })
  await visibleButton(page, '.probe-panel .close')
}

/** 宇宙服で歩く：着陸して外へ出て、前へ歩く。足あとが付き、戻るボタンが隠れない */
async function suitScene(page, body) {
  await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
  await page.evaluate((b) => window.__sv.landing.start(b), body)
  await sleep(3000)
  await page.evaluate(() => window.__sv.landing.skip())
  await page.waitForFunction(() => window.__sv.landing.state.getState().phase === 'surface', null, { timeout: 180000, polling: 500 })
  await sleep(2000)
  await visibleButton(page, '.suit-out')
  await page.evaluate(() => document.querySelector('.suit-out').click())
  await page.waitForFunction(() => window.__sv.suitWalk.state.getState().on, null, { timeout: 30000 })
  const from = await page.evaluate(() => ({ ...window.__sv.suitWalk.pose }))
  // フォボスのような重力の小さい星では、ふわふわ進むので遅い（遅い CI では 2 分を超えることがある）
  await page.evaluate(() => (window.__sv.suitWalk.debug.move = [0, 1]))
  await page.waitForFunction((f) => Math.hypot(window.__sv.suitWalk.pose.x - f.x, window.__sv.suitWalk.pose.z - f.z) > 0.8, from, { timeout: 240000, polling: 500 })
  await page.evaluate(() => (window.__sv.suitWalk.debug.move = null))
  for (const sel of ['.sw-actions .primary']) await visibleButton(page, sel)
}

/** 水のコップ：地表で「水を置いてみる」を押すと、台にコップが出て、上のカードと「もう一度」「片づける」が出る */
async function cupScene(page, body, until) {
  await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
  await page.evaluate((b) => window.__sv.landing.start(b), body)
  await sleep(3000)
  await page.evaluate(() => window.__sv.landing.skip())
  await page.waitForFunction(() => window.__sv.landing.state.getState().phase === 'surface', null, { timeout: 180000, polling: 500 })
  await sleep(2000)
  await visibleButton(page, '.cup-start')
  await page.evaluate(() => document.querySelector('.cup-start').click())
  await page.waitForFunction(() => document.querySelector('.cup-card .cup-head'), null, { timeout: 30000 })
  // 水が、その星らしい姿になるまで（真空なら凍る、金星なら消える）
  await page.waitForFunction(until, null, { timeout: 120000, polling: 500 })
  for (const sel of ['.cup-card .cup-again', '.cup-card .secondary']) await visibleButton(page, sel)
}

/** 画面の 3D が描けているか（文字やボタンを消して撮る） */
/** 3D が黒いときに、ログへ出す手がかり（WebGL が失われていないか、画面の大きさ、場面ごとの様子） */
async function why3dBlank(page, name) {
  return page
    .evaluate((name) => {
      const c = document.querySelector('canvas')
      const gl = c && (c.getContext('webgl2') || c.getContext('webgl'))
      const out = { canvas: c ? `${c.width}x${c.height}` : 'none', contextLost: gl ? gl.isContextLost() : null }
      const m = window.__sv?.moonMission
      if (name.startsWith('moonMission') && m) {
        const st = m.state.getState()
        Object.assign(out, { phase: st.phase, cam: st.cam, camLocked: st.camLocked, t: Math.round(m.sim.a.t), stage: m.sim.a.stage })
      }
      return JSON.stringify(out)
    }, name)
    .catch((e) => String(e))
}

async function check3d(page, name, min = { std: 4, lit: 0.002 }) {
  await page.evaluate(() => document.documentElement.classList.add('clean-screen'))
  await sleep(600)
  const shot = await page.screenshot({ timeout: 120000 })
  await page.evaluate(() => document.documentElement.classList.remove('clean-screen'))
  const s = imageStats(decodePng(shot))
  if (s.std < min.std || s.lit < min.lit) throw new Error(`${name}: 3D looks blank (mean ${s.mean.toFixed(1)}, std ${s.std.toFixed(1)}, lit ${(s.lit * 100).toFixed(2)}%) ${await why3dBlank(page, name)}`)
  return s
}

/** その要素が見えていて、ほかの物に隠れていないか（まん中の点で調べる） */
async function visibleButton(page, selector) {
  const r = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return 'missing'
    const b = el.getBoundingClientRect()
    if (b.width === 0 || b.right > innerWidth || b.bottom > innerHeight || b.left < 0) return `off-screen ${JSON.stringify(b)}`
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    return top && (top === el || el.contains(top)) ? 'ok' : `covered by ${top?.className || top?.tagName}`
  }, selector)
  if (r !== 'ok') throw new Error(`${selector}: ${r}`)
}

const SCENARIOS = {
  // 起動して、操縦席から見る
  flight: { ctx: desktop, hash: '#debug' },
  // 全体マップ：天体が描けているか（前に、名前だけ残って真っ黒になる不具合があった）
  map: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().setMode('map'))
      await sleep(4000)
    },
  },
  // 幅 960px のパソコン：アルカディアの「着陸船を発進」が航法パネルに隠れない
  narrow: {
    ctx: { viewport: { width: 960, height: 640 } },
    hash: '#debug&ship=arcadia',
    run: async (page) => {
      for (const sel of ['.launch-button', '.gallery-button', '.mode-button', '.bridge-button', '.eva-button']) await visibleButton(page, sel)
    },
  },
  // 共通のセーブ：前の版のキー（solar-voyager:settings、起動の前に入れたもの）が引き継がれ、セーブデータ画面に出る
  save: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('solar-odyssey:save') ?? 'null'))
      if (!saved || saved.app !== 'solar-odyssey' || !saved.data?.settings) throw new Error(`save not migrated: ${JSON.stringify(saved)?.slice(0, 200)}`)
      await page.evaluate(() => document.querySelector('.save-data')?.setAttribute('open', ''))
      await page.evaluate(() => document.querySelector('.save-data')?.scrollIntoView())
      await sleep(500)
      await visibleButton(page, '.save-export')
    },
  },
  // 場面の受け皿：公園の場面でわざと失敗させて「問題が起きました」が出て、「もどる」で宇宙の自由探索にもどる
  'scene-error': {
    ctx: desktop,
    hash: '#debug&sf',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      await page.evaluate(() => window.__sv.walk.start())
      // 歩く場面が出来てから壊す（遅い CI でも読み込み途中で壊さない）
      await page.waitForFunction(() => window.__sv.walk.debug.scene, null, { timeout: 120000 })
      await page.evaluate(() => window.__sv.crashScene('walk'))
      await page.waitForSelector('.scene-error[data-scene="walk"]', { timeout: 20000 })
      await visibleButton(page, '.scene-error-back')
      // 3D が重い CI ではクリックの安定待ちが終わらないので、DOM から直接押す
      await page.evaluate(() => document.querySelector('.scene-error-back').click())
      await page.waitForFunction(() => !document.querySelector('.scene-error') && window.__sv.walk.state.getState().phase === 'none', null, { timeout: 60000 })
      await sleep(2000)
    },
  },
  // 航法コンピュータのタブ：遊ぶ・学ぶ を開くと、登録した入口が出る
  'nav-tabs': {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.click('.nav-tab[data-tab="play"]')
      await visibleButton(page, '.nav-entry.race-start')
      await page.click('.nav-tab[data-tab="learn"]')
      await visibleButton(page, '.nav-entry.quiz-start')
      await page.click('.nav-tab[data-tab="go"]')
      await visibleButton(page, '.engage')
    },
  },
  // スマホ
  phone: { ctx: phone, hash: '#debug' },
  // 天体カード（PC とスマホ）：開いて、めくるボタンと閉じるボタンが隠れていない
  cards: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.bodyCards.open('mars'))
      await sleep(800)
      for (const sel of ['.body-cards .bc-step', '.body-cards .close']) await visibleButton(page, sel)
    },
  },
  // 今日の宇宙（スマホ）：閉じるボタンが隠れていない
  'today-phone': {
    ctx: phone,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.today.open())
      await sleep(800)
      await visibleButton(page, '.today-panel .close')
    },
  },
  // 探査機の旅（ボイジャー2号）：本物の道すじと、右の模型の画面。木星の最接近の少し前で止めて撮る
  'probe-voyager': { ctx: desktop, hash: '#debug', run: (page) => probeScene(page, 1, -0.3) },
  // スマホの縦：上に模型の画面、下に説明。閉じるボタンが隠れていない
  'probe-voyager-phone': { ctx: phone, hash: '#debug', run: (page) => probeScene(page, 1, -0.3) },
  // はやぶさ2：1回目のタッチダウンの 17 分前。リュウグウの近くの細かい地面と、探査機の影
  'probe-hayabusa2': { ctx: desktop, hash: '#debug', run: (page) => probeScene(page, 2, 239.925, 'hayabusa2') },
  // カッシーニ：ホイヘンスを切りはなした20秒後（土星を回るあいだの値は別のファイルから読み込む）
  'probe-cassini': { ctx: desktop, hash: '#debug', run: (page) => probeScene(page, 5, 176.97245, 'cassini') },
  // 発見スキャン：小惑星帯の岩のそばでスキャンすると、発見のカードが出る
  scan: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(async () => {
        const sv = window.__sv
        sv.discovery.start()
        // 出発点では船が地球に合わせて動くので、それを外してから帯の岩のそばへ
        sv.flightControl.releaseHold = true
        await new Promise((r) => setTimeout(r, 300))
        const mesh = sv.discovery.asteroids.meshes[0]
        const m = new sv.THREE.Matrix4()
        mesh.getMatrixAt(0, m)
        const p = new sv.THREE.Vector3().setFromMatrixPosition(m.premultiply(mesh.matrixWorld))
        sv.ship.position.copy(p).add(new sv.THREE.Vector3(2, 0.5, 2))
        sv.ship.velocity.set(0, 0, 0)
      })
      await page.waitForFunction(() => window.__sv.discovery.state.getState().candidate, null, { timeout: 30000 })
      await page.evaluate(() => window.__sv.discovery.state.setState({ progress: 0.95 }))
      await page.waitForFunction(() => window.__sv.discovery.state.getState().fresh, null, { timeout: 30000 })
      // 発見の瞬間：写真が撮れて、ポラロイドに出る
      await page.waitForFunction(() => document.querySelector('.fresh-polaroid img'), null, { timeout: 30000 })
      await visibleButton(page, '.scan-fresh button')
    },
  },
  // 発見スキャン（スマホ）：スキャナーの表示と発見ノートが画面に収まる
  'scan-phone': {
    ctx: phone,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.discovery.start())
      await sleep(800)
      await visibleButton(page, '.scanner-hud .scan-stop')
      await page.evaluate(() => window.__sv.discovery.note())
      await sleep(500)
      await visibleButton(page, '.discovery-note .close')
    },
  },
  'cards-phone': {
    ctx: phone,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.bodyCards.open('phobos'))
      await sleep(800)
      for (const sel of ['.body-cards .bc-step', '.body-cards .close']) await visibleButton(page, sel)
    },
  },
  // 到着の瞬間：木星に着くと、木星の前に地球が 11 個ならび、「もっと知る」が押せる（時間を止めて撮る）
  arrival: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => {
        const sv = window.__sv
        sv.store.getState().setTarget('jupiter')
        sv.flightControl.jumpTo = 'jupiter'
      })
      await page.waitForFunction(() => window.__sv.arrival.state.getState().id === 'jupiter', null, { timeout: 60000 })
      await page.evaluate(() => (window.__sv.arrival.debug.freeze = 6))
      await page.waitForFunction(() => document.querySelector('.arrival .arr-head-text'), null, { timeout: 30000 })
      await sleep(1500)
      await visibleButton(page, '.arrival .arr-more')
      const n = await page.evaluate(() => {
        let count = 0
        window.__sv.root(0).scene.traverse((o) => {
          if (o.isInstancedMesh && o.renderOrder === 12) count = o.count
        })
        return count
      })
      if (n !== 11) throw new Error(`expected 11 Earths in front of Jupiter, got ${n}`)
    },
  },
  // 到着の瞬間（スマホ）：月に着くと、地球の円に月がならんだ絵が出て、ボタンが隠れない
  'arrival-phone': {
    ctx: phone,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => {
        const sv = window.__sv
        sv.store.getState().setTarget('moon')
        sv.flightControl.jumpTo = 'moon'
      })
      await page.waitForFunction(() => window.__sv.arrival.state.getState().id === 'moon', null, { timeout: 60000 })
      await page.evaluate(() => (window.__sv.arrival.debug.freeze = 6))
      await page.waitForFunction(() => document.querySelectorAll('.arrival .arr-slot.on').length === 4, null, { timeout: 30000 })
      for (const sel of ['.arrival .arr-more', '.arrival .arr-close']) await visibleButton(page, sel)
    },
  },
  // 重力ジャンプ：月に降りて「ジャンプしてみる」を押すと跳び、着地すると結果（高さ・空中の時間）が出る（時間を止めて撮る）
  jump: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => jumpScene(page),
  },
  // 重力ジャンプ（スマホ）：ボタンが押せて、結果の「もう一度」「閉じる」が隠れない
  'jump-phone': {
    ctx: phone,
    hash: '#debug',
    run: async (page) => jumpScene(page),
  },
  // 人が乗る与圧ローバー（月）：着陸船のそばに停めてある車に乗りこみ、少し走って運転席から見る
  crewrover: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      await page.evaluate(() => window.__sv.landing.start('moon'))
      await sleep(3000)
      await page.evaluate(() => window.__sv.landing.skip())
      await page.waitForFunction(() => window.__sv.landing.state.getState().phase === 'surface' && window.__sv.landing.state.getState().ready, null, { timeout: 180000, polling: 500 })
      // 着陸の画面のボタンは、着いたあとの次のコマで出る（遅い CI では数秒かかることがある）
      await page.waitForSelector('.crew-rover-start', { timeout: 30000 }).catch(() => {})
      await visibleButton(page, '.crew-rover-start')
      await page.evaluate(() => document.querySelector('.crew-rover-start').click())
      await page.waitForFunction(() => window.__sv.rover.state.getState().phase === 'drive', null, { timeout: 60000, polling: 500 })
      await page.evaluate(() => (window.__sv.rover.input.throttle = 1))
      // 決まった秒数ではなく、進んだ距離で待つ（CI の遅いコマでは 4 秒では 1 コマも進まないことがある）
      await page.waitForFunction(() => window.__sv.rover.state.getState().hud.dist > 3, null, { timeout: 40000, polling: 250 }).catch(() => {})
      await page.evaluate(() => (window.__sv.rover.input.throttle = 0))
      const st = await page.evaluate(() => window.__sv.rover.state.getState())
      if (st.vehicle !== 'crew' || !(st.hud.dist > 3)) throw new Error(`crewrover: did not drive (${st.vehicle}, ${st.hud.dist} m)`)
      await page.evaluate(() => window.__sv.rover.state.getState().setView('cam'))
      await sleep(2000)
    },
  },
  // 宇宙服で与圧ローバーへ：車体はすり抜けない。そばで「乗る」が出て、押すと運転できる
  'crew-board': {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      await page.evaluate(() => window.__sv.landing.start('moon'))
      await sleep(3000)
      await page.evaluate(() => window.__sv.landing.skip())
      await page.waitForFunction(() => window.__sv.landing.state.getState().phase === 'surface' && window.__sv.landing.state.getState().ready, null, { timeout: 180000, polling: 500 })
      await sleep(2000)
      await visibleButton(page, '.suit-out')
      await page.evaluate(() => document.querySelector('.suit-out').click())
      await page.waitForFunction(() => window.__sv.suitWalk.state.getState().on && window.__sv.suitWalk.pose && window.__sv.suitWalk.debug.place && window.__sv.suitWalk.crew.on, null, { timeout: 60000, polling: 500 })
      // 車体の中（横 1.5 m）に置くと、車の外へ押し出される。そばなので「乗る」が出る
      await page.evaluate(() => {
        const c = window.__sv.suitWalk.crew
        window.__sv.suitWalk.debug.place(c.x + Math.cos(c.heading) * 1.5, c.z - Math.sin(c.heading) * 1.5, c.heading)
      })
      await page.waitForFunction(() => window.__sv.suitWalk.state.getState().nearCrew, null, { timeout: 30000, polling: 500 })
      await sleep(2000)
      const d = await page.evaluate(() => {
        const c = window.__sv.suitWalk.crew, p = window.__sv.suitWalk.pose
        const fx = -Math.sin(c.heading), fz = -Math.cos(c.heading)
        const dx = p.x - c.x, dz = p.z - c.z
        return { f: dx * fx + dz * fz, s: dx * -fz + dz * fx }
      })
      if (Math.abs(d.s) < 2.5 && Math.abs(d.f) < 3.5) throw new Error(`crew-board: inside the rover (${JSON.stringify(d)})`)
      await visibleButton(page, '.sw-board')
      await page.evaluate(() => document.querySelector('.sw-board').click())
      await page.waitForFunction(() => window.__sv.rover.state.getState().phase === 'drive' && window.__sv.rover.state.getState().vehicle === 'crew', null, { timeout: 60000, polling: 500 })
    },
  },
  // 宇宙服で歩く（月）：外へ出て歩ける
  suit: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => suitScene(page, 'moon'),
  },
  // 宇宙服で歩く（スマホ・フォボス）：スティックと跳ぶボタンが隠れない
  'suit-phone': {
    ctx: phone,
    hash: '#debug',
    run: async (page) => {
      await suitScene(page, 'phobos')
      for (const sel of ['.sw-pad .sw-jump', '.sw-pad .sw-run', '.sw-pad .sw-stick']) await visibleButton(page, sel)
      // スティックを指で上へ倒すと、前へ進む入力になる（画面の 3D に通り抜けない）
      const b = await page.evaluate(() => {
        const r = document.querySelector('.sw-stick').getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })
      await page.mouse.move(b.x, b.y)
      await page.mouse.down()
      await page.mouse.move(b.x, b.y - 40, { steps: 4 })
      const z = await page.evaluate(() => window.__sv.suitWalk.input.z)
      await page.mouse.up()
      if (!(z > 0.5)) throw new Error(`suit-phone: stick did not move the walker (input z ${z})`)
    },
  },
  // 水のコップ（月）：置くといきなり沸いて凍る。時刻バーの「日の出」で、日の出の案内が出る
  cup: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await cupScene(page, 'moon', () => {
        const w = window.__sv.waterCup.state.getState().water
        return w.liquid === 0 && w.ice > 0.5
      })
      const info = () => page.evaluate(() => JSON.stringify({ clock: window.__sv.skyClock.getState().clock, cam: window.__sv.surfaceCam, sun: window.__sky?.sunDir, view: window.__sv.landing.state.getState().view, cup: window.__sv.waterCup.state.getState().water }))
      await check3d(page, 'cup-ice').catch(async (e) => {
        throw new Error(`${e.message} ${await info()}`)
      })
      await page.evaluate(() => window.__sv.landing.state.setState({ menu: true }))
      await page.waitForFunction(() => document.querySelector('.sunrise-go'), null, { timeout: 30000 })
      await page.evaluate(() => document.querySelector('.sunrise-go').click())
      await page.waitForFunction(() => document.querySelector('.sunrise-card .sunrise-head'), null, { timeout: 30000 })
      // 日の出の少し前まで時間が進んだのを待つ（月は昼に着くので、先に「昼」を押すと何もせずに終わる）
      await page.waitForFunction(() => window.__sv.skyClock.getState().clock < 9, null, { timeout: 60000, polling: 300 })
      // 日の出の前は暗いので、時間を止めて昼へ進めてから 3D を確かめる（早回しのままだと、遅い端末ではまた夜になる）
      await page.evaluate(() => {
        window.__sv.skyClock.getState().setRate(0)
        document.querySelector('.time-jump .sunrise-go + button').click()
      })
      await page.waitForFunction(() => Math.abs(window.__sv.skyClock.getState().clock - 12) < 1.5, null, { timeout: 60000, polling: 500 })
      await check3d(page, 'cup-noon').catch(async (e) => {
        throw new Error(`${e.message} ${await info()}`)
      })
    },
  },
  // 水のコップ（スマホ・金星）：沸いて消える。カードのボタンが隠れない
  'cup-phone': {
    ctx: phone,
    hash: '#debug',
    run: async (page) => cupScene(page, 'venus', () => {
      const w = window.__sv.waterCup.state.getState().water
      return w.liquid + w.ice < 0.002
    }),
  },
  // 大きさくらべ：木星と地球・太陽が本当の比で棚にならび、ひとことと、ならべるもののボタンが出る。さわると寄る
  size: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.sizeCompare.open('jupiter'))
      await page.waitForFunction(() => document.querySelector('.size-compare .sc-caption'), null, { timeout: 30000 })
      for (const sel of ['.size-compare .sc-chip', '.size-compare .close']) await visibleButton(page, sel)
      // 名札は 3D の場面の中（Canvas が描き始めてから出る）。遅い端末では少し待つ
      await page.waitForFunction(() => document.querySelectorAll('.size-compare .sc-label').length >= 3, null, { timeout: 60000 }).catch(() => undefined)
      const n = await page.evaluate(() => document.querySelectorAll('.size-compare .sc-label').length)
      if (n !== 3) throw new Error(`expected 3 things on the shelf, got ${n}`)
      await page.evaluate(() => window.__sv.sizeCompare.focus('earth'))
      await page.waitForFunction(() => document.querySelector('.size-compare .sc-back'), null, { timeout: 10000 })
    },
  },
  // 大きさくらべ（スマホ）：フォボスと地球・月・ダイモス。たてにならんだボタンが隠れない
  'size-phone': {
    ctx: phone,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.sizeCompare.open('phobos'))
      await page.waitForFunction(() => document.querySelector('.size-compare .sc-caption'), null, { timeout: 30000 })
      await sleep(1500)
      for (const sel of ['.size-compare .sc-chip', '.size-compare .close']) await visibleButton(page, sel)
    },
  },
  // SF の世界
  sf: { ctx: desktop, hash: '#debug&sf', settle: 8000 },
  // 火星の峡谷レース：着陸してレース場へ行き、スタートして 3・2・1 と表示が出ること、「レースをやめる」で自由走行に戻ること
  race: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      await page.evaluate(() => window.__sv.landing.start('mars'))
      await sleep(3000)
      await page.evaluate(() => window.__sv.landing.skip())
      await page.waitForFunction(() => window.__sv.landing.state.getState().phase === 'surface', null, { timeout: 180000, polling: 500 })
      await page.evaluate(() => window.__sv.landing.site('coprates'))
      await page.waitForFunction(() => window.__sv.landing.state.getState().phase === 'surface' && window.__sv.landing.state.getState().site === 'coprates', null, { timeout: 180000, polling: 500 })
      await page.waitForSelector('.rally-start .rally-medals', { timeout: 60000 })
      await page.evaluate(() => window.__sv.rally.start())
      await page.waitForFunction(() => ['count', 'run'].includes(window.__sv.rally.state.getState().phase), null, { timeout: 120000, polling: 500 })
      await page.waitForSelector('.rally-hud', { timeout: 30000 })
      await visibleButton(page, '.rally-actions .rally-auto')
      await sleep(4000)
      await page.evaluate(() => window.__sv.rally.quit())
      await page.waitForFunction(() => window.__sv.rally.state.getState().phase === 'off', null, { timeout: 10000 })
    },
  },
  // 着陸船で月の空を飛ぶ：月に降りて「空を飛ぶ」、低く飛んでから高く上がると月が丸ごと見える。「着陸地点へ戻る」で地表へ
  skyflight: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      await page.evaluate(() => window.__sv.landing.start('moon'))
      await sleep(3000)
      await page.evaluate(() => window.__sv.landing.skip())
      await page.waitForFunction(() => window.__sv.landing.state.getState().phase === 'surface' && window.__sv.landing.state.getState().ready, null, { timeout: 180000, polling: 500 })
      await visibleButton(page, '.sky-flight-start')
      await page.evaluate(() => document.querySelector('.sky-flight-start').click())
      await page.waitForFunction(() => window.__sv.skyFlight.state.getState().phase === 'fly', null, { timeout: 60000, polling: 500 })
      await page.waitForSelector('.flight-hud', { timeout: 30000 })
      await sleep(5000)
      const low = await page.evaluate(() => window.__sv.skyFlight.state.getState().alt)
      if (!(low > 0 && low < 2000)) throw new Error(`skyflight: odd altitude ${low}`)
      await check3d(page, 'skyflight-low')
      await page.evaluate(() => {
        const c = window.__flight.ctl
        c.p.setLength(1737400 + 2_000_000)
        c.up.copy(c.p).normalize()
      })
      await sleep(5000)
      await check3d(page, 'skyflight-high')
      await visibleButton(page, '.flight-back')
      await page.evaluate(() => document.querySelector('.flight-back').click())
      await page.waitForFunction(() => window.__sv.skyFlight.state.getState().phase === 'off', null, { timeout: 10000 })
      await page.waitForSelector('.sky-flight-start', { timeout: 60000 })
    },
  },
  // コロニーの公園を歩く
  // SF の開拓：端末が開き、建設が 3 段進み、建設中のコロニーのそばで描ける。「開拓をやめる」で抜けられる
  pioneer: {
    ctx: desktop,
    hash: '#debug&sf',
    settle: 8000,
    run: async (page) => {
      await page.evaluate(() => window.__sv.pioneer.start())
      // 初めて：遊び方の案内（4 枚）→ 閉じると「いまやること」のカード
      await page.waitForSelector('.pio-guide', { timeout: 60000 })
      for (let i = 0; i < 4; i++) await page.click('.pio-guide footer .pio-build')
      await visibleButton(page, '.pio-goal-go')
      const goal = await page.textContent('.pio-goal-text b')
      if (!goal) throw new Error('pioneer: no goal text')
      // 拾う → 納める：納品のカードが出る
      // （ソフト描画では 1 コマが遅く、カードが出て消えるまでに見逃すので、出たことを記録しておく）
      await page.evaluate(() => {
        window.__delivered = false
        new MutationObserver(() => {
          if (document.querySelector('.pio-delivery')) window.__delivered = true
        }).observe(document.body, { childList: true, subtree: true })
        const p = window.__sv.pioneer
        p.collect('metal', 12)
        p.deliver()
      })
      await page.waitForFunction(() => window.__delivered, null, { timeout: 30000 })
      // 重い画面では page.click が「押したあとの待ち」で 30 秒を超えることがあるので、DOM で押す
      await page.evaluate(() => document.querySelector('.pio-open').click())
      await visibleButton(page, '.pio-quit')
      // 端末の 4 つのタブ：それぞれの図が出る（納品 1 回ぶんの記録と流れがある）
      for (const [tab, sel] of [['route', '.pio-map .pio-map-ship'], ['flow', '.pio-sankey .pio-band'], ['log', '.pio-bars .pio-tbar'], ['ship', '.pio-upgrade'], ['status', '.pio-donut']]) {
        // 画面が重い（SwiftShader）と page.click の「止まるまで待つ」が 30 秒を超えるので、DOM で押す
        await page.evaluate((id) => document.getElementById(`pio-tab-${id}`).click(), tab)
        await page.waitForSelector(sel, { timeout: 15000 })
      }
      // 珍しい岩：記録に残り、今日の依頼の記録がある
      const rare = await page.evaluate(() => {
        const p = window.__sv.pioneer
        p.breakRare()
        const st = p.state.getState()
        return { rare: Object.values(st.rare).reduce((a, b) => a + b, 0), day: st.daily?.day }
      })
      if (rare.rare !== 1 || !rare.day) throw new Error(`pioneer: rare ${JSON.stringify(rare)}`)
      // 改造：倉庫の資源で積める量が増える
      const cap = await page.evaluate(() => {
        const p = window.__sv.pioneer
        p.give({ metal: 30 })
        if (!p.upgrade('hold')) return -1
        return p.state.getState().upgrades.hold
      })
      if (cap !== 1) throw new Error(`pioneer: upgrade level ${cap}, expected 1`)
      // 配達の仕事：行き先はどれも世界にある。掲示板から引き受け、最初の行き先のそばで止まると積み始める
      // （SF の構造物は少しずつ置かれるので、そろうまで待つ）
      await page.waitForFunction(
        () => ['colony', 'torus', 'rock-port', 'rock-base', 'shipyard', 'spacedock', 'elevator', 'solar-plant', 'sail-launcher', 'moon-city'].every((id) => window.__sv.bodies.get(id)),
        null,
        { timeout: 120000, polling: 1000 },
      )
      await page.evaluate(() => document.getElementById('pio-tab-jobs').click())
      await page.waitForSelector('.pio-jobs .pio-job .pio-build', { timeout: 15000 })
      await page.evaluate(() => document.querySelector('.pio-jobs .pio-job .pio-build').click())
      // 最初の行き先へは、マップから移るのと同じ動き（その前に着く）
      const first = await page.evaluate(() => {
        const sv = window.__sv
        const job = sv.delivery.state.getState().active
        if (!job) return null
        sv.flightControl.jumpTo = job.def.stops[0]
        return job.def.stops[0]
      })
      if (!first) throw new Error('pioneer: job not accepted')
      await page.waitForFunction(() => window.__sv.delivery.state.getState().handoff > 0 || window.__sv.delivery.state.getState().active?.stop > 0, null, { timeout: 60000 })
      const job = await page.evaluate(() => {
        const sv = window.__sv
        const before = sv.pioneer.state.getState().store.metal + sv.pioneer.state.getState().store.ice + sv.pioneer.state.getState().store.gas
        const stops = sv.delivery.state.getState().active.def.stops.length
        while (sv.delivery.state.getState().active) sv.delivery.handoff()
        const st = sv.pioneer.state.getState().store
        return { stops, done: sv.delivery.state.getState().done, gain: st.metal + st.ice + st.gas - before }
      })
      if (job.done !== 1 || job.gain <= 0) throw new Error(`pioneer: job ${JSON.stringify(job)}`)
      // 積んだ・降ろしたのカードのあとに出る（行き先へ移った直後は 1 コマが重いので、長めに待つ）
      await page.waitForSelector('.pio-card-job', { timeout: 90000 })
      await page.evaluate(() => {
        const p = window.__sv.pioneer
        p.give({ metal: 200, gas: 30 })
        p.build()
        p.build()
        p.build()
      })
      const stage = await page.evaluate(() => window.__sv.pioneer.state.getState().stage)
      if (stage !== 3) throw new Error(`pioneer: stage ${stage}, expected 3`)
      // 建てると建設の場面（とばせる）
      await page.waitForSelector('.pio-cinema-ui', { timeout: 30000 })
      await page.evaluate(() => window.__sv.pioneer.skip(true))
      await page.waitForSelector('.pio-cinema-ui', { state: 'detached', timeout: 30000 })
      // 場面のあとは建設中のコロニーのそばにいて、カードに戻る
      await sleep(3000)
      await visibleButton(page, '.pio-open')
      // コロニー経営：完成させたことにして、端末の経営タブで町づくりを始め、公園を 1 つ建てる
      await page.evaluate(() => {
        window.__sv.pioneer.state.setState({ stage: 5, colonyName: 'Smoke', naming: false, store: { metal: 300, ice: 300, gas: 300 }, panel: true, tab: 'colony' })
      })
      await page.waitForSelector('.col-intro .pio-build', { timeout: 30000 })
      await page.evaluate(() => document.querySelector('.col-intro .pio-build').click())
      await page.waitForSelector('.col-tab .col-chart svg', { timeout: 30000 })
      const town = await page.evaluate(() => {
        const sv = window.__sv
        const before = sv.colony.state.getState().zones.park
        document.querySelector('.col-z-park .pio-build').click()
        const s = sv.colony.state.getState()
        return { started: s.started, park: s.zones.park - before, ice: sv.pioneer.state.getState().store.ice }
      })
      if (!town.started || town.park !== 1 || town.ice !== 285) throw new Error(`pioneer: colony ${JSON.stringify(town)}`)
      await page.evaluate(() => window.__sv.pioneer.state.setState({ panel: false }))
    },
    after: async (page) => {
      // 重い画面では page.click の待ちが 30 秒を超えるので、DOM で押す
      await page.evaluate(() => document.querySelector('.pio-open').click())
      await page.waitForSelector('.pio-quit', { timeout: 30000 })
      await page.evaluate(() => document.querySelector('.pio-quit').click())
      await sleep(300)
      if (await page.$('.pioneer-hud')) throw new Error('pioneer: still shown after quitting')
    },
  },
  // 月ミッション（アポロ17号の追体験）：夕方の発射台のサターンV 図鑑（印・断面）→ タイムラプス → 夜の発射台 → 打ち上げ →
  // 地球を回る → 月へ向けて点火 → 終わりのカード
  moonMission: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      await page.evaluate(() => window.__sv.moonMission.start('launch', window.__sv.moonMission.observe))
      await page.waitForFunction(() => window.__sv.moonMission.state.getState().phase === 'observe', null, { timeout: 60000 })
      await page.waitForSelector('.se-dot', { timeout: 120000 })
      await sleep(3000)
      await check3d(page, 'moonMission observe')
      // 印にさわると説明のカード、断面のボタン、打ち上げの夜へ → タイムラプスをとばす
      await page.evaluate(() => document.querySelectorAll('.se-dot')[6].click())
      await page.waitForSelector('.se-card', { timeout: 10000 })
      await visibleButton(page, '.se-buttons button')
      await page.evaluate(() => document.querySelector('.se-buttons button').click())
      await sleep(1500)
      await page.evaluate(() => document.querySelector('.se-go').click())
      await page.waitForSelector('.se-skip', { timeout: 10000 })
      await sleep(1500)
      await page.evaluate(() => document.querySelector('.se-skip').click())
      await page.waitForFunction(() => window.__sv.moonMission.state.getState().phase === 'pad', null, { timeout: 60000 })
      await page.waitForSelector('.mm-count', { timeout: 120000 })
      await sleep(4000)
      await check3d(page, 'moonMission pad')
      await page.evaluate(() => window.__sv.moonMission.skip(90))
      await sleep(3000)
      await check3d(page, 'moonMission ascent')
      await page.evaluate(() => window.__sv.moonMission.skip(3150))
      await page.waitForSelector('.mm-tli button', { timeout: 30000 })
      await page.evaluate(() => window.__sv.moonMission.go())
      await page.evaluate(() => window.__sv.moonMission.skip(window.__sv.moonMission.sim.a.t + 3000))
      const phase = await page.evaluate(() => window.__sv.moonMission.state.getState().phase)
      if (phase !== 'outbound') throw new Error(`moonMission: phase ${phase}, expected outbound`)
      await page.waitForSelector('.mm-end', { timeout: 60000 })
      await visibleButton(page, '.mm-end-buttons button')
    },
    after: async (page) => {
      await page.click('.mm-quit')
      await page.waitForFunction(() => window.__sv.moonMission.state.getState().phase === 'none', null, { timeout: 30000 })
    },
  },
  // 月ミッション第2弾：月の裏で減速 → 着陸船を切り離す → 降下 → 着陸 → 結果のカード
  moonLunar: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      await page.evaluate(() => window.__sv.moonMission.start())
      await page.waitForFunction(() => window.__sv.moonMission.state.getState().phase === 'pad', null, { timeout: 60000 })
      await page.evaluate(() => window.__sv.moonLunar.start())
      await page.waitForFunction(() => window.__sv.moonLunar.state.getState().ready, null, { timeout: 120000 })
      await page.evaluate(() => window.__sv.moonLunar.skip('loi'))
      await sleep(4000)
      await check3d(page, 'moonLunar loi')
      await page.evaluate(() => window.__sv.moonLunar.skip('highGate'))
      await sleep(4000)
      await check3d(page, 'moonLunar descent')
      await page.evaluate(() => window.__sv.moonLunar.skip('land'))
      const r = await page.evaluate(() => ({ phase: window.__sv.moonMission.state.getState().phase, touch: window.__sv.moonLunar.lunar.desc?.touch }))
      if (r.phase !== 'landed' || !r.touch || r.touch.vUp < -3) throw new Error(`moonLunar: ${JSON.stringify(r)}`)
      await page.waitForSelector('.mm-end', { timeout: 60000 })
      await visibleButton(page, '.mm-end-buttons button')
    },
    after: async (page) => {
      await page.click('.mm-quit')
      await page.waitForFunction(() => window.__sv.moonMission.state.getState().phase === 'none', null, { timeout: 30000 })
    },
  },
  moonDock: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      // 章3：ドッキング（おまかせでつなぎ、引き出しまで）
      await page.evaluate(() => window.__sv.moonMission.start('launch', () => window.__sv.moonDock.dock()))
      await page.waitForFunction(() => window.__sv.moonMission.state.getState().phase === 'dock', null, { timeout: 60000 })
      await page.evaluate(() => window.__sv.moonDock.skip('approach'))
      await sleep(4000)
      await check3d(page, 'moonDock approach')
      await page.evaluate(() => window.__sv.moonDock.skip('dockEnd'))
      const r = await page.evaluate(() => window.__sv.moonDock.state.getState())
      if (r.step !== 'dockEnd' || !r.hit || r.stars < 1) throw new Error(`moonDock: ${JSON.stringify({ step: r.step, hit: r.hit, stars: r.stars })}`)
      await page.waitForSelector('.dk-end', { timeout: 60000 })
      // 章4：青い地球を撮って、本物の写真と見くらべる
      await page.click('.dk-end .mm-continue')
      await page.waitForFunction(() => window.__sv.moonMission.state.getState().phase === 'marble', null, { timeout: 30000 })
      await sleep(4000)
      await check3d(page, 'moonDock marble')
      await page.evaluate(() => window.__sv.moonDock.shutter())
      await page.waitForSelector('.dk-compare img', { timeout: 60000 })
      await visibleButton(page, '.dk-compare .mm-end-buttons button')
    },
    after: async (page) => {
      await page.click('.mm-quit')
      await page.waitForFunction(() => window.__sv.moonMission.state.getState().phase === 'none', null, { timeout: 30000 })
    },
  },
  moonReturn: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      // 章8：地球へ帰る（突入の角度・火の玉・パラシュート・着水）
      await page.evaluate(() => window.__sv.moonMission.start('launch', () => window.__sv.moonReturn.start()))
      await page.waitForFunction(() => window.__sv.moonMission.state.getState().phase === 'home', null, { timeout: 60000 })
      await sleep(3000)
      await check3d(page, 'moonReturn rdv')
      await page.evaluate(() => window.__sv.moonReturn.skip('corridor'))
      await page.waitForSelector('.rt-gauge', { timeout: 30000 })
      await page.evaluate(() => window.__sv.moonReturn.skip('entry'))
      await sleep(3000)
      await check3d(page, 'moonReturn entry')
      await page.evaluate(() => window.__sv.moonReturn.skip('end'))
      const r = await page.evaluate(() => window.__sv.moonReturn.state.getState())
      if (r.step !== 'end' || r.stars < 1) throw new Error(`moonReturn: ${JSON.stringify({ step: r.step, stars: r.stars })}`)
      await page.waitForSelector('.rt-card', { timeout: 30000 })
      await visibleButton(page, '.rt-card .mm-end-buttons button')
    },
    after: async (page) => {
      await page.click('.mm-quit')
      await page.waitForFunction(() => window.__sv.moonMission.state.getState().phase === 'none', null, { timeout: 30000 })
    },
  },
  walk: {
    ctx: desktop,
    hash: '#debug&sf',
    run: async (page) => {
      // CI の機械（2 コア・GPU なし）では、公園を「標準」で描くと 1 コマに 30 秒以上かかるので「軽量」で
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      // 配達の仕事の最後（苗を研究温室へ歩いて届ける）：コロニーで降ろしたところから
      await page.evaluate(() => {
        const sv = window.__sv
        sv.pioneer.state.setState({ introSeen: true })
        sv.pioneer.start()
        const def = { id: 'smoke', kind: 'seedlings', stops: ['spacedock', 'colony', 'colony-lab'], reward: { metal: 10, ice: 0, gas: 0 } }
        sv.delivery.state.setState({ active: { def, stop: 2, elapsed: 40, warped: false, beamed: false } })
      })
      await page.evaluate(() => window.__sv.walk.start())
      await page.waitForFunction(() => window.__sv.walk.debug.scene, null, { timeout: 120000 })
      await page.waitForSelector('.pio-errand', { timeout: 60000 })
      await sleep(6000)
      // 入口の輪へ歩いて行った（ことにする）と、手渡して仕事が終わる
      await page.evaluate(() => {
        const p = window.__sv.delivery.lab()
        Object.assign(window.__sv.walk.walker, { s: p.doorS, y: p.doorY })
      })
      await page.waitForFunction(() => window.__sv.delivery.state.getState().active === null, null, { timeout: 60000 })
      const done = await page.evaluate(() => window.__sv.delivery.state.getState().done)
      if (done !== 1) throw new Error(`walk: errand done ${done}`)
    },
  },
  // 公園の外（円筒のほかの所）：歩く人のまわりの区画（地面・家・木）が作られて、細かく描く範囲が切りかわる
  walkCity: {
    ctx: desktop,
    hash: '#debug&sf?colonytime=day',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      await page.evaluate(() => window.__sv.walk.start())
      await page.waitForFunction(() => window.__sv.walk.debug.scene, null, { timeout: 120000 })
      // 住宅地（帯 1 の、港から 17 km）へ
      await page.evaluate(() => Object.assign(window.__sv.walk.walker, { s: 560, y: 17430, turnTo: -1.57 }))
      await page.waitForFunction(() => window.__sv.walk.chunks.shown && window.__sv.walk.chunks.shown.j0 > 80, null, { timeout: 240000, polling: 1000 })
      await sleep(3000)
    },
  },
  walkAxis: {
    ctx: desktop,
    hash: '#debug&sf?colonytime=day',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      await page.evaluate(() => window.__sv.walk.start())
      await page.waitForFunction(() => window.__sv.walk.debug.scene, null, { timeout: 120000 })
      // 回転の軸の駅（エレベーターの上）へ。重さがほぼ 0 になる
      await page.evaluate(() => Object.assign(window.__sv.walk.walker, { s: 0, y: 130, h: 3970, turnTo: 3.14 }))
      await page.waitForFunction(() => window.__sv.walk.state.getState().gee < 0.02, null, { timeout: 60000, polling: 500 })
      // 翼をつける（軸の駅でだけつけられる）
      await page.evaluate(() => (window.__sv.walk.input.wings = true))
      await page.waitForFunction(() => window.__sv.walk.state.getState().wings, null, { timeout: 30000, polling: 500 })
      await sleep(4000)
    },
  },
}

await mkdir(outDir, { recursive: true })
const server = await serve(DIST)
const port = server.address().port
const browser = useFirefox
  ? // ヘッドレスの Firefox は GL を作れないので、CI では仮想画面（xvfb-run）で窓を出して Mesa のソフト描画を使う
    await firefox.launch({ headless: !process.env.DISPLAY, firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false } })
  : await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const failures = []
const all = wanted.length ? wanted : Object.keys(SCENARIOS)
// 重い場面（歩く・SF）が一つの組に固まらないよう、順に配る
const names = shard ? all.filter((_, i) => i % shard[1] === shard[0] - 1) : all
if (shard) console.log(`shard ${shard[0]}/${shard[1]}: ${names.join(' ')}`)
for (const name of names) {
  const sc = SCENARIOS[name]
  const t0 = Date.now()
  const ctx = await browser.newContext(sc.ctx)
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang: 'ja', music: false, muted: true }))
    } catch {}
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // 起動しなかったときの手がかり（コンソールのエラーと警告）
  const consoleLines = []
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && consoleLines.length < 12) consoleLines.push(`${m.type()}: ${m.text().slice(0, 200)}`)
  })
  try {
    await page.goto(`http://localhost:${port}/${sc.hash}`)
    await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 240000, polling: 500 })
    await sleep(sc.settle ?? 3000)
    if (sc.run) await sc.run(page)
    const s = await check3d(page, name)
    await page.screenshot({ path: join(outDir, `${name}${useFirefox ? '-firefox' : ''}.png`), timeout: 120000 })
    // 撮ったあとに確かめること（「もどる」で抜けられるか など）
    if (sc.after) await sc.after(page)
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`)
    console.log(`ok   ${name} (${((Date.now() - t0) / 1000).toFixed(0)} s, std ${s.std.toFixed(1)})`)
  } catch (e) {
    failures.push(name)
    console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`)
    const state = await page
      .evaluate(() => {
        const c = document.createElement('canvas')
        const gl = c.getContext('webgl2')
        const info = gl?.getExtension('WEBGL_debug_renderer_info')
        return { boot: document.querySelector('.boot-text')?.textContent ?? '(boot screen gone)', webgl2: !!gl, renderer: gl ? String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : null }
      })
      .catch((err) => ({ evalFailed: String(err).slice(0, 200) }))
    console.log(`     state: ${JSON.stringify(state)}`)
    for (const l of consoleLines) console.log(`     ${l}`)
    await page.screenshot({ path: join(outDir, `${name}${useFirefox ? '-firefox' : ''}-fail.png`) }).catch(() => {})
  }
  await ctx.close()
}
await browser.close()
server.close()
await writeFile(join(outDir, useFirefox ? 'result-firefox.txt' : 'result.txt'), failures.length ? `failed: ${failures.join(', ')}\n` : 'all ok\n')
process.exit(failures.length ? 1 : 0)
