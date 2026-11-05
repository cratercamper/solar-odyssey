#!/usr/bin/env python3
"""visible_text.py <out.json> <scenarios.json> <url> — every visible text of the app, per scenario.

For the before/after check of the conversion to ui(): run it on the unconverted and on the converted tree, in each
language, then compare with visible_text_compare.py. Same scenarios and browser driving as
../en_scan.py (headless Chromium over CDP; free DevTools port; per-run profile deleted afterwards), but:
  - it collects ALL visible text (text nodes, title, aria-label, alt, placeholder), not only Japanese, in full;
  - Math.random is seeded, and reseeded before each scenario, and the clock starts at a fixed instant (then runs
    normally), injected before the app's own code, so the two trees draw the same quiz questions and show the same sky; numbers that still move with run time
    are masked by the comparison, not here;
  - the quality setting is pinned to low (its 'auto' picks by frame rate, which differs between runs).
Run the two trees one after the other, not side by side.
Fails loud on a JS exception in a scenario, and on an app that never becomes ready.
Usage:  python3 checks/visible_text.py out.json scen-ui.json 'http://localhost:<port>/?lang=en#debug'
"""
import asyncio, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
import websockets

T0_MS = 1793404800000  # 2026-10-31 00:00 UTC: the fixed start of the app's clock
SEED = """(() => {
  let a = 20261104 >>> 0
  window.__vtReseed = (s) => { a = s >>> 0 } // each scenario starts from the same point of the sequence
  Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const RealDate = Date, realNow = RealDate.now.bind(RealDate), off = %d - realNow()
  function FixedDate(...args) { if (!new.target) return new RealDate(realNow() + off).toString(); return args.length ? new RealDate(...args) : new RealDate(realNow() + off) }
  FixedDate.prototype = RealDate.prototype
  FixedDate.now = () => realNow() + off
  FixedDate.UTC = RealDate.UTC; FixedDate.parse = RealDate.parse
  Date = FixedDate
})()""" % T0_MS

COLLECT = """(() => {
  const out = []
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity !== 0 }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n; (n = walker.nextNode());) {
    const txt = n.nodeValue.trim()
    if (!txt) continue
    const el = n.parentElement
    if (!el || !vis(el) || el.closest('script,style')) continue
    out.push('text\\t' + txt)
  }
  for (const el of document.querySelectorAll('[title],[aria-label],[alt],[placeholder]')) {
    for (const a of ['title', 'aria-label', 'alt', 'placeholder']) { const v = el.getAttribute(a); if (v) out.push(a + '\\t' + v) }
  }
  return out
})()"""


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


async def main(out_path, scenarios, url):
    tmp = tempfile.mkdtemp(prefix="l10n-chr-vt-")  # the ~60 MB browser profile: deleted whole in finally
    chrome = subprocess.Popen(
        ["chromium", "--headless=new", "--no-first-run", f"--user-data-dir={tmp}/prof",
         "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800",
         "--remote-debugging-port=0", "about:blank"],
        env=dict(os.environ, TMPDIR=tmp), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    console, report = [], {}
    try:
        for _ in range(50):
            try:
                port = int(open(f"{tmp}/prof/DevToolsActivePort").readline())
                targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json"))
                break
            except (OSError, ValueError):
                await asyncio.sleep(0.2)
        else:
            raise RuntimeError("chromium DevTools port never answered")
        page = next(t for t in targets if t["type"] == "page")
        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=2**27) as ws:
            n, pending = 0, {}

            async def reader():
                async for raw in ws:
                    msg = json.loads(raw)
                    if "id" in msg and msg["id"] in pending:
                        pending.pop(msg["id"]).set_result(msg)
                    elif msg.get("method") == "Runtime.consoleAPICalled" and msg["params"]["type"] in ("error", "warning", "assert"):
                        console.append(f"{msg['params']['type']}: " + " ".join(str(a.get("value", a.get("description", ""))) for a in msg["params"]["args"])[:300])
                    elif msg.get("method") == "Runtime.exceptionThrown":
                        d = msg["params"]["exceptionDetails"]
                        console.append(f"exception: {d.get('exception', {}).get('description', d.get('text'))[:300]}")

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
            await call("Page.enable")
            await call("Page.addScriptToEvaluateOnNewDocument", source=SEED)
            await call("Page.navigate", url=url)
            t0 = time.time()
            while not await js("!!window.__sv && !document.getElementById('boot')"):
                if time.time() - t0 > 90:
                    raise TimeoutError("app never became ready (__sv + boot screen gone)")
                await asyncio.sleep(0.5)
            if await js("new Date().getUTCFullYear()") != 2026 or abs(await js("Date.now()") - T0_MS) > 600_000:
                raise RuntimeError("the fixed clock did not take")
            # quality 'auto' picks by frame rate, so two runs on a busy machine can differ (Light vs Medium: other
            # settings texts, other effects); pinned to low for both
            await js("__sv.store.getState().updateSettings({ quality: 'low' }); 'ok'")
            await asyncio.sleep(2)
            log(f"app ready in {time.time() - t0:.1f}s; quality pinned to low")
            for k, sc in enumerate(scenarios):
                await js(f"window.__vtReseed({20261104 + k}); 'ok'")  # frame-driven code draws a different count per run
                if sc.get("js"):
                    await js(f"(async () => {{ {sc['js']} }})()")
                if sc.get("wait"):
                    t1 = time.time()
                    while not await js(sc["wait"]):
                        if time.time() - t1 > sc.get("timeout", 60):
                            raise TimeoutError(f"{sc['name']}: wait timed out: {sc['wait']}")
                        await asyncio.sleep(0.5)
                await asyncio.sleep(sc.get("sleep", 1.5))
                report[sc["name"]] = await js(COLLECT)
                log(f"{sc['name']}: {len(report[sc['name']])} texts")
            rtask.cancel()
        with open(out_path, "w") as f:
            json.dump({"url": url, "report": report, "console": console}, f, ensure_ascii=False, indent=1)
        log(f"{sum(len(v) for v in report.values())} texts in {len(report)} scenarios; console errors/warnings: {len(console)}")
    finally:
        chrome.terminate()
        chrome.wait(timeout=10)
        # chromium's helper processes can still be writing the profile for a moment after the main one exits
        for i in range(20):
            try:
                shutil.rmtree(tmp)
                break
            except OSError:
                if i == 19:
                    raise
                time.sleep(0.5)


if __name__ == "__main__":
    out, sc_path, url = sys.argv[1], sys.argv[2], sys.argv[3]
    if "debug" not in url.partition("#")[2]:
        sys.exit(f"visible_text: url needs '#debug' (window.__sv exists only then): {url}")
    asyncio.run(main(out, json.load(open(sc_path)), url))
