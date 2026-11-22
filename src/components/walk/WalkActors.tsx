import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GRAVITY, HOVER_BOOST, HOVER_SPEED, JUMP_SPEED, RUN_SPEED, SKY_BOOST, SKY_HEIGHT, SKY_SPEED, WALK_SPEED, useWalk, walkInput, walkNow, type WalkArea } from '../../state/walk'
import { isTouchDevice } from '../../state/input'
import { currentLevel, lowMemory } from '../../state/quality'
import { seeded } from '../sf/batch'
import { CREW_LOOK, Mannequin, randomLook, type Age, type Motion, type Person } from './figure'
import { PLAYER_MODEL, PLAYER_SCALE, VrmPerson, prepareVrmPeople, type VrmModel } from './vrmPeople'
import { LOOKS, applyLook } from './mobLooks'
import { DECK_TOP, HoverScooter, RIDER_Z } from './hoverScooter'
import { JUNGLE, inJungle } from './jungle'
import { FOREST_START } from './forestLayout'
import { BOUNDS, G, GROUND_LIFT, HALF_L, LOOP, NS_S, PLAY, POND, STREETS, STREET_W, WALK_W, frameAt, landPoint, loopPoint, parkLayout, pondValue, pushOutOfBoxes, inTown, upAt, type Bench } from './park'
import { CIRC, inBuilding, pushWorld, roofAt, standable, wetAt, worldArea, wrapS } from './cylinder'
import { CORE, DECK_END, OMEGA, RIDE_S, STATION, STATION_H, TOWER, elevCar, elevH, gAt, nearDoor, onStation, sMeters } from './axis'
import { Wings } from './wings'

// 歩く場面の人：自分（後ろから・自分の目で）と、公園のまわりの人たち。
// 人の形は Person（figure.ts）。読み込むまでは仮の人形で、読めたら VRM の人（vrmPeople.ts、MakeHuman 製）と Mixamo の動きに差し替える。

const Y = new THREE.Vector3(0, 1, 0)
const X = new THREE.Vector3(1, 0, 0)
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

/** 降りた所：南北の道の上、遊び場と池を右前に見る。?forest=jungle などを付けたときは、森の入口の手前 */
const START = FOREST_START ? { s: NS_S, y: 11751, yaw: Math.PI } : { s: NS_S + 2, y: 11285, yaw: -2.2 }

/** 池の散歩道のうち、公園の中にある所（西の岸）の角度。この間を行き来する */
const LOOP_T0 = Math.PI + Math.asin((LOOP.y - BOUNDS.y1 + 12) / LOOP.ry)
const LOOP_T1 = Math.PI + Math.asin((LOOP.y - 11285) / LOOP.ry)

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

/** ぶつかるもの・池・柵から押し出す（ホバースクーターは池の上も走れる）。fly：空を飛んでいる高さ m（低い物は越える） */
function collide(p: { s: number; y: number }, r: number, pond = true, fly = 0) {
  if (fly > 3) {
    pushWorld(p, r, { water: false, fly })
    return
  }
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
  // 家・塀・生け垣
  pushOutOfBoxes(p, r)
  // 池には入らない（岸の砂利まで）
  const k = pond ? pondValue(p.s, p.y, 1.5) : 2
  if (k < 1) {
    const f = 1 / Math.sqrt(k)
    p.s = POND.s + (p.s - POND.s) * f
    p.y = POND.y + (p.y - POND.y) * f
  }
  // 公園の外：街の建物・木・川・湖、端の壁、窓の帯
  pushWorld(p, r, { water: pond })
}

/** 今いる所の名前（左上） */
function areaAt(s: number, y: number): { area: WalkArea; land: number } {
  if (inJungle(s, y)) return { area: 'jungle', land: 0 }
  if (s > BOUNDS.s0 && s < BOUNDS.s1 && y > BOUNDS.y0 && y < BOUNDS.y1) return { area: inTown(s, y) ? 'town' : 'park', land: 0 }
  const w = worldArea(s, y)
  const area: WalkArea = w.area === 'park' ? 'parkZone' : w.area === 'town' ? 'townZone' : w.area
  return { area, land: w.k }
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
      /** 空を飛んでいる高さ m */
      alt: 0,
      cruise: 0,
      land: 0,
      /** 軸へのエレベーター：位置（0 = 地面、1 = 軸の駅）と、動く向き（0 = 乗っていない） */
      elevT: 0,
      elevDir: 0,
      /** 宙に浮いているあいだの、回転の向きへの横すべり m/s（コリオリの力） */
      drift: 0,
      /** 翼：前へ進む空気の速さ m/s、羽ばたきの間、体の傾き（0 = 立つ、1 = 寝て飛ぶ） */
      wings: null as Wings | null,
      gs: 0,
      flapCd: 0,
      lean: 0,
    }),
    [],
  )
  useEffect(() => {
    walker.s = START.s
    walker.y = START.y
    walker.h = 0
    // 軸へのエレベーターの前から始める
    if (useWalk.getState().startAtTower) {
      walker.s = TOWER.s
      walker.y = TOWER.y + 16
      st.body = st.yaw = 0
      useWalk.setState({ startAtTower: false })
    }
    // 公園の人（VRM）が読めたら、自分も VRM の人にする
    let dead = false
    prepareVrmPeople()
      .then((models) => {
        if (dead) return
        // MakeHuman の人のときは決めた人を少し大きく。Rocketbox などは最初の人をそのまま
        const mh = models.find((m) => m.info.file === PLAYER_MODEL)
        const model = mh ?? models[0]
        const old = st.me
        st.me = new VrmPerson(model, seeded(77), mh ? PLAYER_SCALE : 1, true)
        old.dispose()
        useWalk.setState({ peopleReady: true })
      })
      .catch(() => useWalk.setState({ peopleReady: true }))
    return () => {
      dead = true
      st.me.dispose()
      st.sc?.dispose()
      st.sc = null
      st.wings?.dispose()
      st.wings = null
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
      else if (w.flying) {
        // 空からは、まず地面へ降りる（窓の上では降りられない）
        if (standable(walker.s, walker.y)) {
          useWalk.setState({ flying: false })
          st.wantOff = true
        } else useWalk.setState({ skyNote: walkNow() })
      } else if (pondValue(walker.s, walker.y, 0.5) < 1 || wetAt(walker.s, walker.y)) useWalk.setState({ waterNote: walkNow() })
      else st.wantOff = true
    }
    // 空を飛ぶ・地面へ降りる
    if (walkInput.sky) {
      walkInput.sky = false
      if (w.riding) {
        if (!w.flying) useWalk.setState({ flying: true })
        else if (standable(walker.s, walker.y)) useWalk.setState({ flying: false })
        else useWalk.setState({ skyNote: walkNow() })
      }
    }
    function mount() {
      // スクーターは地面だけ（軸の駅やエレベーターでは乗らない）
      if (walker.h > 3 || st.elevDir) {
        useWalk.setState({ riding: false })
        return
      }
      if (useWalk.getState().sitting) standUp()
      if (useWalk.getState().wings) useWalk.setState({ wings: false })
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
      useWalk.setState({ riding: false, flying: false })
      st.alt = 0
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

    // 翼をつける（軸の駅で）・はずす（床や地面に立っているとき）
    if (walkInput.wings) {
      walkInput.wings = false
      const onFloor = walker.h <= (walker.h > STATION_H - 40 && onStation(walker.y) ? STATION_H : 0) + 0.05
      if (w.wings && onFloor) useWalk.setState({ wings: false })
      else if (!w.wings && !w.riding && !st.elevDir && walker.h > STATION_H - 40) {
        if (!st.wings) {
          st.wings = new Wings()
          scene.add(st.wings.group)
        }
        useWalk.setState({ wings: true })
      }
    }

    // 座る・立つ
    if (walkInput.sit) {
      walkInput.sit = false
      const door = nearDoor(walker.s, walker.y, walker.h)
      if (useWalk.getState().riding) {
        // 乗っているあいだは座らない
      } else if (w.sitting) standUp()
      else if (st.elevDir) {
        // 乗っているあいだは何もしない
      } else if (door) {
        // 軸へのエレベーターに乗る（上へ・下へ）
        st.elevDir = door === 'up' ? 1 : -1
        st.elevT = door === 'up' ? 0 : 1
        st.speed = st.vh = st.drift = 0
        // 塔の柱を左に見て、円周の向きを向く（後ろのカメラから柱がじゃまにならない）
        st.body = st.yaw = -Math.PI / 2
        useWalk.setState({ inElev: true, elevNear: null })
      } else sitDown()
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
      let flying = useWalk.getState().flying
      // 降りている途中で窓の上（橋の外）へ出たら、また上がる
      if (!flying && st.alt > 0.3 && !standable(walker.s, walker.y)) {
        useWalk.setState({ flying: true, skyNote: walkNow() })
        flying = true
        st.wantOff = false
      }
      // 高さ：飛ぶときは上がり、降りるときは下がる
      // 飛ぶ高さは 30 m より上で、行く先（3 秒先まで）のいちばん高いビルの屋根より 15 m 上。高いビルが来たら早めに上がる
      if (flying) {
        let roof = roofAt(walker.s, walker.y, 18)
        const v = Math.hypot(st.vs, st.vy)
        if (v > 1) {
          const ahead = Math.min(320, v * 3)
          for (let i = 1; i <= 6; i++) {
            const t = (ahead * i) / 6
            roof = Math.max(roof, roofAt(walker.s + (st.vs / v) * t, walker.y + (st.vy / v) * t, 18))
          }
        }
        st.cruise = Math.max(SKY_HEIGHT, roof + 15)
        st.alt = st.alt < st.cruise ? Math.min(st.cruise, st.alt + dt * (st.cruise - st.alt > 8 ? 40 : 8)) : Math.max(st.cruise, st.alt - dt * 6)
      } else st.alt = Math.max(0, st.alt - dt * (st.alt > 40 ? 20 : 7))
      const high = st.alt > 3
      const throttle = st.wantOff && st.alt < 0.3 ? -1 : Math.max(-1, Math.min(1, fwd))
      // 降りるときは、地面のスクーターの速さまで強く減速する（遠くへ流されない）
      const landing = !flying && st.alt > 0.3
      const top = landing ? HOVER_BOOST : high ? (running ? SKY_BOOST : SKY_SPEED) : running ? HOVER_BOOST : HOVER_SPEED
      const tgt = throttle > 0.05 ? throttle * top : throttle < -0.05 ? (st.wantOff ? 0 : throttle * 3) : 0
      const acc = landing && st.spd > tgt ? 30 : high ? (tgt > st.spd ? 14 : 12) : tgt > st.spd ? (st.spd < 0 ? 8 : running ? 12 : 9) : throttle < -0.05 && st.spd > 0 ? 14 : st.spd > HOVER_BOOST ? 12 : 2.4
      if (walker.rideSpeed !== null) {
        st.spd = walker.rideSpeed
        st.vs = -Math.sin(st.body) * st.spd
        st.vy = -Math.cos(st.body) * st.spd
        walker.rideSpeed = null
      }
      const before = st.spd
      st.spd += Math.sign(tgt - st.spd) * Math.min(Math.abs(tgt - st.spd), acc * dt)
      const rate = high ? 1.05 : 2.4 - 1.1 * Math.min(1, Math.abs(st.spd) / HOVER_BOOST)
      const yawRate = -steer * rate * (st.spd < -0.2 ? -1 : 1) * (st.mountT < 1 ? 0 : 1)
      st.body += yawRate * dt
      const hs = -Math.sin(st.body) * st.spd
      const hy = -Math.cos(st.body) * st.spd
      const grip = Math.min(1, dt * 3.2)
      st.vs += (hs - st.vs) * grip
      st.vy += (hy - st.vy) * grip
      // 速いと木をすり抜けないよう、細かく分けて進む
      const want = Math.hypot(st.vs, st.vy) * dt
      const n = Math.max(1, Math.ceil(want / (high ? 2 : 0.25)))
      const s0 = walker.s
      const y0 = walker.y
      for (let i = 0; i < n; i++) {
        walker.s += (st.vs * dt) / n
        walker.y += (st.vy * dt) / n
        collide(walker, 0.55, false, st.alt)
        if (high) continue
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
      if (st.wantOff && Math.abs(st.spd) < 2 && st.alt < 0.3) dismount()
      // ホップ（スペース・ジャンプのボタン）
      // 初速 6.4 m/s で、高さ約 2 m（v² / 2g）
      if (walkInput.jump && st.onDeck && st.hop <= 0.001) st.hopV = 6.4
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
        hop: st.hop + liftH + st.alt,
        speed: riding2 ? Math.abs(st.spd) : 0,
        roll: st.roll,
        pitch: st.tilt,
        s: st.scS,
        y: st.scY,
        yaw: st.scYaw,
        water: pondValue(st.scS, st.scY, -1) < 1 || wetAt(st.scS, st.scY),
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
            // 両足を板に：左足は少し前、右足は少し後ろ、つま先は少し外向き。速いほど・跳んだあとほど、ひざを曲げる
            const g = st.me.group
            g.updateMatrixWorld(true)
            g.getWorldQuaternion(rideQ)
            footL.set(-0.11, 0, -0.05).applyMatrix4(g.matrixWorld)
            footR.set(0.11, 0, 0.06).applyMatrix4(g.matrixWorld)
            toeL.set(-0.2, 0, -1).normalize().applyQuaternion(rideQ)
            toeR.set(0.28, 0, -1).normalize().applyQuaternion(rideQ)
            const fast = Math.min(1, Math.abs(st.spd) / HOVER_BOOST)
            st.land = Math.max(0, st.land - dt * 4)
            if (st.hop > 0.05) st.land = 1
            const crouch = 0.05 + fast * 0.05 + (st.hop > 0.05 ? 0.06 : Math.sin(Math.min(1, st.land) * Math.PI) * 0.08)
            st.me.stance({ feet: [footL, footR], toes: [toeL, toeR], crouch, lean: 0.08 + fast * 0.14 })
          }
          motion = 'ride'
          deckPlaced = true
        }
      }
    }
    if (riding) {
      // 乗っているときは、ここで済み
    } else if (st.elevDir) {
      // ---- 軸へのエレベーター：かごの中に立って、塔をのぼる・くだる ----
      walkInput.jump = false
      st.elevT = Math.min(1, Math.max(0, st.elevT + (st.elevDir * dt) / RIDE_S))
      elevCar.t = st.elevT
      walker.s = TOWER.s
      walker.y = TOWER.y + 1.2
      walker.h = elevH(st.elevT)
      if ((st.elevDir > 0 && st.elevT >= 1) || (st.elevDir < 0 && st.elevT <= 0)) {
        // 着いたら、扉の外へ出る
        const top = st.elevDir > 0
        st.elevDir = 0
        walker.h = top ? STATION_H : 0
        walker.y = TOWER.y + 4
        useWalk.setState(top ? { inElev: false, axisNote: walkNow() } : { inElev: false })
      }
      motion = 'idle'
    } else if (!sitting && useWalk.getState().wings && walker.h > (walker.h > STATION_H - 40 && onStation(walker.y) ? STATION_H : 0) + 0.02) {
      // ---- 翼で飛ぶ：グライダーのように、重さを前へ進む速さに変えながら、ゆっくり沈んでいく。
      // 軸の近くは重さがほぼ 0 なので、羽ばたいて外へ出る。宙にいるあいだは回転のせいで横へ流される ----
      const g = gAt(walker.h)
      const dive = fwd < -0.3
      const push = fwd > 0.3
      st.yaw -= right * 1.2 * dt
      st.body = turn(st.body, st.yaw, dt * 2.5)
      if (walkInput.jump && st.flapCd <= 0) {
        // 羽ばたき：前へ。軸の近く（軽い所）では外へ（地面のほうへ）押し出す。急降下中は下へ
        st.flapCd = 0.35
        st.gs += 2.5
        st.vh += dive ? -3 : g < 3 ? -2 : 1.6
        st.wings?.flap()
      }
      walkInput.jump = false
      st.flapCd -= dt
      // 前の速さ：重さを前へ進む力に変える（W で少し前のめり、Shift でもっと）。空気の抵抗で頭打ち
      st.gs += ((push ? g * (running ? 0.9 : 0.5) : 0) + (dive ? g * 0.25 : 0) - 0.003 * st.gs * st.gs) * dt
      st.gs = Math.max(0, st.gs)
      if (dive) st.vh += (-g - 0.004 * st.vh * Math.abs(st.vh)) * dt
      else {
        // 滑空：速いほど沈む（滑空比 3）。重いほど沈みやすい
        const sink = -(st.gs / 3) - 1.2 * Math.sqrt(g / GRAVITY)
        st.vh += (sink - st.vh) * Math.min(1, dt * 1.2)
      }
      // 地面の近くでは、翼を立てて速さを落とす
      if (walker.h < 80) st.vh = Math.max(st.vh, -4 - walker.h * 0.15)
      // 回転のせいで横へ流される（コリオリの力）。翼が空気を受けるので、横の流れは少しずつ消える
      st.drift += (2 * OMEGA * st.vh - 0.5 * st.drift) * dt
      const sm = sMeters(walker.h)
      walker.s += (-Math.sin(st.body) * st.gs + st.drift) * dt / sm
      walker.y += -Math.cos(st.body) * st.gs * dt
      walker.h += st.vh * dt
      if (walker.h > G - 2) {
        walker.h = G - 2
        st.vh = Math.min(0, st.vh) * 0.3
      }
      if (walker.h > STATION_H - 40) walker.y = Math.max(STATION.y0 + 0.5, walker.y)
      // 街の建物の壁（高い所では、その高さより低い建物は数えない）
      if (walker.h < 200) collide(walker, 0.4, false, walker.h)
      // 床・地面に着いたら立つ
      const fl = walker.h > STATION_H - 40 && onStation(walker.y) ? STATION_H : 0
      if (walker.h <= fl) {
        walker.h = fl
        st.vh = st.drift = 0
        st.speed = Math.min(st.gs, 4)
        st.gs = 0
      } else st.speed = st.gs
      motion = 'jump'
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
      // 重さは回転の遠心力（地面で 1G、軸に近いほど軽い）。軽いと、足が地面をけれないのでゆっくりしか進めない
      const g = gAt(walker.h)
      const floor = walker.h > STATION_H - 40 && onStation(walker.y) ? STATION_H : 0
      const grounded = walker.h <= floor + 0.02
      const pace = grounded ? Math.max(0.3, Math.sqrt(g / GRAVITY)) : 0.15
      const sm = sMeters(walker.h)
      walker.s += (-Math.sin(st.body) * st.speed * pace * dt + st.drift * dt) / sm
      walker.y += -Math.cos(st.body) * st.speed * pace * dt
      if (walker.h < 30) collide(walker, 0.3)
      // 塔の柱
      const cs = (walker.s - TOWER.s) * sm
      const cy = walker.y - CORE.y
      const cd = Math.hypot(cs, cy)
      if (cd < CORE.r + 0.35 && (walker.h < 30 || walker.h > STATION_H - 40)) {
        const k = (CORE.r + 0.35) / Math.max(1e-3, cd)
        walker.s = TOWER.s + (cs * k) / sm
        walker.y = CORE.y + cy * k
      }
      // 軸の駅とデッキは手すりの内側だけ（翼をつけていれば、デッキの先から飛び出せる）
      if (walker.h > STATION_H - 40) walker.y = Math.min(useWalk.getState().wings ? Infinity : DECK_END - 0.5, Math.max(STATION.y0 + 0.5, walker.y))
      // ジャンプ。宙にいるあいだは、回転のせいで横へ流される（上がると回転の向きへ、落ちると逆へ）
      if (walkInput.jump && grounded) st.vh = JUMP_SPEED
      walkInput.jump = false
      st.vh -= (g + 2 * OMEGA * st.drift) * dt
      if (!grounded || st.vh > 0) st.drift += 2 * OMEGA * st.vh * dt
      walker.h = Math.max(floor, walker.h + st.vh * dt)
      // 軸（回転の中心）より上へは行かない
      if (walker.h > G - 2) {
        walker.h = G - 2
        st.vh = Math.min(0, st.vh) * 0.3
      }
      if (walker.h === floor) {
        st.vh = Math.max(0, st.vh)
        st.drift = 0
      }
      // 翼で飛び出したときは、歩いていた速さのまま
      st.gs = st.speed * pace
      st.phase += dt * ((st.speed * pace) / (st.speed > 2.6 ? 1.0 : 0.62)) * Math.PI
      motion = walker.h > floor + 0.05 ? 'jump' : st.speed > 2.6 ? 'run' : st.speed > 0.15 ? 'walk' : 'idle'
    } else {
      walkInput.jump = false
      motion = 'sit'
    }
    if (!deckPlaced) placePerson(st.me, walker.s, walker.y, walker.h, st.body)
    // 翼：飛んでいるあいだは体を前へ倒して寝かせ、翼を広げる
    const winged = useWalk.getState().wings
    const airborne = winged && motion === 'jump'
    st.lean += ((airborne ? Math.min(1, st.gs / 6) : 0) - st.lean) * Math.min(1, dt * 3)
    if (st.lean > 0.01) {
      // 腰のあたり（1 m）を中心に、前（-z）へ倒す
      tmp.set(0, 1, 0).applyQuaternion(st.me.group.quaternion)
      st.me.group.position.addScaledVector(tmp, 1)
      st.me.group.quaternion.multiply(qy.setFromAxisAngle(X, -1.25 * st.lean))
      tmp.set(0, 1, 0).applyQuaternion(st.me.group.quaternion)
      st.me.group.position.addScaledVector(tmp, -1)
    }
    if (st.wings) {
      st.wings.group.visible = winged
      if (winged) {
        st.wings.group.position.set(0, 1.38, 0.17).applyQuaternion(st.me.group.quaternion).add(st.me.group.position)
        st.wings.group.quaternion.copy(st.me.group.quaternion)
        st.wings.update(dt, airborne ? 1 : 0)
        // 飛んでいるあいだは、両手で翼の骨をにぎる（足はそろえてのばす）
        if (airborne && st.lean > 0.5 && st.me instanceof VrmPerson) {
          st.wings.handles(gripL, gripR)
          st.me.grip(gripL, gripR)
          motion = 'glide'
        }
      }
    }
    st.me.pose(motion, st.phase, dt, st.speed)
    landPoint(walker.s, walker.y, walker.h, walker.pos)
    // 円筒を一周したら、s を半周の内側へもどす（同じ場所のまま）
    if (Math.abs(walker.s) > CIRC / 2) {
      const before = walker.s
      walker.s = wrapS(walker.s)
      st.scS += walker.s - before
      st.mountFrom.s += walker.s - before
      st.sc0.s += walker.s - before
    }
    // 左上の場所の名前
    const at = st.elevDir ? { area: 'elevator' as const, land: -1 } : walker.h > STATION_H - 40 ? { area: 'axis' as const, land: -1 } : areaAt(walker.s, walker.y)
    if (at.area !== useWalk.getState().area || at.land !== useWalk.getState().land) useWalk.setState(at)
    walker.speed = riding ? Math.abs(st.spd) : st.speed

    // 近くのベンチ（座るボタンを出す）
    st.checkBench -= dt
    if (st.checkBench <= 0) {
      st.checkBench = 0.25
      const near = !sitting && !riding && walker.h < 3 && !!nearestBench(walker.s, walker.y, 2.4)
      if (near !== w.benchNear) useWalk.setState({ benchNear: near })
      const door = riding || st.elevDir ? null : nearDoor(walker.s, walker.y, walker.h)
      if (door !== w.elevNear) useWalk.setState({ elevNear: door })
      const here = !riding && !st.elevDir && walker.h > STATION_H - 40
      if (here !== w.wingsHere) useWalk.setState({ wingsHere: here })
      // 今の重さ（G）
      const gee = Math.round((gAt(walker.h) / GRAVITY) * 100) / 100
      if (gee !== w.gee) useWalk.setState({ gee })
    }

    // カメラ
    frameAt(walker.s, qf)
    up.set(0, 1, 0).applyQuaternion(qf)
    euler.set(st.pitch, st.yaw, 0)
    qc.copy(qf).multiply(new THREE.Quaternion().setFromEuler(euler))
    const eye = w.view === 'eye'
    // 人の模型（VRM）を読み終わるまでは、仮の人形（棒人間）を出さない
    st.me.group.visible = !eye && st.me instanceof VrmPerson
    const headH = (sitting ? 1.15 : 1.62) * (CREW_LOOK.height / 1.7)
    // 速く走るほど、カメラを少し引いて画角を広げる
    const fast = riding ? Math.abs(st.spd) : 0
    const fov = 62 + Math.min(fast, 26) * 0.6
    if (Math.abs(fov - st.fov) > 0.01 && (camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      st.fov += (fov - st.fov) * Math.min(1, dt * 3)
      ;(camera as THREE.PerspectiveCamera).fov = st.fov
      ;(camera as THREE.PerspectiveCamera).updateProjectionMatrix()
    }
    if (eye) {
      camera.position.copy(walker.pos).addScaledVector(up, headH)
    } else {
      camera.position.copy(walker.pos).addScaledVector(up, headH - 0.15)
      // 街の建物の壁の中へ入らないよう、入るなら近づける
      const base = camera.position.clone()
      let d = st.dist + Math.min(fast, 30) * 0.12 + st.alt * 0.12 + (st.elevDir ? 6 : 0) + st.lean * 4
      for (;;) {
        tmp.set(0.35, 0.15, d).applyQuaternion(qc)
        camera.position.copy(base).add(tmp)
        const r = Math.hypot(camera.position.x, camera.position.z)
        if (d <= 0.9 || !inBuilding(Math.atan2(camera.position.x, camera.position.z) * G, camera.position.y + HALF_L, G - r)) break
        d = Math.max(0.9, d * 0.8)
      }
      // 地面より下（軸の駅なら床より下）に入らない
      const r = Math.hypot(camera.position.x, camera.position.z)
      const above = G - r - (walker.h > STATION_H - 40 ? STATION_H : 0)
      if (above < 0.3) camera.position.addScaledVector(up, 0.3 - above)
    }
    camera.quaternion.copy(qc)
    camera.up.copy(up)
  })
  return null
}

const gripL = new THREE.Vector3()
const footL = new THREE.Vector3()
const footR = new THREE.Vector3()
const toeL = new THREE.Vector3()
const toeR = new THREE.Vector3()
const rideQ = new THREE.Quaternion()
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

/**
 * 公園の人に、素材の人と服の色を配る。近くに同じ素材の人がいるほど選ばれにくく、
 * 同じ人・同じ色（見た目がまったく同じ人）は 60 m 以内に並べない。自分の姿（最初の人の元の色）は使わない
 */
function pickLooks(mobs: Mob[], models: VrmModel[]): [VrmModel, number][] {
  const pos = mobs.map((m) => (m.kind === 'loop' ? loopPoint(m.t) : { s: m.s, y: m.y }))
  const out: [VrmModel, number][] = []
  const used = new Map<VrmModel, number>()
  mobs.forEach((m, i) => {
    const list = models.filter((md) => md.info.age === m.age)
    let best: [VrmModel, number] = [list[0], 1]
    let bestScore = Infinity
    for (const md of list) {
      for (let look = 0; look < LOOKS.length; look++) {
        if (md === models[0] && look === 0) continue
        let score = (used.get(md) ?? 0) * 0.3 + look * 0.01
        for (let j = 0; j < i; j++) {
          const d = Math.hypot(pos[i].s - pos[j].s, pos[i].y - pos[j].y)
          if (out[j][0] !== md) continue
          // 同じ素材の人：近いほど重く。同じ色ならもっと
          score += Math.max(0, 1 - d / 40) * 4
          if (out[j][1] === look) score += Math.max(0, 1 - d / 60) * 50 + 1
        }
        if (score < bestScore) {
          bestScore = score
          best = [md, look]
        }
      }
    }
    used.set(best[0], (used.get(best[0]) ?? 0) + 1)
    out.push(best)
  })
  return out
}

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
  /** 道を行き来する人：ax の向きに、a0〜a1 の間を歩く（ax = 'y' なら s = c + off の上） */
  ax: 's' | 'y'
  c: number
  off: number
  a0: number
  a1: number
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
      ax: 'y',
      c: NS_S,
      off: 0,
      a0: 0,
      a1: 0,
      ts: PLAY.s,
      ty: PLAY.y,
      wait: rand() * 2,
      jump: 0,
      motion: 'idle',
    })
    // 池のまわりを散歩する人：公園の中の西の岸（LOOP_T0〜LOOP_T1）を行き来する
    for (let i = 0; i < n(9); i++) {
      const m = make('loop', rand() < 0.25 ? 'elder' : rand() < 0.15 ? 'child' : 'adult')
      m.t = LOOP_T0 + rand() * (LOOP_T1 - LOOP_T0)
      m.speed = m.p instanceof Mannequin ? 1.1 + rand() * 0.5 : 1.3
      list.push(m)
    }
    // 南北の道を行き来する人（公園の中）
    for (let i = 0; i < n(4); i++) {
      const m = make('path', rand() < 0.2 ? 'elder' : 'adult')
      Object.assign(m, { ax: 'y', c: NS_S, a0: 11280, a1: JUNGLE.y1 - 12 })
      m.y = m.a0 + rand() * (m.a1 - m.a0)
      m.speed = 1.0 + rand() * 0.6
      list.push(m)
    }
    // 住宅街の歩道を行き来する人（自分の側の歩道のまま、端で引き返す）
    const walkable = STREETS.filter((st) => st.a1 - st.a0 > 150)
    for (let i = 0; i < n(7); i++) {
      const st = walkable[i % walkable.length]
      const m = make('path', rand() < 0.25 ? 'elder' : rand() < 0.15 ? 'child' : 'adult')
      Object.assign(m, { ax: st.ax, c: st.c, off: (rand() < 0.5 ? -1 : 1) * (STREET_W / 2 + WALK_W * 0.3), a0: st.a0 + 8, a1: st.a1 - 8 })
      const a = m.a0 + rand() * (m.a1 - m.a0)
      if (m.ax === 'y') m.y = a
      else m.s = a
      m.speed = 1.0 + rand() * 0.5
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
    // 住宅街で、門の前の立ち話
    const town = park.town
    for (let g = 0; g < n(2); g++) {
      const gate = town.gates[Math.floor(rand() * town.gates.length)]
      for (const k of [-1, 1]) {
        const m = make('chat', rand() < 0.4 ? 'elder' : 'adult')
        // 道に沿って向かい合う
        const along = gate.ax === 'y' ? { s: 0, y: 1 } : { s: 1, y: 0 }
        m.s = gate.s + along.s * k * 0.45
        m.y = gate.y + along.y * k * 0.45
        m.yaw = Math.atan2(along.s * k, along.y * k)
        list.push(m)
      }
    }
    // 池のほとりの芝生に座る人（VRM の人が読めてから出す）
    for (let i = 0; i < n(5); i++) {
      const m = make('lawn', rand() < 0.3 ? 'child' : rand() < 0.4 ? 'elder' : 'adult')
      const t = LOOP_T0 + (LOOP_T1 - LOOP_T0) * ((i + 0.3 + rand() * 0.4) / 5)
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
        const looks = pickLooks(mobs, models)
        mobs.forEach((m, i) => {
          const [model, look] = looks[i]
          const old = m.p
          m.p = new VrmPerson(model, rand, 0.96 + rand() * 0.08)
          applyLook(m.p.group, look)
          old.dispose()
        })
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
        // 公園の端（生け垣）で引き返す
        if (m.t > LOOP_T1) m.dir = -1
        if (m.t < LOOP_T0) m.dir = 1
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
        // ax の向きに進む。公園の小道は右側を、住宅街は決めた側の歩道を歩く
        const off = m.off || m.dir * 0.9
        if (m.ax === 'y') {
          m.y += m.dir * m.speed * dt
          if (m.y > m.a1) m.dir = -1
          if (m.y < m.a0) m.dir = 1
          m.s = m.c + off
          m.yaw = m.dir > 0 ? Math.PI : 0
        } else {
          m.s += m.dir * m.speed * dt
          if (m.s > m.a1) m.dir = -1
          if (m.s < m.a0) m.dir = 1
          m.y = m.c - off
          m.yaw = m.dir > 0 ? -Math.PI / 2 : Math.PI / 2
        }
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
      tmp.copy(m.p.group.position)
      // 遠い人は描かない。VRM の人を読み終わるまでは、仮の人形（棒人間）を出さない
      const far = !vrm || tmp.distanceTo(camera.position) > 220
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
