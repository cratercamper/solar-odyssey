---
name: d-upstream-fixes
description: "Bugs found in the game, while playing it or while working with its code, and a list of English text fixes for the newest screens. Each entry gives what a player sees, where it is in the code, why it happens, a suggested change and how to check it. Kept current: an entry is removed once the original game fixes the bug, and newly found bugs are added. A player's suggestion is marked as one."
type: reference
---

# Bugs found in the game

Bugs we found in the game, while playing it or while working with its code. Each entry says what a player sees, where
it is in the code, why it happens, a change that would fix it, how to check it, and how much it matters. The list is
kept current: when the original game fixes one of these bugs, its entry is removed, and bugs found later are added.

**How these bugs were found.** The four open entries, all in the Moon flight (✈ Fly over the Moon), were seen by
cratercamper while playing the game; Claude Code then found their causes in the code. The bank and the lap hint were
also checked by running the game's own flight code in a script. Then all four were measured in the game, in headless
Chromium on a GPU at 60 fps, as it is and with the suggested changes: each bug shows as it is and is gone with its
change, with no new console errors. The severities are our estimates, on this scale: **high**, spoils normal play for
most players; **medium**, spoils one part of the game on common machines; **low**, rare or cosmetic. Each entry says
who found the bug, whether a person has seen it in play, and its estimated severity. The English text findings at the
bottom were found by Claude Code reading the code; none of them was tried in play.

The suggested changes are also on the branch `pr/moon-flight` of this fork, one commit per bug, on top of the original
game's `main` at `19c1f53`; all four are in `src/components/flight/FlightView.tsx`.

Open entries, checked against the original game's `main` at commit `19c1f53` (#206). File and line numbers are at that
commit; `FlightView.tsx`, `FlightPanel.tsx` and `flightControl.ts` are in `src/components/flight/`.

### Moon flight: the lander leans out of a turn, not into it

Seen in play by cratercamper; cause found by Claude Code. Severity: **low**. The flight path is right, but every turn
looks wrong.

- **What a player sees:** steering left (A or ←), the lander rolls to the right; steering right, it rolls to the
  left. A craft that curves leans into the curve.
- **Where and why:** steering right (`input.turn` = +1) turns the heading right (`flightControl.ts:76`) and makes
  `bank` positive (:77). `Ship` in `FlightView.tsx` tilts the lander's up direction by `ctl.bank` about `basis.z`
  (:346), and `basis.z` points backwards (:344, the model's nose is −z). A positive rotation about the backward axis
  (right-hand rule) tips the top to the left, away from the turn.
- **Change:** `basis.y.applyAxisAngle(basis.z, -ctl.bank)` at :346.
- **Measured:** holding A, the top of the lander tilts about 34° to the right as it is (the bank's full 0.6 rad, reached
  within about a second), and about 34° to the left with the change; D, the other way round.
- **How to check:** hold A in the flight: the top of the lander should lean left. Or step `FlightCtl` for one second at
  60 steps per second with `turn: 1`, then apply `Ship`'s pose lines (:343-346) to it: the heading turns right and the
  top tilts left; with `-ctl.bank` it tilts right. With `turn: -1`, the other way round.

### Moon flight: the lander jumps about on the screen

Seen in play by cratercamper; cause found by Claude Code. Severity: **medium**. It spoils the Moon flight, and the
faster you fly, the worse it gets.

- **What a player sees:** the lander jerks back and forth on the screen, where it should stay in one place or move
  smoothly.
- **Where and why:** two `useFrame` callbacks share the flight. `Pilot` (`FlightView.tsx:446-488`) steps the flight
  (`ctl.step`, :451), then places the camera from the new position (:471-479). `Ship` (:338-350) copies `ctl.p` into
  the lander model (:341). `Ship` is a child of `Pilot`. React Three Fiber 8.18 subscribes `useFrame` in a layout
  effect, React runs a child's layout effects before its parent's, and callbacks of the same priority run in the order
  they subscribed. So `Ship` runs first, and the lander is drawn where it was one frame earlier, while the camera
  already follows where it is now. The gap is speed × frame time, along the flight path, towards the camera. At top
  speed (all 8 bars) the speed is 240 m/s + 1 m/s per metre of height (`topSpeed`, `flightControl.ts:26`). At 1 km the
  lander is drawn 21 m behind at 60 fps, with the camera 82 m away; at 10 km it is 171 m behind, with the camera 192 m
  away (`dist`, `FlightView.tsx:461-464`). Drawn that much closer to the camera, the lander sits low in the view, and
  high up it drops below the frame. Every frame that takes longer or shorter than the last changes the gap,
  and the lander jumps. Frame times can vary here: while flying, new terrain pieces are built in a frame until a 3-6 ms
  budget is passed (`FlightView.tsx:97-99`, :182-189).
- **Measured:** as it is, the lander was drawn exactly one frame behind in every frame (gap ÷ (speed × frame time) =
  1.000): about 20 m at 1 km, about 170 m at 10 km, where it was drawn about 47 m from the camera instead of 192 m,
  often below the frame, and moved about 90 px from frame to frame even though the headless frames were steady
  (16-17 ms): at 10 km each millisecond of frame time is about 10 m of gap, and the lander was drawn only about 47 m
  from the camera. With the change: 0 m, and it moves less than 0.1 px.
- **Change:** run `Pilot`'s callback first, by giving it priority −1: `useFrame((_, dt) => { … }, -1)` at :488. A
  negative priority keeps React Three Fiber's own rendering; only a positive one takes rendering over.
- **How to check:** fly at top speed at about 1 km height and watch the lander: as it is, it sits lower than the
  camera aims and shakes along its flight direction; with the change, it stays put. In code: `ctl.speed * dt`, logged
  in `Pilot`, is how far behind the lander is drawn.

### Moon flight: the Sun is a white square, and shows through the Moon

Seen in play by cratercamper, from the night side, among the stars; cause found by Claude Code. Severity: **low**.

- **What a player sees:** a bright white square in the sky, also where the Moon is in front of the Sun (the Earth is
  hidden by the Moon there, as it should be).
- **Where and why:** the Sun of the flight sky is a `THREE.Sprite` whose `SpriteMaterial` has a colour and no texture
  (`FlightView.tsx:254`, drawn at :275), so it shows as its whole square. A sprite material is transparent by default
  (three.js `SpriteMaterial`), and three.js draws transparent objects after all opaque ones. The sky is drawn first by
  its `renderOrder` (stars −3, Sun −2, Earth −1, :274-276, all with `depthTest: false`) so that the Moon, drawn after
  it, covers it. The stars and the Earth are opaque and keep that order; the Sun, being transparent, is drawn after the
  Moon, and with `depthTest: false` nothing hides it.
- **Change:** in `sunMat` (:254), give the Sun the round `dotTexture()` of the lander's marker and keep it opaque with
  additive blending: `map: dotTexture(), blending: THREE.AdditiveBlending, transparent: false`. It is then drawn with
  the stars and the Earth, before the Moon; additive blending keeps the texture's alpha, so the corners add nothing and
  the edge is soft. Its texture is disposed with it (`sunMat.map?.dispose()` in the clean-up at :255-262). Two things
  look different: the Sun's bright core is smaller than the old square (its glow fades out to the old size; the
  sprite's scale is unchanged), and drawn before the Earth (renderOrder −2 against −1), it is covered by the Earth when
  the two line up, as in an eclipse.
- **Measured:** as it is, a solid 14 × 13 px white square; with the change, a round soft disc. Lander at about 12 km with the Sun 30° below its horizon and the camera aimed at the Sun, through the Moon: as
  it is, the square is drawn over the Moon; with the change, nothing. With the lander in front of the Sun, as it is the
  Sun is drawn over the lander; with the change, the lander hides it. The Earth and the lander look the same.
- **How to check:** turn the camera to the Sun during the flight: a square as it is, a round light with the change.
  From the night side, with the Sun behind the Moon: visible through the Moon as it is, hidden with the change.

### Moon flight: the lap hint names the wrong side

Seen in play by cratercamper; cause found by Claude Code. Severity: **low**. The number still shows, and turning the
side it names makes the number grow, so a player can find the right side; but the hint sends them the wrong way first.

- **What a player sees:** "Lap course: X° to the right" when the lap course is to the left: you have to steer left to
  bring X down. The same the other way round.
- **Where and why:** `Pilot` computes `off`, the angle from the lap course to the heading, positive when the course is
  to the right (`FlightView.tsx:485`), and sends the panel `off: -off` (:486). `FlightPanel` shows "to the right" for a
  positive value (`FlightPanel.tsx:35`, :79; text in `src/i18n/skyFlight.en.ts:22-23`). `FlightPanel` is the only
  reader of `off`.
- **Measured:** starting on course, we steered left off it. As it is, the hint said "Lap course: 65° to the left" while
  the course was 65° to the right, and steering left as told raised it to 83°. With the change it said "61° to the
  right", and steering right brought it to 44°.
- **Change:** send `off` as it is: `useSkyFlight.setState({ …, off })` at :486.
- **How to check:** in the flight, steer right away from the lap course for a while: as it is, the hint says "… to the
  right" and steering right makes X grow; with the change it says "… to the left" and steering left brings X down. We
  ran the flight's own code in a script: steered right off the course, it said "Lap course: 22° to the right".

### A player's suggestion (not a bug): show the lander's pitch in the Moon flight

From cratercamper, after playing: show which way the lander is pointing, either as a horizon indicator or as a small 3D
picture of the lander at the edge of the screen. The pitch is what makes the lander climb or sink. Today the panel
shows the height, the speed, the lap and which way to turn (`FlightPanel.tsx`), but not the pitch. High up (40 km and
more) the camera is far behind the lander (about 1.8 km at 40 km), and the lander is less than a degree across on the
screen, so the player can only guess the pitch from how the height changes. The value is at hand: `ctl.pitch`, the
angle from the horizon (up to ±1.1 rad, `flightControl.ts:31`), and `Pilot` already sends the panel its numbers four
times a second (`FlightView.tsx:481-487`).

### A player's suggestion (not a bug): show the names of places on the Moon during the flight

From cratercamper, after playing: during the flight, show the names of mountains, craters, plains and other features
below, either in the main view or in a panel at the side of the screen with more about each. A combination cratercamper
finds interesting, in the style of System Shock 1: the description at the side, with a line leading from it to where the
place is in the 3D view. The game has no list of the Moon's named places yet. The IAU's Gazetteer of Planetary
Nomenclature, kept by the USGS (planetarynames.wr.usgs.gov), lists the Moon's named features with their positions and
sizes. A name tag in the 3D view has a precedent in the game: `src/components/moonMission/SaturnHotspots.tsx` places
labels with drei's `Html`.

## English text in the new screens

Found by Claude Code while reading the English of everything new between `737030b` and `19c1f53` (#136 to #206)
beside its Japanese twin. Read in code, not tried in play. Every line below is at `19c1f53`; each "Fix" shows the
line as it is now (`-`) and a suggested line (`+`), or the words to change in a long line. Where the Japanese twin
says the same, its line is given too. Every replacement, English or Japanese, is a suggestion of wording only.

What was checked across all of it: every key of the new dictionaries has its English, and no English value contains
Japanese characters except the language switch, which is meant to be in Japanese (`'日本語にする'`,
`src/i18n/navPanel.en.ts:52`). 33 findings: 14 bugs a player sees (3 medium), 1 mistranslation, 1 name used two ways,
6 facts (2 medium), 11 wording.

### Bugs a player sees

#### E1 · bug · medium · key hints run together (Moon flight)

- **Shown:** Moon flight, keyboard only: the hint at the bottom (`src/components/flight/FlightPanel.tsx:92`).
- **Why:** the parts are separated by three ASCII spaces, and HTML collapses them to one (`.flight-hint` has no `white-space: pre`), so it reads "climb / dive A / D (←→): turn E / Q or wheel: speed Drag: look around". The Japanese uses U+3000, which does not collapse. The same in E2-E6.
- **Fix:**

`src/i18n/skyFlight.en.ts:28`
```diff
-  keys: 'W / S (↑↓): climb / dive   A / D (←→): turn   E / Q or wheel: speed   Drag: look around. The higher you fly, the faster you can go',
+  keys: 'W / S (↑↓): climb / dive · A / D (←→): turn · E / Q or wheel: speed · Drag: look around. The higher you fly, the faster you can go',
```

#### E2 · bug · medium · key hints run together (docking)

- **Shown:** Apollo 17, chapter 4 (docking), keyboard, autopilot off (`src/components/moonMission/DockHud.tsx:96`); `.dk-hint` has `white-space: nowrap`, which also collapses spaces.
- **Why:** as E1: "WASD / arrows: sideways Space: forward X: back".
- **Fix:**

`src/i18n/moonDock.en.ts:14`
```diff
-  keys: 'WASD / arrows: sideways   Space: forward   X: back',
+  keys: 'WASD / arrows: sideways · Space: forward · X: back',
```

#### E3 · bug · low · key hints run together (Blue Marble photo)

- **Shown:** Apollo 17, chapter 5, the photo of the Earth, keyboard (`src/components/moonMission/DockHud.tsx:191`).
- **Why:** as E1.
- **Fix:**

`src/i18n/moonDock.en.ts:31`
```diff
-  aimKeys: 'WASD / arrows / drag: aim the camera   Space: shutter',
+  aimKeys: 'WASD / arrows / drag: aim the camera · Space: shutter',
```

#### E4 · bug · low · key hints run together (entry angle)

- **Shown:** Apollo 17, chapter 9, the entry-angle step, keyboard (`src/components/moonMission/ReturnHud.tsx:80`).
- **Why:** as E1.
- **Fix:**

`src/i18n/moonReturn.en.ts:18`
```diff
-  angleKeys: '↑: shallower   ↓: steeper',
+  angleKeys: '↑: shallower · ↓: steeper',
```

#### E5 · bug · low · key hints run together (re-entry)

- **Shown:** Apollo 17, chapter 9, re-entry, keyboard (`src/components/moonMission/ReturnHud.tsx:134`).
- **Why:** as E1.
- **Fix:**

`src/i18n/moonReturn.en.ts:29`
```diff
-  entryKeys: '↑: lift up (eases the G)   ↓: lift down (stops a skip)',
+  entryKeys: '↑: lift up (eases the G) · ↓: lift down (stops a skip)',
```

#### E6 · bug · low · the two star rules run together (end screen)

- **Shown:** Apollo 17, chapter 9, the end screen (`src/components/moonMission/ReturnHud.tsx:229`).
- **Why:** as E1.
- **Fix:**

`src/i18n/moonReturn.en.ts:47`
```diff
-  endNote: '★: angle within 0.3° of −6.5°   ★: peak under 7.5 G',
+  endNote: '★: angle within 0.3° of −6.5° · ★: peak under 7.5 G',
```

#### E7 · bug · medium · "1 days 1 hours passed in the colony"

- **Shown:** Pioneering → terminal → Colony tab, the "while you were away" box (`src/ui/pioneer/terminal/ColonyTab.tsx:97`), after 2 or more real minutes away.
- **Why:** no plural, and a zero part is shown: "0 days 12 hours", "1 days 1 hours". A colony day is 4 real minutes and the box appears after 12 colony hours, so short absences give exactly these values.
- **Fix:**

`src/i18n/colony.en.ts:104`
```diff
-  away: (h: number) => `${Math.floor(h / 24)} days ${h % 24} hours passed in the colony`,
+  away: (h: number) => {
+    const d = Math.floor(h / 24)
+    const r = h % 24
+    const parts = [d ? `${d} day${d === 1 ? '' : 's'}` : '', r ? `${r} hour${r === 1 ? '' : 's'}` : ''].filter(Boolean)
+    return `${parts.join(' and ')} passed in the colony`
+  },
```

#### E8 · bug · low · "1 days ago"

- **Shown:** Colony tab, the charts' left axis label (`src/ui/pioneer/terminal/ColonyTab.tsx:429`), when the history spans about one colony day.
- **Why:** no plural.
- **Fix:**

`src/i18n/colony.en.ts:34`
```diff
-  daysAgo: (d: number) => `${d} days ago`,
+  daysAgo: (d: number) => `${d} day${d === 1 ? '' : 's'} ago`,
```

#### E9 · bug · low · "Brought over 1 records"

- **Shown:** the saved-data panel, once after upgrading from an old save (`src/ui/SaveDataPanel.tsx:77`); `n` is the number of old save keys (`src/state/save.ts:171`) and can be 1.
- **Why:** no plural.
- **Fix:**

`src/i18n/saveData.en.ts:14`
```diff
-  migrated: (n: number) => `Brought over ${n} records from the previous version.`,
+  migrated: (n: number) => `Brought over ${n} record${n === 1 ? '' : 's'} from the previous version.`,
```

#### E10 · bug · low · "1 earlier trips not shown"

- **Shown:** Pioneering terminal → Log tab, when exactly one old trip is cut (`src/ui/pioneer/terminal/LogTab.tsx:164`).
- **Why:** no plural.
- **Fix:**

`src/i18n/pioneer.en.ts:226`
```diff
-      older: (n: number) => `${n} earlier trips not shown`,
+      older: (n: number) => `${n} earlier trip${n === 1 ? '' : 's'} not shown`,
```

#### E11 · bug · low · "1 of 1 engines burning"

- **Shown:** Apollo 17, chapters 2-3, the engines card while the third stage burns (`src/components/moonMission/AscentCards.tsx:168-193`); the third stage has one engine.
- **Why:** the count reads oddly for a single engine.
- **Fix:**

`src/i18n/moonMission.en.ts:53`
```diff
-    lit: (n: number, of: number) => `${n} of ${of} engines burning`,
+    lit: (n: number, of: number) => (of === 1 ? (n ? 'Its one engine is burning' : 'Its one engine is off') : `${n} of ${of} engines burning`),
```

#### E12 · bug · low · Saturn V explorer names the wrong chapters

- **Shown:** Moon mission → Saturn V explorer at the pad → the lunar module and the third stage.
- **Why:** the chapter menu numbers chapters from 1 (`src/components/moonMission/ChapterMenu.tsx:42`, `c.n + 1`): docking is chapter 4 and the burn to the Moon chapter 3. These two texts use the numbers from the code (0-based). The Japanese twin says the same.
- **Fix:**

`src/i18n/saturnExplorer.en.ts:38`: `(chapter 3)` → `(chapter 4)`

`src/i18n/saturnExplorer.en.ts:48`: `(chapter 2)` → `(chapter 3)`

`src/i18n/saturnExplorer.ja.ts:37`: `（章3）` → `（章4）`

`src/i18n/saturnExplorer.ja.ts:47`: `（章2）` → `（章3）`

#### E13 · bug · low · a wide space (U+3000) in English HUDs

- **Shown:** Apollo 17, chapters 2-3 cards and the chapter 9 HUD, in both languages.
- **Why:** a U+3000 written into the JSX shows in English as a 1-em blank: cosmetic, a wider gap. A normal space, or a CSS gap, reads the same in both languages.
- **Fix:**

`src/components/moonMission/AscentCards.tsx:179`
```diff
-        {c.engines}　<span className="ac-sub">{t.stageName[stage]}</span>
+        {c.engines} <span className="ac-sub">{t.stageName[stage]}</span>
```

`src/components/moonMission/AscentCards.tsx:371`
```diff
-            <i className="ac-swatch" /> {c.window}　{c.skin}
+            <i className="ac-swatch" /> {c.window} {c.skin}
```

`src/components/moonMission/ReturnHud.tsx:78`
```diff
-          {T.ideal}　·　{T.toEi(left)}
+          {T.ideal} · {T.toEi(left)}
```

`src/components/moonMission/ReturnHud.tsx:196`
```diff
-        {T.burn(burned)}　·　{T.warp(TEI_WARP)}
+        {T.burn(burned)} · {T.warp(TEI_WARP)}
```

#### E14 · bug · low · a wide plus on the Moon flight speed button

- **Shown:** Moon flight, the speed buttons.
- **Why:** a full-width "＋" (U+FF0B) beside a "−" (U+2212); the button's label for screen readers is translated, only the shown text is wide.
- **Fix:**

`src/components/flight/FlightPanel.tsx:68`
```diff
-                ＋
+                +
```

### Translation and names

#### E15 · mistranslation · low · the burn card loses "in"

- **Shown:** Apollo 17, chapter 6, behind the Moon while the radio is lost (`src/components/moonMission/LoiCard.tsx:107-108`).
- **Why:** the Japanese says the time is a countdown (あと, "in"); the English drops it, and its three spaces collapse, so "If the burn worked 12:34" reads like a clock time.
- **Fix:**

`src/i18n/moonMission.en.ts:278`
```diff
-      ifOk: (t: string) => `If the burn worked   ${t}`,
+      ifOk: (t: string) => `If the burn worked: in ${t}`,
```

`src/i18n/moonMission.en.ts:279`
```diff
-      ifNot: (t: string) => `If there was no burn   ${t}`,
+      ifNot: (t: string) => `If there was no burn: in ${t}`,
```

#### E16 · naming · low · chapter 8 has two English names

- **Shown:** Moon mission chapter menu, item 8.
- **Why:** the same chapter is "Exploring the Moon" in its title card (`src/i18n/apolloEva.en.ts:7`, :9) and in `moonMission.lunar.evaNext` (`src/i18n/moonMission.en.ts:332`), while the Japanese uses 月面の探検 everywhere. The menu's "Exploring the surface" is the closer rendering of 月面の探検; either name works, as long as it is one. The fix takes the title card's.
- **Fix:**

`src/i18n/moonMission.en.ts:110`: `'Exploring the surface'` → `'Exploring the Moon'`

### Facts

#### E17 · fact · medium · "the last time people went to the Moon"

- **Shown:** Apollo 17, chapter 9, the splashdown "Did you know?" card.
- **Why:** Artemis II (Wiseman, Glover, Koch, Hansen) flew around the Moon on 1-10 April 2026. Apollo 17 is still the last time people landed on it. The Japanese twin says the same.
- **Fix:**

`src/i18n/moonMission.en.ts:99`
```diff
-    splash: 'A 12-day, 13-hour, 52-minute journey. So far, the last time people went to the Moon',
+    splash: 'A 12-day, 13-hour, 52-minute journey. So far, the last time people landed on the Moon',
```

`src/i18n/moonMission.ja.ts:100`
```diff
-    splash: '12 日 13 時間 52 分の旅。人が月へ行ったのは、いまのところこれが最後',
+    splash: '12 日 13 時間 52 分の旅。人が月に降り立ったのは、いまのところこれが最後',
```

#### E18 · fact · medium · "nobody has been to the Moon" since Apollo 17

- **Shown:** the end screen after the whole Apollo 17 mission.
- **Why:** as E17: people went around the Moon in April 2026. `apolloEva.closeoutLines[1]` already says it right ("nobody has walked on the Moon"). Evans did not walk on the Moon, so he leaves the sentence. The Japanese twin says the same.
- **Fix:**

`src/i18n/moonReturn.en.ts:51`
```diff
-    'Since Cernan, Schmitt and Evans, nobody has been to the Moon.',
+    'Since Cernan and Schmitt, nobody has walked on the Moon.',
```

`src/i18n/moonReturn.ja.ts:54`
```diff
-    'サーナン、シュミット、エバンスの 3 人のあと、月へ行った人はまだいません。',
+    'サーナンとシュミットのあと、月を歩いた人はまだいません。',
```

#### E19 · fact · low · 1998 KY26 is about 11 m, not 30 m

- **Shown:** Probes → Hayabusa2, after its last Earth flyby.
- **Why:** 30 m was the old radar estimate; Santana-Ros et al., Nature Communications, September 2025 (ESO release eso2515) measured about 11 m. The Japanese twin says the same.
- **Fix:**

`src/i18n/probeCam.en.ts:85`
```diff
-      beyond: () => 'Leaving Earth for its next asteroid. It should reach 1998 KY26, about 30 m across, in 2031.',
+      beyond: () => 'Leaving Earth for its next asteroid. It should reach 1998 KY26, only about 11 m across, in 2031.',
```

`src/i18n/probeCam.ja.ts:94`
```diff
-      beyond: () => '地球を離れ、次の小惑星へ。2031年に、直径30mほどの小惑星1998 KY26に着く予定です。',
+      beyond: () => '地球を離れ、次の小惑星へ。2031年に、直径11mほどの小惑星1998 KY26に着く予定です。',
```

#### E20 · fact · low · the F-1 is the strongest single-chamber liquid-fuel engine flown

- **Shown:** Saturn V explorer → the F-1 engines.
- **Why:** solid boosters (the Shuttle's, SLS's) are single-chamber and stronger, and the F-1A was built and test-fired with more thrust than the F-1 but never flew; the usual claim is "liquid-fuel" and "flown". The Japanese twin says the same.
- **Fix:**

`src/i18n/saturnExplorer.en.ts:63`: `single-chamber rocket engine ever built` → `single-chamber liquid-fuel rocket engine ever flown`

`src/i18n/saturnExplorer.ja.ts:62`: `燃える部屋が 1 つのロケットエンジンでは、いまも人がつくった中で` → `燃える部屋が 1 つの液体燃料ロケットエンジンでは、いまも、これまでに飛んだ中で`

#### E21 · fact · low · sample 74220 did not first prove lunar volcanoes

- **Shown:** Apollo 17, chapter 8, station 4 (Shorty), after collecting the sample.
- **Why:** lunar volcanism was known from the Apollo 11 and 12 mare basalts (the game's own station 1 line says the valley floor is lava); the orange glass beads of 74220 showed fire-fountain eruptions, lava sprayed up like a fountain. The Japanese twin says the same.
- **Fix:**

`src/i18n/apolloEva.en.ts:46`
```diff
-        'It proved the Moon once had volcanoes. Sample 74220 is still being studied around the world.',
+        'It showed that lava once sprayed up from the Moon like a fountain. Sample 74220 is still being studied around the world.',
```

`src/i18n/apolloEva.ja.ts:45`
```diff
-        '月にも火山があった証拠です。試料番号 74220 は、いまも世界中で研究されています。',
+        '月で溶岩が噴水のように噴き上がっていた証拠です。試料番号 74220 は、いまも世界中で研究されています。',
```

#### E22 · fact · low · Cassini's builders: Italy is in Europe

- **Shown:** Probes → Cassini, the cruise captions.
- **Why:** the three partners were agencies: NASA, the European Space Agency and the Italian Space Agency. The Japanese twin says the same.
- **Fix:**

`src/i18n/probeCam.en.ts:98`
```diff
-        '6.8 m tall and 5.6 tonnes, built together by the USA, Europe and Italy.',
+        '6.8 m tall and 5.6 tonnes, built together by NASA, the European Space Agency and the Italian Space Agency.',
```

`src/i18n/probeCam.ja.ts:107`
```diff
-        '高さ6.8m、重さ5.6トン。アメリカ・ヨーロッパ・イタリアが一緒に作った、大きな探査機です。',
+        '高さ6.8m、重さ5.6トン。NASA・ヨーロッパ宇宙機関・イタリア宇宙機関が一緒に作った、大きな探査機です。',
```

### Wording

#### E23 · wording · low · a clause without a verb

- **Shown:** the news item about the colony (shown once).
- **Why:** "…and on the hover scooter “Fly (G)” at 360 km/h to lap…" has no verb.
- **Fix:**

`src/i18n/news.en.ts:10`: `on the hover scooter “Fly (G)” at 360 km/h to lap the whole cylinder` → `on the hover scooter use “Fly (G)” to lap the whole cylinder at 360 km/h`

#### E24 · wording · low · "the same person standing side by side"

- **Shown:** the news item about the colony's people (shown once).
- **Why:** the Japanese means identical-looking people standing side by side. E33 changes the same line ("colours").
- **Fix:**

`src/i18n/news.en.ts:19`: `the same person standing` → `identical people standing`; `Phones get a second older person too.` → `Phones now show a second older person, too.`

#### E25 · wording · low · "collect Metal" with a capital

- **Shown:** Pioneering HUD, "next step", away from the mining field (`src/ui/pioneer/PioneerHud.tsx:29`).
- **Why:** `res` is the capitalised resource label (`Metal`, `Ice`).
- **Fix:**

`src/i18n/pioneer.en.ts:35`
```diff
-    mine: (res: string) => `Break rocks at the mining field to collect ${res}`,
+    mine: (res: string) => `Break rocks at the mining field to collect ${res.toLowerCase()}`,
```

#### E26 · wording · low · "To frame", "To start the spin"

- **Shown:** Pioneering HUD, the label above the resource bars (`src/ui/pioneer/PioneerHud.tsx:138`).
- **Why:** read as verbs; the Japanese (${name}まで) means "for the next stage".
- **Fix:**

`src/i18n/pioneer.en.ts:52`
```diff
-  untilStage: (name: string) => `To ${name.toLowerCase()}`,
+  untilStage: (name: string) => `Needed for: ${name}`,
```

#### E27 · wording · low · "above Ryugu's ground"

- **Shown:** Probes → Hayabusa2 at Ryugu (`src/ui/ProbeCamPane.tsx:122`).
- **Why:** "ground" is unusual for an asteroid; "surface".
- **Fix:**

`src/i18n/probeCam.en.ts:26`
```diff
-  toSurface: (name: string, d: string) => `${d} above ${name}'s ground`,
+  toSurface: (name: string, d: string) => `${d} above ${name}'s surface`,
```

#### E28 · wording · low · "The water is going"

- **Shown:** 💧 setting out water on a world hotter than its boiling point.
- **Why:** unidiomatic; the Japanese says the water is disappearing.
- **Fix:**

`src/i18n/waterCup.en.ts:19`
```diff
-    boiling: (tb: number) => `Boiling at ${tb} °C! The water is going`,
+    boiling: (tb: number) => `Boiling at ${tb} °C! The water is boiling away`,
```

#### E29 · wording · low · "sight cross"

- **Shown:** Apollo 17, chapter 4, the docking approach caption.
- **Why:** "crosshairs" is the English word.
- **Fix:**

`src/i18n/moonMission.en.ts:214`
```diff
-    tdApproach: ['Closing in on the Lunar Module', 'Lay the sight cross over the LM target. Slowly: under 0.35 m/s'],
+    tdApproach: ['Closing in on the Lunar Module', 'Line up the crosshairs on the LM target. Slowly: under 0.35 m/s'],
```

#### E30 · wording · low · "Fold" on a collapse button

- **Shown:** the first-three card, the collapse button's tooltip and label (`src/ui/FirstThree.tsx:83`).
- **Why:** "Fold" is not used for this in English.
- **Fix:**

`src/i18n/firstThree.en.ts:17`
```diff
-  fold: 'Fold',
+  fold: 'Collapse',
```

#### E31 · wording · low · "About 109 × Earth fit across Sun"

- **Shown:** Learn → Compare sizes, the caption when the Sun or the Moon is one of the two (`src/ui/SizeCompare.tsx:191-192`).
- **Why:** the names go in bare ("across Sun", "× Moon"). `theEn` and `TheEn` in `src/i18n/article.ts` (:51, :53) add "the" where a name takes it.
- **Fix:**

`src/i18n/sizeCompare.en.ts:1`
```diff
 import type { Translation } from './translation'
+import { theEn, TheEn } from './article'
```

`src/i18n/sizeCompare.en.ts:12`
```diff
-  across: (big: string, small: string, count: number) => `About ${n(count)} × ${small} fit across ${big}`,
+  across: (big: string, small: string, count: number) => `${TheEn(big)} is about ${n(count)} times as wide as ${theEn(small)}`,
```

#### E32 · wording · low · two date styles in one mission

- **Shown:** the Apollo 17 mission; the Saturn V screen shows both at once (its clock writes "December 7, 1972", `src/i18n/saturnExplorer.en.ts:18`).
- **Why:** these four write day-month; the other new dates write month-day (`src/i18n/moonMission.en.ts:264`, :327; `src/i18n/apolloEva.en.ts:9`, :59; `src/i18n/moonReturn.en.ts:49`).
- **Fix:**

`src/i18n/moonMission.en.ts:9`
```diff
-  intro: 'Midnight, 7 December 1972. The only night launch of Apollo.',
+  intro: 'Midnight, December 7, 1972. The only night launch of Apollo.',
```

`src/i18n/saturnExplorer.en.ts:9`
```diff
-  where: 'Kennedy Space Center, Pad 39A · the evening of 20 November 1972',
+  where: 'Kennedy Space Center, Pad 39A · the evening of November 20, 1972',
```

`src/i18n/saturnExplorer.en.ts:23`
```diff
-  launchNight: '12:33 AM, 7 December 1972. A moonless night',
+  launchNight: '12:33 AM, December 7, 1972. A moonless night',
```

`src/i18n/moonDock.en.ts:34`
```diff
-  real: 'Real: AS17-148-22727 (7 December 1972)',
+  real: 'Real: AS17-148-22727 (December 7, 1972)',
```

#### E33 · wording · low · British spellings beside American ones

- **Shown:** Moon mission HUDs, news, the water cup, probes.
- **Why:** the English mixes the two: American spellings are the more common in the English files at `19c1f53` (e.g. "off center" in `moonDock.en.ts`, "Rover color" in `saveData.en.ts`, "meters"), and British ones are frequent too ("centre", "colour", "kilometres", "neighbours", …). The lines below are the new ones with British spellings; older lines have them too (e.g. "Rover colour", `src/i18n/rallyPanel.en.ts:10`). One spelling for all would read best; the fix shows American, the more common.
- **Fix:**

`src/i18n/moonReturn.en.ts:16`
```diff
-  ideal: 'Centre −6.5°',
+  ideal: 'Center −6.5°',
```

`src/i18n/moonMission.en.ts:241`: `centred` → `centered`

`src/i18n/moonMission.en.ts:305`: `centred` → `centered`

`src/i18n/moonMission.en.ts:308`: `centred` → `centered`

`src/i18n/apolloEva.en.ts:45`: `colour` → `color`

`src/i18n/news.en.ts:19`: `colours` → `colors`

`src/i18n/waterCup.en.ts:33`: `vapour` → `vapor`

`src/i18n/probeCam.en.ts:115`: `vapour` → `vapor`

`src/i18n/rockSamples.en.ts:86`: `metres` → `meters`

---
Written by cratercamper and Claude Code.
