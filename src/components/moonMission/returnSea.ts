import * as THREE from 'three'
import { SCATTER_CHUNK } from './earth'
import { CLOUD_GLSL, CLOUD_HIGH, SKY_LUT_GLSL, cloudUniforms, type CloudQuality, type SkyLut } from './returnSky'
import { OUT_CHUNK } from './shaderOut'

// 章9 の終わりの、海（components/moonMission/ReturnWorld.tsx）：太平洋の波・回収船・パラシュート。空と雲は returnSky.ts。
// 宇宙船のまわりの座標（宇宙船が原点、海面は y = -高さ）で使う。どれも画像ファイルなし（その場で作る）

// ---- 海 ----------------------------------------------------------------------------------------

const oceanVert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uR;
  varying vec3 vPw;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    // 地球は丸い：遠くの海ほど下がる（d² / 2R）。高い所から見ても、水平線が本物の位置（少し下）になる
    vec2 dxz = w.xz - cameraPosition.xz;
    w.y -= dot(dxz, dxz) / (2.0 * uR);
    vPw = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }
`

// 波の成分：風（貿易風、約 6 m/s）の向きのまわりに、長さのちがう波を、向き・位相をばらばらにして重ねる。
// 長い波ほど風の向きにそろい、短い波ほど向きが散らばる。速さは深い海の波の速さ（√(g × 長さ / 2π)）。
// ほかに、遠くの嵐から来るうねり（長さ 220 m）を 1 本。決まった乱数で作るので、毎回同じ海
function waveCalls() {
  let seed = 17
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const wind = Math.atan2(0.35, 1)
  const calls: string[] = []
  const add = (len: number, ang: number, sl: number) => {
    const amp = (sl * len) / (2 * Math.PI)
    const speed = 1.249 * Math.sqrt(len)
    calls.push(`s += wave(p, vec2(${Math.cos(ang).toFixed(4)}, ${Math.sin(ang).toFixed(4)}), ${len.toFixed(3)}, ${amp.toFixed(4)}, ${speed.toFixed(3)}, ${(rnd() * 6.2831).toFixed(3)});`)
  }
  add(220, wind + 0.9, 0.022)
  const N = 26
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1)
    const len = 150 * Math.pow(0.36 / 150, x) * (0.9 + rnd() * 0.2)
    const spread = 0.35 + 0.9 * x
    // 長い波は少し険しく、短い波はゆるく（描く波の傾きの散らばりの合計 ≈ 0.026）
    const sl = 0.052 - 0.014 * x
    add(len, wind + (rnd() * 2 - 1) * spread, sl)
  }
  return calls.join('\n    ')
}

const oceanFrag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uSun;
  uniform float uTime;
  uniform vec2 uOffset;
  uniform float uAlpha;
  uniform vec4 uSplash; // 着水の泡：xy 海の上の位置、z 着水してからの秒（負ならなし）、w 強さ
  ${SCATTER_CHUNK}
  ${SKY_LUT_GLSL}
  ${CLOUD_GLSL}
  varying vec3 vPw;
  // 波：向きと長さのちがう波を重ねる（傾きだけ）。
  // 1 画素より細かくなった波は、形を描かずに「面のざらつき」（照り返しの広がり σ²）へ移す。
  // 遠くや高い所から見た海が、規則正しい点の模様にならず、本物のように、ぼんやり広い照り返しになる
  float gFp;
  float gS2;
  // 白波用：長い波の高さの合計と、そのばらつき（標準偏差の 2 乗）
  float gH;
  float gHv;
  float hash2(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 q) {
    vec2 i = floor(q), f = fract(q);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  vec2 wave(vec2 p, vec2 d, float len, float amp, float speed, float ph0) {
    float k = 6.2831 / len;
    float ph = dot(p, d) * k - uTime * speed * k + ph0;
    float f = 1.0 - smoothstep(len / 14.0, len / 5.0, gFp);
    float sl = amp * k;
    gS2 += (1.0 - f * f) * sl * sl * 0.5;
    if (len > 2.0 && len < 18.0) {
      gH += sin(ph) * amp * f;
      gHv += amp * amp * 0.5;
    }
    return d * cos(ph) * sl * f;
  }
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = vPw.xz + uOffset;
    float dist = length(cameraPosition - vPw);
    // 本当の水平線より上には描かない（平らな板の海は、丸い地球の水平線より上までのびて、空をかくしてしまう）
    {
      vec3 oc = cameraPosition - uCenter;
      vec3 rd = normalize(vPw - cameraPosition);
      float b = dot(oc, rd);
      if (b > 0.0 || b * b - (dot(oc, oc) - uR * uR) < 0.0) discard;
    }
    // 1 画素が海の上で何 m か（斜めに見るほど長い）
    vec2 fw = fwidth(vPw.xz);
    gFp = max(fw.x, fw.y);
    // 描く波より細かい、さざ波の分（風 5 m/s の海の傾きの散らばりは σ² ≈ 0.03。Cox & Munk 1954。描く波で約 0.027）
    gS2 = 0.004;
    gH = 0.0;
    gHv = 1e-6;
    vec2 s = vec2(0.0);
    ${waveCalls()}
    // 丸い海面の傾き（遠くの海は、こちらへ少し傾いて見える）＋ 波の傾き
    vec2 cur = (vPw.xz - cameraPosition.xz) / uR;
    vec3 n = normalize(vec3(-s.x - cur.x, 1.0, -s.y - cur.y));
    // 風の強い所・弱い所（風のむら、油膜のような静かな筋）：海の面のざらつきが場所でちがう。
    // 上から見た照り返しが、一様な白いもやではなく、まだらや筋になる
    vec2 pw = vec2(p.x * 0.8 + p.y * 0.6, -p.x * 0.6 + p.y * 0.8);
    float wn = vnoise(pw / vec2(2600.0, 900.0)) * 0.6 + vnoise(pw / vec2(700.0, 260.0)) * 0.4;
    gS2 *= mix(0.35, 1.6, wn);
    vec3 v = normalize(cameraPosition - vPw);
    float nv = max(0.02, dot(n, v));
    float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
    // 低い所から斜めに見ても、海が空の映りこみ一色にならないように（本物は波の陰で暗い所がまじる）
    fres = min(fres, 0.7 + 0.3 * smoothstep(0.0, 1.0, dist / 9000.0));
    vec3 r = reflect(-v, n);
    r.y = abs(r.y);
    // ここからは光の量（空の表と同じ単位。大気の外の日の光の強さが π）
    // 海面に届く日の光（空気を通って、太陽が低いほど黄色く弱い）と、空からの光
    vec3 sunT = exp(-sunTau(uR + 2.0, uSun.y));
    // 雲の影
    float shade = cloudShadow(vPw.xz, uSun);
    vec3 eSun = 3.14159 * sunT * max(0.0, uSun.y) * shade;
    vec3 eSky = 3.14159 * skyIn(vec3(0.0, 1.0, 0.0)) * 0.9;
    // 映りこむ空（本当の空の表から）
    vec3 refl = skyIn(r) * fres;
    // 海の中からもどる光：外洋の深い青（反射率 数 %）
    vec3 body = vec3(0.004, 0.018, 0.04) * (1.0 - fres) * (eSun + eSky) / 3.14159;
    // 太陽の照り返し：波の面ごとのきらめき（画素より細かい波の傾きの散らばり σ²：細かいさざ波 ＋ 描かなかった波）
    vec3 hv = normalize(uSun + v);
    float nh = max(1e-3, dot(n, hv));
    float S2 = gS2;
    float t2 = (1.0 - nh * nh) / (nh * nh);
    float D = exp(-t2 / S2) / (3.14159 * S2 * nh * nh * nh * nh);
    float Fs = 0.02 + 0.98 * pow(1.0 - max(0.0, dot(hv, v)), 5.0);
    vec3 glint = 3.14159 * sunT * Fs * D / (4.0 * nv) * step(0.0, uSun.y) * shade;
    vec3 surf = refl + body + glint;
    // 白波：波の山が重なって高くなった所で、風の強い所ほど砕ける（風 6 m/s で海の 1〜2 %）。
    // 泡の形は、細かいまだら。泡の面は白い紙のように光を散らす（新しい泡の反射率 約 0.8）
    float z = gH / sqrt(gHv);
    float foamN = vnoise(p * 0.9 + vec2(uTime * 0.6, 0.0)) * 0.6 + vnoise(p * 2.7 - vec2(0.0, uTime * 0.4)) * 0.4;
    float cap = smoothstep(1.75, 2.05, z + (wn - 0.5) * 1.2) * smoothstep(0.42, 0.62, foamN);
    // 遠くで白波が画素より小さくなったら、平均の明るさ（少しだけ白っぽい）として足す
    float res = 1.0 - smoothstep(0.5, 3.0, gFp);
    float foam = cap * res + (1.0 - res) * 0.012 * mix(0.3, 1.7, wn);
    // 着水の泡：司令船のまわりに広がる白い輪（はじめは濃く、だんだんまばらに、うすく）
    if (uSplash.z >= 0.0) {
      float rr = length(vPw.xz - uSplash.xy);
      float R = 3.0 + 5.0 * (1.0 - exp(-uSplash.z / 4.0)) + uSplash.z * 0.05;
      float ring = smoothstep(R + 2.0, R - 1.0, rr) * (0.55 + 0.45 * smoothstep(R * 0.2, R * 0.9, rr));
      float age = exp(-uSplash.z / 20.0);
      float bubbles = smoothstep(0.4 + 0.4 * (1.0 - age) + 0.15 * rr / R, 0.85, vnoise(vPw.xz * 1.6) * 0.65 + vnoise(vPw.xz * 4.0) * 0.35);
      foam = max(foam, ring * bubbles * uSplash.w * mix(0.2, 0.9, age));
    }
    vec3 foamL = 0.8 * (eSun * max(0.0, dot(n, uSun)) / max(0.05, uSun.y) + eSky) / 3.14159;
    surf = mix(surf, foamL, clamp(foam, 0.0, 1.0));
    // 目までの空気：遠くの海ほど、かすんで空にとける（同じ向きの空の表の値）
    vec3 vd = -v;
    vec3 L = surf * skyTrans(vd) + skyIn(vd);
    // 目と海のあいだの雲（上から見下ろすとき、雲の上の面が日に照らされて白い）
    vec4 cl = cloudMarch(vec3(cameraPosition.x, cameraPosition.y + uSeaH, cameraPosition.z), vd, dist, uSun, 3.14159 * sunT, eSky, skyIn(vd), fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))));
    L = L * cl.a + cl.rgb;
    glint *= cl.a;
    vec3 col = expose(L);
    // まぶしい照り返しは画面の白より明るく（光のにじみが出る）
    col += max(vec3(0.0), glint * skyTrans(vd) - 1.5) * 0.08;
    gl_FragColor = vec4(col, uAlpha);
    ${OUT_CHUNK}
  }
`

/** 海。空の表（SkyLut）を使う：映りこむ空と、遠くのかすみは、空と同じ計算から */
export function oceanMaterial(lut: SkyLut, radius: number, cloud: CloudQuality = CLOUD_HIGH) {
  const m = new THREE.ShaderMaterial({
    vertexShader: oceanVert,
    fragmentShader: oceanFrag,
    defines: { SCATTER_N: 2, CLOUD_N: cloud.steps, CLOUD_LIGHT: cloud.light },
    uniforms: {
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uTime: { value: 0 },
      uOffset: { value: new THREE.Vector2() },
      uAlpha: { value: 1 },
      uSplash: { value: new THREE.Vector4(0, 0, -1, 0) },
      ...cloudUniforms(),
      uR: { value: radius },
      uCenter: { value: new THREE.Vector3() },
    },
    transparent: true,
    depthWrite: true,
  })
  lut.bind(m)
  return m
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
  // 布は日の光で影を落とし、ほかの傘の影も受ける
  canopy.castShadow = canopy.receiveShadow = true
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
