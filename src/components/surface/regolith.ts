import * as THREE from 'three'
import { dustFragment, dustVertex, puffTexture } from './landerFx'

// 宇宙服の足がけり上げるレゴリス（細かい砂）。
// 空気の無い星では、砂つぶは煙のように漂わない。けられた勢いのまま放物線を描いて飛び、すっと地面へ落ちる
// （アポロの映像で、ローバーの車輪や足もとの砂が「雨のように」きれいな弧を描いて落ちるのと同じ）。
// 空気のある星（火星・地球・タイタン）では、細かい砂は空気に止められて、しばらく舞ってから風に流れる

export class Regolith {
  readonly points: THREE.Points
  readonly material: THREE.ShaderMaterial
  private geo = new THREE.BufferGeometry()
  private pos: Float32Array
  private vel: Float32Array
  private alpha: Float32Array
  private size: Float32Array
  private rot: Float32Array
  private vari: Float32Array
  private age: Float32Array
  private life: Float32Array
  private floor: Float32Array
  private grow: Float32Array
  /** 地面に落ちた（そこで消えていく） */
  private down: Uint8Array
  private next = 0

  constructor(readonly count: number, color: THREE.Color, private hasAir: boolean, private g: number, private wind: THREE.Vector3) {
    this.pos = new Float32Array(count * 3)
    this.vel = new Float32Array(count * 3)
    this.alpha = new Float32Array(count)
    this.size = new Float32Array(count)
    this.rot = new Float32Array(count)
    this.vari = new Float32Array(count)
    this.age = new Float32Array(count).fill(99)
    this.life = new Float32Array(count).fill(1)
    this.floor = new Float32Array(count)
    this.grow = new Float32Array(count)
    this.down = new Uint8Array(count)
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1))
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1))
    this.geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1))
    this.geo.setAttribute('aVar', new THREE.BufferAttribute(this.vari, 1))
    this.material = new THREE.ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      uniforms: {
        uMap: { value: puffTexture() },
        uColor: { value: color.clone() },
        uShadow: { value: color.clone().multiplyScalar(0.35) },
        uSunView: { value: new THREE.Vector3(0, 1, 0) },
        uScale: { value: 500 },
      },
      transparent: true,
      depthWrite: false,
    })
    this.points = new THREE.Points(this.geo, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 2
  }

  private one(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, grow: number, life: number) {
    const j = this.next++ % this.count
    const i = j * 3
    this.pos[i] = x
    this.pos[i + 1] = y
    this.pos[i + 2] = z
    this.vel[i] = vx
    this.vel[i + 1] = vy
    this.vel[i + 2] = vz
    this.floor[j] = y - 0.02
    this.age[j] = 0
    this.down[j] = 0
    this.rot[j] = Math.random() * Math.PI * 2
    this.vari[j] = Math.random() * 0.999
    this.life[j] = life
    this.size[j] = size
    this.grow[j] = grow
  }

  /**
   * 足でけった砂：(x, y, z) は足もと、(dx, dz) は飛ばす向き（水平の単位ベクトル）、power は勢い（0〜1.5 くらい）、
   * spread は横への広がり（0 は前へまっすぐ、1 はまわり全部）、n はつぶの数
   */
  kick(x: number, y: number, z: number, dx: number, dz: number, power: number, spread: number, n: number) {
    for (let k = 0; k < n; k++) {
      // 向き：dx, dz のまわりに広げる
      const a = Math.atan2(dz, dx) + (Math.random() - 0.5) * Math.PI * 2 * spread
      const sp = power * (0.4 + Math.random() * 1.1)
      const up = power * (0.5 + Math.random() * 1.4)
      const ox = (Math.random() - 0.5) * 0.18
      const oz = (Math.random() - 0.5) * 0.18
      if (this.hasAir) {
        // 舞い上がる土けむり（ふくらんで、ゆっくり消える）
        this.one(x + ox, y + 0.04, z + oz, Math.cos(a) * sp * 0.6, up * 0.5, Math.sin(a) * sp * 0.6, 0.12 + Math.random() * 0.1, 0.5, 1.8 + Math.random() * 1.8)
      } else {
        // 砂つぶ：小さく、放物線を描いて落ちる。落ちたら少しのあいだ地面に見えて消える
        this.one(x + ox, y + 0.03, z + oz, Math.cos(a) * sp, up, Math.sin(a) * sp, 0.035 + Math.random() * 0.045, 0.02, 3)
      }
    }
    // 真空でも、ごく細かい粉は小さな雲のように一瞬ふわっと見える（すぐ散る）
    if (!this.hasAir && power > 0.3) {
      for (let k = 0; k < Math.ceil(n / 8); k++) {
        const a = Math.random() * Math.PI * 2
        this.one(x, y + 0.03, z, Math.cos(a) * 0.4 * power + dx * 0.3, 0.3 * power, Math.sin(a) * 0.4 * power + dz * 0.3, 0.1, 0.6, 0.45)
      }
    }
  }

  update(dt: number) {
    const w = this.wind
    for (let j = 0; j < this.count; j++) {
      if (this.age[j] >= this.life[j]) {
        this.alpha[j] = 0
        continue
      }
      this.age[j] += dt
      const i = j * 3
      if (this.hasAir) {
        const k = Math.min(1, 2.2 * dt)
        this.vel[i] += (w.x - this.vel[i]) * k
        this.vel[i + 2] += (w.z - this.vel[i + 2]) * k
        this.vel[i + 1] += (0.15 - this.vel[i + 1]) * k
      } else if (!this.down[j]) {
        this.vel[i + 1] -= this.g * dt
      }
      if (!this.down[j]) {
        this.pos[i] += this.vel[i] * dt
        this.pos[i + 1] += this.vel[i + 1] * dt
        this.pos[i + 2] += this.vel[i + 2] * dt
      }
      if (this.pos[i + 1] < this.floor[j]) {
        this.pos[i + 1] = this.floor[j]
        if (!this.hasAir && !this.down[j]) {
          // 落ちたつぶは止まり、0.4 秒ほどで地面の色にまぎれる
          this.down[j] = 1
          this.life[j] = Math.min(this.life[j], this.age[j] + 0.4)
        }
      }
      this.size[j] += dt * this.grow[j]
      this.rot[j] += dt * 0.3
      const u = this.age[j] / this.life[j]
      const fadeIn = Math.min(1, this.age[j] / 0.05)
      // 真空の砂つぶは濃く、くっきり。土けむりはうすく
      const base = this.hasAir ? 0.32 : this.grow[j] > 0.1 ? 0.12 : 0.85
      this.alpha[j] = fadeIn * (this.down[j] ? Math.max(0, 1 - u) : 1 - Math.max(0, u - 0.8) / 0.2) * base
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.aAlpha.needsUpdate = true
    this.geo.attributes.aSize.needsUpdate = true
    this.geo.attributes.aRot.needsUpdate = true
  }

  dispose() {
    this.geo.dispose()
    this.material.dispose()
  }
}
