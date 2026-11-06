#!/usr/bin/env python3
"""scripted_browser.py — the scripted browser: runs a script of steps in a headless Chromium against the app's local
dev server (`npm run dev`), over the Chrome DevTools Protocol.

Usage: scripted_browser.py <out_dir> <steps.json> [url]
  url default: http://localhost:5173/?lang=en#debug (the dev server, in English). `#debug` loads src/debugHooks.ts,
  which puts the app's stores and actions on window.__sv.
Steps (a JSON list), each an object of exactly one kind:
  {"eval": "<js>"} or {"eval": "<js>", "save": "<file>"}, optional "timeout" (s, default 120): evaluates in the page,
      awaits a promise, logs the value; with save, writes it to <out_dir>/<file> (a string as it is, anything else as
      JSON; undefined, NaN or Infinity is an error)
  {"wait": "<js>", "timeout": s}   re-evaluates an expression (not a statement: no trailing `;`) every 0.25 s until
                                   it is true in JavaScript's sense ([], {} and a DOM element count; the page
                                   decides), timeout default 30 s
  {"sleep": s}                     waits s seconds
  {"shot": "<name>"}               writes <out_dir>/<name>.png
  The whole file is checked before Chromium starts: an unknown kind or key, or a value of the wrong type, is refused.
The page's own uncaught exceptions and console errors are logged with the time they happened (printed when the tool
next talks to the browser, at the latest after the last step, or after the step that failed).
Needs Python's `websockets` (15 or newer), `chromium` on PATH, and the dev server reachable at the url. Linux as
written (the lock check reads /proc).
Renderer: the page's WebGL draws on the machine's graphics card by default; SCRIPTED_BROWSER_RENDERER=swiftshader draws
on the CPU, for a machine without a usable card or without nvidia-smi, which the lock reads for a GPU run (renderer.py,
beside this file). A GPU run stops before loading the url when a WebGL2 context in its page gets a software renderer
(or none: check() in renderer.py), and fails when a new one does at the end of the steps. Any run fails when Chromium's
log says its GPU process died (Chromium then starts another, and the page may go on without its WebGL).
Lock: the run waits for its turn in chromium_lock.py (beside this file: holders in turn on the machine among the
scripts that take it, first come, first served; it prints its place while it waits). It takes the lock with its
renderer as the kind: a GPU run takes one slot, so it may run beside another GPU run while the GPU and the machine have
the memory; a swiftshader run takes all slots and runs alone. Our own test scripts (not published) take the same lock;
scripts that do not take it are not held back by it.
Without the lock: SCRIPTED_BROWSER_LOCK=off skips it (unset or `on` takes it; any other value is an error), for a
machine where this run is the only headless Chromium, such as a Claude Code cloud session. There the lock may not
work at all: it refuses to queue outside the kernel's initial PID namespace, and a container usually has its own.
Nothing then holds other runs back from this one, nor this one from them. On a machine without a usable graphics
card, set SCRIPTED_BROWSER_RENDERER=swiftshader as well: a GPU run there stops at its renderer check. Not yet tried
in a cloud session. Known from Chromium, not seen here: as root it refuses to start without --no-sandbox, which this
tool does not pass, so a run in a container that runs as root fails at its start (exit 1).
Exit: 0 = every step passed, the page answered once more after them (that call reads its last events), a GPU run still
got the GPU at the end, Chromium's log has no dead GPU process, and Chromium's process group is gone (its crash
reporter runs outside the group and exits with the browser); 1 = the renderer check before loading, a step, that last
call, the end check or the browser failed, or Chromium's GPU process died (the run's temp dir with chrome.log is kept
and named; a dead GPU process is logged as an ERROR line, also after a step that failed), or the run could not
start (for example: no dev server answering at the url, the lock taken outside the machine's own PID namespace, a
lock held past the hold limit, the lock taken under `chromium_lock.py run`, an out_dir that cannot be made); 2 = bad
arguments, steps or environment values; 128 + n = stopped by signal n (Chromium stopped and the lock, if taken,
released first).
"""
import asyncio
import base64
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request

import websockets

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import chromium_lock  # noqa: E402 (lives beside this file)
import renderer  # noqa: E402 (lives beside this file)

DEFAULT_URL = "http://localhost:5173/?lang=en#debug"
LOCK_ENV = "SCRIPTED_BROWSER_LOCK"  # off: run without chromium_lock (docstring, "Without the lock")
CALL_TIMEOUT = 120  # s: the longest a single DevTools call may wait for its answer (an eval step can set its own)
KINDS = {"eval": {"save", "timeout"}, "wait": {"timeout"}, "sleep": set(), "shot": set()}
NO_PROXY = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # localhost only: never through a proxy


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def die(code, msg):
    print(f"[{time.strftime('%H:%M:%S')}] scripted_browser: {msg}", file=sys.stderr, flush=True)
    sys.exit(code)


def check_steps(steps):
    """Every problem in the steps file, before anything starts."""
    if not isinstance(steps, list) or not steps:
        return ["the file must hold a non-empty JSON list of steps"]
    problems = []
    for i, s in enumerate(steps):
        if not isinstance(s, dict):
            problems.append(f"step {i}: not an object: {s!r}")
            continue
        kinds = [k for k in KINDS if k in s]
        if len(kinds) != 1:
            problems.append(f"step {i} {s}: needs exactly one of {', '.join(KINDS)}")
            continue
        kind = kinds[0]
        extra = set(s) - {kind} - KINDS[kind]
        if extra:
            problems.append(f"step {i}: key(s) {sorted(extra)} do not belong to a step of kind {kind} (allowed: {sorted(KINDS[kind]) or 'none'})")
        for key in ("eval", "wait", "shot", "save"):
            if key in s and not (isinstance(s[key], str) and s[key]):
                problems.append(f"step {i}: {key} must be a non-empty string")
        for key in ("sleep", "timeout"):
            if key in s and (isinstance(s[key], bool) or not isinstance(s[key], (int, float)) or s[key] < 0):
                problems.append(f"step {i}: {key} must be a number of seconds >= 0")
    return problems


def check_url(url):
    """The dev server must answer before the lock is touched (from inside a sandbox, localhost is often unreachable)."""
    base = url.split("#")[0]
    try:
        with NO_PROXY.open(base, timeout=5) as r:
            r.read(1)
    except OSError as e:
        die(1, f"{base} does not answer ({e}); start the dev server first, and run this outside any sandbox")


def on_signal(sig, _frame):
    raise SystemExit(128 + sig)  # unwinds through the finally blocks: Chromium stopped, lock released (or ticket dropped)


def stop_chromium(proc, grace=10):
    """Stop the browser and every process in its group. Waiting for the browser process alone let its GPU, renderer
    and utility processes write on into the profile, so deleting the profile failed ('Directory not empty') after a
    good run. The browser leads its own process group (start_new_session), so the group is gone exactly when none of
    them is left. (Chromium's crash reporter runs outside the group, exits by itself and does not write the profile.)"""
    pgid = proc.pid
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(pgid, sig)
        except ProcessLookupError:
            proc.wait()
            return
        deadline = time.monotonic() + grace
        while time.monotonic() < deadline:
            proc.poll()  # reap the browser process itself, or the group never looks empty
            try:
                os.killpg(pgid, 0)
            except ProcessLookupError:
                return
            time.sleep(0.1)
        if sig == signal.SIGTERM:
            log(f"chromium group {pgid} still alive {grace} s after SIGTERM; SIGKILL")
    raise RuntimeError(f"chromium process group {pgid} survived SIGKILL")


def page_event(msg):
    """Events that arrive between answers: a crash ends the run, the page's own errors are logged."""
    method, p = msg.get("method"), msg.get("params", {})
    if method in ("Inspector.targetCrashed", "Inspector.detached"):
        raise RuntimeError(f"the page is gone: {method} {p}")
    at = time.strftime("%H:%M:%S", time.localtime(p.get("timestamp", 0) / 1000)) if "timestamp" in p else "?"
    if method == "Runtime.exceptionThrown":
        d = p.get("exceptionDetails", {})
        log(f"PAGE ERROR (at {at}): uncaught {d.get('exception', {}).get('description') or d.get('text')}")
    elif method == "Runtime.consoleAPICalled" and p.get("type") == "error":
        text = " ".join(str(a.get("value", a.get("description", a.get("type")))) for a in p.get("args", []))
        log(f"PAGE ERROR (at {at}): console.error {text}")


# A wait asks the page itself for the truth value: Python's bool() of the returned value would call [] and {} (and so a
# DOM element, which comes back as {}) false, and such a wait would never pass.
WAIT_JS = "Promise.resolve((\n{}\n)).then((v) => !!v)"


async def main(out_dir, steps, url, kind):
    tmp = tempfile.mkdtemp(prefix="scripted-browser-", dir="/tmp")  # short (SingletonSocket limit) and never reused
    ok = False
    chrome = subprocess.Popen(
        # nice: the desktop keeps priority (a software renderer takes several cores)
        ["nice", "-n", "10", "chromium", "--headless=new", "--no-first-run", f"--user-data-dir={tmp}/prof",
         *renderer.FLAGS[kind], "--window-size=1280,800",
         "--remote-debugging-port=0", "about:blank"],  # free port: a fixed one once let two runs share one browser
        env=dict(os.environ, TMPDIR=tmp), stdout=subprocess.DEVNULL, stderr=open(f"{tmp}/chrome.log", "w"),
        start_new_session=True)  # own process group, so stop_chromium() reaches all of it
    try:
        deadline = time.monotonic() + 15
        while True:
            if chrome.poll() is not None:
                tail = open(f"{tmp}/chrome.log").read()[-800:]
                raise RuntimeError(f"chromium exited with {chrome.returncode} at start; {tmp}/chrome.log ends:\n{tail}")
            try:
                port = int(open(f"{tmp}/prof/DevToolsActivePort").readline())  # chromium writes the port it chose
                targets = json.load(NO_PROXY.open(f"http://127.0.0.1:{port}/json", timeout=2))
                break
            except (OSError, ValueError):
                pass
            if time.monotonic() > deadline:
                raise RuntimeError(f"chromium's DevTools port did not answer within 15 s; see {tmp}/chrome.log")
            await asyncio.sleep(0.2)
        page = next(t for t in targets if t["type"] == "page")
        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=2**26, proxy=None) as ws:
            n = 0

            async def call(method, timeout=CALL_TIMEOUT, **params):
                nonlocal n
                n += 1
                my = n
                await ws.send(json.dumps({"id": my, "method": method, "params": params}))
                end = time.monotonic() + timeout
                while True:
                    left = end - time.monotonic()
                    if left <= 0:
                        raise TimeoutError(f"{method}: no answer from Chromium within {timeout:.0f} s")
                    try:
                        msg = json.loads(await asyncio.wait_for(ws.recv(), left))
                    except asyncio.TimeoutError:
                        raise TimeoutError(f"{method}: no answer from Chromium within {timeout:.0f} s") from None
                    if msg.get("id") == my:
                        if "error" in msg:
                            raise RuntimeError(f"{method}: {msg['error']}")
                        return msg["result"]
                    page_event(msg)

            async def js(expr, timeout=CALL_TIMEOUT, shown=None):
                r = await call("Runtime.evaluate", timeout=timeout, expression=expr, returnByValue=True, awaitPromise=True)
                if "exceptionDetails" in r:
                    d = r["exceptionDetails"]
                    raise RuntimeError(f"JS exception in {shown or expr!r}: "
                                       f"{d.get('exception', {}).get('description') or d.get('text')}")
                return r["result"]  # a RemoteObject: type, value or unserializableValue

            async def drain(quiet=0.5, most=5):
                """Logs the page events Chromium has sent, without asking the page anything (so the events of a page
                that hangs are read too): until none has come for `quiet` s, for at most `most` s."""
                end = time.monotonic() + most
                while (left := end - time.monotonic()) > 0:
                    try:
                        msg = json.loads(await asyncio.wait_for(ws.recv(), min(quiet, left)))
                    except (asyncio.TimeoutError, websockets.ConnectionClosed):
                        return  # none came for `quiet` s, or the connection is closed: nothing more to read
                    page_event(msg)

            for domain in ("Inspector", "Runtime", "Page"):
                await call(f"{domain}.enable")
            drawn_by = (await js(renderer.RENDERER_JS)).get("value")
            log(f"WebGL renderer ({kind}): {drawn_by}")
            renderer.check(kind, drawn_by)
            nav = await call("Page.navigate", url=url)
            if nav.get("errorText"):
                raise RuntimeError(f"loading {url} failed: {nav['errorText']}")
            await asyncio.sleep(1)
            try:
                for step in steps:
                    if "eval" in step:
                        res = await js(step["eval"], step.get("timeout", CALL_TIMEOUT))
                        if "save" in step:
                            if res.get("type") == "undefined" or "unserializableValue" in res:
                                raise ValueError(f"save {step['save']}: the value is {res.get('unserializableValue', 'undefined')}, not data")
                            v = res.get("value")
                            path = os.path.join(out_dir, step["save"])
                            with open(path, "w") as f:
                                f.write(v if isinstance(v, str) else json.dumps(v))
                            log(f"eval -> saved {path}")
                        else:
                            shown = res.get("unserializableValue", res.get("value", "undefined" if res.get("type") == "undefined" else None))
                            log(f"eval {step['eval']} -> {shown!r}")
                    elif "wait" in step:
                        limit = step.get("timeout", 30)
                        t0 = time.monotonic()
                        while True:
                            left = limit - (time.monotonic() - t0)
                            if left <= 0:
                                raise TimeoutError(f"wait timed out after {limit} s: {step['wait']}")
                            try:
                                if (await js(WAIT_JS.format(step["wait"]), left, step["wait"])).get("value") is True:
                                    break
                            except TimeoutError:
                                raise TimeoutError(f"wait timed out after {limit} s (the page did not answer): {step['wait']}") from None
                            await asyncio.sleep(0.25)
                        log(f"wait ok in {time.monotonic() - t0:.1f}s: {step['wait']}")
                    elif "sleep" in step:
                        await asyncio.sleep(step["sleep"])
                    elif "shot" in step:
                        r = await call("Page.captureScreenshot", format="png")
                        path = os.path.join(out_dir, step["shot"] + ".png")
                        with open(path, "wb") as f:
                            f.write(base64.b64decode(r["data"]))
                        log(f"shot {path}")
                    else:
                        raise AssertionError(f"step passed check_steps but has no handler: {step}")
            except Exception:
                # The failed step's page events, which no call has read yet, are logged before its error ends the run:
                # they are often its cause.
                await drain()
                raise
            # Page events are read only while a call waits for its answer: this last call reads those that came during
            # the last step (a sleep, say); drain() above does it for a step that failed.
            await call("Runtime.evaluate", expression="0")
            # Chromium starts a new GPU process when one dies, and the page may go on in software: a gpu run must still
            # get the GPU in a new WebGL2 context at its end (a page's own context lost without a dead GPU process is
            # not checked).
            drawn_by = (await js(renderer.RENDERER_JS)).get("value")
            log(f"WebGL renderer at the end ({kind}): {drawn_by}")
            renderer.check(kind, drawn_by, at_end=True)
        ok = True
    finally:
        # Read also after a failed step (the one death seen so far, 2026-11-06, showed as a wait that timed out), and
        # before Chromium is stopped, so that its own shutdown is never counted: the stop sends SIGTERM to the GPU
        # process too. The browser logs a death a few ms after the page notices it, so a death in the last few ms
        # before this read can be missed (after every step's output). The stop runs even if the read or the print fails.
        try:
            lost = renderer.gpu_deaths(f"{tmp}/chrome.log")
            if lost:
                log(f"ERROR: Chromium's GPU process died during the run ({len(lost)} time(s)): {lost[0]}")
        finally:
            stop_chromium(chrome)
        if os.path.exists(f"{tmp}/prof"):
            shutil.rmtree(f"{tmp}/prof")
        if ok and not lost:
            shutil.rmtree(tmp)  # the ~60 MB profile is gone already; /tmp is often RAM, left-over dirs pile up
        else:
            log(f"kept {tmp}/chrome.log")
    if lost:  # every step passed, but the run's GPU process died: the run fails
        raise RuntimeError(f"Chromium's GPU process died during the run ({len(lost)} time(s)): {lost[0]}")


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        die(2, "usage: scripted_browser.py <out_dir> <steps.json> [url]")
    out, steps_path = sys.argv[1], sys.argv[2]
    url = sys.argv[3] if len(sys.argv) == 4 else DEFAULT_URL
    try:
        kind = renderer.kind()
    except ValueError as e:
        die(2, str(e))
    locked = os.environ.get(LOCK_ENV, "on")
    if locked not in ("on", "off"):
        die(2, f"{LOCK_ENV}={locked!r}: must be on or off")
    locked = locked == "on"
    try:
        steps = json.load(open(steps_path))
    except (OSError, ValueError) as e:
        die(2, f"{steps_path}: {e}")
    problems = check_steps(steps)
    if problems:
        die(2, f"{steps_path}: " + "; ".join(problems))
    os.makedirs(out, exist_ok=True)
    check_url(url)
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, on_signal)
    if locked:
        chromium_lock.acquire(" ".join(sys.argv), kind=kind)
    else:
        log(f"{LOCK_ENV}=off: no lock taken; nothing holds other headless Chromiums back from this run, nor it "
            "from them")
    try:
        asyncio.run(main(out, steps, url, kind))
    finally:
        if locked:
            chromium_lock.release()
