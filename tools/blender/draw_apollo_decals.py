"""アポロの宇宙服に貼る印（NASA の丸い印・アポロ 17 号のパッチ・アメリカの国旗）を 1 枚の絵に描きなおす。

本物の写真や画像は使わず、形を見て描きなおしたもの。アポロの場面の宇宙服にだけ使う（アプリのアイコンや宣伝には使わない）。
並び（1024×1024）：左上 = NASA、右上 = アポロ 17 号のパッチ、下半分 = 国旗。
  python3 tools/blender/draw_apollo_decals.py   →  tools/blender/apollo_decals.png
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'apollo_decals.png')
FONT = '/usr/share/fonts/opentype/inter/Inter-Bold.otf'
S = 4  # 大きく描いてから縮める（ふちをなめらかに）

random.seed(17)


def font(px):
    return ImageFont.truetype(FONT, px * S)


def text_center(d, xy, s, f, fill):
    x, y = xy
    b = d.textbbox((0, 0), s, font=f)
    d.text((x - (b[2] - b[0]) / 2 - b[0], y - (b[3] - b[1]) / 2 - b[1]), s, font=f, fill=fill)


def text_arc(img, cx, cy, r, s, f, fill, top=True):
    """円にそって文字を並べる（top：上の弧で外向き、下の弧は内向きに読める向き）"""
    d0 = ImageDraw.Draw(img)
    widths = [d0.textbbox((0, 0), ch, font=f)[2] for ch in s]
    total = sum(widths) * 1.08
    ang = total / r
    a = -math.pi / 2 - ang / 2 if top else math.pi / 2 + ang / 2
    for ch, w in zip(s, widths):
        step = w * 1.08 / r
        mid = a + (step / 2 if top else -step / 2)
        x, y = cx + math.cos(mid) * r, cy + math.sin(mid) * r
        tile = Image.new('RGBA', (w * 2 + 8, w * 2 + 8 + f.size), (0, 0, 0, 0))
        td = ImageDraw.Draw(tile)
        text_center(td, (tile.width / 2, tile.height / 2), ch, f, fill)
        rot = -math.degrees(mid + math.pi / 2) if top else -math.degrees(mid - math.pi / 2)
        tile = tile.rotate(rot, resample=Image.BICUBIC, expand=True)
        img.alpha_composite(tile, (int(x - tile.width / 2), int(y - tile.height / 2)))
        a += step if top else -step


def nasa(size):
    n = size * S
    img = Image.new('RGBA', (n, n), (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    c, r = n / 2, n * 0.49
    d.ellipse((c - r, c - r, c + r, c + r), fill=(11, 61, 145, 255))
    # 星
    for _ in range(60):
        a, rr = random.random() * 2 * math.pi, r * math.sqrt(random.random()) * 0.92
        x, y, s = c + math.cos(a) * rr, c + math.sin(a) * rr, random.choice((1.5, 2, 3)) * S
        d.ellipse((x - s, y - s, x + s, y + s), fill=(255, 255, 255, 255))
    # 赤い矢（ベクトル）：左下から右上へ、横の V 字の形
    w = r * 0.16
    pts = [(c - r * 0.95, c + r * 0.42), (c + r * 0.08, c - r * 0.06), (c - r * 0.06, c - r * 0.28),
           (c + r * 0.98, c - r * 0.5), (c + r * 0.2, c + r * 0.08), (c + r * 0.32, c + r * 0.26)]
    d.polygon([(x, y) for x, y in pts], fill=(252, 61, 33, 255))
    # 白い軌道（だ円）
    orbit = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    od = ImageDraw.Draw(orbit)
    od.ellipse((c - r * 0.85, c - r * 0.32, c + r * 0.85, c + r * 0.32), outline=(255, 255, 255, 255), width=int(w * 0.28))
    orbit = orbit.rotate(28, resample=Image.BICUBIC)
    img.alpha_composite(orbit)
    text_center(d, (c, c + r * 0.02), 'NASA', font(int(size * 0.27)), (255, 255, 255, 255))
    return img.resize((size, size), Image.LANCZOS)


def patch17(size):
    n = size * S
    img = Image.new('RGBA', (n, n), (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    c, r = n / 2, n * 0.49
    gold, navy, band = (214, 170, 60, 255), (10, 18, 46, 255), (24, 40, 92, 255)
    d.ellipse((c - r, c - r, c + r, c + r), fill=gold)
    r1 = r * 0.95
    d.ellipse((c - r1, c - r1, c + r1, c + r1), fill=band)
    r2 = r * 0.74
    d.ellipse((c - r2 - S * 4, c - r2 - S * 4, c + r2 + S * 4, c + r2 + S * 4), fill=gold)
    # 中：夜空
    inner = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    idr = ImageDraw.Draw(inner)
    idr.rectangle((0, 0, n, n), fill=navy)
    for _ in range(40):
        x, y, s = random.random() * n, random.random() * n, random.choice((1.2, 2, 2.6)) * S
        idr.ellipse((x - s, y - s, x + s, y + s), fill=(240, 240, 255, 255))
    # 赤・白・青の帯（わしの羽のように、左から右上へ流れる）
    for k, col in enumerate(((190, 30, 40, 255), (240, 240, 240, 255), (190, 30, 40, 255), (240, 240, 240, 255), (40, 70, 160, 255))):
        o = k * r2 * 0.09
        idr.polygon([(c - r2, c + r2 * 0.2 + o), (c + r2 * 0.1, c - r2 * 0.25 + o), (c + r2, c - r2 * 0.55 + o),
                     (c + r2, c - r2 * 0.47 + o), (c + r2 * 0.1, c - r2 * 0.17 + o), (c - r2, c + r2 * 0.28 + o)], fill=col)
    # 土星（右上）と、月（右下）
    sx, sy, sr = c + r2 * 0.45, c - r2 * 0.6, r2 * 0.1
    idr.ellipse((sx - sr, sy - sr, sx + sr, sy + sr), fill=(225, 190, 120, 255))
    idr.ellipse((sx - sr * 2, sy - sr * 0.45, sx + sr * 2, sy + sr * 0.45), outline=(225, 190, 120, 255), width=S * 4)
    mx, my, mr = c + r2 * 0.4, c + r2 * 0.55, r2 * 0.42
    idr.ellipse((mx - mr, my - mr, mx + mr, my + mr), fill=(150, 150, 150, 255))
    for _ in range(9):
        a, rr = random.random() * 2 * math.pi, mr * 0.7 * random.random()
        x, y, s = mx + math.cos(a) * rr, my + math.sin(a) * rr, mr * random.uniform(0.06, 0.15)
        idr.ellipse((x - s, y - s, x + s, y + s), fill=(118, 118, 118, 255))
    # アポロの横顔（金色、左を向く）：ひたい・鼻・くちびる・あご・首
    fx, fy, k = c - r2 * 0.32, c - r2 * 0.1, r2 * 0.5
    face = [(0.35, -0.95), (-0.05, -0.85), (-0.3, -0.6), (-0.38, -0.3), (-0.55, -0.05), (-0.36, 0.02), (-0.4, 0.15),
            (-0.32, 0.22), (-0.36, 0.32), (-0.2, 0.5), (0.05, 0.55), (0.12, 0.95), (0.6, 0.95), (0.55, 0.4), (0.75, 0.0), (0.7, -0.6)]
    idr.polygon([(fx + x * k, fy + y * k) for x, y in face], fill=gold)
    # 髪（光の筋）
    for j in range(7):
        a = -math.pi * 0.9 + j * 0.2
        idr.line((fx + 0.3 * k, fy - 0.4 * k, fx + 0.3 * k + math.cos(a) * k * 0.95, fy - 0.4 * k + math.sin(a) * k * 0.95), fill=gold, width=S * 6)
    mask = Image.new('L', (n, n), 0)
    ImageDraw.Draw(mask).ellipse((c - r2, c - r2, c + r2, c + r2), fill=255)
    img.paste(inner, (0, 0), mask)
    f = font(int(size * 0.085))
    text_arc(img, c, c, r * 0.845, 'APOLLO XVII', f, gold, top=True)
    text_arc(img, c, c, r * 0.845, 'CERNAN · EVANS · SCHMITT', font(int(size * 0.062)), gold, top=False)
    return img.resize((size, size), Image.LANCZOS)


def flag(w, h):
    W, H = w * S, h * S
    img = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    red, blue = (178, 34, 52, 255), (60, 59, 110, 255)
    sh = H / 13
    for k in range(13):
        if k % 2 == 0:
            d.rectangle((0, k * sh, W, (k + 1) * sh), fill=red)
    cw, ch = W * 0.4, sh * 7
    d.rectangle((0, 0, cw, ch), fill=blue)
    for row in range(9):
        cols = 6 if row % 2 == 0 else 5
        for col in range(cols):
            x = cw / 12 * (col * 2 + (1 if row % 2 == 0 else 2))
            y = ch / 10 * (row + 1)
            rr = ch * 0.045
            pts = []
            for i in range(10):
                a = -math.pi / 2 + i * math.pi / 5
                q = rr if i % 2 == 0 else rr * 0.4
                pts.append((x + math.cos(a) * q, y + math.sin(a) * q))
            d.polygon(pts, fill=(255, 255, 255, 255))
    return img.resize((w, h), Image.LANCZOS)


def main():
    atlas = Image.new('RGB', (1024, 1024), (255, 255, 255))
    atlas.paste(nasa(512).convert('RGB'), (0, 0))
    atlas.paste(patch17(512).convert('RGB'), (512, 0))
    atlas.paste(flag(1024, 512).convert('RGB'), (0, 512))
    atlas.save(OUT, optimize=True)
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')


main()
