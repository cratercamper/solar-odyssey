import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// 背中につける翼（オリジナルの形）。白い複合材の骨（肩・ひじ・手首の 3 つの節）に、
// 1 枚ずつの羽根を重ねた、鳥の翼に近い形。片側 約 3.3 m。
// open：1 = 広げる、0 = たたむ（節ごとに Z の字に折って、羽根は骨にそってそろえ、背中に収める）。
// flap() で、根もとから打ち下ろす。飛んでいるあいだは、先の羽根が風で少しふるえる。

/** 骨の長さ（肩→ひじ、ひじ→手首、手首→先） */
const SEG = [0.95, 1.0, 1.25]

/** 羽根 1 枚の形：根もとが細く、先が丸い。長さ方向は +z（後ろ）、幅は x。色は根もとから先へ */
function featherGeo(len: number, wid: number, base: THREE.Color, tip: THREE.Color) {
  const s = new THREE.Shape()
  const w = wid / 2
  s.moveTo(-w * 0.35, 0)
  s.bezierCurveTo(-w * 1.05, len * 0.3, -w * 1.05, len * 0.75, -w * 0.55, len * 0.95)
  s.quadraticCurveTo(0, len * 1.04, w * 0.55, len * 0.95)
  s.bezierCurveTo(w * 1.05, len * 0.75, w * 1.05, len * 0.3, w * 0.35, 0)
  s.closePath()
  const g = new THREE.ShapeGeometry(s, 10)
  // 平らな形（xy）を、翼の面（xz、長さは後ろ）へ。少し反らせる（まん中が高い）
  g.rotateX(Math.PI / 2)
  const p = g.attributes.position as THREE.BufferAttribute
  const col = new Float32Array(p.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const t = Math.max(0, Math.min(1, z / len))
    p.setY(i, 0.035 * len * Math.sin(t * Math.PI) - 0.25 * (x * x) / wid)
    c.copy(base).lerp(tip, t * t)
    // ふちを少し暗く（羽根の重なりが見えるように）
    c.multiplyScalar(1 - 0.18 * Math.min(1, Math.abs(x) / w) ** 3)
    col.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

/** たたんだときの肩の向き：骨（x）は下、羽根（z）は背骨のほう、翼の上の面（y）は外（後ろ） */
// 台は人の向きから x のまわりに BASE_X 起こしてある（羽根は足のほう、翼の上の面は背中の外）。
// 飛ぶときは体を 1.25 rad 前へ倒すので、90° より少し浅くして、翼の面が空と平らになるように
const BASE_X = Math.PI / 2 - 0.3
// 人の向きで決めて、台の中の向きに直す
const FOLD = new THREE.Quaternion()
  .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -BASE_X)
  .multiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0))))
const eu = new THREE.Euler()

type Feather = { mesh: THREE.Mesh; openA: number; foldA: number; len: number; tip: boolean; ph: number }

export class Wings {
  group = new THREE.Group()
  /** 翼の台：翼の面（xz）を背中の面にそわせ、羽根の向き（+z）を足のほうへ。飛ぶときは体ごと寝るので、羽根は後ろへ流れる */
  private base = new THREE.Group()
  private sides: { root: THREE.Group; elbow: THREE.Group; wrist: THREE.Group; feathers: Feather[] }[] = []
  private geos: THREE.BufferGeometry[] = []
  private mats: THREE.Material[] = []
  private flapT = 1
  private t = 0
  private open = 0

  constructor() {
    const featherMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide })
    const boneMat = new THREE.MeshStandardMaterial({ color: '#eef1f4', roughness: 0.3, metalness: 0.15 })
    const jointMat = new THREE.MeshStandardMaterial({ color: '#3a4049', roughness: 0.45, metalness: 0.5 })
    const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 1.3, 1.9), toneMapped: false })
    this.mats.push(featherMat, boneMat, jointMat, ledMat)

    const white = new THREE.Color('#f4f6f8')
    const pearl = new THREE.Color('#dfe6ee')
    const steel = new THREE.Color('#9fb3c8')
    // 羽根の形はいくつかだけ作って使い回す
    const shapes = new Map<string, THREE.BufferGeometry>()
    const feather = (len: number, wid: number, tip: THREE.Color) => {
      const k = `${len.toFixed(2)}-${wid}-${tip.getHexString()}`
      let g = shapes.get(k)
      if (!g) {
        g = featherGeo(len, wid, white, tip)
        shapes.set(k, g)
        this.geos.push(g)
      }
      return g
    }
    // 骨：先へ細くなる筒
    const boneGeo = (l: number, r0: number, r1: number) => {
      const g = new THREE.CylinderGeometry(r1, r0, l, 10).rotateZ(-Math.PI / 2).translate(l / 2, 0, 0)
      this.geos.push(g)
      return g
    }
    const jointGeo = new THREE.SphereGeometry(1, 12, 8)
    const ledGeo = new THREE.SphereGeometry(0.018, 8, 6)
    this.geos.push(jointGeo, ledGeo)

    for (const side of [-1, 1]) {
      const mirror = new THREE.Group()
      mirror.scale.x = side
      // 肩甲骨のあたりから。たたむと羽根が背骨のほうへ重なるので、左右で少し前後をずらす
      mirror.position.set(side * 0.13, side > 0 ? 0.015 : 0, 0)
      const root = new THREE.Group()
      const elbow = new THREE.Group()
      const wrist = new THREE.Group()
      elbow.position.x = SEG[0]
      wrist.position.x = SEG[1]
      mirror.add(root)
      root.add(elbow)
      elbow.add(wrist)
      const segs = [root, elbow, wrist]
      segs.forEach((g, i) => {
        g.add(new THREE.Mesh(boneGeo(SEG[i], 0.045 - i * 0.01, 0.035 - i * 0.01), boneMat))
        const j = new THREE.Mesh(jointGeo, jointMat)
        j.scale.setScalar(0.06 - i * 0.012)
        g.add(j)
        const led = new THREE.Mesh(ledGeo, ledMat)
        led.position.set(0.02, 0.045 - i * 0.01, -0.03)
        g.add(led)
      })
      const tipLed = new THREE.Mesh(ledGeo, ledMat)
      tipLed.position.set(SEG[2], 0.01, 0)
      wrist.add(tipLed)

      const feathers: Feather[] = []
      const add = (g: THREE.Group, x: number, len: number, wid: number, openA: number, foldA: number, tip: THREE.Color, y: number, isTip = false) => {
        const m = new THREE.Mesh(feather(len, wid, tip), featherMat)
        m.position.set(x, y, 0.01)
        m.castShadow = true
        g.add(m)
        feathers.push({ mesh: m, openA, foldA, len, tip: isTip, ph: Math.random() * 6 })
      }
      // 次列風切（ひじまで・手首まで）：後ろへまっすぐ。根もとに近いほど短い
      for (let i = 0; i < 7; i++) add(root, 0.08 + i * 0.13, 0.78 + i * 0.035, 0.26, 0.04 + i * 0.01, 1.45, pearl, -0.004 * i)
      for (let i = 0; i < 7; i++) add(elbow, 0.05 + i * 0.14, 1.0 + i * 0.012, 0.26, 0.1 + i * 0.012, 1.45, pearl, -0.03 - 0.004 * i)
      // 初列風切（手首から先）：外へ扇のように開く。先ほど青みがかる
      const prim = [1.08, 1.16, 1.24, 1.32, 1.38, 1.42, 1.4, 1.32, 1.2]
      prim.forEach((len, i) => {
        const f = i / (prim.length - 1)
        add(wrist, 0.06 + f * (SEG[2] - 0.1), len, 0.24 - f * 0.05, 0.22 + f * 1.05, 1.5, steel, -0.004 * i - 0.06, true)
      })
      // 雨覆（前のふちの短い羽根）：骨の付け根を隠す
      segs.forEach((g, si) => {
        const n = [6, 6, 6][si]
        for (let i = 0; i < n; i++) {
          const x = 0.04 + (i / n) * (SEG[si] - 0.05)
          add(g, x, 0.42 - si * 0.04, 0.22, 0.12 + si * 0.08, 1.45, white, 0.022 + 0.002 * i)
        }
      })
      this.sides.push({ root, elbow, wrist, feathers })
      this.base.add(mirror)
    }
    // 背中の装置（翼の根もと）：丸い白いケースと、暗い帯
    const caseGeo = new THREE.CapsuleGeometry(0.09, 0.2, 6, 12)
    const strapGeo = new THREE.TorusGeometry(0.1, 0.01, 6, 20)
    const merged = mergeGeometries([caseGeo, strapGeo.clone().rotateX(Math.PI / 2).translate(0, 0.06, 0), strapGeo.clone().rotateX(Math.PI / 2).translate(0, -0.06, 0)], true)
    caseGeo.dispose()
    strapGeo.dispose()
    this.geos.push(merged)
    const pack = new THREE.Mesh(merged, [boneMat, jointMat, jointMat])
    pack.position.set(0, -0.3, 0.05)
    pack.castShadow = true
    this.group.add(pack)
    this.base.rotation.x = BASE_X
    this.group.add(this.base)
    this.group.visible = false
  }

  flap() {
    this.flapT = 0
  }

  /** 手でにぎる所（左右、世界の位置）。肩の骨の 0.55 m 先、少し前 */
  handles(left: THREE.Vector3, right: THREE.Vector3) {
    this.group.updateMatrixWorld(true)
    this.sides[0].root.localToWorld(left.set(0.55, -0.03, -0.06))
    this.sides[1].root.localToWorld(right.set(0.55, -0.03, -0.06))
  }

  /** open：0 = たたむ、1 = 広げる。dt 秒すすめる */
  update(dt: number, open: number) {
    this.t += dt
    // 開け閉めは 0.6 秒ほどで
    this.open += (open - this.open) * Math.min(1, dt * 4)
    const o = this.open
    const c = 1 - o
    this.flapT = Math.min(1, this.flapT + dt * 2.2)
    // 打ち下ろして、ゆっくりもどす
    const beat = this.flapT < 1 ? Math.sin(this.flapT * Math.PI * 2) * (1 - this.flapT) * 0.9 : 0
    for (const s of this.sides) {
      // 肩：開くと少し上反角で、打ち下ろす。たたむと翼の面を背中にそわせ、骨は下へ
      s.root.quaternion.setFromEuler(eu.set(0, o * 0.06, beat + 0.07)).slerp(FOLD, c)
      // ひじ・手首：開くと少し後ろへ引き（後退角）、たたむと翼の面の中で Z の字に折る
      s.elbow.rotation.set(0, -o * 0.08 - c * 2.95, -beat * 0.25 * o)
      s.elbow.position.y = c * 0.025
      s.wrist.rotation.set(0, -o * 0.32 + c * 2.9, beat * 0.35 * o)
      s.wrist.position.y = c * 0.025
      for (const f of s.feathers) {
        // 開くと扇に、たたむと骨にそってそろう（短く見えるように少し縮める）
        f.mesh.rotation.y = f.openA * o + f.foldA * c
        const flutter = f.tip ? Math.sin(this.t * 13 + f.ph) * 0.03 * o : 0
        f.mesh.rotation.x = -beat * 0.25 * (f.tip ? 1 : 0.4) + flutter
        f.mesh.scale.z = 0.3 + 0.7 * o
      }
    }
  }

  dispose() {
    this.group.removeFromParent()
    for (const g of this.geos) g.dispose()
    for (const m of this.mats) m.dispose()
  }
}
