import { useEffect, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { loadCatalog } from '../Sky'
import { QUALITY, currentLevel, lowMemory, useLevel } from '../../state/quality'
import { autoCam, useMoonMission, type MissionCam } from '../../state/moonMission'
import { COAST_TIME, CMSEP_TIME, CORRIDOR_TIME, RECOVERY_TIME, SWIMMERS_AT, TEI_BURN, TEI_WARP, ret, tickReturn, useMoonReturn, type ReturnStep } from '../../state/moonReturn'
import { EARTH_MOON, coastDistance } from '../../data/apolloTimeline'
import { EI_ALT, RE } from '../../data/reentry'
import { earthMaterial, atmosphereMaterial } from './earth'
import { glowTexture, plumeGeometry, plumeMaterial } from './plume'
import { APOLLO_URL, DROGUE, useCraft } from './craft'
import { applyCraftZoom, useCraftZoom } from './craftZoom'
import { useSpaceEnv, type SpaceBody } from './spaceEnv'
import { makeChute, oceanMaterial, shapeChute } from './returnSea'
import { makeCarrier, makeCollar, makeDownwash, makeHelicopter, makeRaft, makeSwimmer } from './returnRecovery'
import { CLOUD_COVER_GLSL, SkyLut, cloudQuality, cloudShadeAt, cloudUniforms, skyDomeMaterial, sunTransmit } from './returnSky'
import { OUT_CHUNK, encodeOutput } from './shaderOut'
import { makeFireball, makeWindowPlasma, updateFireball } from './returnPlasma'
import { startEntryRoar, startHeliSound } from '../../audio/sfx'

// 章8（state/moonReturn.ts）の世界。宇宙船がいつも原点のそば。月・地球・海は宇宙船に対して動かす。
// 月のまわり：月は真下（高さ 115 km）。地球へ：地球は前（-Z）から、近づくにつれて真下へ。
// 大気の中：地球の中心は (0, -(半径+高さ), 0)、進んだ道のりの分だけ地球を回す。低い所では海面（y = -高さ）と空と雲。

const base = import.meta.env.BASE_URL
const MOON_R = 1_737_400
const LUNAR_ALT = 115_000
/** 月のまわりの太陽：前の左上から（月面に長い影） */
const SUN_MOON = new THREE.Vector3(-0.55, 0.42, -0.72).normalize()
/** 地球の点（緯度・経度、度）：大気に入った所（ミッション報告：北緯 0°04′・西経 173°20′）、着水（南緯 17°53′・西経 166°07′）、太陽の真下（12 月 19 日 19 時 25 分 UTC） */
const EI_LL = [0.07, -173.33]
const SPLASH_LL = [-17.88, -166.11]
const SUBSOLAR_LL = [-23.4, -110.5]
/** 司令船の、熱よけの面の中心（模型の座標）と、まん中 */
const SHIELD_Y = -3.42
const CM_MID = -1.7
const TRIM = THREE.MathUtils.degToRad(22)
/** 着水のあと、主パラシュートが落ちる所（司令船から。カメラの向こう側） */
/** 司令船の窓の視点（司令船の座標）。殻の外側すれすれ */
const WINDOW_EYE = new THREE.Vector3(1.45, -1.65, 0)
const FALLEN = [
  [-34, -52],
  [-62, -18],
  [-8, -70],
]

const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _u = new THREE.Vector3()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _m = new THREE.Matrix4()
const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const FLIP = new THREE.Quaternion().setFromAxisAngle(X, Math.PI)
/** 月のまわりの船の向き：船の +Y を前（-Z）へ */
const LUNAR_FRAME = new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2)

/** 緯度・経度 → 地球の模型の中の向き（three の球の地図：経度 0 が +X、東経 90° が -Z） */
function llVec(lat: number, lon: number, out = new THREE.Vector3()) {
  const la = THREE.MathUtils.degToRad(lat)
  const lo = THREE.MathUtils.degToRad(lon)
  return out.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo))
}

const P_EI = llVec(EI_LL[0], EI_LL[1])
const P_SPLASH = llVec(SPLASH_LL[0], SPLASH_LL[1])
const SUN_E = llVec(SUBSOLAR_LL[0], SUBSOLAR_LL[1])
/** 大気に入った所での、着水地点へ向かう向き（地面にそって） */
const T_EI = P_SPLASH.clone().addScaledVector(P_EI, -P_SPLASH.dot(P_EI)).normalize()

/** 地球の向き：模型の点 p が up の向きに、そこでの進む向き t が fwd に来る回転 */
function earthOrient(up: THREE.Vector3, fwd: THREE.Vector3, out: THREE.Quaternion) {
  const pb = _a.copy(T_EI).negate()
  const pr = _b.crossVectors(P_EI, pb)
  const mp = new THREE.Matrix4().makeBasis(pr, P_EI, pb)
  const wb = _v.copy(fwd).negate()
  const wr = _w.crossVectors(up, wb)
  _m.makeBasis(wr, up, wb)
  _m.multiply(mp.transpose())
  return out.setFromRotationMatrix(_m)
}

const lunarStep = (s: ReturnStep) => s === 'rdv' || s === 'docked' || s === 'lmGone' || s === 'teiWait' || s === 'tei'
const seaStep = (s: ReturnStep) => s === 'chutes' || s === 'splash' || s === 'recovery' || s === 'end'
/** 着水したあと（海に浮いている） */
const afloat = (s: ReturnStep) => s === 'splash' || s === 'recovery' || s === 'end'

// ---- 光 -------------------------------------------------------------------------------------

/** いまの太陽の向き（場面ごとに Scene が書く） */
const sun = new THREE.Vector3().copy(SUN_MOON)

/** 日の光の色（Scene が毎フレーム書く）：大気の中では、空気を通って弱く黄色く（低い太陽ほど赤く） */
const sunCol = new THREE.Color(1, 1, 1)
const SUN_WHITE = new THREE.Color('#fff6ea')

/** 影を作る範囲の真ん中（司令船。Scene が毎フレーム書く）と、雲の影がかかる割合（1：日なた） */
const shadowAt = new THREE.Vector3()
const shade = { k: 1 }
/** 影の範囲（真ん中から ± m）：司令船と、上に開いた 3 つの主パラシュート（ひも 30 m ＋ 直径 25 m）まで入る */
const SHADOW_HALF = 48
/**
 * 地球の真ん中から r の所にいるとき、船の真下の点が、大気に入る所（高さ 122 km）からどれだけうしろか（ラジアン）。
 * 帰り道はほぼ放物線（月からの速さは、地球から逃げる速さとほぼ同じ）：r = 2q / (1 + cos ν)。
 * 大気に入る角度 −6.5° は ν/2 なので、近地点の半径 q は約 6,410 km
 */
const APPROACH_Q = 6_410_000
function approachSwing(r: number) {
  const nu = (rr: number) => Math.acos(THREE.MathUtils.clamp((2 * APPROACH_Q) / rr - 1, -1, 1))
  return Math.max(0, nu(r) - nu(RE + EI_ALT))
}
/** 大気に入ってから進んだ道のり（m）。雲を地面といっしょに流すのに使う。パラシュートから先は最後の値のまま */
const cloudRun = { range: 0 }
/** 大気圏突入の音（鳴っている間だけ） */
const roar: { h: ReturnType<typeof startEntryRoar> } = { h: null }
const heliSnd: { h: ReturnType<typeof startHeliSound> } = { h: null }

/** 映りこむ景色（Scene が毎フレーム書く）：いちばん大きく見える天体か、大気の中の空と海 */
const envBody: SpaceBody = { down: new THREE.Vector3(0, -1, 0), angR: 0, sun, earth: false, air: 0 }

function Lights() {
  const gl = useThree((s) => s.gl)
  const level = useLevel()
  const shadowSize = QUALITY[level].shadow
  useSpaceEnv(() => envBody, 'moon')
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff6ea', 4.2)
    const t = new THREE.Object3D()
    l.target = t
    const hemi = new THREE.HemisphereLight('#06080c', '#2c3440', 0.3)
    const tone = { space: new THREE.Color('#06080c'), spaceG: new THREE.Color('#2c3440'), sky: new THREE.Color('#8fb4e0'), skyG: new THREE.Color('#1d3a52') }
    return { l, t, hemi, tone }
  }, [])
  // 影（画質が「軽量」のときはなし）：日の光で、パラシュートの影が司令船に、司令船の自分の影が、本物のように落ちる
  useEffect(() => {
    if (!shadowSize) return
    const prev = { enabled: gl.shadowMap.enabled, type: gl.shadowMap.type }
    gl.shadowMap.enabled = true
    gl.shadowMap.type = THREE.PCFSoftShadowMap
    const l = light.l
    l.castShadow = true
    l.shadow.mapSize.set(shadowSize, shadowSize)
    const c = l.shadow.camera
    c.left = c.bottom = -SHADOW_HALF
    c.right = c.top = SHADOW_HALF
    c.near = 1
    c.far = 2000
    c.updateProjectionMatrix()
    l.shadow.bias = -0.0003
    l.shadow.normalBias = 0.04
    return () => {
      l.castShadow = false
      l.shadow.map?.dispose()
      l.shadow.map = null
      gl.shadowMap.enabled = prev.enabled
      gl.shadowMap.type = prev.type
    }
  }, [gl, light, shadowSize])
  useFrame(() => {
    light.t.position.copy(shadowAt)
    light.t.updateMatrixWorld()
    light.l.position.copy(shadowAt).addScaledVector(sun, 1000)
    light.l.color.copy(SUN_WHITE).multiply(sunCol)
    // 雲の影の中では、日の光が弱まる
    light.l.intensity = 4.2 * shade.k
    // 大気の中では、空からの青い光と海からの照り返し（空が青くなる高さから、少しずつ）。
    // 火の玉が消えたあとの高い空でも、海の上でも、影の側の司令船が真っ黒な影にならないように
    const air = seaStep(useMoonReturn.getState().step) ? 1 : (envBody.air ?? 0)
    light.hemi.color.lerpColors(light.tone.space, light.tone.sky, air)
    light.hemi.groundColor.lerpColors(light.tone.spaceG, light.tone.skyG, air)
    light.hemi.intensity = THREE.MathUtils.lerp(0.3, 1.6, air)
  })
  return (
    <>
      <primitive object={light.l} />
      <primitive object={light.t} />
      <primitive object={light.hemi} />
    </>
  )
}

// ---- 場面 -------------------------------------------------------------------------------------

function useStars() {
  const [stars, setStars] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    let alive = true
    loadCatalog().then((g) => alive && setStars(g), () => {})
    return () => {
      alive = false
    }
  }, [])
  const mat = useMemo(
    () =>
      encodeOutput(new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute float mag;
          attribute vec3 color;
          varying vec3 vColor;
          void main() {
            float flux = pow(10.0, -0.4 * (mag - 1.0) * 0.6);
            vColor = color * min(flux * 1.1, 2.4);
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
            gl_Position.z = gl_Position.w * 0.999999;
            gl_PointSize = clamp(1.2 + 1.4 * sqrt(flux), 1.2, 4.2);
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          void main() {
            float r = length(gl_PointCoord - 0.5) * 2.0;
            gl_FragColor = vec4(vColor * exp(-r * r * 3.0), 1.0);
            ${OUT_CHUNK}
          }`,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })),
    [],
  )
  useEffect(() => () => mat.dispose(), [mat])
  return useMemo(() => {
    if (!stars) return null
    const p = new THREE.Points(stars, mat)
    p.scale.setScalar(1000)
    p.renderOrder = -3
    p.frustumCulled = false
    return p
  }, [stars, mat])
}

/** 回収のときの、着水からの時刻（秒）。回収の前は負、終わったあとは最後の形のまま */
function recoveryTime(step: ReturnStep) {
  if (step === 'recovery') return ret.t
  if (step === 'end') return RECOVERY_TIME
  return -1
}

/** ヘリの位置（司令船から。回収の時刻 rt で）と向き。空母の方から飛んできて、止まり、潜水員を下ろし、上がって見守る */
const HELI_HOVER = new THREE.Vector3(14, 18, -6)
const HELI_DROP = new THREE.Vector3(10, 5.5, -5)
const HELI_WATCH = new THREE.Vector3(14, 12, -8)
function heliAt(rt: number, from: THREE.Vector3, out: THREE.Vector3) {
  if (rt < 9) {
    const k = THREE.MathUtils.smootherstep(rt / 9, 0, 1)
    out.copy(from).lerp(HELI_HOVER, k)
    // 遠くでは高く、近づくと下がる（まっすぐな線より、少しふくらむ）
    out.y += Math.sin(k * Math.PI) * 25
  } else if (rt < SWIMMERS_AT + 3) out.copy(HELI_HOVER).lerp(HELI_DROP, THREE.MathUtils.smootherstep((rt - 9) / 3, 0, 1))
  else out.copy(HELI_DROP).lerp(HELI_WATCH, THREE.MathUtils.smootherstep((rt - SWIMMERS_AT - 3) / 5, 0, 1))
  return out
}
const _hp = new THREE.Vector3()
const _hq = new THREE.Vector3()
const _hs = new THREE.Vector3()

/** 回収の場面：ヘリ・しぶき・潜水員・浮き輪・いかだを、時刻で動かす */
function recoveryScene(
  w: {
    recovery: THREE.Group
    heli: ReturnType<typeof makeHelicopter>
    wash: ReturnType<typeof makeDownwash>
    collar: ReturnType<typeof makeCollar>
    swimmers: ReturnType<typeof makeSwimmer>[]
    raft: ReturnType<typeof makeRaft>
    ship: { group: THREE.Group }
  },
  step: ReturnStep,
  h: number,
  time: number,
) {
  const rt = recoveryTime(step)
  w.recovery.visible = rt >= 0
  if (rt < 0) return
  const water = -h
  const bob = 0.25 * Math.sin(time * 1.1)
  // ヘリ：空母の方の 700 m 先、高さ 90 m から
  const from = _hs.copy(w.ship.group.position).setY(0).normalize().multiplyScalar(700).setY(90)
  const pos = heliAt(rt, from, _hp)
  const ahead = heliAt(rt + 0.2, from, _hq).sub(pos)
  w.heli.group.position.set(pos.x, water + pos.y, pos.z)
  const speed = ahead.length() / 0.2
  // 向き：飛んでいるあいだは進む向き、止まってからは司令船の方へ
  const yawFly = Math.atan2(-ahead.z, ahead.x)
  const yawHover = Math.atan2(pos.z, -pos.x)
  const yaw = speed > 4 ? yawFly : yawHover
  w.heli.group.rotation.set(0, 0, 0)
  w.heli.group.rotation.y = THREE.MathUtils.lerp(w.heli.group.userData.yaw ?? yaw, yaw, 0.05)
  w.heli.group.userData.yaw = w.heli.group.rotation.y
  // 速いと機首を下げ、止まる前に上げる
  w.heli.group.rotation.z = -THREE.MathUtils.clamp(speed / 120, 0, 0.18) + (rt > 6 && rt < 9.5 ? 0.12 * Math.sin(((rt - 6) / 3.5) * Math.PI) : 0)
  w.heli.rotor.rotation.y = time * 21
  w.heli.disc.uniforms.uSpin.value = time * 21
  w.heli.tailRotor.rotation.z = time * 95
  // 真下の海：ヘリの風でしぶきの輪（低いほど強い）
  w.wash.mesh.position.set(pos.x, water + 0.25, pos.z)
  w.wash.mat.uniforms.uTime.value = time % 1000
  w.wash.mat.uniforms.uK.value = THREE.MathUtils.clamp(1 - (pos.y - 4) / 28, 0, 1)
  // 潜水員：ヘリの横の戸から 1 人ずつ飛びこみ、司令船のまわりへ泳ぐ
  w.swimmers.forEach((sw, i) => {
    const jump = SWIMMERS_AT + 0.6 + i * 0.7
    const g = sw.group
    g.visible = rt >= jump
    if (!g.visible) return
    const door = _hq.set(HELI_DROP.x - 0.5, HELI_DROP.y - 1.2, HELI_DROP.z + 1.8)
    const a = (i / 3) * Math.PI * 2 + 0.8
    const at = _hs.set(Math.cos(a) * 3.1, 0, Math.sin(a) * 3.1)
    const fall = rt - jump
    const tFall = Math.sqrt((2 * door.y) / 9.8)
    if (fall < tFall) {
      g.position.set(door.x, water + door.y - 4.9 * fall * fall, door.z)
      g.rotation.set(0, 0, 0)
    } else {
      const k = THREE.MathUtils.smootherstep((fall - tFall) / 4, 0, 1)
      g.position.set(THREE.MathUtils.lerp(door.x, at.x, k), water - 0.35 + 0.12 * Math.sin(time * 1.3 + i), THREE.MathUtils.lerp(door.z, at.z, k))
      g.rotation.set(0, Math.atan2(-(at.z - g.position.z), at.x - g.position.x) * (1 - k) + (Math.atan2(at.z, -at.x) + Math.PI) * k, 0)
    }
  })
  // 浮き輪：潜水員が着いてから、3 秒でふくらむ
  const inflate = THREE.MathUtils.smoothstep(rt, SWIMMERS_AT + 4, SWIMMERS_AT + 7)
  w.collar.mesh.visible = inflate > 0.01
  w.collar.mesh.position.set(0, water + 0.1 + bob, 0)
  w.collar.mesh.scale.set(0.8 + 0.2 * inflate, 0.2 + 0.8 * inflate, 0.8 + 0.2 * inflate)
  // いかだ：浮き輪のあとに、横でふくらむ
  const rk = THREE.MathUtils.smoothstep(rt, SWIMMERS_AT + 8, SWIMMERS_AT + 10)
  w.raft.group.visible = rk > 0.01
  w.raft.group.position.set(4.6, water - 0.05 + 0.2 * Math.sin(time * 1.2 + 1), 2.2)
  w.raft.group.rotation.set(0.04 * Math.sin(time * 0.9), 0.5, 0.05 * Math.sin(time * 1.1))
  w.raft.group.scale.set(rk, 0.3 + 0.7 * rk, rk)
}

function Scene() {
  const craft = useCraft()
  useCraftZoom()
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const small = lowMemory()
  // 地球は打ち上げの場面と同じ：NASA Blue Marble の 12 月と Black Marble の夜の明かり、光の散乱で描く大気
  const big = !small && currentLevel() !== 'low'
  const steps = small || currentLevel() === 'low' ? 8 : currentLevel() === 'medium' ? 12 : 16
  // スマホでも地球は 4K の Blue Marble（大気に入る前の大きな地球が、ぼやけないように）。そのぶん月は 2K に
  const [moonTex, day, night, clouds, water] = useTexture([
    `${base}textures/${small ? '2k' : '4k'}_moon.jpg`,
    big ? `${base}textures/earth/bm_dec_8k.jpg` : `${base}textures/earth/bm_dec_4k.jpg`,
    big ? `${base}textures/earth/bm_night_8k.jpg` : `${base}textures/earth/bm_night_2k.jpg`,
    `${base}textures/4k_earth_clouds.jpg`,
    `${base}textures/earth/bm_water_4k.png`,
  ])
  const stars = useStars()

  // 月・地球・空・海・雲・船・パラシュート・火の玉・噴射
  const w = useMemo(() => {
    moonTex.colorSpace = THREE.SRGBColorSpace
    moonTex.anisotropy = 4
    day.colorSpace = THREE.SRGBColorSpace
    night.colorSpace = THREE.SRGBColorSpace
    day.anisotropy = 4
    const moonMat = new THREE.MeshStandardMaterial({ map: moonTex, roughness: 1, metalness: 0 })
    const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 192, 128), moonMat)
    moon.name = 'return-moon'
    const moonG = new THREE.Group()
    moonG.add(moon)
    // 船の下のあたりには、海の上の場面と同じ積雲（高さ 100 km からは一つ一つの綿雲が見える）
    const earthMat = encodeOutput(earthMaterial(day, night, clouds, { scatter: true, steps, water, localClouds: { glsl: CLOUD_COVER_GLSL, uniforms: cloudUniforms() } }))
    earthMat.uniforms.uLights.value = 0.5
    earthMat.uniforms.uR.value = RE
    const atmo = encodeOutput(atmosphereMaterial({ scatter: true, steps }))
    atmo.uniforms.uR.value = RE
    const earthG = new THREE.Group()
    earthG.name = 'return-earth'
    const earth = new THREE.Mesh(new THREE.SphereGeometry(RE, 160, 100), earthMat)
    const air = new THREE.Mesh(new THREE.SphereGeometry(RE + 100_000, 96, 64), atmo)
    earthG.add(earth, air)
    // 空の表（光の散乱の計算）：空のドーム・海・海に映る空が引く
    const lut = new SkyLut(RE, 16)
    const cq = cloudQuality(currentLevel(), small)
    const sky = new THREE.Mesh(new THREE.SphereGeometry(90_000, 48, 24), encodeOutput(skyDomeMaterial(lut, cq)))
    sky.renderOrder = -2
    sky.frustumCulled = false
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2_400_000, 2_400_000, 120, 120), encodeOutput(oceanMaterial(lut, RE, cq)))
    ocean.rotation.x = -Math.PI / 2
    ocean.renderOrder = -1
    ocean.frustumCulled = false
    const ship = makeCarrier()
    // 回収：ヘリコプター・真下のしぶき・浮き輪・潜水員 3 人・いかだ
    const heli = makeHelicopter()
    const wash = makeDownwash()
    const collar = makeCollar()
    const swimmers = [makeSwimmer(), makeSwimmer(), makeSwimmer()]
    const raft = makeRaft()
    const recovery = new THREE.Group()
    recovery.name = 'return-recovery'
    recovery.add(heli.group, wash.mesh, collar.mesh, raft.group, ...swimmers.map((x) => x.group))
    const mains = [makeChute('main'), makeChute('main'), makeChute('main')]
    const drogues = [makeChute('drogue'), makeChute('drogue')]
    const fire = makeFireball()
    const glowMat = new THREE.PointLight('#ff9a50', 0, 60, 1.2)
    const fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(2.4, 1.1, 0.55), depthWrite: false, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0 }))
    fireGlow.renderOrder = 8
    const nozzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(3, 1.9, 1.1), depthWrite: false, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending }))
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(7, 6.6, 6), depthWrite: false, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending }))
    const sps = encodeOutput(plumeMaterial({ core: '#ffe2b8', edge: '#ff8a40', soft: 1.4 }))
    const plumeGeo = plumeGeometry()
    const plume = new THREE.Mesh(plumeGeo, sps)
    plume.position.y = -10.35
    plume.scale.set(1.25, 9, 1.25)
    plume.renderOrder = 5
    plume.frustumCulled = false
    // 波しぶき
    const SPRAY = 500
    const sprayGeo = new THREE.BufferGeometry()
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPRAY * 3), 3))
    const sprayVel = new Float32Array(SPRAY * 3)
    for (let i = 0; i < SPRAY; i++) {
      const a = Math.random() * Math.PI * 2
      const out = 2 + Math.random() * 9
      sprayVel.set([Math.cos(a) * out, 4 + Math.random() * 11, Math.sin(a) * out], i * 3)
    }
    const sprayMat = new THREE.PointsMaterial({ color: '#f4f8fb', map: glowTexture(), size: 0.35, transparent: true, opacity: 0, depthWrite: false })
    const spray = new THREE.Points(sprayGeo, sprayMat)
    spray.frustumCulled = false
    // 窓のカメラのときの、窓の外のプラズマ
    const winPlasma = makeWindowPlasma()
    const owned: { dispose: () => void }[] = [winPlasma, moon.geometry, moonMat, earth.geometry, earthMat, air.geometry, atmo, sky.geometry, sky.material as THREE.Material, ocean.geometry, ocean.material as THREE.Material, lut, ship, heli, wash, collar, raft, ...swimmers, ...mains, ...drogues, fire, sunSprite.material, nozzle.material, fireGlow.material, sps, plumeGeo, sprayGeo, sprayMat]
    return { fireGlow, nozzle, moonG, earthMat, atmo, earthG, lut, sky, ocean, ship, mains, drogues, fire, glowMat, sunSprite, sps, plume, spray, sprayVel, winPlasma, recovery, heli, wash, collar, swimmers, raft, owned }
  }, [moonTex, day, night, clouds, water])
  useEffect(
    () => () => {
      w.owned.forEach((o) => o.dispose())
      roar.h?.stop()
      roar.h = null
      heliSnd.h?.stop()
      heliSnd.h = null
    },
    [w],
  )
  // 確かめる用（#debug のときだけ）
  useEffect(() => {
    if (!location.hash.includes('debug')) return
    const g = window as unknown as { __returnWorld?: unknown; __returnGl?: unknown }
    g.__returnWorld = w
    g.__returnGl = gl
    return () => {
      delete g.__returnWorld
      delete g.__returnGl
    }
  }, [w, gl])

  // 模型：着陸船は上の段だけ。司令船の探り棒（Strut）、焦げる面（Ablator・CMSilver）
  const parts = useMemo(() => {
    for (const o of craft.lm.children) if (o.name !== 'LMAscent') o.visible = false
    const cm = craft.csm.getObjectByName('CM')!
    const sm = craft.csm.getObjectByName('SM')!
    const probe: THREE.Object3D[] = []
    const burn: { m: THREE.MeshStandardMaterial; from: THREE.Color; to: THREE.Color; metal: number; toMetal: number }[] = []
    cm.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const m = mesh.material as THREE.MeshStandardMaterial
      if (m.name === 'Strut') probe.push(mesh)
      // 本物の司令船は、帰ってくると茶色く焦げている（海に浮かぶアメリカ号の写真：こげ茶〜あめ色。真っ黒ではない）。
      // 焦げた面は金属の照りをなくす：金属のままだと、まわりの映りこみに色を掛けるだけなので、昼の海でも真っ黒な影になった
      if (m.name === 'Ablator') burn.push({ m, from: m.color.clone(), to: new THREE.Color('#5c4a3c'), metal: m.metalness, toMetal: 0 })
      if (m.name === 'CMSilver') burn.push({ m, from: m.color.clone(), to: new THREE.Color('#9a7c5c'), metal: m.metalness, toMetal: 0.3 })
    })
    // 影を落とす・受ける（司令船・機械船・着陸船の上の段）
    const shadowed: THREE.Mesh[] = []
    for (const root of [craft.csm, craft.lm])
      root.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        if (!mesh.castShadow) shadowed.push(mesh)
        mesh.castShadow = mesh.receiveShadow = true
      })
    return { cm, sm, probe, burn, shadowed }
  }, [craft])
  useEffect(() => () => parts.shadowed.forEach((m) => (m.castShadow = m.receiveShadow = false)), [parts])
  useEffect(() => {
    // 次に開いたときのために、焦げを戻す
    return () => parts.burn.forEach((b) => ((b.m.metalness = b.metal), b.m.color.copy(b.from)))
  }, [parts])
  useEffect(() => {
    parts.cm.add(w.plume)
    w.plume.position.y = -10.35
    return () => {
      parts.cm.remove(w.plume)
    }
  }, [parts, w])

  const rig = useMemo(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false, key: '' }), [])
  const tmp = useMemo(() => ({ qe: new THREE.Quaternion(), qcm: new THREE.Quaternion(), vel: new THREE.Vector3(), up: new THREE.Vector3(), side: new THREE.Vector3(), cmPos: new THREE.Vector3(), moonEnd: new THREE.Vector3(0, -(MOON_R + LUNAR_ALT), 0), roll: new THREE.Quaternion() }), [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    tickReturn(dt)
    const time = state.clock.elapsedTime
    const ms = useMoonMission.getState()
    const step = useMoonReturn.getState().step
    returnCuts(step, dt)
    const t = ret.t
    const lunar = lunarStep(step)
    const e = ret.e
    const inAir = step === 'entry' || step === 'fail'
    const sea = seaStep(step)
    const h = inAir && e ? e.h : sea ? ret.h : step === 'corridor' ? EI_ALT + (9_000_000 - EI_ALT) * Math.pow(1 - Math.min(1, t / CORRIDOR_TIME), 1.5) : 0
    const lm = craft.lm
    const csm = craft.csm
    w.sps.uniforms.uTime.value = time

    // ---- 月 ----
    w.moonG.visible = lunar || step === 'coast'
    if (lunar) {
      // 月を回る：月面がうしろへ流れる（早送り）
      const stepAt: Partial<Record<ReturnStep, number>> = { rdv: 0, docked: 0.016, lmGone: 0.022, teiWait: 0.9, tei: 0.905 }
      w.moonG.rotation.x = (stepAt[step] ?? 0) + t * 0.0009
      w.moonG.position.set(0, -(MOON_R + LUNAR_ALT), 0)
      if (step === 'tei') {
        // 点火：前へ加速して、月はうしろへ遠ざかる
        const tb = t * TEI_WARP
        const a = 928 / TEI_BURN
        const s = tb < TEI_BURN ? 0.5 * a * tb * tb : 0.5 * a * TEI_BURN * TEI_BURN + 928 * (tb - TEI_BURN) * 0.6
        w.moonG.position.z += s
        w.moonG.position.y -= s * 0.15
      }
      tmp.moonEnd.copy(w.moonG.position)
    } else if (step === 'coast') {
      // 月はうしろで小さくなる
      const k = Math.min(1, t / COAST_TIME)
      const d0 = tmp.moonEnd.length()
      const d = d0 * Math.pow((EARTH_MOON * 0.85) / d0, Math.pow(k, 0.6))
      _v.copy(tmp.moonEnd).normalize().lerp(_w.set(0, -0.18, 1).normalize(), Math.min(1, k * 3)).normalize()
      w.moonG.position.copy(_v).multiplyScalar(d)
    }

    // ---- 地球 ----
    // 低い所では海面と空に任せる（地球の球は角ばっているので、海面と重なるとちらつく）
    const earthOn = !lunar && !((sea || inAir) && h < 30_000)
    w.earthG.visible = earthOn
    let range = 0
    if (earthOn) {
      let dist: number
      let dir: THREE.Vector3
      if (step === 'coast') {
        dist = coastDistance(1 - Math.min(1, t / COAST_TIME))
        dir = _u.set(0, -0.12, -1).normalize()
      } else if (step === 'cmSep') {
        dist = RE + 36_000_000 - 27_000_000 * Math.min(1, t / CMSEP_TIME)
        dir = _u.set(0, -0.12, -1).normalize()
      } else {
        dist = RE + h
        // 遠いうちは前に、近づくと真下に
        const k = THREE.MathUtils.smoothstep(h, 400_000, 9_000_000)
        dir = _u.set(0, -1, 0).lerp(_v.set(0, -0.12, -1).normalize(), k).normalize()
        if (inAir || sea) range = e ? e.range : 0
      }
      w.earthG.position.copy(dir).multiplyScalar(dist)
      // 宇宙船の真下が、大気に入る所（そのあとは進んだ道のりの分だけ回す）
      const up = _a.copy(dir).negate()
      const fwd = _b.set(0, 0, -1).projectOnPlane(up).normalize()
      earthOrient(up.clone(), fwd.clone(), tmp.qe)
      if (range > 0) tmp.qe.premultiply(_q.setFromAxisAngle(_w.crossVectors(fwd, up).normalize().negate(), -range / RE))
      // 大気に入る前：船の真下は、大気に入る所よりうしろ（落ちてくる道は、地球のまわりを回りこむ放物線）。
      // 遠くでは夜の側（帰り道の地球は細い三日月。1972 年 12 月 19 日は満月の前日で、月から見た地球は新月に近い）、
      // 近づくにつれて昼の側へ回りこみ、朝の空で大気に入る
      const swing = approachSwing(dist)
      if (swing > 0) tmp.qe.premultiply(_q.setFromAxisAngle(_w.crossVectors(fwd, up).normalize().negate(), swing))
      w.earthG.quaternion.copy(tmp.qe)
      w.earthMat.uniforms.uCenter.value.copy(w.earthG.position)
      w.atmo.uniforms.uCenter.value.copy(w.earthG.position)
      // 大気の中では、空の層は内側から見た空（同じ散乱の計算）。外から見た縁の光の見え方は使わない
      w.atmo.uniforms.uSky.value = inAir || sea ? 1 : THREE.MathUtils.smoothstep(h, 15_000, 45_000)
      sun.copy(SUN_E).applyQuaternion(tmp.qe)
      w.earthMat.uniforms.uSun.value.copy(sun)
      w.atmo.uniforms.uSun.value.copy(sun)
      w.earthMat.uniforms.uNear.value = THREE.MathUtils.clamp(1 - h / 80_000, 0, 1) * 0.6
      w.earthMat.uniforms.uNear2.value = THREE.MathUtils.clamp(1 - h / 3_000_000, 0, 1)
    } else if (lunar) sun.copy(SUN_MOON)
    else if (sea) {
      // 着水地点の空：朝 8 時半ごろの太陽
      earthOrient(_a.set(0, 1, 0), _b.set(0, 0, -1), tmp.qe)
      tmp.qe.premultiply(_q.setFromAxisAngle(X, P_EI.angleTo(P_SPLASH)))
      sun.copy(SUN_E).applyQuaternion(tmp.qe)
      // 高さは計算で決める：1972 年 12 月 19 日 19:24 UTC、南緯 17.9° 西経 166.1°（地方時 8 時 20 分ごろ）で約 38°。
      // 上の回転だけでは 22° ほどにしかならなかったので、向き（方位）だけ使い、高さを合わせる
      const az = Math.atan2(sun.z, sun.x)
      const el = THREE.MathUtils.degToRad(38)
      sun.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el))
    }

    // 船を照らす日の光の色
    if (inAir || sea) sunTransmit(RE, h, sun.y, sunCol)
    else sunCol.setRGB(1, 1, 1)

    // ---- 空と海（低い所） ----
    const skyA = (1 - THREE.MathUtils.smoothstep(h, 22_000, 70_000)) * (inAir || sea ? 1 : 0)
    {
      // 映りこむ景色：見かけの大きい方の天体。大気の中では空と海
      const angOf = (g: THREE.Object3D, r: number) => (g.visible ? Math.asin(Math.min(1, r / Math.max(r, g.position.distanceTo(camera.position)))) : 0)
      const am = angOf(w.moonG, MOON_R)
      const ae = angOf(w.earthG, RE)
      envBody.air = skyA
      if (skyA > 0.001 || sea) {
        envBody.down.set(0, -1, 0)
        envBody.angR = Math.PI / 2
        envBody.earth = true
        envBody.air = sea ? 1 : skyA
      } else if (am >= ae && am > 0) {
        envBody.down.copy(w.moonG.position).sub(camera.position).normalize()
        envBody.angR = am
        envBody.earth = false
      } else if (ae > 0) {
        envBody.down.copy(w.earthG.position).sub(camera.position).normalize()
        envBody.angR = ae
        envBody.earth = true
      } else envBody.angR = 0
    }
    // 空のドーム：地球の球と大気の層を描いている間（高さ 30 km 以上）は、そちらが空を描くので出さない（二重にならないように）
    const oceanA = (1 - THREE.MathUtils.smoothstep(h, 30_000, 50_000)) * (inAir || sea ? 1 : 0)
    w.sky.visible = skyA > 0.001 && !earthOn
    w.ocean.visible = oceanA > 0.001
    const camH = Math.max(0, h + camera.position.y)
    if (w.sky.visible || w.ocean.visible) w.lut.update(gl, camH, sun)
    w.sky.position.copy(camera.position)
    const skyU = (w.sky.material as THREE.ShaderMaterial).uniforms
    skyU.uAlpha.value = 1
    skyU.uSun.value.copy(sun)
    const ou = (w.ocean.material as THREE.ShaderMaterial).uniforms
    ou.uAlpha.value = oceanA
    ou.uTime.value = time
    ou.uSun.value.copy(sun)
    ou.uOffset.value.set(0, -range)
    // 地球の球を描いている間（高さ 30〜50 km）は、球の角ばった面より少し上に
    w.ocean.position.set(camera.position.x, -h + (earthOn ? Math.min(2_000, h * 0.04) : 0), camera.position.z)
    // 水平線より上は描かない（本当の地球の球で決める。持ち上げた分は入れない）
    ou.uCenter.value.set(camera.position.x, -h - RE, camera.position.z)
    // うすく重ねている間は、奥の大気の光を隠さないように、奥行きを書かない
    ;(w.ocean.material as THREE.ShaderMaterial).depthWrite = oceanA > 0.99
    // 雲の層（空と海の素材の中で描く）：海面からの高さと、貿易風（約 6 m/s）で流れる分
    // 雲は地面といっしょに流れる（大気に入ってから進んだ道のりの分、海の波と同じく）
    if (e && (inAir || sea)) cloudRun.range = e.range
    else if (!inAir && !sea) cloudRun.range = 0
    for (const m of [w.sky.material, w.ocean.material] as THREE.ShaderMaterial[]) {
      m.uniforms.uSeaH.value = h
      m.uniforms.uCloudOn.value = inAir || sea ? 1 : 0
      m.uniforms.uCloudOff.value.set(-time * 6, -time * 2 - cloudRun.range)
    }
    // 地球の球の上の同じ積雲：高さ 900 km より下で（それより上では、地図の雲だけ）
    {
      const eu = w.earthMat.uniforms
      eu.uCloudOff.value.set(-time * 6, -time * 2 - cloudRun.range)
      eu.uCloudOn.value = 1 - THREE.MathUtils.smoothstep(h, 300_000, 900_000)
      eu.uUp.value.copy(w.earthG.position).negate().normalize()
    }
    w.ship.group.visible = sea
    w.ship.group.position.set(-2_600, -h + 0.2, -3_900)
    w.ship.group.rotation.y = 0.9
    recoveryScene(w, step, h, time)
    // ヘリの音：近いほど大きく。船長の窓からは、船の壁ごしで小さめ
    {
      const on = w.recovery.visible && w.heli.group.visible
      if (on && !heliSnd.h) heliSnd.h = startHeliSound()
      if (heliSnd.h) {
        if (on) {
          const d = camera.position.distanceTo(w.heli.group.position)
          heliSnd.h.set((40 / (40 + d)) * (ms.cam === 'window' ? 0.55 : 1))
        } else {
          heliSnd.h.stop()
          heliSnd.h = null
        }
      }
    }
    // 太陽：空のドームを描くときはドームが描く（空気を通った色で）
    w.sunSprite.visible = !w.sky.visible
    w.sunSprite.position.copy(camera.position).addScaledVector(sun, 4e9)
    w.sunSprite.scale.setScalar(4e9 * 0.03)
    if (stars) {
      stars.position.copy(camera.position)
      // 昼の空の中（高さ 50 km より下）では、星は空の明るさに負けて見えない
      stars.visible = !(inAir || sea) || h > 50_000
    }

    // ---- 宇宙船 ----
    const showLm = step === 'rdv' || step === 'docked' || step === 'lmGone'
    lm.visible = showLm
    csm.visible = true
    parts.sm.visible = lunar || step === 'coast' || (step === 'cmSep' && t < CMSEP_TIME)
    for (const p of parts.probe) p.visible = lunar || step === 'coast'
    w.plume.visible = step === 'tei' && t * TEI_WARP < TEI_BURN
    // ノズルの口の光（真空の炎はほとんど見えないので、口のまわりだけ）
    w.nozzle.visible = w.plume.visible
    if (w.nozzle.visible) {
      w.nozzle.position.set(0, -10.6, 0).applyQuaternion(csm.quaternion).add(csm.position)
      w.nozzle.scale.setScalar(5.5 + Math.sin(time * 40) * 0.3)
    }
    w.sps.uniforms.uPower.value = 0.55
    w.sps.uniforms.uExpand.value = 1
    if (step === 'rdv' || step === 'docked' || step === 'lmGone') {
      // 司令船（逆さ）が前、着陸船の上の段がうしろから近づく
      csm.quaternion.copy(LUNAR_FRAME).multiply(FLIP)
      csm.position.set(0, DROGUE.y + 0.5, DROGUE.z).applyQuaternion(LUNAR_FRAME)
      let back = step === 'rdv' ? ret.gap : 0
      lm.quaternion.copy(LUNAR_FRAME)
      if (step === 'lmGone') {
        const k = Math.max(0, t - 1.5)
        back = k * 0.6 + k * k * 0.12
        lm.quaternion.multiply(_q.setFromAxisAngle(_v.set(0.3, 0, 1).normalize(), k * 0.05))
      }
      lm.position.set(0, -back, 0).applyQuaternion(LUNAR_FRAME)
      tmp.cmPos.set(0, DROGUE.y + 5, 0).applyQuaternion(LUNAR_FRAME)
    } else if (step === 'teiWait' || step === 'tei' || step === 'coast' || step === 'cmSep') {
      // 司令船の機首を前へ（点火の向き）。待つあいだに向きを変える
      const k = step === 'teiWait' ? THREE.MathUtils.smootherstep(t / 8, 0, 1) : 1
      _q.copy(LUNAR_FRAME).multiply(FLIP)
      _q2.copy(LUNAR_FRAME)
      // 帰り道：太陽の熱を均すため、ゆっくり回る（バーベキュー・ロール）
      if (step === 'coast') _q2.multiply(tmp.roll.setFromAxisAngle(Y, t * 0.25))
      csm.quaternion.slerpQuaternions(_q, _q2, k)
      if (step === 'cmSep') {
        // 機械船を切り離して、司令船だけ向きを変える（熱よけを前へ）
        const turn = THREE.MathUtils.smootherstep(t / CMSEP_TIME, 0.35, 1)
        csm.quaternion.copy(LUNAR_FRAME).multiply(_q.setFromAxisAngle(X, Math.PI * turn))
        parts.sm.position.set(Math.min(t, 3) * 0.1, -Math.max(0, t - 0.6) * 1.6, 0)
        parts.sm.rotation.set(Math.max(0, t - 0.6) * 0.05, 0, 0)
      } else {
        parts.sm.position.set(0, 0, 0)
        parts.sm.rotation.set(0, 0, 0)
      }
      csm.position.set(0, -CM_MID, 0).applyQuaternion(csm.quaternion)
      tmp.cmPos.set(0, 0, 0)
    } else {
      // 大気へ：司令船だけ。熱よけ（-Y）を進む向きへ、少し傾けて揚力を出す
      const gamma = e ? e.gamma : step === 'corridor' ? THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-28, ret.angle, Math.min(1, t / CORRIDOR_TIME) ** 0.5)) : 0
      const vel = tmp.vel.set(0, Math.sin(gamma), -Math.cos(gamma))
      const lift = e ? e.lift : 1
      const upPerp = tmp.up.set(0, 1, 0).projectOnPlane(vel).normalize()
      const bank = Math.acos(THREE.MathUtils.clamp(lift, -1, 1))
      const liftDir = upPerp.clone().applyAxisAngle(vel, bank)
      if (sea) {
        // パラシュートの下：ドローグのあいだは大きくゆれ、主パラシュートでは 27.5° 傾いてつり下がる
        const mainsOn = ret.mainAt >= 0
        const sway = mainsOn ? 0.04 * Math.sin(time * 0.7) : 0.22 * Math.sin(time * 1.3) + 0.08 * Math.sin(time * 2.9)
        const tilt = mainsOn ? THREE.MathUtils.degToRad(27.5) * Math.min(1, (t - ret.mainAt) / 4) : 0
        const floatK = afloat(step) ? Math.min(1, ret.splashT / 2.5) : 0
        tmp.qcm.setFromAxisAngle(X, (tilt + sway) * (1 - floatK) + floatK * 0.06 * Math.sin(time * 0.9))
        tmp.qcm.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), floatK * 0.05 * Math.sin(time * 0.7 + 1)))
      } else {
        const axis = _v.copy(vel).negate().multiplyScalar(Math.cos(TRIM)).addScaledVector(liftDir, Math.sin(TRIM)).normalize()
        tmp.qcm.setFromUnitVectors(Y, axis)
        // 機体のまわりの回転（バンク）も見えるように
        tmp.qcm.premultiply(_q.setFromAxisAngle(axis, bank))
      }
      csm.quaternion.copy(tmp.qcm)
      csm.position.set(0, -CM_MID, 0).applyQuaternion(csm.quaternion)
      if (sea && afloat(step)) csm.position.y += -0.5 + 0.25 * Math.sin(time * 1.1)
      tmp.cmPos.copy(csm.position).add(_w.set(0, CM_MID, 0).applyQuaternion(csm.quaternion))
      // 火の玉
      const heat = inAir ? ret.heat : 0
      w.fire.group.position.set(0, SHIELD_Y, 0).applyQuaternion(csm.quaternion).add(csm.position)
      w.fire.group.quaternion.setFromUnitVectors(_w.set(0, -1, 0), vel)
      updateFireball(w.fire, heat, time)
      w.glowMat.position.copy(w.fire.group.position).addScaledVector(vel, 3)
      w.glowMat.intensity = heat * 900
      // 火の玉のまわりの、まるい光
      w.fireGlow.visible = heat > 0.02
      w.fireGlow.position.copy(w.fire.group.position).addScaledVector(vel, 1)
      w.fireGlow.scale.setScalar(6 + heat * 7)
      w.fireGlow.material.opacity = Math.min(1, heat * 1.2) * 0.55 * (0.8 + 0.2 * Math.sin(time * 23))
      // 窓の外：流れの向き（空気は進む向きの逆へ流れる）を画面の上の向きにして、光の筋と火の粉を流す
      {
        const wp = w.winPlasma
        wp.mesh.visible = ms.cam === 'window' && heat > 0.02
        if (wp.mesh.visible) {
          const P = _a.set(0, 0, -10).applyQuaternion(camera.quaternion).add(camera.position)
          const Q = _b.copy(P).addScaledVector(vel, -1)
          P.project(camera)
          Q.project(camera)
          wp.mat.uniforms.uFlow.value.set((Q.x - P.x) * camera.aspect, Q.y - P.y)
          if (wp.mat.uniforms.uFlow.value.lengthSq() < 1e-8) wp.mat.uniforms.uFlow.value.set(0, 1)
          wp.mat.uniforms.uAspect.value = camera.aspect
          wp.mat.uniforms.uHeat.value = Math.min(1, heat * 1.4)
          wp.mat.uniforms.uTime.value = time % 1000
        }
      }
      // 焦げ
      for (const b of parts.burn) {
        b.m.color.copy(b.from).lerp(b.to, ret.char * 0.85)
        b.m.metalness = THREE.MathUtils.lerp(b.metal, b.toMetal, ret.char)
      }
    }
    // 突入の音：熱いあいだと、G が強いあいだ
    {
      const g = inAir && e ? e.g : 0
      const want = inAir && (ret.heat > 0.02 || g > 0.4)
      if (want && !roar.h) roar.h = startEntryRoar()
      if (roar.h) {
        if (want) roar.h.set(ret.heat, g)
        else {
          roar.h.stop()
          roar.h = null
        }
      }
    }
    if (!inAir) {
      w.winPlasma.mesh.visible = false
      w.fire.group.visible = false
      w.fireGlow.visible = false
      w.glowMat.intensity = 0
    }
    if (lunar || step === 'coast' || step === 'cmSep') for (const b of parts.burn) ((b.m.metalness = b.metal), b.m.color.copy(b.from))

    // ---- パラシュート ----
    const apex = _a.set(0, 0, 0).applyQuaternion(csm.quaternion).add(csm.position)
    const drogueOn = step === 'chutes' && ret.mainAt < 0
    w.drogues.forEach((c, i) => {
      c.group.visible = drogueOn
      if (!drogueOn) return
      const open = THREE.MathUtils.smoothstep(t, 0, 0.8) * (t < 2.5 ? 0.55 : 0.55 + 0.45 * THREE.MathUtils.smoothstep(t, 2.5, 3.3))
      shapeChute(c, open, Math.sin(time * 5 + i), time + i * 3.1)
      c.group.position.copy(apex).add(_v.set(0, 1.5, 0))
      c.group.quaternion.setFromAxisAngle(_v.set(0, 0, 1), (i ? 1 : -1) * 0.16 + 0.05 * Math.sin(time * 2.1 + i))
      c.group.scale.setScalar(1.2)
    })
    const mainsOn = (step === 'chutes' && ret.mainAt >= 0) || afloat(step)
    w.mains.forEach((c, i) => {
      c.group.visible = mainsOn
      if (!mainsOn) return
      const since = step === 'chutes' ? t - ret.mainAt : 99
      // すぼめて開く（リーフィング）→ 広がる。本物は 1 つだけ数秒おくれて広がった
      const late = i === 2 ? 3 : 0
      let open = THREE.MathUtils.smoothstep(since, 0, 1.4) * 0.32
      open += 0.68 * THREE.MathUtils.smoothstep(since, 6 + late, 8 + late)
      shapeChute(c, open, Math.sin(time * 1.6 + i * 2), time + i * 3.1)
      const az = (i / 3) * Math.PI * 2 + 0.4
      c.group.position.copy(apex).add(_v.set(0, 4, 0))
      c.group.quaternion.setFromAxisAngle(_v.set(Math.cos(az), 0, Math.sin(az)), 0.3 * open + 0.03 * Math.sin(time + i))
      c.group.scale.setScalar(1)
      c.lines.visible = true
      c.canopy.position.y = c.length
      if (afloat(step)) {
        // 着水したら切り離す：風下（カメラの向こう）へ流れて、海にぺたんと広がり、水を吸ってしずんでいく
        //（海面の高さにとどまると、波の山から布のしまが細切れにのぞいて見えた）
        const dn = step === 'splash' ? THREE.MathUtils.smootherstep(ret.splashT / 4, 0, 1) : 1
        const sink = Math.max(0, ret.splashT - 4.5) * 0.6
        c.group.visible = sink < 4
        const spot = FALLEN[i]
        c.group.position.set(THREE.MathUtils.lerp(apex.x, spot[0], dn), THREE.MathUtils.lerp(apex.y + 4, -h + 0.3, dn) - sink, THREE.MathUtils.lerp(apex.z, spot[1], dn))
        c.group.quaternion.setFromAxisAngle(_v.set(Math.cos(az), 0, Math.sin(az)), (0.3 + dn * 1.25) * (1 - dn) + dn * 0.02)
        c.canopy.position.y = c.length * (1 - dn)
        c.canopy.scale.y = 1 - dn * 0.9
        c.lines.visible = dn < 0.25
      }
    })

    // ---- 着水のしぶき ----
    const splashing = step === 'splash' && ret.splashT < 4
    w.spray.visible = splashing
    if (splashing) {
      const p = w.spray.geometry.getAttribute('position') as THREE.BufferAttribute
      const st = ret.splashT
      for (let i = 0; i < p.count; i++) {
        const vx = w.sprayVel[i * 3]
        const vy = w.sprayVel[i * 3 + 1]
        const vz = w.sprayVel[i * 3 + 2]
        p.setXYZ(i, vx * st, Math.max(-h - 0.5, -h + vy * st - 4.9 * st * st), vz * st)
      }
      p.needsUpdate = true
      ;(w.spray.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - st / 3.5)
    }
    // 着水の泡は、海の素材の中で描く（波と同じ面に、まだらな白い輪）
    const splashU = ((w.ocean.material as THREE.ShaderMaterial).uniforms.uSplash.value as THREE.Vector4)
    if (afloat(step)) splashU.set(0, 0, step === 'end' ? Math.max(10, ret.splashT) : ret.splashT, 1)
    else splashU.set(0, 0, -1, 0)

    // 影の範囲の真ん中（司令船）と、雲の影
    shadowAt.copy(csm.position)
    shade.k = inAir || sea ? cloudShadeAt(csm.position.x, csm.position.z, h, sun, (w.ocean.material as THREE.ShaderMaterial).uniforms.uCloudOff.value) : 1

    // ---- カメラ ----
    const cam = ms.cam
    const want = _v.set(0, 0, 0)
    const look = _w.set(0, 0, 0)
    let fov = 45
    let up: THREE.Vector3 | null = null
    let near = 0.3
    let snap = false
    const c = tmp.cmPos
    // 縦長の画面（スマホ）：横に見える広さが足りないので、見る点を船へ寄せる（横長の「船は左、行く先は右」の構図だと船が見切れる）
    const tall = camera.aspect < 1
    if (step === 'rdv' || step === 'docked' || step === 'lmGone') {
      const lmPos = _u.copy(lm.position).add(_b.set(0, 5, 0).applyQuaternion(LUNAR_FRAME))
      if (cam === 'window') {
        // 司令船の照準（COAS）から、うしろの着陸船を見る
        want.set(0.75, -0.6, 0).applyQuaternion(csm.quaternion).add(csm.position)
        look.copy(want).add(_b.set(0, 1, 0).applyQuaternion(csm.quaternion))
        fov = 34
        near = 0.05
        snap = true
      } else if (cam === 'wide') {
        want.copy(c).add(_b.set(70, 18, 40))
        look.copy(c).add(tall ? _b.set(0, -14, 8) : _b.set(0, -25, 30))
        fov = 50
      } else {
        const span = Math.max(16, c.distanceTo(lmPos) + 12) * (tall ? 1.6 : 1)
        look.copy(c).lerp(lmPos, 0.5)
        want.copy(look).add(_b.set(span * 0.8, span * 0.22, -span * 0.25))
        fov = 42
      }
    } else if (lunar || step === 'coast' || step === 'cmSep') {
      if (cam === 'window') {
        // 船長の窓のすぐ外（大気の中の窓と同じ所。殻の内側に入らないように）。横の窓から前を見る
        want.copy(WINDOW_EYE).applyQuaternion(csm.quaternion).add(csm.position)
        look.copy(want).add(_b.set(0.25, -0.1, -1).applyQuaternion(csm.quaternion))
        fov = 55
        near = 0.05
        snap = true
      } else if (cam === 'wide') {
        if (step === 'coast') {
          // 前から振り返る：司令船と、うしろの月
          want.set(-14, 4, -46)
          look.set(0, -1, 30)
        } else {
          want.set(50, 22, 60)
          if (tall) look.set(0, -16, -18)
          else look.set(0, -30, -80)
        }
        fov = 50
      } else if (step === 'cmSep') {
        // 太陽は前の左下（帰り道の地球は三日月なので、太陽は地球の向こう寄り）。日の当たる左の側から
        want.set(-15, 4, 18)
        look.set(0, -1, 3)
        fov = 46
      } else {
        if (step === 'coast') want.set(-12, 3.5, 22)
        else want.set(17, 5, 15)
        look.set(0, step === 'coast' ? -0.5 : -2, -8)
        // 機械船つきの船のまん中（司令船から 4 m うしろ）
        if (tall) look.lerp(_b.set(0, -4, 0).applyQuaternion(csm.quaternion), 0.8)
        fov = step === 'coast' ? 40 : 46
      }
    } else if (!sea) {
      const vel = tmp.vel
      const side = tmp.side.crossVectors(vel, Y).normalize()
      if (cam === 'window') {
        // 窓から：横の窓の外を、火の玉の光が流れていく
        want.copy(WINDOW_EYE).applyQuaternion(csm.quaternion).add(csm.position)
        // 横うしろ：熱よけから流れてくる光の尾が見える
        look.copy(want).add(_b.set(1, 1.3, 0).applyQuaternion(csm.quaternion))
        fov = 75
        near = 0.05
        snap = true
      } else if (cam === 'wide') {
        want.copy(c).addScaledVector(side, 60).addScaledVector(vel, -25).add(_b.set(0, 10, 0))
        look.copy(c).addScaledVector(vel, tall ? -8 : -40)
        fov = 50
      } else {
        want.copy(c).addScaledVector(side, 12).addScaledVector(vel, -13).add(_b.set(0, 4.5, 0))
        look.copy(c).addScaledVector(vel, 5)
        fov = 50
      }
      // 大気に入る前（まだ何千 km も上）：地球は大きな三日月。遠くからのカメラは、日の当たる三日月のふちの方を見る
      if (step === 'corridor' && cam === 'wide' && w.earthG.visible) {
        const toEarth = _u.copy(w.earthG.position).sub(c).normalize()
        const limb = _b.copy(sun).projectOnPlane(toEarth).normalize().multiplyScalar(RE).add(w.earthG.position).sub(c).normalize()
        // 船の向こうに三日月：船の少しうしろ・横から、ふちの方を見る（船は手前）
        want.copy(c).addScaledVector(limb, -45).addScaledVector(side, tall ? 8 : 14).add(_a.set(0, 5, 0))
        look.copy(c).addScaledVector(limb, tall ? 60 : 45)
      }
      // G と熱のゆれ
      const k = (e ? Math.min(1, e.g / 7) : 0) * 0.06 + ret.heat * 0.05
      want.x += (Math.random() - 0.5) * k
      want.y += (Math.random() - 0.5) * k
    } else {
      const water = -h
      const rec = step === 'recovery' || step === 'end'
      if (cam === 'window') {
        // 窓から上を見る：パラシュート（回収のときは、上で止まっているヘリ）
        want.copy(WINDOW_EYE).applyQuaternion(csm.quaternion).add(csm.position)
        if (rec) look.copy(w.heli.group.position)
        else look.copy(c).add(_b.set(4, 40, 0))
        fov = 70
        near = 0.05
        snap = true
      } else if (rec && cam === 'wide') {
        // 回収：横から少し上。司令船・浮き輪・潜水員と、上のヘリ、遠くの空母が一つの絵に入る
        // ヘリの反対側から：司令船が手前、ヘリがその向こうの上。近すぎるヘリが画面をふさがない
        const dir = _u.set(HELI_WATCH.x, 0, HELI_WATCH.z).normalize()
        const side = _a.set(-dir.z, 0, dir.x)
        want.copy(c).addScaledVector(dir, tall ? -40 : -32).addScaledVector(side, 10).add(_b.set(0, 6, 0))
        // 司令船とヘリのまん中を見る（どちらも画面に入る）
        look.copy(c).lerp(w.heli.group.position, 0.5)
        fov = tall ? 72 : 50
        snap = true
      } else if (rec) {
        // 回収：海面に近い所から見上げる（波の上の司令船と浮き輪、上にヘリ）。低すぎると波の山に司令船がかくれる
        const dir = _u.set(HELI_WATCH.x, 0, HELI_WATCH.z).normalize()
        want.copy(c).addScaledVector(dir, tall ? -26 : -20).addScaledVector(_a.set(dir.z, 0, -dir.x), 13).add(_b.set(0, 3.6, 0))
        look.copy(c).lerp(w.heli.group.position, 0.45)
        fov = 58
      } else if (cam === 'wide' && step === 'chutes') {
        // 回収の飛行機から：横 260 m・少し上から、パラシュートと司令船を、下の雲と海を背に見る。
        // 回収船の甲板からの望遠は、あいだの雲（1〜2 km の高さ）が画面いっぱいに入って、灰色一色になった
        const toShip = _u.copy(w.ship.group.position).sub(c).setY(0).normalize()
        want.copy(c).addScaledVector(toShip, -260).add(_b.set(0, 70, 0))
        look.copy(c).add(_b.set(0, 14, 0))
        // 縦長の画面でも、パラシュート 3 つ（横 約 50 m）がおさまる広さ
        const d = want.distanceTo(look)
        fov = THREE.MathUtils.clamp((2 * Math.atan(48 / d / Math.min(1, camera.aspect)) * 180) / Math.PI, 12, 60)
        snap = true
      } else if (cam === 'wide') {
        // 着水のあと：回収のヘリコプターから（本物の着水の写真も、ヘリから撮ったもの）。司令船のうしろ遠くに回収船。
        // 甲板から 4.7 km 先の司令船を望遠で見ると、波にかくれて、空を映す海の灰色一色になった
        const toShip = _u.copy(w.ship.group.position).sub(c).setY(0).normalize()
        want.copy(c).addScaledVector(toShip, -48).add(_b.set(0, 17, 0))
        look.copy(c).add(_b.set(0, 5, 0))
        fov = 40
        snap = true
      } else if (step === 'chutes') {
        const lowK = 1 - THREE.MathUtils.smoothstep(h, 60, 400)
        want.copy(c).add(_b.set(46 - lowK * 18, -14 + lowK * 10, 60 - lowK * 22))
        look.copy(c).add(_b.set(0, ret.mainAt >= 0 ? 22 - lowK * 14 : 6, 0))
        fov = 55
      } else {
        // 少し高い所から：波の面が見える角度（低すぎると海が空の映りこみ一色になる）
        want.copy(c).add(_b.set(18, 8, 28))
        look.copy(c).add(_b.set(0, 0.5, 0))
        fov = 45
      }
      want.y = Math.max(want.y, water + 1.6)
    }
    // 縦長の画面：縦の画角を広げて、ほぼ正方形の画面と同じ横の広さにする（海の「遠くから」は自分で広さを決めている）
    if (cam !== 'window' && tall && !(sea && cam === 'wide')) {
      const k = Math.min(1.9, 0.9 / camera.aspect)
      fov = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * k) * 180) / Math.PI
    }
    // ホイール・2 本指で宇宙船に寄る（うしろからのカメラのとき）
    if (cam === 'chase') applyCraftZoom(want, look, c, 5)
    const key = `${cam}-${lunar ? 'moon' : sea ? 'sea' : step === 'coast' || step === 'cmSep' ? 'space' : 'air'}`
    if (!rig.init || snap || rig.key !== key) {
      rig.pos.copy(want)
      rig.look.copy(look)
      rig.init = true
      rig.key = key
    } else {
      const k = 1 - Math.exp(-dt * 3)
      rig.pos.lerp(want, k)
      rig.look.lerp(look, k)
    }
    camera.position.copy(rig.pos)
    camera.up.copy(up ?? Y)
    camera.lookAt(rig.look)
    camera.near = near
    if (Math.abs(camera.fov - fov) > 0.01) camera.fov += (fov - camera.fov) * (snap ? 1 : Math.min(1, dt * 3))
    camera.updateProjectionMatrix()
  })

  return (
    <>
      {stars && <primitive object={stars} />}
      <primitive object={w.sunSprite} />
      <primitive object={w.nozzle} />
      <primitive object={w.sky} />
      <primitive object={w.moonG} />
      <primitive object={w.earthG} />
      <primitive object={w.ocean} />
      <primitive object={w.ship.group} />
      <primitive object={w.recovery} />
      <primitive object={craft.lm} />
      <primitive object={craft.csm} />
      <primitive object={w.fire.group} />
      <primitive object={w.glowMat} />
      <primitive object={w.fireGlow} />
      <primitive object={w.winPlasma.mesh} />
      {w.mains.map((c, i) => (
        <primitive key={`m${i}`} object={c.group} />
      ))}
      {w.drogues.map((c, i) => (
        <primitive key={`d${i}`} object={c.group} />
      ))}
      <primitive object={w.spray} />
    </>
  )
}

export function ReturnWorld() {
  return (
    <>
      <Lights />
      <Scene />
    </>
  )
}

/**
 * 帰り道のカメラを 7 秒ごとに切りかえる（8 秒ルール：同じ絵が長く続かないように）。
 * 場面がかわったら、うしろから（その場面のいちばんわかりやすい絵）。自分でカメラを選んだら（camLocked）、切りかえない
 */
const RETURN_CUTS: Partial<Record<ReturnStep, MissionCam[]>> = {
  rdv: ['chase', 'window', 'wide'],
  docked: ['chase', 'window', 'wide'],
  lmGone: ['chase', 'wide', 'window'],
  teiWait: ['chase', 'wide'],
  tei: ['chase', 'wide', 'window'],
  coast: ['chase', 'wide', 'window'],
  cmSep: ['chase', 'wide'],
  corridor: ['chase', 'wide', 'window'],
  entry: ['chase', 'window', 'wide'],
  chutes: ['chase', 'window', 'wide'],
  splash: ['chase', 'wide'],
  recovery: ['wide', 'chase', 'window'],
  end: ['chase', 'wide'],
}
const rcuts = { t: 0, i: 0, step: '' as string }
function returnCuts(step: ReturnStep, dt: number) {
  const ms = useMoonMission.getState()
  const list = RETURN_CUTS[step]
  if (step !== rcuts.step) {
    rcuts.step = step
    rcuts.t = 0
    rcuts.i = 0
    if (list && ms.phase === 'home') autoCam(list[0])
    return
  }
  if (!list || ms.camLocked || ms.phase !== 'home') return
  rcuts.t += dt
  if (rcuts.t < 7) return
  rcuts.t = 0
  rcuts.i = (rcuts.i + 1) % list.length
  autoCam(list[rcuts.i])
}

useGLTF.preload(APOLLO_URL)
