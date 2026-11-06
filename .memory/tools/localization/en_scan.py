#!/usr/bin/env python3
"""en_scan.py <out_dir> <scenarios.json> <url> — load the app in headless Chromium (CDP), run each scenario's JS,
then list every visible text / title / aria-label / alt that still holds Japanese characters, and screenshot it.
Console errors and uncaught exceptions are collected too. Fails loud on JS exceptions in a scenario.
Browser: the machine's lock, renderer and stop from ../automation/ (chromium_lock.py, renderer.py, scripted_browser.py):
it waits for its turn itself (so do not run it under `chromium_lock.py run`), draws on the graphics card unless
SCRIPTED_BROWSER_RENDERER=swiftshader, and fails when a gpu run draws in software or Chromium's GPU process dies.
The lock needs Linux and the machine's own PID namespace (it reads /proc). SCRIPTED_BROWSER_LOCK=off skips it, as in
scripted_browser.py (unset or `on` takes it; any other value is an error): for a machine where this is the only
headless Chromium. Nothing then holds other runs back from this one, nor this one from them."""
import asyncio, base64, json, os, shutil, signal, subprocess, sys, tempfile, time, urllib.request
import websockets

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "automation"))
import chromium_lock  # noqa: E402
import renderer  # noqa: E402
from scripted_browser import LOCK_ENV, on_signal, stop_chromium  # noqa: E402

JA = r"[぀-ヿ㐀-鿿！-｠、。「」『』〜　℃]"

COLLECT = """(() => {
  const ja = new RegExp('%s');
  const out = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity !== 0 };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const txt = n.nodeValue.trim();
    if (!txt || !ja.test(txt)) continue;
    const el = n.parentElement;
    if (!el || !vis(el)) continue;
    const lang = el.closest('[lang]')?.getAttribute('lang');
    out.push({ where: 'text', tag: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''), lang, txt: txt.slice(0, 140) });
  }
  for (const el of document.querySelectorAll('[title],[aria-label],[alt],[placeholder]')) {
    for (const a of ['title', 'aria-label', 'alt', 'placeholder']) {
      const v = el.getAttribute(a);
      if (v && ja.test(v)) out.push({ where: a, tag: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''), lang: el.closest('[lang]')?.getAttribute('lang'), txt: v.slice(0, 140) });
    }
  }
  return out;
})()""" % JA.replace('\\', '\\\\')


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


async def main(out_dir, scenarios, url, kind):
    # Per-run dir, deleted whole in finally, so the ~60 MB browser profiles do not pile up in the temp folder.
    # Chromium's log goes to out_dir, which the caller keeps.
    tmp = tempfile.mkdtemp(prefix="l10n-chr-scan-")
    os.makedirs(out_dir, exist_ok=True)
    env = dict(os.environ, TMPDIR=tmp)
    chrome_log = os.path.join(out_dir, "chrome.log")
    chrome = subprocess.Popen(
        ["nice", "-n", "10", "chromium", "--headless=new", "--no-first-run", f"--user-data-dir={tmp}/prof",
         *renderer.FLAGS[kind], "--window-size=1280,800",
         "--remote-debugging-port=0", "about:blank"],  # free port: a fixed one let two runs share a browser
        env=env, stdout=subprocess.DEVNULL, stderr=open(chrome_log, "w"),
        start_new_session=True)  # own process group: stop_chromium() stops its helpers too before the rmtree
    lost = []
    console = []
    report = {}
    try:
        for _ in range(50):
            try:
                port = int(open(f"{tmp}/prof/DevToolsActivePort").readline())  # chromium writes the port it chose
                targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json"))
                break
            except (OSError, ValueError):
                await asyncio.sleep(0.2)
        else:
            raise RuntimeError("chromium DevTools port never answered")
        page = next(t for t in targets if t["type"] == "page")
        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=2**27) as ws:
            n = 0
            pending = {}

            async def reader():
                async for raw in ws:
                    msg = json.loads(raw)
                    if "id" in msg and msg["id"] in pending:
                        pending.pop(msg["id"]).set_result(msg)
                    elif msg.get("method") == "Runtime.consoleAPICalled" and msg["params"]["type"] in ("error", "warning", "assert"):
                        args = " ".join(str(a.get("value", a.get("description", ""))) for a in msg["params"]["args"])
                        console.append(f"{msg['params']['type']}: {args[:300]}")
                    elif msg.get("method") == "Runtime.exceptionThrown":
                        d = msg["params"]["exceptionDetails"]
                        console.append(f"exception: {d.get('exception', {}).get('description', d.get('text'))[:300]}")
                    elif msg.get("method") == "Log.entryAdded" and msg["params"]["entry"]["level"] == "error":
                        console.append(f"log-error: {msg['params']['entry'].get('text', '')[:300]} {msg['params']['entry'].get('url', '')}")

            rtask = asyncio.create_task(reader())

            async def call(method, **params):
                nonlocal n
                n += 1
                fut = asyncio.get_event_loop().create_future()
                pending[n] = fut
                await ws.send(json.dumps({"id": n, "method": method, "params": params}))
                msg = await asyncio.wait_for(fut, 600)
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg["result"]

            async def js(expr):
                r = await call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
                if "exceptionDetails" in r:
                    raise RuntimeError(f"JS exception in {expr[:200]!r}: {r['exceptionDetails'].get('exception', {}).get('description')}")
                return r["result"].get("value")

            await call("Runtime.enable")
            await call("Log.enable")
            await call("Page.enable")
            drawn_by = await js(renderer.RENDERER_JS)
            log(f"WebGL renderer ({kind}): {drawn_by}")
            renderer.check(kind, drawn_by)
            await call("Page.navigate", url=url)
            t0 = time.time()
            while not await js("!!window.__sv && !document.getElementById('boot')"):
                if time.time() - t0 > 90:
                    raise TimeoutError("app never became ready (__sv + boot screen gone)")
                await asyncio.sleep(0.5)
            log(f"app ready in {time.time() - t0:.1f}s")
            for sc in scenarios:
                name = sc["name"]
                if sc.get("js"):
                    v = await js(f"(async () => {{ {sc['js']} }})()")
                    log(f"{name}: js -> {v!r}")
                if sc.get("wait"):
                    t1 = time.time()
                    while not await js(sc["wait"]):
                        if time.time() - t1 > sc.get("timeout", 60):
                            raise TimeoutError(f"{name}: wait timed out: {sc['wait']}")
                        await asyncio.sleep(0.5)
                await asyncio.sleep(sc.get("sleep", 1.5))
                found = await js(COLLECT)
                report[name] = found
                r = await call("Page.captureScreenshot", format="png")
                with open(os.path.join(out_dir, f"{name}.png"), "wb") as f:
                    f.write(base64.b64decode(r["data"]))
                log(f"{name}: {len(found)} Japanese strings visible")
                for x in found:
                    log(f"    [{x['where']} {x['tag']} lang={x['lang']}] {x['txt']}")
            drawn_by = await js(renderer.RENDERER_JS)
            log(f"WebGL renderer at the end ({kind}): {drawn_by}")
            renderer.check(kind, drawn_by, at_end=True)
            rtask.cancel()
    finally:
        try:  # the stop must run even when reading the log fails or a signal lands here
            lost = renderer.gpu_deaths(chrome_log)  # before the stop, whose SIGTERM also reaches the GPU process
            if lost:  # said here too: after a failed scenario the raise below is not reached
                log(f"ERROR: Chromium's GPU process died during the run ({len(lost)} time(s)): {lost[0]}")
        finally:
            stop_chromium(chrome)
        shutil.rmtree(tmp)
        with open(os.path.join(out_dir, "report.json"), "w") as f:
            json.dump({"report": report, "console": console}, f, ensure_ascii=False, indent=1)
        log(f"console errors/warnings: {len(console)}")
        for c in console:
            log(f"    {c}")
    if lost:
        raise RuntimeError(f"Chromium's GPU process died during the run ({len(lost)} time(s)): {lost[0]}")


if __name__ == "__main__":
    out, sc_path, url = sys.argv[1], sys.argv[2], sys.argv[3]
    if "debug" not in url.partition("#")[2]:  # main.tsx: if (location.hash.includes('debug')) import('./debugHooks')
        sys.exit(f"en_scan: url needs '#debug' (window.__sv exists only then; without it the run waits 90 s and times out): {url}")
    kind = renderer.kind()
    locked = os.environ.get(LOCK_ENV, "on")
    if locked not in ("on", "off"):
        sys.exit(f"en_scan: {LOCK_ENV}={locked!r}: must be on or off")
    locked = locked == "on"
    scenarios = json.load(open(sc_path))
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, on_signal)  # unwinds through the finally blocks: Chromium stopped, lock released
    if locked:
        chromium_lock.acquire(" ".join(sys.argv), kind=kind)
    else:
        log(f"{LOCK_ENV}=off: no lock taken; nothing holds other headless Chromiums back from this run, nor it from them")
    try:
        asyncio.run(main(out, scenarios, url, kind))
    finally:
        if locked:
            chromium_lock.release()
