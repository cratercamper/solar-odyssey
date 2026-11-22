"""
月ミッション（アポロ17号の追体験）第2弾で使う、司令船・機械船（CSM「アメリカ」）と月着陸船（LM「チャレンジャー」）を
Blender で組み立てる。本物の寸法に合わせる（m）。

  CSM：司令船（CM、円すい、反射するテープの銀）＋ 機械船（SM、白と銀、SPS エンジン、RCS 4 組、高利得アンテナ、
       アポロ15〜17号の観測機器室 SIM ベイ）。原点は司令船のてっぺん（ドッキングのところ）、機体は -Z へ伸びる
  LM ：下降段（八角形、金色の断熱フィルム、DPS エンジン）＋ 上昇段（角ばった乗員室、三角の窓、ハッチ、タンクのふくらみ、
       RCS 4 組、アンテナ）＋ 脚 4 本（足の裏、探り棒、前の脚にはしご）。原点は足の裏の高さ（地面）、前は +Y

部品ごとに別のオブジェクトにして（CM, SM, LMDescent, LMAscent, Leg0〜Leg3）、アプリで切り離し・脚の展開をする。
脚のオブジェクトの原点は、脚の付け根（たたむときの回転の中心）。

実行:
  /home/user/.bpyvenv/bin/python tools/blender/build_apollo.py
  PREVIEW=1  確認用の画像を PREVIEW_DIR に（VIEWS=lm,lmfront,csm,stack）
  OUT=...    書き出し先（既定 public/models/apollo.glb）
"""

import math
import os
import time

import bpy
import bmesh

PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')
OUT = os.environ.get('OUT', os.path.join(os.path.dirname(__file__), '../../public/models/apollo.glb'))

# 色・粗さ・金属
COLORS = {
    'Kapton': ((0.90, 0.64, 0.22), 0.3, 1.0),  # 下降段の金色（アンバー）の断熱フィルム
    'KaptonDark': ((0.66, 0.43, 0.14), 0.38, 1.0),
    'Mylar': ((0.82, 0.82, 0.84), 0.22, 1.0),  # 銀のフィルム
    'Inconel': ((0.66, 0.65, 0.62), 0.42, 0.55),  # 上昇段の灰色の板
    'Panel': ((0.20, 0.20, 0.21), 0.6, 0.2),  # 黒っぽい板
    'Black': ((0.03, 0.03, 0.035), 0.55, 0.0),
    'CMSilver': ((0.88, 0.88, 0.90), 0.24, 1.0),  # 司令船の反射テープ
    'Ablator': ((0.30, 0.20, 0.13), 0.85, 0.0),  # 熱よけ（茶色）
    'SMWhite': ((0.80, 0.80, 0.78), 0.45, 0.0),
    'Aluminum': ((0.70, 0.70, 0.72), 0.35, 1.0),
    'Nozzle': ((0.16, 0.15, 0.15), 0.45, 0.8),
    'NozzleIn': ((0.05, 0.05, 0.05), 0.7, 0.3),
    'Glass': ((0.02, 0.025, 0.03), 0.05, 0.0),
    'Dish': ((0.86, 0.86, 0.84), 0.5, 0.0),
    'Strut': ((0.62, 0.62, 0.64), 0.35, 1.0),
    'Pad': ((0.70, 0.60, 0.40), 0.4, 1.0),
}

PARTS = ['CM', 'SM', 'LMDescent', 'LMAscent', 'Leg0', 'Leg1', 'Leg2', 'Leg3']


class Part:
    def __init__(self):
        self.verts, self.faces, self.mats = [], [], []

    def add(self, verts, faces, mat):
        o = len(self.verts)
        self.verts += [tuple(v) for v in verts]
        for j, f in enumerate(faces):
            self.faces.append([i + o for i in f])
            self.mats.append(mat if isinstance(mat, str) else mat(j))


def lathe(part, profile, paint, n=48, cap_top=True, cap_bottom=True, center=(0, 0), phase=0.0):
    """profile: [(z, r), ...] 下から上へ。paint(z_mid, theta, k) が面の材質"""
    cx, cy = center
    o = len(part.verts)
    for z, r in profile:
        for i in range(n):
            a = 2 * math.pi * i / n + phase
            part.verts.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
    for k in range(len(profile) - 1):
        zm = (profile[k][0] + profile[k + 1][0]) / 2
        for i in range(n):
            a, b = o + k * n + i, o + k * n + (i + 1) % n
            part.faces.append([a, b, b + n, a + n])
            th = (2 * math.pi * (i + 0.5) / n + phase) % (2 * math.pi)
            part.mats.append(paint(zm, th, k) if callable(paint) else paint)
    for cap, k, flip in ((cap_bottom, 0, True), (cap_top, len(profile) - 1, False)):
        if not cap or profile[k][1] <= 1e-4:
            continue
        c = len(part.verts)
        part.verts.append((cx, cy, profile[k][0]))
        for i in range(n):
            a, b = o + k * n + i, o + k * n + (i + 1) % n
            part.faces.append([c, b, a] if flip else [c, a, b])
            part.mats.append(paint(profile[k][0], 0, -1) if callable(paint) else paint)


def box(part, c, s, mat, rz=0.0, rx=0.0):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    pts = []
    for z in (-hz, hz):
        for y in (-hy, hy):
            for x in (-hx, hx):
                # x 軸まわり → z 軸まわり
                y2, z2 = y * math.cos(rx) - z * math.sin(rx), y * math.sin(rx) + z * math.cos(rx)
                x3, y3 = x * math.cos(rz) - y2 * math.sin(rz), x * math.sin(rz) + y2 * math.cos(rz)
                pts.append((c[0] + x3, c[1] + y3, c[2] + z2))
    faces = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]
    part.add(pts, faces, mat)


def frame_of(d):
    """方向 d に直交する 2 本"""
    dx, dy, dz = d
    L = math.sqrt(dx * dx + dy * dy + dz * dz)
    ux, uy, uz = dx / L, dy / L, dz / L
    px, py, pz = (1, 0, 0) if abs(ux) < 0.9 else (0, 1, 0)
    vx, vy, vz = uy * pz - uz * py, uz * px - ux * pz, ux * py - uy * px
    m = math.sqrt(vx * vx + vy * vy + vz * vz)
    vx, vy, vz = vx / m, vy / m, vz / m
    wx, wy, wz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    return (ux, uy, uz), (vx, vy, vz), (wx, wy, wz), L


def tube(part, a, b, r, mat, n=10, r2=None):
    """a から b への棒（r2 で先を細く）"""
    (ux, uy, uz), (vx, vy, vz), (wx, wy, wz), L = frame_of((b[0] - a[0], b[1] - a[1], b[2] - a[2]))
    verts = []
    for (cx, cy, cz), rr in ((a, r), (b, r if r2 is None else r2)):
        for i in range(n):
            t = 2 * math.pi * i / n
            c, s = math.cos(t) * rr, math.sin(t) * rr
            verts.append((cx + vx * c + wx * s, cy + vy * c + wy * s, cz + vz * c + wz * s))
    faces = [[i, (i + 1) % n, (i + 1) % n + n, i + n] for i in range(n)]
    faces.append(list(range(n))[::-1])
    faces.append([i + n for i in range(n)])
    part.add(verts, faces, mat)


def disc_along(part, c, d, profile, mat, n=24):
    """c を中心に、向き d を軸にした回転体（profile は [(軸の位置, 半径)]）。アンテナの皿やノズル"""
    (ux, uy, uz), (vx, vy, vz), (wx, wy, wz), _ = frame_of(d)
    o = len(part.verts)
    for t, r in profile:
        for i in range(n):
            a = 2 * math.pi * i / n
            cc, ss = math.cos(a) * r, math.sin(a) * r
            part.verts.append((c[0] + ux * t + vx * cc + wx * ss, c[1] + uy * t + vy * cc + wy * ss, c[2] + uz * t + vz * cc + wz * ss))
    for k in range(len(profile) - 1):
        for i in range(n):
            a, b = o + k * n + i, o + k * n + (i + 1) % n
            part.faces.append([a, b, b + n, a + n])
            part.mats.append(mat if isinstance(mat, str) else mat(k))


def hull(part, pts, paint):
    """点の凸包（角ばった上昇段）。paint(法線, 中心) が面の材質"""
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    bmesh.ops.convex_hull(bm, input=vs)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts, edges=bm.edges)
    bm.normal_update()
    o = len(part.verts)
    idx = {}
    for v in bm.verts:
        idx[v] = len(part.verts)
        part.verts.append(tuple(v.co))
    for f in bm.faces:
        if not f.is_valid:
            continue
        part.faces.append([idx[v] for v in f.verts])
        c = f.calc_center_median()
        part.mats.append(paint(tuple(f.normal), tuple(c)))
    bm.free()
    return o


def quad(part, pts, mat):
    part.add(pts, [[0, 1, 2, 3]], mat)


# ---- 司令船・機械船 ------------------------------------------------------------------

RC = 1.955  # 司令船・機械船の半径


def command_module(p):
    # 円すい（てっぺんは平ら）。銀の反射テープ
    prof = [(-3.25, RC * 0.985), (-3.23, RC), (-3.05, RC * 0.96), (-0.55, 0.62), (-0.25, 0.47), (0.0, 0.42)]

    def paint(z, th, k):
        return 'CMSilver'

    lathe(p, prof, paint, n=64)
    # 底の熱よけ（茶色の、ゆるい丸み）
    lathe(p, [(-3.42, 0.6), (-3.36, 1.4), (-3.25, RC * 0.985)], 'Ablator', n=64, cap_top=False)
    # ドッキングの探り棒（3 本足と棒）
    for j in range(3):
        a = j * 2 * math.pi / 3
        tube(p, (0.36 * math.cos(a), 0.36 * math.sin(a), 0.0), (0.05 * math.cos(a), 0.05 * math.sin(a), 0.32), 0.025, 'Strut', n=6)
    tube(p, (0, 0, 0.0), (0, 0, 0.5), 0.035, 'Strut', n=8, r2=0.02)
    # 窓（5 つ）：前の 2 つ（ランデブー窓）、横の 2 つ、ハッチの窓
    def window(theta, z, w, h):
        # 円すいの面に沿って小さな四角
        rz = 0.62 + (RC * 0.96 - 0.62) * (-0.55 - z) / (-0.55 + 3.05)
        cx, cy = (rz + 0.01) * math.cos(theta), (rz + 0.01) * math.sin(theta)
        box(p, (cx, cy, z), (0.02, w, h), 'Glass', rz=theta, rx=0.0)

    for th, z in ((0.32, -1.25), (-0.32, -1.25), (1.35, -1.9), (-1.35, -1.9), (0.0, -2.05)):
        window(th, z, 0.32, 0.30)
    # ハッチの枠
    box(p, ((RC * 0.80) * math.cos(0.0), 0, -2.05), (0.03, 0.75, 0.75), 'Panel')
    # 司令船の RCS の口（小さな黒い点）
    for j in range(6):
        a = j * math.pi / 3 + 0.5
        box(p, (1.0 * math.cos(a), 1.0 * math.sin(a), -1.6), (0.12, 0.12, 0.12), 'Black', rz=a)


def service_module(p):
    z0, z1 = -7.45, -3.45

    def paint(z, th, k):
        deg = math.degrees(th)
        # 観測機器室（SIM ベイ）：右前の 50° ほどは扉を外した、黒い凹み
        if 20 < deg < 70 and -6.9 < z < -3.9:
            return 'Panel'
        # 上のほうの白い放熱板と、銀の板の帯
        if z > -4.3:
            return 'SMWhite' if int(deg / 30) % 2 == 0 else 'Aluminum'
        return 'SMWhite' if int(deg / 60) % 2 == 0 else 'Aluminum'

    lathe(p, [(z0, RC * 0.97), (z0 + 0.06, RC), (z1 - 0.06, RC), (z1, RC * 0.985)], paint, n=72)
    # SIM ベイの中の機器（カメラ・望遠鏡の箱）
    for z, w, h in ((-4.5, 0.6, 0.6), (-5.4, 0.7, 0.9), (-6.3, 0.5, 0.7)):
        a = math.radians(45)
        box(p, ((RC - 0.25) * math.cos(a), (RC - 0.25) * math.sin(a), z), (0.45, w, h), 'Mylar', rz=a)
    # 後ろのふた（銀）とエンジンの付け根
    lathe(p, [(z0 - 0.15, 0.7), (z0 - 0.05, 1.6), (z0, RC * 0.97)], 'Aluminum', n=48, cap_top=False)
    # SPS エンジンのノズル（外は黒っぽい金属、中は暗い）
    bell = [(-10.35, 1.25), (-9.8, 1.12), (-9.0, 0.88), (-8.2, 0.6), (-7.75, 0.42), (-7.6, 0.4)]
    lathe(p, bell, 'Nozzle', n=48, cap_top=False, cap_bottom=False)
    lathe(p, [(z, r * 0.97) for z, r in bell], 'NozzleIn', n=48, cap_top=False, cap_bottom=False)
    # RCS の 4 組（四角い台に 4 つの口）
    for j in range(4):
        a = j * math.pi / 2 + math.radians(7.25)
        cx, cy = (RC + 0.12) * math.cos(a), (RC + 0.12) * math.sin(a)
        box(p, (cx, cy, -4.3), (0.25, 0.75, 1.0), 'SMWhite', rz=a)
        for dz in (-0.75, 0.75):
            disc_along(p, (cx, cy, -4.3 + dz * 0.75), (0, 0, 1 if dz > 0 else -1), [(0.0, 0.05), (0.18, 0.09)], 'Nozzle', n=10)
        for s in (-1, 1):
            tx, ty = -math.sin(a) * s, math.cos(a) * s
            disc_along(p, (cx + tx * 0.38, cy + ty * 0.38, -4.3), (tx, ty, 0), [(0.0, 0.05), (0.16, 0.08)], 'Nozzle', n=10)
    # 高利得アンテナ（4 つの皿）：後ろのはしから外へのびる腕の先
    a = math.radians(205)
    base = (RC * math.cos(a), RC * math.sin(a), -7.3)
    tip = ((RC + 1.6) * math.cos(a), (RC + 1.6) * math.sin(a), -8.3)
    tube(p, base, tip, 0.06, 'Aluminum', n=8)
    for j in range(4):
        b = j * math.pi / 2 + 0.785
        c = (tip[0] + 0.42 * math.cos(b) * math.sin(a), tip[1] - 0.42 * math.cos(b) * math.cos(a), tip[2] + 0.42 * math.sin(b))
        disc_along(p, c, (math.cos(a), math.sin(a), 0.25), [(-0.1, 0.0), (-0.04, 0.25), (0.0, 0.39)], 'Dish', n=20)
    # 機械船の上の、司令船とのつなぎ（銀の帯）
    lathe(p, [(z1, RC * 0.985), (z1 + 0.02, RC * 0.98)], 'Aluminum', n=72, cap_top=False, cap_bottom=False)


# ---- 月着陸船 -------------------------------------------------------------------------

DS_Z0, DS_Z1 = 1.40, 3.05  # 下降段の下と上
DS_W = 2.11  # 下降段の半分の幅（4.22 m の四角の角を落とした八角形）
DS_CUT = 0.75  # 角を落とす幅
LEG_R = 4.70  # 足の裏の中心の、まんなかからの距離（足の裏どうし 9.4 m）
HINGE = (2.05, 2.95)  # 脚の付け根（半径、高さ）


def octagon(w, cut):
    """角を落とした四角（+X、+Y …の辺が長い）"""
    pts = []
    for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        pts.append((sx * w, sy * (w - cut)))
        pts.append((sx * (w - cut), sy * w))
    # 反時計回りに並べる
    pts.sort(key=lambda q: math.atan2(q[1], q[0]))
    return pts


def descent_stage(p):
    ring = octagon(DS_W, DS_CUT)
    n = len(ring)
    o = len(p.verts)
    zs = [DS_Z0, DS_Z0 + 0.12, DS_Z1 - 0.1, DS_Z1]
    scale = [0.96, 1.0, 1.0, 0.97]
    for z, s in zip(zs, scale):
        for x, y in ring:
            p.verts.append((x * s, y * s, z))
    for k in range(len(zs) - 1):
        for i in range(n):
            a, b = o + k * n + i, o + k * n + (i + 1) % n
            p.faces.append([a, b, b + n, a + n])
            x0, y0 = ring[i]
            x1, y1 = ring[(i + 1) % n]
            diag = abs(abs(x0) - abs(x1)) > 0.1 and abs(abs(y0) - abs(y1)) > 0.1
            # 斜めの面（機器の区画）は黒い板と銀、長い面は金色のフィルム
            if k == 1:
                p.mats.append('Panel' if diag and i % 4 == 1 else ('Mylar' if diag else 'Kapton'))
            else:
                p.mats.append('KaptonDark')
    # 下のふた（黒）と上のふた（金色）
    for k, flip, mat in ((0, True, 'Black'), (len(zs) - 1, False, 'KaptonDark')):
        c = len(p.verts)
        p.verts.append((0, 0, zs[k]))
        for i in range(n):
            a, b = o + k * n + i, o + k * n + (i + 1) % n
            p.faces.append([c, b, a] if flip else [c, a, b])
            p.mats.append(mat)
    # 金色の面の上の、しわを感じさせる細い帯（毛布の継ぎ目）
    for i in range(n):
        x0, y0 = ring[i]
        x1, y1 = ring[(i + 1) % n]
        for t in (0.33, 0.66):
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            nx, ny = x * 1.004, y * 1.004
            box(p, (nx, ny, (DS_Z0 + DS_Z1) / 2), (0.03, 0.03, DS_Z1 - DS_Z0 - 0.2), 'KaptonDark', rz=math.atan2(y1 - y0, x1 - x0))
    # DPS エンジン（下に開いた大きなノズル。月の表面が近いので短め）
    bell = [(0.80, 0.80), (1.05, 0.74), (1.35, 0.6), (1.62, 0.45), (1.9, 0.33)]
    lathe(p, bell, 'Nozzle', n=40, cap_top=False, cap_bottom=False)
    lathe(p, [(z, r * 0.96) for z, r in bell], 'NozzleIn', n=40, cap_top=False, cap_bottom=False)
    # 前の玄関（ポーチ）：ハッチの下の台
    box(p, (0, DS_W + 0.35, DS_Z1 - 0.05), (1.05, 0.7, 0.06), 'Strut')
    tube(p, (-0.5, DS_W + 0.7, DS_Z1 - 0.05), (-0.5, DS_W + 0.7, DS_Z1 + 0.75), 0.02, 'Strut', n=6)
    tube(p, (0.5, DS_W + 0.7, DS_Z1 - 0.05), (0.5, DS_W + 0.7, DS_Z1 + 0.75), 0.02, 'Strut', n=6)
    tube(p, (-0.5, DS_W + 0.7, DS_Z1 + 0.75), (0.5, DS_W + 0.7, DS_Z1 + 0.75), 0.02, 'Strut', n=6)
    # 月面車（LRV）をたたんで積んでいる区画の目印（左前の斜めの面、銀の板）
    a = math.radians(135)
    box(p, ((DS_W - 0.35) * math.cos(a) * 1.06, (DS_W - 0.35) * math.sin(a) * 1.06, (DS_Z0 + DS_Z1) / 2), (0.05, 1.0, 1.2), 'Mylar', rz=a)


def leg(p, with_ladder, with_probe):
    """+X 向きの脚。原点は付け根（HINGE）。アプリで Z まわりに回して 4 本にする"""
    hx, hz = HINGE
    foot = (LEG_R - hx, 0.0, 0.32 - hz)
    # 主な柱（太い、付け根から足の裏へ）
    tube(p, (0, 0, 0), foot, 0.085, 'Strut', n=12)
    # 柱の下の、ばねの筒（少し太い）
    mid = (foot[0] * 0.72, 0, foot[2] * 0.72)
    tube(p, mid, (foot[0] * 0.95, 0, foot[2] * 0.95), 0.11, 'Kapton', n=12)
    # 2 本の支え：柱の下のほうから、下降段の下の角へ
    knee = (foot[0] * 0.66, 0, foot[2] * 0.66)
    for s in (-1, 1):
        tube(p, knee, (DS_W - 0.1 - hx, s * 1.05, DS_Z0 + 0.15 - hz), 0.05, 'Strut', n=8)
    # 展開の腕（支えの途中から下降段へ）
    tube(p, (knee[0] * 0.55, 0, knee[2] * 0.55 + (DS_Z0 + 0.15 - hz) * 0.45), (DS_W - 0.05 - hx, 0, DS_Z0 + 0.9 - hz), 0.035, 'Strut', n=6)
    # 足の裏（浅いお皿、直径 0.94 m）
    fx, fy, fz = foot
    lathe(p, [(fz - 0.32, 0.30), (fz - 0.26, 0.44), (fz - 0.16, 0.47), (fz - 0.1, 0.47), (fz - 0.02, 0.2)], 'Pad', n=28,
          center=(fx, fy), cap_top=True, cap_bottom=True)
    # 探り棒（1.7 m、足の裏の下へ）
    if with_probe:
        tube(p, (fx + 0.05, 0, fz - 0.3), (fx + 0.25, 0, fz - 0.32 - 1.7), 0.018, 'Strut', n=6)
    # はしご（前の脚だけ）
    if with_ladder:
        top = (0.05, 0, -0.1)
        bot = (foot[0] * 0.88, 0, foot[2] * 0.88)
        for s in (-1, 1):
            tube(p, (top[0], s * 0.27, top[2]), (bot[0], s * 0.27, bot[2]), 0.02, 'Strut', n=6)
        steps = 9
        for k in range(1, steps):
            t = k / steps
            x, z = top[0] + (bot[0] - top[0]) * t, top[2] + (bot[2] - top[2]) * t
            tube(p, (x, -0.27, z), (x, 0.27, z), 0.016, 'Strut', n=6)


def ascent_stage(p):
    """上昇段（乗員室）。本物は幅 4.3 m（左右のタンクのふくらみと RCS まで）、奥行き 4 m、高さ 2.8 m。
    前（+Y）の乗員室は直径 2.34 m の筒を角ばった板で包んだ形で、前の面に四角いハッチ、斜めの面に三角の窓 2 つ。
    その後ろに、左右へ大きくふくらむ酸化剤・燃料のタンクと、後ろへ張り出す機器室"""
    zb = DS_Z1 + 0.25  # 上昇段の下（下降段との間にすき間）
    FY = 1.60  # 前の面
    pts = []
    # 前の面（ハッチのある四角い面）と、その下の面取り
    for x in (-1.17, 1.17):
        pts += [(x, FY, zb + 0.15), (x, FY, zb + 1.25)]
        pts += [(x * 0.86, FY - 0.15, zb - 0.02)]
    # 窓の面（後ろへ倒れる）と、屋根の前
    for x in (-0.95, 0.95):
        pts.append((x, FY - 0.32, zb + 1.95))
    pts += [(-0.62, 0.95, zb + 2.25), (0.62, 0.95, zb + 2.25)]
    # 乗員室の横（角ばった板）
    for x in (-1.36, 1.36):
        pts += [(x, 0.85, zb + 0.1), (x, 0.85, zb + 1.85), (x, -0.3, zb + 0.05), (x, -0.3, zb + 2.05)]
    pts += [(-0.82, -0.3, zb + 2.45), (0.82, -0.3, zb + 2.45)]
    # 真ん中の区画（上昇用エンジンのおおい）から後ろ
    for x in (-1.22, 1.22):
        pts += [(x, -1.3, zb + 0.15), (x, -1.3, zb + 2.05)]
    pts += [(-0.72, -1.3, zb + 2.35), (0.72, -1.3, zb + 2.35), (-0.95, -1.3, zb - 0.0), (0.95, -1.3, zb - 0.0)]

    def paint(nrm, c):
        nx, ny, nz = nrm
        if ny > 0.3 and nz > 0.25 and c[2] > zb + 1.2:
            return 'Panel'  # 窓の面（黒い板）
        if nz > 0.8:
            return 'Panel'
        if nz < -0.7:
            return 'Black'
        return 'Inconel'

    hull(p, pts, paint)

    def win_pt(x, t, out=0.015):
        # 窓の面の上の点（t=0 が下のふち、1 が上のふち）
        return (x, FY - 0.32 * t + out, zb + 1.25 + 0.70 * t)

    # 三角の窓（左右）と、そのまわりの黒い枠
    for s in (-1, 1):
        a, b, c = win_pt(s * 0.2, 0.1), win_pt(s * 1.0, 0.1), win_pt(s * 0.3, 0.86)
        fa, fb, fc = win_pt(s * 0.12, 0.03, 0.008), win_pt(s * 1.1, 0.03, 0.008), win_pt(s * 0.24, 0.95, 0.008)
        if s > 0:
            p.add([fa, fb, fc], [[0, 1, 2]], 'Black')
            p.add([a, b, c], [[0, 1, 2]], 'Glass')
        else:
            p.add([fa, fc, fb], [[0, 1, 2]], 'Black')
            p.add([a, c, b], [[0, 1, 2]], 'Glass')
    # 窓の上のひさし（太陽よけ）
    box(p, (0, FY - 0.36, zb + 2.0), (1.9, 0.12, 0.05), 'Panel', rx=math.radians(-25))
    # ハッチ（前の面、四角）と取っ手
    quad(p, [(-0.43, FY + 0.006, zb + 0.28), (0.43, FY + 0.006, zb + 0.28), (0.43, FY + 0.006, zb + 1.1), (-0.43, FY + 0.006, zb + 1.1)], 'Panel')
    box(p, (0.3, FY + 0.03, zb + 0.7), (0.05, 0.04, 0.22), 'Strut')
    # ハッチの両わきの手すり（船外活動用）
    for x in (-0.62, 0.62):
        tube(p, (x, FY + 0.06, zb + 0.25), (x, FY + 0.06, zb + 1.15), 0.018, 'Strut', n=6)
    # 左右のタンクのふくらみ（左が酸化剤、右が燃料）。板で包んだ形
    for s in (-1, 1):
        cx, cy, cz = s * 1.62, -0.55, zb + 1.02
        tank = []
        for k, (dz, r) in enumerate(((-0.72, 0.32), (-0.48, 0.62), (0.0, 0.74), (0.48, 0.62), (0.72, 0.3))):
            for j in range(10):
                a = j * 2 * math.pi / 10 + 0.3
                tank.append((cx + math.cos(a) * r * 0.62, cy + math.sin(a) * r * 1.05, cz + dz))
        hull(p, tank, lambda nrm, c: 'Black' if nrm[2] < -0.65 else ('Panel' if nrm[2] > 0.8 else 'Inconel'))
    # 後ろの機器室（黒い箱に、銀の断熱フィルムの帯）
    box(p, (0, -1.85, zb + 1.15), (2.1, 1.15, 1.45), 'Panel')
    box(p, (0, -2.43, zb + 1.15), (1.9, 0.03, 1.25), 'Mylar')
    for k in range(4):
        box(p, (0, -2.46, zb + 0.62 + k * 0.35), (1.85, 0.03, 0.04), 'Black')
    for sx in (-1, 1):
        box(p, (sx * 1.07, -1.85, zb + 1.15), (0.04, 1.1, 1.3), 'Mylar')
    # 上の段とドッキングの筒（てっぺん）
    box(p, (0, -0.2, zb + 2.36), (1.45, 1.2, 0.22), 'Panel')
    lathe(p, [(zb + 2.35, 0.48), (zb + 2.75, 0.46), (zb + 2.8, 0.52), (zb + 2.86, 0.52)], 'Inconel', n=32, center=(0, -0.2))
    # ドッキングの受け（ドローグ：内側の暗いすり鉢）
    lathe(p, [(zb + 2.6, 0.08), (zb + 2.86, 0.44)], 'NozzleIn', n=32, center=(0, -0.2), cap_bottom=True, cap_top=False)
    # 上の窓（ドッキングのとき上を見る小窓）
    box(p, (-0.6, 0.35, zb + 2.29), (0.3, 0.3, 0.05), 'Glass')
    # RCS の 4 組（四すみ、斜め 45°）。それぞれ 4 つの口と、下の口の上の吹き付けよけの板
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy, cz = sx * 1.9, -0.2 + sy * 1.5, zb + 1.85
            tube(p, (sx * 1.2, cy * 0.75, cz - 0.15), (cx, cy, cz), 0.05, 'Strut', n=6)
            tube(p, (sx * 1.2, cy * 0.75, cz + 0.2), (cx, cy, cz), 0.035, 'Strut', n=6)
            box(p, (cx, cy, cz), (0.3, 0.3, 0.34), 'Inconel')
            for d in ((0, 0, 1), (0, 0, -1), (sx, 0, 0), (0, sy, 0)):
                c = (cx + d[0] * 0.15, cy + d[1] * 0.15, cz + d[2] * 0.17)
                disc_along(p, c, d, [(0.0, 0.045), (0.22, 0.09)], 'Nozzle', n=10)
            box(p, (cx, cy, cz - 0.6), (0.46, 0.46, 0.02), 'Mylar')
    # ランデブー用レーダーの皿（前の上）
    disc_along(p, (0.0, 0.62, zb + 2.62), (0, 0.6, 0.8), [(-0.08, 0.0), (-0.03, 0.22), (0.0, 0.34)], 'Dish', n=24)
    tube(p, (0.0, 0.5, zb + 2.3), (0.0, 0.6, zb + 2.58), 0.05, 'Strut', n=6)
    # S バンドの向きを変えられるアンテナ（右上の腕の先）
    tube(p, (1.0, -0.9, zb + 2.25), (1.45, -1.0, zb + 2.95), 0.035, 'Strut', n=6)
    disc_along(p, (1.45, -1.0, zb + 3.0), (-0.5, -0.4, 0.75), [(-0.08, 0.0), (-0.03, 0.24), (0.0, 0.36)], 'Dish', n=24)
    # VHF のアンテナ（細い棒 2 本）と、船外活動のアンテナ
    tube(p, (-0.9, -1.9, zb + 1.9), (-1.1, -2.25, zb + 2.85), 0.012, 'Strut', n=5)
    tube(p, (0.9, -1.9, zb + 1.9), (1.1, -2.25, zb + 2.85), 0.012, 'Strut', n=5)
    tube(p, (-0.5, -0.9, zb + 2.3), (-0.5, -0.9, zb + 3.1), 0.012, 'Strut', n=5)
    # 上昇段と下降段のつなぎ（4 本の短い柱）
    for sx in (-1, 1):
        for sy in (-1, 1):
            tube(p, (sx * 0.85, sy * 0.8, DS_Z1), (sx * 0.85, sy * 0.8, zb + 0.05), 0.05, 'Strut', n=6)


# ---- Blender の部品へ ------------------------------------------------------------------


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    col, rough, metal = COLORS[name]
    b = mat.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return mat


def make_object(name, part, origin=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(v[0] - origin[0], v[1] - origin[1], v[2] - origin[2]) for v in part.verts], [], part.faces)
    names = sorted(set(part.mats))
    for n in names:
        mesh.materials.append(material(n))
    idx = {n: i for i, n in enumerate(names)}
    for poly, m in zip(mesh.polygons, part.mats):
        poly.material_index = idx[m]
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # 箱で投影した UV（アプリで金色のフィルムに「しわ」の模様をのせる）
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        nx, ny, nz = (abs(c) for c in f.normal)
        for lp in f.loops:
            x, y, z = lp.vert.co
            if nz >= nx and nz >= ny:
                lp[uv].uv = (x * 0.5, y * 0.5)
            elif nx >= ny:
                lp[uv].uv = (y * 0.5, z * 0.5)
            else:
                lp[uv].uv = (x * 0.5, z * 0.5)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = origin
    bpy.context.scene.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    try:
        mesh.set_sharp_from_angle(angle=math.radians(30))
    except AttributeError:
        pass
    return obj


def look(cam, loc, tgt, lens):
    cam.location = loc
    d = [tgt[i] - loc[i] for i in range(3)]
    cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
    cam.data.lens = lens


def preview(objs):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 40
    scene.cycles.device = 'CPU'
    scene.render.resolution_x, scene.render.resolution_y = 1100, 900
    world = bpy.data.worlds.new('W')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.01, 0.01, 0.012, 1)
    bg.inputs['Strength'].default_value = 1.0
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 5.0
    sun.rotation_euler = (math.radians(62), 0, math.radians(-35))
    scene.collection.objects.link(sun)
    fill = bpy.data.objects.new('Fill', bpy.data.lights.new('Fill', 'SUN'))
    fill.data.energy = 0.6
    fill.rotation_euler = (math.radians(100), 0, math.radians(150))
    scene.collection.objects.link(fill)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    by = {o.name: o for o in objs}
    views = os.environ.get('VIEWS', 'lm,lmfront,csm').split(',')
    # 地面（LM の写真だけ）
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    ground = bpy.context.object
    gm = bpy.data.materials.new('Ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.32, 0.31, 0.3, 1)
    ground.data.materials.append(gm)
    lm = ['LMDescent', 'LMAscent', 'Leg0', 'Leg1', 'Leg2', 'Leg3']
    csm = ['CM', 'SM']
    for v in views:
        for o in objs:
            o.hide_render = False
        ground.hide_render = v not in ('lm', 'lmfront')
        if v in ('lm', 'lmfront'):
            for n in csm:
                by[n].hide_render = True
            look(cam, (11, -13, 5.5) if v == 'lm' else (2.5, 12.5, 3.2), (0, 0, 3.0), 38 if v == 'lm' else 30)
        elif v == 'csm':
            for n in lm:
                by[n].hide_render = True
            look(cam, (12, -9, -2.0), (0, 0, -4.6), 40)
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'apollo-{v}.png')
        bpy.ops.render.render(write_still=True)
        print('rendered', scene.render.filepath, flush=True)


def main():
    t0 = time.time()
    reset_scene()
    P = {n: Part() for n in PARTS}
    command_module(P['CM'])
    service_module(P['SM'])
    descent_stage(P['LMDescent'])
    ascent_stage(P['LMAscent'])
    objs = [make_object('CM', P['CM']), make_object('SM', P['SM']), make_object('LMDescent', P['LMDescent']), make_object('LMAscent', P['LMAscent'])]
    hx, hz = HINGE
    for j in range(4):
        # 前（+Y）の脚にはしご。探り棒は前の脚以外の 3 本（本物と同じ）
        a = j * math.pi / 2
        front = j == 1
        part = Part()
        leg(part, with_ladder=front, with_probe=not front)
        o = make_object(f'Leg{j}', part)
        o.location = (hx * math.cos(a), hx * math.sin(a), hz)
        o.rotation_euler = (0, 0, a)
        objs.append(o)
    nf = sum(len(o.data.polygons) for o in objs)
    print(f'{nf} faces ({time.time() - t0:.1f}s)', flush=True)
    if os.environ.get('PREVIEW'):
        preview(objs)
    if os.environ.get('EXPORT', '1') == '1':
        for o in bpy.data.objects:
            o.select_set(o.name in PARTS)
        bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=True, export_yup=True,
                                  export_materials='EXPORT')
        print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB', flush=True)


if __name__ == '__main__':
    main()
