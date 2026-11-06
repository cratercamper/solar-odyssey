// l10n-check.mjs <tree> — every Japanese string in a checkout of the game that has no English twin.
// Run through ./l10n-check (checks for Node, picks the default tree). Static analysis only: parses <tree>/src with the tree's own
// @babel/parser + @babel/traverse; executes nothing from the tree.
//
// Output (stdout): one line per gap  KIND<TAB>file:line<TAB>context<TAB>text, then a summary block.
//   NO-EN      Japanese literal with no English twin by any mechanism
//   FOREIGN    text shown in a language that holds a character foreign to that language: an English slot (t() 2nd arg,
//              fooEn, X_EN table, English branch, en.ts …) with a character foreign to English, or any player-visible
//              literal with a character that no language allows (Cyrillic, say). The context names the language and
//              the characters. Formerly EN-HAS-JA (Japanese in English), then EN-FOREIGN.
//   PARITY     Japanese literal in a paired structure (ja.ts↔en.ts, missions, X↔X_EN, foo()↔fooEn(), en:{…})
//              whose English twin is missing at that exact key path
//   FALLBACK   an `EN_TABLE[id]… ?? …` / `|| …` read whose table lacks an id/field the Japanese table has
//              (shows Japanese with no error)
//   NO-EN-SYM, FOREIGN-SYM   the same, but no foreign character is a *letter* (kana, kanji, another
//              script's letters): only punctuation and symbols such as ・ ℃ 〜 ？ ： U+3000. Listed after the word gaps; they
//              set the exit code only with --strict, because the gaps that matter are Japanese words.
// "No foreign", not only "no Japanese in English": LANG_SCRIPTS below lists
//   the Unicode scripts each language's text may use; a character outside its language's list is foreign there.
// --lang <code>: check only the language you run (a key of LANG_SCRIPTS); NO-EN, PARITY, FALLBACK belong to 'en'.
// Exit: 0 no word gaps · 1 word gaps (NO-EN, FOREIGN, PARITY, FALLBACK) · 2 tool error (missing tree, parse error,
//   unresolvable import, ambiguous twin). --strict: the -SYM gaps count for the exit code too.
// Log lines on stderr carry an ISO timestamp.
import { readFileSync, readdirSync, statSync, existsSync, realpathSync } from 'node:fs'
import { join, relative, dirname, resolve, extname } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const stamp = () => new Date().toISOString()
const log = (m) => console.error(`[${stamp()}] l10n-check: ${m}`)
const die = (m) => { console.error(`[${stamp()}] l10n-check: ERROR ${m}`); process.exit(2) }
process.on('uncaughtException', (e) => die(e.stack ?? String(e)))

const argv = process.argv.slice(2)
const ALL = argv.includes('--all') // also print every explained literal:  OK<TAB>file:line<TAB>category<TAB>text
const STRICT = argv.includes('--strict') // symbol-only gaps (-SYM) count for the exit code too
const FLAGS = ['--all', '--strict']
const langAt = argv.indexOf('--lang') // --lang <code>: only the language being run; else every language in LANG_SCRIPTS
const LANG_ARG = langAt >= 0 ? argv[langAt + 1] : null
if (langAt >= 0 && (!LANG_ARG || LANG_ARG.startsWith('-'))) die('--lang needs a language code (a key of LANG_SCRIPTS)')
const rest = argv.filter((a, i) => i !== langAt && i !== langAt + 1 || langAt < 0)
const treeArg = rest.filter((a) => !FLAGS.includes(a))[0]
if (!treeArg || rest.some((a) => a.startsWith('-') && !FLAGS.includes(a))) die('usage: l10n-check.mjs [--all] [--strict] [--lang <code>] <tree>   (a checkout of the game: <tree>/src, <tree>/node_modules)')
const TREE = resolve(treeArg)
if (!existsSync(TREE) || !statSync(TREE).isDirectory()) die(`tree not found: ${TREE}`)
for (const need of ['src', 'package.json', 'index.html']) if (!existsSync(join(TREE, need))) die(`not a checkout of the game (no ${need}): ${TREE}`)
const req = createRequire(join(TREE, 'package.json'))
const loadDep = (name) => {
  const p = (() => { try { return req.resolve(name) } catch (e) { die(`${name} not found from ${TREE}/node_modules (${e.code}); run npm ci --ignore-scripts there, or symlink node_modules`) } })()
  return req(p)
}
const { parse } = loadDep('@babel/parser')
const traverse = loadDep('@babel/traverse').default

// Japanese-class characters: kana, CJK ideographs, CJK symbols/punctuation (、。「」〜・, U+3000 space …), full-width and
// half-width forms (！？：＋ ｱ), ℃, ※. A literal containing any of them is "Japanese" here.
const JA = /[\u3000-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF01-\uFF9F\uFFE0-\uFFEE\u2103\u203B]/
// "No foreign": the Unicode scripts each language's text may use. Common (digits, ASCII punctuation, ° × − → ★ …) and
// Inherited (combining marks) are allowed in every language, except the East Asian typography that Unicode also files
// under Common: CJK punctuation and spaces, ・ ー, Kanbun, CJK strokes, enclosed and squared CJK, vertical and
// compatibility forms, full-width and half-width forms, ℃, ※ (EAST_ASIAN_COMMON). Only a language with eastAsian: true
// may use those. Measured on upstream d5d8a48 (2026-11-04): outside Japanese, every non-ASCII character in a
// literal is Common except μ (Greek, Sun.tsx) — hence Greek in both. A new language is one more line here; which
// literals are its text is a separate question (today: the ja/en mechanisms below).
const LANG_SCRIPTS = {
  ja: { scripts: ['Han', 'Hiragana', 'Katakana', 'Latin', 'Greek'], eastAsian: true },
  en: { scripts: ['Latin', 'Greek'], eastAsian: false },
}
const EAST_ASIAN_COMMON = '\\u2E80-\\u2FFF\\u3000-\\u31FF\\u3200-\\u33FF\\uFE10-\\uFE1F\\uFE30-\\uFE4F\\uFF00-\\uFFEF\\u2103\\u203B'
const allowedRe = (lang) => {
  const c = LANG_SCRIPTS[lang], scr = [...c.scripts, 'Common', 'Inherited'].map((x) => `\\p{Script=${x}}`).join('')
  return c.eastAsian ? new RegExp(`[${scr}]`, 'v') : new RegExp(`[[${scr}]--[${EAST_ASIAN_COMMON}]]`, 'v')
}
const ALLOWED = Object.fromEntries(Object.keys(LANG_SCRIPTS).map((l) => [l, allowedRe(l)]))
/** the distinct characters of s that language `lang` does not allow */
const foreignIn = (lang, s) => [...new Set([...s].filter((ch) => !ALLOWED[lang].test(ch)))]
/** the distinct characters of s that no language allows */
const foreignEverywhere = (s) => foreignIn(Object.keys(LANG_SCRIPTS)[0], s).filter((ch) => Object.keys(LANG_SCRIPTS).every((l) => !ALLOWED[l].test(ch)))
const isLetter = (ch) => /[\p{L}\p{Nl}]/u.test(ch)
const fmtChars = (chs) => chs.map((ch) => (/\s/.test(ch) ? `[U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}]` : ch)).join(' ')
if (LANG_ARG && !LANG_SCRIPTS[LANG_ARG]) die(`--lang ${LANG_ARG}: no such language in LANG_SCRIPTS (known: ${Object.keys(LANG_SCRIPTS).join(', ')})`)
const LANGS = LANG_ARG ? [LANG_ARG] : Object.keys(LANG_SCRIPTS) // the languages this run checks
// a gap whose foreign characters hold no letter is punctuation/symbols only, and gets the kind suffix -SYM (see the
// header). NO-EN: the characters foreign to English (the literal is shown in English mode); FOREIGN: the characters
// found foreign. Classifies the full text, not show()'s cut.
const SYM_KINDS = new Set(['NO-EN', 'FOREIGN'])
const kindFor = (kind, raw, chs) => (SYM_KINDS.has(kind) && !(chs ?? foreignIn('en', raw)).some(isLetter) ? `${kind}-SYM` : kind)
const CODE_EXT = /\.(tsx?|mts|cts|jsx?|mjs|cjs)$/

// ---------------------------------------------------------------- files
const SRC = join(TREE, 'src')
const walk = (d) => readdirSync(d).sort().flatMap((n) => {
  const p = join(d, n)
  return statSync(p).isDirectory() ? walk(p) : [p]
})
const allFiles = walk(SRC)
const codeFiles = allFiles.filter((f) => CODE_EXT.test(f))
const cssFiles = allFiles.filter((f) => f.endsWith('.css'))
// documentation (src/i18n/README.md): not shown to players, so not scanned, unless code imports it (then it is shown)
const docFiles = allFiles.filter((f) => f.endsWith('.md'))
const other = allFiles.filter((f) => !CODE_EXT.test(f) && !f.endsWith('.css') && !f.endsWith('.md'))
if (other.length) die(`unknown file types under src (teach l10n-check about them): ${other.map((f) => relative(TREE, f)).join(', ')}`)
if (docFiles.length) {
  const mdImport = /(?:from\s*|import\s*\(\s*|import\s+)['"][^'"]+\.md(?:\?[^'"]*)?['"]/
  const importer = codeFiles.find((f) => mdImport.test(readFileSync(f, 'utf8')))
  if (importer) die(`${relative(TREE, importer)} imports a .md file: its text is shown, teach l10n-check to scan it`)
}

const rel = (abs) => relative(TREE, abs)
const files = new Map() // abs → { abs, src, ast, prog (Program path), lits: [], foreign: [], logicals: [], topDecls: Map, exports: Map, imports: [] }
for (const abs of codeFiles) {
  const src = readFileSync(abs, 'utf8')
  const ext = extname(abs)
  const plugins = ext === '.tsx' ? ['jsx', 'typescript'] : /\.(ts|mts|cts)$/.test(ext) ? [['typescript', { dts: abs.endsWith('.d.ts') }]] : ['jsx']
  let ast
  try {
    ast = parse(src, { sourceType: 'module', plugins, errorRecovery: false })
  } catch (e) {
    die(`parse error in ${rel(abs)}: ${e.message}`)
  }
  files.set(abs, { abs, src, ast, prog: null, lits: [], foreign: [], logicals: [], topDecls: new Map(), exports: new Map(), imports: [], dynImports: [] })
}
log(`parsed ${files.size} code files, ${cssFiles.length} css files under ${rel(SRC) || 'src'}`)

// ---------------------------------------------------------------- helpers
const textOf = (n) => n.type === 'StringLiteral' ? n.value
  : n.type === 'TemplateLiteral' ? n.quasis.map((q) => q.value.cooked ?? q.value.raw).join('${}')
  : n.type === 'JSXText' ? n.value : ''
const collect = (n) => { // all literal text under a node
  if (!n || typeof n !== 'object') return ''
  if (n.type === 'StringLiteral' || n.type === 'TemplateLiteral' || n.type === 'JSXText') {
    let s = textOf(n)
    if (n.type === 'TemplateLiteral') for (const e of n.expressions) s += collect(e)
    return s
  }
  let s = ''
  for (const k in n) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra' || k.endsWith('Comments') || k === 'typeAnnotation' || k === 'returnType') continue
    const v = n[k]
    if (Array.isArray(v)) for (const c of v) s += collect(c)
    else if (v && typeof v === 'object' && v.type) s += collect(v)
  }
  return s
}
const hasJa = (n) => JA.test(collect(n))
// property key as a string; a computed key [ID] resolves when ID is a constant string (top level or import of f)
const propKey = (p, f = null) => {
  if (p.computed) {
    if (p.key.type === 'StringLiteral' || p.key.type === 'NumericLiteral') return String(p.key.value)
    const k = f && p.key.type === 'Identifier' ? deref(p.key, f).n : p.key
    if (k?.type === 'StringLiteral') return k.value
    if (k?.type === 'TemplateLiteral' && k.expressions.length === 0) return k.quasis[0].value.cooked
    return null
  }
  return p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' || p.key.type === 'NumericLiteral' ? String(p.key.value) : null
}
const TRANSPARENT = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ParenthesizedExpression', 'TSTypeAssertion'])
const unwrap = (n) => { while (n && TRANSPARENT.has(n.type)) n = n.expression; return n }
const isFn = (n) => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration|ObjectMethod)$/.test(n.type)
// line of the first Japanese character of a literal (multi-line templates / JSX text point at the right line)
const jaLine = (f, n) => {
  const s = f.src.slice(n.start, n.end), m = JA.exec(s)
  return n.loc.start.line + (m ? (s.slice(0, m.index).match(/\n/g)?.length ?? 0) : 0)
}
const isEnName = (N) => /_EN$/.test(N) || /[a-z0-9]En$/.test(N) || N === 'en'
const twinNamesOf = (N) => { // Japanese name → candidate English names
  if (N === 'ja') return ['en']
  if (/_JA$/.test(N)) return [N.replace(/_JA$/, '_EN')]
  if (/[a-z0-9]Ja$/.test(N)) return [N.replace(/Ja$/, 'En')]
  return [N + '_EN', N + 'En']
}
const jaNamesOf = (T) => { // English name → candidate Japanese names
  if (T === 'en') return ['ja']
  if (/_EN$/.test(T)) { const b = T.replace(/_EN$/, ''); return [b, b + '_JA'] }
  if (/[a-z0-9]En$/.test(T)) { const b = T.replace(/En$/, ''); return [b, b + 'Ja'] }
  return []
}

// ---------------------------------------------------------------- pass 1: per-file traversal
for (const f of files.values()) {
  traverse(f.ast, {
    Program(p) { f.prog = p },
    'StringLiteral|TemplateLiteral|JSXText'(p) {
      const s = textOf(p.node)
      if (JA.test(s)) f.lits.push(p)
      if (foreignEverywhere(s).length) f.foreign.push(p) // "no foreign": another script, checked after the Japanese pass
    },
    LogicalExpression(p) { if (p.node.operator === '??' || p.node.operator === '||') f.logicals.push(p) },
    ImportDeclaration(p) {
      const n = p.node
      if (n.importKind === 'type') return
      const specs = n.specifiers.filter((s) => s.importKind !== 'type').map((s) => ({
        local: s.local.name,
        imported: s.type === 'ImportDefaultSpecifier' ? 'default' : s.type === 'ImportNamespaceSpecifier' ? '*' : (s.imported.name ?? s.imported.value),
      }))
      f.imports.push({ source: n.source.value, specs, sideEffect: n.specifiers.length === 0, path: p })
    },
    CallExpression(p) {
      if (p.node.callee.type === 'Import') {
        const a = p.node.arguments[0]
        if (a?.type !== 'StringLiteral') die(`${rel(f.abs)}:${p.node.loc.start.line}: dynamic import() with a computed path`)
        f.dynImports.push({ source: a.value, path: p })
      }
    },
  })
  if (!f.prog) die(`no Program in ${rel(f.abs)}`)
  for (const st of f.ast.program.body) {
    const exported = st.type === 'ExportNamedDeclaration' || st.type === 'ExportDefaultDeclaration'
    const d = exported ? st.declaration : st
    if (d?.type === 'VariableDeclaration') {
      for (const v of d.declarations) if (v.id.type === 'Identifier') f.topDecls.set(v.id.name, { file: f, name: v.id.name, root: v.init, decl: v, exported })
    } else if (d?.type === 'FunctionDeclaration' && d.id) {
      f.topDecls.set(d.id.name, { file: f, name: d.id.name, root: d, decl: d, exported })
    }
    if (st.type === 'ExportNamedDeclaration') {
      if (d?.type === 'VariableDeclaration') for (const v of d.declarations) { if (v.id.type === 'Identifier') f.exports.set(v.id.name, { local: v.id.name }) }
      else if (d?.id) f.exports.set(d.id.name, { local: d.id.name })
      for (const s of st.specifiers ?? []) {
        const ex = s.exported.name ?? s.exported.value
        f.exports.set(ex, st.source ? { source: st.source.value, imported: s.local.name } : { local: s.local.name })
      }
    }
    if (st.type === 'ExportDefaultDeclaration') {
      if (d?.id) f.exports.set('default', { local: d.id.name })
      else if (d?.type === 'Identifier') f.exports.set('default', { local: d.name })
    }
    if (st.type === 'ExportAllDeclaration') (f.exportAll ??= []).push(st.source.value)
  }
}

// ---------------------------------------------------------------- module resolution
const resolveCache = new Map()
const resolveImport = (fromAbs, source, line) => { // → abs code file | 'asset' | null (package)
  if (!source.startsWith('.') && !source.startsWith('/')) return null
  const key = fromAbs + '\0' + source
  if (resolveCache.has(key)) return resolveCache.get(key)
  const [bare, query] = source.split('?')
  const base = source.startsWith('/') ? join(TREE, bare) : resolve(dirname(fromAbs), bare)
  let out
  if (query !== undefined) {
    if (existsSync(base) && !CODE_EXT.test(base) && !base.endsWith('.css')) {
      const buf = readFileSync(base, 'utf8')
      if (JA.test(buf)) die(`${rel(fromAbs)}:${line}: '${source}' imports a non-code file holding Japanese; l10n-check does not scan it`)
    }
    out = 'asset'
  } else if (existsSync(base) && statSync(base).isFile()) {
    out = CODE_EXT.test(base) ? base : 'asset'
  } else {
    const cands = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'].map((e) => base + e).concat(['index.ts', 'index.tsx', 'index.js'].map((i) => join(base, i)))
    out = cands.find((c) => existsSync(c))
    if (!out) die(`${rel(fromAbs)}:${line}: cannot resolve import '${source}'`)
  }
  if (out !== 'asset' && out !== null && !files.has(out)) {
    const real = realpathSync(out)
    if (!files.has(real)) die(`${rel(fromAbs)}:${line}: import '${source}' resolves outside src (${out})`)
    out = real
  }
  resolveCache.set(key, out)
  return out
}
// exported name → top-level declaration (follows re-exports)
const lookupExport = (f, name, depth = 0) => {
  if (depth > 20) die(`re-export loop at ${rel(f.abs)} ${name}`)
  const e = f.exports.get(name)
  if (e?.local) return f.topDecls.get(e.local) ?? lookupImported(f, e.local, depth + 1)
  if (e?.source) { const t = resolveImport(f.abs, e.source, 0); return t && t !== 'asset' ? lookupExport(files.get(t), e.imported, depth + 1) : null }
  for (const s of f.exportAll ?? []) { const t = resolveImport(f.abs, s, 0); const d = t && t !== 'asset' ? lookupExport(files.get(t), name, depth + 1) : null; if (d) return d }
  return null
}
const lookupImported = (f, local, depth = 0) => {
  for (const im of f.imports) for (const s of im.specs) if (s.local === local) {
    const t = resolveImport(f.abs, im.source, im.path.node.loc.start.line)
    if (!t || t === 'asset' || s.imported === '*') return null
    return lookupExport(files.get(t), s.imported, depth)
  }
  return null
}
const lookupTop = (f, name) => f.topDecls.get(name) ?? lookupImported(f, name)
const exportedByName = new Map() // name → [decl] of exported top-level declarations
for (const f of files.values()) for (const d of f.topDecls.values()) if (d.exported) {
  if (!exportedByName.has(d.name)) exportedByName.set(d.name, [])
  exportedByName.get(d.name).push(d)
}
// declaration of an identifier as seen from a babel path (local scope, then module, then imports)
const declOfBinding = (f, path, name) => {
  const b = path.scope.getBinding(name)
  if (!b) return null
  if (b.kind === 'module') return lookupImported(f, name)
  const bp = b.path
  if (bp.isVariableDeclarator()) return { file: f, name, root: bp.node.init, decl: bp.node, path: bp, exported: false, local: true }
  if (bp.isFunctionDeclaration()) return { file: f, name, root: bp.node, decl: bp.node, path: bp, exported: false, local: true }
  if (b.kind === 'param') return { file: f, name, param: true, path: bp, binding: b }
  return null
}

// twin declaration of a Japanese-side declaration
const twinCache = new Map()
const findTwin = (f, declPath, N, exported) => {
  const key = `${f.abs}\0${declPath.node.start}`
  if (twinCache.has(key)) return twinCache.get(key)
  let out = null
  // a top-level alias of the table names its twin too: `const texts = {…} satisfies …; export const bodiesJa: … = texts`,
  // also through a one-argument call that returns its argument, such as the marker `= byId(texts)`
  // (l10n-records' record catalogs, which keep their ids literal for the English type) → bodiesEn
  const named = (x) => x?.type === 'Identifier' && x.name === N
  const aliasOf = (r) => named(r) || (r?.type === 'CallExpression' && r.arguments.length === 1 && named(unwrap(r.arguments[0])))
  const aliases = [...f.topDecls.values()].filter((a) => a.name !== N && a.root && aliasOf(unwrap(a.root))).map((a) => a.name)
  for (const M of [N, ...aliases]) { if (out) break
  for (const T of twinNamesOf(M)) {
    let d = declOfBinding(f, declPath, T)
    if (d?.param) d = null
    if (!d && exported) {
      const g = (exportedByName.get(T) ?? [])
      const near = g.filter((x) => dirname(x.file.abs) === dirname(f.abs))
      const pick = g.length === 1 ? g : near
      if (pick.length > 1) die(`ambiguous English twin for ${N} (${rel(f.abs)}): ${pick.map((x) => `${x.name}@${rel(x.file.abs)}`).join(', ')}`)
      d = pick[0] ?? null
    }
    // a top-level declaration of X.ja.ts has its twin at the top level of X.ja.ts's sibling X.en.ts, exported or not
    if (!d && /\.ja\.tsx?$/.test(f.abs) && f.topDecls.get(N)?.decl === declPath.node) {
      d = files.get(f.abs.replace(/\.ja\.(tsx?)$/, '.en.$1'))?.topDecls.get(T) ?? null
    }
    if (d) { out = { ...d, jaName: M, jaFile: f }; break }
  }
  }
  twinCache.set(key, out)
  return out
}

// ---------------------------------------------------------------- key-path parity
const OPAQUE = { t: 'opaque' }
const COMPUTED_KEY = { t: 'opaque', why: 'computed key' }
const SKIP = { t: 'skip' }
const segOf = (parentPath, childPath, f) => {
  const P = parentPath.node, C = childPath.node, key = childPath.key
  switch (P.type) {
    case 'ObjectExpression':
      if (C.type === 'ObjectProperty' || C.type === 'ObjectMethod') { const k = propKey(C, f); return k === null ? COMPUTED_KEY : { t: 'prop', k } }
      return OPAQUE
    case 'ObjectProperty': return key === 'value' ? SKIP : OPAQUE
    case 'ArrayExpression': return P.elements.slice(0, key).some((e) => e?.type === 'SpreadElement') ? OPAQUE : { t: 'idx', i: key }
    case 'TSAsExpression': case 'TSSatisfiesExpression': case 'TSNonNullExpression': case 'ParenthesizedExpression': case 'TSTypeAssertion':
      return SKIP
    case 'ArrowFunctionExpression': case 'FunctionExpression': case 'FunctionDeclaration': case 'ObjectMethod':
      return key === 'body' ? { t: 'body' } : OPAQUE
    case 'BlockStatement':
      if (C.type === 'VariableDeclaration') return SKIP
      if (C.type === 'ReturnStatement') return { t: 'return', k: P.body.slice(0, key).filter((s) => s.type === 'ReturnStatement').length }
      return OPAQUE
    case 'VariableDeclaration': return C.id?.type === 'Identifier' ? { t: 'var', name: C.id.name } : OPAQUE
    case 'VariableDeclarator': return key === 'init' ? SKIP : OPAQUE
    case 'ReturnStatement': return SKIP
    default: return OPAQUE
  }
}
// segments from rootPath down to litPath, truncated at the first opaque step
const relPath = (rootPath, litPath, f) => {
  const chain = []
  for (let c = litPath; c !== rootPath; c = c.parentPath) {
    if (!c.parentPath) die('relPath: root is not an ancestor')
    chain.push([c.parentPath, c])
  }
  chain.reverse()
  const segs = []
  for (const [p, c] of chain) {
    const s = segOf(p, c, f)
    if (s === SKIP) continue
    if (s.t === 'opaque') { segs.stop = s.why; break }
    segs.push(s)
  }
  return segs
}
const segStr = (segs) => segs.map((s) => s.t === 'prop' ? `.${s.k}` : s.t === 'idx' ? `[${s.i}]` : s.t === 'var' ? ` ${s.name}=` : s.t === 'return' ? ` return#${s.k}` : s.t === 'body' ? '()' : '').join('')
// dereference an Identifier inside a twin structure (top-level declaration or import of that file)
const deref = (n, f) => {
  for (let i = 0; i < 10 && n?.type === 'Identifier'; i++) {
    const d = lookupTop(f, n.name)
    if (!d || !d.root) return { n, f }
    n = unwrap(d.root); f = d.file
  }
  return { n, f }
}
// keys of a computed table `Object.fromEntries(ARR.map((x) => [x.prop, …]))` with ARR a literal array of
// objects holding a literal `prop` → [keys]; anything else → null (key set unknown)
const staticKeys = (n, f) => {
  n = unwrap(n)
  if (n?.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.object.name !== 'Object' || n.callee.property.name !== 'fromEntries') return null
  const m = unwrap(n.arguments[0])
  if (m?.type !== 'CallExpression' || m.callee.type !== 'MemberExpression' || m.callee.property.name !== 'map') return null
  const fn = unwrap(m.arguments[0])
  if (!isFn(fn) || fn.params[0]?.type !== 'Identifier') return null
  const body = unwrap(fn.body)
  const k0 = body?.type === 'ArrayExpression' ? unwrap(body.elements[0]) : null
  if (k0?.type !== 'MemberExpression' || k0.computed || k0.object.name !== fn.params[0].name) return null
  const { n: arr } = deref(unwrap(m.callee.object), f)
  if (arr?.type !== 'ArrayExpression') return null
  const keys = []
  for (const e of arr.elements) {
    const o = unwrap(e)
    const p = o?.type === 'ObjectExpression' ? o.properties.find((q) => q.type === 'ObjectProperty' && propKey(q, f) === k0.property.name) : null
    if (p?.value.type !== 'StringLiteral') return null
    keys.push(p.value.value)
  }
  return keys
}
const findProp = (obj, k, f, depth = 0) => { // → { node, f } | { opaque } | null
  if (depth > 10) die('findProp: spread loop')
  for (let i = obj.properties.length - 1; i >= 0; i--) {
    const p = obj.properties[i]
    if ((p.type === 'ObjectProperty' || p.type === 'ObjectMethod') && propKey(p, f) === k) return { node: p.type === 'ObjectProperty' ? p.value : p, f }
    if (p.type === 'SpreadElement') {
      const { n, f: g } = deref(unwrap(p.argument), f)
      if (n?.type === 'ObjectExpression') { const r = findProp(n, k, g, depth + 1); if (r) return r; continue }
      const sk = staticKeys(n, g)
      if (sk) { if (sk.includes(k)) return { opaque: `...${p.argument.name ?? p.argument.type} (Object.fromEntries entry)`, f }; continue }
      return { opaque: `...${p.argument.name ?? p.argument.type} (key set unknown)`, f }
    }
  }
  return null
}
// walk segments in the twin → { found: node, f } | { missing: segment index } | { computed: why }
const resolveIn = (root, f, segs) => {
  let n = unwrap(root)
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    ;({ n, f } = deref(unwrap(n), f))
    n = unwrap(n)
    if (!n) return { missing: i }
    if (s.t === 'prop') {
      if (n.type !== 'ObjectExpression') return { computed: `${n.type} where ${segStr(segs.slice(0, i + 1))} was expected`, f }
      const r = findProp(n, s.k, f)
      if (!r) return { missing: i }
      if (r.opaque) return { computed: r.opaque, f }
      n = r.node; f = r.f
    } else if (s.t === 'idx') {
      if (n.type !== 'ArrayExpression') return { computed: `${n.type} where an array was expected`, f }
      if (n.elements.some((e) => e?.type === 'SpreadElement')) return { computed: 'array with spread', f }
      if (s.i >= n.elements.length || !n.elements[s.i]) return { missing: i }
      n = n.elements[s.i]
    } else if (s.t === 'body') {
      if (!isFn(n)) return { computed: `${n.type} where a function was expected`, f }
      n = n.body
    } else if (s.t === 'var') {
      if (n.type !== 'BlockStatement') return { computed: `${n.type} where a block was expected`, f }
      const v = n.body.filter((st) => st.type === 'VariableDeclaration').flatMap((st) => st.declarations).find((d) => d.id.type === 'Identifier' && d.id.name === s.name)
      if (!v) return { missing: i }
      n = v.init
    } else if (s.t === 'return') {
      if (n.type !== 'BlockStatement') return { computed: `${n.type} where a block was expected`, f }
      const r = n.body.filter((st) => st.type === 'ReturnStatement')[s.k]
      if (!r) return { missing: i }
      n = r.argument
    }
  }
  return { found: n, f }
}

// ---------------------------------------------------------------- language tests
// does an expression produce the app language ('ja' | 'en')?
const isLangType = (ta) => {
  const t = ta?.typeAnnotation ?? ta
  if (!t) return false
  if (t.type === 'TSTypeReference' && t.typeName?.name === 'Lang') return true
  if (t.type === 'TSUnionType') return t.types.every((u) => u.type === 'TSLiteralType' && ['ja', 'en'].includes(u.literal.value))
  return false
}
const langValue = (f, path, depth = 0) => {
  if (depth > 8) return null
  const n = unwrap(path.node)
  if (n.type === 'CallExpression') {
    const fn = resolveFn(f, path.get('callee'))
    if (fn && isLangType(fn.node.returnType)) return { how: 'call' }
    return null
  }
  if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'lang') return { how: 'name', what: '.lang property' }
  if (n.type === 'Identifier') {
    const d = declOfBinding(f, path, n.name)
    if (!d) return null
    if (d.param) {
      const pn = d.path.node
      const ta = pn.typeAnnotation ?? (pn.type === 'AssignmentPattern' ? pn.left.typeAnnotation : null)
      if (isLangType(ta)) return { how: 'param-type' }
      return null
    }
    if (d.path && d.root) return langValue(d.file, d.path.get('init'), depth + 1)
  }
  return null
}
// polarity of a test: 'en' when truthy means English, 'ja' when truthy means Japanese, null if not a language test
const flip = (s) => s === 'en' ? 'ja' : 'en'
const polarity = (f, path, depth = 0) => {
  if (depth > 8) return null
  const n = unwrap(path.node)
  if (n.type === 'BinaryExpression' && ['===', '==', '!==', '!='].includes(n.operator)) {
    for (const [a, b] of [['left', 'right'], ['right', 'left']]) {
      const lit = unwrap(n[b])
      if (lit.type === 'StringLiteral' && (lit.value === 'ja' || lit.value === 'en')) {
        const lv = langValue(f, path.get(a))
        if (lv) return { side: n.operator.startsWith('!') ? flip(lit.value) : lit.value, nameBased: lv.how === 'name' ? lv.what : null }
      }
    }
    return null
  }
  if (n.type === 'UnaryExpression' && n.operator === '!') {
    const p = polarity(f, path.get('argument'), depth + 1)
    return p && { ...p, side: flip(p.side) }
  }
  if (n.type === 'Identifier') {
    const d = declOfBinding(f, path, n.name)
    if (!d) return null
    if (d.param) {
      if (/^(ja|isJa|isJapanese)$/.test(n.name)) return { side: 'ja', nameBased: `boolean parameter named '${n.name}'` }
      if (/^(en|isEn|isEnglish)$/.test(n.name)) return { side: 'en', nameBased: `boolean parameter named '${n.name}'` }
      return null
    }
    if (d.path && d.root) return polarity(d.file, d.path.get('init'), depth + 1)
  }
  return null
}
// function a call goes to (local or imported) → { node, file }
const resolveFn = (f, calleePath) => {
  const n = calleePath.node
  if (n.type !== 'Identifier') return null
  const d = declOfBinding(f, calleePath, n.name)
  if (!d || d.param || !d.root) return null
  const r = unwrap(d.root)
  return isFn(r) ? { node: r, file: d.file } : null
}
// a statement that always leaves the function (return / throw, or a block ending in one)
const exits = (s) => s && (s.type === 'ReturnStatement' || s.type === 'ThrowStatement' || (s.type === 'BlockStatement' && exits(s.body[s.body.length - 1])))
const paramName = (p) => p.type === 'Identifier' ? p.name : p.type === 'AssignmentPattern' && p.left.type === 'Identifier' ? p.left.name : null

// ---------------------------------------------------------------- developer-only code (hash routes)
// 1: truthy ⇒ a dev #hash matched · -1: falsy ⇒ it matched · 0: neither (e.g. `hover || location.hash…`)
// path is the babel path of node when there is one (local scope); without it identifiers resolve at module level
const isHashRef = (x) => x?.type === 'MemberExpression' && !x.computed && x.property.name === 'hash' && (x.object.name === 'location' || (x.object.type === 'MemberExpression' && x.object.property.name === 'location'))
const hashTest = (f, path, depth = 0, node = null) => {
  if (depth > 8) return 0
  const n = unwrap(node ?? path.node)
  if (path && !node && n !== path.node) { path = null; node = n } // unwrapped: continue on nodes
  const sub = (k) => hashTest(f, path && !node ? path.get(k) : null, depth + 1, path && !node ? null : n[k])
  if (n.type === 'UnaryExpression' && n.operator === '!') return -sub('argument')
  if (n.type === 'LogicalExpression' && n.operator === '&&') return sub('left') === 1 || sub('right') === 1 ? 1 : 0
  if (n.type === 'LogicalExpression' && n.operator === '||') return sub('left') === 1 && sub('right') === 1 ? 1 : 0
  if (isHashRef(n)) return 1
  if (n.type === 'BinaryExpression' && ['===', '=='].includes(n.operator) && (isHashRef(unwrap(n.left)) || isHashRef(unwrap(n.right)))) return 1
  if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && isHashRef(unwrap(n.callee.object))
    && ['startsWith', 'includes', 'endsWith', 'match', 'test'].includes(n.callee.property.name)) return 1 // location.hash.startsWith('#x')
  const declOf = (name) => path && !node ? declOfBinding(f, path, name) : lookupTop(f, name)
  if (n.type === 'Identifier') {
    const d = declOf(n.name)
    if (!d || d.param || !d.root) return 0
    return d.path ? hashTest(d.file, d.path.get('init'), depth + 1) : hashTest(d.file, null, depth + 1, unwrap(d.root))
  }
  if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
    const d = declOf(n.callee.name)
    const fn = d && !d.param && d.root ? unwrap(d.root) : null
    if (!isFn(fn)) return 0
    const body = fn.body
    const ret = body.type === 'BlockStatement' ? (body.body.length === 1 && body.body[0].type === 'ReturnStatement' ? body.body[0].argument : null) : body
    return ret ? hashTest(d.file, null, depth + 1, ret) : 0
  }
  return 0
}
// is this path inside a branch that only runs under a dev #hash? → the gating test's line, or null
const hashGated = (f, path) => {
  for (let c = path, p = path.parentPath; p; c = p, p = p.parentPath) {
    const n = p.node
    if ((n.type === 'ConditionalExpression' || n.type === 'IfStatement') && (c.key === 'consequent' || c.key === 'alternate')) {
      const h = hashTest(f, p.get('test'))
      if ((h === 1 && c.key === 'consequent') || (h === -1 && c.key === 'alternate')) return n.test.loc.start.line
    }
    if (n.type === 'LogicalExpression' && n.operator === '&&' && c.key === 'right' && hashTest(f, p.get('left')) === 1) return n.left.loc.start.line
  }
  return null
}
// module graph from index.html's entry; an edge whose every use is hash-gated is a dev edge
const html = readFileSync(join(TREE, 'index.html'), 'utf8')
const entryM = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html)
if (!entryM) die('index.html has no <script type="module" src=…> entry')
const entry = join(TREE, entryM[1])
if (!files.has(entry)) die(`entry ${entryM[1]} from index.html is not a parsed code file`)
const edges = new Map() // abs → [{ to, gated }]
for (const f of files.values()) {
  const out = []
  for (const im of f.imports) {
    const to = resolveImport(f.abs, im.source, im.path.node.loc.start.line)
    if (!to || to === 'asset') continue
    let gated = !im.sideEffect && im.specs.length > 0
    for (const s of im.specs) {
      const b = f.prog.scope.getBinding(s.local)
      if (!b) die(`${rel(f.abs)}: no binding for import ${s.local}`)
      if (b.referencePaths.length === 0 || !b.referencePaths.every((r) => hashGated(f, r))) gated = false
    }
    out.push({ to, gated })
  }
  for (const di of f.dynImports) {
    const to = resolveImport(f.abs, di.source, di.path.node.loc.start.line)
    if (!to || to === 'asset') continue
    let gated = !!hashGated(f, di.path)
    if (!gated) { // const C = lazy(() => import('./x')) with every <C/> gated
      const decl = di.path.findParent((q) => q.isVariableDeclarator())
      if (decl && decl.node.id.type === 'Identifier') {
        const b = decl.scope.getBinding(decl.node.id.name)
        gated = b.referencePaths.length > 0 && b.referencePaths.every((r) => hashGated(f, r))
      }
    }
    out.push({ to, gated })
  }
  edges.set(f.abs, out)
}
const reach = (starts, useGated) => {
  const seen = new Set(), stack = [...starts]
  while (stack.length) {
    const a = stack.pop()
    if (seen.has(a)) continue
    seen.add(a)
    for (const e of edges.get(a) ?? []) if (useGated || !e.gated) stack.push(e.to)
  }
  return seen
}
const playerSet = reach([entry], false)
const devSet = new Set([...reach([entry], true)].filter((a) => !playerSet.has(a)))

// ---------------------------------------------------------------- per-literal classification
const gaps = []          // { kind, file, line, ctx, text }
const explained = new Map() // category → count
const nonStructural = new Set() // categories that rest on a name or content rule
const pairStats = new Map() // 'JA ↔ EN' → { checked, missing, file }
const okLines = []
let cur = null // { f, path } of the literal being classified (for --all)
const bump = (cat, ns = false) => {
  explained.set(cat, (explained.get(cat) ?? 0) + 1)
  if (ns) nonStructural.add(cat)
  if (ALL && cur) okLines.push(['OK', `${rel(cur.f.abs)}:${jaLine(cur.f, cur.path.node)}`, cat, show(textOf(cur.path.node))].join('\t'))
}
const show = (s) => s.replace(/\u3000/g, '[U+3000]').replace(/\s+/g, ' ').trim().slice(0, 100)
const ownerName = (path) => {
  const fn = path.findParent((q) => (q.isFunctionDeclaration() && q.node.id) || q.isVariableDeclarator() || q.isClassMethod() || q.isObjectMethod())
  if (!fn) return ''
  const n = fn.node
  return n.id?.name ?? n.key?.name ?? ''
}
const ctxOf = (path) => {
  const p = path.parentPath, n = p?.node
  let c
  if (path.node.type === 'JSXText') c = 'JSX text'
  else if (n?.type === 'JSXAttribute') c = `${n.name.name}=`
  else if (n?.type === 'ObjectProperty' && path.key === 'value') c = `.${propKey(n)}`
  else if (n?.type === 'CallExpression' || n?.type === 'NewExpression') c = `${n.callee.type === 'Identifier' ? n.callee.name : n.callee.type === 'MemberExpression' ? (n.callee.property.name ?? '?') : '?'}() arg${path.key}`
  else if (n?.type === 'JSXExpressionContainer') c = 'JSX {…}'
  else c = n?.type ?? '?'
  const o = ownerName(path)
  return o ? `${c} in ${o}` : c
}
// lang: the language the gap belongs to ('en' for NO-EN, PARITY, FALLBACK; '*' = every language); chs: FOREIGN's characters
const gap = (kind, f, path, ctx, extra = '', lang = 'en', chs = null) => gaps.push({ kind: kindFor(kind, textOf(path.node), chs), lang, file: rel(f.abs), line: jaLine(f, path.node), ctx: ctx ?? ctxOf(path), text: show(textOf(path.node)) + extra })

// lang="…" on the nearest JSX element, as shown in the given mode → 'ja' | 'en' | null
const jsxLangIn = (f, path, mode) => {
  const el = path.findParent((q) => q.isJSXElement() && q.node.openingElement.attributes.some((a) => a.type === 'JSXAttribute' && a.name.name === 'lang'))
  if (!el) return null
  const attr = el.node.openingElement.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === 'lang')
  const ap = el.get('openingElement').get('attributes')[el.node.openingElement.attributes.indexOf(attr)]
  const v = attr.value
  if (v?.type === 'StringLiteral') return v.value
  if (v?.type === 'JSXExpressionContainer') {
    const e = unwrap(v.expression)
    if (e.type === 'StringLiteral') return e.value
    if (e.type === 'ConditionalExpression') {
      const pol = polarity(f, ap.get('value').get('expression').get('test'))
      const pick = pol ? (pol.side === mode ? e.consequent : e.alternate) : null
      return pick?.type === 'StringLiteral' ? pick.value : null
    }
  }
  return null
}
// a call argument rendered by the callee inside <… lang={param}> whose argument is 'ja'
const argMarkedJa = (fn, callNode, argIdx) => {
  const P = paramName(fn.node.params[argIdx] ?? {})
  if (!P) return false
  let marked = false
  const v = (x, langParam) => {
    if (!x || typeof x !== 'object' || marked) return
    if (x.type === 'JSXElement') {
      const a = x.openingElement.attributes.find((q) => q.type === 'JSXAttribute' && q.name.name === 'lang')
      if (a?.value?.type === 'JSXExpressionContainer' && a.value.expression.type === 'Identifier') langParam = a.value.expression.name
    }
    if (x.type === 'JSXExpressionContainer' && x.expression.type === 'Identifier' && x.expression.name === P && langParam) {
      const qi = fn.node.params.findIndex((q) => paramName(q) === langParam)
      const arg = callNode.arguments[qi]
      if (arg?.type === 'StringLiteral' && arg.value === 'ja') marked = true
    }
    for (const k in x) if (k !== 'loc') { const c = x[k]; if (Array.isArray(c)) c.forEach((y) => v(y, langParam)); else if (c && typeof c === 'object' && c.type) v(c, langParam) }
  }
  v(fn.node.body, null)
  return marked
}
const GLSL = /\b(void\s+main|gl_FragColor|gl_Position|uniform|varying|vec[234]|mat[234]|#include|#define|texture2D|smoothstep)\b|#include/
const stripGlslComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const compLabelDecl = [...files.values()].map((f) => f.topDecls.get('compLabel')).find(Boolean)

// twin check result → verdict on a Japanese-side literal
const viaTwin = (f, litPath, mech, twinRoot, twinFile, fromPath, pairName) => {
  const segs = relPath(fromPath, litPath, f)
  const r = resolveIn(twinRoot, twinFile, segs)
  if (pairName) { const s = pairStats.get(pairName) ?? { checked: 0, missing: 0 }; s.checked++; if (r.missing !== undefined) s.missing++; pairStats.set(pairName, s) }
  if (r.missing !== undefined) {
    gap('PARITY', f, litPath, `${mech}: no English at ${segStr(segs.slice(0, r.missing + 1)) || '(root)'}${pairName ? ' in ' + pairName.split(' ↔ ')[1] : ''}`)
    return
  }
  if (r.computed) { bump(`${mech}: English twin is computed, not checked deeper (${r.computed.replace(/\S+@\d+/, '')})`, true); return }
  if (segs.stop === 'computed key') { bump(`${mech}: path stops at a computed key that is not a constant; matched one level up`, true); return }
  bump(mech)
}
// ui().<topic>.<key> reads in the code files (ui bound by an import), by "topic.key"
let uiReadMap = null
const uiReads = () => {
  if (uiReadMap) return uiReadMap
  uiReadMap = new Map()
  for (const f of files.values()) f.prog.traverse({ CallExpression(p) {
    if (p.node.callee.type !== 'Identifier' || p.node.callee.name !== 'ui' || p.node.arguments.length || p.scope.getBinding('ui')?.kind !== 'module') return
    const m1 = p.parentPath, m2 = m1.parentPath
    if (!m1.isMemberExpression() || m1.node.computed || !m2?.isMemberExpression() || m2.node.object !== m1.node || m2.node.computed) return
    const k = `${m1.node.property.name}.${m2.node.property.name}`
    if (!uiReadMap.has(k)) uiReadMap.set(k, [])
    uiReadMap.get(k).push({ f, path: m2 })
  } })
  return uiReadMap
}
// a text of src/i18n/<topic>.en.ts whose every ui() read sits inside an element marked lang="ja" in English mode (the
// language switch's own label, written in the language it switches to)
const catalogReadsMarkedJa = (f, litPath, decl) => {
  const m = /\/src\/i18n\/(\w+)\.en\.ts$/.exec(f.abs)
  if (!m || decl !== m[1] + 'En') return false
  const prop = litPath.findParent((q) => q.isObjectProperty() && q.parentPath.parentPath?.isVariableDeclarator() && q.parentPath.parentPath.node.id.name === decl)
  if (!prop || prop.node.computed) return false
  const reads = uiReads().get(`${m[1]}.${prop.node.key.name ?? prop.node.key.value}`) ?? []
  return reads.length > 0 && reads.every((r) => jsxLangIn(r.f, r.path, 'en') === 'ja')
}
// English-side literal holding Japanese
const enSide = (f, litPath, mech, decl) => {
  if (jsxLangIn(f, litPath, 'en') === 'ja') { bump('inside an element marked lang="ja" in English mode (shown in Japanese on purpose)'); return }
  if (decl && catalogReadsMarkedJa(f, litPath, decl)) { bump('src/i18n/ text read through ui() only inside an element marked lang="ja" in English mode (shown in Japanese on purpose)'); return }
  const chs = foreignIn('en', textOf(litPath.node))
  gap('FOREIGN', f, litPath, `en: ${mech}: ${ctxOf(litPath)}; foreign to en: ${fmtChars(chs)}`, '', 'en', chs)
}

// not player-visible text (category) or null: a type position, a console.* argument, a thrown Error
const devText = (litPath) => {
  if (litPath.findParent((q) => q.isTSLiteralType() || q.isTSTypeAnnotation() || q.isTSTypeAliasDeclaration() || q.isTSInterfaceDeclaration())) return 'TypeScript type position (not runtime text)'
  if (litPath.findParent((q) => (q.isCallExpression() && q.node.callee.type === 'MemberExpression' && q.node.callee.object.type === 'Identifier' && q.node.callee.object.name === 'console' && !q.scope.getBinding('console')))) return 'console.* argument (developer log)'
  if (litPath.findParent((q) => q.isThrowStatement() || (q.isNewExpression() && q.node.callee.type === 'Identifier' && /Error$/.test(q.node.callee.name)))) return 'thrown Error message (developer text)'
  return null
}
// not shown to the player because of where it lives (category) or null: a developer page, an unreachable module, a #hash-gated branch
const devPlace = (f, litPath) => {
  if (devSet.has(f.abs)) return 'developer page: module reached only through a #hash route (module graph from index.html)'
  if (!playerSet.has(f.abs)) return 'module not imported by the app (unreachable from index.html)'
  if (hashGated(f, litPath)) return 'developer UI inside a branch gated by location.hash'
  return null
}

const classify = (f, litPath) => {
  const lit = litPath.node, text = textOf(lit)
  // not player-visible
  const why = devText(litPath)
  if (why) return bump(why)
  if (lit.type !== 'JSXText' && !JA.test(stripGlslComments(text))) {
    // GLSL: the literal, or a template/concatenation it is spliced into, is shader source
    let glsl = GLSL.test(text)
    for (let q = litPath.parentPath; !glsl && q && /^(TemplateLiteral|ConditionalExpression|BinaryExpression|LogicalExpression|ParenthesizedExpression)$/.test(q.node.type); q = q.parentPath) {
      if (q.node.type === 'TemplateLiteral' && GLSL.test(textOf(q.node))) glsl = true
      if (q.node.type === 'BinaryExpression' && [q.node.left, q.node.right].some((x) => (x.type === 'StringLiteral' || x.type === 'TemplateLiteral') && GLSL.test(textOf(x)))) glsl = true
    }
    if (glsl) return bump('GLSL source: Japanese only inside // or /* */ comments')
  }
  const where = devPlace(f, litPath)
  if (where) return bump(where)

  let weakTuple = null
  for (let c = litPath, p = litPath.parentPath; p; c = p, p = p.parentPath) {
    const n = p.node
    // language branch: cond ? A : B / if (lang) {…} else {…}
    if ((n.type === 'ConditionalExpression' || n.type === 'IfStatement') && (c.key === 'consequent' || c.key === 'alternate')) {
      const pol = polarity(f, p.get('test'))
      if (pol) {
        const side = c.key === 'consequent' ? pol.side : flip(pol.side)
        const mech = pol.nameBased ? `language branch (test is a ${pol.nameBased})` : 'language branch (getLang()/useLang()/Lang-typed test)'
        if (side === 'en') return enSide(f, litPath, mech)
        let other = c.key === 'consequent' ? n.alternate : n.consequent
        // if (ja) { …; return } with no else: the English is whatever follows the if in the same block
        if (!other && n.type === 'IfStatement' && exits(n.consequent)) {
          const after = p.getAllNextSiblings().map((q) => q.node)
          if (after.length) other = { type: 'BlockStatement', body: after }
        }
        if (!other) { gap('NO-EN', f, litPath, `${mech}: Japanese branch with no English branch`); return }
        if (pol.nameBased) nonStructural.add(mech)
        return viaTwin(f, litPath, mech, other, f, c, null)
      }
    }
    // statement after `if (lang test) { …; return }` with no else: it runs only in the other language
    if (c.listKey === 'body' && (n.type === 'BlockStatement' || n.type === 'Program')) {
      const prev = c.getAllPrevSiblings().reverse().find((q) => q.isIfStatement() && !q.node.alternate && exits(q.node.consequent) && polarity(f, q.get('test')))
      if (prev) {
        const pol = polarity(f, prev.get('test'))
        const mech = pol.nameBased ? `language branch (test is a ${pol.nameBased})` : 'language branch (getLang()/useLang()/Lang-typed test)'
        if (pol.side === 'ja') return enSide(f, litPath, `${mech}, fall-through after the Japanese if`)
        if (pol.nameBased) nonStructural.add(mech)
        return viaTwin(f, litPath, mech, prev.node.consequent, f, c, null)
      }
    }
    // call argument: t(ja, en) and any function with (x, xEn) / (ja, en) parameters
    if (n.type === 'CallExpression' && c.listKey === 'arguments') {
      const fn = resolveFn(f, p.get('callee'))
      if (fn) {
        const names = fn.node.params.map(paramName)
        const P = names[c.key]
        if (P) {
          const mech = fn.node.params.length >= 2 && names[0] === 'ja' && names[1] === 'en' ? 't(ja, en) — or another (ja, en) function' : `positional (${P}, ${P}En) arguments`
          if (P === 'en' || /[a-z0-9]En$/.test(P)) return enSide(f, litPath, mech)
          const j = names.indexOf(P === 'ja' ? 'en' : P + 'En')
          if (j >= 0) {
            if (!n.arguments[j]) { gap('NO-EN', f, litPath, `${mech}: English argument missing`); return }
            return viaTwin(f, litPath, mech, n.arguments[j], f, c, null)
          }
          if (argMarkedJa(fn, n, c.key)) return bump('inside an element marked lang="ja" in English mode (shown in Japanese on purpose)')
        }
      }
    }
    // object property with an English sibling: foo / fooEn, ja / en, or an en: {…} sub-object
    if (n.type === 'ObjectExpression' && c.node.type === 'ObjectProperty') {
      const k = propKey(c.node, f)
      if (k !== null) {
        const props = new Map(n.properties.filter((q) => q.type === 'ObjectProperty').map((q) => [propKey(q, f), q]))
        if (k === 'en' || /[a-z0-9]En$/.test(k)) return enSide(f, litPath, `English property .${k}`)
        const sib = props.get(k === 'ja' ? 'en' : k + 'En')
        if (sib) return viaTwin(f, litPath, `sibling property .${k} / .${k === 'ja' ? 'en' : k + 'En'}`, sib.value, f, c.get('value'), null)
        const enObj = props.get('en')
        if (enObj && unwrap(enObj.value).type === 'ObjectExpression') return viaTwin(f, litPath, 'en: {…} sub-object', enObj.value, f, p, null)
      }
    }
    // JSX attributes name="…" nameEn="…"
    if (n.type === 'JSXAttribute' && p.parentPath?.node.type === 'JSXOpeningElement') {
      const k = n.name.name
      const attrs = p.parentPath.node.attributes.filter((a) => a.type === 'JSXAttribute')
      if (/[a-z0-9]En$/.test(k)) return enSide(f, litPath, `English attribute ${k}=`)
      const sib = attrs.find((a) => a.name.name === k + 'En')
      if (sib) return viaTwin(f, litPath, `sibling attribute ${k}= / ${k}En=`, sib.value, f, c, null)
    }
    // [ja, en] pair: weak (content-based) — only used when nothing structural encloses the literal
    if (!weakTuple && n.type === 'ArrayExpression' && n.elements.length === 2 && c.key === 0) {
      const e1 = n.elements[1]
      if (e1 && (e1.type === 'StringLiteral' || e1.type === 'TemplateLiteral') && !hasJa(e1)) weakTuple = true
    }
    // declaration with an English twin: X ↔ X_EN, X_JA ↔ X_EN, x ↔ xEn, xJa ↔ xEn, ja ↔ en
    const isDecl = (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && c.key === 'init') || (n.type === 'FunctionDeclaration' && n.id)
    if (isDecl) {
      const N = n.id.name
      if (isEnName(N)) return enSide(f, litPath, `English declaration ${N}`, N)
      const top = p.parentPath?.parentPath
      const exported = n.type === 'FunctionDeclaration' ? p.parentPath?.isExportNamedDeclaration() : top?.isExportNamedDeclaration()
      const twin = findTwin(f, p, N, exported)
      if (twin) {
        const pairName = `${N} ↔ ${twin.name}`
        const s = pairStats.get(pairName) ?? { checked: 0, missing: 0, jaFile: rel(f.abs), enFile: rel(twin.file.abs) }
        pairStats.set(pairName, { ...s, jaFile: rel(f.abs), enFile: rel(twin.file.abs), label: `${twin.jaName} ↔ ${twin.name}` })
        const fromPath = n.type === 'VariableDeclarator' ? c : p
        const mech = isFn(unwrap(n.type === 'VariableDeclarator' ? n.init : n)) ? 'builder function foo() ↔ fooEn()' : 'parallel table X ↔ X_EN (key-path parity)'
        return viaTwin(f, litPath, mech, twin.root, twin.file, fromPath, pairName)
      }
      if (/_JA$|[a-z0-9]Ja$|^ja$/.test(N)) { gap('PARITY', f, litPath, `Japanese table ${N} has no English twin (${twinNamesOf(N).join(' / ')})`); return }
    }
  }
  if (weakTuple) return bump('[ja, en] pair: 2-element array whose 2nd element is a JA-free string (content rule)', true)
  // shown in both languages
  if (jsxLangIn(f, litPath, 'en') === 'ja') return bump('inside an element marked lang="ja" in English mode (shown in Japanese on purpose)')
  const halves = text.split(' / ')
  if (halves.length >= 2 && halves.some((h) => JA.test(h)) && halves.some((h) => !JA.test(h) && /[A-Za-z]{2}/.test(h))) return bump("bilingual literal 'ja / en' (shown before a language is chosen)", true)
  if (compLabelDecl && lit.type === 'StringLiteral') {
    const arr = litPath.parentPath, comp = arr?.parentPath?.parentPath
    if (arr?.node.type === 'ArrayExpression' && litPath.key === 0 && comp?.node.type === 'ObjectProperty' && propKey(comp.node) === 'comp') {
      const enOut = text.split(' ').filter((w) => !/[\u3040-\u30FF\u3400-\u9FFF]/.test(w)).join(' ') // = compLabel(label, 'en') at upstream 7c480f8 (its JA_CHARS)
      if (enOut && !JA.test(enOut)) return bump(`mixed-script .comp label split by ${compLabelDecl.name}() (rockSamples): English half checked`, true)
      gap('FOREIGN', f, litPath, `en: ${compLabelDecl.name}() English half still holds Japanese: '${enOut}'; foreign to en: ${fmtChars(foreignIn('en', enOut))}`, '', 'en', foreignIn('en', enOut)); return
    }
  }
  if (/^＋+$/.test(text.trim())) return bump("full-width ＋ button glyph (symbol; the patch left it as is)", true)
  gap('NO-EN', f, litPath)
}

for (const f of files.values()) for (const p of f.lits) { cur = { f, path: p }; classify(f, p) }
cur = null
// "no foreign", other scripts: a player-visible literal holding a character that no language in LANG_SCRIPTS allows.
// Shown in some language whatever its slot, so its slot does not matter. GLSL comments are not text.
for (const f of files.values()) for (const p of f.foreign) {
  const chs = foreignEverywhere(p.node.type === 'JSXText' ? textOf(p.node) : stripGlslComments(textOf(p.node)))
  if (!chs.length || devText(p) || devPlace(f, p)) continue
  gap('FOREIGN', f, p, `${Object.keys(LANG_SCRIPTS).join(', ')}: ${ctxOf(p)}; allowed in no language: ${fmtChars(chs)}`, '', '*', chs)
}

// ---------------------------------------------------------------- top-level spread parity + key sets for fallbacks
// keys of an object literal including resolved spreads → Map key → { node, f, line }, plus opaque spreads
const keysOf = (root, f, depth = 0) => {
  const out = { keys: new Map(), opaque: [] }
  const n = unwrap(deref(unwrap(root), f).n)
  const g = deref(unwrap(root), f).f
  if (n?.type !== 'ObjectExpression') { out.opaque.push({ name: n?.type ?? '?', line: n?.loc?.start.line, f: g }); return out }
  for (const p of n.properties) {
    if (p.type === 'SpreadElement') {
      const a = unwrap(p.argument)
      const { n: t, f: h } = deref(a, g)
      const sk = t?.type === 'ObjectExpression' ? null : staticKeys(t, h)
      if (t?.type === 'ObjectExpression' && depth < 10) {
        const sub = keysOf(t, h, depth + 1)
        const via = { name: a.name ?? a.type, line: p.loc.start.line, f: g }
        for (const [k, v] of sub.keys) out.keys.set(k, { ...v, via })
        out.opaque.push(...sub.opaque)
      } else if (sk) {
        const via = { name: a.name ?? a.type, line: p.loc.start.line, f: g }
        for (const k of sk) out.keys.set(k, { node: null, f: g, line: p.loc.start.line, via })
      } else out.opaque.push({ name: a.type === 'Identifier' ? a.name : a.type, line: p.loc.start.line, f: g })
    } else if (p.type === 'ObjectProperty' || p.type === 'ObjectMethod') {
      const k = propKey(p, g)
      if (k === null) out.opaque.push({ name: `[computed key] ${p.key.type}`, line: p.loc.start.line, f: g })
      else out.keys.set(k, { node: p.type === 'ObjectProperty' ? p.value : p, f: g, line: p.loc.start.line })
    }
  }
  return out
}
// every twin pair found above: ids the Japanese table gets through a spread (...SPACE_FACTS) must reach the English
// table too (its literals are checked against SPACE_FACTS_EN, but FACTS_EN may forget ...SPACE_FACTS_EN)
for (const [pairName, st] of pairStats) {
  const [N, T] = pairName.split(' ↔ ')
  const jf = files.get(join(TREE, st.jaFile)), ef = files.get(join(TREE, st.enFile))
  const jd = jf.topDecls.get(N), ed = ef.topDecls.get(T)
  if (!jd || !ed || isFn(unwrap(jd.root))) continue
  // an array pair (DIRS_JA / DIRS_EN, HistoricBook.tsx) is checked element by element by the key-path rule, and
  // keysOf would report the array itself as an unresolved spread; every other table (an object, a call that builds
  // one) goes through the spread check
  if (unwrap(deref(unwrap(jd.root), jf).n)?.type === 'ArrayExpression') continue
  const J = keysOf(jd.root, jf), E = keysOf(ed.root, ef)
  const bySpread = new Map()
  for (const [k, v] of J.keys) if (v.via && !E.keys.has(k)) {
    const key = `${rel(v.via.f.abs)}:${v.via.line}:${v.via.name}`
    if (!bySpread.has(key)) bySpread.set(key, { via: v.via, ids: [] })
    bySpread.get(key).ids.push(k)
  }
  for (const { via, ids } of bySpread.values()) gaps.push({ kind: 'PARITY', lang: 'en', file: rel(via.f.abs), line: via.line, ctx: `${N} gets ${ids.length} id(s) from ...${via.name} that ${T} lacks`, text: ids.slice(0, 6).join(', ') + (ids.length > 6 ? ', …' : '') })
  for (const o of J.opaque) {
    if (!E.opaque.some((x) => twinNamesOf(o.name).includes(x.name))) gaps.push({ kind: 'PARITY', lang: 'en', file: rel(o.f.abs), line: o.line, ctx: `${N} spreads ${o.name}; ${T} has no ...${twinNamesOf(o.name).join(' / ...')}`, text: `...${o.name}` })
  }
}

// silent fallbacks: EN_TABLE[id](.field…) ?? … or || …
const fallbackSites = []
for (const f of files.values()) for (const lp of f.logicals) {
  const left = lp.get('left')
  const found = []
  left.traverse({
    'MemberExpression|OptionalMemberExpression'(mp) {
      const m = mp.node
      if (!m.computed || m.object.type !== 'Identifier' || !isEnName(m.object.name)) return
      const d = declOfBinding(f, mp.get('object'), m.object.name)
      if (!d || d.param || !d.root) return
      found.push({ mp, d })
    },
  })
  if (left.isMemberExpression() || left.isOptionalMemberExpression()) { /* traverse() skips the root node itself */
    let r = left
    while (r && (r.isMemberExpression() || r.isOptionalMemberExpression()) && !r.node.computed) r = r.get('object')
    if (r && (r.isMemberExpression() || r.isOptionalMemberExpression()) && r.node.computed && r.node.object.type === 'Identifier' && isEnName(r.node.object.name)) {
      const d = declOfBinding(f, r.get('object'), r.node.object.name)
      if (d && !d.param && d.root && !found.some((x) => x.mp.node === r.node)) found.push({ mp: r, d })
    }
  }
  for (const { mp, d } of found) {
    const fields = []
    for (let q = mp; q.parentPath && (q.parentPath.isMemberExpression() || q.parentPath.isOptionalMemberExpression()) && q.parentPath.node.object === q.node && !q.parentPath.node.computed; q = q.parentPath) fields.push(q.parentPath.node.property.name)
    // Japanese twin of the English table
    let jd = null
    for (const J of jaNamesOf(d.name)) { jd = lookupTop(d.file, J) ?? lookupTop(f, J); if (jd) break }
    if (!jd) die(`${rel(f.abs)}:${lp.node.loc.start.line}: fallback read of ${d.name} but no Japanese twin (${jaNamesOf(d.name).join(' / ')}) found`)
    const site = { file: rel(f.abs), line: lp.node.loc.start.line, table: d.name, jaTable: jd.name, fields, missing: [] }
    const J = keysOf(jd.root, jd.file), E = keysOf(d.root, d.file)
    for (const [k, v] of J.keys) {
      const e = E.keys.get(k)
      if (!e) { site.missing.push({ k, why: `${d.name} has no '${k}'`, at: `${rel(v.f.abs)}:${v.line}` }); continue }
      if (fields.length && v.node && e.node) {
        const segs = fields.map((x) => ({ t: 'prop', k: x }))
        const rj = resolveIn(v.node, v.f, segs), re = resolveIn(e.node, e.f, segs)
        if (rj.found && re.missing !== undefined) site.missing.push({ k, why: `${d.name}.${k}.${fields.join('.')} missing`, at: `${rel(v.f.abs)}:${v.line}` })
      }
    }
    for (const o of J.opaque) if (!E.opaque.some((x) => twinNamesOf(o.name).includes(x.name))) site.missing.push({ k: `...${o.name}`, why: `${d.name} has no spread twin of ${o.name}`, at: `${rel(o.f.abs)}:${o.line}` })
    fallbackSites.push(site)
    for (const m of site.missing) gaps.push({ kind: 'FALLBACK', lang: 'en', file: site.file, line: site.line, ctx: `${d.name}[…]${fields.map((x) => '.' + x).join('')} ?? Japanese: ${m.why}`, text: `${jd.name}.${m.k} at ${m.at} is shown in Japanese` })
  }
}

// ---------------------------------------------------------------- css + index.html
const blank = (s) => s.replace(/[^\n]/g, ' ')
for (const abs of cssFiles) {
  const src = readFileSync(abs, 'utf8').replace(/\/\*[\s\S]*?\*\//g, blank)
  src.split('\n').forEach((l, i) => { if (JA.test(l)) gaps.push({ kind: kindFor('NO-EN', l), lang: 'en', file: rel(abs), line: i + 1, ctx: 'CSS (outside comments)', text: show(l) }) })
}
{
  const src = html.replace(/<!--[\s\S]*?-->/g, blank).replace(/\/\*[\s\S]*?\*\//g, blank)
  src.split('\n').forEach((l, i) => {
    if (!JA.test(l)) return
    const txt = l.replace(/<[^>]+>/g, ' ').trim()
    const halves = txt.split(' / ')
    if (halves.length >= 2 && halves.some((h) => JA.test(h)) && halves.some((h) => !JA.test(h) && /[A-Za-z]{2}/.test(h))) { bump("bilingual literal 'ja / en' (shown before a language is chosen)", true); return }
    gaps.push({ kind: kindFor('NO-EN', txt), lang: 'en', file: 'index.html', line: i + 1, ctx: 'HTML (outside comments)', text: show(txt) })
  })
}

// ---------------------------------------------------------------- report
const KIND_ORDER = ['NO-EN', 'FOREIGN', 'PARITY', 'FALLBACK', 'NO-EN-SYM', 'FOREIGN-SYM']
for (const g of gaps) if (!g.lang) die(`internal: gap without a language: ${g.kind} ${g.file}:${g.line}`)
{ const keep = gaps.filter((g) => g.lang === '*' || LANGS.includes(g.lang)); gaps.length = 0; gaps.push(...keep) } // --lang
const counts = (g) => STRICT || !g.kind.endsWith('-SYM') // does this gap count for the exit code
gaps.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.file.localeCompare(b.file) || a.line - b.line)
for (const g of gaps) console.log([g.kind, `${g.file}:${g.line}`, g.ctx, g.text].join('\t'))
if (ALL) for (const l of okLines) console.log(l)

let sha = '(not a git checkout)'
try {
  const env = { ...process.env }; delete env.GIT_DIR; delete env.GIT_INDEX_FILE; delete env.GIT_WORK_TREE
  sha = execFileSync('git', ['-C', TREE, 'log', '-1', '--format=%h %s'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().slice(0, 70)
} catch { /* display only: the tree need not be a git checkout */ }
const litCount = [...files.values()].reduce((s, f) => s + f.lits.length, 0)
const count = (k) => gaps.filter((g) => g.kind === k).length
const L = []
L.push('')
L.push(`== l10n-check  ${TREE}  @ ${sha}`)
L.push(`   ${litCount} Japanese literals in ${files.size} code files; ${cssFiles.length} css + index.html scanned; player modules ${playerSet.size}, developer-only ${devSet.size}, unreachable ${files.size - playerSet.size - devSet.size}`)
L.push(`   developer-only (reached only through a #hash-gated branch): ${[...devSet].map(rel).sort().join(' ') || 'none'}`)
L.push(`   unreachable from index.html: ${[...files.keys()].filter((a) => !playerSet.has(a) && !devSet.has(a)).map(rel).sort().join(' ') || 'none'}`)
L.push(`   languages checked: ${LANGS.join(', ')}${LANG_ARG ? ' (--lang)' : ' (all in LANG_SCRIPTS)'}`)
L.push(`   no foreign (LANG_SCRIPTS): ${Object.entries(LANG_SCRIPTS).map(([l, c]) => `${l} = ${c.scripts.join(' ')} + Common${c.eastAsian ? '' : ' without East Asian punctuation/forms'}`).join(' · ')}`)
L.push('-- gaps')
for (const k of KIND_ORDER) L.push(`   ${String(count(k)).padStart(5)}  ${k}${k.endsWith('-SYM') ? '   (punctuation/symbols only, no foreign letter)' : ''}`)
L.push(`   ${String(gaps.length).padStart(5)}  total; ${gaps.filter(counts).length} count for the exit code (${STRICT ? '--strict: all' : 'words; -SYM only with --strict'})`)
L.push('-- explained (structural unless marked *)')
for (const [cat, n] of [...explained].sort((a, b) => b[1] - a[1])) L.push(`   ${String(n).padStart(5)}  ${nonStructural.has(cat) ? '*' : ' '} ${cat}`)
L.push(`   ${String([...explained.values()].reduce((a, b) => a + b, 0)).padStart(5)}    total explained`)
L.push('   * = rests on a name or content rule, not on structure; the count is what that rule explains')
L.push('-- twin pairs found by name pattern (X↔X_EN, X_JA↔X_EN, x↔xEn, xJa↔xEn, ja↔en); Japanese literals checked / missing English')
for (const [p, s] of [...pairStats].sort((x, y) => (x[1].label ?? x[0]).localeCompare(y[1].label ?? y[0]))) L.push(`   ${String(s.checked).padStart(5)} / ${String(s.missing).padEnd(3)} ${s.label ?? p}   (${s.jaFile}${s.enFile !== s.jaFile ? ' ↔ ' + s.enFile : ''})`)
L.push('-- silent-fallback sites (an English table read whose miss shows Japanese with no error)')
for (const s of fallbackSites) L.push(`   ${s.file}:${s.line}  ${s.table}[…]${s.fields.map((x) => '.' + x).join('')} ?? …   twin ${s.jaTable}; ids missing English: ${s.missing.length}`)
if (!fallbackSites.length) L.push('   none')
console.log(L.join('\n'))
const failing = gaps.filter(counts).length
log(`${gaps.length} gaps (${KIND_ORDER.map((k) => `${count(k)} ${k}`).join(', ')}); ${litCount} Japanese literals; exit ${failing ? 1 : 0}${STRICT ? ' (--strict)' : ''}`)
process.exit(failing ? 1 : 0)
