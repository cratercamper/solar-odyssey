---
name: d-todo-localization
description: "what is left of the localization work after PR #100 was merged (2026-11-05) — the texts that code puts together, punctuation and lists (on the fork's branch pr/l10n-3; a pull request after more testing), the checks run on it, open questions and ideas."
type: design
---

# Localization: what is left after #100

State on 2026-11-06. #100 and the other numbers are pull requests of `Junzzy827/solar-odyssey`. #100 is merged into `main` (merge commit `cd5cb86`): almost every text the player sees is in `src/i18n/` and is read by key through `ui()`. Most of the rest, the texts that code puts together, is listed under "Not here yet" in `src/i18n/README.md` on `main`; the date and number formats and the punctuation that the code writes for both languages are not listed there. Newer work on `main` already uses this form:
- #102 put the hiscore texts into `src/i18n/rallyHiscore.{ja,en}.ts`;
- #104 added `news.{ja,en}.ts`;
- #103 added the photo texts to `apollo17` and `historicPanel`.

Our missing-English check (`l10n-check`, in `.memory/tools/localization/` on this fork's `main`) finds no Japanese word without English on `main` at `d0ef578`.

## On this fork's `pr/l10n-3`: texts that code puts together, punctuation, lists

The branch `pr/l10n-3` of this fork has 33 commits that `main` at `d0ef578` does not have: 13 on #100's last commit
(`1ad4f0b`), a merge of `d0ef578`, and 19 after it; the 32 that are not the merge do the work below. None of it is in
a pull request yet; we plan one after more testing.

- **Ids are type-checked, in both directions.** A misspelt id in an English text file now fails `tsc`: a record id, a
  mission or chapter id in `missions.en.ts`, one of the photo-framing words in `en.ts`, or a key in `news.en.ts`. A rally track, landing site,
  title or rally colour that has no Japanese text fails `tsc` too, and so does a Japanese text whose track or site is
  gone. (On `main` these four kept their texts in the record itself, so a new one without texts did not compile; after the
  texts moved, a fourth track without them compiled, and `ui().rallyTracks[track].title` would throw a `TypeError` where
  the game shows that track.)
- **A text looked up by an id it does not have no longer stops the game.** Before, a lookup such as
  `ui().bodies["vulcan"].name` threw a `TypeError` while the screen was drawn. Now the tables that are looked up by id
  (18 tables, the missions and the chapters; each marked with `byId(…)` in its `.ja.ts`) answer such an id with a
  stand-in that shows the id, and log it once: `ERROR [i18n] ja: no text for ui.bodies["vulcan"] (its id is shown
  instead)`. The stand-in has every field and list entry that any entry of its table has (a missing mission has as
  many steps as the longest one, a missing ship all 36 part ids), and each ship's part ids are guarded the same way. The rock group names, the composition words and the landing and sky notes are not marked: there an id with
  no text is normal, and the code falls back by itself.
- **Missing English is logged as an error on every load**, with the list of those texts, for example
  `ERROR [i18n] en: not translated (shown in Japanese): 3`, a ship's log entry with no English included. Before, it was a plain log line, and only with `#debug`
  in the address. With every text translated, as now, nothing is logged.
- **Texts that code puts together** are now in `src/i18n/` as well:
  - the time bar's words;
  - the rock group names and composition words;
  - the Apollo 17 book's compass words;
  - the stamp book's titles and page names;
  - the quiz's question makers and score titles;
  - the landing notes;
  - the rally tracks' texts;
  - the rally rovers' colour and driver names;
  - the date formats, the eclipse time zone and the number words.
- **Punctuation that the code wrote the same way in both languages** is in `src/i18n/` too, at 19 places. Japanese shows
  the same characters as before. English now shows its own forms:
  - temperatures: `-110 to 20 °C` on Mars, and ` °C` after the time bar's temperature (was `℃` and `〜`);
  - things not found yet: `?` and `???` (was `？` and `？？？`);
  - the mission panel's lines: `: ` and ` · ` (was a full-width colon and space);
  - the spacewalk job list: `•` for a job that waits its turn (was `・`);
  - the spacewalk job card's work log: ` · ` between its parts (was ` ・ `).
- **Names in a list are joined the way each language does it:** with `ui().list(names)` when all of them are meant, and
  with `ui().listOr(names)` when one of them is. On the rock book's "Other rocky worlds" page, a rock not found yet says
  `Land on Phobos, Deimos, or Proteus and look for …` in English (was `Phobos・Deimos・Proteus`) and
  `フォボス・ダイモス・プロテウスに着陸して…` in Japanese, as before; a rock found on two of them says
  `Found on: Phobos and Deimos` (was `Phobos・Deimos`). The English forms are the same as `Intl.ListFormat('en')` with
  `conjunction` and `disjunction`.
- **English that read wrong on `main` is fixed** (Japanese unchanged). A name inside an English sentence now takes
  "the" where English needs it: `Land on the Moon`, `To the Sun`, `Landed on the Moon · Taurus-Littrow valley`,
  `Which world does the Moon orbit?`, `Look through the Hubble Space Telescope`, `To the Space Elevator` (was
  `Land on Moon`, `To Sun`, …). 25 English texts use `theEn(name)` from `src/i18n/article.ts`, which gives "the" to
  the Sun, the Moon, the two space telescopes and the SF places that the English warp call says with "the" (25 of
  them); other names stay as they are (`Land on Mars`, `To Colony Group 1 (L5)`). When Earth is the quiz's answer, it
  said `Earth is about 12,742 km across, about 1 times Earth.`, `about 1 times as far from the Sun as Earth` and
  `about 1 years`; it now says `Earth is about 12,742 km across.`, `Earth is the farthest of these from the Sun` and
  `about 1 year` (likewise `1 day`, `1 hour`, `1 minute`). The rock book's hint on the icy moons' page said
  `Land on Icy moons & Pluto and look for …`; it now says `Land on an icy moon or Pluto and look for …`. Its other hint said
  `Try the Large crater, Lobate scarp on Moon`; it now says `Try “Large crater” and “Lobate scarp” on the Moon`, with
  the place names in quotes, as the Japanese has them in 「」.
- **A text gets one value and writes it its own way.** The spacewalk's tool button (`Use the hand`, the name in lower
  case) and the time bar's large light values (`約1万` in Japanese, `~14k` in English) used to get each value twice from
  the code, once per language. The game shows the same as before.
- **`t()` and `named()` are removed from `lang.ts`,** because after these moves no code calls them.
- **Two text types that #100's script named are renamed** the way the rest of the code names them: `JobDefText` and
  `ShipSpecText` are `JobText` and `ShipText`, as `MissionDef` has `MissionText`.
- **`src/i18n/README.md`** says where every text is now, including dates, number words, language settings, punctuation and
  lists, names what stays in the code on purpose, says which ids the compiler checks and what the game does with an
  id or an English text that is missing. The main `README.md` no longer describes `t()`.

Places outside `src/i18n/` that still hold or pick both languages, counted by `l10n-leftovers.mjs`: on `main` at
`d0ef578` it prints 140 places in 18 files. 8 of them are allowed on purpose in
`.memory/tools/localization/data/leftovers.json` (1 in `src/data/facts.ts`, 2 in `src/state/quiz.ts`, 5 in `src/ui/NavPanel.tsx`;
marked below under "Left out on purpose"), so 132 places in 16 files were left to move. On `pr/l10n-3` only those 8
remain.

`main` at `d0ef578` is merged in. Two files conflicted, both changed on `main` by #101 (the Europa race) and #104
(winding courses; Europa's look and grip). Their new texts now move like the others:
- `src/data/rallyTracks.ts`: the `conamara` track's 4 texts go to `rallyTracks.*`;
- `src/data/surfaces.ts`: the `conamara` site's name and note go to `surfaceSites.*`; the file keeps `main`'s wider `SITES`
  type and `siteDef` spreading the site's `look`.

## Checks on `pr/l10n-3`

- `tsc` and `vite build` pass.
- Our missing-English check finds nothing in its strict mode: no Japanese word, punctuation or symbol shown without an
  English form (on `main`, 21 symbol-only places: the 19 above and the 2 list joins).
- Our leftover check finds only the 8 places left out on purpose.
- In the 61 scenes recorded in a browser, nothing a player sees changed except what is listed above.
  `.memory/tools/localization/checks/visible_text.py` recorded every text shown in them, in English and in
  Japanese, twice on `main` at `d0ef578` and twice on this branch, then once more on fresh copies of both commits as
  they are on GitHub (`e7ba662` for this branch), and `checks/visible_text_compare.py` compared them with digits
  masked. 45 of the scenes are in `scen-ui.json`, `scen-eva.json`, `scen-apollo.json` and
  `scen-europa.json` (the Europa race), in `.memory/tools/localization/`; the other 16 are in scenario files we have
  not published.
  - Japanese: the same texts as on `main`. Two lines are now one text node each instead of several: the time bar's
    temperature (`-63℃`, was `-63` and `℃`) and the mission panel's skill line (`得意技：ビーム`, was `得意技`, `：`
    and `ビーム`); they read the same.
  - English: the punctuation, list and "the" changes above, the icy moons' hint and the spot names in quotes, and
    nothing else.
  - Some texts change from run to run on either build, with timing: the news toast, the Moon's phase, the distance
    shown before a landing, the frame rate shown in the settings and the labels of bodies in the 3D view.
  - The browser console shows the same messages on both builds; none is the error this branch logs when an English
    text is missing.
  - The check cannot see a change in digits only, such as a date format. Its scenes do not reach the quiz questions
    whose answer is Earth, the SF destinations or the rally rovers' colours.

## How changes to `main` come in now

`main` is merged into `pr/l10n-3` as usual. A conflict appears only where `main` changes a place that this branch also changes; at the last merge that was the two files above. Texts added to `main` in the new form need nothing from us. If a new table holding both languages appears on `main`, `l10n-leftovers.mjs` on the merged branch lists it; a new `t()` call no longer compiles there, because `lang.ts` on this branch has no `t()`; nor does a new rally track,
landing site, title or rally colour until its texts are in `src/i18n/`. `l10n-check` on `main` shows only a text that has no English; on this branch the game's console shows that text on every
load too.

`main` at `a41f635` (#106) is newer than this branch. It merges into the branch without a conflict, and `tsc` passes on
the result (checked 2026-11-06).

## Open

- **A check for wrong letters within one script.** Our check goes by script: it already catches Japanese letters in an English screen. It cannot see, for example, a German "ß" in a French screen, because both are Latin script. That needs a list of letters for each language (CLDR exemplar characters). It is not needed while the game has only Japanese and English.

## Ideas, only if wanted

- A review page for translators: each screen drawn on its own, TAB through its texts, ENTER to edit one.
- `Intl` for dates and plurals.
- A stricter foreign-letter check: each text marked in the app with the file it came from.
- A short instruction file in the repo, so that Claude Code keeps new words in `src/i18n/`. (#102 and #104 already do this without one.)
- Another language.

## Left out on purpose

On `pr/l10n-3` these stay outside `src/i18n/` on purpose and need no work. The three marked "allowed" are the 8 places
that the leftover check allows:

- words painted into textures;
- the loading screen, which shows both languages at once;
- allowed, 5 places: the language picker and the language button in `src/ui/NavPanel.tsx`, which name each language
  in its own script;
- allowed, 1 place: the whole-entry fallback in `factsFor`;
- allowed, 2 places: the English part of a quiz question, so that switching language in the middle of a quiz keeps
  working;
- developer pages;
- shader comments;
- the error thrown when a part of the spacewalker's model file is missing (`Tsumugi.tsx`), which the player never sees.

---
Written by cratercamper and Claude Code.
