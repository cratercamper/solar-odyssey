import * as THREE from 'three'
import { OUT_CHUNK, encodeOutput } from './shaderOut'
import { SKY_CHUNK } from './launchSky'

// 発射場のまわりの水（大西洋・湿地の池・入り江）。本物の水面は、空をそのまま映すのではなく、
// 小さな波の 1 つ 1 つが光を少しずつちがう向きへ返すので、明かりは縦に長くのびて、ちらちら揺れる。
//
// - 波：向きと長さのちがう波を重ね、動かす（海はうねり、湿地の池は風のさざ波だけ）。遠くの細かい波は、ちらつかないように消す
// - 映るもの：空の色（夕方の空・月明かりの空。launchSky の SKY_CHUNK と同じ式）、月と太陽、
//   投光器の列、点火の炎、そして照らされた白いロケット（縦の柱として、波でゆがんだ帯にする）
// - 水を斜めから見るほど強く映る（フレネル）。真上から見ると、暗い水の色
// - 鏡の絵（renderMirror）：水面で折り返したカメラから景色を描き、波でゆがめて読む。光った煙・炎・塔の明かりがそのまま映る
// - 打ち上げの画面は奥行きが対数（logarithmicDepthBuffer）なので、logdepthbuf を入れる（無いと煙が水の手前に描かれる）。
//   polygonOffset は効かないので、湿地の池は陸の板から 17 cm 上に置いてある
//
// 座標は地面の組の中（x 東、y 上、z 南）。地面の組は離昇の後に回るので、カメラも組の中へ直して渡す。

export const WATER_LIGHTS = 6

const vert = /* glsl */ `
  #include <common>
  uniform mat4 uToGround;
  varying vec3 vP;
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vP = (uToGround * w).xyz;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }
`

const frag = /* glsl */ `
  uniform vec3 uCam;
  uniform float uTime;
  uniform vec3 uSun;
  uniform vec3 uMoon;
  uniform float uMoonLit;
  uniform float uDusk;
  uniform vec3 uLightPos[${WATER_LIGHTS}];
  uniform vec3 uLightCol[${WATER_LIGHTS}];
  uniform vec4 uRocket;
  uniform vec3 uRocketCol;
  uniform float uCoast;
  uniform sampler2D uMirror;
  uniform mat4 uMirrorVP;
  uniform mat4 uFromGround;
  uniform float uMirrorOn;
  uniform float uSkyK;
  varying vec3 vP;
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  ${SKY_CHUNK}

  // 1 つの波の傾き（高さ a、波の数 k、向き dir、速さ w）
  vec2 wave(vec2 p, vec2 dir, float k, float a, float w, float fade) {
    float ph = dot(p, dir) * k - uTime * w;
    return dir * (a * k * cos(ph) * fade);
  }

  float hash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 q) {
    vec2 i = floor(q);
    vec2 f = fract(q);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 V = uCam - vP;
    float dist = length(V);
    V /= dist;
    // 波の場所を少しずつずらし（すじがまっすぐ並ばないように）、風の当たる所・凪いだ所のまだらを作る
    vec2 p = vP.xz + 9.0 * vec2(vnoise(vP.xz * 0.013 + 3.1), vnoise(vP.xz * 0.013 - 7.4)) ;
    float gust = 0.35 + 1.1 * vnoise(vP.xz * 0.006 + vec2(uTime * 0.02, 0.0)) * vnoise(vP.xz * 0.021 - 1.7);
    // 海（海岸より東）はうねりが大きく、湿地の池・入り江は風のさざ波
    float sea = smoothstep(uCoast + 1200.0, uCoast + 3800.0, p.x);
    // 岸のすぐ外は浅い潟（草の島と、おだやかな水）
    float shoal = 1.0 - smoothstep(uCoast + 1800.0, uCoast + 3400.0, vP.x);
    float amp = mix(0.35, 1.0, sea);
    // 遠くほど細かい波を消す（画面の 1 画素より小さい波は、ちらつくだけ）
    float px = dist * 0.0016;
    vec2 g = vec2(0.0);
    g += wave(p, normalize(vec2(0.8, 0.6)), 0.045, 0.55 * sea, 0.55, 1.0);
    g += wave(p, normalize(vec2(0.95, -0.3)), 0.11, 0.18, 0.9, 1.0 - smoothstep(0.3, 1.0, px * 0.11));
    g += wave(p, normalize(vec2(-0.2, 1.0)), 0.27, 0.07, 1.6, 1.0 - smoothstep(0.3, 1.0, px * 0.27));
    g += wave(p, normalize(vec2(0.6, -0.8)), 0.63, 0.028, 2.5, 1.0 - smoothstep(0.3, 1.0, px * 0.63));
    g += wave(p, normalize(vec2(-0.9, -0.45)), 1.45, 0.011, 3.8, 1.0 - smoothstep(0.3, 1.0, px * 1.45));
    g += wave(p, normalize(vec2(0.25, 0.97)), 3.1, 0.0045, 5.6, 1.0 - smoothstep(0.3, 1.0, px * 3.1));
    g *= amp * gust;
    // 遠くで消えた細かい波のぶん、映り込みをぼかす（光が縦に長くのびる元）
    float rough = 0.04 + 0.11 * smoothstep(20.0, 2500.0, dist);
    vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
    float cosV = max(dot(N, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
    vec3 R = reflect(-V, N);
    R.y = abs(R.y);

    // ここからは光の量（リニア）で足して、最後に画面の明るさの値へもどす（OUT_CHUNK がまた光の量にする）
    vec3 sky = pow(skyColor(R, uSun, uMoon, uMoonLit, vec3(0.0, 1.0, 0.0)), vec3(2.2));
    vec3 col = sky * uDusk * F * uSkyK;
    // 水の中の色（ごく暗い青緑）
    col += vec3(0.0004, 0.0012, 0.0016) * (0.3 + uDusk) * (1.0 - F);

    // 光のきらめき：波の面の向きが、明かりを目へ返す向きに近いほど。遠くは波がぼけて広く薄く（正規化した Blinn）
    float shin = 1.0 / (rough * rough);
    float shinD = shin * 2.0;
    float nrm = (shin + 8.0) / 25.13;
    float nrmD = (shinD + 8.0) / 25.13;
    vec3 Hs = normalize(uSun + V);
    col += vec3(1.0, 0.55, 0.25) * 2.5 * nrmD * pow(max(dot(N, Hs), 0.0), shinD) * smoothstep(-0.01, 0.02, uSun.y) * F;
    vec3 Hm = normalize(uMoon + V);
    col += vec3(0.75, 0.75, 0.7) * 0.35 * uMoonLit * nrmD * pow(max(dot(N, Hm), 0.0), shinD) * smoothstep(-0.01, 0.04, uMoon.y) * F;

    // 鏡の絵（水面で折り返した向きから描いた景色：煙・炎・ロケット・塔・星）。
    // 波でかたむいた面が返す向き R の先の点を、鏡のカメラで見た位置で読む。斜めから見ると、横にはほとんどずれず縦に大きくずれるので、光は縦にのびる
    if (uMirrorOn > 0.5) {
      float D = clamp(length(uRocket.xz - vP.xz), 250.0, 8000.0);
      vec3 mc = vec3(0.0);
      // 遠くの細かい波のぼけ：返す向きを縦に少しずつずらして重ねる
      for (int k = 0; k < 4; k++) {
        float o = (float(k) - 1.5) * rough * 0.5;
        vec3 Rk = normalize(R + vec3(0.0, o, 0.0));
        vec4 q = uMirrorVP * (uFromGround * vec4(vP + Rk * D, 1.0));
        vec2 uv = q.xy / q.w * 0.5 + 0.5;
        float inside = step(0.0, q.w) * step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        mc += texture2D(uMirror, clamp(uv, 0.001, 0.999)).rgb * inside;
      }
      col += mc * 0.25 * F;
    }

    // 投光器と炎：近い明かりほど強く、波で縦にのびる
    for (int i = 0; i < ${WATER_LIGHTS}; i++) {
      vec3 L = uLightPos[i] - vP;
      float ld = length(L);
      L /= ld;
      vec3 H = normalize(L + V);
      col += uLightCol[i] * nrm * pow(max(dot(N, H), 0.0), shin) * F * 4.0e4 / (ld * ld + 1.0e4);
    }

    // 照らされたロケット（白い縦の柱）：映る向きの線が、ロケットの軸のすぐそばを通るなら
    vec2 rd = R.xz;
    float rl = max(dot(rd, rd), 1e-6);
    vec2 toAxis = uRocket.xz - vP.xz;
    float t = max(dot(toAxis, rd) / rl, 0.0);
    vec2 miss = vP.xz + rd * t - uRocket.xz;
    float hy = vP.y + R.y * t - uRocket.y;
    float width = 5.0 + t * rough * 0.6;
    float onRocket = (1.0 - smoothstep(width * 0.5, width, length(miss))) * step(0.0, hy) * (1.0 - smoothstep(uRocket.w - 4.0, uRocket.w, hy));
    col += pow(uRocketCol, vec3(2.2)) * onRocket * F * 5.0 / (1.0 + width * 0.08) * (1.0 - uMirrorOn);

    // 湿地の池：水面から出た草のかたまり（映り込みをさえぎる暗いまだら）
    float grass = smoothstep(0.56, 0.62, vnoise(vP.xz * vec2(0.0035, 0.006) + 11.0) * 0.7 + vnoise(vP.xz * 0.03) * 0.3) * shoal;
    col = mix(col, vec3(0.0006, 0.0008, 0.0005) * (0.2 + uDusk), grass);

    col = pow(col, vec3(1.0 / 2.2));
    gl_FragColor = vec4(col, 1.0);
    ${OUT_CHUNK}
    #include <fog_fragment>
  }
`

export type Water = {
  material: THREE.ShaderMaterial
  /** 地面の組（中へ直す行列のため）、カメラ、時刻、空の様子 */
  update(o: {
    ground: THREE.Object3D
    camera: THREE.Camera
    t: number
    sun: THREE.Vector3
    moon: THREE.Vector3
    moonLit: number
    dusk: number
    /** 明かり（地面の組の座標）と色（画面の明るさの値）。WATER_LIGHTS 個まで */
    lights: { pos: THREE.Vector3; col: THREE.Color }[]
    /** ロケットの根元（地面の組の座標）と高さ、色（照らされた明るさ） */
    rocket: THREE.Vector3
    rocketH: number
    rocketCol: THREE.Color
    /** 空のドーム（夕方の空）が鏡の絵に入っているか（入っていれば、式の空は足さない） */
    domeShown: boolean
  }): void
  /**
   * 鏡の絵を描く（画面を描く前に毎フレーム）。水面の高さ planeY（地面の組の座標）で折り返したカメラから、水を消して景色を描く。
   * on が false なら描かず、式の空と光の柱だけで映す（画質「軽量」・スマホ）
   */
  renderMirror(o: { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; ground: THREE.Object3D; planeY: number; on: boolean }): void
  dispose(): void
}

const _n = new THREE.Vector3()
const _pp = new THREE.Vector3()
const _cw = new THREE.Vector3()
const _view = new THREE.Vector3()
const _look = new THREE.Vector3()
const _target = new THREE.Vector3()
const _rot = new THREE.Matrix4()
const _plane = new THREE.Plane()
const _clip = new THREE.Vector4()
const _q = new THREE.Vector4()
const _size = new THREE.Vector2()

export function buildWater(coastX: number): Water {
  const material = encodeOutput(
    new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uToGround: { value: new THREE.Matrix4() },
          uCam: { value: new THREE.Vector3() },
          uTime: { value: 0 },
          uSun: { value: new THREE.Vector3(0, -1, 0) },
          uMoon: { value: new THREE.Vector3(0, -1, 0) },
          uMoonLit: { value: 0 },
          uDusk: { value: 0 },
          uLightPos: { value: Array.from({ length: WATER_LIGHTS }, () => new THREE.Vector3(0, -1e4, 0)) },
          uLightCol: { value: Array.from({ length: WATER_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
          uRocket: { value: new THREE.Vector4(0, 0, 0, 110) },
          uRocketCol: { value: new THREE.Color(0, 0, 0) },
          uCoast: { value: coastX },
          uMirror: { value: null },
          uMirrorVP: { value: new THREE.Matrix4() },
          uFromGround: { value: new THREE.Matrix4() },
          uMirrorOn: { value: 0 },
          uSkyK: { value: 1 },
        },
      ]),
      vertexShader: vert,
      fragmentShader: frag,
      fog: true,
    }),
  )
  const u = material.uniforms
  let rt: THREE.WebGLRenderTarget | null = null
  const mirrorCam = new THREE.PerspectiveCamera()
  return {
    material,
    renderMirror({ gl, scene, camera, ground, planeY, on }) {
      u.uMirrorOn.value = 0
      if (!on) return
      ground.updateMatrixWorld()
      _rot.extractRotation(ground.matrixWorld)
      _n.set(0, 1, 0).applyMatrix4(_rot).normalize()
      _pp.set(0, planeY, 0).applyMatrix4(ground.matrixWorld)
      _cw.setFromMatrixPosition(camera.matrixWorld)
      _view.subVectors(_pp, _cw)
      // カメラが水面より下（離昇の後に地面の組が回ったとき・宇宙）なら映さない
      if (_view.dot(_n) > 0) return
      // 鏡の絵は画面の半分の大きさ（重さを抑える）
      gl.getDrawingBufferSize(_size)
      const w = Math.max(64, Math.round(_size.x * 0.5))
      const h = Math.max(64, Math.round(_size.y * 0.5))
      if (!rt) rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true })
      else if (rt.width !== w || rt.height !== h) rt.setSize(w, h)
      _view.reflect(_n).negate().add(_pp)
      _rot.extractRotation(camera.matrixWorld)
      _look.set(0, 0, -1).applyMatrix4(_rot).add(_cw)
      _target.subVectors(_pp, _look).reflect(_n).negate().add(_pp)
      mirrorCam.position.copy(_view)
      mirrorCam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n)
      mirrorCam.lookAt(_target)
      mirrorCam.near = camera.near
      mirrorCam.far = camera.far
      mirrorCam.updateMatrixWorld()
      mirrorCam.projectionMatrix.copy(camera.projectionMatrix)
      u.uMirrorVP.value.multiplyMatrices(mirrorCam.projectionMatrix, mirrorCam.matrixWorldInverse)
      u.uFromGround.value.copy(ground.matrixWorld)
      // 水面より下のものを描かない斜めの近い面（Lengyel の方法。three の Reflector と同じ）
      _plane.setFromNormalAndCoplanarPoint(_n, _pp).applyMatrix4(mirrorCam.matrixWorldInverse)
      _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant)
      const pm = mirrorCam.projectionMatrix.elements
      _q.set((Math.sign(_clip.x) + pm[8]) / pm[0], (Math.sign(_clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14])
      _clip.multiplyScalar(2 / _clip.dot(_q))
      pm[2] = _clip.x
      pm[6] = _clip.y
      pm[10] = _clip.z + 1
      pm[14] = _clip.w
      material.visible = false
      const prevRt = gl.getRenderTarget()
      const prevShadow = gl.shadowMap.autoUpdate
      gl.shadowMap.autoUpdate = false
      gl.setRenderTarget(rt)
      gl.state.buffers.depth.setMask(true)
      gl.clear()
      gl.render(scene, mirrorCam)
      gl.setRenderTarget(prevRt)
      gl.shadowMap.autoUpdate = prevShadow
      material.visible = true
      u.uMirror.value = rt.texture
      u.uMirrorOn.value = 1
    },
    dispose() {
      rt?.dispose()
    },
    update(o) {
      o.ground.updateMatrixWorld()
      u.uToGround.value.copy(o.ground.matrixWorld).invert()
      u.uCam.value.copy(o.camera.position).applyMatrix4(u.uToGround.value)
      u.uTime.value = o.t
      u.uSun.value.copy(o.sun)
      u.uMoon.value.copy(o.moon)
      u.uMoonLit.value = o.moonLit
      u.uDusk.value = o.dusk
      for (let i = 0; i < WATER_LIGHTS; i++) {
        const l = o.lights[i]
        if (l) {
          u.uLightPos.value[i].copy(l.pos)
          u.uLightCol.value[i].copy(l.col)
        } else u.uLightCol.value[i].setRGB(0, 0, 0)
      }
      u.uRocket.value.set(o.rocket.x, o.rocket.y, o.rocket.z, o.rocketH)
      u.uRocketCol.value.copy(o.rocketCol)
      u.uSkyK.value = o.domeShown && u.uMirrorOn.value > 0.5 ? 0 : 1
    },
  }
}
