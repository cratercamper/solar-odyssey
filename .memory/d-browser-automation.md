---
name: d-browser-automation
description: "Browser automation — anything that controls the browser by itself: navigation and race pilot, outside vs in-page control, and the one tool described here, the scripted browser (.memory/tools/automation/scripted_browser.py). Written for a person first, technical towards the end."
type: design
---

# Browser automation

Browser automation here means anything that controls the browser by itself, with no one at the keyboard: tools for
development and testing today, perhaps a race bot later. It has two parts:
- **Navigation:** getting to a game state (a race, a landing site, a scene) through the app's menus. The scripted
  browser below does this: its steps click the real buttons (warp, land, start a race); the example below clicks
  Warp.
- **Race pilot:** controlling the rover during a race. One small pilot exists, in the tiny race test
  (`.memory/tools/automation-data/README.md`): it drives a short track once, from the start to the finish gate, so that
  the test can check the race.
  A race bot would get its own section here or its own design doc branched from this one.

The browser can be controlled in two ways. From outside: a separate program remote-controls the browser, runs
JavaScript in the page, waits and takes screenshots, while the app runs at its own pace. The scripted browser works this
way. From inside: code injected into the page, which can also stop the app's frame loop and step the frames itself at a
fixed time step. A test of physics needs the inside way (see Limits). The two mix: a step of the scripted browser
can put such code in the page. The tiny race test does a little of it: from the start of the race it fixes the page's
clock to one step of 0.05 s per drawn frame, while the app's own frame loop runs as it is.

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
- The browser draws in software, so it needs no graphics card, but it is slow: in one measurement the app was ready
  about 13 s after the page was opened, and 3D scenes run at about 1–2 frames per second.
- So a real-time run cannot test physics. The rover and race physics cap a frame's time step at 0.05 s
  (`Math.min(rawDt, 0.05)` in `Rover.tsx` and `Rally.tsx`), so the rover and the race run at 1/20 to 1/10 of real
  time, in steps three times longer than at 60 fps. A clock fixed from the page, as in the tiny race test, makes a
  race's time the time the game simulated, in steps of the test's choosing: 0.05 s there; 1/60 s would give a fast
  machine's steps, in three times as many frames.
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
- **One headless Chromium at a time among the scripts that take the lock, in turn**
  (`.memory/tools/automation/chromium_lock.py`, beside the tool, shared by every script that imports it, such as our
  own test scripts, which are not published). Why: a second software-rendered Chromium beside a test run of several
  minutes once cost that run its GPU context. A script that starts a Chromium without the lock is not held back.
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
  - A live run that has held the lock for more than an hour (the longest test run measured took 27 minutes) is taken
    as stuck: each waiter stops with an error that names it, rather than wait for ever.
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
    published) written before the queue still use; it goes once they import `chromium_lock.py`. A script that takes
    neither is not held back.
- **The address must answer before the lock is touched.** A dev server that is down ends the run before it waits in
  the queue or starts anything.
- **Never through a proxy.** The DevTools channel and the address check go to localhost directly, whatever
  `http_proxy` or `HTTPS_PROXY` say.
- **Software WebGL.** `--use-angle=swiftshader --enable-unsafe-swiftshader`: SwiftShader draws on the CPU, so a run needs
  no GPU and no screen.
- **Low priority.** Chromium starts under `nice -n 10`: a software renderer can take half of a machine's cores, and
  the desktop of whoever works at it must stay responsive.
- **Fail loud.** The whole steps file is checked before Chromium starts: an unknown kind or key, two kinds in one step,
  or a value of the wrong type is refused, with every problem listed. A wait that times out, a JavaScript exception in a
  step, a DevTools call with no answer within its time, a page that crashes, a page load that fails, or no DevTools port
  within 15 s ends the run.

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

---
Written by cratercamper and Claude Code.
