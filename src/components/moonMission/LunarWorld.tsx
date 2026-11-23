import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { buildChunk, chunkCenterDir, chunkSize, keyOf, MOON_R, type ChunkKey } from '../flight/moonGlobe'
import { loadCatalog } from '../Sky'
import { currentLevel, lowMemory } from '../../state/quality'
import { lunar, tickLunar, UNDOCK_BEFORE, useMoonLunar } from '../../state/moonLunar'
import { autoCam, useMoonMission, type MissionCam } from '../../state/moonMission'
import { FRAME, groundAt, loadLunarMaps, lunarMaps, SUN_DIR, TRACK, TRACK_PLANE, valleyShadows, valleyWeight, type LunarMaps, type ShadowMap } from './lunarTerrain'
import { earthMaterial, atmosphereMaterial } from './earth'
import { plumeGeometry, plumeMaterial } from './plume'
import { APOLLO_URL, DROGUE, useCraft, type Craft } from './craft'
import { applyCraftZoom, resetCraftZoom, useCraftZoom } from './craftZoom'
import { useSpaceEnv } from './spaceEnv'
import { buildLmCabin, LM_EYE, LM_LOOK, type LmCabin } from './lmCabin'
import { radialGlowTexture } from '../radialGlow'

// 月ミッション第2弾の場面：月を丸ごと（月の中心が原点、向きは moonGlobe.ts と同じ）。
// 月の地面は四分木のかけら（着陸地点のまわりは本物の谷の地形と、前もって計算した山の影）、空には星・太陽・地球。
// 司令船・着陸船（apollo.glb）、エンジンの光、着陸の砂ぼこり、着陸船の影。カメラは場面ごとに。

const base = import.meta.env.BASE_URL
const EARTH_POS = new THREE.Vector3(384_400_000, 0, 0)
const EARTH_R = 6_371_000

// ---- 月の地面 ----------------------------------------------------------------------------

const moonVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 dir;
  varying vec3 vN;
  varying vec3 vDir;
  varying vec3 vRel;
  void main() {
    vN = normal;
    vDir = dir;
    // カメラからの向き（月の中心から測ると float では 10 cm ほどの粗さになるので、視点の座標から戻す）
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vRel = (vec4(mv.xyz, 0.0) * viewMatrix).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`
const moonFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uMap;
  uniform sampler2D uShadowFar;
  uniform sampler2D uShadowNear;
  uniform float uFarHalf;
  uniform float uNearHalf;
  uniform float uShadowOn;
  uniform vec3 uSun;
  uniform vec3 uEarth;
  uniform vec3 uUp;
  uniform vec3 uEast;
  uniform vec3 uNorth;
  uniform float uDetail;
  // 降下の道すじの帯（本物の明るさと、着陸の日の日なた・影）
  uniform sampler2D uTrackAlb;
  uniform sampler2D uTrackSun;
  uniform float uTrackOn;
  uniform vec3 uTP;
  uniform vec3 uTQ;
  uniform vec3 uTN;
  uniform vec4 uTrack;
  varying vec3 vN;
  varying vec3 vDir;
  varying vec3 vRel;
  uniform vec3 uCamMod;
  uniform float uLmOn;
  uniform vec3 uLmPos;
  uniform vec3 uLmX;
  uniform vec3 uLmY;
  uniform vec3 uLmZ;
  // 着陸船の影：太陽へ向かう光が、着陸船の形（箱 2 つと脚 4 本）にさえぎられるか
  float hitBox(vec3 o, vec3 d, vec3 c, vec3 h) {
    vec3 inv = 1.0 / d;
    vec3 t0 = (c - h - o) * inv;
    vec3 t1 = (c + h - o) * inv;
    vec3 tn = min(t0, t1);
    vec3 tf = max(t0, t1);
    float a = max(max(tn.x, tn.y), tn.z);
    float b = min(min(tf.x, tf.y), tf.z);
    return (b > max(a, 0.0)) ? 1.0 : 0.0;
  }
  float hitSeg(vec3 o, vec3 d, vec3 p, vec3 q, float r) {
    vec3 u = q - p;
    vec3 w = o - p;
    float a = dot(d, d), b = dot(d, u), c = dot(u, u), e = dot(d, w), f = dot(u, w);
    float den = a * c - b * b;
    float s = den > 1e-6 ? clamp((a * f - b * e) / den, 0.0, 1.0) : 0.0;
    float t = max((b * s - e) / a, 0.0);
    return length(o + d * t - (p + u * s)) < r ? 1.0 : 0.0;
  }
  float lmBlock(vec3 o, vec3 d) {
    float hit = hitBox(o, d, vec3(0.0, 2.22, 0.0), vec3(2.11, 0.83, 2.11));
    hit = max(hit, hitBox(o, d, vec3(0.0, 4.6, 0.43), vec3(1.7, 1.3, 2.03)));
    for (int i = 0; i < 4; i++) {
      float a = float(i) * 1.5707963;
      vec3 k = vec3(cos(a), 0.0, sin(a));
      hit = max(hit, hitSeg(o, d, k * 2.05 + vec3(0.0, 2.95, 0.0), k * 4.7 + vec3(0.0, 0.3, 0.0), 0.12));
      hit = max(hit, hitSeg(o, d, k * 4.55 + vec3(0.0, 0.15, 0.0), k * 4.85 + vec3(0.0, 0.15, 0.0), 0.42));
    }
    return hit;
  }
  float lmShadow(vec3 sun) {
    if (uLmOn < 0.5) return 0.0;
    vec3 w = vRel - uLmPos;
    if (dot(w, w) > 3600.0) return 0.0;
    vec3 o = vec3(dot(w, uLmX), dot(w, uLmY), dot(w, uLmZ));
    vec3 d = normalize(vec3(dot(sun, uLmX), dot(sun, uLmY), dot(sun, uLmZ)));
    // 太陽の大きさ（0.5°）のぶん、ふちをぼかす
    vec3 s1 = normalize(cross(d, vec3(0.0, 1.0, 0.0))) * 0.0045;
    vec3 s2 = normalize(cross(d, s1)) * 0.0045;
    float sh = lmBlock(o, d + s1) + lmBlock(o, d - s1) + lmBlock(o, d + s2) + lmBlock(o, d - s2);
    return sh * 0.25;
  }
  float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float hp(vec3 i, float per) { return h3(mod(i, per)); }
  float pnoise(vec3 p, float per) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hp(i, per), hp(i + vec3(1,0,0), per), f.x), mix(hp(i + vec3(0,1,0), per), hp(i + vec3(1,1,0), per), f.x), f.y),
               mix(mix(hp(i + vec3(0,0,1), per), hp(i + vec3(1,0,1), per), f.x), mix(hp(i + vec3(0,1,1), per), hp(i + vec3(1,1,1), per), f.x), f.y), f.z);
  }
  void main() {
    #include <logdepthbuf_fragment>
    vec3 d = normalize(vDir);
    float lon = atan(-d.z, d.x);
    float lat = asin(clamp(d.y, -1.0, 1.0));
    vec2 uv = vec2((lon + PI) / (2.0 * PI) - 42.0 / 2048.0, (lat + 0.5 * PI) / PI);
    vec2 uv2 = vec2(fract(uv.x + 0.5) - 0.5, uv.y);
    vec2 dx = dFdx(uv); vec2 dy = dFdy(uv);
    vec2 dx2 = dFdx(uv2); vec2 dy2 = dFdy(uv2);
    if (dot(dx2, dx2) + dot(dy2, dy2) < dot(dx, dx) + dot(dy, dy)) { dx = dx2; dy = dy2; }
    vec3 albedo = pow(textureGrad(uMap, fract(uv), dx, dy).rgb, vec3(2.2));
    // 帯の中は本物の地図（かぐやの明るさ、1 画素 238 m）に。ふちはなめらかに
    float trackSun = 1.0;
    float trackW = 0.0;
    if (uTrackOn > 0.5) {
      float th = atan(dot(d, uTQ), dot(d, uTP));
      float ph = asin(clamp(dot(d, uTN), -1.0, 1.0));
      vec2 tuv = vec2((th - uTrack.x) / (uTrack.y - uTrack.x), (uTrack.z - ph) / (2.0 * uTrack.z));
      if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) {
        trackW = smoothstep(0.0, 0.012, min(tuv.x, 1.0 - tuv.x)) * smoothstep(0.0, 0.06, min(tuv.y, 1.0 - tuv.y));
        float a = pow(texture2D(uTrackAlb, tuv).r, 2.2) * uTrack.w;
        albedo = mix(albedo, vec3(a) * vec3(1.0, 0.985, 0.96), trackW);
        trackSun = mix(1.0, texture2D(uTrackSun, tuv).r, trackW);
      }
    }
    vec3 n = normalize(vN);
    // 細かいまだら（近いときだけ）と、急な斜面ほど明るい（新しい岩が出ている）
    vec3 p = d * ${MOON_R.toFixed(1)};
    float m = vnoise(p / 90.0) * 0.45 + vnoise(p / 23.0) * 0.35 + vnoise(p / 5.5) * 0.2;
    albedo *= mix(1.0, 0.72 + 0.56 * m, uDetail);
    // 足もとの細かな砂のまだら（1 km ごとにくり返す座標で、近いときだけ）
    float near = 1.0 - smoothstep(20.0, 260.0, length(vRel));
    if (near > 0.0) {
      vec3 q = vRel + uCamMod;
      // 1 画素より細かい模様は消す（遠くや斜めで、すじ模様にならないように）
      float fp = length(fwidth(q));
      float w1 = 1.0 - smoothstep(0.5, 2.0, fp);
      float w2 = 1.0 - smoothstep(0.12, 0.5, fp);
      float w3 = 1.0 - smoothstep(0.03, 0.12, fp);
      float fine = (pnoise(q / 2.0, 500.0) - 0.5) * 0.45 * w1 + (pnoise(q / 0.5, 2000.0) - 0.5) * 0.35 * w2 + (pnoise(q / 0.125, 8000.0) - 0.5) * 0.2 * w3;
      albedo *= 1.0 + 0.6 * fine * near;
    }
    float slope = 1.0 - dot(n, d);
    albedo *= 1.0 + smoothstep(0.05, 0.3, slope) * 0.35;
    // 谷の影（前もって計算した地図）。谷の外は、帯の影
    float shade = trackSun;
    float k = dot(d, uUp);
    if (uShadowOn > 0.5 && k > 0.99) {
      vec2 xz = vec2(dot(d, uEast), -dot(d, uNorth)) * ${MOON_R.toFixed(1)} / k;
      vec2 fu = xz / (2.0 * uFarHalf) + 0.5;
      vec2 nu = xz / (2.0 * uNearHalf) + 0.5;
      if (all(greaterThan(fu, vec2(0.0))) && all(lessThan(fu, vec2(1.0)))) {
        float s = texture2D(uShadowFar, fu).r;
        float e = max(abs(xz.x), abs(xz.y));
        if (e < uNearHalf) {
          float sn = texture2D(uShadowNear, nu).r;
          s = mix(sn, s, smoothstep(uNearHalf * 0.85, uNearHalf, e));
        }
        float ef = smoothstep(uFarHalf * 0.82, uFarHalf * 0.98, e);
        shade = mix(s, trackSun, ef);
      }
    }
    float mu0 = dot(n, uSun);
    float day = smoothstep(-0.03, 0.05, dot(d, uSun));
    // 月の砂は、太陽が低くても明るい（ロンメル・ゼーリガー則）。太陽を背にすると、さらに明るい（衝効果）
    vec3 vv = normalize(-vRel);
    float mu = max(dot(n, vv), 0.02);
    float m0 = max(mu0, 0.0);
    float ls = 2.0 * m0 / (m0 + mu);
    float g = acos(clamp(dot(vv, uSun), -1.0, 1.0));
    float opp = 1.0 + 0.5 * exp(-g / 0.12);
    shade *= 1.0 - 0.93 * lmShadow(uSun);
    float lit = mix(m0, ls * 0.5, 0.75) * opp * shade * day;
    vec3 c = albedo * lit * 2.4;
    // 地球の照り返し・星明かり
    c += albedo * vec3(0.02, 0.026, 0.038) * max(dot(n, uEarth), 0.0);
    c += albedo * 0.006;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

type Chunk = { mesh: THREE.Mesh; used: number; level: number }

function lodSettings() {
  const lvl = currentLevel()
  if (lvl === 'low' || lowMemory()) return { max: 13, valleyMax: 15, split: 1.25, budget: 3 }
  if (lvl === 'medium') return { max: 13, valleyMax: 16, split: 1.6, budget: 4 }
  return { max: 14, valleyMax: 16, split: 2, budget: 6 }
}

const _hd = new THREE.Vector3()
const height = (x: number, y: number, z: number, minWave: number) => groundAt(_hd.set(x, y, z), minWave)

function LunarGlobe({ maps, craft }: { maps: LunarMaps; craft: Craft }) {
  const [tex, trackTex] = useTexture([`${base}textures/4k_moon.jpg`, `${base}terrain/moon_track_albedo.jpg`])
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const [shadow, setShadow] = useState<{ far: ShadowMap; near: ShadowMap } | null>(null)
  useEffect(() => {
    let alive = true
    valleyShadows().then((s) => alive && setShadow(s), () => {})
    return () => {
      alive = false
    }
  }, [])
  const material = useMemo(() => {
    tex.colorSpace = THREE.NoColorSpace
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    tex.wrapS = THREE.RepeatWrapping
    tex.needsUpdate = true
    const blank = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat)
    blank.needsUpdate = true
    // 降下の道すじの帯（大きな絵が使えない端末では、高さだけ使う）
    const trackOk = !!maps.track && gl.capabilities.maxTextureSize >= TRACK.w
    let trackSun: THREE.Texture = blank
    if (trackOk && maps.track) {
      trackTex.colorSpace = THREE.NoColorSpace
      trackTex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
      trackTex.needsUpdate = true
      const sun = new THREE.DataTexture(maps.track.sun, TRACK.w, TRACK.h, THREE.RedFormat, THREE.UnsignedByteType)
      sun.magFilter = THREE.LinearFilter
      sun.minFilter = THREE.LinearFilter
      sun.needsUpdate = true
      trackSun = sun
    }
    return new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex },
        uShadowFar: { value: blank },
        uShadowNear: { value: blank },
        uFarHalf: { value: 50_000 },
        uNearHalf: { value: 8_000 },
        uShadowOn: { value: 0 },
        uSun: { value: SUN_DIR },
        uEarth: { value: EARTH_POS.clone().normalize() },
        uUp: { value: FRAME.up },
        uEast: { value: FRAME.east },
        uNorth: { value: FRAME.north },
        uDetail: { value: 0 },
        uTrackAlb: { value: trackOk ? trackTex : blank },
        uTrackSun: { value: trackSun },
        uTrackOn: { value: trackOk ? 1 : 0 },
        uTP: { value: TRACK_PLANE.P },
        uTQ: { value: TRACK_PLANE.Q },
        uTN: { value: TRACK_PLANE.N },
        uTrack: { value: new THREE.Vector4(TRACK.th0, TRACK.th1, TRACK.ph, TRACK.albedoScale) },
        uCamMod: { value: new THREE.Vector3() },
        uLmOn: { value: 0 },
        uLmPos: { value: new THREE.Vector3() },
        uLmX: { value: new THREE.Vector3(1, 0, 0) },
        uLmY: { value: new THREE.Vector3(0, 1, 0) },
        uLmZ: { value: new THREE.Vector3(0, 0, 1) },
      },
      vertexShader: moonVertex,
      fragmentShader: moonFragment,
    })
  }, [tex, trackTex, gl, maps])
  useEffect(() => {
    if (!shadow) return
    const u = material.uniforms
    u.uShadowFar.value = shadow.far.tex
    u.uShadowNear.value = shadow.near.tex
    u.uFarHalf.value = shadow.far.half
    u.uNearHalf.value = shadow.near.half
    u.uShadowOn.value = 1
  }, [shadow, material])
  const group = useMemo(() => new THREE.Group(), [])
  const lod = useMemo(() => {
    const chunks = new Map<string, Chunk>()
    const queue = new Map<string, ChunkKey>()
    const make = (k: ChunkKey) => {
      const { geometry, center } = buildChunk(maps.global, k, height)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.copy(center)
      mesh.visible = false
      mesh.name = 'lunar-chunk'
      group.add(mesh)
      const c = { mesh, used: 0, level: k.level }
      chunks.set(keyOf(k), c)
      return c
    }
    for (let f = 0; f < 6; f++) make({ face: f, level: 0, i: 0, j: 0 })
    return { chunks, queue, make, frame: 0, settings: lodSettings() }
  }, [maps, material, group])
  useEffect(
    () => () => {
      for (const c of lod.chunks.values()) c.mesh.geometry.dispose()
      material.dispose()
    },
    [lod, material],
  )
  const cd = useMemo(() => new THREE.Vector3(), [])
  const camDir = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const { chunks, queue, make, settings } = lod
    const f = ++lod.frame
    const cam = camera.position
    const camR = cam.length()
    camDir.copy(cam).normalize()
    const pm = (v: number) => v - Math.floor(v / 1000) * 1000
    const u = material.uniforms
    u.uCamMod.value.set(pm(cam.x), pm(cam.y), pm(cam.z))
    // 着陸船の影（低いときだけ）。位置はカメラからの差で渡す（float の粗さをさける）
    const d = lunar.desc
    const lm = craft.lm
    u.uLmOn.value = d && d.alt < 400 && lm.visible ? 1 : 0
    if (u.uLmOn.value) {
      u.uLmPos.value.copy(lm.position).sub(cam)
      u.uLmX.value.set(1, 0, 0).applyQuaternion(lm.quaternion)
      u.uLmY.value.set(0, 1, 0).applyQuaternion(lm.quaternion)
      u.uLmZ.value.set(0, 0, 1).applyQuaternion(lm.quaternion)
    }
    const alt = camR - MOON_R
    material.uniforms.uDetail.value = THREE.MathUtils.clamp(1 - alt / 30000, 0, 1)
    const horizon = Math.acos(THREE.MathUtils.clamp((MOON_R - 9000) / Math.max(camR, MOON_R - 8000), -1, 1)) + Math.acos((MOON_R - 9000) / (MOON_R + 11000))
    for (const c of chunks.values()) c.mesh.visible = false
    const visit = (k: ChunkKey) => {
      const size = chunkSize(k.level)
      chunkCenterDir(k, cd)
      const ang = Math.acos(THREE.MathUtils.clamp(cd.dot(camDir), -1, 1))
      if (k.level > 1 && ang - (size / MOON_R) * 0.8 > horizon) return
      const inValley = k.level >= 10 && valleyWeight(cd) > 0.6
      const dist = Math.max(0, cd.multiplyScalar(MOON_R).distanceTo(cam) - size * 0.75)
      const self = chunks.get(keyOf(k))
      const max = inValley ? settings.valleyMax : settings.max
      if (k.level < max && dist < size * settings.split) {
        const kids: ChunkKey[] = []
        for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) kids.push({ face: k.face, level: k.level + 1, i: k.i * 2 + di, j: k.j * 2 + dj })
        if (kids.every((c) => chunks.has(keyOf(c)))) {
          for (const c of kids) visit(c)
          if (self) self.used = f
          return
        }
        for (const c of kids) if (!chunks.has(keyOf(c))) queue.set(keyOf(c), c)
      }
      if (self) {
        self.mesh.visible = true
        self.used = f
      }
    }
    for (let face = 0; face < 6; face++) visit({ face, level: 0, i: 0, j: 0 })
    if (queue.size) {
      const list = [...queue.values()].sort((a, b) => a.level - b.level || chunkCenterDir(a, cd).distanceToSquared(camDir) - chunkCenterDir(b, _t).distanceToSquared(camDir))
      const t0 = performance.now()
      for (const k of list) {
        make(k)
        queue.delete(keyOf(k))
        if (performance.now() - t0 > settings.budget) break
      }
      queue.clear()
    }
    if (chunks.size > 900 && f % 30 === 0) {
      for (const [key, c] of chunks) {
        if (c.level > 0 && f - c.used > 240) {
          group.remove(c.mesh)
          c.mesh.geometry.dispose()
          chunks.delete(key)
        }
      }
    }
  })
  return <primitive object={group} />
}
const _t = new THREE.Vector3()

// ---- 空：星・太陽・地球 ----------------------------------------------------------------------

function Sky() {
  const camera = useThree((s) => s.camera)
  const [stars, setStars] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    let alive = true
    loadCatalog().then((g) => alive && setStars(g), () => {})
    return () => {
      alive = false
    }
  }, [])
  const starMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute float mag;
          attribute vec3 color;
          varying vec3 vColor;
          void main() {
            float flux = pow(10.0, -0.4 * (mag - 1.5) * 0.6);
            vColor = color * min(flux * 1.4, 3.0);
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
            gl_Position.z = gl_Position.w * 0.999999;
            gl_PointSize = clamp(1.4 + 1.5 * sqrt(flux), 1.4, 4.5);
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          void main() {
            float r = length(gl_PointCoord - 0.5) * 2.0;
            gl_FragColor = vec4(vColor * exp(-r * r * 3.0), 1.0);
          }`,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )
  const [day, night, clouds] = useTexture([`${base}textures/2k_earth_daymap.jpg`, `${base}textures/earth/bm_night_2k.jpg`, `${base}textures/2k_earth_clouds.jpg`])
  const earthMat = useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace
    night.colorSpace = THREE.SRGBColorSpace
    // 大気は光の散乱で（地球の入り・出の望遠で、ふちの青い層と夕焼けの帯が見える）
    const m = earthMaterial(day, night, clouds, { scatter: true, steps: 12 })
    m.uniforms.uSun.value.copy(SUN_DIR)
    m.uniforms.uLights.value = 1
    m.uniforms.uNear2.value = 1
    m.uniforms.uCenter.value.copy(EARTH_POS)
    m.uniforms.uR.value = EARTH_R
    return m
  }, [day, night, clouds])
  const atmo = useMemo(() => {
    const m = atmosphereMaterial({ scatter: true, steps: 12 })
    m.uniforms.uSun.value.copy(SUN_DIR)
    m.uniforms.uCenter.value.copy(EARTH_POS)
    m.uniforms.uR.value = EARTH_R
    m.uniforms.uSky.value = 1
    return m
  }, [])
  const sunMat = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(7, 6.6, 6), depthTest: true, depthWrite: false, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending }), [])
  useEffect(
    () => () => {
      starMat.dispose()
      earthMat.dispose()
      atmo.dispose()
      sunMat.map?.dispose()
      sunMat.dispose()
    },
    [starMat, earthMat, atmo, sunMat],
  )
  const starsRef = useRef<THREE.Points>(null)
  const sunRef = useRef<THREE.Sprite>(null)
  useFrame(() => {
    starsRef.current?.position.copy(camera.position)
    sunRef.current?.position.copy(camera.position).addScaledVector(SUN_DIR, 4e9)
  })
  return (
    <>
      {stars && <points ref={starsRef} geometry={stars} material={starMat} scale={1000} renderOrder={-3} frustumCulled={false} />}
      <sprite ref={sunRef} material={sunMat} scale={4e9 * 0.03} />
      {/* 地球の自転：経度 0 を月へ向けたくらい（雲の模様が見えればよい） */}
      <group position={EARTH_POS} rotation={[0.41, 2.4, 0]}>
        <mesh material={earthMat} name="lunar-earth">
          <sphereGeometry args={[EARTH_R, 64, 40]} />
        </mesh>
        <mesh material={atmo}>
          <sphereGeometry args={[EARTH_R + 100_000, 48, 32]} />
        </mesh>
      </group>
    </>
  )
}

// ---- 宇宙船（模型は craft.ts） ----

/** 太陽のまるい光（まん中は白く、まわりへぼんやり） */
function glowTexture() {
  return radialGlowTexture(
    [
      [0, 255, 255, 255, 1],
      [0.14, 255, 255, 255, 1],
      [0.2, 255, 250, 240, 0.35],
      [0.45, 255, 245, 230, 0.08],
      [1, 255, 245, 230, 0],
    ],
    128,
    true,
  )
}

const _q = new THREE.Quaternion()
const _m = new THREE.Matrix4()
const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _z = new THREE.Vector3()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

/** 着陸船の向き：上（推力の向き）と、前（窓のある面）。制動のあいだは窓を上（空）に、起き上がったら進む向きへ */
function lmBasis(dir: THREE.Vector3, up: THREE.Vector3, track: THREE.Vector3, out: THREE.Quaternion) {
  const tilt = dir.angleTo(up)
  const w = THREE.MathUtils.smoothstep(tilt, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(72))
  const face = _a.copy(track).multiplyScalar(1 - w).addScaledVector(up, w)
  face.addScaledVector(dir, -face.dot(dir))
  if (face.lengthSq() < 1e-6) face.copy(track).addScaledVector(dir, -track.dot(dir))
  face.normalize()
  _y.copy(dir)
  _z.copy(face).negate()
  _x.crossVectors(_y, _z).normalize()
  _z.crossVectors(_x, _y)
  _m.makeBasis(_x, _y, _z)
  return out.setFromRotationMatrix(_m)
}

function Spacecraft({ craft }: { craft: Craft }) {
  const phase = useMoonMission((s) => s.phase)
  const dps = useMemo(() => plumeMaterial({ core: '#cfe0ff', edge: '#6a7cff', soft: 1.6 }), [])
  const sps = useMemo(() => plumeMaterial({ core: '#ffe2b8', edge: '#ff8a40', soft: 1.4 }), [])
  const geo = useMemo(() => plumeGeometry(), [])
  useEffect(
    () => () => {
      dps.dispose()
      sps.dispose()
      geo.dispose()
    },
    [dps, sps, geo],
  )
  const dpsMesh = useRef<THREE.Mesh>(null)
  const spsMesh = useRef<THREE.Mesh>(null)
  const stackQ = useMemo(() => new THREE.Quaternion(), [])
  const csmDock = useMemo(() => {
    // 司令船を、着陸船のてっぺんに逆さに付ける
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
    return { q, p: DROGUE.clone() }
  }, [])
  const dockOff = useRef(new THREE.Vector3())
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const lm = craft.lm
    const csm = craft.csm
    // 脚
    const legs = phase === 'coast' || phase === 'loi' ? 0 : lunar.legs
    for (const L of craft.legs) L.obj.quaternion.copy(L.base).premultiply(_q.setFromAxisAngle(L.axis, (1 - legs) * -2.05))
    dps.uniforms.uTime.value = t
    sps.uniforms.uTime.value = t
    const docked = phase === 'coast' || phase === 'loi' || (phase === 'undock' && lunar.sepAt === null)
    if (phase === 'coast' || phase === 'loi') {
      // 司令船＋着陸船：機械船のエンジンを進む向きへ（減速の向き）
      const s = lunar.stack
      const pos = phase === 'coast' ? coastPos(lunar.coast, _a) : s.r
      const vel = phase === 'coast' ? _b.set(-1, 0.05, 0.1).normalize() : _b.copy(s.v).normalize()
      lm.position.copy(pos)
      // 着陸船の +Y（上、司令船とつながる側）を進む向きへ：着陸船が後ろ、機械船のノズルが前（逆噴射）
      _y.copy(vel)
      _x.crossVectors(_y, SUN_DIR).normalize()
      if (phase === 'coast') _x.applyAxisAngle(_y, t * 0.12)
      _z.crossVectors(_x, _y)
      _m.makeBasis(_x, _y, _z)
      lm.quaternion.setFromRotationMatrix(_m)
      stackQ.copy(lm.quaternion)
    } else if (lunar.desc) {
      const d = lunar.desc
      lm.position.copy(d.r)
      const up = _a.copy(d.r).normalize()
      lmBasis(d.dir, up, d.track, _q)
      // 向きの変化をなめらかに
      lm.quaternion.slerp(_q, Math.min(1, dt * 6))
      if (phase === 'undock' && lunar.sepAt === null) lm.quaternion.copy(_q)
    }
    lm.updateMatrixWorld()
    if (docked) {
      csm.position.copy(csmDock.p).applyMatrix4(lm.matrixWorld)
      csm.quaternion.copy(lm.quaternion).multiply(csmDock.q)
      // つながっていた位置（着陸船の中心からのずれ）を覚えておく
      dockOff.current.copy(csm.position).sub(lm.position)
    } else {
      // 離れたあと：司令船の軌道（着陸船の中心から始まる）に、つながっていたときのずれを足す。
      // 足さないと、切り離した瞬間に司令船が着陸船の中心へ飛んで、めり込む
      csm.position.copy(lunar.csm.r).add(dockOff.current)
      // 向きはそのまま
    }
    csm.visible = phase !== 'descent' || (lunar.desc !== null && lunar.desc.t < -60)
    // 炎（真空なので、ほとんど見えない。ノズルの口のまわりがうっすら光るくらい）
    const pd = dpsMesh.current
    if (pd) {
      const d = lunar.desc
      const thr = phase === 'descent' && d ? d.throttle : 0
      pd.visible = thr > 0.01
      dps.uniforms.uPower.value = thr * 0.55
      dps.uniforms.uExpand.value = 1
      pd.scale.set(0.75, 3 + thr * 6, 0.75)
    }
    const ps = spsMesh.current
    if (ps) {
      const on = phase === 'loi' && lunar.stack.burning
      ps.visible = on
      sps.uniforms.uPower.value = on ? 0.5 : 0
      sps.uniforms.uExpand.value = 1
    }
  })
  return (
    <group>
      {/* 炎は着陸船・司令船の中に置く（いっしょに動く） */}
      <primitive object={craft.lm}>
        <mesh ref={dpsMesh} geometry={geo} material={dps} position={[0, 0.8, 0]} renderOrder={5} frustumCulled={false} />
      </primitive>
      <primitive object={craft.csm}>
        <mesh ref={spsMesh} geometry={geo} material={sps} position={[0, -10.35, 0]} scale={[1.25, 9, 1.25]} renderOrder={5} frustumCulled={false} />
      </primitive>
    </group>
  )
}

/** 3 日の旅の場面：地球の近くから月の近くへ（見せるための道すじ） */
function coastPos(k: number, out: THREE.Vector3) {
  const e = THREE.MathUtils.smoothstep(k, 0, 1)
  return out.set(330_000_000 - e * 250_000_000, 9_000_000 * (1 - e), 18_000_000 * (1 - e) + 6_000_000)
}

// ---- 砂ぼこり：エンジンの風で、地面の砂が放射状に飛ぶ（空気がないので、まっすぐ低く速く） ----

const dustVert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vP;
  void main() {
    vP = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`
const dustFrag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform float uPower;
  uniform float uR;
  varying vec2 vP;
  float h1(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    #include <logdepthbuf_fragment>
    float r = length(vP) / uR;
    float a = atan(vP.y, vP.x);
    // 放射状の筋（角度ごとの乱数）が、外へ流れる
    float ray = h1(floor(a * 60.0)) * 0.6 + h1(floor(a * 23.0) + 7.0) * 0.4;
    float flow = fract(r * 3.0 - uTime * 2.6 + ray * 3.0);
    float streak = smoothstep(0.0, 0.25, flow) * smoothstep(1.0, 0.45, flow);
    float body = smoothstep(0.03, 0.18, r) * smoothstep(1.0, 0.35, r);
    float al = body * (0.35 + 0.65 * streak) * (0.55 + 0.45 * ray) * uPower;
    gl_FragColor = vec4(vec3(0.62, 0.6, 0.57) * al, al);
  }
`

function Dust() {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: dustVert,
        fragmentShader: dustFrag,
        uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uR: { value: 60 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  )
  const geo = useMemo(() => new THREE.CircleGeometry(1, 64, 0, Math.PI * 2).rotateX(-Math.PI / 2), [])
  useEffect(
    () => () => {
      mat.dispose()
      geo.dispose()
    },
    [mat, geo],
  )
  useFrame((state) => {
    const m = mesh.current
    const d = lunar.desc
    if (!m) return
    if (!d || d.alt > 40 || d.throttle < 0.01) {
      m.visible = false
      return
    }
    const up = _a.copy(d.r).normalize()
    const g = groundAt(up)
    m.visible = true
    m.position.copy(up).multiplyScalar(MOON_R + g + 0.6)
    m.quaternion.setFromUnitVectors(_b.set(0, 1, 0), up)
    const R = 25 + (40 - d.alt) * 1.2
    m.scale.setScalar(R)
    mat.uniforms.uR.value = 1
    mat.uniforms.uTime.value = state.clock.elapsedTime
    mat.uniforms.uPower.value = THREE.MathUtils.clamp((40 - d.alt) / 30, 0, 1) * Math.min(1, d.throttle * 2.5) * 0.85
  })
  return <mesh ref={mesh} geometry={geo} material={mat} renderOrder={4} frustumCulled={false} />
}

// ---- 光と映りこみ --------------------------------------------------------------------------

function Lights() {
  const camera = useThree((s) => s.camera)
  // 映りこむ景色：下の月面（太陽に照らされた灰色）と、真っ黒な空
  const body = useMemo(() => ({ down: new THREE.Vector3(), angR: 0, sun: SUN_DIR }), [])
  useSpaceEnv(() => {
    const r = camera.position.length()
    body.down.copy(camera.position).multiplyScalar(-1 / Math.max(1, r))
    body.angR = Math.asin(Math.min(1, MOON_R / Math.max(MOON_R, r)))
    return body
  }, 'moon')
  const sun = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    // 太陽の光は、いつもカメラのそばを照らす（向きだけが大事）
    target.position.copy(camera.position)
    target.updateMatrixWorld()
    sun.current?.position.copy(camera.position).addScaledVector(SUN_DIR, 1000)
  })
  return (
    <>
      <directionalLight ref={sun} target={target} intensity={4.2} color="#fff6ea" />
      <primitive object={target} />
      {/* 月面の照り返し（下から、ほんのり） */}
      <hemisphereLight args={['#1a1c22', '#4a4640', 0.25]} />
    </>
  )
}

// ---- カメラ ---------------------------------------------------------------------------------

// 地球の入り・出のころだけ 1。前後 3 秒でなめらかに切りかわる
function earthShot(t: number, at: number | null, before: number, after: number) {
  if (at == null) return 0
  const a = THREE.MathUtils.smoothstep(t, at - before - 3, at - before)
  const b = 1 - THREE.MathUtils.smoothstep(t, at + after, at + after + 3)
  return Math.min(a, b)
}

function CameraRig({ craft, cabin: lmc }: { craft: Craft; cabin: LmCabin }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const state = useMemo(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), init: false, groundCam: new THREE.Vector3(), phase: '' }), [])
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), q: new THREE.Quaternion(), center: new THREE.Vector3() }), [])
  useCraftZoom()
  useFrame((st, dt) => {
    const ms = useMoonMission.getState()
    const phase = ms.phase
    const cam = ms.cam
    const t = st.clock.elapsedTime
    const lm = craft.lm
    const want = tmp.a
    const look = tmp.b
    const up = tmp.c
    let fov = 45
    let snap = false
    // 窓から見るときは、自分の船は描かない（窓の枠は画面の上に重ねる）
    lm.visible = !(cam === 'window' && phase === 'descent')
    // 着陸船の中（立った 2 人と計器盤）：窓から見るときだけ
    lmc.show(cam === 'window' && phase === 'descent')
    // 司令船の窓（月への旅と月の裏）：自分の船は描かない
    const cabin = cam === 'window' && (phase === 'coast' || phase === 'loi')
    craft.csm.visible = craft.csm.visible && !cabin
    if (cabin) lm.visible = false
    if (cabin && phase === 'coast') {
      // ふりかえって地球を見る。旅が進むほど小さくなる
      want.copy(lm.position).add(_z.set(0, 3, 0))
      look.copy(EARTH_POS)
      up.set(0, 1, 0)
      fov = 34
      snap = true
    } else if (cabin) {
      // 月の裏：窓の下を流れる月面と、地平線
      const s = lunar.stack
      const r = _x.copy(s.r).normalize()
      const v = _y.copy(s.v).normalize()
      want.copy(s.r).addScaledVector(r, 3)
      look.copy(want).addScaledVector(v, 1).addScaledVector(r, -0.45)
      up.copy(r)
      fov = 60
      snap = true
    } else if (phase === 'coast') {
      // 宇宙船の斜めうしろから、行く手の月を見る。後半は横から（地球が遠く小さく）
      const k = lunar.coast
      const side = _x.set(0, 0, 1)
      want.copy(lm.position).addScaledVector(_y.set(1, 0, 0), 38 - k * 20).addScaledVector(side, 14 + k * 26).add(_z.set(0, 8, 0))
      look.copy(lm.position).lerp(_b.set(0, 0, 0), 0.0000001 + k * 0.0000001)
      look.copy(lm.position).addScaledVector(_a.set(-1, 0, 0), 10)
      up.set(0, 1, 0)
      fov = 50
    } else if (phase === 'loi') {
      const s = lunar.stack
      const r = _x.copy(s.r).normalize()
      const v = _y.copy(s.v).normalize()
      if (cam === 'wide') {
        // 遠くから：月の丸みと、宇宙船の小さな姿
        want.copy(s.r).addScaledVector(v, -150).addScaledVector(r, 25).addScaledVector(_z.crossVectors(v, r), 70)
        look.copy(s.r).addScaledVector(v, 120).addScaledVector(r, -20)
        fov = 55
      } else {
        // うしろ（着陸船の側）の少し上から、進む向き（エンジンの向き）を見る
        want.copy(s.r).addScaledVector(v, -34).addScaledVector(r, 11).addScaledVector(_z.crossVectors(v, r), 9)
        look.copy(s.r).addScaledVector(v, 18).addScaledVector(r, -6)
        fov = 50
        // 地球が月のかげに沈むとき（通信が切れる）と、また昇るとき：船のうしろから、望遠で地球と月の地平線を見る
        const c = lunar.clocks
        const rise = s.burnEnd !== null ? c?.aosBurn : c?.aosNoBurn
        const w = Math.max(earthShot(s.t, c?.los ?? null, 26, 6), earthShot(s.t, rise ?? null, 8, 30))
        if (w > 0) {
          const e = _a.copy(EARTH_POS).sub(s.r).normalize()
          const eye = _b.copy(s.r).addScaledVector(e, -26).addScaledVector(r, 9)
          want.lerp(eye, w)
          // 地球は画面の下寄り（まん中は字幕が出る）：少し上をねらう
          look.lerp(eye.addScaledVector(e, 400).addScaledVector(r, 9), w)
          fov = THREE.MathUtils.lerp(fov, 7, w)
        }
      }
      up.copy(r)
    } else if (lunar.desc) {
      const d = lunar.desc
      const r = _x.copy(d.r).normalize()
      const tr = _y.copy(d.track).addScaledVector(r, -d.track.dot(r)).normalize()
      const side = _z.crossVectors(tr, r).normalize()
      up.copy(r)
      if (phase === 'undock') {
        // 司令船の窓から見たような：離れていく着陸船
        const since = d.t + UNDOCK_BEFORE
        const k = THREE.MathUtils.smoothstep(since, 8, 40)
        // 初めは横から全体（つながった 2 機）、離れたら司令船のそばから着陸船を見送る
        want.copy(lunar.csm.r).addScaledVector(side, -24 + k * 10).addScaledVector(r, 7 + k * 2).addScaledVector(tr, -12 - k * 14)
        look.copy(lm.position).addScaledVector(r, 2).lerp(craft.csm.position, 0.4 * (1 - k))
        fov = 50 - k * 22
        if (cam === 'wide') {
          want.copy(d.r).addScaledVector(tr, -90).addScaledVector(r, 15).addScaledVector(side, -45)
          look.copy(d.r).addScaledVector(tr, 80).addScaledVector(r, -10)
          fov = 55
        }
      } else if (cam === 'window' && phase === 'descent') {
        // 着陸船の中：船長の目で、左の三角の窓から月面を見下ろす
        lm.updateMatrixWorld()
        lmc.group.matrix.copy(lm.matrixWorld)
        lmc.group.matrixWorldNeedsUpdate = true
        want.copy(LM_EYE).applyMatrix4(lm.matrixWorld)
        look.copy(LM_LOOK).applyMatrix4(lm.matrixWorld)
        up.set(0, 1, 0).applyQuaternion(tmp.q.copy(lm.quaternion))
        // 窓のまわりの壁より、窓の外（月面）が大きく入るように、窓のまん中をねらって狭めに
        fov = 62
        snap = true
      } else if (cam === 'wide' || phase === 'landed') {
        // 地面から見上げる（着陸地点の近く）。着陸したら、まわりをゆっくり回る
        if (phase === 'landed') {
          const ang = t * 0.05
          const g = state.groundCam
          g.copy(lm.position).addScaledVector(tr, Math.cos(ang) * 34).addScaledVector(side, Math.sin(ang) * 34)
          const gd = _b.copy(g).normalize()
          g.copy(gd).multiplyScalar(MOON_R + groundAt(gd) + 2.2)
          want.copy(g)
          look.copy(lm.position).addScaledVector(r, 0.5)
          fov = 50
        } else {
          const tgt = d.target
          const g = state.groundCam
          // 着陸地点の先の地面から、降りてくる着陸船を見上げる（高いうちは遠くから）
          // 太陽（東）を背にしないと逆光で真っ暗なので、進む向きの横から（光は横から当たる）
          const back = 150 + Math.min(d.alt, 2000) * 1.0
          g.copy(tgt).addScaledVector(side, -back).addScaledVector(tr, -back * 0.45)
          const gd = _b.copy(g).normalize()
          g.copy(gd).multiplyScalar(MOON_R + groundAt(gd) + 1.8)
          want.copy(g)
          const below = _a.copy(lm.position).normalize()
          below.multiplyScalar(MOON_R + groundAt(below))
          look.copy(lm.position).lerp(below, 0.3)
          const dist = g.distanceTo(look)
          fov = THREE.MathUtils.clamp(2 * Math.atan((lm.position.distanceTo(below) * 0.35 + 8) / Math.max(1, dist)) * THREE.MathUtils.RAD2DEG, 6, 50)
          snap = true
        }
      } else {
        // うしろから追う。高い所では遠く、低い所では近く。地面と影も入るように少し上から
        const high = THREE.MathUtils.smoothstep(d.alt, 300, 12_000)
        const dist = 30 + high * 26
        want.copy(d.r).addScaledVector(tr, -dist).addScaledVector(r, 9 + high * 18).addScaledVector(side, 10)
        look.copy(d.r).addScaledVector(tr, 18 + high * 220).addScaledVector(r, -6 - high * 70)
        fov = 50
        // 地面にもぐらない
        const gd = _b.copy(want).normalize()
        const minR = MOON_R + groundAt(gd) + 3
        if (want.length() < minR) want.setLength(minR)
      }
    }
    // ホイール・2 本指で宇宙船に寄る（窓の中と、望遠で地球を見るときはそのまま）
    if (cam !== 'window' && fov > 20) {
      const center = tmp.center.copy(up).multiplyScalar(phase === 'coast' || phase === 'loi' ? 5 : 2.5).add(lm.position)
      applyCraftZoom(want, look, center, 6)
    }
    // なめらかに追う（窓・地面のカメラは、ぴったり）。宇宙船は秒速 1.7 km で動くので、宇宙船からの相対で追う
    const anchor = lm.position
    want.sub(anchor)
    look.sub(anchor)
    // 場面が変わったら、ぴったり（地面の下を通って動かない）
    if (phase !== state.phase) {
      state.phase = phase
      snap = true
      resetCraftZoom()
    }
    if (!state.init || snap) {
      state.pos.copy(want)
      state.look.copy(look)
      state.up.copy(up)
      state.init = true
    } else {
      const k = 1 - Math.exp(-dt * 4)
      state.pos.lerp(want, k)
      if (state.pos.distanceTo(want) > 2000) state.pos.copy(want)
      state.look.lerp(look, k)
      if (state.look.distanceTo(look) > 5000) state.look.copy(look)
      state.up.lerp(up, k).normalize()
    }
    camera.position.copy(state.pos).add(anchor)
    camera.up.copy(state.up)
    camera.lookAt(_b.copy(state.look).add(anchor))
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov += (fov - camera.fov) * (snap ? 1 : Math.min(1, dt * 3))
      camera.near = phase === 'coast' || phase === 'loi' ? 0.5 : cam === 'window' ? 0.05 : 0.3
      camera.updateProjectionMatrix()
    }
  })
  return null
}

// ---- まとめ ---------------------------------------------------------------------------------

export function LunarWorld() {
  const [maps, setMaps] = useState<LunarMaps | null>(lunarMaps())
  useEffect(() => {
    let alive = true
    loadLunarMaps().then((m) => alive && setMaps(m), () => {})
    return () => {
      alive = false
    }
  }, [])
  const craft = useCraft()
  const lmCabin = useMemo(() => buildLmCabin(), [])
  useEffect(() => () => lmCabin.dispose(), [lmCabin])
  useFrame((_, dt) => {
    tickLunar(dt)
    loiCuts(dt)
  })
  // 降下を始めたら、カメラはうしろから
  const phase = useMoonMission((s) => s.phase)
  useEffect(() => {
    if (phase === 'descent') autoCam('chase')
  }, [phase])
  const ready = useMoonLunar((s) => s.ready)
  return (
    <>
      <Lights />
      <Sky />
      {maps && ready && <LunarGlobe maps={maps} craft={craft} />}
      <Spacecraft craft={craft} />
      <Dust />
      <primitive object={lmCabin.group} />
      <CameraRig craft={craft} cabin={lmCabin} />
    </>
  )
}

/**
 * おまかせでは 7 秒ごとにカメラを切りかえる（8 秒ルール：同じ絵が長く続かないように）。
 * 月の裏でブレーキ（章6）：うしろから → 遠くから（月を背に小さく） → 船長の窓（月面が流れる）。エンジンに火が入った瞬間は、炎の見えるうしろから。
 * 章7：切り離し（等速のところ）と制動はうしろ ↔ 遠く（制動のあいだは窓が空を向いているので窓は使わない）。
 * 接近（ピッチオーバーから）は船長の窓を主に、ときどきうしろから。手動にしたら切りかえない。
 * 自分でカメラを選んだら（camLocked）、切りかえない
 */
const cuts = { t: 0, i: 0, burning: false, mode: '' }
const CUTS: Record<string, MissionCam[]> = {
  loi: ['chase', 'wide', 'window'],
  undock: ['chase', 'wide'],
  brake: ['chase', 'wide'],
  approach: ['window', 'chase'],
}
function cutMode() {
  const s = useMoonMission.getState()
  if (s.phase === 'loi') return 'loi'
  const d = lunar.desc
  if (!d) return ''
  if (s.phase === 'undock') return 'undock'
  if (s.phase !== 'descent' || d.manual) return ''
  return d.mode === 'braking' ? 'brake' : d.mode === 'approach' ? 'approach' : ''
}
function loiCuts(dt: number) {
  const s = useMoonMission.getState()
  const mode = cutMode()
  if (mode !== cuts.mode) {
    // 場面がかわったら、その場面の最初のカメラから（そのカメラは場面の側で選ばれている）
    cuts.mode = mode
    cuts.t = 0
    cuts.i = 0
    cuts.burning = false
  }
  if (!mode || !s.auto || s.camLocked) return
  const burning = mode === 'loi' && !!lunar.stack?.burning
  cuts.t += dt
  if (burning && !cuts.burning) {
    cuts.i = 0
    cuts.t = 0
    autoCam('chase')
  } else if (cuts.t >= 7) {
    const list = CUTS[mode]
    cuts.t = 0
    cuts.i = (cuts.i + 1) % list.length
    autoCam(list[cuts.i])
  }
  cuts.burning = burning
}

useGLTF.preload(APOLLO_URL)
