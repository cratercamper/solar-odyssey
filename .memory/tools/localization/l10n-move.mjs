#!/usr/bin/env node
// l10n-move.mjs <tree> --moves <moves.json> [--write]
//
// Moves whole top-level declarations from one source file to another, unchanged, and fixes the imports: what the
// moved code uses is imported in its new file; the old file imports back what it still uses; every other importer
// of a moved name is pointed at the new file; imports nobody uses any more are dropped; a file left with nothing but
// imports is deleted. Stage B of the localization: the tables already split by language move into src/i18n/.
// TypeScript 7 (the tree's) has no JS refactoring API, so this is the "Move to file" refactor done with Babel.
//
// moves.json: { "moves": [ { "from": "src/data/sfSpace.ts", "to": "src/i18n/sfFacts.ja.ts", "names": ["SPACE_FACTS"],
//   "header": "// … (only when the file is new; \"\" when the moved text brings its own)",
//   "withComment": true (also the comments a blank line above), "edits": [{ "from": "…", "to": "…" }] (in the moved
//   text, each exactly once: a comment naming the old file), "comments": ["// …"] (top-level comment blocks of the
//   old file, exact text, that go along; "names" may then be []) }, … ],
//   "fileEdits": [{ "file": "src/…", "from": "…", "to": "…" }] (outside the moved text, each exactly once: a comment
//   that stays but names a moved file) }   applied in order.
// Checks, always (exit 2 on a failure, nothing written): each moved declaration (with its comments) appears verbatim
// in its new file; with the import declarations and the moved text taken out, every touched file is as it was;
// no import cycle between a new file and a file it imports from; with --write, tsc is clean afterwards.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const stamp = () => new Date().toISOString()
const log = (m) => console.error(`[${stamp()}] l10n-move: ${m}`)
const die = (m) => { console.error(`[${stamp()}] l10n-move: ERROR ${m}`); process.exit(2) }
process.on('uncaughtException', (e) => die(e.stack ?? String(e)))
const argv = process.argv.slice(2)
const WRITE = argv.includes('--write')
const mi = argv.indexOf('--moves')
const pos = argv.filter((a, i) => !a.startsWith('-') && (mi < 0 || i !== mi + 1))
if (pos.length !== 1 || (mi >= 0 && !argv[mi + 1])) die('usage: l10n-move.mjs <tree> [--moves <moves.json>, default data/moves.json here] [--write]')
const MOVES_FILE = mi >= 0 ? argv[mi + 1] : join(dirname(fileURLToPath(import.meta.url)), 'data/moves.json')
const TREE = resolve(pos[0]), SRC = join(TREE, 'src')
const MOVES = JSON.parse(readFileSync(MOVES_FILE, 'utf8')).moves ?? die('moves.json: no "moves" array')
const req = createRequire(join(TREE, 'package.json'))
const { parse } = req(req.resolve('@babel/parser'))
const traverse = req(req.resolve('@babel/traverse')).default
const rel = (abs) => relative(TREE, abs)
const P = (code, f) => { try { return parse(code, { sourceType: 'module', plugins: ['typescript', ...(f.endsWith('.tsx') ? ['jsx'] : [])] }) } catch (e) { die(`${rel(f)}: ${e.message}`) } }

// ---------------------------------------------------------------- files, in memory until the end
const walk = (d) => readdirSync(d).sort().flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [] })
const code = new Map(walk(SRC).map((f) => [f, readFileSync(f, 'utf8')]))
const original = new Map(code)
const deleted = new Set()
const resolveImport = (fromAbs, spec) => {
  if (!spec.startsWith('.')) return null
  const b = resolve(dirname(fromAbs), spec)
  for (const c of [b + '.ts', b + '.tsx', join(b, 'index.ts'), b]) if (code.has(c) || (existsSync(c) && statSync(c).isFile())) return c
  return null
}
const specTo = (fromAbs, toAbs) => { let r = relative(dirname(fromAbs), toAbs.replace(/\.tsx?$/, '')); if (!r.startsWith('.')) r = './' + r; return r }

// names a piece of code refers to, value and type positions (not object keys, not member properties)
const freeNames = (ast, inRange) => {
  const out = new Set()
  traverse(ast, {
    Identifier(p) {
      if (inRange && !inRange(p.node)) return
      if (p.parentPath.isImportSpecifier() || p.parentPath.isImportDefaultSpecifier() || p.parentPath.isImportNamespaceSpecifier()) return
      const par = p.parent
      const typeRef = (par.type === 'TSTypeReference' && par.typeName === p.node) || (par.type === 'TSQualifiedName' && par.left === p.node) ||
        (par.type === 'TSTypeQuery' && par.exprName === p.node) || (par.type === 'TSExpressionWithTypeArguments' && par.expression === p.node)
      if (!typeRef && !p.isReferencedIdentifier()) return
      out.add(p.node.name)
    },
  })
  return out
}
// a file's top level: imports by local name, declarations by name
const topLevel = (f, ast) => {
  const imports = new Map(), decls = new Map()
  for (const st of ast.program.body) {
    if (st.type === 'ImportDeclaration') {
      for (const sp of st.specifiers) imports.set(sp.local.name, { decl: st, sp, source: st.source.value, typeOnly: st.importKind === 'type' || sp.importKind === 'type' })
      continue
    }
    const exported = st.type === 'ExportNamedDeclaration'
    const d = exported ? st.declaration : st
    if (!d) continue
    const names = d.type === 'VariableDeclaration' ? d.declarations.map((x) => x.id.name) : d.id ? [d.id.name] : []
    for (const n of names) decls.set(n, { st, exported, isType: /^TS(TypeAlias|Interface|Enum)Declaration$/.test(d.type), count: d.declarations?.length ?? 1 })
  }
  return { imports, decls }
}
// the statement with the comments right above it (no blank line between)
const rangeOf = (src, st, allComments) => {
  let start = st.start
  for (const c of [...(st.leadingComments ?? [])].reverse()) {
    if (!allComments && /\n[ \t]*\n/.test(src.slice(c.end, start))) break
    start = c.start
  }
  let end = st.end
  if (src[end] === '\n') end++
  return { start, end }
}

// one import line in upstream's style: `import type { a, b }` when all are types, else `import { a, type b }`
const item = (s, st, sp) => ({ text: s.slice(sp.start, sp.end).replace(/^type\s+/, ''), isType: st.importKind === 'type' || sp.importKind === 'type' })
const importLine = (spec, items) => {
  const all = items.every((i) => i.isType)
  return `import ${all ? 'type ' : ''}{ ${items.map((i) => (!all && i.isType ? 'type ' : '') + i.text).join(', ')} } from '${spec}'`
}

// ---------------------------------------------------------------- the moves
const movedTexts = [] // { to, text, from }
const created = new Set()
for (const mv of MOVES) {
  const from = join(TREE, mv.from), to = join(TREE, mv.to)
  if (!code.has(from)) die(`${mv.from}: no such file (or already deleted)`)
  if (from === to) die(`${mv.from}: from = to`)
  const src = code.get(from), ast = P(src, from)
  const { imports, decls } = topLevel(from, ast)
  if (!mv.names.length && !mv.comments?.length) die(`${mv.from}: a move with no names and no comments`)
  const sts = mv.names.map((n) => {
    const d = decls.get(n) ?? die(`${mv.from}: no top-level declaration ${n}`)
    if (d.count !== 1) die(`${mv.from}: ${n} is declared together with other names`)
    return { n, ...d }
  })
  const ranges = sts.map((s) => ({ ...s, ...rangeOf(src, s.st, mv.withComment) }))
  for (const c of mv.comments ?? []) {
    // a whole top-level comment block: starts a line, ends a line, occurs once, and is made of comments only
    const at = src.indexOf(c)
    if (at < 0 || src.indexOf(c, at + 1) >= 0) die(`${mv.from}: comment '${c.slice(0, 40)}…' does not occur exactly once`)
    if ((at > 0 && src[at - 1] !== '\n') || src[at + c.length] !== '\n') die(`${mv.from}: comment '${c.slice(0, 40)}…' is not whole lines`)
    const inside = ast.comments.filter((k) => k.start >= at && k.end <= at + c.length)
    if (!inside.length || inside[0].start !== at || inside.at(-1).end !== at + c.length || ast.program.body.some((st) => st.start < at + c.length && st.end > at)) die(`${mv.from}: '${c.slice(0, 40)}…' is not a top-level comment block`)
    ranges.push({ start: at, end: at + c.length + 1 })
  }
  ranges.sort((a, b) => a.start - b.start)
  const cut = ranges.map((r) => src.slice(r.start, r.end).replace(/\n*$/, '\n')).join('\n')
  // explicit edits to the moved text (a comment naming the old file), each must apply exactly once
  let text = cut
  for (const e of mv.edits ?? []) {
    if (text.split(e.from).length !== 2) die(`${mv.from}: edit '${e.from}' does not occur exactly once in the moved text`)
    text = text.replace(e.from, e.to)
    log(`${mv.to}: edit in the moved text: '${e.from}' → '${e.to}'`)
  }
  const inMoved = (n) => ranges.some((r) => n.start >= r.start && n.end <= r.end)
  // what the moved code needs from the old file's top level
  const need = [...freeNames(ast, inMoved)].filter((n) => !mv.names.includes(n))
  const toImports = [] // { source (abs), name, local, typeOnly }
  for (const n of need) {
    const im = imports.get(n)
    if (im) {
      const abs = resolveImport(from, im.source)
      const imported = im.sp.type === 'ImportSpecifier' ? (im.sp.imported.name ?? im.sp.imported.value) : im.sp.type === 'ImportDefaultSpecifier' ? 'default' : die(`${mv.from}: the moved code uses namespace import ${n}`)
      toImports.push({ source: abs ?? im.source, external: !abs, name: imported, local: n, typeOnly: im.typeOnly })
      continue
    }
    const d = decls.get(n)
    if (d) {
      if (!d.exported) die(`${mv.from}: the moved code uses ${n}, which stays there and is not exported; move it too or export it`)
      toImports.push({ source: from, external: false, name: n, local: n, typeOnly: d.isType })
    }
    // otherwise a global (Object, Math, Record …) or a name declared inside the moved code
  }
  // the new file
  const addImports = (fileAbs, s, list) => {
    const fast = P(s, fileAbs)
    const have = topLevel(fileAbs, fast).imports
    const bySource = new Map()
    for (const x of list) {
      if (have.has(x.local)) continue
      if (!x.external && x.source === fileAbs) continue
      const spec = x.external ? x.source : specTo(fileAbs, x.source)
      const k = spec + (x.typeOnly ? ' type' : '')
      if (!bySource.has(k)) bySource.set(k, { spec, typeOnly: x.typeOnly, names: [] })
      const one = x.name === x.local ? x.name : `${x.name} as ${x.local}`
      if (!bySource.get(k).names.includes(one)) bySource.get(k).names.push(one)
    }
    const lines = [...bySource.values()].map((b) => `import ${b.typeOnly ? 'type ' : ''}{ ${b.names.join(', ')} } from '${b.spec}'\n`).join('')
    if (!lines) return s
    const last = fast.program.body.filter((x) => x.type === 'ImportDeclaration').pop()
    if (last) { const at = s.indexOf('\n', last.end) + 1; return s.slice(0, at) + lines + s.slice(at) }
    return lines + '\n' + s
  }
  let toSrc = code.get(to)
  if (toSrc === undefined) {
    const h = mv.header ?? die(`${mv.to} is new: give the move a "header" comment ("" when the moved text brings its own)`)
    toSrc = h ? h + '\n\n' : ''
    created.add(to)
  } else toSrc = toSrc.replace(/\n*$/, '\n\n')
  toSrc = addImports(to, toSrc + text, toImports)
  code.set(to, toSrc)
  movedTexts.push({ to, text, from, pieces: ranges.map((r) => src.slice(r.start, r.end).replace(/\n*$/, '')) })
  // the old file without the moved statements
  let rest = src
  for (const r of [...ranges].reverse()) {
    const before = rest.slice(0, r.start), after = rest.slice(r.end)
    rest = !before.trim() ? after.replace(/^\n+/, '') : !after.trim() ? before.replace(/\n+$/, '\n') : before.replace(/\n+$/, '\n') + '\n' + after.replace(/^\n+/, '') // one blank line at the cut
  }
  code.set(from, rest)
  // every file that imports a moved name from the old file (the old file itself included) now imports it from the new one
  for (const [f, s] of code) {
    if (deleted.has(f)) continue
    const a = P(s, f)
    const edits = []
    for (const st of a.program.body) {
      if (st.type === 'ExportNamedDeclaration' && st.source && resolveImport(f, st.source.value) === from && st.specifiers.some((sp) => mv.names.includes(sp.local.name))) die(`${rel(f)}: re-exports a moved name; not handled`)
      if (st.type === 'ExportAllDeclaration' && resolveImport(f, st.source.value) === from) die(`${rel(f)}: export * from ${mv.from}; not handled`)
      if (st.type !== 'ImportDeclaration' || resolveImport(f, st.source.value) !== from) continue
      const movedSp = st.specifiers.filter((sp) => sp.type === 'ImportSpecifier' && mv.names.includes(sp.imported.name ?? sp.imported.value))
      if (!movedSp.length) continue
      if (st.specifiers.some((sp) => sp.type !== 'ImportSpecifier')) die(`${rel(f)}: default or namespace import from ${mv.from}; not handled`)
      const keep = st.specifiers.filter((sp) => !movedSp.includes(sp)).map((sp) => item(s, st, sp))
      const moved = importLine(specTo(f, to), movedSp.map((sp) => item(s, st, sp)))
      edits.push({ start: st.start, end: st.end, text: (keep.length ? importLine(st.source.value, keep) + '\n' : '') + moved })
    }
    let t = s
    for (const e of edits.sort((x, y) => y.start - x.start)) t = t.slice(0, e.start) + e.text + t.slice(e.end)
    code.set(f, t)
  }
  // the old file: does it still use a moved name? (its own import from the new file was added above only if it imported
  // the name before; a name it declared itself and still uses needs a new import)
  {
    const s = code.get(from), a = P(s, from)
    const used = freeNames(a, (n) => !a.program.body.some((st) => st.type === 'ImportDeclaration' && n.start >= st.start && n.end <= st.end))
    const back = mv.names.filter((n) => used.has(n)).map((n) => ({ source: to, external: false, name: n, local: n, typeOnly: false }))
    for (const b of back) if (!sts.find((x) => x.n === b.name).exported) die(`${mv.from} still uses ${b.name}, which is not exported; it cannot be imported back from ${mv.to}`)
    code.set(from, addImports(from, s, back))
  }
  log(`${mv.from} → ${mv.to}: ${[...mv.names, ...(mv.comments ?? []).map(() => 'a comment')].join(', ')}${toImports.length ? `; imports ${toImports.map((x) => x.local).join(', ')}` : ''}`)
}

// ---------------------------------------------------------------- drop unused imports in every changed file; delete empty files
for (const [f, s] of code) {
  if (s === original.get(f)) continue
  const a = P(s, f)
  const used = freeNames(a, (n) => !a.program.body.some((st) => st.type === 'ImportDeclaration' && n.start >= st.start && n.end <= st.end))
  const edits = []
  for (const st of a.program.body.filter((x) => x.type === 'ImportDeclaration' && x.specifiers.length)) {
    const keep = st.specifiers.filter((sp) => used.has(sp.local.name))
    if (keep.length === st.specifiers.length) continue
    if (st.specifiers.some((sp) => sp.type !== 'ImportSpecifier') && keep.length) die(`${rel(f)}: would prune part of a default/namespace import`)
    const end = s[st.end] === '\n' ? st.end + 1 : st.end
    edits.push(keep.length ? { start: st.start, end: st.end, text: importLine(st.source.value, keep.map((sp) => item(s, st, sp))) } : { start: st.start, end, text: '' })
  }
  let t = s
  for (const e of edits.sort((x, y) => y.start - x.start)) t = t.slice(0, e.start) + e.text + t.slice(e.end)
  t = t.replace(/^\n+/, '')
  const body = P(t, f).program.body
  if (!body.length || body.every((st) => st.type === 'ImportDeclaration')) {
    if (body.length) die(`${rel(f)}: left with only imports`)
    deleted.add(f); code.delete(f)
    log(`${rel(f)}: empty after the moves, deleted`)
    continue
  }
  code.set(f, t)
}
// a new file gets one import line per source (the moves added a line each)
for (const f of created) {
  if (!code.has(f)) continue
  const s = code.get(f), imps = P(s, f).program.body.filter((x) => x.type === 'ImportDeclaration')
  if (imps.some((st) => st.specifiers.some((sp) => sp.type !== 'ImportSpecifier'))) die(`${rel(f)}: a default or namespace import in a new file; not handled`)
  const bySpec = new Map()
  for (const st of imps) { const k = st.source.value; if (!bySpec.has(k)) bySpec.set(k, []); for (const sp of st.specifiers) bySpec.get(k).push(item(s, st, sp)) }
  if (bySpec.size === imps.length) continue
  const block = [...bySpec].map(([k, items]) => importLine(k, items) + '\n').join('')
  code.set(f, s.slice(0, imps[0].start) + block + s.slice(s.indexOf('\n', imps.at(-1).end) + 1))
  if (s.slice(imps[0].start, imps.at(-1).end).split('\n').length !== imps.length) die(`${rel(f)}: its imports are not one line each, one after another`)
}
// edits outside the moved text (a comment that stays but names a moved file), each exactly once, in a file still there
const FILE_EDITS = JSON.parse(readFileSync(MOVES_FILE, 'utf8')).fileEdits ?? []
for (const e of FILE_EDITS) {
  const f = join(TREE, e.file), s = code.get(f) ?? die(`fileEdits: ${e.file} is not there after the moves`)
  if (s.split(e.from).length !== 2) die(`fileEdits: '${e.from}' does not occur exactly once in ${e.file}`)
  code.set(f, s.replace(e.from, e.to))
  log(`${e.file}: edit '${e.from}' → '${e.to}'`)
}
// importers of a deleted file must have been redirected already
for (const [f, s] of code) for (const st of P(s, f).program.body) if ((st.type === 'ImportDeclaration' || st.source) && st.source && deleted.has(resolveImport(f, st.source.value) ?? '')) die(`${rel(f)} still imports the deleted ${st.source.value}`)

// ---------------------------------------------------------------- checks
const noImports = (s, f) => { const a = P(s, f); let t = s; for (const st of a.program.body.filter((x) => x.type === 'ImportDeclaration').sort((x, y) => y.start - x.start)) t = t.slice(0, st.start) + t.slice(st.end); return t.replace(/\s+/g, ' ').trim() }
const problems = []
for (const m of movedTexts) if (!(code.get(m.to) ?? '').includes(m.text)) problems.push(`${rel(m.to)} does not hold the moved text from ${rel(m.from)} verbatim`)
for (const f of new Set([...original.keys(), ...code.keys()])) {
  const before = original.get(f), after = code.get(f)
  if (before === after) continue
  let b = before ?? '', a = after ?? ''
  for (const e of FILE_EDITS) if (join(TREE, e.file) === f) b = b.replace(e.from, e.to)
  for (const m of movedTexts) { if (m.from === f) for (const pc of m.pieces) { if (!b.includes(pc)) problems.push(`${rel(f)}: a moved piece is not in the original`); b = b.replace(pc, '') } if (m.to === f) a = a.replace(m.text.replace(/\n$/, ''), '') }
  if (created.has(f)) { const h = MOVES.find((mv) => join(TREE, mv.to) === f).header; if (h) a = a.replace(h, '') }
  if (noImports(b, f) !== noImports(a, f)) problems.push(`${rel(f)}: changes besides the moved declarations and the imports`)
}
// a new file and a file it imports values from must not import each other (a const read during module load would be
// in its temporal dead zone)
const valueDeps = (f) => new Set(P(code.get(f), f).program.body.filter((st) => st.type === 'ImportDeclaration' && st.importKind !== 'type' && st.specifiers.some((sp) => sp.importKind !== 'type')).map((st) => resolveImport(f, st.source.value)).filter(Boolean))
for (const m of new Set(movedTexts.map((x) => x.to))) for (const d of valueDeps(m)) if (code.has(d) && valueDeps(d).has(m)) problems.push(`import cycle: ${rel(m)} ↔ ${rel(d)}`)
if (problems.length) die(`checks failed, nothing written:\n  ${problems.join('\n  ')}`)
const changed = [...code].filter(([f, s]) => original.get(f) !== s)
log(`${MOVES.length} moves: ${changed.length} files changed (${created.size} new), ${deleted.size} deleted; moved text verbatim, only imports changed elsewhere`)
for (const [f] of changed) console.log(`${created.has(f) ? 'NEW' : 'CHANGED'}\t${rel(f)}`)
for (const f of deleted) console.log(`DELETED\t${rel(f)}`)
if (!WRITE) { log('dry run: nothing written (--write to apply)'); process.exit(0) }
for (const [f, s] of changed) writeFileSync(f, s)
for (const f of deleted) unlinkSync(f)
try { execFileSync(process.execPath, [join(TREE, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', join(TREE, 'tsconfig.json')], { cwd: TREE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }) } catch (e) {
  die(`tsc after the moves:\n${((e.stdout ?? '') + (e.stderr ?? '')).slice(0, 3000) || e.message}`)
}
log('written; tsc: clean')
