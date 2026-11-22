import * as THREE from 'three'
import { patchSkin } from './rocketSkin'

// 発射台のサターンV の霜。液体酸素・液体水素を入れたタンクの外側は、湿った夜の空気が凍って白く霜が付く。
// 本物の写真では、第1段の上半分（液体酸素のタンク）の黒い塗り分けが霜で灰色にくもり、まだらに白く見える。
// 離昇すると、揺れと風で霜ははがれて落ちる（launchFx.ts の氷のかけら）。
//
// 機体の材質を複製して、模様を足す（同じ glb を使うほかの場面の材質は変えない）。
// 座標は各段の部品の中の座標（y がロケットの根元からの高さ m）。

/** 霜の濃さ（0〜1）。全部の材質で同じ値を使う */
export const frostUniform = { value: 1 }

/** タンクのある高さ（m）と、そこの霜の濃さ */
const BANDS = /* glsl */ `
  float frostBand(float y) {
    // 第1段の液体酸素タンク（22〜40 m）がいちばん濃い。第2段・第3段は断熱材があって薄い
    return smoothstep(21.0, 23.0, y) * (1.0 - smoothstep(39.0, 41.0, y))
      + 0.45 * smoothstep(43.0, 45.0, y) * (1.0 - smoothstep(64.0, 66.0, y))
      + 0.35 * smoothstep(70.0, 72.0, y) * (1.0 - smoothstep(83.0, 85.0, y));
  }
  float fHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float fNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(fHash(i), fHash(i + vec3(1,0,0)), u.x), mix(fHash(i + vec3(0,1,0)), fHash(i + vec3(1,1,0)), u.x), u.y),
               mix(mix(fHash(i + vec3(0,0,1)), fHash(i + vec3(1,0,1)), u.x), mix(fHash(i + vec3(0,1,1)), fHash(i + vec3(1,1,1)), u.x), u.y), u.z);
  }
`

/** keep：描く高さの範囲（m）。外は描かない（第3段の下の広がった筒は、第2段といっしょに切り離すので、第3段からは消して第2段の複製で描く） */
export function withFrost(src: THREE.Material, keep: [number, number] = [-1e9, 1e9]): THREE.Material {
  if (!(src instanceof THREE.MeshStandardMaterial)) return src
  const m = src.clone()
  const keepY = { value: new THREE.Vector2(keep[0], keep[1]) }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFrost = frostUniform
    shader.uniforms.uKeepY = keepY
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFrostP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFrostP = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uFrost;\nuniform vec2 uKeepY;\nvarying vec3 vFrostP;\n${BANDS}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vFrostP.y < uKeepY.x || vFrostP.y > uKeepY.y) discard;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // 霜：縦に流れるまだら（タンクの継ぎ目や結露の筋に沿って付く）
        float fN = fNoise(vFrostP * vec3(0.9, 0.22, 0.9)) * 0.6 + fNoise(vFrostP * vec3(3.1, 0.9, 3.1)) * 0.4;
        float frost = uFrost * frostBand(vFrostP.y) * smoothstep(0.32, 0.72, fN);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.86, 0.9), frost * 0.8);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.95, frost);')
    // 外板の継ぎ目・リベット・照りのむら（rocketSkin.ts）
    patchSkin(shader, 0)
  }
  m.customProgramCacheKey = () => 'frost-skin'
  return m
}

/** ロケットの段（S1・S2・S3）の中のメッシュの材質を、霜つきの複製に替える（made は作った複製） */
export function frostRocket(stages: THREE.Object3D[], keep?: [number, number]) {
  const made: THREE.Material[] = []
  for (const st of stages) {
    st.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const swap = (x: THREE.Material) => {
        // 光る部品・ガラスは霜を付けない
        if (!['White', 'Black', 'Grey'].includes(x.name)) return x
        const f = withFrost(x, keep)
        if (f !== x) made.push(f)
        return f
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
    })
  }
  return { made: new Set(made), dispose: () => made.forEach((m) => m.dispose()) }
}
