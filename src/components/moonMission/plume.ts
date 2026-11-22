import * as THREE from 'three'
import { OUT_CHUNK } from './shaderOut'

// ロケットの噴射の炎。円すい（ノズルの口が細い側）を、加算の光で描く。
// 地上では細く締まった炎、空気の薄い高い所では、外へ大きく広がる（本物の映像でも高く上がるほど炎がふくらむ）。

const vert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uExpand;
  varying float vS;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    // uv.y：1 がノズルの口、0 が炎の先（CylinderGeometry の向き）
    float s = 1.0 - uv.y;
    vS = s;
    vUv = uv;
    vec3 p = position;
    // 先へ行くほど太く。空気が薄いと、根元のすぐ先から大きく広がる
    float r = mix(1.0, 1.0 + uExpand * 3.0, pow(s, mix(1.6, 0.55, clamp(uExpand, 0.0, 1.0))));
    p.xz *= r;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`

const frag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform float uPower;
  uniform vec3 uCore;
  uniform vec3 uEdge;
  uniform float uSoft;
  varying float vS;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    #include <logdepthbuf_fragment>
    // 横から見た縁はうすく、まん中は濃く（立体の炎らしく）
    float rim = pow(abs(dot(normalize(vN), normalize(vV))), uSoft);
    float n = noise(vec2(vUv.x * 9.0, vS * 7.0 - uTime * 9.0)) * 0.6 + noise(vec2(vUv.x * 23.0, vS * 19.0 - uTime * 17.0)) * 0.4;
    float body = pow(1.0 - vS, 1.4) * (0.7 + 0.6 * n);
    float hot = smoothstep(0.35, 0.0, vS);
    vec3 col = mix(uEdge, uCore, hot * rim);
    float a = body * rim * uPower;
    gl_FragColor = vec4(col * a, a);
    ${OUT_CHUNK}
  }
`

export type PlumeLook = { core: THREE.ColorRepresentation; edge: THREE.ColorRepresentation; soft?: number }

export function plumeMaterial(look: PlumeLook) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uTime: { value: 0 },
      uPower: { value: 0 },
      uExpand: { value: 0 },
      uCore: { value: new THREE.Color(look.core) },
      uEdge: { value: new THREE.Color(look.edge) },
      uSoft: { value: look.soft ?? 1.2 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

/** 炎の形：長さ 1、口の半径 1、先へ向かって -Y に伸びる円すい（呼ぶ側で大きさを決める） */
export function plumeGeometry() {
  // 縦の分け目が少ないと、広がり方の曲線が折れ線になって、炎に段が見えた
  const g = new THREE.CylinderGeometry(1, 1.25, 1, 40, 64, true)
  g.translate(0, -0.5, 0)
  return g
}

/** 光る点（照明・遠くの街の明かり・分離ロケットの火）の丸いにじみ */
let glowTex: THREE.Texture | null = null
export function glowTexture() {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  glowTex = new THREE.CanvasTexture(c)
  return glowTex
}
