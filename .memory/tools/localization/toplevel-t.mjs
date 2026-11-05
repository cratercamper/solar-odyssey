// find t()/named()/ui() calls evaluated at module load (not inside any function)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createRequire } from 'node:module'
const root = process.argv[2]
const require = createRequire(join(root, '..', 'package.json'))
const { parse } = require('@babel/parser')
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(tsx?)$/.test(n) ? [p] : [] })
for (const f of walk(root)) {
  const ast = parse(readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: true })
  const visit = (n, inFn) => {
    if (!n || typeof n !== 'object' || !n.type) return
    const fn = /Function|ArrowFunction|ObjectMethod|ClassMethod/.test(n.type)
    if (!inFn && n.type === 'CallExpression' && ['t', 'named', 'ui', 'missionText', 'chapterText', 'getLang'].includes(n.callee?.name)) console.log(`${relative(root, f)}:${n.loc.start.line}\t${n.callee.name}()`)
    for (const k in n) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach((c) => visit(c, inFn || fn)); else if (v && typeof v === 'object' && v.type) visit(v, inFn || fn) }
  }
  visit(ast.program, false)
}
