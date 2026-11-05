# Localization tools

The scripts that check Solar Odyssey's texts, the ones that moved them into `src/i18n/` (PR #100), their tables
(`data/`) and the checks made of the conversion (`checks/`). They need Node ≥ 23.6 on `PATH` and a checkout with
`src/`, `index.html` and `node_modules/`. `keys.mjs`, `l10n-convert-verify.mjs`, the fallback probe and the browser
tools run parts of the game's code; the others only read the tree, and the conversion steps rewrite it when given
`--write`. Commands below are run in this folder.

## The check: `l10n-check`

    ./l10n-check [<tree>]       # default: the checkout this .memory/ folder sits in
    ./l10n-check --lang en      # only the problems of one language
    ./l10n-check --all          # also every text it could explain, as OK lines
    ./l10n-check --strict       # symbol-only gaps fail too

It reads `<tree>/src` with the tree's own `@babel/parser` and prints one line per gap
(`KIND<TAB>file:line<TAB>context<TAB>text`), then a summary:

| KIND | Meaning |
|---|---|
| `NO-EN` | a Japanese text with no English |
| `FOREIGN` | a character foreign to the language the text is shown in: Japanese in an English text, or a script no language allows (Cyrillic, say) |
| `PARITY` | a Japanese text whose English twin is missing at the same key |
| `FALLBACK` | a read that shows Japanese without an error, because the English table lacks the id |
| `NO-EN-SYM`, `FOREIGN-SYM` | the same, but only punctuation or symbols (`・ ℃ 〜`, a full-width space), no letters; they fail only with `--strict` |

Exit 0 = no word gaps, 1 = word gaps, 2 = tool error. A missing tree, a file that does not parse or an import that does
not resolve is an error, never a silent skip. The scripts each language may use are `LANG_SCRIPTS` in
`l10n-check.mjs`; a new language is one more line there. An optional `l10n-check.env` beside the wrapper is read
first, for one machine's `PATH` and default tree (`L10N_TREE`).

## The conversion of PR #100

With `--write`, each step rewrites `<tree>/src` and runs `tsc`, stopping on any error; without it, nothing is written.

| Step | Run | What it does |
|---|---|---|
| A | `node l10n-convert.mjs <tree> [--write]` | every inline `t('日本語', 'English')` becomes `ui().<topic>.<key>`; both texts go to `src/i18n/<topic>.ja.ts` / `.en.ts`; a text with `${…}` becomes a function |
| A, checked | `node l10n-convert-verify.mjs <tree> <base-rev>` | each catalog text, with the call's values put back, equals the old `t()` argument |
| B | `node l10n-move.mjs <tree> [--write]` | moves whole tables (the ship's log, the SF tables) into `src/i18n/` unchanged and fixes the imports |
| C | `node l10n-records.mjs <tree> [--write]` | the data records give up their text fields; the texts go to `src/i18n/`, keyed by record id; the readers are rewritten from a counted edit table |
| last | `node l10n-leftovers.mjs <tree>` | lists every place outside `src/i18n/` that still holds or picks both languages; exit 1 when that differs from the allowlist |
| all | `./l10n-regen.sh <tree>` | resets `src/`, runs A, its check, B and C, stopping at the first failure. With `L10N_STEPD=<dir>` it then replays that folder's hand-made `*.patch` files 3-way and runs the leftover check (none are included here) |

The tables these steps read are in `data/`: `keys.json` (the key of every text), `moves.json`, `records.json` and
`leftovers.json`. Each script takes another file with its flag (`--keys`, `--moves`, `--spec`, `--allow`). Since PR #100
was merged, `main` holds the conversion; the steps are kept as the record of how it was made, and to be run again.

## Checks of the conversion (`checks/`)

| Run | What it does |
|---|---|
| `python3 checks/visible_text.py <out.json> scen-ui.json '<app url>/?lang=en#debug'` | headless Chromium: every visible text of the app, per scenario, with seeded random numbers and a fixed start of the clock, so a run before a change and one after it can be compared, in each language |
| `python3 checks/visible_text_compare.py <before.json> <after.json>` | compares two such runs, scenario by scenario, with digits masked; exit 1 on any difference |
| `esbuild checks/fallback_probe_mech.ts --bundle --platform=node --format=esm --alias:@tree=<tree> --outfile=p.mjs && node p.mjs` | probes the English fallback (`fill`, `untranslated`) against the tree's real catalogs: a missing string, function, sub-object, mission step or whole mission shows the Japanese |

## Smaller tools

| Run | What it does |
|---|---|
| `node ja-scan.mjs <tree>/src` | the first scanner: prints the Japanese literals it cannot explain |
| `python3 categorize.py <scan.tsv>` | sorts `ja-scan`'s lines into kinds |
| `node keys.mjs <tree>` | checks that missions and chapters have the same keys in both languages (imports the tree's code) |
| `node toplevel-t.mjs <tree>/src` | finds texts read when a file loads; those never switch language |
| `python3 en_scan.py <out_dir> scen-ui.json '<app url>/?lang=en#debug'` | headless Chromium: runs each scenario of a `scen-*.json` file and lists visible text that still holds Japanese, with screenshots (`#debug` turns on the app's debug hooks, which the scenarios use) |
