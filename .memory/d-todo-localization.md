---
name: d-todo-localization
description: what is left of Solar Odyssey's localization work after PR #100 was merged (2026-11-05) — the texts that code puts together (a new pull request), the merge with the newer main, the checks not yet run, open questions and ideas. Frontmatter and the part above the marker are public (.memory/ on the fork's main); the part below stays internal.
type: design
---

# Localization: what is left after #100

State on 2026-11-05. #100 is merged into `main` (merge commit `cd5cb86`). Every text that a screen shows directly is in `src/i18n/` and is read by key through `ui()`; see `src/i18n/README.md`. Newer work on `main` already uses this form:
- #102 put the hiscore texts into `src/i18n/rallyHiscore.{ja,en}.ts`;
- #104 added `news.{ja,en}.ts`;
- #103 added the photo texts to `apollo17` and `historicPanel`.

Our check finds no Japanese word without English on `main` at `d0ef578`.

## Done on our side, not on GitHub yet: texts that code puts together

This part is done on our side but is not on GitHub yet: no branch of this fork has it (`pr/l10n-2` ends where #100 ended), and no pull request.

- **Record ids are type-checked.** A misspelt record id in an English text file now fails `tsc`.
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
- **`t()` and `named()` are removed from `lang.ts`,** because no code calls them any more.
- **The text types are named the way the rest of the code names types.**
- **`src/i18n/README.md`** says that every text is in the folder now. It also covers dates, number words and language settings.

On `d0ef578`, our leftover check finds these places (132 in 16 files), the 8 left out on purpose (see the end), and
nothing else.

Before a pull request, this work needs `main` merged in. Merged with today's `main`, it conflicts in two files, both from the Europa race (#101, #104):
- `data/rallyTracks.ts`: the new `conamara` track, with 4 text pairs;
- `data/surfaces.ts`: the `conamara` site's name and note, a wider `SITES` type, and `siteDef` now spreading the site's `look`.

Those texts would move into `rallyTracks.*` and `surfaceSites.*` like the others. Everything else merges by itself. Whether we offer this pull request is not decided yet.

## Checks before we offer it

After the merge with `main` we run:
- `tsc`;
- our missing-English check and our leftover check;
- a browser check of the visible text on every screen.

The browser check has three sets:
- 23 UI screens, which passed on this work before the merge;
- 11 EVA scenarios and 7 Apollo 17 scenarios, which have not been run on this work yet.

The Europa race screens are new, so they get checked too.

## How changes to `main` come in now

`main` is merged into this work as usual. A conflict appears only where `main` changes a place that this work also changes; today that is the two files above. Texts added to `main` in the new form need nothing from us. If a new table holding both languages or a new inline `t()` appears, our checks on `main` show it.

## Open

- **Lists in English.** `ui/RockBook.tsx` (lines 38 and 74) joins names with `・` in both languages, so English shows "Mars・Phobos". `spotsHint` in `rockBook.en.ts` joins them with ", " and no "and". A possible fix is one `list(items)` helper next to `ui()`:
  - Japanese keeps `・`;
  - English uses `Intl.ListFormat('en')`, which gives "Mars, Phobos, and Deimos". (`Intl` would give 「、」 for Japanese, not `・`.)

  It changes what the player sees, so it is only a suggestion.
- **A check for wrong letters within one script.** Our check goes by script: it already catches Japanese letters in an English screen. It cannot see, for example, a German "ß" in a French screen, because both are Latin script. That needs a list of letters for each language (CLDR exemplar characters). It is not needed while the game has only Japanese and English.

## Ideas, only if wanted

- A review page for translators: each screen drawn on its own, TAB through its texts, ENTER to edit one.
- `Intl` for dates and plurals.
- A stricter foreign-letter check: each text marked in the app with the file it came from.
- A short instruction file in the repo, so that Claude Code keeps new words in `src/i18n/`. (#102 and #104 already do this without one.)
- Another language.

## Left out on purpose

These need no work. They are listed in `src/i18n/README.md`:

- words painted into textures;
- the language picker, the loading screen and the language buttons;
- the whole-entry fallback in `factsFor`;
- the English part of a quiz question, so that switching language in the middle of a quiz keeps working;
- developer pages;
- shader comments;
- a model error in `Tsumugi.tsx` that the player never sees.

---
Written by cratercamper with Claude Code.
