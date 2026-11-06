---
name: d-browser-automation
description: "Browser automation — anything that controls the browser by itself. The scripted browser (.memory/tools/automation/scripted_browser.py, headless, from outside) and its techniques; driving the game from inside the page in your own browser; stepping the game's frames for physics tests; the race pilot; what a start can reach and how it fails; pitfalls; performance; checking the game's text in a browser; every test we run, with or without a browser. Written for a person first, technical towards the end."
type: design
---

# Browser automation

Browser automation here means anything that controls the browser by itself, with no one at the keyboard: tools for
development and testing today, perhaps a race bot later. It has two parts:
- **Navigation:** getting to a game state (a race, a landing site, a scene) through the app's menus. The scripted
  browser below does this: its steps click the real buttons (warp, land, start a race); the example below clicks
  Warp. Calling the game's own functions from inside the page reaches a race in fewer steps, without the menus (In your
  own browser, below).
- **Race pilot:** controlling the rover during a race. One small pilot exists, in the tiny race test
  (`.memory/tools/automation-data/README.md`): it drives a short track once, from the start to the finish gate, so that
  the test can check the race.
  A race bot would get its own section here or its own design doc branched from this one.

The browser can be controlled in two ways. From outside: a separate program remote-controls the browser, runs
JavaScript in the page, waits and takes screenshots, while the app runs at its own pace. The scripted browser works this
way, headless (below). From inside: code injected into the page, which can also stop the app's frame loop and step the
frames itself at a fixed time step; in the developer's own browser, that is pasting into the console or a module the
game loads (In your own browser, below). A test of physics needs the inside way (see Limits). The two mix: a step of
the scripted browser can put such code in the page. The tiny race test does a little of it: from the start of the race
it fixes the page's clock to one step of 0.05 s per drawn frame, while the app's own frame loop runs as it is.

Further down, more technical: stepping the game's frames for physics tests, the race pilot, what a start can reach and
how it fails, pitfalls, performance, checking the game's text in a browser, and every test we run.

## The scripted browser (`.memory/tools/automation/scripted_browser.py`)

An invisible ("headless") Chromium that follows a script of steps through the whole app, against the app's dev
server: it clicks through menus and buttons, sends the ship to a planet, lands, starts a race, checks the app's state at
each stage and takes screenshots. We use it to walk a route through the app after a change and to time how long scenes
take.

### Running it
- Needs Python 3 with the `websockets` package (version 15 or newer; tested with 17.1), `chromium` on the PATH, and the
  dev server running (`npm run dev`).
- `python3 .memory/tools/automation/scripted_browser.py <out_dir> <steps.json> [url]` writes its screenshots and saved
  values to `<out_dir>`. It prints a timestamped line for each step it runs (none for `sleep`), and further
  lines while it waits for the lock and when the page logs an error. A run whose browser or step fails also prints
  where it kept Chromium's log (`kept …/chrome.log`) and the error with its traceback.
- The address defaults to `http://localhost:5173/?lang=en#debug`: the dev server, in English, with the debug hooks
  (below).
- Exit status: **0** every step passed, the page answered once more after them (Steps, below), and the browser is gone;
  **1** a step, that last question or the browser failed (the run's temporary directory with the browser's log is kept
  and named), or the run could not start, for example: no dev server answering, inside a sandbox (Limits), a lock held
  past the hold limit (Decisions), run under the lock's `run` wrapper, or an output directory that cannot be made; **2**
  bad arguments or steps; **128 + n** stopped by signal n, after the browser is stopped.

### Limits
- The browser draws in software, so it needs no graphics card, but it is slow: the app was ready about 5 to 13 s
  after the page was opened (Performance, below), and 3D scenes run at about one frame per second or fewer: 0.84
  frames per second in a short race on Mars (2026-11-06, a busy 16-core Linux machine; Performance, below).
- So a real-time run cannot test physics. The rover and race physics cap a frame's time step at 0.05 s (`Math.min(rawDt,
  0.05)` in `Rover.tsx` and `Rally.tsx`), so the rover and the race run at 1/20 of real time or less, in steps three
  times longer than at 60 fps. A clock fixed from the page, as in the tiny race test, makes a race's time the time the
  game simulated, in steps of the test's choosing: 0.05 s there; 1/60 s would give a fast machine's steps, in three
  times as many frames.
- One run at a time per machine, among the scripts that share its lock (Decisions, below): a run that finds it held
  waits for its turn and prints its place in the queue.
- It runs on the machine itself, not inside a sandbox or container: there it cannot see the other runs, so it refuses
  to queue.
- Linux as written.

### Steps
A steps file is a JSON list; each step is an object of exactly one kind, run in order:
- `{"eval": js}` evaluates JavaScript in the page (awaiting a promise) and logs the value. With `"save": file` it writes
  the value to `<out_dir>/file`: a string as it is, anything else as JSON (`undefined`, `NaN` or `Infinity` is an
  error). A call may take up to 120 s, or its own `"timeout"` in seconds.
- `{"wait": js, "timeout": s}` re-evaluates a JavaScript expression (not a statement: no trailing `;`) every 0.25 s
  until it is true in JavaScript's sense (default 30 s): the page decides, so `[]`, `{}` and a DOM element count as
  true.
- `{"sleep": s}` waits.
- `{"shot": name}` writes `<out_dir>/name.png` (1280×800).

The first steps of a route that warps from Earth to Mars, one step per line:
```json
[{"wait": "!!window.__sv && [...document.querySelectorAll('button')].some(b => /^Warp/.test(b.textContent.trim()))", "timeout": 60},
 {"sleep": 3},
 {"eval": "__sv.store.getState().setTarget('mars'), __sv.store.getState().targetId"},
 {"shot": "target-mars"},
 {"eval": "[...document.querySelectorAll('button')].find(b => /^Warp/.test(b.textContent.trim())).click(), 'clicked warp'"},
 {"wait": "__sv.store.getState().warpPhase !== 'idle'", "timeout": 60},
 {"wait": "__sv.store.getState().warpPhase === 'idle'", "timeout": 90}]
```
The first wait checks `!!window.__sv` before using it, because a condition that throws ends the run; it also waits for
the Warp button, because the click step further down throws when there is no such button yet.

`#debug` in the address makes `src/main.tsx` load `src/debugHooks.ts`, which puts the app's stores and actions on
`window.__sv` (`store`, `landing`, `rally`, `rover`, `eva`, `ship`, `flightControl`, `warpFx`, …); its header comment
says it is for recording and behaviour checks. Steps read state there; clicks go through the real buttons.

The page's own uncaught exceptions and `console.error` calls are logged as `PAGE ERROR (at HH:MM:SS)`, with the time
they happened; the line itself is printed when the tool next talks to the browser, which can be a step later, and
at the latest when the steps are done (the tool asks the page once more before it closes), or when a step fails (the
tool then reads what the page has sent, for at most 5 s). They do not end the run.

### Decisions
The tool talks to Chromium through the Chrome DevTools Protocol ("CDP": the remote-control channel Chromium opens, the
same one its DevTools panel uses), over a WebSocket, with no browser-automation library.
- **Free port.** `--remote-debugging-port=0`; the tool reads the port Chromium chose from `DevToolsActivePort` in its
  profile. A fixed port once let two runs share one browser.
- **Own process group; stopping waits for all of it.** SIGTERM to the group, wait until none of it is left (SIGKILL after
  10 s, an error if one survives), then delete the profile. Waiting for the browser process alone let its GPU, renderer
  and utility processes write on into the profile: deleting it failed (`Directory not empty`) and a good run failed.
  Chromium's crash reporter (`chrome_crashpad_handler`) starts outside the group; it exits with the browser and does not
  write into the profile. SIGTERM and SIGHUP to the tool itself also stop the browser and release the lock.
- **A new short temporary directory per run**, `/tmp/scripted-browser-XXXXXXXX/` (Python's `mkdtemp`), also
  Chromium's TMPDIR. Under a long TMPDIR, Chromium's `SingletonSocket` path is over the unix-socket limit, Chromium
  aborts, and the tool sees only a port that never answers.
- **Profile deleted; `chrome.log` kept when the run failed.** A profile is about 60 MB, `/tmp` is often in RAM, and 14
  left-over profiles (733 MB) had once piled up.
- **One holder of the lock at a time among the scripts that take it, in turn**
  (`.memory/tools/automation/chromium_lock.py`, beside the tool, shared by every script that imports it, such as our own
  test scripts, which are not published). The holder decides how many browsers it starts: the scripted browser starts
  one; one of our own test scripts starts two side by side, pinned to their own cores. Why: on 2026-11-04, several
  software-rendered browsers at once used up the memory (1.6 to 1.8 GB available, the swap full or nearly full), and the
  out-of-memory guard (earlyoom) stopped a test's page processes, twice. A script that starts a Chromium without the
  lock is not held back. The two published text scanners (Checking the game's text in a browser, below) do not take
  it themselves: wrap them in `chromium_lock.py run` (below).
  A waiter writes a ticket into `/tmp/headless-chromium.queue/`, named by the time it arrived, and takes
  `/tmp/headless-chromium.lock` only when its ticket is the oldest of a live process: first come, first served. Before
  the queue, every waiter polled and the fastest grabber won, so one waiter could wait for ever.
  - Every ticket and lock appears with its whole text at once: written to a temporary file, then hard-linked into
    place, which fails if the name exists. Each records the process id and its PID namespace.
  - Tickets and locks of processes that are gone (checked in `/proc`) are removed by whoever finds them, after reading
    them once more so that one written meanwhile is left alone. At the end the run removes the lock only if it still
    holds its own process id.
  - Only processes of the machine's own PID namespace may queue. Inside a sandbox other processes are hidden, and a
    live run's lock would look like one whose process is gone.
  - A live run that has held the lock for more than an hour is taken as stuck: each waiter stops with an error that
    names it, rather than wait for ever. The longest test run measured took 27 minutes: a run of our rover battery
    (Tests we run, below) on 2026-11-04, while the memory ran out.
  - `python3 .memory/tools/automation/chromium_lock.py status` prints the holder and the queue.
  - A script in another language wraps each step in `python3 .memory/tools/automation/chromium_lock.py run <label> --
    <command...>`. It waits for its turn, runs the command in a process group of its own while it holds the lock, and
    releases the lock afterwards. Its exit status is the command's (128 + n after signal n). SIGTERM, SIGHUP or
    SIGINT to the wrapper stops the whole command first; one that comes while it stops what a finished command left
    running takes effect once the lock is released. SIGKILL cannot, so stop it with SIGTERM. A command that takes
    the lock itself, as the scripted browser does, waits for its own turn and needs no wrapper; under one it stops at
    once with an error that says so.
  - Hold the lock per step (one page, one build), not for a whole job, so that the others in the queue get their
    turns in between.
  - For now the holder also takes an older lock file, `/tmp/ody-battery.lock`, which our own test scripts (not
    published) still take or watch. A script that takes neither is not held back.
- **The address must answer before the lock is touched.** A dev server that is down ends the run before it waits in
  the queue or starts anything.
- **Never through a proxy.** The DevTools channel and the address check go to localhost directly, whatever
  `http_proxy` or `HTTPS_PROXY` say.
- **Software WebGL.** `--use-angle=swiftshader --enable-unsafe-swiftshader`: SwiftShader draws on the CPU, so a run needs
  no GPU and no screen.
- **Low priority.** Chromium starts under `nice -n 10`: a software renderer can take most of a machine's cores (about
  12 of 16, Performance below), and the desktop of whoever works at it must stay responsive.
- **Fail loud.** The whole steps file is checked before Chromium starts: an unknown kind or key, two kinds in one step,
  or a value of the wrong type is refused, with every problem listed. A wait that times out, a JavaScript exception in a
  step, a DevTools call with no answer within its time, a page that crashes, a page load that fails, or no DevTools port
  within 15 s ends the run.

### Techniques
What our other scripts do over the same DevTools channel, worth copying into a tool like this one:
- **Code before the game's own.** `Page.addScriptToEvaluateOnNewDocument` (after `Page.enable`) runs a script in every
  new document before the page's modules. Uses: a seeded `Math.random`, a fixed `Date` (the planets' positions come
  from `Date.now()` at load, `EPOCH_MS` in `src/data/ephemeris.ts`), a frame-stepping harness (Stepping, below).
  Published example: `.memory/tools/localization/checks/visible_text.py`.
- **A new hash is not a new page.** `Page.navigate` to an address that differs only after `#` stays in the same
  document: nothing reloads, and code that reads the hash at load (`#debug` in `src/main.tsx`) does not run again.
  Navigate to `about:blank` first.
- **Real input.** `Input.dispatchKeyEvent` reaches the focused element as a key from the keyboard: `autoRepeat: true`
  for the repeats of a held key, `rawKeyDown` for editing keys such as Backspace. `Input.imeSetComposition` and
  `Input.insertText` type Japanese the way an input method does; an Enter with key code 229 is what Safari sends at
  the end of a composition. A plain `new KeyboardEvent(…)` dispatched on `window` also reaches the rover's keys
  (`bindRoverKeys` in `src/state/rover.ts` does not check `isTrusted`), but it types nothing into a text field.
- **Window sizes.** `Emulation.setDeviceMetricsOverride` (`width`, `height`, `deviceScaleFactor`, `mobile`) checks a
  layout at 375 to 960 pixels in one browser; `Emulation.clearDeviceMetricsOverride` ends it.
- **Downloads.** `Browser.setDownloadBehavior` with `behavior: "allow"`, a `downloadPath` and `eventsEnabled: true`;
  the file is complete when no `.crdownload` name is left. Without it, a browser profile saves into its user's
  Downloads folder, and the app shows no sign of it.
- **Pin the quality.** `__sv.store.getState().updateSettings({ quality: 'low' })` (or `'medium'`, `'high'`) before
  the scene you measure. The game saves the setting in the browser's storage (`localStorage`), so in your own browser
  set it back afterwards. On `'auto'`, the game's default, the level follows the frame rate, counted in 2-second
  windows (`src/components/QualityGovernor.tsx`): one step down after two windows below 30 frames per second, one step
  up after four above 56. A fixed clock sets the frame rate the game counts: at 0.05 s per frame that is 20, so on
  `'auto'` the tiny race test stepped down from high during its race, 3.95 s in, on a GPU (2026-11-06, before it pinned
  `'low'`); our stepped-frame tests, at 1/60 s, count 60 and stepped up 4.4 to 5.2 s into a race. A change of level
  makes the race code build its rivals again (the rivals' `useMemo` depends on `level` in
  `src/components/surface/Rally.tsx`): at the scene's origin (x = 0, z = 0), at a standstill and with no finish time. On
  the next frame the race counts each rival at the course's point nearest it, within about 300 m of the start grid,
  where a new rival's count begins (`progressOf`); a rival finishes once its count is past the last gate. On the tiny
  track the point nearest the origin is already past it, so all three rivals finished at once: the result card showed
  them all at 0:04.0, the player 4th.
- **Exact numbers.** Take a large result as one string, `JSON.stringify(value)` in the page, parsed by the tool: every
  float keeps JavaScript's own digits. A websocket client may need a larger message limit for it: the scripted browser
  allows 64 MiB, the text scanners 128 MiB, and our own test scripts 256 MiB.

### Building it into the game's code
For the game's author, or a Claude Code session building this into the game's own code (`src/`, `scripts/`). None of
it is built there; the tool above, in `.memory/tools/`, is the working reference.
- Run against `npm run dev` with `#debug` in the address: `src/debugHooks.ts` then puts the stores and actions on
  `window.__sv`. Read state there, and click the real buttons.
- One Node script under `scripts/`, with no new dependency. Node 22, which the game's GitHub Pages workflow sets up
  (`.github/workflows/deploy.yml`, job `build`), has a global `WebSocket` (since 22.0) and a global `fetch`.
  - Start a headless Chromium with `--remote-debugging-port=0` and read the port from `DevToolsActivePort` in its
    profile directory.
  - Ask `http://127.0.0.1:<port>/json` for the page's `webSocketDebuggerUrl` and talk to it over `WebSocket`:
    `Page.navigate`, `Runtime.evaluate` with `awaitPromise` and `returnByValue`, `Page.captureScreenshot`.
  - Keep the steps format above unchanged: a steps file is JSON.
- Keep: refusing a bad steps file before the browser starts; per run, a new temporary directory and the browser in its
  own process group (in Node, `spawn` with `detached: true`, then `process.kill(-pid)` on Linux and macOS), stopped and
  removed at the end; the SwiftShader flags for machines without a GPU; a time limit on every wait.
- Leave out what is made for one machine: the lock file and its `/proc` check, the `/tmp` paths, and the fixed
  `chromium` name (where Chrome or Chromium lives differs per OS).
- The alternative is Playwright: less code, but a large dev dependency that downloads its own browsers, in a repository
  with no test dependencies today. Which fits, and whether the script gets an `npm run` entry, is the author's choice.

## In your own browser (with a head)
The scripted browser above is the headless case: it starts its own Chromium and drives it from outside. This is the
case with a head: the developer's own browser window, driven from inside the page. It is written for the game's author,
or a Claude Code session working with the author, as a recipe; none of it is a file here.

### Reaching a rover race through the game's own functions
From space, as after the page loads, the game reaches a rover race in two hops, each with its own surface scene. Each
call returns at once; wait on the store named before making the next one.

Once the app has loaded (`window.__sv` is set; Performance below), nothing has to be waited for before the first step.
`useWarpPrep` (`src/state/flight.ts`) is the gate of the warp, not of landing: `QualityGovernor`
(`src/components/QualityGovernor.tsx`) opens it once loading has been quiet for 1 s and the space scene's shaders and
textures are ready, or after 20 s of the scene's clock, and `engage()` queues a warp asked for before that.
`startLanding` does not read it. Our own test scripts land as soon as the Warp button is on the page; that button is no
sign of readiness: it reads "Warp" from the start, and "Getting ready" only while a warp already asked for waits
(`src/ui/NavPanel.tsx`).
1. `useStore.getState().setTarget(body)`: the race's body as the target, as a click in the navigation list sets it.
   The race sites are the keys of `TRACKS` (`src/data/rallyTracks.ts`): `coprates` on Mars, `taurus` on the Moon,
   `conamara` on Europa; a site's body is `SITES[site].body` (`src/data/surfaces.ts`).
2. `flightControl.jumpTo = body` (`src/state/flight.ts`): on its next frame the ship is put in front of the body, as a
   warp from the map does, so that taking off comes back there.
3. `startLanding(body)` (`src/state/landing.ts`). It does nothing if the game is landed already (`useLanding`'s
   `phase` is not `'idle'`) or the body has no surface. Wait on `useLanding` for `phase === 'descent' && ready`.
   `ready` means the surface scene's shaders are compiled (`gl.compileAsync` in `SurfaceView.tsx`), or that 10 s went
   by without it; and the phase becomes `'descent'` once the terrain has loaded (with the 0.7 s fade, and on Mars the
   ground tiles), or after 12 s (`READY_LIMIT`). On a slow machine `ready` can therefore come before the scene is
   complete.
4. `skipDescent()`; wait for `phase === 'surface'`. It is optional: 8 s after `ready` the game moves to `'surface'` by
   itself (`DESCENT`). It acts only in `'descent'`, and sets `ready` itself, so call it only once `ready` is true;
   earlier it would raise the curtain on a scene still being built.
5. `goToSite(site)`: the race site on the same body, as the lander's race button does (`SurfaceView.tsx`). It does
   nothing unless the phase is `'surface'` and the site is another one. Wait for `site === <site> && ready`; here the
   game raises the curtain at the latest 12 s after the site's terrain has loaded, built or not. `goToRally(site)`
   (`src/state/rally.ts`) does the same with the rover put out on arrival; the race button on the rover's panel
   calls it.
6. `skipDescent()` again (optional, as above); wait for `phase === 'surface'`.
7. `startRally()` (`src/state/rally.ts`): it puts the rover out if it is not and sets the race's phase to `'deploy'`.
   The countdown (`'count'`, 3.6 s, `COUNT_SEC`) starts only once the rover drives (`Rally.tsx`), which waits for the
   rover's model to load (`Rover.tsx`): network time, not frames. Then `'run'`. Wait on `useRally` for
   `phase === 'count'` or `'run'`.

The stores are zustand stores: `getState()` reads one, and `subscribe(fn)` calls `fn` on each later change, so a wait
needs no polling. Read `getState()` first, then subscribe: some calls change the state before they return (`skipDescent`
sets `'surface'` at once, `src/state/landing.ts`), and a wait that only subscribes may never fire: it fires on the
store's next change, if one comes. A wait with a time limit that logs an error and stops tells a step that did not
happen from a slow one.

### Two ways to run it
- **From the console.** Load (or reload) the game with `#debug` in the address; adding it to an open page loads nothing.
  `src/main.tsx` then loads `src/debugHooks.ts`, which puts these on `window.__sv`: `__sv.store` (`useStore`),
  `__sv.flightControl`, `__sv.landing.start`, `.skip`, `.site` and `.state` (`startLanding`, `skipDescent`, `goToSite`,
  `useLanding`), `__sv.rally.start` and `.state` (`startRally`, `useRally`). `useWarpPrep` is not there, and the steps
  do not need it (above). Then paste an async function of the steps above into the DevTools console. The published game
  (https://junzzy827.github.io/solar-odyssey/) loads the hooks as well (checked 2026-11-06).
- **On load, behind a hash pointer**, in the game's own style (`#raceauto`, `#hangar`, `#surface-lab=` and the
  others): for example `#race=coprates`, which `src/main.tsx` would read and then import a small module (as it imports
  `debugHooks` for `#debug`) that runs the steps once the scene is ready. Every reload would then land in the race.
  Nothing in the original game starts a rover race on load (`#surface-lab=<body>` with `skip` lands on a body,
  `src/components/surface/SurfaceLab.tsx`). Our own version of the game (the original with our changes, not published;
  Tests we run, below) has a start of this kind, an address parameter that starts a race on load; it is kept internal.

### How long it takes
In a headless, software-rendered Chromium at about one frame per second (2026-11-06), the steps took 14 to 17 s from
space to the countdown, with both skips: 15.8 s to `coprates`, 14.4 s to `taurus` and 14.1 s to `conamara` on the dev
server, and 17.1 s to `coprates` on the published game (address above). Most of it is the two surface scenes. Landing at
the race site in one hop would build one scene instead of two, but `startLanding` takes no site, so that would be a
change to the game.
The scripted browser could also run with a head (Chromium without `--headless`), or attach to a browser started with
`--remote-debugging-port`; neither is built.

## Stepping the game's frames (physics tests)
A physics test needs the same steps on every machine. The rover and the race take a step of each frame's own time,
capped at 0.05 s, so a run in real time depends on the machine's frame rate. Two ways around it, both from inside the
page:

**A fixed clock on the game's own frames** (the tiny race test's `clock.js`, in
`.memory/tools/automation-data/racing/surface/kit/`). The frame loop and the drawing run as they are; only
`performance.now()` is replaced, by a value that changes once per drawn frame: real time until the race runs, then
exactly 0.05 s per frame. three.js's `Clock`, which gives R3F its frame time, and the race timer (`rallyNow` in
`src/state/rally.ts`) both read it, so rover, rivals and timer take the same steps. `Math.random` is not seeded: the
player's time repeats to within one step (6.95 s in most runs, 7.00 s in some), the rivals' times do not (one rival
6.5 to 6.7 s over four runs, 2026-11-06).

**Frames stepped by hand, drawing off.** Our own test scripts (not published) do this to compare two builds of the
game value for value:
- Stop the loop. `__sv.root(i)` (`src/debugHooks.ts`) gives R3F's state of canvas `i` (0 space, 1 surface); call its
  `setFrameloop('never')` and replace its `gl.render` with a no-op while stepping. Also hold back every
  `requestAnimationFrame` callback until the end: a re-render of `<Canvas>` applies its `frameloop` prop again (in
  R3F 8, the root's configure calls `setFrameloop` when the prop differs; the space canvas switches its own prop on
  landing, `src/App.tsx`), and one real frame slipped in that way.
- One step: move a virtual `performance.now()` on by dt, call every entry of `state.internal.subscribers` as
  `sub.ref.current(sub.store.getState(), dt)` (the `useFrame` callbacks, in R3F's own order, as its render loop calls
  them), then await one macrotask (a `MessageChannel` message) so that React commits and runs its effects. R3F's
  `advance()` is not used: it also reads the frame clock and runs R3F's global effects.
- `Math.random` is a seeded stream, split by the source line of the call: draws that set physics (the rivals' form,
  weave phase, trip and hop timers) take one stream, the rest (dust) another. With one stream, a change of speed
  changes the amount of dust and shifts every later physics draw.
- What the game runs on its own `requestAnimationFrame` does not run while stepped, for example the surface scene's
  readiness and curtain (`SurfaceView.tsx`). Land first, then stop the loop.
- A wait for a network load (the rover's model) needs wall time, not frames: step with 50 ms of real time between
  steps, up to a limit.
- Hold a jump press until the wheels are down: the rover reads `jump` only on the ground and clears it at the end of
  every frame (`Rover.tsx`).
- With stepped frames the same commit gives the same traces every time, so a stored run shows when a new commit of
  the game changes how the rover drives.
- Cost under software rendering, drawing off, in steps of 1/60 s: a median of 5.2 ms per frame over the driving
  scenarios (1.5 to 23 ms). The stepped Coprates race, 170 s of game time from the countdown to the finish (3.6 s +
  166.4 s, 10,200 frames), took 46 to 48 s, 4.5 to 4.7 ms per frame (2026-11-06, two browsers side by side).

**Floats.** The race time is the difference of two clock readings, and the reading at the start differs from run to
run. So the same 139 steps of 0.05 s give 6.949999999999989 in one run and 6.950000000000003 in another, and the result
card shows 0:06.9 or 0:07.0 for the same drive. Compare times with a tolerance, not by the card's text.

## The race pilot
One rule, in two places: the tiny race test's `pilot.js` (published, on the game's own frames) and our own test
scripts (not published, on stepped frames).
- It follows the track's course line (`line` in `src/data/raceLines.ts`, a point every 10 m; the tiny race test adds
  its own track): the nearest point to the rover, then a point 5 m + 0.45 s × speed further on. Steer = −4 × the heading
  error to that point, clamped to ±1.
- Speed: for each 5 m from 0 to 60 m ahead, the bend's curvature k (the line's change of heading over 10 m) gives
  vk = max(2, (0.8/k − 2.6)/0.32) m/s, the speed at which the rover's turning radius R = 2.6 + 0.32 v m
  (`Rover.tsx`; the rivals use the same formula in `Rally.tsx`) is 80 % of the bend's radius. The speed allowed now is
  √(vk² + 2 · 8 · a) for a bend a metres ahead: an assumed braking of 8 m/s², not taken from the game. At most
  60 km/h.
- Throttle 1 below the target speed − 0.3 m/s, −1 above it + 0.6 m/s, 0 between.
- When the race marks the rover lost (more than 40 m past the next gate, `lost` in `useRally`), it presses reset:
  back to the last gate, as the R key does.
- Reads `__sv.rover.pose` (x, z, heading, speed) and `__sv.rally.state` (phase, lost); writes `__sv.rover.input`
  (throttle, steer, reset). The game writes throttle and steer only on key events, on its on-screen hold buttons
  (`SurfaceView.tsx`), when the window loses focus, and when the rover's panel closes, as when the rover is recalled
  (the cleanup of `bindRoverKeys`, `src/state/rover.ts`). So the pilot's values stay until it changes them; a loss of
  focus zeroes them until the pilot's next frame. The race code clears `reset` itself once it has acted on it
  (`Rally.tsx`), so the pilot sets it and the game clears it.
- `pilot.js` searches 40 m around its last place on the line (a lap may pass near its own start) and starts 45 m down
  it, where the grid stands (`GRID_S` in `Rally.tsx`); it drives only while the race runs.
- Results: the tiny track, 6.95 or 7.00 s, 3rd of 4, no reset. The canyon race at Coprates (16 gates, stepped frames,
  2026-11-06): it finishes, 4th in 166.4 s with two resets, top speed 58 km/h; the rivals take 99 to 106 s. A test
  driver, not a racer; a race bot would start from it.

## What a start can reach, and how it fails
Through the game's own functions alone: on `window.__sv`, or as imports from `/src` on the dev server. On the
published game only `__sv` works, and these are not on it: `startQuiz`, `openMissions`, `openProbes` / `playProbe`,
`enterBridge`, `goToRally`, `setRallyColor`, `showBriefing` and `startMission`.
- the ship parked at any body: `setTarget` (`src/state/store.ts`) and `flightControl.jumpTo`; the map: `setMode('map')`;
- on the surface of any body that has one: `startLanding`, `skipDescent`; a race site: `goToSite` or `goToRally`;
- the rover out, driving: `launchRover(true)` (`src/state/rover.ts`); placed at x, z and heading:
  `roverDebug.place`, or at sample rock i: `roverDebug.moveTo` (`Rover.tsx`, set on every rover mount);
- a rover race: `startRally`, in a colour: `setRallyColor` (`src/state/rally.ts`); the ship race:
  `useRace.getState().start()` (`src/state/race.ts`); EVA: `startEva` (`src/state/eva.ts`);
- the quiz, the missions list, probes, eclipses, the ship gallery, the bridge, a telescope view: `startQuiz`,
  `openMissions`, `openProbes` / `playProbe`, `openEclipses` / `playEclipse`, `openGallery`, `enterBridge`,
  `setScope` (a `useStore` action: `__sv.store.getState().setScope(id)`);
- a time of day on the surface: `useSkyClock.setState({ seek })` (`__sv.skyClock`), which is all the time bar's own
  `jumpTo` does (`src/components/surface/TimeBar.tsx`, not exported). `seek` is in the clock's `hours`, the time since
  landing in hours, not a local hour. For local noon: `seek = hours + a / 24 × d`, where `a` is how far noon is ahead
  of `clock` (the local hour, 0 to 24) in hours, from 0 to 24, and `d` the length of the body's day in hours
  (`Math.abs(dayHours(id))`, `src/components/surface/skyClock.ts`);
- a locked mission: `showBriefing` refuses one until the mission before has a star (`src/state/mission.ts`), but
  `startMission` does not check. It takes no argument and starts the mission at `useMission`'s `index`, so set that
  first (`__sv.mission.setState({ index })`). Or give the mission before it a star by hand, keeping the others
  (`__sv.mission.setState((s) => ({ stars: { ...s.stars, [id]: 1 } }))`, `id` that mission's): `isUnlocked` reads the
  store, so it unlocks at once. Stars set by hand reach the browser's storage the next time any mission is finished,
  when the game saves the whole map (`saveStars`); a map set without the others would erase them there.

Not offered: a race in progress at gate N, and the same planets and random draws on every run (`Date.now()` and
`Math.random`: only code put in before the game's modules, Techniques above).

How it fails:
- Every call returns at once, and many do nothing at all when the state is not right: `startLanding` when landed or
  with no surface, `goToSite` unless on the surface and at another site, `goToRally` unless on the surface,
  `skipDescent` unless in the descent, `engage` with no target or during a warp. So give every step a wait with a time
  limit that names the step.
- The game's own time limits can turn slow into "ready": 10 s for the surface's shaders, 12 s for terrain, 20 s for
  the warp gate (In your own browser, above).
- The hash switches are substring tests: `skip` (`SurfaceLab.tsx`, only together with `#surface-lab=<body>`), `touch`
  (`src/state/input.ts`), `phone` (`src/state/quality.ts`), `debug` (`src/main.tsx`), `raceauto` (`Race.tsx`). A hash
  value that contains one of the words turns that switch on. `#debug` works in a production build too: `src/main.tsx`
  does not check for dev.
- Below 4 frames per second the ship race's countdown runs slow: it takes at most 0.25 s off per frame
  (`src/components/race/Race.tsx`). Software-rendered, 3.5 s of countdown took 23.1 s (2026-11-05, on our version, whose
  ship-race code is the original's).

## Pitfalls
- **A second copy of a module.** The dev server adds `?t=<time>` to the address of a file changed since it started
  (Vite 5). `import('/src/…')` of the bare path then loads a second copy that the game never reads, and a change to its
  tables or stores does nothing. Read the exact address from the code of a module that imports it, as the tiny race
  test's `setup.js` does, and check the copy against `window.__sv`.
- **A wait judged by the tool's language.** A DOM element comes back from `Runtime.evaluate` as `{}`, which Python
  counts as false; `[]` too. Let the page decide (`!!value`), as the scripted browser does. `en_scan.py` and
  `visible_text.py` still judge in Python; their waits are comparisons, so it does not bite there today.
- **Deleting the profile too early.** Chromium's helper processes write into the profile for a moment after the main
  process has exited. Wait for all of them, or retry the delete (`visible_text.py`); `en_scan.py` waits for the main
  process only.
- **Restarting the dev server reloads every open page**, a race in progress included: Vite's client polls while the
  server is away and reloads when it answers.
- **Two dev servers on one tree** (or on trees that share `node_modules`) share `node_modules/.vite`: one server's
  dependency re-optimisation reloads the other's pages. Give each its own `cacheDir`. `--strictPort` makes a server
  stop when its port is taken, instead of moving to the next free one.
- **`THREE.WebGLRenderer: Context Lost.` in the console is routine.** R3F calls `forceContextLoss()` on a canvas's
  renderer each time a `<Canvas>` unmounts (the surface's, on a move to another site and on takeoff), and three.js logs
  that line: 4 to 6 times in each run of our longest test, passing runs included (counted 2026-11-06). It does not say
  that the GPU process failed.
- **A seed must be set in the same evaluate as the scenario's code.** While the app still loads, three.js draws
  `Math.random` (for `generateUUID`) between two separate evaluates, and the run drew different EVA jobs. The published
  `checks/visible_text.py` does not do this yet: it reseeds in a call of its own, before the scene's code.
- **A track added at run time must fit the race code's fixed measures:** gates 18 m wide (`GATE_HALF`), the start
  grid 45 m down the line, a point every 10 m (`Rally.tsx`). A site added at run time starts from its body's settings:
  `siteDef` (`src/data/surfaces.ts`) lays its `SITES` entry's `look` and `note` over them and takes the body's haze
  × 0.6; the terrain map comes from its `dem` (`demIdFor`), and `range` and `name` are read elsewhere
  (`wideGround.ts`, `SurfaceView.tsx`).

## Performance
All software-rendered (SwiftShader) unless it says GPU; a 16-core Linux machine with other work running.
- App ready (`window.__sv` set) about 13 s after the page opens (2026-11-05), and about 5 s on 2026-11-06 (a tiny race
  test: page opened 10:27:37, `__sv` and the Warp button there 10:27:42). The race steps above: How long it takes.
- Frames: about one per second or fewer: 0.84 per second in a short race on Mars while the machine was busy (a load
  of 16 to 18 on its 16 cores, 2026-11-06), 1.07 in the same race at a load of about 13 (below).
- CPU: one software-rendered Chromium took about 5 cores while the machine was busy with other work (2026-11-06), and
  about 12 cores on a quieter machine (below).
- Memory runs out first when many run at once. On 2026-11-04 several software-rendered browsers ran together, the swap
  was full or nearly full (0 to 5 % free), and at 1.6 to 1.8 GB available the system's out-of-memory guard (earlyoom)
  stopped their page processes, which Chromium marks to be stopped first. The page stops answering; nothing else says
  why. That is why the scripts take the lock (Decisions, above).

**First measurements, software-rendered (2026-11-06, two runs of each; the CPU figure from another session)**, with
13 to 19 GB of memory available:
- Frames: 1.07 per second in the tiny race alone, 0.62 beside a text scan.
- The tiny race test takes 213 s alone and 345 s beside a text scan of 23 scenes; the scan takes 263 to 269 s alone
  and 370 to 375 s beside the race. Side by side (two browsers in one hold of the lock), neither broke in 2 of 2
  tries, and the results were those of lone runs; only the wall time grew.
- CPU: 2,644 to 2,696 s of CPU time in a tiny race test of 223 to 226 s (two runs in the GPU measurements' session
  below, not the 213 s ones), about 12 cores.
- Memory at peak, all of a browser's processes together (proportional set size): 2.1 to 2.2 GB (race), 2.9 GB (scan).

**First measurements on a GPU (2026-11-06, one session of 16 runs):** headless Chromium with `--headless=new
--use-angle=gl-egl` and no display draws on the graphics card (here an NVIDIA GTX 1660: "Hardware accelerated");
Vulkan gave only "reduced performance", and `--use-gl=egl` or `--use-gl=angle --use-angle=gl` turned WebGL off.
- The tiny race test takes 56 s (about 31 frames per second; 6.95 s in all four GPU runs), the text scan 55 s; the app
  is ready in 6.5 s. Two GPU browsers side by side run as fast as one.
- CPU 29 s per race. Memory 1.9 to 2.1 GB (race) and 2.3 to 2.5 GB (scan); the card's memory in use reached 2.0 to
  2.2 GB with one browser and 3.7 to 4.0 GB with two.
- The longest frame on the GPU could not be isolated. The longest timer queries (2.1 to 4.1 s) spanned the pauses
  between frames at scene changes (2.8 to 4.6 s), most likely shader compiles on the CPU, and the card was never more
  than 56 % busy. Whether such a pause holds up the desktop of someone at the machine was not checked.
- Chromium falls back to software by itself when its GPU process fails, so a GPU run should read the WebGL renderer
  (`WEBGL_debug_renderer_info`) and stop if it is SwiftShader.

## Checking the game's text in a browser
Two published scanners in `.memory/tools/localization/`, with the scenarios `scen-ui.json`, `scen-eva.json` and
`scen-apollo.json` (41 scenes): each scene is a few lines of JavaScript that open a screen through `window.__sv` or a
`/src` import (so the dev server only, and the `?t=` pitfall applies).
- `en_scan.py`, in English: whatever still holds Japanese among the visible text nodes and the `title`, `aria-label`,
  `alt` and `placeholder` of every element (visible or not), with the nearest `lang`, and a screenshot of each scene.
  The app counts as ready when `window.__sv` is set and the loading screen (`#boot`, `src/ui/Boot.tsx`) is gone.
- `checks/visible_text.py`, in either language: all visible text nodes, and those four attributes of every element
  (visible or not), with `Math.random` seeded and `Date` set to start at 2026-10-31 00:00 UTC (it then runs on), both
  before the game's modules; a new seed per scene; quality pinned to `'low'`.
  `checks/visible_text_compare.py` compares two runs (before and after a change) scene by scene, digits masked.
- Run the same tree twice for a baseline: frame rate, the news ticker, 3D labels, distance and rover readouts and the
  EVA jobs also differ between two runs of one tree.
- Limits: text drawn into a canvas is not in the page's DOM: the bridge consoles (`src/components/bridge/`), the writing
  on floors and walls in EVA and a ship's name on its hull (`src/components/eva/`), the ships' hull markings
  (`src/components/ship/`) and the Apollo 17 numbers. "Visible" applies to text nodes only, and checks the element's own
  size, visibility, display and opacity, not its parents' opacity. `performance.now()` is not fixed.
- The collecting code, the seeding and the masked comparison are general; the scenarios are this game's.

## Tests we run
Every test we run, by what it checks. "The original game" is the game as its author publishes it
(Junzzy827/solar-odyssey on GitHub); "our version" is the original with our changes, which is not published. Published,
in `.memory/tools/`: the tiny race test; the race ghost's unit tests for the original game (`tests/rallyGhost.test.ts`,
below); and the localization tools, which are the two browser scanners above and the static checks beside them
(`l10n-check`, `keys.mjs`, `l10n-leftovers.mjs`, `checks/fallback_probe_mech.ts`; their README says what each checks).
The other test scripts below are our own and are not on GitHub. They use the techniques above, so a script of your own
can do the same.

In a browser:
- **The rover battery.** It checks that our version drives exactly as the original where we did not change it (slice
  1), and that our own changes work (slice 2). It takes about 8 minutes, software-rendered (494 to 504 s, 2026-11-06).
  We have its in-page harness, which steps the frames and compares two builds value for value; it is not published,
  and we can share it.
  - Slice 1: our version and the original game run side by side in two headless browsers, frames stepped by hand
    with the same inputs, clock and random seeds (Stepping, above). Every value must be equal, as exact floats. It
    covers Mars (the default landing site and the Coprates race site), the Moon and Enceladus. Each runs the same
    driving scenarios: accelerate, coast, brake and reverse; turns; a slalom; a jump at speed; a standing jump; driving
    at the terrain's edge; turns in steps of 0.05 s; driving into a small, a mid-sized and a big rock near the start,
    where the site has one; and taking a sample at the nearest sample site. It also compares each site's rocks, sample
    sites and range, and the Coprates race's rivals racing alone with three seeds. It also checks that the original's
    copy it runs is the commit our version is built on; otherwise a difference could be the original's own.
  - Slice 2: our own changes. These are a race started from the address on load (at each of the three race sites),
    an unknown value there logging an error and staying in space, the music off on the first load, the in-game
    music switch kept across a reload, the three tracks built with their gates, the unit tests below, and no uncaught
    exception.
  - Both versions: the Coprates race run by the pilot (The race pilot, above) against the rivals, and the quality
    level held through the races.
  - The original game is also watched for changes. Its traces are stored per commit. The same commit must give
    identical traces, which is also the harness's check that it is deterministic. A new commit lists every condition
    whose behaviour changed, for a person to judge. The original must also pass on its own: its rivals and the pilot
    finish, and no uncaught exception occurs.
- **The persistence live test**, for a change of ours to saving runs, not yet offered to the game's author: the name
  typed into the hiscore table, an Export button on the result card, and saved runs read back. It uses the real page
  with real input over the DevTools protocol (Techniques, above) and checks:
  - the name typed into the run's own row of the hiscore table: held keys, key repeats, Japanese input;
  - the table, measured cell by cell;
  - the result card at window widths of 960, 700, 500 and 375 pixels, in both languages;
  - Export, saved and checked as a file;
  - saved runs read back as the table's record and as the gold ghost;
  - broken files, logged and skipped.

  Its races are stepped autopilot races: 166.4 s of race in 38 to 45 s of wall time each; the whole test took 8.4 min
  (2026-11-06).
- **R races again.** The Coprates race run by the pilot to its finish checks four things: the result card's button
  shows the key; an R in the card's first 0.5 s is ignored, since it may have been pressed at the finish line; an R
  after that starts the next race, which reaches its countdown; and the console shows no error.
- **The version label and the reload** (a development aid of our version). The label shows the commit the page runs,
  with the commit's time as YYYY-MM-DD HH:MM:SS. After a new commit in the dev server's tree, the page does not reload
  during a race, and the label says it waits. Once the race is quit, the page reloads by itself and runs the new
  commit.
- **The text scans:** the localization checks above, in English and in Japanese.
- **The tiny race test** (`.memory/tools/automation-data/README.md`): the race, from the menus to the result card, on
  the game's unchanged code.

Without a browser (Node's own test runner; the battery runs them too):
- **Ghost:** the race ghost's recorder and replay. It checks samples that are exact at fixed times even with uneven
  frames, a finish not stored twice, the heading that turns the short way across ±π, and a teleport back to a gate
  that snaps instead of gliding. Time going back is an error. It also checks the storage round trip: another course
  version is refused, a broken record throws, a 3-minute run stays small enough for browser storage, a stored run keeps
  its results-book entry, and each track has one storage key. The same kind of tests for the original game's
  `src/state/rallyGhost.ts` are published: `.memory/tools/tests/rallyGhost.test.ts` (Node 22.18 or later runs it as
  it is with `node --test`, no `npm install`; its header lists what it checks and the flag for older Node).
- **Localization:** Japanese and English side by side. It checks the same step counts and shape for the missions and
  chapters, quiz answers that point at a choice in both languages, the same shape for the facts and the interface
  dictionary, and English text with no Japanese letters. It also checks that templates keep the same placeholders in
  both languages. It overlaps with the published `keys.mjs` (the missions' and chapters' shape) and with `l10n-check`'s
  FOREIGN lines (Japanese in English text); what it adds is the step counts against the missions' data, the quiz
  answers, the facts tables and the placeholders. We have this test; it is not published, and we can share it.
- **Sites:** every landing site is drawn with the same haze as in the original's own code.

---
Written by cratercamper and Claude Code.
