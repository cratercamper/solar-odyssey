"""
人が乗る与圧ローバー PR-2「ミチカケ」（全長 6.0 m、全幅 4.6 m、全高 3.9 m）を Blender で組み立てる。

アルテミス計画で日本が開発している「有人与圧ローバー」（宇宙服を着ずに中で暮らせる月面の車）を
参考にした、このアプリのオリジナルのデザイン。実在の車の名前・ロゴ・形はまねしていない。
  - 車体：前後に並べた断面（角の丸い台形）をつないだ、なめらかな与圧キャビン。前は大きく傾いた窓へ流れる
  - 窓：前の 2 枚と横の 4 枚は、キャビンの面に焼き込む（濃いガラスと黒い枠、継ぎ目の溝）
  - 前：前照灯の帯と丸い灯、センサーの台、バンパー、けん引のかぎ
  - 屋根：ひれのある放熱板 2 枚、後ろに立てた太陽電池（枠・ちょうつがい・支柱）、通信アンテナ（皿と受信部の支柱）、
    前のステレオカメラの柱、星の位置を測る小さなカメラ
  - 後ろ：エアロックのハッチと、宇宙服をつないだまま出入りできる丸い口（スーツポート）2 つ、足場とはしご
  - 横：金色の断熱材（しわ）、手すり（足つき）、物入れ、燃料電池のタンク（筒）、ケーブル
  - 足まわり：6 輪。2 本の腕とばね付きダンパー、車輪の中のモーター。タイヤは金網に、チタンの山形の板
  - 質感（BAKE=1）：塗装のむら・パネルの継ぎ目・留め具・砂ぼこり（下ほど濃い）・すき間の黒ずみ・角のはげ・
    金属のヘアライン・断熱材のしわ・太陽電池のセル・タイヤの金網

座標は Blender のまま（Z が上、前方が +Y、右が +X）。単位はメートル。地面が z=0。
車輪は別のオブジェクト Wheel_{F,M,R}{R,L}（原点が車軸）。そのほかはまとめて Body。
three.js 側（src/components/surface/CrewRover.tsx）は WHEELS の位置をこのファイルの数字と合わせている。

実行（bpy の venv：python3 -m venv /home/user/.bpyvenv && pip install bpy scipy scikit-image）:
  /home/user/.bpyvenv/bin/python tools/blender/build_crew_rover.py
  PREVIEW=1     確認用の画像を PREVIEW_DIR に書き出す（VIEWS=hero,rear,side,front,top,wheel）
  BAKE=1        質感を焼き込む（TEX=2048、SUPER=2 で 2 倍に焼いて縮める、AO_SAMPLES=48）。EXPORT=1 と一緒なら焼いた glb を書き出す
  EXPORT=1      public/models/rover-crew.glb に書き出す（そのあと node tools/glb/compress.mjs で圧縮する）
"""

import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.environ.get('OUT', os.path.join(ROOT, 'public', 'models', 'rover-crew.glb'))
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')
# 焼き込みの倍率：TEX × SUPER の大きさで焼いて、TEX に縮める
SUPER = int(os.environ.get('SUPER', '2'))

# 車輪（右側。左は x を反転）。CrewRover.tsx の WHEELS / WHEEL_R と同じ数字
WHEEL_R = 0.62
WHEEL_W = 0.48
WHEEL_X = 1.95
WHEEL_Y = {'F': 2.05, 'M': 0.0, 'R': -2.05}

MATS = ['Hull', 'Hull2', 'Dark', 'Mech', 'Metal', 'Tyre', 'Lug', 'Solar', 'Glass', 'Lamp', 'Gold', 'Accent', 'Carbon']
PALETTE = {  # 色, ラフネス, メタリック
    'Hull': ('#dcdad3', 0.5, 0.0),
    'Hull2': ('#b9bdc3', 0.4, 0.35),
    'Dark': ('#2a2d33', 0.55, 0.15),
    'Mech': ('#5a5f67', 0.4, 0.7),
    'Metal': ('#a9aeb5', 0.28, 1.0),
    'Tyre': ('#8d9196', 0.4, 0.9),
    'Lug': ('#9a9ea3', 0.35, 0.95),
    'Solar': ('#13214d', 0.15, 0.4),
    'Glass': ('#0a111b', 0.04, 0.3),
    'Lamp': ('#fff3da', 0.3, 0.0),
    'Gold': ('#c8942c', 0.32, 1.0),
    'Accent': ('#2f7fd0', 0.4, 0.1),
    'Carbon': ('#1c1d20', 0.45, 0.3),
}


def lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    col, rough, metal = PALETTE[name]
    b.inputs['Base Color'].default_value = (*lin(col), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if name == 'Lamp':
        b.inputs['Emission Color'].default_value = (*lin(col), 1)
        b.inputs['Emission Strength'].default_value = 6
    return m


PARTS = {}  # 名前 → オブジェクトの一覧（あとで 1 つにまとめる）


def keep(obj, group='Body', mat=None, smooth=True):
    if mat:
        obj.data.materials.clear()
        obj.data.materials.append(material(mat))
    for p in obj.data.polygons:
        p.use_smooth = smooth
    PARTS.setdefault(group, []).append(obj)
    return obj


def apply_mods(obj):
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def bevel_mod(o, width, seg=2, angle=30):
    b = o.modifiers.new('b', 'BEVEL')
    b.width = width
    b.segments = seg
    b.limit_method = 'ANGLE'
    b.angle_limit = math.radians(angle)
    b.harden_normals = False
    apply_mods(o)


def rbox(center, size, mat, bevel=0.03, seg=2, group='Body', rot=(0, 0, 0)):
    """角を丸めた箱"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=center, rotation=rot)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        bevel_mod(o, min(bevel, min(size) * 0.45), seg)
    return keep(o, group, mat)


def cyl(a, b, r, mat, n=24, group='Body', bevel=0.0, r2=None):
    """a から b への円柱（r2 があれば円すい台）"""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r, radius2=r if r2 is None else r2, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    if bevel > 0:
        bevel_mod(o, bevel, 2)
    return keep(o, group, mat)


def bar(a, b, r, mat='Metal', group='Body', n=8):
    return cyl(a, b, r, mat, n=n, group=group)


def sphere(c, r, mat, group='Body', seg=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg * 2, ring_count=seg, radius=r, location=c)
    return keep(bpy.context.object, group, mat)


def torus(c, axis, R, r, mat, group='Body', n=32, m=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=n, minor_segments=m, location=c)
    o = bpy.context.object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized())
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return keep(o, group, mat)


def obox(c, ax, ay, az, hx, hy, hz, mat, group='Body'):
    """向きを 3 本の軸で決めた箱（中心 c、半分の大きさ hx, hy, hz）"""
    c, ax, ay, az = Vector(c), Vector(ax).normalized(), Vector(ay).normalized(), Vector(az).normalized()
    verts = [tuple(c + ax * (sx * hx) + ay * (sy * hy) + az * (sz * hz)) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
    return mesh_obj('obox', verts, faces, mat, group, smooth=False)


def mesh_obj(name, verts, faces, mat, group='Body', smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return keep(o, group, mat, smooth)


# ---- 与圧キャビン：断面をつないだ筒 --------------------------------------------------------------
# (y, 下の z, 上の z, 下の半幅, 上の半幅, 上の角の丸み)。前（+Y）へ行くほど屋根が下がり、大きな窓の斜面になる
CAB = [
    (-2.64, 1.12, 2.96, 1.24, 1.08, 0.36),
    (-2.58, 1.06, 3.16, 1.36, 1.2, 0.42),
    (-2.4, 1.03, 3.27, 1.42, 1.28, 0.44),
    (-1.6, 1.02, 3.31, 1.45, 1.31, 0.46),
    (0.0, 1.02, 3.32, 1.46, 1.32, 0.46),
    (1.2, 1.02, 3.32, 1.46, 1.32, 0.46),
    (1.55, 1.02, 3.28, 1.46, 1.31, 0.46),
    (1.85, 1.02, 3.06, 1.46, 1.3, 0.45),
    (2.15, 1.02, 2.76, 1.45, 1.29, 0.43),
    (2.42, 1.02, 2.44, 1.44, 1.28, 0.4),
    (2.6, 1.03, 2.1, 1.41, 1.28, 0.33),
    (2.71, 1.06, 1.72, 1.36, 1.27, 0.24),
    (2.76, 1.1, 1.36, 1.28, 1.24, 0.14),
]
CAB_X = 1.46


def catmull(rows, n):
    """断面の数字を前後にむらなく補う（なめらかな車体に）"""
    rows = np.array(rows, float)
    ys = rows[:, 0]
    out = []
    for k in range(len(rows) - 1):
        p0 = rows[max(k - 1, 0)]
        p1 = rows[k]
        p2 = rows[k + 1]
        p3 = rows[min(k + 2, len(rows) - 1)]
        steps = max(1, int(round((ys[k + 1] - ys[k]) / (ys[-1] - ys[0]) * n)))
        for i in range(steps):
            t = i / steps
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(rows[-1])
    return out


def ring(zb, zt, wb, wt, rt, rb=0.16, nc=8):
    """角の丸い台形の輪郭（反時計回り、右下から）。点の数はいつも同じ"""
    corners = [((wb, zb), rb), ((wt, zt), rt), ((-wt, zt), rt), ((-wb, zb), rb)]
    pts = []
    for i, ((cx, cz), r) in enumerate(corners):
        prev = corners[i - 1][0]
        nxt = corners[(i + 1) % 4][0]
        a = np.array(prev) - (cx, cz)
        b = np.array(nxt) - (cx, cz)
        a = a / np.linalg.norm(a)
        b = b / np.linalg.norm(b)
        p0 = np.array((cx, cz)) + a * r
        p2 = np.array((cx, cz)) + b * r
        for k in range(nc):
            t = k / (nc - 1)
            p = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * np.array((cx, cz)) + t * t * p2
            pts.append(p)
        # 辺のまんなかに 2 点（長い辺をなめらかに曲げるため）
        e0 = p2
        nc_next = corners[(i + 1) % 4]
        bb = np.array(corners[i][0]) - np.array(nc_next[0])
        bb = bb / np.linalg.norm(bb)
        e1 = np.array(nc_next[0]) + bb * nc_next[1]
        for t in (1 / 3, 2 / 3):
            pts.append(e0 + (e1 - e0) * t)
    return pts


def cabin():
    secs = catmull(CAB, 46)
    verts, faces = [], []
    n = None
    for y, zb, zt, wb, wt, rt in secs:
        r = ring(zb, zt, wb, wt, rt)
        n = len(r)
        verts += [(x, y, z) for x, z in r]
    rows = len(secs)
    for k in range(rows - 1):
        for i in range(n):
            a, b = k * n + i, k * n + (i + 1) % n
            faces.append([a, b, b + n, a + n])
    # 前後のふた（中心へ）
    for k, flip in ((0, True), (rows - 1, False)):
        c = len(verts)
        ring_pts = verts[k * n:(k + 1) * n]
        verts.append((0, ring_pts[0][1], sum(p[2] for p in ring_pts) / n))
        for i in range(n):
            a, b = k * n + i, k * n + (i + 1) % n
            faces.append([a, b, c] if not flip else [b, a, c])
    mesh_obj('cab', verts, faces, 'Hull')


# 窓（焼き込みで描く）：前の 2 枚は (x の範囲, z の範囲) を斜面の上で、横の 4 枚は (y の範囲, z の範囲)
FRONT_WIN = [(-1.14, -0.07, 2.3, 3.18), (0.07, 1.14, 2.3, 3.18)]
SIDE_WIN = [(1.15, 1.82, 2.28, 2.86), (0.3, 1.0, 2.28, 2.86)]


def underbody():
    # 車台：キャビンの下の黒い台（角を落とした長い箱）と、その下の電池の箱・燃料電池のタンク
    rbox((0, 0.05, 0.92), (2.7, 5.45, 0.26), 'Carbon', bevel=0.06)
    rbox((0, 0.0, 0.74), (1.6, 4.2, 0.16), 'Mech', bevel=0.04)
    for sx in (-1, 1):
        # 燃料電池のタンク（水素と酸素）：車台の横に 2 本ずつ。帯で留める
        for y0, y1, r in ((-1.75, -0.55, 0.17), (0.45, 1.35, 0.14)):
            cyl((sx * 1.05, y0, 0.78), (sx * 1.05, y1, 0.78), r, 'Hull2', n=20, bevel=0.03)
            for yy in (y0 + 0.15, y1 - 0.15):
                cyl((sx * 1.05, yy - 0.025, 0.78), (sx * 1.05, yy + 0.025, 0.78), r + 0.012, 'Mech', n=20)
        # 金色の断熱材の帯と、青い線
        rbox((sx * (CAB_X - 0.03), -0.05, 1.2), (0.06, 5.0, 0.22), 'Gold', bevel=0.02)
        rbox((sx * (CAB_X - 0.01), -0.05, 1.355), (0.035, 5.0, 0.035), 'Accent', bevel=0.01)
        # 物入れ（後ろの車輪の前の上）
        rbox((sx * (CAB_X + 0.06), -1.05, 1.82), (0.18, 0.9, 0.62), 'Hull2', bevel=0.05, seg=3)
        for zz in (1.62, 2.02):
            rbox((sx * (CAB_X + 0.16), -1.05, zz), (0.03, 0.8, 0.03), 'Mech', bevel=0.01)
        rbox((sx * (CAB_X + 0.16), -0.68, 1.82), (0.04, 0.05, 0.12), 'Dark', bevel=0.01)
        # 手すり：足（台座つき）で車体から浮かせる
        z = 3.0
        xs = sx * (CAB_X - 0.02)
        xr = sx * (CAB_X + 0.07)
        bar((xr, -2.2, z), (xr, 1.45, z), 0.022, 'Metal')
        for y in (-2.2, -1.0, 0.25, 1.45):
            bar((xs, y, z), (xr, y, z), 0.016, 'Metal')
            cyl((xs - sx * 0.02, y, z), (xs + sx * 0.005, y, z), 0.045, 'Mech', n=12)
        # ケーブル（車台から車輪のモーターへ）
        for wy in WHEEL_Y.values():
            bar((sx * 1.25, wy + 0.25, 0.95), (sx * 1.55, wy + 0.2, 0.72), 0.018, 'Carbon')


def arc(c, r, w, t, a0, a1, mat, n=16, lip=0.06):
    """車輪の上の泥よけ：車軸（x 方向）まわりの円弧の板。外側の縁を少し下へ折る。角度は真上が 0、前が +"""
    verts, faces = [], []
    rows = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        sa, ca = math.sin(a), math.cos(a)
        row = []
        for rr, x in ((r, -w / 2), (r, w / 2), (r + t, w / 2), (r + t, -w / 2), (r - lip, w / 2 + 0.0), (r - lip, w / 2 - t)):
            row.append(len(verts))
            verts.append((c.x + x, c.y + sa * rr, c.z + ca * rr))
        rows.append(row)
    for i in range(n):
        a, b = rows[i], rows[i + 1]
        for q in ((0, 1), (1, 2), (2, 3), (3, 0)):
            faces.append([a[q[0]], a[q[1]], b[q[1]], b[q[0]]])
    faces.append([rows[0][k] for k in (0, 3, 2, 1)])
    faces.append([rows[-1][k] for k in (0, 1, 2, 3)])
    return mesh_obj('arc', verts, faces, mat)


def suspension():
    for sx in (-1, 1):
        for k, wy in WHEEL_Y.items():
            c = Vector((sx * WHEEL_X, wy, WHEEL_R))
            arc(c, WHEEL_R + 0.1, WHEEL_W + 0.14, 0.045, -56, 56, 'Hull')
            # 泥よけの支え
            bar((sx * 1.4, wy - 0.45, 1.1), (sx * (WHEEL_X - 0.1), wy - 0.5, 1.12), 0.025, 'Mech')
            bar((sx * 1.4, wy + 0.45, 1.1), (sx * (WHEEL_X - 0.1), wy + 0.5, 1.12), 0.025, 'Mech')
            # 2 本の腕（上と下、A の字）と、車輪の中のモーター（ハブの内側の筒）
            knuckle = c + Vector((-sx * (WHEEL_W / 2 + 0.12), 0, 0))
            for dz, rr in ((0.2, 0.035), (-0.16, 0.045)):
                for dy in (-0.34, 0.34):
                    cyl((sx * 1.2, wy + dy, WHEEL_R + dz + 0.12), knuckle + Vector((0, dy * 0.15, dz)), rr, 'Mech', n=10)
            cyl(knuckle + Vector((sx * -0.04, 0, 0)), knuckle + Vector((sx * 0.12, 0, 0)), 0.2, 'Mech', n=24, bevel=0.015)
            cyl(knuckle + Vector((sx * -0.07, 0, 0)), knuckle + Vector((sx * -0.04, 0, 0)), 0.14, 'Dark', n=20)
            # ばね付きダンパー（上の腕から車体へ）。ばねは輪をいくつか重ねる
            top = Vector((sx * 1.3, wy + 0.12, 1.32))
            bot = knuckle + Vector((0, 0.12, 0.2))
            cyl(top, bot, 0.03, 'Metal', n=10)
            cyl(top, top + (bot - top) * 0.45, 0.055, 'Dark', n=12)
            d = (bot - top)
            for i in range(7):
                p = top + d * (0.45 + 0.07 * i)
                torus(p, d, 0.075, 0.012, 'Accent', n=16, m=6)


def lights_front():
    # 窓の下の前照灯の帯（黒い台に灯）と、左右の丸い灯 2 つずつ、センサーの台
    rbox((0, 2.73, 1.78), (1.95, 0.1, 0.24), 'Dark', bevel=0.07, seg=3)
    rbox((0, 2.775, 1.78), (1.75, 0.04, 0.09), 'Lamp', bevel=0.03)
    for sx in (-1, 1):
        for xx in (1.05, 0.72):
            cyl((sx * xx, 2.6, 1.42), (sx * xx, 2.8, 1.42), 0.11, 'Dark', n=24, bevel=0.015)
            cyl((sx * xx, 2.8, 1.42), (sx * xx, 2.815, 1.42), 0.08, 'Lamp', n=24)
        # 屋根の前の作業灯
        rbox((sx * 0.95, 1.5, 3.36), (0.36, 0.12, 0.08), 'Dark', bevel=0.03)
        rbox((sx * 0.95, 1.565, 3.36), (0.3, 0.02, 0.05), 'Lamp', bevel=0.01)
    # バンパー：太い横棒と角のガード、けん引のかぎ
    rbox((0, 2.75, 1.02), (2.55, 0.26, 0.2), 'Mech', bevel=0.07, seg=3)
    rbox((0, 2.89, 1.02), (2.3, 0.04, 0.1), 'Carbon', bevel=0.015)
    for sx in (-1, 1):
        torus((sx * 0.55, 2.93, 0.92), (1, 0, 0), 0.07, 0.018, 'Accent', n=16, m=6)
        rbox((sx * 1.3, 2.72, 1.2), (0.12, 0.3, 0.32), 'Mech', bevel=0.04)
    # 前の下のセンサー（距離を測るレーザーの窓）
    rbox((0, 2.82, 1.25), (0.5, 0.08, 0.12), 'Dark', bevel=0.03)
    rbox((0, 2.865, 1.25), (0.38, 0.01, 0.06), 'Glass', bevel=0.005)


def roof():
    # 放熱板 2 枚：台に載せて浮かせ、上にひれ
    for sx in (-1, 1):
        x = sx * 0.64
        rbox((x, -0.5, 3.34), (1.0, 2.7, 0.05), 'Hull2', bevel=0.02)
        for yy in (-1.7, -0.5, 0.7):
            rbox((x, yy, 3.31), (0.9, 0.08, 0.04), 'Mech', bevel=0.01)
        for i in range(11):
            rbox((x, -1.75 + i * 0.25, 3.385), (0.94, 0.02, 0.04), 'Metal', bevel=0.004)
    # 後ろの太陽電池：屋根の後ろの端に、斜めに立てた 1 枚（枠・ちょうつがい・2 本の支柱）
    tilt = math.radians(-24)
    c = Vector((0, -2.18, 3.98))
    rbox(c, (2.86, 0.05, 0.98), 'Mech', bevel=0.015, rot=(tilt, 0, 0))
    # セルの面は枠の後ろ側（外を向く面）に、少し浮かせて
    rbox(c + Vector((0, -0.028, -0.012)), (2.76, 0.012, 0.9), 'Solar', bevel=0.0, rot=(tilt, 0, 0))
    for sx in (-1, 1):
        cyl((sx * 0.9, -2.0, 3.34), (sx * 0.9, -2.0, 3.6), 0.04, 'Metal')
        cyl((sx * 1.05, -2.0, 3.58), (sx * 0.75, -2.0, 3.58), 0.055, 'Mech', n=14)
        bar((sx * 0.9, -1.75, 3.34), (sx * 0.9, -2.05, 3.85), 0.022)
    # 通信アンテナ（皿・受信部を支える 3 本の支柱・回す台）
    base = Vector((-1.0, 0.85, 3.3))
    cyl(base, base + Vector((0, 0, 0.08)), 0.14, 'Mech', n=20, bevel=0.01)
    bar(base, base + Vector((0, 0, 0.55)), 0.04)
    hub = base + Vector((0, 0.05, 0.6))
    axis = Vector((0, 0.5, 0.6)).normalized()
    cyl(hub, hub + axis * 0.1, 0.07, 'Mech', n=14)
    dish = hub + axis * 0.1
    cyl(dish, dish + axis * 0.12, 0.08, 'Hull', n=32, r2=0.36)
    cyl(dish + axis * 0.12, dish + axis * 0.125, 0.36, 'Hull', n=32)
    torus(dish + axis * 0.125, axis, 0.36, 0.012, 'Mech', n=32, m=6)
    feed = dish + axis * 0.42
    for i in range(3):
        a = i / 3 * math.pi * 2
        side = Vector((math.cos(a), 0, math.sin(a)))
        side -= axis * side.dot(axis)
        side.normalize()
        bar(dish + axis * 0.12 + side * 0.33, feed, 0.008)
    cyl(feed - axis * 0.03, feed + axis * 0.03, 0.035, 'Dark', n=12)
    # 細いアンテナ 2 本
    bar((1.12, 0.75, 3.3), (1.12, 0.75, 4.2), 0.013)
    sphere((1.12, 0.75, 4.21), 0.025, 'Dark', seg=8)
    bar((1.22, 0.45, 3.3), (1.22, 0.45, 3.75), 0.01)
    # 前のステレオカメラの柱（柱・横の腕・2 つのカメラ）と、星の位置を測る小さなカメラ
    cyl((0, 1.55, 3.3), (0, 1.55, 3.62), 0.045, 'Mech', n=14)
    rbox((0, 1.58, 3.66), (0.62, 0.12, 0.1), 'Mech', bevel=0.03)
    for sx in (-1, 1):
        rbox((sx * 0.24, 1.64, 3.66), (0.12, 0.14, 0.1), 'Dark', bevel=0.02)
        cyl((sx * 0.24, 1.7, 3.66), (sx * 0.24, 1.75, 3.66), 0.035, 'Glass', n=16)
    cyl((0.6, -1.2, 3.33), (0.6, -1.2, 3.45), 0.06, 'Dark', n=14, r2=0.05)
    cyl((0.6, -1.2, 3.45), (0.6, -1.2, 3.46), 0.04, 'Glass', n=14)


def rear():
    y = -2.62
    # エアロックのハッチ：角の丸い枠・扉・窓・取っ手・ちょうつがい
    rbox((0, y + 0.01, 2.08), (1.1, 0.1, 1.5), 'Hull2', bevel=0.2, seg=5)
    rbox((0, y - 0.04, 2.08), (0.92, 0.06, 1.32), 'Hull', bevel=0.18, seg=5)
    cyl((0, y - 0.07, 2.42), (0, y - 0.085, 2.42), 0.15, 'Glass', n=28)
    torus((0, y - 0.075, 2.42), (0, 1, 0), 0.155, 0.018, 'Mech', n=28, m=6)
    rbox((0.32, y - 0.1, 1.98), (0.05, 0.06, 0.32), 'Mech', bevel=0.02)
    for zz in (1.6, 2.5):
        rbox((-0.47, y - 0.08, zz), (0.06, 0.08, 0.18), 'Mech', bevel=0.02)
    # スーツポート 2 つ：丸い口（宇宙服の背中をここにつないで出入りする）
    for sx in (-1, 1):
        c = Vector((sx * 0.92, y + 0.02, 2.3))
        cyl(c + Vector((0, 0.02, 0)), c + Vector((0, -0.08, 0)), 0.3, 'Hull2', n=32, bevel=0.02)
        cyl(c + Vector((0, -0.08, 0)), c + Vector((0, -0.1, 0)), 0.24, 'Mech', n=32)
        torus(c + Vector((0, -0.09, 0)), (0, 1, 0), 0.27, 0.02, 'Dark', n=32, m=6)
        for i in range(8):
            a = i / 8 * math.pi * 2
            sphere(c + Vector((math.cos(a) * 0.27, -0.1, math.sin(a) * 0.27)), 0.018, 'Metal', seg=6)
    # 足場とはしご、足場の手すり
    rbox((0, y - 0.42, 1.12), (1.5, 0.7, 0.06), 'Mech', bevel=0.02)
    for i in range(9):
        rbox((-0.6 + i * 0.15, y - 0.42, 1.155), (0.03, 0.66, 0.012), 'Metal', bevel=0.0)
    for sx in (-1, 1):
        bar((sx * 0.45, y - 0.72, 1.1), (sx * 0.45, y - 0.9, 0.25), 0.025)
        bar((sx * 0.74, y - 0.1, 1.12), (sx * 0.74, y - 0.74, 1.12), 0.02)
        bar((sx * 0.74, y - 0.74, 1.12), (sx * 0.74, y - 0.74, 1.6), 0.02)
        bar((sx * 0.74, y - 0.1, 1.6), (sx * 0.74, y - 0.74, 1.6), 0.02)
    for i in range(4):
        t = i / 3
        bar((-0.45, y - 0.72 - 0.18 * t, 1.1 - 0.85 * t), (0.45, y - 0.72 - 0.18 * t, 1.1 - 0.85 * t), 0.02)
    # 後ろの作業灯とカメラ
    for sx in (-1, 1):
        rbox((sx * 1.05, y - 0.02, 3.0), (0.32, 0.07, 0.1), 'Dark', bevel=0.02)
        rbox((sx * 1.05, y - 0.06, 3.0), (0.26, 0.01, 0.05), 'Lamp', bevel=0.005)
    rbox((0, y - 0.04, 3.05), (0.16, 0.1, 0.1), 'Dark', bevel=0.02)


def wheel(name, sx, wy):
    """金網のタイヤに、チタンの山形の板。中心にハブ。オブジェクトの原点が車軸"""
    grp = f'Wheel_{name}'
    c = Vector((sx * WHEEL_X, wy, WHEEL_R))
    hw = WHEEL_W / 2
    # タイヤの筒（両の縁を丸く）
    tyre = cyl(c + Vector((-hw, 0, 0)), c + Vector((hw, 0, 0)), WHEEL_R - 0.045, 'Tyre', n=48, group=grp, bevel=0.04)
    # 山形の板：1 周に 24 組。外へ少し出し、車輪の幅いっぱい（V の字）
    for i in range(20):
        a = i / 20 * math.pi * 2
        rad = Vector((0, math.sin(a), math.cos(a)))
        tan = Vector((0, math.cos(a), -math.sin(a)))
        for side in (-1, 1):
            # 山形の片方：車輪の幅の向きから、回る向きへ 25° 傾けた板
            d = Vector((side, 0, 0)) * math.cos(0.45) + tan * math.sin(0.45)
            p = c + rad * (WHEEL_R - 0.028) + Vector((side * hw * 0.5, 0, 0)) + tan * (math.sin(0.45) * hw * 0.5)
            obox(p, d, rad.cross(d), rad, hw * 0.55, 0.022, 0.014, 'Lug', group=grp)
    # 縁の輪（金属）とハブ：外側の円板・6 本のスポーク・まんなかのふた・ボルト
    for side in (-1, 1):
        torus(c + Vector((side * (hw - 0.01), 0, 0)), (1, 0, 0), WHEEL_R - 0.05, 0.03, 'Metal', n=48, m=8, group=grp)
    face = c + Vector((sx * (hw - 0.02), 0, 0))
    cyl(face - Vector((sx * 0.06, 0, 0)), face + Vector((sx * 0.02, 0, 0)), 0.42, 'Mech', n=40, group=grp, bevel=0.01)
    cyl(face + Vector((sx * 0.02, 0, 0)), face + Vector((sx * 0.08, 0, 0)), 0.2, 'Mech', n=28, group=grp, bevel=0.015)
    cyl(face + Vector((sx * 0.08, 0, 0)), face + Vector((sx * 0.12, 0, 0)), 0.1, 'Metal', n=20, group=grp, bevel=0.01)
    for i in range(6):
        a = i / 6 * math.pi * 2
        p = face + Vector((sx * 0.025, math.sin(a) * 0.3, math.cos(a) * 0.3))
        rbox(p, (0.04, 0.08, 0.2), 'Hull2', bevel=0.012, group=grp, rot=(-a, 0, 0))
        sphere(face + Vector((sx * 0.085, math.sin(a + 0.5) * 0.15, math.cos(a + 0.5) * 0.15)), 0.018, 'Metal', group=grp, seg=6)
    return tyre


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for m in MATS:
        material(m)
    cabin()
    underbody()
    suspension()
    lights_front()
    roof()
    rear()
    # 車輪は 1 つだけ作り、ほかの 5 つは同じ形を使い回す（左は x を裏返す）。glb の形も、焼く絵の場所も 1 つぶんで済む
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
            k = name[6:]
            sx = 1 if k[1] == 'R' else -1
            bpy.context.scene.cursor.location = Vector((sx * WHEEL_X, WHEEL_Y[k[0]], WHEEL_R))
            bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        # 角の立った面はかくっと、丸い面はなめらかに
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
    tris = sum(len(p.vertices) - 2 for o in (objs['Body'], objs['Wheel_FR']) for p in o.data.polygons)
    print(f'size {hi.x - lo.x:.2f} x {hi.y - lo.y:.2f} x {hi.z - lo.z:.2f} (z {lo.z:.2f}..{hi.z:.2f})  tris {tris}', flush=True)
    return objs


# ---- 質感の焼き込み（BAKE=1）。着陸船・無人ローバーと同じやり方（build_amatsukaze.py の道具を使う） ----------------


def node_edge_m(nt, m):
    """角の強さ（ベベルの法線と本当の法線のずれ）。半径 1.5 cm"""
    bev = nt.nodes.new('ShaderNodeBevel')
    bev.samples = 8
    bev.inputs['Radius'].default_value = 0.015
    g = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    nt.links.new(bev.outputs[0], dot.inputs[0])
    nt.links.new(g.outputs['Normal'], dot.inputs[1])
    sub = nt.nodes.new('ShaderNodeMath')
    sub.operation = 'SUBTRACT'
    sub.inputs[0].default_value = 1
    nt.links.new(dot.outputs['Value'], sub.inputs[1])
    return sub.outputs[0]


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
    nx, ny, nz = nrm[..., 0], nrm[..., 1], nrm[..., 2]
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
    white = is_m('Hull')
    alu = is_m('Hull2')
    dark = is_m('Dark') | is_m('Carbon') | is_m('Accent')
    bare = is_m('Metal') | is_m('Mech') | alu | is_m('Lug')
    painted = white | dark | alu
    gold = is_m('Gold')
    tyre = is_m('Tyre')

    # 1. むら
    n_big = ba.value_noise(pos, 0.5, 21)
    n_mid = ba.value_noise(pos, 2.2, 22)
    n_fine = ba.value_noise(pos, 9.0, 23)
    base *= (1 + (n_big - 0.5) * 0.06 + (n_mid - 0.5) * 0.04)[..., None]
    rough += (n_mid - 0.5) * 0.1 + (n_fine - 0.5) * 0.06

    # 2. 金属のヘアライン
    axis = np.argmax(np.abs(nrm), axis=-1)
    hair = ba.value_noise(np.stack([x * 0.5, y * 20, z * 0.5], -1), 1.0, 24)
    hair2 = ba.value_noise(np.stack([x * 20, y * 0.5, z * 0.5], -1), 1.0, 25)
    brushed = np.where(axis == 0, hair, hair2)
    rough[bare] += ((brushed - 0.5) * 0.2)[bare]
    base[bare] *= (1 + (brushed[bare] - 0.5) * 0.1)[..., None]

    # 3. キャビンのパネル割り（面の向きで投影を変える）と留め具
    cab = white & (z > 1.0)
    a = np.where(axis == 1, x, y)
    b = np.where(axis == 2, x, z)
    pan = bl.Panels(91, lo=-1.0, hi=5.0, along=4.0)
    da, db, pid = pan.sample(a * 1.0, b * 1.0 + axis * 0.37)
    dist = np.minimum(da, db)
    G = 0.006
    groove = np.clip(1 - dist / (G * 2.0), 0, 1) * cab
    height -= groove * 0.9
    hp = ba.hash2(pid, axis * 1.0, 2.0)
    base[white] *= (1 + (hp[white] - 0.5) * 0.05)[..., None]
    base *= (1 - 0.55 * groove)[..., None]
    PITCH = 0.12
    fa = np.abs(np.mod(a, PITCH) / PITCH - 0.5)
    fb = np.abs(np.mod(b, PITCH) / PITCH - 0.5)
    rivet = cab & (((np.abs(db - 0.035) < 0.007) & (fa < 0.06)) | ((np.abs(da - 0.035) < 0.007) & (fb < 0.06)))
    rivet &= ba.hash2(pid, 3.0, 9.0) < 0.6
    height[rivet] += 0.6
    base[rivet] = base[rivet] * 0.55 + srgb('#8f949b') * 0.45
    metal[rivet] = 0.8
    rough[rivet] = 0.35

    # 4. 窓：濃いガラス（つやつや）と黒い枠。角は丸く。枠のまわりに溝
    def round_rect(u, v, u0, u1, v0, v1, r):
        cu = np.clip(u, u0 + r, u1 - r)
        cv = np.clip(v, v0 + r, v1 - r)
        d = r - np.hypot(u - cu, v - cv)  # 内側で +
        return d
    win_d = np.full(x.shape, -9.0, dtype=np.float32)
    front = cab & (ny > 0.25) & (nz > 0.15)
    for (x0, x1, z0, z1) in FRONT_WIN:
        d = round_rect(x, z, x0, x1, z0, z1, 0.16)
        win_d = np.where(front, np.maximum(win_d, d), win_d)
    side = cab & (np.abs(nx) > 0.75)
    for (y0, y1, z0, z1) in SIDE_WIN:
        d = round_rect(y, z, y0, y1, z0, z1, 0.12)
        win_d = np.where(side, np.maximum(win_d, d), win_d)
    glass = win_d > 0.035
    frame = (win_d > 0) & ~glass
    rim = (win_d > -0.012) & (win_d <= 0)
    base[frame] = srgb('#1f2226')
    rough[frame] = 0.5
    metal[frame] = 0.1
    height[frame] += 0.4
    height[rim] -= 1.0
    base[rim] *= 0.5
    base[glass] = srgb('#0b1420')
    rough[glass] = 0.03
    metal[glass] = 0.35
    # ガラスに映る、ぼんやりした明るさのむら（空と地面の映り込みのかわり）
    base[glass] *= (0.8 + 0.5 * np.clip((z[glass] - 2.3) / 0.9, 0, 1))[..., None]
    win = glass | frame

    # 5. 横の印：満ち欠けの紋（金の円に白い円を重ねた三日月）と、読めない短い棒の列（どの国の文字でもない）
    for sx in (-1, 1):
        sideS = cab & (nx * sx > 0.75)
        d1 = np.hypot(y - (-0.95), z - 2.55)
        d2 = np.hypot(y - (-0.86), z - 2.6)
        moon = sideS & (d1 < 0.26) & (d2 > 0.22)
        base[moon] = srgb('#c9952f')
        metal[moon] = 0.6
        rough[moon] = 0.35
        ring_ = sideS & (np.abs(d1 - 0.3) < 0.01)
        base[ring_] = srgb('#2a2d33')
        import random
        rr = random.Random(7 + sx)
        yy = -2.05
        for _ in range(9):
            w_ = rr.choice([0.03, 0.045, 0.06, 0.09])
            m_ = sideS & (y > yy) & (y < yy + w_) & (z > 2.22) & (z < 2.32)
            base[m_] = srgb('#2a2d33')
            yy += w_ + rr.choice([0.02, 0.02, 0.05])
        # 青い細い線（窓の下の高さに 1 本）
        line = sideS & (np.abs(z - 2.12) < 0.012) & (y > -2.3) & (y < 2.0)
        base[line] = srgb('#2f7fd0')
    # 前の上（窓の上）に、注意の黄色い印（牽引・つかむ場所の目印）
    # 後ろのハッチのまわりの注意の斜めじま
    hz = valid & (alu) & (y < -2.55) & (np.abs(x) < 0.6) & (z > 1.3) & (z < 2.85)
    stripe = np.mod((x + z) / 0.08, 1) < 0.5
    hzr = hz & ((np.abs(x) > 0.5) | (z < 1.4) | (z > 2.75))
    base[hzr & stripe] = srgb('#d9a21b')
    base[hzr & ~stripe] = srgb('#1d1f22')

    # 6. 断熱材（金色のしわ）
    wr = ba.value_noise(pos, 14.0, 31)
    wr2 = ba.value_noise(pos, 40.0, 32)
    height[gold] += ((wr - 0.5) * 1.6 + (wr2 - 0.5) * 0.8)[gold]
    base[gold] *= (1 + (wr[gold] - 0.5) * 0.35)[..., None]
    rough[gold] += ((wr2 - 0.5) * 0.25)[gold]

    # 7. 太陽電池：セルの格子
    sol = is_m('Solar')
    cell = (np.mod(x / 0.156, 1) < 0.05) | (np.mod(z / 0.156, 1) < 0.05)
    base[sol & cell] = srgb('#7a818c')
    metal[sol & cell] = 0.9
    base[sol] *= (1 + (ba.hash2(np.floor(x / 0.156), np.floor(z / 0.156)) - 0.5) * 0.15)[sol][..., None]
    # 放熱板：白く、細かいむら
    # 8. タイヤ：金網（車輪の軸まわりの角度と幅の向きで、ひし形の網目）。回っても模様はずれない
    for name, (cx, cy, cz) in wheels.items():
        sel = valid & (part_name == name) & tyre
        ang = np.arctan2(z - cz, y - cy)
        u = ang * WHEEL_R / 0.035
        v = (x - cx) / 0.035
        m1 = np.abs(np.mod(u + v, 1) - 0.5) < 0.12
        m2 = np.abs(np.mod(u - v, 1) - 0.5) < 0.12
        wire = sel & (m1 | m2)
        hole = sel & ~(m1 | m2)
        base[hole] = srgb('#141518')
        metal[hole] = 0.2
        rough[hole] = 0.8
        height[wire] += 0.6
        height[hole] -= 0.6

    # 9. 汚れ：月の砂（灰色）。低いところほど濃い。車輪とその上の泥よけはたっぷり、上を向いた面にも少し
    regolith = srgb('#85827c')
    grime = srgb('#2e2c29')
    low = np.clip((1.9 - z) / 1.5, 0, 1) ** 1.3
    dust = low * (0.3 + 0.7 * n_mid)
    splat = np.clip((ba.value_noise(pos, 7.0, 27) - 0.5) * 5, 0, 1) * np.clip((1.8 - z) / 0.8, 0, 1)
    dust += splat * 0.5 * ~on_wheel
    dust += on_wheel * (0.35 + 0.4 * n_mid)
    dust += np.clip(nz, 0, 1) * (0.1 + 0.4 * np.clip((n_mid - 0.35) * 2, 0, 1)) * 0.6
    dust *= valid & ~is_m('Lamp') & ~glass
    dust[glass] = 0
    dust = np.clip(dust, 0, 0.85)
    dust[win] *= 0.25
    base = base * (1 - dust[..., None] * 0.75) + regolith * dust[..., None] * 0.75
    rough += dust * 0.35
    metal *= 1 - dust * 0.7
    # すき間の黒ずみ
    cav = np.clip((0.8 - ao) * 2.2, 0, 1) * valid * (0.6 + 0.4 * n_fine)
    base = base * (1 - cav[..., None] * 0.5) + grime * cav[..., None] * 0.5
    rough += cav * 0.12
    # 縦の筋（車体の側面、上から下へ）
    sn = ba.value_noise(np.stack([x * 16, y * 16, z * 0.6], -1), 1.0, 26)
    streak = np.clip((sn - 0.5) * 3.5, 0, 1) * (np.abs(nx) > 0.5) * white * np.clip((2.6 - z) / 1.2, 0, 1) * ~win
    base = base * (1 - streak[..., None] * 0.25) + grime * streak[..., None] * 0.25
    # 角の塗装のはげ
    wear = edge * np.clip((n_fine - 0.3) * 2.4, 0, 1)
    ww = wear * white
    base = base * (1 - ww[..., None] * 0.6) + srgb('#9aa0a8') * ww[..., None] * 0.6
    metal += ww * 0.8
    rough -= ww * 0.25
    wd = wear * dark
    base *= (1 + 0.5 * wd)[..., None]
    wb = edge * bare
    base *= (1 + 0.2 * wb)[..., None]
    rough -= wb * 0.12
    # AO
    base *= (0.5 + 0.5 * ao)[..., None]

    # 10. ノーマル
    nrm_map = np.zeros(pos.shape, dtype=np.float32)
    nrm_map[..., 2] = 1
    hs = bl.ndimage_gauss(height, 0.6)
    texel = ba.estimate_texel(pos, valid)
    cont_x = valid & np.roll(valid, -1, 1) & (np.linalg.norm(np.roll(pos, -1, 1) - pos, axis=-1) < texel * 3)
    cont_y = valid & np.roll(valid, -1, 0) & (np.linalg.norm(np.roll(pos, -1, 0) - pos, axis=-1) < texel * 3)
    gx = np.where(cont_x, np.roll(hs, -1, 1) - hs, 0)
    gy = np.where(cont_y, np.roll(hs, -1, 0) - hs, 0)
    nrm_map[..., 0] = -gx * 0.9
    nrm_map[..., 1] = -gy * 0.9
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
    scene.world.light_settings.distance = 0.5
    parts = list(objs.keys())
    for i, name in enumerate(parts):
        objs[name].pass_index = i + 1
    wheels = {n: tuple(objs[n].matrix_world.translation) for n in parts if n.startswith('Wheel')}
    # 焼くのは車体と、もとの車輪 1 つだけ（ほかの車輪は同じ形・同じ絵）
    olist = [objs['Body'], objs['Wheel_FR']]
    ba.unwrap(olist)
    t = time.time()
    Pm = ba.bake_pass(olist, 'P', 'EMIT', ba.node_position)
    Nm = ba.bake_pass(olist, 'N', 'EMIT', ba.node_normal)
    IDm = ba.bake_pass(olist, 'ID', 'EMIT', ba.node_ids)
    Em = ba.bake_pass(olist, 'EDGE', 'EMIT', node_edge_m, samples=8)
    AOm = ba.bake_pass(olist, 'AO', 'AO', None, samples=int(os.environ.get('AO_SAMPLES', '48')))
    print(f'  bakes {time.time() - t:.0f}s', flush=True)
    base, rough, metal, nrm, valid = compose(Pm, Nm, IDm, AOm, Em, parts, wheels)
    del Pm, Nm, IDm, AOm, Em
    orm = np.stack([np.ones_like(rough), rough, metal], -1)
    nrm_rgb = nrm * 0.5 + 0.5
    if SUPER > 1:
        # 大きく焼いてから縮める（窓の縁や紋の輪郭がぎざぎざにならないように）。島の外は平均に入れない
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
    tex_dir = os.environ.get('TEX_DIR', '/tmp/claude-0/crew-tex')
    os.makedirs(tex_dir, exist_ok=True)
    black = np.zeros_like(base)
    images = {
        'base': ba.save_image('crew_base', ba.to_srgb(base), 'sRGB', os.path.join(tex_dir, 'base.png')),
        'orm': ba.save_image('crew_orm', orm, 'Non-Color', os.path.join(tex_dir, 'orm.png')),
        'normal': ba.save_image('crew_normal', nrm_rgb, 'Non-Color', os.path.join(tex_dir, 'normal.png')),
        'emit': ba.save_image('crew_emit', black, 'sRGB', os.path.join(tex_dir, 'emit.png')),
    }
    baked = ba.final_material(images)
    for link in list(baked.node_tree.links):
        if link.to_socket.name == 'Emission Color':
            baked.node_tree.links.remove(link)
    baked.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value = 0.0
    lamp = bpy.data.materials['Lamp']
    lamp.name = 'Lamp_bake'
    live = bpy.data.materials.new('Lamp')
    live.use_nodes = True
    bsdf = live.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (1, 0.95, 0.85, 1)
    bsdf.inputs['Emission Color'].default_value = (1, 0.95, 0.85, 1)
    bsdf.inputs['Emission Strength'].default_value = 8
    for o in olist:
        mesh = o.data
        old = [m.name for m in mesh.materials]
        slots = ['Baked'] + (['Lamp'] if 'Lamp_bake' in old else [])
        remap = np.array([1 if n == 'Lamp_bake' else 0 for n in old], dtype=np.int32)
        idx = np.empty(len(mesh.polygons), dtype=np.int32)
        mesh.polygons.foreach_get('material_index', idx)
        mesh.materials.clear()
        for n in slots:
            mesh.materials.append(baked if n == 'Baked' else live)
        mesh.polygons.foreach_set('material_index', remap[idx])
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
    bpy.ops.mesh.primitive_plane_add(size=80)
    g = bpy.context.object
    gm = bpy.data.materials.new('ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.155, 0.15, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    g.data.materials.append(gm)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4.5
    sun.data.angle = math.radians(0.6)
    sun.rotation_euler = (math.radians(55), 0, math.radians(-140))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 40
    scene.collection.objects.link(cam)
    scene.camera = cam
    views = {
        'hero': ((9.5, 9.0, 3.4), (0, 0.2, 1.8), 40),
        'rear': ((-7.0, -9.5, 3.2), (0, -0.5, 1.8), 40),
        'side': ((13.0, 0, 2.0), (0, 0, 1.8), 40),
        'front': ((0, 13.0, 2.0), (0, 0, 1.8), 40),
        'top': ((6.0, 5.0, 11.0), (0, 0, 1.5), 40),
        'wheel': ((4.6, 3.6, 1.3), (1.95, 2.05, 0.8), 55),
    }
    for v in os.environ.get('VIEWS', 'hero,rear,side,front').split(','):
        pos, look, lens = views[v]
        cam.data.lens = lens
        cam.location = pos
        d = Vector(look) - Vector(pos)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'crew-{v}.png')
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
