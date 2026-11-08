# Localization tools

The scripts that check the game's texts, the ones that moved them into `src/i18n/` (pull requests #100 and #107), their tables
(`data/`) and the checks made of the conversion (`checks/`). They need Node ≥ 23.6 on `PATH` and a checkout with
`src/`, `index.html` and `node_modules/`. Some need more:
- `l10n-regen.sh` and `l10n-convert-verify.mjs` need `git` (on `PATH`, or named by `L10N_GIT`);
- the fallback probe needs `esbuild` (the checkout's `node_modules/.bin/esbuild` will do);
- the browser tools (`checks/visible_text.py`, `en_scan.py`) need `chromium` on `PATH`, Python 3 with `websockets`, and the app served by its dev server.
  They take Chromium's start, stop and renderer from `../automation/` (`chromium_lock.py`, `renderer.py`, `scripted_browser.py`):
  each waits for its turn in the machine's browser lock itself, so do not run it under `chromium_lock.py run`, and draws on
  the graphics card unless `SCRIPTED_BROWSER_RENDERER=swiftshader`, which draws on the CPU and is two to five times as
  slow, by the scenes (measured on one machine: the Apollo scenes 87 s against 41 s, 23 screens 268 s against 55 s).
  A run on the graphics card stops when the page draws in software; any run fails when Chromium's GPU process dies.
  The lock needs Linux and the machine's own PID namespace (it reads `/proc`), and for a run on the graphics card
  `nvidia-smi`; the graphics card is reached through EGL (`--use-angle=gl-egl`, `renderer.py`). Elsewhere (macOS, a
  container, a cloud session) set `SCRIPTED_BROWSER_LOCK=off`, as for `scripted_browser.py`, so the run takes no lock
  (run one at a time), and `SCRIPTED_BROWSER_RENDERER=swiftshader`. As root (a container's default) Chromium does not
  start, since these tools do not pass `--no-sandbox` (known from Chromium, not tried here). Tried on Linux only, not
  on macOS, in a container or in a cloud session.

`keys.mjs`, `l10n-convert-verify.mjs`, the fallback probe and the browser tools run parts of the game's code. The
others only read the tree, and the conversion steps rewrite it when given `--write`. Commands below are run in this
folder.

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

## The conversion (PR #100 and #107)

With `--write`, each step rewrites `<tree>/src` and runs `tsc`, stopping on any error; without it, nothing is written.

| Step | Run | What it does |
|---|---|---|
| A | `node l10n-convert.mjs <tree> [--write]` | every inline `t('日本語', 'English')` becomes `ui().<topic>.<key>`; both texts go to `src/i18n/<topic>.ja.ts` / `.en.ts`; a text with `${…}` becomes a function |
| A, checked | `node l10n-convert-verify.mjs <tree> <base-rev>` | each catalog text, with the call's values put back, equals the old `t()` argument |
| B | `node l10n-move.mjs <tree> [--write]` | moves whole tables (the ship's log, the SF tables) into `src/i18n/` unchanged and fixes the imports |
| C | `node l10n-records.mjs <tree> [--write]` | the data records give up their text fields; the texts go to `src/i18n/`, keyed by record id; the readers are rewritten from a counted edit table |
| D | by hand | what the scripts could not move: the time bar's tables, the rock groups and composition words, the Apollo 17 compass, the stamp pages and titles, the quiz questions, the rally colours, the dates and number words, the punctuation that differs between the languages, the list joins (`ui().list`), and the removal of `t()`. In #107 these are the commits of `git log --no-merges --first-parent 1ad4f0b..e7ba662` (`e7ba662` is that pull request's last commit) whose subject does not end in "(made by the script)": 28 of its 32, four of them README-only. Besides the moves above, they check each record's ids against its texts and the English missions by id, join with "or" in a list, work out the tool name's case and the lux units in the texts, let a missing text log an error instead of stopping the game (the `byId(…)` mark on the record catalogs; missing English logged on every load), put "the" before names inside an English sentence, fix the quiz's English when Earth is the answer and the rock book's two hints, and check the news texts by key. `l10n-records.mjs` still writes `= texts`, without the mark |
| last | `node l10n-leftovers.mjs <tree>` | lists every place outside `src/i18n/` that still holds or picks both languages; exit 1 when that differs from the allowlist, which is the tree after step D (`e7ba662`) |
| all | `./l10n-regen.sh <tree>` | resets `src/`, runs A, its check, B and C, stopping at the first failure. With `L10N_STEPD=<dir>` it then replays step D from that folder's `*.patch` files (`git format-patch` of those commits; none are included here) 3-way, and runs the leftover check |

The tables these steps read are in `data/`: `keys.json` (the key of every text), `moves.json`, `records.json` and
`leftovers.json`. Each script takes another file with its flag (`--keys`, `--moves`, `--spec`, `--allow`). PR #100
brought its part of the conversion to `main`, and #107 (merged as `7cb4dda`) the rest: the records step C took on
later (the landing notes and sites, the rally tracks), its id-checked form and type names, and step D. The steps are kept as the
record of how it was made, and to be run again.

## Checks of the conversion (`checks/`)

| Run | What it does |
|---|---|
| `python3 checks/visible_text.py <out.json> scen-ui.json '<app url>/?lang=en#debug'` | headless Chromium: every visible text of the app, per scenario, with seeded random numbers and a fixed start of the clock, so a run before a change and one after it can be compared, in each language |
| `python3 checks/visible_text_compare.py <before.json> <after.json>` | compares two such runs, scenario by scenario, with digits masked; exit 1 on any difference |
| `node checks/latin_scan.mjs <tree>` | the other direction of `l10n-check`: text in Latin letters that Japanese mode could show. Outside `src/i18n/`: JSX text, `title`/`aria-label`/`alt`/`placeholder`/`label`, strings put straight into JSX, other strings that read like words; inside the `.ja.ts` files: strings with Latin words and no Japanese character (ids and km values left out). A list for a person to read: most hits are the same in both languages on purpose (credits, model and sign names, key names, units, the English warp call). Compare a branch's list with `main`'s to see what it adds |
| `esbuild checks/fallback_probe_mech.ts --bundle --platform=node --format=esm --alias:@tree=<tree> --outfile=p.mjs && node p.mjs` | probes the English fallback (`fill`, `untranslated`) against the tree's real catalogs: a missing string, function, sub-object, mission step or whole mission shows the Japanese |

The scenario sets are `scen-ui.json`, `scen-eva.json`, `scen-apollo.json` and `scen-europa.json` (the Europa race). Run
`visible_text.py` with a short `TMPDIR`, such as `/tmp`. Chromium makes a unix socket under it, and if that path is too
long for a socket, Chromium stops at once ("Socket path too long"). The tool then prints Chromium's message.

## Smaller tools

| Run | What it does |
|---|---|
| `node ja-scan.mjs <tree>/src` | the first scanner: prints the Japanese literals it cannot explain |
| `python3 categorize.py <scan.tsv>` | sorts `ja-scan`'s lines into kinds |
| `node keys.mjs <tree>` | checks that missions and chapters have the same keys in both languages (imports the tree's code) |
| `node toplevel-t.mjs <tree>/src` | finds texts read when a file loads; those never switch language |
| `python3 en_scan.py <out_dir> scen-ui.json '<app url>/?lang=en#debug'` | headless Chromium: runs each scenario of a `scen-*.json` file and lists visible text that still holds Japanese, with screenshots (`#debug` turns on the app's debug hooks, which the scenarios use) |
