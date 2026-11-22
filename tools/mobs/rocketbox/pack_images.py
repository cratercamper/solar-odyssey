# glb の中の画像を詰め直す（GLTFExporter は canvas で書き出すので大きい）。jpg は品質 82、png（髪・まつげの透け）は 256 色に減らす。
# Usage: python3 -I tools/mobs/rocketbox/pack_images.py public/walk/mobs/rocketbox/*.glb
import io, json, struct, sys
from PIL import Image


def pack(path):
    b = open(path, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    bin_off = 20 + jl + 8
    blob = b[bin_off:bin_off + struct.unpack('<I', b[20 + jl:24 + jl])[0]]
    views = [blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in j['bufferViews']]
    for im in j.get('images', []):
        i = im['bufferView']
        pic = Image.open(io.BytesIO(views[i]))
        out = io.BytesIO()
        if im.get('mimeType') == 'image/png':
            pic.convert('RGBA').quantize(256, method=Image.Quantize.FASTOCTREE).save(out, 'PNG', optimize=True)
        else:
            pic.convert('RGB').save(out, 'JPEG', quality=82, optimize=True)
        views[i] = out.getvalue()
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
    a, z = pack(p)
    print(p, f'{a/1e6:.2f} -> {z/1e6:.2f} MB')
