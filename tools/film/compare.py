"""手本の写真と、アプリの画像を左右に並べた「くらべ画像」を作る（確認用）。

  python3 tools/film/compare.py OUT.jpg PHOTO.jpg SHOT.jpg [SHOT2.jpg ...] [--label "左" "右" ...]

どれも同じ高さ（540 px）にそろえ、下に名前を入れる。Pillow が要る（pip install pillow）。
"""
import sys
from PIL import Image, ImageDraw

H = 540


def main(argv):
    labels = []
    if '--label' in argv:
        i = argv.index('--label')
        labels = argv[i + 1:]
        argv = argv[:i]
    out, *paths = argv
    ims = []
    for p in paths:
        im = Image.open(p).convert('RGB')
        ims.append(im.resize((round(im.width * H / im.height), H)))
    pad = 34
    W = sum(im.width for im in ims) + 8 * (len(ims) - 1)
    sheet = Image.new('RGB', (W, H + pad), (16, 16, 18))
    d = ImageDraw.Draw(sheet)
    x = 0
    for k, im in enumerate(ims):
        sheet.paste(im, (x, 0))
        name = labels[k] if k < len(labels) else paths[k].rsplit('/', 1)[-1]
        d.text((x + 8, H + 10), name, fill=(220, 220, 220))
        x += im.width + 8
    sheet.save(out, quality=88)
    print(out, sheet.size)


if __name__ == '__main__':
    main(sys.argv[1:])
