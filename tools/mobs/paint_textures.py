# "Painted" textures for the park people (trial, app: ?mobstyle=paint).
# Why: the semi-real shading on top of photo textures mixes two levels of realism in one face,
# which reads as a mask (Chattopadhyay & MacDorman 2016). Here the textures are pushed toward paint
# so the whole person sits at one level: flat skin with soft shape, no photo pores/wrinkles,
# clothes without baked creases and with fewer colours, and simple clear eyes.
#
# Usage: python3 -I tools/mobs/paint_textures.py public/walk/mobs public/walk/mobs/paint
# Writes <material name>.jpg (or .png for eyes) for the skin, cloth and eyes of every mpfb_*.vrm.
# Needs: numpy, pillow, opencv-python-headless.
import glob
import io
import os
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shrink_vrm_textures import read_glb  # noqa: E402


def smooth(rgb, passes=4, d=9, sc=28, ss=9):
    """Edge-keeping smoothing (keeps lips, eye lines, seams; removes pores, fabric grain)."""
    out = rgb
    for _ in range(passes):
        out = cv2.bilateralFilter(out, d, sc, ss)
    return out


def paint_skin(img):
    rgb = np.array(img.convert('RGB'))
    bg = rgb[2, 2].astype(np.float32)  # MakeHuman fills the empty atlas with the base tone
    s = smooth(rgb, passes=5, d=11, sc=24, ss=11).astype(np.float32)
    # pull every pixel toward the person's base tone; keep the low-frequency shape and strong features
    base = np.median(s.reshape(-1, 3), axis=0)
    low = cv2.GaussianBlur(s, (0, 0), 18)
    feat = s - low  # what still differs locally after smoothing: lips, eyelid lines, nostrils
    lum = feat.mean(axis=2, keepdims=True)
    keep = np.clip(np.abs(lum) / 10.0, 0, 1)  # strong local features stay, weak mottling goes
    flat = base + 0.5 * (low - base)
    out = flat + feat * (0.35 + 0.9 * keep)
    # lips and other red parts keep their own colour
    red = np.clip(((s[..., 0] - s[..., 1]) - (base[0] - base[1]) - 6) / 14.0, 0, 1)[..., None]
    out = out * (1 - red) + (s * 1.02) * red
    # a touch of warmth (blood under the skin) and less grey
    out = out * np.array([1.03, 1.0, 0.97], np.float32)
    m = out.mean(axis=2, keepdims=True)
    out = m + (out - m) * 1.08
    out[np.all(np.abs(rgb.astype(np.float32) - bg) < 3, axis=2)] = bg
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def paint_cloth(img):
    rgb = np.array(img.convert('RGB'))
    s = smooth(rgb, passes=6, d=9, sc=26, ss=9).astype(np.float32)
    # keep the big folds and seams (low frequency + strong edges), drop the fabric grain and fine creases
    low = cv2.GaussianBlur(s, (0, 0), 6)
    out = low + 0.55 * (s - low)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


# MakeHuman low-poly eyes share one UV layout: two eyeballs, iris centres and radius in 0..1 of the image
EYE_IRIS = [((0.704, 0.293), 0.105), ((0.288, 0.705), 0.105)]
EYE_BALL_R = 0.27


def paint_eyes(img):
    """Redraw each eyeball: flat white, one-colour iris with a darker rim, round pupil, no veins."""
    a = np.array(img.convert('RGBA')).astype(np.float32)
    rgb = a[..., :3]
    h, w = rgb.shape[:2]
    out = rgb.copy()
    sclera = np.array([236, 232, 226], np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    for (u, v), rr in EYE_IRIS:
        cx, cy, r = u * w, v * h, rr * w
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        col = np.median(rgb[(d > r * 0.45) & (d < r * 0.9)], axis=0) * 1.1
        out[(d < EYE_BALL_R * w) & (a[..., 3] > 0)] = sclera
        t = np.clip(d / r, 0, 1)[..., None]
        iris = col * (1 - 0.45 * np.clip((t - 0.78) / 0.22, 0, 1)) * (1 + 0.15 * (1 - t))
        disk = d < r
        out[disk] = iris[disk]
        out[d < r * 0.38] = np.array([16, 12, 12], np.float32)
        edge = (d >= r) & (d < r + 1.5)
        out[edge] = (out[edge] + sclera) / 2
    a[..., :3] = out
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def textures(vrm):
    j, b = read_glb(vrm)
    datas = [b[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in j['bufferViews']]
    for m in j['materials']:
        t = m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if t is None:
            continue
        im = j['images'][j['textures'][t['index']]['source']]
        yield m['name'], Image.open(io.BytesIO(datas[im['bufferView']]))


def main(src, dst):
    os.makedirs(dst, exist_ok=True)
    for vrm in sorted(glob.glob(os.path.join(src, 'mpfb_*.vrm'))):
        for name, img in textures(vrm):
            if name.endswith('.skin'):
                out, ext = paint_skin(img), 'jpg'
            elif '.cloth.' in name and '.shoes' not in name:
                out, ext = paint_cloth(img), 'jpg'
            elif name.endswith('.eyes'):
                out, ext = paint_eyes(img), 'png'
            else:
                continue
            p = os.path.join(dst, f'{name}.{ext}')
            if ext == 'jpg':
                out.convert('RGB').save(p, 'JPEG', quality=84, optimize=True)
            else:
                out.save(p, 'PNG', optimize=True)
            print(p, os.path.getsize(p))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
