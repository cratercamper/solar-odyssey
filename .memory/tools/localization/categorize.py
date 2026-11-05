#!/usr/bin/env python3
"""categorize.py <ja-scan.tsv> — sort every scanner line into a reason it is not player-visible Japanese-in-English.
Any line that matches no rule is printed as UNEXPLAINED (exit 1)."""
import re, sys
from collections import Counter

RULES = [
    # (category, predicate on (kind, file, line, ctx, text))
    ("GLSL shader source (Japanese only in // comments)", lambda k, f, l, c, t: (
        re.search(r"VariableDeclarator in \w*(Shader|shader|Fragment|fragment|Vertex|vertex|GLSL|Glsl|glsl|FRAG\w*|VERT|GRIME_APPLY|apPars|surface|air|lutFragment)\b", c) and re.search(r"uniform|attribute|varying|vec[234]|float |#include|void main", t))
        or (re.search(r"CallExpression in (asteroidMaterial|groundMaterial|withRockDetail|withPaint|buildingMaterial|shadowClouds)", c) and "#include" in t)
        or (re.search(r"\.(vertexShader|fragmentShader) in", c))
        or (re.search(r"ConditionalExpression in withAir", c) and "//" in t)),
    ("developer page (TerrainLab / SurfaceLab / Hangar)", lambda k, f, l, c, t: re.match(r"(components/terrainLab/|components/surface/SurfaceLab\.tsx|Hangar\.tsx)", f)),
    ("language picker / language switch (bilingual on purpose)", lambda k, f, l, c, t: f.startswith("ui/LanguagePicker.tsx") or (f.startswith("ui/NavPanel.tsx") and "日本語" in t)),
    ("boot screen (shown before a language is chosen, bilingual on purpose)", lambda k, f, l, c, t: f.startswith("ui/Boot.tsx") and " / " in t),
    ("FACTS family: English in parallel *_EN tables / factsEn()", lambda k, f, l, c, t: re.match(r"data/(facts|sfSpace|sfJapan|sfHourglass|sfEngine|sfSides)\.ts$", f)),
    ("[ja, en] pair tuples (English is the 2nd element)", lambda k, f, l, c, t: re.match(r"(data/(rockSamples|surfaces|rockCollection)\.ts|state/(evaJobs|eva|rally)\.ts|components/eva/hull\.ts|components/surface/TimeBar\.tsx|components/Phaser\.tsx)$", f) and not (f == "data/rockSamples.ts" and ".comp in" in c)),
    ("rock composition labels: bilingual 'ja En' strings split by compLabel()", lambda k, f, l, c, t: f == "data/rockSamples.ts" and ".comp in" in c),
    ("en: {...} sibling object (DEEP_SPACE via deepSpaceText(), quiz MAKERS via quizText())", lambda k, f, l, c, t: f == "data/deepSpace.ts" or (f == "state/quiz.ts" and "in MAKERS" in c)),
    ("positional name/nameEn, how/howEn args (rank()/set()) in stamps TITLES", lambda k, f, l, c, t: f == "data/stamps.ts" and "TITLES" in c),
    ("Japanese branch of a getLang()/lang ternary (English branch beside it)", lambda k, f, l, c, t: (f, c.split(" in ")[-1]) in {
        ("state/quiz.ts", "duration"), ("state/quiz.ts", "lightTime"), ("state/quiz.ts", "quizTitle"),
        ("ui/Hud.tsx", "roughly"), ("data/ephemeris.ts", "formatDate"), ("ui/MissionPanel.tsx", "ChapterList"), ("ui/MissionPanel.tsx", "ShipSkill")} and "ConditionalExpression" in c or (f == "ui/Hud.tsx" and "ReturnStatement in roughly" in c)),
    ("thrown Error for a missing model part (developer message, not UI)", lambda k, f, l, c, t: f == "components/eva/Tsumugi.tsx" and "NewExpression" in c),
    ("full-width ＋ on zoom/thrust buttons (symbol, not text)", lambda k, f, l, c, t: t == "＋"),
]

counts, unexplained = Counter(), []
for line in open(sys.argv[1], encoding="utf8"):
    line = line.rstrip("\n")
    if not line:
        continue
    kind, loc, ctx, text = line.split("\t", 3)
    f, l = loc.rsplit(":", 1)
    for cat, pred in RULES:
        if pred(kind, f, l, ctx, text):
            counts[cat] += 1
            break
    else:
        unexplained.append(line)
for cat, _ in RULES:
    print(f"{counts[cat]:5d}  {cat}")
print(f"{sum(counts.values()) + len(unexplained):5d}  total")
for u in unexplained:
    print("UNEXPLAINED\t" + u)
sys.exit(1 if unexplained else 0)
