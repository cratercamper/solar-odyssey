// ja-scan.mjs <src-root> — list Japanese text in a source tree of the game that has no English counterpart.
// Understands the app's four ways of carrying English:
//   t('日本語', 'English') at the call site · ui()/missions dictionaries (ja.ts ↔ en.ts, typed) ·
//   objects with `foo` + `fooEn` (or `ja` + `en`) siblings · named(b) over name/nameEn.
// Flags: NO-EN (Japanese literal with no English twin), EN-HAS-JA (an English slot that still holds Japanese).
// Skips console.* arguments (not shown to players). Output: TSV  kind  file:line  context  text
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createRequire } from 'node:module'

const root = process.argv[2]
if (!root) { console.error('usage: ja-scan.mjs <src-root>'); process.exit(2) }
const require = createRequire(join(root, '..', 'package.json'))
const { parse } = require('@babel/parser')

const JA = /[぀-ヿ㐀-鿿！-｠、。「」『』〜℃　【】]/
const walkFiles = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n)
  return statSync(p).isDirectory() ? walkFiles(p) : /\.(tsx?|mts)$/.test(n) ? [p] : []
})

const textOf = (n) => n.type === 'StringLiteral' ? n.value
  : n.type === 'TemplateLiteral' ? n.quasis.map((q) => q.value.cooked).join('${}')
  : n.type === 'JSXText' ? n.value.trim() : ''
const hasJa = (n) => n && JA.test(collect(n))
const collect = (n) => { // all literal text inside an expression
  if (!n || typeof n !== 'object') return ''
  if (n.type === 'StringLiteral' || n.type === 'TemplateLiteral' || n.type === 'JSXText') return textOf(n)
  let s = ''
  for (const k in n) if (k !== 'loc' && k !== 'start' && k !== 'end' && k !== 'extra') {
    const v = n[k]; if (Array.isArray(v)) v.forEach((c) => { s += collect(c) }); else if (v && typeof v === 'object' && v.type) s += collect(v)
  }
  return s
}
const keyName = (p) => p.key && (p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : null)

const out = []
let skippedConsole = 0
for (const file of walkFiles(root)) {
  const rel = relative(root, file)
  const isJaDict = /i18n\/(ja|missions\.ja)\.ts$/.test(rel)
  const isEnDict = /i18n\/(en|missions\.en)\.ts$/.test(rel)
  const src = readFileSync(file, 'utf8')
  const ast = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: true })
  const visit = (node, parents) => {
    if (!node || typeof node !== 'object' || !node.type) return
    const isText = node.type === 'StringLiteral' || node.type === 'TemplateLiteral' || node.type === 'JSXText'
    if (isText && JA.test(textOf(node))) {
      const parent = parents[parents.length - 1], gp = parents[parents.length - 2]
      let verdict = 'NO-EN', ctx = parent?.type ?? '?'
      // console.* — not player-visible
      const call = [...parents].reverse().find((p) => p.type === 'CallExpression')
      const callee = call?.callee
      const isConsole = callee?.type === 'MemberExpression' && callee.object?.name === 'console'
      if (isConsole) { skippedConsole++; verdict = null }
      // directly an argument of t(ja, en)
      else if (parent?.type === 'CallExpression' && parent.callee?.name === 't') {
        const i = parent.arguments.indexOf(node)
        if (i === 0) verdict = parent.arguments[1] && !hasJa(parent.arguments[1]) ? null : 'EN-HAS-JA'
        else verdict = 'EN-HAS-JA'
        ctx = 't()'
      }
      // nested inside t()'s first argument (e.g. a template) — fine when the English arg is clean
      else if (call?.callee?.name === 't' && call.arguments[0] && parents.includes(call.arguments[0])) {
        verdict = call.arguments[1] && !hasJa(call.arguments[1]) ? null : 'EN-HAS-JA'; ctx = 't() inner'
      }
      else if (call?.callee?.name === 't' && call.arguments[1] && parents.includes(call.arguments[1])) {
        verdict = 'EN-HAS-JA'; ctx = 't() en arg'
      }
      // [ja, en] pair tuple (TOOL_NAME, NOTES, JOBS…)
      else if (parent?.type === 'ArrayExpression' && parent.elements.length === 2 && parent.elements[0] === node && parent.elements[1] && !hasJa(parent.elements[1]) && /StringLiteral|TemplateLiteral/.test(parent.elements[1].type)) {
        verdict = null
      }
      // `en: {…}` sub-object sibling (DEEP_SPACE): any key inside an object that has an `en` ObjectExpression sibling
      else if ((() => { const objs = parents.filter((p) => p.type === 'ObjectExpression'); return objs.some((o) => o.properties.some((pp) => keyName(pp) === 'en' && pp.value?.type === 'ObjectExpression' && !parents.includes(pp))) })()) {
        verdict = null
      }
      // object property with an English sibling: foo/fooEn, ja/en
      else {
        const prop = [...parents].reverse().find((p) => p.type === 'ObjectProperty')
        const obj = prop && parents[parents.indexOf(prop) - 1]
        if (prop && obj?.type === 'ObjectExpression') {
          const k = keyName(prop), keys = new Set(obj.properties.map(keyName))
          ctx = `.${k}`
          if (k && (keys.has(k + 'En') || (k === 'ja' && keys.has('en')))) verdict = null
          else if (k && (/En$/.test(k) || k === 'en')) verdict = 'EN-HAS-JA'
        }
        if (verdict === 'NO-EN' && isJaDict) verdict = null      // typed ja dictionary: en twin enforced
        if (verdict === 'NO-EN' && isEnDict) verdict = 'EN-HAS-JA'
      }
      if (verdict) {
        const fn = [...parents].reverse().find((p) => /Function|ArrowFunction/.test(p.type) && p.id)?.id?.name
          ?? [...parents].reverse().find((p) => p.type === 'VariableDeclarator')?.id?.name ?? ''
        out.push([verdict, `${rel}:${node.loc.start.line}`, `${ctx}${fn ? ' in ' + fn : ''}`, textOf(node).replace(/\s+/g, ' ').slice(0, 90)].join('\t'))
      }
    }
    for (const k in node) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue
      const v = node[k]
      if (Array.isArray(v)) v.forEach((c) => visit(c, [...parents, node]))
      else if (v && typeof v === 'object' && v.type) visit(v, [...parents, node])
    }
  }
  visit(ast.program, [])
}
console.log(out.join('\n'))
console.error(`[${new Date().toISOString()}] ja-scan: ${out.length} findings (${out.filter((l) => l.startsWith('NO-EN')).length} NO-EN, ${out.filter((l) => l.startsWith('EN-HAS-JA')).length} EN-HAS-JA); skipped ${skippedConsole} console.* literals`)
