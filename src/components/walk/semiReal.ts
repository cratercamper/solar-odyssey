import * as THREE from 'three'

// 公園の人の「セミリアル」見た目（確認中。URL に ?mobstyle=semi を付けると切りかわる）。
// MakeHuman のリアル寄りの人は「ゾンビっぽい」「不気味」に見えやすい。原因はほぼ「肌の明るさ・色」と「影の色」。
// junji さんが調べてくれた、別ゲーム（博士・氷室）で効いた工夫を当てはめる：
//  - 影は「暗くする」でなく「別の色にする」：やわらかい 2 段、肌はピンク寄り、服・髪は紫寄り
//  - 肌は光の「色」を弱めて明るさだけ受ける（neutral）。明るさに上限をつけて白飛びを止める
//  - 環境光（半球光）を向きでほとんど変えない（鼻先だけ浮く「作り物」感を消す）
//  - 眉は暗く・くっきり、髪は少し暖かく
//  - 輪郭線は黒でなく、肌は暗い赤茶・服は紫黒の細い線（裏面ふくらませ）
//  - さらに、肌・服のテクスチャを粗い段（ミップマップ）で読み、写実的な細かい凹凸やしわをぼかす

// ?mobstyle=paint は、この陰影に加えてテクスチャも絵に寄せた版（tools/mobs/paint_textures.py で作った
// public/walk/mobs/paint/ の肌・服・目に差しかえる）。写真の肌に絵の陰影をのせると、1 つの顔の中で
// リアルさがばらばらになり「仮面人形」に見えるため（Chattopadhyay & MacDorman 2016）、全部を同じ絵の度合いにそろえる。
// ?mobstyle=rich は写真のテクスチャのまま、肌のテカリ・血色・影のふちの赤みを足した版（richSkin.ts）。
export type MobStyle = 'real' | 'semi' | 'paint' | 'rich'

export const MOB_STYLE: MobStyle = ((): MobStyle => {
  const m = /[?&#]mobstyle=(semi|paint|rich)\b/.exec(location.search + location.hash)
  return (m?.[1] as MobStyle | undefined) ?? 'real'
})()

type Role = 'skin' | 'hair' | 'brows' | 'lashes' | 'cloth' | 'other'

export const roleOf = (name: string): Role => {
  if (name.endsWith('.skin')) return 'skin'
  if (name.endsWith('.hair')) return 'hair'
  if (name.endsWith('.brows')) return 'brows'
  if (name.endsWith('.lashes')) return 'lashes'
  if (name.includes('.cloth.')) return 'cloth'
  return 'other'
}

type Look = {
  /** テクスチャを何段ぼかすか（ミップマップの段） */
  blur: number
  /** 影の色（乗算） */
  shade: [number, number, number]
  /** + で影が入りにくい */
  shift: number
  /** 光の色を弱める量（肌だけ） */
  neutral: number
  /** 仕上げの明るさ */
  exp: number
  /** 暗い色の持ち上げ（濃い肌が暗くつぶれないように） */
  lift: number
  /** 色の乗算と彩度 */
  grade: [number, number, number, number]
  /** ふちの光 */
  rim: number
}

const LOOK: Record<Role, Look> = {
  skin: { blur: 0.3, shade: [0.93, 0.76, 0.8], shift: 0.25, neutral: 0.75, exp: 0.9, lift: 0.3, grade: [1, 0.97, 0.95, 1], rim: 0.06 },
  hair: { blur: 0.5, shade: [0.66, 0.62, 0.86], shift: 0, neutral: 0, exp: 1, lift: 0, grade: [1.02, 1, 0.98, 1], rim: 0.06 },
  brows: { blur: 0, shade: [0.8, 0.75, 0.85], shift: 0.3, neutral: 0, exp: 1, lift: 0, grade: [0.85, 0.8, 0.8, 1], rim: 0 },
  lashes: { blur: 0, shade: [0.8, 0.75, 0.85], shift: 0.3, neutral: 0, exp: 1, lift: 0, grade: [1, 1, 1, 1], rim: 0 },
  cloth: { blur: 1.1, shade: [0.62, 0.6, 0.82], shift: 0, neutral: 0, exp: 0.95, lift: 0.06, grade: [1, 1, 1, 0.9], rim: 0.04 },
  other: { blur: 0.5, shade: [0.6, 0.58, 0.78], shift: 0, neutral: 0, exp: 1, lift: 0, grade: [1, 1, 1, 1], rim: 0.08 },
}

const v3 = (a: [number, number, number]) => new THREE.Vector3(...a)

/** 元の材質から、セミリアルの材質を作る */
export function semiMaterial(src: THREE.Material & { map?: THREE.Texture | null; color?: THREE.Color }) {
  const role = roleOf(src.name)
  // 絵に寄せたテクスチャは、もうぼかさない
  const look = MOB_STYLE === 'paint' && (role === 'skin' || role === 'cloth') ? { ...LOOK[role], blur: 0 } : LOOK[role]
  const m = new THREE.MeshToonMaterial({
    map: src.map ?? null,
    color: src.color ? src.color.clone() : 0xffffff,
    transparent: src.transparent,
    alphaTest: src.alphaTest,
    side: src.side,
    depthWrite: src.depthWrite,
  })
  m.name = src.name
  const uniforms = {
    uBlur: { value: look.blur },
    uShade: { value: v3(look.shade) },
    uShift: { value: look.shift },
    uNeutral: { value: look.neutral },
    uExp: { value: look.exp },
    uLift: { value: look.lift },
    uGrade: { value: new THREE.Vector4(...look.grade) },
    uRim: { value: look.rim },
    uBrow: { value: role === 'brows' ? 1 : 0 },
    // まつげは MakeHuman だと濃く太く、目の白い所をほとんど隠して「黒い穴」に見えるので薄くする
    uAlphaMul: { value: role === 'lashes' ? 0.3 : 1 },
  }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <gradientmap_pars_fragment>',
        /* glsl */ `
uniform float uBlur;
uniform vec3 uShade;
uniform float uShift;
uniform float uNeutral;
uniform float uExp;
uniform float uLift;
uniform vec4 uGrade;
uniform float uRim;
uniform float uBrow;
uniform float uAlphaMul;
// やわらかい 2 段の陰影。明るい側は 1、影の側は影の色
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  float d = dot( normal, lightDirection ) + uShift;
  return mix( uShade, vec3( 1.0 ), smoothstep( -0.12, 0.2, d ) );
}`,
      )
      .replace(
        '#include <lights_fragment_begin>',
        // 半球光を「空と地面の平均」に 85% 寄せる（向きで明るさをほとんど変えない）
        THREE.ShaderChunk.lights_fragment_begin.replace(
          'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );',
          'irradiance += mix( getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ), 0.5 * ( hemisphereLights[ i ].skyColor + hemisphereLights[ i ].groundColor ), 0.85 );',
        ),
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv, uBlur );
  float lum0 = dot( sampledDiffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
  sampledDiffuseColor.rgb *= 1.0 + uLift * ( 1.0 - smoothstep( 0.05, 0.45, lum0 ) );
  diffuseColor *= sampledDiffuseColor;
#endif
  if ( uBrow > 0.5 ) diffuseColor.a = smoothstep( 0.1, 0.38, diffuseColor.a );
  diffuseColor.a *= uAlphaMul;`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
  {
    const vec3 LUM = vec3( 0.299, 0.587, 0.114 );
    // 肌は光の「明るさ」だけ受ける（上限で白飛びを防ぐ）
    float base = max( dot( diffuseColor.rgb, LUM ), 1e-3 );
    float ratio = min( dot( outgoingLight, LUM ) / base, 1.0 / uExp );
    outgoingLight = mix( outgoingLight, diffuseColor.rgb * ratio, uNeutral );
    // 色の乗算と彩度、明るさ
    outgoingLight = mix( vec3( dot( outgoingLight, LUM ) ), outgoingLight, uGrade.w ) * uGrade.rgb * uExp;
    // ふちの光（ごく弱く）
    float facing = saturate( dot( normal, normalize( vViewPosition ) ) );
    outgoingLight += uRim * pow( 1.0 - facing, 3.0 ) * mix( diffuseColor.rgb, vec3( 1.0 ), 0.5 );
  }
#include <opaque_fragment>`,
      )
  }
  m.customProgramCacheKey = () => 'semi-real-3'
  return m
}

const outlineMats = new Map<string, THREE.MeshBasicMaterial>()
/** 輪郭線の材質（裏面だけ、法線の向きに width m ふくらませる） */
function outlineMaterial(color: [number, number, number], width: number) {
  const key = `${color.join(',')}/${width}`
  let m = outlineMats.get(key)
  if (m) return m
  m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...color, THREE.SRGBColorSpace), side: THREE.BackSide })
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <skinning_vertex>',
        `#include <skinning_vertex>\n  transformed += normalize( objectNormal ) * ${width.toFixed(5)};`,
      )
      // 奥行きだけ 1.2 cm 向こうへずらす：まぶたの線が目玉の手前に出て目が黒く沈むのを防ぎ、外側の輪郭だけ残す
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  {
    vec4 mv2 = mvPosition;
    mv2.xyz += normalize( mv2.xyz ) * 0.012;
    vec4 p2 = projectionMatrix * mv2;
    gl_Position.z = p2.z / p2.w * gl_Position.w;
  }`,
      )
  }
  m.customProgramCacheKey = () => `semi-outline2-${width}`
  outlineMats.set(key, m)
  return m
}

/** 肌と服に細い輪郭線を付ける（髪・眉・まつげ・目には付けない）。形と骨は元のメッシュと共有する */
export function addOutlines(root: THREE.Object3D) {
  const add: [THREE.Object3D, THREE.SkinnedMesh][] = []
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh || Array.isArray(mesh.material)) return
    const role = roleOf(mesh.material.name)
    if (role !== 'skin' && role !== 'cloth') return
    const mat = role === 'skin' ? outlineMaterial([0.27, 0.09, 0.1], 0.0022) : outlineMaterial([0.13, 0.08, 0.16], 0.0026)
    const line = new THREE.SkinnedMesh(mesh.geometry, mat)
    line.name = mesh.name + '.outline'
    line.bind(mesh.skeleton, mesh.bindMatrix)
    line.position.copy(mesh.position)
    line.quaternion.copy(mesh.quaternion)
    line.scale.copy(mesh.scale)
    line.castShadow = false
    line.receiveShadow = false
    line.frustumCulled = false
    add.push([mesh.parent!, line])
  })
  for (const [parent, line] of add) parent.add(line)
}

/** ?mobstyle=paint：肌・服（靴以外）・目のテクスチャを、絵に寄せた版に差しかえる */
export async function applyPaintTextures(root: THREE.Object3D, base: string) {
  const loader = new THREE.TextureLoader()
  const jobs: Promise<void>[] = []
  const done = new Set<THREE.Material>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || Array.isArray(mesh.material)) return
    const mat = mesh.material as THREE.Material & { map?: THREE.Texture | null; emissiveMap?: THREE.Texture | null }
    if (done.has(mat) || !mat.map) return
    const name = mat.name
    const ext = name.endsWith('.eyes') ? 'png' : name.endsWith('.skin') || (name.includes('.cloth.') && !name.includes('.shoes')) ? 'jpg' : ''
    if (!ext) return
    done.add(mat)
    const old = mat.map
    jobs.push(
      loader
        .loadAsync(`${base}walk/mobs/paint/${name}.${ext}`)
        .then((t) => {
          t.flipY = false
          t.colorSpace = THREE.SRGBColorSpace
          t.wrapS = old.wrapS
          t.wrapT = old.wrapT
          t.anisotropy = old.anisotropy
          mat.map = t
          if (mat.emissiveMap) mat.emissiveMap = t
          mat.needsUpdate = true
        })
        .catch(() => undefined),
    )
  })
  await Promise.all(jobs)
}
