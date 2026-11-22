# 森の部品の画像を作る（tools/forest/bake.mjs から呼ぶ）。
#   python3 -I images.py <元の素材の場所> <出す場所> <一覧の JSON>
# 切り抜きのある葉は、色と切り抜きを 1 枚（透明つきの WebP）にまとめる。切り抜きの外の色は、ふちの色で埋める
# （縮めたときに黒いふちが出ないように）。大きい方と、その半分（スマホ用、名前に .half）を出す。
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

raw, out, spec = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
os.makedirs(out, exist_ok=True)


def bleed(rgb, mask, rounds=24):
    """切り抜きの外を、近くの中の色で埋める"""
    rgb = rgb.astype(np.float32)
    known = mask.copy()
    for _ in range(rounds):
        if known.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            k = np.roll(known, (dy, dx), (0, 1))
            acc += np.roll(rgb, (dy, dx), (0, 1)) * k[..., None]
            cnt += k
        fill = (~known) & (cnt > 0)
        rgb[fill] = acc[fill] / cnt[fill][..., None]
        known |= fill
    if not known.all():
        mean = rgb[mask].mean(0) if mask.any() else np.array([60, 80, 40], np.float32)
        rgb[~known] = mean
    return rgb.clip(0, 255).astype(np.uint8)


def load(item, size=None):
    """色（と切り抜き）を 1 枚に。切り抜きの外の色は、ふちの色で埋める"""
    src = Image.open(os.path.join(raw, item['src'])).convert('RGB')
    if size:
        src = src.resize((size, size), Image.LANCZOS)
    if item.get('alpha'):
        a = Image.open(os.path.join(raw, item['alpha'])).convert('L').resize(src.size, Image.LANCZOS)
        mask = np.asarray(a) > 96
        rgb = Image.fromarray(bleed(np.asarray(src), mask))
        src = Image.merge('RGBA', (*rgb.split(), a))
    return src


def atlas(im):
    """何枚かを、ます目に並べて 1 枚にする。ふちは INSET px ぶん、絵を縮めてあける（tools/forest/bake.mjs の toAtlas と同じ）"""
    A = im['atlas']
    cell = A['cell']
    inset = 4
    alpha = any(i.get('alpha') for i in im['items'])
    out_img = Image.new('RGBA' if alpha else 'RGB', (A['cols'] * cell, A['rows'] * cell), (0, 0, 0, 0) if alpha else (128, 128, 255))
    for k, item in enumerate(im['items']):
        tile = load(item, cell - inset * 2)
        if alpha and tile.mode != 'RGBA':
            tile = tile.convert('RGBA')
        # ふちのあきは、絵のふちの色をのばして埋める（縮めたときに、となりのますの色がまざらないように）
        pad = Image.fromarray(np.pad(np.asarray(tile), ((inset, inset), (inset, inset), (0, 0)), mode='edge'))
        if alpha:
            px = np.asarray(pad).copy()
            px[:inset, :, 3] = 0
            px[-inset:, :, 3] = 0
            px[:, :inset, 3] = 0
            px[:, -inset:, 3] = 0
            pad = Image.fromarray(px)
        out_img.paste(pad, ((k % A['cols']) * cell, (k // A['cols']) * cell))
    return out_img


for im in spec:
    if im.get('atlas'):
        src = atlas(im)
    else:
        src = load(im)
    W, H = src.size
    if im.get('size') and (W, H) != (im['size'], im['size']):
        src = src.resize((im['size'], im['size']), Image.LANCZOS)
        W, H = src.size
    sizes = [(1, '')] + ([(2, '.half')] if im.get('half', True) else [])
    for d, tag in sizes:
        s = W // d
        img = src.resize((W // d, H // d), Image.LANCZOS) if d > 1 else src
        path = os.path.join(out, f"{im['out']}{tag}.webp")
        # 凹凸の画像は色がにじむと向きが狂うので、質を高めに
        img.save(path, 'WEBP', quality=90 if im.get('data') else 84, method=6, alpha_quality=92)
        print(f"{os.path.basename(path):28s} {s:5d} px {os.path.getsize(path) / 1024:7.0f} KB")
