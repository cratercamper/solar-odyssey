import * as THREE from 'three'

// 章8 の終わりの、海と空（components/moonMission/ReturnWorld.tsx）：太平洋の波・空の青・貿易風の積雲・回収船・パラシュート。
// 宇宙船のまわりの座標（宇宙船が原点、海面は y = -高さ）で使う。どれも画像ファイルなし（その場で作る）

// ---- 海 ----------------------------------------------------------------------------------------

const oceanVert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vPw;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPw = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }
`

const oceanFrag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uSun;
  uniform float uTime;
  uniform vec2 uOffset;
  uniform float uAlpha;
  uniform vec3 uHaze;
  varying vec3 vPw;
  // 波：向きと長さのちがう波を重ねる（傾きだけ。遠い所は細かい波を消す）
  vec2 wave(vec2 p, vec2 d, float len, float amp, float speed) {
    float k = 6.2831 / len;
    float ph = dot(p, d) * k - uTime * speed * k;
    return d * cos(ph) * amp * k;
  }
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = vPw.xz + uOffset;
    float dist = length(cameraPosition - vPw);
    // 遠い所の細かい波は、画面の 1 画素より小さくなってちらつくので消す（斜めに見るほど早く）
    float graze = max(0.08, abs(normalize(cameraPosition - vPw).y));
    float fine = clamp(1.0 - dist / (2500.0 + 9000.0 * graze), 0.0, 1.0);
    float mid = clamp(1.0 - dist / (6000.0 + 40000.0 * graze), 0.0, 1.0);
    vec2 s = vec2(0.0);
    s += wave(p, normalize(vec2(1.0, 0.35)), 180.0, 2.2, 14.0) * mid;
    s += wave(p, normalize(vec2(0.7, -0.6)), 95.0, 1.0, 10.0) * mid;
    s += wave(p, normalize(vec2(-0.2, 1.0)), 41.0, 0.45, 7.0) * fine;
    s += wave(p, normalize(vec2(0.9, 0.9)), 17.0, 0.16, 4.5) * fine;
    s += wave(p, normalize(vec2(-0.8, 0.3)), 7.0, 0.06, 3.0) * fine;
    vec3 n = normalize(vec3(-s.x, 1.0, -s.y));
    vec3 v = normalize(cameraPosition - vPw);
    float fres = 0.02 + 0.98 * pow(1.0 - max(0.0, dot(n, v)), 5.0);
    vec3 r = reflect(-v, n);
    vec3 sky = mix(vec3(0.55, 0.69, 0.84), vec3(0.16, 0.38, 0.72), clamp(r.y * 4.0, 0.0, 1.0));
    // 低い所から斜めに見ても、海が空の色一色にならないように（本物は波の陰で暗い所がまじる）
    fres = min(fres, 0.55 + 0.45 * smoothstep(0.0, 1.0, dist / 9000.0));
    vec3 deep = vec3(0.015, 0.13, 0.27);
    // 太陽の照り返し（波の面ごとにきらきら）
    float glint = pow(max(0.0, dot(r, uSun)), 4000.0) * 1.6 + pow(max(0.0, dot(r, uSun)), 80.0) * 0.08;
    vec3 col = mix(deep * (0.55 + 0.45 * max(0.0, uSun.y)), sky, fres) + vec3(1.0, 0.95, 0.85) * glint * max(0.0, uSun.y);
    // 遠くはかすむ（水平線は空の色）
    float haze = 1.0 - exp(-dist / 70000.0);
    col = mix(col, uHaze, haze);
    gl_FragColor = vec4(col, uAlpha);
  }
`

export function oceanMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: oceanVert,
    fragmentShader: oceanFrag,
    uniforms: {
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uTime: { value: 0 },
      uOffset: { value: new THREE.Vector2() },
      uAlpha: { value: 1 },
      uHaze: { value: new THREE.Color(0.7, 0.8, 0.9) },
    },
    transparent: true,
    depthWrite: true,
  })
}

/** 着水の泡：まん中が白く、ふちへ消える */
export function foamTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(64, 64, 6, 64, 64, 64)
  grd.addColorStop(0, 'rgba(255,255,255,0.9)')
  grd.addColorStop(0.5, 'rgba(240,248,250,0.5)')
  grd.addColorStop(1, 'rgba(240,248,250,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  // まだらに
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(0,0,0,${0.2 + Math.random() * 0.5})`
    g.beginPath()
    g.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 7, 0, Math.PI * 2)
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---- 空 ----------------------------------------------------------------------------------------

const skyVert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 w = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }
`

const skyFrag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uSun;
  uniform float uAlpha;
  uniform float uHigh;
  varying vec3 vDir;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 d = normalize(vDir);
    float up = clamp(d.y, -0.2, 1.0);
    // 高い所ほど、空の上は暗い紺
    vec3 zenith = mix(vec3(0.13, 0.36, 0.75), vec3(0.01, 0.03, 0.12), uHigh);
    vec3 horizon = mix(vec3(0.72, 0.83, 0.94), vec3(0.35, 0.55, 0.85), uHigh);
    vec3 col = mix(horizon, zenith, pow(max(0.0, up), 0.55));
    col = mix(col, vec3(0.62, 0.72, 0.82), smoothstep(0.02, -0.12, d.y));
    float sd = max(0.0, dot(d, uSun));
    col += vec3(1.0, 0.92, 0.75) * (smoothstep(0.99996, 0.99999, sd) * 12.0 + pow(sd, 3000.0) * 3.0 + pow(sd, 60.0) * 0.3 + pow(sd, 6.0) * 0.12);
    // 宇宙に近い高さでは黒（ふたつの空を、色でまぜる）
    gl_FragColor = vec4(col * uAlpha, 1.0);
  }
`

export function skyMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uAlpha: { value: 1 }, uHigh: { value: 0 } },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  })
}

// ---- 雲（貿易風の積雲） --------------------------------------------------------------------------

function cloudTexture(seed: number) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  // やわらかい丸をいくつも重ねる。下は平ら
  for (let i = 0; i < 26; i++) {
    const x = 40 + rnd() * 176
    const top = 22 + Math.abs(x - 128) * 0.45
    const y = top + rnd() * (100 - top)
    const r = 16 + rnd() * 30 * (1 - Math.abs(x - 128) / 180)
    const grd = g.createRadialGradient(x, y - r * 0.2, 0, x, y, r)
    const sh = 0.82 + (1 - y / 128) * 0.18
    grd.addColorStop(0, `rgba(${Math.round(255 * sh)},${Math.round(255 * sh)},${Math.round(255 * sh)},0.95)`)
    grd.addColorStop(0.6, `rgba(${Math.round(235 * sh)},${Math.round(240 * sh)},${Math.round(248 * sh)},0.6)`)
    grd.addColorStop(1, 'rgba(220,228,240,0)')
    g.fillStyle = grd
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  // 底を平らに切る
  const fade = g.createLinearGradient(0, 96, 0, 112)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(1, 'rgba(0,0,0,1)')
  g.globalCompositeOperation = 'destination-out'
  g.fillStyle = fade
  g.fillRect(0, 96, 256, 32)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function makeClouds(n = 70) {
  const g = new THREE.Group()
  g.name = 'return-clouds'
  const texes = [1, 7, 13, 29].map(cloudTexture)
  const mats = texes.map((map) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false }))
  let s = 42
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(mats[i % mats.length])
    const size = 500 + rnd() * 1400
    sp.scale.set(size * 2, size, 1)
    const a = rnd() * Math.PI * 2
    const r = 1500 + Math.pow(rnd(), 0.7) * 38_000
    sp.position.set(Math.cos(a) * r, 900 + rnd() * 900 + size * 0.35, Math.sin(a) * r)
    sp.renderOrder = -1
    g.add(sp)
  }
  return { group: g, dispose: () => (texes.forEach((t) => t.dispose()), mats.forEach((m) => m.dispose())) }
}

// ---- 回収船（航空母艦タイコンデロガ。全長 270 m） --------------------------------------------------

export function makeShip() {
  const g = new THREE.Group()
  g.name = 'return-ship'
  const grey = new THREE.MeshStandardMaterial({ color: '#7d858c', roughness: 0.75, metalness: 0.2 })
  const deck = new THREE.MeshStandardMaterial({ color: '#4a4f55', roughness: 0.9 })
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.8 })
  // 船体：へさきを細く
  const hull = new THREE.BoxGeometry(250, 16, 28, 10, 1, 1)
  const p = hull.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    if (x > 60) p.setZ(i, p.getZ(i) * (1 - ((x - 60) / 65) ** 2 * 0.85))
    if (p.getY(i) < 0) p.setZ(i, p.getZ(i) * 0.8)
  }
  hull.computeVertexNormals()
  const h = new THREE.Mesh(hull, grey)
  h.position.y = 2
  const fd = new THREE.Mesh(new THREE.BoxGeometry(268, 1.5, 36), deck)
  fd.position.set(4, 11, -2)
  const island = new THREE.Mesh(new THREE.BoxGeometry(34, 14, 7), grey)
  island.position.set(10, 19, 15)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 16, 6), dark)
  mast.position.set(12, 34, 15)
  const stack = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 6), dark)
  stack.position.set(0, 29, 15)
  g.add(h, fd, island, mast, stack)
  const owned = [hull, fd.geometry, island.geometry, mast.geometry, stack.geometry, grey, deck, dark]
  return { group: g, dispose: () => owned.forEach((o) => o.dispose()) }
}

// ---- パラシュート -------------------------------------------------------------------------------

/** 布の模様：主パラシュートはオレンジと白のひだ（リングセイル）、ドローグは白とオレンジの帯 */
function canopyTexture(kind: 'main' | 'drogue') {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')!
  const gores = kind === 'main' ? 34 : 16
  for (let i = 0; i < gores; i++) {
    g.fillStyle = i % 2 === 0 ? '#f0f0ea' : '#e8642c'
    g.fillRect((i * 512) / gores, 0, 512 / gores + 1, 128)
  }
  if (kind === 'main') {
    // リングセイル：輪のすきま（うっすら暗い線）
    g.fillStyle = 'rgba(20,20,30,0.35)'
    for (const v of [0.28, 0.46, 0.62, 0.76, 0.88]) g.fillRect(0, v * 128, 512, 2)
  } else {
    g.fillStyle = 'rgba(20,20,30,0.3)'
    for (let v = 0.2; v < 1; v += 0.13) g.fillRect(0, v * 128, 512, 1.5)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  return t
}

export type Chute = {
  /** 吊りひもの集まる所（司令船のてっぺんの上）が原点、+Y が上（空へ） */
  group: THREE.Group
  canopy: THREE.Mesh
  lines: THREE.LineSegments
  radius: number
  height: number
  length: number
  dispose: () => void
}

/** 半径 radius、ひもの長さ length のパラシュート。canopy の底のふちが、原点から length 上 */
export function makeChute(kind: 'main' | 'drogue'): Chute {
  const radius = kind === 'main' ? 12.7 : 2.5
  const height = radius * (kind === 'main' ? 0.62 : 0.75)
  const length = kind === 'main' ? 30 : 12
  const pts: THREE.Vector2[] = []
  const N = 14
  for (let i = 0; i <= N; i++) {
    const a = 0.06 + (i / N) * (Math.PI / 2 - 0.12)
    pts.push(new THREE.Vector2(Math.sin(a) * radius, Math.cos(a) * height))
  }
  const geo = new THREE.LatheGeometry(pts, kind === 'main' ? 48 : 24)
  const tex = canopyTexture(kind)
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.06, emissiveMap: tex })
  const canopy = new THREE.Mesh(geo, mat)
  canopy.position.y = length
  canopy.castShadow = false
  // 吊りひも：ふちの点から原点へ
  const M = kind === 'main' ? 24 : 12
  const lp = new Float32Array(M * 6)
  const rimY = Math.cos(Math.PI / 2 - 0.06) * height
  for (let i = 0; i < M; i++) {
    const a = (i / M) * Math.PI * 2
    lp.set([Math.cos(a) * radius * 0.985, length + rimY, Math.sin(a) * radius * 0.985, 0, 0, 0], i * 6)
  }
  const lg = new THREE.BufferGeometry()
  lg.setAttribute('position', new THREE.BufferAttribute(lp, 3))
  const lm = new THREE.LineBasicMaterial({ color: '#d8d4c8', transparent: true, opacity: 0.55 })
  const lines = new THREE.LineSegments(lg, lm)
  const group = new THREE.Group()
  group.add(canopy, lines)
  return { group, canopy, lines, radius, height, length, dispose: () => [geo, tex, mat, lg, lm].forEach((o) => o.dispose()) }
}

/** 開き具合（0 たたんだ・reef すぼめた・1 いっぱい）で形を変える */
export function shapeChute(c: Chute, open: number, breathe: number) {
  const k = Math.max(0.02, open)
  // すぼめているあいだは細長く
  c.canopy.scale.set(k * (1 + breathe * 0.03), 1 + (1 - k) * 0.6 - breathe * 0.04, k * (1 + breathe * 0.03))
  c.lines.scale.set(k, 1, k)
}
