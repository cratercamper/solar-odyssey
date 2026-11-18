# Blender (5.2 + MPFB 2 + VRM add-on) script: make the colony park people from mpfb_style.json.
# Run inside Blender with STYLE (dict), OUT (folder) and optionally ONLY (list of ids) defined, e.g.
#   STYLE = json.load(open(r'...\mpfb_style.json')); OUT = r'...\solar-mobs\mpfb'; exec(open(r'...\mpfb_gen.py').read())
# For each person: MPFB human (Mixamo rig) -> simple textured materials -> hidden body deleted ->
# decimated -> VRM 1.0 (auto T-pose). Writes OUT/manifest.json (who is who, hair colour for the recolour step).
import bpy, bmesh, json, os, random

from bl_ext.blender_org.mpfb.services.humanservice import HumanService as HS
from bl_ext.blender_org.mpfb.services.locationservice import LocationService

UD = LocationService.get_user_data()
SYS = LocationService.get_mpfb_data('targets')


def pick_race(rng, R):
    keys = ['asian', 'caucasian', 'african']
    dom = rng.choices(keys, weights=[R[k] for k in keys])[0]
    d = rng.uniform(*R['dominant'])
    rest = [k for k in keys if k != dom]
    a = rng.random()
    race = {dom: d, rest[0]: (1 - d) * a, rest[1]: (1 - d) * (1 - a)}
    return dom, race


PAIRS = [('incr', 'decr'), ('up', 'down'), ('in', 'out'), ('convex', 'concave'), ('forward', 'backward')]


def target_pair(key):
    folder, base = key.split('/')
    d = os.path.join(SYS, folder)
    if not os.path.isdir(d):
        return None
    names = [f[:-len('.target.gz')] for f in os.listdir(d) if f.endswith('.target.gz')]
    mirrored = any(n.startswith('l-' + base + '-') for n in names)
    pref = 'l-' + base if mirrored else base
    for a, b in PAIRS:
        if pref + '-' + a in names and pref + '-' + b in names:
            return (base, a, b, mirrored)
    return None


def face_targets(rng, F, cap):
    out = []
    for key in F['targets']:
        tp = target_pair(key)
        if not tp:
            print('  (no target for', key, ')')
            continue
        base, a, b, mirrored = tp
        v = rng.uniform(-cap, cap)
        suf = a if v > 0 else b
        for side in (['l-', 'r-'] if mirrored else ['']):
            out.append({'target': f'{side}{base}-{suf}', 'value': round(abs(v), 3)})
    shape = rng.choice(F['headShapes'])
    out.append({'target': shape, 'value': round(rng.uniform(0, F['headShapeMax']), 3)})
    return out


def plan(style):
    rng = random.Random(style['seed'])
    people = []
    used = {}

    def fresh(key, options):
        # pick something nobody has yet (across all people), so outfits and hair repeat as little as possible
        u = used.setdefault(key, set())
        left = [o for o in options if o not in u] or options
        c = rng.choice(left)
        u.add(c)
        return c
    for cls, C in style['classes'].items():
        for i in range(C['count']):
            female = (i % 2 == 0) if cls != 'elder' else (i != 1)
            sex = 'female' if female else 'male'
            dom, race = pick_race(rng, style['race'])
            p = {'id': f'{cls}_{i + 1}', 'cls': cls, 'sex': sex, 'race': dom}
            if cls == 'child':
                years = rng.uniform(*C['years'])
                age = (years - 1) / 10 * 0.1875
                p['years'] = round(years, 1)
                p['targetHeight'] = round(0.76 + 0.062 * years, 3)
                height = 0.5
                prop = 0.5
            else:
                age = rng.uniform(*C['age'])
                height = rng.uniform(*C['height'])
                prop = rng.uniform(*C['proportions'])
            p['phenotype'] = {
                'gender': 0.0 if female else 1.0, 'age': round(age, 3),
                'muscle': round(rng.uniform(*C['muscle']), 3), 'weight': round(rng.uniform(*C['weight']), 3),
                'proportions': round(prop, 3), 'height': round(height, 3),
                'cupsize': round(rng.uniform(0.35, 0.6), 3) if female and cls != 'child' else 0.5,
                'firmness': 0.3 if cls == 'elder' else 0.5, 'race': {k: round(v, 3) for k, v in race.items()},
            }
            hl = C['hair'][sex]
            if cls == 'adult' and sex == 'male' and dom == 'african':
                hl = C['hair']['africanMale']
            p['hair'] = fresh('hair', hl)
            p['hairColor'] = rng.choice(C['hairRgb'][dom])
            p['hairRgb'] = style['hairColors'][p['hairColor']]
            clothes = [fresh('clothes', C['clothes'][sex]), fresh('shoes', C['shoes'])]
            hat = C.get('hat')
            if hat and sex in hat and rng.random() < hat['chance']:
                clothes.append(rng.choice(hat[sex]))
            p['clothes'] = clothes
            ag = 'young' if cls == 'child' or age < 0.5 else ('middleage' if cls == 'adult' else 'old')
            p['skin'] = f'{ag}_{dom}_{sex}'
            p['eyes'] = rng.choice(style['eyes'][dom])
            p['eyebrows'] = f'eyebrow{rng.randint(1, 12):03d}'
            p['targets'] = face_targets(rng, style['face'], C['faceMax'])
            people.append(p)
    return people


def find_imgs(nt, acc):
    for n in nt.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            acc.append(n.image)
        if n.type == 'GROUP' and n.node_tree:
            find_imgs(n.node_tree, acc)
    return acc


HAIR_WORDS = ('eyebrow', 'eyelash', 'ponytail', 'bob', 'short', 'long', 'braid', 'afro')


def simple_mat(o, pid, eye_img):
    mt = o.data.materials[0] if o.data.materials else None
    imgs = find_imgs(mt.node_tree, []) if mt and mt.use_nodes else []
    pick = None
    for im in imgs:
        nm = im.name.lower()
        if 'normal' in nm or '_ao' in nm or 'bump' in nm or 'rough' in nm:
            continue
        pick = im
        break
    part = o.name.split('.', 1)[1] if '.' in o.name else o.name
    if 'poly' in part:
        pick = eye_img
    role = 'skin' if part == 'body' else 'eyes' if 'poly' in part else 'brows' if 'eyebrow' in part else 'lashes' if 'eyelash' in part \
        else 'hair' if any(k in part for k in HAIR_WORDS) else 'cloth'
    # clothes keep their asset name ("child_1.cloth.male_casualsuit02") so the recolour step knows the layout
    m = bpy.data.materials.new(f'{pid}.{role}' + (f'.{part}' if role == 'cloth' else ''))
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 0.8
    if pick:
        # each person gets its own image copy, named by role, so the recolour step can find it
        img = pick.copy()
        img.name = f'{pid}_{role}_{part}'
        tex = m.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = img
        m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if role in ('hair', 'brows', 'lashes'):
            m.node_tree.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
            try:
                m.blend_method = 'CLIP'
            except Exception:
                pass
    o.data.materials.clear()
    o.data.materials.append(m)


def strip_hidden(body):
    bpy.context.view_layer.objects.active = body
    for o in list(bpy.context.selected_objects):
        o.select_set(False)
    body.select_set(True)
    if body.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    vg = {g.name: g.index for g in body.vertex_groups}
    keep = vg['body']
    dels = [vg[m.vertex_group] for m in body.modifiers if m.type == 'MASK' and m.name.startswith('Delete.')]
    bm = bmesh.new()
    bm.from_mesh(body.data)
    dl = bm.verts.layers.deform.active
    kill = [v for v in bm.verts if keep not in v[dl] or v[dl][keep] <= 0 or any(g in v[dl] and v[dl][g] > 0 for g in dels)]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    for m in [m for m in body.modifiers if m.type == 'MASK']:
        body.modifiers.remove(m)


def decimate(o, ratio, keep_group=None):
    if ratio >= 1:
        return
    bpy.context.view_layer.objects.active = o
    for x in list(bpy.context.selected_objects):
        x.select_set(False)
    o.select_set(True)
    arm = [m for m in o.modifiers if m.type == 'ARMATURE']
    d = o.modifiers.new('dec', 'DECIMATE')
    d.ratio = ratio
    d.use_collapse_triangulate = True
    if keep_group and keep_group in o.vertex_groups:
        # keep the face detailed: decimate only away from the head
        d.vertex_group = keep_group
        d.invert_vertex_group = True
        d.vertex_group_factor = 1.0
    # decimate before the armature deform
    while o.modifiers.find('dec') > 0:
        bpy.ops.object.modifier_move_up(modifier='dec')
    bpy.ops.object.modifier_apply(modifier='dec')


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def build(p, style, out):
    B = style['budget']
    S = HS.get_default_deserialization_settings()
    S['subdiv_levels'] = 0
    info = {
        'name': p['id'], 'phenotype': p['phenotype'], 'skin_mhmat': f"skins/{p['skin']}/{p['skin']}.mhmat",
        'skin_material_type': 'ENHANCED_SSS', 'hair': f"hair/{p['hair']}/{p['hair']}.mhclo" if p['hair'] else '',
        'eyebrows': f"eyebrows/{p['eyebrows']}/{p['eyebrows']}.mhclo", 'eyelashes': 'eyelashes/eyelashes01/eyelashes01.mhclo',
        'eyes': f"eyes/{B['eyes']}/{B['eyes']}.mhclo", 'eyes_material_type': 'PROCEDURAL_EYES', 'teeth': '', 'tongue': '',
        'clothes': [f'clothes/{c}/{c}.mhclo' for c in p['clothes']], 'proxy': '', 'rig': 'mixamo', 'targets': p['targets'],
        'expressions': [], 'makeup': [], 'color_adjustments': {}, 'eyes_material_settings': {}, 'skin_material_settings': {},
    }
    body = HS.deserialize_from_dict(info, S)
    root = body.parent
    root.name = p['id']
    eye_img = bpy.data.images.load(os.path.join(UD, 'eyes', 'materials', f"{p['eyes']}_eye.png"), check_existing=True)
    kids = [c for c in root.children if c.type == 'MESH']
    for o in kids:
        simple_mat(o, p['id'], eye_img)
    strip_hidden(body)
    decimate(body, B['bodyDecimate'], 'mixamorig:Head')
    for o in kids:
        if 'shoes' in o.name:
            decimate(o, B['shoesDecimate'])
        elif 'suit' in o.name and tris(o) > B.get('clothMaxTris', 6000):
            decimate(o, B.get('clothMaxTris', 6000) / tris(o))
    # children are drawn shorter by MakeHuman than real children: scale to the target height
    if 'targetHeight' in p:
        top = max((o.matrix_world @ v.co).z for o in kids for v in o.data.vertices)
        s = p['targetHeight'] / top
        root.scale = (s, s, s)
    for x in list(bpy.context.selected_objects):
        x.select_set(False)
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    for o in kids:
        o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    p['tris'] = sum(tris(o) for o in kids)
    p['heightM'] = round(max((o.matrix_world @ v.co).z for o in kids for v in o.data.vertices), 3)
    # VRM
    ext = root.data.vrm_addon_extension
    bpy.ops.vrm.assign_vrm1_humanoid_human_bones_automatically(armature_object_name=root.name)
    ext.vrm1.humanoid.pose = 'autoPose'
    meta = ext.vrm1.meta
    meta.vrm_name = f"Solar Odyssey park person {p['id']}"
    if len(meta.authors) == 0:
        meta.authors.add()
    meta.authors[0].value = 'Solar Odyssey (MakeHuman CC0 assets)'
    path = os.path.join(out, f"mpfb_{p['id']}.vrm")
    bpy.ops.export_scene.vrm(filepath=path, armature_object_name=root.name, export_only_selections=True, ignore_warning=True)
    p['file'] = f"mpfb_{p['id']}"
    p['bytes'] = os.path.getsize(path)
    return root


def remove_person(root):
    objs = [root] + list(root.children_recursive)
    imgs = set()
    for o in objs:
        if o.type == 'MESH':
            for m in o.data.materials:
                if m and m.node_tree:
                    imgs.update(find_imgs(m.node_tree, []))
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    for im in imgs:
        if im.users == 0:
            bpy.data.images.remove(im)
    bpy.ops.outliner.orphans_purge(do_recursive=True)


def run(style, out, only=None, keep=False):
    os.makedirs(out, exist_ok=True)
    people = plan(style)
    for p in people:
        if only and p['id'] not in only:
            continue
        root = build(p, style, out)
        print(p['id'], p['sex'], p['race'], p['hair'], p['hairColor'], p['clothes'], 'tris', p['tris'], 'h', p['heightM'], 'MB', round(p['bytes'] / 1e6, 1))
        if not keep:
            remove_person(root)
    man = os.path.join(out, 'manifest.json')
    old = json.load(open(man)) if os.path.exists(man) and only else {}
    old.update({p['id']: p for p in people if 'file' in p})
    json.dump(old, open(man, 'w'), indent=1)
    return people
