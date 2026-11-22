import { useEffect, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { loadCatalog } from '../Sky'
import { currentLevel, lowMemory } from '../../state/quality'
import { useMoonMission } from '../../state/moonMission'
import { COAST_TIME, CMSEP_TIME, CORRIDOR_TIME, TEI_BURN, TEI_WARP, ret, tickReturn, useMoonReturn, type ReturnStep } from '../../state/moonReturn'
import { EARTH_MOON, coastDistance } from '../../data/apolloTimeline'
import { EI_ALT, RE } from '../../data/reentry'
import { earthMaterial, atmosphereMaterial } from './earth'
import { glowTexture, plumeGeometry, plumeMaterial } from './plume'
import { APOLLO_URL, DROGUE, useCraft } from './craft'
import { foamTexture, makeChute, makeClouds, makeShip, oceanMaterial, shapeChute, skyMaterial } from './returnSea'
import { makeFireball, updateFireball } from './returnPlasma'

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
const seaStep = (s: ReturnStep) => s === 'chutes' || s === 'splash' || s === 'end'

// ---- 光 -------------------------------------------------------------------------------------

/** いまの太陽の向き（場面ごとに Scene が書く） */
const sun = new THREE.Vector3().copy(SUN_MOON)

function Lights() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.22
    return () => {
      if (scene.environment === env) scene.environment = null
      env.dispose()
      pmrem.dispose()
      room.dispose()
    }
  }, [gl, scene])
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff6ea', 4.2)
    const t = new THREE.Object3D()
    l.target = t
    const hemi = new THREE.HemisphereLight('#06080c', '#2c3440', 0.3)
    return { l, t, hemi }
  }, [])
  useFrame(() => {
    light.t.position.copy(camera.position)
    light.t.updateMatrixWorld()
    light.l.position.copy(camera.position).addScaledVector(sun, 1000)
    // 海の上では、空からの青い光と海からの照り返し
    const sea = seaStep(useMoonReturn.getState().step)
    light.hemi.color.set(sea ? '#8fb4e0' : '#06080c')
    light.hemi.groundColor.set(sea ? '#1d3a52' : '#2c3440')
    light.hemi.intensity = sea ? 0.9 : 0.3
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
      new THREE.ShaderMaterial({
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
          }`,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
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

function Scene() {
  const craft = useCraft()
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const small = lowMemory()
  // 地球は打ち上げの場面と同じ：NASA Blue Marble の 12 月と Black Marble の夜の明かり、光の散乱で描く大気
  const big = !small && currentLevel() !== 'low'
  const steps = small || currentLevel() === 'low' ? 8 : currentLevel() === 'medium' ? 12 : 16
  const [moonTex, day, night, clouds, water] = useTexture([
    `${base}textures/4k_moon.jpg`,
    big ? `${base}textures/earth/bm_dec_8k.jpg` : `${base}textures/${small ? '2k' : '4k'}_earth_daymap.jpg`,
    big ? `${base}textures/earth/bm_night_8k.jpg` : `${base}textures/2k_earth_nightmap.jpg`,
    `${base}textures/${small ? '2k' : '4k'}_earth_clouds.jpg`,
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
    const earthMat = earthMaterial(day, night, clouds, { scatter: true, steps, water })
    earthMat.uniforms.uLights.value = 0.5
    earthMat.uniforms.uR.value = RE
    const atmo = atmosphereMaterial({ scatter: true, steps })
    atmo.uniforms.uR.value = RE
    const earthG = new THREE.Group()
    earthG.name = 'return-earth'
    const earth = new THREE.Mesh(new THREE.SphereGeometry(RE, 160, 100), earthMat)
    const air = new THREE.Mesh(new THREE.SphereGeometry(RE + 100_000, 96, 64), atmo)
    earthG.add(earth, air)
    const sky = new THREE.Mesh(new THREE.SphereGeometry(90_000, 48, 24), skyMaterial())
    sky.renderOrder = -2
    sky.frustumCulled = false
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(420_000, 420_000), oceanMaterial())
    ocean.rotation.x = -Math.PI / 2
    ocean.renderOrder = -1
    ocean.frustumCulled = false
    const cloud = makeClouds()
    const ship = makeShip()
    const mains = [makeChute('main'), makeChute('main'), makeChute('main')]
    const drogues = [makeChute('drogue'), makeChute('drogue')]
    const fire = makeFireball()
    const glowMat = new THREE.PointLight('#ff9a50', 0, 60, 1.2)
    const fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(2.4, 1.1, 0.55), depthWrite: false, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0 }))
    fireGlow.renderOrder = 8
    const nozzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(3, 1.9, 1.1), depthWrite: false, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending }))
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(7, 6.6, 6), depthWrite: false, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending }))
    const sps = plumeMaterial({ core: '#ffe2b8', edge: '#ff8a40', soft: 1.4 })
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
    const foamTex = foamTexture()
    const foamMat = new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, opacity: 0, depthWrite: false })
    const foam = new THREE.Mesh(new THREE.CircleGeometry(1, 40), foamMat)
    foam.rotation.x = -Math.PI / 2
    const owned: { dispose: () => void }[] = [moon.geometry, moonMat, earth.geometry, earthMat, air.geometry, atmo, sky.geometry, sky.material as THREE.Material, ocean.geometry, ocean.material as THREE.Material, cloud, ship, ...mains, ...drogues, fire, sunSprite.material, nozzle.material, fireGlow.material, sps, plumeGeo, sprayGeo, sprayMat, foam.geometry, foamMat, foamTex]
    return { fireGlow, nozzle, moonG, earthMat, atmo, earthG, sky, ocean, cloud, ship, mains, drogues, fire, glowMat, sunSprite, sps, plume, spray, sprayVel, foam, owned }
  }, [moonTex, day, night, clouds, water])
  useEffect(() => () => w.owned.forEach((o) => o.dispose()), [w])
  // 確かめる用（#debug のときだけ）
  useEffect(() => {
    if (!location.hash.includes('debug')) return
    const g = window as unknown as { __returnWorld?: unknown }
    g.__returnWorld = w
    return () => {
      delete g.__returnWorld
    }
  }, [w])

  // 模型：着陸船は上の段だけ。司令船の探り棒（Strut）、焦げる面（Ablator・CMSilver）
  const parts = useMemo(() => {
    for (const o of craft.lm.children) if (o.name !== 'LMAscent') o.visible = false
    const cm = craft.csm.getObjectByName('CM')!
    const sm = craft.csm.getObjectByName('SM')!
    const probe: THREE.Object3D[] = []
    const burn: { m: THREE.MeshStandardMaterial; from: THREE.Color; to: THREE.Color }[] = []
    cm.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const m = mesh.material as THREE.MeshStandardMaterial
      if (m.name === 'Strut') probe.push(mesh)
      // 本物の司令船は、帰ってくると茶色く焦げている
      if (m.name === 'Ablator') burn.push({ m, from: m.color.clone(), to: new THREE.Color('#1c1410') })
      if (m.name === 'CMSilver') burn.push({ m, from: m.color.clone(), to: new THREE.Color('#5a4535') })
    })
    return { cm, sm, probe, burn }
  }, [craft])
  useEffect(() => {
    // 次に開いたときのために、焦げを戻す
    return () => parts.burn.forEach((b) => b.m.color.copy(b.from))
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
      w.earthG.quaternion.copy(tmp.qe)
      w.earthMat.uniforms.uCenter.value.copy(w.earthG.position)
      w.atmo.uniforms.uCenter.value.copy(w.earthG.position)
      // 大気の中に入ったら、空は低い所の空（skyMaterial）にまかせる
      w.atmo.uniforms.uSky.value = THREE.MathUtils.smoothstep(h, 15_000, 45_000)
      sun.copy(SUN_E).applyQuaternion(tmp.qe)
      w.earthMat.uniforms.uSun.value.copy(sun)
      w.atmo.uniforms.uSun.value.copy(sun)
      w.earthMat.uniforms.uNear.value = THREE.MathUtils.clamp(1 - h / 80_000, 0, 1) * 0.6
      w.earthMat.uniforms.uNear2.value = THREE.MathUtils.clamp(1 - h / 3_000_000, 0, 1)
    } else if (lunar) sun.copy(SUN_MOON)
    else if (sea) {
      // 着水地点の空：東の高さ約 37°（朝 8 時半ごろ）
      earthOrient(_a.set(0, 1, 0), _b.set(0, 0, -1), tmp.qe)
      tmp.qe.premultiply(_q.setFromAxisAngle(X, P_EI.angleTo(P_SPLASH)))
      sun.copy(SUN_E).applyQuaternion(tmp.qe)
    }

    // ---- 空と海（低い所） ----
    const skyA = (1 - THREE.MathUtils.smoothstep(h, 22_000, 70_000)) * (inAir || sea ? 1 : 0)
    w.sky.visible = skyA > 0.001
    w.sky.position.copy(camera.position)
    const skyU = (w.sky.material as THREE.ShaderMaterial).uniforms
    skyU.uAlpha.value = skyA
    skyU.uHigh.value = THREE.MathUtils.smoothstep(h, 3_000, 45_000)
    skyU.uSun.value.copy(sun)
    const oceanA = (1 - THREE.MathUtils.smoothstep(h, 30_000, 50_000)) * (inAir || sea ? 1 : 0)
    w.ocean.visible = oceanA > 0.001
    const ou = (w.ocean.material as THREE.ShaderMaterial).uniforms
    ou.uAlpha.value = oceanA
    ou.uTime.value = time
    ou.uSun.value.copy(sun)
    ou.uOffset.value.set(0, -range)
    // 大気の中では、地球の球（角ばった面）より少し上に
    w.ocean.position.set(camera.position.x, -h + (inAir ? Math.min(2_000, h * 0.04) : 0), camera.position.z)
    w.cloud.group.visible = (inAir || sea) && h < 40_000
    w.cloud.group.position.set(0, -h, sea ? 0 : (((-range % 60_000) + 60_000) % 60_000) - 30_000)
    w.ship.group.visible = sea
    w.ship.group.position.set(-2_600, -h + 0.2, -3_900)
    w.ship.group.rotation.y = 0.9
    w.sunSprite.visible = !sea && skyA < 0.5
    w.sunSprite.position.copy(camera.position).addScaledVector(sun, 4e9)
    w.sunSprite.scale.setScalar(4e9 * 0.03)
    if (stars) {
      stars.position.copy(camera.position)
      stars.visible = skyA < 0.98
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
        const floatK = step === 'splash' || step === 'end' ? Math.min(1, ret.splashT / 2.5) : 0
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
      if (sea && (step === 'splash' || step === 'end')) csm.position.y += -0.5 + 0.25 * Math.sin(time * 1.1)
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
      w.fireGlow.scale.setScalar(9 + heat * 12)
      w.fireGlow.material.opacity = Math.min(1, heat * 1.2) * (0.8 + 0.2 * Math.sin(time * 23))
      // 焦げ
      for (const b of parts.burn) b.m.color.copy(b.from).lerp(b.to, ret.char * 0.85)
    }
    if (!inAir) {
      w.fire.group.visible = false
      w.fireGlow.visible = false
      w.glowMat.intensity = 0
    }
    if (lunar || step === 'coast' || step === 'cmSep') for (const b of parts.burn) b.m.color.copy(b.from)

    // ---- パラシュート ----
    const apex = _a.set(0, 0, 0).applyQuaternion(csm.quaternion).add(csm.position)
    const drogueOn = step === 'chutes' && ret.mainAt < 0
    w.drogues.forEach((c, i) => {
      c.group.visible = drogueOn
      if (!drogueOn) return
      const open = THREE.MathUtils.smoothstep(t, 0, 0.8) * (t < 2.5 ? 0.55 : 0.55 + 0.45 * THREE.MathUtils.smoothstep(t, 2.5, 3.3))
      shapeChute(c, open, Math.sin(time * 5 + i))
      c.group.position.copy(apex).add(_v.set(0, 1.5, 0))
      c.group.quaternion.setFromAxisAngle(_v.set(0, 0, 1), (i ? 1 : -1) * 0.16 + 0.05 * Math.sin(time * 2.1 + i))
      c.group.scale.setScalar(1.2)
    })
    const mainsOn = (step === 'chutes' && ret.mainAt >= 0) || step === 'splash' || step === 'end'
    w.mains.forEach((c, i) => {
      c.group.visible = mainsOn
      if (!mainsOn) return
      const since = step === 'chutes' ? t - ret.mainAt : 99
      // すぼめて開く（リーフィング）→ 広がる。本物は 1 つだけ数秒おくれて広がった
      const late = i === 2 ? 3 : 0
      let open = THREE.MathUtils.smoothstep(since, 0, 1.4) * 0.32
      open += 0.68 * THREE.MathUtils.smoothstep(since, 6 + late, 8 + late)
      shapeChute(c, open, Math.sin(time * 1.6 + i * 2))
      const az = (i / 3) * Math.PI * 2 + 0.4
      c.group.position.copy(apex).add(_v.set(0, 4, 0))
      c.group.quaternion.setFromAxisAngle(_v.set(Math.cos(az), 0, Math.sin(az)), 0.3 * open + 0.03 * Math.sin(time + i))
      c.group.scale.setScalar(1)
      c.lines.visible = true
      c.canopy.position.y = c.length
      if (step === 'splash' || step === 'end') {
        // 着水したら切り離す：風下（カメラの向こう）へ流れて、海にぺたんと広がる
        const dn = step === 'end' ? 1 : THREE.MathUtils.smootherstep(ret.splashT / 4, 0, 1)
        const spot = FALLEN[i]
        c.group.position.set(THREE.MathUtils.lerp(apex.x, spot[0], dn), THREE.MathUtils.lerp(apex.y + 4, -h + 0.3, dn), THREE.MathUtils.lerp(apex.z, spot[1], dn))
        c.group.quaternion.setFromAxisAngle(_v.set(Math.cos(az), 0, Math.sin(az)), (0.3 + dn * 1.25) * (1 - dn) + dn * 0.02)
        c.canopy.position.y = c.length * (1 - dn)
        c.canopy.scale.y = 1 - dn * 0.9
        c.lines.visible = dn < 0.25
      }
    })

    // ---- 着水のしぶき ----
    const splashing = step === 'splash' && ret.splashT < 4
    w.spray.visible = splashing
    w.foam.visible = step === 'splash' || step === 'end'
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
    if (w.foam.visible) {
      const ft = step === 'end' ? 10 : ret.splashT
      w.foam.position.set(0, -h + 0.05, 0)
      w.foam.scale.setScalar(4 + Math.min(ft, 8) * 1.2)
      ;(w.foam.material as THREE.MeshBasicMaterial).opacity = Math.max(0.25, 0.9 - ft * 0.07)
    }

    // ---- カメラ ----
    const cam = ms.cam
    const want = _v.set(0, 0, 0)
    const look = _w.set(0, 0, 0)
    let fov = 45
    let up: THREE.Vector3 | null = null
    let near = 0.3
    let snap = false
    const c = tmp.cmPos
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
        look.copy(c).add(_b.set(0, -25, 30))
        fov = 50
      } else {
        const span = Math.max(16, c.distanceTo(lmPos) + 12)
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
          look.set(0, -30, -80)
        }
        fov = 50
      } else if (step === 'cmSep') {
        want.set(15, 4, 18)
        look.set(0, -1, 3)
        fov = 46
      } else {
        if (step === 'coast') want.set(8, 4.5, 24)
        else want.set(17, 5, 15)
        look.set(0, step === 'coast' ? -0.5 : -2, -8)
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
        look.copy(c).addScaledVector(vel, -40)
        fov = 50
      } else {
        want.copy(c).addScaledVector(side, 12).addScaledVector(vel, -13).add(_b.set(0, 4.5, 0))
        look.copy(c).addScaledVector(vel, 5)
        fov = 50
      }
      // G と熱のゆれ
      const k = (e ? Math.min(1, e.g / 7) : 0) * 0.06 + ret.heat * 0.05
      want.x += (Math.random() - 0.5) * k
      want.y += (Math.random() - 0.5) * k
    } else {
      const water = -h
      const shipEye = _u.copy(w.ship.group.position).add(_b.set(0, 22, 0))
      if (cam === 'window') {
        // 窓から上を見る：パラシュート
        want.copy(WINDOW_EYE).applyQuaternion(csm.quaternion).add(csm.position)
        look.copy(c).add(_b.set(4, 40, 0))
        fov = 70
        near = 0.05
        snap = true
      } else if (cam === 'wide') {
        // 回収船の甲板から
        want.copy(shipEye)
        look.copy(c).add(_b.set(0, step === 'chutes' ? 18 : 2, 0))
        const d = want.distanceTo(look)
        fov = THREE.MathUtils.clamp((2 * Math.atan((step === 'chutes' ? 90 : 40) / d) * 180) / Math.PI, 5, 40)
        snap = rig.key !== 'wide-sea'
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
      <primitive object={w.cloud.group} />
      <primitive object={w.ship.group} />
      <primitive object={craft.lm} />
      <primitive object={craft.csm} />
      <primitive object={w.fire.group} />
      <primitive object={w.glowMat} />
      <primitive object={w.fireGlow} />
      {w.mains.map((c, i) => (
        <primitive key={`m${i}`} object={c.group} />
      ))}
      {w.drogues.map((c, i) => (
        <primitive key={`d${i}`} object={c.group} />
      ))}
      <primitive object={w.spray} />
      <primitive object={w.foam} />
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

useGLTF.preload(APOLLO_URL)
