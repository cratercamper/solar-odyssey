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
The page's own uncaught exceptions and console errors are logged with the time they happened (at the next step).
Needs Python's `websockets` (15 or newer), `chromium` on PATH, and the dev server reachable at the url. Linux as
written (the lock check reads /proc).
Lock: the run waits for its turn in chromium_lock.py (beside this file: one headless Chromium at a time on the machine,
first come, first served; it prints its place while it waits), so it never runs beside the scripts that take the same
lock, such as our own test scripts (not published). Scripts that do not take it are not held back by it.
Exit: 0 = every step passed and Chromium's process group is gone (its crash reporter runs outside the group and exits
with the browser); 1 = a step or the browser failed (the run's temp dir with chrome.log is kept and named), or the run
could not start (for example: no dev server answering at the url, not on the machine's own PID namespace, a lock held
past the hold limit, run under `chromium_lock.py run`, an out_dir that cannot be made); 2 = bad arguments or steps;
128 + n = stopped by signal n (Chromium stopped and the lock released first).
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

DEFAULT_URL = "http://localhost:5173/?lang=en#debug"
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
# DOM element, which comes back as {}) false, and such a wait would never end.
WAIT_JS = "Promise.resolve((\n{}\n)).then((v) => !!v)"


async def main(out_dir, steps, url):
    tmp = tempfile.mkdtemp(prefix="scripted-browser-", dir="/tmp")  # short (SingletonSocket limit) and never reused
    ok = False
    chrome = subprocess.Popen(
        # nice: the desktop keeps priority over a software renderer
        ["nice", "-n", "10", "chromium", "--headless=new", "--no-first-run", f"--user-data-dir={tmp}/prof",
         "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800",
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

            for domain in ("Inspector", "Runtime", "Page"):
                await call(f"{domain}.enable")
            nav = await call("Page.navigate", url=url)
            if nav.get("errorText"):
                raise RuntimeError(f"loading {url} failed: {nav['errorText']}")
            await asyncio.sleep(1)
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
        ok = True
    finally:
        stop_chromium(chrome)
        if os.path.exists(f"{tmp}/prof"):
            shutil.rmtree(f"{tmp}/prof")
        if ok:
            shutil.rmtree(tmp)  # the ~60 MB profile is gone already; /tmp is often RAM, left-over dirs pile up
        else:
            log(f"kept {tmp}/chrome.log")


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        die(2, "usage: scripted_browser.py <out_dir> <steps.json> [url]")
    out, steps_path = sys.argv[1], sys.argv[2]
    url = sys.argv[3] if len(sys.argv) == 4 else DEFAULT_URL
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
    chromium_lock.acquire(" ".join(sys.argv))
    try:
        asyncio.run(main(out, steps, url))
    finally:
        chromium_lock.release()
