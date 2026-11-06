#!/usr/bin/env python3
"""make_route.py — builds the route of a race test from its parts, for the scripted browser.

    python3 make_route.py <track.json> <record.json | none> <route.json>

The route lands on Mars through the menus, adds the track (and the record, unless "none") to the running game with
setup.js, fixes the page's time step with clock.js, starts the race with the real Start button, drives it with
pilot.js, and judges it with check.js. The page code is read from the folder this file is in. The route is one
self-contained file: the track, the record and the page code are written into it, so running it needs only the
scripted browser and the game's dev server. Run this again after any part changes. Each page-code file must be one
JavaScript expression, with no `;` at its end: a file that gets constants (all but pilot.js) has them put in front and
is wrapped in `return ( … )` inside a function; pilot.js goes in as it is.

track.json: {"id": <site and track name>, "site": <SITES entry>, "track": <TRACKS entry>,
             "check": {"time": [lo, hi], "step": <seconds per frame, clock.js>}}
record.json: one entry in the game's RallyRecord form (src/data/rallyRecords.ts), with "track" = the id above.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def page_code(name, **consts):
    """A page-code file with its constants put in front, as one expression the scripted browser can evaluate."""
    with open(os.path.join(HERE, name)) as f:
        code = f.read().strip()
    head = "".join(f"const {k} = {json.dumps(v, ensure_ascii=False)};\n" for k, v in consts.items())
    # "return (" on one line: the file starts with comment lines, and a bare return before a line break returns nothing
    return "(() => {\n" + head + "return (\n" + code + "\n)\n})()" if head else code


def main():
    if len(sys.argv) != 4:
        sys.exit("usage: make_route.py <track.json> <record.json | none> <route.json>")
    with open(sys.argv[1]) as f:
        track = json.load(f)
    for key in ("id", "site", "track", "check"):
        if key not in track:
            sys.exit(f"{sys.argv[1]}: no {key!r}")
        if key != "id" and not isinstance(track[key], dict):
            sys.exit(f"{sys.argv[1]}: {key!r} must be an object, not {track[key]!r}")
    # the route flies to Mars and lands there: a track on another body would never get its race
    for part in ("site", "track"):
        if track[part].get("body") != "mars":
            sys.exit(f"{sys.argv[1]}: {part}.body must be \"mars\" (the route lands on Mars), not {track[part].get('body')!r}")
    record = None
    if sys.argv[2] != "none":
        with open(sys.argv[2]) as f:
            record = json.load(f)
        if record.get("track") != track["id"]:
            sys.exit(f"{sys.argv[2]}: the record is for track {record.get('track')!r}, not {track['id']!r}")
    band = track["check"].get("time")
    if not (isinstance(band, list) and len(band) == 2 and all(isinstance(t, (int, float)) and not isinstance(t, bool) for t in band)
            and 0 < band[0] < band[1]):
        sys.exit(f"{sys.argv[1]}: check.time must be [lo, hi] seconds with 0 < lo < hi, not {band!r}")
    step = track["check"].get("step")
    if not (isinstance(step, (int, float)) and 0 < step <= 0.05):
        sys.exit(f"{sys.argv[1]}: check.step must be seconds per frame in (0, 0.05], not {step!r}")
    site = f"__sv.landing.state.getState().site === {json.dumps(track['id'])}"
    steps = [
        # to Mars, through the menus (only the target is set through the store, as a click in the nav list would)
        {"wait": "!!window.__sv && [...document.querySelectorAll('button')].some(b => /^Warp/.test(b.textContent.trim()))",
         "timeout": 60},
        {"sleep": 3},
        {"eval": "__sv.store.getState().setTarget('mars'), __sv.store.getState().targetId"},
        {"eval": "[...document.querySelectorAll('button')].find(b => /^Warp/.test(b.textContent.trim())).click(), 'warp'"},
        {"wait": "__sv.store.getState().warpPhase !== 'idle'", "timeout": 60},
        {"wait": "__sv.store.getState().warpPhase === 'idle'", "timeout": 90},
        {"sleep": 2},
        {"eval": "document.querySelector('button.land-prompt').click(), 'land'"},
        {"wait": "__sv.landing.state.getState().phase === 'surface'", "timeout": 60},
        {"sleep": 4},
        # the track, the record, and on to the track's site
        {"eval": page_code("setup.js", TRACK=track, RECORD=record)},
        {"wait": f"{site} && __sv.landing.state.getState().phase === 'surface'", "timeout": 60},
        {"wait": "!!document.querySelector('button.rally-go')", "timeout": 30},
        {"sleep": 3},
        {"shot": "1-start"},
        {"eval": page_code("clock.js", STEP=step)},
        {"eval": "document.querySelector('button.rally-go').click(), 'start'"},
        {"wait": "['count', 'run'].includes(__sv.rally.state.getState().phase)", "timeout": 30},
        {"eval": page_code("pilot.js")},
        {"wait": "window.__pilot.done || !!window.__pilot.error", "timeout": 900},
        {"wait": "!!document.querySelector('.rally-result')", "timeout": 30},
        {"sleep": 2},
        {"shot": "2-result"},
        {"eval": page_code("check.js", CHECK=track["check"], RECORD=record), "save": "result.json"},
        {"eval": "if (window.__autoResult.verdict !== 'PASS') throw new Error(window.__autoResult.verdict); 'PASS'"},
    ]
    with open(sys.argv[3], "w") as f:
        json.dump(steps, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"{sys.argv[3]}: {len(steps)} steps, track {track['id']}, " + (f"record {record['name']}" if record else "no record"))


if __name__ == "__main__":
    main()
