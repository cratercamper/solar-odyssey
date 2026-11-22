"""
アポロ 15〜17 号の月面車 LRV（Lunar Roving Vehicle）を、本物の寸法で Blender で組み立てる。
アポロ17号の追体験（章7 月面の探検）で運転する。NASA の公開資料（LRV Operations Handbook、
写真 AS17-147-22526 など）の形と寸法にそろえた：
  - 全長 3.1 m、軸距 2.29 m、輪距 1.83 m、車輪の直径 81.8 cm・幅 23 cm、地上高 36 cm
  - 車台：アルミの管を組んだ 3 つの部分（前・中・後ろ）。床は格子の板
  - 車輪：亜鉛めっきのピアノ線を編んだ網のタイヤに、チタンの山形の板。ハブの中にモーター
  - 泥よけ：車輪の上の、うすい灰色の板（前後に伸ばす板つき）
  - 座席 2 つ：管のわくにナイロンのベルト。足のせ・ひじかけ・ベルト
  - 運転：座席のあいだの T 字の操縦かん、前の計器盤（方位・距離・電池の目盛りと、影で太陽の向きを見る板）
  - 前：電池 2 つと白い放熱板のふた、通信の箱（LCRU）、傘のような高利得アンテナ、らせんの低利得アンテナ、
    テレビカメラ（GCTA）を前の柱の上に
  - 後ろ：道具の棚（はさみ・スコップ・熊手・試料の袋）

座標は Blender のまま（Z が上、前方が +Y、右が +X）。単位はメートル。地面が z=0。
車輪は別のオブジェクト Wheel_{F,R}{R,L}（原点が車軸）。そのほかはまとめて Body。
テレビカメラは Camera（原点が首の回る軸）。three.js 側（src/components/surface/LunarRover.tsx）は数字を合わせている。

実行（bpy の venv）:
  /home/user/.bpyvenv/bin/python tools/blender/build_lrv.py
  PREVIEW=1     確認用の画像（VIEWS=hero,rear,side,front,top,wheel）を PREVIEW_DIR に
  BAKE=1        質感を焼き込む（TEX=2048、SUPER=2、AO_SAMPLES=48）
  EXPORT=1      public/models/lrv.glb に書き出す（そのあと node tools/glb/compress.mjs）
"""

import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

import build_crew_rover as cr  # noqa: E402  形を作る道具（rbox・cyl・bar・torus・obox・mesh_obj）を借りる

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.environ.get('OUT', os.path.join(ROOT, 'public', 'models', 'lrv.glb'))
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')
SUPER = int(os.environ.get('SUPER', '2'))

# 車輪（右前）。LunarRover.tsx の WHEELS / WHEEL_R と同じ数字
WHEEL_R = 0.409
WHEEL_W = 0.23
WHEEL_X = 0.915
WHEEL_Y = {'F': 1.145, 'R': -1.145}

MATS = ['Alu', 'Floor', 'Fender', 'Tyre', 'Lug', 'Hub', 'Web', 'White', 'Mirror', 'Dark', 'Mesh', 'Gold', 'Lens', 'Bag', 'Orange']
PALETTE = {  # 色, ラフネス, メタリック
    'Alu': ('#c4c7cb', 0.32, 1.0),
    'Floor': ('#7d8085', 0.55, 0.6),
    'Fender': ('#b9b6ad', 0.5, 0.0),
    'Tyre': ('#a3a7ac', 0.35, 1.0),
    'Lug': ('#8f9398', 0.38, 1.0),
    'Hub': ('#55595f', 0.45, 0.6),
    'Web': ('#6c7787', 0.85, 0.0),
    'White': ('#e6e4de', 0.55, 0.0),
    'Mirror': ('#d8dde2', 0.12, 1.0),
    'Dark': ('#24272c', 0.5, 0.2),
    'Mesh': ('#c9a54e', 0.4, 1.0),
    'Gold': ('#c8942c', 0.32, 1.0),
    'Lens': ('#0a0f16', 0.05, 0.4),
    'Bag': ('#d6d1c4', 0.75, 0.0),
    'Orange': ('#c86a22', 0.5, 0.0),
}
# 借りた道具は cr の材質表を使うので、こちらの表に入れかえる
cr.MATS = MATS
cr.PALETTE = PALETTE
PARTS = cr.PARTS
rbox, cyl, torus, obox, sphere = cr.rbox, cr.cyl, cr.torus, cr.obox, cr.sphere


def bar(a, b, r, mat='Alu', group='Body', n=8):
    return cr.cyl(a, b, r, mat, n=n, group=group)

# 車台の高さ（m）：わくの管の高さと、床の高さ
RAIL_Z = 0.56
FLOOR_Z = 0.42
RAIL_X = 0.56


def V(x, y, z):
    return Vector((x, y, z))


def chassis():
    """3 つに折れる車台：左右の長い管、横の管、斜めの補強、床の板"""
    r = 0.022
    for sx in (-1, 1):
        x = sx * RAIL_X
        # 長い管（前の端と後ろの端は少し下がる）
        bar(V(x, -1.5, RAIL_Z - 0.04), V(x, -0.75, RAIL_Z), r)
        bar(V(x, -0.75, RAIL_Z), V(x, 0.75, RAIL_Z), r)
        bar(V(x, 0.75, RAIL_Z), V(x, 1.5, RAIL_Z - 0.04), r)
        # 下の管（床を支える）
        bar(V(x * 0.92, -1.2, FLOOR_Z - 0.03), V(x * 0.92, 1.2, FLOOR_Z - 0.03), r * 0.8)
        for y in (-1.2, -0.75, 0.0, 0.75, 1.2):
            bar(V(x, y, RAIL_Z), V(x * 0.92, y, FLOOR_Z - 0.03), r * 0.7)
        # 斜めの補強
        for y0, y1 in ((-0.75, 0.0), (0.0, 0.75)):
            bar(V(x, y0, RAIL_Z), V(x * 0.92, y1, FLOOR_Z - 0.03), r * 0.6)
        # 折れ目のちょうつがい
        for y in (-0.75, 0.75):
            cyl(V(x - 0.035, y, RAIL_Z), V(x + 0.035, y, RAIL_Z), 0.035, 'Alu', n=16)
    for y in (-1.5, -1.2, -0.75, 0.0, 0.75, 1.2, 1.5):
        z = RAIL_Z - (0.04 if abs(y) > 1.4 else 0)
        bar(V(-RAIL_X, y, z), V(RAIL_X, y, z), r)
    # 床：中の部分（座席の下と足のせ）は格子の板。前と後ろは電池・道具の台
    rbox(V(0, 0.0, FLOOR_Z), V(2 * RAIL_X * 0.9, 1.5, 0.02), 'Floor', bevel=0.006)
    rbox(V(0, 1.12, RAIL_Z - 0.01), V(2 * RAIL_X * 0.95, 0.68, 0.02), 'Floor', bevel=0.006)
    rbox(V(0, -1.12, RAIL_Z - 0.01), V(2 * RAIL_X * 0.95, 0.68, 0.02), 'Floor', bevel=0.006)
    # 足のせ（斜めの板）
    for sx in (-1, 1):
        obox(V(sx * 0.32, 0.62, FLOOR_Z + 0.07), (1, 0, 0), (0, math.cos(0.5), math.sin(0.5)), (0, -math.sin(0.5), math.cos(0.5)), 0.2, 0.12, 0.01, 'Floor')


def suspension():
    """二重の腕（上下）とねじり棒、ダンパー。腕は車台から車輪のハブへ"""
    for k, wy in WHEEL_Y.items():
        for sx in (-1, 1):
            hub = V(sx * (WHEEL_X - WHEEL_W / 2 - 0.05), wy, WHEEL_R)
            sgn = -1 if wy > 0 else 1  # 腕の根もとは車の中ほどの向き
            for dz, base_y in ((0.07, 0.32), (-0.06, 0.3)):
                a = V(sx * RAIL_X, wy + sgn * base_y, RAIL_Z - 0.02 + dz * 0.4)
                bar(a, hub + V(0, 0, dz), 0.022)
                bar(V(sx * RAIL_X, wy + sgn * (base_y - 0.18), RAIL_Z - 0.02 + dz * 0.4), hub + V(0, 0, dz), 0.016)
            # ねじり棒の筒（車台の横）
            cyl(V(sx * RAIL_X, wy + sgn * 0.42, RAIL_Z - 0.02), V(sx * RAIL_X, wy + sgn * 0.12, RAIL_Z - 0.02), 0.03, 'Hub', n=14)
            # ダンパー（斜めの筒）
            top = V(sx * (RAIL_X - 0.02), wy + sgn * 0.5, RAIL_Z + 0.08)
            cyl(top, hub + V(0, sgn * 0.05, 0.1), 0.028, 'Hub', n=12)
            # かじ取りの腕（前後とも動く）と、ハブの台（車輪とは別に車体に付く、動かない部分）
            cyl(hub - V(sx * 0.07, 0, 0), hub + V(sx * 0.02, 0, 0), 0.11, 'Hub', n=24, bevel=0.01)


def fender(sx, wy):
    """泥よけ：車輪の上の弧の板と、前後に伸ばす板"""
    c = V(sx * WHEEL_X, wy, WHEEL_R)
    R = WHEEL_R + 0.055
    w = WHEEL_W + 0.08
    n = 18
    a0, a1 = -0.92, 0.92  # 真上から前後へ
    verts, faces = [], []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        for s in (-1, 1):
            for rr in (R, R + 0.012):
                verts.append(tuple(c + V(s * w / 2, math.sin(a) * rr, math.cos(a) * rr)))
    for i in range(n):
        b = i * 4
        nb = b + 4
        faces += [[b + 0, nb + 0, nb + 2, b + 2], [b + 1, b + 3, nb + 3, nb + 1], [b + 0, b + 1, nb + 1, nb + 0], [b + 2, nb + 2, nb + 3, b + 3]]
    cr.mesh_obj('fender', verts, faces, 'Fender', smooth=True)
    # 前後に伸ばす板（アポロ17号では外れて、地図の板で直した話がある）
    for a, d in ((a1, 1), (a0, -1)):
        p = c + V(0, math.sin(a) * (R + 0.006), math.cos(a) * (R + 0.006))
        t = V(0, math.cos(a), -math.sin(a)) * d
        obox(p + t * 0.05, (1, 0, 0), t, V(0, math.sin(a), math.cos(a)), w / 2 * 0.96, 0.05, 0.006, 'Fender')
    # 泥よけを支える腕（車台から）
    bar(V(sx * RAIL_X, wy, RAIL_Z), c + V(-sx * 0.02, 0, R), 0.014)


def wheel(name, sx, wy):
    """網のタイヤ（中は空ではなく、絵で網に見せる筒）と、チタンの山形の板、ハブとモーター"""
    grp = f'Wheel_{name}'
    c = V(sx * WHEEL_X, wy, WHEEL_R)
    hw = WHEEL_W / 2
    cyl(c + V(-hw, 0, 0), c + V(hw, 0, 0), WHEEL_R - 0.02, 'Tyre', n=48, group=grp, bevel=0.03)
    # 山形の板：1 周に 18 組。まんなかを空けて両側へ（踏む面のおよそ半分）
    N = 18
    for i in range(N):
        a = i / N * math.pi * 2
        rad = V(0, math.sin(a), math.cos(a))
        tan = V(0, math.cos(a), -math.sin(a))
        for side in (-1, 1):
            d = (V(side, 0, 0) * math.cos(0.5) + tan * math.sin(0.5)).normalized()
            p = c + rad * (WHEEL_R - 0.006) + V(side * hw * 0.52, 0, 0) + tan * (math.sin(0.5) * hw * 0.4)
            obox(p, d, rad.cross(d), rad, hw * 0.42, 0.014, 0.006, 'Lug', group=grp)
    # 縁の輪と、車輪の内側の丸い枠（ばねのような内側のかご）
    for side in (-1, 1):
        torus(c + V(side * (hw - 0.008), 0, 0), (1, 0, 0), WHEEL_R - 0.03, 0.016, 'Alu', n=48, m=6, group=grp)
    # ハブ：外側の円板、金色の断熱のふた、まんなかのボルト
    face = c + V(sx * (hw - 0.01), 0, 0)
    cyl(face - V(sx * 0.03, 0, 0), face + V(sx * 0.015, 0, 0), 0.3, 'Hub', n=40, group=grp, bevel=0.008)
    cyl(face + V(sx * 0.015, 0, 0), face + V(sx * 0.06, 0, 0), 0.15, 'Gold', n=28, group=grp, bevel=0.01)
    cyl(face + V(sx * 0.06, 0, 0), face + V(sx * 0.08, 0, 0), 0.05, 'Alu', n=16, group=grp, bevel=0.006)
    for i in range(8):
        a = i / 8 * math.pi * 2
        sphere(face + V(sx * 0.02, math.sin(a) * 0.24, math.cos(a) * 0.24), 0.012, 'Alu', group=grp, seg=5)


def seat(sx):
    """座席：管のわく、ナイロンのベルトの座面と背もたれ、ひじかけ、ベルト"""
    x = sx * 0.3
    y0, y1 = -0.62, -0.12  # 座面の後ろ・前
    z = FLOOR_Z + 0.22
    r = 0.014
    # 座面のわくとベルト
    for xx in (x - 0.22, x + 0.22):
        bar(V(xx, y0, z), V(xx, y1, z + 0.03), r)
        bar(V(xx, y1, z + 0.03), V(xx, y1 + 0.02, FLOOR_Z), r)
        bar(V(xx, y0, z), V(xx, y0 - 0.02, FLOOR_Z), r)
    bar(V(x - 0.22, y1, z + 0.03), V(x + 0.22, y1, z + 0.03), r)
    bar(V(x - 0.22, y0, z), V(x + 0.22, y0, z), r)
    for i in range(4):
        f = (i + 0.5) / 4
        rbox(V(x, y0 + (y1 - y0) * f, z + 0.015), V(0.42, 0.09, 0.012), 'Web', bevel=0.004)
    # 背もたれ：後ろへ寝た板（生命維持装置が当たる）
    lean = 0.32
    up = V(0, -math.sin(lean), math.cos(lean))
    b0 = V(x, y0, z)
    for xx in (x - 0.22, x + 0.22):
        bar(V(xx, y0, z), V(xx, y0, z) + up * 0.42, r)
    bar(b0 + V(-0.22, 0, 0) + up * 0.42, b0 + V(0.22, 0, 0) + up * 0.42, r)
    for i in range(3):
        p = b0 + up * (0.08 + i * 0.13)
        obox(p, (1, 0, 0), up, V(0, math.cos(lean), math.sin(lean)), 0.21, 0.05, 0.006, 'Web')
    # ひじかけ（外側）と、ベルト（座面の前から背もたれへ、だらりと）
    ox = x + sx * 0.24
    bar(V(ox, y0 + 0.05, z + 0.17), V(ox, y1 - 0.05, z + 0.17), r)
    bar(V(ox, y1 - 0.05, z + 0.17), V(ox, y1 - 0.05, z), r)
    bar(V(ox, y0 + 0.05, z + 0.17), V(ox, y0 + 0.05, z), r)
    rbox(V(x, y1 - 0.02, z + 0.06), V(0.4, 0.03, 0.008), 'Web', bevel=0.003)


def console():
    """座席のあいだの前の計器盤と、座席のあいだの T 字の操縦かん"""
    # 柱
    bar(V(-0.05, 0.42, RAIL_Z), V(-0.05, 0.36, 1.0), 0.018)
    bar(V(0.05, 0.42, RAIL_Z), V(0.05, 0.36, 1.0), 0.018)
    # 計器盤の箱（座席のほうへ起こしてある）
    tilt = 0.55
    ay = V(0, -math.sin(tilt), math.cos(tilt))  # 盤の上の向き
    az = V(0, -math.cos(tilt), -math.sin(tilt)) * -1  # 盤の前（座席のほう）
    c = V(0, 0.37, 1.07)
    obox(c, (1, 0, 0), ay, az, 0.2, 0.13, 0.05, 'Dark')
    # 太陽の影を見る板（盤の上の小さな立て板）と、つまみ・目盛り
    obox(c + ay * 0.15 + az * 0.0, (1, 0, 0), ay, az, 0.05, 0.03, 0.004, 'Alu')
    for i in range(5):
        p = c - az * 0.052 + V(-0.13 + i * 0.065, 0, 0) - ay * 0.08
        cyl(p, p - az * 0.02, 0.012, 'Alu', n=10)
    # 操縦かん：座席のあいだの台の上
    base = V(0, -0.15, FLOOR_Z + 0.36)
    rbox(base, V(0.12, 0.2, 0.05), 'Dark', bevel=0.01)
    bar(V(0, -0.05, RAIL_Z), base - V(0, 0, 0.02), 0.02)
    bar(V(0, -0.25, FLOOR_Z), base - V(0, 0.08, 0.02), 0.016)
    bar(base + V(0, 0.02, 0.02), base + V(0, 0.04, 0.13), 0.012)
    bar(base + V(-0.06, 0.04, 0.13), base + V(0.06, 0.04, 0.13), 0.016)


def front():
    """電池と放熱板のふた、通信の箱、アンテナ 2 本、テレビカメラ"""
    # 電池 2 つ（白い断熱のふたの下）と、その上の鏡の放熱板（ふたは開いた形）
    for sx in (-1, 1):
        rbox(V(sx * 0.24, 1.08, RAIL_Z + 0.09), V(0.4, 0.42, 0.16), 'White', bevel=0.02)
        rbox(V(sx * 0.24, 1.08, RAIL_Z + 0.175), V(0.38, 0.4, 0.012), 'Mirror', bevel=0.004)
    # 前の箱（航法の箱・信号の処理）
    rbox(V(0, 1.38, RAIL_Z + 0.07), V(0.7, 0.18, 0.13), 'White', bevel=0.015)
    # 通信の箱 LCRU：前の端の台の上。金色の断熱のすそ、上は放熱の鏡
    lc = V(0.0, 1.62, RAIL_Z + 0.22)
    bar(V(-0.15, 1.5, RAIL_Z - 0.04), lc + V(-0.12, -0.02, -0.12), 0.016)
    bar(V(0.15, 1.5, RAIL_Z - 0.04), lc + V(0.12, -0.02, -0.12), 0.016)
    rbox(lc, V(0.36, 0.16, 0.24), 'White', bevel=0.015)
    rbox(lc - V(0, 0, 0.13), V(0.37, 0.17, 0.04), 'Gold', bevel=0.008)
    rbox(lc + V(0, 0, 0.125), V(0.34, 0.14, 0.01), 'Mirror', bevel=0.003)
    # 高利得アンテナ（傘の形の網の皿）：左前の柱の上。地球のほうへ向ける
    mast_top = V(-0.36, 1.55, 1.62)
    bar(V(-0.36, 1.5, RAIL_Z), mast_top, 0.016)
    dish_c = mast_top + V(0, 0.04, 0.06)
    axis = V(0.05, 0.62, 0.78).normalized()  # 皿の向き（前の上）
    n = 16
    R = 0.45
    depth = 0.12
    verts, faces = [tuple(dish_c)], []
    u = axis.cross(V(1, 0, 0)).normalized()
    w = axis.cross(u).normalized()
    rings = 4
    for k in range(1, rings + 1):
        rr = R * k / rings
        for i in range(n):
            a = i / n * math.pi * 2
            p = dish_c + (u * math.cos(a) + w * math.sin(a)) * rr + axis * (depth * (rr / R) ** 2)
            verts.append(tuple(p))
    for i in range(n):
        faces.append([0, 1 + i, 1 + (i + 1) % n])
    for k in range(rings - 1):
        for i in range(n):
            a0 = 1 + k * n + i
            a1 = 1 + k * n + (i + 1) % n
            faces.append([a0, a1, a1 + n, a0 + n])
    cr.mesh_obj('dish', verts, faces, 'Mesh', smooth=True)
    for i in range(0, n, 2):
        a = i / n * math.pi * 2
        tip = dish_c + (u * math.cos(a) + w * math.sin(a)) * R + axis * depth
        bar(dish_c, tip, 0.006, n=6)
    bar(dish_c, dish_c + axis * 0.36, 0.008, n=6)
    sphere(dish_c + axis * 0.36, 0.025, 'Alu', seg=6)
    # 低利得アンテナ（らせん）：右前の細い柱
    lg = V(0.34, 1.6, RAIL_Z)
    bar(lg, lg + V(0, 0, 0.75), 0.01)
    pts = []
    for i in range(60):
        t = i / 59
        a = t * math.pi * 2 * 7
        pts.append(lg + V(math.cos(a) * 0.03, math.sin(a) * 0.03, 0.75 + t * 0.6))
    for a, b in zip(pts, pts[1:]):
        bar(a, b, 0.005, n=5)
    # テレビカメラの柱（前のまんなか）。カメラは別のオブジェクト
    bar(V(0.06, 1.66, RAIL_Z + 0.34), V(0.06, 1.66, CAM_Z - 0.08), 0.02)
    cyl(V(0.06, 1.66, CAM_Z - 0.1), V(0.06, 1.66, CAM_Z - 0.03), 0.04, 'Hub', n=16)


CAM_POS = (0.06, 1.66)
CAM_Z = 1.22


def tv_camera():
    """テレビカメラ GCTA：首を振る台・箱・レンズ・日よけ。原点は首の軸（Camera）"""
    g = 'Camera'
    c = V(CAM_POS[0], CAM_POS[1], CAM_Z)
    cyl(c - V(0, 0, 0.03), c + V(0, 0, 0.03), 0.045, 'Hub', n=16, group=g)
    rbox(c + V(0, 0, 0.12), V(0.16, 0.26, 0.17), 'White', bevel=0.02, group=g)
    rbox(c + V(0, 0, 0.215), V(0.15, 0.25, 0.012), 'Mirror', bevel=0.004, group=g)
    # レンズ（前へ）と日よけ
    cyl(c + V(0, 0.13, 0.12), c + V(0, 0.22, 0.12), 0.05, 'Dark', n=20, group=g, bevel=0.005)
    cyl(c + V(0, 0.22, 0.12), c + V(0, 0.235, 0.12), 0.042, 'Lens', n=20, group=g)
    rbox(c + V(0, 0.2, 0.18), V(0.14, 0.12, 0.008), 'Dark', bevel=0.003, group=g)


def rear():
    """後ろの道具の棚：わく、道具（はさみ・スコップ・熊手・ハンマー）、試料の袋の箱"""
    y = -1.5
    z0 = RAIL_Z
    for sx in (-1, 1):
        bar(V(sx * 0.42, y, z0), V(sx * 0.42, y - 0.08, z0 + 0.72), 0.018)
    bar(V(-0.42, y - 0.08, z0 + 0.72), V(0.42, y - 0.08, z0 + 0.72), 0.018)
    bar(V(-0.42, y - 0.04, z0 + 0.35), V(0.42, y - 0.04, z0 + 0.35), 0.016)
    rbox(V(0, y - 0.02, z0 + 0.2), V(0.8, 0.12, 0.3), 'White', bevel=0.015)
    # 道具：長い柄（縦に立てて棚に差す）
    tools = [(-0.32, 'scoop'), (-0.18, 'tongs'), (-0.02, 'rake'), (0.14, 'tongs'), (0.3, 'core')]
    for x, kind in tools:
        a = V(x, y - 0.14, z0 + 0.1)
        b = V(x, y - 0.2, z0 + 1.05)
        bar(a, b, 0.012)
        if kind == 'scoop':
            rbox(b + V(0, -0.02, 0.05), V(0.08, 0.04, 0.1), 'Alu', bevel=0.01)
        elif kind == 'rake':
            bar(b + V(-0.1, 0, 0), b + V(0.1, 0, 0), 0.01)
            for i in range(7):
                bar(b + V(-0.09 + i * 0.03, 0, 0), b + V(-0.09 + i * 0.03, 0.0, 0.08), 0.004, n=4)
        elif kind == 'tongs':
            bar(b, b + V(0.03, 0, 0.1), 0.007, n=5)
            bar(b, b + V(-0.03, 0, 0.1), 0.007, n=5)
        else:
            cyl(b, b + V(0, 0, 0.14), 0.02, 'Alu', n=10)
    # 試料の袋の箱（背もたれの後ろ）
    for sx in (-1, 1):
        rbox(V(sx * 0.3, -0.92, RAIL_Z + 0.16), V(0.34, 0.2, 0.24), 'Bag', bevel=0.02)
        rbox(V(sx * 0.3, -0.92, RAIL_Z + 0.29), V(0.35, 0.21, 0.02), 'Bag', bevel=0.006)
    # 後ろの赤だいだいの反射板（見つけやすい印）
    for sx in (-1, 1):
        rbox(V(sx * 0.5, -1.56, RAIL_Z + 0.02), V(0.06, 0.01, 0.06), 'Orange', bevel=0.003)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    PARTS.clear()
    for m in MATS:
        cr.material(m)
    chassis()
    suspension()
    for k, wy in WHEEL_Y.items():
        for sx in (-1, 1):
            fender(sx, wy)
    for sx in (-1, 1):
        seat(sx)
    console()
    front()
    tv_camera()
    rear()
    wheel('FR', 1, WHEEL_Y['F'])
    objs = {}
    for name, parts in PARTS.items():
        bpy.ops.object.select_all(action='DESELECT')
        for p in parts:
            p.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        bpy.ops.object.join()
        o = bpy.context.object
        o.name = name
        o.data.name = name
        if name.startswith('Wheel_'):
            bpy.context.scene.cursor.location = V(WHEEL_X, WHEEL_Y['F'], WHEEL_R)
            bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        if name == 'Camera':
            bpy.context.scene.cursor.location = V(CAM_POS[0], CAM_POS[1], CAM_Z)
            bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        except Exception:
            pass
        objs[name] = o
    src = objs['Wheel_FR']
    for k, wy in WHEEL_Y.items():
        for side, sx in (('R', 1), ('L', -1)):
            name = f'Wheel_{k}{side}'
            if name in objs:
                continue
            o = bpy.data.objects.new(name, src.data)
            bpy.context.collection.objects.link(o)
            o.location = (sx * WHEEL_X, wy, WHEEL_R)
            o.scale = (sx, 1, 1)
            objs[name] = o
    bpy.context.view_layer.update()
    allv = [o.matrix_world @ v.co for o in objs.values() for v in o.data.vertices]
    lo = Vector((min(v.x for v in allv), min(v.y for v in allv), min(v.z for v in allv)))
    hi = Vector((max(v.x for v in allv), max(v.y for v in allv), max(v.z for v in allv)))
    tris = sum(len(p.vertices) - 2 for o in (objs['Body'], objs['Wheel_FR'], objs['Camera']) for p in o.data.polygons)
    print(f'size {hi.x - lo.x:.2f} x {hi.y - lo.y:.2f} x {hi.z - lo.z:.2f} (z {lo.z:.2f}..{hi.z:.2f})  tris {tris}', flush=True)
    return objs


# ---- 質感の焼き込み（BAKE=1）。与圧ローバーと同じやり方 ----------------------------------------------


def compose(P, N, ID, AO, EDGE, parts, wheels):
    import build_amatsukaze as ba
    import build_lander as bl
    srgb = bl.srgb
    valid = ID[..., 3] > 0.5
    mid = np.clip((ID[..., 0] * 32).astype(int), 0, 31)
    pidx = np.clip(np.round(ID[..., 1] * 32).astype(int), 0, 31)
    pos = P[..., :3] - 1
    nrm = N[..., :3] * 2 - 1
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    nz = nrm[..., 2]
    ao = np.clip(ba.soft_blur(AO[..., 0], valid, 1.2), 0, 1)
    edge = np.clip(ba.soft_blur(EDGE[..., 0], valid, 0.8) * 5, 0, 1)
    is_m = lambda name: valid & (mid == MATS.index(name))  # noqa: E731
    part_name = np.array(['?'] + parts + ['?'] * (32 - len(parts) - 1))[pidx]
    on_wheel = valid & np.char.startswith(part_name, 'Wheel')

    base = np.zeros(pos.shape, dtype=np.float32)
    rough = np.zeros(x.shape, dtype=np.float32)
    metal = np.zeros(x.shape, dtype=np.float32)
    height = np.zeros(x.shape, dtype=np.float32)
    for m, (col, r, mt) in PALETTE.items():
        sel = is_m(m)
        base[sel] = srgb(col)
        rough[sel] = r
        metal[sel] = mt
    n_big = ba.value_noise(pos, 0.8, 41)
    n_mid = ba.value_noise(pos, 3.0, 42)
    n_fine = ba.value_noise(pos, 12.0, 43)
    base *= (1 + (n_big - 0.5) * 0.06 + (n_mid - 0.5) * 0.05)[..., None]
    rough += (n_mid - 0.5) * 0.1 + (n_fine - 0.5) * 0.06

    # 1. アルミの管・板：ヘアラインと、陽に焼けたむら
    bare = is_m('Alu') | is_m('Lug') | is_m('Floor') | is_m('Hub')
    axis = np.argmax(np.abs(nrm), axis=-1)
    hair = ba.value_noise(np.stack([x * 30, y * 0.6, z * 30], -1), 1.0, 44)
    rough[bare] += ((hair - 0.5) * 0.18)[bare]
    # 2. 床：格子の穴（軽くするための穴あきの板）
    fl = is_m('Floor')
    gx = np.abs(np.mod(x / 0.05, 1) - 0.5) < 0.18
    gy = np.abs(np.mod(y / 0.05, 1) - 0.5) < 0.18
    hole = fl & gx & gy & (nz > 0.5)
    base[hole] = srgb('#16171a')
    height[hole] -= 0.8
    # 3. タイヤの網：車輪の軸まわりの角度と幅の向きで、ひし形の網目。すき間から中のかごの影
    for name, (cx, cy, cz) in wheels.items():
        sel = valid & (part_name == name) & is_m('Tyre')
        ang = np.arctan2(z - cz, y - cy)
        u = ang * WHEEL_R / 0.012
        v = (x - cx) / 0.012
        m1 = np.abs(np.mod(u + v, 1) - 0.5) < 0.16
        m2 = np.abs(np.mod(u - v, 1) - 0.5) < 0.16
        wire = sel & (m1 | m2)
        gap = sel & ~(m1 | m2)
        base[gap] = srgb('#1a1b1e')
        metal[gap] = 0.2
        rough[gap] = 0.9
        height[wire] += 0.7
        height[gap] -= 0.7
    # 4. 金色・白の断熱材：しわ
    wr = ba.value_noise(pos, 18.0, 45)
    wr2 = ba.value_noise(pos, 50.0, 46)
    blanket = is_m('Gold') | is_m('White') | is_m('Bag')
    height[blanket] += ((wr - 0.5) * 1.2 + (wr2 - 0.5) * 0.6)[blanket]
    base[is_m('Gold')] *= (1 + (wr[is_m('Gold')] - 0.5) * 0.35)[..., None]
    base[is_m('White')] *= (1 + (wr2[is_m('White')] - 0.5) * 0.08)[..., None]
    # 5. 座席のベルト：織り目
    web = is_m('Web')
    weave = (np.abs(np.mod((x + y) / 0.006, 1) - 0.5) < 0.25)
    height[web & weave] += 0.4
    base[web & weave] *= 1.08
    # 6. 計器盤：目盛りの丸と、白い文字の帯のかわりの短い棒（読めない）
    dk = is_m('Dark') & (z > 0.95) & (y > 0.2)
    for i, cx in enumerate((-0.12, -0.04, 0.04, 0.12)):
        d = np.hypot(x - cx, z - 1.07)
        ring_ = dk & (np.abs(d - 0.028) < 0.003)
        face = dk & (d < 0.025)
        base[face] = srgb('#e8e4d8') * 0.85
        base[ring_] = srgb('#b8bcc2')
        metal[ring_] = 0.9
        needle = face & (np.abs((x - cx) * math.cos(0.6 + i) - (z - 1.07) * math.sin(0.6 + i)) < 0.0018) & (d < 0.02)
        base[needle] = srgb('#1a1a1a')
    # 7. 泥よけ：つや消しの塗装に、細かい傷
    fen = is_m('Fender')
    base[fen] *= (1 + (n_fine[fen] - 0.5) * 0.08)[..., None]
    # 8. 月の砂（灰色）：低いところほど濃い。車輪・泥よけの内側・床はたっぷり。上を向いた面にも少し
    regolith = srgb('#8a8780')
    grime = srgb('#2e2c29')
    low = np.clip((0.9 - z) / 0.8, 0, 1) ** 1.2
    dust = low * (0.35 + 0.65 * n_mid)
    dust += on_wheel * (0.4 + 0.4 * n_mid)
    dust += fl * 0.35
    dust += np.clip(nz, 0, 1) * (0.12 + 0.4 * np.clip((n_mid - 0.35) * 2, 0, 1)) * 0.7
    splat = np.clip((ba.value_noise(pos, 9.0, 47) - 0.5) * 5, 0, 1)
    dust += splat * 0.35 * (fen | is_m('White'))
    lens = is_m('Lens') | is_m('Mirror')
    dust *= valid & ~lens
    dust[is_m('Mirror')] = 0.12 * splat[is_m('Mirror')]
    dust = np.clip(dust, 0, 0.85)
    base = base * (1 - dust[..., None] * 0.7) + regolith * dust[..., None] * 0.7
    rough += dust * 0.35
    metal *= 1 - dust * 0.65
    cav = np.clip((0.8 - ao) * 2.2, 0, 1) * valid * (0.6 + 0.4 * n_fine)
    base = base * (1 - cav[..., None] * 0.5) + grime * cav[..., None] * 0.5
    rough += cav * 0.1
    wear = edge * np.clip((n_fine - 0.3) * 2.4, 0, 1)
    base *= (1 + 0.2 * wear * bare)[..., None]
    base *= (0.5 + 0.5 * ao)[..., None]

    nrm_map = np.zeros(pos.shape, dtype=np.float32)
    nrm_map[..., 2] = 1
    hs = bl.ndimage_gauss(height, 0.6)
    texel = ba.estimate_texel(pos, valid)
    cont_x = valid & np.roll(valid, -1, 1) & (np.linalg.norm(np.roll(pos, -1, 1) - pos, axis=-1) < texel * 3)
    cont_y = valid & np.roll(valid, -1, 0) & (np.linalg.norm(np.roll(pos, -1, 0) - pos, axis=-1) < texel * 3)
    gxm = np.where(cont_x, np.roll(hs, -1, 1) - hs, 0)
    gym = np.where(cont_y, np.roll(hs, -1, 0) - hs, 0)
    nrm_map[..., 0] = -gxm * 0.9
    nrm_map[..., 1] = -gym * 0.9
    nrm_map /= np.linalg.norm(nrm_map, axis=-1, keepdims=True)
    print(f'  texel ≈ {texel * 1000:.1f} mm', flush=True)
    return base, np.clip(rough, 0.03, 1), np.clip(metal, 0, 1), nrm_map, valid


def bake(objs):
    import build_amatsukaze as ba
    tex = int(os.environ.get('TEX', '2048')) * SUPER
    ba.TEX = tex
    ba.MATS = MATS
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.world = bpy.data.worlds.new('bakeworld')
    scene.world.use_nodes = True
    scene.world.light_settings.distance = 0.3
    parts = list(objs.keys())
    for i, name in enumerate(parts):
        objs[name].pass_index = i + 1
    wheels = {n: tuple(objs[n].matrix_world.translation) for n in parts if n.startswith('Wheel')}
    olist = [objs['Body'], objs['Wheel_FR'], objs['Camera']]
    ba.unwrap(olist)
    t = time.time()
    Pm = ba.bake_pass(olist, 'P', 'EMIT', ba.node_position)
    Nm = ba.bake_pass(olist, 'N', 'EMIT', ba.node_normal)
    IDm = ba.bake_pass(olist, 'ID', 'EMIT', ba.node_ids)
    Em = ba.bake_pass(olist, 'EDGE', 'EMIT', cr.node_edge_m, samples=8)
    AOm = ba.bake_pass(olist, 'AO', 'AO', None, samples=int(os.environ.get('AO_SAMPLES', '48')))
    print(f'  bakes {time.time() - t:.0f}s', flush=True)
    base, rough, metal, nrm, valid = compose(Pm, Nm, IDm, AOm, Em, parts, wheels)
    del Pm, Nm, IDm, AOm, Em
    orm = np.stack([np.ones_like(rough), rough, metal], -1)
    nrm_rgb = nrm * 0.5 + 0.5
    if SUPER > 1:
        k = SUPER

        def down(a):
            w = valid.astype(np.float32).reshape(tex // k, k, tex // k, k)
            v = (a * valid[..., None]).reshape(tex // k, k, tex // k, k, -1)
            ws = w.sum((1, 3))
            return v.sum((1, 3)) / np.maximum(ws, 1e-6)[..., None], ws > 0
        base, v2 = down(base)
        orm, _ = down(orm)
        nrm_rgb, _ = down(nrm_rgb)
        n = nrm_rgb * 2 - 1
        nrm_rgb = n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6) * 0.5 + 0.5
        valid = v2
        ba.TEX = tex // k
    base, orm = ba.dilate(base, valid), ba.dilate(orm, valid)
    nrm_rgb = ba.dilate(nrm_rgb, valid)
    tex_dir = os.environ.get('TEX_DIR', '/tmp/claude-0/lrv-tex')
    os.makedirs(tex_dir, exist_ok=True)
    black = np.zeros_like(base)
    images = {
        'base': ba.save_image('lrv_base', ba.to_srgb(base), 'sRGB', os.path.join(tex_dir, 'base.png')),
        'orm': ba.save_image('lrv_orm', orm, 'Non-Color', os.path.join(tex_dir, 'orm.png')),
        'normal': ba.save_image('lrv_normal', nrm_rgb, 'Non-Color', os.path.join(tex_dir, 'normal.png')),
        'emit': ba.save_image('lrv_emit', black, 'sRGB', os.path.join(tex_dir, 'emit.png')),
    }
    baked = ba.final_material(images)
    for link in list(baked.node_tree.links):
        if link.to_socket.name == 'Emission Color':
            baked.node_tree.links.remove(link)
    baked.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value = 0.0
    for o in olist:
        o.data.materials.clear()
        o.data.materials.append(baked)
    return images


def preview(objs):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = int(os.environ.get('PREVIEW_SAMPLES', '24'))
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('w')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.02, 0.022, 0.026, 1)
    bpy.ops.mesh.primitive_plane_add(size=60)
    g = bpy.context.object
    gm = bpy.data.materials.new('ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.155, 0.15, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    g.data.materials.append(gm)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4.5
    sun.data.angle = math.radians(0.6)
    sun.rotation_euler = (math.radians(60), 0, math.radians(-140))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    views = {
        'hero': ((4.6, 4.4, 1.9), (0, 0.1, 0.75), 38),
        'rear': ((-3.6, -4.8, 1.8), (0, -0.3, 0.75), 38),
        'side': ((6.5, 0, 1.0), (0, 0, 0.75), 40),
        'front': ((0, 6.5, 1.2), (0, 0, 0.8), 40),
        'top': ((2.5, 2.0, 5.5), (0, 0, 0.6), 38),
        'wheel': ((2.4, 2.2, 0.6), (0.915, 1.145, 0.4), 50),
        'seat': ((-0.3, -1.5, 1.7), (0, 0.6, 0.9), 26),
    }
    for v in os.environ.get('VIEWS', 'hero,rear,side,front').split(','):
        pos, look, lens = views[v]
        cam.data.lens = lens
        cam.location = pos
        d = Vector(look) - Vector(pos)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'lrv-{v}.png')
        bpy.ops.render.render(write_still=True)
        print('wrote', scene.render.filepath, flush=True)


def export(objs, baked):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs.values():
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', use_selection=True, export_vertex_color='NONE',
        export_normals=True, export_texcoords=baked, export_tangents=False, export_materials='EXPORT',
        export_image_format='JPEG', export_jpeg_quality=88, export_yup=True,
    )
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB', flush=True)


if __name__ == '__main__':
    t0 = time.time()
    objs = build()
    baked = bool(os.environ.get('BAKE'))
    if baked:
        bake(objs)
    if os.environ.get('EXPORT'):
        export(objs, baked)
    if os.environ.get('PREVIEW'):
        preview(objs)
    print(f'done {time.time() - t0:.0f}s', flush=True)
