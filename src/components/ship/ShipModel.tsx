import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { thrustFx, warpFx } from '../../state/flight'
import { useStore } from '../../state/store'
import { useSpaceEnvOn } from '../SpaceLighting'
import { findBaked, multiplyDetail } from './bakedMaps'
import type { Flood } from '../../data/ships'
import { bussardTexture, coilSpillTexture, coilTexture, deflectorTexture, hullTextures, nameTexture, shuttleBayTexture, windowBandTexture } from './hullTextures'

// 自機「SV-01 ソーラーボイジャー」。円盤部・首・副船体・2本のナセルという構成は借りるが、
// 寸法と細部はオリジナル。長さ約1、前方は -Z。
// 首・副船体・パイロン・ナセルは Blender で一体成形したモデル（tools/blender/build_hull.py）を読み込む。
//
// 質感と発光は撮影用模型の資料を参考にしている：
// - 外板はパール塗装。青みと金色のパネルが入り混じり、光の当たり方で色が揺らぐ（iridescence）
// - バサードコレクター（ナセル先端）は赤く、内部がゆっくり渦を巻くように明滅
// - ワープコイルは途切れのない青い発光。ナセルの曲面に沿わせ、縁がにじむように消える
// - ディフレクターは銅色の皿に青い光
// - インパルスエンジンは赤、航行灯は左舷が赤・右舷が緑、白いストロボが約3秒おきに点滅

type Profile = [number, number][]

/** 断面の点列をなめらかにつなぎ、等間隔に並べ直してから回転体にする */
function lathe(profile: Profile, segments: number, samples = 96) {
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)))
  const points = curve.getSpacedPoints(samples).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y))
  const geometry = new THREE.LatheGeometry(points, segments)
  const rimIndex = points.reduce((best, p, i) => (p.x > points[best].x ? i : best), 0)
  // テクスチャは上下が反転して貼られる（flipY）ので、絵の縦位置は 1 - v で返す
  const canvasV = (i: number) => 1 - i / samples
  /** 縁より下（bottom）または上（top）で、半径 r を通る位置の、絵の縦位置 */
  const vAt = (r: number, side: 'top' | 'bottom') => {
    const range = side === 'bottom' ? [rimIndex, 0] : [rimIndex, samples]
    const step = side === 'bottom' ? -1 : 1
    for (let i = range[0]; i !== range[1]; i += step) if (points[i].x <= r) return canvasV(i)
    return canvasV(range[1])
  }
  return { geometry, vRim: canvasV(rimIndex), vAt }
}

// 円盤部（下面中央 → 縁 → 上面中央の順で、法線が外を向く）
const SAUCER: Profile = [
  [0, -0.13], [0.05, -0.13], [0.1, -0.124], [0.16, -0.11], [0.3, -0.09], [0.5, -0.072], [0.75, -0.05],
  [0.92, -0.032], [0.985, -0.018], [1.0, -0.003], [0.985, 0.01], [0.92, 0.022], [0.75, 0.04],
  [0.5, 0.062], [0.25, 0.085], [0.11, 0.105], [0.075, 0.12], [0.05, 0.134], [0, 0.136],
]

// ブリッジ（円盤上面中央の段になった構造物。底 → 頂上）
const BRIDGE: Profile = [
  [0, 0], [0.034, 0], [0.035, 0.002], [0.031, 0.005], [0.0305, 0.0065], [0.024, 0.0085], [0.016, 0.0105],
  [0.0155, 0.012], [0.008, 0.0135], [0, 0.014],
]

const SAUCER_SCALE: [number, number, number] = [0.32, 0.32, 0.29]
const SAUCER_POS: [number, number, number] = [0, 0.07, -0.17]
/** 模型の 1 単位が実物の何 m か（円盤の半径 0.32 が 195 m） */
export const METERS_PER_UNIT = 195 / SAUCER_SCALE[0]
/** ブリッジの段の底の中心（模型の座標）。艦橋の中の部屋はここを基準に置く */
export const BRIDGE_BASE: [number, number, number] = [0, SAUCER_POS[1] + 0.136 * SAUCER_SCALE[1] - 0.004, SAUCER_POS[2] + 0.01]
const SECONDARY_Y = -0.085
const NACELLE_X = 0.2
const NACELLE_Y = 0.068
const NACELLE_Z = 0.14

function hullMaterial(tex: ReturnType<typeof hullTextures>, vertexColors = false) {
  return new THREE.MeshPhysicalMaterial({
    vertexColors,
    map: tex.map,
    bumpMap: tex.bumpMap,
    bumpScale: 1.2,
    emissiveMap: tex.emissiveMap,
    emissive: new THREE.Color(1.6, 1.5, 1.3),
    metalness: 0.2,
    roughness: 0.68,
    iridescence: 0.3,
    iridescenceIOR: 1.6,
    envMapIntensity: 0.8,
  })
}

/**
 * unitScale は自機に掛かっている拡大率（投光の届く距離を合わせるため）。変わるときは毎フレーム読む関数で渡す。
 * registry・shipName・tint を変えると、同じ形の姉妹艦になる（レースの相手の SV-02 など）
 */
export function ShipModel({
  unitScale = 1,
  registry = 'SV-01',
  shipName = 'SOLAR VOYAGER',
  tint,
  floods = true,
  env = true,
}: {
  unitScale?: number | (() => number)
  registry?: string
  shipName?: string
  tint?: string
  /** 船体を照らす投光器。何隻も並べるときは消して、光の数を増やしすぎない（スマホで描けなくなる） */
  floods?: boolean
  /** 宇宙の場面の映りこみ（環境マップ）を使う。別の Canvas（船外活動）に置くときは false */
  env?: boolean
}) {
  const root = useRef<THREE.Group>(null!)

  // すべての船体パーツに影を落とし、受けさせる
  useEffect(() => {
    root.current.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const basic = (mesh.material as THREE.Material).type === 'MeshBasicMaterial'
      mesh.castShadow = !basic
      mesh.receiveShadow = !basic
    })
  }, [])

  const parts = useMemo(() => {
    const saucer = lathe(SAUCER, 128, 160)
    const r = saucer.vRim
    const saucerTex = hullTextures({
      width: 4096,
      height: 1024,
      seed: 11,
      windows: [
        { v: r - 0.035, density: 0.75 },
        { v: r - 0.06, density: 0.55 },
        { v: r + 0.035, density: 0.75 },
        { v: r + 0.065, density: 0.6 },
        { v: r + 0.12, density: 0.35 },
        { v: r + 0.2, density: 0.25 },
        // 下面：同心円に並ぶ長方形の窓（外側ほど多く、内側は区画ごとにまばらに）。
        // テクスチャの横は円周方向なので、内側ほど同じ大きさに見えるよう横に広げる
        ...[0.93, 0.87, 0.8, 0.73, 0.65, 0.57, 0.49, 0.4, 0.32].map((radius, i) => ({
          v: saucer.vAt(radius, 'bottom'),
          density: 0.78 - i * 0.05,
          size: [Math.round(8.5 / radius), 5] as [number, number],
          groups: (i < 4 ? [4, 9] : [2, 6]) as [number, number],
        })),
      ],
      texts: [
        // 下面の前寄りに、架空の型式番号（円周に沿って弧を描く）
        { text: registry, u: 0.5, v: saucer.vAt(0.6, 'bottom'), height: 44, stretch: 1.9 },
      ],
      details: [
        { v: saucer.vAt(0.86, 'top'), kind: 'phaser' },
        { v: saucer.vAt(0.86, 'bottom'), kind: 'phaser' },
        { v: saucer.vAt(0.6, 'top'), kind: 'hatch' },
        { v: saucer.vAt(0.42, 'top'), kind: 'hatch' },
        { v: saucer.vAt(0.62, 'bottom'), kind: 'hatch' },
        { v: saucer.vAt(0.5, 'top'), kind: 'groove' },
        { v: saucer.vAt(0.3, 'top'), kind: 'groove' },
        { v: saucer.vAt(0.18, 'top'), kind: 'groove' },
        { v: saucer.vAt(0.45, 'bottom'), kind: 'groove' },
        { v: saucer.vAt(0.25, 'bottom'), kind: 'groove' },
      ],
    })
    const secondaryTex = hullTextures({
      width: 2048,
      height: 1024,
      seed: 23,
      panelScale: 0.8,
      windows: [
        { v: 0.29, vertical: true, from: 0.12, to: 0.82, density: 0.7 },
        { v: 0.71, vertical: true, from: 0.12, to: 0.82, density: 0.7 },
        { v: 0.34, vertical: true, from: 0.15, to: 0.7, density: 0.5 },
        { v: 0.66, vertical: true, from: 0.15, to: 0.7, density: 0.5 },
      ],
      texts: [
        // 副船体の左右に、型式と船の種類（調査船）
        { text: `${registry}  SURVEY VESSEL`, u: 0.75, v: 0.5, height: 34, stretch: 0.55, rotate: Math.PI / 2, mirror: true },
        { text: `${registry}  SURVEY VESSEL`, u: 0.25, v: 0.5, height: 34, stretch: 0.55, rotate: -Math.PI / 2, mirror: true },
      ],
    })
    const nacelleTex = hullTextures({ width: 512, height: 512, seed: 37, panelScale: 0.6, windows: [] })
    const tinted = (m: THREE.MeshPhysicalMaterial) => (tint ? (m.color.set(tint), m) : m)

    return {
      saucer: saucer.geometry,
      saucerMat: tinted(hullMaterial(saucerTex)),
      // 一体成形モデルは頂点カラーに焼き込んだ環境遮蔽（AO）を持つ
      secondaryMat: tinted(hullMaterial(secondaryTex, true)),
      nacelleMat: tinted(hullMaterial(nacelleTex, true)),
      bridge: lathe(BRIDGE, 64, 64).geometry,
      bridgeMat: new THREE.MeshPhysicalMaterial({ color: '#c3c7ce', metalness: 0.15, roughness: 0.55, envMapIntensity: 0.8 }),
      bridgeWindows: windowBandTexture(),
      trimMat: new THREE.MeshPhysicalMaterial({ color: '#9aa0aa', metalness: 0.55, roughness: 0.35, envMapIntensity: 1.2 }),
      deflectorRimMat: new THREE.MeshPhysicalMaterial({ color: '#2b3442', metalness: 0.85, roughness: 0.3, envMapIntensity: 1.6 }),
      // バサードの外殻：薄く色の付いたガラス。発光体の上に映り込みとハイライトを乗せる
      bussardGlass: new THREE.MeshPhysicalMaterial({
        color: '#ff2a10',
        metalness: 0,
        roughness: 0.04,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        envMapIntensity: 2,
      }),
      deflector: deflectorTexture(),
      bussardL: bussardTexture(),
      bussardR: bussardTexture(),
      bay: shuttleBayTexture(),
      coil: coilTexture(),
      coilSpillTex: coilSpillTexture(),
      coilPlate: coilBand(0.0006, 0),
      coilSpill: coilBand(COIL_BAND.depth + 0.0007, 0.007),
      coilFlow: coilFlowMaterial(),
      name: nameTexture(`${registry}  ${shipName}`),
    }
  }, [registry, shipName, tint])
  useSpaceEnvOn(useMemo(() => (!env ? [] : [parts.saucerMat, parts.secondaryMat, parts.nacelleMat, parts.bridgeMat, parts.trimMat, parts.deflectorRimMat, parts.bussardGlass]), [parts, env]))

  // 発光部（ワープ時に強める・明滅させる）
  const bussards = useRef<THREE.MeshBasicMaterial[]>([])
  const grilles = useRef<THREE.MeshBasicMaterial[]>([])
  const spills = useRef<THREE.MeshBasicMaterial[]>([])
  const deflector = useRef<THREE.MeshBasicMaterial>(null!)
  const impulse = useRef<THREE.MeshBasicMaterial>(null!)
  const strobes = useRef<THREE.MeshBasicMaterial[]>([])
  const halos = useRef<THREE.SpriteMaterial[]>([])
  const navLights = useRef<THREE.MeshBasicMaterial[]>([])

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime()
    const w = warpFx.glow
    // バサード：赤い光がゆっくり脈打つ
    bussards.current.forEach((m, i) => {
      const swirl = 0.85 + 0.15 * Math.sin(t * 3 + i * 1.3) + 0.08 * Math.sin(t * 7.1 + i)
      const k = (0.9 + w * 1.2) * swirl
      m.color.setRGB(k * 1.7, k * 1.05, k)
      if (m.map) m.map.offset.x = (t * 0.15 * (i % 2 ? 1 : -1)) % 1
    })
    // ワープコイル：普段は穏やか、加速（thrustFx.power）とワープ準備で明るく
    const power = thrustFx.power
    const coil = 1.25 + w * 1.8 + power * 0.7 + 0.05 * Math.sin(t * 2.3)
    grilles.current.forEach((m) => m.color.setScalar(coil))
    spills.current.forEach((m) => m.color.setScalar(0.55 + w * 1.2 + power * 0.4))
    // コイルの上を後ろへ流れる光：加速するほど明るく速く
    const flow = parts.coilFlow.uniforms
    flow.uPower.value = useStore.getState().settings.thrust === 'off' ? 0 : 0.12 + Math.max(power, w)
    flow.uPhase.value += Math.min(delta, 0.05) * (0.4 + 1.6 * power + 3 * w)
    // ディフレクター：ゆっくり呼吸するように明滅、ワープ準備で強く
    const d = (1.15 + w * 1.4) * (0.94 + 0.06 * Math.sin(t * 1.7))
    deflector.current.color.setRGB(d, d, d * 1.1)
    impulse.current.color.setRGB(w > 0 ? 0.6 : 1.8, 0.15, 0.08)
    // 衝突防止灯（ストロボ）：飛行機の翼端灯のように、3秒おきに「チカッチカッ」と2回光る。航行灯はゆっくり明滅
    const phase = t % STROBE_PERIOD
    const on = phase < STROBE_FLASH || (phase > STROBE_GAP && phase < STROBE_GAP + STROBE_FLASH)
    const flash = on ? 5 : 0.3
    strobes.current.forEach((m) => m.color.setRGB(flash, flash, flash))
    halos.current.forEach((m) => (m.opacity = on ? 1 : 0))
    const nav = 0.7 + 0.5 * (Math.sin(t * Math.PI) > 0 ? 1 : 0)
    navLights.current.forEach((m, i) => (i % 2 === 0 ? m.color.setRGB(1.3 * nav, 0.04, 0.04) : m.color.setRGB(0.04, 1.3 * nav, 0.15)))
  })

  useEffect(
    () => () => {
      Object.values(parts).forEach((p) => {
        if (p instanceof THREE.BufferGeometry || p instanceof THREE.Material || p instanceof THREE.Texture) p.dispose()
      })
    },
    [parts],
  )

  const saucerTop = SAUCER_POS[1] + 0.136 * SAUCER_SCALE[1]
  const saucerBottom = SAUCER_POS[1] - 0.13 * SAUCER_SCALE[1]
  const rimX = SAUCER_SCALE[0]

  const haloMat = (m: THREE.SpriteMaterial | null) => {
    if (m && !halos.current.includes(m)) halos.current.push(m)
  }
  /** ストロボ：小さな光る玉と、光ったときだけ広がる光のにじみ */
  const strobe = (position: [number, number, number], size: number) => (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[size, 10, 10]} />
        <meshBasicMaterial ref={glowMat(strobes)} toneMapped={false} />
      </mesh>
      <sprite scale={size * 18}>
        <spriteMaterial ref={haloMat} map={haloTexture()} color={new THREE.Color(2.2, 2.3, 2.6)} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  )

  const glowMat = (ref: React.MutableRefObject<THREE.MeshBasicMaterial[]>) => (m: THREE.MeshBasicMaterial | null) => {
    if (m && !ref.current.includes(m)) ref.current.push(m)
  }

  return (
    <group ref={root}>
      {floods && <Floodlights unitScale={unitScale} saucerTop={saucerTop} />}
      {/* 円盤部 */}
      <mesh geometry={parts.saucer} material={parts.saucerMat} position={SAUCER_POS} scale={SAUCER_SCALE} />
      {/* ブリッジ：段になった構造物と窓の帯、頂上の標識灯 */}
      <group position={[0, saucerTop - 0.004, SAUCER_POS[2] + 0.01]} scale={[1, 1, 1.15]}>
        <mesh geometry={parts.bridge} material={parts.bridgeMat} />
        <mesh position={[0, 0.0058, 0]}>
          <cylinderGeometry args={[0.0313, 0.0313, 0.0012, 64, 1, true]} />
          <meshBasicMaterial map={parts.bridgeWindows} transparent toneMapped={false} />
        </mesh>
      </group>
      {/* 艦橋のてっぺんのストロボ（ブリッジの縦の縮みを受けないよう外に置く） */}
      {strobe([0, saucerTop - 0.004 + 0.0148, SAUCER_POS[2] + 0.01], 0.00075)}
      {/* 下部センサードーム */}
      <mesh position={[0, saucerBottom + 0.002, SAUCER_POS[2]]} scale={[1, 0.6, 1]}>
        <sphereGeometry args={[0.02, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshBasicMaterial color={new THREE.Color(0.25, 0.35, 0.6)} toneMapped={false} />
      </mesh>
      {/* 船名（上面をスポットライトで照らしたように明るめに） */}
      <mesh position={[0, SAUCER_POS[1] + 0.07 * SAUCER_SCALE[1], SAUCER_POS[2] - 0.14]} rotation={[-Math.PI / 2 - 0.1, 0, 0]}>
        <planeGeometry args={[0.15, 0.019]} />
        <meshBasicMaterial map={parts.name} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      {/* インパルスエンジン：円盤上面の後ろ寄りに埋め込んだ箱と、後ろ向きに光る噴射口 */}
      <mesh position={[0, 0.0797, 0.079]} material={parts.bridgeMat}>
        <boxGeometry args={[0.075, 0.0045, 0.018]} />
      </mesh>
      <mesh position={[0, 0.0805, 0.0882]}>
        <planeGeometry args={[0.068, 0.0024]} />
        <meshBasicMaterial ref={impulse} toneMapped={false} />
      </mesh>

      {/* 首・副船体・パイロン・ナセル（一体成形） */}
      <Suspense fallback={null}>
        <EngineeringHull hullMat={parts.secondaryMat} nacelleMat={parts.nacelleMat} />
      </Suspense>

      {/* ディフレクター */}
      <mesh position={[0, SECONDARY_Y, -0.001]} scale={[1, 0.7, 1]} material={parts.deflectorRimMat}>
        <torusGeometry args={[0.041, 0.006, 12, 48]} />
      </mesh>
      <mesh position={[0, SECONDARY_Y, -0.002]} rotation={[0, Math.PI, 0]} scale={[1, 0.7, 1]}>
        <circleGeometry args={[0.038, 48]} />
        <meshBasicMaterial ref={deflector} map={parts.deflector} toneMapped={false} />
      </mesh>
      {/* 副船体の後ろ、背中のストロボ */}
      {strobe([0, SECONDARY_Y + 0.0375, 0.448], 0.00095)}
      {/* シャトルベイ：副船体の後端をえぐった奥にある扉（build_hull.py の BAY_* と同じ位置） */}
      <mesh position={[0, SECONDARY_Y + 0.005, 0.495 - 0.007 + 0.0003]}>
        <planeGeometry args={[0.033, 0.016]} />
        <meshStandardMaterial
          map={parts.bay.map}
          emissiveMap={parts.bay.emissiveMap}
          emissive={new THREE.Color(1.6, 1.4, 1.1)}
          metalness={0.4}
          roughness={0.55}
        />
      </mesh>

      {[-1, 1].map((side) => {
        const nx = side * NACELLE_X
        return (
          <group key={side}>
            {/* バサードコレクター */}
            <mesh position={[nx, NACELLE_Y, NACELLE_Z + 0.022]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1.35, 0.75]}>
              <sphereGeometry args={[0.033, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshBasicMaterial ref={glowMat(bussards)} map={side < 0 ? parts.bussardL : parts.bussardR} toneMapped={false} />
            </mesh>
            <mesh position={[nx, NACELLE_Y, NACELLE_Z + 0.022]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.03, 1.37, 0.77]} material={parts.bussardGlass}>
              <sphereGeometry args={[0.033, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
            {/* 推進コイル：ナセルをぐるっと一周する溝の奥で光る帯と、溝からあふれて外板を染める光 */}
            <mesh geometry={parts.coilPlate} position={[nx, NACELLE_Y, NACELLE_Z]}>
              <meshBasicMaterial ref={glowMat(grilles)} map={parts.coil} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
            <mesh geometry={parts.coilSpill} position={[nx, NACELLE_Y, NACELLE_Z]}>
              <meshBasicMaterial
                ref={glowMat(spills)}
                map={parts.coilSpillTex}
                transparent
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>
            {/* コイルの上を後ろへ流れる光（加速・ワープで強く） */}
            <mesh geometry={parts.coilPlate} position={[nx, NACELLE_Y, NACELLE_Z]} material={parts.coilFlow} renderOrder={1} />
            {/* ナセル後端のストロボ */}
            {strobe([nx, NACELLE_Y + 0.02, NACELLE_Z + 0.42], 0.0012)}
          </group>
        )
      })}

      {/* 航行灯：円盤の縁の上下（左舷＝赤、右舷＝緑） */}
      {[1, -1].map((dy) =>
        [-1, 1].map((side) => (
          <mesh key={`${dy}${side}`} position={[side * rimX * 0.995, SAUCER_POS[1] + dy * 0.004, SAUCER_POS[2]]}>
            <sphereGeometry args={[0.003, 8, 8]} />
            <meshBasicMaterial ref={glowMat(navLights)} toneMapped={false} />
          </mesh>
        )),
      )}
    </group>
  )
}

/**
 * 船体を照らす投光器。撮影用模型や劇中の船と同じく、外板の一部を下や横から照らして
 * 光のたまりを作る。暗い宇宙でも形と大きさが分かる。
 */
function Floodlights({ unitScale, saucerTop }: { unitScale: number | (() => number); saucerTop: number }) {
  const lights = useMemo<Flood[]>(() => [
    // 円盤上面（船名のあたり）を後ろから
    { from: [0, saucerTop + 0.08, 0.1], to: [0, saucerTop - 0.01, -0.33], angle: 0.45, intensity: 0.7 },
    // 円盤の下面を首の付け根から
    { from: [0, -0.05, 0.1], to: [0, 0.03, -0.3], angle: 0.6, intensity: 0.6 },
    // 副船体の側面をパイロンから
    { from: [0.16, 0.05, 0.46], to: [0.02, -0.09, 0.18], angle: 0.5, intensity: 0.5 },
    { from: [-0.16, 0.05, 0.46], to: [-0.02, -0.09, 0.18], angle: 0.5, intensity: 0.5 },
  ], [saucerTop])
  return <FloodLights unitScale={unitScale} lights={lights} />
}

/** 投光器（位置は船の座標）。ほかの船（VariantModel）でも使う */
export function FloodLights({ unitScale, lights }: { unitScale: number | (() => number); lights: Flood[] }) {
  const targets = useMemo(() => lights.map((l) => {
    const o = new THREE.Object3D()
    o.position.set(...l.to)
    return o
  }), [lights])
  const spots = useRef<THREE.SpotLight[]>([])
  const scaleNow = () => (typeof unitScale === 'function' ? unitScale() : unitScale)
  useFrame(() => {
    const k = scaleNow()
    // 船を替えると投光器の数が変わるので、今の lights の数だけ回す
    lights.forEach((l, i) => {
      const s = spots.current[i]
      if (!s) return
      s.distance = 0.7 * k
      s.intensity = l.intensity * k
    })
  })
  return (
    <>
      {lights.map((l, i) => (
        <group key={i}>
          <primitive object={targets[i]} />
          <spotLight
            ref={(s) => { if (s) spots.current[i] = s }}
            position={l.from}
            target={targets[i]}
            angle={l.angle}
            penumbra={0.8}
            distance={0.7 * scaleNow()}
            decay={1}
            // decay=1 なので明るさは距離に反比例する。縮小して置いても同じ見え方になるよう倍率を掛ける
            intensity={l.intensity * scaleNow()}
            color="#fff1dc"
          />
        </group>
      ))}
    </>
  )
}

// ワープコイルの溝（tools/blender/build_hull.py の SLOT_* と同じ値。ナセル先端からの距離）
// ストロボの光り方（秒）：周期、1回の光る長さ、2回目までの間。
// 灯りは小さい方が船が大きく見えるので、光のにじみも控えめにする
export const STROBE_PERIOD = 3
export const STROBE_FLASH = 0.07
export const STROBE_GAP = 0.25

/** ストロボの光のにじみ（中心が明るく外へ消える丸） */
let halo: THREE.CanvasTexture | null = null
export function haloTexture() {
  if (halo) return halo
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.15, 'rgba(255,255,255,0.6)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.12)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  halo = new THREE.CanvasTexture(canvas)
  halo.colorSpace = THREE.SRGBColorSpace
  return halo
}

// 推進コイルの光る帯（tools/blender/build_hull.py の BAND_* と同じ値）。ナセルの側面をぐるっと一周し、
// 先端の赤い集光器に向かってふくらむ
const COIL_BAND = { front: 0.085, thin: 0.0055, wide: 0.019, swell: [0.27, 0.15], round: 0.022, depth: 0.0035 }
// ナセルの断面（build_hull.py の NACELLE と同じ。半径, 先端からの距離）。断面の形は超楕円で、縦は NACELLE_H 倍
const NACELLE_PROFILE: [number, number][] = [
  [0, 0], [0.024, 0.004], [0.033, 0.018], [0.037, 0.045], [0.038, 0.12], [0.038, 0.36], [0.035, 0.4],
  [0.028, 0.425], [0.013, 0.435], [0, 0.437],
]
const NACELLE_H = 0.75

const smooth = (e0: number, e1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}
function bandHalfHeight(zz: number) {
  const { front, thin, wide, swell, round } = COIL_BAND
  return (thin + (wide - thin) * smooth(swell[0], swell[1], zz)) * Math.sqrt(THREE.MathUtils.clamp((zz - front) / round, 0, 1))
}

/**
 * コイルの帯の上を、前から後ろへ流れる光の筋。帯の u は外側の前端 0 → 後端 0.5 → 内側の前端 1 なので、
 * 後端からの距離 |u - 0.5| に沿って模様をずらすと、両側とも後ろへ流れて見える
 */
function coilFlowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uPhase: { value: 0 }, uPower: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uPhase;
      uniform float uPower;
      varying vec2 vUv;
      void main() {
        float d = abs(vUv.x - 0.5) * 2.0;
        float across = abs(vUv.y - 0.5) * 2.0;
        float wave = pow(0.5 + 0.5 * sin((d * 5.0 + uPhase) * 6.2832), 6.0);
        float k = wave * (1.0 - across * across) * smoothstep(1.0, 0.85, d) * uPower;
        gl_FragColor = vec4(vec3(0.55, 0.85, 1.6) * k, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
}

/**
 * 推進コイルの帯の面。lift は溝の底からの高さ（溝の底の少し上に光る板、外板の少し外にあふれる光）、
 * extra は帯の高さに足す幅。ナセルの中心を原点に、z はナセルの先端からの距離。
 * u は帯に沿って（外側の前端 0 → 後端 → 内側の前端 1）、v は帯の高さ方向（0〜1）。
 */
function coilBand(lift: number, extra: number) {
  const curve = new THREE.SplineCurve(NACELLE_PROFILE.map(([r, z]) => new THREE.Vector2(r, z)))
  const line = curve.getPoints(320)
  const maxR = (z: number) => {
    for (let i = 1; i < line.length; i++) {
      if (line[i].y >= z) {
        const a = line[i - 1]
        const b = line[i]
        return a.x + ((b.x - a.x) * (z - a.y)) / Math.max(b.y - a.y, 1e-9)
      }
    }
    return 0
  }
  // 断面の空間（横は正規化した半径）での、外板からの符号付き距離。build_hull.py の revolved と同じ考え方
  // near は輪郭の点の番号。その前後だけ調べて速くする（帯は細いので、いちばん近い所はその近くにある）
  const signed = (x: number, y: number, z: number, near: number) => {
    const rho = Math.cbrt(Math.abs(x) ** 3 + Math.abs(y / NACELLE_H) ** 3)
    let d2 = Infinity
    for (let i = Math.max(1, near - 36); i < Math.min(line.length, near + 36); i++) {
      const ax = line[i - 1].x
      const az = line[i - 1].y
      const bx = line[i].x - ax
      const bz = line[i].y - az
      const t = THREE.MathUtils.clamp(((rho - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1), 0, 1)
      d2 = Math.min(d2, (rho - ax - bx * t) ** 2 + (z - az - bz * t) ** 2)
    }
    const inside = z > 0 && z < line[line.length - 1].y && rho < maxR(z)
    return (inside ? -1 : 1) * Math.sqrt(d2) * NACELLE_H
  }
  const target = -COIL_BAND.depth + lift

  // 帯の通り道：真横から見た輪郭（y=0）に沿って、前端から後端へ
  const path = line.map((p, index) => ({ p, index })).filter(({ p }) => p.y >= COIL_BAND.front && p.x > 0)
  const along = path.filter((_, i) => i % 2 === 0 || i === path.length - 1)
  const rows = 7
  const verts: number[] = []
  const uvs: number[] = []
  const columns: { x: number; z: number; nx: number; nz: number; len: number; index: number }[] = []
  let len = 0
  along.forEach(({ p, index }, i) => {
    const prev = along[Math.max(0, i - 1)].p
    const next = along[Math.min(along.length - 1, i + 1)].p
    if (i > 0) len += p.distanceTo(prev)
    const tx = next.x - prev.x
    const tz = next.y - prev.y
    const n = Math.hypot(tx, tz) || 1
    columns.push({ x: p.x, z: p.y, nx: tz / n, nz: -tx / n, len, index })
  })
  // 外側の側面と内側の側面（後端でつながる）
  const loop = [...columns.map((c) => ({ ...c, side: 1 })), ...columns.slice(0, -1).reverse().map((c) => ({ ...c, side: -1, len: 2 * len - c.len }))]
  for (const c of loop) {
    const h = bandHalfHeight(c.z) + extra
    for (let j = 0; j < rows; j++) {
      const y = (j / (rows - 1) * 2 - 1) * h
      // 輪郭の外向きの向きに沿って、ねらった深さの面まで動かす（二分法）
      let lo = -0.03
      let hi = 0.012
      for (let k = 0; k < 14; k++) {
        const t = (lo + hi) / 2
        if (signed(c.x + c.nx * t, y, c.z + c.nz * t, c.index) > target) hi = t
        else lo = t
      }
      const t = (lo + hi) / 2
      verts.push(c.side * (c.x + c.nx * t), y, c.z + c.nz * t)
      uvs.push(c.len / (2 * len), j / (rows - 1))
    }
  }
  const index: number[] = []
  for (let i = 0; i < loop.length - 1; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j
      const b = (i + 1) * rows + j
      index.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

const HULL_URL = `${import.meta.env.BASE_URL}models/ship-hull.glb`
useGLTF.preload(HULL_URL)

/** Blender で生成した機関部。マテリアル名（Hull / Nacelle）で船体の質感を割り当てる */
function EngineeringHull({ hullMat, nacelleMat }: { hullMat: THREE.Material; nacelleMat: THREE.Material }) {
  const { scene } = useGLTF(HULL_URL)
  // Blender で焼いた色ムラ・角の明るさ・つやを、外板の絵の上に掛ける（同じ材質に 1 度だけ）
  useMemo(() => {
    const baked = findBaked(scene)
    if (!baked) return
    for (const m of [hullMat, nacelleMat] as THREE.MeshStandardMaterial[]) if (!m.userData.detail) {
      m.userData.detail = true
      multiplyDetail(m, baked)
    }
  }, [scene, hullMat, nacelleMat])
  const meshes = useMemo(() => {
    const list: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const name = (mesh.material as THREE.Material).name
      list.push({ geometry: mesh.geometry, material: name === 'Nacelle' ? nacelleMat : hullMat })
    })
    return list
  }, [scene, hullMat, nacelleMat])
  return (
    <>
      {meshes.map((m, i) => (
        <mesh key={i} geometry={m.geometry} material={m.material} castShadow receiveShadow />
      ))}
    </>
  )
}
