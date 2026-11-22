import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LANDER_POS, type Terrain } from './terrain'
import { meshHeight, nearRocks, onRocks, rockBodies } from './Rover'
import { isWide, roverRangeFor, wideNow, type RockBody } from './wideGround'
import { ROVER_RANGE, crewPose, roverFocus } from '../../state/rover'
import { useLanding } from '../../state/landing'
import { CREW_HALF_L, CREW_HALF_W, CREW_NEAR, CREW_TOP_Y, bindSuitKeys, endSuitWalk, suitCam, suitDebug, suitInput, suitPose, useSuitWalk } from '../../state/suitWalk'
import { loadSuit, makeSuitRig } from './suitModel'
import { HIP_Y, SHIN, THIGH, makeAstronaut, type Rig } from './astronaut'
import { Footprints } from './footprints'
import { CYCLE_M, legAt } from './walkCycle'
import { lowMemory } from '../../state/quality'
import { Regolith } from './regolith'
import { windFor } from './landerFx'
import type { SkyNow } from './skyNow'

// 宇宙服で地表を歩く。重力で歩き方が変わる：
//   0.25 G 以上（地球・火星・金星・水星）… ふつうに歩く・走る
//   0.05〜0.25 G（月・イオ・エウロパ・タイタンなど）… アポロの宇宙飛行士の歩き方。ゆっくりなら、ひざを曲げたまま小さくすり足。
//     速くなると「ロープ」（lope）：片足ずつ交互にけって、低く長く弾むように進む（けった足は後ろに残り、
//     前の足が次に着く）。体は少し前かがみ、腕は少し横に開いて前に出したまま、あまり振らない
//     （与圧した宇宙服はひざも腕も曲げにくい）
//   0.05 G より弱い（フォボスや小さな衛星）… 地面をけるとふわっと浮く。すべるように少しずつ進む
// Space の大ジャンプは、重力ジャンプ（GravityJump）と同じ力。空中が長い星では早送りにする

export type Gait = 'walk' | 'hop' | 'float'
export const gaitFor = (gravityG: number): Gait => (gravityG >= 0.25 ? 'walk' : gravityG >= 0.05 ? 'hop' : 'float')

/** 大ジャンプのはじめの速さ（m/s）：地球で 50 cm 跳べる力（GravityJump と同じ） */
const JUMP_V = Math.sqrt(2 * 9.81 * 0.5)
/** 大ジャンプの高さの上限（m）。とても弱い重力の星で、地面が読み込めないほど高く上がらないように */
const JUMP_TOP = 40
/** 空中の時間がこれより長いときは、この秒数に収まるよう早送り */
const AIR_SHOWN = 5
/** 着陸船の脚と胴の、近づけない半径（m） */
const LANDER_R = 11
/** これより速いと、ロープ（片足ずつ弾む歩き）になる（m/s） */
const LOPE_FROM = 0.55
/** ロープで足が地面についている時間（秒） */
const CONTACT = 0.2

const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x))
  return k * k * (3 - 2 * k)
}

type Walk = {
  x: number
  z: number
  y: number
  vy: number
  vx: number
  vz: number
  heading: number
  grounded: boolean
  /** 大ジャンプのしゃがみの残り（秒）。-1 はしていない */
  crouch: number
  /** 着地してからの秒 */
  landed: number
  /** 大ジャンプの空中（早送りのため） */
  big: boolean
  speedUp: number
  /** 歩く周期（0〜1） */
  phase: number
  /** 前のコマの、左右の足が地面についていたか */
  plant: [boolean, boolean]
  /** カメラを最後に手で動かした時刻 */
  touched: number
  /** 跳ぶボタンを押した時刻（空中なら着地を待つ） */
  jumpAt: number
  /** ロープ：いま地面をけっている（次にける）足、空中の時間、その一歩の空中の長さ */
  stance: number
  airT: number
  flight: number
}

/** 立ち姿・歩き・跳ねのポーズを関節の箱に書く */
function legsFor(r: Rig) {
  return r.legs ?? { hipY: HIP_Y, thigh: THIGH, shin: SHIN }
}
function setPose(r: Rig, hip: [number, number], knee: [number, number], arm: [number, number], armOut: number, elbow: number | [number, number], lean: number, back = 0, foot: [number, number] = [0, 0]) {
  const L = legsFor(r)
  const b = r.boot
  let y = -Infinity
  for (let i = 0; i < 2; i++) {
    r.hips[i].rotation.x = hip[i]
    r.knees[i].rotation.x = knee[i]
    r.shoulders[i].rotation.x = arm[i]
    r.shoulders[i].rotation.z = (i === 0 ? 1 : -1) * armOut
    r.elbows[i].rotation.x = typeof elbow === 'number' ? elbow : elbow[i]
    if (r.feet) r.feet[i] = foot[i]
    if (b) {
      // 足首までの高さに、靴のかかと・つま先のいちばん低いところを足す（かかとから着く・つま先でける）
      const ankle = L.thigh * Math.cos(hip[i]) + (L.shin - b.sole) * Math.cos(hip[i] + knee[i])
      const c = Math.cos(foot[i])
      const s = Math.sin(foot[i])
      y = Math.max(y, ankle + Math.max(b.sole * c + b.heel * s, b.sole * c - b.toe * s))
    } else y = Math.max(y, L.thigh * Math.cos(hip[i]) + L.shin * Math.cos(hip[i] + knee[i]))
  }
  r.torso.rotation.x = lean
  r.body.position.y = L.hipY - (L.thigh + L.shin - y)
  r.body.position.z = back
  r.update?.()
}

export function SuitWalk({ terrain, landerYaw, sky }: { terrain: Terrain; landerYaw: number; sky: SkyNow }) {
  const on = useSuitWalk((s) => s.on)
  // 地表を離れる（離陸・別の星）ときは、着陸船に戻ったことにする
  useEffect(() => () => endSuitWalk(), [])
  if (!on) return null
  return <Walker terrain={terrain} landerYaw={landerYaw} sky={sky} />
}

function Walker({ terrain, sky }: { terrain: Terrain; landerYaw: number; sky: SkyNow }) {
  const { camera, gl } = useThree()
  const def = terrain.def
  const gG = def.gravity
  const g = gG * 9.81
  const gait = gaitFor(gG)
  const hand = useMemo(() => makeAstronaut(false), [])
  const [model, setModel] = useState<Rig | null>(null)
  useEffect(() => {
    let dead = false
    void loadSuit().then(async (src) => {
      if (!src || dead) return
      const r = await makeSuitRig(src, false)
      if (!dead && r) setModel(r)
    })
    return () => void (dead = true)
  }, [])
  const rig = model ?? hand
  useEffect(() => {
    rig.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true
    })
  }, [rig])

  const staticRocks = useMemo(() => rockBodies(terrain), [terrain])
  const rocksNow = () => (isWide(terrain) && wideNow.world ? wideNow.world.cells : staticRocks)
  const range = roverRangeFor(terrain, ROVER_RANGE)
  const prints = useMemo(() => new Footprints(def.ground, lowMemory() ? 300 : 800), [def.ground])
  useEffect(() => () => prints.dispose(), [prints])
  // けり上げる砂（空気の無い星では放物線、ある星では土けむり）
  const hasAir = !!def.sky
  const dust = useMemo(() => new Regolith(lowMemory() ? 260 : 520, new THREE.Color(def.ground), hasAir, g, windFor(def.id, hasAir)), [def, hasAir, g])
  useEffect(() => () => dust.dispose(), [dust])
  const dustBase = useMemo(() => new THREE.Color(def.ground).lerp(new THREE.Color('#ffffff'), 0.12), [def.ground])
  /** 足 i の位置（体の横に ±0.13 m、along は前へ） */
  const footAt = (s: Walk, i: number, along: number) => {
    const off = i === 0 ? -0.13 : 0.13
    return [s.x + Math.cos(s.heading) * off - Math.sin(s.heading) * along, s.z - Math.sin(s.heading) * off - Math.cos(s.heading) * along] as const
  }
  /** 足 i で砂をける。back は後ろへ飛ばすか（けり出し）、まわりへ散らすか（着地） */
  const kick = (s: Walk, i: number, power: number, back: boolean, n: number) => {
    if (!def.dust) return
    const [x, z] = footAt(s, i, back ? -0.15 : 0.1)
    const bx = Math.sin(s.heading)
    const bz = Math.cos(s.heading)
    dust.kick(x, groundAt(x, z), z, back ? bx : -bx, back ? bz : -bz, power, back ? 0.18 : 0.5, n)
  }

  // いま立って見ていた場所（着陸船の少し手前）から出る。着陸船の方を向いて、カメラは後ろから
  const st = useRef<Walk | null>(null)
  if (!st.current) {
    const x = 0
    const z = 0
    const heading = Math.atan2(-(LANDER_POS.x - x), -(LANDER_POS.y - z))
    st.current = { x, z, y: meshHeight(terrain, x, z), vy: 0, vx: 0, vz: 0, heading, grounded: true, crouch: -1, landed: 9, big: false, speedUp: 1, phase: 0, plant: [true, true], touched: -9, jumpAt: -9, stance: 0, airT: 0, flight: 0.6 }
    suitCam.yaw = heading + 0.5
    suitCam.pitch = 0.2
    suitCam.dist = 5
  }

  useEffect(() => bindSuitKeys(), [])
  useEffect(() => {
    suitDebug.place = (x, z, heading) => {
      const s = st.current
      if (s) Object.assign(s, { x, z, y: meshHeight(terrain, x, z), vx: 0, vz: 0, vy: 0, heading, grounded: true })
    }
    return () => void (suitDebug.place = null)
  }, [terrain])

  // 見回す：ドラッグで向き、ホイール・2 本指で近づく
  useEffect(() => {
    const el = gl.domElement
    const ptrs = new Map<number, { x: number; y: number }>()
    let pinch = 0
    const down = (e: PointerEvent) => void ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const move = (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId)
      if (!p) return
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch) suitCam.dist = THREE.MathUtils.clamp(suitCam.dist * (pinch / d), 2.2, 14)
        pinch = d
        return
      }
      suitCam.yaw -= dx * 0.006
      suitCam.pitch = THREE.MathUtils.clamp(suitCam.pitch + dy * 0.004, -0.15, 1.2)
      if (st.current) st.current.touched = performance.now() / 1000
    }
    const up = (e: PointerEvent) => {
      ptrs.delete(e.pointerId)
      if (ptrs.size < 2) pinch = 0
    }
    const wheel = (e: WheelEvent) => void (suitCam.dist = THREE.MathUtils.clamp(suitCam.dist * Math.exp(e.deltaY * 0.001), 2.2, 14))
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl])

  const tmp = useMemo(() => ({ cam: new THREE.Vector3(), look: new THREE.Vector3() }), [])
  const rockList = useRef<RockBody[]>([])

  /** 足もとの高さ（岩の上にも乗る） */
  const groundAt = (x: number, z: number) => {
    const base = meshHeight(terrain, x, z)
    const list = rockList.current
    return list.length ? onRocks(list, x, z, base) : base
  }

  useFrame((_, rawDt) => {
    const s = st.current!
    if (useLanding.getState().phase !== 'surface') return
    const now = performance.now() / 1000
    const dtReal = Math.min(rawDt, 0.05)
    const dt = dtReal * (s.big && !s.grounded ? s.speedUp : 1)

    // ---- 入力：カメラの向きで前後左右 ----
    let ix = suitInput.x
    let iz = suitInput.z
    if (suitDebug.move) [ix, iz] = suitDebug.move
    const len = Math.hypot(ix, iz)
    if (len > 1) {
      ix /= len
      iz /= len
    }
    const run = suitInput.run || useSuitWalk.getState().run
    const fx = -Math.sin(suitCam.yaw)
    const fz = -Math.cos(suitCam.yaw)
    const wantX = fx * iz + Math.cos(suitCam.yaw) * ix
    const wantZ = fz * iz - Math.sin(suitCam.yaw) * ix
    const want = Math.min(1, Math.hypot(wantX, wantZ))

    // 速さ：歩く・走る。弱い重力ほど、地面をける力が足りず加速がにぶい（すべる）
    const top = gait === 'float' ? (run ? 1.1 : 0.6) : gait === 'hop' ? (run ? 2.3 : 1.35) : run ? 2.8 : 1.35
    const accel = gait === 'float' ? 0.35 : 1 + 0.5 * g

    rockList.current = [...nearRocks(rocksNow(), s.x, s.z)]

    if (s.grounded) {
      const tx = want > 0.05 ? (wantX / Math.max(want, 1e-6)) * top * want : 0
      const tz = want > 0.05 ? (wantZ / Math.max(want, 1e-6)) * top * want : 0
      const dvx = tx - s.vx
      const dvz = tz - s.vz
      const dv = Math.hypot(dvx, dvz)
      const step = accel * dt
      if (dv <= step) {
        s.vx = tx
        s.vz = tz
      } else {
        s.vx += (dvx / dv) * step
        s.vz += (dvz / dv) * step
      }
    }
    // 向き：進みたい向きへ（空中ではほとんど回れない）
    if (want > 0.05) {
      const target = Math.atan2(-wantX, -wantZ)
      let d = target - s.heading
      d = Math.atan2(Math.sin(d), Math.cos(d))
      s.heading += d * Math.min(1, dt * (s.grounded ? 7 : 1.2))
    }
    const speed = Math.hypot(s.vx, s.vz)

    // ---- 跳ぶ ----
    // 押したとき空中（跳ねている途中）なら、次に足がついたときに跳ぶ
    if (suitInput.jump) {
      suitInput.jump = false
      s.jumpAt = now
    }
    // とても弱い重力では、ふわっと浮いている足もとからでもけれる（地面すれすれなら）
    const nearGround = s.grounded || (gait === 'float' && s.y - groundAt(s.x, s.z) < 0.2 && !s.big)
    if (now - s.jumpAt < 4 && nearGround && s.crouch < 0) {
      s.grounded = true
      s.vy = 0
      s.crouch = 0.32
      s.jumpAt = -9
    }
    if (s.crouch >= 0) {
      s.crouch -= dtReal
      if (s.crouch < 0) {
        const v = Math.min(JUMP_V, Math.sqrt(2 * g * JUMP_TOP))
        s.vy = v
        s.grounded = false
        s.big = true
        s.speedUp = Math.max(1, (2 * v) / g / AIR_SHOWN)
        // 両足でけった砂
        kick(s, 0, 0.9, true, 14)
        kick(s, 1, 0.9, true, 14)
      }
    } else if (s.grounded && gait === 'hop' && speed > LOPE_FROM && s.landed > CONTACT) {
      // ロープ：地面についている足でけって、低く長く弾む（速いほど少し高く）。けった足は後ろに残る
      s.vy = Math.sqrt(2 * g * (0.05 + 0.06 * Math.min(1, speed / 2.3)))
      s.flight = (2 * s.vy) / g
      s.airT = 0
      s.grounded = false
      s.big = false
      kick(s, s.stance, 0.4 + 0.35 * Math.min(1, speed / 2.3), true, 12)
    } else if (s.grounded && gait === 'float' && speed > 0.15 && s.landed > 0.5) {
      // ほんの少しけっただけで浮く
      s.vy = Math.min(0.12, g * 1.4)
      s.grounded = false
      s.big = false
    }

    // ---- 動く ----
    let nx = s.x + s.vx * dt
    let nz = s.z + s.vz * dt
    // 範囲の端
    let edge = false
    if (Math.abs(nx) > range || Math.abs(nz) > range) {
      nx = THREE.MathUtils.clamp(nx, -range, range)
      nz = THREE.MathUtils.clamp(nz, -range, range)
      s.vx *= 0.3
      s.vz *= 0.3
      edge = true
    }
    // 着陸船
    const lx = nx - LANDER_POS.x
    const lz = nz - LANDER_POS.y
    const ld = Math.hypot(lx, lz)
    if (ld < LANDER_R && ld > 1e-4 && s.y < meshHeight(terrain, LANDER_POS.x, LANDER_POS.y) + 6) {
      nx = LANDER_POS.x + (lx / ld) * LANDER_R
      nz = LANDER_POS.y + (lz / ld) * LANDER_R
    }
    // 与圧ローバー：車体（車の向きの箱）にはぶつかる。いちばん近い面の外へ押し出す
    let nearCrew = false
    if (crewPose.on && s.y < crewPose.y + CREW_TOP_Y) {
      const cfx = -Math.sin(crewPose.heading)
      const cfz = -Math.cos(crewPose.heading)
      const dx = nx - crewPose.x
      const dz = nz - crewPose.z
      const f = dx * cfx + dz * cfz
      const sd = dx * -cfz + dz * cfx
      const hl = CREW_HALF_L + 0.35
      const hw = CREW_HALF_W + 0.35
      const pf = hl - Math.abs(f)
      const ps = hw - Math.abs(sd)
      if (pf > 0 && ps > 0) {
        const f2 = pf < ps ? Math.sign(f || 1) * hl : f
        const s2 = pf < ps ? sd : Math.sign(sd || 1) * hw
        nx = crewPose.x + cfx * f2 - cfz * s2
        nz = crewPose.z + cfz * f2 + cfx * s2
      }
      const ox = Math.max(0, Math.abs(f) - CREW_HALF_L)
      const oz = Math.max(0, Math.abs(sd) - CREW_HALF_W)
      nearCrew = Math.hypot(ox, oz) < CREW_NEAR
    }
    if (nearCrew !== useSuitWalk.getState().nearCrew) useSuitWalk.setState({ nearCrew })
    // 大きな岩（腰より高い）は、上から乗る以外は越えられない
    for (const r of rockList.current) {
      if (r.h < 0.8 || s.y > r.t - 0.15) continue
      const dx = nx - r.x
      const dz = nz - r.z
      const d = Math.hypot(dx, dz)
      const min = r.r + 0.35
      if (d < min && d > 1e-4) {
        nx = r.x + (dx / d) * min
        nz = r.z + (dz / d) * min
      }
    }
    s.x = nx
    s.z = nz
    const gy = groundAt(s.x, s.z)
    if (s.grounded) {
      // 下り坂や岩から降りるとき：段差が大きければ落ちる
      if (s.y - gy > 0.25) {
        s.grounded = false
        s.vy = 0
      } else s.y = gy
      s.landed += dtReal
    } else {
      s.airT += dt
      s.vy -= g * dt
      s.y += s.vy * dt
      if (s.y <= gy && s.vy <= 0) {
        s.y = gy
        s.grounded = true
        s.landed = 0
        const fall = Math.min(2, -s.vy)
        if (s.big) {
          // 大ジャンプの着地：少しすべって止まる。両足の足あとと、まわりに飛び散る砂
          s.vx *= 0.4
          s.vz *= 0.4
          prints.add(s.x, s.z, s.heading, 0, groundAt)
          prints.add(s.x, s.z, s.heading, 1, groundAt)
          kick(s, 0, 0.5 + 0.3 * fall, false, 18)
          kick(s, 1, 0.5 + 0.3 * fall, false, 18)
        } else if (gait === 'hop') {
          // ロープの着地：前に出していた足が着く（その足が次にける足）
          s.stance = 1 - s.stance
          const [fx2, fz2] = footAt(s, s.stance, 0.15)
          prints.add(fx2 + Math.cos(s.heading) * (s.stance === 0 ? 0.13 : -0.13), fz2 - Math.sin(s.heading) * (s.stance === 0 ? 0.13 : -0.13), s.heading, s.stance, groundAt)
          kick(s, s.stance, 0.25 + 0.2 * fall, false, 6)
        } else if (gait === 'float') {
          prints.add(s.x, s.z, s.heading, 0, groundAt)
          prints.add(s.x, s.z, s.heading, 1, groundAt)
          kick(s, 0, 0.2, false, 3)
          kick(s, 1, 0.2, false, 3)
        } else {
          // ふつうの重力で跳んだ着地
          prints.add(s.x, s.z, s.heading, 0, groundAt)
          prints.add(s.x, s.z, s.heading, 1, groundAt)
          kick(s, 0, 0.4, false, 8)
          kick(s, 1, 0.4, false, 8)
        }
        useSuitWalk.setState({ steps: prints.total })
        s.big = false
        s.speedUp = 1
      }
    }
    if (edge !== useSuitWalk.getState().edge) useSuitWalk.setState({ edge })

    // ---- ポーズ ----
    const r = rig
    const air = !s.grounded
    if (s.crouch >= 0) {
      // 大ジャンプのしゃがみ：腕を後ろへ引いて、最後に振り上げる
      const k = 1 - s.crouch / 0.32
      const c = k < 0.75 ? smooth(k / 0.75) * 0.9 : 0.9 - smooth((k - 0.75) / 0.25) * 0.7
      const up = k > 0.75 ? smooth((k - 0.75) / 0.25) * 0.6 : 0
      const arm = 0.75 * c * (1 - up) - 2.7 * up
      setPose(r, [-0.95 * c, -0.95 * c], [1.75 * c, 1.75 * c], [arm, arm], 0.12 + 0.25 * up, -0.35 - 0.3 * c, 0.45 * c, -0.12 * c)
    } else if (air && s.big) {
      // 大ジャンプの空中：上りは腕を上げ、下りで脚を前に出して着地にそなえる
      const fall = s.vy < 0 ? Math.min(1, -s.vy / Math.max(0.5, Math.sqrt(2 * g * 2))) : 0
      const arm = -2.2 + 1.6 * fall
      const t = 0.3 + 0.2 * fall
      setPose(r, [-0.35 * t - 0.3 * fall, -0.35 * t - 0.3 * fall], [0.7 * t, 0.7 * t], [arm, arm], 0.35, -0.4, 0.05)
    } else if (gait === 'hop' && (air || speed >= LOPE_FROM * 0.85 || s.landed < CONTACT)) {
      // ロープ：けった足（stance）は後ろへ、もう一方は前へ出して次に着く。ひざは曲げたまま
      const moving = Math.min(1, speed / 2.3)
      const st2 = s.stance
      const sw = 1 - st2
      const hip: [number, number] = [0, 0]
      const knee: [number, number] = [0, 0]
      const foot: [number, number] = [0, 0]
      if (!air) {
        // 地面についている：着いた足の上を体が通りすぎ、後ろの足が前へ振り出される。着いた瞬間にひざで受ける
        const c = smooth(Math.min(1, s.landed / CONTACT))
        hip[st2] = -0.5 + 0.9 * c
        knee[st2] = 0.35 + 0.28 * Math.sin(Math.PI * Math.min(1, s.landed / CONTACT))
        hip[sw] = 0.35 - 0.65 * c
        knee[sw] = 0.9 - 0.3 * c
        // 着いた足はかかとから着いて平らになり、最後にかかとを上げてつま先でける。後ろの足はつま先が下を向いたまま前へ
        const k = Math.min(1, s.landed / CONTACT)
        foot[st2] = 0.3 * (1 - smooth(k / 0.35)) - 0.55 * smooth((k - 0.55) / 0.45)
        foot[sw] = -0.45 + 0.3 * c
      } else {
        // 空中：けった足は後ろでひざを曲げ、前の足は着地へ向けて伸ばしていく
        const p = smooth(Math.min(1, s.airT / Math.max(0.1, s.flight)))
        hip[st2] = 0.4 - 0.05 * p
        knee[st2] = 0.4 + 0.5 * p
        hip[sw] = -0.3 - 0.2 * p
        knee[sw] = 0.6 - 0.25 * p
        // けった足はつま先が下、前の足はつま先を上げて、かかとから着く用意
        foot[st2] = -0.55 + 0.25 * p
        foot[sw] = -0.15 + 0.45 * p
      }
      // 腕：少し横に開いて前へ。脚と反対に小さく振る
      const swing = 0.12 * (hip[0] - hip[1])
      setPose(r, hip, knee, [-0.3 + swing, -0.3 - swing], 0.32, -0.95, 0.2 + 0.12 * moving, -0.04, foot)
    } else if (gait === 'walk' || gait === 'hop' || (gait === 'float' && s.grounded)) {
      // ふつうに歩く：参考の歩き（walkCycle.ts）の角度で、かかとから着いて、足の裏を転がし、つま先でける。
      // 月などの弱い重力では、ひざを曲げたままの小さなすり足。速く走るときは、走りの動きへ混ぜていく
      const low = gait === 'hop'
      const amp = Math.min(1, speed / (low ? LOPE_FROM : 1.2)) * (gait === 'float' ? 0.45 : low ? 0.55 : 1)
      const runK = Math.min(1, Math.max(0, (speed - 1.6) / 1.2))
      const cycle = low ? 1.0 : CYCLE_M * (0.7 + 0.3 * Math.min(1, speed / 1.2)) + 1.0 * runK
      if (amp > 0.02) s.phase = (s.phase + (speed * dt) / cycle) % 1
      const W = [legAt(s.phase, amp), legAt(s.phase + 0.5, amp)]
      // 走り（手で作った動き）
      const th = s.phase * Math.PI * 2 + 0.5
      const A = 0.6 * amp
      const runHip: [number, number] = [-A * Math.sin(th), A * Math.sin(th)]
      const runKnee: [number, number] = [amp * (0.15 + 1.35 * Math.max(0, Math.cos(th))), amp * (0.15 + 1.35 * Math.max(0, -Math.cos(th)))]
      const mix = (w: number, r2: number) => w + (r2 - w) * runK
      // 宇宙服は腕が振りにくいので、腕の振りは参考の 6 割
      const hip: [number, number] = [mix(W[0].hip, runHip[0]), mix(W[1].hip, runHip[1])]
      const knee: [number, number] = [mix(W[0].knee, runKnee[0]), mix(W[1].knee, runKnee[1])]
      const arm: [number, number] = [mix(W[0].arm * 0.6, -0.8 * amp * Math.sin(th)), mix(W[1].arm * 0.6, 0.8 * amp * Math.sin(th))]
      const foot: [number, number] = [W[0].foot * (1 - 0.5 * runK), W[1].foot * (1 - 0.5 * runK)]
      const elbow: [number, number] = [mix(W[0].elbow * 0.8, -0.9 * amp), mix(W[1].elbow * 0.8, -0.9 * amp)]
      if (low) {
        // すり足：ひざはいつも少し曲げ、腕は横に開いて前へ（宇宙服で体の前が重い）。足首はあまり使わない
        setPose(r, hip, [knee[0] + 0.25, knee[1] + 0.25], [-0.25 + arm[0] * 0.5, -0.25 + arm[1] * 0.5], 0.3, -0.85, 0.14, 0, [foot[0] * 0.6, foot[1] * 0.6])
      } else setPose(r, hip, knee, arm, 0.14, elbow, 0.08 * amp + 0.18 * runK, 0, foot)
      // かかとが着いた瞬間に足あと
      for (let i = 0; i < 2; i++) {
        const planted = W[i].contact
        if (planted && !s.plant[i] && amp > (low ? 0.15 : 0.25)) {
          prints.add(s.x, s.z, s.heading, i, groundAt)
          useSuitWalk.setState({ steps: prints.total })
          kick(s, i, low ? 0.15 : 0.12, true, low ? 2 : 3)
        }
        s.plant[i] = planted
      }
    } else if (gait === 'float') {
      // 両足で跳ねる：着地でひざを曲げて受け、けり出す。空中ではひざを少し曲げ、腕は少し横へ
      const moving = Math.min(1, speed / 1.35)
      if (!air) {
        const c = s.landed < 0.14 ? Math.sin((s.landed / 0.14) * Math.PI) * 0.55 * moving : 0
        setPose(r, [-0.5 * c, -0.5 * c], [1.0 * c, 1.0 * c], [0.3 * c, 0.3 * c], 0.22, -0.5, 0.25 * c + 0.1 * moving, -0.05 * c)
      } else {
        const up = s.vy > 0 ? 1 : 0
        const t = 0.2 + 0.15 * up
        setPose(r, [-0.25 * t - 0.15 * moving, -0.25 * t - 0.15 * moving], [0.5 * t + 0.2 * moving, 0.5 * t + 0.2 * moving], [-0.25, -0.25], 0.3, -0.55, 0.12 * moving)
      }
    }
    r.root.position.set(s.x, s.y, s.z)
    r.root.rotation.y = s.heading + Math.PI

    // 地面を読み込む中心・影の中心
    roverFocus.set(s.x, s.y, s.z)
    Object.assign(suitPose, { x: s.x, y: s.y, z: s.z, heading: s.heading, speed, grounded: s.grounded })
    prints.update(dtReal)
    // 砂：大きさと、日の当たり方
    dust.update(dtReal)
    const cam0 = camera as THREE.PerspectiveCamera
    dust.material.uniforms.uScale.value = (gl.domElement.height || 720) / (2 * Math.tan((cam0.fov * Math.PI) / 360))
    const lit = Math.max(0.15, Math.min(1, sky.sunDir.y * 3 + 0.2))
    dust.material.uniforms.uColor.value.copy(dustBase).multiplyScalar(lit)
    dust.material.uniforms.uShadow.value.copy(dustBase).multiplyScalar(lit * 0.35 + 0.04)
    dust.material.uniforms.uSunView.value.copy(sky.sunDir).transformDirection(cam0.matrixWorldInverse)

    // ---- カメラ：後ろから追う。手で動かしてしばらくは、そのまま ----
    if (want > 0.05 && now - s.touched > 1.5 && s.grounded) {
      let d = s.heading - suitCam.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      suitCam.yaw += d * Math.min(1, dtReal * 1.2)
    }
    const cam = camera as THREE.PerspectiveCamera
    const cp = Math.cos(suitCam.pitch)
    tmp.look.set(s.x, s.y + 1.25, s.z)
    tmp.cam.set(s.x + Math.sin(suitCam.yaw) * cp * suitCam.dist, s.y + 1.4 + Math.sin(suitCam.pitch) * suitCam.dist, s.z + Math.cos(suitCam.yaw) * cp * suitCam.dist)
    const minY = meshHeight(terrain, tmp.cam.x, tmp.cam.z) + 0.4
    if (tmp.cam.y < minY) tmp.cam.y = minY
    const first = (cam.userData.suitCam ?? 0) < now - 0.5
    cam.userData.suitCam = now
    if (first) cam.position.copy(tmp.cam)
    else cam.position.lerp(tmp.cam, 1 - Math.exp(-dtReal * 8))
    cam.lookAt(tmp.look)
    if (Math.abs(cam.fov - 55) > 0.05) {
      cam.fov += (55 - cam.fov) * Math.min(1, dtReal * 5)
      cam.updateProjectionMatrix()
    }
  })

  return (
    <>
      <primitive object={rig.root} />
      <primitive object={prints.mesh} />
      <primitive object={dust.points} />
    </>
  )
}
