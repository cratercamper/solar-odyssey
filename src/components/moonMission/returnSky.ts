import * as THREE from 'three'
import { SCATTER_CHUNK } from './earth'
import { OUT_CHUNK } from './shaderOut'

// 章9 の大気の中の空（components/moonMission/ReturnWorld.tsx）。
//
// 前は、空も海に映る空も、高さだけで決めた 2 色のぼかしだった（太陽の向きで変わらない、高さ 30 km でも灰色がかった青）。
// ここでは、宇宙から見た地球と同じ光の散乱の計算（earth.ts の SCATTER_CHUNK）で、カメラの高さと太陽の向きから空を求める。
// 計算は重いので、全方向の空を小さな絵（空の表：横 256 × 縦 128）に描いておき、空・海・映りこみがそれを引く。
// 高さか太陽の向きが少し変わったときだけ描きなおす。
//
// 表は 2 枚：目に入る散乱の光（inScatter）と、その向きの空気の透過（trans）。下向きは海面までの値なので、
// 海の色 × 透過 + 散乱の光 で、遠くの海がかすんで空にとける（本物の水平線と同じ理由で）。
// 座標：y が真上（カメラの真下が地球の中心）。

const LUT_W = 256
const LUT_H = 128

/** 向き → 表の位置。縦は地平線の近くを細かく（高さの角の平方根） */
export const SKY_LUT_GLSL = /* glsl */ `
  uniform sampler2D uSkyS;
  uniform sampler2D uSkyT;
  vec2 skyUv(vec3 d) {
    float u = atan(d.z, d.x) / 6.2831853 + 0.5;
    float e = asin(clamp(d.y, -1.0, 1.0)) / 1.5707963;
    float v = 0.5 + 0.5 * sign(e) * sqrt(abs(e));
    return vec2(u, clamp(v, 0.5 / ${LUT_H}.0, 1.0 - 0.5 / ${LUT_H}.0));
  }
  vec3 skyIn(vec3 d) { return texture2D(uSkyS, skyUv(d)).rgb; }
  vec3 skyTrans(vec3 d) { return texture2D(uSkyT, skyUv(d)).rgb; }
`

const lutVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const lutFrag = /* glsl */ `
  uniform vec3 uSun;
  uniform float uH;
  ${SCATTER_CHUNK}
  varying vec2 vUv;
  void main() {
    float phi = (vUv.x - 0.5) * 6.2831853;
    float s = vUv.y * 2.0 - 1.0;
    float e = sign(s) * s * s * 1.5707963;
    vec3 d = vec3(cos(e) * cos(phi), sin(e), cos(e) * sin(phi));
    vec3 ro = vec3(0.0, uR + uH, 0.0);
    // 海面（球）に当たる所まで。当たらなければ大気の外まで
    float b = dot(ro, d);
    float c = dot(ro, ro) - uR * uR;
    float disc = b * b - c;
    float tHit = disc > 0.0 && -b - sqrt(disc) > 0.0 ? -b - sqrt(disc) : 1e12;
    vec3 trans;
    vec3 inS = scatter(ro, d, tHit, uSun, trans);
    #ifdef SKY_TRANS
    gl_FragColor = vec4(trans, 1.0);
    #else
    gl_FragColor = vec4(inS, 1.0);
    #endif
  }
`

/** 空の表。update() で、高さ（m）と太陽の向き（y が真上）から描きなおす */
export class SkyLut {
  inScatter: THREE.WebGLRenderTarget
  trans: THREE.WebGLRenderTarget
  private matS: THREE.ShaderMaterial
  private matT: THREE.ShaderMaterial
  private quad: THREE.Mesh
  private scene = new THREE.Scene()
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private lastH = -1
  private lastSun = new THREE.Vector3()

  constructor(radius: number, steps: number) {
    const opt = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false }
    this.inScatter = new THREE.WebGLRenderTarget(LUT_W, LUT_H, opt)
    this.trans = new THREE.WebGLRenderTarget(LUT_W, LUT_H, opt)
    // 横（向きの角）は一周つながる
    for (const t of [this.inScatter.texture, this.trans.texture]) t.wrapS = THREE.RepeatWrapping
    const make = (trans: boolean) =>
      new THREE.ShaderMaterial({
        vertexShader: lutVert,
        fragmentShader: lutFrag,
        defines: { SCATTER_N: steps, SCATTER_MS: '0.45', ...(trans ? { SKY_TRANS: '' } : {}) },
        uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uH: { value: 0 }, uR: { value: radius }, uCenter: { value: new THREE.Vector3() } },
        depthTest: false,
        depthWrite: false,
      })
    this.matS = make(false)
    this.matT = make(true)
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matS)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  /** 高さが 1% か 20 m、太陽が 0.3° 以上かわったら描きなおす。描きなおしたら true */
  update(gl: THREE.WebGLRenderer, h: number, sun: THREE.Vector3) {
    const hh = Math.max(0, h)
    if (this.lastH >= 0 && Math.abs(hh - this.lastH) < Math.max(20, this.lastH * 0.01) && this.lastSun.angleTo(sun) < 0.005) return false
    this.lastH = hh
    this.lastSun.copy(sun)
    const prev = gl.getRenderTarget()
    for (const [m, rt] of [
      [this.matS, this.inScatter],
      [this.matT, this.trans],
    ] as const) {
      m.uniforms.uH.value = hh
      m.uniforms.uSun.value.copy(sun).normalize()
      this.quad.material = m
      gl.setRenderTarget(rt)
      gl.render(this.scene, this.cam)
    }
    gl.setRenderTarget(prev)
    return true
  }

  /** 空・海の素材に、この表を渡す */
  bind(m: THREE.ShaderMaterial) {
    m.uniforms.uSkyS = { value: this.inScatter.texture }
    m.uniforms.uSkyT = { value: this.trans.texture }
  }

  dispose() {
    this.inScatter.dispose()
    this.trans.dispose()
    this.matS.dispose()
    this.matT.dispose()
    this.quad.geometry.dispose()
  }
}

// ---- 雲（貿易風の積雲の層。光線をたどって描く） -------------------------------------------------------
//
// 前は、丸をかさねた絵（板）を 70 枚立てていた：太陽の向きで明るさが変わらず、上から見ると紙のよう、海に影も落ちなかった。
// ここでは、高さ 650 m〜2.1 km の層の中に、場所ごとの雲の柱（下が平らで上がもこもこ）を決め、目からの光線で通り抜けながら、
// 日の光（雲の上の方ほど明るく、太陽と反対の側の底は暗い）と空の光で照らす。空・海の両方の素材がこれを使い、海には影も落とす。
// 座標：x, z は世界の座標、高さは海面から（世界の y + uSeaH）。

// なめらかな乱数の表：格子の点に乱数を置き、あいだを なめらかに（3 次の式で）つなぐ。端と端がつながる（くり返せる）。
// 2 次元：32 × 32 の格子を 256 × 256 に。3 次元：16 × 16 × 16 の格子を 64 × 64 × 64 に。一度だけ作って使い回す
const N2_CELLS = 32
const N3_CELLS = 16
let noiseTex: { n2: THREE.DataTexture; n3: THREE.Data3DTexture; d2: Uint8Array } | null = null
function cloudNoise() {
  if (noiseTex) return noiseTex
  let seed = 913
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const sm = (f: number) => f * f * (3 - 2 * f)
  const g2 = Array.from({ length: N2_CELLS * N2_CELLS }, rnd)
  const S2 = 256
  const d2 = new Uint8Array(S2 * S2)
  for (let y = 0; y < S2; y++)
    for (let x = 0; x < S2; x++) {
      const fx = (x / S2) * N2_CELLS, fy = (y / S2) * N2_CELLS
      const ix = Math.floor(fx), iy = Math.floor(fy)
      const tx = sm(fx - ix), ty = sm(fy - iy)
      const at = (i: number, j: number) => g2[(j % N2_CELLS) * N2_CELLS + (i % N2_CELLS)]
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx
      const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx
      d2[y * S2 + x] = Math.round((a + (b - a) * ty) * 255)
    }
  const n2 = new THREE.DataTexture(d2, S2, S2, THREE.RedFormat, THREE.UnsignedByteType)
  n2.wrapS = n2.wrapT = THREE.RepeatWrapping
  n2.magFilter = n2.minFilter = THREE.LinearFilter
  n2.needsUpdate = true
  const N = N3_CELLS
  const g3 = Array.from({ length: N * N * N }, rnd)
  const S3 = 64
  const d3 = new Uint8Array(S3 * S3 * S3)
  const at3 = (i: number, j: number, k: number) => g3[((k % N) * N + (j % N)) * N + (i % N)]
  for (let z = 0; z < S3; z++)
    for (let y = 0; y < S3; y++)
      for (let x = 0; x < S3; x++) {
        const fx = (x / S3) * N, fy = (y / S3) * N, fz = (z / S3) * N
        const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz)
        const tx = sm(fx - ix), ty = sm(fy - iy), tz = sm(fz - iz)
        const l = (j: number, k: number) => at3(ix, j, k) + (at3(ix + 1, j, k) - at3(ix, j, k)) * tx
        const p0 = l(iy, iz) + (l(iy + 1, iz) - l(iy, iz)) * ty
        const p1 = l(iy, iz + 1) + (l(iy + 1, iz + 1) - l(iy, iz + 1)) * ty
        d3[(z * S3 + y) * S3 + x] = Math.round((p0 + (p1 - p0) * tz) * 255)
      }
  const n3 = new THREE.Data3DTexture(d3, S3, S3, S3)
  n3.format = THREE.RedFormat
  n3.type = THREE.UnsignedByteType
  n3.wrapS = n3.wrapT = n3.wrapR = THREE.RepeatWrapping
  n3.magFilter = n3.minFilter = THREE.LinearFilter
  n3.unpackAlignment = 1
  n3.needsUpdate = true
  noiseTex = { n2, n3, d2 }
  return noiseTex
}

/** シェーダーの cNoise と同じ値（2 次元の表を、くり返し・なめらかに引く） */
function noise2(x: number, y: number) {
  const d = cloudNoise().d2
  const S = 256
  const u = (x / N2_CELLS) * S - 0.5
  const v = (y / N2_CELLS) * S - 0.5
  const i = Math.floor(u), j = Math.floor(v)
  const fu = u - i, fv = v - j
  const at = (a: number, b: number) => d[(((b % S) + S) % S) * S + (((a % S) + S) % S)] / 255
  const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fu
  const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fu
  return a + (b - a) * fv
}
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
/** シェーダーの cCover と同じ雲の強さ（0〜1） */
export function cloudCover(x: number, z: number, off: THREE.Vector2) {
  const qx = (x + off.x) / 1500, qz = (z + off.y) / 1500
  const n = noise2(qx, qz) * 0.55 + noise2(qx * 2.03 + 7.1, qz * 2.03 + 7.1) * 0.28 + noise2(qx * 4.1 + 3.3, qz * 4.1 + 3.3) * 0.17
  const m = noise2(qx * 0.031 + 3.7, qz * 0.031 + 3.7) * 0.6 + noise2(qx * 0.0127 + 11.3, qz * 0.0127 + 11.3) * 0.4
  return sstep(0.42, 0.85, n + Math.min(0, m - 0.52) * 1.5)
}
/** 雲の下（海面からの高さ h）にいる船やパラシュートに、雲の影がかかる割合（1：日なた） */
export function cloudShadeAt(x: number, z: number, h: number, sun: THREE.Vector3, off: THREE.Vector2) {
  if (sun.y <= 0.02 || h > 1300) return 1
  const k = (1300 - h) / sun.y
  return 1 - 0.8 * sstep(0, 0.25, cloudCover(x + sun.x * k, z + sun.z * k, off))
}

/** 雲の多さの地図（海の上の積雲。宇宙から見た地球の球も、同じ地図を使う） */
export const CLOUD_COVER_GLSL = /* glsl */ `
  uniform vec2 uCloudOff;
  uniform float uCloudOn;
  // なめらかな乱数は、前もって作った絵（くり返す 2 次元・3 次元の表）から引く（その場で計算するより、ずっと軽い）
  uniform sampler2D uCN2;
  float cNoise(vec2 p) { return texture2D(uCN2, p / ${N2_CELLS}.0).r; }
  // 雲の強さ（0：晴れ、1：いちばん高い雲）。貿易風の積雲で、空の 2〜3 割。厚さは 1.5 km まで
  float cCover(vec2 p) {
    vec2 q = (p + uCloudOff) / 1500.0;
    float n = cNoise(q) * 0.55 + cNoise(q * 2.03 + 7.1) * 0.28 + cNoise(q * 4.1 + 3.3) * 0.17;
    // 数十〜百 km の大きなまとまり：雲の集まった所と、晴れた所（上から見ると、一面に同じ雲がならばない）。
    // 晴れる方へだけ動かす（雲の多い所でも、海の上の場面の空より雲が増えすぎないように）
    float m = cNoise(q * 0.031 + 3.7) * 0.6 + cNoise(q * 0.0127 + 11.3) * 0.4;
    return smoothstep(0.42, 0.85, n + min(0.0, m - 0.52) * 1.5) * uCloudOn;
  }
`

export const CLOUD_GLSL = /* glsl */ `
  ${CLOUD_COVER_GLSL}
  uniform float uSeaH;
  const float CB = 650.0;
  const float CT = 2100.0;
  uniform highp sampler3D uCN3;
  float cNoise3(vec3 p) { return texture(uCN3, p / ${N3_CELLS}.0).r; }
  // 雲の中の濃さ（1 m あたりの光の弱まり）。
  // 雲の多い所（cCover）ほど、高さの形（底は平ら、上へ行くほど細る）の中で、3 次元のもこもこした乱数が雲になりやすい。
  // だから一つ一つの雲は、丸いこぶの集まり（積雲の頭）になり、雲の多い所ほど高く育つ
  float cDens(vec3 pa, out float top) {
    top = CT;
    float C = cCover(pa.xz);
    if (C <= 0.0 || pa.y < CB || pa.y > CT) return 0.0;
    float hN = (pa.y - CB) / (CT - CB);
    float hs = hN / (0.35 + 0.65 * C);
    float G = smoothstep(0.0, 0.05, hN) * (1.0 - smoothstep(0.35, 1.0, hs));
    float cg = C * G;
    if (cg <= 0.0) return 0.0;
    vec3 pb = vec3(pa.x + uCloudOff.x, pa.y, pa.z + uCloudOff.y);
    float base = cNoise3(pb / 520.0) * 0.6 + cNoise3(pb / 210.0) * 0.4;
    float dd = (base - (1.0 - cg)) / cg;
    if (dd <= 0.0) return 0.0;
    // ふちを細かいこぶで削る
    dd -= cNoise3(pb / 80.0) * 0.35 * (1.0 - dd);
    return 0.06 * clamp(dd * 2.0, 0.0, 1.0);
  }
  float cHG(float g, float mu) { return (1.0 - g * g) / (12.566 * pow(1.0 + g * g - 2.0 * g * mu, 1.5)); }
  // ro：目（高さは海面から）、rd：向き、tMax：そこまで（海や地面）。haze：その向きの遠くの空の光（遠い雲はこの色にとける）。
  // 返す：rgb = 雲から目に届く光（目までの空気は入れない）、a = 雲を通りぬける光の割合
  vec4 cloudMarch(vec3 ro, vec3 rd, float tMax, vec3 sun, vec3 eSun, vec3 eSky, vec3 haze, float jit) {
    if (uCloudOn <= 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
    float t0 = 0.0, t1 = tMax;
    if (abs(rd.y) > 1e-4) {
      float ta = (CB - ro.y) / rd.y;
      float tb = (CT - ro.y) / rd.y;
      t0 = max(t0, min(ta, tb));
      t1 = min(t1, max(ta, tb));
    } else if (ro.y < CB || ro.y > CT) return vec4(0.0, 0.0, 0.0, 1.0);
    t1 = min(t1, t0 + 14000.0);
    if (t1 <= t0) return vec4(0.0, 0.0, 0.0, 1.0);
    // はじめは大きな歩幅で雲を探し、雲に入ったら一歩もどって細かく（雲の面のもこもこが、縞にならないように）
    const int N = CLOUD_N;
    float ds = (t1 - t0) / 16.0;
    float fine = 0.0;
    float mu = dot(rd, sun);
    // 前へ強く散る（太陽の近くの雲のふちが光る）＋ 少しうしろへ
    float ph = mix(cHG(0.6, mu), cHG(-0.25, mu), 0.3);
    float T = 1.0;
    vec3 L = vec3(0.0);
    float t = t0 + jit * ds;
    // 目から雲までの空気の量（雲の高さの濃さで何 m 分）：濃さは高さ 2.5 km ごとに 1/e。雲の真ん中の高さまでのまっすぐな線で。
    // 下や横から見る雲は今までどおり（1 倍まで）、高い所から見下ろす雲は、間の空気がうすいので遠くてもくっきり
    float hazeAir;
    {
      const float HH = 2500.0;
      float dy = ro.y - 0.5 * (CB + CT);
      float tc = abs(rd.y) > 1e-4 ? clamp(-dy / rd.y, t0, t1) : t0;
      hazeAir = tc * (abs(dy) > 1.0 ? min(1.0, HH * (1.0 - exp(-dy / HH)) / dy) : 1.0);
    }
    for (int i = 0; i < N; i++) {
      if (t > t1) break;
      vec3 pa = ro + rd * t;
      float top;
      float s = cDens(pa, top);
      if (s > 0.0 && fine < 0.5) {
        // 雲に当たった：ひとつ前の点とのあいだを半分ずつ分けて、雲の面を見つけ、そこから細かい歩幅で
        //（面から同じ間かくで点を取るので、雲の面に縞が出ない）
        fine = 1.0;
        float lo = max(t0, t - ds), hi = t;
        for (int b = 0; b < 5; b++) {
          float mid = 0.5 * (lo + hi);
          float tq;
          if (cDens(ro + rd * mid, tq) > 0.0) hi = mid; else lo = mid;
        }
        ds = clamp(ds * 0.06, 15.0, 70.0);
        t = hi + ds * 0.5;
        continue;
      }
      if (s > 0.0) {
        // 日の光：ここから太陽の方へ、3 点で雲の量をはかる（太陽の側のこぶは明るく、反対の側は暗い）。
        // 何度も散る光があるので、弱まりは 1 回の散乱より少なめ（2 つの重みで足す）
        float od = 0.0;
        float tp;
        od += cDens(pa + sun * 50.0, tp) * 100.0;
        #if CLOUD_LIGHT > 1
        od += cDens(pa + sun * 170.0, tp) * 160.0;
        #endif
        #if CLOUD_LIGHT > 2
        od += cDens(pa + sun * 420.0, tp) * 340.0;
        #else
        od *= 1.0 + float(3 - CLOUD_LIGHT) * 1.2;
        #endif
        float Ts = exp(-od) * 0.5 + exp(-od * 0.15) * 0.5;
        float hh = clamp((pa.y - CB) / (CT - CB) * 1.6, 0.0, 1.0);
        vec3 lit = eSun * Ts * (ph + 0.2) + eSky / 3.14159 * mix(0.8, 1.4, hh) + eSun * 0.04;
        float a = 1.0 - exp(-s * ds);
        // 遠くの雲は、間の空気で空の色にとける。空気の量は高さで減る（高い所から見下ろす雲は、遠くてもくっきり）
        L += T * a * mix(lit, haze, 1.0 - exp(-hazeAir / 20000.0));
        T *= 1.0 - a;
        if (T < 0.02) break;
      }
      t += ds;
    }
    return vec4(L, T);
  }
  // 雲の影：海面の点から太陽へ向かう線が、雲の真ん中の高さで通る所の雲の強さ
  float cloudShadow(vec2 xz, vec3 sun) {
    if (uCloudOn <= 0.0 || sun.y <= 0.02) return 1.0;
    vec2 q = xz + sun.xz / sun.y * 1300.0;
    float k = cCover(q);
    return 1.0 - 0.8 * smoothstep(0.0, 0.25, k);
  }
`

/** 雲の細かさ：光線の歩数と、日の光の弱まりをはかる点の数（画質で減らす） */
export type CloudQuality = { steps: number; light: number }
export const CLOUD_HIGH: CloudQuality = { steps: 44, light: 3 }
export function cloudQuality(level: string, small: boolean): CloudQuality {
  if (small || level === 'low') return { steps: 22, light: 1 }
  if (level === 'medium') return { steps: 32, light: 2 }
  return CLOUD_HIGH
}

/** 雲の uniform（空と海の素材で、同じ値を書く） */
export function cloudUniforms() {
  const n = cloudNoise()
  return { uSeaH: { value: 0 }, uCloudOff: { value: new THREE.Vector2() }, uCloudOn: { value: 1 }, uCN2: { value: n.n2 }, uCN3: { value: n.n3 } }
}

// ---- 空のドーム（カメラを囲む） -----------------------------------------------------------------

const domeVert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`

const domeFrag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uSun;
  uniform float uAlpha;
  const float EXPO = 2.2;
  vec3 expose(vec3 L) { return pow(1.0 - exp(-EXPO * L), vec3(1.0 / 2.2)); }
  ${SKY_LUT_GLSL}
  ${CLOUD_GLSL}
  varying vec3 vDir;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 d = normalize(vDir);
    vec3 sky = skyIn(d);
    // 雲：目の高さから、この向きへ（下向きは海まで。海の素材も同じ雲を描くので、海に隠れる所は見えない）
    float alt = cameraPosition.y + uSeaH;
    float tMax = d.y < -1e-3 ? alt / -d.y : 1e6;
    vec3 eSunC = 3.14159 * skyTrans(uSun);
    vec3 eSky = 3.14159 * skyIn(vec3(0.0, 1.0, 0.0)) * 0.9;
    // 水平線より下は海が描く（海の素材も同じ雲を描く）ので、ここでは雲をたどらない
    vec4 cl = vec4(0.0, 0.0, 0.0, 1.0);
    if (d.y > -sqrt(2.0 * max(alt, 1.0) / 6.371e6) - 0.01) cl = cloudMarch(vec3(cameraPosition.x, alt, cameraPosition.z), d, tMax, uSun, eSunC, eSky, sky, fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))));
    vec3 col = expose(sky * cl.a + cl.rgb);
    // 太陽：見かけの半径 0.267°。ふちが少し暗い（周辺減光）。空気を通った色で、画面の白より明るく（光のにじみが出る）
    float cs = dot(d, uSun);
    float r = acos(clamp(cs, -1.0, 1.0)) / 0.00466;
    if (r < 1.25) {
      float disc = 1.0 - smoothstep(0.85, 1.25, r);
      float limb = 0.55 + 0.45 * sqrt(max(0.0, 1.0 - min(r, 1.0) * min(r, 1.0)));
      col += skyTrans(d) * disc * limb * 6.0 * cl.a;
    }
    gl_FragColor = vec4(col * uAlpha, 1.0);
    ${OUT_CHUNK}
  }
`

/** 空のドーム。表（SkyLut）を bind してから使う。uAlpha で宇宙の黒へ（0 で黒） */
export function skyDomeMaterial(lut: SkyLut, cloud: CloudQuality = CLOUD_HIGH) {
  const m = new THREE.ShaderMaterial({
    vertexShader: domeVert,
    fragmentShader: domeFrag,
    defines: { CLOUD_N: cloud.steps, CLOUD_LIGHT: cloud.light },
    uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uAlpha: { value: 1 }, ...cloudUniforms() },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  })
  lut.bind(m)
  return m
}

// ---- 太陽の光の色（JS）：船・雲・パラシュートを照らす平行光 -----------------------------------------

const B_R = [5.8e-6, 13.5e-6, 33.1e-6]
const B_O = [0.65e-6 * 2.5, 1.881e-6 * 2.5, 0.085e-6 * 2.5]
const B_M = 12e-6
const H_R = 8000
const H_M = 1200

function chapman(X: number, h: number, c: number) {
  const k = Math.sqrt(1.5708 * (X + h))
  if (c >= 0) return (k / (k * c + 1)) * Math.exp(-h)
  const x0 = Math.sqrt(Math.max(0, 1 - c * c)) * (X + h)
  const k0 = Math.sqrt(1.5708 * x0)
  return 2 * k0 * Math.exp(Math.min(X - x0, 60)) - (k / (1 - k * c)) * Math.exp(-h)
}

/** 高さ h（m）で、太陽の高さの sin が mu のとき、空気を通った日の光の割合（赤・緑・青）。シェーダーの sunTau と同じ式 */
export function sunTransmit(radius: number, h: number, mu: number, out: THREE.Color) {
  const hh = Math.max(0, h)
  const dR = H_R * chapman(radius / H_R, hh / H_R, mu)
  const dM = H_M * chapman(radius / H_M, hh / H_M, mu)
  return out.setRGB(
    Math.exp(-((B_R[0] + B_O[0]) * dR + B_M * 1.11 * dM)),
    Math.exp(-((B_R[1] + B_O[1]) * dR + B_M * 1.11 * dM)),
    Math.exp(-((B_R[2] + B_O[2]) * dR + B_M * 1.11 * dM)),
    THREE.LinearSRGBColorSpace,
  )
}

