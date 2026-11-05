#!/usr/bin/env python3
"""visible_text_compare.py <before.json> <after.json> — compare two visible_text.py runs, scenario by scenario.

Each scenario's texts are compared as a multiset, with every digit run masked to # (distances, clocks and speeds move
with run time; words do not). Prints each text only one side has; exit 0 = the same texts in every scenario, 1 = a
difference, 2 = the runs do not cover the same scenarios. Console errors of each run are printed too (not compared)."""
import json, re, sys
from collections import Counter

a, b = (json.load(open(p)) for p in sys.argv[1:3])
mask = lambda s: re.sub(r"\d+", "#", s)
if list(a["report"]) != list(b["report"]):
    print(f"scenarios differ: {list(a['report'])} vs {list(b['report'])}")
    sys.exit(2)
diffs = 0
for name in a["report"]:
    ca, cb = Counter(map(mask, a["report"][name])), Counter(map(mask, b["report"][name]))
    only_a, only_b = ca - cb, cb - ca
    for t, k in sorted(only_a.items()):
        print(f"{name}\tbefore only ×{k}\t{t[:200]}")
    for t, k in sorted(only_b.items()):
        print(f"{name}\tafter only ×{k}\t{t[:200]}")
    diffs += sum(only_a.values()) + sum(only_b.values())
for side, r in (("before", a), ("after", b)):
    for c in r["console"]:
        print(f"console {side}\t{c[:200]}")
n = sum(len(v) for v in a["report"].values())
print(f"{len(a['report'])} scenarios, {n} texts before, {sum(len(v) for v in b['report'].values())} after; {diffs} texts differ (digits masked)")
sys.exit(1 if diffs else 0)
