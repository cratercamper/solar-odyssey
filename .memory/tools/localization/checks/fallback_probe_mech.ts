// Probes of the English fallback (src/i18n/translation.ts: fill, untranslated) against a tree's real catalogs,
// written for the mechanism commit of PR #100. Run, with <tree> an absolute path:
//   esbuild checks/fallback_probe_mech.ts --bundle --platform=node --format=esm --alias:@tree=<tree> --outfile=$TMPDIR/p.mjs && node $TMPDIR/p.mjs
import { ja } from '@tree/src/i18n/ja'
import { en } from '@tree/src/i18n/en'
import { missionsJa, chaptersJa } from '@tree/src/i18n/missions.ja'
import { missionsEn, chaptersEn } from '@tree/src/i18n/missions.en'
import { fill, untranslated } from '@tree/src/i18n/translation'
const assert = (c: unknown, m: string) => { if (!c) throw new Error('FAIL ' + m); console.log('ok  ' + m) }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
// today: complete, and unchanged by the fill
assert(untranslated(ja, en).length === 0, 'ui en complete: ' + untranslated(ja, en).length)
assert(untranslated(missionsJa, missionsEn).length === 0, 'missions en complete')
assert(untranslated(chaptersJa, chaptersEn).length === 0, 'chapters en complete')
const full = fill(ja, en)
assert(full.missionsTitle === en.missionsTitle && full.framing.fast === en.framing!.fast, 'en strings kept')
assert(full.best(1) === en.best!(1), 'function leaf kept: ' + full.best(1))
assert(Object.keys(missionsEn).every((k) => same(fill(missionsJa, missionsEn)[k], missionsEn[k])), 'complete missions unchanged by fill')
// partial English: a string, a function, a whole sub-object
const part = { ...en }
delete (part as any).close; delete (part as any).best; delete (part as any).framing
const f2 = fill(ja, part)
assert(f2.close === ja.close, 'missing string -> Japanese: ' + f2.close)
assert(f2.best(2) === ja.best(2), 'missing function -> Japanese: ' + f2.best(2))
assert(f2.framing.fast === ja.framing.fast, 'missing sub-object -> Japanese: ' + f2.framing.fast)
assert(f2.missionsTitle === en.missionsTitle, 'other keys untouched')
const miss = untranslated(ja, part)
assert(miss[0] === 'close' && miss[1] === 'best' && miss.slice(2).every((m) => m.startsWith('framing.')) && miss.length === 2 + Object.keys(ja.framing).length, 'untranslated lists: ' + JSON.stringify(miss))
// a mission: an array shorter than the Japanese is filled by index; a whole mission missing shows the Japanese
const id = Object.keys(missionsJa)[0]
const mEn = { ...missionsEn, [id]: { ...missionsEn[id], steps: missionsEn[id].steps.slice(0, 1) } }
const fm = fill(missionsJa, mEn)
assert(fm[id].steps.length === missionsJa[id].steps.length && same(fm[id].steps[1], missionsJa[id].steps[1]) && same(fm[id].steps[0], missionsEn[id].steps[0]), 'short steps array filled by index')
const other = Object.keys(missionsJa)[3]; const mEn2 = { ...missionsEn }; delete mEn2[other]
assert(same(fill(missionsJa, mEn2)[other], missionsJa[other]), 'missing mission ' + other + ' -> Japanese (was a TypeError)')
console.log('[' + new Date().toISOString() + '] all probes passed')
