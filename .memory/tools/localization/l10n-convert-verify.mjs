#!/usr/bin/env node
// l10n-convert-verify.mjs <tree> <base-rev>
//
// Checks a tree converted by l10n-convert.mjs against the same files at <base-rev> (git, in <tree>'s repo). For every
// changed source file outside src/i18n/:
//  1. Texts: the base file's convertible t() calls and the converted file's ui().<topic>.<key> reads are paired in
//     source order. For each pair and language, the catalog entry's source (src/i18n/<topic>.<lang>.ts), with its
//     parameters replaced by the call's arguments (inner ui() reads put back to their base t() calls), must be the base
//     t() argument exactly, as code (both printed by @babel/generator; String(x) counts as `${x}`). So a text that keeps
//     its shape in the catalog (`${clockwise ? '右' : '左'}回り`) is checked as code, not as one sample value. And
//     ui() must serve the entry: present in ja and in fill(ja, en), a function exactly when the call passes arguments,
//     and a plain text equal to the base literal.
//  2. Nothing else changed: putting each base t() call back in place of its ui() read, and removing the import
//     declarations from both, must give the base file exactly (after undoing the known local renames).
// Executes nothing from the tree except its catalogs (src/i18n/ja.ts, en.ts and what they import), bundled by the tree's
// own esbuild. Exit 0 = every pair equal and every file otherwise unchanged; 1 = a difference; 2 = tool error.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const stamp = () => new Date().toISOString()
const log = (m) => console.error(`[${stamp()}] l10n-convert-verify: ${m}`)
const die = (m) => { console.error(`[${stamp()}] l10n-convert-verify: ERROR ${m}`); process.exit(2) }
process.on('uncaughtException', (e) => die(e.stack ?? String(e)))
const [treeArg, BASE] = process.argv.slice(2)
if (!treeArg || !BASE) die('usage: l10n-convert-verify.mjs <tree> <base-rev>')
const TREE = resolve(treeArg), SRC = join(TREE, 'src'), I18N = join(SRC, 'i18n')
const GIT = process.env.L10N_GIT ?? 'git'  // git on PATH, or $L10N_GIT
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'].includes(k)))
const git = (...a) => execFileSync(GIT, ['-C', TREE, ...a], { encoding: 'utf8', env: ENV, maxBuffer: 1 << 28 })
const req = createRequire(join(TREE, 'package.json'))
const { parse } = req(req.resolve('@babel/parser'))
const traverse = req(req.resolve('@babel/traverse')).default
const esbuild = req(req.resolve('esbuild'))
const genMod = req(req.resolve('@babel/generator')), generate = genMod.default ?? genMod
const { VISITOR_KEYS } = req(req.resolve('@babel/types'))
const { parseExpression } = req(req.resolve('@babel/parser'))
const RENAMES = { 'src/components/eva/EvaView.tsx': { jobUi: 'ui' } } // the converter's UI_RENAMES, inverted

// ---------------------------------------------------------------- the catalogs, as ui() serves them
const dir = mkdtempSync(join(tmpdir(), 'l10n-verify-'))
const entry = join(dir, 'entry.ts')
writeFileSync(entry, `import { ja } from '${join(I18N, 'ja')}'\nimport { en } from '${join(I18N, 'en')}'\nimport { fill } from '${join(I18N, 'translation')}'\nexport const CAT = { ja, en: fill(ja, en) }\n`)
esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'cat.mjs'), logLevel: 'error' })
const { CAT } = await import(pathToFileURL(join(dir, 'cat.mjs')).href)
rmSync(dir, { recursive: true })

// ---------------------------------------------------------------- files
const changed = git('diff', '--name-only', BASE, '--', 'src').split('\n').filter((p) => p && /\.tsx?$/.test(p) && !p.startsWith('src/i18n/'))
const added = git('ls-files', '--others', '--exclude-standard', '--', 'src').split('\n').filter((p) => p && !p.startsWith('src/i18n/'))
if (added.length) die(`new files outside src/i18n/: ${added.join(', ')}`)
const baseTopics = new Set(Object.keys(parse(git('show', `${BASE}:src/i18n/ja.ts`), { sourceType: 'module', plugins: ['typescript'] }).program.body
  .find((st) => st.type === 'ExportNamedDeclaration' && st.declaration?.declarations?.[0]?.id.name === 'ja').declaration.declarations[0].init.properties
  .reduce((o, pr) => ({ ...o, [pr.key.name ?? pr.key.value]: 1 }), {})))
const newTopics = new Set(Object.keys(CAT.ja).filter((k) => !baseTopics.has(k)))
log(`${changed.length} changed files; ${newTopics.size} new topics in the catalogs`)

const norm = (s) => s.replace(/\s+/g, ' ').trim()
const P = (code) => parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
const LANG = join(I18N, 'lang')

// base: convertible t() calls in source order
const baseCalls = (file, code, ast) => {
  const out = []
  traverse(ast, { ImportDeclaration(p) {
    const s = p.node.source.value
    if (!s.startsWith('.') || resolve(dirname(join(TREE, file)), s) !== LANG) return
    for (const sp of p.node.specifiers) if (sp.type === 'ImportSpecifier' && sp.imported.name === 't')
      for (const r of p.scope.getBinding(sp.local.name).referencePaths) {
        const c = r.parentPath.node, a = c.arguments
        const ok = (n) => n.type === 'StringLiteral' || n.type === 'TemplateLiteral'
        const str = (n) => n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'String' && n.arguments.length === 1
        if (a.length === 2 && ok(a[0]) && (ok(a[1]) || str(a[1]))) out.push(c)
      }
  } })
  return out.sort((x, y) => x.start - y.start)
}
// converted: ui().<newTopic>.<key>[(...)] reads in source order (outermost node)
const convReads = (code, ast) => {
  const out = []
  traverse(ast, { CallExpression(p) {
    const n = p.node
    if (n.callee.type !== 'Identifier' || n.callee.name !== 'ui' || n.arguments.length) return
    const m1 = p.parentPath, m2 = m1.parentPath
    if (!m1.isMemberExpression() || m1.node.object !== n || m1.node.computed || !m2.isMemberExpression() || m2.node.object !== m1.node || m2.node.computed) return
    const topic = m1.node.property.name, key = m2.node.property.name
    if (!newTopics.has(topic)) return
    const call = m2.parentPath.isCallExpression() && m2.parentPath.node.callee === m2.node ? m2.parentPath.node : null
    out.push({ node: call ?? m2.node, topic, key, args: call ? call.arguments : null })
  } })
  return out.sort((x, y) => x.node.start - y.node.start)
}

// the catalogs' source: topic → lang → key → value node
const catSrc = new Map()
const catalogEntry = (topic, lang, key) => {
  const id = `${topic}.${lang}`
  if (!catSrc.has(id)) {
    const f = join(I18N, `${topic}.${lang}.ts`)
    if (!existsSync(f)) die(`no ${f}`)
    const name = topic + (lang === 'ja' ? 'Ja' : 'En')
    const decl = P(readFileSync(f, 'utf8')).program.body.find((st) => st.type === 'ExportNamedDeclaration' && st.declaration?.declarations?.[0]?.id.name === name)
    const obj = decl?.declaration.declarations[0].init
    if (obj?.type !== 'ObjectExpression') die(`${f}: no export const ${name} = { … }`)
    catSrc.set(id, new Map(obj.properties.map((pr) => [pr.key.name ?? pr.key.value, pr.value])))
  }
  return catSrc.get(id).get(key)
}
// an entry with its parameters replaced by the call's arguments (a text without parameters is itself)
const clone = (n) => JSON.parse(JSON.stringify(n))
const substitute = (entry, args, at) => {
  if (entry.type !== 'ArrowFunctionExpression') { if (args.length) die(`${at}: called with arguments but the entry is not a function`); return clone(entry) }
  const names = entry.params.map((pp) => (pp.type === 'Identifier' ? pp.name : die(`${at}: parameter of type ${pp.type}`)))
  const put = (n) => {
    if (!n || typeof n.type !== 'string') return n
    if (n.type === 'Identifier' && names.includes(n.name)) return clone(args[names.indexOf(n.name)])
    for (const k of VISITOR_KEYS[n.type] ?? die(`no visitor keys for ${n.type}`)) {
      if (k === 'property' && n.type === 'MemberExpression' && !n.computed) continue
      const v = n[k]
      n[k] = Array.isArray(v) ? v.map(put) : put(v)
    }
    return n
  }
  return put(clone(entry.body))
}
// code as @babel/generator prints it, without the source's own quotes, parentheses and comments; String(x) as `${x}`
const strip = (n) => { if (Array.isArray(n)) n.forEach(strip); else if (n && typeof n === 'object') { delete n.extra; delete n.leadingComments; delete n.trailingComments; delete n.innerComments; for (const k in n) strip(n[k]) } }
const code = (n) => {
  let x = clone(n)
  if (x.type === 'CallExpression' && x.callee.type === 'Identifier' && x.callee.name === 'String' && x.arguments.length === 1)
    x = { type: 'TemplateLiteral', quasis: [{ type: 'TemplateElement', value: { raw: '', cooked: '' }, tail: false }, { type: 'TemplateElement', value: { raw: '', cooked: '' }, tail: true }], expressions: [x.arguments[0]] }
  strip(x)
  return generate(x, { comments: false, jsescOption: { minimal: true } }).code
}

let pairs = 0
const diffs = []
for (const file of changed) {
  const bcode = git('show', `${BASE}:${file}`), ccode = readFileSync(join(TREE, file), 'utf8')
  const bast = P(bcode), cast = P(ccode)
  const bc = baseCalls(file, bcode, bast), cr = convReads(ccode, cast)
  if (bc.length !== cr.length) { diffs.push(`${file}: ${bc.length} t() calls in the base, ${cr.length} ui() reads converted`); continue }
  const ren = RENAMES[file] ?? {}
  // { ui: jobUi } (a renamed shorthand) goes back to { ui }, then every other jobUi to ui
  const unren = (s) => Object.entries(ren).reduce((x, [from, to]) => x.replace(new RegExp(`\\b${to}: ${from}\\b`, 'g'), to).replace(new RegExp(`\\b${from}\\b`, 'g'), to), s)
  // an argument's source with inner ui() reads put back to their base t() calls and the renames undone
  const backSrc = (node) => {
    const inner = cr.map((x, i) => ({ x, i })).filter(({ x }) => x.node !== node && x.node.start >= node.start && x.node.end <= node.end)
    const outer = inner.filter(({ x }) => !inner.some(({ x: m }) => m !== x && m.node.start <= x.node.start && m.node.end >= x.node.end)).sort((p, q) => q.x.node.start - p.x.node.start)
    let s = ccode.slice(node.start, node.end)
    for (const { x, i } of outer) s = s.slice(0, x.node.start - node.start) + bcode.slice(bc[i].start, bc[i].end) + s.slice(x.node.end - node.start)
    return unren(s)
  }
  bc.forEach((c, i) => {
    const r = cr[i]
    const args = (r.args ?? []).map((a) => parseExpression(backSrc(a), { plugins: ['typescript', 'jsx'] }))
    for (const [li, lang] of [[0, 'ja'], [1, 'en']]) {
      const at = `${file}:${c.loc.start.line} ${lang}: ui().${r.topic}.${r.key}`
      const v = CAT[lang][r.topic]?.[r.key]
      if (v === undefined) { diffs.push(`${at} is not served by ui()`); continue }
      if ((typeof v === 'function') !== !!r.args) { diffs.push(`${at}: ${typeof v} in the catalog, ${r.args ? 'called' : 'read'} at the site`); continue }
      const base = c.arguments[li]
      if (typeof v === 'string' && v !== (base.type === 'StringLiteral' ? base.value : base.type === 'TemplateLiteral' && !base.expressions.length ? base.quasis[0].value.cooked : '\u0000')) diffs.push(`${at}: ui() serves ${JSON.stringify(v)}`)
      const entry = catalogEntry(r.topic, lang, r.key)
      if (!entry) { diffs.push(`${at}: no entry in ${r.topic}.${lang}.ts`); continue }
      if ((entry.type === 'ArrowFunctionExpression' ? entry.params.length : 0) !== args.length) { diffs.push(`${at}: the entry takes ${entry.params?.length ?? 0} parameters, the call passes ${args.length}`); continue }
      const got = code(substitute(entry, args, at)), want = code(base)
      if (got !== want) diffs.push(`${at}\n    base: ${want}\n    conv: ${got}`)
      pairs++
    }
  })
  // nothing else changed: put the base calls back, drop imports, undo renames
  const outerC = cr.map((r, i) => ({ r, i })).filter(({ r }) => !cr.some((o) => o !== r && o.node.start <= r.node.start && o.node.end >= r.node.end)).sort((a, b) => b.r.node.start - a.r.node.start)
  let back = ccode
  for (const { r, i } of outerC) back = back.slice(0, r.node.start) + bcode.slice(bc[i].start, bc[i].end) + back.slice(r.node.end)
  const noImports = (code) => { const ast = P(code); let s = code; for (const st of ast.program.body.filter((x) => x.type === 'ImportDeclaration').sort((a, b) => b.start - a.start)) s = s.slice(0, st.start) + s.slice(st.end); return s.replace(/^\s*\n/gm, '') }
  const a = noImports(bcode), b = unren(noImports(back))
  if (a !== b) {
    const al = a.split('\n'), bl = b.split('\n'); let k = 0
    while (k < al.length && al[k] === bl[k]) k++
    diffs.push(`${file}: other changes than the text reads and imports, first at body line ${k + 1}:\n    base: ${al[k]}\n    conv: ${bl[k]}`)
  }
}
for (const d of diffs) console.log(`DIFF\t${d}`)
log(`${pairs} text pairs checked (Japanese + English) in ${changed.length} files; ${diffs.length} differences`)
process.exit(diffs.length ? 1 : 0)
