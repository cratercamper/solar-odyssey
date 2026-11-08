import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useTrimShadows } from '../../hooks/useTrimShadows'
import { demIdFor, siteDef, surfaceFor, type SurfaceDef } from '../../data/surfaces'
import { textureUrl } from '../../data/textures'
import { PLANETS } from '../../data/bodies'
import { useOptionalTexture } from '../../hooks/useOptionalTexture'
import { haloTexture } from '../ship/ShipModel'
import { currentLevel, dprFor, lowMemory, useLevel } from '../../state/quality'
import { ASCENT, DESCENT, FADE, goToSite, landingNow, skipDescent, startTakeoff, surfaceReady, useLanding } from '../../state/landing'
import { goToRally, useRally } from '../../state/rally'
import { TRACKS, trackForBody } from '../../data/rallyTracks'
import { LANDER_POS, Terrain, grainTexture, rockGeometry, seeded, type Rock } from './terrain'
import { WideWorld, isWide, wideNow, withHole } from './wideGround'
import { useLang } from '../../i18n/lang'
import { AirParams, ApUniforms, SkyLut, airFor, airUniforms, apUniforms, autoExposure, luminance, skyLookupGlsl, sunTransmittance, withAir } from './atmosphere'
import { SurfacePost } from './SurfacePost'
import { SurfaceLab } from './SurfaceLab'
import { SurfaceStars } from './SurfaceStars'
import { TimeBar } from './TimeBar'
import { groundMaterial, withRockDetail } from './groundMaterial'
import { marsSun } from './marsGround'
import { useDem } from './dem'
import { Rally } from './Rally'
import { RallyGhost } from './RallyGhost'
import { RallyPanel, RallyStart } from './RallyPanel'
import { Apollo17 } from './Apollo17'
import { HistoricCard, HistoricStatus } from './HistoricPanel'
import { FAR_SHRINK, farTerrainGeometry } from './farTerrain'
import { STORM_HAZE, STORM_KIND, WEATHER_BODIES, WEATHER_FX, devilTarget, stepWeather, useWeather, stormTarget, weatherNow } from './weather'
import { Weather } from './Weather'
import { shimmerAmount, shimmerNow } from './heatShimmer'
import { CLOUD_DRIFT, cloudCover, cloudMaterial, cloudUniforms, withCloudShadow } from './clouds'
import { SkyFrame, hoursPerSecond, litFraction, useSkyClock } from './skyClock'
import type { SkyNow } from './skyNow'
import { SKY_FROM_APP } from '../../data/skyFrame'
import { Dust, Exhaust, Grit, LegRig, blastMark, TOUCHDOWN, legsDuringDescent, setLegs, splitLegs, descentAltitude, descentThrust, plumeGeometry, plumeMaterial, splashMaterial, suspension, windFor } from './landerFx'
import { QualityGovernor } from '../QualityGovernor'
import { labEnabled, useSurfaceLab } from '../../state/surfaceLab'
import { Rover } from './Rover'
import { MAP_KEYS, shrinkTexture } from './shrinkTexture'
import { RoverHud, RoverMap } from './RoverHud'
import { useMapTerrain } from './mapRelief'
import { bindRoverKeys, launchRover, recallRover, roverFocus, roverInput, useRover, useSampleLog } from '../../state/rover'
import { openRocks } from '../../state/rockBook'
import { compLabel, samplesFor } from '../../data/rockSamples'
import { ui } from '../../i18n'

// 着陸した天体の地表の場面。宇宙の場面とは別の Canvas で描く（そのあいだ宇宙の場面は止める）。
// 立つ場所は 1 か所に決めて、まわりを 360° 見回せる。着陸船は少し先に降りてくる。

const SKY_R = 9000
const EYE = 1.7
const LANDER_M = 24
const DESCENT_FROM = 260
const LANDER_YAW = 1.25

const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}`

/** 方位（度。0 が正面の -Z、時計回り）と高度（度）からの向き */
function dirFrom(azDeg: number, elDeg: number) {
  const az = (azDeg * Math.PI) / 180
  const el = (elDeg * Math.PI) / 180
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
}

function bodyName(id: string) {
  for (const p of PLANETS) {
    if (p.id === id) return ui().bodies[p.id].name
    const m = p.moons.find((x) => x.id === id)
    if (m) return ui().bodies[m.id].name
  }
  return id
}

// ---- 空 -------------------------------------------------------------------------

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const skyFragment = /* glsl */ `
  uniform sampler2D uLut;
  uniform float uStars;
  uniform sampler2D uGlow;
  uniform mat3 uGalRot;
  uniform float uAirglow;
  varying vec3 vDir;
  ${skyLookupGlsl}
  void main() {
    vec3 d = normalize(vDir);
    // 空の色は大気の計算の表から（地平線より下は、地平線のすぐ上の色で、遠い地面の向こうを埋める）
    vec3 col = airSkyColor(uLut, d);
    // 天の川の淡い光（星の点は星表で別に描く）。天体の自転と一緒に回る
    vec3 g = uGalRot * d;
    vec2 uv = vec2(fract(atan(g.z, -g.x) / 6.2831853 + 1.0), asin(clamp(g.y, -1.0, 1.0)) / 3.1415926 + 0.5);
    // 明るい星雲のかたまりが目立ちすぎないよう、明るいところを丸めて、淡い帯を持ち上げる
    vec3 mw = texture2D(uGlow, uv).rgb;
    mw = mw / (1.0 + 5.0 * mw);
    col += mw * 1.5 * uStars * smoothstep(-0.02, 0.12, d.y);
    // 夜空の地平線のほのかな明るさ（大気光と、遠くの星明かり）。山の稜線が夜空に浮かんで見える
    col += vec3(0.010, 0.014, 0.026) * uAirglow * (0.35 + 0.65 * pow(1.0 - clamp(d.y, 0.0, 1.0), 3.0));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const GAL = new THREE.Matrix3()
const M3 = new THREE.Matrix3()

function Sky({ def, lut, sky }: { def: SurfaceDef; lut: THREE.Texture; sky: SkyNow }) {
  const glow = useOptionalTexture(textureUrl('milkyWayGlow'))
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uLut: { value: lut }, uStars: { value: 0 }, uAirglow: { value: 0 }, uGlow: { value: null }, uGalRot: { value: new THREE.Matrix3() } },
      }),
    [lut],
  )
  useEffect(() => {
    mat.uniforms.uGlow.value = glow
  }, [mat, glow])
  const sphere = useRef<THREE.Mesh>(null)
  useFrame(({ camera }) => {
    // 空の球はカメラといっしょに動かす（ローバーで遠くへ行くと、球の向こう側がカメラの描く距離の外に出て、黒く抜けるため）
    sphere.current?.position.copy(camera.position)
    // 暗い場所で目が慣れたときの夜空：天の川がはっきり見える
    mat.uniforms.uStars.value = glow ? sky.starVis : 0
    mat.uniforms.uAirglow.value = def.sky && !def.sunHidden ? sky.night : 0
    // 地方の向き → 宇宙（黄道）→ 天の川の画像の向き
    M3.setFromMatrix4(sky.frame.toApp)
    mat.uniforms.uGalRot.value.copy(GAL.copy(SKY_FROM_APP)).multiply(M3)
  })
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <mesh ref={sphere} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[SKY_R, 48, 24]} />
    </mesh>
  )
}

function SunDisc({ def, sky }: { def: SurfaceDef; sky: SkyNow }) {
  const mat = useMemo(
    () => new THREE.SpriteMaterial({ map: haloTexture(), color: new THREE.Color(1.6, 1.5, 1.35), transparent: true, depthWrite: false, fog: false, toneMapped: false }),
    [],
  )
  const sprite = useRef<THREE.Sprite>(null)
  const angle = 0.533 / def.au
  // 光のにじみを含めて、少し大きめに（遠い星でも点として見えるように下限をつける）
  const size = Math.max(2 * SKY_R * Math.tan(((angle * Math.PI) / 180) / 2) * 7, 60)
  useFrame(({ camera }) => {
    const sp = sprite.current
    if (!sp) return
    const tint = sky.sunT
    // 大気を通った太陽の色（夕方は赤く暗く）。明るさは光のにじみが出るくらいに保つ
    const m = Math.max(tint.x, tint.y, tint.z, 1e-4)
    const k = 1.6 * Math.min(1, 0.35 + luminance(tint) * 2)
    mat.color.setRGB((tint.x / m) * k, (tint.y / m) * k * 0.94, (tint.z / m) * k * 0.85)
    mat.opacity = Math.min(1, luminance(tint) * 6)
    sp.visible = !def.sunHidden && sky.sunDir.y > -0.02
    sp.position.copy(sky.sunDir).multiplyScalar(SKY_R * 0.95).add(camera.position)
  })
  useEffect(() => () => mat.dispose(), [mat])
  return <sprite ref={sprite} material={mat} scale={[size, size, 1]} renderOrder={-9} />
}

const planetVertex = /* glsl */ `
  varying vec3 vN;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const planetFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform vec3 uColor;
  uniform vec3 uSun;
  uniform float uBright;
  uniform float uOpacity;
  varying vec3 vN;
  varying vec2 vUv;
  void main() {
    vec3 albedo = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : uColor;
    // 太陽に照らされた側だけ明るい（地平線の下に太陽があっても、空の惑星には日が当たっている）
    float l = smoothstep(-0.04, 0.12, dot(normalize(vN), uSun));
    gl_FragColor = vec4(albedo * l * uBright, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** 地球の空の月の方向（宇宙の向き）：太陽から黄道に沿って東へ 120°、少し北 */
function moonApp() {
  const sun = new THREE.Vector3()
  const f = new SkyFrame(surfaceFor('earth')!)
  f.set(0)
  sun.copy(f.sunLocal(new THREE.Vector3())).applyMatrix4(f.toApp)
  return sun.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(120)).add(new THREE.Vector3(0, 0.05, 0)).normalize()
}

/** 空に浮かぶ母惑星（または衛星）。太陽の光で満ち欠けする。地球の空の月だけは、星と一緒に空を回る */
function SkyPlanet({ def, sky }: { def: SurfaceDef; sky: SkyNow }) {
  const sb = def.skyBody!
  const map = useOptionalTexture(textureUrl(sb.id))
  const ringMap = useOptionalTexture(sb.ringOpen !== undefined ? textureUrl('saturnRing') : undefined)
  const dist = SKY_R * 0.8
  // 地球の空の月は、目で見た印象に合わせて 2 倍に（本当の 0.5° だと画面では小さな点になる）
  const isMoon = def.id === 'earth'
  const r = dist * Math.tan(((sb.angle * (isMoon ? 2 : 1) * Math.PI) / 180) / 2)
  const dir = useMemo(() => dirFrom(sb.az, sb.el), [sb.az, sb.el])
  // 地球の月：着陸したときの空の位置を、宇宙の向きで覚えておく（その後は自転で動く）
  // 太陽から東へ 120° 離れた「満ちていく途中の月（十日夜くらい）」：昼すぎの東の空にうっすら見え、
  // 日が沈むと明るく輝いて、夜中すぎに沈む
  const appDir = useMemo(() => (def.id === 'earth' ? moonApp() : null), [def.id])
  const group = useRef<THREE.Group>(null)
  const fade = Math.max(0.08, 1 - def.haze * 1.15)
  // 夜の月のまわりの、ぼうっとした光の輪
  const halo = useMemo(
    () => (isMoon ? new THREE.SpriteMaterial({ map: haloTexture(), color: new THREE.Color(0.75, 0.8, 0.95), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }) : null),
    [isMoon],
  )
  useEffect(() => () => halo?.dispose(), [halo])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: planetVertex,
        fragmentShader: planetFragment,
        uniforms: {
          uMap: { value: null },
          uHasMap: { value: 0 },
          uColor: { value: new THREE.Color(sb.color) },
          uSun: { value: new THREE.Vector3(0, 1, 0) },
          uBright: { value: 1 },
          uOpacity: { value: fade },
        },
        transparent: fade < 1,
        fog: false,
      }),
    [sb.color, fade],
  )
  useEffect(() => {
    mat.uniforms.uMap.value = map
    mat.uniforms.uHasMap.value = map ? 1 : 0
  }, [mat, map])
  useEffect(() => () => mat.dispose(), [mat])
  const ring = useMemo(() => {
    if (sb.ringOpen === undefined) return null
    const planet = PLANETS.find((p) => p.id === sb.id)!.ring!
    const geo = new THREE.RingGeometry(r * planet.inner, r * planet.outer, 128, 1)
    const uv = geo.attributes.uv as THREE.BufferAttribute
    const p = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const d = Math.hypot(p.getX(i), p.getY(i))
      uv.setXY(i, (d - r * planet.inner) / (r * (planet.outer - planet.inner)), 0.5)
    }
    // 輪の面：見る向き f と、その横 r を含む面を、ringOpen だけ開く。赤道の傾きの分だけ少しひねる
    const f = dir.clone()
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize()
    const up = new THREE.Vector3().crossVectors(right, f).normalize()
    const open = ((sb.ringOpen ?? 0) * Math.PI) / 180
    const n = up.clone().multiplyScalar(Math.cos(open)).addScaledVector(f, -Math.sin(open)).normalize()
    n.applyAxisAngle(f, 0.35)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
    return { geo, q }
  }, [sb.ringOpen, sb.id, r, dir])
  useFrame(({ camera }) => {
    const g = group.current
    if (!g) return
    if (appDir) sky.bodyDir.copy(appDir).applyMatrix4(sky.frame.toLocal)
    else sky.bodyDir.copy(dir)
    g.position.copy(sky.bodyDir).multiplyScalar(dist).add(camera.position)
    mat.uniforms.uSun.value.copy(sky.sunDir)
    // 日の当たった面の明るさ：地面と同じ太陽の強さと露出（アルベドは模様の色）
    // 夜は目が暗さに慣れているので、月は白く輝いて見える
    const cap = isMoon ? 4 + 12 * sky.night : 4
    mat.uniforms.uBright.value = Math.min(cap, (def.au ** -2 * sky.exposure * 0.9) / Math.PI) * (def.sunHidden ? 0.25 : 1)
    if (isMoon) {
      mat.uniforms.uOpacity.value = fade + (1 - fade) * sky.night
      mat.transparent = mat.uniforms.uOpacity.value < 0.999
      if (halo) halo.opacity = 0.55 * sky.night * sky.bodyLit * THREE.MathUtils.smoothstep(sky.bodyDir.y, -0.03, 0.05)
    }
  })
  return (
    <group ref={group}>
      <mesh rotation={[0.4, 2.2, 0.2]} material={mat}>
        <sphereGeometry args={[r, 64, 32]} />
      </mesh>
      {halo && <sprite material={halo} scale={[r * 9, r * 9, 1]} renderOrder={-7} />}
      {ring && (
        <mesh geometry={ring.geo} quaternion={ring.q}>
          <meshStandardMaterial key={ringMap ? 'map' : 'none'} map={ringMap} alphaMap={ringMap} color="#e8dcc0" transparent opacity={0.9 * fade} side={THREE.DoubleSide} depthWrite={false} fog={false} />
        </mesh>
      )}
    </group>
  )
}

/** 噴き出す柱（エンケラドゥスの氷の噴水・イオの火山・トリトンの間欠泉） */
function Plumes({ def }: { def: SurfaceDef }) {
  const items = useMemo(() => {
    const out: { pos: THREE.Vector3; scale: number; color: THREE.Color; opacity: number }[] = []
    const rnd = seeded(31)
    const add = (az: number, dist: number, height: number, width: number, color: string, opacity: number, umbrella = false, lean = 0) => {
      const base = dirFrom(az, 0).multiplyScalar(dist)
      const n = 26
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1)
        const p = base.clone()
        p.y = u * height
        p.x += lean * u * u * height
        const w = umbrella ? width * (0.4 + 2.2 * u ** 3) : width * (0.6 + 0.8 * u)
        out.push({ pos: p.add(new THREE.Vector3((rnd() - 0.5) * w * 0.3, 0, (rnd() - 0.5) * w * 0.3)), scale: w, color: new THREE.Color(color), opacity: opacity * (1 - 0.6 * u) })
      }
    }
    for (const x of def.extras ?? []) {
      if (x === 'plumes') {
        add(-70, 2600, 2400, 260, '#dfeaff', 0.16)
        add(-55, 3100, 3000, 300, '#dfeaff', 0.13)
        add(-85, 2900, 2000, 220, '#dfeaff', 0.12)
      } else if (x === 'volcano') add(60, 2900, 2200, 380, '#f2e6a8', 0.2, true)
      else if (x === 'geysers') {
        add(-60, 2400, 2600, 70, '#2a2420', 0.35, false, 0.25)
        add(70, 3000, 2200, 60, '#2a2420', 0.3, false, 0.25)
      }
    }
    return out
  }, [def])
  const mats = useMemo(() => items.map((it) => new THREE.SpriteMaterial({ map: haloTexture(), color: it.color, transparent: true, opacity: it.opacity, depthWrite: false, fog: false })), [items])
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats])
  return (
    <>
      {items.map((it, i) => (
        <sprite key={i} material={mats[i]} position={it.pos} scale={[it.scale, it.scale, 1]} />
      ))}
    </>
  )
}

// ---- 地面と岩 ---------------------------------------------------------------------

/** 雲のある天体か（厚い雲で太陽が見えない金星は除く） */
const hasClouds = (def: SurfaceDef) => !!def.extras?.includes('clouds') && !def.sunHidden

/** 雲のある天体なら、地面に雲の影を落とす */
function cloudy<M extends THREE.Material>(def: SurfaceDef, m: M): M {
  return hasClouds(def) ? withCloudShadow(m) : m
}

const CLOUD_R = 8200
const TINT = new THREE.Vector3()
const WIND_A = new THREE.Vector2()
const WIND_B = new THREE.Vector2()

/** 空の雲の層。時間の進みに合わせて流れ、午後に増え、夕焼けに染まり、夜は暗い影になる */
function Clouds({ terrain, ap, sky, clock }: { terrain: Terrain; ap: ApUniforms; sky: SkyNow; clock: { current: { hours: number } } }) {
  const level = useLevel()
  const light = level === 'low' || lowMemory()
  const mat = useMemo(() => cloudMaterial(ap, CLOUD_R, light), [ap, light])
  const y = terrain.height(0, 0) + 1800
  const cover = useRef(-1)
  useEffect(() => {
    const w = windFor(terrain.def.id, true)
    WIND_A.set(w.x, w.z).normalize()
    // 2 枚目の模様は少し向きを変えて遅く流す（重なり方が変わって、雲の形が育ったり崩れたりして見える）
    WIND_B.copy(WIND_A).rotateAround(new THREE.Vector2(), 0.35).multiplyScalar(0.62)
    cloudUniforms.uCloudOn.value = 1
    cloudUniforms.uCloudH.value = y
    return () => {
      cloudUniforms.uCloudOn.value = 0
    }
  }, [terrain, y])
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(() => {
    const h = clock.current.hours
    const u = cloudUniforms
    u.uCloudOff.value.set(-WIND_A.x * h * CLOUD_DRIFT, -WIND_A.y * h * CLOUD_DRIFT, -WIND_B.x * h * CLOUD_DRIFT, -WIND_B.y * h * CLOUD_DRIFT)
    // 砂嵐の間は、舞い上がった砂のもやに隠れて雲が見えにくい
    const target = cloudCover(sky.frame.localClock(), h) * (1 - 0.85 * weatherNow.storm)
    cover.current = cover.current < 0 ? target : cover.current + (target - cover.current) * 0.05
    u.uCloudCover.value = cover.current
    u.uCloudSun.value.copy(sky.sunDir)
    // 雲を照らす日の光：地面と同じ強さと色。日が沈んだ直後も、高い雲にはしばらく夕日が当たる
    const t = sky.sunT
    const lit = THREE.MathUtils.smoothstep(sky.sunDir.y, -0.07, 0.01)
    mat.uniforms.uSunCol.value.copy(t).multiplyScalar(sky.exposure * lit * 0.9)
    // 夜：星明かりと月明かりで、雲がうっすら灰色に見える
    const n = sky.night
    mat.uniforms.uNightCol.value.set(0.012, 0.015, 0.024).multiplyScalar(n * (0.6 + 1.6 * sky.bodyLit))
  })
  return (
    <mesh material={mat} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
      <circleGeometry args={[CLOUD_R, 96]} />
    </mesh>
  )
}

/** カメラのまわりで山並みを描かない半径（m）。そこは近くの粗い地面（ローバーのまわり 2.8 km 以上）が受け持つ */
const FAR_HOLE = 2400

/**
 * 山並みの、カメラから FAR_HOLE より近いところを描かない。山並みは目の高さを中心に縮めて置き、深さを比べずに描くので、
 * ローバーが着陸地点から 700 m 以上離れると、足元の山並み（遠くの地図の粗い高さ）が小さな模型のようにカメラのすぐそばに来る。
 * 低い谷では、それが頭の上の平らな面（火星ではオレンジ色）に見え、その下を走っているようになっていた
 */
function farHole<M extends THREE.Material>(material: M): M {
  const prev = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `void main() {\n  if (distance(vAirWorld.xz, cameraPosition.xz) < ${FAR_HOLE.toFixed(1)}) discard;`,
    )
  }
  const key = material.customProgramCacheKey.bind(material)
  material.customProgramCacheKey = () => key() + '|far-hole'
  material.needsUpdate = true
  return material
}

/** 地平線の山並み（本物の地形の遠くの地図） */
function FarTerrain({ terrain, ap }: { terrain: Terrain; ap: ApUniforms }) {
  const eyeY = terrain.height(0, 0) + EYE
  // 広い天体では、ローバーが着陸地点から 2 km 離れると、近くの地面（ローバーのまわり 3.2 km）と山並みの内側のふちの間が
  // あいてしまう（着陸地点の反対側）。山並みを内側（700 m）から作って、そのすき間を遠くの地図でふさぐ。近くの地面の下は上から塗られて見えない
  const geo = useMemo(
    () => (isWide(terrain) ? farTerrainGeometry(terrain.def, terrain.dem!.far, eyeY, 700, 150) : farTerrainGeometry(terrain.def, terrain.dem!.far, eyeY, 2900)),
    [terrain, eyeY],
  )
  const mesh = useRef<THREE.Mesh>(null)
  // 山並みは、着陸地点の目の高さを中心に 1/FAR_SHRINK に縮めて置いてある。カメラが動いたら（ローバーで走るとき）
  // 縮める中心もカメラへずらす：そうしないと、山の見える向きがずれて、近くの地面との間に隙間ができる
  useFrame(({ camera }) => {
    const m = mesh.current
    if (!m) return
    const k = 1 - 1 / FAR_SHRINK
    m.position.set(camera.position.x * k, (camera.position.y - eyeY) * k, camera.position.z * k)
  })
  const mat = useMemo(
    () =>
      farHole(
        cloudy(
          terrain.def,
          withAir(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, depthTest: false, depthWrite: false }), ap, true),
        ),
      ),
    [ap, terrain.def],
  )
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  // 星と太陽の後、近くの地面の前に描く（近くの地面が上から重なる）
  return <mesh ref={mesh} geometry={geo} material={mat} renderOrder={-6.5} frustumCulled={false} />
}

/** 岩の根元の影：中心が暗く、外へ向かって消える円（掛け算で地面を暗くする） */
let contactMat: THREE.MeshBasicMaterial | null = null
function contactShadowMaterial() {
  if (contactMat) return contactMat
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgb(90,90,90)')
  grad.addColorStop(0.55, 'rgb(150,150,150)')
  grad.addColorStop(1, 'rgb(255,255,255)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  contactMat = new THREE.MeshBasicMaterial({ map: tex, blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false, toneMapped: false })
  return contactMat
}

/**
 * 近くの岩（中心からこの距離 m まで。大きな岩は 1 m ごとに BIG_REACH m ずつ遠くまで）は細かい形で影も落とす。
 * それより遠い岩は粗い形で、影も落とさない（影の範囲は ±70 m なので、遠くの岩の影はどのみち写らない。
 * 全部を細かい形で、しかも影のためにもう一度描くと、火星で 1 コマ 200 万枚を超える三角形になっていた）
 */
const NEAR_ROCKS = 60
const BIG_REACH = 40
/** 岩の形の種類の数（近い用・遠い用で 2 組） */
const ROCK_KINDS = 3

/** 岩を並べる（地面の傾きに沿わせ、明るさを少しずつ変え、根元に影の円を置く） */
function layRocks(rocks: Rock[], inst: (THREE.InstancedMesh | null)[], contact: THREE.InstancedMesh | null, terrain: Terrain, shadowAt: { x: number; z: number; r: number }) {
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const qy = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const n = new THREE.Vector3()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()
  const counts = new Array(inst.length).fill(0)
  const tone = new THREE.Color()
  let shadows = 0
  for (const r of rocks) {
    // 近い岩は細かい組（0〜2）、遠い岩は粗い組（3〜5）へ
    const near = Math.hypot(r.x - shadowAt.x, r.z - shadowAt.z) < NEAR_ROCKS + r.s * BIG_REACH
    const v = r.v + (near ? 0 : ROCK_KINDS)
    const mesh = inst[v]
    if (!mesh || counts[v] >= mesh.instanceMatrix.count) continue
    // 地面の傾きに沿わせて寝かせ、向きはばらばらに
    n.set(r.nx, 1, r.nz).normalize()
    q.setFromUnitVectors(up, n)
    qy.setFromAxisAngle(up, r.rot)
    q.multiply(qy)
    s.set(r.s, r.s * r.sy, r.s * (0.7 + 0.3 * r.sy))
    p.set(r.x, r.y, r.z)
    m.compose(p, q, s)
    // 岩ごとに少し明るさを変える（同じ色の岩が並ばないように）
    mesh.setColorAt(counts[v], tone.setScalar((0.78 + 0.4 * ((r.rot * 977) % 1)) * (r.k ?? 1)))
    mesh.setMatrixAt(counts[v]++, m)
    // 根元の影（地面に接している所が暗い）：岩より少し大きい、ぼかした円
    if (contact && r.s > 0.15 && Math.hypot(r.x - shadowAt.x, r.z - shadowAt.z) < shadowAt.r && shadows < contact.instanceMatrix.count) {
      s.set(r.s * 1.5, 1, r.s * 1.5)
      p.set(r.x, terrain.height(r.x, r.z) + 0.03, r.z)
      m.compose(p, q, s)
      contact.setMatrixAt(shadows++, m)
    }
  }
  inst.forEach((mesh, i) => {
    if (!mesh) return
    mesh.count = counts[i]
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  })
  if (contact) {
    contact.count = shadows
    contact.instanceMatrix.needsUpdate = true
  }
}

function Ground({ terrain, ap }: { terrain: Terrain; ap: ApUniforms }) {
  const def = terrain.def
  const level = useLevel()
  const light = level === 'low' || lowMemory()
  const wide = isWide(terrain)
  // 広い天体：ローバーのまわりのタイルと、作り直す粗い地面（軽くするときはタイルを減らし、間隔を広く）
  const world = useMemo(
    () => {
      if (!wide) return null
      // 岩の数は天体ごとの岩の多さ（火星 0.85 で 1 枚 110 個）に合わせる
      const k = def.relief.rocks / 0.85
      return new WideWorld(terrain, light ? { n: 3, step: 2, rocks: Math.round(70 * k) } : { n: 5, step: 1, rocks: Math.round(110 * k) })
    },
    [terrain, wide, light, def.relief.rocks],
  )
  useEffect(() => {
    wideNow.world = world
    return () => {
      if (wideNow.world === world) wideNow.world = null
      world?.dispose()
    }
  }, [world])
  const geo = useMemo(() => (world ? null : terrain.geometry()), [terrain, world])
  const rocks = useMemo(() => (world ? [] : terrain.rocks(Math.round(def.relief.rocks * 1400))), [terrain, def.relief.rocks, world])
  // 広い天体：岩塊の野のタイルは岩が 14 倍になるので、余裕をもたせる（1 種類あたりの上限）
  const rockCap = world ? world.opt.n ** 2 * world.opt.rocks * 3 : rocks.length
  const round = def.id === 'titan'
  // 近い岩用の細かい形 3 種と、同じ種から作る遠い岩用の粗い形 3 種
  const rockGeos = useMemo(
    () => [
      ...[0, 1, 2].map((k) => rockGeometry(terrain.seed + k * 17, round)),
      ...[0, 1, 2].map((k) => rockGeometry(terrain.seed + k * 17, round, 1)),
    ],
    [terrain.seed, round],
  )
  const grain = grainTexture()
  // 地面の素材（砂・レゴリス・氷・火山岩）の細かい凹凸と粗さ、斜面の岩肌
  const groundMat = useMemo(() => cloudy(def, withAir(groundMaterial(def, light), ap)), [def, light, ap])
  // 広い天体の粗い地面：タイルの下を沈める
  const coarseMat = useMemo(() => (world ? cloudy(def, withAir(withHole(groundMaterial(def, light), world.hole), ap)) : null), [def, light, ap, world])
  const rockMat = useMemo(
    () =>
      cloudy(
        def,
        withAir(
          // 岩肌の割れ目と段の凹凸、上を向いた面にたまる砂（丸い氷の小石には砂を積もらせない）
          withRockDetail(new THREE.MeshStandardMaterial({ color: def.rock, roughness: round ? 0.7 : 0.92, metalness: 0, map: grain }), {
            dust: round ? null : new THREE.Color(def.ground),
            strength: round ? 0.6 : 1.4,
            // 火星の岩は、根元に砂ぼこりをかぶせて、地面に落ち着いて見えるように
            settle: def.id === 'mars' ? 0.75 : 0,
          }),
          ap,
        ),
      ),
    [def, grain, round, ap],
  )
  const inst = useRef<(THREE.InstancedMesh | null)[]>([])
  const contact = useRef<THREE.InstancedMesh>(null)
  const contactGeo = useMemo(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), [])
  // 狭い天体：細かい岩（影つき）の範囲を、ローバーが動いたら付いていかせる
  const laidAt = useRef({ x: 0, z: 0 })
  useEffect(() => {
    if (world) return
    laidAt.current = { x: 0, z: 0 }
    layRocks(rocks, inst.current, contact.current, terrain, { x: 0, z: 0, r: 160 })
    // 素材が変わると（画質の自動切り替えなど）instancedMesh が作り直されるので、そのたびに並べ直す。
    // 並べ直さないと、岩がすべて原点に重なって見えなくなる（ローバーの当たり判定だけが残る）
  }, [rocks, rockMat, rockGeos, terrain, world])

  // ---- 広い天体：見ている場所に合わせてタイルを入れ替える ----
  const tiles = useRef<THREE.Group>(null)
  const coarse = useRef<THREE.Mesh>(null)
  const shown = useRef({ version: -1, coarse: -1, mats: null as unknown })
  useFrame(() => {
    if (!world) {
      const rv = useRover.getState().phase !== 'none'
      const x = rv ? roverFocus.x : 0
      const z = rv ? roverFocus.z : 0
      if (Math.hypot(x - laidAt.current.x, z - laidAt.current.z) > 25) {
        laidAt.current = { x, z }
        layRocks(rocks, inst.current, contact.current, terrain, { x, z, r: 160 })
      }
      return
    }
    const rv = useRover.getState().phase !== 'none'
    world.update(rv ? roverFocus.x : 0, rv ? roverFocus.z : 0, light ? 3 : 4)
    const sh = shown.current
    // 素材が作り直されたとき（画質の切り替え）も並べ直す
    const mats = rockMat
    if (sh.version !== world.version || sh.mats !== mats) {
      sh.version = world.version
      sh.mats = mats
      const g = tiles.current
      if (g) {
        g.clear()
        for (const t of world.active) {
          const mesh = new THREE.Mesh(t.geo, groundMat)
          mesh.receiveShadow = true
          mesh.matrixAutoUpdate = false
          g.add(mesh)
        }
      }
      layRocks(world.rocks(), inst.current, contact.current, terrain, { x: world.patch.x, z: world.patch.z, r: 160 })
    }
    if (sh.coarse !== world.coarseVersion && coarse.current) {
      sh.coarse = world.coarseVersion
      coarse.current.geometry = world.coarse
    }
  })
  useEffect(() => {
    // タイルの材質を変えたら、次のフレームで作り直す
    shown.current.version = -1
  }, [groundMat])
  useEffect(
    () => () => {
      geo?.dispose()
      contactGeo.dispose()
      rockGeos.forEach((g) => g.dispose())
      groundMat.dispose()
      coarseMat?.dispose()
      rockMat.dispose()
    },
    [geo, contactGeo, rockGeos, groundMat, coarseMat, rockMat],
  )
  return (
    <>
      {geo && <mesh geometry={geo} material={groundMat} receiveShadow />}
      {world && coarseMat && (
        <>
          <mesh ref={coarse} geometry={world.coarse} material={coarseMat} receiveShadow frustumCulled={false} />
          <group ref={tiles} />
        </>
      )}
      <instancedMesh ref={contact} args={[contactGeo, contactShadowMaterial(), rockCap]} frustumCulled={false} renderOrder={1} />
      {rockGeos.map((g, i) => (
        <instancedMesh
          key={i}
          ref={(el) => {
            inst.current[i] = el
          }}
          args={[g, rockMat, rockCap]}
          castShadow={i < ROCK_KINDS}
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </>
  )
}

// ---- 着陸船 -------------------------------------------------------------------------

/** 着陸船の腹の下の噴射口（glb の座標。1 = 24 m） */
const BELLY: [number, number, number][] = [
  [-0.11, 0.075, -0.2],
  [0.11, 0.075, -0.2],
  [-0.13, 0.08, 0.22],
  [0.13, 0.08, 0.22],
]


function Lander({ terrain, dustColor, ap, sky }: { terrain: Terrain; dustColor: string; ap: ApUniforms; sky: SkyNow }) {
  const sunDir = sky.sunDir
  const { scene } = useGLTF(url('ship-lander.glb'))
  const group = useRef<THREE.Group>(null)
  const ground = useMemo(() => terrain.height(LANDER_POS.x, LANDER_POS.y), [terrain])
  const built = useMemo(() => {
    const model = scene.clone(true)
    const owned: { dispose: () => void }[] = []
    // スマホでは着陸船のテクスチャを 1024 に縮める（見た目はほとんど変わらず、メモリは 1/4）
    const small = new Map<THREE.Texture, THREE.Texture>()
    const shrink = (m: THREE.MeshStandardMaterial) => {
      if (!lowMemory()) return
      for (const key of MAP_KEYS) {
        const tex = m[key]
        if (!tex) continue
        if (!small.has(tex)) {
          const s = shrinkTexture(tex, 1024)
          small.set(tex, s ?? tex)
          if (s) owned.push(s)
        }
        m[key] = small.get(tex)!
      }
    }
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.75, 2), toneMapped: false })
    owned.push(glow)
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      // 自分の影を受けると、細かい面に影のしま模様が出るので受けない
      mesh.receiveShadow = false
      const src = mesh.material as THREE.MeshStandardMaterial
      if (src.name === 'Glow') mesh.material = glow
      else if (src.name === 'NavRed' || src.name === 'NavGreen') {
        const m = new THREE.MeshBasicMaterial({ color: src.name === 'NavRed' ? new THREE.Color(1.3, 0.04, 0.04) : new THREE.Color(0.04, 1.3, 0.15), toneMapped: false })
        owned.push(m)
        mesh.material = m
      } else {
        const m = src.clone()
        m.emissive.setRGB(1, 1, 1)
        m.emissiveIntensity = 1
        m.envMapIntensity = 0.8
        shrink(m)
        cloudy(terrain.def, withAir(m, ap))
        owned.push(m)
        mesh.material = m
      }
    })
    // 脚（サスペンション）と、それより上の船体を分けて動かす。噴射口は船体と一緒に沈む
    const legsObj = model.getObjectByName('Legs') as THREE.Mesh | undefined
    // 脚を 4 本に分けて、付け根で畳めるようにする（模型の Legs は隠す）
    let legs: LegRig | null = null
    if (legsObj?.isMesh) {
      legs = splitLegs(legsObj)
      legsObj.visible = false
      legsObj.parent?.add(legs.rig)
      legs.rig.traverse((o) => {
        const g = (o as THREE.Mesh).geometry
        if (g) owned.push(g)
      })
    }
    const body = ['Hull', 'Wings', 'Engine'].map((n) => model.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o)
    const hull = body[0] ?? model
    // 腹の噴射：噴射口ごとに円すいの噴流
    const plumeGeo = plumeGeometry()
    const plumeMat = plumeMaterial()
    owned.push(plumeGeo, plumeMat)
    const plumes: THREE.Mesh[] = []
    for (const p of BELLY) {
      const m = new THREE.Mesh(plumeGeo, plumeMat)
      m.position.set(p[0], p[1] - 0.004, p[2])
      m.renderOrder = 3
      m.frustumCulled = false
      hull.add(m)
      plumes.push(m)
    }
    return { model, owned, plumes, plumeMat, legs, body }
  }, [scene, ap])
  useEffect(() => () => built.owned.forEach((m) => m.dispose()), [built])

  // 地面に当たった噴流の光（平たい円）と、地面を照らす光
  const splash = useMemo(() => {
    const mat = splashMaterial()
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.rotateX(-Math.PI / 2)
    return { mat, geo }
  }, [])
  useEffect(() => () => {
    splash.mat.dispose()
    splash.geo.dispose()
  }, [splash])
  const splashMesh = useRef<THREE.Mesh>(null)
  const blast = useMemo(() => blastMark(new THREE.Color(terrain.def.ground), !!terrain.def.sky), [terrain])
  useEffect(
    () => () => {
      blast.geo.dispose()
      blast.mat.dispose()
    },
    [blast],
  )
  const blastMesh = useRef<THREE.Mesh>(null)
  const blastAmt = useRef(0)
  const light = useRef<THREE.PointLight>(null)
  // 夜の足元の照明（着陸船の腹の作業灯）
  const work = useRef<THREE.PointLight>(null)

  // 砂ぼこり：降りる・飛び立つときに、着陸船の下から外へ広がり、風に流されていく
  const level = useLevel()
  const hasAir = !!terrain.def.sky
  const dust = useMemo(() => {
    const count = level === 'high' ? 800 : level === 'medium' ? 520 : 240
    const c = new THREE.Color(dustColor)
    return new Dust(count, c, hasAir ? 0.55 : 0, terrain.def.gravity, windFor(terrain.def.id, hasAir))
  }, [dustColor, level, hasAir, terrain])
  useEffect(() => () => dust.dispose(), [dust])
  // 噴射口から吹き出すガスの粒
  const exhaust = useMemo(() => new Exhaust(level === 'high' ? 4000 : level === 'medium' ? 2600 : 1200, hasAir), [level, hasAir])
  useEffect(() => () => exhaust.dispose(), [exhaust])
  const nozzle = useMemo(() => new THREE.Vector3(), [])
  // ひとつぶずつ見える砂つぶ
  const grit = useMemo(() => {
    const count = level === 'high' ? 9000 : level === 'medium' ? 5500 : 2200
    return new Grit(count, new THREE.Color(dustColor), hasAir, terrain.def.gravity, windFor(terrain.def.id, hasAir))
  }, [dustColor, level, hasAir, terrain])
  useEffect(() => () => grit.dispose(), [grit])
  const dustBase = useMemo(() => new THREE.Color(dustColor), [dustColor])
  const camDir = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    dt = Math.min(dt, 0.1)
    const { phase, since, ready } = useLanding.getState()
    // 用意ができるまでは、降下の始まりで止めておく
    const T = phase === 'descent' && !ready ? 0 : landingNow() - since
    let alt = 0
    let thrust = 0
    let wobble = 0
    let squash = 0
    if (phase === 'descent') {
      alt = descentAltitude(T, DESCENT, DESCENT_FROM)
      thrust = descentThrust(T, DESCENT)
      wobble = Math.max(0, 1 - T / (DESCENT * TOUCHDOWN)) * 0.06
      squash = suspension(T - DESCENT * TOUCHDOWN, terrain.def.gravity)
    } else if (phase === 'surface') {
      // 降下を飛ばしたときも、落ち着いた縮みにする
      squash = suspension(T + DESCENT * (1 - TOUCHDOWN), terrain.def.gravity)
    } else if (phase === 'ascent' || phase === 'fadeOut') {
      const s = phase === 'ascent' ? T : ASCENT
      // エンジンを吹かすと、まず脚が伸びて、それから浮く
      alt = s < 0.6 ? 0 : s < 1.6 ? 0.6 * (s - 0.6) ** 2 : 0.6 + 5 * (s - 1.6) ** 2.2
      thrust = s < 0.4 ? s / 0.4 : 1
      wobble = Math.min(1, s / 3) * 0.05
      squash = suspension(99, terrain.def.gravity) * Math.max(0, 1 - s / 0.6)
    }
    g.position.set(LANDER_POS.x, ground + alt, LANDER_POS.y)
    const tm = landingNow()
    // 接地の瞬間、片側の脚から着いて、少し揺れる
    const tdT = phase === 'descent' ? T - DESCENT * TOUCHDOWN : -1
    const rock = tdT > 0 ? Math.exp(-tdT * 3) * Math.sin(tdT * 9) * 0.012 : 0
    g.rotation.set(Math.sin(tm * 0.9) * wobble + rock, LANDER_YAW + Math.sin(tm * 0.5) * wobble * 0.5, Math.sin(tm * 1.3) * wobble + rock * 0.6)

    // サスペンション：船体を下げ、脚を縮める（脚の高さは模型で 0.117 = 2.8 m）
    const sq = squash / LANDER_M
    for (const o of built.body) o.position.y = -sq
    if (built.legs) {
      built.legs.rig.scale.y = Math.max(0.6, 1 - sq / 0.117)
      // 脚の出し入れ：降下の途中で出し、離陸して浮いたら畳む
      let deploy = 1
      if (phase === 'descent') deploy = legsDuringDescent(T, DESCENT, DESCENT_FROM)
      else if (phase === 'ascent') deploy = 1 - (T - 2.0) / 2.2
      else if (phase === 'fadeOut') deploy = 0
      setLegs(built.legs, useSurfaceLab.getState().legs ?? deploy)
    }

    // 噴射：地面が近いほど噴流は短く、地面で平たく広がる
    const flick = 0.9 + 0.1 * Math.sin(tm * 37)
    // 噴射口のすぐ下の、短く明るい芯（ガスの本体は粒で描く）
    const lenM = Math.min(2.2, 0.8 + alt * 0.1) * thrust
    built.plumeMat.uniforms.uPower.value = thrust * 0.5 * flick
    built.plumeMat.uniforms.uTime.value = tm
    const lowQ = level === 'low'
    for (const m of built.plumes) {
      m.visible = thrust > 0.02
      const L = lenM / LANDER_M
      m.scale.set(0.035 + L * 0.1, Math.max(L, 0.002), 0.035 + L * 0.1)
      if (thrust > 0.02) {
        m.getWorldPosition(nozzle)
        exhaust.emit(dt, nozzle.x, nozzle.y - 0.2, nozzle.z, thrust, lowQ ? 260 : 700)
      }
    }
    const nearGround = thrust > 0.02 ? Math.max(0, 1 - alt / 30) : 0
    if (splashMesh.current) {
      splashMesh.current.position.set(LANDER_POS.x, ground + 0.08, LANDER_POS.y)
      const r = 10 + alt * 0.4
      splashMesh.current.scale.set(r, 1, r)
      splashMesh.current.visible = nearGround > 0.01
      splash.mat.uniforms.uPower.value = nearGround * thrust * 0.5 * flick
    }
    if (light.current) {
      light.current.position.set(LANDER_POS.x, ground + alt + 1.2 - squash, LANDER_POS.y)
      light.current.intensity = thrust * flick * 900 * (0.4 + 0.6 * nearGround)
    }

    if (work.current) {
      work.current.position.set(LANDER_POS.x, ground + alt + 1.4 - squash, LANDER_POS.y)
      work.current.intensity = sky.night * 70
    }

    // 砂ぼこり
    if (thrust > 0.05 && alt < 28 && terrain.def.dust) {
      const k = thrust * (1 - alt / 28) ** 1.5
      dust.emit(dt, LANDER_POS.x, ground, LANDER_POS.y, k, hasAir ? (level === 'low' ? 30 : 70) : level === 'low' ? 160 : 320)
      grit.emit(dt, LANDER_POS.x, ground, LANDER_POS.y, k, level === 'low' ? 2200 : 6000)
    }
    const cam = state.camera as THREE.PerspectiveCamera
    dust.material.uniforms.uScale.value = state.size.height * state.viewport.dpr / (2 * Math.tan((cam.fov * Math.PI) / 360))
    dust.update(dt, ground)
    exhaust.material.uniforms.uScale.value = dust.material.uniforms.uScale.value
    exhaust.update(dt, ground, flick)
    grit.material.uniforms.uScale.value = dust.material.uniforms.uScale.value
    grit.update(dt, ground)
    // 太陽を背にすると暗く、太陽の方を向くと光る（細かい粒は光を前へ散らす）
    cam.getWorldDirection(camDir)
    const fwd = Math.max(0, camDir.dot(sunDir)) ** 3
    const lit = Math.max(0.15, Math.min(1, sunDir.y * 3 + 0.2))
    dust.material.uniforms.uColor.value.copy(dustBase).multiplyScalar(lit * (0.85 + 1.2 * fwd))
    dust.material.uniforms.uShadow.value.copy(dustBase).multiplyScalar(lit * (0.3 + 0.5 * fwd) + 0.04)
    dust.material.uniforms.uSunView.value.copy(sunDir).transformDirection(cam.matrixWorldInverse)
    // 着陸の跡：地面の近くで噴かしたぶんだけ濃くなる（降下を飛ばしたときは、はじめから付いている）
    if (phase === 'surface' && blastAmt.current === 0) blastAmt.current = 1
    blastAmt.current = Math.min(1, blastAmt.current + dt * thrust * Math.max(0, 1 - alt / 12) * 0.35)
    blast.mat.opacity = blastAmt.current * 0.85
    if (blastMesh.current) blastMesh.current.position.set(LANDER_POS.x, ground + 0.06, LANDER_POS.y)
    grit.material.uniforms.uColor.value.copy(dustBase).multiplyScalar(lit * (0.55 + 0.5 * fwd))
  })

  return (
    <>
      <group ref={group} scale={LANDER_M} name="surface-lander">
        <primitive object={built.model} />
      </group>
      <mesh ref={blastMesh} geometry={blast.geo} material={blast.mat} scale={[16, 1, 16]} receiveShadow renderOrder={0} frustumCulled={false} />
      <mesh ref={splashMesh} geometry={splash.geo} material={splash.mat} renderOrder={1} frustumCulled={false} />
      <pointLight ref={light} color="#9fb8ff" distance={60} decay={2} intensity={0} />
      <pointLight ref={work} color="#ffd9a8" distance={45} decay={2} intensity={0} />
      <primitive object={dust.points} />
      <primitive object={exhaust.points} />
      <primitive object={grit.points} />
    </>
  )
}

// ---- カメラ：立って見回す／着陸船のまわりを回る ---------------------------------------

/**
 * 木星より遠い天体の露出の補正（EV）。目は暗さに慣れるが、autoExposure の慣れ方だけでは
 * 天王星・海王星・冥王星の地面が黒一色に沈んで、どの衛星も同じに見えてしまう。
 * 遠いほど少し明るく（土星 +0.5、天王星 +1.1、海王星 +1.5、冥王星 +1.8）。天体どうしの明るさの差（白い氷と黒い砂）は残る
 */
const outerEv = (au: number) => Math.max(0, Math.log2(au / 5.2)) * 0.6

function Look({ terrain }: { terrain: Terrain }) {
  const { camera, gl } = useThree()
  const cam = camera as THREE.PerspectiveCamera
  const view = useLanding((l) => l.view)
  const st = useRef({ yaw: -0.15, pitch: 0.12, fov: 60, orbitYaw: 0.9, orbitPitch: 0.22, orbitDist: 48 })
  // 確認用（#debug のときだけある window.__sv から、見る向きを変えられる）
  useEffect(() => {
    const sv = (window as unknown as { __sv?: Record<string, unknown> }).__sv
    if (sv) sv.surfaceCam = st.current
  }, [])
  const eyeY = useMemo(() => terrain.height(0, 0) + EYE, [terrain])
  const landerAt = useMemo(() => new THREE.Vector3(LANDER_POS.x, terrain.height(LANDER_POS.x, LANDER_POS.y) + 3, LANDER_POS.y), [terrain])

  useEffect(() => {
    const el = gl.domElement
    const pointers = new Map<number, { x: number; y: number }>()
    let pinch = 0
    const canLook = () => useLanding.getState().phase === 'surface'
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (!canLook()) return
      const s = st.current
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch) zoom(pinch / d)
        pinch = d
        return
      }
      const k = 0.0042 * (s.fov / 60)
      if (useLanding.getState().view === 'eye') {
        s.yaw += dx * k
        s.pitch = THREE.MathUtils.clamp(s.pitch + dy * k, -1.3, 1.45)
      } else {
        s.orbitYaw -= dx * 0.006
        s.orbitPitch = THREE.MathUtils.clamp(s.orbitPitch + dy * 0.004, 0.02, 1.3)
      }
    }
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = 0
    }
    const zoom = (f: number) => {
      const s = st.current
      if (useLanding.getState().view === 'eye') s.fov = THREE.MathUtils.clamp(s.fov * f, 12, 80)
      else s.orbitDist = THREE.MathUtils.clamp(s.orbitDist * f, 22, 160)
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      if (canLook()) zoom(Math.exp(e.deltaY * 0.001))
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl])

  const look = useMemo(() => new THREE.Vector3(), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const prevPhase = useRef('')
  useFrame((state, dt) => {
    const s = st.current
    const { phase, since } = useLanding.getState()
    const T = landingNow() - since
    // 着地した瞬間に空を見上げたままなら、地平線へ戻す（サイト移動の到着時など）
    if (phase === 'surface' && prevPhase.current !== 'surface' && s.pitch > 0.5) s.pitch = 0.12
    prevPhase.current = phase
    // ローバーを出しているあいだは、ローバーの側がカメラを動かす
    if (phase === 'surface' && useRover.getState().phase !== 'none') return
    // 降下中と離陸中は、着陸船を目で追う
    if (phase === 'descent' || phase === 'ascent' || phase === 'fadeOut') {
      const lander = state.scene.getObjectByName('surface-lander')
      cam.position.set(0, eyeY, 0)
      if (lander) {
        lander.getWorldPosition(target)
        target.y += 4
        const dir = target.sub(cam.position).normalize()
        const yaw = Math.atan2(dir.x, -dir.z)
        const pitch = Math.asin(dir.y)
        // ゆっくり追いかける
        const k = phase === 'descent' && T < 0.1 ? 1 : 1 - Math.exp(-dt * 4)
        s.yaw += (yaw - s.yaw) * k
        s.pitch += (pitch - s.pitch) * k
      }
      s.fov += ((phase === 'descent' ? 50 : 55) - s.fov) * (1 - Math.exp(-dt * 2))
    }
    if (useLanding.getState().view === 'lander' && phase === 'surface') {
      const cp = Math.cos(s.orbitPitch)
      cam.position.set(
        landerAt.x + Math.sin(s.orbitYaw) * cp * s.orbitDist,
        landerAt.y + Math.sin(s.orbitPitch) * s.orbitDist,
        landerAt.z + Math.cos(s.orbitYaw) * cp * s.orbitDist,
      )
      const minY = terrain.height(cam.position.x, cam.position.z) + 1.2
      if (cam.position.y < minY) cam.position.y = minY
      cam.lookAt(landerAt)
      if (cam.fov !== 50) {
        cam.fov = 50
        cam.updateProjectionMatrix()
      }
      return
    }
    cam.position.set(0, eyeY, 0)
    look.set(Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), -Math.cos(s.yaw) * Math.cos(s.pitch)).add(cam.position)
    cam.lookAt(look)
    if (Math.abs(cam.fov - s.fov) > 0.01) {
      cam.fov = s.fov
      cam.updateProjectionMatrix()
    }
  })
  // 見方を変えたときの最初の向き
  useEffect(() => {
    if (view === 'lander') st.current.orbitYaw = Math.atan2(-LANDER_POS.x, -LANDER_POS.y) + 0.6
  }, [view])
  return null
}

// ---- 場面 ---------------------------------------------------------------------------

/** 大気・太陽・露出：太陽の向きや霞を変えたら、空の表とまわりの景色の光を描き直す */
type Air = {
  air: AirParams | null
  lut: SkyLut
  ap: ApUniforms
  pmrem: THREE.PMREMGenerator
  env: THREE.Texture | null
  lutKey: string
  envKey: string
  lastEnv: number
}

const tmpDir = new THREE.Vector3()

function Scene({ def }: { def: SurfaceDef }) {
  // ローバーなどの十数 cm より小さな部品は影を落とさない（影のための描画を減らす）
  useTrimShadows(0.12)
  // 本物の地形（火星・地球）。読み終わるまでは今までの作った地形
  const dem = useDem(demIdFor(def))
  const terrain = useMemo(() => new Terrain(def, dem || null), [def, dem])
  // ミニマップ（HTML）にも同じ地形を渡す
  useEffect(() => {
    useMapTerrain.setState({ terrain })
    return () => {
      if (useMapTerrain.getState().terrain === terrain) useMapTerrain.setState({ terrain: null })
    }
  }, [terrain])
  const level = useLevel()
  const haze = useSurfaceLab((l) => l.haze)
  const { scene, gl } = useThree()
  const sun = useRef<THREE.DirectionalLight>(null)
  const shine = useRef<THREE.DirectionalLight>(null)
  const nightFill = useRef<THREE.HemisphereLight>(null)
  const stormFill = useRef<THREE.HemisphereLight>(null)

  // 大気の計算の道具は天体ごとに 1 回だけ作る（霞の濃さは uniform で変える）
  const A = useMemo<Air>(() => {
    const air = airFor(def.id)
    const radiusM = def.radiusKm * 1000
    // 空の表の細かさは、着陸したときの画質で決める。画質が変わるたびに大気の道具を全部作り直すと、
    // 地面・着陸船・岩の材質も全部作り直しになり、そのあいだ画面が欠ける
    const lut = new SkyLut(airUniforms(air, radiusM, 1), new THREE.Color(def.ground), currentLevel() === 'low' || lowMemory() ? 256 : 512)
    const ap = apUniforms(air, 1, terrain.height(0, 0), lut.target.texture)
    return { air, lut, ap, pmrem: new THREE.PMREMGenerator(gl), env: null, lutKey: '', envKey: '', lastEnv: 0 }
  }, [def, gl, terrain])
  // ローバーの素材にも、着陸船と同じ空気遠近と雲の影を
  const prepareRover = useCallback((m: THREE.MeshStandardMaterial) => cloudy(def, withAir(m, A.ap)), [def, A.ap])
  useEffect(
    () => () => {
      A.lut.dispose()
      // 画質が変わって作り直したときは、新しい空の光をもう入れていることがある（Firefox ではこの片付けより先に
      // 次のコマが描かれる）。それまで消すと、太陽が雲に隠れたタイタン・金星の地面が真っ黒のままになる
      if (scene.environment === A.env) scene.environment = null
      A.env?.dispose()
      A.pmrem.dispose()
    },
    [A, scene],
  )

  // 今の空（毎フレーム書き換える）。着陸するたびに時計を 0 から
  const sky = useMemo<SkyNow>(() => {
    useSkyClock.setState({ hours: 0 })
    // 着陸するたびに、天気は自動に戻す
    useWeather.setState({ mode: 'auto', storm: 0 })
    weatherNow.storm = weatherNow.force ?? stormTarget(def.id, 0)
    const frame = new SkyFrame(def)
    weatherNow.devils = devilTarget(def.id, frame.localClock(), weatherNow.storm)
    const sunDir = frame.sunLocal(new THREE.Vector3())
    return { frame, sunDir, sunT: new THREE.Vector3(1, 1, 1), exposure: 1, night: 0, starVis: 0, bodyDir: new THREE.Vector3(0, 1, 0), bodyLit: 0 }
  }, [def])
  const clock = useRef({ hours: 0, ui: 0, lastLit: 0 })
  useEffect(() => {
    clock.current.hours = 0
  }, [sky])

  // 太陽：遠い星ほど弱い（地球を 1）。昼の目の慣れ方の上限（夜に露出を上げすぎて昼のようにならないように）
  const radiusM = def.radiusKm * 1000
  const sunI = def.au ** -2
  const dayExposure = useMemo(() => autoExposure(sunI, new THREE.Vector3(1, 1, 1), Math.PI / 4, A.air, 0), [sunI, A])

  // 霞の濃さ（調整ページ × 砂嵐）は uniform だけ書き換える
  const hazeNow = useRef({ A: null as Air | null, v: -1 })
  const tintNow = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  /** v：霞の濃さ。tint：霞の色（砂嵐の砂は青い光を吸って、黄土色に見える） */
  const applyHaze = (v: number, tint: THREE.Vector3) => {
    const h = hazeNow.current
    if (!A.air || (h.A === A && Math.abs(h.v - v) <= 0.01 * v && tint.equals(tintNow))) return
    h.A = A
    h.v = v
    tintNow.copy(tint)
    const u = A.lut.material.uniforms
    u.uBetaL.value.set(...A.air.low).multiplyScalar(v).multiply(tint)
    u.uExtL.value.set(...A.air.lowExt).multiplyScalar(v)
    A.ap.uApL.value.set(...A.air.lowExt).multiplyScalar(v)
    A.lutKey = ''
  }

  useEffect(() => {
    scene.background = new THREE.Color('#000000')
    scene.environmentIntensity = 1
    // 動作確認用（#debug のとき）
    if (location.hash.includes('debug')) (window as unknown as { __surface: THREE.Scene; __sky: SkyNow }).__surface = scene
  }, [scene])
  useEffect(() => {
    if (location.hash.includes('debug')) (window as unknown as { __sky: SkyNow }).__sky = sky
  }, [sky])

  // 時間を進めて、太陽・露出・光・空の表を更新する（ほかの部品より先に）
  useFrame((_, dt) => {
    const lab = useSurfaceLab.getState()
    const { rate } = useSkyClock.getState()
    const c = clock.current
    const seek = useSkyClock.getState().seek
    if (seek !== null) {
      c.hours = seek
      useSkyClock.setState({ seek: null })
    }
    const phase = useLanding.getState().phase
    if (phase === 'surface' || phase === 'descent' || phase === 'ascent') c.hours += Math.min(dt, 0.1) * hoursPerSecond(rate, def.id)
    c.ui += dt
    if (c.ui > 0.25) {
      c.ui = 0
      const lit = sky.bodyLit
      useSkyClock.setState({ hours: c.hours, clock: sky.frame.localClock(), bodyLit: lit, waxing: lit >= c.lastLit })
      if (WEATHER_BODIES.has(def.id) && Math.abs(useWeather.getState().storm - weatherNow.storm) > 0.02) useWeather.setState({ storm: weatherNow.storm })
      c.lastLit = lit
    }
    sky.frame.at(c.hours)
    // 天気（火星の砂嵐）：空気中の砂が濃くなる
    const storm = WEATHER_BODIES.has(def.id) ? stepWeather(def.id, c.hours, sky.frame.localClock(), Math.min(dt, 0.1)).storm : 0
    const kind = STORM_KIND[def.id]
    const hz = haze * (1 + (kind?.haze ?? STORM_HAZE) * storm)
    shimmerNow.amp = shimmerAmount(def.id, sky.sunDir.y)
    const ta = kind?.tint ? Math.round(storm * 20) / 20 : 0
    applyHaze(hz, kind?.tint ? TINT.set(1, 1, 1).lerp(kind.tint, ta) : TINT.set(1, 1, 1))
    if (lab.sunEl !== null || lab.sunAz !== null) sky.sunDir.copy(dirFrom(lab.sunAz ?? def.sunAz, lab.sunEl ?? def.sunEl))
    else sky.frame.sunLocal(sky.sunDir)
    marsSun.value.copy(sky.sunDir)
    const el = Math.asin(THREE.MathUtils.clamp(sky.sunDir.y, -1, 1))
    sky.sunT.copy(sunTransmittance(A.air, radiusM, el, hz))
    // 厚い雲の下は、目が慣れても薄暗く感じるくらいに
    const ev = lab.ev + (def.ev ?? 0) + outerEv(def.au) + (def.sunHidden ? -0.9 : 0) - (kind?.dim ?? 0.8) * storm
    sky.exposure = Math.min(autoExposure(sunI, sky.sunT, el, A.air, ev), dayExposure * 2 ** ev * 5)
    sky.night = THREE.MathUtils.smoothstep(-el, -0.05, 0.12)
    const twilight = THREE.MathUtils.smoothstep(-el, 0.0, 0.2)
    sky.starVis = def.sunHidden ? 0 : A.air ? twilight * Math.max(0, 1 - Math.max(0, hz - 1) * 0.5) : 0.3 + 0.7 * sky.night
    if (def.skyBody) sky.bodyLit = litFraction(sky.sunDir, sky.bodyDir)
    if (Math.abs(lab.exposure - sky.exposure) / sky.exposure > 0.02) lab.set({ exposure: sky.exposure })

    // 太陽の光
    const l = sun.current
    if (l) {
      const t = sky.sunT
      const tMax = Math.max(t.x, t.y, t.z, 1e-6)
      l.color.setRGB(t.x / tMax, t.y / tMax, t.z / tMax)
      l.intensity = sky.sunDir.y > -0.02 ? sunI * tMax * sky.exposure : 0
      // 影を描く範囲：ふだんは着陸地点のまわり、ローバーを出しているときはローバーのまわり
      const rv = useRover.getState().phase !== 'none'
      tmpDir.set(rv ? roverFocus.x : 0, rv ? roverFocus.y : 0, rv ? roverFocus.z : -15)
      l.position.copy(sky.sunDir).multiplyScalar(160).add(tmpDir)
      if (!l.target.position.equals(tmpDir)) {
        l.target.position.copy(tmpDir)
        l.target.updateMatrixWorld()
      }
    }
    // 母惑星の照り返し（月の夜を照らす地球照など）：満ちているほど明るい
    const s = shine.current
    if (s && def.skyBody) {
      s.position.copy(sky.bodyDir).multiplyScalar(160)
      const size = Math.min(3, def.skyBody.angle / 1.9)
      const up = THREE.MathUtils.smoothstep(sky.bodyDir.y, -0.02, 0.08)
      // 地球の月明かり：夜は、目が慣れた明るさで地面を青白く照らす
      if (def.id === 'earth') s.intensity = up * sky.night * 1.0 * sky.bodyLit ** 1.5
      else s.intensity = up * 0.5 * size * sky.bodyLit ** 2 * (1 - 0.8 * (1 - sky.night))
    }
    // 夜の空の明かり（星明かり・大気光）：真っ暗にせず、地形と着陸船の形がほのかに見えるくらいに
    if (nightFill.current) {
      nightFill.current.intensity = sky.night * (A.air ? (def.sunHidden ? 2 : 3) : 3)
    }
    // 砂嵐の昼：太陽の光が砂に散らされて、空全体から明るさが降ってくる（影の側も真っ暗にならない）
    if (stormFill.current) {
      const day = THREE.MathUtils.smoothstep(sky.sunDir.y, -0.05, 0.25)
      stormFill.current.intensity = storm * day * sunI * sky.exposure * 0.35
    }

    // 空の表：太陽が少し動いたら描き直す。まわりの景色の光（重い）は間を空けて
    const key = `${sky.sunDir.x.toFixed(3)},${sky.sunDir.y.toFixed(3)},${sky.sunDir.z.toFixed(3)},${sky.exposure.toPrecision(3)}`
    if (key !== A.lutKey) {
      A.lutKey = key
      A.lut.render(gl, sky.sunDir, sunI, sky.exposure)
    }
    const now = performance.now()
    if (A.envKey !== A.lutKey && (!A.env || now - A.lastEnv > 250)) {
      A.envKey = A.lutKey
      A.lastEnv = now
      const rt = A.pmrem.fromEquirectangular(A.lut.target.texture)
      A.env?.dispose()
      A.env = rt.texture
      scene.environment = rt.texture
    } else if (A.env && scene.environment !== A.env) scene.environment = A.env
  }, -1)

  useEffect(() => {
    for (const l of [sun.current, shine.current]) {
      if (!l) continue
      l.target.position.set(0, 0, -15)
      l.target.updateMatrixWorld()
    }
  }, [])
  // 影の細かさ：高画質のパソコンだけ 2048（スマホや軽い画質では 1024 で、メモリを 1/4 に）
  const shadow = level === 'high' && !lowMemory() ? 2048 : 1024
  return (
    <>
      <Sky def={def} lut={A.lut.target.texture} sky={sky} />
      <SurfaceStars sky={sky} hasAir={!!A.air} />
      <SunDisc def={def} sky={sky} />
      {def.skyBody && <SkyPlanet def={def} sky={sky} />}
      <Plumes def={def} />
      {WEATHER_FX.has(def.id) && <Weather def={def} terrain={terrain} sky={sky} light={level === 'low' || lowMemory()} />}
      {hasClouds(def) && <Clouds terrain={terrain} ap={A.ap} sky={sky} clock={clock} />}
      <directionalLight
        key={shadow}
        ref={sun}
        castShadow
        shadow-mapSize={[shadow, shadow]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={10}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      {def.skyBody && <directionalLight ref={shine} color={def.skyBody.id === 'earth' ? '#a9c4ff' : def.id === 'earth' ? '#b9c9ff' : '#e8dcc8'} intensity={0} />}
      <hemisphereLight ref={nightFill} args={['#4d628f', '#16151b', 0]} />
      {def.id === 'mars' && <hemisphereLight ref={stormFill} args={[def.hazeColor, def.ground, 0]} />}
      {/* 空と地面の照り返しの光は、まわりの景色の光（scene.environment）が受け持つ */}
      <Ground terrain={terrain} ap={A.ap} />
      {terrain.dem && <FarTerrain terrain={terrain} ap={A.ap} />}
      <Suspense fallback={null}>
        <Lander terrain={terrain} dustColor={def.sky ? def.hazeColor : def.ground} ap={A.ap} sky={sky} />
      </Suspense>
      <Suspense fallback={null}>
        <Rover terrain={terrain} dustColor={def.ground} sky={sky} landerYaw={LANDER_YAW} prepare={prepareRover} />
      </Suspense>
      {def.site && TRACKS[def.site] && (
        <Suspense fallback={null}>
          <Rally key={def.site} track={def.site} terrain={terrain} prepare={prepareRover} dustColor={def.ground} sky={sky} />
          <RallyGhost key={def.site + ':ghost'} track={def.site} />
        </Suspense>
      )}
      {def.site === 'taurus' && <Apollo17 terrain={terrain} prepare={prepareRover} />}
      <Look terrain={terrain} />
      <WhenReady />
    </>
  )
}

// ---- 画面の上の表示 -------------------------------------------------------------------

/** ボタンを押しているあいだだけ入力する（スマホの運転ボタン） */
function holdProps(on: () => void, off: () => void) {
  return {
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      on()
    },
    onPointerUp: off,
    onPointerCancel: off,
    onContextMenu: (e: RMouseEvent) => e.preventDefault(),
  }
}

/** ローバーを出しているあいだの表示：速さ・見方の切り替え・回収、スマホでは運転のボタン */
/** 採集した岩の分析結果のカード */
function SampleCard({ bodyId, id }: { bodyId: string; id: string }) {
  useLang()
  const all = samplesFor(bodyId)
  const k = all.find((s) => s.id === id)
  const got = useSampleLog((l) => l.log[bodyId]?.length ?? 0)
  if (!k) return null
  const max = Math.max(...k.comp.map((c) => c[1]))
  return (
    <div className="sample-card">
      <div className="sample-head">
        <span className="sample-swatch" style={{ background: k.color }} />
        <div>
          <div className="sample-kicker">{ui().surfaceView.sampleAnalysed}</div>
          <div className="sample-name">{ui().rockSamples[k.id].name}</div>
        </div>
      </div>
      <div className="sample-comp">
        {k.comp.map(([label, v]) => (
          <div className="sample-bar" key={label}>
            <span className="sb-k">{compLabel(label)}</span>
            <span className="sb-track">
              <span className="sb-fill" style={{ width: `${(v / max) * 100}%` }} />
            </span>
            <span className="sb-v">{v}%</span>
          </div>
        ))}
      </div>
      <p className="sample-note">{ui().rockSamples[k.id].note}</p>
      <div className="sample-foot">
        <span>
          {ui().surfaceView.samplesHere} {got} / {all.length}
        </span>
        <button className="secondary" onClick={() => useRover.setState({ result: null })}>
          {ui().surfaceView.close}
        </button>
      </div>
    </div>
  )
}

/** 200 → "200 m"、3000 → "3 km" */
const sizeLabel = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`)

function RoverPanel({ bodyId, site }: { bodyId: string; site?: string }) {
  useLang()
  const rally = useRally((r) => r.phase)
  const racing = !!site && rally !== 'off'
  const phase = useRover((r) => r.phase)
  const canSample = useRover((r) => r.canSample)
  const sampling = useRover((r) => r.sampling)
  const result = useRover((r) => r.result)
  const edge = useRover((r) => r.edge)
  const range = useRover((r) => r.range)
  const next = useRover((r) => r.next)
  const got = useSampleLog((l) => l.log[bodyId]?.length ?? 0)
  const total = samplesFor(bodyId).length
  const view = useRover((r) => r.view)
  const menu = useRover((r) => r.menu)
  const setView = useRover((r) => r.setView)
  useEffect(() => bindRoverKeys(), [])
  const drive = phase === 'drive'
  return (
    <>
      <div className="surface-hint rover-hint" hidden={racing}>
        {drive
          ? ui().surfaceView.keysHint
          : phase === 'drop'
            ? ui().surfaceView.droppingRover
            : ui().surfaceView.roverUnfolding}
      </div>
      {drive && <RoverHud />}
      {site && <RallyPanel />}
      {drive && site && TRACKS[site] && !racing && <RallyStart track={site} compact />}
      {drive && edge && !racing && (
        <div className="rover-edge">
          {ui().surfaceView.cantGoFarther}
          <small>{ui().surfaceView.roverRange(sizeLabel(range * 2))}</small>
        </div>
      )}
      {drive && result && <SampleCard bodyId={bodyId} id={result} />}
      {drive && site === 'taurus' && !racing && !result && <HistoricCard />}
      {drive && site === 'taurus' && !racing && <HistoricStatus />}
      {drive && !racing && (
        <div className="sample-status">
          <button className="sample-count" onClick={openRocks} title={ui().surfaceView.openRockCollection}>
            ◆ {ui().surfaceView.samples} {got}/{total} <span className="sample-book">{ui().surfaceView.book} ▸</span>
          </button>
          {sampling ? (
            <span className="sample-busy">{ui().surfaceView.armCollecting}</span>
          ) : canSample ? (
            <button className="sample-btn" onClick={() => (roverInput.sample = true)}>
              {ui().surfaceView.collect} <kbd>E</kbd>
            </button>
          ) : next ? (
            <span className="sample-guide">
              <span className="sg-arrow" style={{ transform: `rotate(${next.rel}deg)` }}>
                ▲
              </span>
              {next.where
                ? ui().surfaceView.rockAtPlace(ui().pois[next.where].name, next.dist)
                : ui().surfaceView.rockAtBeam(next.dist)}
            </span>
          ) : (
            <span className="sample-busy">{ui().surfaceView.allRocksCollected}</span>
          )}
        </div>
      )}
      {drive && (
        <div className="rover-pad">
          <div className="rover-pad-left">
            <button {...holdProps(() => (roverInput.steer = -1), () => (roverInput.steer = 0))}>◀</button>
            <button {...holdProps(() => (roverInput.steer = 1), () => (roverInput.steer = 0))}>▶</button>
          </div>
          <div className="rover-pad-right">
            <button className="jump" {...holdProps(() => (roverInput.jump = true), () => undefined)}>
              {ui().surfaceView.jump}
            </button>
            <button {...holdProps(() => (roverInput.throttle = -1), () => (roverInput.throttle = 0))}>▼</button>
            <button className="go" {...holdProps(() => (roverInput.throttle = 1), () => (roverInput.throttle = 0))}>▲</button>
          </div>
        </div>
      )}
      <div className="surface-buttons rover-actions">
        <button className={`secondary${menu ? ' on' : ''}`} onClick={() => useRover.setState({ menu: !menu })} title={ui().surfaceView.roverMenuTip}>
          {menu ? ui().surfaceView.hideMenu : ui().surfaceView.menu}
        </button>
        {drive && (
          <button className="secondary" onClick={() => setView(view === 'chase' ? 'cam' : 'chase')}>
            {view === 'chase' ? ui().surfaceView.switchToRoverCam : ui().surfaceView.switchToChaseCam}
          </button>
        )}
        <button className="secondary" onClick={recallRover}>
          {ui().surfaceView.recall}
        </button>
        {!site && trackForBody(bodyId) && (
          <button className="secondary rally-site" onClick={() => goToRally(trackForBody(bodyId)!)} title={ui().surfaceView.raceTrackTip}>
            🏁 {ui().surfaceView.raceButton(ui().rallyTracks[trackForBody(bodyId)!].button)}
          </button>
        )}
        <button className="primary" onClick={startTakeoff}>
          {ui().surfaceView.backToShip}
        </button>
      </div>
    </>
  )
}

function SurfacePanel({ def }: { def: SurfaceDef }) {
  useLang()
  const rover = useRover((r) => r.phase)
  // ローバーを出しているあいだは、説明と時刻・天気の表示をたたんで景色を広く（メニューのボタンで開く）
  const roverMenu = useRover((r) => r.menu)
  // 着陸船のまわりでも、メニュー（説明と時刻・天気）はボタンでたたんで景色を広く見られる
  const landerMenu = useLanding((l) => l.menu)
  const showInfo = rover === 'none' ? landerMenu : roverMenu
  const phase = useLanding((l) => l.phase)
  const view = useLanding((l) => l.view)
  const setView = useLanding((l) => l.setView)
  // スマホ（縦も横も）では、説明は畳んでおく（タップで開く）
  const [open, setOpen] = useState(() => window.innerWidth > 700 && window.innerHeight > 500)
  const name = bodyName(def.id) + (def.site ? ui().surfaceView.siteSuffix(ui().surfaceSites[def.site].name) : '')
  const weight = Math.max(0.01, 30 * def.gravity)
  const temp = def.temp[0] === def.temp[1] ? ui().surfaceView.temp(def.temp[0]) : ui().surfaceView.tempRange(def.temp[0], def.temp[1])
  const skyName = def.skyBody ? bodyName(def.skyBody.id) : null
  // 説明：別の着陸地点ならその地点の、そうでなければ天体の。空の説明は天体のもの（無い天体もある）
  const note = def.site ? ui().surfaceSites[def.site].note : ui().surfaceNotes[def.id]
  const skyNote: string | undefined = ui().surfaceSkyNotes[def.id]
  return (
    <div className={`surface-ui${rover !== 'none' && showInfo ? ' rover-menu' : ''}`}>
      {phase === 'descent' && (
        <div className="surface-caption">
          <div>{ui().surfaceView.descendingTo(name)}</div>
          <button className="secondary" onClick={skipDescent}>
            {ui().surfaceView.skip}
          </button>
        </div>
      )}
      {phase === 'ascent' && <div className="surface-caption">{ui().surfaceView.liftOff}</div>}
      {phase === 'surface' && (
        <>
          {/* 左上の列：説明・（スマホでは）時刻と天気・ミニマップを上から順に積む。重ならず、たたんだぶんだけ詰まる */}
          <div className={`surface-left${showInfo ? ' menu-open' : ''}${rover === 'none' ? '' : ' rover'}`}>
          {showInfo && <div className={`surface-card${open ? '' : ' closed'}`}>
            <button className="surface-title" onClick={() => setOpen(!open)}>
              {ui().surfaceView.landedOn(name)} <span className="muted">{open ? '▾' : '▸'}</span>
            </button>
            {open && (
              <>
                <div className="surface-stats">
                  <span>
                    {ui().surfaceView.gravity} {def.gravity < 0.01 ? def.gravity.toFixed(4) : def.gravity.toFixed(2)} G
                  </span>
                  <span>
                    {ui().surfaceView.temperature} {temp}
                  </span>
                </div>
                <div className="surface-weight">
                  {ui().surfaceView.weightNote(weight < 1 ? weight.toFixed(2) : weight.toFixed(1))}
                </div>
                <p>{note}</p>
                {skyNote && <p className="muted">{skyNote}</p>}
                {skyName && !skyNote && (
                  <p className="muted">
                    {ui().surfaceView.skyBodyNote(skyName, def.skyBody!.angle.toFixed(1))}
                  </p>
                )}
              </>
            )}
          </div>}
          {showInfo && <TimeBar def={def} />}
          {rover === 'drive' && <RoverMap />}
          </div>
          {rover !== 'none' ? (
            <RoverPanel bodyId={def.id} site={def.site} />
          ) : (
          <>
          {def.site && TRACKS[def.site] && <RallyStart track={def.site} />}
          <div className="surface-hint">
            {view === 'eye'
              ? ui().surfaceView.lookAroundHint
              : ui().surfaceView.orbitViewHint}
          </div>
          <div className="surface-buttons lander-actions">
            <button className={`secondary${landerMenu ? ' on' : ''}`} onClick={() => useLanding.setState({ menu: !landerMenu })} title={ui().surfaceView.landerMenuTip}>
              {landerMenu ? ui().surfaceView.hideMenu : ui().surfaceView.menu}
            </button>
            <button className="secondary" onClick={() => setView(view === 'eye' ? 'lander' : 'eye')}>
              {view === 'eye' ? ui().surfaceView.viewLander : ui().surfaceView.standAndLook}
            </button>
            <button className="secondary" onClick={() => launchRover()}>
              {ui().surfaceView.deployRover}
            </button>
            {!def.site && trackForBody(def.id) && (
              <button className="secondary rally-site" onClick={() => goToSite(trackForBody(def.id))}>
                🏁 {ui().surfaceView.toRaceTrack(ui().rallyTracks[trackForBody(def.id)!].button)}
              </button>
            )}
            {!def.site && def.id === 'moon' && (
              <button className="secondary rally-site" onClick={() => goToSite('taurus')}>
                🚩 {ui().surfaceView.toApollo17}
              </button>
            )}
            {def.site && TRACKS[def.site] && (
              <button className="secondary" onClick={() => goToSite(null)}>
                {ui().rallyTracks[def.site].home}
              </button>
            )}
            <button className="primary" onClick={startTakeoff}>
              {ui().surfaceView.takeOff}
            </button>
          </div>
          </>
          )}
        </>
      )}
    </div>
  )
}

/**
 * 地表の場面の用意：最初のコマを描いたあと、場面の全部のシェーダーを作り終えてから幕を上げる。
 * 作り終える前に幕を上げると、シェーダーができた物から少しずつ現れ、地面の無い空に物が数個だけ浮かぶ画面になる
 */
function WhenReady() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    let alive = true
    let raf = 0
    let frames = 0
    const done = () => {
      if (alive) surfaceReady()
    }
    // 2 コマ待ってから（着陸船などが場面に入り、空の光ができてから）作る
    const wait = () => {
      if (++frames < 3) {
        raf = requestAnimationFrame(wait)
        return
      }
      let job: Promise<unknown>
      try {
        job = gl.compileAsync(scene, camera)
      } catch {
        job = Promise.resolve()
      }
      void job.then(done, done)
    }
    raf = requestAnimationFrame(wait)
    const giveUp = window.setTimeout(done, 10000)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.clearTimeout(giveUp)
    }
  }, [gl, scene, camera])
  return null
}

/**
 * 地表の Canvas。降下・上昇の幕は外側で毎フレーム動くので、memo でそこから切り離す
 * （Canvas を描き直すたびに影の設定がかけ直され、影の地図が作り直されて、影を受ける材質が描けなくなっていた）。
 * 影は PCF（three.js にはもう PCFSoft がなく、指定すると毎回 PCF に置き換えて作り直す）
 */
const SurfaceCanvas = memo(function SurfaceCanvas({ def }: { def: SurfaceDef }) {
  const level = useLevel()
  return (
    // 画面の細かさは画質の設定にあわせる（スマホは「標準」なので 1.25 倍まで）
    // 背景を不透明で塗る（alpha: false）。透明のままだと、描けなかったフレームから後ろが透けて見える。
    // three.js は alpha: false でも透明にできる画面を作るので、後ろは .surface-view.solid の黒でも塞いでいる
    <Canvas shadows="percentage" dpr={Math.min(dprFor(level), 1.75)} gl={{ alpha: false }} camera={{ fov: 60, near: 0.3, far: SKY_R * 1.2, position: [0, EYE, 0] }}>
      <Scene def={def} />
      <QualityGovernor />
      <SurfacePost bodyId={def.id} />
    </Canvas>
  )
})

/** 暗転の幕：宇宙 → 地表、地表 → 宇宙。React で描き直さず、毎フレーム濃さだけを書き換える */
function Curtain({ phase, since, ready }: { phase: string; since: number; ready: boolean }) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const T = landingNow() - since
      let curtain = 0
      if (phase === 'fadeIn') curtain = Math.min(1, T / FADE)
      else if (phase === 'descent') curtain = ready ? Math.max(0, 1 - T / FADE) : 1
      else if (phase === 'ascent') curtain = Math.max(0, (T - (ASCENT - FADE)) / FADE)
      else if (phase === 'fadeOut') curtain = Math.max(0, 1 - T / FADE)
      const d = el.current
      if (d) {
        d.style.opacity = String(curtain)
        d.style.pointerEvents = curtain > 0.5 ? 'auto' : 'none'
      }
      if (phase !== 'surface' && phase !== 'idle') raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [phase, since, ready])
  return <div ref={el} className="surface-curtain" style={{ opacity: 0, pointerEvents: 'none' }} />
}

export function SurfaceView() {
  const phase = useLanding((l) => l.phase)
  const bodyId = useLanding((l) => l.bodyId)
  const site = useLanding((l) => l.site)
  const since = useLanding((l) => l.since)
  const ready = useLanding((l) => l.ready)
  const def = bodyId ? siteDef(bodyId, site) : null
  const scene3d = phase === 'descent' || phase === 'surface' || phase === 'ascent'
  const lab = labEnabled() ? <SurfaceLab /> : null
  if (phase === 'idle' || !def) return lab
  return (
    <div className={scene3d ? 'surface-view solid' : 'surface-view'}>
      {scene3d && (
        <SurfaceCanvas key={def.site ?? def.id} def={def} />
      )}
      <SurfacePanel def={def} />
      <Curtain phase={phase} since={since} ready={ready} />
      {lab}
    </div>
  )
}

// 宇宙の場面の外に置くので、glb は前もって読み込んでおく
useGLTF.preload(url('ship-lander.glb'))
