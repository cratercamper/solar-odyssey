// Rocketbox の人を glb にまとめる。vite（npx vite）を 127.0.0.1:5173 で動かしてから：
// node tools/mobs/rocketbox/export.cjs Male_Adult_01 Female_Child_01 ...
// 素材は tools/mobs/.rocketbox_stage/<名前>/ に置く（FBX と 1024 px のテクスチャ。README 参照）。出力は public/walk/mobs/rocketbox/<名前>.glb
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const out = path.join(__dirname, '../../../public/walk/mobs/rocketbox')
;(async () => {
  fs.mkdirSync(out, { recursive: true })
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const p = await b.newPage()
  p.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 200)) })
  await p.goto('http://127.0.0.1:5173/tools/mobs/rocketbox/export.html')
  await p.waitForFunction(() => window.exportPerson, null, { timeout: 60000 })
  const info = {}
  for (const name of process.argv.slice(2)) {
    const r = await p.evaluate((n) => window.exportPerson(n), name)
    fs.writeFileSync(path.join(out, `${name}.glb`), Buffer.from(r.b64, 'base64'))
    info[name] = { tris: Math.round(r.tris), size: r.size.map((v) => +v.toFixed(1)) }
    console.log(name, (r.b64.length * 0.75 / 1e6).toFixed(2), 'MB', JSON.stringify(info[name]))
  }
  await b.close()
})()
