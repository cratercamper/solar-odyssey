import * as THREE from 'three'

// 宇宙服の足あと：靴底の溝の形を、地面に少し暗く残す。空気も風も無い星では、何十年も消えない
// （ここでは、その日の歩いたぶんだけ。古いものから置きかえる）

let soleTex: THREE.Texture | null = null
/** 靴底の形（白い部分が足あと）：楕円のふちと、横の溝の列 */
function soleTexture() {
  if (soleTex) return soleTex
  const W = 64
  const H = 160
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.clearRect(0, 0, W, H)
  // 足の形：つま先が広く、かかとが少し細い
  g.save()
  g.beginPath()
  g.ellipse(W / 2, H * 0.32, W * 0.44, H * 0.3, 0, 0, Math.PI * 2)
  g.ellipse(W / 2, H * 0.72, W * 0.36, H * 0.24, 0, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.fillRect(0, 0, W, H)
  // 溝（横の線）
  g.fillStyle = 'rgba(255,255,255,1)'
  for (let y = 8; y < H - 6; y += 11) g.fillRect(4, y, W - 8, 5)
  g.restore()
  // ふちをぼかす
  const blur = document.createElement('canvas')
  blur.width = W
  blur.height = H
  const b = blur.getContext('2d')!
  b.filter = 'blur(1.2px)'
  b.drawImage(c, 0, 0)
  soleTex = new THREE.CanvasTexture(blur)
  return soleTex
}

const m = new THREE.Matrix4()
const q = new THREE.Quaternion()
const qy = new THREE.Quaternion()
const n = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const p = new THREE.Vector3()
const sc = new THREE.Vector3(1, 1, 1)

export class Footprints {
  readonly mesh: THREE.InstancedMesh
  /** これまでに付けた数 */
  total = 0
  private next = 0
  private time = 0
  private born: Float32Array

  constructor(ground: string, private max: number) {
    const geo = new THREE.PlaneGeometry(0.15, 0.34)
    geo.rotateX(-Math.PI / 2)
    const born = new Float32Array(max).fill(-99)
    this.born = born
    geo.setAttribute('aBorn', new THREE.InstancedBufferAttribute(born, 1))
    // 地面の色より暗く。押し固められた土は、まわりの細かい砂より光を返さない
    const col = new THREE.Color(ground).multiplyScalar(0.45)
    const mat = new THREE.MeshStandardMaterial({ color: col, map: soleTexture(), roughness: 1, metalness: 0, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    // 付いた瞬間は少し濃く、すぐに落ち着く
    const uTime = { value: 0 }
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aBorn;\nvarying float vNew;\nuniform float uTime;\nvoid main() {\n  vNew = clamp(1.0 - (uTime - aBorn) / 0.6, 0.0, 1.0);')
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'varying float vNew;\nvoid main() {')
        .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.a = diffuseColor.a * (1.0 + 0.4 * vNew);')
    }
    this.uTime = uTime
    this.mesh = new THREE.InstancedMesh(geo, mat, max)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    this.mesh.receiveShadow = true
  }

  private uTime: { value: number }

  /** 足あとを 1 つ。side は 0 が左、1 が右。height は地面の高さ */
  add(x: number, z: number, heading: number, side: number, height: (x: number, z: number) => number) {
    // 右は (cos h, -sin h)（前は (-sin h, -cos h)）
    const off = side === 0 ? -0.13 : 0.13
    const px = x + Math.cos(heading) * off
    const pz = z - Math.sin(heading) * off
    const y = height(px, pz)
    // 地面の傾きに合わせる
    const dx = height(px + 0.2, pz) - height(px - 0.2, pz)
    const dz = height(px, pz + 0.2) - height(px, pz - 0.2)
    n.set(-dx / 0.4, 1, -dz / 0.4).normalize()
    q.setFromUnitVectors(UP, n).multiply(qy.setFromAxisAngle(UP, heading + (Math.random() - 0.5) * 0.12))
    m.compose(p.set(px, y + 0.01, pz), q, sc)
    const i = this.next
    this.mesh.setMatrixAt(i, m)
    this.born[i] = this.time
    ;(this.mesh.geometry.getAttribute('aBorn') as THREE.InstancedBufferAttribute).needsUpdate = true
    this.mesh.instanceMatrix.needsUpdate = true
    this.next = (i + 1) % this.max
    this.mesh.count = Math.min(this.max, this.mesh.count + 1)
    this.total++
  }

  update(dt: number) {
    this.time += dt
    this.uTime.value = this.time
  }

  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
