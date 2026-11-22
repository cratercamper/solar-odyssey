import * as THREE from 'three'
import type { Level } from '../../state/quality'

// ローバーの轍（わだち）。左右の車輪のあとに、地面に沿った細い帯を少しずつ足していく。
//  ・帯は 1 本の頂点バッファの輪（古いものから上書き）。新しい区間を書き足すだけで、毎フレームの CPU の仕事はほぼ無い
//  ・地面の色は塗らず、下の地面の明るさを掛け算で変える（2 倍の乗算：0.5 で変わらず、それより暗く／明るく）。
//    なので、どの地面の模様の上でも自然になじむ。溝の中・グローサー（車輪の爪）の跡・両脇に盛り上がった土を、
//    すべてシェーダーで描く（テクスチャを使わない）
//  ・天体ごとに見た目を変える：火星は赤い砂に深く暗い溝、月は細かい砂が押し固められて暗い跡、
//    氷の衛星は霜が削れて青みがかった跡と、くっきりした両脇の盛り上がり。風のある天体は時間とともに消え、空気の無い天体は残り続ける

export type TrackLook = {
  /** 溝の底の明るさ（1 で地面のまま。1 より大きいと明るい跡） */
  groove: number
  /** 爪の跡の濃さ（0〜1） */
  grouser: number
  /** 両脇に盛り上がった土の濃さ（0〜1）。太陽の側が明るく、反対側が暗い */
  berm: number
  /** 風で消えるまでの時間（秒）。0 は消えない（古い区間から上書きされるまで残る） */
  life: number
  /** 溝の色みの掛け算（r, g, b） */
  tint: [number, number, number]
}

const DEFAULT: TrackLook = { groove: 0.55, grouser: 0.6, berm: 0.7, life: 0, tint: [1, 1, 1] }
// 氷：明るい地面をさらに明るくしても目立たないので、押し固めた溝を少し暗く青みに（霜が削れて、透きとおった氷が見える）。
// 両脇の盛り上がりの陰影を強く
const ICY: TrackLook = { groove: 0.64, grouser: 0.5, berm: 1.1, life: 0, tint: [0.86, 0.94, 1.08] }

const LOOKS: Record<string, Partial<TrackLook>> = {
  // 火星：赤い細かな砂。くっきり深い溝。砂嵐や風で少しずつ埋まる
  mars: { groove: 0.6, grouser: 0.65, berm: 0.8, life: 420, tint: [1, 0.9, 0.85] },
  // 地球（モニュメント・バレーの砂）：風でわりと早く消える
  earth: { groove: 0.7, grouser: 0.55, berm: 0.7, life: 240 },
  // タイタン：湿ったような暗い砂。メタンの雨と風で消える
  titan: { groove: 0.66, grouser: 0.4, berm: 0.55, life: 300 },
  // 金星：かたい岩の平原。うっすら
  venus: { groove: 0.75, grouser: 0.3, berm: 0.4, life: 200 },
  // 月：アポロの写真のように、押し固められたところが暗い。空気が無いので消えない
  moon: { groove: 0.5, grouser: 0.75, berm: 0.8 },
  mercury: { groove: 0.52, grouser: 0.7, berm: 0.75 },
  io: { groove: 0.65, grouser: 0.45, berm: 0.5 },
  // 氷の天体
  europa: ICY,
  enceladus: { ...ICY, groove: 0.7 },
  ganymede: { ...ICY, groove: 0.6 },
  tethys: ICY,
  dione: ICY,
  rhea: ICY,
  mimas: ICY,
  ariel: ICY,
  miranda: ICY,
  charon: { ...ICY, groove: 0.6 },
  triton: { ...ICY, groove: 0.64 },
  pluto: { ...ICY, groove: 0.64, tint: [0.92, 0.95, 1.04] },
  // 暗い天体は、押し固めても明るさの差が少し小さい
  callisto: { groove: 0.65 },
  umbriel: { groove: 0.68 },
  phobos: { groove: 0.6 },
  deimos: { groove: 0.6 },
}

export const trackLookFor = (id: string): TrackLook => ({ ...DEFAULT, ...(LOOKS[id] ?? {}) })

/** 区間の長さ（m）。これだけ進むたびに 1 区間ずつ足す */
const STEP = 0.3
/** 1 本の轍の幅（m）。車輪の幅より少し広く（両脇の盛り上がりのぶん） */
const WIDTH = 0.26
/** 地面からの浮かせ（m） */
const LIFT = 0.03

const vertex = /* glsl */ `
attribute vec2 aUv;
attribute float aBirth;
attribute float aSeq;
attribute vec2 aSide;
uniform float uTime;
uniform float uSeq;
uniform float uCount;
uniform float uLife;
varying vec2 vUv;
varying float vFade;
varying vec2 vSide;
varying float vDist;
void main() {
  vUv = aUv;
  vSide = aSide;
  // 古いものほど薄く（上書きされる前に消えるように）。風のある天体は時間でも消える
  float old = uSeq - aSeq;
  float fade = 1.0 - smoothstep(uCount * 0.6, uCount * 0.97, old);
  if (uLife > 0.0) fade *= 1.0 - smoothstep(uLife * 0.35, uLife, uTime - aBirth);
  // 出来たばかりは、走る車輪の下から少しずつ
  fade *= smoothstep(0.0, 0.15, uTime - aBirth);
  vFade = aBirth < 0.0 ? 0.0 : fade;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const fragment = /* glsl */ `
uniform float uGroove;
uniform float uGrouser;
uniform float uBerm;
uniform vec3 uTint;
uniform vec2 uSun;
uniform float uSunLow;
uniform float uFar;
varying vec2 vUv;
varying float vFade;
varying vec2 vSide;
varying float vDist;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float fade = vFade * (1.0 - smoothstep(uFar * 0.6, uFar, vDist));
  if (fade < 0.004) discard;
  // u：轍の幅の中の位置（0〜1、0.5 が真ん中）。v：走った道のり（m）
  float u = vUv.x;
  float v = vUv.y;
  // ふちを砂でぼかす（まっすぐな線にならないように）
  float wob = (noise(vec2(v * 6.0, 1.7)) - 0.5) * 0.12 + (noise(vec2(v * 23.0, 4.1)) - 0.5) * 0.05;
  float x = abs(u - 0.5 + wob) * 2.0; // 0：真ん中、1：ふち
  // 溝：車輪が踏んだところ（真ん中の 70%）
  float inGroove = 1.0 - smoothstep(0.62, 0.74, x);
  // 爪の跡：車輪の 1 周に 18 本（周 1.26 m）。少し斜めに
  float g = fract(v / 0.07 + u * 0.35);
  float grouser = smoothstep(0.0, 0.18, g) * (1.0 - smoothstep(0.42, 0.6, g));
  // 遠くで細かい縞がちらつかない（モアレにならない）ように、画面の 1 画素あたりの道のりが長いところでは消す
  grouser = mix(grouser, 0.4, smoothstep(0.015, 0.035, fwidth(v)));
  float grooveK = mix(1.0, uGroove, inGroove);
  float bright = uGroove > 1.0 ? 1.0 : -1.0;
  // 爪の跡は、溝が暗ければもっと暗く、明るければもっと明るく
  grooveK += inGroove * grouser * uGrouser * 0.25 * bright;
  grooveK += (noise(vec2(u * 9.0, v * 9.0)) - 0.5) * 0.08 * inGroove;
  // 両脇の盛り上がり：太陽に向いた側が明るく、反対側が暗い（太陽が低いほどはっきり）
  float berm = smoothstep(0.66, 0.8, x) * (1.0 - smoothstep(0.86, 1.0, x));
  float side = sign(u - 0.5) * dot(vSide, uSun);
  grooveK += berm * uBerm * (0.08 + 0.22 * uSunLow) * side;
  // ふちの外は地面のまま
  float edge = 1.0 - smoothstep(0.92, 1.0, x);
  float w = fade * edge;
  vec3 k = vec3(mix(1.0, grooveK, w)) * mix(vec3(1.0), uTint, inGroove * w);
  // 2 倍の乗算（0.5 で変わらない）
  gl_FragColor = vec4(0.5 * k, 1.0);
}
`

export class WheelTracks {
  readonly mesh: THREE.Mesh
  readonly material: THREE.ShaderMaterial
  readonly look: TrackLook
  /** 区間の数（左右あわせて） */
  readonly count: number
  private geo = new THREE.BufferGeometry()
  private pos: Float32Array
  private uv: Float32Array
  private birth: Float32Array
  private seqA: Float32Array
  private sideA: Float32Array
  private seq = 0
  private time = 0
  /** 左右の轍の、最後に置いた点（無ければ null で、次は切れ目から始まる） */
  private last: ({ x: number; z: number; v: number; l: THREE.Vector3; r: THREE.Vector3 } | null)[] = [null, null]
  private dirtyFrom = -1
  private dirtyTo = -1

  constructor(
    bodyId: string,
    level: Level,
    private height: (x: number, z: number) => number,
    /** 轍の幅（m）。与圧ローバーの太いタイヤは広く */
    private width = WIDTH,
  ) {
    this.look = trackLookFor(bodyId)
    // 区間の数（左右あわせて）。high：2400（左右 360 m ずつ）、medium：1400、low：600
    const count = level === 'high' ? 2400 : level === 'medium' ? 1400 : 600
    this.count = count
    this.pos = new Float32Array(count * 4 * 3)
    this.uv = new Float32Array(count * 4 * 2)
    this.birth = new Float32Array(count * 4).fill(-1)
    this.seqA = new Float32Array(count * 4)
    this.sideA = new Float32Array(count * 4 * 2)
    const index = new Uint32Array(count * 6)
    for (let i = 0; i < count; i++) {
      const a = i * 4
      index.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6)
    }
    this.geo.setIndex(new THREE.BufferAttribute(index, 1))
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aUv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aBirth', new THREE.BufferAttribute(this.birth, 1).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aSeq', new THREE.BufferAttribute(this.seqA, 1).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aSide', new THREE.BufferAttribute(this.sideA, 2).setUsage(THREE.DynamicDrawUsage))
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uTime: { value: 0 },
        uSeq: { value: 0 },
        uCount: { value: count },
        uLife: { value: this.look.life },
        uGroove: { value: this.look.groove },
        uGrouser: { value: this.look.grouser },
        uBerm: { value: this.look.berm },
        uTint: { value: new THREE.Vector3(...this.look.tint) },
        uSun: { value: new THREE.Vector2(1, 0) },
        uSunLow: { value: 0.5 },
        uFar: { value: level === 'low' ? 90 : 160 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.SrcColorFactor,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      fog: false,
    })
    this.mesh = new THREE.Mesh(this.geo, this.material)
    this.mesh.frustumCulled = false
    // 地面のすぐあと、岩や砂ぼこりより前に
    this.mesh.renderOrder = 1
    this.mesh.name = 'rover-tracks'
  }

  /** 轍を途切れさせる（宙に浮いた・岩に乗った・落としなおした） */
  lift(side?: 0 | 1) {
    if (side === undefined) this.last = [null, null]
    else this.last[side] = null
  }

  /** 車輪の下の点（左 = 0、右 = 1）。進んだぶんだけ区間を足す */
  touch(side: 0 | 1, x: number, z: number) {
    const last = this.last[side]
    if (!last) {
      this.last[side] = { x, z, v: Math.random() * 10, l: new THREE.Vector3(x, this.height(x, z) + LIFT, z), r: new THREE.Vector3(x, this.height(x, z) + LIFT, z) }
      return
    }
    const dx = x - last.x
    const dz = z - last.z
    const d = Math.hypot(dx, dz)
    if (d < STEP) return
    // 長く飛んだ（場所を移された）ら切る
    if (d > 3) {
      this.last[side] = null
      this.touch(side, x, z)
      return
    }
    // 1 フレームで長く進んだ（速い・重い）ときは、STEP ごとに分けて地面に沿わせる
    if (d > STEP * 1.6) {
      const n = Math.ceil(d / STEP)
      const ox = last.x
      const oz = last.z
      for (let k = 1; k <= n; k++) this.segment(side, ox + (dx * k) / n, oz + (dz * k) / n)
      return
    }
    this.segment(side, x, z)
  }

  private segment(side: 0 | 1, x: number, z: number) {
    const last = this.last[side]!
    const dx = x - last.x
    const dz = z - last.z
    const d = Math.hypot(dx, dz)
    const nx = -dz / d
    const nz = dx / d
    const h = this.width / 2
    const lx = x + nx * h
    const lz = z + nz * h
    const rx = x - nx * h
    const rz = z - nz * h
    const l = new THREE.Vector3(lx, this.height(lx, lz) + LIFT, lz)
    const r = new THREE.Vector3(rx, this.height(rx, rz) + LIFT, rz)
    // 前の区間の終わりのふちを、新しい向きに合わせなおす（曲がるところで帯がねじれないように）
    if (last.l.x === last.r.x && last.l.z === last.r.z) {
      const plx = last.x + nx * h
      const plz = last.z + nz * h
      const prx = last.x - nx * h
      const prz = last.z - nz * h
      last.l.set(plx, this.height(plx, plz) + LIFT, plz)
      last.r.set(prx, this.height(prx, prz) + LIFT, prz)
    }
    const v = last.v + d
    const i = this.seq % this.count
    const a = i * 4
    const P = this.pos
    P.set([last.l.x, last.l.y, last.l.z, last.r.x, last.r.y, last.r.z, l.x, l.y, l.z, r.x, r.y, r.z], a * 3)
    this.uv.set([0, last.v, 1, last.v, 0, v, 1, v], a * 2)
    this.birth.fill(this.time, a, a + 4)
    this.seqA.fill(this.seq, a, a + 4)
    this.sideA.set([nx, nz, nx, nz, nx, nz, nx, nz], a * 2)
    this.mark(a, a + 4)
    this.seq++
    this.last[side] = { x, z, v, l, r }
  }

  private mark(from: number, to: number) {
    if (this.dirtyFrom < 0) {
      this.dirtyFrom = from
      this.dirtyTo = to
    } else if (from === this.dirtyTo) this.dirtyTo = to
    else {
      // 輪の頭に戻った：全部送る（めったに起きない）
      this.dirtyFrom = 0
      this.dirtyTo = this.count * 4
    }
  }

  /** 毎フレーム。sunDir は世界の太陽の向き */
  update(dt: number, sunDir: THREE.Vector3) {
    this.time += dt
    const u = this.material.uniforms
    u.uTime.value = this.time
    u.uSeq.value = this.seq
    const flat = Math.hypot(sunDir.x, sunDir.z)
    if (flat > 1e-4) u.uSun.value.set(sunDir.x / flat, sunDir.z / flat)
    // 太陽が低いほど盛り上がりの陰影が強い。夜は弱く
    u.uSunLow.value = sunDir.y > 0 ? 1 - Math.min(1, sunDir.y * 1.4) : 0.2
    if (this.dirtyFrom >= 0) {
      const from = this.dirtyFrom
      const n = this.dirtyTo - from
      for (const [name, size] of [
        ['position', 3],
        ['aUv', 2],
        ['aBirth', 1],
        ['aSeq', 1],
        ['aSide', 2],
      ] as const) {
        const attr = this.geo.attributes[name] as THREE.BufferAttribute
        attr.clearUpdateRanges()
        attr.addUpdateRange(from * size, n * size)
        attr.needsUpdate = true
      }
      this.dirtyFrom = -1
    }
  }

  dispose() {
    this.geo.dispose()
    this.material.dispose()
  }
}
