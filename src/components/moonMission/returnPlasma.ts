import * as THREE from 'three'
import { OUT_CHUNK, encodeOutput } from './shaderOut'

// 章8 の再突入の火の玉（components/moonMission/ReturnWorld.tsx）：熱よけの前の衝撃波の光・うしろへ長くのびる尾・はがれて飛ぶ火の粉。
// どれも「熱よけの面の中心が原点、進む向きが -Y」の形で作り、ReturnWorld が向きをそろえる。
// uHeat（0〜1）で明るさ、色は熱さで変わる（薄い空気の高い所では桃色・紫、いちばん熱いと白・黄、終わりはオレンジ）

const common = /* glsl */ `
  // sin を使う乱数は、大きな値（時間が進んだあと）で精度が落ちて、四角い板のような模様になる。掛け算と fract だけの乱数に
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float n1(float x) {
    float i = floor(x), f = fract(x);
    return mix(hash(vec2(i, 0.0)), hash(vec2(i + 1.0, 0.0)), f * f * (3.0 - 2.0 * f));
  }
  vec3 plasma(float heat, float t) {
    // t：0 が衝撃波のすぐそば（いちばん熱い）、1 が尾の先
    vec3 pink = vec3(1.0, 0.42, 0.72);
    vec3 white = vec3(1.0, 0.82, 0.55);
    vec3 orange = vec3(1.0, 0.48, 0.14);
    vec3 hot = mix(pink, white, smoothstep(0.3, 0.9, heat));
    // 尾はすぐにオレンジへ（根元だけ白く熱い）
    return mix(hot, mix(orange, pink * 0.8, 0.25), smoothstep(0.0, 0.25, t));
  }
`

const vert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`

const shockFrag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uHeat;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  ${common}
  void main() {
    #include <logdepthbuf_fragment>
    float face = abs(dot(normalize(vN), normalize(vV)));
    float n = noise(vec2(vUv.x * 18.0, vUv.y * 6.0 - uTime * 14.0)) * 0.5 + 0.5;
    // 熱よけの真ん中の前（よどみ点）がいちばん明るく、ふちへ向かってうすくなる（ふちに線が出ると、ガラスの泡のように見えた）
    float a = (0.45 + 0.55 * face) * smoothstep(1.0, 0.55, vUv.y) * uHeat * (0.75 + 0.5 * n);
    vec3 col = mix(plasma(uHeat, 0.0), vec3(1.0, 0.55, 0.3), 0.35) * 1.6;
    gl_FragColor = vec4(col * a, a);
    ${OUT_CHUNK}
  }
`

const wakeFrag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uHeat;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  ${common}
  void main() {
    #include <logdepthbuf_fragment>
    // vUv.y：0 が根元（熱よけのそば）、1 が尾の先
    float s = vUv.y;
    float face = abs(dot(normalize(vN), normalize(vV)));
    float flow = noise(vec2(vUv.x * 10.0, s * 9.0 - uTime * 22.0)) * 0.6 + noise(vec2(vUv.x * 29.0, s * 31.0 - uTime * 41.0)) * 0.4;
    float body = pow(max(0.0, 1.0 - s), 1.2) * smoothstep(0.0, 0.08, s + 0.02);
    float a = body * pow(face, 1.2) * uHeat * (0.35 + 0.9 * flow);
    // 明るい空や雲の上でも見えるように、光の量は強め（画面の光のにじみも出る）
    vec3 col = plasma(uHeat, s) * (1.2 + 1.6 * (1.0 - s));
    gl_FragColor = vec4(col * a, min(1.0, a));
    ${OUT_CHUNK}
  }
`

function mat(frag: string) {
  return encodeOutput(new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { uHeat: { value: 0 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  }))
}

// ---- 火の粉（熱よけがはがれて飛ぶ。シェーダーの中で時間から位置を出す） ----

const sparkVert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float seed;
  uniform float uTime;
  uniform float uHeat;
  uniform float uLen;
  varying float vA;
  void main() {
    float life = fract(uTime * (0.55 + seed * 0.6) + seed * 13.7);
    float ang = seed * 6.2831 * 7.0;
    float r = 1.9 + seed * 0.6 + life * (1.0 + seed * 3.0);
    vec3 p = vec3(cos(ang) * r, life * uLen * (0.4 + seed), sin(ang) * r);
    vA = (1.0 - life) * uHeat;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(110.0 / -mv.z, 1.0, 5.0) * (0.6 + seed);
    #include <logdepthbuf_vertex>
  }
`

const sparkFrag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying float vA;
  void main() {
    #include <logdepthbuf_fragment>
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-d * d * 3.0) * vA;
    gl_FragColor = vec4(vec3(1.0, 0.75, 0.4) * a * 2.0, a);
    ${OUT_CHUNK}
  }
`

export type Fireball = {
  group: THREE.Group
  shock: THREE.ShaderMaterial
  wake: THREE.ShaderMaterial
  sparks: THREE.ShaderMaterial
  wakeMesh: THREE.Mesh
  /** 衝撃波のおわん。ReturnWorld が熱よけの面の向きにそろえる */
  shockMesh: THREE.Mesh
  dispose: () => void
}

/** 衝撃波のおわんのふちの高さ（熱よけの中心から、機体の上へ m） */
export const SHOCK_Y = 0.1

/** 火の玉ひとそろい。group の原点が熱よけの中心、-Y が進む向き（尾は +Y へ） */
export function makeFireball(): Fireball {
  const group = new THREE.Group()
  group.name = 'return-fireball'
  const shock = mat(shockFrag)
  const wake = mat(wakeFrag)
  // 衝撃波：熱よけの前に、おわんをかぶせた形（直径 3.9 m の熱よけより少し大きい）
  const sg = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
  const sm = new THREE.Mesh(sg, shock)
  sm.scale.set(2.5, 0.9, 2.5)
  sm.position.y = SHOCK_Y
  sm.renderOrder = 6
  // 尾：根元が熱よけの太さ、先へ向かって広がる円すい（長さ 1、+Y へ。ReturnWorld が長さを決める）
  const wg = new THREE.CylinderGeometry(7, 2.3, 1, 32, 20, true)
  wg.translate(0, 0.5, 0)
  const wm = new THREE.Mesh(wg, wake)
  wm.renderOrder = 6
  // 火の粉
  const N = 140
  const pg = new THREE.BufferGeometry()
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
  const seeds = new Float32Array(N)
  for (let i = 0; i < N; i++) seeds[i] = Math.random()
  pg.setAttribute('seed', new THREE.BufferAttribute(seeds, 1))
  const sparks = encodeOutput(new THREE.ShaderMaterial({
    vertexShader: sparkVert,
    fragmentShader: sparkFrag,
    uniforms: { uTime: { value: 0 }, uHeat: { value: 0 }, uLen: { value: 60 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }))
  const pts = new THREE.Points(pg, sparks)
  pts.frustumCulled = false
  pts.renderOrder = 7
  wm.frustumCulled = false
  sm.frustumCulled = false
  group.add(sm, wm, pts)
  return { group, shock, wake, sparks, wakeMesh: wm, shockMesh: sm, dispose: () => [shock, wake, sparks, sg, wg, pg].forEach((o) => o.dispose()) }
}

/** 毎フレーム：熱の強さと時間 */
export function updateFireball(f: Fireball, heat: number, time: number) {
  f.group.visible = heat > 0.01
  f.shock.uniforms.uHeat.value = Math.min(1, heat * 1.3)
  f.wake.uniforms.uHeat.value = heat
  f.sparks.uniforms.uHeat.value = Math.min(1, heat * 1.5)
  // 時間は 1000 秒でくり返す（シェーダーの中の数が大きくなりすぎないように）
  const tw = time % 1000
  f.shock.uniforms.uTime.value = tw
  f.wake.uniforms.uTime.value = tw
  f.sparks.uniforms.uTime.value = tw
  // 熱いほど尾は長い（最大 約 500 m。本物は流れ星のように、何 km も光の尾を引いた）
  f.wakeMesh.scale.set(1 + heat * 0.6, 30 + heat * 470, 1 + heat * 0.6)
  f.sparks.uniforms.uLen.value = 25 + heat * 70
}

// ---- 窓の外のプラズマ（船の窓のカメラのときだけ。画面いっぱいに重ねる） ----
// 本物の乗組員の話：窓の外がオレンジと桃色に光り、熱よけからはがれた火の粉と光の筋が、うしろへ流れていく

const winVert = /* glsl */ `
  varying vec2 vS;
  void main() {
    vS = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`
const winFrag = /* glsl */ `
  uniform float uHeat;
  uniform float uTime;
  uniform vec2 uFlow;
  uniform float uAspect;
  varying vec2 vS;
  ${common}
  void main() {
    // 流れの向きにそった座標（along：流れていく向き、across：横）
    vec2 p = vec2(vS.x * uAspect, vS.y);
    vec2 f = normalize(uFlow);
    float along = dot(p, f);
    float across = dot(p, vec2(-f.y, f.x));
    // 光の筋：横に細かく、流れの向きに長い乱数が、速く流れる
    // 細い光の筋：流れと直角の向きだけの 1 次元の乱数で、筋（線）を作る（2 次元の乱数を引きのばすと、四角い板が並んで見えた）。
    // 筋は少しうねり、明るさのかたまりが流れにそって速く走る
    float L = across * 7.0 + 0.6 * sin(along * 0.8 - uTime * 1.1) + 0.3 * sin(along * 2.1 + uTime * 0.7);
    float fil = n1(L) * 0.6 + n1(L * 2.7 + 5.0) * 0.4;
    float ridge = pow(max(0.0, 1.0 - abs(fil * 2.0 - 1.0)), 8.0);
    float pw = along * 0.5 - uTime * 6.0 + L * 0.37;
    float pulse = 0.35 + 0.65 * (n1(pw) * 0.5 + n1(pw * 1.37 + 0.5) * 0.5);
    float glow = 0.5 + 0.5 * n1(across * 1.3 + 9.0 + 0.4 * sin(along * 0.5 - uTime));
    float streak = ridge * 1.3 * pulse + glow * 0.35;
    // 熱よけの側（流れの上手）ほど明るい
    float up = smoothstep(1.4, -1.0, along);
    // 火の粉：小さく明るい点が、流れにそって飛ぶ
    vec2 g = vec2(across * 14.0, along * 3.0 - uTime * 16.0);
    vec2 cell = floor(g);
    float r = hash(cell);
    vec2 fp = fract(g) - vec2(0.5, 0.5 + 0.35 * (r - 0.5));
    float flake = step(0.82, r) * exp(-dot(fp * vec2(3.0, 1.2), fp * vec2(3.0, 1.2)) * 40.0);
    float flick = 0.85 + 0.15 * sin(uTime * 31.0 + r * 50.0);
    vec3 col = plasma(uHeat, 0.15 + 0.6 * (1.0 - up)) * (0.12 + streak * 1.1) * (0.35 + 0.8 * up) * flick;
    col += vec3(1.0, 0.8, 0.5) * flake * 2.2;
    float a = uHeat * clamp(0.18 + streak * 0.55 + 0.25 * up, 0.0, 1.0);
    gl_FragColor = vec4(col * uHeat * 0.6, a);
    ${OUT_CHUNK}
  }
`

export type WindowPlasma = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; dispose: () => void }

export function makeWindowPlasma(): WindowPlasma {
  const geo = new THREE.PlaneGeometry(2, 2)
  const mat = encodeOutput(new THREE.ShaderMaterial({
    vertexShader: winVert,
    fragmentShader: winFrag,
    uniforms: { uHeat: { value: 0 }, uTime: { value: 0 }, uFlow: { value: new THREE.Vector2(0, 1) }, uAspect: { value: 1 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }))
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 20
  mesh.visible = false
  mesh.name = 'return-window-plasma'
  return { mesh, mat, dispose: () => (geo.dispose(), mat.dispose()) }
}
