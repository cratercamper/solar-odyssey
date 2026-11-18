# Finish the people made by mpfb_gen.py: shrink textures, recolour hair and eyebrows to the
# person's hair colour (texture brightness x colour), soften the skin tone for the park light.
# Usage: python3 -I tools/mobs/finish_mpfb.py <folder with manifest.json + mpfb_*.vrm> <out folder> [style.json] [manifest out]
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shrink_vrm_textures import repack  # noqa: E402
from cloth_recolor import recolor_cloth  # noqa: E402
import random  # noqa: E402


def recolor_for(p, style):
    hair = np.array(p['hairRgb'], dtype=np.float32)
    sk = style.get('skinTweak', {})

    def fn(name, img):
        if name.endswith(('.hair', '.brows')):
            a = np.asarray(img.convert('RGBA'), dtype=np.float32) / 255
            lum = a[..., :3] @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
            mask = a[..., 3] > 0.5
            mean = float(lum[mask].mean()) if mask.any() else 0.5
            # keep the strand shading, move the average to the hair colour
            rgb = np.clip((lum / max(mean, 1e-3))[..., None] * hair[None, None, :], 0, 1)
            a[..., :3] = rgb
            return Image.fromarray((a * 255 + 0.5).astype(np.uint8), 'RGBA')
        if '.cloth.' in name and p.get('shirtRgb'):
            return recolor_cloth(name.split('.cloth.')[1], img, p['shirtRgb'])
        if name.endswith('.skin'):
            a = np.asarray(img.convert('RGB'), dtype=np.float32) / 255
            g = a.mean(axis=2, keepdims=True)
            a = g + (a - g) * sk.get('saturation', 1.0)
            a = np.clip(a * sk.get('brightness', 1.0), 0, 1)
            return Image.fromarray((a * 255 + 0.5).astype(np.uint8), 'RGB')
        return img

    return fn


def main():
    src, out = sys.argv[1], sys.argv[2]
    style = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {}
    man = json.load(open(os.path.join(src, 'manifest.json')))
    os.makedirs(out, exist_ok=True)
    # shirt colours from the colony palette, as few repeats as possible
    cols = style.get('shirtColors', {})
    rng = random.Random(style.get('seed', 0))
    left = []
    for pid, p in sorted(man.items()):
        if cols:
            if not left:
                left = sorted(cols)
            k = rng.choice(left)
            left.remove(k)
            p['shirtColor'] = k
            p['shirtRgb'] = cols[k]
    if len(sys.argv) > 4:
        json.dump(man, open(sys.argv[4], 'w'), indent=1)
    for pid, p in sorted(man.items()):
        f = p['file'] + '.vrm'
        n = repack(os.path.join(src, f), os.path.join(out, f), style.get('budget', {}).get('texMax', 1024), recolor_for(p, style), log=lambda s: None)
        print(f, p['sex'], p['race'], p['hair'], p['hairColor'], p.get('shirtColor'), p['clothes'][0], 'tris', p['tris'], 'h', p['heightM'], f'{n / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
