# Recolour MakeHuman clothes textures: blue tees get a new colour (logo removed, orange trim toned down),
# striped shirts get a new stripe colour, the white MakeHuman tee loses its print.
# Used by finish_mpfb.py; works on a PIL RGB image of the clothes texture.
from collections import deque

import numpy as np
from PIL import Image

TEES = ('female_casualsuit01', 'female_casualsuit02', 'female_sportsuit01', 'male_casualsuit02', 'male_casualsuit04')
# where the tee is in each texture (u0, v0, u1, v1 as fractions, v down), so jeans of the same blue stay jeans
TEE_AREAS = {
    'female_casualsuit01': [(0, 0, 1, 0.48), (0.7, 0.55, 1, 0.92)],
    'female_casualsuit02': [(0, 0, 1, 0.48), (0.7, 0.55, 1, 0.92)],
    'female_sportsuit01': [(0, 0, 1, 0.48), (0.7, 0.55, 1, 0.92)],
    'male_casualsuit02': [(0, 0, 1, 0.5), (0.72, 0, 1, 1)],
    'male_casualsuit04': [(0, 0, 1, 0.48)],
}


def area_mask(shape, rects):
    H, W = shape
    m = np.zeros((H, W), dtype=bool)
    for u0, v0, u1, v1 in rects:
        m[int(v0 * H):int(v1 * H), int(u0 * W):int(u1 * W)] = True
    return m
STRIPES = ('female_elegantsuit01', 'male_casualsuit03')
WHITE_TEE = ('male_casualsuit06',)


def hsv(a):
    mx = a.max(2)
    mn = a.min(2)
    d = mx - mn + 1e-6
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return h, d / (mx + 1e-6), mx


def lum(a):
    return a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)


def small_holes(mask, max_frac=0.015, n=256):
    """Parts not in mask that are enclosed and small (a printed logo inside the shirt)."""
    H, W = mask.shape
    m = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).resize((n, n), Image.NEAREST)) > 127
    seen = np.zeros_like(m)
    out = np.zeros_like(m)
    for y in range(n):
        for x in range(n):
            if m[y, x] or seen[y, x]:
                continue
            q = deque([(y, x)])
            seen[y, x] = True
            comp = []
            border = False
            while q:
                cy, cx = q.popleft()
                comp.append((cy, cx))
                if cy in (0, n - 1) or cx in (0, n - 1):
                    border = True
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = cy + dy, cx + dx
                    if 0 <= yy < n and 0 <= xx < n and not m[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True
                        q.append((yy, xx))
            if not border and len(comp) < max_frac * n * n:
                for cy, cx in comp:
                    out[cy, cx] = True
    big = Image.fromarray(out.astype(np.uint8) * 255).resize((W, H), Image.NEAREST)
    # grow a little so the logo's soft edge goes too
    from PIL import ImageFilter
    big = big.filter(ImageFilter.MaxFilter(5))
    return np.asarray(big) > 127


def recolor_cloth(cloth, img, color):
    c = np.array(color, dtype=np.float32)
    a = np.asarray(img.convert('RGB'), dtype=np.float32) / 255
    h, s, v = hsv(a)
    L = lum(a)
    if cloth in TEES:
        area = area_mask(s.shape, TEE_AREAS[cloth])
        shirt = area & (h > 195) & (h < 235) & (s > 0.55) & (v > 0.28) & (v < 0.85)
        orange = area & (h > 12) & (h < 48) & (s > 0.45)
        holes = area & small_holes(shirt) & ~shirt
        ref = float(np.median(L[shirt])) if shirt.any() else 0.4
        shade = np.clip(L / ref, 0.4, 1.6)[..., None]
        a = np.where(shirt[..., None], c * shade, a)
        a = np.where(holes[..., None], c[None, None, :], a)
        a = np.where((orange & ~holes)[..., None], c * 0.65 * shade, a)
    elif cloth in STRIPES:
        stripe = ((h > 320) | (h < 18)) & (s > 0.3) & (v > 0.2)
        ref = float(np.median(L[stripe])) if stripe.any() else 0.4
        shade = np.clip(L / ref, 0.4, 1.6)[..., None]
        a = np.where(stripe[..., None], c * shade, a)
    elif cloth in WHITE_TEE:
        H = a.shape[0]
        top = np.zeros_like(s, dtype=bool)
        top[: int(H * 0.5)] = True
        shirt = top & (s < 0.12) & (v > 0.75)
        ref = float(np.median(L[shirt])) if shirt.any() else 0.9
        prt = top & ~shirt & (small_holes(shirt, 0.03) | ((h > 12) & (h < 48) & (s > 0.3)))
        tint = 0.55 + 0.45 * c  # a light shade of the colour
        shade = np.clip(L / ref, 0.5, 1.2)[..., None]
        a = np.where(shirt[..., None], tint * shade * 0.95, a)
        a = np.where(prt[..., None], tint[None, None, :] * 0.95, a)
    else:
        return img
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')
