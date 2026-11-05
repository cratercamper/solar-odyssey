#!/usr/bin/env node
// l10n-records.mjs <tree> --spec <records.json> [--write] [--dump <dir>]   (--dump: write the changed files under <dir>)
//
// Stage C of the localization: records that hold both languages side by side (name / nameEn, [ja, en] pairs,
// { ja, en } objects, an en: {…} sub-object) give their texts to src/i18n/, as ui() topics keyed by the record's id
// (upstream's own form for record texts: missionsJa: Record<string, MissionText>). The records lose those fields,
// and so do their types, so tsc finds any reader the edit table missed.
//
// records.json:
//   { "tables": [ {
//       "file": "src/data/eclipses.ts", "decl": "ECLIPSES",        the declaration holding the records
//       "topic": "eclipses",                                         ui().eclipses  (src/i18n/eclipses.ja.ts / .en.ts)
//       "under": ["sv01", "parts"],                                  optional: where inside the topic the records go
//       "id": "id" | { "value": "sun" },                             the record key: a field (default "id") or one fixed key
//       "kind": "sibling" | "pair" | "jaen" | "enSub" | "pairValue", how the record holds its two languages
//       "fields": ["where", "note"],                                 the text fields (pairValue: none, the value is the pair)
//       "types": ["Eclipse"],                                        type declarations in that file that lose the fields
//       "nested": [ { "field": "moons", "how": "flat" | "keyed" | "positional", "fields": […], "types": […] } ]
//     } ],
//     "edits": [ { "file": "src/ui/EclipsePanel.tsx", "from": "t(e.where, e.whereEn)", "to": "ui().eclipses[e.id].where",
//                  "count": 1 } ],     exact text, applied in order after the records are rewritten; count is checked
//     "headers": { "ja": "// {file} の文言（日本語）", "en": "// The texts of {file} (English). Same keys as {topic}.ja.ts" } }
//
// kinds: sibling   x: 'ja', xEn: 'en'
//        pair      x: ['ja', 'en']
//        jaen      x: { ja: 'ja', en: 'en' }
//        enSub     x: 'ja' … en: { x: 'en' … }          (the Japanese at the top, the English in a sub-object)
//        pairValue the record itself is ['ja', 'en']    (Record<id, [ja, en]>, or one pair with a fixed id)
// The declaration: an array of records (or of consts naming records in the same file), an object of records, an object
// of arrays of records (POIS: body → its places), or one record with a fixed id.
// nested: keyed      parts: { <id>: {…} }  under the record
//         positional steps: [{…}, …]       under the record, by index
//         flat       moons sit in the topic beside their parent, keyed by their own id; the topic's record type is
//                    the union (PlanetText | MoonText)
// A nested type declared in another file is split there, by the table whose "types" names it (ShipPart).
// A text must be a plain literal (string, template without ${…}, or an array of them); anything built from code
// stops the script: that case is for stage D, by hand.
// Checks before writing (exit 2, nothing written): every text occurs verbatim in its topic's catalog file (in the
// file, not checked under its id: the ids come from the same records, and a reader that looks up a wrong id is
// not caught here); every edit applied exactly `count` times; no id twice in one place; the named declaration keeps
// no field of its table (other declarations, `{ ja, en }` objects and `en:` parts are left to tsc, through the
// record types). After writing (--write): tsc clean, else exit 2 with the tree written.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const stamp = () => new Date().toISOString()
const log = (m) => console.error(`[${stamp()}] l10n-records: ${m}`)
const die = (m) => { console.error(`[${stamp()}] l10n-records: ERROR ${m}`); process.exit(2) }
process.on('uncaughtException', (e) => die(e.stack ?? String(e)))
const argv = process.argv.slice(2)
const WRITE = argv.includes('--write')
const si = argv.indexOf('--spec'), di = argv.indexOf('--dump')
const DUMP = di >= 0 ? argv[di + 1] : null // write the would-be files there, also when a check fails (to look at them)
const pos = argv.filter((a, i) => !a.startsWith('-') && (si < 0 || i !== si + 1) && (di < 0 || i !== di + 1))
if (pos.length !== 1 || (si >= 0 && !argv[si + 1])) die('usage: l10n-records.mjs <tree> [--spec <records.json>, default data/records.json here] [--write]')
const TREE = resolve(pos[0]), SRC = join(TREE, 'src'), I18N = join(SRC, 'i18n')
const SPEC = JSON.parse(readFileSync(si >= 0 ? argv[si + 1] : join(dirname(fileURLToPath(import.meta.url)), 'data/records.json'), 'utf8'))
const req = createRequire(join(TREE, 'package.json'))
const { parse } = req(req.resolve('@babel/parser'))
const traverse = req(req.resolve('@babel/traverse')).default
const rel = (abs) => relative(TREE, abs)
// the text type of a record type: Planet → PlanetText; a trailing Def / Spec is dropped (upstream: MissionDef → MissionText)
const textName = (t) => `${t.replace(/(?<=.)(Def|Spec)$/, '')}Text`
const P = (code, f) => { try { return parse(code, { sourceType: 'module', plugins: ['typescript', ...(f.endsWith('.tsx') ? ['jsx'] : [])] }) } catch (e) { die(`${rel(f)}: ${e.message}`) } }

const walk = (d) => readdirSync(d).sort().flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [] })
const code = new Map(walk(SRC).map((f) => [f, readFileSync(f, 'utf8')]))
const original = new Map(code)

// ---------------------------------------------------------------- reading the records
const keyName = (k) => k.type === 'Identifier' ? k.name : k.type === 'StringLiteral' ? k.value : k.type === 'NumericLiteral' ? String(k.value) : null
const propOf = (obj, name) => obj.properties.find((p) => p.type === 'ObjectProperty' && !p.computed && keyName(p.key) === name)
// a plain text: string, template without ${…}, or an array of those
const plain = (n) => n.type === 'StringLiteral' || (n.type === 'TemplateLiteral' && !n.expressions.length) ||
  (n.type === 'ArrayExpression' && n.elements.every((e) => e && plain(e)))
// a const string declared at the top of a file (for computed keys like [RADIO_MOON_ID]), followed through imports
const constString = (f, name, depth = 0) => {
  if (depth > 5) die(`${rel(f)}: ${name}: too many imports to follow`)
  const ast = P(code.get(f), f)
  for (const st of ast.program.body) {
    const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st
    if (d?.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id.name === name && v.init?.type === 'StringLiteral') return v.init.value
    if (st.type === 'ImportDeclaration') for (const sp of st.specifiers) if (sp.local.name === name && sp.type === 'ImportSpecifier') {
      const b = resolve(dirname(f), st.source.value)
      const t = [b + '.ts', b + '.tsx', join(b, 'index.ts')].find((c) => code.has(c)) ?? die(`${rel(f)}: cannot resolve ${st.source.value}`)
      return constString(t, sp.imported.name, depth + 1)
    }
  }
  die(`${rel(f)}: ${name} is not a const string`)
}
const idOf = (f, obj, spec) => {
  if (spec.id && typeof spec.id === 'object') return spec.id.value
  const p = propOf(obj, spec.id ?? 'id') ?? die(`${rel(f)}:${obj.loc.start.line}: record without '${spec.id ?? 'id'}'`)
  if (p.value.type === 'StringLiteral') return p.value.value
  if (p.value.type === 'Identifier') return constString(f, p.value.name)
  die(`${rel(f)}:${obj.loc.start.line}: the record's id is not a literal`)
}
const src = (f, n) => code.get(f).slice(n.start, n.end)

// texts of one record: { field: { ja: code, en: code } }, plus the property nodes to remove
const textsOf = (f, obj, spec, removes) => {
  const out = {}
  const need = (n, what) => { if (!plain(n)) die(`${rel(f)}:${n.loc.start.line}: ${what} is built from code (stage D)`); return src(f, n) }
  if (spec.kind === 'sibling') for (const x of spec.fields) {
    const a = propOf(obj, x), b = propOf(obj, x + 'En')
    if (!a && !b) continue // an optional field this record does not have
    if (!a || !b) die(`${rel(f)}:${obj.loc.start.line}: ${x} without ${x}En or the other way round`)
    out[x] = { ja: need(a.value, x), en: need(b.value, x + 'En') }
    removes.push(a, b)
  } else if (spec.kind === 'pair') for (const x of spec.fields) {
    const a = propOf(obj, x)
    if (!a) continue
    if (a.value.type !== 'ArrayExpression' || a.value.elements.length !== 2) die(`${rel(f)}:${a.loc.start.line}: ${x} is not a [ja, en] pair`)
    out[x] = { ja: need(a.value.elements[0], x + '[0]'), en: need(a.value.elements[1], x + '[1]') }
    removes.push(a)
  } else if (spec.kind === 'jaen') for (const x of spec.fields) {
    const a = propOf(obj, x)
    if (!a) continue
    const ja = a.value.type === 'ObjectExpression' && propOf(a.value, 'ja'), en = a.value.type === 'ObjectExpression' && propOf(a.value, 'en')
    if (!ja || !en || a.value.properties.length !== 2) die(`${rel(f)}:${a.loc.start.line}: ${x} is not { ja, en }`)
    out[x] = { ja: need(ja.value, x + '.ja'), en: need(en.value, x + '.en') }
    removes.push(a)
  } else if (spec.kind === 'enSub') {
    const sub = propOf(obj, 'en') ?? die(`${rel(f)}:${obj.loc.start.line}: no en: {…}`)
    if (sub.value.type !== 'ObjectExpression') die(`${rel(f)}:${sub.loc.start.line}: en is not an object`)
    for (const x of spec.fields) {
      const a = propOf(obj, x), b = propOf(sub.value, x)
      if (!a && !b) continue
      if (!a || !b) die(`${rel(f)}:${obj.loc.start.line}: ${x} only on one side`)
      out[x] = { ja: need(a.value, x), en: need(b.value, 'en.' + x) }
      removes.push(a)
    }
    const left = sub.value.properties.filter((p) => !spec.fields.includes(keyName(p.key)))
    if (left.length) die(`${rel(f)}:${sub.loc.start.line}: en: {…} holds ${left.map((p) => keyName(p.key)).join(', ')}, not in "fields"`)
    removes.push(sub)
  } else die(`${spec.file}: unknown kind ${spec.kind}`)
  for (const nest of spec.nested ?? []) {
    const p = propOf(obj, nest.field)
    if (!p) continue
    if (p.value.type === 'Identifier') { out[nest.field] = { ref: p.value.name }; continue } // e.g. parts: SHIP_PARTS (another table fills it)
    if (p.value.type !== 'ArrayExpression') die(`${rel(f)}:${p.loc.start.line}: ${nest.field} is not an array`)
    const sub = { ...spec, ...nest, nested: nest.nested }
    const kids = p.value.elements.map((e, i) => {
      if (e?.type !== 'ObjectExpression') die(`${rel(f)}:${p.loc.start.line}: ${nest.field}[${i}] is not an object`)
      return { key: nest.how === 'positional' ? i : idOf(f, e, sub), texts: textsOf(f, e, sub, removes) }
    })
    out[nest.field] = { how: nest.how, kids }
  }
  return out
}

// ---------------------------------------------------------------- the tables
const topics = new Map() // topic → { entries: Map(key → texts), files: Set }
const removesByFile = new Map()
const typedTables = [] // specs with "types": their types are split into <Type> (structure) and <Type>Text (texts)
for (const spec of SPEC.tables) {
  const f = join(TREE, spec.file)
  if (!code.has(f)) die(`${spec.file}: no such file`)
  const ast = P(code.get(f), f)
  let init = null
  for (const st of ast.program.body) {
    const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st
    if (d?.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id.name === spec.decl) init = v.init
  }
  if (!init) die(`${spec.file}: no top-level ${spec.decl}`)
  while (init.type === 'TSAsExpression' || init.type === 'TSSatisfiesExpression') init = init.expression
  const removes = removesByFile.get(f) ?? []
  removesByFile.set(f, removes)
  const records = [] // { key, texts }
  const constObj = (name) => {
    for (const st of ast.program.body) {
      const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st
      if (d?.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id.name === name) {
        let i = v.init; while (i.type === 'TSAsExpression' || i.type === 'TSSatisfiesExpression') i = i.expression
        if (i.type === 'ObjectExpression') return i
      }
    }
    die(`${spec.file}: ${name} is not a const object in this file`)
  }
  if (spec.kind === 'pairValue') {
    const one = (n, key) => {
      if (n.type !== 'ArrayExpression' || n.elements.length !== 2 || !n.elements.every(plain)) die(`${spec.file}:${n.loc.start.line}: not a plain [ja, en] pair`)
      records.push({ key, texts: { ja: src(f, n.elements[0]), en: src(f, n.elements[1]) }, value: true })
      removes.push({ pairValue: n })
    }
    if (init.type === 'ObjectExpression') for (const p of init.properties) one(p.value, p.computed ? (p.key.type === 'Identifier' ? constString(f, p.key.name) : die(`${spec.file}: computed key`)) : keyName(p.key))
    else if (spec.id?.value !== undefined) one(init, spec.id.value)
    else die(`${spec.file}: ${spec.decl}: pairValue needs an object of pairs, or one pair with "id": { "value" }`)
  } else if (init.type === 'ArrayExpression') {
    for (const e of init.elements) {
      const obj = e.type === 'Identifier' ? constObj(e.name) : e.type === 'ObjectExpression' ? e : die(`${spec.file}:${e.loc.start.line}: element is neither a record nor a const`)
      records.push({ key: idOf(f, obj, spec), texts: textsOf(f, obj, spec, removes) })
    }
  } else if (init.type === 'ObjectExpression' && spec.id?.value !== undefined) {
    records.push({ key: spec.id.value, texts: textsOf(f, init, spec, removes) })
  } else if (init.type === 'ObjectExpression') {
    for (const p of init.properties) {
      // an object of arrays of records (POIS: body → its places): each record keyed by its own id
      if (p.value.type === 'ArrayExpression') {
        for (const e of p.value.elements) {
          if (e?.type !== 'ObjectExpression') die(`${spec.file}:${p.loc.start.line}: ${keyName(p.key)}: element is not a record`)
          records.push({ key: idOf(f, e, spec), texts: textsOf(f, e, spec, removes) })
        }
        continue
      }
      if (p.value.type !== 'ObjectExpression') die(`${spec.file}:${p.loc.start.line}: value is not a record`)
      const key = p.computed ? (p.key.type === 'Identifier' ? constString(f, p.key.name) : die(`${spec.file}: computed key`)) : keyName(p.key)
      records.push({ key, texts: textsOf(f, p.value, spec, removes) })
    }
  } else die(`${spec.file}: ${spec.decl} is not an array or object of records (or of arrays of records)`)
  // flat nesting: the nested records sit in the topic beside their parent, keyed by their own id (each moon after its planet)
  const hoist = (r) => {
    const out = [r]
    for (const [x, v] of Object.entries(r.texts)) if (v.how === 'flat') { delete r.texts[x]; for (const k of v.kids) out.push(...hoist({ key: k.key, texts: k.texts })) }
    return out
  }
  records.splice(0, records.length, ...records.flatMap(hoist))
  if (spec.types?.length) typedTables.push(spec)
  if (!topics.has(spec.topic)) topics.set(spec.topic, { root: new Map(), files: new Set() })
  const T = topics.get(spec.topic)
  T.files.add(spec.file)
  // place under spec.under inside the topic
  let at = T.root
  for (const k of spec.under ?? []) {
    if (!at.has(k)) at.set(k, { texts: {} })
    const node = at.get(k)
    if (!node.children) node.children = new Map()
    at = node.children
  }
  for (const r of records) {
    if (at.has(r.key)) die(`${spec.topic}${(spec.under ?? []).map((k) => `.${k}`).join('')}: key ${r.key} twice`)
    at.set(r.key, r)
  }
  log(`${spec.file} ${spec.decl}: ${records.length} records → ui().${spec.topic}${(spec.under ?? []).map((k) => `.${k}`).join('')}`)
}

// ---------------------------------------------------------------- the catalogs
// display width: CJK and full-width forms count 2 (line breaking of the catalogs)
const width = (x) => [...x].reduce((w, c) => w + (c.codePointAt(0) >= 0x2e80 ? 2 : 1), 0)
const ident = (k) => typeof k === 'number' ? null : /^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k.replace(/'/g, "\\'")}'`
// the TypeScript type of a node of texts
const typeOfTexts = (texts) => {
  if (texts === undefined) return 'string'
  const parts = []
  for (const [x, v] of Object.entries(texts)) {
    if (v.ref) continue
    if (v.kids) {
      const kidT = mergeTypes(v.kids.map((k) => typeOfTexts(k.texts)))
      parts.push(`${x}: ${v.how === 'positional' ? `${kidT}[]` : `Record<string, ${kidT}>`}`)
    } else parts.push(`${x}${'?'}: ${v.ja.trimStart().startsWith('[') ? 'string[]' : 'string'}`)
  }
  return `{ ${parts.join('; ')} }`
}
// a field is optional if some record lacks it: build the union of fields, optional where missing
const mergeTypes = (ts) => {
  const seen = new Map(); let n = 0
  for (const t of ts) { n++; for (const m of t.slice(2, -2).split('; ').filter(Boolean)) { const [k, ...r] = m.split(': '); const name = k.replace(/\?$/, ''); const s = seen.get(name) ?? { type: r.join(': '), count: 0 }; s.count++; seen.set(name, s) } }
  return `{ ${[...seen].map(([k, s]) => `${k}${s.count < n ? '?' : ''}: ${s.type}`).join('; ')} }`
}
const emit = (lang, texts, indent) => {
  const pad = ' '.repeat(indent)
  const fields = []
  for (const [x, v] of Object.entries(texts)) {
    if (v.ref) continue
    if (v.kids) {
      if (v.how === 'positional') {
        const kids = v.kids.map((k) => emitRecord(lang, k, indent + 4, true)), one = `[${kids.join(', ')}]`
        fields.push(width(one) + indent < 110 ? `${x}: ${one}` : `${x}: [\n${kids.map((k) => `${pad}    ${k},\n`).join('')}${pad}  ]`)
      }
      else fields.push(`${x}: {\n${v.kids.map((k) => `${pad}    ${ident(k.key)}: ${emitRecord(lang, k, indent + 4)},\n`).join('')}${pad}  }`)
    } else fields.push(`${x}: ${v[lang]}`)
  }
  return fields
}
const emitRecord = (lang, r, indent, inline) => {
  if (r.value) return r.texts[lang]
  const fields = emit(lang, r.texts, indent)
  if (r.children) for (const [k, c] of r.children) fields.push(`${ident(k)}: ${emitRecord(lang, c, indent + 2)}`)
  const one = `{ ${fields.join(', ')} }`
  if (inline || (width(one) + indent < 110 && !one.includes('\n'))) return one
  const pad = ' '.repeat(indent)
  return `{\n${fields.map((x) => `${pad}  ${x},\n`).join('')}${pad}}`
}
const catalogs = [] // { topic, lang, file, text }
const typeOfTopic = (T) => {
  // all records of a topic have the same shape except where nested children (under) sit
  const recs = [...T.root.values()]
  if (recs.every((r) => r.value)) return 'Record<string, string>'
  const ts = recs.map((r) => {
    let t = typeOfTexts(r.texts)
    if (r.children) {
      const kidT = mergeTypes([...r.children.values()].flatMap((c) => c.children ? [...c.children.values()].map((g) => typeOfTexts(g.texts)) : [typeOfTexts(c.texts)]))
      t = t.slice(0, -2) + `${t === '{  }' ? '' : '; '}${[...r.children.keys()].map((k) => `${k}: Record<string, ${kidT}>`).join('; ')} }`
    }
    return t
  })
  return `Record<string, ${mergeTypes(ts)}>`
}
for (const [topic, T] of topics) {
  const files = [...T.files].map((f) => f.replace(/^src\//, '')).join(', ')
  const H = SPEC.headers ?? die('records.json: no "headers"')
  const typed = SPEC.tables.find((t) => t.topic === topic && t.types?.length)
  // a flat-nested type's records sit in the same topic: the record type is the union (PlanetText | MoonText)
  const flatTypes = (sp) => (sp.nested ?? []).flatMap((n) => (n.how === 'flat' ? [...(n.types ?? []), ...flatTypes(n)] : []))
  const textTypes = typed ? [typed.types[0], ...flatTypes(typed)].map(textName) : []
  const type = typed ? `Record<string, ${textTypes.join(' | ')}>` : typeOfTopic(T)
  let typeImport = ''
  if (typed) { let sp = relative(I18N, join(TREE, typed.file)).replace(/\.tsx?$/, ''); if (!sp.startsWith('.')) sp = './' + sp; typeImport = `import type { ${textTypes.join(', ')} } from '${sp}'\n\n` }
  for (const lang of ['ja', 'en']) {
    const name = `${topic}${lang === 'ja' ? 'Ja' : 'En'}`
    const head = H[lang].replace('{file}', files).replace('{topic}', topic)
    const body = [...T.root].map(([k, r]) => `  ${ident(k) ?? k}: ${emitRecord(lang, r, 2)},\n`).join('')
    // the ids stay literal in `texts` (satisfies), and the English is typed against that shape, so a misspelled or
    // unknown id in <topic>.en.ts is a type error; the exported catalog is the wide Record, so readers index it by
    // any id string
    const shape = `${topic[0].toUpperCase()}${topic.slice(1)}Ja`
    const text = lang === 'ja'
      ? `${typeImport}${head}\n\nconst texts = {\n${body}} satisfies ${type}\n\n// 英語の ${topic}.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー\nexport type ${shape} = typeof texts\nexport const ${name}: ${type} = texts\n`
      : `import type { ${shape} } from './${topic}.ja'\nimport type { Translation } from './translation'\n\n${head}\n\nexport const ${name}: Translation<${shape}> = {\n${body}}\n`
    const file = join(I18N, `${topic}.${lang}.ts`)
    if (code.has(file)) die(`${rel(file)} exists already: give the table another topic`)
    catalogs.push({ topic, lang, file, text })
  }
}

// ---------------------------------------------------------------- rewriting the sources
// removing properties: each run of adjacent removed properties of one object is cut once. A run alone on its own
// lines goes with its lines; one inside a line goes from the kept property before it (or up to the one after it).
const cutProps = (s, props) => {
  const edits = []
  const byParent = new Map()
  for (const { node, parent } of props) { if (!byParent.has(parent)) byParent.set(parent, new Set()); byParent.get(parent).add(node) }
  for (const [parent, gone] of byParent) {
    const ps = parent.properties
    for (let i = 0; i < ps.length; i++) {
      if (!gone.has(ps[i])) continue
      let j = i; while (j + 1 < ps.length && gone.has(ps[j + 1])) j++
      const first = ps[i], last = ps[j], before = ps[i - 1], after = ps[j + 1]
      let start = first.start
      for (const c of first.leadingComments ?? []) if (!before || c.start > before.end) start = Math.min(start, c.start)
      let end = last.end; if (s[end] === ',') end++
      const ls = s.lastIndexOf('\n', start - 1) + 1
      const le = s.indexOf('\n', end)
      if (!s.slice(ls, start).trim() && !s.slice(end, le).trim()) edits.push({ start: ls, end: le + 1 }) // whole lines
      else if (after) { let e = after.start; for (const c of after.leadingComments ?? []) e = Math.min(e, c.start); edits.push({ start, end: e }) }
      else if (before) edits.push({ start: before.end + (s[before.end] === ',' ? 0 : 0), end: last.end + (s[last.end] === ',' ? 1 : 0) })
      else edits.push({ start: parent.start + 1, end: parent.end - 1 })
      i = j
    }
  }
  return edits
}
// the property nodes with their parent objects, from one parse of the file (Babel gives no parent pointers)
const cutsByFile = new Map()
for (const [f, props] of removesByFile) {
  const ast = P(code.get(f), f)
  const want = new Set(props.filter((p) => !p.pairValue).map((p) => p.start))
  const found = []
  traverse(ast, { ObjectExpression(path) { for (const q of path.node.properties) if (want.has(q.start)) found.push({ node: q, parent: path.node }) } })
  if (found.length !== want.size) die(`${rel(f)}: found ${found.length} of ${want.size} properties to remove`)
  cutsByFile.set(f, found)
}
// the types: each table's type <T> loses its text fields, and a new type <T>Text right after it holds them (the
// Japanese field, with the /** … */ above it, verbatim; a pair or { ja, en } becomes string), as upstream's
// MissionText sits in data/missions.ts. A nested array of an inline type gives its texts as an array of the same shape.
const memberEdits = (s, lit, gone) => {
  // runs of adjacent removed members: whole lines when they stand alone, else from the end of the kept member's type
  // before the run to the end of the last removed member's type (the separator after it stays)
  const edits = [], ms = lit.members
  const typeEnd = (m) => m.typeAnnotation?.end ?? m.end
  for (let i = 0; i < ms.length; i++) {
    if (!gone.has(ms[i])) continue
    let j = i; while (j + 1 < ms.length && gone.has(ms[j + 1])) j++
    const first = ms[i], last = ms[j], before = ms[i - 1], after = ms[j + 1]
    let start = first.start
    for (const c of first.leadingComments ?? []) if (!before || c.start > before.end) start = Math.min(start, c.start)
    const ls = s.lastIndexOf('\n', start - 1) + 1, le = s.indexOf('\n', last.end)
    if (!s.slice(ls, start).trim() && !s.slice(last.end, le).trim()) edits.push({ start: ls, end: le + 1 })
    else if (before) edits.push({ start: typeEnd(before), end: typeEnd(last) })
    else edits.push({ start: first.start, end: after ? after.start : last.end })
    i = j
  }
  return edits
}
const splitLiteral = (s, lit, spec, edits, where) => {
  const ja = new Set(spec.fields ?? []), out = [], gone = new Set()
  for (const m of lit.members) {
    if (m.type !== 'TSPropertySignature') continue
    const name = keyName(m.key), opt = m.optional ? '?' : ''
    let start = m.start
    for (const c of m.leadingComments ?? []) start = Math.min(start, c.start)
    const lead = s.slice(start, m.start)
    if (ja.has(name)) {
      gone.add(m)
      const ann = s.slice(m.typeAnnotation.typeAnnotation.start, m.typeAnnotation.typeAnnotation.end)
      out.push(spec.kind === 'sibling' || spec.kind === 'enSub' ? lead + `${name}${opt}: ${ann}` : lead + `${name}${opt}: string`)
    } else if ((spec.kind === 'sibling' && ja.has(name.replace(/En$/, '')) && name.endsWith('En')) || (spec.kind === 'enSub' && name === 'en')) gone.add(m)
    else {
      const nest = (spec.nested ?? []).find((n) => n.field === name)
      if (!nest) continue
      const t = m.typeAnnotation.typeAnnotation
      const el = t.type === 'TSArrayType' ? t.elementType : die(`${where}: ${name} is not an array type`)
      const sub = { ...spec, ...nest }
      if (el.type === 'TSTypeLiteral') {
        const kids = splitLiteral(s, el, sub, edits, `${where}.${name}`)
        if (nest.how === 'flat') die(`${where}.${name}: flat nesting needs a named type`)
        out.push(`${lead}${name}${opt}: ${nest.how === 'positional' ? `{ ${kids.map((k) => k.trim()).join('; ')} }[]` : `Record<string, { ${kids.map((k) => k.trim()).join('; ')} }>`}`)
      } else if (el.type === 'TSTypeReference') {
        const child = el.typeName.name
        if (!(nest.types ?? []).includes(child)) die(`${where}.${name}: give the nested spec "types": ["${child}"]`)
        if (nest.how === 'keyed') out.push(`${lead}${name}${opt}: Record<string, ${textName(child)}>`)
        else if (nest.how === 'positional') out.push(`${lead}${name}${opt}: ${textName(child)}[]`)
      } else die(`${where}.${name}: element type not handled`)
    }
  }
  edits.push(...memberEdits(s, lit, gone))
  return out
}
const splitTypes = (f) => {
  let s = code.get(f)
  const ast = P(s, f), edits = []
  const want = new Map() // type name → spec (a nested spec for nested named types)
  const add = (spec) => { for (const t of spec.types ?? []) { if (want.has(t) && want.get(t) !== spec) continue; want.set(t, spec) } for (const n of spec.nested ?? []) add({ ...spec, ...n, nested: n.nested }) }
  for (const spec of typedTables.filter((t) => join(TREE, t.file) === f)) add(spec)
  const done = new Set()
  for (const st of ast.program.body) {
    const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st
    if (d?.type !== 'TSTypeAliasDeclaration' || !want.has(d.id.name)) continue
    if (d.typeAnnotation.type !== 'TSTypeLiteral') die(`${rel(f)}: type ${d.id.name} is not a { … } literal`)
    const name = d.id.name, spec = want.get(name)
    if (ast.program.body.some((x) => (x.type === 'ExportNamedDeclaration' ? x.declaration : x)?.id?.name === textName(name))) die(`${rel(f)}: ${textName(name)} exists already`)
    const members = splitLiteral(s, d.typeAnnotation, spec, edits, `${rel(f)}: ${name}`)
    if (!members.length) die(`${rel(f)}: type ${name} has none of ${spec.fields.join(', ')}`)
    const ml = members.map((m) => m.replace(/^\s*\n/, '').split('\n').map((l) => '  ' + l.trim()).join('\n')).join('\n')
    edits.push({ start: st.end, end: st.end, text: `\n\n/** ${name} の文言（日本語は src/i18n/${spec.topic}.ja.ts、英語は ${spec.topic}.en.ts） */\nexport type ${textName(name)} = {\n${ml}\n}` })
    done.add(name)
  }
  // a nested type declared in another file is split there, by the table whose "types" names it
  const elsewhere = new Set(typedTables.filter((t) => join(TREE, t.file) !== f).flatMap((t) => t.types))
  for (const t of want.keys()) if (!done.has(t) && !elsewhere.has(t)) die(`${rel(f)}: no type ${t} (and no table in another file names it in "types")`)
  return edits
}
const apply = (s, edits) => {
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  for (let i = 1; i < sorted.length; i++) if (sorted[i].end > sorted[i - 1].start) die('overlapping edits')
  for (const e of sorted) s = s.slice(0, e.start) + (e.text ?? '') + s.slice(e.end)
  return s
}
for (const [f] of removesByFile) {
  const s = code.get(f)
  code.set(f, apply(s, cutProps(s, cutsByFile.get(f))))
}
for (const f of new Set(typedTables.map((t) => join(TREE, t.file)))) code.set(f, apply(code.get(f), splitTypes(f)))
// pairValue tables: the declaration disappears entirely (its texts are the whole table); readers come from the edits
for (const spec of SPEC.tables.filter((t) => t.kind === 'pairValue')) {
  const f = join(TREE, spec.file), s = code.get(f), ast = P(s, f)
  const st = ast.program.body.find((st) => { const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st; return d?.type === 'VariableDeclaration' && d.declarations.some((v) => v.id.name === spec.decl) })
  let start = st.start
  for (const c of st.leadingComments ?? []) if (!/\n[ \t]*\n/.test(s.slice(c.end, st.start))) start = Math.min(start, c.start)
  let end = st.end; if (s[end] === '\n') end++
  const before = s.slice(0, start), after = s.slice(end)
  // keep the spacing it had: a blank line stays only where there was one before or after the declaration
  const blank = /\n[ \t]*\n$/.test(before) || /^[ \t]*\n/.test(after)
  code.set(f, before.replace(/\n+$/, '\n') + (after.trim() ? (blank ? '\n' : '') + after.replace(/^\n+/, '') : ''))
}
// the reader edits
for (const e of SPEC.edits ?? []) {
  const f = join(TREE, e.file), s = code.get(f) ?? (catalogs.find((c) => c.file === f) && die(`${e.file}: an edit in a catalog this run writes`)) ?? die(`${e.file}: no such file`)
  const n = s.split(e.from).length - 1
  if (n !== (e.count ?? 1)) die(`${e.file}: '${e.from}' occurs ${n} times, the edit table says ${e.count ?? 1}`)
  code.set(f, s.split(e.from).join(e.to))
}
// imports: ui where the edits brought it in; t / named from i18n/lang dropped where no longer used
// is the top-level binding `name` (an import) used: a value reference that resolves to it, or a type reference by name
const used = (ast, name) => {
  let u = false
  traverse(ast, {
    Program(pp) { const b = pp.scope.getBinding(name); if (b?.referencePaths.some((r) => r.scope.getBinding(name) === b)) u = true },
    TSTypeReference(pp) { const n = pp.node.typeName; if ((n.type === 'Identifier' ? n : n.left)?.name === name) u = true },
    TSTypeQuery(pp) { if (pp.node.exprName.name === name) u = true },
  })
  return u
}
for (const [f, s] of code) {
  if (s === original.get(f)) continue
  let t = s, ast = P(t, f)
  const origAst = P(original.get(f) ?? '', f)
  const imps = ast.program.body.filter((x) => x.type === 'ImportDeclaration')
  const toI18n = (st) => resolve(dirname(f), st.source.value) === I18N
  const toLang = (st) => resolve(dirname(f), st.source.value) === join(I18N, 'lang')
  let freeUi = false
  traverse(ast, { Identifier(pp) { if (pp.node.name === 'ui' && pp.isReferencedIdentifier() && !pp.scope.hasBinding('ui')) freeUi = true } })
  if (freeUi && !imps.some((st) => st.specifiers.some((sp) => sp.local.name === 'ui')) && !ast.program.body.some((st) => (st.type === 'ExportNamedDeclaration' ? st.declaration : st)?.declarations?.some?.((v) => v.id.name === 'ui'))) {
    const i = imps.find(toI18n)
    let spec = relative(dirname(f), I18N); if (!spec.startsWith('.')) spec = './' + spec
    if (i) { const last = i.specifiers.at(-1); t = t.slice(0, last.end) + ', ui' + t.slice(last.end) }
    else { const last = imps.at(-1); const at = last ? t.indexOf('\n', last.end) + 1 : 0; t = t.slice(0, at) + `import { ui } from '${spec}'\n` + (last ? '' : '\n') + t.slice(at) }
    ast = P(t, f)
  }
  for (const st of ast.program.body.filter((x) => x.type === 'ImportDeclaration').reverse()) {
    const drop = st.specifiers.filter((sp) => !used(ast, sp.local.name) && used(origAst, sp.local.name))
    if (!drop.length) continue
    const keep = st.specifiers.filter((sp) => !drop.includes(sp))
    if (keep.some((sp) => sp.type !== 'ImportSpecifier') || drop.some((sp) => sp.type !== 'ImportSpecifier')) die(`${rel(f)}: would prune a default or namespace import`)
    const text = keep.length ? `import ${st.importKind === 'type' ? 'type ' : ''}{ ${keep.map((sp) => t.slice(sp.start, sp.end)).join(', ')} } from '${st.source.value}'` : ''
    let end = st.end; if (!keep.length && t[end] === '\n') end++
    t = t.slice(0, st.start) + text + t.slice(end)
  }
  code.set(f, t)
}
// registration in ja.ts / en.ts (imports after the last import, entries at the end of the dictionary)
const newTopics = [...topics.keys()].sort()
for (const lang of ['ja', 'en']) {
  const f = join(I18N, `${lang}.ts`)
  let s = code.get(f)
  const suffix = lang === 'ja' ? 'Ja' : 'En'
  const ast = P(s, f)
  const last = ast.program.body.filter((x) => x.type === 'ImportDeclaration').pop() ?? die(`${lang}.ts has no imports`)
  const at = s.indexOf('\n', last.end) + 1
  s = s.slice(0, at) + newTopics.map((t) => `import { ${t}${suffix} } from './${t}.${lang}'\n`).join('') + s.slice(at)
  if (!/,\n}\n$/.test(s)) die(`${lang}.ts does not end with '…,\\n}\\n'`)
  s = s.slice(0, -2) + newTopics.map((t) => `  ${t}: ${t}${suffix},\n`).join('') + '}\n'
  code.set(f, s)
}
for (const c of catalogs) code.set(c.file, c.text)

// ---------------------------------------------------------------- checks
const problems = []
// every text verbatim in its catalog
const allTexts = (r, out = []) => {
  if (r.value) { out.push(r.texts); return out }
  for (const v of Object.values(r.texts ?? {})) { if (v.kids) for (const k of v.kids) allTexts(k, out); else if (!v.ref) out.push(v) }
  for (const c of r.children?.values() ?? []) allTexts(c, out)
  return out
}
let nTexts = 0
for (const [topic, T] of topics) for (const r of T.root.values()) for (const tx of allTexts(r)) for (const lang of ['ja', 'en']) {
  nTexts++
  if (!catalogs.find((c) => c.topic === topic && c.lang === lang).text.includes(tx[lang])) problems.push(`${topic}.${lang}: a text is not in the catalog verbatim: ${tx[lang].slice(0, 60)}`)
}
// no record keeps a field its table names
for (const spec of SPEC.tables) {
  const f = join(TREE, spec.file), s = code.get(f)
  const ast = P(s, f)
  const fields = spec.kind === 'sibling' ? spec.fields.flatMap((x) => [x, x + 'En']) : spec.kind === 'pairValue' ? [] : spec.fields
  for (const st of ast.program.body) {
    const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st
    if (d?.type !== 'VariableDeclaration') continue
    for (const v of d.declarations) if (v.id.name === spec.decl) {
      if (spec.kind === 'pairValue') { problems.push(`${spec.file}: ${spec.decl} is still declared`); continue }
      traverse(ast, { ObjectProperty(p) { if (p.node.start >= v.start && p.node.end <= v.end && fields.includes(keyName(p.node.key)) && plain(p.node.value)) problems.push(`${spec.file}:${p.node.loc.start.line}: ${keyName(p.node.key)} still in ${spec.decl}`) } })
    }
  }
}
for (const c of catalogs) P(c.text, c.file)
if (DUMP) for (const [f, s] of code) if (original.get(f) !== s) { const o = join(DUMP, rel(f)); execFileSync('mkdir', ['-p', dirname(o)]); writeFileSync(o, s) }
if (problems.length) die(`checks failed, nothing written (${problems.length}):\n  ${problems.slice(0, 12).join('\n  ')}${problems.length > 12 ? '\n  …' : ''}`)
const changed = [...code].filter(([f, s]) => original.get(f) !== s)
log(`${SPEC.tables.length} tables, ${nTexts} texts (${nTexts / 2} pairs) into ${topics.size} topics; ${(SPEC.edits ?? []).length} reader edits; ${changed.length} files changed`)
for (const [f] of changed) console.log(`${original.has(f) ? 'CHANGED' : 'NEW'}\t${rel(f)}`)
if (!WRITE) { log('dry run: nothing written (--write to apply)'); process.exit(0) }
for (const [f, s] of changed) writeFileSync(f, s)
let out = ''
try { execFileSync(process.execPath, [join(TREE, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', join(TREE, 'tsconfig.json')], { cwd: TREE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }) } catch (e) { out = (e.stdout ?? '') + (e.stderr ?? '') || e.message }
if (out) { console.log(out.trimEnd()); die(`written, but tsc reports ${(out.match(/error TS\d+/g) ?? []).length} errors (listed above): add the readers to the edit table`) }
log('written; tsc: clean')
