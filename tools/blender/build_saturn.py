"""
月ミッション（アポロ17号の追体験）で使う、サターンV型ロケットを Blender で組み立てる。

本物の寸法（全高 110.6 m、直径 10.1 m）に合わせて、回転体（輪郭を軸のまわりに回した形）を
段ごとに積み上げる。白黒の塗り分け（ロールパターン）は、高さと角度で材質を切り替えて付ける。

  - 第1段 S-IC：F-1 エンジン 5 基、4 枚のフィン、エンジンを覆うフェアリング
  - 段間部、第2段 S-II、第3段 S-IVB、計器リング（IU）
  - 着陸船を包むアダプタ（SLA）、機械船（SM）、司令船（CM）、緊急脱出塔（LES）

座標は Blender のまま（Z が上）。メートルで組み、書き出すときもメートルのまま（アプリ側で縮める）。
段ごとに別のオブジェクト（S1, S2, S3, CSM, LES）にして、打ち上げ中に切り離せるようにする。

実行:
  /home/user/.bpyvenv/bin/python tools/blender/build_saturn.py
  PREVIEW=1       確認用の画像を PREVIEW_DIR に書き出す（VIEWS=hero,side,base,top）
  OUT=...         glb の書き出し先（既定 public/models/saturn.glb）
"""

import math
import os
import time

import bpy
import bmesh

PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')
OUT = os.environ.get('OUT', os.path.join(os.path.dirname(__file__), '../../public/models/saturn.glb'))
N = 64  # まわりの分割

COLORS = {
    'White': ((0.86, 0.86, 0.84), 0.55, 0.0),
    'Black': ((0.025, 0.025, 0.028), 0.5, 0.0),
    'Metal': ((0.32, 0.31, 0.30), 0.45, 1.0),
    'Dark': ((0.06, 0.06, 0.065), 0.7, 0.3),
    'Silver': ((0.78, 0.78, 0.80), 0.28, 1.0),
    'Grey': ((0.55, 0.56, 0.57), 0.6, 0.0),
    'Red': ((0.55, 0.12, 0.07), 0.6, 0.0),
    'Glass': ((0.05, 0.07, 0.09), 0.1, 0.0),
    'Lamp': ((1.0, 0.86, 0.6), 0.5, 0.0),
    'NavRed': ((1.0, 0.08, 0.04), 0.5, 0.0),
}

PARTS = ['S1', 'Ring', 'S2', 'S3', 'CSM', 'LES']


class Part:
    def __init__(self):
        self.verts, self.faces, self.mats = [], [], []
        self.uvs = {}  # 面の番号 → 頂点ごとの UV（貼り絵の面だけ）

    def add(self, verts, faces, mat):
        o = len(self.verts)
        self.verts += verts
        for j, f in enumerate(faces):
            self.faces.append([i + o for i in f])
            self.mats.append(mat if isinstance(mat, str) else mat(j))


# ---- 回転体 ---------------------------------------------------------------------


def lathe(part, profile, paint, n=N, cap_top=True, cap_bottom=True, phase=0.0):
    """
    profile: [(z, r), ...] を下から上へ。paint(z_mid, theta, k) が面の材質を返す（k は輪郭の区間の番号）
    """
    verts = []
    for z, r in profile:
        for i in range(n):
            a = 2 * math.pi * i / n + phase
            verts.append((r * math.cos(a), r * math.sin(a), z))
    faces, mats = [], []
    for k in range(len(profile) - 1):
        zm = (profile[k][0] + profile[k + 1][0]) / 2
        for i in range(n):
            a, b = k * n + i, k * n + (i + 1) % n
            faces.append([a, b, b + n, a + n])
            th = 2 * math.pi * (i + 0.5) / n + phase
            mats.append(paint(zm, th % (2 * math.pi), k))
    o = len(part.verts)
    part.verts += verts
    for f, m in zip(faces, mats):
        part.faces.append([i + o for i in f])
        part.mats.append(m)
    # ふた（中心点を足した扇）
    for cap, k, flip in ((cap_bottom, 0, True), (cap_top, len(profile) - 1, False)):
        if not cap or profile[k][1] <= 1e-4:
            continue
        c = len(part.verts)
        part.verts.append((0, 0, profile[k][0]))
        for i in range(n):
            a, b = o + k * n + i, o + k * n + (i + 1) % n
            part.faces.append([c, b, a] if flip else [c, a, b])
            part.mats.append(paint(profile[k][0], 0, -1))


def solid(mat):
    return lambda z, th, k: mat


def box(part, c, s, mat, rz=0.0):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    pts = [(x, y, z) for z in (-hz, hz) for y in (-hy, hy) for x in (-hx, hx)]
    cr, sr = math.cos(rz), math.sin(rz)
    pts = [(c[0] + x * cr - y * sr, c[1] + x * sr + y * cr, c[2] + z) for x, y, z in pts]
    faces = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]
    part.add(pts, faces, mat)


def tube(part, a, b, r, mat, n=8):
    """a から b への細い棒（脱出塔のトラス）"""
    ax, ay, az = a
    dx, dy, dz = b[0] - ax, b[1] - ay, b[2] - az
    L = math.sqrt(dx * dx + dy * dy + dz * dz)
    ux, uy, uz = dx / L, dy / L, dz / L
    # 直交する 2 本
    px, py, pz = (1, 0, 0) if abs(ux) < 0.9 else (0, 1, 0)
    vx, vy, vz = uy * pz - uz * py, uz * px - ux * pz, ux * py - uy * px
    m = math.sqrt(vx * vx + vy * vy + vz * vz)
    vx, vy, vz = vx / m, vy / m, vz / m
    wx, wy, wz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    verts = []
    for (cx, cy, cz) in (a, b):
        for i in range(n):
            t = 2 * math.pi * i / n
            c, s = math.cos(t) * r, math.sin(t) * r
            verts.append((cx + vx * c + wx * s, cy + vy * c + wy * s, cz + vz * c + wz * s))
    faces = [[i, (i + 1) % n, (i + 1) % n + n, i + n] for i in range(n)]
    part.add(verts, faces, mat)


# ---- 各段 -----------------------------------------------------------------------

R1 = 5.03  # 第1・第2段の半径
R3 = 3.30  # 第3段
RS = 1.96  # 機械船・司令船


def quadrant(th, offset=0.0):
    """白黒の塗り分け：向かい合う 2 つの四分円が黒"""
    q = int(((th + offset) % (2 * math.pi)) / (math.pi / 2))
    return q % 2 == 0


def corrugated(p, z0, z1, r, paint, ribs=96, depth=0.06):
    """縦の波板（タンク間・段間部の補強）。凸と凹を交互に並べた輪"""
    n = ribs * 2
    verts = []
    for z in (z0, z1):
        for i in range(n):
            a = 2 * math.pi * i / n
            rr = r + (depth if i % 2 == 0 else 0.0)
            verts.append((rr * math.cos(a), rr * math.sin(a), z))
    faces = [[i, (i + 1) % n, (i + 1) % n + n, i + n] for i in range(n)]
    p.add(verts, faces, lambda j: paint((z0 + z1) / 2, 2 * math.pi * (j + 0.5) / n, 0))


def tunnel(p, a, z0, z1, r, w=0.55, h=0.32, mat='White'):
    """胴の外を縦に走る配線トンネル（かまぼこ形）"""
    n = 6
    verts = []
    for z in (z0, z1):
        for i in range(n + 1):
            t = math.pi * i / n
            x, y = r + h * math.sin(t), -w / 2 * math.cos(t)
            verts.append((x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a), z))
    m = n + 1
    faces = [[i, i + 1, i + 1 + m, i + m] for i in range(n)]
    p.add(verts, faces, mat)
    # 上下のふた
    p.add([verts[i] for i in range(m)], [list(range(m))[::-1]], mat)
    p.add([verts[i + m] for i in range(m)], [list(range(m))], mat)


DECAL_A = math.radians(-62)  # 文字と旗を描く向き（正面の見た目の側）


def decal_image(path):
    """第1段の側面の旗と縦書きの国名（実物の塗装に合わせて、上から旗・UNITED STATES）"""
    from PIL import Image, ImageDraw, ImageFont
    W, H = 256, 2048
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 旗（縦長に掲げた向き：ストライプが縦）
    fx0, fx1, fy0, fy1 = 20, 236, 6, 330
    sw = (fx1 - fx0) / 13
    for i in range(13):
        col = (178, 34, 52, 255) if i % 2 == 0 else (240, 240, 236, 255)
        d.rectangle([fx0 + i * sw, fy0, fx0 + (i + 1) * sw, fy1], fill=col)
    cw, ch = sw * 7, (fy1 - fy0) * 0.4
    d.rectangle([fx0, fy0, fx0 + cw, fy0 + ch], fill=(40, 52, 108, 255))
    for r in range(9):
        for c in range(6 if r % 2 == 0 else 5):
            x = fx0 + 8 + c * (cw - 16) / 5.2 + (0 if r % 2 == 0 else (cw - 16) / 10.4)
            y = fy0 + 8 + r * (ch - 16) / 8
            d.ellipse([y * 0 + x - 3, y - 3, x + 3, y + 3], fill=(240, 240, 236, 255))
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 124)
    except OSError:
        font = ImageFont.load_default()
    word = 'UNITED STATES'
    y = 400
    step = (H - 400) / len(word)
    for ch_ in word:
        if ch_ != ' ':
            bb = d.textbbox((0, 0), ch_, font=font)
            d.text(((W - (bb[2] - bb[0])) / 2 - bb[0], y - bb[1]), ch_, font=font, fill=(18, 18, 20, 255))
        y += step
    img.save(path)


def decal(p, a0, z0, z1, width, r):
    """胴に巻いた薄い帯（UV つき）"""
    n = 8
    half = width / r / 2
    verts = []
    for z in (z0, z1):
        for i in range(n + 1):
            a = a0 - half + 2 * half * i / n
            verts.append((r * math.cos(a), r * math.sin(a), z))
    m = n + 1
    base = len(p.faces)
    faces = [[i, i + 1, i + 1 + m, i + m] for i in range(n)]
    p.add(verts, faces, 'Decal')
    for i in range(n):
        u0, u1 = i / n, (i + 1) / n
        p.uvs[base + i] = [(u0, 0), (u1, 0), (u1, 1), (u0, 1)]


def stage1(p):
    def paint(z, th, k):
        if z < 6.4:
            return 'Dark'  # 推力構造の下端
        if z < 17.0:
            return 'Black' if quadrant(th) else 'White'  # 下部のロールパターン
        if 35.6 < z < 42.0:
            return 'Black' if quadrant(th) or z > 39.8 else 'White'  # 上端の黒帯（タンク間）
        return 'White'

    prof = [(5.6, R1 - 0.15), (6.0, R1), (6.4, R1)]
    prof += [(z, R1) for z in (10.0, 13.0, 17.0, 21.0, 26.0, 31.0, 35.6, 39.8, 42.0)]
    lathe(p, prof, paint)
    # 推力構造とタンク間の波板
    corrugated(p, 5.9, 8.4, R1, lambda z, th, k: 'Black' if quadrant(th) else 'White')
    corrugated(p, 33.2, 35.6, R1, lambda z, th, k: 'White')
    corrugated(p, 39.8, 42.0, R1, lambda z, th, k: 'Black')
    # 底の熱よけ
    lathe(p, [(5.4, 0.0), (5.6, R1 - 0.15)], solid('Dark'), cap_top=False, cap_bottom=False)
    # 段の継ぎ目の帯（すこし太い）
    for z0 in (33.2,):
        lathe(p, [(z0 - 0.12, R1 + 0.05), (z0 + 0.12, R1 + 0.05)], solid('Grey'))
    # 旗と国名
    decal(p, DECAL_A, 9.2, 32.9, 3.0, R1 + 0.012)
    # 配線トンネル（2 本）
    for a in (math.radians(10), math.radians(190)):
        tunnel(p, a, 8.4, 39.8, R1, mat='White')
    # F-1 エンジン：中央 1 + 外側 4（フェアリングと同じ 45° の向き）
    bell = [(0.0, 1.85), (0.25, 1.85), (0.5, 1.72), (1.6, 1.46), (2.8, 1.18), (3.8, 0.95), (4.5, 0.78),
            (4.9, 0.62), (5.15, 0.7), (5.6, 0.9)]
    for i in range(5):
        if i == 0:
            cx = cy = 0.0
        else:
            a = math.pi / 4 + (i - 1) * math.pi / 2
            cx, cy = 3.05 * math.cos(a), 3.05 * math.sin(a)
        q = Part()
        lathe(q, bell, lambda z, th, k: 'Grey' if k == 0 else ('Metal' if z > 2.8 else 'Dark'),
              n=40, cap_top=False, cap_bottom=False)
        # 排気の巻き付け管（はちまき）
        for zz in (0.5, 2.0):
            r = 1.72 - (zz - 0.5) * 0.23
            lathe(q, [(zz - 0.08, r + 0.05), (zz + 0.08, r + 0.05)], solid('Dark'), n=40,
                  cap_top=False, cap_bottom=False)
        # 内側（ノズルの中は暗く）
        inner = [(0.0, 1.80), (1.6, 1.40), (3.8, 0.88), (4.85, 0.55)]
        lathe(q, list(reversed(inner)), solid('Dark'), n=40, cap_top=False, cap_bottom=True)
        p.add([(x + cx, y + cy, z) for x, y, z in q.verts], q.faces, lambda f, m=q.mats: m[f])
    # 外側エンジンのフェアリング（円錐）とフィン
    for j in range(4):
        a = math.pi / 4 + j * math.pi / 2
        cx, cy = 3.9 * math.cos(a), 3.9 * math.sin(a)
        fair = [(3.3, 0.0), (3.3, 1.62), (3.45, 1.7), (5.0, 1.55), (6.4, 1.3), (8.3, 0.75), (9.6, 0.2)]
        q = Part()
        lathe(q, fair, lambda z, th, k: 'Black' if z < 6.4 else 'White', n=32, cap_top=True,
              cap_bottom=False, phase=a)
        # フェアリングの下の穴（エンジンの通り道）は暗く
        q.mats[:32] = ['Dark'] * 32
        p.add([(x + cx, y + cy, z) for x, y, z in q.verts], q.faces, lambda f, m=q.mats: m[f])
        # フィン：フェアリングの外側に生えた台形。根元が長く、先は短い。厚みは中央が厚い
        fx, fy = math.cos(a), math.sin(a)
        prof = [(5.3, 10.6), (5.3, 3.6), (8.6, 2.2), (8.6, 4.4)]
        verts = []
        for s in (1, -1):
            for r, z in prof:
                t = 0.2 if r < 6 else 0.08
                verts.append((fx * r - fy * t * s, fy * r + fx * t * s, z))
        mid = [(fx * (r + (0.05 if r > 6 else -0.0)), fy * (r + (0.05 if r > 6 else 0.0)), z) for r, z in prof]
        faces = [[0, 1, 2, 3], [7, 6, 5, 4], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]
        p.add(verts, faces, 'Black')
        _ = mid


def stage2(p, ring):
    def paint(z, th, k):
        return 'White'

    # 段間部（第2段の点火から 30 秒で捨てるリング）
    lathe(ring, [(42.0, R1), (46.8, R1)], paint, cap_top=False, cap_bottom=False)
    corrugated(ring, 42.0, 46.8, R1, lambda z, th, k: 'White')
    prof = [(46.8, R1), (47.0, R1), (52.0, R1), (58.0, R1), (64.0, R1), (66.9, R1)]
    lathe(p, prof, paint)
    corrugated(p, 64.6, 66.9, R1, lambda z, th, k: 'White', ribs=120, depth=0.04)
    lathe(p, [(46.8, R1 + 0.06), (47.2, R1 + 0.06)], solid('Grey'))
    lathe(p, [(64.4, R1 + 0.05), (64.6, R1 + 0.05)], solid('Grey'))
    # 配線トンネル
    tunnel(p, math.radians(10), 47.2, 64.4, R1, mat='White')
    # 段間部の小さなロケット（分離のとき燃料を沈める加速ロケット）
    for j in range(8):
        a = j * math.pi / 4 + math.pi / 8
        lathe_at(ring, R1 + 0.25, a, 43.0, [(0.0, 0.18), (1.6, 0.24), (2.2, 0.0)], 'Grey')


def lathe_at(p, rad, a, z, prof, mat, n=12):
    q = Part()
    lathe(q, [(z + dz, r) for dz, r in prof], solid(mat), n=n)
    cx, cy = rad * math.cos(a), rad * math.sin(a)
    p.add([(x + cx, y + cy, zz) for x, y, zz in q.verts], q.faces, lambda f, m=q.mats: m[f])


def stage3(p):
    def paint(z, th, k):
        if 70.0 < z < 74.5:
            return 'Black' if quadrant(th) else 'White'
        if 84.6 < z:
            return 'Grey'  # 計器リング
        return 'White'

    prof = [(66.9, R1), (68.6, 4.35), (70.0, R3), (72.0, R3), (74.5, R3), (79.0, R3), (84.6, R3), (85.6, R3)]
    lathe(p, prof, paint)
    # 第3段のわきの補助ロケット（APS）
    for a in (0.0, math.pi):
        box(p, (R3 * 1.02 * math.cos(a), R3 * 1.02 * math.sin(a), 71.0), (0.9, 1.6, 2.2), 'White', rz=a)


def csm(p):
    # 着陸船を包むアダプタ（SLA）：中に着陸船が入っている
    lathe(p, [(85.6, R3), (88.0, 2.86), (92.0, 2.20), (94.1, RS)], solid('White'))
    # 機械船（SM）：アルミの銀と、白い放熱板
    def sm(z, th, k):
        return 'White' if int(th / (math.pi / 3)) % 2 == 0 else 'Silver'

    lathe(p, [(94.1, RS), (97.6, RS)], sm)
    # 司令船（CM）を覆う白いカバー（BPC）
    lathe(p, [(97.6, RS), (97.8, RS * 0.98), (100.4, 0.42), (100.8, 0.30)], solid('White'))
    # カバーの窓
    for a in (0.6, 2.2):
        box(p, (1.4 * math.cos(a), 1.4 * math.sin(a), 98.7), (0.08, 0.4, 0.35), 'Glass', rz=a)


def les(p):
    # 脱出塔のトラス（赤）と、固体ロケット
    z0, z1 = 100.8, 104.6
    pts0 = [(0.62 * math.cos(a), 0.62 * math.sin(a)) for a in (0.0, math.pi / 2, math.pi, 1.5 * math.pi)]
    pts1 = [(0.30 * math.cos(a), 0.30 * math.sin(a)) for a in (0.0, math.pi / 2, math.pi, 1.5 * math.pi)]
    for i in range(4):
        a, b = pts0[i], pts1[i]
        tube(p, (a[0], a[1], z0 - 0.1), (b[0], b[1], z1), 0.05, 'Red')
        c = pts1[(i + 1) % 4]
        tube(p, (a[0], a[1], z0), (c[0], c[1], (z0 + z1) / 2 + 0.5), 0.035, 'Red')
        d = pts0[(i + 1) % 4]
        tube(p, (b[0], b[1], z1 - 0.2), ((b[0] + d[0]) / 2 * 1.05, (b[1] + d[1]) / 2 * 1.05, (z0 + z1) / 2 - 0.4), 0.03, 'Red')
    lathe(p, [(104.6, 0.33), (105.2, 0.40), (109.0, 0.40), (109.5, 0.33), (110.2, 0.18), (110.6, 0.04)],
          lambda z, th, k: 'Red' if z > 109.4 else 'White', n=32)
    # 脱出ロケットのノズル（4 本）
    for j in range(4):
        a = j * math.pi / 2 + math.pi / 4
        box(p, (0.42 * math.cos(a), 0.42 * math.sin(a), 105.0), (0.22, 0.22, 0.5), 'Dark', rz=a)


# ---- 発射台 -----------------------------------------------------------------------

TOWER_Y = 19.0  # 発射塔の中心（ロケットの北側）
TOWER_W = 12.0
DECK = 0.8  # 移動発射台の甲板の高さ（エンジンの口は甲板の穴の中）


def rocket_radius(z):
    if z < 42:
        return R1
    if z < 66.9:
        return R1
    if z < 70:
        return R3 + (R1 - R3) * (70 - z) / 3.1
    if z < 85.6:
        return R3
    if z < 94.1:
        return R3 + (RS - R3) * (z - 85.6) / 8.5
    return RS


# 発射塔と移動発射台は build_launchpad.py（launchpad.glb）。


# ---- Blender へ -----------------------------------------------------------------


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    if name == 'Decal':
        path = os.path.join(PREVIEW_DIR, 'saturn-decal.png')
        decal_image(path)
        nt = mat.node_tree
        b = nt.nodes['Principled BSDF']
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(path)
        nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
        nt.links.new(tex.outputs['Alpha'], b.inputs['Alpha'])
        b.inputs['Roughness'].default_value = 0.55
        mat.blend_method = 'CLIP' if hasattr(mat, 'blend_method') else None
        return mat
    col, rough, metal = COLORS[name]
    b = mat.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if name in ('Lamp', 'NavRed'):
        b.inputs['Emission Color'].default_value = (*col, 1)
        b.inputs['Emission Strength'].default_value = 6.0
    return mat


def make_object(name, part):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(part.verts, [], part.faces)
    names = sorted(set(part.mats))
    for n in names:
        mesh.materials.append(material(n))
    idx = {n: i for i, n in enumerate(names)}
    for poly, m in zip(mesh.polygons, part.mats):
        poly.material_index = idx[m]
    if part.uvs:
        uv = mesh.uv_layers.new(name='UVMap')
        for poly in mesh.polygons:
            us = part.uvs.get(poly.index)
            for j, li in enumerate(poly.loop_indices):
                uv.data[li].uv = us[j] if us else (0.0, 0.0)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    try:
        mesh.set_sharp_from_angle(angle=math.radians(35))
    except AttributeError:
        pass
    return obj


def preview(objs):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.device = 'CPU'
    scene.render.resolution_x, scene.render.resolution_y = 900, 1400
    world = bpy.data.worlds.new('W')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.42, 0.55, 0.72, 1)
    bg.inputs['Strength'].default_value = 0.55
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(55), 0, math.radians(35))
    scene.collection.objects.link(sun)
    # 地面
    bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, DECK - 7.6 - 6.0))
    g = bpy.context.object
    gm = bpy.data.materials.new('Ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.35, 0.33, 0.3, 1)
    g.data.materials.append(gm)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    views = os.environ.get('VIEWS', 'hero,top,base').split(',')
    shots = {
        'hero': ((95, -165, 30), (0, 0, 55), 55),
        'night': ((75, -130, 6), (0, 0, 55), 40),
        'close': ((30, -44, 24), (0, 0, 24), 45),
        'side': ((0, -230, 55), (0, 0, 55), 30),
        'top': ((14, -26, 108), (0, 0, 95), 35),
        'base': ((22, -26, 6), (0, 0, 8), 40),
    }
    for v in views:
        if v == 'night':
            bg.inputs['Color'].default_value = (0.004, 0.006, 0.014, 1)
            sun.data.energy = 0.0
            for k in range(3):
                a = math.radians(-80 + k * 60)
                L = bpy.data.objects.new(f'Xe{k}', bpy.data.lights.new(f'Xe{k}', 'SPOT'))
                L.data.energy = 2.5e6
                L.data.spot_size = math.radians(24)
                L.data.color = (0.85, 0.9, 1.0)
                L.location = (300 * math.cos(a), 300 * math.sin(a), 2)
                d = (-L.location[0], -L.location[1], 55 - 2)
                L.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
                scene.collection.objects.link(L)
        loc, tgt, lens = shots[v]
        cam.location = loc
        d = [tgt[i] - loc[i] for i in range(3)]
        cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
        cam.data.lens = lens
        if v in ('top', 'base', 'close'):
            scene.render.resolution_x, scene.render.resolution_y = 1100, 900
        else:
            scene.render.resolution_x, scene.render.resolution_y = 900, 1400
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'saturn-{v}.png')
        bpy.ops.render.render(write_still=True)
        print('rendered', scene.render.filepath, flush=True)


def main():
    t0 = time.time()
    reset_scene()
    P = {n: Part() for n in PARTS}
    stage1(P['S1'])
    stage2(P['S2'], P['Ring'])
    stage3(P['S3'])
    csm(P['CSM'])
    les(P['LES'])
    objs = [make_object(n, P[n]) for n in PARTS]
    nf = sum(len(o.data.polygons) for o in objs)
    print(f'{nf} faces ({time.time() - t0:.1f}s)', flush=True)
    if os.environ.get('PREVIEW'):
        preview(objs)
    if os.environ.get('EXPORT', '1') == '1':
        for o in bpy.data.objects:
            o.select_set(o.name in PARTS)
        bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=True,
                                  export_yup=True, export_materials='EXPORT')
        print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB', flush=True)


if __name__ == '__main__':
    main()
