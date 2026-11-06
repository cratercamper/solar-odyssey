// latin_scan.mjs <tree> — lists text in Latin letters that the game could show in Japanese mode, for a person to read
// through (the opposite direction of l10n-check, which finds Japanese shown in English). Static, on the babel AST:
//   A. outside src/i18n/: JSX text, the visible attributes (title, aria-label, alt, placeholder, label), strings put
//      straight into JSX, and any other string that reads like words ("two words with a space"), minus shader, CSS
//      and asset strings;
//   B. inside the Japanese text files (*.ja.ts, ja.ts): strings with Latin words and no Japanese character, minus
//      ids (kebab-case) and kilometre values.
// Most hits are meant to be the same in both languages (credits, model and sign names, key names, units, the English
// warp call); the list is for spotting the one that is not. Exit 0 with the list; a file that does not parse throws.
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
const stamp = () => new Date().toISOString()
if (process.argv.length !== 3) throw new Error('usage: latin_scan.mjs <tree>')
const TREE = resolve(process.argv[2])
const req = createRequire(join(TREE, 'package.json'))
const { parse } = req(req.resolve('@babel/parser'))
const SRC = join(TREE, 'src'), I18N = join(SRC, 'i18n')
const JA = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
const WORD = /[A-Za-z]{2,}/
const VIS = new Set(['title', 'aria-label', 'alt', 'placeholder', 'label'])
const NOT_TEXT = /(px|rem|rgba?\(|#[0-9a-f]{3,}|https?:|uniform |vec[234]|gl_|void main|\.glb|\.png|\.jpg|\.hdr|linear-gradient|translate\(|solid |inset )/i
const strOf = (n) => (n.type === 'StringLiteral' ? n.value : n.type === 'TemplateLiteral' ? n.quasis.map((q) => q.value.cooked).join('${}') : null)
const SKIP_KEYS = new Set(['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments'])
const NOT_STRING_PARENT = new Set(['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'])
const walkAst = (n, parent, fn) => {
  if (!n || typeof n.type !== 'string') return
  fn(n, parent)
  for (const k of Object.keys(n)) {
    if (SKIP_KEYS.has(k)) continue
    const v = n[k]
    if (Array.isArray(v)) for (const x of v) walkAst(x, n, fn)
    else if (v && typeof v.type === 'string') walkAst(v, n, fn)
  }
}
const parseFile = (f) => parse(readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['typescript', ...(f.endsWith('.tsx') ? ['jsx'] : [])] })

const outside = []
const walkDir = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (p === I18N) continue; if (statSync(p).isDirectory()) walkDir(p); else if (/\.tsx?$/.test(f)) outside.push(p) } }
walkDir(SRC)
const A = { 'JSX text': [], 'visible attribute': [], 'string in JSX': [], 'reads like words': [] }
for (const f of outside) {
  const at = (n) => `${relative(TREE, f)}:${n.loc.start.line}`
  const seen = new Set()
  walkAst(parseFile(f).program, null, (n, parent) => {
    if (n.type === 'JSXText') { const t = n.value.trim(); if (t && WORD.test(t)) A['JSX text'].push(`${at(n)}  ${JSON.stringify(t.slice(0, 100))}`) }
    if (n.type === 'JSXAttribute' && VIS.has(n.name.name)) {
      const v = n.value?.type === 'JSXExpressionContainer' ? n.value.expression : n.value
      const s = v && strOf(v)
      if (s && WORD.test(s)) { A['visible attribute'].push(`${at(n)}  ${n.name.name}=${JSON.stringify(s.slice(0, 100))}`); seen.add(v) }
    }
    if (n.type === 'JSXExpressionContainer' && parent?.type !== 'JSXAttribute') {
      const e = n.expression
      const cands = e.type === 'ConditionalExpression' ? [e.consequent, e.alternate] : e.type === 'LogicalExpression' ? [e.right] : [e]
      for (const c of cands) { const s = strOf(c); if (s && WORD.test(s)) { A['string in JSX'].push(`${at(c)}  ${JSON.stringify(s.slice(0, 100))}`); seen.add(c) } }
    }
    if ((n.type === 'StringLiteral' || n.type === 'TemplateLiteral') && !seen.has(n) && !NOT_STRING_PARENT.has(parent?.type)) {
      const s = strOf(n)
      if (s && /[A-Za-z]{2,}[ ,.!?][^\n]*[A-Za-z]{2,}/.test(s) && !/^[\s\d.,%#()a-z-]*$/.test(s) && !NOT_TEXT.test(s)) A['reads like words'].push(`${at(n)}  ${JSON.stringify(s.slice(0, 110))}`)
    }
  })
}
const B = []
for (const name of readdirSync(I18N).filter((x) => /(^|\.)ja\.ts$/.test(x))) {
  const f = join(I18N, name)
  walkAst(parseFile(f).program, null, (n, parent) => {
    if ((n.type !== 'StringLiteral' && n.type !== 'TemplateLiteral') || NOT_STRING_PARENT.has(parent?.type)) return
    const s = strOf(n)
    if (WORD.test(s) && !JA.test(s) && !/^[a-z0-9]+(-[a-z0-9]+)+$/.test(s) && !/^[0-9,.]+ ?km$/.test(s)) B.push(`${relative(TREE, f)}:${n.loc.start.line}  ${JSON.stringify(s.slice(0, 100))}`)
  })
}
for (const [k, v] of Object.entries(A)) { console.log(`== A. ${k}: ${v.length}`); for (const l of v) console.log('  ' + l) }
console.log(`== B. Latin-only strings in the Japanese files: ${B.length}`); for (const l of B) console.log('  ' + l)
console.error(`[${stamp()}] latin_scan: ${outside.length} files outside src/i18n, ${Object.values(A).reduce((a, v) => a + v.length, 0)} + ${B.length} places listed`)
