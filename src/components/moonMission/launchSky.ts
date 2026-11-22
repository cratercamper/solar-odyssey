import * as THREE from 'three'
import { loadCatalog } from '../Sky'
import { MILKY_WAY_ROTATION } from '../../data/skyFrame'
import { OUT_CHUNK, encodeOutput } from './shaderOut'
import { launchSkyRotation, type SkyNow } from './launchClock'

// 打ち上げの場面の空：本物の星表（9,000 個ほどの星）を、1972 年 12 月 7 日 0 時 33 分（米東部時間）の
// ケネディ宇宙センターの空の向きに並べる。南の高い空にオリオン座、東からしし座が昇ってくる。
//
// 地面の組の座標（x 東、y 上、z 南）は、離昇の瞬間の three の座標と同じ。星は地球の自転と関係なく
// 宇宙に止まっているので、three の座標でそのまま止めておく（地面の組だけが回る）。
//
// 地上では空気があるので：
// - 地平線に近い星ほど暗い（空気の層を斜めに通るので、光が弱まる）
// - 星が少しまたたく（高く上がると止まる）
// - 天の川の淡い光は、目で見える程度にごく弱く（満月の夜を大げさにしない）
//
// 観察パートとタイムラプス（launchClock.ts）では、夕方の空の色（青い空・夕焼け・地球の影）と、昇ってくる満月も描く。
// 空が明るいあいだは星は見えない。

const vert = /* glsl */ `
  attribute float mag;
  attribute vec3 color;
  uniform float uPx;
  uniform float uTime;
  uniform float uAir;
  uniform vec3 uUp;
  uniform float uVis;
  uniform float uGlare;
  uniform float uDip;
  varying vec3 vColor;
  varying float vSize;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 dir = normalize(mat3(modelMatrix) * position);
    float alt = dot(dir, uUp);
    // 空気の層を通る長さ（地平線ほど長い）で暗く。地平線の下は見えない
    float air = mix(1.0, smoothstep(-0.01, 0.22, alt), uAir);
    // 宇宙から見ると、地平線は下がる（高さ 100 km で 10°）。その下の星は、地球の陰で見えない
    air *= smoothstep(-uDip - 0.002, -uDip + 0.002, alt);
    // またたき：星ごとに違う速さで、空気のある所だけ
    float h = hash(position);
    float tw = 1.0 + uAir * 0.28 * sin(uTime * (7.0 + 9.0 * h) + h * 40.0) * (1.0 - 0.6 * smoothstep(0.2, 0.9, alt));
    // 発射台の照明と海辺のもやで、暗い星（4.5 等より暗い）は地上ではほとんど見えない
    float seeing = mix(1.0, smoothstep(6.3, 4.6, mag), uAir);
    // 空が明るい（夕方・満月の夜）と、暗い星から消える
    float vis = clamp(uVis * 1.6 - (mag - 1.0) * (1.0 - uVis) * 0.5, 0.0, 1.0);
    float flux = pow(10.0, -0.4 * (mag - 1.5) * 0.66) * air * tw * seeing * vis * (1.0 - uGlare) * (1.0 - uGlare);
    float size = clamp(1.4 + 1.9 * sqrt(flux), 1.4, 6.5);
    vSize = size * max(uPx, 1.0);
    vColor = color * min(flux * 2.6, 3.6);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = vSize + 2.0;
    if (air < 0.003 || vis < 0.003) gl_PointSize = 0.0;
  }
`
const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vSize;
  void main() {
    float r = length(gl_PointCoord - 0.5) * (vSize + 2.0);
    float core = exp(-r * r / (0.18 * vSize * vSize + 0.35));
    if (core < 0.004) discard;
    gl_FragColor = vec4(vColor * core, 1.0);
  }
`

// 夕方の空の色：天頂の青、地平線のもや、太陽のほうの夕焼け、反対の空の地球の影とビーナスの帯、月のまわりの明るさ
const domeVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = mat3(modelMatrix) * position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
/** 空の色（d の向き、太陽・月の向き、月の輝き、上）。水面の映り込み（water.ts）でも使う。太陽・月の円盤そのものは入れない */
export const SKY_CHUNK = /* glsl */ `
  vec3 skyColor(vec3 d, vec3 sun, vec3 moon, float moonLit, vec3 up) {
    float y = dot(d, up);
    float yy = max(y, 0.0);
    float sy = dot(sun, up);
    float c = dot(d, sun);
    // 昼の青 → 薄明 → 夜
    float day = smoothstep(-0.12, 0.3, sy);
    float twi = smoothstep(-0.3, -0.02, sy) * (1.0 - smoothstep(0.08, 0.45, sy));
    vec3 zen = mix(vec3(0.004, 0.006, 0.014), vec3(0.16, 0.3, 0.62), day);
    vec3 hor = mix(vec3(0.01, 0.012, 0.02), vec3(0.62, 0.68, 0.78), day);
    vec3 col = mix(hor, zen, pow(yy, 0.42));
    // 夕焼け：太陽のほうの地平線が橙に、上へいくほど黄色からうすい桃色
    float near = pow(c * 0.5 + 0.5, 5.0);
    float band = exp(-yy * 6.0);
    col += twi * band * (vec3(1.0, 0.42, 0.12) * 1.25 * near + vec3(0.28, 0.16, 0.22) * 0.35);
    col += twi * exp(-yy * 2.2) * near * vec3(0.35, 0.22, 0.08) * 0.6;
    // 太陽と反対の空：地平線のすぐ上に暗い青の地球の影、その上に桃色の帯
    float anti = pow(max(-c * 0.5 + 0.5, 0.0), 3.0);
    col += twi * anti * exp(-abs(yy - 0.12) * 16.0) * vec3(0.42, 0.26, 0.32) * 0.5;
    col *= 1.0 - twi * anti * exp(-yy * 22.0) * 0.45;
    // 月明かりの夜空と、月のまわりの広い明るさ
    float mUp = smoothstep(-0.03, 0.08, dot(moon, up));
    float mc = max(dot(d, moon), 0.0);
    col += mUp * moonLit * (vec3(0.5, 0.55, 0.65) * pow(mc, 30.0) * 0.06 + vec3(0.008, 0.012, 0.024) * (1.0 - day));
    // 地平線の下はもやの色
    if (y < 0.0) col = hor * 0.55 * (1.0 + day);
    return col;
  }
`
const domeFrag = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uMoon;
  uniform float uMoonLit;
  uniform float uAir;
  uniform vec3 uUp;
  varying vec3 vDir;
  ${SKY_CHUNK}
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = skyColor(d, uSun, uMoon, uMoonLit, uUp);
    float c = dot(d, uSun);
    // 太陽のまわり（地平線より上にいるとき）と、月のすぐまわり
    float sunUp = smoothstep(-0.02, 0.01, dot(uSun, uUp));
    col += sunUp * vec3(1.0, 0.62, 0.3) * (pow(max(c, 0.0), 900.0) * 6.0 + pow(max(c, 0.0), 40.0) * 0.35);
    float mUp = smoothstep(-0.03, 0.08, dot(uMoon, uUp));
    col += mUp * uMoonLit * vec3(0.5, 0.55, 0.65) * pow(max(dot(d, uMoon), 0.0), 600.0) * 0.5;
    if (dot(d, uUp) < 0.0) col = skyColor(d, uSun, uMoon, uMoonLit, uUp);
    gl_FragColor = vec4(col * uAir, 1.0);
    ${OUT_CHUNK}
  }
`
// 月：昇ったばかりの月は赤みがかって暗い。欠け方は太陽の向きから
const moonVert = /* glsl */ `
  varying vec3 vN;
  varying vec2 vUv;
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const moonFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSun;
  uniform vec3 uTint;
  uniform float uPower;
  varying vec3 vN;
  varying vec2 vUv;
  void main() {
    float l = smoothstep(-0.04, 0.25, dot(normalize(vN), uSun));
    // 色は画面に出る明るさで書く（OUT_CHUNK が光の量にもどす）
    vec3 tex = pow(texture2D(uMap, vUv).rgb, vec3(1.0 / 2.2));
    gl_FragColor = vec4(tex * (l * uTint * uPower + 0.02), 1.0);
    ${OUT_CHUNK}
  }
`

/** 月の見かけの大きさ（本物の 0.52° を、昇る月の大きく見える感じに少しだけ大きく） */
const MOON_SCALE = 2.2
const MOON_DIST = 1700

export type LaunchSky = {
  /** 天の川の淡い光の球と、星の点をまとめた組（カメラについて動く） */
  stars: THREE.Group
  /** カメラの位置へ。up は地面の上の向き（three の座標）、h は高さ m、t は秒、sky は空の時計（launchClock.ts）、dusk は夕方の空を描くか */
  /** glare：炎がまぶしくてカメラの露出が下がっている割合（0〜1）。露出が下がると、星は写らない */
  update(camera: THREE.Camera, up: THREE.Vector3, h: number, t: number, sky: SkyNow, dusk: boolean, glare?: number): void
  dispose(): void
}


const X = new THREE.Vector3(1, 0, 0)
const _m = new THREE.Vector3()

export function buildSky(glowTex: THREE.Texture, moonTex: THREE.Texture): LaunchSky {
  const group = new THREE.Group()
  group.name = 'LaunchSky'
  const rot = launchSkyRotation()
  // 天の川の淡い光：星表の星と同じ向きに回す（全天画像はアプリの座標で MILKY_WAY_ROTATION）
  const glowGeo = new THREE.SphereGeometry(1900, 48, 24)
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, side: THREE.BackSide, depthWrite: false, depthTest: false, color: '#1c1c1c' })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  glow.quaternion.copy(rot).multiply(MILKY_WAY_ROTATION)
  glow.renderOrder = -11
  group.add(glow)
  // 空の色の球（天の川の光の後、星の前に足す）
  const domeGeo = new THREE.SphereGeometry(1800, 64, 32)
  const domeMat = encodeOutput(
    new THREE.ShaderMaterial({
      uniforms: { uSun: { value: new THREE.Vector3() }, uMoon: { value: new THREE.Vector3() }, uMoonLit: { value: 1 }, uAir: { value: 1 }, uUp: { value: new THREE.Vector3(0, 1, 0) } },
      vertexShader: domeVert,
      fragmentShader: domeFrag,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    }),
  )
  const dome = new THREE.Mesh(domeGeo, domeMat)
  dome.renderOrder = -10.5
  dome.frustumCulled = false
  dome.visible = false
  group.add(dome)
  // 月
  const moonGeo = new THREE.SphereGeometry(MOON_DIST * Math.tan(THREE.MathUtils.degToRad(0.26)) * MOON_SCALE, 48, 24)
  const moonMat = encodeOutput(
    new THREE.ShaderMaterial({
      uniforms: { uMap: { value: moonTex }, uSun: { value: new THREE.Vector3() }, uTint: { value: new THREE.Color(1, 1, 1) }, uPower: { value: 1.5 } },
      vertexShader: moonVert,
      fragmentShader: moonFrag,
      depthTest: false,
      depthWrite: false,
    }),
  )
  const moon = new THREE.Mesh(moonGeo, moonMat)
  moon.renderOrder = -9
  moon.frustumCulled = false
  group.add(moon)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 }, uTime: { value: 0 }, uAir: { value: 1 }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uVis: { value: 1 }, uGlare: { value: 0 }, uDip: { value: 0 } },
    vertexShader: vert,
    fragmentShader: frag,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  })
  let points: THREE.Points | null = null
  let alive = true
  loadCatalog().then(
    (geo) => {
      if (!alive) return
      points = new THREE.Points(geo, mat)
      points.quaternion.copy(rot)
      points.frustumCulled = false
      points.renderOrder = -10
      group.add(points)
    },
    () => {},
  )
  return {
    stars: group,
    update(camera, up, h, t, sky, dusk, glare = 0) {
      group.position.copy(camera.position)
      mat.uniforms.uUp.value.copy(up)
      // 空気は 10〜40 km でほとんどなくなる
      const air = 1 - THREE.MathUtils.smoothstep(h, 10_000, 40_000)
      mat.uniforms.uAir.value = air
      mat.uniforms.uTime.value = t
      mat.uniforms.uPx.value = Math.min(2, window.devicePixelRatio || 1)
      // 星の向き（地上にいるあいだの空の時計。離昇の後は離昇の瞬間の向きのまま）
      if (points) points.quaternion.copy(sky.stars)
      glow.quaternion.copy(sky.stars).multiply(MILKY_WAY_ROTATION)
      // 空の明るさ：日が沈んで 6° までは星は見えず、18° で全部。満月が高いと暗い星は消える
      const sunY = sky.sun.y
      const moonY = Math.max(0, sky.moon.y)
      const dark = THREE.MathUtils.smoothstep(-sunY, 0.06, 0.3)
      const vis = dark * (1 - 0.55 * sky.moonLit * Math.sqrt(moonY))
      mat.uniforms.uVis.value = 1 - (1 - vis) * air
      mat.uniforms.uGlare.value = glare
      mat.uniforms.uDip.value = Math.sin(Math.acos(6_371_000 / (6_371_000 + Math.max(0, h))))
      // 天の川の光は、宇宙に出ると少し見えやすく。月夜・夕方は見えない
      glowMat.color.setScalar((0x1c / 255) * (1 + 1.2 * (1 - air)) * (1 - (1 - vis * vis * (1 - sky.moonLit * moonY)) * air) * (1 - glare))
      dome.visible = dusk && air > 0
      if (dome.visible) {
        domeMat.uniforms.uSun.value.copy(sky.sun)
        domeMat.uniforms.uMoon.value.copy(sky.moon)
        domeMat.uniforms.uMoonLit.value = sky.moonLit
        domeMat.uniforms.uAir.value = air
        domeMat.uniforms.uUp.value.copy(up)
      }
      // 月：地上にいるあいだだけ（宇宙に出てからの月は LaunchWorld の本物の大きさの月）
      moon.visible = air > 0.5 && sky.moon.y > -0.03
      if (moon.visible) {
        moon.position.copy(sky.moon).multiplyScalar(MOON_DIST)
        // 表側（模様の地図の真ん中、球の +x）を地球に向ける
        moon.quaternion.setFromUnitVectors(X, _m.copy(sky.moon).negate())
        moonMat.uniforms.uSun.value.copy(sky.sun)
        // 低い月は、空気を長く通るので赤く暗い
        const k = THREE.MathUtils.smoothstep(sky.moon.y, -0.01, 0.3)
        moonMat.uniforms.uTint.value.setRGB(1, 0.55 + 0.45 * k, 0.32 + 0.68 * k)
        moonMat.uniforms.uPower.value = 1.25 + 1.0 * k
      }
    },
    dispose() {
      alive = false
      glowGeo.dispose()
      glowMat.dispose()
      domeGeo.dispose()
      domeMat.dispose()
      moonGeo.dispose()
      moonMat.dispose()
      mat.dispose()
      // 星表の形は Sky.tsx と共有しているので消さない
    },
  }
}
