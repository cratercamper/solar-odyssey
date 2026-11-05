// keys.mjs <tree> — runtime cross-check of missions.ja.ts ↔ missions.en.ts and chapters: ids, keys, array lengths,
// Japanese left in English. It IMPORTS the two dictionaries (they import only types), i.e. it runs tree code;
// ./l10n-check does the same check statically (key-path parity) and is the one to use. Exit 0 clean, 1 issues, 2 error.
// Run: node keys.mjs <tree>   (Node ≥ 23.6 strips the TypeScript types)
import { existsSync } from 'node:fs'
const stamp = () => new Date().toISOString()
const tree = process.argv[2]
if (!tree || !existsSync(`${tree}/src/i18n/missions.ja.ts`) || !existsSync(`${tree}/src/i18n/missions.en.ts`)) {
  console.error(`[${stamp()}] keys.mjs: ERROR usage: node keys.mjs <tree>  (needs <tree>/src/i18n/missions.{ja,en}.ts)`)
  process.exit(2)
}
const ja = await import(`${tree}/src/i18n/missions.ja.ts`)
const en = await import(`${tree}/src/i18n/missions.en.ts`)
let issues = 0
const say = (...a) => { issues++; console.log(...a) }
const cmp = (a, b, path) => {
  if (Array.isArray(a)) { if (!Array.isArray(b) || a.length !== b.length) say('LEN', path, a.length, b?.length); else a.forEach((x, i) => cmp(x, b[i], `${path}[${i}]`)); return }
  if (a && typeof a === 'object') { for (const k of Object.keys(a)) { if (!(k in b)) say('MISSING', `${path}.${k}`); else cmp(a[k], b[k], `${path}.${k}`) } for (const k of Object.keys(b)) if (!(k in a)) say('EXTRA', `${path}.${k}`); return }
  if (typeof a === 'string' && typeof b === 'string' && /[぀-ヿ㐀-鿿]/.test(b)) say('EN-HAS-JA', path, b.slice(0, 60))
}
cmp(ja.missionsJa, en.missionsEn, 'missions')
cmp(ja.chaptersJa, en.chaptersEn, 'chapters')
console.error(`[${stamp()}] keys.mjs: ${tree}: missions ja ${Object.keys(ja.missionsJa).length} en ${Object.keys(en.missionsEn).length}; chapters ja ${Object.keys(ja.chaptersJa).length} en ${Object.keys(en.chaptersEn).length}; ${issues} issues`)
process.exit(issues ? 1 : 0)
