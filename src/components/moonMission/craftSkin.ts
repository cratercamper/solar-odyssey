import * as THREE from 'three'

// アポロの司令船・機械船・着陸船（apollo.glb）の、近くで見たときの細かさ。
// glb の地図（2048 画素 1 枚で機体全部）は、カメラを寄せるとぼやけてのっぺりする。近くで見るときだけ、シェーダーで足す
// （1 つの模様が画面で数画素より小さくなったら消していくので、遠くではちらつかない）。色の地図はそのまま。
//
// 本物の見た目（写真：AS17-145-22261 月を回る司令船、AS17-134-20384 月面の着陸船、KSC の展示の実機）：
//  - 司令船（cm）：外は銀色のテープ（アルミを蒸着したカプトンのテープ）を、機首から縦に貼り並べてある。
//    テープ 1 本ごとに照りが少し違い、うすいしわがある。完全な鏡ではない
//  - 機械船（sm）：アルミの板。6 つの区画の境目に縦の継ぎ目とリベットの列、上下に横の継ぎ目
//  - 断熱フィルム（foil）：金色・銀色の毛布。こまかいしわ
//  - 上昇段の板（quilt）：うすい板が、止めてある点のあいだで少しふくらむ（キルトのような照り）
//
// 座標は部品の中の座標（m）。司令船・機械船は y が機首の向き、着陸船は y が上。

type Kind = 'cm' | 'sm' | 'foil' | 'quilt'

/** 材質の名前 → 細かさの種類。どれでもなければ足さない */
const KIND_OF: Record<string, Kind> = {
  CMSilver: 'cm',
  Aluminum: 'sm',
  SMWhite: 'sm',
  Kapton: 'foil',
  KaptonDark: 'foil',
  Mylar: 'foil',
  Pad: 'foil',
  Inconel: 'quilt',
  Panel: 'quilt',
}

/** 照り（粗さの地図の値）に足す量（司令船は鏡のようになりすぎていた） */
const ROUGH_ADD: Partial<Record<string, number>> = { CMSilver: 0.06 }

const COMMON = /* glsl */ `
  float csHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float csHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float csNoise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float a = mix(mix(csHash3(i), csHash3(i + vec3(1, 0, 0)), u.x), mix(csHash3(i + vec3(0, 1, 0)), csHash3(i + vec3(1, 1, 0)), u.x), u.y);
    float b = mix(mix(csHash3(i + vec3(0, 0, 1)), csHash3(i + vec3(1, 0, 1)), u.x), mix(csHash3(i + vec3(0, 1, 1)), csHash3(i + vec3(1, 1, 1)), u.x), u.y);
    return mix(a, b, u.z);
  }
  /** 細かさを、1 つの模様（大きさ cell m）が画面で数画素より小さくなったら消す係数 */
  float csFade(float cell, float px) { return 1.0 - smoothstep(0.12, 0.3, px / cell); }
  /** 細い溝（0 か 1）。w は溝の幅（周期に対する割合）。px は 1 画素の大きさ（周期に対する割合） */
  float csLine(float x, float w, float px) {
    float d = abs(fract(x + 0.5) - 0.5);
    float aa = max(px, 1e-4);
    return (1.0 - smoothstep(w - aa, w + aa, d)) * (1.0 - smoothstep(0.15, 0.4, px));
  }
`

/** 種類ごとの「高さ（法線を傾ける）・照りに足す量・暗くする量」。p は部品の中の座標、px は 1 画素の大きさ（m） */
const DETAIL: Record<Kind, string> = {
  // 司令船：機首から縦に貼った銀のテープ。周り 1 周を 150 本（底のふちで幅 8 cm）。テープごとの照りのむらと、うすいしわ
  cm: /* glsl */ `
  vec3 craftDetail(vec3 p, float px) {
    float a = atan(p.z, p.x) / 6.28318 + 0.5;
    float strips = a * 150.0;
    float r = max(length(p.xz), 0.05);
    float pxS = px * 150.0 / (6.28318 * r);
    float id = floor(strips);
    float tone = csHash2(vec2(id, floor(p.y / 0.9))) - 0.5;
    float edge = csLine(strips, 0.035, pxS);
    float wr = csNoise3(p * vec3(9.0, 3.0, 9.0) + id * 1.7) - 0.5;
    float wrF = csFade(0.11, px);
    float h = -edge * 0.3 + wr * 0.7 * wrF;
    float rough = tone * 0.16 * (1.0 - smoothstep(0.4, 1.0, pxS)) + edge * 0.08 + abs(wr) * 0.1 * wrF;
    float dark = edge * 0.06;
    return vec3(h, rough, dark);
  }`,
  // 機械船：6 つの区画の縦の継ぎ目とリベット、上下の横の継ぎ目、アルミの磨きの筋（縦）
  sm: /* glsl */ `
  vec3 craftDetail(vec3 p, float px) {
    float a = atan(p.z, p.x) / 6.28318 + 0.5;
    float r = max(length(p.xz), 0.05);
    float arc = a * 6.28318 * r;
    float sector = a * 6.0;
    float pxSec = px * 6.0 / (6.28318 * r);
    float seam = csLine(sector, 0.004, pxSec);
    // 区画の境目から 6 cm の所に、縦に 9 cm ごとのリベット
    float off = abs(fract(sector + 0.5) - 0.5) / 6.0 * 6.28318 * r;
    float onCol = 1.0 - smoothstep(0.008, 0.02, abs(off - 0.06));
    float cell = abs(fract(p.y / 0.09) - 0.5);
    float rivet = onCol * (1.0 - smoothstep(0.15, 0.3, cell)) * csFade(0.09, px);
    // 横の継ぎ目：上の段（燃料電池の区画の上）と、下の段（エンジンの上）
    float ring = (1.0 - smoothstep(0.006, 0.006 + px, abs(p.y + 3.9))) + (1.0 - smoothstep(0.006, 0.006 + px, abs(p.y + 7.05)));
    ring *= 1.0 - smoothstep(0.004, 0.012, px);
    // 縦の磨きの筋：照りが細く縦に流れる
    float brush = csHash2(vec2(floor(arc / 0.012), floor(p.y / 1.3))) - 0.5;
    float brF = csFade(0.012, px);
    float panel = csHash2(vec2(floor(sector), floor((p.y + 3.9) / 1.6))) - 0.5;
    float h = -seam * 0.8 - ring * 0.7 + rivet * 0.6;
    float rough = brush * 0.12 * brF + panel * 0.08 + seam * 0.1;
    float dark = seam * 0.12 + ring * 0.1;
    return vec3(h, rough, dark);
  }`,
  // 断熱フィルム：大きなしわ（10 cm）と、こまかいしわ（3 cm）。しわの山は照りが強く、谷は少し暗い
  foil: /* glsl */ `
  vec3 craftDetail(vec3 p, float px) {
    float big = csNoise3(p * 10.0) - 0.5;
    float fine = csNoise3(p * 34.0 + 3.1) - 0.5;
    float bF = csFade(0.1, px);
    float fF = csFade(0.03, px);
    // しわは折れ目らしく、とがった形に
    float crease = 1.0 - abs(big * 2.0);
    float h = (big * 0.9 + crease * 0.35) * bF + fine * 0.5 * fF;
    float rough = -crease * 0.08 * bF + abs(fine) * 0.1 * fF;
    float dark = max(0.0, -big) * 0.12 * bF;
    return vec3(h, rough, dark);
  }`,
  // 上昇段の板：止めた点（25 cm ごと）のあいだで、板が少しふくらむ
  quilt: /* glsl */ `
  vec3 craftDetail(vec3 p, float px) {
    vec3 q = p / 0.25;
    vec3 f = abs(fract(q) - 0.5) * 2.0;
    float pil = (1.0 - f.x * f.x) * (1.0 - f.y * f.y) * (1.0 - f.z * f.z);
    float qF = csFade(0.25, px);
    float tone = csHash3(floor(q)) - 0.5;
    float h = pil * 0.6 * qF;
    float rough = tone * 0.1 * qF;
    return vec3(h, rough, 0.0);
  }`,
}

function patch(shader: THREE.WebGLProgramParametersWithUniforms, kind: Kind, add: number) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vCraftP;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCraftP = position;')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vCraftP;\n${COMMON}\n${DETAIL[kind]}`)
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float craftPx = length(fwidth(vCraftP));
      vec3 craftV = craftDetail(vCraftP, craftPx);
      diffuseColor.rgb *= 1.0 - craftV.z;`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + craftV.y + ${add.toFixed(3)}, 0.04, 1.0);`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        // 細かさの高さから、法線を少し傾ける（three の perturbNormalArb と同じ考え方）
        float hk = craftV.x * 0.004;
        vec3 dpx = dFdx(-vViewPosition);
        vec3 dpy = dFdy(-vViewPosition);
        float dhx = dFdx(hk);
        float dhy = dFdy(hk);
        vec3 r1 = cross(dpy, normal);
        vec3 r2 = cross(normal, dpx);
        float det = dot(dpx, r1);
        vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
        normal = normalize(abs(det) * normal - grad);
      }`,
    )
}

/** 複製ずみの材質に、近くで見たときの細かさを足す（材質の名前で種類を選ぶ）。足したら true */
export function skinCraftMaterial(m: THREE.Material) {
  if (!(m instanceof THREE.MeshStandardMaterial)) return false
  const kind = KIND_OF[m.name]
  if (!kind) return false
  const add = ROUGH_ADD[m.name] ?? 0
  m.onBeforeCompile = (shader) => patch(shader, kind, add)
  m.customProgramCacheKey = () => `craft-${kind}-${add}`
  return true
}
