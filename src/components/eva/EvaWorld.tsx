import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useTrimShadows } from '../../hooks/useTrimShadows'
import { Sky } from '../Sky'
import { haloTexture } from '../ship/ShipModel'
import { textureUrl } from '../../data/textures'
import { PLANETS } from '../../data/bodies'
import { useOptionalTexture } from '../../hooks/useOptionalTexture'
import { bodies } from '../../state/registry'
import { proximity } from '../../state/proximity'
import { ship } from '../../state/flight'
import { evaDebug } from '../../state/eva'
import { lowMemory, useQuality } from '../../state/quality'
import type { ShipSpec } from '../../data/ships'
import { uiEn } from '../../i18n'
import { AIRLOCK, HULL_HALF, HULL_R, evaSite, hullNormal, hullPoint } from './hull'
import { focus, hatchState } from './Tsumugi'
import { hullTextures } from './hullTex'
import { ArcadiaDeck, DockUnderside } from './EvaSites'
import { AirlockModule, EvaShip } from './EvaShip'
import { shipCol } from './shipCollider'

// 船外の場面のまわり：乗っている船の外壁（パネル・手すり・エアロック・船の名前・アンテナ・放熱板・窓）、
// 星空、太陽、そばの惑星。向きは宇宙の場面で船が向いていた向きのまま（船の座標で描く）。

const TILE = 8 // 外壁の模様 1 枚が何 m 四方か

/** 外壁の一部（円筒の面）。模様は TILE m ごとにくり返す */
function hullPatch(th0: number, th1: number, z0: number, z1: number, nTh: number, nZ: number, lift = 0, uvBox = false) {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let j = 0; j <= nZ; j++)
    for (let i = 0; i <= nTh; i++) {
      const th = th0 + ((th1 - th0) * i) / nTh
      const z = z0 + ((z1 - z0) * j) / nZ
      hullPoint(th, z, lift, p)
      hullNormal(th, n)
      pos.push(p.x, p.y, p.z)
      nor.push(n.x, n.y, n.z)
      if (uvBox) uv.push(j / nZ, i / nTh)
      else uv.push((th * HULL_R) / TILE, z / TILE)
    }
  const row = nTh + 1
  for (let j = 0; j < nZ; j++)
    for (let i = 0; i < nTh; i++) {
      const a = j * row + i
      // 外から見て表になる向き（反対だと外側の面が描かれず、向こう側の内側が透けて見える）
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** 船の名前（外壁に描いた大きな文字） */
function nameTexture(registry: string, name: string, color: string) {
  const cv = document.createElement('canvas')
  cv.width = 1024
  cv.height = 256
  const c = cv.getContext('2d')!
  c.fillStyle = color
  c.font = 'bold 150px "Helvetica Neue", Arial, sans-serif'
  c.textBaseline = 'middle'
  c.fillText(registry, 30, 110)
  c.font = 'bold 54px "Helvetica Neue", Arial, sans-serif'
  c.fillText(name, 36, 215)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// ---- 外壁 --------------------------------------------------------------------------

const GAP = AIRLOCK.size / 2 / HULL_R // エアロックの穴の幅（角度）
const TH = 0.78 * Math.PI // 描く範囲（真上から左右へ）

function Hull({ spec }: { spec: ShipSpec }) {
  const tex = useMemo(() => hullTextures(spec.swatch[0]), [spec])
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: 1.2, roughness: 0.6, metalness: 0.25 })
    return m
  }, [tex])
  const geos = useMemo(() => {
    const zs = AIRLOCK.size / 2
    const nZ = 120
    return [
      hullPatch(-TH, -GAP, -HULL_HALF, HULL_HALF, 90, nZ),
      hullPatch(GAP, TH, -HULL_HALF, HULL_HALF, 90, nZ),
      hullPatch(-GAP, GAP, -HULL_HALF, AIRLOCK.z - zs, 2, nZ / 2),
      hullPatch(-GAP, GAP, AIRLOCK.z + zs, HULL_HALF, 2, nZ / 2),
    ]
  }, [])
  // 前と後ろの端は、すぼまる円すいで閉じる
  const ends = useMemo(() => {
    const out: THREE.BufferGeometry[] = []
    for (const s of [-1, 1]) {
      const g = new THREE.CylinderGeometry(HULL_R * 0.45, HULL_R, 46, 96, 1, true)
      g.rotateX(s < 0 ? -Math.PI / 2 : Math.PI / 2)
      g.translate(0, -HULL_R, s * (HULL_HALF + 23))
      out.push(g)
    }
    return out
  }, [])
  const deco = useMemo(() => {
    const ink = new THREE.Color(spec.swatch[1]).getHexString()
    return nameTexture(spec.registry, uiEn.ships[spec.id].name.toUpperCase(), `#${ink}`)
  }, [spec])
  const decoGeo = useMemo(() => [hullPatch(0.62, 0.2, -6, -30, 12, 12, 0.02, true), hullPatch(-0.62, -0.2, -30, -6, 12, 12, 0.02, true)], [])
  useEffect(
    () => () => {
      tex.map.dispose()
      tex.bump.dispose()
      mat.dispose()
      deco.dispose()
      geos.forEach((g) => g.dispose())
      ends.forEach((g) => g.dispose())
      decoGeo.forEach((g) => g.dispose())
    },
    [tex, mat, deco, geos, ends, decoGeo],
  )
  return (
    <group>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} receiveShadow castShadow={false} />
      ))}
      {ends.map((g, i) => (
        <mesh key={`e${i}`} geometry={g} material={mat} />
      ))}
      {decoGeo.map((g, i) => (
        <mesh key={`d${i}`} geometry={g} receiveShadow>
          <meshStandardMaterial map={deco} transparent roughness={0.7} metalness={0.1} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
      <Details spec={spec} />
      <Airlock spec={spec} />
    </group>
  )
}

/** 外壁の上に立てる・置く（theta, z の場所で、外向きを Y に） */
function OnHull({ th, z, lift = 0, children }: { th: number; z: number; lift?: number; children: React.ReactNode }) {
  const p = hullPoint(th, z, lift)
  return (
    <group position={p} rotation={[0, 0, -th]}>
      {children}
    </group>
  )
}

function Details({ spec }: { spec: ShipSpec }) {
  const accent = spec.swatch[2] ?? '#d9472b'
  // 手すり：エアロックから前後へ、左右 2 本（支柱は 2.5 m ごと）
  const rails = useMemo(() => {
    const out: { th: number; z0: number; z1: number }[] = []
    for (const s of [-1, 1]) out.push({ th: (s * 1.6) / HULL_R, z0: -28, z1: 28 })
    return out
  }, [])
  const windows = useMemo(() => {
    const out: { th: number; z: number }[] = []
    for (const s of [-1, 1]) for (let z = -60; z <= 60; z += 3.2) if (Math.abs(z) > 4) out.push({ th: s * 0.92, z })
    return out
  }, [])
  const beacon = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    if (beacon.current) beacon.current.color.setRGB(Math.sin(clock.elapsedTime * 3) > 0.6 ? 4 : 0.25, 0.05, 0.05)
  })
  return (
    <group>
      {rails.map((r, i) => (
        <group key={i}>
          <OnHull th={r.th} z={0} lift={0.24}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.02, 0.02, r.z1 - r.z0, 8]} />
              <meshStandardMaterial color="#d8b24a" roughness={0.5} metalness={0.2} />
            </mesh>
          </OnHull>
          {Array.from({ length: Math.floor((r.z1 - r.z0) / 2.5) + 1 }, (_, k) => (
            <OnHull key={k} th={r.th} z={r.z0 + k * 2.5} lift={0.12}>
              <mesh castShadow>
                <cylinderGeometry args={[0.015, 0.02, 0.24, 6]} />
                <meshStandardMaterial color="#9aa0a8" roughness={0.5} metalness={0.5} />
              </mesh>
            </OnHull>
          ))}
        </group>
      ))}
      {/* 窓の列（船の中の明かり） */}
      {windows.map((w, i) => (
        <OnHull key={i} th={w.th} z={w.z} lift={0.02}>
          <mesh>
            <boxGeometry args={[0.7, 0.06, 0.45]} />
            <meshBasicMaterial color={new THREE.Color(1.6, 1.35, 0.9)} toneMapped={false} />
          </mesh>
        </OnHull>
      ))}
      {/* アンテナの柱と皿 */}
      <OnHull th={-0.34} z={-16}>
        <mesh position={[0, 1.4, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.1, 2.8, 10]} />
          <meshStandardMaterial color="#b9bec6" roughness={0.45} metalness={0.6} />
        </mesh>
        <mesh position={[0, 3.0, 0]} rotation={[0.9, 0.4, 0]} castShadow>
          <sphereGeometry args={[1.3, 32, 12, 0, Math.PI * 2, 0, 0.75]} />
          <meshStandardMaterial color="#e8e8e4" roughness={0.5} metalness={0.2} side={THREE.DoubleSide} />
        </mesh>
      </OnHull>
      <OnHull th={0.26} z={14}>
        <mesh position={[0, 1.6, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.04, 3.2, 6]} />
          <meshStandardMaterial color="#9aa0a8" roughness={0.5} metalness={0.6} />
        </mesh>
      </OnHull>
      {/* 放熱板（左右に立つ白い板） */}
      {[-1, 1].map((s) =>
        [12, 22, 32].map((z) => (
          <OnHull key={`${s}${z}`} th={s * 1.12} z={z} lift={1.6}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.08, 3.2, 7.5]} />
              <meshStandardMaterial color="#eceae4" roughness={0.35} metalness={0.15} />
            </mesh>
          </OnHull>
        )),
      )}
      {/* 赤い点滅灯 */}
      <OnHull th={0} z={-34} lift={0.15}>
        <mesh>
          <sphereGeometry args={[0.12, 12, 8]} />
          <meshBasicMaterial ref={beacon} toneMapped={false} />
        </mesh>
      </OnHull>
      {/* エアロックのまわりの色の帯 */}
      {[-1, 1].map((s) => (
        <OnHull key={s} th={(s * 1.25) / HULL_R} z={0} lift={0.01}>
          <mesh>
            <boxGeometry args={[0.16, 0.01, 3.4]} />
            <meshStandardMaterial color={accent} roughness={0.6} />
          </mesh>
        </OnHull>
      ))}
    </group>
  )
}

/** エアロック：四角い枠、穴の中の壁、横へすべって開くハッチ、角の灯 */
function Airlock({ spec }: { spec: ShipSpec }) {
  void spec
  const S = AIRLOCK.size
  const door = useRef<THREE.Mesh>(null)
  const lamps = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    const h = evaDebug.hatch ?? hatchState.get()
    if (door.current) door.current.position.z = AIRLOCK.z + h * (S + 0.1)
    if (lamps.current) {
      const blink = Math.sin(clock.elapsedTime * 6) > 0
      if (h > 0.98) lamps.current.color.setRGB(0.2, 2.4, 0.6)
      else if (h > 0.02) lamps.current.color.setRGB(blink ? 3 : 0.4, blink ? 1.6 : 0.2, 0.1)
      else lamps.current.color.setRGB(0.25, 0.9, 0.3)
    }
  })
  const W = 0.22
  return (
    <group position={[AIRLOCK.x, 0, AIRLOCK.z]}>
      {/* 枠 */}
      {[
        [0, -(S + W) / 2, S + 2 * W, W],
        [0, (S + W) / 2, S + 2 * W, W],
        [-(S + W) / 2, 0, W, S],
        [(S + W) / 2, 0, W, S],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.05, z]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.12, d]} />
          <meshStandardMaterial color="#6d7480" roughness={0.45} metalness={0.6} />
        </mesh>
      ))}
      {/* 穴の中：壁と床（中の明かりで照らす） */}
      {/* 小屋の内壁（EvaShip の AirlockModule、穴の縁がちょうど S）と同じ面にならないよう、ほんの少し内側に */}
      <mesh position={[0, -0.71, 0]}>
        <boxGeometry args={[S - 0.03, 1.4, S - 0.03]} />
        <meshStandardMaterial color="#3a4048" roughness={0.7} metalness={0.3} side={THREE.BackSide} />
      </mesh>
      <pointLight position={[0, -0.9, 0]} intensity={1.6} distance={3} color="#cfe2ff" />
      {/* ハッチ（開くと前へすべる） */}
      {/* 下の面を小屋の屋根（y=0）から浮かせる：開いて屋根の上へすべったとき、同じ面でちらつかないように */}
      <mesh ref={door} position={[0, 0.045, 0]} castShadow receiveShadow>
        <boxGeometry args={[S - 0.02, 0.06, S - 0.02]} />
        <meshStandardMaterial color="#c9ccd2" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* 角の灯 */}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <mesh key={i} position={[(sx * (S + W)) / 2, 0.13, (sz * (S + W)) / 2]}>
          <boxGeometry args={[0.1, 0.05, 0.1]} />
          <meshBasicMaterial ref={i === 0 ? lamps : undefined} color={new THREE.Color(0.25, 0.9, 0.3)} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

// ---- 空・太陽・そばの惑星（宇宙の場面の向きを、船の座標に直して） -----------------------------------------

type Outside = { sun: THREE.Vector3; planet: { id: string; dir: THREE.Vector3; ang: number; color: string } | null; inv: THREE.Quaternion }

/** 船外に出たときの、太陽とそばの天体の向き（船の座標） */
function lookOutside(): Outside {
  // 場面の座標 → 宇宙の場面の向き（船の外壁・アルカディアは船の向き、天の湊はリングの下面の向き）
  const inv = evaSite.frame.clone().invert()
  const sun = ship.position.clone().negate().normalize().applyQuaternion(inv)
  let planet: Outside['planet'] = null
  const id = evaSite.planet ?? proximity.id
  const body = id ? bodies.get(id) : undefined
  if (id && body && id !== 'sun') {
    const p = new THREE.Vector3()
    body.object.getWorldPosition(p)
    const d = p.sub(ship.position)
    const dist = d.length()
    if (dist > body.radius) {
      let color = '#9a9a9a'
      for (const pl of PLANETS) {
        if (pl.id === id) color = pl.color
        const m = pl.moons.find((x) => x.id === id)
        if (m) color = m.color
      }
      planet = { id, dir: d.normalize().applyQuaternion(inv), ang: Math.asin(Math.min(0.999, body.radius / dist)), color }
    }
  }
  return { sun, planet, inv }
}

const FAR_D = 4500

function Planet({ p, sun }: { p: NonNullable<Outside['planet']>; sun: THREE.Vector3 }) {
  const key = p.id === 'earth' || p.id === 'moon' || p.id === 'mars' || p.id === 'mercury' || p.id === 'jupiter' || p.id === 'saturn' || p.id === 'venus' || p.id === 'uranus' || p.id === 'neptune' ? p.id : undefined
  const map = useOptionalTexture(key ? textureUrl(key) : undefined)
  // 地球の夜の側には、街の明かり
  const night = useOptionalTexture(p.id === 'earth' ? textureUrl('earthNight') : undefined)
  const r = FAR_D * Math.sin(p.ang)
  const pos = p.dir.clone().multiplyScalar(FAR_D)
  const atmo = p.id === 'earth' ? '#6fb4ff' : p.id === 'venus' ? '#ffe2a8' : p.id === 'mars' ? '#e8a07a' : null
  void sun
  return (
    <group position={pos}>
      <mesh rotation={[0.2, 0, 0.1]}>
        <sphereGeometry args={[r, 96, 64]} />
        {map ? <meshStandardMaterial map={map} roughness={0.95} metalness={0} emissiveMap={night ?? undefined} emissive={night ? '#ffc98a' : '#000'} emissiveIntensity={night ? 0.6 : 0} /> : <meshStandardMaterial color={p.color} roughness={0.95} />}
      </mesh>
      {atmo && (
        <mesh scale={1.025}>
          <sphereGeometry args={[r, 64, 32]} />
          <meshBasicMaterial color={atmo} transparent opacity={0.16} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

function SunGlow({ dir }: { dir: THREE.Vector3 }) {
  const halo = haloTexture()
  const pos = dir.clone().multiplyScalar(FAR_D * 0.9)
  return (
    <group position={pos}>
      <sprite scale={[900, 900, 1]}>
        <spriteMaterial map={halo} color={new THREE.Color(2.2, 1.9, 1.5)} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <sprite scale={[160, 160, 1]}>
        <spriteMaterial map={halo} color={new THREE.Color(9, 8, 6.5)} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </group>
  )
}

function SunLight({ dir }: { dir: THREE.Vector3 }) {
  const light = useRef<THREE.DirectionalLight>(null)
  // 影の大きさは出たときに決めて変えない（画質の切り替えで影の地図を作り直すと、影を受ける材質が描けなくなることがある）
  const [size] = useState(() => (!lowMemory() && useQuality.getState().level === 'high' ? 2048 : 1024))
  // 母船のまわりでは、船の影にツムギが入るように、光を船の向こうから当てる（影の地図の奥行きを船の大きさに）
  const reach = evaSite.id === 'ship' ? Math.max(60, shipCol.L * 1.2 + 50) : 40
  useFrame(() => {
    const l = light.current
    if (!l) return
    if (l.shadow.camera.far !== reach * 2 + 50) {
      l.shadow.camera.far = reach * 2 + 50
      l.shadow.camera.updateProjectionMatrix()
    }
    l.position.copy(focus).addScaledVector(dir, reach)
    l.target.position.copy(focus)
    l.target.updateMatrixWorld()
  })
  return (
    <directionalLight
      ref={light}
      intensity={3.4}
      color="#fff6ea"
      castShadow
      shadow-mapSize-width={size}
      shadow-mapSize-height={size}
      shadow-camera-left={-7}
      shadow-camera-right={7}
      shadow-camera-top={7}
      shadow-camera-bottom={-7}
      shadow-camera-near={1}
      shadow-camera-far={90}
      shadow-bias={-0.0004}
      shadow-normalBias={0.03}
    />
  )
}

/** 星空・太陽・惑星はカメラについてくる（母船のまわりを何百 m 飛んでも、遠くの景色はずれない） */
function Distant({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    g.current?.position.copy(camera.position)
  })
  return <group ref={g}>{children}</group>
}

export function EvaWorld({ spec }: { spec: ShipSpec }) {
  // 数 cm の部品（ボルト・札など）は影を落とさない（影のための描画を減らす）
  useTrimShadows(0.08)
  const out = useMemo(() => lookOutside(), [])
  const planetLight = out.planet ? new THREE.Color(out.planet.id === 'earth' ? '#7fa8e0' : out.planet.color) : null
  return (
    <>
      <Distant>
        <group quaternion={out.inv}>
          <Sky follow={false} />
        </group>
        <SunGlow dir={out.sun} />
        {out.planet && <Planet p={out.planet} sun={out.sun} />}
      </Distant>
      <SunLight dir={out.sun} />
      {/* 船の中から漏れる明かりのような、ごく弱い光（影の側が真っ黒にならないように） */}
      <ambientLight intensity={0.14} />
      <hemisphereLight args={['#9fb6d8', '#262018', 0.3]} />
      {out.planet && planetLight && (
        <>
          <directionalLight position={out.planet.dir.clone().multiplyScalar(50)} intensity={0.25 + Math.min(0.6, out.planet.ang)} color={planetLight} />
        </>
      )}
      {evaSite.id === 'ship' && (
        <>
          <EvaShip spec={spec} />
          <AirlockModule color={spec.swatch[2] ?? '#d9472b'} />
          <Airlock spec={spec} />
        </>
      )}
      {evaSite.id === 'hull' && <Hull spec={spec} />}
      {evaSite.id === 'arcadia' && (
        <>
          <ArcadiaDeck />
          <Airlock spec={spec} />
        </>
      )}
      {evaSite.id === 'dock' && (
        <>
          <DockUnderside />
          <Airlock spec={spec} />
        </>
      )}
    </>
  )
}
