# 葉の房の絵 4 枚（1024 px、透明つき）を重ねて、2×2 の 1 枚（1024 px）にまとめる（tools/forest/canopy.mjs から呼ぶ）。
#   python3 -I canopy.py <4 枚のある場所> <出す場所>
# 透明な所の色は、ふちの葉の色で埋める（縮めたときに黒いふちが出ないように）。半分の大きさ（.half）も出す。
import os
import sys

import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]


def bleed(rgb, mask, rounds=48):
    rgb = rgb.astype(np.float32)
    known = mask.copy()
    for _ in range(rounds):
        if known.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            k = np.roll(known, (dy, dx), (0, 1))
            acc += np.roll(rgb, (dy, dx), (0, 1)) * k[..., None]
            cnt += k
        fill = (~known) & (cnt > 0)
        rgb[fill] = acc[fill] / cnt[fill][..., None]
        known |= fill
    rgb[~known] = rgb[mask].mean(0)
    return rgb.clip(0, 255).astype(np.uint8)


CELL = 512
PAD = 8


def shot(i):
    """撮った房 1 枚を、葉のある所だけに切りつめる"""
    im = Image.open(os.path.join(src, f'{i}.png')).convert('RGBA')
    return im.crop(im.getbbox())


def layer(i, rot=0.0, shade=1.0, scale=1.0, mirror=False, dy=0.0):
    """房 1 枚を、回して・暗くして・ます目いっぱいの大きさにする（奥の層ほど暗く）"""
    im = shot(i)
    if mirror:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if rot:
        im = im.rotate(rot, Image.BICUBIC, expand=True)
        im = im.crop(im.getbbox())
    s = (CELL - PAD * 2) * scale / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    if shade != 1.0:
        px = np.asarray(im).astype(np.float32)
        px[..., :3] *= shade
        im = Image.fromarray(px.clip(0, 255).astype(np.uint8))
    cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    cell.alpha_composite(im, ((CELL - im.width) // 2, round((CELL - im.height) / 2 + dy * CELL)))
    return cell


def stack(*layers):
    cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    for l in layers:
        cell.alpha_composite(l)
    return cell


# 1 枚の房だけでは、すき間が多すぎて、遠くから見ると消えてしまう。本物の樹冠のように、奥の房（暗い）の上に
# 手前の房（明るい）を重ねて、こんもりさせる。左上・右上・左下・右下の順：
cells = [
    # こんもり茂った房（上から）
    stack(layer(1, 140, 0.55), layer(3, 250, 0.74, 0.96), layer(0)),
    # 枝の見える房（上から）
    stack(layer(0, 200, 0.58, 0.94), layer(1)),
    # 横から見た房（上が枝の側）
    stack(layer(2, 0, 0.6, 0.96, True, 0.04), layer(2, 0, 1.0, 0.92, False, -0.03)),
    # 枝先（上から）
    stack(layer(1, 95, 0.6, 0.86), layer(3)),
]
atlas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
for i, cell in enumerate(cells):
    atlas.paste(cell, ((i % 2) * CELL, (i // 2) * CELL))
a = np.asarray(atlas)
rgb = bleed(a[..., :3], a[..., 3] > 40)
atlas = Image.fromarray(np.dstack([rgb, a[..., 3]]))
for s, tag in ((1024, ''), (512, '.half')):
    path = os.path.join(out, f'canopy{tag}.webp')
    (atlas if s == 1024 else atlas.resize((s, s), Image.LANCZOS)).save(path, 'WEBP', quality=84, method=6, alpha_quality=92)
    print(f'{os.path.basename(path):28s} {s:5d} px {os.path.getsize(path) / 1024:7.0f} KB')
