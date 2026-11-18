"""Turn the three rover-race lines into twisty courses with a zigzag of gates.

junji (2026-11-05): the races are too straight; add more gates in a zigzag.
Each base line (the route drawn on the terrain, src/data/{rallyCourse,moonCourse,europaCourse}.ts) gets
  * sweeping S-bends: a sideways offset A * sin(2 pi s / L), and
  * a slalom: gates every GAP m, alternately ZIG m left and right of the line, joined by a smooth weave.
Both fade in after the start grid and out before the goal. Where the offset would climb a steep slope or
leave the base line's height by more than MAX_DH (crater rims on the Moon, canyon talus on Mars), the
offset is scaled down there. Writes src/data/raceLines.ts (10 m points + gate distances).

Usage: python3 tools/terrain/wiggle_courses.py
"""
import json
import math
import re
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter1d

ROOT = Path(__file__).resolve().parents[2]
GAP = 70.0       # gate spacing along the course (m)
START = 110.0    # first gate (the grid is at 45 m)

TRACKS = {
    # name: (course file, base points to use, dem, bend amplitude, bend wavelength, zig, phase)
    # name: (..., max height change m, max slope deg)
    'coprates': ('rallyCourse.ts', 122, 'mars_coprates', 32.0, 420.0, 12.0, 0.4, 6.0, 16.0),
    'taurus': ('moonCourse.ts', None, 'moon_taurus', 26.0, 360.0, 13.0, 1.7, 2.5, 12.0),
    'conamara': ('europaCourse.ts', None, 'europa_conamara', 22.0, 330.0, 15.0, 2.6, 6.0, 16.0),
    # the easy Europa course (cratercamper 2026-11-12): the original line with no bends or zigzag, so most
    # of it is flat-out drifting, and only 7 gates about 200 m apart, none just after a slab's edge
    # (pack_europa.py SLABS: edges at 330, 760, 1110 (15 m, long flight) and 1450 m)
    'conamara_easy': ('europaCourse.ts', None, 'europa_conamara', 0.0, 330.0, 0.0, 0.0, 6.0, 16.0),
}
# gates at fixed base-line distances (m) instead of every GAP m (the goal is added at the end)
FIXED_GATES = {
    'conamara_easy': [200.0, 430.0, 640.0, 880.0, 1300.0, 1570.0],
}


def base_line(fname, n):
    text = (ROOT / 'src/data' / fname).read_text()
    m = re.search(r'const RAW = \[([^\]]*)\]', text)
    if m:
        v = [int(x) for x in m.group(1).split(',') if x.strip()]
        pts = np.array(v, float).reshape(-1, 2)
    else:
        pts = np.array([[float(a), float(b)] for a, b in re.findall(r'\[(-?\d+), (-?\d+)\]', text)])
    return pts[:n] if n else pts


def dem(name):
    meta = json.loads((ROOT / 'public/terrain' / f'{name}.json').read_text())
    q = np.asarray(Image.open(ROOT / 'public/terrain' / f'{name}_near.png')).astype(np.float64)
    nm = meta['near']
    h = (q[..., 0] * 256 + q[..., 1]) * nm['step'] - nm['offset']
    ext, n = nm['extent_m'], nm['size']

    def at(x, z):
        fx = np.clip((x + ext / 2) / ext * n - 0.5, 0, n - 1.001)
        fz = np.clip((z + ext / 2) / ext * n - 0.5, 0, n - 1.001)
        i, j = fx.astype(int), fz.astype(int)
        tx, tz = fx - i, fz - j
        return h[j, i] * (1 - tx) * (1 - tz) + h[j, i + 1] * tx * (1 - tz) + h[j + 1, i] * (1 - tx) * tz + h[j + 1, i + 1] * tx * tz
    return at


def resample(pts, step):
    seg = np.hypot(*np.diff(pts, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    ss = np.arange(0, s[-1], step)
    ss = np.append(ss, s[-1]) if s[-1] - ss[-1] > step * 0.3 else ss
    return np.stack([np.interp(ss, s, pts[:, 0]), np.interp(ss, s, pts[:, 1])], 1), ss


def build(name, fname, n, demname, amp, wave, zig, phase, max_dh, max_slope):
    at = dem(demname)
    base, s = resample(base_line(fname, n), 2.0)
    total = s[-1]
    t = np.gradient(base, axis=0)
    t = gaussian_filter1d(t, 10, axis=0)
    t /= np.linalg.norm(t, axis=1, keepdims=True)
    nrm = np.stack([-t[:, 1], t[:, 0]], 1)  # left of travel
    goal = total - 15
    gates = FIXED_GATES.get(name) or list(np.arange(START, goal - GAP * 0.6, GAP))
    fade = np.clip((s - 60) / 60, 0, 1) * np.clip((goal - 10 - s) / 50, 0, 1)
    fade = fade * fade * (3 - 2 * fade)
    off = amp * np.sin(2 * np.pi * s / wave + phase) + zig * np.cos(np.pi * (s - START) / GAP)
    h0 = at(base[:, 0], base[:, 1])
    e = 3.0
    gx0 = (at(base[:, 0] + e, base[:, 1]) - at(base[:, 0] - e, base[:, 1])) / (2 * e)
    gz0 = (at(base[:, 0], base[:, 1] + e) - at(base[:, 0], base[:, 1] - e)) / (2 * e)
    slope0 = np.degrees(np.arctan(np.hypot(gx0, gz0)))
    lim = np.maximum(max_slope, slope0 + 3)
    k = np.ones_like(s)
    raw = np.ones_like(s)
    for _ in range(12):
        o = off * fade * k
        p = base + nrm * o[:, None]
        h = at(p[:, 0], p[:, 1])
        e = 3.0
        gx = (at(p[:, 0] + e, p[:, 1]) - at(p[:, 0] - e, p[:, 1])) / (2 * e)
        gz = (at(p[:, 0], p[:, 1] + e) - at(p[:, 0], p[:, 1] - e)) / (2 * e)
        slope = np.degrees(np.arctan(np.hypot(gx, gz)))
        bad = (np.abs(h - h0) > max_dh) | ((slope > lim) & (np.abs(o) > 1))
        if not bad.any():
            break
        raw = np.where(bad, raw * 0.6, raw)
        # widen each cut a little and smooth it, so the course eases in and out of it
        k = gaussian_filter1d(raw, 12)
        k = np.minimum(k, gaussian_filter1d(raw, 4))
    o = off * fade * k
    p = base + nrm * o[:, None]
    p = gaussian_filter1d(p, 2, axis=0, mode='nearest')
    p[0] = base[0]
    # arc length of the new path at each base sample, to move the gate distances onto it
    seg = np.hypot(*np.diff(p, axis=0).T)
    snew = np.concatenate([[0], np.cumsum(seg)])
    gs = [float(np.interp(g, s, snew)) for g in gates] + [float(snew[-1] - 15)]
    line, _ = resample(p, 10.0)
    print(f'{name}: base {total:.0f} m -> {snew[-1]:.0f} m, {len(gs)} gates, offset scaled down at {np.mean(k < 0.99) * 100:.0f}% of points, max |off| {np.abs(o).max():.0f} m, mean k {k.mean():.2f} min k {k.min():.2f}')
    return [[int(round(x)), int(round(z))] for x, z in line], [round(g, 1) for g in gs]


def main():
    out = ['// ローバーレースのコース（tools/terrain/wiggle_courses.py が書き出す。手で直さない）。',
           '// 地形の上に引いた走行ライン（rallyCourse.ts・moonCourse.ts・europaCourse.ts）を、大きな S 字に曲げ、',
           '// 門を 70 m ごとに左右交互（ジグザグ）に置いて、そのあいだを縫うように走る道にしたもの（CONAMARA_EASY は曲げない、門は約 200 m ごと）。',
           '// line：10 m ごとの点（x 東・z 南、m）。gates：門の道のり（m、最後がゴール）', '']
    for name, args in TRACKS.items():
        line, gates = build(name, *args)
        flat = ','.join(f'[{x},{z}]' for x, z in line)
        out.append(f'export const {name.upper()}_RACE: {{ line: [number, number][]; gates: number[] }} = {{')
        out.append(f'  line: [{flat}],')
        out.append(f'  gates: [{", ".join(str(g) for g in gates)}],')
        out.append('}')
        out.append('')
    (ROOT / 'src/data/raceLines.ts').write_text('\n'.join(out))


if __name__ == '__main__':
    main()
