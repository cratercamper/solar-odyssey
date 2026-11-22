"""岩石コレクションの「標本写真」を作る。

1 種類ずつ、それらしい形と質感の岩を作り、暗い台の上で撮る（Cycles）。
出力：public/rocks/<id>.png（背景は透明。convert <id>.png -channel A -level 16%,100% +channel -quality 85 <id>.webp（床の薄い影を消す） で webp にする）

  /home/user/.bpyvenv/bin/python tools/blender/render_rocks.py            # 全部
  ONLY=basalt,quartz SIZE=256 SAMPLES=16 python tools/blender/render_rocks.py   # 試し撮り

色は src/data/rockSamples.ts の color に合わせている。
"""

import math
import os
import random

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.environ.get('OUT', os.path.join(ROOT, 'public', 'rocks'))
SIZE = int(os.environ.get('SIZE', '512'))
SAMPLES = int(os.environ.get('SAMPLES', '64'))
ONLY = [s for s in os.environ.get('ONLY', '').split(',') if s]


def hex_rgb(h, k=1.0):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    # sRGB → linear
    lin = [(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) * k for x in c]
    return (*lin, 1.0)


def mix(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(4))


# shape: rock / slab / pebble / crystal / beads / berries / crust
# feat: layers / vein / clasts / vesicles / dents / speckle / streaks / patches / glass
ROCKS = {
    # 火星
    'mudstone': dict(shape='slab', c='#8e6a55', c2='#4e3528', rough=0.9, feat='layers', bands=12),
    'basalt': dict(shape='rock', c='#4b4038', c2='#2e2722', rough=0.85, feat='vesicles'),
    'blueberry': dict(shape='berries', c='#3b3b44', c2='#22222a', rough=0.45, ground='#8a5236'),
    'vein': dict(shape='rock', c='#9a7058', c2='#7a5440', rough=0.85, feat='vein', vc='#efe9dc'),
    'meteorite': dict(shape='rock', c='#5d5a58', c2='#3a3634', rough=0.35, metal=0.85, feat='dents', squash=(1.15, 0.95, 0.8)),
    # 月
    'anorthosite': dict(shape='rock', c='#c9c6bf', c2='#9c988f', rough=0.8, feat='speckle', sc='#f4f2ec'),
    'mare-basalt': dict(shape='rock', c='#4a4846', c2='#2f2e2d', rough=0.85, feat='vesicles'),
    'breccia': dict(shape='rock', c='#8b8781', c2='#4e4a46', rough=0.85, feat='clasts', sc='#d8d4cc'),
    'orange-soil': dict(shape='beads', c='#b8743c', c2='#7a4320', rough=0.25, ground='#4e3a2c'),
    # 地球
    'sandstone': dict(shape='rock', c='#a8573a', c2='#c47a52', rough=0.95, feat='layers', bands=7),
    'shale': dict(shape='slab', c='#6d5d55', c2='#4c403a', rough=0.8, feat='layers', bands=30, thin=True),
    'quartz': dict(shape='crystal', c='#e8e4dc', c2='#cfc8bc', rough=0.05),
    # 金星・水星
    'venus-basalt': dict(shape='rock', c='#5e4a36', c2='#2a1f16', rough=0.8, feat='vesicles', heat=True),
    'mercury-crust': dict(shape='rock', c='#6f6a64', c2='#4a4642', rough=0.9, feat='speckle', sc='#8e8880'),
    # イオ
    'sulfur': dict(shape='crust', c='#d6c04a', c2='#c46a1e', rough=0.6, feat='patches'),
    # 氷の衛星
    'ice': dict(shape='rock', c='#d4dce4', c2='#9fb4c8', rough=0.15, feat='glass', ice=True),
    'salt': dict(shape='slab', c='#d4dce4', c2='#8a5a3a', rough=0.3, feat='streaks', ice=True),
    # タイタン
    'titan-pebble': dict(shape='pebble', c='#9a8466', c2='#6e5c44', rough=0.6, feat='speckle', sc='#b8a586'),
    # レースの金メダルのごほうび（TRACKS の reward）
    'layered-sulfate': dict(shape='rock', c='#d6bb92', c2='#9a7454', rough=0.9, feat='layers', bands=11),
    'troctolite': dict(shape='rock', c='#8f9478', c2='#55603f', rough=0.8, feat='speckle', sc='#ebe7da'),
    'europa-salt': dict(shape='crust', c='#e6d38e', c2='#b98f55', rough=0.4, feat='streaks', ice=True),
    # そのほか
    'regolith-rock': dict(shape='rock', c='#6a655f', c2='#47433e', rough=0.9, feat='speckle', sc='#85807a'),
}


# ---- 場面 -------------------------------------------------------------------

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    sc.render.resolution_x = SIZE
    sc.render.resolution_y = SIZE
    # 背景は透明（影だけ残す）。カードの背景はページ側で描き、まだ見つけていない岩はシルエットにする
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Filmic' if 'Filmic' in [i.identifier for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'AgX'
    sc.view_settings.look = 'None'
    world = bpy.data.worlds.new('W')
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.012, 0.014, 0.02, 1)
    bg.inputs[1].default_value = 0.6
    return sc


def stage():
    """標本を置く、暗い布張りの台（奥に向かって持ち上がる背景）"""
    bpy.ops.mesh.primitive_plane_add(size=1)
    p = bpy.context.object
    me = p.data
    # 奥で立ち上がるホリゾント
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.object.mode_set(mode='OBJECT')
    verts = []
    faces = []
    n = 24
    for i in range(n + 1):
        t = i / n
        y = -30 + t * 60
        verts += [(-30, y, 0), (30, y, 0)]
    for i in range(n):
        a = i * 2
        faces.append((a, a + 1, a + 3, a + 2))
    me.clear_geometry()
    me.from_pydata(verts, [], faces)
    for f in me.polygons:
        f.use_smooth = True
    m = bpy.data.materials.new('Stage')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.012, 0.013, 0.016, 1)
    b.inputs['Roughness'].default_value = 0.95
    p.data.materials.append(m)
    p.is_shadow_catcher = True


def lights(sc):
    def area(name, loc, energy, size, color=(1, 1, 1)):
        d = bpy.data.lights.new(name, 'AREA')
        d.energy = energy
        d.size = size
        d.color = color
        o = bpy.data.objects.new(name, d)
        sc.collection.objects.link(o)
        o.location = loc
        dirv = Vector((0, 0, 0.5)) - Vector(loc)
        o.rotation_euler = dirv.to_track_quat('-Z', 'Y').to_euler()
        return o

    area('Key', (-3.0, -2.4, 3.6), 520, 2.2, (1.0, 0.97, 0.92))
    area('Fill', (3.4, -2.8, 1.6), 110, 3.0, (0.8, 0.88, 1.0))
    area('Rim', (1.6, 3.2, 2.8), 380, 1.6, (0.9, 0.95, 1.0))


def camera(sc, h=0.5):
    d = bpy.data.cameras.new('Cam')
    d.lens = 100
    o = bpy.data.objects.new('Cam', d)
    sc.collection.objects.link(o)
    o.location = (0.0, -6.4, 2.6)
    target = Vector((0, 0, h))
    o.rotation_euler = (target - o.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = o


# ---- 形 ---------------------------------------------------------------------

def tex(kind, size, seed, **kw):
    t = bpy.data.textures.new(f'{kind}{seed}', kind)
    t.noise_scale = size
    for k, v in kw.items():
        setattr(t, k, v)
    return t


def displace(o, t, strength, mid=0.5, seed=0):
    m = o.modifiers.new('D', 'DISPLACE')
    m.texture = t
    m.strength = strength
    m.mid_level = mid
    m.texture_coords = 'LOCAL'
    # 種ごとに、模様をずらす
    e = bpy.data.objects.new(f'Off{seed}', None)
    bpy.context.scene.collection.objects.link(e)
    r = random.Random(seed)
    e.location = (r.uniform(-50, 50), r.uniform(-50, 50), r.uniform(-50, 50))
    m.texture_coords = 'OBJECT'
    m.texture_coords_object = e
    return m


def apply_all(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def sit_on_floor(o, sink=0.04):
    bpy.context.view_layer.update()
    zmin = min((o.matrix_world @ v.co).z for v in o.data.vertices)
    o.location.z -= zmin + sink


def rock_mesh(seed, scale=(1.0, 0.85, 0.7), rough=1.0, sub=7):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=0.9)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    # 割れたような大きな面（ボロノイ）と、細かいでこぼこ
    displace(o, tex('VORONOI', 0.9, seed, distance_metric='DISTANCE', noise_intensity=1.0), -0.34 * rough, 0.0, seed)
    displace(o, tex('VORONOI', 0.35, seed + 5, distance_metric='DISTANCE', noise_intensity=1.0), -0.09 * rough, 0.0, seed + 5)
    displace(o, tex('CLOUDS', 0.55, seed + 1, noise_depth=3), 0.2 * rough, 0.5, seed + 1)
    displace(o, tex('CLOUDS', 0.1, seed + 2, noise_depth=4, noise_type='HARD_NOISE'), 0.045 * rough, 0.5, seed + 2)
    displace(o, tex('CLOUDS', 0.03, seed + 4, noise_depth=2), 0.012 * rough, 0.5, seed + 4)
    apply_all(o)
    for f in o.data.polygons:
        f.use_smooth = True
    o.rotation_euler = (0, 0, random.Random(seed).uniform(-0.6, 0.6))
    return o


def pebble_mesh(seed):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=0.9)
    o = bpy.context.object
    o.scale = (1.15, 0.9, 0.62)
    bpy.ops.object.transform_apply(scale=True)
    displace(o, tex('CLOUDS', 0.9, seed, noise_depth=1), 0.12, 0.5, seed)
    displace(o, tex('CLOUDS', 0.08, seed + 3, noise_depth=1), 0.008, 0.5, seed + 3)
    apply_all(o)
    for f in o.data.polygons:
        f.use_smooth = True
    return o


def slab_mesh(seed):
    o = rock_mesh(seed, (1.25, 0.95, 0.42), 0.8)
    # 層にそって段差（ステップ状に少しへこませる）
    return o


def crystal_mesh(seed):
    """石英：六角柱のとがった結晶の群れ"""
    r = random.Random(seed)
    parts = []
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=0.55)
    base = bpy.context.object
    base.scale = (1.3, 1.0, 0.45)
    bpy.ops.object.transform_apply(scale=True)
    displace(base, tex('CLOUDS', 0.4, seed, noise_depth=2), 0.18, 0.5, seed)
    apply_all(base)
    parts.append(base)
    for i in range(13):
        h = r.uniform(0.45, 1.1) * (1.15 if i == 0 else 1)
        w = r.uniform(0.08, 0.15) * (1.3 if i == 0 else 1)
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=w, depth=h)
        c = bpy.context.object
        # 先をとがらせる：上の面を 1 点に
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.object.mode_set(mode='OBJECT')
        top = [p for p in c.data.polygons if p.normal.z > 0.9][0]
        top.select = True
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.extrude_region_move(TRANSFORM_OT_translate={'value': (0, 0, w * 1.4)})
        bpy.ops.transform.resize(value=(0.01, 0.01, 1))
        bpy.ops.object.mode_set(mode='OBJECT')
        a = r.uniform(0, math.tau)
        tilt = 0 if i == 0 else r.uniform(0.25, 0.75)
        c.location = (math.cos(a) * r.uniform(0.15, 0.55) * (0 if i == 0 else 1), math.sin(a) * r.uniform(0.1, 0.35) * (0 if i == 0 else 1), h / 2 + 0.05)
        c.rotation_euler = (math.sin(a) * tilt, -math.cos(a) * tilt, r.uniform(0, 1))
        bev = c.modifiers.new('B', 'BEVEL')
        bev.width = 0.008
        bev.segments = 2
        apply_all(c)
        parts.append(c)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts[1:]:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[1]
    bpy.ops.object.join()
    return base, parts[1]


def balls(n, rmin, rmax, spread, seed, z0=0.0):
    r = random.Random(seed)
    out = []
    placed = []
    tries = 0
    while len(out) < n and tries < n * 30:
        tries += 1
        rad = r.uniform(rmin, rmax)
        a = r.uniform(0, math.tau)
        d = spread * math.sqrt(r.random())
        x, y = math.cos(a) * d, math.sin(a) * d * 0.8
        # 山になるように：真ん中ほど上に積む
        z = z0 + rad + max(0.0, (1 - d / spread)) * spread * 0.35 * r.random()
        if any((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2 < (rad + pr) ** 2 * 0.9 for px, py, pz, pr in placed):
            continue
        placed.append((x, y, z, rad))
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=rad, location=(x, y, z))
        b = bpy.context.object
        b.scale = (1, 1, r.uniform(0.85, 1.0))
        for f in b.data.polygons:
            f.use_smooth = True
        out.append(b)
    return out


def ground_patch(color, seed, rad=1.5):
    """細かい砂のまくら（ブルーベリーやガラス玉の下）"""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=120, y_subdivisions=120, size=rad * 2.4)
    g = bpy.context.object
    for v in g.data.vertices:
        d = Vector((v.co.x, v.co.y)).length / rad
        v.co.z = max(0.0, 1 - d) ** 1.2 * 0.16 - 0.03
    displace(g, tex('CLOUDS', 0.05, seed, noise_depth=2), 0.02, 0.5, seed)
    apply_all(g)
    for f in g.data.polygons:
        f.use_smooth = True
    m = bpy.data.materials.new('Sand')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = 120
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = hex_rgb(color, 0.7)
    ramp.color_ramp.elements[1].color = hex_rgb(color, 1.15)
    nt.links.new(n.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 1.0
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.5
    nt.links.new(n.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    g.data.materials.append(m)
    return g


# ---- 質感 ---------------------------------------------------------------------

def rock_material(name, p):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    b = N['Principled BSDF']
    coord = N.new('ShaderNodeTexCoord')
    c1, c2 = hex_rgb(p['c']), hex_rgb(p['c2'])

    # まだら（大きなむら＋細かい粒）
    big = N.new('ShaderNodeTexNoise')
    big.inputs['Scale'].default_value = 2.2
    big.inputs['Detail'].default_value = 6
    L.new(coord.outputs['Object'], big.inputs['Vector'])
    fine = N.new('ShaderNodeTexNoise')
    fine.inputs['Scale'].default_value = 60
    fine.inputs['Detail'].default_value = 4
    L.new(coord.outputs['Object'], fine.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[0].color = c2
    ramp.color_ramp.elements[1].color = c1
    L.new(big.outputs['Fac'], ramp.inputs['Fac'])
    grain = N.new('ShaderNodeMixRGB')
    grain.blend_type = 'OVERLAY'
    grain.inputs['Fac'].default_value = 0.35
    L.new(ramp.outputs['Color'], grain.inputs[1])
    L.new(fine.outputs['Fac'], grain.inputs[2])
    color = grain.outputs['Color']

    height = fine.outputs['Fac']
    bump_strength = 0.35
    feat = p.get('feat')

    def mix_in(col_out, fac_out, col):
        mx = N.new('ShaderNodeMixRGB')
        L.new(fac_out, mx.inputs['Fac'])
        L.new(col_out, mx.inputs[1])
        mx.inputs[2].default_value = col
        return mx.outputs['Color']

    if feat == 'layers':
        w = N.new('ShaderNodeTexWave')
        w.wave_type = 'BANDS'
        w.bands_direction = 'Z'
        w.inputs['Scale'].default_value = p.get('bands', 10) / 4
        w.inputs['Distortion'].default_value = 2.0 if not p.get('thin') else 0.6
        w.inputs['Detail'].default_value = 3
        L.new(coord.outputs['Object'], w.inputs['Vector'])
        r2 = N.new('ShaderNodeValToRGB')
        r2.color_ramp.elements[0].color = mix(c1, c2, 0.9)
        r2.color_ramp.elements[1].color = mix(c1, (1, 1, 1, 1), 0.08)
        L.new(w.outputs['Fac'], r2.inputs['Fac'])
        mx = N.new('ShaderNodeMixRGB')
        mx.blend_type = 'MULTIPLY'
        mx.inputs['Fac'].default_value = 0.85
        L.new(color, mx.inputs[1])
        L.new(r2.outputs['Color'], mx.inputs[2])
        color = mx.outputs['Color']
        height = w.outputs['Fac']
        bump_strength = 0.5
    elif feat == 'vein':
        w = N.new('ShaderNodeTexWave')
        w.wave_type = 'BANDS'
        w.bands_direction = 'DIAGONAL'
        w.inputs['Scale'].default_value = 0.5
        w.inputs['Distortion'].default_value = 5
        w.inputs['Detail'].default_value = 4
        L.new(coord.outputs['Object'], w.inputs['Vector'])
        r2 = N.new('ShaderNodeValToRGB')
        r2.color_ramp.interpolation = 'EASE'
        r2.color_ramp.elements[0].position = 0.955
        r2.color_ramp.elements[1].position = 0.975
        L.new(w.outputs['Fac'], r2.inputs['Fac'])
        color = mix_in(color, r2.outputs['Color'], hex_rgb(p['vc']))
        # 白い脈は少し盛り上がる
        add = N.new('ShaderNodeMath')
        add.operation = 'ADD'
        L.new(fine.outputs['Fac'], add.inputs[0])
        L.new(r2.outputs['Color'], add.inputs[1])
        height = add.outputs['Value']
    elif feat == 'clasts':
        v = N.new('ShaderNodeTexVoronoi')
        v.inputs['Scale'].default_value = 13
        L.new(coord.outputs['Object'], v.inputs['Vector'])
        r2 = N.new('ShaderNodeValToRGB')
        r2.color_ramp.elements.new(0.5)
        e = r2.color_ramp.elements
        e[0].position, e[0].color = 0.0, hex_rgb(p['sc'])
        e[1].position, e[1].color = 0.45, mix(c1, c2, 0.6)
        e[2].position, e[2].color = 0.8, c1
        r2.color_ramp.interpolation = 'CONSTANT'
        L.new(v.outputs['Color'], r2.inputs['Fac'])
        mx = N.new('ShaderNodeMixRGB')
        mx.inputs['Fac'].default_value = 0.8
        L.new(color, mx.inputs[1])
        L.new(r2.outputs['Color'], mx.inputs[2])
        color = mx.outputs['Color']
        height = v.outputs['Distance']
        bump_strength = 0.4
    elif feat == 'vesicles':
        v = N.new('ShaderNodeTexVoronoi')
        v.inputs['Scale'].default_value = 26
        L.new(coord.outputs['Object'], v.inputs['Vector'])
        holes = N.new('ShaderNodeMath')
        holes.operation = 'GREATER_THAN'
        holes.inputs[1].default_value = 0.11
        L.new(v.outputs['Distance'], holes.inputs[0])
        sm = N.new('ShaderNodeMath')
        sm.operation = 'MULTIPLY'
        L.new(holes.outputs['Value'], sm.inputs[0])
        L.new(fine.outputs['Fac'], sm.inputs[1])
        height = sm.outputs['Value']
        dark = N.new('ShaderNodeMixRGB')
        dark.blend_type = 'MULTIPLY'
        dark.inputs['Fac'].default_value = 1.0
        L.new(color, dark.inputs[1])
        inv = N.new('ShaderNodeMapRange')
        inv.inputs['To Min'].default_value = 0.25
        L.new(holes.outputs['Value'], inv.inputs['Value'])
        L.new(inv.outputs['Result'], dark.inputs[2])
        color = dark.outputs['Color']
        bump_strength = 0.6
    elif feat == 'dents':
        v = N.new('ShaderNodeTexVoronoi')
        v.inputs['Scale'].default_value = 5
        v.feature = 'SMOOTH_F1'
        L.new(coord.outputs['Object'], v.inputs['Vector'])
        height = v.outputs['Distance']
        bump_strength = 0.9
        # 溶けた表面の黒い皮（フュージョン・クラスト）と、こすれて光る金属
        r2 = N.new('ShaderNodeValToRGB')
        r2.color_ramp.elements[0].position = 0.35
        r2.color_ramp.elements[1].position = 0.6
        L.new(big.outputs['Fac'], r2.inputs['Fac'])
        color = mix_in(color, r2.outputs['Color'], (0.02, 0.018, 0.016, 1))
        rr = N.new('ShaderNodeMapRange')
        rr.inputs['To Min'].default_value = 0.25
        rr.inputs['To Max'].default_value = 0.75
        L.new(r2.outputs['Color'], rr.inputs['Value'])
        L.new(rr.outputs['Result'], b.inputs['Roughness'])
        rust = N.new('ShaderNodeTexNoise')
        rust.inputs['Scale'].default_value = 6
        L.new(coord.outputs['Object'], rust.inputs['Vector'])
        r3 = N.new('ShaderNodeValToRGB')
        r3.color_ramp.elements[0].position = 0.62
        r3.color_ramp.elements[1].position = 0.75
        L.new(rust.outputs['Fac'], r3.inputs['Fac'])
        color = mix_in(color, r3.outputs['Color'], (0.18, 0.06, 0.02, 1))
    elif feat == 'speckle':
        v = N.new('ShaderNodeTexVoronoi')
        v.inputs['Scale'].default_value = 40
        L.new(coord.outputs['Object'], v.inputs['Vector'])
        r2 = N.new('ShaderNodeValToRGB')
        r2.color_ramp.elements[0].position = 0.7
        r2.color_ramp.elements[1].position = 0.75
        L.new(v.outputs['Color'], r2.inputs['Fac'])
        color = mix_in(color, r2.outputs['Color'], hex_rgb(p['sc']))
    elif feat == 'patches':
        n2 = N.new('ShaderNodeTexNoise')
        n2.inputs['Scale'].default_value = 3.5
        n2.inputs['Detail'].default_value = 8
        L.new(coord.outputs['Object'], n2.inputs['Vector'])
        r2 = N.new('ShaderNodeValToRGB')
        r2.color_ramp.elements.new(0.5)
        e = r2.color_ramp.elements
        e[0].position, e[0].color = 0.38, hex_rgb('#f0dc6a')
        e[1].position, e[1].color = 0.55, c1
        e[2].position, e[2].color = 0.68, c2
        L.new(n2.outputs['Fac'], r2.inputs['Fac'])
        mx = N.new('ShaderNodeMixRGB')
        mx.blend_type = 'OVERLAY'
        mx.inputs['Fac'].default_value = 0.25
        L.new(r2.outputs['Color'], mx.inputs[1])
        L.new(fine.outputs['Fac'], mx.inputs[2])
        color = mx.outputs['Color']
        # 白い SO₂ の霜
        r3 = N.new('ShaderNodeValToRGB')
        r3.color_ramp.elements[0].position = 0.25
        r3.color_ramp.elements[1].position = 0.3
        r3.color_ramp.elements[0].color = (1, 1, 1, 1)
        r3.color_ramp.elements[1].color = (0, 0, 0, 1)
        L.new(n2.outputs['Fac'], r3.inputs['Fac'])
        color = mix_in(color, r3.outputs['Color'], (0.85, 0.85, 0.8, 1))
    elif feat == 'streaks':
        w = N.new('ShaderNodeTexWave')
        w.wave_type = 'BANDS'
        w.bands_direction = 'Y'
        w.inputs['Scale'].default_value = 0.6
        w.inputs['Distortion'].default_value = 6
        w.inputs['Detail'].default_value = 6
        L.new(coord.outputs['Object'], w.inputs['Vector'])
        r2 = N.new('ShaderNodeValToRGB')
        r2.color_ramp.elements[0].position = 0.7
        r2.color_ramp.elements[1].position = 0.9
        L.new(w.outputs['Fac'], r2.inputs['Fac'])
        ice = mix(c1, c2, 0.0)
        base = N.new('ShaderNodeMixRGB')
        base.inputs['Fac'].default_value = 0.0
        base.inputs[1].default_value = ice
        color = mix_in(color, r2.outputs['Color'], c2)
        height = w.outputs['Fac']

    if p.get('ice'):
        # 氷：少し透けて、青みのある光沢
        b.inputs['Subsurface Weight'].default_value = 0.35
        b.inputs['Subsurface Radius'].default_value = (0.4, 0.6, 1.0)
        b.inputs['Subsurface Scale'].default_value = 0.15
        b.inputs['Coat Weight'].default_value = 0.5
        b.inputs['Coat Roughness'].default_value = 0.1
    if p.get('heat'):
        # 金星の熱でうっすら赤く（地表の照り返し）
        b.inputs['Emission Color'].default_value = (0.6, 0.12, 0.02, 1)
        b.inputs['Emission Strength'].default_value = 0.02

    L.new(color, b.inputs['Base Color'])
    if not b.inputs['Roughness'].is_linked:
        rr = N.new('ShaderNodeMapRange')
        rr.inputs['To Min'].default_value = max(0.0, p['rough'] - 0.12)
        rr.inputs['To Max'].default_value = min(1.0, p['rough'] + 0.08)
        L.new(fine.outputs['Fac'], rr.inputs['Value'])
        L.new(rr.outputs['Result'], b.inputs['Roughness'])
    b.inputs['Metallic'].default_value = p.get('metal', 0.0)
    bump = N.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = bump_strength
    bump.inputs['Distance'].default_value = 0.03
    L.new(height, bump.inputs['Height'])
    L.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def glass_material(name, color, rough=0.05, transmission=0.85):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = color
    b.inputs['Roughness'].default_value = rough
    b.inputs['Transmission Weight'].default_value = transmission
    b.inputs['IOR'].default_value = 1.54
    return m


# ---- 1 枚撮る -----------------------------------------------------------------

def build(rid, p):
    sc = reset()
    random.seed(rid)
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(rid)) % 997
    stage()
    lights(sc)
    shape = p['shape']
    h = 0.5
    if shape == 'rock':
        o = rock_mesh(seed, p.get('squash', (1.0, 0.85, 0.7)))
    elif shape == 'slab':
        o = slab_mesh(seed)
        h = 0.35
    elif shape == 'pebble':
        o = pebble_mesh(seed)
        h = 0.4
    elif shape == 'crust':
        o = rock_mesh(seed, (1.3, 1.0, 0.38), 1.2)
        h = 0.3
    elif shape == 'crystal':
        o, cr = crystal_mesh(seed)
        h = 0.6
    elif shape in ('berries', 'beads'):
        ground_patch(p['ground'], seed, 1.7)
        if shape == 'berries':
            bs = balls(48, 0.06, 0.11, 1.1, seed, -0.03)
        else:
            bs = balls(160, 0.035, 0.07, 1.05, seed, 0.0)
        m = rock_material(rid, p) if shape == 'berries' else glass_material(rid, hex_rgb(p['c']), 0.15, 0.25)
        if shape == 'beads':
            bb = m.node_tree.nodes['Principled BSDF']
            bb.inputs['Coat Weight'].default_value = 0.6
        for b in bs:
            b.data.materials.append(m)
        camera(sc, 0.15)
        return
    if shape == 'crystal':
        g = glass_material(rid, hex_rgb(p['c']), 0.06, 0.55)
        gb = g.node_tree.nodes['Principled BSDF']
        gb.inputs['Subsurface Weight'].default_value = 0.6
        gb.inputs['Subsurface Radius'].default_value = (0.3, 0.3, 0.35)
        gb.inputs['Subsurface Scale'].default_value = 0.2
        cr.data.materials.append(g)
        mat = rock_material(rid + 'base', dict(c='#8a8580', c2='#5a5550', rough=0.9, feat='speckle', sc='#d8d4cc'))
    else:
        mat = rock_material(rid, p)
    o.data.materials.append(mat)
    z0 = o.location.z
    sit_on_floor(o)
    if shape == 'crystal':
        cr.location.z += o.location.z - z0
    camera(sc, h)


def main():
    os.makedirs(OUT, exist_ok=True)
    for rid, p in ROCKS.items():
        if ONLY and rid not in ONLY:
            continue
        build(rid, p)
        sc = bpy.context.scene
        sc.render.filepath = os.path.join(OUT, f'{rid}.png')
        sc.render.image_settings.color_mode = 'RGBA'
        bpy.ops.render.render(write_still=True)
        print('rendered', rid, flush=True)


main()
