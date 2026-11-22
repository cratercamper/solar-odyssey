"""dull.mjs が撮った 1 秒ごとの絵と記録から、「画面が変わらない時間」を数える（確認用）。

  python3 tools/film/dull.py /tmp/dull [--limit 8]

1 秒ごとに、次のどれかがあれば「変化あり」：
  ・絵が大きく変わった（前の秒との差、または同じ絵が続き始めた秒との差が大きい：カットやゆっくりした大きな動き）
  ・字幕・カメラ・場面・段・画面の部品（data-dull）が変わった
変化のない秒が limit 秒（ふつう 8 秒）以上続いた所を、長い順に出す。Pillow が要る。
"""
import json
import sys
from PIL import Image, ImageChops, ImageStat

STEP = 6.0   # 前の秒との差（0〜255 の平均）。これより大きいと「変わった」
DRIFT = 14.0  # 同じ絵が続き始めた秒との差


def gray(path):
    return Image.open(path).convert('L').resize((96, 54))


def diff(a, b):
    return ImageStat.Stat(ImageChops.difference(a, b)).mean[0]


def main(argv):
    out = argv[0]
    limit = 8
    if '--limit' in argv:
        limit = int(argv[argv.index('--limit') + 1])
    log = json.load(open(f'{out}/log.json'))
    keys = ('phase', 'cam', 'caption', 'stage', 'panels')
    runs = []
    start = None
    base = prev = None
    last = None
    for e in log:
        im = gray(f"{out}/{e['sec']:04d}.jpg")
        changed = prev is None or diff(im, prev) > STEP or diff(im, base) > DRIFT
        if last is not None and any(e[k] != last[k] for k in keys):
            changed = True
        if changed:
            if start is not None and e['sec'] - start >= limit:
                runs.append((e['sec'] - start, start, last))
            start = e['sec']
            base = im
        prev = im
        last = e
    if start is not None and log[-1]['sec'] + 1 - start >= limit:
        runs.append((log[-1]['sec'] + 1 - start, start, last))
    total = len(log)
    dull = sum(r[0] for r in runs)
    print(f'screen seconds: {total}, dull stretches (>= {limit} s): {len(runs)}, dull total: {dull} s')
    for length, s, e in sorted(runs, reverse=True):
        print(f'  {length:4d} s from screen {s:4d} s  (phase {e["phase"]}, stage {e["stage"]}, sim t {e["t"]}, warp x{e["warp"]}, cam {e["cam"]})')


if __name__ == '__main__':
    main(sys.argv[1:])
