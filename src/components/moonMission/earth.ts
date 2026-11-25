import * as THREE from 'three'
import { OUT_CHUNK } from './shaderOut'

// 打ち上げの場面の地球：昼の側は昼の地図と雲、夜の側は街の明かり、ふちには薄い大気の光。
// 本物の大きさ（半径 6,371 km）で描く。地上のすぐ近くは発射台のまわりの地面（LaunchWorld）が受け持つ。


// ---- 光の散乱（MM_SCATTER のとき）----------------------------------------------------------------
// 本物の大気のように、空気の分子（青をよく散らす）と細かいちり（太陽のまわりを白く光らせる）が、日の光を散らす。
// 宇宙から見た地平線の、白っぽいかすみ → 青い層 → 黒い宇宙の重なりと、日の出の赤い帯は、ここから自然に出てくる。
// 太陽までの光の弱まりは、近似の式（Chapman 関数、Schüler 2012）で、ループを使わずに求める。
export const SCATTER_CHUNK = /* glsl */ `
  uniform vec3 uCenter;
  uniform float uR;
  #ifndef SCATTER_N
  #define SCATTER_N 16
  #endif
  const float ATM_H = 100000.0;
  // 海面での散らしやすさ（1/m）：空気の分子（赤・緑・青）、ちり、オゾン（吸うだけ。上空の青を深くする）
  const vec3 B_R = vec3(5.8e-6, 13.5e-6, 33.1e-6);
  const float B_M = 12e-6;
  const vec3 B_O = vec3(0.65e-6, 1.881e-6, 0.085e-6) * 2.5;
  const float H_R = 8000.0;
  const float H_M = 1200.0;
  const float MIE_G = 0.76;
  // 日の光の強さ（地面の明るさ = 反射率 × cos × 透過、になるように π を入れてある）
  const float SUN_E = 3.14159;
  // 何倍の光で画面が白くなるか
  const float EXPO = 2.2;

  // 高さ h（スケールハイトを単位）、地球の半径 X（同じ単位）、天頂からの角の cos で、空気の柱の量（スケールハイトを単位）
  float chapman(float X, float h, float c) {
    float k = sqrt(1.5708 * (X + h));
    if (c >= 0.0) return k / (k * c + 1.0) * exp(-h);
    // 下向き：いちばん低い所を通って向こうまで（地球に当たるなら、とても大きくなる）
    float x0 = sqrt(max(0.0, 1.0 - c * c)) * (X + h);
    float k0 = sqrt(1.5708 * x0);
    return 2.0 * k0 * exp(min(X - x0, 60.0)) - k / (1.0 - k * c) * exp(-h);
  }
  // 点（中心からの距離 r）から、向き（天頂となす角の cos が mu）へ、大気の外までの光の弱まり
  vec3 sunTau(float r, float mu) {
    float h = r - uR;
    float dR = H_R * chapman(uR / H_R, h / H_R, mu);
    float dM = H_M * chapman(uR / H_M, h / H_M, mu);
    return (B_R + B_O) * dR + B_M * 1.11 * dM;
  }
  float phaseR(float mu) { return 0.0596831 * (1.0 + mu * mu); }
  float phaseM(float mu) {
    float g2 = MIE_G * MIE_G;
    return 0.1193662 * (1.0 - g2) * (1.0 + mu * mu) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * MIE_G * mu, 1.5));
  }
  // 目（ro、中心から）から向き rd へ、tEnd まで（地面に当たる所、なければとても遠く）の、散らされて目に入る光と透過
  vec3 scatter(vec3 ro, vec3 rd, float tEnd, vec3 sun, out vec3 trans) {
    trans = vec3(1.0);
    float RA = uR + ATM_H;
    float b = dot(ro, rd);
    float c = dot(ro, ro) - RA * RA;
    float disc = b * b - c;
    if (disc <= 0.0) return vec3(0.0);
    float sq = sqrt(disc);
    float t0 = max(0.0, -b - sq);
    float t1 = min(tEnd, -b + sq);
    if (t1 <= t0) return vec3(0.0);
    // 点は、いちばん地球に近づく所（空気が濃い所）に集める：そこから両側へ、2 乗の間隔で
    float tm = clamp(-b, t0, t1);
    vec3 tau = vec3(0.0);
    vec3 sumR = vec3(0.0);
    vec3 sumM = vec3(0.0);
    #ifdef SCATTER_MS
    vec3 sumMS = vec3(0.0);
    #endif
    const int HALF = SCATTER_N / 2;
    for (int side = 0; side < 2; side++) {
      float L = side == 0 ? tm - t0 : t1 - tm;
      if (L <= 0.0) continue;
      vec3 tauS = vec3(0.0);
      // 手前の側は、目から近い順に積む（透過を順に掛けるため）。向こうの側は tm から先へ
      for (int i = 0; i < HALF; i++) {
        float x0 = float(i) / float(HALF);
        float x1 = float(i + 1) / float(HALF);
        float ta, tb;
        if (side == 0) {
          // 目（t0）から tm へ：tm の近くを細かく
          ta = tm - L * (1.0 - x0) * (1.0 - x0);
          tb = tm - L * (1.0 - x1) * (1.0 - x1);
        } else {
          ta = tm + L * x0 * x0;
          tb = tm + L * x1 * x1;
        }
        float ds = tb - ta;
        vec3 p = ro + rd * (0.5 * (ta + tb));
        float r = length(p);
        float h = max(0.0, r - uR);
        float dR = exp(-h / H_R) * ds;
        float dM = exp(-h / H_M) * ds;
        vec3 ext = (B_R + B_O) * dR + B_M * 1.11 * dM;
        vec3 st = sunTau(r, dot(p, sun) / r);
        vec3 T = exp(-(tau + 0.5 * ext + st));
        sumR += T * dR;
        sumM += T * dM;
        #ifdef SCATTER_MS
        // 何度も散らされてから目に入る光（空じゅうから来る、青い光）。日の光の弱まりを少しだけ受ける
        sumMS += exp(-(tau + 0.5 * ext + 0.3 * st)) * (B_R * dR + B_M * dM) * smoothstep(-0.12, 0.08, dot(p, sun) / r);
        #endif
        tau += ext;
      }
    }
    trans = exp(-tau);
    float mu = dot(rd, sun);
    vec3 single = (sumR * B_R * phaseR(mu) + sumM * B_M * phaseM(mu)) * SUN_E;
    #ifdef SCATTER_MS
    // 空の中（地上近く）から見る空だけ：1 回だけの散乱では、空の上の方が暗く、地平線が茶色くなりすぎる
    single += sumMS * SUN_E * SCATTER_MS * 0.0795775;
    #endif
    return single;
  }
  // 光の量 → 画面の明るさ（後で OUT_CHUNK が 2.2 乗で光の量へもどす）
  vec3 expose(vec3 L) { return pow(1.0 - exp(-EXPO * L), vec3(1.0 / 2.2)); }
`

const vert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vNw;
  varying vec3 vPw;
  varying vec3 vNl;
  void main() {
    vUv = uv;
    vNl = normal;
    vNw = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPw = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }
`

const frag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uClouds;
  uniform vec3 uSun;
  uniform float uNear;
  uniform float uLights;
  uniform float uNear2;
  uniform float uDetail;
  varying vec2 vUv;
  varying vec3 vNw;
  varying vec3 vPw;
  #ifdef MM_SCATTER
  uniform sampler2D uWater;
  uniform float uGlint;
  ${SCATTER_CHUNK}
  #ifdef MM_LOCAL_CLOUDS
  uniform vec3 uUp;
  uniform float uKeep;
  // 地面に固定した雲の座標：大気に入る所（地球の模型の中の向き uQ0）からの距離（m）。uE1・uE2 はその横・前の向き
  uniform vec3 uQ0;
  uniform vec3 uE1;
  uniform vec3 uE2;
  uniform vec2 uDrift;
  varying vec3 vNl;
  /*LOCAL_CLOUDS*/
  vec2 groundXY(vec3 nl) {
    float cs = dot(nl, uQ0);
    vec3 tv = nl - uQ0 * cs;
    float sn = length(tv);
    return sn > 1e-7 ? vec2(dot(tv, uE1), dot(tv, uE2)) / sn * atan(sn, cs) * uR : vec2(0.0);
  }
  /**
   * 帰り道の地球の雲（0〜1）。白い点が一面に同じようにならぶのではなく、本物の雲の写真のように：
   * ・地図の雲の多さ（region、数十〜数百 km のまとまり）で、晴れた海・積雲の集まった所・一面の雲を分ける
   * ・数十 km のゆがんだ模様で、積雲を集めたり（雲の島・すじ）、すき間をあけたりする
   * ・一つ一つの積雲（1〜2 km）は、画面の 1 画素より小さくなったら、その場所の平均の白さにする（ちらつかない）
   * 船の真下（uKeep の半径の中）は、海の上の場面と同じ雲（低くなったときに、空と海の場面へつながるように）
   */
  float wxCover(vec2 ps, vec2 gl, float region, float fp, float fpl) {
    // 大きな模様（数十〜数百 km）は地面に固定した座標で（遠くから近づくあいだ、雲の模様が地面といっしょに動く）。
    // 一つ一つの積雲は、海の上の場面と同じ座標で
    vec2 g = ps + uCloudOff;
    vec2 G = gl + uDrift;
    // 数百 km のまとまり（前線・低気圧の雲のかたまりと、晴れた海）。ゆがめて、丸い模様のくり返しにならないように
    vec2 a = G / 420000.0;
    vec2 w1 = vec2(cNoise(a + 1.7), cNoise(a + 6.2)) - 0.5;
    float syn = cNoise(G / 260000.0 + w1 * 2.0) * 0.7 + cNoise(G / 110000.0 + w1 * 1.4 + 2.9) * 0.3;
    // 数十 km のまとまり（積雲の島・すじ・すき間）
    vec2 b = G / 70000.0;
    vec2 w2 = vec2(cNoise(b + 3.1), cNoise(b * 1.3 + 8.7)) - 0.5;
    float meso = cNoise(G / 30000.0 + w2 * 1.8) * 0.65 + mix(cNoise(G / 9000.0 + w2 * 1.2 + 5.3), 0.5, smoothstep(2500.0, 9000.0, fpl)) * 0.35;
    meso = mix(meso, 0.5, smoothstep(9000.0, 40000.0, fpl));
    float big = region * 0.9 + 0.18 + (syn - 0.5) * 1.8 + (meso - 0.5) * 0.3;
    // 一面の雲のかたまり：ふちはくっきり（晴れた海との境目が、はっきり分かれる）
    float deck = smoothstep(0.66, 0.73, big);
    // 積雲の野：雲の多さは場所で変わる。晴れた海（big が小さい所）には出ない
    float dens = clamp(smoothstep(0.34, 0.66, big) + (meso - 0.5) * 1.1, 0.0, 1.0) * smoothstep(0.26, 0.36, big);
    float thr = mix(0.98, 0.4, dens);
    // 小さい積雲（約 2 km）と、大きく育った積雲の集まり（約 6 km）。1 画素より小さくなったら、その場所の平均の白さ
    vec2 q = g / 1800.0;
    float n = cNoise(q) * 0.5 + cNoise(q * 2.03 + 7.1) * 0.3 + cNoise(q * 4.1 + 3.3) * 0.2;
    float cu = mix(smoothstep(thr, thr + 0.22, n), clamp((0.72 - thr) / 0.45, 0.0, 1.0) * 0.8, smoothstep(350.0, 1800.0, fp));
    vec2 q2 = g / 6000.0;
    float n2 = cNoise(q2 + 11.0) * 0.6 + cNoise(q2 * 2.1 + 4.0) * 0.4;
    float cu2 = mix(smoothstep(thr + 0.04, thr + 0.3, n2), clamp((0.74 - thr) / 0.5, 0.0, 1.0) * 0.7, smoothstep(1200.0, 6000.0, fp));
    float sm = mix(n, 0.5, smoothstep(350.0, 1800.0, fp));
    float c = max(max(cu, cu2 * 0.9), deck * (0.82 + 0.18 * sm));
    // 船の真下（低くなったとき）は、海の上の場面と同じ雲
    float keep = 1.0 - smoothstep(uKeep * 0.55, uKeep + 1.0, length(ps));
    if (keep > 0.0) {
      float c0 = mix(smoothstep(0.15, 0.6, cCover(ps)), 0.1 * uCloudOn, smoothstep(500.0, 3000.0, fp));
      return mix(c * uCloudOn, c0, keep);
    }
    return c * uCloudOn;
  }
  #endif
  #endif
  float lhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(lhash(i), lhash(i + vec2(1.0, 0.0)), f.x), mix(lhash(i + vec2(0.0, 1.0)), lhash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  /** 雲の細かさ（0〜1、平均 0.5）。画面の 1 画素より細かい段は足さない（ちらつき止め） */
  float cloudDetail(vec2 uv) {
    vec2 p = uv * vec2(400.0, 200.0);
    float px = length(fwidth(p));
    float sum = 0.0;
    float amp = 0.5;
    float w = 0.0;
    for (int i = 0; i < 5; i++) {
      float k = 1.0 - smoothstep(0.25, 0.6, px);
      sum += (vnoise(p) - 0.5) * amp * k;
      w += amp;
      p *= 2.03;
      px *= 2.03;
      amp *= 0.55;
    }
    return 0.5 + sum / w * 1.4;
  }
  /** 街の明かりの細かさ：地図は 1 画素 10 km なので、ぼやけた橙のしみになる。
   *  本物を宇宙から見ると、明かりは町ごとの点と、道にそった線の集まり。約 1.2 km と 5 km の升ごとに、明るい升と暗い升をつくる */
  float cityGrain(vec2 uv) {
    vec2 g1 = uv * vec2(33000.0, 16500.0);
    vec2 g2 = uv * vec2(8000.0, 4000.0);
    float a = lhash(floor(g1));
    float b = lhash(floor(g2) + 7.0);
    float fine = pow(a, 4.0) * 3.2;
    float coarse = smoothstep(0.25, 0.85, b) * 1.6;
    float d = fine * (0.35 + coarse);
    // 升が画面の 1 画素より小さくなる遠く（地平線の近く）は、ちらつかないように平均の明るさへ
    float px = length(fwidth(g1));
    return mix(d, 0.62, smoothstep(0.5, 1.5, px));
  }
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNw);
    vec3 v = normalize(cameraPosition - vPw);
    float l = dot(n, uSun);
    float day = smoothstep(-0.08, 0.12, l);
    vec3 dayCol = texture2D(uDay, vUv).rgb;
    float cl = texture2D(uClouds, vUv).r;
    dayCol = mix(dayCol, vec3(0.95), smoothstep(0.15, 0.9, cl) * 0.9);
    dayCol *= max(0.0, l) * 1.25;
    // 夜の街の明かり（雲がかかると少し隠れる）
    vec3 night = texture2D(uNight, vUv).rgb * (1.0 - cl * 0.6);
    // 低い所から見ると地図の粗さ（1 画素 10 km）が目立つので、街の明かりは高く上がるほど強く
    night = pow(night, vec3(1.6)) * vec3(1.25, 0.95, 0.65) * 1.6 * uLights;
    // 近いときだけ、細かい点の集まりにする（遠くからは今までどおりの地図の明かり）
    night *= mix(1.0, cityGrain(vUv) / 0.62, uDetail);
    #ifdef MM_SCATTER
    {
      // 地面の色を光の量にして、太陽からの光（空気を通って赤くなる）で照らし、目までの空気でかすませる
      // 地図は sRGB として読むので、ここではもう光の量（反射率）
      vec3 alb = texture2D(uDay, vUv).rgb;
      // 雲の地図は 1 画素 10 km でぼやける。ふちを細かい起伏（約 100 km〜6 km）でけずって、本物の雲のようにくっきりさせる
      float cd = cloudDetail(vUv);
      float clx = clamp(cl + (cd - 0.5) * 1.6 * cl * (1.0 - cl) * 2.2, 0.0, 1.0);
      float cover = smoothstep(0.2, 0.75, clx) * 0.94;
      // 厚い雲のかたまりも、のっぺりした灰色ではなく、明るい頭と少し暗いすき間
      alb = mix(alb, vec3(0.6 + 0.22 * cd), cover);
      alb *= mix(1.0, 0.55, uNear);
      vec3 sunT = exp(-sunTau(uR + 200.0, l));
      // 空からの青い光（影の側をほんの少し）
      vec3 sky = vec3(0.03, 0.05, 0.09) * smoothstep(-0.15, 0.2, l);
      vec3 ground = alb * (max(0.0, l) * sunT + sky);
      // 夜の街の明かり（光の量）
      ground += pow(night, vec3(2.2)) * (1.0 - day) / EXPO;
      vec3 ro = cameraPosition - uCenter;
      vec3 rd = vPw - cameraPosition;
      float dist = length(rd);
      rd /= dist;
      // 球の網目は平らな三角形なので、vPw は本物の球より少し内側（遠くから見ると、かすみの差で網目が見えた）。視線と球の交点まで
      {
        float bb = dot(ro, rd);
        float cc = dot(ro, ro) - uR * uR;
        float disc = bb * bb - cc;
        if (disc > 0.0) {
          float th = -bb - sqrt(disc);
          if (th > 0.0) dist = th;
        }
      }
      // 船の下のあたり（着水する海）だけ：海の上の積雲（空と海の場面と同じ雲の地図）と、その影。
      // 地図の雲（1 画素 10 km）では見えない、1〜2 km の綿雲が、高さ 100 km からは一つ一つ見える
      float lcov = 0.0;
      #ifdef MM_LOCAL_CLOUDS
      {
        vec3 nn = normalize(ro + rd * dist);
        float cs = dot(nn, uUp);
        vec3 tv = nn - uUp * cs;
        float sn = length(tv);
        float ang = atan(sn, cs);
        vec3 ex = normalize(vec3(1.0, 0.0, 0.0) - uUp * uUp.x);
        vec3 ez = cross(ex, uUp);
        // 船の真下からの、海の上の場面と同じ向きの座標（m）
        vec2 ps = sn > 1e-7 ? vec2(dot(tv, ex), dot(tv, ez)) / sn * ang * uR : vec2(0.0);
        // 地面に固定した座標。大気に入る所から着水する所までの道（約 2,500 km）を中心に、広く
        vec2 gl = groundXY(normalize(vNl));
        float reg = 1.0 - smoothstep(3500000.0, 5000000.0, length(gl - vec2(0.0, -1300000.0)));
        if (reg > 0.0) {
          float fp = length(fwidth(ps));
          float fpl = length(fwidth(gl));
          float sy = max(0.08, dot(uSun, nn));
          vec2 st = vec2(dot(uSun, ex), dot(uSun, ez)) / sy * 1300.0;
          // 地図の雲を、ぼかして引く（約 50〜100 km のまとまり）
          float region = texture2D(uClouds, vUv, 3.0).r;
          float c0 = wxCover(ps, gl, region, fp, fpl) * reg;
          float c1 = smoothstep(0.0, 0.4, wxCover(ps + st, gl, region, fp, fpl)) * reg;
          // 雲の影（雲のない所の海に落ちる）と、雲そのもの（日の当たる頭は明るい）
          ground *= 1.0 - 0.7 * c1 * (1.0 - c0);
          vec3 cAlb = vec3(0.78) * (max(0.0, l) * sunT * mix(1.0, 0.7, c1) + sky * 2.0);
          ground = mix(ground, cAlb, c0 * (1.0 - cover));
          lcov = c0;
        }
      }
      #endif
      // 海の照り返し（サングリント）：風で波立った海面（波の傾きの散らばり σ² ≈ 0.02）に映る太陽
      float water = texture2D(uWater, vUv).r * (1.0 - cover) * (1.0 - lcov);
      if (water > 0.0 && l > 0.0) {
        vec3 vv = -rd;
        float nv = max(0.02, dot(n, vv));
        vec3 hv = normalize(uSun + vv);
        float nh = max(1e-3, dot(n, hv));
        float t2 = (1.0 - nh * nh) / (nh * nh);
        const float S2 = 0.012;
        float D = exp(-t2 / S2) / (3.14159 * S2 * nh * nh * nh * nh);
        float F = 0.02 + 0.98 * pow(1.0 - max(0.0, dot(hv, vv)), 5.0);
        // 画面が白くとびすぎないように、少し弱める（本物の写真でも、照り返しは銀色に光る程度）
        ground += sunT * (3.14159 * F * D / (4.0 * nv)) * water * uGlint * 0.3;
      }
      vec3 trans;
      vec3 inS = scatter(ro, rd, dist, uSun, trans);
      gl_FragColor = vec4(expose(ground * trans + inS), 1.0);
      ${OUT_CHUNK}
      return;
    }
    #endif
    vec3 col = mix(night, dayCol, day);
    // 夕焼けの帯
    float dusk = exp(-pow((l - 0.02) / 0.045, 2.0));
    col += vec3(0.6, 0.25, 0.08) * dusk * 0.12;
    // 大気：ふちほど青く光る（昼の側）
    // 低い軌道からは見える地面のほとんどが斜めなので、ふちの光は地平線のすぐ近くだけ
    float rim = pow(1.0 - max(0.0, dot(n, v)), mix(3.0, 9.0, uNear2));
    col += vec3(0.25, 0.5, 1.0) * rim * smoothstep(-0.2, 0.3, l) * 0.9;
    // 近いときは粗い地図が目立つので、少し暗く沈める
    col *= mix(1.0, 0.55, uNear);
    gl_FragColor = vec4(col, 1.0);
    ${OUT_CHUNK}
  }
`

/** scatter：大気の光の散乱を計算する（打ち上げの場面）。steps：視線にそって調べる点の数 */
/**
 * localClouds：船の下のあたりに、海の上の場面と同じ積雲を描く（帰りの場面）。glsl は cCover(vec2) を定める。
 * uniforms はその雲の地図の値（空と海の素材と同じものを、毎フレーム書く）
 */
export function earthMaterial(
  day: THREE.Texture,
  night: THREE.Texture,
  clouds: THREE.Texture,
  opt?: { scatter?: boolean; steps?: number; water?: THREE.Texture; localClouds?: { glsl: string; uniforms: Record<string, THREE.IUniform> } },
) {
  const local = opt?.scatter ? opt.localClouds : undefined
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag.replace('/*LOCAL_CLOUDS*/', local?.glsl ?? ''),
    defines: opt?.scatter ? { MM_SCATTER: '', SCATTER_N: opt.steps ?? 16, ...(local ? { MM_LOCAL_CLOUDS: '' } : {}) } : {},
    uniforms: {
      ...(local ? { ...local.uniforms, uUp: { value: new THREE.Vector3(0, 1, 0) }, uKeep: { value: 0 }, uQ0: { value: new THREE.Vector3(0, 1, 0) }, uE1: { value: new THREE.Vector3(1, 0, 0) }, uE2: { value: new THREE.Vector3(0, 0, 1) }, uDrift: { value: new THREE.Vector2() } } : {}),
      uCenter: { value: new THREE.Vector3() },
      uR: { value: 6_371_000 },
      uWater: { value: opt?.water ?? null },
      uGlint: { value: opt?.water ? 1 : 0 },
      uDay: { value: day },
      uNight: { value: night },
      uClouds: { value: clouds },
      uSun: { value: new THREE.Vector3(0, -1, 0) },
      uNear: { value: 0 },
      uLights: { value: 1 },
      uDetail: { value: 0 },
      uNear2: { value: 0 },
    },
  })
}

// 大気の外側の殻（ふちの青い光の輪）
const atmoVert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vNw;
  varying vec3 vPw;
  void main() {
    vNw = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPw = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }
`
const atmoFrag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uSun;
  uniform float uGlow;
  uniform float uSky;
  #ifdef MM_SCATTER
  ${SCATTER_CHUNK}
  #else
  uniform vec3 uCenter;
  uniform float uR;
  #endif
  varying vec3 vNw;
  varying vec3 vPw;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNw);
    vec3 v = normalize(cameraPosition - vPw);
    float rim = 1.0 - abs(dot(n, v));
    float a = pow(rim, 5.0);
    float lit = smoothstep(-0.35, 0.25, dot(n, uSun));
    // 夜の側のふちは光らない（本物の写真でも、夜の側の大気は見えない。うすい青の輪が点線のように見えていた）
    vec3 col = vec3(0.35, 0.6, 1.0) * lit * a;
    a *= lit;
    // 夜の大気光（酸素の緑の光）：高さ 90〜100 km の薄い層を真横から見るので、地平線の上に細い線になる
    vec3 d = -v;
    vec3 oc = uCenter - cameraPosition;
    float tc = dot(oc, d);
    float hTan = length(oc - d * tc) - uR;
    float g = tc > 0.0 ? exp(-pow((hTan - 95000.0) / 5500.0, 2.0)) : 0.0;
    vec3 q = normalize(cameraPosition + d * tc - uCenter);
    float night = 1.0 - smoothstep(-0.25, 0.05, dot(q, uSun));
    // 本物の写真の大気光は、一様な線ではなく、波のようにところどころ濃い（大気の重力波）
    float ripple = 0.72 + 0.28 * sin(dot(q, vec3(1100.0, 700.0, 900.0))) * sin(dot(q, vec3(-500.0, 1300.0, 300.0)) + 1.7);
    g *= ripple;
    // 線の下（地平線までのあいだ）にも、ごく淡い光（線だけがくっきり浮くと、描いた線のように見える）
    float under = tc > 0.0 && hTan > 0.0 ? smoothstep(95000.0, 20000.0, hTan) * 0.16 : 0.0;
    col += vec3(0.42, 0.8, 0.36) * (g + under) * night * 0.26 * uGlow;
    float alpha = max(a, (g + under) * night * uGlow);
    #ifdef MM_SCATTER
    {
      // 地球に当たらない視線：大気を通りぬける間に散らされた光（地平線の上の層）
      vec3 ro = cameraPosition - uCenter;
      float bb = dot(ro, d);
      // 地球の球は角ばった面（へこみ 最大 約 1.2 km）。高い所から見ると、面と本当の球のすきまが、水平線の黒い線になる。
      // すきまを通る視線は「地面に当たらない」ことにして、明るい大気の縁で埋める
      float rG = uR - 1500.0 * smoothstep(10000.0, 30000.0, length(ro) - uR);
      float cc = dot(ro, ro) - rG * rG;
      float disc = bb * bb - cc;
      float tHit = disc > 0.0 && -bb - sqrt(disc) > 0.0 ? -bb - sqrt(disc) : 1e12;
      vec3 trans;
      vec3 inS = scatter(ro, d, tHit, uSun, trans);
      vec3 sc = expose(inS);
      col = mix(col, sc + vec3(0.42, 0.8, 0.36) * (g + under) * night * 0.26 * uGlow, uSky);
      alpha = mix(alpha, 1.0, uSky);
    }
    #endif
    gl_FragColor = vec4(col, alpha);
    ${OUT_CHUNK}
  }
`

/** scatter：光の散乱で空の層を描く（uSky で、地上近くの古い見え方から切りかえる） */
export function atmosphereMaterial(opt?: { scatter?: boolean; steps?: number }) {
  return new THREE.ShaderMaterial({
    vertexShader: atmoVert,
    fragmentShader: atmoFrag,
    defines: opt?.scatter ? { MM_SCATTER: '', SCATTER_N: opt.steps ?? 16 } : {},
    uniforms: { uSun: { value: new THREE.Vector3(0, -1, 0) }, uCenter: { value: new THREE.Vector3() }, uR: { value: 6_371_000 }, uGlow: { value: 0 }, uSky: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  })
}
