import * as THREE from 'three'

// 公園の人の服の色ちがい。同じ素材の人でも、服の色を変えて別の人に見せる。
// 肌は変えない：肌の色あい（赤〜だいだい、色相 22° ± 30° くらい）の所はそのまま残し、
// それ以外（青・緑・紫・ピンクの服、白・灰・黒の服）だけ、色相を回したり、淡い色をのせたりする。
// 茶色やベージュの服は肌と見分けられないので、そのまま（そのぶん、ほかの所の色で変わる）。
// 体（*_body）の材質だけ。顔と髪（*_head・*_opacity）はさわらない。

type Look = { hue: number; val: number; tint: [number, number, number] }

/** 0 は元のまま */
export const LOOKS: Look[] = [
  { hue: 0, val: 1, tint: [1, 1, 1] },
  { hue: 1.4, val: 1, tint: [0.55, 0.72, 1] },
  { hue: -1.9, val: 0.8, tint: [1, 0.62, 0.48] },
  { hue: 2.6, val: 1.05, tint: [0.62, 0.92, 0.66] },
  { hue: 0.8, val: 0.65, tint: [0.78, 0.6, 1] },
  { hue: -0.9, val: 0.9, tint: [1, 0.9, 0.5] },
]

const cache = new WeakMap<THREE.Material, THREE.Material[]>()

function variant(base: THREE.MeshStandardMaterial, look: number) {
  let list = cache.get(base)
  if (!list) cache.set(base, (list = []))
  if (list[look]) return list[look]
  const L = LOOKS[look]
  const mat = base.clone()
  const c = Math.cos(L.hue)
  const s = Math.sin(L.hue)
  const f = (v: number) => v.toFixed(4)
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
  {
    // 色の判定は画像の色（sRGB）で
    vec3 c = pow( max( diffuseColor.rgb, vec3( 0.0 ) ), vec3( 1.0 / 2.2 ) );
    float mx = max( c.r, max( c.g, c.b ) );
    float mn = min( c.r, min( c.g, c.b ) );
    float d = mx - mn;
    float sat = d / ( mx + 1e-4 );
    float h = 0.0;
    if ( d > 1e-4 ) {
      if ( mx == c.r ) h = mod( ( c.g - c.b ) / d, 6.0 );
      else if ( mx == c.g ) h = ( c.b - c.r ) / d + 2.0;
      else h = ( c.r - c.g ) / d + 4.0;
    }
    h *= 60.0;
    float dh = abs( mod( h - 22.0 + 180.0, 360.0 ) - 180.0 );
    float warm = clamp( ( 32.0 - dh ) / 8.0, 0.0, 1.0 );
    float grey = 1.0 - smoothstep( 0.1, 0.22, sat );
    float change = max( 1.0 - warm, grey );
    // 灰色の軸のまわりに色相を回す
    vec3 k = vec3( 0.57735 );
    vec3 rot = c * ${f(c)} + cross( k, c ) * ${f(s)} + k * dot( k, c ) * ${f(1 - c)};
    rot = mix( vec3( dot( rot, vec3( 0.3, 0.59, 0.11 ) ) ), rot, 0.8 ) * ${f(L.val)};
    float lum = dot( c, vec3( 0.3, 0.59, 0.11 ) );
    vec3 pale = mix( c, lum * vec3( ${L.tint.map(f).join(', ')} ) * ${f(L.val * 1.05)}, 0.8 );
    vec3 nc = mix( rot, pale, grey );
    c = mix( c, clamp( nc, 0.0, 1.0 ), change );
    diffuseColor.rgb = pow( c, vec3( 2.2 ) );
  }`,
    )
  }
  mat.customProgramCacheKey = () => `mob-look-${look}`
  list[look] = mat
  return mat
}

/** この人（VrmPerson の group）の服を look 番の色にする */
export function applyLook(root: THREE.Object3D, look: number) {
  if (!look) return
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || Array.isArray(m.material)) return
    const mat = m.material as THREE.MeshStandardMaterial
    if (!mat.isMeshStandardMaterial || !mat.map || !/_body$/.test(mat.name)) return
    m.material = variant(mat, look % LOOKS.length)
  })
}
