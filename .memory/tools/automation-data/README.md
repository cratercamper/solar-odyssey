# Automation data

What the scripted browser (`../automation/scripted_browser.py`) needs for this game in particular; the tool itself
knows the game only by its address and its debug hooks (`#debug`, `window.__sv`). For now that is one test, the tiny
race test.

## The tiny race test
A short race on Mars, right by the landed ship, that a machine drives by itself, to check that the race still works
after a change. It goes from the menus to the result card:
1. It opens the game, warps to Mars and lands, through the real buttons. Only the target, Mars, is set through the
   game's state, as a click on Mars in the navigation list would set it.
2. It adds the tiny track to the game, as a new landing site next to the ship, with cratercamper's best run as the
   track's record: the first row of the table and the gold ghost in the race. No button leads to this track, so the
   test sends the game there from code, with `goToRally` (`src/state/rally.ts`, what the race button on the rover's
   panel calls): the game lands again, at the new site, with the rover out.
3. It presses Start, drives the race once, from the start to the finish gate (the track is a line, not a loop),
   through the rover's input on `window.__sv` (Driving, below), and reads the result.

The browser draws in software, about one frame per second, so a run takes about four minutes, two and a half of
them for the race.

The track is added while the page runs, and for the race the page's clock is fixed to one time step per frame
(below). No file of the game changes, so the test runs on the game's code as it is.
It needs the development server (`npm run dev`), which serves each source file on its own.

### Running it
From the root of the repository this folder is in (the game's code, with `.memory/` beside it), after `npm install`:
```
npm run dev
```
and, while it runs, in a second terminal, also from the root:
```
python3 .memory/tools/automation/scripted_browser.py out .memory/tools/automation-data/racing/surface/routes/mars-race-test-tiny/route.json
```
The scripted browser's own needs (Python 3, the `websockets` package, `chromium`) are in its design document,
`.memory/d-browser-automation.md`.

### What a pass looks like
- The run ends with exit status 0, and the line of its last step ends in `-> 'PASS'`.
- `out/result.json` holds the findings: the time, the place, the gates passed, and the result card's text.
- `out/2-result.png` shows the result card, with cratercamper in the table. `out/1-start.png` shows the start card.

The test fails, and says why, if any of these is not true:
- The race finished, with every gate passed.
- The time is between 5 and 10 seconds (the machine driver's race took 6.95 s and 7.00 s in two runs).
- The machine driver never had to be sent back to a gate.
- The page logged no error from the moment the track is added. (The scripted browser prints an error from before
  that as a `PAGE ERROR` line, but it does not fail this test.)
- The result card's table shows cratercamper's record.

## Files
One folder per kind of test: `racing/surface/` is for the rover races on the ground. Inside it, `kit/` is the code
its tests share (it names no track; for now it takes only tracks on Mars, where the route lands), and `routes/` has
one folder per test.
- `racing/surface/routes/mars-race-test-tiny/route.json`: the test as the scripted browser runs it. It is built by
  `racing/surface/kit/make_route.py`; do not edit it by hand.
- `racing/surface/routes/mars-race-test-tiny/track.json`: the landing site the track stands on (its body, its terrain,
  its name and note), the track (its line every 10 m, its 4 gates, its texts), and the check's time band and time step.
- `racing/surface/routes/mars-race-test-tiny/record.json`: cratercamper's run, in the form of the game's built-in
  records (`src/data/rallyRecords.ts`).
- `racing/surface/kit/setup.js`, `clock.js`, `pilot.js`, `check.js`: the code a rover race test's route runs in the
  page. setup adds the track, clock fixes the time step, pilot drives, check judges.
- `racing/surface/kit/make_route.py`: writes a test's route from its track, its record and the kit. Run it again after
  changing any of them, from `racing/surface/`:
  ```
  python3 kit/make_route.py routes/mars-race-test-tiny/track.json routes/mars-race-test-tiny/record.json routes/mars-race-test-tiny/route.json
  ```

## How it works
- **Adding the track.** The development server serves every source file as its own module, so code run in the page can
  import the modules the game already uses and add to their tables: `SITES` (`src/data/surfaces.ts`), `TRACKS`
  (`src/data/rallyTracks.ts`) and `RALLY_RECORDS` (`src/data/rallyRecords.ts`). The server adds `?t=<time>` to the
  address of a file changed since it started. Importing the bare path would then load a second copy that the game never
  reads, so setup.js reads the exact address from the code of a module that imports it. For the race module it also
  checks that it got the page's own copy; a wrong copy of one of the tables makes the test fail later (the wait for the
  Start button or for the race to begin times out, or the result card has no record), never pass. The record goes in before the game first reads
  the track's table, which it reads once.
- **The track fits the game's race code as it is:** points every 10 m, the game's own gate width and start grid.
- **Driving.** pilot.js steers along the track's line on every frame the game draws, through the rover's input on
  `window.__sv` (loaded by `#debug` in the address). It aims 5 m plus 0.45 s of travel ahead, and slows for the bends
  ahead so that it stays within the rover's turning radius (2.6 m + 0.32 s × speed).
- **A fixed time step.** The game advances at most 0.05 s per frame, but its race timer counts real time. At one frame
  per second, a 7 s race would read over two minutes. clock.js makes the page's clock (`performance.now()`, which the
  game's frame step and its race timer both read) move once per drawn frame, by exactly 0.05 s from the start of the
  race. So the card shows the time the game simulated, the same on a fast machine and a slow one. 0.05 s is what the
  game does on any machine below 20 frames per second; `check.step` in track.json sets it.
- **The record must match the track.** The game shows a built-in record only if its `course` matches the track's line
  and the game's driving version (`courseOf` in `src/state/rallyHiscore.ts`); otherwise it warns in the console and
  leaves it out, and the check fails. A new line or a new driving version needs a new record run.

---
Written by cratercamper and Claude Code.
