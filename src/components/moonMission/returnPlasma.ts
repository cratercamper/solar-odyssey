import * as THREE from 'three'

// 章8 の再突入の火の玉（components/moonMission/ReturnWorld.tsx）：熱よけの前の衝撃波の光・うしろへ長くのびる尾・はがれて飛ぶ火の粉。
// どれも「熱よけの面の中心が原点、進む向きが -Y」の形で作り、ReturnWorld が向きをそろえる。
// uHeat（0〜1）で明るさ、色は熱さで変わる（薄い空気の高い所では桃色・紫、いちばん熱いと白・黄、終わりはオレンジ）

const common = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
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
    float a = (0.35 + 0.65 * pow(max(0.0, 1.0 - face), 1.5)) * uHeat * (0.75 + 0.5 * n);
    vec3 col = mix(plasma(uHeat, 0.0), vec3(1.0, 0.55, 0.3), 0.35) * 1.6;
    gl_FragColor = vec4(col * a, a);
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
    float a = body * pow(face, 1.2) * uHeat * (0.35 + 0.9 * flow) * 0.75;
    vec3 col = plasma(uHeat, s) * 1.1;
    gl_FragColor = vec4(col * a, a);
  }
`

function mat(frag: string) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { uHeat: { value: 0 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
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
  }
`

export type Fireball = {
  group: THREE.Group
  shock: THREE.ShaderMaterial
  wake: THREE.ShaderMaterial
  sparks: THREE.ShaderMaterial
  wakeMesh: THREE.Mesh
  dispose: () => void
}

/** 火の玉ひとそろい。group の原点が熱よけの中心、-Y が進む向き（尾は +Y へ） */
export function makeFireball(): Fireball {
  const group = new THREE.Group()
  group.name = 'return-fireball'
  const shock = mat(shockFrag)
  const wake = mat(wakeFrag)
  // 衝撃波：熱よけの前に、おわんをかぶせた形（直径 3.9 m の熱よけより少し大きい）
  const sg = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
  const sm = new THREE.Mesh(sg, shock)
  sm.scale.set(2.8, 1.3, 2.8)
  sm.position.y = 0.15
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
  const sparks = new THREE.ShaderMaterial({
    vertexShader: sparkVert,
    fragmentShader: sparkFrag,
    uniforms: { uTime: { value: 0 }, uHeat: { value: 0 }, uLen: { value: 60 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const pts = new THREE.Points(pg, sparks)
  pts.frustumCulled = false
  pts.renderOrder = 7
  wm.frustumCulled = false
  sm.frustumCulled = false
  group.add(sm, wm, pts)
  return { group, shock, wake, sparks, wakeMesh: wm, dispose: () => [shock, wake, sparks, sg, wg, pg].forEach((o) => o.dispose()) }
}

/** 毎フレーム：熱の強さと時間 */
export function updateFireball(f: Fireball, heat: number, time: number) {
  f.group.visible = heat > 0.01
  f.shock.uniforms.uHeat.value = Math.min(1, heat * 1.3)
  f.wake.uniforms.uHeat.value = heat
  f.sparks.uniforms.uHeat.value = Math.min(1, heat * 1.5)
  f.shock.uniforms.uTime.value = time
  f.wake.uniforms.uTime.value = time
  f.sparks.uniforms.uTime.value = time
  // 熱いほど尾は長い（最大 140 m）
  f.wakeMesh.scale.set(1, 20 + heat * 120, 1)
  f.sparks.uniforms.uLen.value = 25 + heat * 70
}
