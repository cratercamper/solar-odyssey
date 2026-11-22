import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// 重力ジャンプの宇宙飛行士（components/surface/GravityJump.tsx）。形はこのアプリのオリジナルの船外活動服：
// 布の質感（織り目と縫い目）、固い胸の殻、関節のじゃばら、手首の回る金属リング、胸の操作箱とホース、
// 背中の生命維持装置、金色のバイザーとライト付きのヘルメット、厚い靴底の長靴。旗は付けない（世界のアプリなので）

export type Rig = {
  root: THREE.Group
  body: THREE.Group
  torso: THREE.Group
  shoulders: [THREE.Group, THREE.Group]
  elbows: [THREE.Group, THREE.Group]
  hips: [THREE.Group, THREE.Group]
  knees: [THREE.Group, THREE.Group]
  materials: THREE.MeshStandardMaterial[]
  /** 腰の高さ・もも・すねの長さ（m）。無ければ手作りの宇宙飛行士の値（HIP_Y, THIGH, SHIN） */
  legs?: { hipY: number; thigh: number; shin: number }
  /** 足の裏の傾き（正がつま先を上げる）。足首の骨があるモデルだけ使う */
  feet?: [number, number]
  /** 足首から靴の裏・かかと・つま先まで（m）。これがあると、かかとやつま先で地面に立つ高さを計算する */
  boot?: { sole: number; heel: number; toe: number }
  /** 関節の箱に書いた角度を、モデルの骨へ写す（骨の入ったモデルだけ） */
  update?: () => void
}

/** 立ったときの、地面から腰までの高さ（m） */
export const HIP_Y = 0.98
export const THIGH = 0.44
export const SHIN = 0.44

// ---- 布と小物の絵（一度だけ作って使い回す） ----------------------------------------------------

let fabricTex: { map: THREE.Texture; bump: THREE.Texture } | null = null
/** 白い布：細かい織り目と、ところどころの縫い目、少しの汚れ */
function fabric() {
  if (fabricTex) return fabricTex
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  const b = document.createElement('canvas')
  b.width = b.height = N
  const h = b.getContext('2d')!
  g.fillStyle = '#f1efe9'
  g.fillRect(0, 0, N, N)
  h.fillStyle = '#808080'
  h.fillRect(0, 0, N, N)
  // 織り目
  for (let y = 0; y < N; y += 2)
    for (let x = 0; x < N; x += 2) {
      const v = ((x + y) / 2) % 2 ? 140 : 116
      h.fillStyle = `rgb(${v},${v},${v})`
      h.fillRect(x, y, 2, 2)
      const n = 236 + Math.floor(Math.random() * 14)
      g.fillStyle = `rgb(${n},${n - 2},${n - 6})`
      g.fillRect(x, y, 2, 2)
    }
  // 縫い目（布をはぎ合わせたところ）
  for (const y of [40, 132, 214]) {
    h.fillStyle = '#3a3a3a'
    h.fillRect(0, y, N, 3)
    g.fillStyle = 'rgba(160,156,148,0.35)'
    g.fillRect(0, y, N, 2)
    for (let x = 0; x < N; x += 6) {
      g.fillStyle = 'rgba(130,126,120,0.35)'
      g.fillRect(x, y + 4, 3, 1)
      g.fillRect(x, y - 3, 3, 1)
    }
  }
  for (const x of [70, 190]) {
    h.fillStyle = '#3a3a3a'
    h.fillRect(x, 0, 3, N)
    g.fillStyle = 'rgba(160,156,148,0.3)'
    g.fillRect(x, 0, 2, N)
  }
  // うっすらした砂ぼこり
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(150,140,125,${0.04 + Math.random() * 0.06})`
    g.beginPath()
    g.arc(Math.random() * N, Math.random() * N, 4 + Math.random() * 18, 0, Math.PI * 2)
    g.fill()
  }
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  const bump = new THREE.CanvasTexture(b)
  for (const t of [map, bump]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 4
  }
  fabricTex = { map, bump }
  return fabricTex
}

let patchTex: THREE.Texture | null = null
/** 肩のワッペン：このアプリのオリジナルの絵（青い星と軌道、船） */
function patch() {
  if (patchTex) return patchTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#1b2a4a'
  g.beginPath()
  g.arc(64, 64, 62, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 6
  g.strokeStyle = '#e8c45a'
  g.stroke()
  const grad = g.createRadialGradient(54, 70, 4, 60, 76, 30)
  grad.addColorStop(0, '#9fd4ff')
  grad.addColorStop(1, '#2f6cc0')
  g.fillStyle = grad
  g.beginPath()
  g.arc(60, 76, 26, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#ffffff'
  g.lineWidth = 3
  g.beginPath()
  g.ellipse(64, 64, 48, 16, -0.45, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = '#ffd27a'
  g.beginPath()
  g.arc(100, 40, 6, 0, Math.PI * 2)
  g.fill()
  for (const [x, y] of [
    [30, 34],
    [44, 22],
    [92, 98],
  ]) {
    g.fillStyle = '#fff'
    g.fillRect(x, y, 3, 3)
  }
  patchTex = new THREE.CanvasTexture(c)
  patchTex.colorSpace = THREE.SRGBColorSpace
  return patchTex
}

// ---- 形の部品 ----------------------------------------------------------------------------

/** 回転体（[半径, 高さ] の点を上から下へ。y は 0 から下向きに） */
function lathe(points: [number, number][], mat: THREE.Material, seg = 24) {
  // 下から上の順にならべると、面が外を向く
  const pts = points.map(([r, y]) => new THREE.Vector2(r, y)).sort((a, b) => a.y - b.y)
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), mat)
  m.castShadow = true
  return m
}

/** じゃばら：細い輪をいくつか重ねる */
function bellows(r: number, n: number, gap: number, mat: THREE.Material, y0: number) {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.16, 6, 20), mat)
    t.rotation.x = Math.PI / 2
    t.position.y = y0 - i * gap
    g.add(t)
  }
  return g
}

/** 金属のリング（手首・首・足首の、回るところ） */
function ring(r: number, h: number, mat: THREE.Material, y: number) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24, 1, true), mat)
  m.position.y = y
  const lip = new THREE.Mesh(new THREE.TorusGeometry(r, h * 0.35, 6, 24), mat)
  lip.rotation.x = Math.PI / 2
  lip.position.y = y + h / 2
  const g = new THREE.Group()
  g.add(m, lip)
  return g
}

/** 手袋：手のひら、少し曲げた 4 本の指と親指、手首のカフ */
function glove(mat: THREE.Material, cuff: THREE.Material, side: number) {
  const g = new THREE.Group()
  const c = lathe(
    [
      [0.075, 0.02],
      [0.088, -0.02],
      [0.082, -0.07],
    ],
    cuff,
    16,
  )
  g.add(c)
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.11, 0.05, 2, 0.02), mat)
  palm.position.y = -0.12
  palm.castShadow = true
  g.add(palm)
  for (let f = 0; f < 4; f++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.045, 3, 8), mat)
    finger.position.set(-0.033 + f * 0.022, -0.19, 0.012)
    finger.rotation.x = 0.55
    g.add(finger)
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.035, 3, 8), mat)
  thumb.position.set(0.055 * side, -0.12, 0.03)
  thumb.rotation.set(0.5, 0, -0.7 * side)
  g.add(thumb)
  return g
}

// ---- 宇宙飛行士 ----------------------------------------------------------------------------

export function makeAstronaut(ghost: boolean): Rig {
  const tex = fabric()
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o)
  const suit = std({ color: ghost ? '#86b9ff' : '#ffffff', map: ghost ? null : tex.map, bumpMap: tex.bump, bumpScale: 0.6, roughness: 0.85 })
  suit.map?.repeat.set(1, 1)
  const hard = std({ color: ghost ? '#86b9ff' : '#f4f3ef', roughness: 0.38, metalness: 0.05 })
  const metal = std({ color: ghost ? '#6f9ee6' : '#b9bec6', roughness: 0.28, metalness: 0.9 })
  const dark = std({ color: ghost ? '#5f8fd6' : '#3c4048', roughness: 0.55, metalness: 0.3 })
  const rubber = std({ color: ghost ? '#6f9ee6' : '#8d8f94', roughness: 0.9 })
  const red = std({ color: ghost ? '#8fc2ff' : '#c8452f', roughness: 0.55 })
  const blue = std({ color: ghost ? '#8fc2ff' : '#2f6fd0', roughness: 0.4, metalness: 0.5 })
  const visor = std({ color: ghost ? '#a9d4ff' : '#e0a83e', roughness: 0.06, metalness: 1, envMapIntensity: 2 })
  const lamp = std({ color: '#fff6dc', emissive: ghost ? '#000' : '#fff3c8', emissiveIntensity: ghost ? 0 : 1.4, roughness: 0.3 })
  const badge = std({ map: ghost ? null : patch(), color: ghost ? '#86b9ff' : '#ffffff', roughness: 0.6 })
  const materials = [suit, hard, metal, dark, rubber, red, blue, visor, lamp, badge]
  if (ghost)
    for (const m of materials) {
      m.transparent = true
      m.opacity = 0.5
      m.depthWrite = false
      m.emissive = new THREE.Color('#2a5aa8')
      m.emissiveIntensity = 0.35
    }

  const root = new THREE.Group()
  const body = new THREE.Group()
  body.position.y = HIP_Y
  root.add(body)
  const torso = new THREE.Group()
  body.add(torso)

  // 腰：布のパンツの上の部分と、腰の金属リング
  const brief = lathe(
    [
      [0.2, 0.14],
      [0.232, 0.06],
      [0.238, -0.04],
      [0.225, -0.1],
      [0.16, -0.12],
    ],
    suit,
  )
  brief.scale.z = 0.82
  torso.add(brief)
  const waist = ring(0.215, 0.05, metal, 0.15)
  waist.scale.z = 0.82
  torso.add(waist)
  // 腹の布（じゃばら気味に）
  const belly = bellows(0.21, 3, 0.035, suit, 0.25)
  belly.scale.z = 0.8
  torso.add(belly)
  // 固い胸の殻（肩の幅が広く、少し前に張り出す）
  const hut = lathe(
    [
      [0.17, 0.69],
      [0.27, 0.64],
      [0.31, 0.52],
      [0.3, 0.38],
      [0.25, 0.28],
      [0.22, 0.26],
    ],
    hard,
    28,
  )
  hut.scale.set(1.08, 1, 0.78)
  torso.add(hut)
  // 胸の操作箱（つまみ・ボタン・小さな画面）
  const dcm = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.13, 0.09, 2, 0.02), hard)
  dcm.position.set(0, 0.42, 0.24)
  dcm.rotation.x = -0.18
  dcm.castShadow = true
  torso.add(dcm)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.04), dark)
  screen.position.set(-0.06, 0.435, 0.29)
  screen.rotation.x = -0.18
  torso.add(screen)
  for (const [x, m] of [
    [0.03, blue],
    [0.075, red],
    [0.11, dark],
  ] as const) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.022, 10), m)
    knob.rotation.x = Math.PI / 2 - 0.18
    knob.position.set(x, 0.43, 0.29)
    torso.add(knob)
  }
  // 名札
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.035), dark)
  tag.position.set(-0.13, 0.55, 0.24)
  tag.rotation.set(-0.25, -0.35, 0)
  torso.add(tag)
  // 胸の操作箱から背中へのホース
  for (const side of [1, -1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.12 * side, 0.4, 0.27),
      new THREE.Vector3(0.24 * side, 0.32, 0.2),
      new THREE.Vector3(0.3 * side, 0.3, 0.02),
      new THREE.Vector3(0.24 * side, 0.36, -0.18),
    ])
    const hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.016, 8), side > 0 ? blue : red)
    torso.add(hose)
  }

  // 背中の生命維持装置：角の丸い箱、ふたの線、横の通気口、上のアンテナ
  const pack = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.62, 0.22, 3, 0.05), hard)
  pack.position.set(0, 0.46, -0.3)
  pack.castShadow = true
  torso.add(pack)
  const lid = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.2, 0.05, 2, 0.02), hard)
  lid.position.set(0, 0.32, -0.42)
  torso.add(lid)
  for (let i = 0; i < 5; i++) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.12, 0.012), dark)
    vent.position.set(-0.08 + i * 0.04, 0.6, -0.414)
    torso.add(vent)
  }
  for (const side of [1, -1]) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 14), metal)
    can.position.set(0.25 * side, 0.46, -0.32)
    torso.add(can)
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 6), metal)
  antenna.position.set(0.17, 0.86, -0.34)
  torso.add(antenna)
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), red)
  tip.position.set(0.17, 0.97, -0.34)
  torso.add(tip)

  // 首の金属リングとヘルメット
  torso.add(ring(0.16, 0.05, metal, 0.7))
  const helmet = new THREE.Group()
  helmet.position.set(0, 0.88, 0.0)
  torso.add(helmet)
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.22, 40, 28), hard)
  shell.scale.set(1, 1.04, 1.05)
  shell.castShadow = true
  helmet.add(shell)
  // バイザーのふち（顔の前の窓のまわり）
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.022, 10, 40, Math.PI * 1.2), hard)
  rim.position.set(0, 0.0, 0.17)
  rim.rotation.set(0, 0, -Math.PI * 0.1)
  rim.scale.set(1, 0.92, 1)
  helmet.add(rim)
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.212, 40, 28, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.22, Math.PI * 0.45), visor)
  // 殻より少し前に出して、ふくらんだバイザーに見せる
  face.scale.set(1.04, 1.06, 1.1)
  face.position.z = 0.035
  helmet.add(face)
  // ヘルメットの横のライトとカメラ
  for (const side of [1, -1]) {
    const box = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.07, 0.11, 2, 0.012), hard)
    box.position.set(0.215 * side, 0.06, 0.04)
    helmet.add(box)
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), lamp)
    l.position.set(0.215 * side, 0.06, 0.097)
    helmet.add(l)
  }
  const cam = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 12), dark)
  cam.rotation.x = Math.PI / 2
  cam.position.set(0.215, -0.01, 0.07)
  helmet.add(cam)

  // 腕：肩のじゃばら、上腕、ひじのじゃばら、前腕、手首のリング、手袋
  const shoulders: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()]
  const elbows: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()]
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const sh = shoulders[i]
    sh.position.set(0.35 * side, 0.55, 0)
    torso.add(sh)
    sh.add(bellows(0.105, 3, 0.03, suit, 0.0))
    const upper = lathe(
      [
        [0.1, -0.06],
        [0.104, -0.14],
        [0.094, -0.24],
        [0.088, -0.28],
      ],
      suit,
      18,
    )
    sh.add(upper)
    // 腕の色の帯（右腕だけ赤：チームの見分け）と、左肩のワッペン
    if (side < 0) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.102, 0.1, 0.035, 18, 1, true), red)
      band.position.y = -0.16
      sh.add(band)
    } else {
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), badge)
      p.position.set(0.098, -0.11, 0)
      p.rotation.y = Math.PI / 2
      sh.add(p)
    }
    const el = elbows[i]
    el.position.y = -0.3
    sh.add(el)
    el.add(bellows(0.088, 3, 0.026, suit, 0.02))
    const fore = lathe(
      [
        [0.088, -0.05],
        [0.086, -0.14],
        [0.074, -0.22],
      ],
      suit,
      18,
    )
    el.add(fore)
    el.add(ring(0.076, 0.035, i === 0 ? blue : red, -0.23))
    const hand = glove(rubber, dark, side)
    hand.position.y = -0.24
    el.add(hand)
  }

  // 脚：ももの付け根のリング、もも、ひざのじゃばら、すね、足首のリング、厚い靴底の長靴
  const hips: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()]
  const knees: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()]
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const hp = hips[i]
    hp.position.set(0.125 * side, 0, 0)
    body.add(hp)
    hp.add(
      lathe(
        [
          [0.125, -0.02],
          [0.13, -0.12],
          [0.118, -0.3],
          [0.105, -0.4],
        ],
        suit,
        18,
      ),
    )
    const kn = knees[i]
    kn.position.y = -THIGH
    hp.add(kn)
    kn.add(bellows(0.105, 3, 0.028, suit, 0.04))
    kn.add(
      lathe(
        [
          [0.105, -0.02],
          [0.108, -0.12],
          [0.092, -0.3],
          [0.085, -0.33],
        ],
        suit,
        18,
      ),
    )
    kn.add(ring(0.088, 0.03, metal, -0.33))
    // 長靴：甲の丸い上の部分と、厚い靴底
    const upperBoot = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.12, 0.27, 3, 0.05), hard)
    upperBoot.position.set(0, -SHIN + 0.06, 0.04)
    upperBoot.castShadow = true
    kn.add(upperBoot)
    const sole = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.045, 0.3, 2, 0.015), dark)
    sole.position.set(0, -SHIN - 0.005, 0.045)
    sole.castShadow = true
    kn.add(sole)
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.025, 0.04), side > 0 ? blue : red)
    strap.position.set(0, -SHIN + 0.08, 0.12)
    kn.add(strap)
  }

  if (ghost) root.traverse((o) => (o.castShadow = false))
  return { root, body, torso, shoulders, elbows, hips, knees, materials }
}
