import * as THREE from 'three'
import { roleOf } from './semiReal'

// 公園の人の「リアル＋質感」見た目（確認中。URL に ?mobstyle=rich）。
// テクスチャは今の写真のまま、一流ゲームの顔にある「生きた肌」の 3 つを足す（junji さんの指摘 2026-11-18）：
//  - テカリ：おでこ・鼻・頬骨・あごだけ、光を少し反射する（皮脂の多い T ゾーン）
//  - 血色：頬・鼻先・耳を温かい赤みに
//  - 影のふちの赤み：光が肌の中で散って、明暗の境目が赤く光る（表面下散乱のかんたんな真似）
// 服は布らしくつやを抑え、髪は少しだけつやを出す。
//
// 顔の場所は MakeHuman の肌のテクスチャ（全員同じ UV、1024 px）で測った値。顔は横倒しで、
// 頭のてっぺんが左（u≈0.64）、あごが右（u≈0.98）、顔の中心線が v≈0.512。

/** [u, v, 横の半径, 縦の半径] */
type Spot = [number, number, number, number]

// テカリ（皮脂）：おでこ・鼻すじ・鼻先・頬骨・あご
const SHINE: Spot[] = [
  [0.795, 0.512, 0.045, 0.075],
  [0.865, 0.512, 0.03, 0.016],
  [0.895, 0.512, 0.014, 0.02],
  [0.885, 0.448, 0.024, 0.026],
  [0.885, 0.576, 0.024, 0.026],
  [0.968, 0.512, 0.016, 0.03],
]
// 血色：頬・鼻先・耳・あご先（弱め）
const BLUSH: Spot[] = [
  [0.912, 0.452, 0.034, 0.036],
  [0.912, 0.572, 0.034, 0.036],
  [0.897, 0.512, 0.016, 0.02],
  [0.862, 0.377, 0.04, 0.03],
  [0.862, 0.647, 0.04, 0.03],
  [0.968, 0.512, 0.014, 0.024],
]

const glslSpots = (name: string, spots: Spot[]) =>
  `float ${name}( vec2 uv ) {\n  float m = 0.0;\n` +
  spots
    .map(
      ([u, v, ru, rv]) =>
        `  m = max( m, 1.0 - smoothstep( 0.35, 1.0, length( ( uv - vec2( ${u.toFixed(4)}, ${v.toFixed(4)} ) ) / vec2( ${ru.toFixed(4)}, ${rv.toFixed(4)} ) ) ) );`,
    )
    .join('\n') +
  '\n  return m;\n}'

type Look = { rough: number; shineRough: number; blush: number; scatter: number; warmShade: number }

const LOOK: Partial<Record<ReturnType<typeof roleOf>, Look>> = {
  skin: { rough: 0.62, shineRough: 0.34, blush: 0.26, scatter: 0.18, warmShade: 0.12 },
  hair: { rough: 0.5, shineRough: 0.5, blush: 0, scatter: 0, warmShade: 0 },
  cloth: { rough: 0.9, shineRough: 0.9, blush: 0, scatter: 0, warmShade: 0 },
}

/** 元の材質から、質感を足した材質を作る（肌・髪・服）。それ以外は null（Lambert のまま） */
export function richMaterial(src: THREE.Material & { map?: THREE.Texture | null; color?: THREE.Color }) {
  const role = roleOf(src.name)
  const look = LOOK[role]
  if (!look) return null
  const m = new THREE.MeshStandardMaterial({
    map: src.map ?? null,
    color: src.color ? src.color.clone() : 0xffffff,
    roughness: look.rough,
    metalness: 0,
    transparent: src.transparent,
    alphaTest: src.alphaTest,
    side: src.side,
    depthWrite: src.depthWrite,
  })
  m.name = src.name
  if (role !== 'skin') return m
  const uniforms = {
    uShineRough: { value: look.shineRough },
    uBlush: { value: look.blush },
    uScatter: { value: look.scatter },
    uWarmShade: { value: look.warmShade },
  }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uShineRough;
uniform float uBlush;
uniform float uScatter;
uniform float uWarmShade;
${glslSpots('shineMask', SHINE)}
${glslSpots('blushMask', BLUSH)}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  // 血色：頬・鼻先・耳を温かい赤みに（暗い肌では控えめに見える量）
  float blushM = blushMask( vMapUv ) * uBlush;
  diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.0, 0.8, 0.76 ), blushM );
  // 濃い肌が暗くつぶれないよう、暗い色だけ少し持ち上げる（色味はそのまま）
  float lumS = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
  diffuseColor.rgb *= 1.0 + 0.3 * ( 1.0 - smoothstep( 0.04, 0.3, lumS ) );`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
  // テカリ：T ゾーンと頬骨だけ、つるっとさせる
  roughnessFactor = mix( roughnessFactor, uShineRough, shineMask( vMapUv ) );`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
  // 影のふちの赤み（光が肌の中で散る）と、影の側を少し温かく
  #if NUM_DIR_LIGHTS > 0
  {
    float d = dot( normal, directionalLights[ 0 ].direction );
    float band = smoothstep( -0.35, 0.05, d ) * ( 1.0 - smoothstep( 0.05, 0.5, d ) );
    reflectedLight.directDiffuse += directionalLights[ 0 ].color * diffuseColor.rgb * vec3( 0.42, 0.13, 0.08 ) * band * uScatter;
  }
  #endif
  reflectedLight.indirectDiffuse *= mix( vec3( 1.0 ), vec3( 1.12, 0.94, 0.9 ), uWarmShade / 0.12 );`,
      )
  }
  m.customProgramCacheKey = () => 'rich-skin-3'
  return m
}
