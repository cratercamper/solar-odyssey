import * as THREE from 'three'
import { OUT_CHUNK, encodeOutput } from './shaderOut'

// 章8 の回収（components/moonMission/ReturnWorld.tsx）：空母・回収のヘリコプター・潜水員・浮き輪・いかだ。
// どれも形だけの作り（本物の部隊の記号や番号は描かない）。大きさは本物に合わせる

const grey = (hex: string, rough = 0.8, metal = 0.15) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal })

/**
 * 回収の空母（エセックス級：長さ 270 m。のちに斜めの甲板と、右舷の島をもつ形に改装された）。
 * 原点は喫水線、+X がへさき
 */
export function makeCarrier() {
  const g = new THREE.Group()
  g.name = 'return-carrier'
  const hullM = grey('#6c747b', 0.8, 0.2)
  const deckM = grey('#3d4247', 0.95, 0.05)
  const darkM = grey('#25292d', 0.85, 0.1)
  const owned: { dispose: () => void }[] = [hullM, deckM, darkM]
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z)
    mesh.rotation.y = ry
    g.add(mesh)
    owned.push(geo)
    return mesh
  }
  // 船体：へさきに向かって細く、下へすぼむ
  const hull = new THREE.BoxGeometry(250, 18, 28, 16, 2, 2)
  const p = hull.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    let k = 1
    if (x > 50) k *= 1 - ((x - 50) / 75) ** 2 * 0.88
    if (x < -105) k *= 1 - ((-105 - x) / 20) * 0.25
    if (p.getY(i) < 0) k *= 0.78
    p.setZ(i, p.getZ(i) * k)
  }
  hull.computeVertexNormals()
  add(hull, hullM, 0, 2, 0)
  // 格納庫の壁（甲板の下の、暗い開口部の帯）
  add(new THREE.BoxGeometry(170, 4, 29.5), darkM, -10, 12.5, 0)
  // 飛行甲板（長さ 270 m）と、左へ張り出した斜めの甲板
  add(new THREE.BoxGeometry(262, 1.4, 32), deckM, 2, 15.2, 0)
  add(new THREE.BoxGeometry(120, 1.4, 22), deckM, -30, 15.2, -18, 0.18)
  // 甲板の白い線（中心線と、斜めの甲板の線）
  const lineM = new THREE.MeshBasicMaterial({ color: '#c9ccc8' })
  owned.push(lineM)
  add(new THREE.BoxGeometry(230, 0.1, 0.5), lineM, 8, 15.95, 0)
  add(new THREE.BoxGeometry(110, 0.1, 0.5), lineM, -32, 15.95, -18, 0.18)
  // 右舷の島（艦橋）・煙突・マスト
  add(new THREE.BoxGeometry(38, 10, 7), hullM, 18, 21, 14)
  add(new THREE.BoxGeometry(20, 6, 6), hullM, 20, 29, 14)
  add(new THREE.BoxGeometry(9, 7, 5.5), darkM, 10, 31, 14)
  add(new THREE.CylinderGeometry(0.5, 0.8, 18, 6), darkM, 24, 40, 14)
  add(new THREE.BoxGeometry(8, 0.4, 0.4), darkM, 24, 45, 14)
  // 甲板の上の飛行機とヘリ（小さな形）
  for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(12, 2.4, 9), hullM, -95 + i * 16, 17.2, -6 + (i % 2) * 9)
  return { group: g, dispose: () => owned.forEach((o) => o.dispose()) }
}

// ---- 回収のヘリコプター（SH-3 シーキング：胴の長さ 16.7 m、回転翼の直径 18.9 m、5 枚羽根） ----

const discFrag = /* glsl */ `
  uniform float uSpin;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0 || r < 0.06) discard;
    float a = atan(p.y, p.x);
    // 回っている羽根のぼやけた円：羽根の影がうっすら、ふちほどうすい
    float blades = 0.5 + 0.5 * cos(5.0 * (a - uSpin));
    float alpha = (0.1 + 0.12 * pow(blades, 6.0)) * smoothstep(1.0, 0.85, r);
    gl_FragColor = vec4(vec3(0.1, 0.11, 0.12) * alpha, alpha);
    ${OUT_CHUNK}
  }
`
const discVert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`

export type Helicopter = { group: THREE.Group; rotor: THREE.Group; tailRotor: THREE.Group; disc: THREE.ShaderMaterial; dispose: () => void }

/** 原点は胴の真ん中、+X が機首、+Y が上 */
export function makeHelicopter(): Helicopter {
  const g = new THREE.Group()
  g.name = 'return-helicopter'
  const bodyM = grey('#5f676e', 0.6, 0.25)
  const topM = grey('#9aa0a4', 0.6, 0.25)
  const glassM = new THREE.MeshStandardMaterial({ color: '#0f1418', roughness: 0.15, metalness: 0.6 })
  const darkM = grey('#202326', 0.7, 0.3)
  const owned: { dispose: () => void }[] = [bodyM, topM, glassM, darkM]
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    parent.add(mesh)
    owned.push(geo)
    return mesh
  }
  // 胴：丸みのある長い胴（カプセル形を横に）。機首は少し下がって丸く、うしろは尾へ細くなる。底は船の形（水に降りられる）
  const body = new THREE.CapsuleGeometry(1.7, 8.6, 8, 20)
  body.rotateZ(Math.PI / 2)
  const bp = body.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < bp.count; i++) {
    let x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i)
    // うしろ半分は細く上へ（尾の付け根）
    if (x < -1.5) {
      const t = Math.min(1, (-1.5 - x) / 4.5)
      y = y * (1 - t * 0.5) + t * 0.6
      z *= 1 - t * 0.55
    }
    // 機首は下へ丸く
    if (x > 3) y -= ((x - 3) / 3) ** 2 * 0.5
    // 底は平らぎみで、まん中がとがる（船の形）
    if (y < 0) y *= 0.8 + 0.2 * Math.min(1, Math.abs(z) / 1.6)
    bp.setXYZ(i, x, y * 1.08, z)
  }
  body.computeVertexNormals()
  add(g, body, bodyM, 0, 0, 0)
  // 操縦席の窓（機首の上の黒い帯）と、横の窓の列
  const wind = new THREE.CapsuleGeometry(0.75, 0.9, 4, 10)
  wind.rotateZ(Math.PI / 2)
  wind.scale(1, 0.55, 1.95)
  add(g, wind, glassM, 4.4, 0.85, 0)
  for (const sz of [-1, 1]) for (let k = 0; k < 4; k++) add(g, new THREE.BoxGeometry(0.55, 0.42, 0.05), glassM, 1.6 - k * 1.2, 0.55, sz * 1.73)
  // 横の戸（潜水員が飛びこむ所。右側）
  add(g, new THREE.BoxGeometry(1.3, 1.5, 0.06), glassM, 2.6, 0.0, 1.76)
  // 屋根（エンジンのおおい）
  add(g, new THREE.CapsuleGeometry(0.75, 3.6, 4, 12).rotateZ(Math.PI / 2).scale(1, 0.85, 1.25), topM, 0.6, 2.05, 0)
  // 尾：細い胴と、たての羽根
  const boom = new THREE.CylinderGeometry(0.45, 0.9, 7.5, 10)
  boom.rotateZ(Math.PI / 2)
  add(g, boom, bodyM, -9.0, 1.1, 0)
  add(g, new THREE.BoxGeometry(1.6, 3.2, 0.3), bodyM, -12.7, 2.5, 0)
  // 横の浮き（脚の入る張り出し）
  for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(2.6, 0.9, 1.1), bodyM, -0.6, -1.0, s * 2.0)
  // 主回転翼：5 枚羽根 ＋ 回ってぼやけた円
  const rotor = new THREE.Group()
  rotor.position.set(0.6, 2.95, 0)
  add(rotor, new THREE.CylinderGeometry(0.35, 0.35, 0.7, 10), darkM, 0, 0, 0)
  for (let i = 0; i < 5; i++) {
    const blade = new THREE.BoxGeometry(9.2, 0.08, 0.46)
    blade.translate(4.7, 0, 0)
    const m = add(rotor, blade, darkM, 0, 0.2, 0)
    m.rotation.y = (i / 5) * Math.PI * 2
  }
  const disc = encodeOutput(new THREE.ShaderMaterial({ vertexShader: discVert, fragmentShader: discFrag, uniforms: { uSpin: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide }))
  owned.push(disc)
  const dg = new THREE.PlaneGeometry(19, 19)
  dg.rotateX(-Math.PI / 2)
  const dm = new THREE.Mesh(dg, disc)
  dm.position.y = 0.22
  owned.push(dg)
  rotor.add(dm)
  g.add(rotor)
  // 尾の回転翼
  const tailRotor = new THREE.Group()
  tailRotor.position.set(-12.9, 3.1, 0.4)
  for (let i = 0; i < 5; i++) {
    const b = new THREE.BoxGeometry(0.2, 1.6, 0.05)
    b.translate(0, 0.8, 0)
    const m = add(tailRotor, b, darkM, 0, 0, 0)
    m.rotation.z = (i / 5) * Math.PI * 2
  }
  g.add(tailRotor)
  return { group: g, rotor, tailRotor, disc, dispose: () => owned.forEach((o) => o.dispose()) }
}

// ---- ヘリの風で波立つ海（真下に、白いしぶきの輪） ----

const washFrag = /* glsl */ `
  uniform float uTime;
  uniform float uK;
  varying vec2 vUv;
  float h21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    // 外へ広がるしぶき：輪の形の乱数が、外へ流れる
    float n = vn(vec2(a * 9.0, r * 8.0 - uTime * 3.0)) * 0.6 + vn(vec2(a * 23.0, r * 19.0 - uTime * 6.0)) * 0.4;
    float ring = smoothstep(0.15, 0.45, r) * smoothstep(1.0, 0.6, r);
    float alpha = clamp((n - 0.45) * 2.2, 0.0, 1.0) * ring * uK * 0.8;
    gl_FragColor = vec4(vec3(0.92, 0.95, 0.97) * alpha, alpha);
    ${OUT_CHUNK}
  }
`
export function makeDownwash() {
  const geo = new THREE.PlaneGeometry(36, 36)
  geo.rotateX(-Math.PI / 2)
  const mat = encodeOutput(new THREE.ShaderMaterial({ vertexShader: discVert, fragmentShader: washFrag, uniforms: { uTime: { value: 0 }, uK: { value: 0 } }, transparent: true, depthWrite: false }))
  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = 3
  mesh.name = 'return-downwash'
  return { mesh, mat, dispose: () => (geo.dispose(), mat.dispose()) }
}

// ---- 浮き輪（フローテーション・カラー）・潜水員・いかだ ----

/** 司令船の下のふち（直径 3.9 m）を囲む、ふくらませる輪 */
export function makeCollar() {
  const geo = new THREE.TorusGeometry(2.35, 0.42, 14, 40)
  geo.rotateX(Math.PI / 2)
  const mat = grey('#6f725c', 0.85, 0.05)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'return-collar'
  mesh.castShadow = mesh.receiveShadow = true
  return { mesh, dispose: () => (geo.dispose(), mat.dispose()) }
}

/** 黒いウェットスーツの潜水員（水から胸より上が出る形）。原点は水面 */
export function makeSwimmer() {
  const g = new THREE.Group()
  const suit = grey('#16181a', 0.55, 0.05)
  const mask = new THREE.MeshStandardMaterial({ color: '#2a3a44', roughness: 0.1, metalness: 0.5 })
  const torso = new THREE.CapsuleGeometry(0.2, 0.55, 4, 10)
  const head = new THREE.SphereGeometry(0.13, 12, 10)
  const glass = new THREE.BoxGeometry(0.06, 0.07, 0.16)
  const t = new THREE.Mesh(torso, suit)
  t.position.y = 0.05
  const hd = new THREE.Mesh(head, suit)
  hd.position.y = 0.55
  const gl = new THREE.Mesh(glass, mask)
  gl.position.set(0.11, 0.56, 0)
  g.add(t, hd, gl)
  return { group: g, dispose: () => [suit, mask, torso, head, glass].forEach((o) => o.dispose()) }
}

/** 黄色いゴムのいかだ（3 人の乗組員が乗りうつる。長さ 3.6 m） */
export function makeRaft() {
  const g = new THREE.Group()
  const m = grey('#c79a2e', 0.7, 0.0)
  const floorM = grey('#4c4d47', 0.9, 0.0)
  const tube = new THREE.TorusGeometry(1.25, 0.28, 10, 28)
  tube.rotateX(Math.PI / 2)
  tube.scale(1.45, 1, 1)
  const floor = new THREE.CylinderGeometry(1.2, 1.2, 0.08, 24)
  floor.scale(1.45, 1, 1)
  const a = new THREE.Mesh(tube, m)
  a.position.y = 0.2
  const b = new THREE.Mesh(floor, floorM)
  b.position.y = 0.06
  a.castShadow = b.receiveShadow = true
  g.add(a, b)
  return { group: g, dispose: () => [m, floorM, tube, floor].forEach((o) => o.dispose()) }
}
