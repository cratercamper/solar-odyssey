#!/usr/bin/env node
// l10n-convert.mjs <tree> [--write] [--keys <keys.json>] [--manifest <out.json>]   (--keys default: data/keys.json here)
//
// The conversion commit of the localization branch. The branch carries the design first and the big conversion last,
// by script, so the conversion can be re-run on each newer upstream main until upstream takes the branch (PR #100).
// Moves every inline t('日本語', 'English') call whose two texts are written at the call site into
// per-screen catalogs src/i18n/<topic>.ja.ts + <topic>.en.ts, read as ui().<topic>.<key>.
//
// Stage A only (this file): string and template pairs. t() calls that read data records (t(b.name, b.nameEn),
// t(...PAIR)) are left alone and listed; they move with the records (stage C).
//
// - topic = the source file's base name in camelCase (ui/NavPanel.tsx → navPanel); when two files would share one,
//   the one under data/ or state/ gets its directory as a prefix (data/telescopes.ts → dataTelescopes).
// - key = from the keys table (identity: topic + Japanese + English source text), else a name made from the English
//   text, added to the table and reported as NEW. The table is the stored ja-text → key list, so a
//   re-run on a newer upstream keeps every key it already had.
// - A text with ${…} becomes a function; each distinct expression is one parameter, its type read from tsc (pass 1
//   writes `never`, tsc names each argument's real type in TS2345; pass 2 writes those types and must compile).
//   `String(x)` on one side counts as `${x}` (QuizPanel).
// - The literal source text is copied as written (quotes, escapes), so the catalogs hold upstream's exact texts.
// - Fails loud: a file that defines its own `ui`, a t() reference that is not a call, a tsc error left after pass 2,
//   a key table entry whose topic+text no longer exists is only reported (kept for re-use), never deleted.
//
// Without --write: prints the plan, writes nothing. With --write: rewrites <tree>/src and runs the two tsc passes.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve, dirname, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const stamp = () => new Date().toISOString()
const log = (m) => console.error(`[${stamp()}] l10n-convert: ${m}`)
const die = (m) => { console.error(`[${stamp()}] l10n-convert: ERROR ${m}`); process.exit(2) }
process.on('uncaughtException', (e) => die(e.stack ?? String(e)))

const argv = process.argv.slice(2)
const opt = (name) => { const i = argv.indexOf(name); if (i < 0) return null; const v = argv[i + 1]; if (!v || v.startsWith('-')) die(`${name} needs a value`); return v }
const WRITE = argv.includes('--write')
const KEYS = opt('--keys') ?? join(dirname(fileURLToPath(import.meta.url)), 'data/keys.json') // default: the stored table beside this script
const MANIFEST = opt('--manifest')
const valued = new Set([argv.indexOf('--keys') + 1, argv.indexOf('--manifest') + 1].filter((i) => i > 0))
const pos = argv.filter((a, i) => !a.startsWith('-') && !valued.has(i))
if (pos.length !== 1 || argv.some((a) => a.startsWith('-') && !['--write', '--keys', '--manifest'].includes(a))) die('usage: l10n-convert.mjs <tree> [--write] [--keys <keys.json>] [--manifest <out.json>]')
const TREE = resolve(pos[0])
const SRC = join(TREE, 'src')
const I18N = join(SRC, 'i18n')
for (const need of ['src/i18n/lang.ts', 'src/i18n/index.ts', 'src/i18n/ja.ts', 'src/i18n/en.ts', 'src/i18n/translation.ts', 'package.json'])
  if (!existsSync(join(TREE, need))) die(`not a tree with the src/i18n/ mechanism (no ${need}): ${TREE}`)
const req = createRequire(join(TREE, 'package.json'))
const { parse } = req(req.resolve('@babel/parser'))
const traverse = req(req.resolve('@babel/traverse')).default
const { VISITOR_KEYS } = req(req.resolve('@babel/types'))
const TSC = join(TREE, 'node_modules/typescript/bin/tsc') // run with this node (the .bin wrapper needs node on PATH)
if (WRITE && !existsSync(TSC)) die(`no ${TSC}`)

const walk = (d) => readdirSync(d).sort().flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const rel = (abs) => relative(TREE, abs)
const LANG = join(I18N, 'lang')
// NavPanel → navPanel, SFBadge → sfBadge, HUD → hud
const camel = (s) => s.replace(/^[A-Z]+(?=[A-Z][a-z]|$)|^[A-Z]/, (m) => m.toLowerCase())

// ---------------------------------------------------------------- keys table
const table = KEYS && existsSync(KEYS) ? JSON.parse(readFileSync(KEYS, 'utf8')) : { entries: [] }
if (!Array.isArray(table.entries)) die(`${KEYS}: no "entries" array`)
const idOf = (topic, ja, en) => `${topic}\u0000${ja}\u0000${en}`
const known = new Map(table.entries.map((e) => [idOf(e.topic, e.ja, e.en), e]))
const usedIds = new Set()

// ---------------------------------------------------------------- parse
const files = walk(SRC).filter((f) => /\.tsx?$/.test(f) && !f.startsWith(I18N + '/') && !f.endsWith('.d.ts'))
const parsed = files.map((abs) => {
  const code = readFileSync(abs, 'utf8')
  return { abs, code, ast: parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: false }) }
})

// topic per file (only files that call t())
const topicBase = (abs) => camel(basename(abs).replace(/\.tsx?$/, ''))

// ---------------------------------------------------------------- collect t() calls
const sideOf = (f, n) => { // → { kind: 'S', raw } | { kind: 'T', node } | null
  if (n.type === 'StringLiteral') return { kind: 'S', raw: f.code.slice(n.start, n.end), value: n.value }
  if (n.type === 'TemplateLiteral') return n.expressions.length ? { kind: 'T', node: n } : { kind: 'S', raw: f.code.slice(n.start, n.end), value: n.quasis[0].value.cooked }
  if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'String' && n.arguments.length === 1 && n.arguments[0].type !== 'SpreadElement')
    return { kind: 'X', node: n.arguments[0] } // String(x) ≡ `${x}`
  return null
}
const calls = [] // { f, node, ja, en }
const leftAlone = []
const tImports = new Map() // f → { decl path, spec, local }
for (const f of parsed) {
  traverse(f.ast, {
    ImportDeclaration(p) {
      const src = p.node.source.value
      if (!src.startsWith('.') || resolve(dirname(f.abs), src) !== LANG) return
      for (const s of p.node.specifiers) if (s.type === 'ImportSpecifier' && s.imported.name === 't') {
        const b = p.scope.getBinding(s.local.name)
        tImports.set(f, { path: p, spec: s, local: s.local.name, refs: b.referencePaths.length })
        for (const r of b.referencePaths) {
          const c = r.parentPath
          if (!(c.isCallExpression() && c.node.callee === r.node)) die(`${rel(f.abs)}:${r.node.loc.start.line}: t is used other than as a call (${c.node.type})`)
          const a = c.node.arguments
          const ja = a.length === 2 ? sideOf(f, a[0]) : null, en = a.length === 2 ? sideOf(f, a[1]) : null
          if (ja && en && ja.kind !== 'X') calls.push({ f, node: c.node, path: c, ja, en })
          else leftAlone.push(`${rel(f.abs)}:${c.node.loc.start.line}  ${f.code.slice(c.node.start, c.node.end).replace(/\s+/g, ' ').slice(0, 110)}`)
        }
      }
    },
  })
}
const callFiles = [...new Set(calls.map((c) => c.f))]
const topicOf = new Map()
{
  const byBase = new Map()
  for (const f of callFiles) { const b = topicBase(f.abs); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(f) }
  // ui()'s own top-level keys: a topic may not take one (state/launch.ts vs ja.ts launch)
  const jaAst = parse(readFileSync(join(I18N, 'ja.ts'), 'utf8'), { sourceType: 'module', plugins: ['typescript'] })
  const jaObj = jaAst.program.body.find((st) => st.type === 'ExportNamedDeclaration' && st.declaration?.declarations?.[0]?.id.name === 'ja')?.declaration.declarations[0].init
  if (jaObj?.type !== 'ObjectExpression') die('ja.ts: no `export const ja = { … }`')
  const uiKeys = new Set(jaObj.properties.map((pr) => pr.key?.name ?? pr.key?.value).filter(Boolean))
  const existingTopics = new Set(uiKeys)
  for (const [b, fs] of byBase) {
    for (const f of fs) {
      const top = rel(f.abs).split('/')[1]
      const t = (fs.length > 1 && ['data', 'state'].includes(top)) || uiKeys.has(b) ? top + b.charAt(0).toUpperCase() + b.slice(1) : b
      if (existingTopics.has(t)) die(`topic ${t} (${rel(f.abs)}) collides with an existing topic or ui() key`)
      existingTopics.add(t)
      topicOf.set(f, t)
    }
  }
  if (new Set(topicOf.values()).size !== topicOf.size) die(`two files still share a topic: ${[...topicOf].map(([f, t]) => `${t}=${rel(f.abs)}`).join(' ')}`)
}

// ---------------------------------------------------------------- render a node's source with nested replacements applied
// replacements: Map node → string (inner t() calls rewritten first, innermost first)
const repl = new Map()
const render = (f, node) => {
  const inner = [...repl.entries()].filter(([n]) => n !== node && n.start >= node.start && n.end <= node.end && n.__file === f)
  // keep only outermost of the inner replacements
  const outer = inner.filter(([n]) => !inner.some(([m]) => m !== n && m.start <= n.start && m.end >= n.end))
  outer.sort((x, y) => y[0].start - x[0].start)
  let s = f.code.slice(node.start, node.end)
  for (const [n, txt] of outer) s = s.slice(0, n.start - node.start) + txt + s.slice(n.end - node.start)
  return s
}

// ---------------------------------------------------------------- params
const RESERVED = new Set('break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await'.split(' '))
const paramBase = (n) => {
  if (n.type === 'Identifier') return n.name
  if (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier') return n.property.name
  if (n.type === 'CallExpression') {
    // Math.round(x), Number(x): the value is the argument; x.toFixed(1): the value is x
    const ns = n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && /^[A-Z]/.test(n.callee.object.name)
    if (ns && n.arguments.length && n.arguments[0].type !== 'SpreadElement') return paramBase(n.arguments[0])
    if (n.callee.type === 'MemberExpression') return paramBase(n.callee.object)
    if (n.arguments.length === 1 && n.arguments[0].type !== 'SpreadElement') return paramBase(n.arguments[0])
  }
  if (n.type === 'TSNonNullExpression' || n.type === 'TSAsExpression') return paramBase(n.expression)
  if (n.type === 'LogicalExpression' || n.type === 'BinaryExpression') return paramBase(n.left)
  if (n.type === 'ParenthesizedExpression') return paramBase(n.expression)
  return null
}
const norm = (s) => s.replace(/\s+/g, ' ').trim()

// A side becomes catalog source: a list of pieces, { s: source } or { p: param }. Inside ${…}, an expression with no
// text in it is one parameter (its value is computed at the call site, as before). An expression that holds text (a
// string that is not empty, e.g. `${k < 0.5 ? '満ちて' : '欠けて'}`) keeps its shape in the catalog, so the words
// move too; only its text-free parts (`k < 0.5`) become parameters. Shapes kept: ?:, &&, ||, ??, +, templates,
// literals, a word list indexed by a value, a method called with a word; any other shape around text stops the conversion (convert that call by hand).
const buildEntry = (c) => {
  const params = [] // { expr (rendered source), id, node, name }
  const paramFor = (node) => {
    const raw = render(c.f, node), id = norm(raw)
    let p = params.find((x) => x.id === id)
    if (!p) { p = { expr: raw, id, node, name: null }; params.push(p) }
    return p
  }
  const hasText = (n) => {
    if (repl.has(n)) return false // an inner t() call, already a ui() read
    if (n.type === 'StringLiteral') return n.value !== '' // a word, or a separator such as ', ' or '」「'
    if (n.type === 'TemplateLiteral') return n.quasis.some((q) => q.value.cooked !== '') || n.expressions.some(hasText)
    let found = false
    for (const k of VISITOR_KEYS[n.type] ?? die(`no visitor keys for ${n.type}`)) {
      const v = n[k]
      for (const ch of Array.isArray(v) ? v : [v]) if (ch && typeof ch.type === 'string' && !/^TS/.test(ch.type) && hasText(ch)) found = true
    }
    return found
  }
  const paren = (n, pieces) => (n.extra?.parenthesized ? [{ s: '(' }, ...pieces, { s: ')' }] : pieces)
  const where = (n) => `${rel(c.f.abs)}:${n.loc.start.line}`
  const expr = (n) => { // pieces for an expression inside ${…}
    if (!hasText(n)) return [{ p: paramFor(n) }]
    if (n.type === 'StringLiteral') return [{ s: c.f.code.slice(n.start, n.end) }]
    if (n.type === 'TemplateLiteral') return paren(n, tmpl(n))
    if (n.type === 'ConditionalExpression') return paren(n, [...sub(n.test), { s: ' ? ' }, ...sub(n.consequent), { s: ' : ' }, ...sub(n.alternate)])
    if (n.type === 'LogicalExpression' || (n.type === 'BinaryExpression' && n.operator === '+')) return paren(n, [...sub(n.left), { s: ` ${n.operator} ` }, ...sub(n.right)])
    // ['1st', '2nd', '3rd'][place - 1]: a list of words picked by a value
    if (n.type === 'MemberExpression' && n.computed && n.object.type === 'ArrayExpression') {
      const ix = n.property, off = ix.type === 'BinaryExpression' && ['+', '-'].includes(ix.operator) && ix.right.type === 'NumericLiteral' // [place - 1]: the value is place
      return paren(n, [...sub(n.object), { s: '[' }, ...(off ? [...expr(ix.left), { s: ` ${ix.operator} ${c.f.code.slice(ix.right.start, ix.right.end)}` }] : sub(ix)), { s: ']' }])
    }
    // spots.join('」「'): a method called with a word (a separator); the object becomes the parameter
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.arguments.every((x) => x.type !== 'SpreadElement'))
      return paren(n, [...sub(n.callee.object), { s: '.' + n.callee.property.name + '(' }, ...n.arguments.flatMap((x, i) => [...(i ? [{ s: ', ' }] : []), ...sub(x)]), { s: ')' }])
    if (n.type === 'ArrayExpression' && n.elements.every((x) => x && x.type !== 'SpreadElement')) return paren(n, [{ s: '[' }, ...n.elements.flatMap((x, i) => [...(i ? [{ s: ', ' }] : []), ...sub(x)]), { s: ']' }])
    die(`${where(n)}: text inside a ${n.type} in a template; convert this call by hand`)
  }
  // a child of a kept shape: text-free literals stay as written, other text-free parts become parameters
  const sub = (n) => (!hasText(n) && (n.type === 'StringLiteral' || (n.type === 'TemplateLiteral' && !n.expressions.length)) ? [{ s: c.f.code.slice(n.start, n.end) }] : expr(n))
  const tmpl = (t) => {
    const out = [{ s: '`' }]
    t.quasis.forEach((q, i) => { out.push({ s: q.value.raw }); if (i < t.expressions.length) out.push({ s: '${' }, ...expr(t.expressions[i]), { s: '}' }) })
    out.push({ s: '`' })
    return out
  }
  const side = (sd) => (sd.kind === 'S' ? [{ s: sd.raw }] : sd.kind === 'X' ? [{ s: '`${' }, { p: paramFor(sd.node) }, { s: '}`' }] : tmpl(sd.node))
  const ja = side(c.ja), en = side(c.en)
  // names: the value's own name; a condition is cond; v1.. when there is none
  const used = new Set()
  params.forEach((p, i) => {
    const n = p.node
    const isCond = (n.type === 'BinaryExpression' && ['<', '>', '<=', '>=', '===', '!==', '==', '!='].includes(n.operator)) || (n.type === 'UnaryExpression' && n.operator === '!')
    let b = isCond ? 'cond' : paramBase(n)
    if (!b || RESERVED.has(b) || b === 'ui') b = `v${i + 1}`
    let nm = b, k = 2
    while (used.has(nm)) nm = `${b}${k++}`
    used.add(nm); p.name = nm
  })
  const text = (pieces) => pieces.map((x) => x.s ?? x.p.name).join('')
  const uses = (pieces) => new Set(pieces.filter((x) => x.p).map((x) => x.p))
  const ju = uses(ja), eu = uses(en)
  return { params, ja, en, jaText: text(ja), enText: text(en), jaUses: params.map((p) => ju.has(p)), enUses: params.map((p) => eu.has(p)) }
}

// A local variable named ui in a scope that holds a converted call would shadow the ui() import. Each known case is
// renamed (name chosen by hand, after its type); an unknown one stops the conversion.
const UI_RENAMES = { 'src/components/eva/EvaView.tsx': 'jobUi' } // const ui = useEvaJobs((j) => j.ui): a JobUi
const renamed = new Set()
for (const c of calls) {
  const b = c.path.scope.getBinding('ui')
  if (!b || b.kind === 'module' || renamed.has(b)) continue
  const to = UI_RENAMES[rel(c.f.abs)]
  if (!to) die(`${rel(c.f.abs)}:${c.node.loc.start.line}: a local 'ui' (line ${b.identifier.loc.start.line}) shadows the ui() import here; add a name for it to UI_RENAMES`)
  if (c.path.scope.hasBinding(to)) die(`${rel(c.f.abs)}: cannot rename ui to ${to}, the name is taken`)
  renamed.add(b)
  const put = (node, text) => { node.__file = c.f; repl.set(node, text) }
  const bp = (() => { let found = null; traverse(c.f.ast, { ObjectProperty(q) { if (q.node.value === b.identifier && q.node.shorthand && q.parentPath.isObjectPattern()) { found = q.node; q.stop() } } }); return found })()
  if (bp) put(bp, `ui: ${to}`) // ({ ui }) => …  becomes  ({ ui: jobUi }) => …
  else put(b.identifier, to)
  for (const r of b.referencePaths) {
    const pp = r.parentPath
    if (pp.isObjectProperty() && pp.node.shorthand) put(pp.node, `ui: ${to}`)
    else put(r.node, to)
  }
  if (b.constantViolations.length) die(`${rel(c.f.abs)}: the local ui is reassigned; rename by hand`)
}
log(`renamed ${renamed.size} local 'ui' variable(s) that would shadow the import`)

// innermost calls first, so outer templates see rewritten inner calls
calls.sort((a, b) => (a.node.end - a.node.start) - (b.node.end - b.node.start))
const entriesByTopic = new Map() // topic → [{ key, jaText, enText, params, sites: [] }]
const newKeys = []
const keyName = (en, topic, taken) => {
  const words = en.replace(/\$\{[^}]*\}/g, ' ').replace(/[’']/g, '').replace(/^`|`$|^'|'$|^"|"$/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean)
  const skip = new Set(['the', 'a', 'an'])
  const w = words.filter((x, i) => !(i === 0 && skip.has(x.toLowerCase()))).slice(0, 4)
  const word = (x, i) => { const y = x.length > 1 && x === x.toUpperCase() ? x.toLowerCase() : x; return i === 0 ? y.charAt(0).toLowerCase() + y.slice(1) : y.charAt(0).toUpperCase() + y.slice(1) }
  let base = w.map(word).join('')
  if (!base) base = 'text'
  if (/^[0-9]/.test(base)) base = 'n' + base
  let n = base, k = 2
  while (taken.has(n)) n = `${base}${k++}`
  return n
}
// Pass 1 builds the entries; a call's key is a placeholder until pass 2 (an outer call's arguments hold inner calls).
const KEY = (i) => `\u0001${i}\u0001`
const allEnts = []
for (const c of calls) {
  const topic = topicOf.get(c.f)
  const e = buildEntry(c)
  if (!entriesByTopic.has(topic)) entriesByTopic.set(topic, [])
  const list = entriesByTopic.get(topic)
  let ent = list.find((x) => x.jaText === e.jaText && x.enText === e.enText && x.params.map((p) => p.name).join() === e.params.map((p) => p.name).join())
  if (!ent) {
    ent = { topic, key: null, n: allEnts.length, jaText: e.jaText, enText: e.enText, params: e.params.map((p, i) => ({ name: p.name, auto: p.name, types: new Set(), ja: e.jaUses[i], en: e.enUses[i] })), names: null, sites: [], firstAt: c.node.start }
    // the catalog text, with the parameter names chosen in the keys table (the identity above keeps the automatic ones)
    ent.out = (lang) => e[lang].map((x) => x.s ?? ent.params[e.params.indexOf(x.p)].name).join('')
    list.push(ent); allEnts.push(ent)
  }
  const args = e.params.map((p) => p.expr)
  c.node.__file = c.f
  repl.set(c.node, ent.params.length ? `ui().${topic}.${KEY(ent.n)}(${args.join(', ')})` : `ui().${topic}.${KEY(ent.n)}`)
  ent.sites.push({ file: rel(c.f.abs), line: c.node.loc.start.line, args })
}
// Pass 2, keys: (1) the table's key for the same topic + Japanese + English; (2) a text changed on one side only (an
// upstream fix of the Japanese or of the English) keeps its key, when exactly one unused table entry of the topic has the
// other side unchanged; (3) a new key from the English words. Table keys not used here stay reserved.
const inherited = new Set()
const keptKeys = []
for (const ent of allEnts) {
  const k = known.get(idOf(ent.topic, ent.jaText, ent.enText))
  if (k) { ent.key = k.key; ent.names = k.params ?? null; usedIds.add(idOf(ent.topic, ent.jaText, ent.enText)) }
}
const unusedOf = (topic) => table.entries.filter((x) => x.topic === topic && !usedIds.has(idOf(x.topic, x.ja, x.en)) && !inherited.has(x))
for (const ent of allEnts.filter((x) => !x.key)) {
  const cand = unusedOf(ent.topic).filter((x) => x.ja === ent.jaText || x.en === ent.enText)
  if (cand.length === 1 && !allEnts.some((o) => o !== ent && !o.key && o.topic === ent.topic && (o.jaText === cand[0].ja || o.enText === cand[0].en))) {
    ent.key = cand[0].key; inherited.add(cand[0]); keptKeys.push({ topic: ent.topic, key: ent.key, was: cand[0], ja: ent.jaText, en: ent.enText })
    if (cand[0].params) ent.names = Object.fromEntries(Object.entries(cand[0].params).filter(([a]) => ent.params.some((p) => p.auto === a)))
  }
}
for (const ent of allEnts.filter((x) => !x.key)) {
  const list = entriesByTopic.get(ent.topic)
  ent.key = keyName(ent.enText, ent.topic, new Set([...list.map((x) => x.key).filter(Boolean), ...table.entries.filter((x) => x.topic === ent.topic).map((x) => x.key)]))
  newKeys.push({ topic: ent.topic, key: ent.key, ja: ent.jaText, en: ent.enText })
}
for (const list of entriesByTopic.values()) {
  const seen = new Set()
  for (const x of list) { if (seen.has(x.key)) die(`keys table: ${x.topic}.${x.key} is given to two texts`); seen.add(x.key) }
}
// parameter names from the keys table: { automatic name: chosen name }
for (const ent of allEnts) if (ent.names) {
  for (const [a, to] of Object.entries(ent.names)) {
    const p = ent.params.find((x) => x.auto === a)
    if (!p) die(`keys table: ${ent.topic}.${ent.key} has no parameter ${a} to name ${to}`)
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(to) || RESERVED.has(to) || to === 'ui') die(`keys table: ${ent.topic}.${ent.key}: ${to} is not a usable parameter name`)
    p.name = to
  }
  if (new Set(ent.params.map((x) => x.name)).size !== ent.params.length) die(`keys table: ${ent.topic}.${ent.key}: two parameters get the same name`)
}
const unkey = (s) => s.replace(/\u0001(\d+)\u0001/g, (_, i) => allEnts[+i].key)
for (const [n, txt] of repl) if (txt.includes('\u0001')) repl.set(n, unkey(txt))
for (const ent of allEnts) for (const st of ent.sites) st.args = st.args.map(unkey)
const stale = table.entries.filter((e) => !usedIds.has(idOf(e.topic, e.ja, e.en)) && !inherited.has(e))

// ---------------------------------------------------------------- report
const nTexts = [...entriesByTopic.values()].reduce((s, l) => s + l.length, 0)
log(`${calls.length} t() calls with texts at the call site → ${nTexts} catalog entries in ${entriesByTopic.size} topics; ${leftAlone.length} t() calls read data and stay (stage C); keys: ${nTexts - newKeys.length - keptKeys.length} from the table, ${keptKeys.length} kept for a changed text, ${newKeys.length} NEW; table entries no longer in the tree: ${stale.length}`)
for (const l of leftAlone) console.log(`STAYS\t${l}`)
for (const k of keptKeys) console.log(`KEY-KEPT\t${k.topic}.${k.key}\ttext changed: ${(k.was.ja === k.ja ? k.en : k.ja).slice(0, 80)}`)
for (const k of newKeys) console.log(`NEW-KEY\t${k.topic}.${k.key}\t${k.en.slice(0, 80)}`)
for (const s of stale) console.log(`STALE-KEY\t${s.topic}.${s.key}\t${s.en.slice(0, 80)}`)
if (!WRITE) { log('dry run: nothing written (--write to convert)'); process.exit(0) }

// ---------------------------------------------------------------- write sources
const relImport = (fromAbs, toNoExt) => { let r = relative(dirname(fromAbs), toNoExt); if (!r.startsWith('.')) r = './' + r; return r }
const changed = new Map()
for (const f of callFiles) {
  // ui must not be taken in this file by anything other than an i18n import
  let uiImported = false
  traverse(f.ast, {
    Program(p) {
      const b = p.scope.getBinding('ui')
      if (b) {
        const ok = b.kind === 'module' && b.path.parentPath.isImportDeclaration() && resolve(dirname(f.abs), b.path.parentPath.node.source.value) === I18N
        if (!ok) die(`${rel(f.abs)}: defines its own 'ui' (${b.kind}); cannot add ui() calls there`)
        uiImported = true
      }
    },
  })
  const mine = [...repl.entries()].filter(([n]) => n.__file === f)
  const edits = mine.filter(([n]) => !mine.some(([m]) => m !== n && m.start <= n.start && m.end >= n.end)).map(([n, txt]) => ({ start: n.start, end: n.end, text: txt }))
  const body = f.ast.program.body
  const imports = body.filter((st) => st.type === 'ImportDeclaration')
  const ti = tImports.get(f)
  const imp = ti.path.node
  const specText = (sp) => f.code.slice(sp.start, sp.end)
  const named = (decl) => decl.specifiers.every((sp) => sp.type === 'ImportSpecifier')
  const convertedHere = calls.filter((c) => c.f === f).length
  const i18nImp = imports.find((st) => st.source.value.startsWith('.') && resolve(dirname(f.abs), st.source.value) === I18N)
  const declText = (decl, specs) => `import ${decl.importKind === 'type' ? 'type ' : ''}{ ${specs.join(', ')} } from '${decl.source.value}'`
  // the lang import: drop t when every reference was converted
  if (convertedHere === ti.refs) {
    if (!named(imp)) die(`${rel(f.abs)}: its lang import is not a plain named import`)
    const specs = imp.specifiers.filter((sp) => sp !== ti.spec).map(specText)
    const end = f.code[imp.end] === '\n' ? imp.end + 1 : imp.end
    if (specs.length) edits.push({ start: imp.start, end: imp.end, text: declText(imp, specs) })
    else if (!uiImported && !i18nImp) { edits.push({ start: imp.start, end: imp.end, text: `import { ui } from '${relImport(f.abs, I18N)}'` }); uiImported = true } // the lang line becomes the ui line
    else edits.push({ start: imp.start, end, text: '' })
  }
  if (!uiImported) {
    if (i18nImp && named(i18nImp) && i18nImp.importKind !== 'type') edits.push({ start: i18nImp.start, end: i18nImp.end, text: declText(i18nImp, [...i18nImp.specifiers.map(specText), 'ui']) })
    else {
      if (!imports.length) die(`${rel(f.abs)}: no import declaration to add ui after`)
      const last = imports[imports.length - 1]
      edits.push({ start: last.end, end: last.end, text: `\nimport { ui } from '${relImport(f.abs, I18N)}'` })
    }
  }
  edits.sort((x, y) => y.start - x.start || y.end - x.end)
  for (let i = 1; i < edits.length; i++) if (edits[i].end > edits[i - 1].start && !(edits[i].start === edits[i].end && edits[i].start === edits[i - 1].start)) die(`${rel(f.abs)}: overlapping edits at ${edits[i].start}`)
  let code = f.code
  for (const e of edits) code = code.slice(0, e.start) + e.text + code.slice(e.end)
  changed.set(f.abs, code)
}

// ---------------------------------------------------------------- named types in parameter types
// tsc names a parameter's type as written in the tree (LagrangePoint, Body[] …); the catalog imports each such name
// from its one exported declaration under src/ (type alias, interface, enum or class).
const exportedTypes = new Map() // name → [abs]
for (const f of parsed) for (const st of f.ast.program.body) {
  if (st.type !== 'ExportNamedDeclaration' || !st.declaration) continue
  const d = st.declaration
  if (['TSTypeAliasDeclaration', 'TSInterfaceDeclaration', 'TSEnumDeclaration', 'ClassDeclaration'].includes(d.type) && d.id) {
    if (!exportedTypes.has(d.id.name)) exportedTypes.set(d.id.name, [])
    exportedTypes.get(d.id.name).push(f.abs)
  }
}
const BUILTIN_TYPES = new Set(['Array', 'ReadonlyArray', 'Record', 'Partial', 'Readonly', 'Date', 'Map', 'Set', 'Promise', 'String', 'Number', 'Boolean', 'Element', 'HTMLElement', 'JSX', 'React'])
const typeImports = (types) => { // → [{ name, from }]
  const names = new Set()
  for (const t of types) {
    if (/import\(/.test(t)) die(`tsc gave a parameter type with import(): ${t}`)
    for (const m of t.replace(/"(?:[^"\\]|\\.)*"/g, '').matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)) if (!BUILTIN_TYPES.has(m[0])) names.add(m[0])
  }
  return [...names].sort().map((n) => {
    const at = exportedTypes.get(n) ?? []
    if (at.length !== 1) die(`parameter type ${n}: ${at.length} exported declarations under src/ (${at.map(rel).join(', ')}); cannot import it`)
    return { name: n, from: at[0] }
  })
}

// ---------------------------------------------------------------- catalogs
const catalogFile = (topic, lang) => join(I18N, `${topic}.${lang}.ts`)
const srcOfTopic = new Map([...topicOf].map(([f, t]) => [t, rel(f.abs).replace(/^src\//, '')]))
const writeCatalogs = (typed) => {
  for (const [topic, list] of entriesByTopic) {
    list.sort((a, b) => a.firstAt - b.firstAt)
    const val = (e, text, lang) => {
      if (!e.params.length) return text
      const ps = e.params.map((p) => `${p[lang] ? '' : '_'}${p.name}: ${typed ? [...p.types].join(' | ') || 'never' : 'never'}`).join(', ')
      return `(${ps}) => ${text}`
    }
    const tys = typed ? typeImports(list.flatMap((e) => e.params.flatMap((p) => [...p.types]))) : []
    const byFrom = new Map()
    for (const t of tys) { if (!byFrom.has(t.from)) byFrom.set(t.from, []); byFrom.get(t.from).push(t.name) }
    const tyLines = [...byFrom].map(([from, ns]) => `import type { ${ns.join(', ')} } from '${relImport(catalogFile(topic, 'ja'), from.replace(/\.tsx?$/, ''))}'\n`).join('')
    const ja = `${tyLines}${tyLines ? '\n' : ''}// ${srcOfTopic.get(topic)} の文言（日本語）\n\nexport const ${topic}Ja = {\n${list.map((e) => `  ${e.key}: ${val(e, e.out('ja'), 'ja')},`).join('\n')}\n}\n`
    const en = `${tyLines}import type { ${topic}Ja } from './${topic}.ja'\nimport type { Translation } from './translation'\n\n// The texts of ${srcOfTopic.get(topic)} (English). Same keys as ${topic}.ja.ts\n\nexport const ${topic}En: Translation<typeof ${topic}Ja> = {\n${list.map((e) => `  ${e.key}: ${val(e, e.out('en'), 'en')},`).join('\n')}\n}\n`
    writeFileSync(catalogFile(topic, 'ja'), ja)
    writeFileSync(catalogFile(topic, 'en'), en)
  }
}
// register the topics in ja.ts / en.ts: imports after the last import (or at the top), entries at the end of the object
const JA_HEAD_UPSTREAM = '// 画面の短い文言（日本語）。いまはストーリーモードのぶんだけ。ほかの画面も少しずつここへ移す\n'
const register = () => {
  const topics = [...entriesByTopic.keys()].sort()
  for (const lang of ['ja', 'en']) {
    const p = join(I18N, `${lang}.ts`)
    let s = readFileSync(p, 'utf8')
    const suffix = lang === 'ja' ? 'Ja' : 'En'
    const imports = topics.map((t) => `import { ${t}${suffix} } from './${t}.${lang}'\n`).join('')
    const ast = parse(s, { sourceType: 'module', plugins: ['typescript'] })
    const lastImp = ast.program.body.filter((st) => st.type === 'ImportDeclaration').pop()
    if (lastImp) { const at = s.indexOf('\n', lastImp.end) + 1; s = s.slice(0, at) + imports + s.slice(at) }
    else s = imports + '\n' + s
    if (lang === 'ja') {
      // upstream's line 1 said the other screens would move here bit by bit; now they are here
      if (s.split(JA_HEAD_UPSTREAM).length !== 2) die(`ja.ts: its header comment is not upstream's '${JA_HEAD_UPSTREAM.trim()}'; write the new one by hand`)
      const head = '// 画面の文言（日本語）。ストーリーモードの短い文言はここに書く。ほかの画面の文言は画面ごとのファイル（navPanel.ja.ts など）にあり、ここに集める\n' +
        (leftAlone.length ? "// まだ使う場所に t('日本語', 'English') と書いてある文言もある\n" : '')
      s = s.replace(JA_HEAD_UPSTREAM, head)
    }
    if (!/,\n}\n$/.test(s)) die(`${lang}.ts does not end with '…,\\n}\\n' (the end of its dictionary)`)
    s = s.slice(0, -2) + topics.map((t) => `  ${t}: ${t}${suffix},\n`).join('') + '}\n'
    writeFileSync(p, s)
  }
}
for (const [abs, code] of changed) writeFileSync(abs, code)
writeCatalogs(false)
register()
log(`wrote ${changed.size} source files, ${entriesByTopic.size * 2} catalog files; tsc pass 1 (parameter types)`)

// ---------------------------------------------------------------- tsc as the type oracle
const tsc = () => {
  try { execFileSync(process.execPath, [TSC, '--noEmit', '-p', join(TREE, 'tsconfig.json')], { cwd: TREE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }); return '' } catch (e) {
    const out = (e.stdout ?? '') + (e.stderr ?? '')
    if (!/error TS\d+/.test(out)) die(`tsc did not run (exit ${e.status}): ${out.slice(0, 400) || e.message}`) // a failed tsc is not a list of type errors
    return out
  }
}
const out1 = tsc()
// map each site's argument positions in the new source: find the call text in the new file
const lineCol = (code, idx) => { const pre = code.slice(0, idx); const line = pre.split('\n').length; return { line, col: idx - pre.lastIndexOf('\n') } }
const argPos = new Map() // `${file}:${line}:${col}` → { ent, i }
for (const [topic, list] of entriesByTopic) for (const ent of list) if (ent.params.length) for (const site of ent.sites) {
  const code = changed.get(join(TREE, site.file))
  const head = `ui().${topic}.${ent.key}(`
  let from = 0, hit = false
  while ((from = code.indexOf(head + site.args.join(', ') + ')', from)) >= 0) {
    let at = from + head.length
    site.args.forEach((a, i) => { const { line, col } = lineCol(code, at); argPos.set(`${site.file}:${line}:${col}`, { ent, i }); at += a.length + 2 })
    hit = true; from += head.length
  }
  if (!hit) die(`${site.file}: cannot find the rewritten call ${head}…`)
}
const widen = (t) => /^"(?:[^"\\]|\\.)*"( \| "(?:[^"\\]|\\.)*")*$/.test(t) ? 'string' : /^-?[0-9.e]+( \| -?[0-9.e]+)*$/.test(t) ? 'number' : t === 'true' || t === 'false' ? 'boolean' : t
// tsc reports only the first bad argument of a call, so repeat: each pass types what it can, until none is `never`
const untyped = () => [...entriesByTopic.values()].flat().flatMap((e) => e.params.filter((p) => !p.types.size).map((p) => `${e.key}(${p.name})`))
let out = out1
for (let pass = 1; ; pass++) {
  let typed = 0
  const other = []
  for (const line of out.split('\n')) {
    const m = /^(.+?)\((\d+),(\d+)\): error TS2345: Argument of type '(.*)' is not assignable to parameter of type 'never'\.$/.exec(line)
    // spots.join('」「') in a catalog: the method is missing on `never` until spots is typed (the final tsc is clean or fails)
    const onNever = /^src\/i18n\/[^(]+\(\d+,\d+\): error TS2339: Property '\w+' does not exist on type 'never'\.$/.test(line)
    if (!m) { if (/error TS/.test(line) && !onNever) other.push(line); continue }
    const hit = argPos.get(`${m[1]}:${m[2]}:${m[3]}`)
    if (!hit) die(`tsc names an argument the conversion did not write: ${line}`)
    const p = hit.ent.params[hit.i]
    if (!p.pending) p.pending = new Set()
    p.pending.add(widen(m[4])); typed++
  }
  if (other.length) die(`tsc pass ${pass}: errors other than the parameter types:\n${other.join('\n')}`)
  for (const e of [...entriesByTopic.values()].flat()) for (const p of e.params) if (p.pending) { for (const t of p.pending) p.types.add(t); p.pending = null }
  const left = untyped()
  log(`tsc pass ${pass}: ${typed} argument types read, ${left.length} parameters still untyped`)
  writeCatalogs(true)
  out = tsc()
  if (!left.length) break
  if (!typed) die(`tsc names no more argument types, but these are untyped: ${left.join(' ')}`)
  if (pass > 12) die('more than 12 tsc passes')
}
if (out.trim()) die(`tsc after typing is not clean:\n${out}`)
log('tsc: clean')

// ---------------------------------------------------------------- keys table + manifest
if (KEYS) {
  const entries = []
  for (const [topic, list] of entriesByTopic) for (const e of list) entries.push({ topic, key: e.key, ja: e.jaText, en: e.enText, ...(e.names && Object.keys(e.names).length ? { params: e.names } : {}) })
  for (const s of stale) entries.push(s) // kept: a later upstream may bring the text back
  entries.sort((a, b) => (a.topic + '\u0000' + a.key).localeCompare(b.topic + '\u0000' + b.key))
  writeFileSync(KEYS, JSON.stringify({ about: 'l10n-convert keys: topic + Japanese + English source text (parameters by their automatic names) → key, and optional params { automatic name: chosen name }. Edit a key or a name here and re-run to rename it.', entries }, null, 1) + '\n')
  log(`keys table: ${entries.length} entries → ${KEYS}`)
}
if (MANIFEST) {
  const m = []
  for (const [topic, list] of entriesByTopic) for (const e of list) m.push({ topic, key: e.key, ja: e.jaText, en: e.enText, params: e.params.map((p) => ({ name: p.name, types: [...p.types] })), sites: e.sites })
  writeFileSync(MANIFEST, JSON.stringify(m, null, 1) + '\n')
  log(`manifest: ${m.length} entries → ${MANIFEST}`)
}
