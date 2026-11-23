import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { Terrain } from './terrain'
import { APOLLO17 } from '../../data/apollo17'
import { LIFTOFF_AT, evaNow, useApolloEva } from '../../state/apolloEva'
import { TV_EYE, lrvPose } from './LunarRover'
import { radialGlowTexture } from '../radialGlow'

// アポロ17号の追体験・章7：タウルス・リトロー谷に立つ着陸船チャレンジャー号（上の段つき。模型は apollo.glb）。
// 最後に、月面車のテレビカメラ（TV_EYE）から見送る離陸：下の段を発射台にして、上の段だけが飛び立つ。
// 本物の離陸：点火のあと約 10 秒まっすぐ上がり、西へ 52° 傾いて（ピッチオーバー）月を回る道へ。
// 点火の瞬間、下の段の断熱材のかけら（金色・銀色）が四方に飛び散る。空気がないので、まっすぐの線を描いて落ちる。

const APOLLO_URL = `${import.meta.env.BASE_URL}models/apollo.glb`
const LM = APOLLO17.find((h) => h.id === 'lm')!
/** 着陸船の向き：窓とはしごの面（模型の前）を西へ */
const LM_YAW = Math.PI / 2
/** 上の段の、点火のあとの上向きの加速度（m/s²）：推力 15.6 kN ÷ 約 4.9 t − 月の重力 1.62 */
const RISE_A = 1.6
/** まっすぐ上がる時間（秒）と、そのあとの傾き */
const PITCH_AT = 10
const PITCH = (52 * Math.PI) / 180
/** 飛び散るかけらの数 */
const BITS = 420

/** 確かめる用：離陸を見送るカメラの数字 */
export const tvDebug: Record<string, unknown> = {}

const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _u = new THREE.Vector3()

export function LunarModule({ terrain, prepare }: { terrain: Terrain; prepare: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial }) {
  const { scene } = useGLTF(APOLLO_URL)
  const built = useMemo(() => {
    const src = scene.clone(true)
    const owned: { dispose: () => void }[] = []
    src.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const m = (mesh.material as THREE.MeshStandardMaterial).clone()
      prepare(m)
      owned.push(m)
      mesh.material = m
    })
    const root = new THREE.Group()
    root.name = 'eva-lm'
    const ascent = new THREE.Group()
    for (const n of ['LMDescent', 'Leg0', 'Leg1', 'Leg2', 'Leg3']) {
      const o = src.getObjectByName(n)
      if (o) root.add(o)
    }
    const a = src.getObjectByName('LMAscent')
    if (a) ascent.add(a)
    root.add(ascent)
    const y = terrain.height(LM.x, LM.z)
    root.position.set(LM.x, y, LM.z)
    root.rotation.y = LM_YAW

    // 飛び散るかけら（点。金色と銀色）
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(BITS * 3)
    const col = new Float32Array(BITS * 3)
    const vel = new Float32Array(BITS * 3)
    const gold = new THREE.Color('#e0b04a')
    const silver = new THREE.Color('#e8ecf0')
    for (let i = 0; i < BITS; i++) {
      const c = Math.random() < 0.6 ? gold : silver
      const k = 0.6 + Math.random() * 0.6
      col.set([c.r * k, c.g * k, c.b * k], i * 3)
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const bitsMat = new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, opacity: 0, depthWrite: false })
    const bits = new THREE.Points(geo, bitsMat)
    bits.frustumCulled = false
    owned.push(geo, bitsMat)
    // エンジンの光（ほとんど見えない炎。点火の一瞬だけ明るい）
    // まるくぼける光（テクスチャなしだと四角になる）
    const glowTex = radialGlowTexture([
      [0, 255, 255, 255, 1],
      [0.25, 255, 255, 255, 0.45],
      [1, 255, 255, 255, 0],
    ])
    owned.push(glowTex)
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(2.2, 1.5, 0.8), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    const glow = new THREE.Sprite(glowMat)
    glow.scale.set(6, 6, 1)
    owned.push(glowMat)
    return { root, ascent, bits, vel, glow, owned, ground: y, launched: false }
  }, [scene, prepare, terrain])
  useEffect(() => () => built.owned.forEach((o) => o.dispose()), [built])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const { step, liftAt } = useApolloEva.getState()
    const flying = step === 'liftoff' || step === 'done'
    const t = flying ? evaNow() - liftAt - LIFTOFF_AT : -1
    const a = built.ascent
    // 上の段の位置（着陸船の座標。上が +y、模型の前 -z が西）
    if (t <= 0) {
      a.position.set(0, 0, 0)
      a.rotation.set(0, 0, 0)
      built.launched = false
    } else {
      const tv = Math.min(t, PITCH_AT)
      let h = 0.5 * RISE_A * tv * tv
      let fwd = 0
      if (t > PITCH_AT) {
        // 傾いたあとは、傾けた向きに加速（月を回る速さへ）。上の段の推力の加速度 約 3.2 m/s²
        const u = t - PITCH_AT
        const v0 = RISE_A * PITCH_AT
        h += v0 * u + 0.5 * (3.2 * Math.cos(PITCH) - 1.62) * u * u
        fwd = 0.5 * 3.2 * Math.sin(PITCH) * u * u
      }
      a.position.set(0, h, -fwd)
      a.rotation.x = -Math.min(1, Math.max(0, (t - PITCH_AT) / 3)) * PITCH
      if (!built.launched) {
        built.launched = true
        // かけらを、下の段の上から四方へ
        const p = built.bits.geometry.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < BITS; i++) {
          const ang = Math.random() * Math.PI * 2
          const out = 3 + Math.random() * 16
          const up = 2 + Math.random() * 12
          built.vel.set([Math.cos(ang) * out, up, Math.sin(ang) * out], i * 3)
          p.setXYZ(i, LM.x + Math.cos(ang) * 1.5, built.ground + 3.1 + Math.random() * 0.3, LM.z + Math.sin(ang) * 1.5)
        }
        p.needsUpdate = true
      }
    }
    // かけら：空気がないので、重力だけで落ちる。地面に着いたら止まる
    const m = built.bits.material as THREE.PointsMaterial
    if (built.launched && t < 14) {
      const p = built.bits.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < BITS; i++) {
        let y = p.getY(i)
        if (y <= built.ground + 0.02) continue
        built.vel[i * 3 + 1] -= 1.62 * dt
        p.setXYZ(i, p.getX(i) + built.vel[i * 3] * dt, (y += built.vel[i * 3 + 1] * dt), p.getZ(i) + built.vel[i * 3 + 2] * dt)
        if (y < built.ground) p.setY(i, built.ground + 0.01)
      }
      p.needsUpdate = true
      m.opacity = Math.min(1, t * 6) * Math.max(0, 1 - (t - 9) / 5)
    } else m.opacity = 0
    built.bits.visible = m.opacity > 0
    // エンジンの光：上の段の下
    a.updateMatrixWorld(true)
    built.glow.position.copy(_v.set(0, 2.6, 0).applyMatrix4(a.matrixWorld))
    const gm = built.glow.material as THREE.SpriteMaterial
    gm.opacity = t > 0 ? Math.max(0.12, 1 - t * 1.5) * Math.max(0, 1 - (t - 20) / 6) : 0
    built.glow.visible = gm.opacity > 0.001

    // ---- カメラ：月面車のテレビカメラから（ヒューストンから首を振って追う。少しおくれる） ----
    if (!flying || !lrvPose.on) return
    const cam = state.camera as THREE.PerspectiveCamera
    const eye = _v.copy(TV_EYE).applyMatrix4(lrvPose.matrix)
    eye.y = Math.max(eye.y, terrain.height(eye.x, eye.z) + 1.2)
    const target = _w.set(0, 3.2, 0).applyMatrix4(a.matrixWorld)
    // 先読み：上の段の速さの分だけ先を見る（首振りのおくれで画面から外れないように）
    const prev = cam.userData.tvPrev as THREE.Vector3 | undefined
    if (prev && dt > 0 && t > 1.5) _u.copy(target).sub(prev).multiplyScalar(1 / (dt * 5))
    else _u.set(0, 0, 0)
    cam.userData.tvPrev = (prev ?? new THREE.Vector3()).copy(target)
    target.add(_u)
    const look = cam.userData.tvLook as THREE.Vector3 | undefined
    if (!look || (step === 'liftoff' && evaNow() - liftAt < 0.15)) {
      cam.userData.tvLook = target.clone()
    } else {
      // 首振りのおくれ：点火の瞬間はとらえ遅れ、そのあと追いつく
      look.lerp(target, 1 - Math.exp(-dt * (t > 0 ? (t < 1.5 ? 2 : 5) : 6)))
    }
    cam.position.copy(eye)
    cam.lookAt(cam.userData.tvLook as THREE.Vector3)
    tvDebug.eye = eye.toArray().map(Math.round)
    tvDebug.look = (cam.userData.tvLook as THREE.Vector3).toArray().map(Math.round)
    tvDebug.target = target.toArray().map(Math.round)
    tvDebug.fov = Math.round(cam.fov * 10) / 10
    tvDebug.t = Math.round(t * 10) / 10
    // ズーム：はじめは着陸船いっぱい、上がるにつれて少し広く
    const dist = eye.distanceTo(target)
    // 上がるにつれて広く：見失わないよう、遠ざかっても上の段が画面の中に残る広さ
    const fov = THREE.MathUtils.clamp((2 * Math.atan((t > 0 ? 10 + t * 0.35 : 9) / dist) * 180) / Math.PI, 4, 34)
    if (Math.abs(cam.fov - fov) > 0.02) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 3)
      cam.updateProjectionMatrix()
    }
  })

  return (
    <>
      <primitive object={built.root} />
      <primitive object={built.bits} />
      <primitive object={built.glow} />
    </>
  )
}

