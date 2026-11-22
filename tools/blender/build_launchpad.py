"""
月ミッションの打ち上げの場面の発射台（アポロ時代の 39A 発射台）を Blender で組み立てる。

本物の資料（NASA の写真 S72-54813、S72-54814、S72-55482、移動発射台の図面の寸法）に合わせる：

  - 移動発射台（ML）：49 × 41 × 7.6 m の 2 階建ての鋼の台。まん中に 13.7 m 四方の炎の穴。
    側面は太い枠と柱のあいだに板。甲板には 4 本の押さえの腕と、3 本の尾部の配管塔（TSM）。
    台は 6 本の台座と 4 本の支柱で、発射台の地面から 6 m ほど浮いている
  - 発射塔（LUT）：12 m 四方、甲板から 120 m。角の柱は太い箱、面ごとに K 字の筋かい、
    下の 20 m ほどは脚が外へ広がる。中に 2 本のエレベーター。9 本のスイングアーム（腕はトラス）。
    てっぺんにハンマーヘッドクレーン。夜はたくさんの小さな明かり
  - 照明塔：発射台のまわりに立つ細い柱。上に投光器の箱
  - 推進剤のタンク：液体酸素（北西）と液体水素（北東）の白い球。脚と、発射台へ向かう配管

発射台の盛り土（土台・炎の溝・斜面）は、アプリ側（launchSite.ts）で地面と一緒に作る。

座標は Blender のまま（Z が上、+Y が北）。build_saturn.py と同じ原点（ロケットの根元）。

実行:
  OUT=/tmp/ap/launchpad.glb /home/user/.bpyvenv/bin/python tools/blender/build_launchpad.py
  MODELS=launchpad SRC=/tmp/ap /home/user/.bpyvenv/bin/python tools/blender/bake_mission.py
  PREVIEW=1 VIEWS=night,base,top   確認の画像を PREVIEW_DIR に（サターンは public/models/saturn.glb を読み込む）
"""

import math
import os
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import build_saturn as S  # noqa: E402
from build_saturn import DECK, TOWER_W, TOWER_Y, Part, box, tube  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('OUT', '/tmp/ap/launchpad.glb')
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp/padprev')

# 発射台で使う材質（色、粗さ、金属らしさ）
S.COLORS.update({
    # 発射塔の赤（写真では、照明の下でだいだいがかった赤）
    'Red': ((0.5, 0.075, 0.022), 0.6, 0.0),
    # 移動発射台の灰色の塗装と、甲板の鉄板
    'Grey': ((0.5, 0.51, 0.5), 0.65, 0.0),
    'Deck': ((0.34, 0.34, 0.33), 0.8, 0.0),
    # 台座（コンクリート）
    'Concrete': ((0.55, 0.54, 0.5), 0.9, 0.0),
    # 推進剤のタンクの白い塗装
    'Tank': ((0.8, 0.8, 0.78), 0.5, 0.0),
    # 配管（銀色の断熱）
    'Pipe': ((0.6, 0.6, 0.6), 0.4, 0.6),
})

ML_L, ML_W, ML_H = 49.0, 41.0, 7.6  # 東西・南北・高さ
HOLE = 13.7 / 2  # 炎の穴（半分）
ML_TOP = DECK
ML_BOT = DECK - ML_H
PAD_Z = -13.8  # 発射台の地面（アプリの GROUND_Y と同じ）
TOP = 120.0  # 発射塔の柱のてっぺん


def beam(p, a, b, w, h, mat):
    """a から b への四角い梁（幅 w、高さ h）。水平でも斜めでも"""
    ax, ay, az = a
    dx, dy, dz = b[0] - ax, b[1] - ay, b[2] - az
    L = math.sqrt(dx * dx + dy * dy + dz * dz)
    u = (dx / L, dy / L, dz / L)
    ref = (0, 0, 1) if abs(u[2]) < 0.9 else (1, 0, 0)
    v = (u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0])
    m = math.sqrt(sum(c * c for c in v))
    v = tuple(c / m for c in v)
    wv = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    verts = []
    for c in (a, b):
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            verts.append(tuple(c[i] + v[i] * sx * w / 2 + wv[i] * sy * h / 2 for i in range(3)))
    faces = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [0, 3, 2, 1], [4, 5, 6, 7]]
    p.add(verts, faces, mat)


def sphere(p, c, r, mat, nu=24, nv=12):
    verts, faces = [], []
    for j in range(nv + 1):
        t = math.pi * j / nv
        for i in range(nu):
            f = 2 * math.pi * i / nu
            verts.append((c[0] + r * math.sin(t) * math.cos(f), c[1] + r * math.sin(t) * math.sin(f), c[2] + r * math.cos(t)))
    for j in range(nv):
        for i in range(nu):
            a, b = j * nu + i, j * nu + (i + 1) % nu
            faces.append([a, b, b + nu, a + nu])
    p.add(verts, faces, mat)


# ---- 移動発射台 -------------------------------------------------------------------


def hold_hinge(name):
    a = (int(name[4:]) - 1) * math.pi / 2 + math.pi / 4
    r = S.R1 + 5.7
    return (r * math.cos(a), r * math.sin(a), ML_TOP + 0.8)


def launcher(p, holds):
    hx, hy = ML_L / 2, ML_W / 2
    zc = (ML_TOP + ML_BOT) / 2
    # 炎の穴のまわりの 4 つの塊（中は鉄骨の 2 階建て。外から見えるのは側面の板）
    box(p, (-(hx + HOLE) / 2, 0, zc), (hx - HOLE, ML_W, ML_H), 'Grey')
    box(p, ((hx + HOLE) / 2, 0, zc), (hx - HOLE, ML_W, ML_H), 'Grey')
    box(p, (0, -(hy + HOLE) / 2, zc), (2 * HOLE, hy - HOLE, ML_H), 'Grey')
    box(p, (0, (hy + HOLE) / 2, zc), (2 * HOLE, hy - HOLE, ML_H), 'Grey')
    # 甲板の鉄板（少し暗い）
    for sx in (-1, 1):
        box(p, (sx * (hx + HOLE) / 2, 0, ML_TOP + 0.05), (hx - HOLE - 0.6, ML_W - 0.6, 0.1), 'Deck')
    for sy in (-1, 1):
        box(p, (0, sy * (hy + HOLE) / 2, ML_TOP + 0.05), (2 * HOLE, hy - HOLE - 0.6, 0.1), 'Deck')
    # 側面：太い横の枠（上・中・下）と、4 m ごとの柱。板は少し奥に引っこんで見える
    for z in (ML_TOP - 0.45, zc, ML_BOT + 0.45):
        for sy in (-1, 1):
            box(p, (0, sy * (hy + 0.25), z), (ML_L + 0.5, 0.5, 0.9), 'Grey')
        for sx in (-1, 1):
            box(p, (sx * (hx + 0.25), 0, z), (0.5, ML_W + 0.5, 0.9), 'Grey')
    for i in range(13):
        x = -hx + i * ML_L / 12
        for sy in (-1, 1):
            box(p, (x, sy * (hy + 0.2), zc), (0.5, 0.4, ML_H), 'Grey')
    for i in range(11):
        y = -hy + i * ML_W / 10
        for sx in (-1, 1):
            box(p, (sx * (hx + 0.2), y, zc), (0.4, 0.5, ML_H), 'Grey')
    # 側面の扉と通気口（暗い四角）
    for x in (-17.0, -6.0, 9.0, 19.0):
        box(p, (x, -hy - 0.05, ML_BOT + 1.6), (2.2, 0.2, 2.6), 'Dark')
    for y in (-12.0, 4.0, 14.0):
        box(p, (hx + 0.05, y, ML_BOT + 1.6), (0.2, 2.2, 2.6), 'Dark')
        box(p, (-hx - 0.05, y, zc + 1.2), (0.2, 3.0, 1.0), 'Dark')
    # 穴の内側の壁（暗い鋼）と、炎よけの板
    for sx in (-1, 1):
        box(p, (sx * (HOLE - 0.1), 0, zc), (0.2, 2 * HOLE, ML_H - 0.2), 'Dark')
        box(p, (0, sx * (HOLE - 0.1), zc), (2 * HOLE, 0.2, ML_H - 0.2), 'Dark')
    # 甲板の手すり
    for sy in (-1, 1):
        y = sy * (hy - 0.3)
        for z in (ML_TOP + 0.55, ML_TOP + 1.1):
            tube(p, (-hx + 0.3, y, z), (hx - 0.3, y, z), 0.04, 'Grey', n=4)
        for i in range(25):
            x = -hx + 0.3 + i * (ML_L - 0.6) / 24
            tube(p, (x, y, ML_TOP), (x, y, ML_TOP + 1.1), 0.04, 'Grey', n=4)
    for sx in (-1, 1):
        x = sx * (hx - 0.3)
        for z in (ML_TOP + 0.55, ML_TOP + 1.1):
            tube(p, (x, -hy + 0.3, z), (x, hy - 0.3, z), 0.04, 'Grey', n=4)
    # 押さえの腕（4 本）：台の上の台座、ロケットのほうへ斜めに伸びる腕、先の爪
    # 腕は部品 Hold1〜Hold4（台座の外側の下を軸に、離昇で外へ倒れて開く）
    R1 = S.R1
    pad = p
    for j in range(4):
        a = j * math.pi / 2 + math.pi / 4
        c, s = math.cos(a), math.sin(a)
        r0, r1 = R1 + 4.2, R1 + 0.5
        box(pad, (r0 * c, r0 * s, ML_TOP + 0.4), (3.4, 3.4, 0.8), 'Grey', rz=a)
        p = holds[f'Hold{j + 1}'] = Part()
        box(p, (r0 * c, r0 * s, ML_TOP + 1.3), (3.0, 3.0, 1.0), 'Grey', rz=a)
        beam(p, (r0 * c, r0 * s, ML_TOP + 1.6), (r1 * c, r1 * s, ML_TOP + 3.4), 1.4, 1.6, 'Grey')
        box(p, (r1 * c, r1 * s, ML_TOP + 3.4), (1.2, 1.6, 1.2), 'Dark', rz=a)
    p = pad
    # 尾部の配管塔（TSM）3 本：鉄骨の塔（中に配管の箱）と、ロケットへ伸びる先のフード
    for ang in (math.radians(100), math.radians(200), math.radians(-20)):
        c, s = math.cos(ang), math.sin(ang)
        r, h, hw = R1 + 5.6, 9.4, 1.3
        t = (-s, c)  # 塔の横の向き
        corners = [(r * c + (u * c) + v * t[0], r * s + (u * s) + v * t[1]) for u, v in ((-hw, -hw), (hw, -hw), (hw, hw), (-hw, hw))]
        for (x, y) in corners:
            beam(p, (x, y, ML_TOP), (x, y, ML_TOP + h), 0.22, 0.22, 'Grey')
        for k in range(6):
            z = ML_TOP + 0.3 + k * h / 5.2
            for j in range(4):
                a0, a1 = corners[j], corners[(j + 1) % 4]
                beam(p, (a0[0], a0[1], z), (a1[0], a1[1], z), 0.12, 0.16, 'Grey')
                if k < 5:
                    beam(p, (a0[0], a0[1], z), (a1[0], a1[1], z + h / 5.2), 0.08, 0.08, 'Grey')
        box(p, (r * c, r * s, ML_TOP + h * 0.45), (1.1, 1.1, h * 0.9), 'Dark', rz=ang)  # 中の配管の箱
        box(p, ((r - 1.9) * c, (r - 1.9) * s, ML_TOP + h - 0.7), (1.6, 2.2, 1.4), 'Grey', rz=ang)  # 先のフード
        box(p, (r * c, r * s, ML_TOP + h + 0.2), (2.8, 2.8, 0.25), 'Grey', rz=ang)  # 屋根
    # 甲板の機械の箱（いくつか）
    for (x, y, sx, sy, h) in ((-18.0, -14.0, 6.0, 4.0, 2.2), (17.0, -15.0, 5.0, 3.0, 1.8), (-19.0, 10.0, 4.0, 6.0, 2.6),
                              (19.0, 9.0, 3.0, 5.0, 2.0), (-8.0, -17.0, 3.0, 2.0, 1.4)):
        box(p, (x, y, ML_TOP + h / 2), (sx, sy, h), 'Grey')
        box(p, (x, y - sy / 2 - 0.02, ML_TOP + h * 0.4), (sx * 0.5, 0.06, h * 0.5), 'Dark')
    # 甲板の小さな明かり
    for x in (-23.0, -8.0, 8.0, 23.0):
        for y in (-19.5, 19.5):
            box(p, (x, y, ML_TOP + 0.4), (0.5, 0.3, 0.3), 'Lamp')
    # 台を支える 6 本の台座と 4 本の支柱（コンクリートの台に鋼の受け）
    for x in (-18.0, 0.0, 18.0):
        for y in (-15.0, 15.0):
            h = ML_BOT - PAD_Z
            box(p, (x, y, PAD_Z + h * 0.35), (4.2, 4.2, h * 0.7), 'Concrete')
            box(p, (x, y, PAD_Z + h * 0.85), (2.6, 2.6, h * 0.3), 'Grey')
    for x in (-22.0, 22.0):
        for y in (-9.0, 9.0):
            box(p, (x, y, (PAD_Z + ML_BOT) / 2), (1.6, 1.6, ML_BOT - PAD_Z), 'Grey')
    # 台の下の明かり（写真では、甲板の下が明るく光って見える）
    for x in (-12.0, 12.0):
        for y in (-15.0, 15.0):
            box(p, (x, y, ML_BOT - 0.3), (0.8, 0.4, 0.3), 'Lamp')


# ---- 発射塔 -----------------------------------------------------------------------


ARM_Z = [18.0, 31.0, 45.0, 62.0, 72.0, 80.0, 88.0, 96.0]
ARM_HINGE_X = -1.4  # 腕の回る軸（塔のロケット側の面の、西の角寄り）


def arm_hinge(name):
    z = ARM_Z[int(name[3:]) - 1] if name != 'Arm9' else 99.0
    return (ARM_HINGE_X, TOWER_Y - TOWER_W / 2, z)


def tower(p, arms):
    w = TOWER_W / 2
    cy = TOWER_Y
    flare = 20.0  # 下の脚が外へ広がる高さ
    spread = 4.5  # 甲板での広がり（m）

    def corner(k, z):
        sx = -1 if k in (0, 3) else 1
        sy = -1 if k in (0, 1) else 1
        e = w + (spread * (1 - (z - ML_TOP) / flare) if z < ML_TOP + flare else 0.0)
        return (sx * e, cy + sy * e, z)

    # 角の柱：下の広がる脚と、上のまっすぐな柱（太い箱）
    for k in range(4):
        beam(p, corner(k, ML_TOP), corner(k, ML_TOP + flare), 0.9, 0.9, 'Red')
        beam(p, corner(k, ML_TOP + flare), corner(k, TOP), 0.7, 0.7, 'Red')
    levels = [ML_TOP + 6.0 * i for i in range(int((TOP - ML_TOP) / 6.0) + 1)]
    for i, z in enumerate(levels):
        cs = [corner(k, z) for k in range(4)]
        for k in range(4):
            a, b = cs[k], cs[(k + 1) % 4]
            beam(p, a, b, 0.35, 0.55, 'Red')
            if i + 1 < len(levels):
                z2 = levels[i + 1]
                a2, b2 = corner(k, z2), corner((k + 1) % 4, z2)
                mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z)
                # K 字の筋かい（下の梁のまん中から、上の角へ）
                beam(p, mid, a2, 0.18, 0.18, 'Red')
                beam(p, mid, b2, 0.18, 0.18, 'Red')
                # 細い中柱
                mid2 = ((a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2, z2)
                beam(p, mid, mid2, 0.16, 0.16, 'Red')
        # 床（鉄の格子は暗く見える）
        e = abs(cs[0][0])
        box(p, (0, cy, z + 0.1), (2 * e - 0.4, 2 * e - 0.4, 0.15), 'Dark' if i % 2 else 'Grey')
        # 夜の明かり：各階の角と、ロケット側の面
        if i % 2 == 1 or i < 3:
            for k in (0, 1):
                x, y, _ = cs[k]
                box(p, (x * 1.04, y - 0.4, z + 1.0), (0.4, 0.2, 0.25), 'Lamp')
            box(p, (0, cy - e - 0.3, z + 2.4), (0.5, 0.2, 0.25), 'Lamp')
    # エレベーター（2 本）と階段の箱
    # 本物の塔の中のエレベーターは、網の囲いの中（外からはほとんど透けて、暗い影に見える）
    for x in (-2.4, 2.4):
        for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            beam(p, (x + dx, cy + 1.6 + dy, ML_TOP), (x + dx, cy + 1.6 + dy, TOP), 0.18, 0.18, 'Grey')
        box(p, (x, cy + 1.6, (ML_TOP + TOP) / 2), (1.6, 1.6, TOP - ML_TOP), 'Dark')
    # てっぺん：機械室、クレーン（ハンマーヘッド）、避雷針
    box(p, (0, cy, TOP + 1.4), (TOWER_W + 0.6, TOWER_W + 0.6, 2.8), 'Red')
    box(p, (0, cy, TOP + 3.6), (4.0, 4.0, 1.6), 'Red')
    beam(p, (0, cy + 9.0, TOP + 5.4), (0, cy - 18.0, TOP + 5.4), 1.8, 1.6, 'Red')
    for k in range(6):
        y = cy + 8.0 - k * 4.4
        beam(p, (-0.9, y, TOP + 4.6), (0.9, y - 2.2, TOP + 6.2), 0.12, 0.12, 'Red')
    box(p, (0, cy + 9.6, TOP + 5.0), (2.6, 2.4, 2.4), 'Grey')  # 重り
    box(p, (0, cy - 17.6, TOP + 4.2), (0.6, 0.6, 1.4), 'Dark')  # 吊り具
    tube(p, (0, cy, TOP + 6.2), (0, cy, TOP + 12.0), 0.15, 'Red', n=6)
    box(p, (0, cy - 18.0, TOP + 6.4), (0.4, 0.4, 0.4), 'NavRed')
    box(p, (0, cy, TOP + 12.2), (0.5, 0.5, 0.5), 'NavRed')
    # スイングアーム（本物は 9 本）。トラスの箱の腕、ロケット側の先に機械の箱
    # 腕は 1 本ずつ別の部品（Arm1〜Arm8、乗組員の通路は Arm9）。塔の西の角を軸に、離昇で東へ 90 度回って塔の面に退く
    for i, z in enumerate(ARM_Z):
        p = arms[f'Arm{i + 1}'] = Part()
        y0 = cy - w
        y1 = S.rocket_radius(z) + 0.8
        hw, hh = 1.4, 1.1
        for sx in (-1, 1):
            for sz in (-1, 1):
                beam(p, (sx * hw, y0, z + sz * hh), (sx * hw, y1, z + sz * hh), 0.22, 0.22, 'Red')
        n = max(2, int((y0 - y1) / 2.0))
        for k in range(n):
            ya = y0 - (y0 - y1) * k / n
            yb = y0 - (y0 - y1) * (k + 1) / n
            for sx in (-1, 1):
                beam(p, (sx * hw, ya, z - hh), (sx * hw, yb, z + hh), 0.12, 0.12, 'Red')
            beam(p, (-hw, ya, z + hh), (hw, yb, z + hh), 0.1, 0.1, 'Red')
        box(p, (0, (y0 + y1) / 2, z - hh + 0.1), (2 * hw, y0 - y1, 0.12), 'Dark')  # 通路の床
        box(p, (0, y1 + 0.6, z), (3.4, 1.2, 2.6), 'Grey')  # 先の機械の箱
        box(p, (0, y1 + 0.9, z + 1.6), (1.8, 0.8, 0.6), 'Grey')
        box(p, (hw + 0.2, y0 - 1.0, z + 1.4), (0.3, 0.2, 0.2), 'Lamp')
    # いちばん上：司令船へ乗り込む通路と白い部屋（ホワイトルーム）
    zc = 99.0
    y1 = S.RS + 1.6
    p = arms['Arm9'] = Part()
    box(p, (0, (cy - w + y1) / 2, zc), (2.2, cy - w - y1, 2.4), 'Grey')
    box(p, (0, y1, zc), (3.4, 2.6, 3.0), 'White')
    box(p, (0, y1 - 1.0, zc + 0.2), (1.6, 0.6, 1.4), 'Lamp')


# ---- まわりの設備 -------------------------------------------------------------------


def poles(p):
    """照明塔：盛り土のふちに立つ細い柱。上に投光器の箱"""
    spots = [(-70, -60), (-70, 0), (-70, 60), (70, -60), (70, 0), (70, 60), (-30, 75), (30, 75), (-30, -75), (30, -75)]
    for (x, y) in spots:
        h = 24.0
        tube(p, (x, y, PAD_Z), (x, y, PAD_Z + h), 0.25, 'Grey', n=6)
        box(p, (x, y, PAD_Z + h + 0.5), (2.2, 0.8, 1.0), 'Grey')
        for k in (-0.6, 0.0, 0.6):
            box(p, (x + k, y - 0.42 * math.copysign(1, y or 1), PAD_Z + h + 0.5), (0.45, 0.1, 0.45), 'Lamp')


def tanks(p):
    """液体酸素（北西）と液体水素（北東）の球のタンク。本物は発射台から 500 m ほど離れている"""
    land = PAD_Z - 12.0
    for (x, y, r) in ((-420.0, 330.0, 10.5), (420.0, 350.0, 9.8)):
        cz = land + r + 6.0
        sphere(p, (x, y, cz), r, 'Tank')
        for k in range(8):
            a = 2 * math.pi * k / 8
            tube(p, (x + r * 0.95 * math.cos(a), y + r * 0.95 * math.sin(a), land), (x + r * 0.7 * math.cos(a), y + r * 0.7 * math.sin(a), cz), 0.35, 'Grey', n=6)
        tube(p, (x, y, cz + r), (x, y, cz + r + 3.0), 0.6, 'Grey', n=8)
        box(p, (x, y - r - 0.3, cz), (0.6, 0.2, 0.4), 'Lamp')
        # 発射台へ向かう配管（地面すれすれ）
        tube(p, (x, y - r, land + 1.2), (x * 0.25, 40.0, land + 1.2), 0.5, 'Pipe', n=8)
        tube(p, (x * 0.25, 40.0, land + 1.2), (x * 0.06, 28.0, PAD_Z + 1.0), 0.5, 'Pipe', n=8)
        for k in range(10):
            t = k / 9
            px, py = x + (x * 0.25 - x) * t, (y - r) + (40.0 - (y - r)) * t
            box(p, (px, py, land + 0.5), (1.4, 0.4, 1.0), 'Concrete')


# ---- 確認の画像 ---------------------------------------------------------------------


def preview(objs):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = int(os.environ.get('SAMPLES', '32'))
    scene.cycles.device = 'CPU'
    world = bpy.data.worlds.new('W')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.004, 0.006, 0.014, 1)
    bg.inputs['Strength'].default_value = 1.0
    # サターン（色だけ）を build_saturn.py の形で並べる
    R = {n: Part() for n in S.PARTS}
    S.stage1(R['S1'])
    S.stage2(R['S2'], R['Ring'])
    S.stage3(R['S3'])
    S.csm(R['CSM'])
    S.les(R['LES'])
    for n in S.PARTS:
        S.make_object(n, R[n])
    bpy.ops.mesh.primitive_plane_add(size=240, location=(0, 0, PAD_Z))
    g = bpy.context.object
    gm = bpy.data.materials.new('Ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.3, 0.29, 0.27, 1)
    g.data.materials.append(gm)
    for k, (x, y) in enumerate(((-150, -170), (130, -200), (-200, 130))):
        L = bpy.data.objects.new(f'Xe{k}', bpy.data.lights.new(f'Xe{k}', 'SPOT'))
        L.data.energy = 3.0e6
        L.data.spot_size = math.radians(26)
        L.data.color = (0.85, 0.9, 1.0)
        L.location = (x, y, PAD_Z - 8)
        d = (-x, -y, 55 - L.location[2])
        L.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
        scene.collection.objects.link(L)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    shots = {
        'night': ((-150, -330, 10), (0, 10, 50), 40),
        'base': ((-40, -62, 4), (0, 4, 2), 30),
        'top': ((25, -40, 112), (0, 15, 100), 30),
        'arm': ((-28, -10, 92), (0, 10, 88), 35),
    }
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    for v in os.environ.get('VIEWS', 'night,base').split(','):
        loc, tgt, lens = shots[v]
        cam.location = loc
        d = [tgt[i] - loc[i] for i in range(3)]
        cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
        cam.data.lens = lens
        scene.render.resolution_x, scene.render.resolution_y = (700, 1000) if v == 'night' else (1000, 700)
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'pad-{v}.png')
        bpy.ops.render.render(write_still=True)
        print('rendered', scene.render.filepath, flush=True)


def main():
    t0 = time.time()
    S.reset_scene()
    P = {n: Part() for n in ('Tower', 'Pad', 'Site')}
    arms, holds = {}, {}
    tower(P['Tower'], arms)
    launcher(P['Pad'], holds)
    poles(P['Site'])
    tanks(P['Site'])
    objs = [S.make_object(n, P[n]) for n in P]
    # 動く部品：軸の位置を部品の原点にする（アプリでは、この原点のまわりに回す）
    for n, part in list(arms.items()) + list(holds.items()):
        o = S.make_object(n, part)
        hinge = arm_hinge(n) if n.startswith('Arm') else hold_hinge(n)
        for v in o.data.vertices:
            v.co.x -= hinge[0]
            v.co.y -= hinge[1]
            v.co.z -= hinge[2]
        o.location = hinge
        objs.append(o)
    nf = sum(len(o.data.polygons) for o in objs)
    print(f'{nf} faces ({time.time() - t0:.1f}s)', flush=True)
    if os.environ.get('EXPORT', '1') == '1':
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        for o in bpy.data.objects:
            o.select_set(o in objs)
        bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=True,
                                  export_yup=True, export_materials='EXPORT')
        print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB', flush=True)
    if os.environ.get('PREVIEW'):
        preview(objs)


if __name__ == '__main__':
    main()
