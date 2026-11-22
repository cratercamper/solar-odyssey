import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// 公園の木の根元。幹がそのまま地面に刺さって見えないよう、
//  - 根張り：幹の下がすそ広がりになり、そこから何本かの根が地面を這って土にもぐる形
//  - 根元の土：木の下の芝が薄くなって、土と落ち葉がのぞく丸いしみ
// を足す。形は「幹の根元の太さ = 1、地面 = y 0」で作り、木ごとに幹の太さで拡大して置く。

/** 根の向き（ラジアン）・長さ・太さ。わざと不ぞろいにして、木ごとに向きを回すと同じ形に見えにくい */
const ROOTS: [number, number, number][] = [
  [0.1, 2.9, 0.66],
  [1.05, 2.1, 0.55],
  [1.85, 3.3, 0.7],
  [2.75, 2.4, 0.58],
  [3.7, 3.1, 0.68],
  [4.6, 1.9, 0.52],
  [5.4, 2.6, 0.6],
]

/** 根張りの形（幹の根元の太さ 1、地面 y 0、上は y 1.8 で幹の中に消える） */
export function rootGeometry() {
  const parts: THREE.BufferGeometry[] = [flare(), ...ROOTS.map(([a, len, th]) => root(a, len, th))]
  const g = mergeGeometries(parts)!
  for (const p of parts) p.dispose()
  g.computeBoundingSphere()
  return g
}

/** 幹のすそ：根の向きにふくらむ。地面の少し下から始まる */
function flare() {
  const RAD = 28
  const ROWS = 8
  const Y0 = -0.25
  const Y1 = 1.3
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let j = 0; j <= ROWS; j++) {
    const t = j / ROWS
    const y = Y0 + (Y1 - Y0) * t
    const fall = Math.pow(1 - t, 2.2)
    for (let i = 0; i <= RAD; i++) {
      const th = (i / RAD) * Math.PI * 2
      let bulge = 0
      for (const [a, , w] of ROOTS) {
        let d = Math.abs(th - a) % (Math.PI * 2)
        if (d > Math.PI) d = Math.PI * 2 - d
        bulge += w * 1.0 * Math.exp(-(d * d) / 0.16)
      }
      // 上は幹より少し細く（幹の中に入って、つなぎ目が見えない）
      const r = 0.9 + (0.4 + bulge) * fall
      pos.push(Math.cos(th) * r, y, Math.sin(th) * r)
      uv.push((i / RAD) * 2, y * 0.35)
    }
  }
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < RAD; i++) {
      const a = j * (RAD + 1) + i
      const b = a + RAD + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** 1 本の根：幹のすそから外へ、少し曲がりながら細くなり、先は土にもぐる。断面は上下につぶれた楕円 */
function root(angle: number, len: number, thick: number) {
  const SEG = 12
  const RAD = 10
  const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
  const side = new THREE.Vector3(-out.z, 0, out.x)
  const bend = Math.sin(angle * 3.7) * 0.35
  const at = (t: number) => {
    const d = 0.45 + len * t
    // 根元は高く（すその上から出る）、すぐ地面に沿う低いこぶになり、先は土の下へもぐる（半分うまった根）
    const y = 0.55 * Math.pow(1 - t, 2.2) - 0.05 - 0.3 * t * t
    return new THREE.Vector3().addScaledVector(out, d).addScaledVector(side, bend * t * t * len * 0.3).setY(y)
  }
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const up = new THREE.Vector3(0, 1, 0)
  const tan = new THREE.Vector3()
  const nrm = new THREE.Vector3()
  const bin = new THREE.Vector3()
  for (let j = 0; j <= SEG; j++) {
    const t = j / SEG
    const c = at(t)
    tan.subVectors(at(Math.min(1, t + 0.02)), at(Math.max(0, t - 0.02))).normalize()
    bin.crossVectors(tan, up).normalize()
    nrm.crossVectors(bin, tan).normalize()
    const r = thick * (1 - 0.65 * Math.pow(t, 1.2)) + 0.06
    for (let i = 0; i <= RAD; i++) {
      const th = (i / RAD) * Math.PI * 2
      const p = c
        .clone()
        .addScaledVector(bin, Math.cos(th) * r * 1.1)
        .addScaledVector(nrm, Math.sin(th) * r * 0.9)
      pos.push(p.x, p.y, p.z)
      uv.push((i / RAD) * 0.6, t * len * 0.25)
    }
  }
  for (let j = 0; j < SEG; j++)
    for (let i = 0; i < RAD; i++) {
      const a = j * (RAD + 1) + i
      const b = a + RAD + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** 幹の根元の太さ（形の中で、地面の高さ y0 の少し上にある頂点の、軸からの距離） */
export function trunkRadius(geo: THREE.BufferGeometry, y0: number, height: number) {
  const p = geo.attributes.position
  const band = height * 0.08
  const rs: number[] = []
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    if (y >= y0 && y < y0 + band) rs.push(Math.hypot(p.getX(i), p.getZ(i)))
  }
  if (!rs.length) return 0
  rs.sort((a, b) => a - b)
  // いちばん外の頂点は低い枝のはみ出しのことがあるので、中ほどより少し外のところ
  return rs[Math.floor(rs.length * 0.7)]
}

/** 根元の土のしみ：中は土と落ち葉の色、外へ行くほど芝に溶ける（1 × 1 の板、地面に寝かせてある） */
export function rootShade() {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(70,52,34,1)')
  grad.addColorStop(0.3, 'rgba(78,60,38,0.92)')
  grad.addColorStop(0.62, 'rgba(70,64,36,0.5)')
  grad.addColorStop(1, 'rgba(60,62,32,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  // 土のむら・落ち葉の粒（決まった種で）
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 1600; i++) {
    const a = rnd() * Math.PI * 2
    const d = Math.sqrt(rnd()) * S * 0.46
    const x = S / 2 + Math.cos(a) * d
    const y = S / 2 + Math.sin(a) * d
    const k = 1 - d / (S * 0.46)
    const leaf = rnd() < 0.45
    g.fillStyle = leaf ? `rgba(${92 + rnd() * 40},${70 + rnd() * 26},${38 + rnd() * 18},${0.6 * k})` : `rgba(34,26,16,${0.55 * k})`
    g.beginPath()
    g.ellipse(x, y, 1 + rnd() * 2, 0.6 + rnd() * 1.2, rnd() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  const geo = new THREE.PlaneGeometry(1, 1)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshLambertMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  })
  return { geo, mat }
}
