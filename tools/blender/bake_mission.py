"""
月ミッションの機体（アポロの司令船・着陸船 apollo.glb、サターンV saturn.glb）に、Blender で焼いたテクスチャを付けて書き出す。

build_apollo.py / build_saturn.py が書き出した「色だけの」glb を読み込み、

  1. 全部の部品をまとめて 1 枚の画像に並べる UV「Bake」を作る
  2. Cycles で 3 枚を焼く（プロシージャルなノードは glTF に出せないので、画像にする）
     - color  : 材質の色 × 材質ごとの模様 × AO（すき間の暗さ）
                 金・銀の断熱フィルム：しわの明暗と、毛布ごとの色ムラ
                 板（上昇段・機械船・ロケットの白い塗装）：継ぎ目の墨入れ、板ごとの色ムラ、うすい汚れの筋
                 ロケットの第1段の下：エンジンのすす
     - rough  : つやのムラ（フィルムのしわはつやが変わる、塗装はつや消し）
     - normal : フィルムのしわ、板の継ぎ目の溝（タンジェント空間）
  3. 全部の材質に同じ 3 枚を付けて glb に書き出す（金属らしさ・光る部品は材質ごとの値のまま）

実行:
  OUT=/tmp/ap/apollo.glb  .bpyvenv/bin/python tools/blender/build_apollo.py   # 先に色だけの glb を作る
  OUT=/tmp/ap/saturn.glb  .bpyvenv/bin/python tools/blender/build_saturn.py
  SRC=/tmp/ap .bpyvenv/bin/python tools/blender/bake_mission.py            # public/models/apollo.glb, saturn.glb に書く
  node tools/glb/compress.mjs public/models/apollo.glb public/models/saturn.glb
  MODELS=apollo SIZE=1024 SAMPLES=8 ...   試し焼き
  PREVIEW_DIR=/tmp/bake ...               焼いた画像を PNG でも保存
"""

import math
import os
import time

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.environ.get('SRC', '/tmp/ap')
DST = os.environ.get('DST', os.path.join(ROOT, 'public', 'models'))
SIZE = int(os.environ.get('SIZE', '2048'))
SAMPLES = int(os.environ.get('SAMPLES', '24'))

# 材質の種類
FOIL = {'Kapton', 'KaptonDark', 'Mylar', 'Pad'}  # しわのある断熱フィルム
PANEL = {'Inconel', 'Aluminum', 'CMSilver', 'SMWhite', 'White', 'Silver', 'Grey', 'Red', 'Black', 'Panel', 'Tank'}  # 板・塗装
PLAIN = {'Strut', 'Dish', 'Metal', 'Dark', 'Ablator', 'Nozzle', 'NozzleIn', 'Deck', 'Concrete', 'Pipe'}  # AO と細かなムラだけ
KEEP = {'Glass', 'Lamp', 'NavRed'}  # 焼かない（光る・透ける）

MODELS = {
    # scale：模様の大きさ（1 m あたりの数）。AO の届く距離（m）。soot：第1段の下のすす
    'apollo': dict(file='apollo.glb', ao=0.6, panel=1.1, crinkle=9.0, soot=False),
    # サターン：レンガではなく、横の溶接の輪と縦の継ぎ目を薄く（本物は白い塗装でほぼ平ら）
    'saturn': dict(file='saturn.glb', ao=2.5, panel=0.42, crinkle=3.0, soot=True,
                   rings=dict(period=2.4, cols=16, width=0.008), seam_dark=0.16, seam_bump=0.25, panel_var=0.035),
    # 発射台（build_launchpad.py）：鋼の板の継ぎ目、雨の筋、炎の穴のまわりの焦げ
    'launchpad': dict(file='launchpad.glb', ao=3.0, panel=0.3, crinkle=2.0, soot=False, scorch=True,
                      seam_dark=0.25, seam_bump=0.4, panel_var=0.12),
}


class Nodes:
    def __init__(self, mat):
        mat.use_nodes = True
        self.tree = mat.node_tree
        self.tree.nodes.clear()

    def node(self, kind, **inputs):
        n = self.tree.nodes.new(kind)
        for key, value in inputs.items():
            if key.startswith('_'):
                setattr(n, key[1:], value)
            else:
                self.link(value, n.inputs[key])
        return n

    def link(self, value, socket):
        if isinstance(value, bpy.types.NodeSocket):
            self.tree.links.new(value, socket)
        elif isinstance(value, bpy.types.Node):
            self.tree.links.new(value.outputs[0], socket)
        else:
            socket.default_value = value

    def math(self, op, a, b=0.0, clamp=False):
        n = self.tree.nodes.new('ShaderNodeMath')
        n.operation = op
        n.use_clamp = clamp
        self.link(a, n.inputs[0])
        self.link(b, n.inputs[1])
        return n.outputs[0]

    def mul(self, a, b):
        return self.math('MULTIPLY', a, b)

    def add(self, a, b):
        return self.math('ADD', a, b)

    def mix(self, a, b, t):
        return self.add(a, self.mul(self.math('SUBTRACT', b, a), t))

    def noise(self, scale, detail=4, vector=None, rough=0.55):
        n = self.node('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        if vector is not None:
            self.link(vector, n.inputs['Vector'])
        return n.outputs['Fac']

    def pos(self):
        return self.node('ShaderNodeTexCoord').outputs['Object']

    def rgb_mul(self, color, value):
        m = self.node('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY')
        m.inputs['Factor'].default_value = 1.0
        self.link(color, m.inputs[6])
        rgb = self.node('ShaderNodeCombineColor')
        for i in range(3):
            self.link(value, rgb.inputs[i])
        self.link(rgb.outputs[0], m.inputs[7])
        return m.outputs[2]


# ---- 模様 ---------------------------------------------------------------------------


def crinkle(n, cfg):
    """フィルムのしわ：ゆがめたボロノイの縁（折り目）と、細かなノイズ。高さ（0〜1）と、毛布ごとのムラ"""
    p = n.pos()
    warp = n.node('ShaderNodeTexNoise')
    warp.inputs['Scale'].default_value = cfg['crinkle'] * 0.35
    warp.inputs['Detail'].default_value = 2
    n.link(p, warp.inputs['Vector'])
    vp = n.node('ShaderNodeVectorMath', _operation='ADD')
    n.link(p, vp.inputs[0])
    sc = n.node('ShaderNodeVectorMath', _operation='SCALE')
    n.link(warp.outputs['Color'], sc.inputs[0])
    sc.inputs['Scale'].default_value = 0.25 / cfg['crinkle'] * 3
    n.link(sc.outputs[0], vp.inputs[1])
    vor = n.node('ShaderNodeTexVoronoi', _feature='DISTANCE_TO_EDGE')
    vor.inputs['Scale'].default_value = cfg['crinkle']
    n.link(vp.outputs[0], vor.inputs['Vector'])
    edge = n.math('POWER', n.math('MINIMUM', n.mul(vor.outputs['Distance'], 6.0), 1.0), 0.6)
    fine = n.noise(cfg['crinkle'] * 6, 3, p)
    height = n.add(n.mul(edge, 0.8), n.mul(fine, 0.2))
    # 毛布（大きな区画）ごとの明るさのムラ
    blanket = n.noise(cfg['crinkle'] * 0.12, 1, p)
    return height, blanket


def seams(n, cfg):
    """板の継ぎ目（1 で溝）と、板ごとの乱数。3 方向から投影したレンガ模様の最大"""
    p = n.pos()
    s = cfg['panel']
    sep = n.node('ShaderNodeSeparateXYZ', Vector=p)
    geo = n.node('ShaderNodeNewGeometry')
    nrm = n.node('ShaderNodeSeparateXYZ', Vector=geo.outputs['Normal'])
    out = None
    rand = None
    for a, b, w in (('X', 'Y', 'Z'), ('Y', 'Z', 'X'), ('X', 'Z', 'Y')):
        v = n.node('ShaderNodeCombineXYZ')
        n.link(sep.outputs[a], v.inputs[0])
        n.link(sep.outputs[b], v.inputs[1])
        br = n.node('ShaderNodeTexBrick', Vector=v.outputs[0])
        br.offset = 0.5
        br.inputs['Scale'].default_value = 1.0
        br.inputs['Brick Width'].default_value = 1.0 / s
        br.inputs['Row Height'].default_value = 0.6 / s
        br.inputs['Mortar Size'].default_value = 0.012 / s
        br.inputs['Mortar Smooth'].default_value = 0.4
        br.inputs['Color1'].default_value = (0, 0, 0, 1)
        br.inputs['Color2'].default_value = (1, 1, 1, 1)
        br.inputs['Mortar'].default_value = (0, 0, 0, 1)
        # この向きの面だけ（法線の w 成分が大きい面）
        k = n.math('GREATER_THAN', n.math('ABSOLUTE', nrm.outputs[w]), 0.577)
        g = n.mul(br.outputs['Fac'], k)
        r = n.mul(n.node('ShaderNodeSeparateColor', Color=br.outputs['Color']).outputs[0], k)
        out = g if out is None else n.math('MAXIMUM', out, g)
        rand = r if rand is None else n.math('MAXIMUM', rand, r)
    return out, rand


def rings(n, cfg):
    """筒の継ぎ目：横の溶接の輪（z 方向に一定間隔）と縦の継ぎ目（周りに cols 本）。1 で溝"""
    rc = cfg['rings']
    p = n.pos()
    sep = n.node('ShaderNodeSeparateXYZ', Vector=p)
    z = sep.outputs['Z']
    ang = n.math('ARCTAN2', sep.outputs['Y'], sep.outputs['X'])
    zq = n.math('MULTIPLY', z, 1.0 / rc['period'])
    aq = n.math('MULTIPLY', ang, rc['cols'] / 6.28318)
    # 継ぎ目からの距離（m）
    dz = n.math('MULTIPLY', n.math('ABSOLUTE', n.math('SUBTRACT', n.math('FRACT', zq), 0.5)), rc['period'])
    dz = n.math('SUBTRACT', rc['period'] * 0.5, dz)
    da = n.math('SUBTRACT', 0.5, n.math('ABSOLUTE', n.math('SUBTRACT', n.math('FRACT', aq), 0.5)))
    da = n.math('MULTIPLY', da, 6.28318 * 5.0 / rc['cols'])  # 半径約 5 m として m に
    d = n.math('MINIMUM', dz, da)
    g = n.math('SUBTRACT', 1.0, n.math('MINIMUM', n.math('MULTIPLY', d, 1.0 / rc['width']), 1.0))
    # 板ごとの明るさのわずかな差
    cell = n.node('ShaderNodeCombineXYZ')
    n.link(n.math('FLOOR', zq), cell.inputs[0])
    n.link(n.math('FLOOR', aq), cell.inputs[1])
    wn = n.node('ShaderNodeTexWhiteNoise', Vector=cell.outputs[0])
    wn.noise_dimensions = '3D'
    return g, wn.outputs['Value']


def grime(n, cfg):
    """うすい汚れの筋（上から下へ流れた跡）"""
    p = n.pos()
    st = n.node('ShaderNodeMapping', Vector=p)
    st.inputs['Scale'].default_value = (8.0, 8.0, 0.4)
    return n.noise(cfg['panel'] * 3, 3, st.outputs[0])


def soot(n):
    """第1段のエンジンのまわりのすす（ロケットの下ほど濃い。座標は m、下が 0 付近）"""
    p = n.pos()
    z = n.node('ShaderNodeSeparateXYZ', Vector=p).outputs['Z']
    base = n.math('SUBTRACT', 1.0, n.math('MULTIPLY', z, 1 / 8.0), True)
    streak = n.noise(0.8, 4, p)
    return n.mul(n.math('POWER', base, 2.0), n.add(0.4, streak))


def scorch(n):
    """移動発射台の炎の穴のまわりの焦げ（甲板から下、穴に近いほど濃い。座標は m、ロケットの根元が 0）"""
    p = n.pos()
    xyz = n.node('ShaderNodeSeparateXYZ', Vector=p)
    r = n.math('SQRT', n.add(n.mul(xyz.outputs['X'], xyz.outputs['X']), n.mul(xyz.outputs['Y'], xyz.outputs['Y'])))
    near = n.math('SUBTRACT', 1.0, n.math('MULTIPLY', n.math('SUBTRACT', r, 6.0), 1 / 14.0), True)
    low = n.math('SUBTRACT', 1.0, n.math('MULTIPLY', n.math('SUBTRACT', xyz.outputs['Z'], 4.0), 1 / 10.0), True)
    streak = n.noise(0.35, 4, p)
    return n.mul(n.mul(n.math('POWER', near, 1.5), low), n.add(0.45, streak))


def ao(n, cfg):
    a = n.node('ShaderNodeAmbientOcclusion')
    a.samples = 16
    a.inputs['Distance'].default_value = cfg['ao']
    return n.mix(1.0, a.outputs['AO'], 0.75)


# ---- 焼く材質 ------------------------------------------------------------------------


def original(mat):
    """読み込んだ材質の色・画像・金属らしさ・粗さ・光"""
    b = next((x for x in mat.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'), None)
    info = dict(color=(0.8, 0.8, 0.8, 1), image=None, metal=0.0, rough=0.5, emit=(0, 0, 0, 1), emit_s=0.0, alpha=1.0)
    if b is None:
        return info
    bc = b.inputs['Base Color']
    if bc.is_linked and bc.links[0].from_node.type == 'TEX_IMAGE':
        info['image'] = bc.links[0].from_node.image
    else:
        info['color'] = tuple(bc.default_value)
    info['metal'] = b.inputs['Metallic'].default_value
    info['rough'] = b.inputs['Roughness'].default_value
    info['emit'] = tuple(b.inputs['Emission Color'].default_value)
    info['emit_s'] = b.inputs['Emission Strength'].default_value
    return info


def emit_out(n, value):
    out = n.node('ShaderNodeOutputMaterial')
    em = n.node('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.0
    if isinstance(value, (int, float)):
        value = (value, value, value, 1.0)
    if isinstance(value, bpy.types.NodeSocket) and value.type == 'VALUE':
        rgb = n.node('ShaderNodeCombineColor')
        for i in range(3):
            n.link(value, rgb.inputs[i])
        value = rgb.outputs[0]
    n.link(value, em.inputs['Color'])
    n.link(em.outputs[0], out.inputs['Surface'])


def build_pass(mat, info, pass_name, cfg, image):
    name = mat.name
    n = Nodes(mat)
    kind = 'foil' if name in FOIL else 'panel' if name in PANEL else 'keep' if name in KEEP else 'plain'
    if pass_name == 'color':
        if info['image'] is not None:
            uv = n.node('ShaderNodeUVMap', _uv_map='UVMap')
            t = n.node('ShaderNodeTexImage', Vector=uv.outputs[0])
            t.image = info['image']
            col = t.outputs['Color']
        else:
            rgb = n.node('ShaderNodeRGB')
            rgb.outputs[0].default_value = info['color']
            col = rgb.outputs[0]
        if kind == 'keep':
            emit_out(n, col)
        else:
            v = ao(n, cfg)
            if kind == 'foil':
                h, blanket = crinkle(n, cfg)
                # 折り目の谷は暗く、山は明るく（光の向きに関係なく、しわの見た目を残す）
                v = n.mul(v, n.add(0.78, n.mul(h, 0.34)))
                v = n.mul(v, n.add(0.9, n.mul(blanket, 0.2)))
            elif kind == 'panel':
                g, r = rings(n, cfg) if cfg.get('rings') else seams(n, cfg)
                v = n.mul(v, n.math('SUBTRACT', 1.0, n.mul(g, cfg.get('seam_dark', 0.35))))
                pv = cfg.get('panel_var', 0.1)
                v = n.mul(v, n.add(1.0 - pv / 2, n.mul(r, pv)))
                v = n.mul(v, n.add(0.9, n.mul(grime(n, cfg), 0.14)))
            else:
                v = n.mul(v, n.add(0.9, n.mul(n.noise(cfg['crinkle'] * 2, 3), 0.2)))
            if cfg['soot'] and kind != 'keep':
                v = n.mul(v, n.math('SUBTRACT', 1.0, n.mul(soot(n), 0.55), True))
            if cfg.get('scorch'):
                v = n.mul(v, n.math('SUBTRACT', 1.0, n.mul(scorch(n), 0.75), True))
            emit_out(n, n.rgb_mul(col, v))
    elif pass_name == 'rough':
        r = info['rough']
        if kind == 'foil':
            h, _ = crinkle(n, cfg)
            v = n.add(r * 0.55, n.mul(h, r * 0.7))
        elif kind == 'panel':
            v = n.add(r * 0.85, n.mul(n.noise(cfg['panel'] * 6, 4), r * 0.3))
        else:
            v = n.add(r * 0.9, n.mul(n.noise(cfg['crinkle'] * 2, 3), r * 0.2))
        if cfg['soot'] and kind != 'keep':
            v = n.mix(v, 0.95, soot(n))
        emit_out(n, n.math('MINIMUM', v, 1.0))
    elif pass_name == 'normal':
        out = n.node('ShaderNodeOutputMaterial')
        bsdf = n.node('ShaderNodeBsdfPrincipled')
        height = None
        strength = 0.0
        if kind == 'foil':
            height, _ = crinkle(n, cfg)
            strength = 0.8
            dist = 0.02 / cfg['crinkle'] * 3
        elif kind == 'panel':
            g, _ = rings(n, cfg) if cfg.get('rings') else seams(n, cfg)
            height = n.math('SUBTRACT', 1.0, g)
            strength = cfg.get('seam_bump', 0.5)
            dist = 0.004 / cfg['panel']
        if height is not None:
            bump = n.node('ShaderNodeBump', Height=height)
            bump.inputs['Strength'].default_value = strength
            bump.inputs['Distance'].default_value = dist
            n.link(bump.outputs[0], bsdf.inputs['Normal'])
        n.link(bsdf.outputs[0], out.inputs['Surface'])
    tex = n.tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    n.tree.nodes.active = tex


def export_material(mat, info, images):
    n = Nodes(mat)
    out = n.node('ShaderNodeOutputMaterial')
    bsdf = n.node('ShaderNodeBsdfPrincipled')
    n.link(bsdf.outputs[0], out.inputs['Surface'])
    bsdf.inputs['Metallic'].default_value = info['metal']
    if mat.name in KEEP:
        bsdf.inputs['Base Color'].default_value = info['color']
        bsdf.inputs['Roughness'].default_value = info['rough']
        bsdf.inputs['Emission Color'].default_value = info['emit']
        bsdf.inputs['Emission Strength'].default_value = info['emit_s']
        return
    uv = n.node('ShaderNodeUVMap', _uv_map='Bake')

    def tex(kind):
        t = n.node('ShaderNodeTexImage', Vector=uv.outputs[0])
        t.image = images[kind]
        return t

    n.link(tex('color').outputs['Color'], bsdf.inputs['Base Color'])
    # glTF の粗さは G チャンネル
    sep = n.node('ShaderNodeSeparateColor', Color=tex('rough').outputs['Color'])
    n.link(sep.outputs[1], bsdf.inputs['Roughness'])
    nm = n.node('ShaderNodeNormalMap', Color=tex('normal').outputs['Color'])
    nm.uv_map = 'Bake'
    n.link(nm.outputs[0], bsdf.inputs['Normal'])


# ---- 流れ ----------------------------------------------------------------------------


def run(model_id):
    cfg = MODELS[model_id]
    src = os.path.join(SRC, cfg['file'])
    dst = os.path.join(DST, cfg['file'])
    print(f'== {model_id} ({src})', flush=True)
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    # UV「Bake」：全部をまとめて 1 枚に
    for o in objs:
        if 'UVMap' not in o.data.uv_layers:
            o.data.uv_layers.new(name='UVMap')
        layer = o.data.uv_layers.new(name='Bake')
        o.data.uv_layers.active = layer
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    margin = 4 / SIZE
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=margin, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 6
    scene.render.bake.use_clear = True
    scene.world = bpy.data.worlds.new('world')
    mats = sorted({m for o in objs for m in o.data.materials if m}, key=lambda m: m.name)
    infos = {m.name: original(m) for m in mats}
    images = {}
    for pass_name, color in (('color', True), ('rough', False), ('normal', False)):
        img = bpy.data.images.new(f'{model_id}-{pass_name}', SIZE, SIZE, alpha=False)
        img.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
        for m in mats:
            build_pass(m, infos[m.name], pass_name, cfg, img)
        scene.cycles.samples = {'color': SAMPLES, 'rough': 2, 'normal': 4}[pass_name]
        t = time.time()
        if pass_name == 'normal':
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
        else:
            bpy.ops.object.bake(type='EMIT')
        print(f'  {pass_name}: {time.time() - t:.0f}s', flush=True)
        img.pack()
        if os.environ.get('PREVIEW_DIR'):
            os.makedirs(os.environ['PREVIEW_DIR'], exist_ok=True)
            img.filepath_raw = os.path.join(os.environ['PREVIEW_DIR'], f'{img.name}.png')
            img.file_format = 'PNG'
            img.save()
        images[pass_name] = img
    for m in mats:
        export_material(m, infos[m.name], images)
    # 元の UV「UVMap」は旗の絵などにしか使わないので消す（Bake だけにする）
    for o in objs:
        if 'UVMap' in o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers['UVMap'])
        o.data.uv_layers.active = o.data.uv_layers['Bake']
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_yup=True, export_materials='EXPORT',
                              export_texcoords=True, export_normals=True, export_image_format='JPEG', export_jpeg_quality=88)
    print(f'wrote {dst} {os.path.getsize(dst) // 1024} KB in {time.time() - t0:.0f}s', flush=True)


def main():
    for model_id in os.environ.get('MODELS', ','.join(MODELS)).split(','):
        run(model_id)


if __name__ == '__main__':
    main()
