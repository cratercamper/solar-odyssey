"""
探査機の旅で使う、はやぶさ2（JAXA）の模型を Blender で組み立てる。公開された写真・資料の寸法に合わせた、オリジナルの再現（m）。

  本体  ：1.0 × 1.6 × 1.25 m の箱。側面は金色の断熱材（しわのある多層断熱材）、上面は白い放熱面（銀の鏡のタイル）
  太陽電池：左右に 3 枚ずつの翼（はしからはしまで約 6 m）。上面（+Z）と同じ向き
  上面（+Z、太陽と地球の側）：平らな高利得アンテナ 2 枚（X 帯の丸い板、Ka 帯の四角い板）、
           中利得アンテナ（小さなおわん）、再突入カプセル（直径 40 cm）、スタートラッカー
  下面（-Z、小惑星の側）：サンプラーホーン（長さ約 1 m の筒、先は少し広がる）、ターゲットマーカーの筒、
           光学カメラ ONC、レーザー高度計 LIDAR、衝突装置 SCI、ミネルバ II の筒
  側面  ：イオンエンジン 4 基（-X）、着陸機マスコット（-Y の下）、姿勢制御のスラスター（すみ）

glTF では +Z（Blender）が上（+Y）になる。アプリ（components/probeCam）は +Y を地球へ向ける：上面のアンテナが地球を向く。
しわの断熱材・太陽電池のセル・鏡のタイルの絵は、ここで numpy で描く（写真は使わない）。

実行:
  /home/user/.bpyvenv/bin/python tools/blender/build_hayabusa2.py
  PREVIEW=1  確認用の画像を PREVIEW_DIR に（hayabusa2-*.png）
  OUT=...    書き出し先（既定 public/models/probe-hayabusa2.glb）。そのあと node tools/glb/compress.mjs
"""

import math
import os

import bpy
import numpy as np

PREVIEW = os.environ.get('PREVIEW') == '1'
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')
OUT = os.environ.get('OUT', os.path.join(os.path.dirname(__file__), '../../public/models/probe-hayabusa2.glb'))
TEX = 1024
rng = np.random.default_rng(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ---- 絵（numpy） ----------------------------------------------------------------


def to_image(name, rgb, alpha=None, non_color=False):
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=alpha is not None)
    a = np.ones((h, w, 1)) if alpha is None else alpha[..., None]
    img.pixels.foreach_set(np.concatenate([np.clip(rgb, 0, 1), a], axis=2)[::-1].astype(np.float32).ravel())
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    img.file_format = 'JPEG'
    img.pack()
    return img


def blur(a, r):
    k = np.exp(-np.linspace(-2, 2, 2 * r + 1) ** 2)
    k /= k.sum()
    for ax in (0, 1):
        a = np.apply_along_axis(lambda m: np.convolve(np.concatenate([m[-r:], m, m[:r]]), k, mode='valid'), ax, a)
    return a


def normal_from(height, strength):
    gy, gx = np.gradient(height)
    n = np.stack([-gx * strength, gy * strength, np.ones_like(height)], axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def mli_maps():
    """しわのある金色の断熱材：ランダムな折り目（細長い山と谷）を重ねる"""
    n = TEX
    y, x = np.mgrid[0:n, 0:n] / n
    h = np.zeros((n, n))
    for _ in range(140):
        cx, cy = rng.random(2)
        ang = rng.random() * math.pi
        L = 0.05 + rng.random() * 0.3
        w = 0.002 + rng.random() * 0.006
        dx, dy = (x - cx + 0.5) % 1 - 0.5, (y - cy + 0.5) % 1 - 0.5
        u = dx * math.cos(ang) + dy * math.sin(ang)
        v = -dx * math.sin(ang) + dy * math.cos(ang)
        h += np.exp(-(v / w) ** 2) * np.clip(1 - np.abs(u) / L, 0, 1) * (rng.random() - 0.3)
    h += blur(rng.random((n, n)), 6) * 0.6
    h = blur(h, 2)
    shade = (h - h.min()) / (np.ptp(h) + 1e-9)
    gold = np.array([0.78, 0.55, 0.2])
    base = gold[None, None, :] * (0.72 + 0.5 * shade[..., None])
    # 縫い目（テープ）を、ところどころに
    seam = ((np.abs((x * 3) % 1 - 0.5) < 0.006) | (np.abs((y * 2) % 1 - 0.5) < 0.006))[..., None]
    base = np.where(seam, np.array([0.62, 0.45, 0.2]), base)
    return to_image('MLI_base', base), to_image('MLI_normal', normal_from(h, 18), non_color=True)


def cell_maps():
    """太陽電池：濃い青のセルを、銀の細い線とすき間で並べる（1枚の絵で 12×8 枚）"""
    n = TEX
    y, x = np.mgrid[0:n, 0:n] / n
    cu, cv = (x * 12) % 1, (y * 8) % 1
    gap = (cu < 0.04) | (cv < 0.05)
    fingers = (np.abs((cu * 14) % 1 - 0.5) < 0.04) & ~gap
    bus = (np.abs(cv - 0.5) < 0.015) & ~gap
    base = np.zeros((n, n, 3)) + np.array([0.06, 0.09, 0.24])
    base += blur(rng.random((n, n)), 3)[..., None] * 0.03
    base[gap] = (0.75, 0.76, 0.78)
    base[fingers | bus] = (0.32, 0.34, 0.4)
    h = np.where(gap, 0.0, 1.0)
    return to_image('Cell_base', base), to_image('Cell_normal', normal_from(blur(h, 1), 3), non_color=True)


def osr_maps():
    """上面の放熱面：銀の鏡のタイル（OSR）を 4 cm ほどで並べる"""
    n = 512
    y, x = np.mgrid[0:n, 0:n] / n
    cu, cv = (x * 16) % 1, (y * 16) % 1
    gap = (cu < 0.05) | (cv < 0.05)
    base = np.zeros((n, n, 3)) + 0.82
    base += (rng.random((16, 16))[(y * 16).astype(int) % 16, (x * 16).astype(int) % 16] * 0.08)[..., None]
    base[gap] = 0.35
    return to_image('OSR_base', base)


# ---- 材質 -------------------------------------------------------------------------


def material(name, color=(0.8, 0.8, 0.8), metal=0.0, rough=0.5, base=None, normal=None, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if base:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = base
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if normal:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = normal
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    return m


mli_b, mli_n = mli_maps()
cell_b, cell_n = cell_maps()
osr_b = osr_maps()
M = {
    'MLI': material('MLI', metal=0.55, rough=0.42, base=mli_b, normal=mli_n),
    'Black': material('BlackMLI', (0.03, 0.03, 0.035), rough=0.75),
    'OSR': material('OSR', metal=0.9, rough=0.18, base=osr_b),
    'White': material('White', (0.86, 0.86, 0.84), rough=0.55),
    'Cell': material('Cell', metal=0.1, rough=0.3, base=cell_b, normal=cell_n),
    'PanelBack': material('PanelBack', (0.55, 0.56, 0.58), metal=0.2, rough=0.6),
    'Frame': material('Frame', (0.7, 0.71, 0.73), metal=0.8, rough=0.35),
    'Metal': material('Metal', (0.62, 0.63, 0.66), metal=1.0, rough=0.3),
    'Dark': material('Dark', (0.12, 0.12, 0.13), metal=0.4, rough=0.5),
    'Ablator': material('Ablator', (0.33, 0.2, 0.1), rough=0.8),
    'Lens': material('Lens', (0.02, 0.03, 0.05), metal=0.2, rough=0.05),
    'Grid': material('Grid', (0.28, 0.28, 0.3), metal=1.0, rough=0.45),
}


# ---- 形 ---------------------------------------------------------------------------


def finish(obj, mat, bevel=0.0, uv_scale=1.0):
    obj.data.materials.append(M[mat])
    if bevel:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.cube_project(cube_size=uv_scale)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    for p in obj.data.polygons:
        p.use_smooth = False
    return obj


def box(name, size, loc, mat, bevel=0.01, rot=(0, 0, 0), uv=1.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, mat, bevel, uv)


def cyl(name, r, depth, loc, mat, rot=(0, 0, 0), verts=32, bevel=0.0, r2=None, uv=1.0, smooth=True):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object
    o.name = name
    finish(o, mat, bevel, uv)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = len(p.vertices) == 4
    return o


def sphere(name, r, loc, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=32, ring_count=16)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    finish(o, mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


BX, BY, BZ = 1.0, 1.6, 1.25
hx, hy, hz = BX / 2, BY / 2, BZ / 2

# 本体：金色の断熱材の箱。下面は黒、上面は白い放熱面
box('Bus', (BX, BY, BZ), (0, 0, 0), 'MLI', bevel=0.02, uv=0.6)
box('TopDeck', (BX - 0.04, BY - 0.04, 0.02), (0, 0, hz + 0.01), 'OSR', bevel=0.004, uv=0.64)
box('BottomDeck', (BX - 0.02, BY - 0.02, 0.02), (0, 0, -hz - 0.01), 'Black', bevel=0.004)
# 側面の黒い放熱パネル（±X の上半分）
for s in (1, -1):
    box(f'SidePanel{s}', (0.01, 1.1, 0.45), (s * (hx + 0.006), 0, 0.3), 'Black', bevel=0.003)
# 縁のフレーム
for sx in (1, -1):
    for sy in (1, -1):
        box(f'Edge{sx}{sy}', (0.04, 0.04, BZ + 0.02), (sx * hx, sy * hy, 0), 'Frame', bevel=0.006)

# 太陽電池の翼：±Y に 3 枚ずつ。セルは +Z（上面と同じ向き）
PW, PL, GAP = 0.9, 0.7, 0.03
for s in (1, -1):
    y0 = s * (hy + 0.18)
    cyl(f'Yoke{s}', 0.025, 0.36, (0, s * (hy + 0.09), 0.25), 'Metal', rot=(math.pi / 2, 0, 0), verts=12)
    for k in range(3):
        yc = y0 + s * (PL / 2 + k * (PL + GAP))
        box(f'PanelBack{s}{k}', (PW + 0.02, PL + 0.02, 0.025), (0, yc, 0.25), 'PanelBack', bevel=0.004)
        box(f'Panel{s}{k}', (PW, PL, 0.006), (0, yc, 0.265), 'Cell', bevel=0.0, uv=1.0)
        if k < 2:
            for hxs in (-0.3, 0.3):
                box(f'Hinge{s}{k}{hxs}', (0.05, GAP + 0.04, 0.03), (hxs, yc + s * (PL / 2 + GAP / 2), 0.25), 'Metal', bevel=0.004)

top = hz + 0.02
# X 帯の高利得アンテナ（平らな丸い板、少し持ち上げる）
cyl('XHGA_post', 0.05, 0.12, (-0.16, -0.3, top + 0.06), 'Metal', verts=16)
cyl('XHGA', 0.42, 0.05, (-0.16, -0.3, top + 0.14), 'White', verts=64, bevel=0.01)
cyl('XHGA_face', 0.39, 0.006, (-0.16, -0.3, top + 0.168), 'Grid', verts=64)
# Ka 帯の高利得アンテナ（四角い板）
box('KaHGA_post', (0.06, 0.06, 0.1), (0.25, 0.42, top + 0.05), 'Metal')
box('KaHGA', (0.36, 0.36, 0.04), (0.25, 0.42, top + 0.12), 'White', bevel=0.008)
box('KaHGA_face', (0.32, 0.32, 0.005), (0.25, 0.42, top + 0.142), 'Grid', bevel=0)
# 中利得アンテナ（小さなおわん、首ふり台つき）
cyl('MGA_mount', 0.05, 0.16, (0.3, -0.45, top + 0.08), 'Metal', verts=16)
cyl('MGA', 0.16, 0.08, (0.3, -0.45, top + 0.2), 'White', verts=40, r2=0.05, rot=(0, 0, 0))
# 再突入カプセル（直径 40 cm、茶色の耐熱材の上に銀のふた）
cyl('CapsuleBase', 0.22, 0.05, (-0.25, 0.45, top + 0.025), 'Metal', verts=48)
cyl('Capsule', 0.2, 0.13, (-0.25, 0.45, top + 0.11), 'Ablator', verts=48, r2=0.15)
sphere('CapsuleTop', 0.15, (-0.25, 0.45, top + 0.17), 'Metal', scale=(1, 1, 0.35))
# スタートラッカー（黒い筒 2 本）と、低利得アンテナ
for i, (x, y) in enumerate(((0.38, 0.0), (0.38, -0.12))):
    cyl(f'STT{i}', 0.04, 0.16, (x, y, top + 0.08), 'Black', verts=20, rot=(0.35, 0, 0))
cyl('LGA', 0.03, 0.18, (-0.42, 0.0, top + 0.09), 'White', verts=16, r2=0.015)

bot = -hz - 0.02
# サンプラーホーン：本体の下から約 1 m、先が少し広がる。たたんだ部分の太い筒と、伸びた細い筒
cyl('HornBase', 0.11, 0.18, (0.05, -0.1, bot - 0.09), 'Metal', verts=32)
cyl('Horn', 0.075, 0.75, (0.05, -0.1, bot - 0.55), 'Frame', verts=32)
cyl('HornRing', 0.09, 0.03, (0.05, -0.1, bot - 0.46), 'Metal', verts=32)
cyl('HornTip', 0.075, 0.12, (0.05, -0.1, bot - 0.98), 'Frame', verts=32, r2=0.1)
# ターゲットマーカーの筒（5 個入り）
cyl('TargetMarkers', 0.13, 0.22, (-0.28, 0.35, bot - 0.11), 'White', verts=32, bevel=0.01)
# 光学カメラ ONC-T と広角 ONC-W1、レーザー高度計 LIDAR
cyl('ONC_T', 0.07, 0.2, (0.3, 0.3, bot - 0.1), 'Black', verts=24)
cyl('ONC_T_lens', 0.05, 0.01, (0.3, 0.3, bot - 0.205), 'Lens', verts=24)
cyl('ONC_W1', 0.04, 0.08, (0.32, 0.55, bot - 0.04), 'Black', verts=20)
box('LIDAR', (0.25, 0.22, 0.18), (-0.25, -0.35, bot - 0.09), 'Black', bevel=0.01)
cyl('LIDAR_lens', 0.08, 0.01, (-0.25, -0.35, bot - 0.185), 'Lens', verts=32)
# 衝突装置 SCI（円盤の箱）と、ミネルバ II の筒
cyl('SCI', 0.15, 0.2, (-0.3, -0.62, bot - 0.1), 'MLI', verts=36, bevel=0.01, uv=0.4)
for i, x in enumerate((0.3, 0.42)):
    cyl(f'MINERVA{i}', 0.08, 0.17, (x, -0.55, bot - 0.085), 'White', verts=24, bevel=0.005)

# 着陸機マスコット（-Y の面の下のほうに、30 cm ほどの箱）
box('MASCOT', (0.3, 0.2, 0.28), (0.15, -hy - 0.1, -0.35), 'MLI', bevel=0.01, uv=0.3)

# イオンエンジン 4 基（-X の面、首ふり台の上）
box('IESMount', (0.06, 0.55, 0.55), (-hx - 0.03, 0.1, -0.25), 'Black', bevel=0.01)
for i, (y, z) in enumerate(((-0.05, -0.1), (0.25, -0.1), (-0.05, -0.4), (0.25, -0.4))):
    cyl(f'IES{i}', 0.09, 0.07, (-hx - 0.09, 0.1 + y - 0.1, z), 'Metal', rot=(0, math.pi / 2, 0), verts=32)
    cyl(f'IESgrid{i}', 0.075, 0.005, (-hx - 0.127, 0.1 + y - 0.1, z), 'Grid', rot=(0, math.pi / 2, 0), verts=32)

# 姿勢制御のスラスター（すみに 12 個）
for sx in (1, -1):
    for sy in (1, -1):
        for sz in (1, -1):
            cyl(f'RCS{sx}{sy}{sz}', 0.025, 0.06, (sx * (hx + 0.02), sy * (hy - 0.08), sz * (hz - 0.1)), 'Metal', rot=(0, sx * math.pi / 2, 0), verts=12, r2=0.04)

# まとめて一つに（材質は残す）
objs = [o for o in scene.objects if o.type == 'MESH']
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.convert(target='MESH')
bpy.ops.object.join()
probe = bpy.context.object
probe.name = 'Hayabusa2'

if PREVIEW:
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.device = 'CPU'
    scene.render.resolution_x, scene.render.resolution_y = 960, 640
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.01, 0.01, 0.015, 1)
    bpy.ops.object.light_add(type='SUN', rotation=(0.6, 0.3, 0.8))
    bpy.context.object.data.energy = 4
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    scene.camera = cam
    cam.data.lens = 40
    bpy.ops.object.empty_add(location=(0, 0, 0))
    aim = bpy.context.object
    track = cam.constraints.new('TRACK_TO')
    track.target = aim
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'
    for name, loc in (('hero', (4.5, -5.5, 3.0)), ('under', (3.0, -4.0, -2.8)), ('top', (0.8, -1.2, 7.5))):
        cam.location = loc
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'hayabusa2-{name}.png')
        bpy.ops.render.render(write_still=True)
    for o in list(scene.objects):
        if o.type != 'MESH':
            bpy.data.objects.remove(o)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='JPEG', export_apply=True, export_yup=True)
print('wrote', OUT)
