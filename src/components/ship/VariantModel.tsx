import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { thrustFx, warpFx } from '../../state/flight'
import type { ShipId, ShipSpec } from '../../data/ships'
import { hullTextures } from './hullTextures'
import { useSpaceEnvOn } from '../SpaceLighting'
import { applyBaked, findBaked, setBakedLevel, type BakedMaps } from './bakedMaps'
import { useLevel } from '../../state/quality'

// 焼いたテクスチャを使う材質（bake_ship.py の PAINTED / BARE と同じ分け方）。光の帆と放熱板は今までどおり
// アマツカゼだけは、色・パネル・窓の明かりまで丸ごと Blender で焼いてある（材質の名前 Baked。
// tools/blender/build_amatsukaze.py）。その材質は glb のまま使い、映り込みと光り方だけここで合わせる。
const BAKED_PAINTED = new Set(['Hull', 'Hull2', 'Accent', 'CargoA', 'CargoB', 'CargoC', 'CargoD'])
const BAKED_BARE = new Set(['Dark', 'Metal', 'Gold'])
import { FloodLights, STROBE_FLASH, STROBE_GAP, STROBE_PERIOD, ShipModel, haloTexture } from './ShipModel'

// SV-01 以外の自機。形は Blender で組み立てたモデル（tools/blender/build_fleet.py）で、
// 材質の名前ごとに、ここで色・外板の模様・光り方を決める。
// 外板の模様は SV-01 と同じ Canvas の描き方（パネルの濃淡と継ぎ目の凹凸）で、
// モデルの UV は箱投影なので、模様は船じゅう同じ大きさでくり返す。
// 環境遮蔽（AO）は頂点カラーに焼き込んである。

// 模型は、その船を選んだときに初めて読み込む（最初の読み込みを軽くするため）
const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}`

type Palette = { hull: string; hull2: string; accent: string; cargo: string[]; panelScale: number; seed: number }

const PALETTES: Record<Exclude<ShipId, 'sv01'>, Palette> = {
  // 白い船体に、灰青の下まわりと朱色の帯
  heron: { hull: '#eceae5', hull2: '#8e97a4', accent: '#c9452c', cargo: [], panelScale: 0.9, seed: 41 },
  // 白い居住区に、橙の帯。帆は鏡
  sorakaze: { hull: '#efeee9', hull2: '#a9b2bf', accent: '#de6a2c', cargo: [], panelScale: 0.6, seed: 53 },
  // 使いこまれた貨物船：くすんだ白、注意の黄色、色とりどりのコンテナ
  // 白い長旅の船：灰色の機械区画、朱色の帯
  // 海の船の色：明るい灰色の舷側、濃い灰色の甲板、赤い船底
  amatsu: { hull: '#b9bec6', hull2: '#6d747e', accent: '#9e2a22', cargo: [], panelScale: 0.7, seed: 91 },
  // 丸ごと焼いた船（色は glb のまま）。ここの色は使わない
  arcadia: { hull: '#c3c6d2', hull2: '#a9adbc', accent: '#8a1b27', cargo: [], panelScale: 0.7, seed: 97 },
  meguri: { hull: '#e9e8e3', hull2: '#9097a0', accent: '#d4552a', cargo: [], panelScale: 0.6, seed: 79 },
  hakobune: { hull: '#dedad0', hull2: '#7f8690', accent: '#e0a526', cargo: ['#c8662a', '#2f7d86', '#b9b7ae', '#3b4a6b'], panelScale: 0.8, seed: 67 },
}

/** 放熱板の模様：細い熱の通り道（ヒートパイプ）が平行に並ぶ */
function radiatorTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#9a9ea6'
  ctx.fillRect(0, 0, 256, 256)
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = '#5d626b'
    ctx.fillRect(x, 0, 3, 256)
    ctx.fillStyle = '#c3c6cc'
    ctx.fillRect(x + 3, 0, 1, 256)
  }
  ctx.fillStyle = '#6f747c'
  for (let y = 0; y < 256; y += 128) ctx.fillRect(0, y, 256, 4)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(0.5, 0.5)
  t.anisotropy = 8
  return t
}

/** 型式や船名を描いた板の絵 */
function decalTexture(text: string, color = 'rgba(40,44,52,0.88)') {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 160
  const ctx = c.getContext('2d')!
  ctx.fillStyle = color
  ctx.font = 'bold 120px "Helvetica Neue", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // 長い文字は横に縮めて板に収める
  const w = ctx.measureText(text).width
  const squeeze = Math.min(1, 980 / w)
  ctx.setTransform(squeeze, 0, 0, 1, 512 * (1 - squeeze), 0)
  ctx.fillText(text, 512, 84)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function materials(spec: ShipSpec, baked: BakedMaps | null) {
  const pal = PALETTES[spec.id as Exclude<ShipId, 'sv01'>]
  // Blender で焼いたテクスチャがあれば、外板の模様はそちらを使う（無ければ今までどおり、描いた模様を繰り返し貼る）
  const tex = baked ? null : hullTextures({ width: 1024, height: 1024, seed: pal.seed, panelScale: pal.panelScale, windows: [] })
  // モデルの UV は 1 単位 = 6。模様 1 枚を 1/2 単位に広げて、外板のパネルが SV-01 と同じくらいの大きさに見えるように
  if (tex) for (const t of [tex.map, tex.bumpMap]) t.repeat.set(1 / 3, 1 / 3)
  const painted = (color: string, opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
    new THREE.MeshPhysicalMaterial({
      color,
      vertexColors: true,
      map: tex?.map,
      bumpMap: tex?.bumpMap,
      bumpScale: 1.1,
      metalness: 0.2,
      roughness: 0.66,
      envMapIntensity: 0.8,
      ...opts,
    })
  const plain = (color: string, metalness: number, roughness: number, opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
    new THREE.MeshPhysicalMaterial({ color, vertexColors: true, metalness, roughness, envMapIntensity: 1.3, ...opts })
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(...spec.glow.idle), toneMapped: false })
  const blue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.75, 2.2), toneMapped: false })
  const mats: Record<string, THREE.Material> = {
    // パール塗装（SV-01 と同じく、光の当たり方でわずかに色が揺らぐ）
    Hull: painted(pal.hull, { iridescence: 0.25, iridescenceIOR: 1.6 }),
    Hull2: painted(pal.hull2),
    Accent: painted(pal.accent, { roughness: 0.55 }),
    Dark: plain('#1c1f25', 0.5, 0.55),
    Metal: plain('#a3a8b0', 0.8, 0.35),
    // 断熱材の金色の膜（本物の人工衛星にも貼られている）
    Gold: plain('#c99a3c', 1, 0.32, { envMapIntensity: 1.8 }),
    Window: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 1.85, 1.35), toneMapped: false }),
    Glow: glow,
    // 航行灯のレンズ（左舷は赤、右舷は緑）。明滅は下の useFrame で
    NavRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.04, 0.04), toneMapped: false }),
    NavGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.04, 1.3, 0.15), toneMapped: false }),
    // 青い光（発進レール・センサー・吸気口）。ワープの準備で明るく
    Blue: blue,
    // 発進口の奥：格納庫の明かり
    Bay: new THREE.MeshStandardMaterial({ color: '#20283a', emissive: new THREE.Color(0.35, 0.5, 0.85), emissiveIntensity: 1, roughness: 0.6 }),
    // 光の帆：鏡のような薄い膜。薄い膜なので虹色の干渉色が出る
    Sail: new THREE.MeshPhysicalMaterial({
      color: '#dfe3ea',
      metalness: 1,
      roughness: 0.12,
      iridescence: 0.7,
      iridescenceIOR: 1.4,
      iridescenceThicknessRange: [200, 600],
      envMapIntensity: 2.2,
      side: THREE.DoubleSide,
    }),
    Radiator: plain('#ffffff', 0.45, 0.45, { map: radiatorTexture(), side: THREE.DoubleSide, emissive: new THREE.Color(0, 0, 0) }),
  }
  ;['CargoA', 'CargoB', 'CargoC', 'CargoD'].forEach((name, i) => {
    mats[name] = painted(pal.cargo[i] ?? pal.hull2, { roughness: 0.72, iridescence: 0 })
  })
  if (baked) {
    for (const [name, m] of Object.entries(mats)) {
      if (!BAKED_PAINTED.has(name) && !BAKED_BARE.has(name)) continue
      const std = m as THREE.MeshStandardMaterial
      // ラフネスの絵は平均で 0.9 倍くらいなので、元の値を少し上げてつやの量をそろえる
      if (BAKED_PAINTED.has(name)) std.roughness = Math.min(1, std.roughness * 1.1)
      applyBaked(std, baked, { windows: name === 'Hull' || name === 'Hull2' })
    }
  }
  return { mats, glow, blue, radiator: mats.Radiator as THREE.MeshPhysicalMaterial }
}

/** 乗る船が SV-01 以外のときの自機。unitScale は自機に掛かっている拡大率（投光器の届く距離を合わせる） */
export function VariantModel({ spec, unitScale = 1, env = true }: { spec: ShipSpec; unitScale?: number | (() => number); env?: boolean }) {
  const { scene } = useGLTF(url(spec.model!))

  const level = useLevel()
  const built = useMemo(() => {
    const { mats, glow, blue, radiator } = materials(spec, findBaked(scene))
    const model = scene.clone(true)
    let rotor: THREE.Object3D | null = null
    // ドームのスリットの扉（ドームの中心を軸に X のまわりに回して開ける）
    const slits: THREE.Object3D[] = []
    const whole: THREE.MeshStandardMaterial[] = []
    model.traverse((o) => {
      if (o.name === 'Rotor') rotor = o
      if (/^Slit\d$/.test(o.name)) slits.push(o)
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const src = mesh.material as THREE.MeshStandardMaterial
      const name = src.name
      if (name === 'Baked') {
        // 窓の明かりは Bloom で白飛びしない明るさに（しきい値 1 をほとんど超えない）
        const m = src.clone()
        m.emissive.setRGB(1, 1, 1)
        m.emissiveIntensity = 1
        m.userData.normal = m.normalMap
        for (const t of [m.map, m.normalMap, m.roughnessMap, m.emissiveMap]) if (t) t.anisotropy = 8
        whole.push(m)
        mesh.material = m
      } else mesh.material = mats[name] ?? mats.Hull
      const lit = !(mesh.material instanceof THREE.MeshBasicMaterial)
      mesh.castShadow = lit
      mesh.receiveShadow = lit
    })
    const decals = spec.decals.map((d) => ({ ...d, map: decalTexture(d.text, d.color) }))
    return { model, rotor: rotor as THREE.Object3D | null, slits, whole, mats, glow, blue, radiator, decals }
  }, [scene, spec])
  useSpaceEnvOn(useMemo(() => (env ? [...Object.values(built.mats), ...built.whole] : []), [built, env]))
  useEffect(() => {
    for (const m of Object.values(built.mats)) setBakedLevel(m as THREE.MeshStandardMaterial, level)
    // 丸ごと焼いた材質：軽量の画質では継ぎ目の凹凸（ノーマル）を外す
    for (const m of built.whole) {
      m.normalMap = level === 'low' ? null : (m.userData.normal as THREE.Texture | null)
      m.needsUpdate = true
    }
  }, [built, level])

  useEffect(
    () => () => {
      Object.values(built.mats).forEach((m) => m.dispose())
      built.whole.forEach((m) => m.dispose())
      built.radiator.map?.dispose()
      built.decals.forEach((d) => d.map.dispose())
    },
    [built],
  )

  const strobes = useRef<THREE.MeshBasicMaterial[]>([])
  const halos = useRef<THREE.SpriteMaterial[]>([])
  const navs = useRef<{ m: THREE.MeshBasicMaterial; kind: string }[]>([])
  const idle = useMemo(() => new THREE.Color(...spec.glow.idle), [spec])
  const hot = useMemo(() => new THREE.Color(...spec.glow.warp), [spec])

  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime()
    const w = warpFx.glow
    // 噴射口：ふだんは穏やかにゆらぎ、噴かすと（EngineFx）・ワープの準備で強く
    built.glow.color
      .copy(idle)
      .lerp(hot, w)
      .multiplyScalar((0.92 + 0.08 * Math.sin(t * 9.3) * Math.sin(t * 3.1)) * (1 + 0.8 * thrustFx.power))
    const b = (1.1 + 1.4 * w) * (0.95 + 0.05 * Math.sin(t * 1.7))
    built.blue.color.setRGB(0.3 * b, 0.68 * b, 2 * b)
    // 放熱板：ワープの準備で、熱を逃がしてほんのり赤く
    built.radiator.emissive.setRGB(0.25 * w, 0.05 * w, 0.02 * w)
    // 回る部品：光の帆はゆっくり（約40秒で1回転）、回転リングは人工重力の速さで
    if (built.rotor) built.rotor.rotation.z += dt * ((Math.PI * 2) / (spec.spinSeconds ?? 40)) * (spec.spinSeconds ? 1 : 1 + 2 * w)
    // 天文台の扉：ドームごとに時間をずらして、ゆっくり開いて、しばらくして閉じる（約 48 秒で 1 回）
    built.slits.forEach((o, i) => {
      const c = ((t + i * 16) % 48) / 48
      const open = Math.min(1, Math.max(0, Math.min((c - 0.1) / 0.12, (0.85 - c) / 0.12)))
      o.rotation.x = 1.3 * open * open * (3 - 2 * open)
    })
    const phase = t % STROBE_PERIOD
    const on = phase < STROBE_FLASH || (phase > STROBE_GAP && phase < STROBE_GAP + STROBE_FLASH)
    const flash = on ? 5 : 0.3
    strobes.current.forEach((m) => m.color.setRGB(flash, flash, flash))
    halos.current.forEach((m) => (m.opacity = on ? 1 : 0))
    const nav = 0.7 + 0.5 * (Math.sin(t * Math.PI) > 0 ? 1 : 0)
    // 赤い標識灯は、ゆっくり明るくなって消える
    const beacon = 0.2 + 1.6 * Math.max(0, Math.sin(t * 2.2)) ** 6
    navs.current.forEach(({ m, kind }) => {
      if (kind === 'port') m.color.setRGB(1.3 * nav, 0.04, 0.04)
      else if (kind === 'starboard') m.color.setRGB(0.04, 1.3 * nav, 0.15)
      else m.color.setRGB(1.6 * beacon, 0.08 * beacon, 0.04 * beacon)
    })
    ;(built.mats.NavRed as THREE.MeshBasicMaterial).color.setRGB(1.3 * nav, 0.04, 0.04)
    ;(built.mats.NavGreen as THREE.MeshBasicMaterial).color.setRGB(0.04, 1.3 * nav, 0.15)
  })

  return (
    <group>
      <FloodLights unitScale={unitScale} lights={spec.floods} />
      <primitive object={built.model} />
      {built.decals.map((d, i) => (
        <mesh key={i} position={d.pos} rotation={d.rot}>
          <planeGeometry args={d.size} />
          <meshStandardMaterial map={d.map} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} roughness={0.6} />
        </mesh>
      ))}
      {spec.lights.map((l, i) =>
        l.kind === 'strobe' ? (
          <group key={i} position={l.pos}>
            <mesh>
              <sphereGeometry args={[l.size, 10, 10]} />
              <meshBasicMaterial ref={(m) => { if (m && !strobes.current.includes(m)) strobes.current.push(m) }} toneMapped={false} />
            </mesh>
            <sprite scale={l.size * 18}>
              <spriteMaterial
                ref={(m) => { if (m && !halos.current.includes(m)) halos.current.push(m) }}
                map={haloTexture()}
                color={new THREE.Color(2.2, 2.3, 2.6)}
                transparent
                opacity={0}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </sprite>
          </group>
        ) : (
          <mesh key={i} position={l.pos}>
            <sphereGeometry args={[l.size, 8, 8]} />
            <meshBasicMaterial ref={(m) => { if (m && !navs.current.some((n) => n.m === m)) navs.current.push({ m, kind: l.kind }) }} toneMapped={false} />
          </mesh>
        ),
      )}
    </group>
  )
}

/** 乗っている船の模型（SV-01 か、ほかの船） */
export function OwnShipModel({ spec, unitScale, env = true }: { spec: ShipSpec; unitScale?: number | (() => number); env?: boolean }) {
  // 船ごとに作り直す（灯火や投光器の数が船ごとに違うので、前の船の分を残さない）
  return spec.model ? <VariantModel key={spec.id} spec={spec} unitScale={unitScale} env={env} /> : <ShipModel unitScale={unitScale} env={env} />
}
