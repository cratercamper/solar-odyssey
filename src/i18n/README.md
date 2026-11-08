# Texts and languages (`src/i18n/`)

Every text the player sees lives in this folder, in Japanese and in English, apart from the few listed at the end
("Outside on purpose"). Japanese is the master. English may be missing for any text: the build still passes, and that text
is shown in Japanese in English mode (the ship's log goes by whole entries, see "Adding a text").

## Files

- **One pair of files per screen or topic**: `navPanel.ja.ts` and `navPanel.en.ts`, with the same keys. A screen's
  files are named after its source file (`NavPanel.tsx` → `navPanel`); the texts of data records after the data
  (`bodies`, `ships`, `probes`, `pois` …).
- **`ja.ts`** gathers the Japanese files into one dictionary, `ja`, and holds the story mode's short texts itself.
  **`en.ts`** does the same for English; it is typed `Translation<typeof ja>`.
- **`missions.ja.ts` / `missions.en.ts`**: the missions and chapters, read with `missionText(id)` and `chapterText(id)`.
- **`facts.ja.ts` / `facts.en.ts`** (`FACTS`, `FACTS_EN`) and **`sfFacts.ja.ts` / `sfFacts.en.ts`** (the SF objects'
  tables, spread into `FACTS`): the ship's log, read with `factsFor(id)` in `data/facts.ts`.
- `index.ts`: `ui()` and the other readers · `translation.ts`: the shape of a translation and how its gaps are filled
  · `lang.ts`: the current language and `useLang()` · `list.ts`: how English joins names in a list · `article.ts`:
  which names English writes with "the" inside a sentence.

## Reading a text

```ts
ui().navPanel.sun                 // a text
ui().missionNumber(k + 1)         // a text with a value: a function, in both languages
ui().bodies[planet.id].name       // a data record's text, by the record's id
missionText(m.id).title           // a mission's text
```

- `ui()` looks up the current language each time it is called. Call it where the text is shown, never once when a
  file loads: a text made at load time keeps the first language.
- A component that shows texts calls `useLang()` at its top, so it draws again when the language changes.
- `uiJa` and `uiEn` are the dictionaries of one language, for text that is made in both languages at once (the quiz
  questions built from planet data) or that is always in one (the ship's name painted on the hull is English).
- How a language writes dates and large numbers is a function here too (`ephemeris.date(d)`, `hud.bigNumber(n)`), and
  so are the few settings that go with a language: the eclipse panel's time zone (`eclipsePanel.utcOffsetHours`, next
  to `dateTime`, whose label names it) and the bridge consoles' number format (`consoles.numberLocale`).
- Punctuation that differs between the languages is here as well: a temperature with its unit
  (`surfaceView.tempRange(min, max)`, `timeBar.degrees(t)`), the `？？？` of something not found yet
  (`rockBook.unknownName`), and the colon and the gap inside a line (`labelled(label, value)`, `gap`). The Japanese
  files keep the full-width forms, and the English files write `°C`, `???`, `: ` and ` · `.
- Names in a list are joined by `ui().list(names)` when all of them are meant ("Found on: Phobos and Deimos") and by
  `ui().listOr(names)` when one of them is ("Land on Phobos, Deimos, or Proteus"). Japanese joins both with `・`
  (`フォボス・ダイモス・プロテウス`); English writes them as in `list.ts`.
- A name inside an English sentence goes through `theEn(name)` (`TheEn(name)` at the start of a sentence): "Land on
  the Moon", "To the Sun", "Look through the Hubble Space Telescope", "Observing the Space Elevator", but "Land on
  Mars" and "To Colony Group 1 (L5)". The names that take "the" are listed in `article.ts`: the Sun, the Moon, the two
  space telescopes and the SF places, the ones the English warp call in `state/flight.ts` says with "the" (`SPOKEN`
  and the `spoken` of `data/sf.ts`). A new SF place whose `spoken` name starts with "the" goes into `article.ts` too.
  Japanese needs nothing.

## Data records

A record keeps its numbers and ids; its texts are here, keyed by its id, the way missions are. The record's type is
split in two in its data file: `Planet` holds the structure, `PlanetText` right after it holds the text fields (with
their comments). `bodies.ja.ts` exports `bodiesJa` as a `Record<string, PlanetText | MoonText>`, so any id can be
looked up, and the type `BodiesJa`, which keeps the ids: `bodies.en.ts` is checked against it. The Sun, the planets and
the moons share one file, keyed by body id.

The rally tracks, the landing sites, the titles and the rally colours are checked the other way as well: `TRACKS`,
`SITES`, `Title.id` and `RALLY_COLORS` are typed by the ids of their `.ja.ts`, so one without its Japanese text is a
type error. For the other records the compiler does not see a new id that has no text yet.

The game does not stop on such an id. The record files mark their catalog with `byId(texts)`, and `ui()` then answers
an id it does not have with a stand-in that shows the id (a `name` reads `vulcan`), and logs once
`ERROR [i18n] ja: no text for ui.bodies["vulcan"] (its id is shown instead)`. The stand-in has every field and every
list entry that any record of the catalog has: a missing mission has as many steps as the longest mission, a missing
ship every part id, so a reader that works for the records works for it. A table keyed by id inside a record is marked
too (each ship's `parts`), so a part id with no text shows its id in the same way. The rock groups, the composition
words and the landing and sky notes are not marked: there an id with no text is normal, and the reader falls back
itself.

## Adding a text

1. Write the Japanese in the screen's `.ja.ts`, under a key that says what the text is.
2. Write the English under the same key in the `.en.ts`, if you have it. A key in `.en.ts` that `.ja.ts` does not
   have (a typo) is a type error: in a screen's files, in the data records' files (the record ids) and in
   `missions.en.ts` (the mission and chapter ids). A key left out is not. The ship's log is the exception: `facts.en.ts`
   and `sfFacts.en.ts` hold whole entries, not checked by id, and `factsFor(id)` shows the Japanese entry only when
   there is no English one, so a field that an English entry leaves out is not shown in English mode.
3. Read it with `ui().<screen>.<key>`.

A new screen gets a new pair of files, added to `ja.ts` and `en.ts`. A text with a value is a function in both files
(`missionNumber: (n: number) => …`). A word that depends on a value belongs in the text, not in the code around it.

## Missing English

When the game loads, the console lists every text that has no English yet, as an error that does not stop anything:
`ERROR [i18n] en: not translated (shown in Japanese): 3`, with the place of each (`navPanel.sun`,
`missions.moon-supply.client`, and `facts.mars` for a ship's log entry with no English one). The game shows those
texts in Japanese.

## Outside on purpose

Words painted into textures (the ship's name on the hull is read from the English file), the language picker and the
loading screen, which show both languages at once, the language buttons, which name each language in its own script,
and developer pages such as `#terrain-lab`.
