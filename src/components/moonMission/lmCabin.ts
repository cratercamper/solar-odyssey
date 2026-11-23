import * as THREE from 'three'
import { loadSuit, makeSuitRig } from '../surface/suitModel'
import { liningTexture, panelTextures, ballTexture } from './cmCabin'

// 着陸船（LM）の乗員室の中：降りていくあいだ、船長サーナン（左）と着陸船操縦士シュミット（右）は立ったまま、
// 前の三角の窓から月面を見る。2 人のあいだ（前のまん中）に計器盤、その下に誘導計算機のキーボード。
// 座標は着陸船のモデル（public/models/apollo.glb の LM）と同じ：y が上、-z が前（窓の側）、x が右。
// 窓の形と位置は tools/blender/build_apollo.py の ascent_stage と合わせてある。

/** 乗員室の床の高さ */
const FLOOR = 3.32
/** 窓の面：t=0（下のふち）が高さ 4.55・前 -1.6、t=1（上のふち）が高さ 5.25・前 -1.28 */
const WIN_Y0 = 4.55
const WIN_Z0 = -1.6
const WIN_DY = 0.7
const WIN_DZ = 0.32
const WIN_LEN = Math.hypot(WIN_DY, WIN_DZ)

/** 船長の目（船長のからだは描かない）：左の三角の窓から月面を見下ろす。右に計器盤と着陸船操縦士 */
export const LM_EYE = new THREE.Vector3(-0.6, 4.95, -1.12)
export const LM_LOOK = new THREE.Vector3(-0.62, 4.45, -3.0)

/**
 * 骨で曲げた宇宙服を、ふつうの（骨の無い）形に焼きこむ。
 * 月のまわりの座標は 1,700 km もあるので、骨の計算（32 ビットの小数）だと形がくずれる。ポーズは動かさないので、一度だけ CPU で曲げておく
 */
export function bakePose(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const out = new THREE.Group()
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const v = new THREE.Vector3()
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh
    if (!sm.isMesh) return
    const src = sm.geometry
    const pos = src.attributes.position as THREE.BufferAttribute
    const arr = new Float32Array(pos.count * 3)
    const toRoot = new THREE.Matrix4().multiplyMatrices(inv, sm.matrixWorld)
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      if (sm.isSkinnedMesh) sm.applyBoneTransform(i, v)
      v.applyMatrix4(toRoot)
      arr[i * 3] = v.x
      arr[i * 3 + 1] = v.y
      arr[i * 3 + 2] = v.z
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv)
    if (src.index) g.setIndex(src.index)
    for (const grp of src.groups) g.addGroup(grp.start, grp.count, grp.materialIndex)
    g.computeVertexNormals()
    out.add(new THREE.Mesh(g, sm.material))
  })
  return out
}

export type LmCabin = { group: THREE.Group; show: (on: boolean) => void; dispose: () => void }

export function buildLmCabin(): LmCabin {
  const group = new THREE.Group()
  group.matrixAutoUpdate = false
  const body = new THREE.Group()
  group.add(body)
  body.visible = false
  const disposables: { dispose: () => void }[] = []
  const keep = <T extends { dispose: () => void }>(x: T) => {
    disposables.push(x)
    return x
  }

  const lining = keep(liningTexture())
  lining.repeat.set(3, 2)
  const wallMat = keep(new THREE.MeshStandardMaterial({ map: lining, roughness: 0.85, color: '#b4b0a6' }))
  const darkMat = keep(new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.7, metalness: 0.3 }))
  const floorMat = keep(new THREE.MeshStandardMaterial({ color: '#55575a', roughness: 0.9 }))

  // 窓のある前の面（斜め）：三角の穴が 2 つ
  const shape = new THREE.Shape()
  const T0 = -0.05
  const T1 = 1.05
  shape.moveTo(-1.2, T0 * WIN_LEN)
  shape.lineTo(1.2, T0 * WIN_LEN)
  shape.lineTo(1.0, T1 * WIN_LEN)
  shape.lineTo(-1.0, T1 * WIN_LEN)
  shape.closePath()
  for (const s of [-1, 1]) {
    const tri = new THREE.Path()
    const pts: [number, number][] = [
      [s * 0.2, 0.1],
      [s * 1.0, 0.1],
      [s * 0.3, 0.86],
    ]
    if (s < 0) pts.reverse()
    tri.moveTo(pts[0][0], pts[0][1] * WIN_LEN)
    tri.lineTo(pts[1][0], pts[1][1] * WIN_LEN)
    tri.lineTo(pts[2][0], pts[2][1] * WIN_LEN)
    tri.closePath()
    shape.holes.push(tri)
  }
  const front = new THREE.Mesh(keep(new THREE.ShapeGeometry(shape)), wallMat)
  // 板の y を窓の面の上り（上へ、うしろへ倒れる）に、表（+z）を中へ向ける
  front.rotation.x = Math.atan2(WIN_DZ, WIN_DY)
  front.position.set(0, WIN_Y0, WIN_Z0 + 0.03)
  body.add(front)
  // 窓のふちの黒い枠（三角の縁取り）
  const frameMat = keep(new THREE.MeshBasicMaterial({ color: '#0b0b0c' }))
  for (const s of [-1, 1]) {
    const pts = [
      [s * 0.2, 0.1],
      [s * 1.0, 0.1],
      [s * 0.3, 0.86],
    ].map(([x, t]) => new THREE.Vector3(x, WIN_Y0 + WIN_DY * t, WIN_Z0 + WIN_DZ * t + 0.05))
    const g = keep(new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]))
    const line = new THREE.Line(g, frameMat)
    body.add(line)
    // 着陸地点を指す目盛り（LPD）：船長の窓だけ、ガラスの上の縦の線と横の刻み
    if (s < 0) {
      const lpd: THREE.Vector3[] = []
      const p = (x: number, t: number) => new THREE.Vector3(x, WIN_Y0 + WIN_DY * t, WIN_Z0 + WIN_DZ * t + 0.04)
      lpd.push(p(-0.42, 0.15), p(-0.42, 0.8))
      for (let k = 0; k < 8; k++) lpd.push(p(-0.46, 0.2 + k * 0.08), p(-0.38, 0.2 + k * 0.08))
      const lg = keep(new THREE.BufferGeometry().setFromPoints(lpd))
      body.add(new THREE.LineSegments(lg, keep(new THREE.LineBasicMaterial({ color: '#d8d0b0', transparent: true, opacity: 0.55 }))))
    }
  }
  // 窓より下の前の壁（縦）と、床・天井・横の壁
  const lower = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.4, WIN_Y0 - FLOOR)), wallMat)
  lower.position.set(0, (WIN_Y0 + FLOOR) / 2, WIN_Z0 + 0.04)
  body.add(lower)
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.6, 2.4)), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, FLOOR, -0.4)
  body.add(floor)
  const ceil = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.4, 2.0)), wallMat)
  ceil.rotation.x = Math.PI / 2
  ceil.position.set(0, 5.55, -0.3)
  body.add(ceil)
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.2, 2.3)), wallMat)
    side.rotation.y = -s * Math.PI / 2
    side.position.set(s * 1.2, FLOOR + 1.15, -0.5)
    body.add(side)
    // 横の壁の回路しゃ断器の板（黒い点の並び）
    const cb = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.9, 0.55)), darkMat)
    cb.rotation.y = -s * (Math.PI / 2 - 0.35)
    cb.position.set(s * 1.1, 4.95, -0.95)
    body.add(cb)
  }

  // 前のまん中の計器盤（2 人のあいだ）と、その下の誘導計算機の台
  const { map, emissive } = panelTextures()
  keep(map)
  keep(emissive)
  const panelMat = keep(new THREE.MeshStandardMaterial({ map, emissiveMap: emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.4, roughness: 0.6, metalness: 0.3 }))
  const panels: [number, number, number, number, number, number][] = [
    // x, y, z, 幅, 高さ, 絵の区画（0〜2）
    [0, 4.78, -1.36, 0.62, 0.62, 0],
    [0, 4.2, -1.45, 0.66, 0.5, 2],
    [0, 3.72, -1.25, 0.6, 0.45, 1],
  ]
  for (const [x, y, z, w, h, k] of panels) {
    const g = keep(new THREE.PlaneGeometry(w, h))
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setX(i, (k + uv.getX(i)) / 3)
    const m = new THREE.Mesh(g, panelMat)
    m.position.set(x, y, z)
    m.rotation.x = k === 1 ? -0.6 : -0.15
    body.add(m)
    const back = new THREE.Mesh(keep(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.2)), darkMat)
    back.position.set(0, 0, -0.105)
    m.add(back)
  }
  // 2 人の前の姿勢の球
  const ballMat = keep(new THREE.MeshStandardMaterial({ map: keep(ballTexture()), roughness: 0.4 }))
  for (const x of [-0.17, 0.17]) {
    const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(0.06, 24, 16)), ballMat)
    ball.position.set(x, 4.88, -1.3)
    ball.rotation.set(0.2, 0.4, 0.1)
    body.add(ball)
  }
  // 手すり（2 人は立ったまま、ひもで床につながる）と、操縦かん
  const railMat = keep(new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.35, metalness: 0.8 }))
  const rail = keep(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 8))
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(rail, railMat)
    r.rotation.z = Math.PI / 2
    r.position.set(s * 0.85, 4.35, -1.1)
    body.add(r)
    const stick = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.025, 0.03, 0.22, 8)), darkMat)
    stick.position.set(s * 0.72, 4.3, -1.05)
    body.add(stick)
  }

  // 明かり（中の照明と、計器の照り返し）。外の太陽は窓から入る
  const lights: [THREE.PointLight, number][] = []
  for (const [col, k, x, y, z] of [
    ['#fff0dc', 1.6, 0, 5.4, -0.6],
    ['#ffd9a8', 1.0, 0, 4.4, -1.0],
  ] as [string, number, number, number, number][]) {
    const l = new THREE.PointLight(col, 0, 0, 2)
    l.position.set(x, y, z)
    group.add(l)
    lights.push([l, k])
  }

  // 立った 2 人（前を向く）
  let alive = true
  void loadSuit().then(async (src) => {
    if (!src || !alive) return
    // 船長（左）は、カメラが船長の目なので描かない。着陸船操縦士（右）だけ
    for (const x of [0.55]) {
      const rig = await makeSuitRig(src, false)
      if (!rig || !alive) return
      for (let i = 0; i < 2; i++) {
        // 腕を前へ：操縦かんと、計器盤のスイッチ
        rig.shoulders[i].rotation.x = -0.75
        rig.shoulders[i].rotation.z = (i === 0 ? 1 : -1) * 0.15
        rig.elbows[i].rotation.x = -0.8
        rig.knees[i].rotation.x = 0.12
        rig.hips[i].rotation.x = -0.06
      }
      rig.update?.()
      const suit = bakePose(rig.root)
      suit.rotation.y = Math.PI
      suit.position.set(x, FLOOR, -0.78)
      body.add(suit)
      suit.traverse((o) => (o as THREE.Mesh).geometry && disposables.push((o as THREE.Mesh).geometry))
      for (const m of rig.materials) disposables.push(m)
    }
  })

  return {
    group,
    show: (on) => {
      body.visible = on
      for (const [l, k] of lights) l.intensity = on ? k : 0
    },
    dispose: () => {
      alive = false
      for (const d of disposables) d.dispose()
    },
  }
}
