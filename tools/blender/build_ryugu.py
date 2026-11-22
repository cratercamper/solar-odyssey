"""
探査機の旅（はやぶさ2）で使う、小惑星リュウグウの模型を Blender で作る。公開された写真と寸法をもとにした、オリジナルの再現。

  形   ：そろばん玉（コマ）の形。赤道の直径 約1,004 m、極の直径 約875 m、赤道にぐるりと尾根（リュウジン尾根）
  表面 ：とても黒い（光を 4.5% しか返さない）。大小の岩だらけで、大きなクレーター（ウラシマ 約290 m）、
         南極の近くにいちばん大きな岩（オトヒメ岩塊 約160 m）
  単位 ：1 = 1 km。原点が中心、+Z（glTF では +Y）が北極。アプリで自転軸の向きと自転（7.63時間、逆向き）を付ける

実行:
  /home/user/.bpyvenv/bin/python tools/blender/build_ryugu.py
  PREVIEW=1  確認用の画像を PREVIEW_DIR に（ryugu-*.png）
  OUT=...    書き出し先（既定 public/models/ryugu.glb）。そのあと node tools/glb/quantize.mjs
  HEIGHT=... 地面の高さの表（既定 public/models/ryugu-height.bin）
"""

import math
import os

import bpy
import bmesh
import numpy as np
from mathutils import Vector

PREVIEW = os.environ.get('PREVIEW') == '1'
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')
OUT = os.environ.get('OUT', os.path.join(os.path.dirname(__file__), '../../public/models/ryugu.glb'))
rng = np.random.default_rng(162173)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

R_EQ = 0.502
R_POLE = 0.4375


def top_shape(d):
    """単位ベクトル d の向きの半径（km）。赤道でとがった、そろばん玉の形"""
    lat = math.asin(max(-1, min(1, d[2])))
    s = abs(math.sin(lat))
    # 赤道から極へ、ほぼまっすぐな円すいの面（そろばん玉）。極は少し丸める
    cone = R_EQ * (1 - 0.42 * s ** 1.15)
    pole_round = R_POLE * (0.86 + 0.14 * s)
    r = cone * (1 - s ** 6) + pole_round * s ** 6
    # 赤道の尾根：細くもりあがる
    r += 0.012 * math.exp(-(lat / 0.08) ** 2)
    return r


# ---- 値の雑音（ゆがみ） ----
octaves = [(rng.normal(size=(3,)), rng.random() * 6.28, f) for f in (1.6, 2.9, 5.3, 9.7, 17.0, 31.0, 55.0) for _ in range(3)]


def noise(p):
    v = 0.0
    for dirv, ph, f in octaves:
        v += math.sin(f * float(np.dot(dirv, p)) + ph) / f ** 1.3
    return v


# ---- クレーター（位置の向き、半径 km、深さ） ----
CRATERS = [((0.3, -0.9, 0.05), 0.145, 0.03)]  # ウラシマ（赤道の近く、直径 約290 m）
for _ in range(26):
    d = rng.normal(size=3)
    CRATERS.append((tuple(d), 0.02 + rng.random() ** 2 * 0.08, 0.004 + rng.random() * 0.012))
CRATERS = [(np.array(c) / np.linalg.norm(c), r, depth) for c, r, depth in CRATERS]


def crater_offset(d):
    off = 0.0
    for c, r, depth in CRATERS:
        ang = math.acos(max(-1, min(1, float(np.dot(c, d))))) * R_EQ
        x = ang / r
        if x < 1.4:
            # 鉢の形と、まわりの低い縁
            off += -depth * (1 - x * x) if x < 1 else depth * 0.25 * math.exp(-((x - 1.05) / 0.15) ** 2)
    return off


bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=7, radius=1.0)
for v in bm.verts:
    d = np.array(v.co.normalized())
    r = top_shape(d) * (1 + 0.03 * noise(d * 1.0)) + crater_offset(d)
    v.co = Vector(d * r)
mesh = bpy.data.meshes.new('Ryugu')
bm.to_mesh(mesh)
bm.free()
body = bpy.data.objects.new('Ryugu', mesh)
scene.collection.objects.link(body)

# ---- 岩：大きさはべき乗の分布（小さいものほど多い）。オトヒメ岩塊は南極の近く ----
ROCKS = [((0.05, 0.1, -1.0), 0.08)]  # オトヒメ岩塊（直径 約160 m）
for _ in range(900):
    d = rng.normal(size=3)
    ROCKS.append((tuple(d), 0.004 + 0.04 * rng.random() ** 5))
rock_bm = bmesh.new()
for c, size in ROCKS:
    d = np.array(c) / np.linalg.norm(c)
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=3 if size > 0.03 else 2 if size > 0.012 else 1, radius=1.0)
    axes = rng.random(3) * 0.6 + 0.6
    rot = np.linalg.qr(rng.normal(size=(3, 3)))[0]
    base = d * (top_shape(d) * (1 + 0.03 * noise(d)) + crater_offset(d))
    for v in tmp.verts:
        p = np.array(v.co) * axes * (1 + 0.18 * noise(np.array(v.co) * 3 + d * 7))
        p = rot @ p * size
        v.co = Vector(base + p - d * size * 0.35)
    tmp_mesh = bpy.data.meshes.new('t')
    tmp.to_mesh(tmp_mesh)
    tmp.free()
    rock_bm.from_mesh(tmp_mesh)
    bpy.data.meshes.remove(tmp_mesh)
rock_mesh = bpy.data.meshes.new('Rocks')
rock_bm.to_mesh(rock_mesh)
rock_bm.free()
rocks = bpy.data.objects.new('Rocks', rock_mesh)
scene.collection.objects.link(rocks)

# ---- 色：とても黒い炭素質（光を 4.5% しか返さない）。岩は少しだけ明るい ----
for p in body.data.polygons:
    p.use_smooth = True
mat = bpy.data.materials.new('Regolith')
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.05, 0.048, 0.046, 1)
bsdf.inputs['Roughness'].default_value = 0.95
body.data.materials.append(mat)
rock_mat = mat.copy()
rock_mat.name = 'Boulder'
rock_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.065, 0.062, 0.058, 1)
rocks.data.materials.append(rock_mat)

if PREVIEW:
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.render.resolution_x, scene.render.resolution_y = 800, 800
    scene.view_settings.exposure = 3.5
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
    bpy.ops.object.light_add(type='SUN', rotation=(1.2, 0.0, 0.9))
    bpy.context.object.data.energy = 6
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    scene.camera = cam
    cam.data.lens = 50
    bpy.ops.object.empty_add(location=(0, 0, 0))
    track = cam.constraints.new('TRACK_TO')
    track.target = bpy.context.object
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'
    for name, loc in (('side', (0, -3.2, 0.3)), ('south', (0.5, -2.0, -2.4))):
        cam.location = loc
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'ryugu-{name}.png')
        bpy.ops.render.render(write_still=True)
    for o in list(scene.objects):
        if o.type != 'MESH':
            bpy.data.objects.remove(o)

# ---- 地面の高さの表（アプリで、探査機を地面に降ろすのと、近くの細かい地面に使う） ----
# glTF の向き（+Y が北極）で、緯度 -90〜90°（181）× 経度 -180〜179°（360）、1° ごと。
# 値は中心からの距離（km）を、300 m からの cm にした 16 bit。経度は atan2(z, x)
HEIGHT = os.environ.get('HEIGHT', os.path.join(os.path.dirname(OUT), 'ryugu-height.bin'))
heights = np.zeros((181, 360), dtype='<u2')
for i in range(181):
    lat = math.radians(i - 90)
    for j in range(360):
        lon = math.radians(j - 180)
        x3, y3, z3 = math.cos(lat) * math.cos(lon), math.sin(lat), math.cos(lat) * math.sin(lon)
        d = np.array([x3, -z3, y3])
        r = top_shape(d) * (1 + 0.03 * noise(d * 1.0)) + crater_offset(d)
        heights[i, j] = round((r - 0.3) * 1e5)
heights.tofile(HEIGHT)
print('wrote', HEIGHT)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True)
print('wrote', OUT)
