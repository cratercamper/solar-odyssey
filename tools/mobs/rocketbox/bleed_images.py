# glb の中の服・顔の画像（jpg）で、UV の島のまわりの黒いすき間を、島のふちの色で埋める（にじませる）。
# 遠くで小さい画像（ミップマップ）が使われると、すき間の黒が島のふちに混ざり、縫い目が黒い線や点に見えるため。
# 髪・まつげの透ける画像（png）はさわらない。
# Usage: python3 -I tools/mobs/rocketbox/bleed_images.py public/walk/mobs/rocketbox/*.glb
import io, json, struct, sys
import numpy as np
from PIL import Image, ImageFilter


def bleed(pic, steps=24):
    a = np.asarray(pic.convert('RGB'), dtype=np.float32)
    # 黒いすき間：とても暗くて、まわりも暗い所
    mask = (a.max(-1) > 10).astype(np.float32)
    mask = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)), dtype=np.float32) / 255
    col = a * mask[..., None]
    w = mask.copy()
    for _ in range(steps):
        # 1 画素ずつ外へ広げる（まわり 3×3 の平均）
        k = lambda x: sum(np.roll(np.roll(x, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        c2 = k(col)
        w2 = k(w)
        grow = (w == 0) & (w2 > 0)
        col[grow] = c2[grow] / w2[grow][:, None] * 1
        w[grow] = 1
        col = col * (w[..., None] > 0)
    out = np.where(mask[..., None] > 0, a, col)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def run(path):
    b = open(path, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    bin_off = 20 + jl + 8
    blob = b[bin_off:bin_off + struct.unpack('<I', b[20 + jl:24 + jl])[0]]
    views = [blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in j['bufferViews']]
    # 色の画像（baseColor）だけ
    color = {j['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]['source'] for m in j['materials'] if m.get('pbrMetallicRoughness', {}).get('baseColorTexture') and m.get('alphaMode') != 'MASK'}
    for idx in color:
        im = j['images'][idx]
        if im.get('mimeType') != 'image/jpeg':
            continue
        pic = Image.open(io.BytesIO(views[im['bufferView']]))
        out = io.BytesIO()
        bleed(pic).save(out, 'JPEG', quality=82, optimize=True)
        views[im['bufferView']] = out.getvalue()
    data = b''
    for v, d in zip(j['bufferViews'], views):
        v['byteOffset'] = len(data)
        v['byteLength'] = len(d)
        data += d + b'\0' * ((4 - len(d) % 4) % 4)
    j['buffers'][0]['byteLength'] = len(data)
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(data)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON') + js)
        f.write(struct.pack('<I4s', len(data), b'BIN\0') + data)
    return len(b), total


for p in sys.argv[1:]:
    a, z = run(p)
    print(p, f'{a/1e6:.2f} -> {z/1e6:.2f} MB')
