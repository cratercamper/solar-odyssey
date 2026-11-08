#!/usr/bin/env node
// l10n-leftovers.mjs — the last step of the conversion (after l10n-convert, l10n-move, l10n-records): lists every
// place outside src/i18n/ where code still holds or picks both languages, and stops when that list differs from the
// allowlist (data/leftovers.json). So a new two-language table in upstream main cannot pass a regeneration
// silently: it shows up as NEW until it gets a records.json row, or is allowed here on purpose. The allowlist is the
// tree after step D, the work done by hand after the scripted steps (in pull request #107, merged into main as 7cb4dda).
//
// Usage: l10n-leftovers.mjs <tree> --allow <leftovers.json>          check (exit 0 = same as allowed, 1 = differs)
//        l10n-leftovers.mjs <tree> --allow <leftovers.json> --write  rewrite the allowlist from the tree (look at the
//                                                                    diff before committing it)
// Kinds (src/**/*.ts(x) without src/i18n/):
//   t()        a call of t imported from i18n/lang          named()   a call of named imported from i18n/lang
//   xEn        an object with x and xEn                     {ja,en}   an object with keys ja and en
//   en:{}      an object with an en: { … } part beside other keys (a record holding its English inside)
//   [ja,en]    a two-element array of texts, the first Japanese, the second without Japanese
//   twinDecl   a declaration X_JA / XJa whose twin X_EN / XEn is declared in the same file
//   langPick   a condition comparing lang or getLang() with 'en' / 'ja'
// Not covered: one literal holding both languages ('粘土鉱物 Clay'), texts built from other texts with no language
// marker. The allowlist counts per file and kind, exactly: one more or one less is a difference (lines are listed so
// a person can see which).
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const stamp = () => new Date().toISOString()
const log = (m) => console.error(`[${stamp()}] l10n-leftovers: ${m}`)
const die = (m) => { console.error(`[${stamp()}] l10n-leftovers: ERROR ${m}`); process.exit(2) }
process.on('uncaughtException', (e) => die(e.stack ?? String(e)))
const argv = process.argv.slice(2)
const ai = argv.indexOf('--allow')
const WRITE = argv.includes('--write')
const pos = argv.filter((a, i) => !a.startsWith('-') && (ai < 0 || i !== ai + 1))
if (pos.length !== 1 || (ai >= 0 && !argv[ai + 1])) die('usage: l10n-leftovers.mjs <tree> [--allow <leftovers.json>, default data/leftovers.json here] [--write]')
const TREE = resolve(pos[0]), SRC = join(TREE, 'src'), I18N = join(SRC, 'i18n'), ALLOW = ai >= 0 ? resolve(argv[ai + 1]) : join(dirname(fileURLToPath(import.meta.url)), 'data/leftovers.json')
const req = createRequire(join(TREE, 'package.json'))
const { parse } = req(req.resolve('@babel/parser'))
const rel = (abs) => relative(TREE, abs)
const JA = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

const walk = (d) => readdirSync(d).sort().flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (p === I18N ? [] : walk(p)) : /\.tsx?$/.test(n) ? [p] : [] })
const SKIP = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'range'])
function* nodes(n) {
  if (!n || typeof n !== 'object') return
  if (Array.isArray(n)) { for (const x of n) yield* nodes(x); return }
  if (typeof n.type === 'string') yield n
  for (const k of Object.keys(n)) if (!SKIP.has(k)) yield* nodes(n[k])
}
const keyName = (k) => (k.type === 'Identifier' ? k.name : k.type === 'StringLiteral' ? k.value : null)
const text = (n) => (n?.type === 'StringLiteral' ? n.value : n?.type === 'TemplateLiteral' ? n.quasis.map((q) => q.value.cooked).join('…') : null)
const isLang = (n) => (n.type === 'Identifier' && n.name === 'lang') || (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'getLang')
const isCode = (n) => n.type === 'StringLiteral' && (n.value === 'en' || n.value === 'ja')

const found = [] // { file, kind, line, what }
for (const f of walk(SRC)) {
  const ast = parse(readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['typescript', ...(f.endsWith('.tsx') ? ['jsx'] : [])] })
  const add = (kind, n, what) => found.push({ file: rel(f), kind, line: n.loc.start.line, what })
  // t / named imported from i18n/lang (local names, in case of `as`)
  const fromLang = new Map()
  for (const st of ast.program.body) if (st.type === 'ImportDeclaration' && /(^|\/)i18n\/lang$/.test(st.source.value))
    for (const sp of st.specifiers) if (sp.type === 'ImportSpecifier' && ['t', 'named'].includes(sp.imported.name)) fromLang.set(sp.local.name, sp.imported.name)
  const decls = new Map()
  for (const n of nodes(ast.program)) {
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && fromLang.has(n.callee.name)) add(`${fromLang.get(n.callee.name)}()`, n, '')
    else if (n.type === 'ObjectExpression') {
      const props = n.properties.filter((p) => p.type === 'ObjectProperty' && !p.computed)
      const names = new Map(props.map((p) => [keyName(p.key), p]))
      for (const [k, p] of names) if (k && k.endsWith('En') && k.length > 2 && names.has(k.slice(0, -2)) && text(p.value) !== null) add('xEn', p, k.slice(0, -2))
      if (names.has('ja') && names.has('en')) add('{ja,en}', n, '')
      else if (names.has('en') && names.get('en').value.type === 'ObjectExpression' && names.size > 1) add('en:{}', names.get('en'), '')
    } else if (n.type === 'ArrayExpression' && n.elements.length === 2) {
      const [a, b] = n.elements.map(text)
      if (a !== null && b !== null && JA.test(a) && !JA.test(b)) add('[ja,en]', n, a.slice(0, 24))
    } else if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') decls.set(n.id.name, n)
    else if (n.type === 'ConditionalExpression' && n.test.type === 'BinaryExpression' && ['===', '!=='].includes(n.test.operator) &&
      ((isLang(n.test.left) && isCode(n.test.right)) || (isLang(n.test.right) && isCode(n.test.left)))) add('langPick', n, '')
  }
  for (const [name, d] of decls) {
    const m = name.match(/^(.+?)(_JA|Ja)$/)
    if (m && (decls.has(m[1] + (m[2] === '_JA' ? '_EN' : 'En')))) add('twinDecl', d, `${name} / ${m[1]}${m[2] === '_JA' ? '_EN' : 'En'}`)
  }
}

const count = (list) => { const c = {}; for (const x of list) { c[x.file] ??= {}; c[x.file][x.kind] = (c[x.file][x.kind] ?? 0) + 1 }; return c }
const now = count(found)
const total = found.length
if (WRITE) {
  const sorted = Object.fromEntries(Object.keys(now).sort().map((f) => [f, Object.fromEntries(Object.keys(now[f]).sort().map((k) => [k, now[f][k]]))]))
  writeFileSync(ALLOW, JSON.stringify({ _: 'Places outside src/i18n/ that still hold or pick both languages, counted per file and kind by .memory/tools/localization/l10n-leftovers.mjs; step D (the work done by hand after the scripted steps, in pull request #107, merged into main as 7cb4dda) removed the rest. Left on purpose (2026-11-04, 8 places): data/facts.ts factsFor (upstream\'s whole-entry fallback to Japanese), state/quiz.ts (a question keeps both languages, so a switch in the middle of a quiz keeps working), ui/NavPanel.tsx (the language buttons). Rewritten with --write; look at the diff.', allow: sorted }, null, 1) + '\n')
  log(`allowlist written: ${total} places in ${Object.keys(now).length} files → ${ALLOW}`)
  process.exit(0)
}
const allow = JSON.parse(readFileSync(ALLOW, 'utf8')).allow
const diffs = []
for (const file of new Set([...Object.keys(now), ...Object.keys(allow)])) for (const kind of new Set([...Object.keys(now[file] ?? {}), ...Object.keys(allow[file] ?? {})])) {
  const n = now[file]?.[kind] ?? 0, a = allow[file]?.[kind] ?? 0
  if (n !== a) diffs.push({ file, kind, n, a })
}
for (const d of diffs) {
  console.log(`${d.n > d.a ? 'NEW' : 'GONE'}\t${d.file}\t${d.kind}\tfound ${d.n}, allowed ${d.a}`)
  for (const x of found.filter((x) => x.file === d.file && x.kind === d.kind)) console.log(`\t  ${x.file}:${x.line}${x.what ? `  ${x.what}` : ''}`)
}
log(`${total} places in ${Object.keys(now).length} files; ${diffs.length ? `${diffs.length} differ from the allowlist (NEW: add a records.json row or allow it; GONE: rewrite the allowlist)` : 'same as the allowlist'}`)
process.exit(diffs.length ? 1 : 0)
