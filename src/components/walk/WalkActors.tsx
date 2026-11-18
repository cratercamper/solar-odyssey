import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GRAVITY, HOVER_BOOST, HOVER_SPEED, JUMP_SPEED, RUN_SPEED, WALK_SPEED, useWalk, walkInput, walkNow } from '../../state/walk'
import { isTouchDevice } from '../../state/input'
import { currentLevel, lowMemory } from '../../state/quality'
import { seeded } from '../sf/batch'
import { CREW_LOOK, Mannequin, randomLook, type Age, type Motion, type Person } from './figure'
import { PLAYER_MODEL, PLAYER_SCALE, VrmPerson, prepareVrmPeople } from './vrmPeople'
import { DECK_TOP, HoverScooter, RIDER_Z } from './hoverScooter'
import { BOUNDS, G, GROUND_LIFT, LOOP, NS_S, PLAY, POND, frameAt, landPoint, loopPoint, parkLayout, pondValue, upAt, type Bench } from './park'

// 歩く場面の人：自分（後ろから・自分の目で）と、公園のまわりの人たち。
// 人の形は Person（figure.ts）。読み込むまでは仮の人形で、読めたら VRM の人（vrmPeople.ts、MakeHuman 製）と Mixamo の動きに差し替える。

const Y = new THREE.Vector3(0, 1, 0)
const qf = new THREE.Quaternion()
const qy = new THREE.Quaternion()
const tmp = new THREE.Vector3()
const up = new THREE.Vector3()
const euler = new THREE.Euler(0, 0, 0, 'YXZ')
const qc = new THREE.Quaternion()

/** 人を (s, y) に、地面から h、向き yaw で置く（地面の板は GROUND_LIFT だけ浮いているので、足元もそこにそろえる。
 * そろえないと、MakeHuman の人の低い靴のつま先が芝に埋まって見えなくなる） */
function placePerson(p: Person, s: number, y: number, h: number, yaw: number) {
  landPoint(s, y, h + GROUND_LIFT, p.group.position)
  frameAt(s, qf)
  p.group.quaternion.copy(qf).multiply(qy.setFromAxisAngle(Y, yaw))
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const turn = (from: number, to: number, k: number) => from + wrap(to - from) * Math.min(1, k)

/** 降りた所：南北の道の上、遊び場と池を右前に見る */
const START = { s: NS_S + 2, y: 11285, yaw: -2.2 }

/** この距離 m より近い人は、こちらの顔を見る */
const LOOK_DIST = 4.5
const lookPt = new THREE.Vector3()

/** 自分の今の位置（影の範囲・まわりの人の判定に使う） */
export const walker = {
  s: START.s,
  y: START.y,
  h: 0,
  pos: new THREE.Vector3(),
  /** 進む速さ m/s（ホバースクーターの速度計） */
  speed: 0,
  /** テスト用：向きをこの角度にする */
  turnTo: null as number | null,
  /** テスト用：ホバースクーターの速さをこの値にする */
  rideSpeed: null as number | null,
}

/* ---------- 自分 ---------- */

/** ぶつかるもの・池・柵から押し出す（ホバースクーターは池の上も走れる） */
function collide(p: { s: number; y: number }, r: number, pond = true) {
  const park = parkLayout()
  for (const o of park.obstacles) {
    const ds = p.s - o.s
    const dy = p.y - o.y
    const min = o.r + r
    if (Math.abs(ds) > min || Math.abs(dy) > min) continue
    const d = Math.hypot(ds, dy)
    if (d < min && d > 1e-6) {
      p.s = o.s + (ds / d) * min
      p.y = o.y + (dy / d) * min
    }
  }
  // 池には入らない（岸の砂利まで）
  const k = pond ? pondValue(p.s, p.y, 1.5) : 2
  if (k < 1) {
    const f = 1 / Math.sqrt(k)
    p.s = POND.s + (p.s - POND.s) * f
    p.y = POND.y + (p.y - POND.y) * f
  }
  p.s = Math.min(BOUNDS.s1, Math.max(BOUNDS.s0, p.s))
  p.y = Math.min(BOUNDS.y1, Math.max(BOUNDS.y0, p.y))
}

function Player() {
  const { camera } = useThree()
  const st = useMemo(
    () => ({
      me: new Mannequin(CREW_LOOK) as Person,
      // 体の向き・カメラの向き（左右・上下）・カメラの距離
      body: START.yaw,
      yaw: START.yaw,
      pitch: -0.08,
      dist: 4.2,
      vh: 0,
      phase: 0,
      speed: 0,
      bench: null as Bench | null,
      checkBench: 0,
      // ホバースクーター
      sc: null as HoverScooter | null,
      /** スクーターの地面の上の位置・向き・浮いた高さ（ホップ） */
      sc0: { s: 0, y: 0, yaw: 0 },
      scS: 0,
      scY: 0,
      scYaw: 0,
      /** 乗りこむ途中（0→1）。スクーターが飛んできて、跳んだ足の下に入る */
      mountT: 1,
      mountFrom: { s: 0, y: 0, h: 0, yaw: 0 },
      /** 乗っている（足が板に着いた） */
      onDeck: false,
      /** 降りたい（速いときはまず止まる） */
      wantOff: false,
      spd: 0,
      vs: 0,
      vy: 0,
      hop: 0,
      hopV: 0,
      roll: 0,
      tilt: 0,
      lastLook: 0,
      fov: 62,
    }),
    [],
  )
  useEffect(() => {
    walker.s = START.s
    walker.y = START.y
    walker.h = 0
    // 公園の人（VRM）が読めたら、自分も VRM の人にする
    let dead = false
    prepareVrmPeople()
      .then((models) => {
        if (dead) return
        const model = models.find((m) => m.info.file === PLAYER_MODEL) ?? models[0]
        const old = st.me
        st.me = new VrmPerson(model, seeded(77), PLAYER_SCALE, true)
        old.dispose()
      })
      .catch(() => {})
    return () => {
      dead = true
      st.me.dispose()
      st.sc?.dispose()
      st.sc = null
      walker.speed = 0
    }
  }, [st])

  useFrame(({ scene }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    if (!st.me.group.parent) scene.add(st.me.group)
    const w = useWalk.getState()
    const touch = isTouchDevice()
    // 向き：マウス・なぞり
    if (walkInput.lookX || walkInput.lookY) st.lastLook = walkNow()
    st.yaw -= walkInput.lookX
    if (walker.turnTo !== null) {
      st.yaw = st.body = walker.turnTo
      walker.turnTo = null
    }
    st.pitch = Math.max(-1.25, Math.min(w.view === 'eye' ? 1.45 : 1.15, st.pitch - walkInput.lookY))
    walkInput.lookX = walkInput.lookY = 0
    if (walkInput.zoom) {
      st.dist = Math.max(0.9, Math.min(14, st.dist * (1 + walkInput.zoom * 0.12)))
      walkInput.zoom = 0
    }
    // 入力：キーとスティック
    const fwd = walkInput.fwd - walkInput.stickY
    const right = walkInput.right + walkInput.stickX
    const mag = Math.min(1, Math.hypot(fwd, right))
    const running = w.run || walkInput.shift
    // スマホ：歩きはスティックの倒し具合で速さが変わる。走るボタンが入っていれば、少し倒すだけでも走る
    const target = mag > 0.05 ? (running ? RUN_SPEED * (touch ? Math.max(0.75, mag) : 1) : WALK_SPEED * (touch ? Math.max(0.35, mag) : 1)) : 0

    // ホバースクーターに乗る・降りる
    if (walkInput.ride) {
      walkInput.ride = false
      if (!w.riding) mount()
      else if (pondValue(walker.s, walker.y, 0.5) < 1) useWalk.setState({ waterNote: walkNow() })
      else st.wantOff = true
    }
    function mount() {
      if (useWalk.getState().sitting) standUp()
      if (!st.sc) {
        st.sc = new HoverScooter(scene)
        scene.add(st.sc.group)
        st.sc0 = { s: walker.s + Math.sin(st.body) * 30, y: walker.y + Math.cos(st.body) * 30, yaw: st.body }
      }
      // 置いてあるスクーターが近ければそこから、遠ければ後ろから飛んでくる
      const far = Math.hypot(st.sc0.s - walker.s, st.sc0.y - walker.y) > 40
      st.mountFrom = far ? { s: walker.s + Math.sin(st.body) * 6, y: walker.y + Math.cos(st.body) * 6, h: 1.6, yaw: st.body } : { ...st.sc0, h: 0 }
      st.mountT = 0
      st.onDeck = false
      st.wantOff = false
      st.spd = st.vs = st.vy = 0
      st.vh = JUMP_SPEED
      st.speed = 0
      useWalk.setState({ riding: true, benchNear: false })
    }
    function dismount() {
      st.wantOff = false
      st.onDeck = false
      useWalk.setState({ riding: false })
      ;(st.me as VrmPerson).grip?.(null, null)
      st.sc0 = { s: st.scS, y: st.scY, yaw: st.scYaw }
      // 右へ跳んで降りる
      walker.s += Math.cos(st.body) * 0.65
      walker.y += -Math.sin(st.body) * 0.65
      collide(walker, 0.3)
      walker.h = DECK_TOP
      st.vh = 1.2
      st.spd = st.vs = st.vy = 0
    }

    // 座る・立つ
    if (walkInput.sit) {
      walkInput.sit = false
      if (useWalk.getState().riding) {
        // 乗っているあいだは座らない
      } else if (w.sitting) standUp()
      else sitDown()
    }
    if (useWalk.getState().sitting && mag > 0.3) standUp()
    function standUp() {
      if (st.bench) {
        st.bench.taken = false
        // ベンチの前へ一歩
        walker.s += -Math.sin(st.body) * 0.9
        walker.y += -Math.cos(st.body) * 0.9
      }
      st.bench = null
      useWalk.setState({ sitting: false })
    }
    function sitDown() {
      const b = nearestBench(walker.s, walker.y, 2.4)
      if (!b) return
      b.taken = true
      st.bench = b
      walker.s = b.s
      walker.y = b.y
      st.body = b.yaw
      st.speed = 0
      useWalk.setState({ sitting: true })
    }

    const sitting = useWalk.getState().sitting
    const riding = useWalk.getState().riding
    let motion: Motion = 'idle'
    let deckPlaced = false
    if (riding) {
      // ---- ホバースクーター：前後で加速・ブレーキ、左右で曲がる。浮いているので少し横すべりする ----
      const steer = Math.max(-1, Math.min(1, right))
      const throttle = st.wantOff ? -1 : Math.max(-1, Math.min(1, fwd))
      const top = running ? HOVER_BOOST : HOVER_SPEED
      const tgt = throttle > 0.05 ? throttle * top : throttle < -0.05 ? (st.wantOff ? 0 : throttle * 3) : 0
      const acc = tgt > st.spd ? (st.spd < 0 ? 8 : running ? 6 : 4.5) : throttle < -0.05 && st.spd > 0 ? 10 : 2.4
      if (walker.rideSpeed !== null) {
        st.spd = walker.rideSpeed
        st.vs = -Math.sin(st.body) * st.spd
        st.vy = -Math.cos(st.body) * st.spd
        walker.rideSpeed = null
      }
      const before = st.spd
      st.spd += Math.sign(tgt - st.spd) * Math.min(Math.abs(tgt - st.spd), acc * dt)
      const rate = 2.4 - 1.1 * Math.min(1, Math.abs(st.spd) / HOVER_BOOST)
      const yawRate = -steer * rate * (st.spd < -0.2 ? -1 : 1) * (st.mountT < 1 ? 0 : 1)
      st.body += yawRate * dt
      const hs = -Math.sin(st.body) * st.spd
      const hy = -Math.cos(st.body) * st.spd
      const grip = Math.min(1, dt * 3.2)
      st.vs += (hs - st.vs) * grip
      st.vy += (hy - st.vy) * grip
      // 速いと木をすり抜けないよう、細かく分けて進む
      const want = Math.hypot(st.vs, st.vy) * dt
      const n = Math.max(1, Math.ceil(want / 0.25))
      const s0 = walker.s
      const y0 = walker.y
      for (let i = 0; i < n; i++) {
        walker.s += (st.vs * dt) / n
        walker.y += (st.vy * dt) / n
        collide(walker, 0.55, false)
        for (const m of mobDebug.mobs) {
          const ds = walker.s - m.s
          const dy = walker.y - m.y
          const d = Math.hypot(ds, dy)
          if (d < 0.8 && d > 1e-6) {
            walker.s = m.s + (ds / d) * 0.8
            walker.y = m.y + (dy / d) * 0.8
          }
        }
      }
      // ぶつかったら、はね返って遅くなる
      const got = Math.hypot(walker.s - s0, walker.y - y0)
      if (want > 0.04 && got < want * 0.6) {
        st.spd *= 0.45
        st.vs *= 0.45
        st.vy *= 0.45
      }
      if (st.wantOff && Math.abs(st.spd) < 2) dismount()
      // ホップ（スペース・ジャンプのボタン）
      if (walkInput.jump && st.onDeck && st.hop <= 0.001) st.hopV = 3.2
      walkInput.jump = false
      st.hopV -= GRAVITY * dt
      st.hop = Math.max(0, st.hop + st.hopV * dt)
      if (st.hop === 0) st.hopV = Math.max(0, st.hopV)
      // 傾き：曲がる向きへ、加速で前を上げる
      const accel = (st.spd - before) / Math.max(dt, 1e-3)
      st.roll += (yawRate * Math.min(1, Math.abs(st.spd) / 6) * 0.14 - st.roll) * Math.min(1, dt * 4)
      st.tilt += (THREE.MathUtils.clamp(accel * 0.012, -0.08, 0.08) - st.tilt) * Math.min(1, dt * 3)
      // カメラはしばらくマウスを動かさなければ、後ろへまわりこむ
      if (walkNow() - st.lastLook > 0.8 && Math.abs(st.spd) > 0.5) st.yaw = turn(st.yaw, st.body, dt * 2.2)
      st.speed = Math.abs(st.spd)
    }
    if (!useWalk.getState().riding) st.roll = st.tilt = 0
    // スクーターを置く・動かす
    if (st.sc) {
      const riding2 = useWalk.getState().riding
      let liftH = 0
      if (riding2) {
        if (st.mountT < 1) {
          st.mountT = Math.min(1, st.mountT + dt / 0.42)
          const e = 1 - (1 - st.mountT) ** 3
          st.scS = st.mountFrom.s + (walker.s - st.mountFrom.s) * e
          st.scY = st.mountFrom.y + (walker.y - st.mountFrom.y) * e
          liftH = st.mountFrom.h * (1 - e)
          st.scYaw = turn(st.mountFrom.yaw, st.body, e)
        } else {
          st.scS = walker.s
          st.scY = walker.y
          st.scYaw = st.body
        }
      } else {
        st.scS = st.sc0.s
        st.scY = st.sc0.y
        st.scYaw = st.sc0.yaw
      }
      placeObj(st.sc.group, st.scS, st.scY, GROUND_LIFT, st.scYaw)
      st.sc.update(dt, {
        lift: 1,
        hop: st.hop + liftH,
        speed: riding2 ? Math.abs(st.spd) : 0,
        roll: st.roll,
        pitch: st.tilt,
        s: st.scS,
        y: st.scY,
        yaw: st.scYaw,
        water: pondValue(st.scS, st.scY, -1) < 1,
        active: riding2,
      })
      if (riding2) {
        // 跳んで乗りこむ：スクーターが足の下に入ったら、板の上に立つ
        if (!st.onDeck) {
          st.vh -= GRAVITY * dt
          walker.h = Math.max(0, walker.h + st.vh * dt)
          const deck = st.mountT >= 1 ? DECK_TOP : 0
          if (walker.h <= deck && st.vh < 0) {
            walker.h = deck
            st.vh = 0
            if (st.mountT >= 1) st.onDeck = true
          }
          placePerson(st.me, walker.s, walker.y, walker.h, st.body)
          motion = 'jump'
          deckPlaced = true
        } else {
          st.sc.body.updateMatrixWorld(true)
          st.me.group.position.set(0, 0.016, RIDER_Z).applyMatrix4(st.sc.body.matrixWorld)
          st.sc.body.getWorldQuaternion(st.me.group.quaternion)
          walker.h = st.sc.body.position.y + 0.016
          if (st.me instanceof VrmPerson) {
            st.sc.grips(gripL, gripR)
            st.me.grip(gripL, gripR)
          }
          motion = 'ride'
          deckPlaced = true
        }
      }
    }
    if (riding) {
      // 乗っているときは、ここで済み
    } else if (!sitting) {
      st.speed += (target - st.speed) * Math.min(1, dt * (target > st.speed ? 6 : 9))
      if (mag > 0.05) {
        // カメラから見た前・右を、地面の東・北へ
        const fs = -Math.sin(st.yaw)
        const fy = -Math.cos(st.yaw)
        const rs = Math.cos(st.yaw)
        const ry = -Math.sin(st.yaw)
        const ds = (fs * fwd + rs * right) / Math.max(1e-6, Math.hypot(fwd, right))
        const dy = (fy * fwd + ry * right) / Math.max(1e-6, Math.hypot(fwd, right))
        st.body = turn(st.body, Math.atan2(-ds, -dy), dt * 10)
      }
      walker.s += -Math.sin(st.body) * st.speed * dt
      walker.y += -Math.cos(st.body) * st.speed * dt
      collide(walker, 0.3)
      // ジャンプ（コロニーの地面は回転の遠心力で 1G）
      if (walkInput.jump && walker.h <= 0.001) st.vh = JUMP_SPEED
      walkInput.jump = false
      st.vh -= GRAVITY * dt
      walker.h = Math.max(0, walker.h + st.vh * dt)
      if (walker.h === 0) st.vh = Math.max(0, st.vh)
      st.phase += dt * (st.speed / (st.speed > 2.6 ? 1.0 : 0.62)) * Math.PI
      motion = walker.h > 0.05 ? 'jump' : st.speed > 2.6 ? 'run' : st.speed > 0.15 ? 'walk' : 'idle'
    } else {
      walkInput.jump = false
      motion = 'sit'
    }
    if (!deckPlaced) placePerson(st.me, walker.s, walker.y, walker.h, st.body)
    st.me.pose(motion, st.phase, dt, st.speed)
    landPoint(walker.s, walker.y, walker.h, walker.pos)
    walker.speed = riding ? Math.abs(st.spd) : st.speed

    // 近くのベンチ（座るボタンを出す）
    st.checkBench -= dt
    if (st.checkBench <= 0) {
      st.checkBench = 0.25
      const near = !sitting && !riding && !!nearestBench(walker.s, walker.y, 2.4)
      if (near !== w.benchNear) useWalk.setState({ benchNear: near })
    }

    // カメラ
    frameAt(walker.s, qf)
    up.set(0, 1, 0).applyQuaternion(qf)
    euler.set(st.pitch, st.yaw, 0)
    qc.copy(qf).multiply(new THREE.Quaternion().setFromEuler(euler))
    const eye = w.view === 'eye'
    st.me.group.visible = !eye
    const headH = (sitting ? 1.15 : 1.62) * (CREW_LOOK.height / 1.7)
    // 速く走るほど、カメラを少し引いて画角を広げる
    const fast = riding ? Math.abs(st.spd) : 0
    const fov = 62 + fast * 0.6
    if (Math.abs(fov - st.fov) > 0.01 && (camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      st.fov += (fov - st.fov) * Math.min(1, dt * 3)
      ;(camera as THREE.PerspectiveCamera).fov = st.fov
      ;(camera as THREE.PerspectiveCamera).updateProjectionMatrix()
    }
    if (eye) {
      camera.position.copy(walker.pos).addScaledVector(up, headH)
    } else {
      camera.position.copy(walker.pos).addScaledVector(up, headH - 0.15)
      tmp.set(0.35, 0.15, st.dist + fast * 0.12).applyQuaternion(qc)
      camera.position.add(tmp)
      // 地面より下に入らない
      const r = Math.hypot(camera.position.x, camera.position.z)
      const above = G - r
      if (above < 0.3) camera.position.addScaledVector(up, 0.3 - above)
    }
    camera.quaternion.copy(qc)
    camera.up.copy(up)
  })
  return null
}

const gripL = new THREE.Vector3()
const gripR = new THREE.Vector3()

/** 物を (s, y) に、地面から h、向き yaw で置く */
function placeObj(o: THREE.Object3D, s: number, y: number, h: number, yaw: number) {
  landPoint(s, y, h, o.position)
  frameAt(s, o.quaternion).multiply(qy.setFromAxisAngle(Y, yaw))
}

function nearestBench(s: number, y: number, max: number) {
  let best: Bench | null = null
  let bd = max
  for (const b of parkLayout().benches) {
    if (b.taken) continue
    const d = Math.hypot(b.s - s, b.y - y)
    if (d < bd) {
      bd = d
      best = b
    }
  }
  return best
}

/* ---------- まわりの人 ---------- */

type Mob = {
  p: Person
  kind: 'loop' | 'path' | 'kid' | 'sit' | 'chat' | 'lawn'
  age: Age
  s: number
  y: number
  yaw: number
  speed: number
  phase: number
  /** 散歩道の角度・向き */
  t: number
  dir: number
  lane: number
  /** 子ども：行き先と、止まっている時間 */
  ts: number
  ty: number
  wait: number
  jump: number
  motion: Motion
}

/** テスト用：まわりの人の一覧 */
export const mobDebug = { mobs: [] as { kind: string; s: number; y: number; p: Person }[] }

function Mobs() {
  const mobs = useMemo(() => {
    const rand = seeded(9001)
    const lvl = currentLevel()
    const few = lowMemory() || lvl === 'low' || isTouchDevice()
    const scale = few ? 0.45 : lvl === 'medium' ? 0.7 : 1
    const n = (k: number) => Math.max(1, Math.round(k * scale))
    const park = parkLayout()
    for (const b of park.benches) b.taken = false
    const list: Mob[] = []
    const make = (kind: Mob['kind'], age: Age): Mob => ({
      p: new Mannequin(randomLook(age, rand)),
      kind,
      age,
      s: 0,
      y: 0,
      yaw: 0,
      speed: 0,
      phase: rand() * 6,
      t: rand() * Math.PI * 2,
      dir: rand() < 0.5 ? 1 : -1,
      lane: (rand() - 0.5) * 2.4,
      ts: PLAY.s,
      ty: PLAY.y,
      wait: rand() * 2,
      jump: 0,
      motion: 'idle',
    })
    // 池のまわりを散歩する人：西の岸（自分の近く）に多めに
    for (let i = 0; i < n(12); i++) {
      const m = make('loop', rand() < 0.25 ? 'elder' : rand() < 0.15 ? 'child' : 'adult')
      m.t = Math.PI * (0.55 + rand() * 0.9)
      m.speed = m.p instanceof Mannequin ? 1.1 + rand() * 0.5 : 1.3
      list.push(m)
    }
    // 南北の道を行き来する人
    for (let i = 0; i < n(5); i++) {
      const m = make('path', rand() < 0.2 ? 'elder' : 'adult')
      m.y = 11000 + rand() * 1100
      m.s = NS_S + m.lane * 0.6
      m.speed = 1.0 + rand() * 0.6
      list.push(m)
    }
    // 遊び場の子どもたち
    for (let i = 0; i < n(9); i++) {
      const m = make('kid', 'child')
      const a = rand() * Math.PI * 2
      m.s = PLAY.s + Math.cos(a) * PLAY.r * 0.6
      m.y = PLAY.y + Math.sin(a) * PLAY.r * 0.6
      list.push(m)
    }
    // ベンチに座る人（遊び場の見守り・広場・池）
    const seats = [...park.benches].sort(() => rand() - 0.5)
    for (let i = 0; i < n(9) && i < seats.length; i++) {
      const b = seats[i]
      b.taken = true
      const m = make('sit', rand() < 0.45 ? 'elder' : 'adult')
      m.s = b.s
      m.y = b.y
      m.yaw = b.yaw
      list.push(m)
    }
    // 広場で立ち話
    for (let i = 0; i < n(3); i++) {
      const m = make('chat', rand() < 0.3 ? 'elder' : 'adult')
      const a = (i / 3) * Math.PI * 2
      m.s = NS_S + 26 + Math.cos(a) * 0.8
      m.y = 11512 + Math.sin(a) * 0.8
      m.yaw = Math.atan2(Math.cos(a), Math.sin(a))
      list.push(m)
    }
    // 池のほとりの芝生に座る人（VRM の人が読めてから出す）
    for (let i = 0; i < n(5); i++) {
      const m = make('lawn', rand() < 0.3 ? 'child' : rand() < 0.4 ? 'elder' : 'adult')
      const t = Math.PI * (0.62 + i * 0.17 + rand() * 0.05)
      const ox = Math.cos(t)
      const oy = Math.sin(t)
      // 散歩道の外側の芝生（道の中心から 7〜9 m）。池を向く
      m.s = LOOP.s + ox * (LOOP.rs + 7 + rand() * 2)
      m.y = LOOP.y + oy * (LOOP.ry + 7 + rand() * 2)
      m.yaw = Math.atan2(ox, oy)
      list.push(m)
    }
    return list
  }, [])
  const { camera } = useThree()
  useEffect(() => {
    mobDebug.mobs = mobs
    return () => mobs.forEach((m) => m.p.dispose())
  }, [mobs])
  // 公園の人（VRM）が読めたら、仮の人形と入れ替える。読めなければ仮の人形のまま
  useEffect(() => {
    let dead = false
    prepareVrmPeople()
      .then((models) => {
        if (dead) return
        const rand = seeded(4242)
        // 年齢ごとに順番に配って、同じ人が隣り合わないようにする
        const next: Record<string, number> = { child: 0, adult: 1, elder: 0 }
        for (const m of mobs) {
          const list = models.filter((md) => md.info.age === m.age)
          const model = list[next[m.age]++ % list.length]
          const old = m.p
          m.p = new VrmPerson(model, rand, 0.96 + rand() * 0.08)
          old.dispose()
        }
      })
      .catch((e) => console.error('[walk] VRM people failed, keeping placeholder figures', e))
    return () => {
      dead = true
    }
  }, [mobs])

  useFrame(({ scene, clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    // 自分の顔の高さ（まわりの人が見る先）
    upAt(walker.s, lookPt).multiplyScalar(1.5 * PLAYER_SCALE).add(walker.pos)
    for (const m of mobs) {
      if (!m.p.group.parent) scene.add(m.p.group)
      let h = 0
      if (m.kind === 'loop') {
        // 楕円の上を一定の速さで（角度の進みを、その場所の周の長さで割る）
        const a = loopPoint(m.t)
        const b = loopPoint(m.t + 0.001 * m.dir)
        const step = Math.hypot(b.s - a.s, b.y - a.y) / 0.001
        m.t += (m.speed * dt * m.dir) / step
        const p = loopPoint(m.t)
        const q = loopPoint(m.t + 0.002 * m.dir)
        const ds = q.s - p.s
        const dy = q.y - p.y
        const l = Math.hypot(ds, dy)
        // 右側通行ぎみに、道の中で少しずらす
        m.s = p.s + (dy / l) * m.lane
        m.y = p.y - (ds / l) * m.lane
        m.yaw = Math.atan2(-ds, -dy)
        m.motion = 'walk'
        m.phase += dt * (m.speed / 0.62) * Math.PI
      } else if (m.kind === 'path') {
        m.y += m.dir * m.speed * dt
        if (m.y > BOUNDS.y1 - 20) m.dir = -1
        if (m.y < BOUNDS.y0 + 20) m.dir = 1
        m.s = NS_S + m.dir * 0.9
        m.yaw = m.dir > 0 ? Math.PI : 0
        m.motion = 'walk'
        m.phase += dt * (m.speed / 0.62) * Math.PI
      } else if (m.kind === 'kid') {
        // 鬼ごっこ：行き先へ走って、着いたら少し止まる（ときどき跳ねる）
        const ds = m.ts - m.s
        const dy = m.ty - m.y
        const d = Math.hypot(ds, dy)
        if (m.wait > 0) {
          m.wait -= dt
          m.speed = 0
          m.motion = m.jump > 0 ? 'jump' : 'idle'
          if (m.jump > 0) {
            m.jump -= dt
            h = Math.max(0, Math.sin(Math.max(0, m.jump) * Math.PI * 2.4)) * 0.45
          }
          if (m.wait <= 0) {
            const a = Math.random() * Math.PI * 2
            const r = Math.sqrt(Math.random()) * PLAY.r * 0.9
            m.ts = PLAY.s + Math.cos(a) * r
            m.ty = PLAY.y + Math.sin(a) * r
          }
        } else if (d < 0.5) {
          m.wait = 0.4 + Math.random() * 1.8
          m.jump = Math.random() < 0.4 ? 0.42 : 0
        } else {
          m.speed = 2.6 + (Math.sin(m.phase * 0.1) + 1) * 0.6
          m.s += (ds / d) * m.speed * dt
          m.y += (dy / d) * m.speed * dt
          m.yaw = turn(m.yaw, Math.atan2(-ds, -dy), dt * 8)
          m.motion = 'run'
          m.phase += dt * (m.speed / 0.8) * Math.PI
        }
      } else if (m.kind === 'lawn') {
        m.motion = 'ground'
      } else if (m.kind === 'sit') {
        m.motion = 'sit'
        m.phase += dt
      } else {
        m.motion = Math.sin(t * 0.3 + m.lane * 7) > 0.92 ? 'wave' : 'idle'
        m.phase += dt
      }
      // VRM の人は、跳ぶ高さも座る高さも動きの中に入っている
      const vrm = m.p instanceof VrmPerson
      if (vrm) h = 0
      placePerson(m.p, m.s, m.y, h, m.yaw)
      // 遠い人は描かない。芝生に座る人は VRM の人だけ
      tmp.copy(m.p.group.position)
      const far = tmp.distanceTo(camera.position) > 220 || (m.kind === 'lawn' && !vrm)
      m.p.group.visible = !far
      if (!far) {
        // 近くに来たら、こちらの顔を見る（走っている子は前を見たまま）
        if (vrm) {
          const near = m.motion !== 'run' && tmp.distanceTo(walker.pos) < LOOK_DIST
          ;(m.p as VrmPerson).look(near ? lookPt : null)
        }
        m.p.pose(m.motion, m.phase, dt, m.speed)
      }
    }
  })
  return null
}

export function WalkActors() {
  return (
    <>
      <Player />
      <Mobs />
    </>
  )
}
