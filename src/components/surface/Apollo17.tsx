import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { rockGeometry, type Terrain } from './terrain'
import { APOLLO17, ALSEP_PARTS, type Historic } from '../../data/apollo17'
import { useHistoric, visitHistoric } from '../../state/historic'
import { roverPose, useRover } from '../../state/rover'
import { useRally } from '../../state/rally'
import { EVA_STOPS, useApolloEva } from '../../state/apolloEva'

// アポロ17号の史跡（タウルス・リットロウ谷）：着陸船の下半分・旗・月面車・ALSEP と、観測点1〜9の光の柱。
// ローバーで近づくと visitHistoric() で記録し、カード（HistoricCard）を出す。物には当たり判定はない。
// 形は本物の大きさに合わせた簡単な部品の組み合わせ（着陸船の胴は幅 4.2 m・脚の広がり 9.4 m、月面車は長さ 3.1 m など）。

type Prep = (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial

const up = new THREE.Vector3(0, 1, 0)
/** a から b へ伸びる丸い棒 */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const d = b.clone().sub(a)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), mat)
  m.position.copy(a).addScaledVector(d, 0.5)
  m.quaternion.setFromUnitVectors(up, d.normalize())
  return m
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}

/** 50 年の日光で色あせた旗 */
function flagTexture() {
  const c = document.createElement('canvas')
  c.width = 190
  c.height = 100
  const g = c.getContext('2d')!
  for (let i = 0; i < 13; i++) {
    g.fillStyle = i % 2 ? '#e9e6e0' : '#d9b8b4'
    g.fillRect(0, (i * 100) / 13, 190, 100 / 13 + 1)
  }
  g.fillStyle = '#b3bccb'
  g.fillRect(0, 0, 76, 54)
  g.fillStyle = '#eceae6'
  for (let r = 0; r < 9; r++) for (let k = 0; k < (r % 2 ? 5 : 6); k++) g.fillRect(5 + k * 12.5 + (r % 2 ? 6 : 0), 3 + r * 5.6, 2.4, 2.4)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 観測点の番号の札（いつもこちらを向く） */
function numberTexture(n: number) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(10,20,30,0.55)'
  g.beginPath()
  g.arc(64, 64, 58, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 7
  g.strokeStyle = '#ffd27a'
  g.stroke()
  g.fillStyle = '#fff2d0'
  g.font = 'bold 76px sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(n), 64, 68)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 真ん中が濃く、ふちが消える丸（オレンジの土） */
function softDisc() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.55, 'rgba(255,255,255,0.8)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function makeMats(prepare: Prep) {
  const std = (color: string, metalness: number, roughness: number) => prepare(new THREE.MeshStandardMaterial({ color, metalness, roughness }))
  return {
    // 空の映り込みがない月面では、金属っぽくしすぎると黒くなる
    gold: std('#d0a548', 0.3, 0.5),
    foilDark: std('#4a4338', 0.2, 0.6),
    silver: std('#b4b4b0', 0.35, 0.45),
    grey: std('#6d6d6a', 0.2, 0.6),
    white: std('#d8d8d2', 0.1, 0.55),
    tyre: std('#4b4b48', 0.5, 0.7),
    seat: std('#7d8b98', 0.2, 0.7),
    map: std('#e3dcc4', 0, 0.8),
    flag: prepare(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 })),
    rock: std('#8b8984', 0, 0.95),
    darkRock: std('#5c5a57', 0, 0.95),
    cable: new THREE.LineBasicMaterial({ color: '#8f8f8a' }),
  }
}
type Mats = ReturnType<typeof makeMats>

/** 着陸船の下半分（降下段）。はしごの脚が +x */
function descentStage(M: Mats) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 1.6, 8), M.gold)
  body.rotation.y = Math.PI / 8
  body.position.y = 2.05
  g.add(body)
  // 4 つの四角い区画の黒い断熱材
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2
    const p = box(0.05, 1.3, 1.5, M.foilDark, Math.cos(a) * 1.97, 2.05, Math.sin(a) * 1.97)
    p.rotation.y = -a
    g.add(p)
  }
  g.add(box(3.1, 0.12, 3.1, M.foilDark, 0, 2.88, 0))
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, 0.95, 16, 1, true), M.grey)
  bell.position.y = 0.88
  g.add(bell)
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    const foot = new THREE.Vector3(c * 4.7, 0.3, s * 4.7)
    g.add(strut(new THREE.Vector3(c * 1.9, 2.6, s * 1.9), foot, 0.09, M.silver))
    for (const side of [-1, 1]) {
      const sx = -s * side * 0.9
      const sz = c * side * 0.9
      g.add(strut(new THREE.Vector3(c * 1.6 + sx, 1.3, s * 1.6 + sz), new THREE.Vector3(c * 4.3, 0.55, s * 4.3), 0.045, M.silver))
    }
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.4, 0.18, 16), M.silver)
    pad.position.set(c * 4.75, 0.09, s * 4.75)
    g.add(pad)
  }
  // はしごと玄関（+x の側の脚に沿って）
  const lad = new THREE.Group()
  lad.rotation.y = -Math.PI / 4
  const r0 = new THREE.Vector3(2.15, 2.45, 0)
  const r1 = new THREE.Vector3(4.2, 0.45, 0)
  for (const z of [-0.28, 0.28]) lad.add(strut(r0.clone().setZ(z), r1.clone().setZ(z), 0.025, M.silver))
  for (let i = 1; i < 9; i++) {
    const p = r0.clone().lerp(r1, i / 9)
    lad.add(box(0.04, 0.04, 0.56, M.silver, p.x, p.y, 0))
  }
  lad.add(box(0.8, 0.06, 1.0, M.silver, 2.4, 2.55, 0))
  // 記念の銘板
  const plaque = box(0.04, 0.24, 0.3, M.silver, 3.15, 1.55, 0)
  lad.add(plaque)
  g.add(lad)
  return g
}

function flagModel(M: Mats) {
  const g = new THREE.Group()
  g.add(strut(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, 2.5, 0), 0.025, M.silver))
  g.add(strut(new THREE.Vector3(0, 2.45, 0), new THREE.Vector3(1.55, 2.45, 0), 0.015, M.silver))
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95), M.flag)
  flag.position.set(0.78, 1.97, 0)
  g.add(flag)
  return g
}

/** 月面車。前が +x。右の後ろの泥よけに、地図で直した跡 */
function lunarRover(M: Mats) {
  const g = new THREE.Group()
  g.add(box(2.3, 0.08, 1.15, M.silver, 0, 0.55, 0))
  for (const x of [-1.15, 1.15]) {
    for (const z of [-0.92, 0.92]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.23, 20), M.tyre)
      w.rotation.x = Math.PI / 2
      w.position.set(x, 0.41, z)
      g.add(w)
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.25, 12), M.silver)
      hub.rotation.x = Math.PI / 2
      hub.position.set(x, 0.41, z)
      g.add(hub)
      const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.28, 12, 1, true, -Math.PI / 2, Math.PI), M.white)
      fender.rotation.x = Math.PI / 2
      fender.rotation.z = Math.PI / 2
      fender.position.set(x, 0.43, z)
      g.add(fender)
      g.add(strut(new THREE.Vector3(x * 0.7, 0.55, z * 0.65), new THREE.Vector3(x, 0.45, z * 0.8), 0.03, M.silver))
    }
  }
  // 地図のページで直した泥よけ（右の後ろ）
  const fix = box(0.62, 0.02, 0.32, M.map, -1.15, 0.92, 0.92)
  g.add(fix)
  for (const z of [-0.3, 0.3]) {
    g.add(box(0.45, 0.06, 0.42, M.seat, -0.05, 0.75, z))
    g.add(box(0.06, 0.45, 0.42, M.seat, -0.3, 0.98, z))
  }
  g.add(strut(new THREE.Vector3(0.55, 0.6, 0), new THREE.Vector3(0.6, 1.1, 0), 0.03, M.silver))
  g.add(box(0.22, 0.28, 0.4, M.grey, 0.62, 1.2, 0))
  // 高利得アンテナ（傘）とテレビカメラ
  g.add(strut(new THREE.Vector3(1.05, 0.6, -0.25), new THREE.Vector3(1.05, 1.75, -0.25), 0.025, M.silver))
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.18, 20, 1, true), M.white)
  dish.material = M.white
  dish.position.set(1.05, 1.82, -0.25)
  dish.rotation.z = -0.5
  g.add(dish)
  g.add(strut(new THREE.Vector3(1.1, 0.6, 0.3), new THREE.Vector3(1.1, 1.35, 0.3), 0.025, M.silver))
  g.add(box(0.28, 0.2, 0.24, M.gold, 1.15, 1.45, 0.3))
  g.add(strut(new THREE.Vector3(0.95, 0.6, 0.05), new THREE.Vector3(0.95, 1.9, 0.05), 0.012, M.silver))
  // 後ろの荷台（道具）
  g.add(box(0.5, 0.42, 0.95, M.grey, -1.32, 0.82, 0))
  return g
}

function alsepPart(id: (typeof ALSEP_PARTS)[number]['id'], M: Mats) {
  const g = new THREE.Group()
  if (id === 'cs') {
    g.add(box(0.6, 0.32, 0.42, M.gold, 0, 0.2, 0))
    for (const x of [-0.35, 0.35]) g.add(strut(new THREE.Vector3(x, 0.3, 0), new THREE.Vector3(x, 0.78, 0), 0.015, M.silver))
    g.add(box(0.85, 0.02, 0.62, M.silver, 0, 0.8, 0))
    g.add(strut(new THREE.Vector3(0.1, 0.36, 0.1), new THREE.Vector3(0.1, 1.25, 0.1), 0.02, M.silver))
    g.add(box(0.06, 0.25, 0.06, M.white, 0.1, 1.3, 0.1))
  } else if (id === 'rtg') {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.46, 12), M.foilDark)
    c.position.y = 0.5
    g.add(c)
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4
      const f = box(0.02, 0.42, 0.18, M.grey, Math.cos(a) * 0.27, 0.5, Math.sin(a) * 0.27)
      f.rotation.y = -a
      g.add(f)
    }
    g.add(strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.28, 0), 0.05, M.silver))
  } else if (id === 'lsg') {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.45, 14), M.gold)
    c.position.y = 0.25
    g.add(c)
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.35, 16, 1, true), M.silver)
    shade.position.y = 0.62
    g.add(shade)
  } else if (id === 'leam' || id === 'lace') {
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3
      g.add(strut(new THREE.Vector3(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25), new THREE.Vector3(0, 0.35, 0), 0.012, M.silver))
    }
    g.add(box(0.28, 0.22, 0.24, id === 'leam' ? M.gold : M.white, 0, 0.45, 0))
    if (id === 'lace') {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.09, 0.14, 10, 1, true), M.silver)
      f.position.y = 0.63
      g.add(f)
    }
  } else {
    g.add(box(0.26, 0.14, 0.2, id === 'hfe' ? M.white : M.grey, 0, 0.07, 0))
  }
  return g
}

/** 割れた大岩（トレイシーの岩）と、ごろごろした岩 */
function boulders(M: Mats, kind: 'split' | 'boulders', h: (x: number, z: number) => number, cx: number, cz: number, seed: number) {
  const g = new THREE.Group()
  const put = (geoSeed: number, x: number, z: number, sx: number, sy: number, sz: number, ry: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(rockGeometry(geoSeed, false, 2), mat)
    m.scale.set(sx, sy, sz)
    m.rotation.y = ry
    m.position.set(x, h(cx + x, cz + z) + sy * 0.55, z)
    g.add(m)
  }
  if (kind === 'split') {
    // 長さ約 10 m、高さ約 5 m の岩が 3 つに割れて、すき間があいている（観測点の北、山側）
    put(seed, -2.8, -14, 3.0, 2.7, 3.2, 0.3, M.rock)
    put(seed + 1, 1.2, -14.5, 2.4, 2.9, 3.0, 1.1, M.rock)
    put(seed + 2, 4.6, -13.2, 2.0, 2.0, 2.4, 2.0, M.rock)
  } else {
    for (let i = 0; i < 7; i++) {
      const a = i * 2.3 + seed
      const d = 9 + ((i * 37) % 11)
      const s = 0.9 + ((i * 53) % 10) * 0.18
      put(seed + i, Math.cos(a) * d, Math.sin(a) * d, s * 1.2, s, s * 1.1, a, i % 2 ? M.darkRock : M.rock)
    }
  }
  return g
}

/** オレンジの土：地面に沿った、ふちのぼやけた丸 */
function orangeSoil(h: (x: number, z: number) => number, cx: number, cz: number, tex: THREE.Texture, prep: Prep) {
  const geo = new THREE.PlaneGeometry(22, 16, 22, 16)
  geo.rotateX(-Math.PI / 2)
  const p = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) p.setY(i, h(cx + 4 + p.getX(i), cz + 3 + p.getZ(i)) + 0.12)
  geo.computeVertexNormals()
  const m = new THREE.Mesh(
    geo,
    prep(new THREE.MeshStandardMaterial({ color: '#e07a2c', roughness: 1, alphaMap: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })),
  )
  m.position.set(4, 0, 3)
  m.renderOrder = 1
  return m
}

export function Apollo17({ terrain, prepare, eva = false }: { terrain: Terrain; prepare: Prep; eva?: boolean }) {
  const built = useMemo(() => {
    const M = makeMats(prepare)
    const flagTex = flagTexture()
    M.flag.map = flagTex
    const disc = softDisc()
    const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, true)
    beamGeo.translate(0, 0.5, 0)
    const beamMat = (c: THREE.Color) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    const fresh = beamMat(new THREE.Color(2.0, 1.45, 0.6))
    const seen = beamMat(new THREE.Color(0.55, 0.5, 0.42))
    const h = (x: number, z: number) => terrain.height(x, z)
    const root = new THREE.Group()
    const beams = new Map<string, THREE.Mesh>()
    const textures: THREE.Texture[] = [flagTex, disc]
    for (const it of APOLLO17) {
      const y = h(it.x, it.z)
      let obj: THREE.Object3D | null = null
      // アポロ17号の追体験（章7）では、着陸船（上の段つき）と月面車は本物の模型（LunarModule・LunarRover）が出る
      if (eva && (it.kind === 'lm' || it.kind === 'lrv')) continue
      if (it.kind === 'lm') {
        obj = descentStage(M)
        obj.rotation.y = 0.35
      } else if (it.kind === 'flag') {
        obj = flagModel(M)
        obj.rotation.y = -0.6
      } else if (it.kind === 'lrv') {
        // 着陸船のほう（西）を向けて止めてある
        obj = lunarRover(M)
        obj.rotation.y = Math.PI + 0.1
      } else if (it.kind === 'alsep') {
        obj = new THREE.Group()
        const cs = ALSEP_PARTS[0]
        for (const p of ALSEP_PARTS) {
          const part = alsepPart(p.id, M)
          part.position.set(p.x - cs.x, h(p.x, p.z) - y, p.z - cs.z)
          obj.add(part)
          if (p.id !== 'cs') {
            const pts = [0, 0.33, 0.66, 1].map((f) => {
              const x = cs.x + (p.x - cs.x) * f
              const z = cs.z + (p.z - cs.z) * f
              return new THREE.Vector3(x - cs.x, h(x, z) - y + 0.04, z - cs.z)
            })
            obj.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), M.cable))
          }
        }
      } else if (it.kind === 'station') {
        obj = new THREE.Group()
        if (it.feature === 'orange') obj.add(orangeSoil((x, z) => h(x, z) - y, it.x, it.z, disc, prepare))
        if (it.feature === 'split' || it.feature === 'boulders') obj.add(boulders(M, it.feature, (x, z) => h(x, z) - y, it.x, it.z, (it.no ?? 1) * 11))
        const tex = numberTexture(it.no ?? 0)
        textures.push(tex)
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }))
        sp.scale.set(3, 3, 1)
        sp.position.y = 5
        obj.add(sp)
      }
      if (!obj) continue
      obj.position.set(it.x, y, it.z)
      obj.userData.id = it.id
      root.add(obj)
      // 光の柱：観測点は遠くから見えるよう高く、着陸船のまわりは低く
      const beam = new THREE.Mesh(beamGeo, fresh)
      const tall = it.kind === 'station' ? 140 : 18
      beam.scale.set(it.kind === 'station' ? 1.6 : 0.6, tall, it.kind === 'station' ? 1.6 : 0.6)
      beam.position.set(it.x + (it.kind === 'station' ? 0 : 0), y - 0.5, it.z)
      beam.renderOrder = 3
      beam.frustumCulled = false
      root.add(beam)
      beams.set(it.id, beam)
    }
    return { root, beams, fresh, seen, M, textures, beamGeo }
  }, [terrain, prepare, eva])

  useEffect(
    () => () => {
      built.root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose()
          ;(o.material as THREE.Material).dispose()
        }
        if (o instanceof THREE.Sprite) o.material.dispose()
      })
      for (const m of Object.values(built.M)) m.dispose()
      built.fresh.dispose()
      built.seen.dispose()
      built.textures.forEach((t) => t.dispose())
    },
    [built],
  )

  const found = useHistoric((s) => s.found)
  useEffect(() => {
    for (const [id, b] of built.beams) b.material = found.includes(id) ? built.seen : built.fresh
  }, [found, built])

  const tick = useRef(0)
  useFrame((st, dt) => {
    built.fresh.opacity = 0.22 + 0.1 * Math.sin(st.clock.elapsedTime * 2.4)
    // 章7：光の柱は、次に向かう観測点だけ
    if (eva) {
      const e = useApolloEva.getState()
      const want = e.step === 'drive' || e.step === 'stop' ? EVA_STOPS[e.leg]?.id : null
      for (const [id, b] of built.beams) b.visible = id === want
      return
    }
    tick.current += dt
    if (tick.current < 0.25) return
    tick.current = 0
    if (useRover.getState().phase !== 'drive' || useRally.getState().phase !== 'off') return
    const { x, z } = roverPose
    // 見ているカードは、その史跡から 80 m 離れたら閉じる
    const card = APOLLO17.find((it) => it.id === useHistoric.getState().card)
    if (card && Math.hypot(card.x - x, card.z - z) > 80) useHistoric.setState({ card: null })
    let best: Historic | null = null
    for (const it of APOLLO17) {
      if (Math.hypot(it.x - x, it.z - z) < it.r && !useHistoric.getState().found.includes(it.id)) best = it
    }
    if (best) visitHistoric(best.id)
  })

  return <primitive object={built.root} />
}
