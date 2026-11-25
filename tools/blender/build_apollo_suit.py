"""
アポロ 17 号の宇宙服（A7LB）を作って public/models/apollo-suit.glb に書き出す。

アプリの宇宙飛行士（src/components/surface/astronaut.ts の Rig）と同じ関節の位置で、部品ごとの固い形に分けて作る。
three.js 側（src/components/surface/apolloSuit.ts）は、部品を Rig の関節の箱（Group）に入れるだけで動く。

部品の名前は「関節__印」：関節は torso / shoulder0 / elbow0 / shoulder1 / elbow1 / hip0 / knee0 / hip1 / knee1、
印（無くてもよい）は、着る人や場面で出したり消したりするもの：
  plss … 月面の背中の生命維持装置（PLSS）と、その上の非常用酸素（OPS）
  ops  … 船外活動の司令船パイロット（エバンス飛行士）が背負った非常用酸素だけ
  leva … ヘルメットの上にかぶる日よけ（金色のバイザーと横の日よけ）
  cdr  … 船長（サーナン飛行士）の赤い帯（腕・脚・日よけの上）
  rcu  … 月面で胸に付けた操作箱（カメラの台つき）
番号 0 は体の左（three.js の +X）。体の正面は three.js の +Z（Blender では -Y）。

形のポイント（実物の写真から）：
  白いベータ布の、たっぷりしたしわ。関節のじゃばら（肩・ひじ・ひざ）は布の下でふくらんで見える。
  首の金属リングと、丸い泡のヘルメット。胸の 2 列の酸素の口（青が入り口、赤が出口）。
  手首の回るリング（左が赤、右が青）。手袋の指先は青灰色のシリコーン。月面用の上ばき（白、青灰色の厚い底）。
  左の手首に、作業の手順書（カフ・チェックリスト）。ももにポケット。

すき間の暗さ（AO）は頂点の色に焼く（UV もテクスチャもいらない）。布の織り目は、小さな繰り返しのノーマルマップ 1 枚。

実行（Blender の Python モジュール bpy の入った Python で）:
  python3 -m venv ~/.bpyvenv && ~/.bpyvenv/bin/pip install bpy
  ~/.bpyvenv/bin/python tools/blender/build_apollo_suit.py           # 書き出す
  PREVIEW=/tmp/suit ~/.bpyvenv/bin/python tools/blender/build_apollo_suit.py   # 確認の絵も描く
  AO=0 ...                                                            # AO を焼かない（速い）
そのあと node tools/glb/compress.mjs public/models/apollo-suit.glb
"""

import math
import os

import bpy  # noqa: I001（bmesh より先に読む）
import bmesh
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('OUT', os.path.join(ROOT, 'public', 'models', 'apollo-suit.glb'))
PREVIEW = os.environ.get('PREVIEW', '')
AO = os.environ.get('AO', '1') != '0'
SEED = 17

# 関節（Blender の座標：Z が上、-Y が正面）。astronaut.ts の HIP_Y・THIGH・SHIN と肩・ひじの位置に合わせる
HIP_Y = 0.98
J = {
    'torso': (0.0, 0.0, HIP_Y),
    'shoulder0': (0.35, 0.0, HIP_Y + 0.55),
    'shoulder1': (-0.35, 0.0, HIP_Y + 0.55),
    'elbow0': (0.35, 0.0, HIP_Y + 0.25),
    'elbow1': (-0.35, 0.0, HIP_Y + 0.25),
    'hip0': (0.125, 0.0, HIP_Y),
    'hip1': (-0.125, 0.0, HIP_Y),
    'knee0': (0.125, 0.0, HIP_Y - 0.44),
    'knee1': (-0.125, 0.0, HIP_Y - 0.44),
}
ANKLE_Z = HIP_Y - 0.88
ARM_INSET = 0.045

rng = np.random.default_rng(SEED)
_MB = 0

# ---- 材質 ------------------------------------------------------------------------------------

MAT_DEF = {
    # 名前: (色, ラフネス, メタリック)
    'Beta': ((0.84, 0.82, 0.76), 0.9, 0.0),  # ベータ布（ガラス繊維の白い布）
    'Hard': ((0.9, 0.9, 0.88), 0.45, 0.0),  # 日よけの殻・背中の箱（白い固い殻）
    'Metal': ((0.62, 0.64, 0.66), 0.32, 1.0),  # 首・手首・腰のアルミのリング
    'Red': ((0.7, 0.07, 0.05), 0.28, 0.85),  # アルマイト（色つきの金属）
    'Blue': ((0.06, 0.2, 0.62), 0.28, 0.85),
    'Silicone': ((0.33, 0.38, 0.44), 0.7, 0.0),  # 指先・靴底の青灰色のゴム
    'Dark': ((0.05, 0.05, 0.055), 0.6, 0.2),
    'Gold': ((1.0, 0.72, 0.28), 0.08, 1.0),  # 金のバイザー
    'Bubble': ((0.9, 0.93, 0.95), 0.02, 0.0),  # 透明な泡のヘルメット（three.js で透明にする）
    'Stripe': ((0.4, 0.075, 0.065), 0.9, 0.0),  # 船長の赤い帯（布に縫った赤い布：つやなし、少しくすんだ赤）
    'Paper': ((0.82, 0.8, 0.72), 0.95, 0.0),  # 手順書の紙
    'Boot': ((0.5, 0.49, 0.45), 0.9, 0.0),
    'Decal': ((1.0, 1.0, 1.0), 0.75, 0.0),  # 胸と肩の印（tools/blender/apollo_decals.png）  # 月面用ブーツの布（灰色がかったベータ布）
}
MATS = {}


def weave_normal(path, n=128):
    """ベータ布の織り目（たてよこの糸）のノーマルマップを PNG に描く。繰り返して使う"""
    x = np.arange(n)
    X, Y = np.meshgrid(x, x)
    k = 2 * np.pi * 16 / n
    warp = np.sin(X * k) * (np.sin(Y * k / 2) > 0)
    weft = np.sin(Y * k) * (np.sin(Y * k / 2) <= 0)
    h = warp + weft + rng.normal(0, 0.15, (n, n))
    gy, gx = np.gradient(h)
    s = 0.6
    nx, ny, nz = -gx * s, -gy * s, np.ones_like(h)
    L = np.sqrt(nx * nx + ny * ny + nz * nz)
    img = np.stack([nx / L * 0.5 + 0.5, ny / L * 0.5 + 0.5, nz / L * 0.5 + 0.5, np.ones_like(h)], -1)
    im = bpy.data.images.new('weave', n, n, alpha=False)
    im.pixels = img[::-1].astype(np.float32).ravel()
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()
    im.colorspace_settings.name = 'Non-Color'
    return im


def make_materials():
    weave = weave_normal('/tmp/apollo-suit-weave.png')
    for name, (col, rough, metal) in MAT_DEF.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*col, 1.0)
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        if name in ('Beta', 'Stripe', 'Boot'):
            tex = nt.nodes.new('ShaderNodeTexImage')
            tex.image = weave
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nm.inputs['Strength'].default_value = 0.35
            nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        if name == 'Decal':
            tex = nt.nodes.new('ShaderNodeTexImage')
            tex.image = bpy.data.images.load(os.path.join(ROOT, 'tools', 'blender', 'apollo_decals.png'))
            nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if name == 'Bubble':
            bsdf.inputs['Alpha'].default_value = 0.18
        MATS[name] = m


# ---- 形を作る道具 ------------------------------------------------------------------------------


class Part:
    """ひとつの部品（Blender の 1 オブジェクト）。頂点は世界の座標で足していき、最後に関節を原点にする"""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mat_index = {}

    def mi(self, mat):
        if mat not in self.mat_index:
            self.mat_index[mat] = len(self.mat_index)
        return self.mat_index[mat]

    def add_grid(self, rows, mat, close_u=True, cap0=False, cap1=False, smooth=True):
        """rows：輪っかの点の並び（同じ数）。となりの輪をつないで筒にする"""
        bm = self.bm
        vs = [[bm.verts.new(p) for p in row] for row in rows]
        m = self.mi(mat)
        nu = len(rows[0])
        for a, b in zip(vs, vs[1:]):
            for i in range(nu if close_u else nu - 1):
                j = (i + 1) % nu
                f = bm.faces.new((a[i], a[j], b[j], b[i]))
                f.material_index = m
                f.smooth = smooth
        for cap, row, flip in ((cap0, vs[0], True), (cap1, vs[-1], False)):
            if cap:
                c = bm.verts.new(tuple(np.mean([v.co for v in row], 0)))
                for i in range(nu):
                    j = (i + 1) % nu
                    f = bm.faces.new((row[j], row[i], c) if flip else (row[i], row[j], c))
                    f.material_index = m
                    f.smooth = smooth

    def lathe(self, profile, mat, center=(0, 0, 0), seg=24, sx=1.0, sy=1.0, axis=None, cap0=False, cap1=False, wobble=0.0, flat_back=0.0):
        """profile：(半径, 高さ) の並び。center の上下に回して筒にする。axis があれば、その向きに倒す"""
        rot = rot_to(axis) if axis else Matrix.Identity(3)
        rows = []
        for k, (r, h) in enumerate(profile):
            row = []
            for i in range(seg):
                a = 2 * math.pi * i / seg
                rr = r * (1 + wobble * noise1(k * 7.1 + i * 0.37 + len(self.name)))
                x, y = math.cos(a) * rr * sx, math.sin(a) * rr * sy
                if flat_back and y > 0:
                    y *= 1 - flat_back
                p = rot @ Vector((x, y, h))
                row.append(tuple(Vector(center) + p))
            rows.append(row)
        self.add_grid(rows, mat, cap0=cap0, cap1=cap1)

    def box(self, center, size, mat, bevel=0.01, rot=None, seg=2):
        """角の丸い箱（丸めは bmesh の bevel で）"""
        bm2 = bmesh.new()
        bmesh.ops.create_cube(bm2, size=1.0)
        for v in bm2.verts:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if bevel > 0:
            bmesh.ops.bevel(bm2, geom=list(bm2.edges), offset=min(bevel, min(size) * 0.45), segments=seg, affect='EDGES', profile=0.5)
        R = rot_euler(rot) if rot else Matrix.Identity(3)
        self.merge(bm2, mat, lambda co: Vector(center) + R @ co)

    def sphere(self, center, r, mat, scale=(1, 1, 1), seg=24, rings=16, cut=None, rot=None):
        """球（cut=(z0, z1) なら、その高さのあいだの帯だけ。z は -1〜1 の割合）"""
        rows = []
        z0, z1 = cut if cut else (-1, 1)
        R = rot_euler(rot) if rot else Matrix.Identity(3)
        for k in range(rings + 1):
            t = math.acos(z1) + (math.acos(z0) - math.acos(z1)) * k / rings
            z, rr = math.cos(t), math.sin(t)
            row = [tuple(Vector(center) + R @ Vector((math.cos(2 * math.pi * i / seg) * rr * r * scale[0], math.sin(2 * math.pi * i / seg) * rr * r * scale[1], z * r * scale[2]))) for i in range(seg)]
            rows.append(row)
        self.add_grid(rows, mat, cap0=cut is not None and z1 < 1, cap1=cut is not None and z0 > -1)

    def tube(self, pts, r, mat, seg=10, n=24, cap=True, ribs=0.0, ribn=0):
        """点を通るなめらかなホース（ribs があれば、じゃばらのホース）"""
        P = catmull(pts, n)
        rows = []
        prev = None
        for k, p in enumerate(P):
            t = P[min(k + 1, len(P) - 1)] - P[max(k - 1, 0)]
            t.normalize()
            if prev is None:
                ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
                u = t.cross(ref).normalized()
            else:
                u = (prev - t * prev.dot(t)).normalized()
            prev = u
            w = t.cross(u)
            rr = r * (1 + ribs * math.sin(k / max(1, len(P) - 1) * math.pi * 2 * ribn)) if ribn else r
            rows.append([tuple(p + (u * math.cos(2 * math.pi * i / seg) + w * math.sin(2 * math.pi * i / seg)) * rr) for i in range(seg)])
        self.add_grid(rows, mat, cap0=cap, cap1=cap)

    def blob(self, elems, mat, res=0.011, smooth=3):
        """ふくらんだ形：楕円の玉（中心、(x, y, z) の半径＝表面の大きさ）をなめらかにつないだ 1 つの面（メタボール）"""
        global _MB
        _MB += 1
        mb = bpy.data.metaballs.new(f'mb{_MB}')
        mb.resolution = mb.render_resolution = res
        mb.threshold = 0.6
        for c, (rx, ry, rz) in elems:
            e = mb.elements.new(type='ELLIPSOID')
            e.co = c
            r = max(rx, ry, rz)
            e.radius = r / 0.683
            e.size_x, e.size_y, e.size_z = rx / r, ry / r, rz / r
            e.stiffness = 2.0
        ob = bpy.data.objects.new(f'blob{_MB}x', mb)
        bpy.context.scene.collection.objects.link(ob)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        bpy.data.objects.remove(ob)
        bm2 = bmesh.new()
        bm2.from_mesh(me)
        bpy.data.meshes.remove(me)
        for _ in range(smooth):
            bmesh.ops.smooth_vert(bm2, verts=bm2.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        self.merge(bm2, mat, lambda co: co)

    def front(self, x, z, y0=-1.0):
        """正面（-Y の側）から見た、いまの形の表面の y"""
        from mathutils.bvhtree import BVHTree
        self.bm.verts.ensure_lookup_table()
        tree = BVHTree.FromBMesh(self.bm)
        hit = tree.ray_cast(Vector((x, y0, z)), Vector((0, 1, 0)))
        return hit[0].y if hit[0] else -0.2

    def merge(self, bm2, mat, xf):
        m = self.mi(mat)
        vmap = {}
        for v in bm2.verts:
            vmap[v] = self.bm.verts.new(tuple(xf(v.co)))
        for f in bm2.faces:
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            nf.material_index = m
            nf.smooth = True
        bm2.free()

    def build(self, joint, subdiv=0, wrinkle=0.0, wrinkle_scale=0.06, budget=4000, folds=None):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        mats = sorted(self.mat_index.items(), key=lambda kv: kv[1])
        for name, _ in mats:
            me.materials.append(MATS[name])
        bpy.context.view_layer.objects.active = ob
        if subdiv:
            mod = ob.modifiers.new('sub', 'SUBSURF')
            mod.levels = subdiv
            mod.render_levels = subdiv
        if wrinkle:
            # 布のしわ：大きなゆるい波（ふくらみ）と、細かいしわ
            tex = bpy.data.textures.new(self.name + '_wr', 'CLOUDS')
            tex.noise_scale = wrinkle_scale
            tex.noise_depth = 2
            d = ob.modifiers.new('wr', 'DISPLACE')
            d.texture = tex
            d.strength = wrinkle
            d.mid_level = 0.5
            d.texture_coords = 'GLOBAL'
            tex2 = bpy.data.textures.new(self.name + '_wr2', 'STUCCI')
            tex2.noise_scale = wrinkle_scale * 0.45
            tex2.stucci_type = 'WALL_OUT'
            d2 = ob.modifiers.new('wr2', 'DISPLACE')
            d2.texture = tex2
            d2.strength = wrinkle * 0.35
            d2.texture_coords = 'GLOBAL'
        for mod in list(ob.modifiers):
            with bpy.context.temp_override(object=ob):
                bpy.ops.object.modifier_apply(modifier=mod.name)
        if folds:
            add_folds(me, **folds)
        # 面を減らす（スマホのため）：形の大事なところは残る collapse
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        if tris > budget:
            dm = ob.modifiers.new('dec', 'DECIMATE')
            dm.ratio = budget / tris
            with bpy.context.temp_override(object=ob):
                bpy.ops.object.modifier_apply(modifier='dec')
        # 関節を原点に
        off = Vector(J[joint])
        me.transform(Matrix.Translation(-off))
        ob.location = off
        # 織り目のための UV（箱の投影、5 cm で 1 回くり返す）
        uv_box(me, 0.022)
        return ob


def add_folds(me, origin, axis, t0, t1, lam=0.055, amp=0.006, ends=(0.6, 1.0), seed=0.0):
    """布のしわ：腕や脚の軸にそって、たたまれた布の折り目（谷は細く鋭く、山はなだらか）。
    折り目は軸のまわりで斜めに波打ち、ところどころ消える。関節に近い両端ほど深い。ベータ布の面だけ"""
    from mathutils import noise
    origin, axis = Vector(origin), Vector(axis).normalized()
    ref = Vector((0, -1, 0)) if abs(axis.y) < 0.9 else Vector((1, 0, 0))
    e1 = (ref - axis * ref.dot(axis)).normalized()
    e2 = axis.cross(e1)
    beta = me.materials.find('Beta')
    ok = np.zeros(len(me.vertices), bool)
    for poly in me.polygons:
        if poly.material_index == beta:
            ok[list(poly.vertices)] = True
    n = len(me.vertices)
    co = np.zeros(n * 3, np.float32)
    nr = np.zeros(n * 3, np.float32)
    me.vertices.foreach_get('co', co)
    me.vertices.foreach_get('normal', nr)
    co, nr = co.reshape(-1, 3), nr.reshape(-1, 3)
    o, ax, a1, a2 = np.array(origin), np.array(axis), np.array(e1), np.array(e2)
    rel = co - o
    t = rel @ ax
    sel = ok & (t >= t0) & (t <= t1)
    th = np.arctan2(rel @ a2, rel @ a1)
    d = np.zeros(n, np.float32)
    for i in np.nonzero(sel)[0]:
        p = Vector(co[i])
        x = t[i] / lam + 0.45 * math.sin(th[i] + seed) + 0.18 * math.sin(3 * th[i] + seed * 2.3) + 0.25 * noise.noise(p * 4.0)
        crease = abs(math.sin(math.pi * x)) ** 0.5 - 0.62
        env = min(1.0, max(0.15, 0.7 + 1.1 * noise.noise(p * 5.0 + Vector((seed, 0, 0)))))
        u = (t[i] - t0) / max(1e-6, t1 - t0)
        w = 0.35 + 0.65 * max(ends[0] * math.exp(-(u / 0.18) ** 2), ends[1] * math.exp(-((1 - u) / 0.22) ** 2))
        fade = min(1.0, (t[i] - t0) / 0.02, (t1 - t[i]) / 0.02)
        d[i] = amp * crease * env * w * fade
    co += nr * d[:, None]
    me.vertices.foreach_set('co', co.ravel())
    me.update()


def noise1(x):
    return math.sin(x * 12.9898) * 0.5 + math.sin(x * 4.1414 + 1.3) * 0.5


def rot_to(axis):
    a = Vector(axis).normalized()
    z = Vector((0, 0, 1))
    return z.rotation_difference(a).to_matrix()


def rot_euler(r):
    from mathutils import Euler
    return Euler(r, 'XYZ').to_matrix()


def catmull(pts, n):
    P = [Vector(p) for p in pts]
    if len(P) == 2:
        return [P[0].lerp(P[1], i / (n - 1)) for i in range(n)]
    out = []
    segs = len(P) - 1
    for i in range(n):
        u = i / (n - 1) * segs
        k = min(int(u), segs - 1)
        t = u - k
        p0, p1, p2, p3 = P[max(k - 1, 0)], P[k], P[k + 1], P[min(k + 2, segs)]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    return out


def uv_box(me, size):
    """面の向きで XY・YZ・XZ のどれかに投影する UV"""
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                u, v = co.y, co.z
            elif ax == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            uv.data[li].uv = (u / size, v / size)


def far_hit(tree, o, d, maxd):
    """内側から外へ：いちばん外の面（重なった玉の内側の面をとばす）"""
    last = (None, None)
    p = Vector(o)
    for _ in range(12):
        hit, nrm, _, dist = tree.ray_cast(p, d, maxd - (p - o).length)
        if hit is None:
            break
        last = (hit, nrm if nrm.dot(d) > 0 else -nrm)
        p = hit + d * 0.0005
    return last


def spiral(P, pts, r, pitch, mat='Dark', w=0.0026):
    """ホースに巻いた黒いらせんの補強帯"""
    C = catmull(pts, 180)
    L = sum((b - a).length for a, b in zip(C, C[1:]))
    turns = L / pitch
    out, prev, acc = [], None, 0.0
    for k, p in enumerate(C):
        t = (C[min(k + 1, len(C) - 1)] - C[max(k - 1, 0)]).normalized()
        if prev is None:
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            u = t.cross(ref).normalized()
        else:
            u = (prev - t * prev.dot(t)).normalized()
        prev = u
        if k:
            acc += (p - C[k - 1]).length
        a = acc / L * turns * 2 * math.pi
        out.append(p + (u * math.cos(a) + t.cross(u) * math.sin(a)) * r)
    P.tube(out, w, mat, seg=4, n=len(out))


def convolute(part, center, r, length, n, mat, axis=(0, 0, 1), depth=0.12, seg=24, sx=1.0, sy=1.0):
    """関節のじゃばら（布をかぶせたふくらみ）：n 段の山"""
    # 山ごとに高さ・ふくらみを少しずつ変える（布を押さえたケーブルで、均一な輪にはならない）
    amp = [0.6 + 0.6 * rng.random() for _ in range(n)]
    prof = []
    steps = n * 6
    for k in range(steps + 1):
        t = k / steps
        h = (t - 0.5) * length * (1 + 0.15 * math.sin(t * 7.3 + r * 50))
        j = min(n - 1, int(t * n))
        bump = math.sin(t * math.pi * n) ** 2 * amp[j]
        prof.append((r * (1 - depth + depth * 1.5 * bump), h))
    part.lathe(prof, mat, center=center, seg=seg, sx=sx, sy=sy, axis=axis, wobble=0.03)


# ---- 体 ------------------------------------------------------------------------------------


def build_torso():
    P = Part('torso')
    z0 = HIP_Y
    # 内圧でふくらんだ胴：胸は広く前へ張り、腹は少しくびれ、腰とお尻はまた張る。背中は平ら気味
    P.blob([
        ((0, 0.0, z0 + 0.46), (0.29, 0.2, 0.18)),  # 胸
        ((0, 0.02, z0 + 0.56), (0.27, 0.155, 0.11)),  # 肩のくびき（肩の関節へ広がる）
        ((0.165, 0.015, z0 + 0.54), (0.15, 0.155, 0.12)),  # 肩へなだらかに下がる（左）
        ((-0.165, 0.015, z0 + 0.54), (0.15, 0.155, 0.12)),  # （右）
        ((0, 0.015, z0 + 0.62), (0.2, 0.14, 0.07)),  # 首のまわりの盛り上がり（ヘルメットの下まで）
        ((0, -0.012, z0 + 0.3), (0.285, 0.175, 0.15)),  # みぞおち
        ((0, 0.0, z0 + 0.13), (0.285, 0.172, 0.13)),  # 腹（くびれは作らない：内圧で寸胴）
        ((0, 0.01, z0 - 0.02), (0.29, 0.175, 0.12)),  # 腰
        ((0, 0.04, z0 - 0.08), (0.26, 0.17, 0.09)),  # お尻
        ((0, -0.01, z0 - 0.13), (0.12, 0.12, 0.07)),  # また
        ((0, -0.01, z0 + 0.64), (0.15, 0.13, 0.05)),  # 首の受け
    ], 'Beta', res=0.012)
    # 胸の操作箱（RCU）の下：酸素の口 2 組（上が青の入り口、下が赤の出口）と、真ん中の冷却水の口
    for z, mat in ((z0 + 0.3, 'Blue'), (z0 + 0.21, 'Red')):
        for side in (1, -1):
            x = 0.085 * side
            y = P.front(x, z)
            base = Vector((x, y + 0.008, z))
            P.lathe([(0.034, 0.0), (0.036, 0.012), (0.032, 0.02)], 'Metal', center=base, seg=16, axis=(0, -1, 0), cap1=True)
            P.lathe([(0.027, 0.02), (0.027, 0.042), (0.021, 0.048)], mat, center=base, seg=16, axis=(0, -1, 0), cap1=True)
    y = P.front(0, z0 + 0.255)
    P.lathe([(0.026, 0.0), (0.026, 0.03), (0.02, 0.034)], 'Metal', center=(0, y + 0.006, z0 + 0.255), seg=14, axis=(0, -1, 0), cap1=True)
    # ジッパーのカバー（体の前を縦に、股まで）
    pts = [(0.0, P.front(0.0, z) + 0.004, z) for z in (z0 + 0.17, z0 + 0.06, z0 - 0.05, z0 - 0.12)]
    P.tube(pts, 0.01, 'Beta', seg=8)
    return P


def build_helmet(P):
    """首のリングに乗った、泡のヘルメット（透明）。中に頭（顔は描かない：暗い）"""
    c = Vector((0, -0.04, HIP_Y + 0.85))
    # 首のリング（アルミ、少し前に傾く。しわ・なめらかにする処理をかけないよう、ヘルメットの部品に入れる）
    neck_c = (0, -0.015, HIP_Y + 0.665)
    nax = Vector((0, -0.18, 1)).normalized()
    P.lathe([(0.14, -0.02), (0.166, -0.016), (0.172, -0.004), (0.172, 0.008), (0.164, 0.012), (0.164, 0.022), (0.172, 0.026), (0.172, 0.04), (0.16, 0.05), (0.138, 0.052)],
            'Metal', center=neck_c, seg=40, axis=(0, -0.18, 1))
    # ヘルメットを留めるロック：前の左のレバーと、まわりの留め具の出っぱり
    Rn = rot_to((0, -0.18, 1))
    for k in range(6):
        a = math.radians(30 + k * 60)
        p = Vector(neck_c) + Rn @ Vector((math.cos(a) * 0.176, math.sin(a) * 0.176, 0.017))
        P.box(p, (0.018, 0.018, 0.014), 'Metal', bevel=0.004)
    a = math.radians(-60)  # 前（-Y）の左寄り
    p = Vector(neck_c) + Rn @ Vector((math.cos(a) * 0.18, math.sin(a) * 0.18, 0.012))
    P.box(p, (0.04, 0.02, 0.02), 'Red', bevel=0.005)
    P.tube([p + Vector((0.0, -0.008, 0.0)), p + Vector((0.035, -0.02, -0.004))], 0.006, 'Metal', seg=8, n=4)
    # 泡（透明）
    P.sphere(c, 0.19, 'Bubble', scale=(1.0, 1.02, 1.05), seg=32, rings=20, cut=(-0.62, 1.0))
    # 泡の下のリング（首のリングとつながる）
    P.lathe([(0.15, -0.172), (0.166, -0.166), (0.168, -0.152), (0.162, -0.148), (0.162, -0.14), (0.168, -0.136), (0.166, -0.126), (0.152, -0.12)], 'Metal', center=c, seg=40)
    # 中の布の帽子（通信用キャップ：白と茶色）……暗く見えるように黒っぽい頭
    P.sphere(c + Vector((0, 0.015, 0.01)), 0.115, 'Dark', scale=(0.85, 1.0, 1.05), seg=18, rings=12)
    # 泡の後ろの空気の入り口（白い管）
    P.tube([c + Vector((-0.06, 0.15, -0.12)), c + Vector((0, 0.17, -0.06)), c + Vector((0.06, 0.15, -0.12))], 0.012, 'Hard', seg=8)


LEVA_C = Vector((0, -0.04, HIP_Y + 0.85))
LEVA_R = 0.226


def sph(az, el, r, c=None):
    """ヘルメットの中心からの向き：az は正面（-Y）から横（+X）へ、el は上へ（ラジアン）"""
    c = LEVA_C if c is None else c
    return c + Vector((math.sin(az) * math.cos(el) * r, -math.cos(az) * math.cos(el) * r * 1.04, math.sin(el) * r * 1.08))


def leva_edge(az):
    """殻の下のふち（顔の窓と首の開き）の高さ：正面は顔の窓の上、横から後ろは首の高さ"""
    d = abs(math.degrees(az))
    face = 40 * math.sqrt(max(0.0, 1 - (d / 72) ** 2))
    t = min(1.0, max(0.0, (d - 56) / 30))
    s = t * t * (3 - 2 * t)
    return math.radians(face * (1 - s) - 32 * s)


def sph_band(P, az0, az1, el0, el1, r, mat, nu=16, nv=8, curl=0.0):
    """球の上の板（日よけ）。curl：まわりのふちを殻の側へ少し曲げる"""
    rows = []
    for k in range(nv + 1):
        v = k / nv
        row = []
        for i in range(nu + 1):
            u = i / nu
            edge = min(u, 1 - u, v, 1 - v)
            rr = r - curl * max(0.0, 1 - edge * 8)
            row.append(tuple(sph(az0 + (az1 - az0) * u, el0 + (el1 - el0) * v, rr)))
        rows.append(row)
    P.add_grid(rows, mat, close_u=False)


def sph_plate(P, azc, elc, w, h, r, mat, t=0.006, bevel=0.004, roll=0.0):
    """球の面に沿って曲がった、厚みと丸い角のある板（w・h はメートル、r は板の内側の半径）"""
    bm2 = bmesh.new()
    bmesh.ops.create_cube(bm2, size=1.0)
    for v in bm2.verts:
        v.co = Vector((v.co.x * w, v.co.y * h, v.co.z * t))
    bmesh.ops.bevel(bm2, geom=list(bm2.edges), offset=min(bevel, t * 0.45, w * 0.3), segments=2, affect='EDGES', profile=0.5)
    # 細かく割って、曲げたときに角ばらないように
    bmesh.ops.subdivide_edges(bm2, edges=[e for e in bm2.edges if e.calc_length() > 0.015], cuts=3, use_grid_fill=True)
    cr, sr = math.cos(roll), math.sin(roll)

    def xf(co):
        x, y = co.x * cr - co.y * sr, co.x * sr + co.y * cr
        rr = r + t / 2 + co.z
        return sph(azc + x / (r * math.cos(elc)), elc + y / r, rr)
    P.merge(bm2, mat, xf)


def build_leva(P):
    """日よけ（LEVA）：泡ぜんたいをおおう白い殻（上・後ろ・横）、顔の窓の金のバイザー、ふちの丸い折り返し、上と横の日よけ"""
    c = LEVA_C
    NU, NV = 64, 18
    azs = [-math.pi + 2 * math.pi * i / NU for i in range(NU)]
    bm2 = bmesh.new()

    def ring(r, el_of):
        return [bm2.verts.new(sph(az, el_of(az), r)) for az in azs]

    def join(a, b):
        for i in range(NU):
            j = (i + 1) % NU
            bm2.faces.new((a[i], a[j], b[j], b[i]))

    R0, R1, LIP = LEVA_R, LEVA_R - 0.012, 0.006
    # 外側：ふちから上のてっぺんへ
    outer = [ring(R0, lambda az, t=k / NV: leva_edge(az) + (math.radians(88) - leva_edge(az)) * (1 - (1 - t) ** 1.3)) for k in range(NV + 1)]
    inner = [ring(R1, lambda az, t=k / NV: leva_edge(az) + (math.radians(88) - leva_edge(az)) * (1 - (1 - t) ** 1.3)) for k in range(NV + 1)]
    # ふちの丸い折り返し（厚みのある殻に見せる）
    lips = [outer[0]]
    for k in range(1, 6):
        b = math.pi * k / 6
        rr = (R0 + R1) / 2 + LIP * math.cos(b)
        lips.append(ring(rr, lambda az, b=b, rr=rr: leva_edge(az) - LIP / rr * 1.4 * math.sin(b)))
    lips.append(inner[0])
    for rows in (outer, lips, inner):
        for a2, b2 in zip(rows, rows[1:]):
            join(a2, b2)
    for rows in (outer, inner):
        top = bm2.verts.new(sph(0, math.pi / 2, R0 if rows is outer else R1))
        last = rows[-1]
        for i in range(NU):
            bm2.faces.new((last[i], last[(i + 1) % NU], top))
    bmesh.ops.recalc_face_normals(bm2, faces=list(bm2.faces))
    for f in bm2.faces:
        f.smooth = True
    P.merge(bm2, 'Hard', lambda co: co)
    # バイザーは二重：内側に透明な保護バイザー（窓ぜんたい）、外側に金の日よけバイザー（少し上げた位置：下に透明な層が見える）
    sph_band(P, math.radians(-76), math.radians(76), math.radians(-38), math.radians(46), R1 - 0.009, 'Bubble', nu=28, nv=14)
    pts = [sph(math.radians(a), math.radians(-36), R1 - 0.008) for a in range(-72, 73, 8)]
    P.tube(pts, 0.0045, 'Hard', seg=8, n=36)  # 透明バイザーの下の枠
    GL = math.radians(-12)  # 金のバイザーの下のふち
    sph_band(P, math.radians(-76), math.radians(76), GL, math.radians(46), R1 - 0.003, 'Gold', nu=28, nv=12)
    # 金のバイザーの縁の黒いゴム（下のふちと、左右の立ち上がり）
    pts = [sph(math.radians(a), GL, R1 - 0.002) for a in range(-66, 67, 6)]
    P.tube(pts, 0.0055, 'Dark', seg=8, n=40)
    for side in (1, -1):
        pts = [sph(math.radians(66) * side, math.radians(e), R1 - 0.002) for e in (-12, 0, 14, 28, 38)]
        P.tube(pts, 0.005, 'Dark', seg=8, n=14)
    # 上の日よけ（真ん中）：額の上の横長のスリット（すべる溝）から出てくる。つまみ付き
    sph_plate(P, 0.0, math.radians(64), 0.2, 0.009, R0 - 0.001, 'Dark', t=0.003, bevel=0.002)  # スリット
    sph_plate(P, 0.0, math.radians(47), 0.27, 0.085, R0 + 0.001, 'Hard', t=0.007, bevel=0.012)
    sph_plate(P, 0.0, math.radians(51), 0.25, 0.006, R0 + 0.0075, 'Dark', t=0.002, bevel=0.001)  # 日よけの段
    P.box(sph(0, math.radians(37.5), R0 + 0.016), (0.042, 0.016, 0.014), 'Hard', bevel=0.005)  # つまみ
    P.box(sph(0, math.radians(38.5), R0 + 0.026), (0.03, 0.01, 0.008), 'Metal', bevel=0.003)
    for side in (1, -1):
        # 横の日よけ：耳もとの丸いヒンジから伸びるアームで支える
        hc = sph(math.radians(100) * side, math.radians(4), R0)
        P.lathe([(0.03, 0.0), (0.03, 0.014), (0.024, 0.02)], 'Hard', center=hc, seg=20, axis=(side, 0, 0), cap1=True)
        P.lathe([(0.014, 0.02), (0.014, 0.027), (0.009, 0.03)], 'Metal', center=hc, seg=14, axis=(side, 0, 0), cap1=True)
        sph_plate(P, math.radians(90) * side, math.radians(4), 0.08, 0.016, R0 + 0.009, 'Hard', t=0.005, bevel=0.003)  # アーム
        sph_plate(P, math.radians(73) * side, math.radians(10), 0.09, 0.17, R0 + 0.011, 'Hard', t=0.006, bevel=0.022, roll=-0.12 * side)  # 日よけ
        sph_plate(P, math.radians(73) * side, math.radians(10), 0.075, 0.15, R0 + 0.0175, 'Hard', t=0.0015, bevel=0.016, roll=-0.12 * side)  # 日よけの縁の段
        # 首のリングに留める金具（後ろ寄りの下のふち）と、その受け
        P.box(sph(math.radians(118) * side, math.radians(-29), R0 + 0.004), (0.034, 0.022, 0.03), 'Metal', bevel=0.005)
        P.box(sph(math.radians(118) * side, math.radians(-24), R0 + 0.012), (0.012, 0.01, 0.022), 'Dark', bevel=0.003)
    # 殻の合わせ目（パネルラインの溝）：耳から耳へてっぺんを越える線と、後ろを回る線
    pts = [sph(math.radians(90), math.radians(e), R0 + 0.0004) for e in range(16, 90, 6)] + [sph(math.radians(-90), math.radians(e), R0 + 0.0004) for e in range(90, 15, -6)]
    P.tube(pts, 0.0016, 'Dark', seg=6, n=60, cap=False)
    pts = [sph(math.radians(a), math.radians(-12), R0 + 0.0004) for a in range(106, 255, 6)]
    P.tube(pts, 0.0016, 'Dark', seg=6, n=60, cap=False)
    # 後頭部の通気口と金具
    for k in range(4):
        sph_plate(P, math.pi, math.radians(8 + k * 4), 0.06, 0.006, R0 - 0.0005, 'Dark', t=0.003, bevel=0.001)
    P.box(sph(math.pi, math.radians(-2), R0 + 0.006), (0.05, 0.014, 0.02), 'Metal', bevel=0.004)


def build_plss(P):
    """月面の背中の箱（PLSS）と上の非常用酸素（OPS）、肩の帯、アンテナ"""
    z0 = HIP_Y
    P.box((0, 0.34, z0 + 0.36), (0.52, 0.27, 0.68), 'Hard', bevel=0.04, seg=3)
    # 背中の面（三面図の後ろ姿）：ふちの枠、6 枚の板、上の丸い水の口、真ん中の弁の箱とホース、取っ手、下の V の帯
    yb = 0.475
    P.box((0, yb + 0.002, z0 + 0.36), (0.46, 0.008, 0.6), 'Hard', bevel=0.006)
    for x, w in ((-0.225, 0.016), (0.225, 0.016)):
        P.box((x, yb + 0.008, z0 + 0.36), (w, 0.012, 0.6), 'Hard', bevel=0.005)
    for z in (z0 + 0.065, z0 + 0.655):
        P.box((0, yb + 0.008, z), (0.46, 0.012, 0.016), 'Hard', bevel=0.005)
    for col in (-1, 1):
        for zc, h in ((z0 + 0.56, 0.13), (z0 + 0.39, 0.15), (z0 + 0.2, 0.17)):
            P.box((col * 0.13, yb + 0.009, zc), (0.13, 0.006, h), 'Hard', bevel=0.012, seg=2)
            P.box((col * 0.13, yb + 0.0125, zc + h * 0.5 - 0.02), (0.1, 0.002, 0.004), 'Dark', bevel=0.001)  # 板のすき間の影
    P.lathe([(0.036, 0.0), (0.036, 0.014), (0.03, 0.018)], 'Metal', center=(0, yb + 0.006, z0 + 0.6), seg=24, axis=(0, 1, 0), cap1=True)
    P.lathe([(0.022, 0.018), (0.022, 0.022)], 'Dark', center=(0, yb + 0.006, z0 + 0.6), seg=20, axis=(0, 1, 0), cap1=True)
    # 取っ手（横の棒、両はしは斜めに下りる）
    P.tube([(-0.12, yb + 0.012, z0 + 0.43), (-0.08, yb + 0.03, z0 + 0.47), (0.08, yb + 0.03, z0 + 0.47), (0.12, yb + 0.012, z0 + 0.43)], 0.008, 'Metal', seg=8, n=24)
    # 真ん中の弁の箱
    P.box((0, yb + 0.03, z0 + 0.36), (0.11, 0.05, 0.12), 'Hard', bevel=0.01, seg=2)
    P.box((0, yb + 0.057, z0 + 0.36), (0.08, 0.006, 0.09), 'Metal', bevel=0.004)
    for x in (-0.03, 0.03):
        P.lathe([(0.012, 0.0), (0.012, 0.012)], 'Metal', center=(x, yb + 0.03, z0 + 0.3), seg=12, axis=(0, 0, -1), cap1=True)
        P.tube([(x, yb + 0.03, z0 + 0.29), (x * 1.4, yb + 0.045, z0 + 0.2), (x * 2.4, yb + 0.035, z0 + 0.12), (x * 3.2, yb + 0.02, z0 + 0.09)],
               0.009, 'Beta', seg=8, n=24, ribs=0.12, ribn=8)
    # 下の V の帯と留め具
    for side in (1, -1):
        P.tube([(0.2 * side, yb + 0.012, z0 + 0.05), (0.07 * side, yb + 0.014, z0 + 0.14)], 0.006, 'Beta', seg=6, n=4)
        P.box((0.17 * side, yb + 0.016, z0 + 0.11), (0.02, 0.008, 0.05), 'Beta', bevel=0.003)
        P.box((0.17 * side, yb + 0.021, z0 + 0.12), (0.022, 0.004, 0.014), 'Metal', bevel=0.002)
    P.box((0, 0.31, z0 + 0.86), (0.48, 0.22, 0.28), 'Hard', bevel=0.035, seg=3)  # OPS
    P.box((0, 0.31, z0 + 0.86), (0.49, 0.225, 0.025), 'Beta', bevel=0.005)
    # OPS の後ろの面の窓（くぼんだ板）と、横の赤い印、横のホース
    P.box((0, 0.42, z0 + 0.88), (0.34, 0.006, 0.16), 'Hard', bevel=0.02, seg=2)
    P.box((0.244, 0.3, z0 + 0.93), (0.006, 0.08, 0.025), 'Stripe', bevel=0.002)
    P.box((0.244, 0.38, z0 + 0.36), (0.006, 0.05, 0.08), 'Metal', bevel=0.004)  # 横の口
    P.tube([(0.24, 0.36, z0 + 0.78), (0.285, 0.34, z0 + 0.66), (0.28, 0.36, z0 + 0.5), (0.25, 0.38, z0 + 0.4)], 0.011, 'Beta', seg=8, n=30, ribs=0.12, ribn=12)
    # アンテナ（上の短い棒）
    P.tube([(0.17, 0.33, z0 + 1.0), (0.17, 0.34, z0 + 1.17)], 0.006, 'Metal', seg=6)
    # 背中から胸の口へのホース（左右に回る、じゃばら）
    # 胸の口（青・赤、左右に 1 組ずつ）から、体の横を下りて背中の箱の下の横へ
    for side in (1, -1):
        for z, dz in ((z0 + 0.3, 0.0), (z0 + 0.21, -0.03)):
            P.tube([(0.085 * side, -0.215, z), (0.12 * side, -0.24, z - 0.04), (0.2 * side, -0.19, z - 0.1 + dz),
                    (0.25 * side, -0.05, z0 + 0.1 + dz), (0.24 * side, 0.12, z0 + 0.12 + dz), (0.2 * side, 0.22, z0 + 0.16 + dz)],
                   0.02, 'Beta', seg=10, n=48, ribs=0.1, ribn=20)
            spiral(P, [(0.085 * side, -0.215, z), (0.12 * side, -0.24, z - 0.04), (0.2 * side, -0.19, z - 0.1 + dz),
                       (0.25 * side, -0.05, z0 + 0.1 + dz), (0.24 * side, 0.12, z0 + 0.12 + dz), (0.2 * side, 0.22, z0 + 0.16 + dz)], 0.0205, 0.04)
    # 肩の帯
    for side in (1, -1):
        P.tube([(0.14 * side, 0.21, z0 + 0.62), (0.16 * side, 0.0, z0 + 0.665), (0.15 * side, -0.19, z0 + 0.58), (0.15 * side, -0.215, z0 + 0.4)], 0.014, 'Beta', seg=6)


def build_ops_only(P):
    """司令船パイロットの船外活動：背中の非常用酸素（OPS）だけと、それを留める帯"""
    z0 = HIP_Y
    P.box((0, 0.28, z0 + 0.42), (0.4, 0.17, 0.26), 'Hard', bevel=0.035, seg=3)
    P.box((0, 0.28, z0 + 0.42), (0.41, 0.175, 0.025), 'Beta', bevel=0.005)
    for side in (1, -1):
        P.tube([(0.13 * side, 0.2, z0 + 0.55), (0.16 * side, 0.0, z0 + 0.66), (0.15 * side, -0.19, z0 + 0.58), (0.15 * side, -0.215, z0 + 0.4)], 0.013, 'Beta', seg=6)
    # OPS から胸へのホース（左）
    P.tube([(-0.2, 0.22, z0 + 0.38), (-0.28, 0.05, z0 + 0.36), (-0.2, -0.17, z0 + 0.36), (-0.055, -0.24, z0 + 0.35)], 0.016, 'Beta', seg=8, n=30, ribs=0.1, ribn=10)


def build_rcu(P):
    """月面の胸の操作箱（RCU）：胸の真ん中に大きく突き出た箱。上にカメラの台、前につまみと窓"""
    z0 = HIP_Y
    y = -0.165  # 胸の前の面（build_torso の胸の玉の前の端）
    zc = z0 + 0.43
    P.box((0, y - 0.06, zc), (0.24, 0.12, 0.17), 'Hard', bevel=0.016, seg=3)
    P.box((0, y - 0.121, zc + 0.01), (0.2, 0.008, 0.12), 'Metal', bevel=0.004)
    P.box((-0.05, y - 0.126, zc + 0.035), (0.06, 0.004, 0.035), 'Dark', bevel=0.002)  # 小さな窓（表示）
    P.box((0.05, y - 0.126, zc + 0.035), (0.06, 0.004, 0.02), 'Dark', bevel=0.002)
    for x, mat in ((-0.07, 'Red'), (-0.01, 'Dark'), (0.035, 'Dark'), (0.08, 'Blue')):
        P.lathe([(0.014, 0), (0.014, 0.02), (0.011, 0.025)], mat, center=(x, y - 0.124, zc - 0.03), seg=12, axis=(0, -1, 0), cap1=True)
    # 胸に留める金具（左右）と、上の帯
    for side in (1, -1):
        P.box((0.135 * side, y - 0.03, zc), (0.03, 0.06, 0.14), 'Metal', bevel=0.006)
    # カメラの台（ハッセルブラッドの取り付け金具）：箱の上の前
    P.box((0, y - 0.13, zc + 0.1), (0.09, 0.05, 0.03), 'Metal', bevel=0.006)
    P.box((0, y - 0.15, zc + 0.125), (0.035, 0.035, 0.025), 'Metal', bevel=0.005)
    # 下の通信ケーブルの口
    P.tube([(0.07, y - 0.08, zc - 0.085), (0.1, y - 0.06, zc - 0.13), (0.16, y - 0.0, zc - 0.15)], 0.01, 'Dark', seg=8, n=10)


def build_arm(i):
    side = 1 if i == 0 else -1
    # 腕の形は関節より少し内側へ（三面図の肩幅。関節の位置＝動きの軸はそのまま）
    inset = Vector((-ARM_INSET * side, 0, 0))
    sh = Vector(J[f'shoulder{i}']) + inset
    el = Vector(J[f'elbow{i}']) + inset
    U = Part(f'shoulder{i}')
    # 肩のじゃばら（大きく、胴体からはみ出す）と上腕
    # 肩の丸み（胴体とつながる）と、肩のじゃばら（腕の付け根を回る山）、上腕
    # 肩（丸く盛り上がり、胴とつながる）から上腕：付け根が太く、ひじへ細くなる
    U.blob([
        (sh + Vector((-0.04 * side, 0.0, -0.01)), (0.118, 0.12, 0.09)),
        (sh + Vector((-0.005 * side, 0.0, -0.09)), (0.12, 0.12, 0.09)),
        (sh + Vector((0.0, -0.004, -0.18)), (0.117, 0.117, 0.09)),
        (sh + Vector((0.0, -0.006, -0.27)), (0.113, 0.113, 0.06)),
        (sh + Vector((0.0, -0.006, -0.3)), (0.11, 0.11, 0.05)),  # ひじの上（ひじの部品と重ねる）
    ], 'Beta')
    F = Part(f'elbow{i}')
    convolute(F, el + Vector((0, 0, 0.0)), 0.103, 0.1, 3, 'Beta', depth=0.03, seg=20)
    # 前腕：ひじのすぐ下がふくらみ、手首へ細く
    F.blob([
        (el + Vector((0, -0.006, 0.01)), (0.108, 0.108, 0.05)),  # ひじ
        (el + Vector((0, -0.006, -0.05)), (0.108, 0.107, 0.07)),
        (el + Vector((0, -0.004, -0.12)), (0.104, 0.102, 0.07)),
        (el + Vector((0, 0.0, -0.19)), (0.09, 0.088, 0.045)),
    ], 'Beta')
    # 手首のリング（回る金具）：左が赤、右が青
    wr = el + Vector((0, 0, -0.225))
    F.lathe([(0.076, 0.012), (0.084, 0.006), (0.084, -0.018), (0.076, -0.024)], 'Red' if side > 0 else 'Blue', center=wr, seg=22)
    F.lathe([(0.07, -0.024), (0.074, -0.03), (0.074, -0.04), (0.068, -0.044)], 'Metal', center=wr, seg=22)
    # 手袋（大きく：月面用の手袋は、手よりずっと太い）
    gb = wr + Vector((0, 0, -0.045))
    n0 = len(F.bm.verts)
    build_glove(F, gb, side)
    F.bm.verts.ensure_lookup_table()
    # 手のひらを体の内側へ向ける（腕の軸のまわりに 90 度）、大きさ 1.32 倍
    R = Matrix.Rotation(-math.pi / 2 * side, 3, 'Z')
    for v in F.bm.verts[n0:]:
        v.co = gb + R @ ((v.co - gb) * 1.55)
    # 左の手首の手順書（カフ・チェックリスト）
    if side > 0:
        F.box(el + Vector((0.0, -0.075, -0.15)), (0.11, 0.035, 0.12), 'Beta', bevel=0.01)
        F.box(el + Vector((0.0, -0.094, -0.15)), (0.095, 0.006, 0.105), 'Paper', bevel=0.003)
    # 右の上腕のポケット（ペンライトなど）
    if side < 0:
        U.box(sh + Vector((-0.06, -0.07, -0.15)), (0.05, 0.04, 0.1), 'Beta', bevel=0.012)
    # 船長の赤い帯（ひじの上と下）
    S = Part(f'shoulder{i}__cdr')
    S.band = (-0.2, -0.25)  # 腕の布の面から写す（make_band）
    F.budget = 5200
    U.folds = dict(origin=sh, axis=(0, 0, -1), t0=0.06, t1=0.33, lam=0.06, amp=0.014, ends=(0.5, 1.0), seed=i * 1.7)
    F.folds = dict(origin=el, axis=(0, 0, -1), t0=0.0, t1=0.185, lam=0.05, amp=0.012, ends=(1.0, 0.4), seed=i * 2.9 + 1)
    return [(U, 1, 0.005), (F, 1, 0.004), (S, 1, 0.008)]


def build_glove(P, base, side):
    """月面用の手袋：手首の布のカフ、ふくらんだ甲と手のひら（白い布）、軽く曲げた太い指（青灰色のゴムの指先）"""
    palm_c = base + Vector((0, -0.006, -0.05))
    P.lathe([(0.058, 0.045), (0.066, 0.02), (0.064, 0.0), (0.056, -0.025)], 'Beta', center=base, seg=20, sy=0.85)  # カフ
    P.lathe([(0.067, 0.022), (0.069, 0.016), (0.069, 0.004), (0.066, -0.002)], 'Metal', center=base, seg=20, sy=0.85)  # カフの金具
    elems = [
        (palm_c + Vector((0, 0, 0.0)), (0.05, 0.03, 0.044)),  # 手のひら・甲
        (palm_c + Vector((0, 0.004, 0.035)), (0.046, 0.027, 0.026)),  # 手首へ
    ]
    tips = []
    for k in range(4):
        x = (-0.031 + k * 0.0207) * side
        ln = 1.25 if k in (1, 2) else 1.08
        root = palm_c + Vector((x, -0.004, -0.036))
        path = [root, root + Vector((0, -0.01, -0.028 * ln)), root + Vector((0, -0.028 * ln, -0.048 * ln)), root + Vector((0, -0.046 * ln, -0.05 * ln))]
        for q in catmull(path, 7):
            elems.append((q, (0.0122, 0.0122, 0.0128)))
        tips.append(path[3] + (path[3] - path[2]).normalized() * 0.004)
    troot = palm_c + Vector((-0.045 * side, -0.016, 0.004))
    for q in catmull([troot, troot + Vector((-0.006 * side, -0.016, -0.016)), troot + Vector((-0.01 * side, -0.03, -0.028))], 5):
        elems.append((q, (0.0128, 0.0128, 0.0135)))
    tips.append(troot + Vector((-0.01 * side, -0.032, -0.03)))
    P.blob(elems, 'Beta', res=0.0045, smooth=2)
    P.blob([(t, (0.0108, 0.0108, 0.0112)) for t in tips], 'Silicone', res=0.004, smooth=2)


def build_leg(i):
    side = 1 if i == 0 else -1
    hp = Vector(J[f'hip{i}'])
    kn = Vector(J[f'knee{i}'])
    T = Part(f'hip{i}')
    # もも：付け根が太く（腰の布とつながる）、ひざへ細く
    T.blob([
        (hp + Vector((0.015 * side, 0.0, -0.05)), (0.165, 0.17, 0.09)),
        (hp + Vector((0.01 * side, -0.005, -0.16)), (0.16, 0.165, 0.09)),
        (hp + Vector((0.005 * side, -0.008, -0.27)), (0.152, 0.155, 0.08)),
        (hp + Vector((0.0, -0.01, -0.37)), (0.143, 0.145, 0.08)),
        (hp + Vector((0.0, -0.012, -0.44)), (0.14, 0.142, 0.06)),  # ひざの上（ひざの部品と重ねる）
    ], 'Beta')
    # ももの外側のポケット
    T.box(hp + Vector((0.03 * side, -0.16, -0.25)), (0.13, 0.035, 0.15), 'Beta', bevel=0.012)  # ももの前のポケット
    K = Part(f'knee{i}')
    convolute(K, kn + Vector((0, 0, -0.01)), 0.122, 0.1, 3, 'Beta', depth=0.03, seg=22)
    # すね：ふくらはぎがふくらみ、足首へ細く（ブーツの筒へ入る）
    K.blob([
        (kn + Vector((0, -0.012, 0.0)), (0.126, 0.128, 0.05)),  # ひざ（上は太ももの布の内側にかくれる）
        (kn + Vector((0, 0.0, -0.06)), (0.14, 0.141, 0.08)),
        (kn + Vector((0, 0.01, -0.15)), (0.138, 0.142, 0.09)),
        (kn + Vector((0, 0.0, -0.25)), (0.128, 0.13, 0.08)),
    ], 'Beta')
    n0 = len(K.bm.verts)
    build_boot(K, Vector((kn.x, kn.y, ANKLE_Z)), side)
    K.bm.verts.ensure_lookup_table()
    for v in K.bm.verts[n0:]:
        # 月面用のブーツは大きい：横・前後 1.3 倍、高さ 1.35 倍（足の裏は地面のまま）
        v.co = Vector((kn.x + (v.co.x - kn.x) * 1.3, kn.y - 0.02 + (v.co.y - kn.y) * 1.25, v.co.z * 1.35))
    S = Part(f'hip{i}__cdr')
    S.band = (-0.352, -0.405)
    T.folds = dict(origin=hp, axis=(0, 0, -1), t0=0.08, t1=0.46, lam=0.07, amp=0.017, ends=(0.7, 1.0), seed=i * 3.1 + 0.5)
    K.folds = dict(origin=kn, axis=(0, 0, -1), t0=0.0, t1=0.27, lam=0.065, amp=0.016, ends=(1.0, 0.5), seed=i * 1.3 + 2)
    return [(T, 1, 0.004), (K, 1, 0.004), (S, 1, 0.005)]


def build_boot(P, ank, side):
    """月面用の上ばき（白い布の長靴、青灰色の厚い底、前のベルト）。足首 ank（すねの下の端）。あとで 1.3 倍に広げる"""
    z = ANKLE_Z
    x, y = ank.x, ank.y
    # 足首の上までの筒と、丸い甲・つま先・かかと（ひとつながりの布）
    P.blob([
        ((x, y + 0.005, z + 0.1), (0.098, 0.1, 0.07)),
        ((x, y + 0.01, z + 0.01), (0.1, 0.105, 0.06)),
        ((x, y + 0.03, 0.065), (0.095, 0.085, 0.06)),  # かかと
        ((x, y - 0.06, 0.06), (0.098, 0.11, 0.055)),  # 甲
        ((x, y - 0.15, 0.05), (0.085, 0.07, 0.045)),  # つま先
    ], 'Boot', res=0.01)
    # 厚い底（青灰色のシリコーン）：つま先が少し上がる
    P.blob([
        ((x, y + 0.035, 0.026), (0.1, 0.085, 0.032)),
        ((x, y - 0.06, 0.026), (0.104, 0.11, 0.032)),
        ((x, y - 0.16, 0.032), (0.092, 0.075, 0.032)),
    ], 'Silicone', res=0.008, smooth=1)
    # 底の横の筋（周りを回る段）：靴底の面を内側から外へ探して、そのすぐ外に輪を回す
    from mathutils.bvhtree import BVHTree
    P.bm.verts.ensure_lookup_table()
    tree = BVHTree.FromBMesh(P.bm)
    for zz in (0.01, 0.026, 0.042):
        pts = []
        for k in range(48):
            a = 2 * math.pi * k / 48
            o = Vector((x, y - 0.06, zz))
            d = Vector((math.cos(a), math.sin(a), 0))
            hit = far_hit(tree, o, d, 0.4)[0]
            pts.append(hit + d * 0.001 if hit else o + d * 0.1)
        pts.append(pts[0])
        P.tube(pts, 0.004, 'Silicone', seg=5, n=96, cap=False)
    # 筒の上のふち（ゲートル）
    P.lathe([(0.1, 0.0), (0.104, 0.008), (0.104, 0.02), (0.098, 0.026)], 'Boot', center=(x, y + 0.005, z + 0.155), seg=22)
    # 甲のベルト：甲の面の上を横切る帯（面を上から探して沿わせる）と、外側の金属の留め具
    P.bm.verts.ensure_lookup_table()
    tree = BVHTree.FromBMesh(P.bm)
    for yy, buckle in ((y - 0.115, True),):
        pts = []
        for k in range(13):
            u = -1 + 2 * k / 12
            a = u * 1.35
            d = Vector((math.sin(a), 0, math.cos(a)))
            o = Vector((x, yy, 0.05))
            hit, nrm = far_hit(tree, o, d, 0.3)
            if hit:
                pts.append(hit + nrm * 0.004)
        if len(pts) > 4:
            P.tube(pts, 0.0065, 'Boot', seg=6, n=40)
            if buckle:
                q = pts[-2] if side > 0 else pts[1]
                P.box(tuple(q), (0.012, 0.024, 0.02), 'Metal', bevel=0.004)


# ---- 組み立て・AO・書き出し ---------------------------------------------------------------------


def world_bvh(ob):
    from mathutils.bvhtree import BVHTree
    M = Matrix.Translation(ob.location)
    return BVHTree.FromPolygons([M @ v.co for v in ob.data.vertices], [tuple(p.vertices) for p in ob.data.polygons])


def decal_obj(name, joint, verts, faces, uvs):
    """印の部品（世界の座標の頂点・UV）。関節を原点にする"""
    me = bpy.data.meshes.new(name)
    off = Vector(J[joint])
    me.from_pydata([tuple(v - off) for v in verts], [], faces)
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[me.loops[li].vertex_index]
    me.materials.append(MATS['Decal'])
    ob = bpy.data.objects.new(name, me)
    ob.location = off
    bpy.context.scene.collection.objects.link(ob)
    return ob


def disc_on_front(tree, cx, cz, rad, uv_c, uv_r, verts, faces, uvs, lift=0.0025, nr=8, ns=36):
    """正面から見た丸い印を、体の表面に沿わせて貼る"""
    base = len(verts)
    for k in range(nr + 1):
        rr = rad * k / nr
        for i in range(ns if k else 1):
            a = 2 * math.pi * i / ns
            x, z = cx + math.cos(a) * rr, cz + math.sin(a) * rr
            hit, nrm, _, _ = tree.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
            p = hit + nrm * lift if hit else Vector((x, -0.2, z))
            verts.append(p)
            uvs.append((uv_c[0] + math.cos(a) * uv_r * k / nr, uv_c[1] + math.sin(a) * uv_r * k / nr))
    def idx(k, i):
        return base if k == 0 else base + 1 + (k - 1) * ns + i % ns
    for i in range(ns):
        faces.append((idx(0, 0), idx(1, i), idx(1, i + 1)))
    for k in range(1, nr):
        for i in range(ns):
            faces.append((idx(k, i), idx(k + 1, i), idx(k + 1, i + 1), idx(k, i + 1)))


def build_patches(torso, arm0):
    """NASA の印（右胸）・アポロ 17 号のパッチ（左胸）・国旗（左肩）"""
    z0 = HIP_Y
    out = []
    tree = world_bvh(torso)
    verts, faces, uvs = [], [], []
    # 着る人の右 = -X（正面から見て左）。絵の並び：左上 NASA、右上パッチ（UV の v は下から）
    disc_on_front(tree, -0.185, z0 + 0.47, 0.043, (0.25, 0.75), 0.245, verts, faces, uvs)
    disc_on_front(tree, 0.185, z0 + 0.47, 0.046, (0.75, 0.75), 0.245, verts, faces, uvs)
    out.append(decal_obj('torso__patch', 'torso', verts, faces, uvs))
    # 国旗：左の上腕の外の前寄り。腕の軸のまわりに巻く（星の側が前）
    tree = world_bvh(arm0)
    ax = Vector(J['shoulder0']) + Vector((-ARM_INSET, 0, 0))
    verts, faces, uvs = [], [], []
    nu, nv = 14, 6
    th0, th1 = math.radians(28), math.radians(28 + 46)
    zt, zb = ax.z - 0.075, ax.z - 0.13
    for k in range(nv + 1):
        z = zt + (zb - zt) * k / nv
        for i in range(nu + 1):
            th = th0 + (th1 - th0) * i / nu
            d = Vector((math.sin(th), -math.cos(th), 0))
            o = Vector((ax.x, ax.y, z)) + d * 0.5
            hit, nrm, _, _ = tree.ray_cast(o, -d)
            verts.append(hit + nrm * 0.0025 if hit else Vector((ax.x, ax.y, z)) + d * 0.125)
            uvs.append((i / nu * 0.995, 0.5 * (1 - k / nv) * 0.995))
    for k in range(nv):
        for i in range(nu):
            a = k * (nu + 1) + i
            faces.append((a, a + nu + 1, a + nu + 2, a + 1))
    out.append(decal_obj('shoulder0__patch', 'shoulder0', verts, faces, uvs))
    return out


def make_band(src, name, z_top, z_bot, lift=0.0012):
    """船長の赤い帯：腕・脚のできあがった面（しわ・折り目つき）の帯の部分を写し取り、ほんの少しだけ浮かせた薄い層"""
    bm = bmesh.new()
    bm.from_mesh(src.data)
    for z, no in ((z_top, (0, 0, 1)), (z_bot, (0, 0, -1))):
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=no, clear_outer=True)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * lift
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    me.materials.append(MATS['Stripe'])
    for poly in me.polygons:
        poly.material_index = 0
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    ob.location = src.location.copy()
    bpy.context.scene.collection.objects.link(ob)
    return ob


def build_all():
    objs = []
    T = build_torso()
    # 胴のしわ：腹から腰（体を前にかがめるところ）に横の折り目
    torso = T.build('torso', subdiv=2, wrinkle=0.007, wrinkle_scale=0.07, budget=10000,
                    folds=dict(origin=(0, 0, HIP_Y + 0.24), axis=(0, 0, -1), t0=0.0, t1=0.3, lam=0.055, amp=0.008, ends=(0.4, 1.0), seed=0.7))
    objs.append(torso)
    H = Part('torso__helmet')
    build_helmet(H)
    objs.append(H.build('torso', budget=6000))
    L = Part('torso__leva')
    build_leva(L)
    objs.append(L.build('torso', subdiv=0, budget=7000))
    Lc = Part('torso__cdr')
    # 船長の日よけの上の赤い帯
    # 殻のてっぺんを前から後ろへ（上の日よけの後ろから）
    for k in (0,):
        # 前（上の日よけの後ろ）から、てっぺんを越えて後ろへ
        sph_plate(Lc, 0.0, math.radians(72), 0.05, 0.09, LEVA_R + 0.0005, 'Stripe', t=0.002, bevel=0.001)
        sph_plate(Lc, math.pi, math.radians(62), 0.05, 0.13, LEVA_R + 0.0005, 'Stripe', t=0.002, bevel=0.001)
    objs.append(Lc.build('torso'))
    Pl = Part('torso__plss')
    build_plss(Pl)
    objs.append(Pl.build('torso', subdiv=0, budget=10000))
    Op = Part('torso__ops')
    build_ops_only(Op)
    objs.append(Op.build('torso', subdiv=1, budget=1500))
    Rc = Part('torso__rcu')
    build_rcu(Rc)
    objs.append(Rc.build('torso', subdiv=1, budget=1200))
    for i in range(2):
        for P, sub, wr in build_arm(i) + build_leg(i):
            joint = P.name.split('__')[0]
            if hasattr(P, 'band'):
                P.bm.free()
                objs.append(make_band(next(o for o in objs if o.name == joint), P.name, *P.band))
                continue
            objs.append(P.build(joint, subdiv=sub, wrinkle=wr, wrinkle_scale=0.05, budget=600 if '__' in P.name else getattr(P, 'budget', 3800),
                                folds=getattr(P, 'folds', None)))
    objs += build_patches(torso, next(o for o in objs if o.name == 'shoulder0'))
    return objs


def bake_ao(objs):
    """すき間の暗さを頂点の色に焼く（Cycles）。腕は少し開いた姿で焼く（体の影が腕に焼き付かないように）"""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = int(os.environ.get('AO_SAMPLES', '48'))
    sc.world = bpy.data.worlds.new('w')
    for ob in objs:
        if ob.data.color_attributes.get('Col') is None:
            ob.data.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        ob.data.color_attributes.active_color = ob.data.color_attributes['Col']
    # 印の付いた部品のうち、同時に着けないものは焼くときに隠す（OPS だけ・RCU は焼きに入れない）
    skip = {'torso__ops'}
    for ob in objs:
        ob.hide_render = ob.name in skip
    for ob in objs:
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        was = ob.hide_render
        ob.hide_render = False
        if ob.name.endswith('__ops'):
            for o in objs:
                if o.name.endswith('__plss'):
                    o.hide_render = True
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        for o in objs:
            o.hide_render = o.name in skip
        ob.hide_render = was
        # 透明・金・小物は AO を弱く（白に近づける）
        col = ob.data.color_attributes['Col']
        a = np.zeros(len(col.data) * 4, np.float32)
        col.data.foreach_get('color', a)
        a = a.reshape(-1, 4)
        v = a[:, 0]
        v = 0.35 + 0.65 * np.clip(v, 0, 1) ** 0.8
        if '__helmet' in ob.name or '__leva' in ob.name:
            v = 0.6 + 0.4 * v
        # 布のむら（段階4）：使いこんだベータ布の、ゆるいまだらの明るさと少しの黄ばみ。硬い殻・金属・印には入れない
        joint = ob.name.split('__')[0]
        soft = '__' not in ob.name or ob.name.endswith('__cdr')
        if soft and joint != 'torso' or ob.name == 'torso':
            from mathutils import noise
            off = ob.location
            vi = np.zeros(len(ob.data.loops), np.int32)
            ob.data.loops.foreach_get('vertex_index', vi)
            co = np.zeros(len(ob.data.vertices) * 3, np.float32)
            ob.data.vertices.foreach_get('co', co)
            co = co.reshape(-1, 3)
            nz = np.array([noise.noise(Vector(c) * 6.0 + off) * 0.6 + noise.noise(Vector(c) * 19.0 + off) * 0.4 for c in co], np.float32)
            nz = nz[vi]
            light = 1 + 0.045 * nz
            a[:, 0] = v * light
            a[:, 1] = v * light * (1 - 0.012 * np.clip(nz, 0, 1))
            a[:, 2] = v * light * (1 - 0.035 * np.clip(nz, 0, 1))
        else:
            a[:, 0] = a[:, 1] = a[:, 2] = v
        a[:, :3] = np.clip(a[:, :3], 0, 1)
        a[:, 3] = 1
        col.data.foreach_set('color', a.ravel())
        print('  ao', ob.name, flush=True)


def bake_dust(objs):
    """月の砂ぼこり（ひざから下ほど濃い、すねの前に多い、まだら）の量を、頂点の色のアルファに入れる（1 = きれい）。
    アプリは月面の場面だけ、これで砂の色を混ぜる（第9章の船外活動などでは使わない）"""
    from mathutils import noise
    for ob in objs:
        me = ob.data
        if me.color_attributes.get('Col') is None:
            a = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
            buf = np.ones(len(a.data) * 4, np.float32)
            a.data.foreach_set('color', buf)
        col = me.color_attributes['Col']
        me.color_attributes.active_color = col
        joint = ob.name.split('__')[0]
        if not (joint.startswith('knee') or joint.startswith('hip')):
            continue
        buf = np.zeros(len(col.data) * 4, np.float32)
        col.data.foreach_get('color', buf)
        buf = buf.reshape(-1, 4)
        off = ob.location
        for li, loop in enumerate(me.loops):
            v = me.vertices[loop.vertex_index]
            p = v.co + off
            t = min(1.0, max(0.0, (0.66 - p.z) / 0.5))
            f = t * t * (3 - 2 * t)
            f *= 0.75 + 0.25 * max(0.0, -v.normal.y)
            f *= min(1.3, max(0.15, 0.75 + 0.9 * noise.noise(p * 7.0) + 0.45 * noise.noise(p * 23.0)))
            if p.z < 0.2:
                f = max(f, 0.8 + 0.15 * noise.noise(p * 15.0))
            buf[li, 3] = 1.0 - min(0.95, max(0.0, f))
        col.data.foreach_set('color', buf.ravel())
        # 確認の絵のための同じ量（書き出しには入れない名前）
        fa = me.attributes.new('dustpv', 'FLOAT', 'CORNER')
        fa.data.foreach_set('value', (1 - buf[:, 3]).astype(np.float32))


def dust_preview():
    """確認の絵だけ：頂点の色のアルファで砂の色を混ぜる（書き出しのあと）"""
    for name in ('Beta', 'Boot', 'Stripe', 'Silicone', 'Metal', 'Red', 'Blue'):
        m = MATS[name]
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        inv = nt.nodes.new('ShaderNodeAttribute')
        inv.attribute_name = 'dustpv'
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        ins = {i.identifier: i for i in mix.inputs}
        ins['A_Color'].default_value = bsdf.inputs['Base Color'].default_value[:]
        ins['B_Color'].default_value = (0.25, 0.235, 0.21, 1)
        nt.links.new(inv.outputs['Fac'], ins['Factor_Float'])
        nt.links.new({o.identifier: o for o in mix.outputs}['Result_Color'], bsdf.inputs['Base Color'])


def export(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    kw = dict(filepath=OUT, export_format='GLB', use_selection=True, export_normals=True, export_texcoords=True,
              export_tangents=False, export_materials='EXPORT', export_image_format='AUTO', export_yup=True)
    try:
        bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE', export_all_vertex_colors=False)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw, export_colors=True)
    tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in objs)
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB', tris, 'tris', flush=True)


def pose_for_preview(objs):
    """確認の絵の立ち姿：ひじを少し曲げ、足を肩幅に、腕を少し開く（アプリの「何もしていない姿」と同じ角度）"""
    by = {o.name: o for o in objs}
    parent = {'elbow0': 'shoulder0', 'elbow1': 'shoulder1', 'knee0': 'hip0', 'knee1': 'hip1'}
    bpy.context.view_layer.update()
    for ob in objs:
        joint = ob.name.split('__')[0]
        if joint in parent:
            par = by[parent[joint]]
            ob.parent = par
            ob.matrix_parent_inverse = par.matrix_world.inverted()
        elif joint != 'torso':
            # 印つきの部品（__cdr など）は、同じ関節の部品にくっつける
            if '__' in ob.name and joint in by:
                ob.parent = by[joint]
                ob.matrix_parent_inverse = by[joint].matrix_world.inverted()
    for i, side in ((0, 1), (1, -1)):
        by[f'shoulder{i}'].rotation_euler = (0.1, -0.2 * side, 0)
        by[f'elbow{i}'].rotation_euler = (-0.6, 0, 0)
        by[f'hip{i}'].rotation_euler = (0, -0.07 * side, 0)
        by[f'knee{i}'].rotation_euler = (0.06, 0.07 * side, 0)


def preview(objs):
    os.makedirs(PREVIEW, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = int(os.environ.get('PREVIEW_SAMPLES', '32'))
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'AgX'
    sc.render.resolution_x, sc.render.resolution_y = 640, 960
    w = sc.world or bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.56, 0.58, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.5
    sun.data.angle = 0.2
    sun.rotation_euler = (0.75, 0.15, -0.5)
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    kit = os.environ.get('KIT', 'cdr')  # cdr = 船長の月面の姿（PLSS・RCU・日よけ・赤い帯）、cmp = 第9章のエバンス飛行士
    for ob in objs:
        tag = ob.name.split('__')[1] if '__' in ob.name else ''
        if kit == 'cmp':
            ob.hide_render = tag in ('plss', 'rcu', 'cdr')
        elif kit == 'lunar':
            ob.hide_render = tag in ('ops', 'cdr')
        else:
            ob.hide_render = tag == 'ops'
    pose_for_preview(objs)
    views = os.environ.get('VIEWS', 'front,side,back,hero').split(',')
    spots = {
        'front': ((0, -6, 1.0), 'ORTHO'), 'side': ((6, 0, 1.0), 'ORTHO'), 'back': ((0, 6, 1.0), 'ORTHO'),
        'hero': ((1.4, -3.4, 1.5), 'PERSP'), 'chest': ((0.35, -1.3, 1.45), 'PERSP'),
        'head': ((0.75, -1.25, 1.95), 'PERSP'),
        'boot': ((1.0, -0.9, 0.35), 'PERSP'), 'hand': ((0.9, -0.9, 0.95), 'PERSP'), 'stripe': ((1.3, -1.3, 1.05), 'PERSP'),
    }
    for tag in views:
        pos, kind = spots[tag]
        cam.location = pos
        cam.data.type = kind
        cam.data.ortho_scale = 2.25
        cam.data.lens = 50 if tag == 'hero' else 70
        tgt = Vector({'chest': (0, 0, 1.45), 'head': (0, 0, 1.78), 'boot': (0.12, -0.05, 0.12), 'hand': (0.33, -0.1, 0.72), 'stripe': (0.25, 0, 0.95)}.get(tag, (0, 0, 1.0)))
        cam.rotation_euler = (tgt - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(PREVIEW, f'suit-{kit}-{tag}.png')
        bpy.ops.render.render(write_still=True)
        print('preview', sc.render.filepath, flush=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    make_materials()
    objs = build_all()
    if AO:
        bake_ao(objs)
    bake_dust(objs)
    export(objs)
    if PREVIEW:
        if os.environ.get('KIT', 'cdr') != 'cmp':
            dust_preview()
        preview(objs)


main()
