import * as THREE from 'three'
import { loadSuit, makeSuitRig } from '../surface/suitModel'

// 司令船（CM）の中：打ち上げのときの 3 人（左から船長サーナン・司令船操縦士エバンス・着陸船操縦士シュミット）。
// 3 人は背中を下（熱よけの側）にして寝た姿勢で座席に収まり、顔の上に計器盤（主表示盤、MDC）がある。
// 窓は打ち上げのあいだ白いカバー（BPC）でふさがれているので、明かりは計器盤の照明と表示だけ。
//
// 座標（CM の床の真ん中が原点、ロケットの局所の座標と同じ向き）：y が機首の向き、x が 3 人の並び、
// z は 3 人の頭（-z）から足（+z）へ。宇宙服は public/models/astronaut.glb（地表の宇宙飛行士と同じ）を座らせる。

/** CM の床の、ロケットの中での高さ（m、ロケットの根元から） */
export const CABIN_Y = 97.75
/** 室内のカメラの置き場所（CM の座標）：着陸船操縦士の頭の横、計器盤のわきから、寝た姿勢の 3 人を斜めに見る */
export const CABIN_EYE = new THREE.Vector3(0.9, 1.15, -0.7)
export const CABIN_LOOK = new THREE.Vector3(-0.5, 0.7, 0.2)

/** 前を見る窓（ランデブーの窓）：+z の向きの壁、高さ WIN_Y のまわりに開ける。宇宙に出てからの「船長の窓」の眺めに使う */
const WIN_Y = 1.36
const WIN_A = 0.24
const WIN_H = 0.2
/** 窓のカメラ（CM の座標）と、見る向き（機首の向きに、少し外へ） */
export const CM_WIN_EYE = new THREE.Vector3(0, 1.12, 0.66)
export const CM_WIN_DIR = new THREE.Vector3(0, 0.6, 0.8).normalize()

const R0 = 1.86
const R1 = 0.55
const HT = 2.25
/** 円すいの壁の、高さ y での半径 */
const wallR = (y: number) => R0 + (R1 - R0) * (y / HT)

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

/** 壁の内張り（白っぽい布の板と、継ぎ目・留め具） */
export function liningTexture() {
  const [c, g] = canvas(512, 512)
  g.fillStyle = '#b9b6ad'
  g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const x = i * 128 + 4
      const y = j * 128 + 4
      const k = 165 + Math.floor(Math.random() * 24)
      g.fillStyle = `rgb(${k},${k - 3},${k - 10})`
      g.fillRect(x, y, 120, 120)
      g.fillStyle = 'rgba(40,40,40,0.5)'
      for (const [dx, dy] of [
        [8, 8],
        [112, 8],
        [8, 112],
        [112, 112],
      ])
        g.fillRect(x + dx - 2, y + dy - 2, 4, 4)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(10, 3)
  return t
}

/** 計器盤（主表示盤）の絵：灰色の板に、スイッチの列・丸い計器・警告灯・誘導計算機の表示。光る所は別の絵（emissive） */
export function panelTextures() {
  const W = 2048
  const H = 640
  const [c, g] = canvas(W, H)
  const [e, ge] = canvas(W, H)
  ge.fillStyle = '#000'
  ge.fillRect(0, 0, W, H)
  g.fillStyle = '#2f3236'
  g.fillRect(0, 0, W, H)
  // 3 つの区画（船長・まん中・着陸船操縦士の前）
  const sections = [
    [20, 640],
    [700, 640],
    [1380, 648],
  ]
  for (const [x0, w] of sections) {
    g.fillStyle = '#4a4e53'
    g.fillRect(x0, 20, w, H - 40)
    // 小さな板に分ける
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        g.strokeStyle = '#25282b'
        g.lineWidth = 3
        g.strokeRect(x0 + 8 + (i * (w - 16)) / 4, 28 + (j * (H - 56)) / 3, (w - 16) / 4 - 6, (H - 56) / 3 - 6)
      }
    }
  }
  const rnd = (a: number, b: number) => a + Math.random() * (b - a)
  // スイッチの列（銀のつまみと影）
  const toggles = (x: number, y: number, n: number, m: number, dx = 26, dy = 34) => {
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) {
        const px = x + i * dx
        const py = y + j * dy
        g.fillStyle = '#1b1d1f'
        g.beginPath()
        g.arc(px, py, 8, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#d8dadc'
        g.fillRect(px - 2.5, py - (Math.random() < 0.5 ? 14 : 0), 5, 14)
        g.fillStyle = '#e8e8e0'
        g.fillRect(px - 9, py + 12, 18, 3)
      }
  }
  // 丸い計器（黒い文字盤、白い目盛り、針）
  const gauge = (x: number, y: number, r: number) => {
    g.fillStyle = '#111'
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#ddd'
    g.lineWidth = 2
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI * (0.8 + (1.4 * k) / 10)
      g.beginPath()
      g.moveTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75)
      g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92)
      g.stroke()
    }
    const a = Math.PI * rnd(0.9, 2.1)
    g.strokeStyle = '#f2f2f2'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8)
    g.stroke()
    g.strokeStyle = '#777'
    g.lineWidth = 4
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.stroke()
  }
  // 縦の帯の計器（燃料・圧力）
  const tape = (x: number, y: number, w: number, h: number) => {
    g.fillStyle = '#0d0d0d'
    g.fillRect(x, y, w, h)
    g.fillStyle = '#e9e9e2'
    for (let k = 0; k < 8; k++) g.fillRect(x + 3, y + 6 + (k * (h - 12)) / 7, w * 0.4, 2)
    ge.fillStyle = '#ffb347'
    ge.fillRect(x + w * 0.55, y + rnd(0.2, 0.7) * h, w * 0.35, 4)
  }
  // 船長の前：姿勢の球（別の立体）・計器・スイッチ
  for (let k = 0; k < 4; k++) gauge(90 + k * 78, 110, 30)
  toggles(60, 470, 20, 3)
  tape(430, 80, 26, 150)
  tape(466, 80, 26, 150)
  tape(502, 80, 26, 150)
  // まん中：警告灯（大きなマス目）・誘導計算機の表示・時計
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 4; j++) {
      const x = 760 + i * 60
      const y = 60 + j * 34
      g.fillStyle = '#c7c2b0'
      g.fillRect(x, y, 54, 28)
      const lit = Math.random() < 0.12
      if (lit) {
        ge.fillStyle = Math.random() < 0.5 ? '#ffae2a' : '#ff3b2a'
        ge.fillRect(x + 2, y + 2, 50, 24)
      }
    }
  // 誘導計算機の表示（緑に光る数字）
  g.fillStyle = '#121512'
  g.fillRect(1080, 220, 220, 250)
  ge.fillStyle = '#7dff9a'
  ge.font = 'bold 34px monospace'
  ge.fillText('16   00', 1100, 262)
  ge.fillText('+00000', 1100, 330)
  ge.fillText('+00019', 1100, 390)
  ge.fillText('-00004', 1100, 450)
  // 押しボタン（キー）
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 3; j++) {
      g.fillStyle = '#5a5d60'
      g.fillRect(760 + i * 44, 360 + j * 46, 38, 38)
      g.fillStyle = '#d4d4cc'
      g.fillRect(768 + i * 44, 372 + j * 46, 22, 4)
    }
  toggles(760, 260, 12, 2)
  // 打ち上げからの時計（赤い数字）
  g.fillStyle = '#100606'
  g.fillRect(820, 540, 300, 60)
  ge.fillStyle = '#ff4030'
  ge.font = 'bold 40px monospace'
  ge.fillText('00 00 25', 838, 585)
  // 着陸船操縦士の前：電気・環境の計器
  for (let k = 0; k < 6; k++) gauge(1450 + (k % 3) * 90, 110 + Math.floor(k / 3) * 95, 34)
  for (let k = 0; k < 5; k++) tape(1740 + k * 36, 80, 26, 170)
  toggles(1420, 360, 22, 4)
  // 小さな表示灯
  for (let k = 0; k < 40; k++) {
    const x = rnd(40, W - 40)
    const y = rnd(30, H - 30)
    ge.fillStyle = Math.random() < 0.6 ? '#ffffff' : '#ffe4a0'
    ge.fillRect(x, y, 5, 5)
  }
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  const emissive = new THREE.CanvasTexture(e)
  emissive.colorSpace = THREE.SRGBColorSpace
  return { map, emissive }
}

/** 姿勢の球（FDAI）：上が白、下が黒の球に、目盛りの線 */
export function ballTexture() {
  const [c, g] = canvas(512, 256)
  g.fillStyle = '#e8e6de'
  g.fillRect(0, 0, 512, 128)
  g.fillStyle = '#1a1a1a'
  g.fillRect(0, 128, 512, 128)
  g.strokeStyle = '#ff7a1a'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(0, 128)
  g.lineTo(512, 128)
  g.stroke()
  g.strokeStyle = '#777'
  g.lineWidth = 1.5
  for (let i = 0; i < 16; i++) {
    g.beginPath()
    g.moveTo(i * 32, 0)
    g.lineTo(i * 32, 256)
    g.stroke()
  }
  for (let j = 1; j < 8; j++) {
    g.beginPath()
    g.moveTo(0, j * 32)
    g.lineTo(512, j * 32)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export type Cabin = {
  group: THREE.Group
  /** 中が見えるときだけ出す（明かりの数を変えると素材を作り直すので、明かりは強さ 0 で消す） */
  show: (on: boolean) => void
  dispose: () => void
}

/** 司令船の中を組み立てる（宇宙服の 3 人は、読み込めたら後から座らせる） */
export function buildCabin(): Cabin {
  const root = new THREE.Group()
  root.position.y = CABIN_Y
  const group = new THREE.Group()
  root.add(group)
  const disposables: { dispose: () => void }[] = []
  const keep = <T extends { dispose: () => void }>(x: T) => {
    disposables.push(x)
    return x
  }

  // 円すいの壁（内側を見る）と床
  const lining = keep(liningTexture())
  const wallMat = keep(new THREE.MeshStandardMaterial({ map: lining, roughness: 0.85, side: THREE.BackSide }))
  // 壁は、窓のところだけ三角形を抜く
  const wallGeo = keep(new THREE.CylinderGeometry(R1, R0, HT, 120, 40, true))
  {
    const pos = wallGeo.attributes.position as THREE.BufferAttribute
    const idx = wallGeo.index!
    const keepTri: number[] = []
    const rimTri: number[] = []
    const c = new THREE.Vector3()
    const v = new THREE.Vector3()
    // 網目の四角（三角形 2 つ）ごとに、その真ん中で決める
    for (let i = 0; i < idx.count; i += 6) {
      c.set(0, 0, 0)
      for (let k = 0; k < 6; k++) c.add(v.fromBufferAttribute(pos, idx.getX(i + k)))
      c.multiplyScalar(1 / 6)
      const a = Math.atan2(c.x, c.z)
      const dy = c.y + HT / 2 - WIN_Y
      // 四角い窓（壁の網目にそろえるので、ふちがまっすぐ）と、そのまわりの黒い枠
      const e = Math.max(Math.abs(a) / WIN_A, Math.abs(dy) / WIN_H)
      if (e < 1) continue
      const list = e < 1.35 ? rimTri : keepTri
      for (let k = 0; k < 6; k++) list.push(idx.getX(i + k))
    }
    // 穴のまわりは、黒い窓枠の素材（グループ 1）
    wallGeo.setIndex([...keepTri, ...rimTri])
    wallGeo.clearGroups()
    wallGeo.addGroup(0, keepTri.length, 0)
    wallGeo.addGroup(keepTri.length, rimTri.length, 1)
  }
  const rimMat = keep(new THREE.MeshStandardMaterial({ color: '#1c1d20', roughness: 0.6, side: THREE.BackSide }))
  const wall = new THREE.Mesh(wallGeo, [wallMat, rimMat])
  wall.position.y = HT / 2
  group.add(wall)
  const floorMat = keep(new THREE.MeshStandardMaterial({ color: '#77756e', roughness: 0.9 }))
  const floor = new THREE.Mesh(keep(new THREE.CircleGeometry(R0, 48)), floorMat)
  floor.rotation.x = -Math.PI / 2
  group.add(floor)
  const top = new THREE.Mesh(keep(new THREE.CircleGeometry(R1, 32)), floorMat)
  top.rotation.x = Math.PI / 2
  top.position.y = HT
  group.add(top)

  // 計器盤：3 人の顔の上。頭の側へ少し傾けて、目のほうを向ける
  const { map, emissive } = panelTextures()
  keep(map)
  keep(emissive)
  const panelMat = keep(new THREE.MeshStandardMaterial({ map, emissiveMap: emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.6, roughness: 0.6, metalness: 0.3 }))
  const panel = new THREE.Group()
  panel.position.set(0, 1.24, -0.3)
  // 板の表（+z）を、下と頭のほうへ向ける
  panel.rotation.x = Math.PI / 2 + 0.5
  group.add(panel)
  // 3 枚を少し折って、まわりから囲むように
  const sectW = 0.62
  for (let k = 0; k < 3; k++) {
    const g = keep(new THREE.PlaneGeometry(sectW, 0.62))
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setX(i, (k + uv.getX(i)) / 3)
    const m = new THREE.Mesh(g, panelMat)
    const side = k - 1
    m.position.set(side * (sectW * 0.97), 0, Math.abs(side) * 0.1)
    m.rotation.y = -side * 0.32
    panel.add(m)
    // 板のうしろの箱（厚み）
    const back = new THREE.Mesh(keep(new THREE.BoxGeometry(sectW, 0.62, 0.18)), floorMat)
    back.position.set(0, 0, -0.095)
    m.add(back)
  }
  // 姿勢の球（船長と、まん中の前）
  const ballMat = keep(new THREE.MeshStandardMaterial({ map: keep(ballTexture()), roughness: 0.4 }))
  for (const x of [-0.58, 0.02]) {
    const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(0.065, 24, 16)), ballMat)
    ball.position.set(x, -0.05, 0.03)
    ball.rotation.set(0.4, 0.3, 0.2)
    panel.add(ball)
    const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.075, 0.012, 8, 24)), floorMat)
    ring.position.copy(ball.position)
    panel.add(ring)
  }

  // 座席（アルミの枠と、紺の布）。背もたれが床と平ら、ひざの下を持ち上げる
  const frameMat = keep(new THREE.MeshStandardMaterial({ color: '#a8acb0', roughness: 0.35, metalness: 0.8 }))
  const clothMat = keep(new THREE.MeshStandardMaterial({ color: '#3a4250', roughness: 0.95 }))
  const seatBack = keep(new THREE.BoxGeometry(0.56, 0.06, 0.95))
  const seatLeg = keep(new THREE.BoxGeometry(0.5, 0.05, 0.45))
  const rail = keep(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8))
  for (const x of [-0.66, 0, 0.66]) {
    const back = new THREE.Mesh(seatBack, clothMat)
    back.position.set(x, 0.42, -0.42)
    group.add(back)
    const legs = new THREE.Mesh(seatLeg, clothMat)
    legs.position.set(x, 0.78, 0.32)
    legs.rotation.x = 0.25
    group.add(legs)
    for (const dx of [-0.29, 0.29]) {
      const r = new THREE.Mesh(rail, frameMat)
      r.rotation.x = Math.PI / 2
      r.position.set(x + dx, 0.38, -0.4)
      group.add(r)
      const post = new THREE.Mesh(rail, frameMat)
      post.scale.y = 0.4
      post.position.set(x + dx, 0.2, 0.05)
      group.add(post)
    }
  }

  // ふさがれた窓（白いカバーの裏で暗い）と、ハッチ
  const glassMat = keep(new THREE.MeshStandardMaterial({ color: '#0b0f14', roughness: 0.08, metalness: 0.6 }))
  const winGeo = keep(new THREE.PlaneGeometry(0.26, 0.3))
  for (const [a, y] of [
    [Math.PI * 0.72, 1.15],
    [Math.PI * 0.28, 1.15],
    [Math.PI * 1.05, 0.75],
    [-Math.PI * 0.05, 0.75],
  ]) {
    const r = wallR(y) - 0.02
    const w = new THREE.Mesh(winGeo, glassMat)
    w.position.set(Math.cos(a) * r, y, -Math.sin(a) * r)
    w.lookAt(0, y + 0.3, 0)
    group.add(w)
  }

  // 明かり：計器盤を照らす白い照明と、表示の照り返し
  const lights: [THREE.PointLight, number][] = []
  for (const [col, k, x, y, z] of [
    ['#fff1dc', 2.6, 0, 1.0, 0.55],
    ['#cfd8ff', 1.2, -0.8, 1.3, -0.6],
    ['#ffd9a8', 1.8, 0, 1.0, -0.25],
  ] as [string, number, number, number, number][]) {
    const l = new THREE.PointLight(col, 0, 0, 2)
    l.position.set(x, y, z)
    root.add(l)
    lights.push([l, k])
  }
  group.visible = false

  // 宇宙服の 3 人：寝た姿勢で、ひざを上げて座席に収まる
  let alive = true
  void loadSuit().then(async (src) => {
    if (!src || !alive) return
    for (const x of [-0.66, 0, 0.66]) {
      const rig = await makeSuitRig(src, false)
      if (!rig || !alive) return
      for (let i = 0; i < 2; i++) {
        rig.hips[i].rotation.x = -1.45
        rig.knees[i].rotation.x = 1.5
        // 腕はからだの横に下ろし、ひじを曲げて手をももの上に
        rig.shoulders[i].rotation.x = 0.25
        rig.shoulders[i].rotation.z = (i === 0 ? 1 : -1) * 0.3
        rig.elbows[i].rotation.x = -0.5
      }
      rig.update?.()
      // 立った姿から、頭を -z、顔を上（+y）へ
      const holder = new THREE.Group()
      holder.add(rig.root)
      rig.root.position.y = -(rig.legs?.hipY ?? 0.98)
      holder.rotation.x = -Math.PI / 2
      holder.position.set(x, 0.58, 0.06)
      group.add(holder)
      for (const m of rig.materials) disposables.push(m)
    }
  })

  return {
    group: root,
    show: (on) => {
      group.visible = on
      for (const [l, k] of lights) l.intensity = on ? k : 0
    },
    dispose: () => {
      alive = false
      for (const d of disposables) d.dispose()
    },
  }
}
