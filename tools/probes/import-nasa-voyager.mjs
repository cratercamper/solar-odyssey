// NASA 3D Resources の「Voyager Probe (B)」をアプリ用の glb にする（一度だけ使う取り込みの手順）。
//   元: https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Voyager%20Probe%20(B)
//   node tools/probes/import-nasa-voyager.mjs "<元の glb>" public/models/probe-voyager.glb
//   node tools/glb/compress.mjs public/models/probe-voyager.glb
// やること：Draco の圧縮を外す（アプリは meshopt で読む）／使っていない PNG の画像を捨てる／
// 外板の写真にある NASA のロゴと銘板を、まわりの色で塗りつぶす（NASA のロゴは使わない決まり）
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune } from '@gltf-transform/functions'
import draco3d from 'draco3d'
import { spawnSync } from 'node:child_process'

const [src, out] = process.argv.slice(2)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
const doc = await io.read(src)
doc.getRoot().listExtensionsUsed().filter((e) => e.extensionName === 'KHR_draco_mesh_compression').forEach((e) => e.dispose())
await doc.transform(prune())

// ロゴ（1024 四方の画像で x 836–866, y 446–471）を、すぐ下の白っぽい板の色の平均で塗る
const PAINT = `import sys,io
from PIL import Image, ImageDraw, ImageFilter
im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGB')
s=im.width/1024
box=[int(836*s),int(446*s),int(866*s),int(471*s)]
ring=im.crop((int(826*s),int(474*s),int(876*s),int(486*s))).resize((1,1),Image.BOX).getpixel((0,0))
ImageDraw.Draw(im).rectangle(box,fill=ring)
patch=im.crop((box[0]-4,box[1]-4,box[2]+4,box[3]+4)).filter(ImageFilter.GaussianBlur(2))
im.paste(patch,(box[0]-4,box[1]-4))
b=io.BytesIO(); im.save(b,'WEBP',quality=90,method=6); sys.stdout.buffer.write(b.getvalue())`
const logoTex = doc.getRoot().listTextures().find((t) => t.getName().startsWith('Voyager_tex_01'))
const painted = spawnSync('python3', ['-c', PAINT], { input: Buffer.from(logoTex.getImage()), maxBuffer: 1 << 26 })
if (painted.status !== 0) throw new Error(painted.stderr.toString())
logoTex.setImage(new Uint8Array(painted.stdout)).setMimeType('image/webp')
await io.write(out, doc)
console.log('wrote', out)
