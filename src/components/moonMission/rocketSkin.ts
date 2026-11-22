import * as THREE from 'three'

// サターンV の外板の細かさ：溶接の継ぎ目の輪・リベットの列・外板ごとの照りのむら・司令船のアルミのテープの筋。
// glb の地図（1 枚で全体を覆う）は近くで見るとのっぺりするので、近くで見るときだけシェーダーで足す（遠くでは消えて、ちらつかない）。
// 色は変えない（本物は白い塗装・黒い帯・磨いた銀）。座標は部品の中の座標（y がロケットの根元からの高さ m、x・z が横）。
// junji 2026-11-22：参考の画像のような、継ぎ目やリベットの密度

const SKIN = /* glsl */ `
  float skHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float skNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(skHash(i), skHash(i + vec2(1.0, 0.0)), u.x), mix(skHash(i + vec2(0.0, 1.0)), skHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  /** 筒の表面の座標：x は周りの長さ（m）、y は高さ（m） */
  vec2 skUV(vec3 p) { return vec2(atan(p.z, p.x) * length(p.xz), p.y); }
  /** 細い溝（0 か 1）。w は溝の幅（周期に対する割合）。px は 1 画素の大きさ（周期に対する割合）で、細かすぎると薄める */
  float skLine(float x, float w, float px) {
    float d = abs(fract(x + 0.5) - 0.5);
    float aa = max(px, 1e-4);
    return (1.0 - smoothstep(w - aa, w + aa, d)) * (1.0 - smoothstep(0.15, 0.4, px));
  }
  /** 外の補強の縦の筋（ストリンガー）がある高さ：段と段をつなぐ筒（インターステージ）と、タンクの上下のスカート */
  float skStringerZone(float y) {
    float z = 0.0;
    z += smoothstep(1.8, 2.0, y) * (1.0 - smoothstep(8.2, 8.4, y)); // 第1段のいちばん下（エンジンを支える部分のスカート）
    z += smoothstep(24.8, 25.0, y) * (1.0 - smoothstep(28.8, 29.0, y)); // 第1段のタンクのあいだ
    z += smoothstep(39.8, 40.0, y) * (1.0 - smoothstep(46.6, 46.8, y)); // 第1段の上のスカートと、第2段とのあいだ
    z += smoothstep(46.8, 47.0, y) * (1.0 - smoothstep(48.8, 49.0, y)); // 第2段の下のスカート
    z += smoothstep(62.8, 63.0, y) * (1.0 - smoothstep(66.7, 66.9, y)); // 第2段の上のスカート
    z += smoothstep(66.9, 67.1, y) * (1.0 - smoothstep(74.3, 74.5, y)); // 第3段の下（広がった筒と、下のスカート）
    z += smoothstep(82.6, 82.8, y) * (1.0 - smoothstep(85.4, 85.6, y)); // 第3段の上のスカート
    return min(z, 1.0);
  }
  /** 外板の高さ（溝はマイナス）・照りのむら（粗さに足す量）・継ぎ目の汚れ（暗くする量） */
  vec3 skin(vec3 p, float metal) {
    vec2 uv = skUV(p);
    float pxY = length(fwidth(uv.y));
    float pxX = length(fwidth(uv.x));
    float zone = metal > 0.5 ? 0.0 : skStringerZone(uv.y);
    // 溶接の継ぎ目の輪（高さ 1.9 m ごと）と、外板の縦の継ぎ目（周り 2.6 m ごと）
    float ring = skLine(uv.y / 1.9, 0.014, pxY / 1.9) * (1.0 - zone);
    float seam = skLine(uv.x / 2.6, 0.006, pxX / 2.6) * 0.6;
    // ストリンガー：周り 16 cm ごとの、角の丸い山（波板のように光と影が並ぶ）
    float sp = fract(uv.x / 0.16);
    float ridge = smoothstep(0.0, 0.25, sp) * (1.0 - smoothstep(0.55, 0.8, sp));
    float strAA = 1.0 - smoothstep(0.3, 0.55, pxX / 0.16);
    float str = zone * ridge * strAA;
    // ストリンガーの区画の上下のふちの輪（太い継ぎ目）
    float band = skLine(uv.y / 0.9, 0.02, pxY / 0.9) * zone;
    // リベットの列：輪の継ぎ目の上下 9 cm に、周り 12 cm ごと
    float rowY = abs(fract(uv.y / 1.9 + 0.5) - 0.5) * 1.9;
    float onRow = 1.0 - smoothstep(0.012, 0.03, abs(rowY - 0.09));
    float cellX = fract(uv.x / 0.12) - 0.5;
    float dotR = 1.0 - smoothstep(0.18, 0.32, abs(cellX));
    float rivet = onRow * dotR * (1.0 - smoothstep(0.004, 0.012, pxX)) * (1.0 - zone);
    // 外板 1 枚ごとの照りのむら（塗りむら・磨きむら）と、大きなゆらぎ
    vec2 panel = floor(vec2(uv.x / 2.6, uv.y / 1.9));
    float pv = skHash(panel) - 0.5;
    float big = skNoise(uv * vec2(0.6, 0.35)) - 0.5;
    // 司令船のアルミのテープ：周り 9 cm ごとの縦の筋で、照りが 1 本ずつ違う
    float tape = metal * (skHash(vec2(floor(uv.x / 0.09), floor(uv.y / 0.6))) - 0.5);
    float tapeLine = metal * skLine(uv.x / 0.09, 0.03, pxX / 0.09);
    float h = -ring * 1.0 - seam * 0.6 + rivet * 0.8 + str * 1.6 - band * 1.0 - tapeLine * 0.4;
    float rough = pv * 0.10 + big * 0.12 + tape * 0.3 + ring * 0.15;
    float dark = ring * 0.12 + seam * 0.08 + band * 0.22 + zone * (1.0 - ridge) * 0.16 * strAA + tapeLine * 0.15;
    return vec3(h, rough, dark);
  }
`

/** 標準の材質のシェーダーに、外板の細かさを足す（onBeforeCompile の中で呼ぶ）。metal：アルミのテープの筋（司令船） */
export function patchSkin(shader: THREE.WebGLProgramParametersWithUniforms, metal: number) {
  if (!shader.vertexShader.includes('varying vec3 vSkinP;')) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkinP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinP = position;')
  }
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vSkinP;\n${SKIN}`)
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec3 skinV = skin(vSkinP, ${metal.toFixed(2)});
      // 継ぎ目にたまった汚れ・溝の影
      diffuseColor.rgb *= 1.0 - skinV.z;`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + skinV.y, 0.05, 1.0);`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        // 溝とリベットの高さから、法線を少し傾ける（three の perturbNormalArb と同じ考え方）
        float hk = skinV.x * 0.006;
        vec3 dpx = dFdx(-vViewPosition);
        vec3 dpy = dFdy(-vViewPosition);
        float dhx = dFdx(hk);
        float dhy = dFdy(hk);
        vec3 r1 = cross(dpy, normal);
        vec3 r2 = cross(normal, dpx);
        float det = dot(dpx, r1);
        vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
        normal = normalize(abs(det) * normal - grad);
      }`,
    )
}

/** 材質の名前 → [粗さ, 金属らしさ]：白い塗装は半つや、黒い帯は艶消し、司令船の外は磨いた金属（junji 2026-11-22） */
export const ROCKET_SURFACE: Record<string, [number, number]> = {
  White: [0.42, 0],
  Black: [0.95, 0],
  Grey: [0.62, 0.15],
  Silver: [0.16, 1],
  Metal: [0.38, 1],
}

/**
 * 霜を付けない部品の材質を、外板の細かさつきの複製に替える。
 * keep：描く高さの範囲（m）。ドッキングの場面の第3段は、第2段と離れた下の広がった筒（70 m より下）を描かない。
 * surface：照りを ROCKET_SURFACE にそろえる
 */
export function skinParts(parts: THREE.Object3D[], opt: { keep?: [number, number]; surface?: boolean } = {}) {
  const made: THREE.Material[] = []
  const cache = new Map<THREE.Material, THREE.Material>()
  const keep = opt.keep
  for (const part of parts) {
    part.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const swap = (x: THREE.Material) => {
        if (!(x instanceof THREE.MeshStandardMaterial) || !['White', 'Silver', 'Metal', 'Grey', 'Black'].includes(x.name)) return x
        let m = cache.get(x)
        if (!m) {
          const c = x.clone()
          const look = ROCKET_SURFACE[x.name]
          if (opt.surface && look) [c.roughness, c.metalness] = look
          const metal = x.name === 'Silver' ? 1 : 0
          const keepY = keep ? { value: new THREE.Vector2(keep[0], keep[1]) } : null
          c.onBeforeCompile = (shader) => {
            patchSkin(shader, metal)
            if (!keepY) return
            shader.uniforms.uKeepY = keepY
            shader.fragmentShader = shader.fragmentShader
              .replace('#include <common>', '#include <common>\nuniform vec2 uKeepY;')
              .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vSkinP.y < uKeepY.x || vSkinP.y > uKeepY.y) discard;')
          }
          c.customProgramCacheKey = () => `skin-${metal}${keepY ? '-keep' : ''}`
          cache.set(x, c)
          made.push(c)
          m = c
        }
        return m
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
    })
  }
  return { made: new Set(made), dispose: () => made.forEach((m) => m.dispose()) }
}

/**
 * 第3段（S-IVB）のお尻。本物は、第2段との間の広がった筒（段間部）が第2段といっしょに離れると、
 * 中から J-2 エンジン 1 基・それを支える円すいの梁・液体酸素タンクの丸い底が見える。
 * engine は段間部が離れたあとだけ見せる（外の黒い帯の白い APS の箱は glb にある）。
 */
export function s4bAft() {
  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  const mat = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(p)
    mats.push(m)
    return m
  }
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D) => {
    geos.push(g)
    const o = new THREE.Mesh(g, m)
    parent.add(o)
    return o
  }
  const lathe = (pts: [number, number][], seg = 64) => new THREE.LatheGeometry(pts.map(([y, r]) => new THREE.Vector2(r, y)), seg)

  // 色と照りは、ケネディ宇宙センターに展示されている実機の第3段の写真に合わせる（junji 2026-11-22）
  // ノズル：冷やすための細い管を何百本も縦に並べて作った、銀色の金属（管は細かすぎるので、補強の輪だけ形で出す）
  const nozzle = mat({ color: '#b4b7bb', metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide })
  const steel = mat({ color: '#9a9da2', metalness: 0.8, roughness: 0.3 })
  const darkPipe = mat({ color: '#2e2f31', metalness: 0.3, roughness: 0.6 })
  const foil = mat({ color: '#c9a64a', metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide })
  const bottle = mat({ color: '#a7aaae', metalness: 0.75, roughness: 0.3 })
  const whiteBall = mat({ color: '#e6e6e2', metalness: 0.0, roughness: 0.55 })
  const struct = mat({ color: '#8c8f8c', metalness: 0.45, roughness: 0.5, side: THREE.DoubleSide, flatShading: true })
  const dome = mat({ color: '#a3ab9b', metalness: 0.15, roughness: 0.65, side: THREE.DoubleSide })
  const skirt = mat({ color: '#b9bbb8', metalness: 0.1, roughness: 0.7, side: THREE.BackSide, flatShading: true })

  const engine = new THREE.Group()
  engine.name = 'S4bEngine'
  // ノズル（口の直径 2 m、のどから口まで 1.9 m）：のどからふくらんで広がる、ベルの形
  const bellR = (y: number) => 0.24 + 0.74 * Math.pow(THREE.MathUtils.clamp((68.85 - y) / 1.95, 0, 1), 0.62)
  // 補強の輪（ハットバンド）は、ノズルの形そのものに細い出っぱりとして入れる（別の輪を重ねると、遠くで点線のようにちらつく）。
  // 下の広い所ほど多い。口のふちは太い輪
  const bands = Array.from({ length: 11 }, (_, i) => 68.35 - i * 0.135)
  const bell: [number, number][] = []
  for (let i = 0; i <= 160; i++) {
    const y = 68.85 - 1.95 * (i / 160)
    let bump = 0
    for (const by of bands) bump = Math.max(bump, 1 - Math.min(Math.abs(y - by) / 0.03, 1))
    bump = Math.max(bump, 1 - Math.min((y - 66.9) / 0.06, 1))
    bell.push([y, bellR(y) + 0.03 * Math.sqrt(bump)])
  }
  mesh(lathe(bell, 128), nozzle, engine)
  // 燃焼室と噴射器（のどの上）・首振りの台
  mesh(lathe([[68.85, 0.24], [69.0, 0.3], [69.45, 0.32], [69.6, 0.36], [69.75, 0.2], [69.95, 0.12], [69.95, 0.001]], 32), steel, engine)
  // ターボポンプ 2 つ（液体水素と液体酸素）と、燃料の太い管
  for (const [x, z, r, h] of [
    [0.62, 0.1, 0.2, 0.75],
    [-0.58, -0.2, 0.17, 0.6],
  ]) {
    const g = new THREE.CylinderGeometry(r, r, h, 20)
    g.translate(x, 69.35, z)
    mesh(g, steel, engine)
    const duct = new THREE.CylinderGeometry(0.07, 0.07, 0.9, 10)
    duct.rotateZ(Math.sign(x) * 0.9)
    duct.translate(x * 0.55, 69.1, z)
    mesh(duct, darkPipe, engine)
  }
  // ガス発生器
  {
    const g = new THREE.SphereGeometry(0.16, 16, 10)
    g.translate(0.1, 69.55, 0.45)
    mesh(g, steel, engine)
  }
  // エンジンを始動させる水素の白い球（写真ではエンジンの横の白い大きな球）
  {
    const g = new THREE.SphereGeometry(0.4, 24, 16)
    g.translate(0.95, 69.75, -0.75)
    mesh(g, whiteBall, engine)
  }
  // エンジンを支える円すいの梁（縦の補強の筋は、平らな面を並べて出す）
  mesh(lathe([[69.95, 0.45], [71.3, 1.95]], 24), struct, engine)
  // 液体酸素タンクの丸い底（薄い緑がかった灰色）と、帯の内側（白い外板の裏の補強の筋）
  const domeY = (r: number) => 70.35 + (1 - Math.cos(Math.asin(Math.min(r / 3.26, 1)))) * 1.9
  const dPts: [number, number][] = []
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2)
    dPts.push([70.35 + (1 - Math.cos(a)) * 1.9, Math.sin(a) * 3.26])
  }
  mesh(lathe(dPts, 64), dome, engine)
  mesh(lathe([[70.0, 3.28], [72.3, 3.28]], 96), skirt, engine)
  // 底に貼った金色の断熱の板（扇形に 3 枚）
  for (const a0 of [0.3, 2.4, 4.3]) {
    const pts: [number, number][] = []
    for (let i = 0; i <= 6; i++) {
      const r = 1.3 + i * 0.13
      pts.push([domeY(r) - 0.03, r])
    }
    mesh(new THREE.LatheGeometry(pts.map(([y, r]) => new THREE.Vector2(r, y)), 8, a0, 0.75), foil, engine)
  }
  // ヘリウムのボンベ（銀色の球）：底のふちに輪のように並ぶ。そこからエンジンへ細い管
  const pipes: THREE.Vector3[][] = []
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2
    const r = 2.45
    const c = new THREE.Vector3(Math.cos(a) * r, domeY(r) - 0.33, Math.sin(a) * r)
    const g = new THREE.SphereGeometry(0.33, 24, 16)
    g.translate(c.x, c.y, c.z)
    mesh(g, bottle, engine)
    if (i % 3 === 0) pipes.push([c.clone().setY(c.y + 0.1), new THREE.Vector3(Math.cos(a) * 1.4, 70.55, Math.sin(a) * 1.4), new THREE.Vector3(Math.cos(a) * 0.5, 69.8, Math.sin(a) * 0.5)])
  }
  // 小さめのボンベを、エンジンの近くにも
  for (const [x, z] of [
    [-1.1, 0.7],
    [-0.4, 1.25],
  ]) {
    const g = new THREE.SphereGeometry(0.24, 20, 14)
    g.translate(x, 70.15, z)
    mesh(g, bottle, engine)
  }
  for (const p of pipes) {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p), 16, 0.035, 6)
    mesh(g, steel, engine)
  }
  // 黒い太いホース（写真ではエンジンの上を曲がって通る）
  {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.7, 70.75, -0.9), new THREE.Vector3(-0.9, 70.2, -0.75), new THREE.Vector3(-0.45, 69.6, -0.4)])
    mesh(new THREE.TubeGeometry(c, 16, 0.08, 8), darkPipe, engine)
  }

  return { engine, dispose: () => (geos.forEach((g) => g.dispose()), mats.forEach((m) => m.dispose())) }
}
