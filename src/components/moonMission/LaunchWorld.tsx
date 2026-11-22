import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { R_EARTH, PAD_LAT, OMEGA, STAGES, altitude } from '../../data/saturnAscent'
import { sim, tickMission, useMoonMission, autoCam, missionNow, showBeat, COUNT_FROM, TIMELAPSE } from '../../state/moonMission'
import { useExplorer } from '../../state/saturnExplorer'
import { musicTime } from '../../audio/missionMusic'
import { currentLevel, lowMemory } from '../../state/quality'
import { glowTexture, plumeGeometry, plumeMaterial } from './plume'
import { Smoke } from './smoke'
import { buildSite, GROUND_Y, LAND_Y } from './launchSite'
import { buildFloodlights } from './launchLights'
import { buildSky } from './launchSky'
import { launchSmoke } from './launchFx'
import { encodeOutput } from './shaderOut'
import { missionLook } from './MissionPost'
import { frostRocket, frostUniform } from './frost'
import { buildCutaway, CUT_ALL, SATURN_PARTS } from './saturnCutaway'
import { liveSky, skyNow } from './launchClock'
import { bindOrbit, explorerCamera, resetOrbit } from './explorerCam'
import { SaturnHotspots, SizeFigure } from './SaturnHotspots'
import { atmosphereMaterial, earthMaterial } from './earth'
import { ROCKET_SURFACE, s4bAft, skinParts } from './rocketSkin'
import { buildCabin, CABIN_EYE, CABIN_LOOK, CABIN_Y, CM_WIN_DIR, CM_WIN_EYE } from './cmCabin'
import { CARD_SEC } from './AscentCards'
import { FILM_CUTS, FILM_END, filmCut, filmForce, filmRig, filmShake } from './launchFilm'

// 打ち上げの場面の 3D：（観察パートの夕方の発射台 →）夜の発射台（移動発射台・発射塔・照明・海）、サターンV、炎と煙、地球、月、星。
//
// 座標：ロケットをいつも原点に置く（遠くまで行っても数字が大きくならない）。
// three の x が東、y が打ち上げの瞬間の上、z が南。物理（data/saturnAscent）の (x: 上, y: 東) は three の (y, x) になる。
// 地上の物（発射台・地面・煙・照明）は「地面の組」に入れて、地球の自転と一緒に回す。

const base = import.meta.env.BASE_URL
const ROCKET_URL = `${base}models/saturn.glb`
const PAD_URL = `${base}models/launchpad.glb`
/** 発射台の地面の組の回る速さ（rad/s）：打ち上げの面の中での地球の自転 */
const SPIN = OMEGA * Math.cos((PAD_LAT * Math.PI) / 180)
/** 打ち上げの瞬間に地球の反対側にある太陽の向き（three の座標）。軌道に入って 20 分ほどで日の出になる向き */
const SUN = new THREE.Vector3(-0.5, -0.866, 0.16).normalize()
/** 月の向きと距離（月へ向かう燃焼の先の、遠い所の向きに置く） */
const MOON_DIST = 384_400_000
const MOON_R = 1_737_400

/** 発射場（北緯 28.6°・西経 80.6°）を上に、東を +x、北を -z に向ける地球の向き */
function padQuaternion() {
  const lat = (PAD_LAT * Math.PI) / 180
  const lon = (-80.6 * Math.PI) / 180
  const p = new THREE.Vector3(Math.cos(lon) * Math.cos(lat), Math.sin(lat), -Math.sin(lon) * Math.cos(lat))
  const east = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon))
  const north = new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon))
  const south = north.clone().negate()
  const m = new THREE.Matrix4().makeBasis(east, p, south).transpose()
  return new THREE.Quaternion().setFromRotationMatrix(m)
}

/** 物理の点（上, 東）を、ロケットからの three の位置へ */
function toWorld(sx: number, sy: number, out: THREE.Vector3) {
  return out.set(sy - sim.a.y, sx - sim.a.x, 0)
}

const _v = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
/** 最後に投影行列を作ったときの near */
let pcNear = 0.3
const _q = new THREE.Quaternion()
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)
const _c1 = new THREE.Color()

/** ロケットの局所の向き：上（地球の中心から）・東・機首 */
function frame() {
  const r = Math.hypot(sim.a.x, sim.a.y)
  const up = new THREE.Vector3(sim.a.y / r, sim.a.x / r, 0)
  const east = new THREE.Vector3(sim.a.x / r, -sim.a.y / r, 0)
  const th = (sim.pitch * Math.PI) / 180
  const nose = up.clone().multiplyScalar(Math.cos(th)).addScaledVector(east, Math.sin(th))
  return { up, east, nose }
}

type Debris = { name: string; obj: THREE.Object3D; x: number; y: number; vx: number; vy: number; t0: number; spin: THREE.Vector3; push: number; dir: THREE.Vector3 }

/** 上昇の後半の、自動のカメラの切り替え（横・エンジンの横・司令船の中・前から・遠くから）。
 *  夜の打ち上げなので、下の地球は暗い（高いところからの絵や窓の外は、ほぼまっ黒で使えなかった） */
type AscentShot = 'side' | 'tail' | 'cabin' | 'front' | 'far' | 'window' | 'flyby'
const ASCENT_SHOTS: AscentShot[] = ['side', 'tail', 'cabin', 'front', 'far']
/** 地球を回る・月へ向かう燃焼のあいだ：横・船長の窓（日の出の後だけ）・上を飛び越える・エンジンの横・遠くから */
const ORBIT_SHOTS: AscentShot[] = ['side', 'window', 'flyby', 'tail', 'far']
function ascentShot(s: { phase: string; cam: string; camLocked: boolean; auto: boolean }, stage: number, prop: number): AscentShot {
  const beat = showBeat()
  if (s.cam !== 'chase' || s.camLocked || beat === null) return 'side'
  const k = Math.floor((beat + CARD_SEC / 2) / CARD_SEC)
  // 地球を回るあいだは操縦がないので、おまかせでなくても切りかえる
  if (s.phase === 'orbit' || s.phase === 'tli') {
    if (filmForce.orbit) return filmForce.orbit as AscentShot
    const shot = ORBIT_SHOTS[k % ORBIT_SHOTS.length]
    // 日の出の前は、窓の外がまっ暗で何も見えない
    if (!sim.sunrise && shot === 'flyby') return 'side'
    return shot === 'window' && !sim.sunrise ? 'far' : shot
  }
  if (s.phase !== 'ascent' || !s.auto) return 'side'
  // 段を切り離す前後は、横から見せる
  if ((sim.sepAt.s2 > 0 && sim.a.t - sim.sepAt.s2 < 8) || (stage === 1 && prop < STAGES[1].prop * 0.04)) return 'side'
  return ASCENT_SHOTS[k % ASCENT_SHOTS.length]
}

/** 宇宙で機体に映りこむまわり：下は昼の地球（青白い）、地平線のかすみ、上はまっ黒な宇宙。下（-y）を地球へ向けて回して使う */
function spaceEnvironment(gl: THREE.WebGLRenderer) {
  const scene = new THREE.Scene()
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD;
      void main() {
        float y = vD.y;
        // 高さ 170 km から見ると、地平線は水平より約 13 度下
        float earth = smoothstep(-0.2, -0.24, y);
        vec3 ground = mix(vec3(0.30, 0.42, 0.58), vec3(0.18, 0.30, 0.48), smoothstep(-0.3, -1.0, y));
        float haze = exp(-pow((y + 0.21) / 0.035, 2.0));
        vec3 col = ground * earth + vec3(0.55, 0.7, 0.95) * haze * 0.8;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat))
  const pmrem = new THREE.PMREMGenerator(gl)
  const tex = pmrem.fromScene(scene, 0).texture
  pmrem.dispose()
  mat.dispose()
  return tex
}

export function LaunchWorld() {
  const rocket = useGLTF(ROCKET_URL)
  const padGltf = useGLTF(PAD_URL)
  const small = lowMemory()
  // 昼の地図：NASA Blue Marble Next Generation の 12 月（打ち上げと同じ季節。北半球は雪）。海は深い所を暗く、浅い所だけ明るく
  const big = !small && currentLevel() !== 'low'
  const [day, night, clouds, stars, moonTex, water] = useTexture([
    big ? `${base}textures/earth/bm_dec_8k.jpg` : `${base}textures/${small ? '2k' : '4k'}_earth_daymap.jpg`,
    // 夜の明かり：NASA Black Marble 2016（街の明かりだけを取り出したもの）
    big ? `${base}textures/earth/bm_night_8k.jpg` : `${base}textures/${small ? '2k' : '4k'}_earth_nightmap.jpg`,
    `${base}textures/${small ? '2k' : '4k'}_earth_clouds.jpg`,
    `${base}textures/milky_way_glow.jpg`,
    `${base}textures/2k_moon.jpg`,
    // 海と陸の境（Blue Marble から。海の照り返しに使う）
    `${base}textures/earth/bm_water_4k.png`,
  ])
  useMemo(() => {
    for (const t of [day, night, stars, moonTex]) t.colorSpace = THREE.SRGBColorSpace
    for (const t of [day, night, clouds]) t.anisotropy = 4
  }, [day, night, clouds, stars, moonTex])
  const { camera, size, gl, scene } = useThree()
  // 宇宙での映りこみ（地上では使わない）
  const spaceEnv = useMemo(() => spaceEnvironment(gl), [gl])
  useEffect(
    () => () => {
      if (scene.environment === spaceEnv) scene.environment = null
      spaceEnv.dispose()
    },
    [scene, spaceEnv],
  )
  // 夕方は遠くの陸と海が、地平線のもやにとける（夜と宇宙では濃さ 0）
  const fog = useMemo(() => new THREE.FogExp2('#000000', 0), [])
  useEffect(() => {
    const was = scene.fog
    scene.fog = fog
    return () => void (scene.fog = was)
  }, [scene, fog])
  // 観察パートの断面は、材質ごとの切り取り面を使う
  useEffect(() => {
    const was = gl.localClippingEnabled
    gl.localClippingEnabled = true
    return () => void (gl.localClippingEnabled = was)
  }, [gl])
  // 観察パートでは、画面をなぞってロケットのまわりを回る
  useEffect(() => bindOrbit(gl.domElement), [gl])

  // ---- 組み立て ----
  const parts = useMemo(() => {
    const root = rocket.scene.clone(true)
    const byName: Record<string, THREE.Object3D> = {}
    root.traverse((o) => {
      if (['S1', 'Ring', 'S2', 'S3', 'CSM', 'LES'].includes(o.name)) byName[o.name] = o
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (m && 'envMapIntensity' in m) m.envMapIntensity = 0.4
    })
    // 材質の照り：白い塗装は半つや（太陽の照りが出る）、黒い帯は艶消し、司令船の外は磨いた金属（junji 2026-11-22）
    const done = new Set<THREE.Material>()
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      for (const x of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const m = x as THREE.MeshStandardMaterial
        if (done.has(m) || !('roughness' in m)) continue
        done.add(m)
        const look = ROCKET_SURFACE[m.name]
        if (!look) continue
        m.roughness = look[0]
        m.metalness = look[1]
        m.needsUpdate = true
      }
    })
    // 第3段の下の広がった筒（第2段との段間部、高さ 66.9〜70 m）は、本物では第2段といっしょに離れる。
    // glb では第3段の一部なので、第3段からは消して、第2段に複製を付ける（離れたあと、中から J-2 エンジンが見える）
    const flare = byName.S3 && byName.S2 ? byName.S3.clone(true) : null
    if (flare) flare.name = 'S3Flare'
    // 発射台では、冷たいタンクの外に霜が付いている（frost.ts）
    const frost = frostRocket(['S1', 'S2'].map((n) => byName[n]).filter(Boolean))
    const frostS3 = frostRocket(byName.S3 ? [byName.S3] : [], [70, 1e9])
    const frostFlare = frostRocket(flare ? [flare] : [], [-1e9, 70])
    if (flare) byName.S2.add(flare)
    // 第3段のお尻（J-2 エンジン・梁・タンクの底）
    const aft = s4bAft()
    byName.S3?.add(aft.engine)
    // 司令船・機械船：外板の細かさ（磨いたアルミのテープの筋など）
    const skin = skinParts(['CSM', 'Ring'].map((n) => byName[n]).filter(Boolean))
    // 観察パートの断面（中のタンク・エンジン・着陸船）
    const cut = buildCutaway(root, new Set([...frost.made, ...frostS3.made, ...frostFlare.made, ...skin.made]))
    return {
      root,
      byName,
      cut,
      skin,
      aft,
      frost: { dispose: () => [frost, frostS3, frostFlare, aft].forEach((f) => f.dispose()) },
    }
  }, [rocket])
  useEffect(
    () => () => {
      parts.frost.dispose()
      parts.cut.dispose()
      parts.skin.dispose()
    },
    [parts],
  )
  /** 断面の開きぐあい（0〜1）と、閉じるあいだも使う高さの帯 */
  const cutState = useRef({ open: 0, band: CUT_ALL as [number, number] })
  const pad = useMemo(() => {
    const root = padGltf.scene.clone(true)
    // 甲板の灰色は、照明の真下で白く飛ばないよう、鋼の暗い灰色にする（読み込んだ素材は複製してから変える）
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => {
        // 穴の底の板と押さえの腕：炎の明かりで白く飛ばないよう、光を受けない黒に
        if (x.name === 'Dark') return new THREE.MeshBasicMaterial({ color: '#060606' })
        if (x.name !== 'Grey') return x
        const c = (x as THREE.MeshStandardMaterial).clone()
        c.color.multiplyScalar(0.4)
        c.roughness = 0.85
        return c
      })
      m.material = Array.isArray(m.material) ? mats : mats[0]
    })
    // 動く部品：塔の腕（Arm1〜Arm9）と、ロケットの押さえの腕（Hold1〜Hold4）。原点が回る軸
    const arms: THREE.Object3D[] = []
    const holds: { obj: THREE.Object3D; axis: THREE.Vector3 }[] = []
    root.traverse((o) => {
      if (/^Arm\d$/.test(o.name)) arms[Number(o.name[3]) - 1] = o
      if (/^Hold\d$/.test(o.name)) holds.push({ obj: o, axis: new THREE.Vector3(o.position.x, 0, o.position.z).normalize().cross(Y).negate() })
    })
    return { root, arms, holds }
  }, [padGltf])

  const plumes = useMemo(() => {
    const geo = plumeGeometry()
    // 打ち上げの世界の自前のシェーダーは、後処理のあるなしで明るさがそろうように仕上げる（shaderOut.ts）
    // 本物の夜の写真では、炎はほとんど白く（芯はわずかに青白く）、ふちだけ淡い黄色
    const f1 = encodeOutput(plumeMaterial({ core: '#ffffff', edge: '#ffe2b0', soft: 0.9 }))
    // 本物の上昇の写真（as17-534）：根元は白から少し青白く、先は黄色からオレンジへ
    const big = encodeOutput(plumeMaterial({ core: '#f3f2ff', edge: '#ffd596', soft: 1.2 }))
    // 本物の J-2 の炎はほとんど透明。見ごたえのために、青白くはっきり見えるように誇張する（junji 2026-11-22「地味な時間が続く」）
    const j2 = encodeOutput(plumeMaterial({ core: '#f2f4ff', edge: '#9aa6ff', soft: 1.3 }))
    // 炎の先へ長く伸びる、うっすら光る噴射の筋
    const j2Trail = encodeOutput(plumeMaterial({ core: '#c9d2ff', edge: '#5560c8', soft: 2.2 }))
    const les = encodeOutput(plumeMaterial({ core: '#fff0c0', edge: '#ff8a30', soft: 1.0 }))
    return { geo, f1, big, j2, j2Trail, les }
  }, [])
  const cabin = useMemo(() => buildCabin(), [])
  useEffect(() => () => cabin.dispose(), [cabin])
  const smoke = useMemo(() => {
    const sm = new Smoke(small ? 900 : 2800, GROUND_Y + 1)
    encodeOutput(sm.material)
    sm.points.renderOrder = 1
    return sm
  }, [small])
  useEffect(() => () => smoke.dispose(), [smoke])

  // 大気は光の散乱を計算する（宇宙から見た地平線の層・かすみ・日の出の色）
  // 画質が軽いときは、視線の上の点を減らす（地球が画面いっぱいになると、画素ごとの計算が重い）
  const steps = small || currentLevel() === 'low' ? 8 : currentLevel() === 'medium' ? 12 : 16
  const earthMat = useMemo(() => encodeOutput(earthMaterial(day, night, clouds, { scatter: true, steps, water })), [day, night, clouds, steps, water])
  const atmoMat = useMemo(() => encodeOutput(atmosphereMaterial({ scatter: true, steps })), [steps])
  const padQ = useMemo(() => padQuaternion(), [])

  // 発射台のまわりの土地・投光器・空（作業ごとに別のファイル）
  const site = useMemo(() => buildSite(small), [small])
  useEffect(() => () => site.dispose(), [site])
  const lights = useMemo(() => buildFloodlights(), [])
  useEffect(() => () => lights.dispose(), [lights])
  const sky = useMemo(() => buildSky(stars, moonTex), [stars, moonTex])
  useEffect(() => () => sky.dispose(), [sky])

  const ground = useRef<THREE.Group>(null)
  const rocketG = useRef<THREE.Group>(null)
  const earthM = useRef<THREE.Mesh>(null)
  const atmoM = useRef<THREE.Mesh>(null)
  const moonM = useRef<THREE.Mesh>(null)
  const f1 = useRef<THREE.Group>(null)
  const bigPlume = useRef<THREE.Mesh>(null)
  const j2s = useRef<THREE.Group>(null)
  const j3 = useRef<THREE.Mesh>(null)
  const lesFlame = useRef<THREE.Mesh>(null)
  const flameLight = useRef<THREE.PointLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const camLight = useRef<THREE.PointLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const daySun = useRef<THREE.DirectionalLight>(null)
  const workLight = useRef<THREE.PointLight>(null)
  const towerFill = useRef<THREE.PointLight>(null)
  const j2Trail = useRef<THREE.Mesh>(null)
  // 第2段・第3段のエンジンの口の白い輝き
  const nozzleGlow = useMemo(() => {
    const m = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(0.78, 0.84, 1), depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0 })
    const sp = new THREE.Sprite(m)
    sp.visible = false
    return sp
  }, [])
  useEffect(() => () => nozzleGlow.material.dispose(), [nozzleGlow])
  // 炎と、炎に照らされた煙の光：真下の点の明かりだけでは、まっすぐ立った機体の側面はほとんど照らされないので、
  // カメラの側の斜め下（炎のかたまりと光る煙のあたり）からも照らす（少し誇張。junji 2026-11-22「機体を明るく」）
  const plumeFill = useRef<THREE.PointLight>(null)
  // 切り離しの光：夜の打ち上げなので、離れていく第1段を照らすのは、逆噴射ロケットと第2段の炎の光だけ
  const sepLight = useRef<THREE.PointLight>(null)
  // 炎に照らされた空気の光：大気の中では、炎のまわりの空が黄色っぽく明るく光る（写真では画面じゅうがほんのり黄色い）
  const halo = useMemo(() => {
    const m = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1, 0.82, 0.48), depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0 })
    const sp = new THREE.Sprite(m)
    sp.renderOrder = 3
    return sp
  }, [])
  // 光のにじみの絵は共有なので、素材だけ捨てる
  useEffect(() => () => halo.material.dispose(), [halo])
  // 第1段の切り離し（T+2:41）：5 つの F-1 が止まると、残りの燃えるガスが大きな光の雲になってふくらみ、
  // 第1段の 8 本の逆噴射ロケットが一瞬光る。第2段の J-2 はゆっくり（2 秒ほどで）点く
  const stageFx = useMemo(() => {
    const mk = (c: THREE.Color) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: c, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0 }))
      sp.visible = false
      sp.renderOrder = 5
      return sp
    }
    return { cloud: mk(new THREE.Color(1, 0.72, 0.4)), retro: mk(new THREE.Color(1, 0.9, 0.7)), t0: -1, s2At: -1 }
  }, [])
  useEffect(() => () => {
    stageFx.cloud.material.dispose()
    stageFx.retro.material.dispose()
  }, [stageFx])
  /** 水面に映すもの（毎フレーム書きかえる） */
  const waterSrc = useRef({
    lights: Array.from({ length: 4 }, () => ({ pos: new THREE.Vector3(), col: new THREE.Color() })),
    rocket: new THREE.Vector3(),
    rocketCol: new THREE.Color(),
  })
  /** 前のフレームの第1段の炎（水面に映す） */
  const s1Prev = useRef(0)
  const _mirrorCam = useMemo(() => new THREE.Vector3(), [])
  const debrisG = useRef<THREE.Group>(null)
  const debris = useRef<Debris[]>([])
  const ignite = useRef(0)
  const camState = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fov: 40, init: false, prevCam: '', prevShot: '' as AscentShot | '' })
  /** 映画のカメラ：いまのカット、秒読みを始めてからの秒（離昇の後は実際の秒で進める）、カットの始まり */
  const filmS = useRef({ idx: 0, f: 0, cutAt: 0 })

  // 打ち上げのたびに、切り離した段をもとにもどす
  const phase = useMoonMission((s) => s.phase)
  useEffect(() => {
    if (phase === 'observe') resetOrbit()
    if (phase !== 'pad' && phase !== 'observe') return
    for (const d of debris.current) {
      parts.byName[d.name] && parts.root.add(parts.byName[d.name])
      parts.byName[d.name] && parts.byName[d.name].position.set(0, 0, 0)
      parts.byName[d.name] && parts.byName[d.name].quaternion.identity()
    }
    debris.current = []
    stageFx.t0 = -1
    stageFx.s2At = -1
    for (const n of Object.keys(parts.byName)) parts.byName[n].visible = true
    camState.current.init = false
    filmS.current = { idx: 0, f: 0, cutAt: 0 }
    ignite.current = 0
  }, [phase, parts])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    tickMission(dt)
    const s = useMoonMission.getState()
    const ex = useExplorer.getState()
    const a = sim.a
    const t = state.clock.elapsedTime
    const h = altitude(a)
    const { up, east, nose } = frame()

    // ---- 切り離し（物理の出来事を読む） ----
    for (const e of sim.events) {
      const name = e === 'stage1Sep' ? 'S1' : e === 'interstage' ? 'Ring' : e === 'les' ? 'LES' : e === 'stage2Sep' ? 'S2' : null
      if (!name || !parts.byName[name] || !debrisG.current || !rocketG.current) continue
      const obj = parts.byName[name]
      debrisG.current.add(obj)
      obj.position.set(0, 0, 0)
      obj.quaternion.copy(rocketG.current.quaternion)
      const spin = new THREE.Vector3((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.08)
      // 脱出塔は自分のロケットで前へ飛び出し、段間部と段は後ろへ離れていく
      const push = name === 'LES' ? 30 : name === 'Ring' ? -3 : -5
      debris.current.push({ name, obj, x: a.x, y: a.y, vx: a.vx, vy: a.vy, t0: a.t, spin, push, dir: nose.clone() })
      if (name === 'S1') {
        stageFx.t0 = a.t
        ignite.current = 0
        if (!s.camLocked) autoCam('onboard')
      }
    }
    sim.events.length = 0
    // 切り離した物は、自分の速さで飛びながら、空気に止められて離れていく
    for (const d of debris.current) {
      const age = a.t - d.t0
      const r = Math.hypot(d.x, d.y)
      const g = 3.986004e14 / (r * r)
      const rho = r - R_EARTH < 120_000 ? 1.225 * Math.exp(-(r - R_EARTH) / 7200) : 0
      const sp = Math.hypot(d.vx, d.vy)
      const drag = rho * sp * 0.004
      const kick = age < (d.name === 'LES' ? 4 : 1.2) ? d.push : 0
      // 切り離したコマでは動かさない（機体の物理はこのコマの分もう進んでいるので、ここで進めると 1 コマ分だけ機体の前へ出てしまい、
      // 第1段が機体の 500 m 先に現れていた）
      const steps = age <= 0 ? 0 : Math.max(1, Math.ceil((dt * sim.warp) / 0.05))
      const hh = (dt * sim.warp) / steps
      for (let i = 0; i < steps; i++) {
        d.vx += (-g * (d.x / r) - drag * d.vx + kick * d.dir.y) * hh
        d.vy += (-g * (d.y / r) - drag * d.vy + kick * d.dir.x) * hh
        d.x += d.vx * hh
        d.y += d.vy * hh
      }
      toWorld(d.x, d.y, d.obj.position)
      _q.setFromAxisAngle(_v.copy(d.spin).normalize(), d.spin.length() * dt * sim.warp)
      d.obj.quaternion.premultiply(_q)
      // 見えるのはカメラから 60 km まで（前は打ち上げ場からの距離で決めていて、高さ 67 km の第1段の切り離しが見えなかった）
      d.obj.visible = d.obj.position.distanceTo(camera.position) < 60_000
    }

    // 切り離しの光：止まった第1段の上（段のつなぎ目）で、光の雲がふくらんで消えていく
    {
      const s1 = debris.current.find((d) => d.name === 'S1')
      const age = s1 ? a.t - stageFx.t0 : 1e9
      const { cloud, retro } = stageFx
      cloud.visible = !!s1 && age < 3
      retro.visible = !!s1 && age < 0.8
      if (s1 && cloud.visible) {
        const k = THREE.MathUtils.clamp(age / 3, 0, 1)
        // 光の雲は、離れていく第1段の向こう側（第1段の影が光の雲に浮かぶ）
        cloud.position.copy(s1.obj.position).addScaledVector(s1.dir, -15)
        cloud.scale.setScalar(90 + 420 * Math.sqrt(k))
        cloud.material.opacity = 0.6 * (1 - k) * (1 - k)
        retro.position.copy(s1.obj.position).addScaledVector(s1.dir, 42)
        retro.scale.setScalar(40 + 30 * age)
        retro.material.opacity = 1.2 * (1 - age / 0.8)
      }
    }

    // ---- ロケット ----
    if (rocketG.current) rocketG.current.quaternion.setFromUnitVectors(Y, nose)

    // ---- 地面の組（発射台・地面・煙）：地球と一緒に回る ----
    const spinAng = SPIN * a.t
    const padX = R_EARTH * Math.cos(spinAng)
    const padY = R_EARTH * Math.sin(spinAng)
    if (ground.current) {
      toWorld(padX, padY, ground.current.position)
      ground.current.rotation.set(0, 0, -spinAng)
      ground.current.visible = h < 250_000
    }
    // ---- 地球 ----
    if (earthM.current && atmoM.current) {
      toWorld(0, 0, earthM.current.position)
      earthM.current.quaternion.setFromAxisAngle(Z, -spinAng).multiply(padQ)
      // 地上の近くでは、地面の組を見せる（地球の粗い地図は少し下げて重ならないように）
      earthM.current.scale.setScalar(h < 3000 ? 0.9997 : 1)
      atmoM.current.position.copy(earthM.current.position)
      earthMat.uniforms.uSun.value.copy(SUN)
      earthMat.uniforms.uNear.value = THREE.MathUtils.clamp(1 - h / 60_000, 0, 1)
      earthMat.uniforms.uNear2.value = THREE.MathUtils.clamp(1 - h / 2_000_000, 0, 1)
      // 本物は高さ 100 km でも街の明かりがはっきり見える（フロリダ、キューバ、カリブの島々）
      earthMat.uniforms.uLights.value = THREE.MathUtils.smoothstep(h, 15_000, 250_000) * 0.85 + 0.15
      // 街の明かりの細かさ：上がってから、地球を回る高さまで（月へ向かって遠ざかると、地図のままで十分）
      earthMat.uniforms.uDetail.value = THREE.MathUtils.smoothstep(h, 8_000, 40_000) * (1 - THREE.MathUtils.smoothstep(h, 2_000_000, 6_000_000))
      earthMat.uniforms.uCenter.value.copy(earthM.current.position)
      earthMat.uniforms.uR.value = R_EARTH * earthM.current.scale.x
      atmoMat.uniforms.uSun.value.copy(SUN)
      atmoMat.uniforms.uCenter.value.copy(earthM.current.position)
      atmoMat.uniforms.uR.value = R_EARTH
      // 地上の近くは、発射台の空（launchSky）が受け持つ。上がるにつれて、散乱で描く空へ
      atmoMat.uniforms.uSky.value = THREE.MathUtils.smoothstep(h, 15_000, 45_000)
      // 大気光は、地上の空の明かりより上へ出てから（下では見上げても層の中で、ぼやけるだけ）
      atmoMat.uniforms.uGlow.value = THREE.MathUtils.smoothstep(h, 40_000, 110_000)
    }
    if (moonM.current) {
      // 月：月へ向かう燃焼の向きのずっと先（燃焼が終わったあとの道の遠い所の向き）
      const ang = Math.atan2(a.y, a.x) + Math.PI
      toWorld(Math.cos(ang) * MOON_DIST, Math.sin(ang) * MOON_DIST, moonM.current.position)
      moonM.current.visible = s.phase === 'outbound' || s.phase === 'tli'
    }
    // 空の時計：観察の夕方 → タイムラプス → 打ち上げの夜
    const observing = s.phase === 'observe' || s.phase === 'timelapse'
    const lapseU = s.phase === 'timelapse' ? THREE.MathUtils.clamp((missionNow() - s.since) / TIMELAPSE, 0, 1) : 0
    skyNow(s.phase, lapseU, liveSky)
    const sunY = liveSky.sun.y
    const dayK = THREE.MathUtils.smoothstep(sunY, -0.2, 0.06)
    const moonK = liveSky.moonLit * THREE.MathUtils.smoothstep(liveSky.moon.y, -0.02, 0.4)
    // 炎がまぶしくて露出が下がっているあいだは、星は写らない（本物の上昇の写真にも星は無い）
    sky.update(camera, up, h, t, liveSky, observing, THREE.MathUtils.clamp((1 - missionLook.exposure) / 0.6, 0, 1))
    fog.density = observing ? 1.5e-4 * (0.3 + 0.7 * dayK) : 0
    fog.color.set('#05070b').lerp(_c1.set('#767b8a'), dayK)
    site.setDusk(observing ? dayK : 0, liveSky.lights)
    // 水面に映るもの：投光器の列、点火の炎、照らされたロケット
    if (ground.current) {
      const ws = waterSrc.current
      lights.lamps.forEach((l, i) => {
        ws.lights[i].pos.copy(l.pos)
        ws.lights[i].col.setRGB(0.85, 0.9, 1).multiplyScalar(l.on)
      })
      const fl = ws.lights[lights.lamps.length]
      fl.pos.set(0, GROUND_Y - 2, 0)
      fl.col.setRGB(1, 0.86, 0.68).multiplyScalar(s1Prev.current * 700)
      ground.current.worldToLocal(ws.rocket.set(0, 0, 0))
      // 柱は地面から機首まで（点火のあとは、炎と照らされた煙もロケットの下に光る）
      const rocketTop = ws.rocket.y + 110
      if (s1Prev.current > 0) ws.rocket.y = Math.min(ws.rocket.y, GROUND_Y)
      // ロケットの柱：照明に照らされた白、夕日の色、点火のあとは炎と照らされた煙の明るい柱（写真では水面に白い光の帯）
      ws.rocketCol.setRGB(0.55, 0.58, 0.64).multiplyScalar(liveSky.lights).add(_c1.setRGB(0.95, 0.72, 0.5).multiplyScalar(observing ? dayK * 0.9 : 0)).add(_c1.setRGB(1, 0.93, 0.85).multiplyScalar(s1Prev.current * 1.6))
      site.water.update({ ground: ground.current, camera, t, sun: liveSky.sun, moon: liveSky.moon, moonLit: liveSky.moonLit, dusk: observing ? Math.max(dayK, 0.15) : 0.15, lights: ws.lights, rocket: ws.rocket, rocketH: rocketTop - ws.rocket.y, rocketCol: ws.rocketCol, domeShown: observing })
    }
    lights.setOn(liveSky.lights)
    // 日の出：太陽が地平線の上に出たとき
    if (!sim.sunrise && s.phase === 'orbit' && up.dot(SUN) > -0.06) {
      sim.sunrise = true
      useMoonMission.setState({ caption: { key: 'sunrise', at: missionNow() } })
    }

    // ---- 炎 ----
    const pressure = Math.exp(-h / 7200)
    const expand = THREE.MathUtils.clamp(1 - pressure, 0, 1)
    if (s.phase === 'pad' && s.ignitedAt !== null) ignite.current = THREE.MathUtils.clamp((s.ignitedAt - s.countdown) / (s.ignitedAt - 0.2), 0, 1)
    if (s.phase === 'ascent') ignite.current = 1
    const s1On = (s.phase === 'pad' ? ignite.current : 1) * (a.stage === 0 && a.thrust > 0 || (s.phase === 'pad' && ignite.current > 0) ? 1 : 0)
    // 水に映る炎：地上に近いあいだ（高く上がると、遠くの小さな光）
    s1Prev.current = s1On * THREE.MathUtils.clamp(1 - h / 3000, 0.05, 1)
    const centerOff = a.stage === 0 && a.t >= 135.5
    if (f1.current) {
      f1.current.visible = s1On > 0
      f1.current.children.forEach((c, i) => {
        c.visible = !(i === 0 && centerOff)
        c.scale.set(1.8, 9 + 30 * expand + Math.sin(t * 40 + i) * 0.6, 1.8)
      })
    }
    plumes.f1.uniforms.uTime.value = t
    // 本物の F-1 の炎は、夜の写真ではほとんど白く飛ぶほどまぶしい（露出を下げても白く残る明るさ）
    plumes.f1.uniforms.uPower.value = 4 * s1On
    plumes.f1.uniforms.uExpand.value = expand * 0.4
    if (bigPlume.current) {
      bigPlume.current.visible = s1On > 0
      const len = 105 + 200 * expand
      bigPlume.current.scale.set(6.5 + 4 * expand, len * (s.phase === 'pad' ? 0.25 + 0.75 * ignite.current : 1), 5.5 + 4 * expand)
      bigPlume.current.position.y = -2
    }
    {
      // 空気が濃いほど、炎の光は大きく広がって見える。地上の近くは煙が受け持つので、少し上がってから
      const thick = Math.exp(-h / 9000) * THREE.MathUtils.smoothstep(h, 150, 1500)
      halo.visible = s1On > 0 && thick > 0.01
      halo.position.set(0, -70, 0)
      halo.scale.setScalar(380 + 260 * (1 - thick))
      halo.material.opacity = 0.55 * thick * s1On
    }
    plumes.big.uniforms.uTime.value = t
    plumes.big.uniforms.uPower.value = (3 - 1.8 * expand) * s1On
    plumes.big.uniforms.uExpand.value = expand * 2.2
    const s2On = a.stage === 1 && a.thrust > 0
    if (s2On && stageFx.s2At < 0) stageFx.s2At = a.t
    // J-2 は 2 秒ほどかけて推力が上がる（本物の炎はほとんど透明。ここでは誇張して青白く見せる）
    const s2Ramp = s2On ? THREE.MathUtils.smoothstep(a.t - stageFx.s2At, 0, 2.2) : 0
    const s3On = a.stage === 2 && a.thrust > 0
    if (j2s.current) {
      j2s.current.visible = s2On
      j2s.current.children.forEach((c) => c.scale.set(1.1, 30 + 60 * expand, 1.1))
    }
    if (j3.current) {
      j3.current.visible = s3On
      j3.current.scale.set(1.15, 30 + 60 * expand, 1.15)
    }
    plumes.j2.uniforms.uTime.value = t
    const upperOn = a.stage === 1 ? s2Ramp : s3On ? 1 : 0
    plumes.j2.uniforms.uPower.value = 0.8 * upperOn
    plumes.j2Trail.uniforms.uTime.value = t
    plumes.j2Trail.uniforms.uPower.value = 0.2 * upperOn
    plumes.j2Trail.uniforms.uExpand.value = expand * 1.2
    {
      const base = a.stage === 1 ? 46.6 : 66.6
      const on = (s2On || s3On) && upperOn > 0
      if (j2Trail.current) {
        j2Trail.current.visible = on
        j2Trail.current.position.set(0, base, 0)
        const w = a.stage === 1 ? 5.5 : 2.2
        j2Trail.current.scale.set(w, 220, w)
      }
      nozzleGlow.visible = on
      nozzleGlow.position.set(0, base - 1.5, 0)
      nozzleGlow.scale.setScalar(a.stage === 1 ? 17 : 8)
      // 機体カメラのようにすぐ近くからだと画面いっぱいの白いかたまりになるので、近いほど弱く
      const near = THREE.MathUtils.clamp(_v3.copy(nozzleGlow.position).applyQuaternion(rocketG.current ? rocketG.current.quaternion : _q.identity()).distanceTo(camera.position) / 160, 0.12, 1)
      nozzleGlow.material.opacity = 0.75 * upperOn * near * (0.92 + 0.08 * Math.sin(t * 31))
    }
    if (sepLight.current) {
      const s1 = debris.current.find((d) => d.name === 'S1')
      const age = s1 ? a.t - stageFx.t0 : 1e9
      const near = s1 ? s1.obj.position.length() < 900 : false
      // はじめの 1 秒は逆噴射（第1段の上、段のすき間）、そのあとは第2段のエンジンの下の、うすい炎の光
      const retro = Math.max(0, 1 - age / 0.9)
      const glow = s2Ramp * (near ? 1 : 0)
      sepLight.current.intensity = near ? 1.2e4 * retro * retro + 4e3 * glow : 0
      if (s1) {
        if (retro > 0) sepLight.current.position.copy(s1.obj.position).addScaledVector(s1.dir, 46).add(_v3.set(0, 0, 8))
        else sepLight.current.position.copy(nose).multiplyScalar(36)
      }
      sepLight.current.color.setRGB(1, retro > 0 ? 0.82 : 0.86, retro > 0 ? 0.6 : 1)
    }
    plumes.j2.uniforms.uExpand.value = expand * 2.5
    if (lesFlame.current) {
      const les = debris.current.find((d) => d.name === 'LES')
      lesFlame.current.visible = !!les && a.t - les.t0 < 4
      if (les && lesFlame.current.visible) {
        lesFlame.current.position.copy(les.obj.position).addScaledVector(les.dir, 104.6)
        lesFlame.current.quaternion.setFromUnitVectors(Y, les.dir)
        lesFlame.current.scale.set(0.9, 14, 0.9)
      }
    }
    plumes.les.uniforms.uTime.value = t
    plumes.les.uniforms.uPower.value = 1.4
    if (flameLight.current) {
      flameLight.current.intensity = (s1On > 0 ? 1.0e6 * (0.85 + 0.15 * Math.sin(t * 37)) : 0) * (0.25 + 0.75 * ignite.current)
      // 地上にいるあいだは、炎は溝の中を南北へ流れるので、明かりを低く置く（甲板の穴の壁が白く飛ばないように）
      flameLight.current.position.set(0, h < 200 ? -25 - 30 * (1 - h / 200) : -25, 0)
    }
    if (plumeFill.current) {
      // カメラの向き（機体の軸に直角な成分）へ 45 m、炎の 30 m 下（ロケットの組の中なので、機体の座標で。機首 = +y）
      _v.copy(camera.position)
      if (rocketG.current) _v.applyQuaternion(_q.copy(rocketG.current.quaternion).invert())
      _v.y = 0
      if (_v.lengthSq() < 1) _v.set(0, 0, 1)
      _v.normalize()
      plumeFill.current.position.set(0, -30, 0).addScaledVector(_v, 45)
      // 空気の濃い所では光る煙が広く照らす。宇宙に近づくと炎だけになって弱まる
      const air = 0.45 + 0.55 * Math.exp(-h / 12_000)
      if (s1On > 0) {
        plumeFill.current.intensity = 3.2e5 * air * (0.9 + 0.1 * Math.sin(t * 23)) * (0.2 + 0.8 * ignite.current)
        plumeFill.current.color.set('#ffdcb0')
      } else if (upperOn > 0 && s.phase === 'ascent') {
        // 第2段・第3段：J-2 の青白い炎の根元が、機体の後ろの方だけを照らす（前は空の光だけで、全体が同じ灰色の模型のように見えた）
        const base = a.stage === 1 ? 46.6 : 66.6
        plumeFill.current.position.set(0, base - 16, 0).addScaledVector(_v, 26)
        plumeFill.current.intensity = (a.stage === 1 ? 2.6e4 : 1.2e4) * upperOn * (0.92 + 0.08 * Math.sin(t * 31))
        plumeFill.current.color.set('#d6dcff')
      } else plumeFill.current.intensity = 0
    }
    lights.group.visible = h < 20_000
    // 光の柱：点火の炎がまぶしいあいだは、目がくらんで薄く見える（作業5で露出と合わせる）
    lights.update(1 - 0.7 * (s1On > 0 ? ignite.current * THREE.MathUtils.clamp(1 - h / 3000, 0, 1) : 0), t)
    // 塔の腕：乗組員の通路（Arm9）は秒読みの 5 分前に退いている。第1段の腕（Arm1）は T-16.2 秒、
    // 残りは離昇の瞬間に、塔の西の角を軸に 90 度回って塔の面に退く（およそ 5 秒）。押さえの腕は離昇で外へ倒れて開く
    {
      const sinceLift = observing ? -1e3 : s.phase === 'pad' ? -s.countdown : a.t
      const ease = (x: number) => {
        const k = THREE.MathUtils.clamp(x, 0, 1)
        return k * k * (3 - 2 * k)
      }
      pad.arms.forEach((arm, i) => {
        if (!arm) return
        const k = i === 8 ? liveSky.crewArm : i === 0 ? ease((sinceLift + 16.2) / 5) : ease(sinceLift / 5)
        arm.rotation.y = (Math.PI / 2) * k
      })
      const open = ease(sinceLift / 0.6)
      for (const hd of pad.holds) hd.obj.quaternion.setFromAxisAngle(hd.axis, open * 0.5)
    }
    // 霜：離昇の揺れと風で、上がるにつれてはがれ落ちる
    frostUniform.value = THREE.MathUtils.clamp(1 - h / 2500, 0, 1) * liveSky.frost
    // 炎のまぶしさ（露出を下げる量。カメラが決まったあとで使う）
    const glare = s1On > 0 ? ignite.current * (1 - THREE.MathUtils.smoothstep(h, 4000, 30_000)) : 0
    // 溝の炎：点火から離昇のすぐ後まで（ロケットが高く上がると、溝にはもう届かない）
    site.update(s1On > 0 ? ignite.current * THREE.MathUtils.clamp(1 - h / 150, 0, 1) : 0, t)
    // 夜の宇宙（第1段を捨てた後の上昇）：空の光を弱めて、炎の照り返しで形が見えるように
    const nightSpace = s.phase === 'ascent' && a.stage >= 1 ? 0.42 : 1
    if (fill.current) {
      // 南の上から（three の z が南）。地球の向こうから照らさないよう、いつも局所の上寄り
      fill.current.position.copy(up).multiplyScalar(0.8).add(_v.set(0, 0, 0.6)).multiplyScalar(1000)
      // 地上の近くは本当の暗闇（ロケットは投光器だけで浮かぶ）。高く上がると、星明かり代わりの弱い光
      fill.current.intensity = THREE.MathUtils.lerp(0.06, 0.9, THREE.MathUtils.smoothstep(h, 3000, 20_000)) * nightSpace + 0.35 * moonK
    }
    if (workLight.current) {
      // エンジンを見るときだけ、甲板の作業灯（夕方の甲板の下は暗い）
      const want = s.phase === 'observe' && ex.part === 'f1' ? 160 : 0
      workLight.current.intensity += (want - workLight.current.intensity) * Math.min(1, dt * 3)
      _v3.set(camera.position.x, 0, camera.position.z).normalize()
      workLight.current.position.set(_v3.x * 11, 2.5, _v3.z * 11)
    }
    if (daySun.current) {
      // 低い夕日：地平線に近いほど赤く、沈むと消える
      daySun.current.position.copy(liveSky.sun).multiplyScalar(1000)
      daySun.current.intensity = observing ? 3.4 * THREE.MathUtils.smoothstep(sunY, -0.012, 0.05) : 0
      daySun.current.color.setRGB(1, 0.56 + 0.3 * THREE.MathUtils.smoothstep(sunY, 0, 0.2), 0.3 + 0.45 * THREE.MathUtils.smoothstep(sunY, 0, 0.2))
    }
    if (camLight.current) {
      // 機体カメラの見る先（切り離した段）を、少しだけ照らす。段のつなぎ目の横から、弱く（強いと第2段の尾が白く飛ぶ）
      // 機体カメラの横の小さな灯り（夜なので、これがないと機体が見えない）。第2段のカメラでは近いので弱く
      const onS2 = a.stage < 2
      camLight.current.intensity = s.cam === 'onboard' ? (onS2 ? 5e2 : 2.5e3) : 0
      camLight.current.position.copy(nose).multiplyScalar(onS2 ? 30 : 36).add(_v.set(0, 0, onS2 ? 12 : 14))
    }

    // ---- 煙 ----
    if (ground.current) launchSmoke({ smoke, ground: ground.current, nose, east, h, s1On, ignite: ignite.current, onPad: s.phase === 'pad', dt })
    smoke.update(dt * Math.min(sim.warp, 3))
    smoke.material.uniforms.uPx.value = size.height / (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360))

    // ---- カメラ ----
    // 自動の切り替え：高く上がったら横から、切り離しの映像の後は横にもどす
    if (s.phase === 'ascent' && !s.camLocked) {
      if (s.cam === 'pad' && h > 4500) autoCam('chase')
      if (s.cam === 'onboard' && sim.sepAt.s1 > 0 && a.t - sim.sepAt.s1 > 14) autoCam('chase')
    }
    if ((s.phase === 'orbit' || s.phase === 'tli' || s.phase === 'outbound') && (s.cam === 'pad' || s.cam === 'film')) autoCam('chase')
    const cs = camState.current
    const want = _v
    const look = _v2
    let fov = 50
    const south = new THREE.Vector3().crossVectors(east, up)
    // 映画の時計：秒読みのあいだは秒読みから、離昇の後は実際の秒（早送りに引っぱられない）
    const fs = filmS.current
    if (s.phase === 'pad') fs.f = COUNT_FROM - s.countdown
    else if (s.phase === 'ascent') fs.f = Math.max(fs.f, COUNT_FROM) + dt
    // 曲の秒：流れていれば本当の位置、なければ点火からの秒
    const ignF = s.ignitedAt === null ? null : COUNT_FROM - s.ignitedAt
    const sinceIgn = ignF === null ? null : fs.f - ignF
    const mt = sinceIgn === null ? null : musicTime('jupiterOpening') ?? sinceIgn
    let filmShakeAng = 0
    let inside = false
    let shotName = ''
    // 決まった道を動くカメラ（遅れて追わない）
    let snapCam = false
    // 映画は曲の最初の区切りまで（途中から飛ばして来たときも、高く上がっていたら横からに）
    if (s.cam === 'film' && s.phase === 'ascent' && !s.camLocked && ((mt ?? 0) > FILM_END || a.t > 60)) autoCam('chase')
    // 上昇の後半（おまかせのとき）：「うしろから」のカメラを、計器のカードと 4 秒ずらして 8 秒ごとに切りかえる
    const shot = ascentShot(s, a.stage, a.prop)
    if (shot !== cs.prevShot) cs.init = false
    cs.prevShot = shot
    if (observing) {
      fov = explorerCamera(dt, ex.part, lapseU > 0 ? THREE.MathUtils.smoothstep(lapseU, 0, 0.12) : 0, want, look)
      cs.up.set(0, 1, 0)
    } else if (s.cam === 'film' && ground.current) {
      const next = filmCut(fs.idx, fs.f, mt)
      if (next !== fs.idx) {
        fs.idx = next
        fs.cutAt = fs.f
        cs.init = false
      }
      const sn = filmForce.shot ?? FILM_CUTS[fs.idx].shot
      shotName = sn
      const rig = filmRig(sn, { ground: ground.current, rocket: rocketG.current!, nose, up, south, h, u: fs.f - fs.cutAt, groundY: GROUND_Y }, want, look, cs.up)
      fov = rig.fov
      // 揺れは、地上のカメラには音の速さで遅れて届く
      ground.current.getWorldPosition(_v3)
      const dist = rig.onGround ? want.distanceTo(_v3) : 0
      filmShakeAng = filmShake(sinceIgn, dist, h) * (rig.onGround ? 1 : 0.5)
      inside = !!rig.inside
      // 司令船の中は、機体ごと細かく震える（加速が強いほど）
      if (inside && sinceIgn !== null) filmShakeAng = 0.0035 * THREE.MathUtils.smoothstep(sinceIgn, 0, 6) * (a.accel / 9.8 + (h < 2000 ? 0.8 : 0))
    } else if (s.cam === 'pad' && ground.current) {
      // 1.2 km 先の見物の場所から、望遠で追いかける
      ground.current.localToWorld(want.set(-700, GROUND_Y + 30, 1050))
      look.copy(nose).multiplyScalar(52)
      const dist = want.distanceTo(look)
      // 地上にいるあいだは塔とロケット全体、上がったら機体を大きく追う
      const half = s.phase === 'pad' || h < 120 ? 78 : 70
      fov = THREE.MathUtils.clamp((2 * Math.atan(half / dist) * 180) / Math.PI, 0.5, 32)
      cs.up.copy(up)
    } else if (s.cam === 'onboard') {
      // 第2段（切り離しの後は第3段）の横に付けたカメラで、後ろを見下ろす（本物の分離の映像の向き）
      // 第2段に付いたカメラは、第2段を切り離すまでそのまま（前は第1段を切り離した瞬間に第3段へ跳んで、離れていく第1段が第2段の陰に隠れていた）
      const mount = a.stage < 2 ? 58 : 80
      want.copy(nose).multiplyScalar(mount).addScaledVector(south, 9)
      look.copy(nose).multiplyScalar(-90).addScaledVector(south, 16)
      fov = 62
      cs.up.copy(east)
    } else if ((s.cam === 'window' || shot === 'window') && s.phase !== 'ascent') {
      // 司令船の窓：先端の少し下から外を見る。地球を回るときは地平線、月へ向かうときはふりかえって小さくなる地球
      want.copy(nose).multiplyScalar(104).addScaledVector(south, 2.2)
      if (s.phase === 'outbound') {
        const toEarth = toWorld(0, 0, new THREE.Vector3()).sub(want).normalize()
        look.copy(want).add(toEarth)
        fov = 40
      } else if (rocketG.current) {
        // 地球を回るあいだ：司令船の中から、前の窓ごしに（窓の枠・内張りも見える）
        rocketG.current.localToWorld(want.copy(CM_WIN_EYE).setY(CM_WIN_EYE.y + CABIN_Y))
        _v3.copy(CM_WIN_DIR).applyQuaternion(rocketG.current.quaternion)
        look.copy(want).add(_v3)
        inside = true
        fov = 74
      }
      cs.up.copy(up)
    } else if (shot === 'flyby') {
      // 飛び越えるカメラ：機首の先の斜め下から近づき、第3段のすぐ上を越えて、うしろへ遠ざかる（junji 2026-11-22）
      // 日の当たる側を通る（影の側から見ると、白い機体がまっ黒になる）
      const beat = showBeat() ?? 0
      const u = filmForce.orbit ? filmForce.orbitU : ((((beat + CARD_SEC / 2) % CARD_SEC) + CARD_SEC) % CARD_SEC) / CARD_SEC
      const e = u * u * (3 - 2 * u) * 0.5 + u * 0.5
      const side = south.dot(SUN) >= 0 ? 1 : -1
      // 機首の先の斜め下（高さ -6 m・横 24 m）→ 第3段の真上近く（12 m・3 m）→ うしろの斜め上（36 m・18 m）を、なめらかに通る
      const along = THREE.MathUtils.lerp(150, 28, e)
      const bez = (a: number, m: number, b: number) => {
        const c = 2 * m - (a + b) / 2
        return (1 - e) * (1 - e) * a + 2 * e * (1 - e) * c + e * e * b
      }
      want.copy(nose).multiplyScalar(along).addScaledVector(up, bez(-6, 12, 36)).addScaledVector(south, side * bez(24, 3, 18))
      // 見るのは、カメラに近い機体の点の少し先（うしろへ遠ざかるときも、機体の上の面と宇宙船が見える）
      look.copy(nose).multiplyScalar(THREE.MathUtils.clamp(along - 12, 64, 100))
      const bump = Math.exp(-Math.pow((e - 0.5) / 0.2, 2))
      fov = THREE.MathUtils.lerp(46, 64, bump)
      cs.up.copy(up)
      snapCam = true
    } else if (shot === 'tail' || shot === 'front' || shot === 'far') {
      // エンジンの口の位置（機首の向きに、第2段は 46.6 m・第3段は 66.6 m。j2Trail と同じ）
      const base = a.stage < 2 ? 46.6 : 66.6
      if (shot === 'tail') {
        // エンジンの横、少し上から前を見る：青白い J-2 の炎と、その先へのびる機体
        want.copy(nose).multiplyScalar(base - 22).addScaledVector(south, 30).addScaledVector(up, 13)
        look.copy(nose).multiplyScalar(base + 28)
        fov = 62
      } else if (shot === 'front') {
        // 機首の前、斜め下から：こちらへ進んでくる機体と、うしろへのびる炎
        want.copy(nose).multiplyScalar(140).addScaledVector(south, 30).addScaledVector(up, -8)
        look.copy(nose).multiplyScalar(base + 10)
        fov = 50
      } else {
        // 遠くから：真空で大きく広がる炎の長さ
        want.copy(south).multiplyScalar(380).addScaledVector(nose, -30).addScaledVector(up, 24)
        look.copy(nose).multiplyScalar(base - 30)
        fov = 32
      }
      cs.up.copy(up)
    } else if (shot === 'cabin' && rocketG.current) {
      // 司令船の中：寝た姿勢の 3 人と計器盤（映画の始まりと同じ場所）
      rocketG.current.localToWorld(want.copy(CABIN_EYE).setY(CABIN_EYE.y + CABIN_Y))
      rocketG.current.localToWorld(look.copy(CABIN_LOOK).setY(CABIN_LOOK.y + CABIN_Y))
      cs.up.copy(nose)
      fov = 72
      inside = true
      // 第2段・第3段の燃焼はなめらか（本物の船内の映像でも、ほとんど揺れない）。ごく小さくふるえるだけ
      filmShakeAng = 0.0004 * (a.accel / 9.8)
    } else {
      // 横から：軌道では少し離れて、地球が下に見えるように
      const far = s.phase === 'ascent' ? 190 : s.phase === 'outbound' ? 260 : 230
      want.copy(south).multiplyScalar(far).addScaledVector(nose, s.phase === 'outbound' ? 120 : 30).addScaledVector(up, s.phase === 'ascent' ? -15 : 40)
      look.copy(nose).multiplyScalar(s.phase === 'ascent' ? 35 : 50)
      // 月へ向かうときは、ロケットの向こうに小さくなっていく地球をふりかえる
      if (s.phase === 'outbound') {
        const toEarth = toWorld(0, 0, new THREE.Vector3()).normalize()
        // 第3段と宇宙船のまん中（機首の向きに 88 m）を画面に入れ、その向こうに地球
        want.copy(nose).multiplyScalar(88).addScaledVector(toEarth, -150).addScaledVector(south, 55).addScaledVector(up, 25)
        look.copy(nose).multiplyScalar(88).addScaledVector(toEarth, 260)
      }
      fov = 50
      cs.up.copy(up)
    }
    // 映画のカメラから自動で切りかわるときは、すっと寄らずにカットでつなぐ（映画の最後のカメラは地上で、ロケットは何 km も先にいる）
    if (cs.prevCam === 'film' && s.cam !== 'film') cs.init = false
    cs.prevCam = s.cam
    if (!cs.init) {
      cs.pos.copy(want)
      cs.look.copy(look)
      cs.fov = fov
      cs.init = true
    }
    // 船内のカットは機体にくっついたカメラ（遅れて追うと、機首の向きが変わるたびに画面がゆっくり回る）
    const k = observing || inside || snapCam ? 1 : 1 - Math.exp(-dt * (s.cam === 'onboard' || s.cam === 'window' ? 20 : s.cam === 'film' ? 10 : 4))
    cs.pos.lerp(want, k)
    cs.look.lerp(look, k)
    cs.fov += (fov - cs.fov) * k
    // 揺れ：加速が強いほど、地上に近いほど
    // 船内のカットでは、横からのカメラの揺れ（0.25 m × G）をかけない。目の 1 m 先を見ているので、大きくぶれていた
    const shake = s.cam === 'film' || inside ? 0 : (s.phase === 'ascent' || (s.phase === 'pad' && ignite.current > 0) ? 1 : 0) * (s.cam === 'pad' ? 0.02 : 0.25) * (a.accel / 9.8 + (h < 2000 ? 1 : 0)) * (s.phase === 'pad' ? ignite.current : 1)
    camera.position.copy(cs.pos).add(_v.set(Math.sin(t * 53) * shake, Math.sin(t * 47 + 1) * shake, Math.sin(t * 59 + 2) * shake))
    camera.up.copy(cs.up)
    if (filmShakeAng > 0) {
      // 見る向きを、ふぞろいな速さで小さくゆらす（望遠でも近くでも、画面の上で同じくらいに見える）
      const d = cs.pos.distanceTo(cs.look) * filmShakeAng
      _v2.copy(cs.look).add(_v3.set((Math.sin(t * 31) + Math.sin(t * 17.3 + 2)) * d, (Math.sin(t * 27 + 1) + Math.sin(t * 13.7)) * d, (Math.sin(t * 23 + 3) + Math.sin(t * 19.1 + 1)) * d))
      camera.lookAt(_v2)
    } else camera.lookAt(cs.look)
    const pc = camera as THREE.PerspectiveCamera
    if (towerFill.current) {
      // 塔のカメラのカット：本物の写真では、機体は投光器と炎の照り返しで白く浮かぶ。カメラの下の方から機体を照らす
      towerFill.current.intensity = shotName === 'tower' ? 9e4 : 0
      towerFill.current.position.copy(cs.pos).addScaledVector(up, -35).addScaledVector(south, 6)
    }
    // 司令船の中にいるあいだは、外の明かり（炎・照明・空）を消して、計器盤の明かりだけにする
    cabin.show(inside)
    // 中にいるあいだは、司令船の外側（両面の殻）が窓の外をふさがないように隠す
    if (parts.byName.CSM) parts.byName.CSM.visible = !inside
    // 第3段の J-2 エンジンは、段間部（第2段といっしょ）が離れたあとだけ見える
    parts.aft.engine.visible = !!parts.byName.S2 && parts.byName.S2.parent !== parts.root
    if (inside) {
      if (flameLight.current) flameLight.current.intensity = 0
      if (plumeFill.current) plumeFill.current.intensity = 0
      if (fill.current) fill.current.intensity = 0
    }
    lights.setInside(inside)
    // 露出：点火すると炎がまぶしいので、カメラの露出が下がる（本物の夜の打ち上げの写真のように、まわりは暗く沈み、
    // 炎と、炎に照らされた煙だけが浮かぶ）。高く上がって炎が遠く小さくなると戻る。カメラの自動露出らしく、少し遅れて追う
    const wantExp = inside || observing ? 1 : THREE.MathUtils.lerp(1, 0.32, glare)
    missionLook.exposure += (wantExp - missionLook.exposure) * Math.min(1, dt * (wantExp < missionLook.exposure ? 2.5 : 0.8))
    if (hemi.current) {
      hemi.current.intensity = inside ? 0.05 : THREE.MathUtils.lerp(0.12, 1.1, THREE.MathUtils.smoothstep(h, 3000, 20_000)) * nightSpace + (observing ? 0.9 * dayK + 0.25 * moonK : 0)
      // 夕方の空の光は青く、地面の照り返しは夕日の色
      hemi.current.color.set('#5a6a8a').lerp(_c1.set('#9cb2d8'), observing ? dayK : 0)
      hemi.current.groundColor.set('#120c08').lerp(_c1.set('#4a3426'), observing ? dayK : 0)
    }
    // 宇宙：上は黒い宇宙、下は昼の地球。機体は下から地球の照り返しを受け、上は暗い。映りこみも同じ向き
    {
      const space = (s.phase === 'orbit' || s.phase === 'tli' || s.phase === 'outbound') && !inside
      // 地球の真上の昼の明るさ（地球から遠ざかると、地球は小さくなって照り返しも弱い）
      const earthDay = THREE.MathUtils.smoothstep(up.dot(SUN), -0.1, 0.35) * (1 - THREE.MathUtils.smoothstep(h, 2_000_000, 20_000_000))
      if (space) {
        scene.environment = spaceEnv
        scene.environmentIntensity = 0.15 + 0.85 * earthDay
        // 映りこみの下（-y）を地球へ。軌道は z = 0 の面の中なので、z 軸のまわりの回転だけでよい
        scene.environmentRotation.set(0, 0, Math.atan2(-up.x, up.y))
        // 地球の照り返しは映りこみ（scene.environment）が受け持つ。空の光は、影の側が真っ黒にならない程度だけ
        if (hemi.current) {
          hemi.current.position.copy(up)
          hemi.current.color.set('#03050a')
          hemi.current.groundColor.set('#5f7fa8')
          hemi.current.intensity = 0.06 + 0.2 * earthDay
        }
        if (fill.current) fill.current.intensity *= 0.15 + 0.85 * (1 - earthDay)
      } else if (scene.environment === spaceEnv) {
        scene.environment = null
        if (hemi.current) hemi.current.position.set(0, 1, 0)
      }
    }
    // 断面：選んだ部品の高さの帯か、全体を、カメラの側から開く
    {
      const p = SATURN_PARTS.find((x) => x.id === ex.part)
      const band = s.phase === 'observe' ? (p ? p.cut : ex.cutAll ? CUT_ALL : null) : null
      const c = cutState.current
      if (band && (band[0] !== c.band[0] || band[1] !== c.band[1])) {
        // 帯が変わったら、閉じてから開きなおす
        if (c.open < 0.05) c.band = band
      }
      const target = band && band[0] === c.band[0] && band[1] === c.band[1] ? 1 : 0
      c.open += (target - c.open) * Math.min(1, dt * (target ? 2.2 : 5))
      if (c.open < 0.002) c.open = 0
      parts.cut.set(_v3.copy(camera.position), c.band, c.open)
    }
    pc.near = inside ? 0.05 : 0.3
    if (Math.abs(pc.fov - cs.fov) > 0.01 || pc.near !== pcNear) {
      pcNear = pc.near
      pc.fov = cs.fov
      pc.updateProjectionMatrix()
    }
  })

  // 水面の鏡の絵（カメラを動かした後、画面を描く前）。煙・炎・ロケットが、波でゆがんで縦にのびて水に映る
  useFrame(() => {
    if (!ground.current) return
    camera.updateMatrixWorld()
    const near = ground.current.worldToLocal(_mirrorCam.copy(camera.position)).y < 30000
    site.water.renderMirror({ gl, scene, camera: camera as THREE.PerspectiveCamera, ground: ground.current, planeY: LAND_Y, on: near && currentLevel() !== 'low' && !small })
  })

  const sunlit = useMoonMission((s) => s.phase === 'orbit' || s.phase === 'tli' || s.phase === 'outbound')
  const observe = useMoonMission((s) => s.phase === 'observe')
  const showSize = useExplorer((s) => s.size)
  return (
    <>
      {/* 月の無い夜：ロケットの形がかすかに分かるくらいの、空からの光 */}
      <hemisphereLight ref={hemi} args={['#5a6a8a', '#120c08', 1.1]} />
      {/* 夜でも機体の形が読めるように、南の上から弱い青白い光（星明かり代わり） */}
      <directionalLight ref={fill} intensity={0.9} color="#9fb6e8" />
      <directionalLight position={SUN.clone().multiplyScalar(1000)} intensity={sunlit ? 2.2 : 0} />
      {/* 観察パートの夕日 */}
      <directionalLight ref={daySun} intensity={0} />
      {/* 星 */}
      <primitive object={sky.stars} />
      {/* 地球と大気 */}
      <mesh ref={earthM} material={earthMat}>
        <sphereGeometry args={[R_EARTH, small ? 96 : 192, small ? 48 : 96]} />
      </mesh>
      <mesh ref={atmoM} material={atmoMat}>
        <sphereGeometry args={[R_EARTH + 115_000, 96, 48]} />
      </mesh>
      <mesh ref={moonM} visible={false}>
        <sphereGeometry args={[MOON_R, 48, 24]} />
        <meshStandardMaterial color="#9a9890" roughness={1} />
      </mesh>
      {/* 地面の組 */}
      <group ref={ground}>
        <primitive object={pad.root} />
        <primitive object={site.group} />
        <primitive object={smoke.points} />
        <primitive object={lights.group} />
      </group>
      {/* ロケット */}
      <group ref={rocketG}>
        <primitive object={parts.root} />
        <primitive object={parts.cut.interior} />
        <primitive object={cabin.group} />
        {observe && <SaturnHotspots />}
        {observe && showSize && <SizeFigure />}
        <pointLight ref={flameLight} color="#ffc88e" intensity={0} distance={0} decay={2} />
        <pointLight ref={workLight} color="#ffe6c4" intensity={0} distance={0} decay={2} />
        <pointLight ref={towerFill} color="#fff1dc" intensity={0} distance={0} decay={2} />
        <pointLight ref={plumeFill} color="#ffdcb0" intensity={0} distance={0} decay={2} />
        <group ref={f1} position={[0, 0.2, 0]}>
          {[
            [0, 0],
            [2.157, 2.157],
            [-2.157, 2.157],
            [-2.157, -2.157],
            [2.157, -2.157],
          ].map(([x, z], i) => (
            <mesh key={i} geometry={plumes.geo} material={plumes.f1} position={[x, 0, z]} renderOrder={4} />
          ))}
        </group>
        {/* 炎は煙のあとに描く（煙よりずっと明るいので、煙の手前・中でも光って見える） */}
        <mesh ref={bigPlume} geometry={plumes.geo} material={plumes.big} renderOrder={4} />
        <primitive object={halo} />
        <group ref={j2s} position={[0, 46.6, 0]} visible={false}>
          {[
            [0, 0],
            [1.9, 1.9],
            [-1.9, 1.9],
            [-1.9, -1.9],
            [1.9, -1.9],
          ].map(([x, z], i) => (
            <mesh key={i} geometry={plumes.geo} material={plumes.j2} position={[x, 0, z]} />
          ))}
        </group>
        <mesh ref={j3} geometry={plumes.geo} material={plumes.j2} position={[0, 66.6, 0]} visible={false} />
        <mesh ref={j2Trail} geometry={plumes.geo} material={plumes.j2Trail} visible={false} />
        <primitive object={nozzleGlow} />
      </group>
      <mesh ref={lesFlame} geometry={plumes.geo} material={plumes.les} visible={false} />
      <group ref={debrisG} />
      <primitive object={stageFx.cloud} />
      <primitive object={stageFx.retro} />
      <pointLight ref={sepLight} intensity={0} distance={0} decay={2} />
      <pointLight ref={camLight} color="#cfdcff" intensity={0} distance={0} decay={2} />
    </>
  )
}

useGLTF.preload(ROCKET_URL)
useGLTF.preload(PAD_URL)
