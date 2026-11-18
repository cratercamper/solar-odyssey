# Repack a .vrm/.glb: shrink textures (opaque -> JPEG q85, alpha -> PNG at half size).
# Usage: python3 -I tools/mobs/shrink_vrm_textures.py in.vrm out.vrm [maxSize=1024]
# finish_mpfb.py uses repack() with a per-image recolour hook (hair colour, skin tone).
import io
import json
import struct
import sys

from PIL import Image


def read_glb(path):
    f = open(path, 'rb').read()
    jl = struct.unpack('<I', f[12:16])[0]
    j = json.loads(f[20:20 + jl])
    bo = 20 + jl
    bl = struct.unpack('<I', f[bo:bo + 4])[0]
    return j, f[bo + 8:bo + 8 + bl]


def write_glb(path, j, views_data):
    nb = bytearray()
    for v, d in zip(j['bufferViews'], views_data):
        while len(nb) % 4:
            nb.append(0)
        v['byteOffset'] = len(nb)
        v['byteLength'] = len(d)
        nb += d
    while len(nb) % 4:
        nb.append(0)
    j['buffers'][0]['byteLength'] = len(nb)
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    total = 12 + 8 + len(js) + 8 + len(nb)
    out = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(nb), 0x004E4942) + bytes(nb)
    open(path, 'wb').write(out)
    return len(out)


def repack(src, dst, max_size=1024, recolor=None, log=print):
    j, bin_ = read_glb(src)
    datas = [bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in j['bufferViews']]
    # which material uses each image (the recolour hook gets the material name, e.g. "child_1.hair")
    mat_of = {}
    for m in j.get('materials', []):
        t = m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if t is not None:
            mat_of[j['textures'][t['index']]['source']] = m.get('name', '')
    for ii, im in enumerate(j['images']):
        i = im['bufferView']
        img = Image.open(io.BytesIO(datas[i]))
        img.load()
        name = im.get('name', '')
        alpha = img.mode in ('RGBA', 'LA') and img.getchannel('A').getextrema()[0] < 250
        lim = max_size if not alpha else max_size // 2
        if name.endswith('_eye') or '_eyes_' in name:
            lim = 256
        if max(img.size) > lim:
            k = lim / max(img.size)
            img = img.resize((round(img.size[0] * k), round(img.size[1] * k)), Image.LANCZOS)
        if recolor:
            img = recolor(mat_of.get(ii, name), img)
        out = io.BytesIO()
        if alpha:
            img.save(out, 'PNG', optimize=True)
            im['mimeType'] = 'image/png'
        else:
            img.convert('RGB').save(out, 'JPEG', quality=85, optimize=True)
            im['mimeType'] = 'image/jpeg'
        log(f'  {name} {mat_of.get(ii)} {"A" if alpha else " "} {img.size} {len(datas[i])} -> {len(out.getvalue())}')
        datas[i] = out.getvalue()
    return write_glb(dst, j, datas)


if __name__ == '__main__':
    n = repack(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1024)
    print(sys.argv[2], n)
