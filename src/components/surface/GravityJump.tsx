import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { jumpOn, heightAt, type Jump } from '../../data/jump'
import { CROUCH, LAND, jumpClock, useJump } from '../../state/jump'
import type { Terrain } from './terrain'
import { HIP_Y, SHIN, THIGH, type Rig } from './astronaut'
import { loadApolloSuit, makeApolloAstronaut, type ApolloKit } from './apolloSuit'
import { ui } from '../../i18n'
import { useLang } from '../../i18n/lang'

// 重力ジャンプ：目の前で、宇宙飛行士（この星）と地球の人（うすい青）が同じ力で跳ぶ。
// 地球の人は、宇宙飛行士が空中にいるあいだ、何度も跳びなおす（地球なら何回跳べるか）

const EARTH_G = 9.81
/** カメラから二人までの距離（m） */
const AHEAD = 7.5
/** 二人のあいだ（m） */
const APART = 1.9

const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x))
  return k * k * (3 - 2 * k)
}

/**
 * ポーズ：c はしゃがみ具合（0 立つ〜1 深く）、up は腕の上げ具合（0〜1）、tuck は空中で脚を少し曲げる具合
 * 足の裏が地面（y = 0）につくように、腰の高さを合わせる
 */
function pose(r: Rig, c: number, up: number, tuck: number, swing: number) {
  const hip = -0.95 * c - 0.35 * tuck
  const knee = 1.75 * c + 0.7 * tuck
  for (let i = 0; i < 2; i++) {
    r.hips[i].rotation.x = hip
    r.knees[i].rotation.x = knee
    // 腕：しゃがむと後ろへ引き、跳ぶと前から上へ振り上げる
    r.shoulders[i].rotation.x = 0.75 * c * (1 - up) - 2.7 * up + swing
    r.shoulders[i].rotation.z = (i === 0 ? 1 : -1) * (0.12 + 0.25 * up)
    r.elbows[i].rotation.x = -0.35 - 0.3 * c
  }
  r.torso.rotation.x = 0.45 * c
  // 脚を曲げたぶん腰が下がる（もも・すねの縦の長さから）
  const L = r.legs ?? { hipY: HIP_Y, thigh: THIGH, shin: SHIN }
  const legY = L.thigh * Math.cos(hip) + L.shin * Math.cos(hip + knee)
  r.body.position.y = L.hipY - (L.thigh + L.shin - legY)
  // 前に出たひざの分、体を少し後ろへ（重心を足の上に）
  r.body.position.z = -0.12 * c
  r.update?.()
}

/** ひとりぶんの動き：秒 t（跳び始めから）、空中の時間 air、高さの関数。戻り値は足の高さ */
function animate(r: Rig, t: number, air: number, h: (ta: number) => number) {
  if (t < CROUCH) {
    // しゃがむ（最後の 0.12 秒で一気に伸びる）
    const k = t / CROUCH
    const c = k < 0.7 ? smooth(k / 0.7) : 1 - smooth((k - 0.7) / 0.3) * 0.85
    pose(r, c, k > 0.7 ? smooth((k - 0.7) / 0.3) * 0.6 : 0, 0, 0)
    return 0
  }
  const ta = t - CROUCH
  if (ta < air) {
    const k = ta / air
    // 上りで腕を振り上げ、下りで脚を少し前に出して着地にそなえる
    pose(r, 0.15 * (1 - Math.min(1, ta / 0.15)), 0.6 + 0.4 * Math.sin(Math.min(1, k * 2) * Math.PI * 0.5) - 0.5 * smooth((k - 0.6) / 0.4), 0.35 * Math.sin(k * Math.PI), 0)
    return h(ta)
  }
  const tl = ta - air
  // 着地：ひざで受けとめて、ゆっくり立つ
  const c = tl < 0.12 ? smooth(tl / 0.12) * 0.75 : 0.75 * (1 - smooth((tl - 0.12) / (LAND - 0.12)))
  pose(r, c, 0.1 * (1 - smooth(tl / LAND)), 0, 0)
  return 0
}

// ---- 場面 ----------------------------------------------------------------------------

const fwd = new THREE.Vector3()
const side = new THREE.Vector3()
const tmp = new THREE.Vector3()

/** 跳んでいるあいだ、目の高さのカメラが向く点（SurfaceView の Look が読む） */
export const jumpFocus = { on: false, point: new THREE.Vector3(), lift: 0 }
/** これより高く跳ぶ星（フォボスなど）では、カメラもいっしょに上がって、遠ざかる地面を見せる */
const RIDE_FROM = 20
/** 跳ぶ宇宙飛行士の服（アポロの場面ではないので、印と赤い帯は無し） */
const SUIT: ApolloKit = { back: 'plss', leva: true, cdr: false, rcu: true, dust: true, patches: false }

export function GravityJump({ terrain }: { terrain: Terrain }) {
  // 地表に降りたら、宇宙飛行士のモデルを先に読んでおく（跳ぶときに待たないように）
  useEffect(() => void loadApolloSuit(), [])
  const id = useJump((s) => s.id)
  const at = useJump((s) => s.at)
  const j = id ? jumpOn(id) : null
  if (!j) return null
  return <Pair key={at} j={j} terrain={terrain} />
}

function Pair({ j, terrain }: { j: Jump; terrain: Terrain }) {
  useLang()
  const { camera } = useThree()
  // 自作のアポロ型の宇宙服（印と赤い帯は外す）。地球の人は同じ服を、うすい青で透かす
  const pair = useMemo(() => ({ me: makeApolloAstronaut(SUIT), earth: makeApolloAstronaut({ ...SUIT, ghost: true }) }), [])
  useEffect(() => () => [...pair.me.materials, ...pair.earth.materials].forEach((m) => m.dispose()), [pair])
  const { me, earth } = pair
  const meLabel = useRef<HTMLSpanElement>(null)
  const earthLabel = useRef<HTMLSpanElement>(null)
  const meTag = useRef<THREE.Group>(null)
  const earthTag = useRef<THREE.Group>(null)
  const peak = useRef<THREE.Mesh>(null)
  const pole = useRef<THREE.Mesh>(null)
  const radiusM = terrain.def.radiusKm * 1000
  // 跳び始めたときに見ていた向きの前に、二人を並べる（カメラの方を向いて）
  const place = useMemo(() => {
    camera.getWorldDirection(fwd)
    fwd.y = 0
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1)
    fwd.normalize()
    side.set(-fwd.z, 0, fwd.x)
    const base = new THREE.Vector3(camera.position.x, 0, camera.position.z).addScaledVector(fwd, AHEAD)
    const a = base.clone().addScaledVector(side, APART / 2)
    const b = base.clone().addScaledVector(side, -APART / 2)
    a.y = terrain.height(a.x, a.z)
    b.y = terrain.height(b.x, b.z)
    const yaw = Math.atan2(-fwd.x, -fwd.z)
    return { me: a, earth: b, yaw }
  }, [camera, terrain])

  useFrame(() => {
    const { t, real, total, speed } = jumpClock(j.id)
    // 宇宙飛行士
    const hMe = animate(me, t, j.airtime, (ta) => heightAt(ta, j.g, radiusM))
    me.root.position.set(place.me.x, place.me.y + hMe, place.me.z)
    me.root.rotation.y = place.yaw
    // 地球の人：宇宙飛行士が空中にいるあいだ、何度も跳ぶ（一回 = しゃがむ + 空中 + 着地）
    // （早送りの星でも、地球の人はふつうの速さで跳ぶ。着地したら、その回を跳び終えて止まる）
    const cycle = CROUCH + j.earthAirtime + LAND
    const meAirEnd = CROUCH + j.airtime / speed
    const te = real < meAirEnd ? real % cycle : Math.min(real - Math.floor(meAirEnd / cycle) * cycle, cycle)
    const hE = animate(earth, te, j.earthAirtime, (ta) => Math.max(0, Math.sqrt(2 * EARTH_G * 0.5) * ta - (EARTH_G * ta * ta) / 2))
    earth.root.position.set(place.earth.x, place.earth.y + hE, place.earth.z)
    earth.root.rotation.y = place.yaw
    // 名札と高さ
    meTag.current?.position.set(place.me.x, place.me.y + hMe + 2.15, place.me.z)
    earthTag.current?.position.set(place.earth.x, place.earth.y + hE + 2.15, place.earth.z)
    const tx = ui().jump
    if (meLabel.current) meLabel.current.textContent = tx.height(hMe)
    if (earthLabel.current) earthLabel.current.textContent = tx.height(hE)
    // いちばん高いところの印（着いたら残す）
    if (peak.current) {
      const done = t >= CROUCH + j.airtime / 2
      peak.current.visible = done && j.height > 0.8
      peak.current.position.set(place.me.x, place.me.y + j.height + 0.02, place.me.z)
      // 地面から一番高いところまでの細い線（となりに立てる）
      if (pole.current) {
        pole.current.visible = peak.current.visible
        pole.current.scale.y = j.height
        pole.current.position.set(place.me.x, place.me.y + j.height / 2, place.me.z).addScaledVector(side.set(-Math.cos(place.yaw), 0, Math.sin(place.yaw)), 0.55)
      }
    }
    // 着地したら結果のカードを出す
    if (real >= total && !useJump.getState().landed) useJump.setState({ landed: true })

    // 目で追う（自分の目の高さから見るときは、SurfaceView の Look がこの点の方を向く）。高く上がる星では見上げる
    const mid = tmp.copy(place.me).add(place.earth).multiplyScalar(0.5)
    jumpFocus.point.set(mid.x, Math.max(mid.y + 1.0, place.me.y + hMe * 0.9 + 0.9), mid.z)
    jumpFocus.lift = 0
    if (j.height > RIDE_FROM) {
      // いっしょに上がる：宇宙飛行士の少し上から見下ろす（足もとの星が遠ざかって、丸く見えてくる）
      const k = Math.min(1, hMe / 10)
      jumpFocus.lift = hMe + 1.5 * k
      jumpFocus.point.lerp(tmp.set(place.me.x, place.me.y + hMe + 1.2, place.me.z), k)
    }
    // 着地してからも少しのあいだ、二人の方を向き直す
    jumpFocus.on = real < total + 1.5
  })
  useEffect(
    () => () => {
      jumpFocus.on = false
      jumpFocus.lift = 0
    },
    [],
  )

  return (
    <>
      <primitive object={me.root} />
      <primitive object={earth.root} />
      <mesh ref={pole} visible={false}>
        <cylinderGeometry args={[0.012, 0.012, 1, 6]} />
        <meshBasicMaterial color="#ffd27a" transparent opacity={0.45} depthWrite={false} />
      </mesh>
      <mesh ref={peak} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.35, 0.42, 40]} />
        <meshBasicMaterial color="#ffd27a" transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group ref={meTag}>
        <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="jump-tag">
            <b>{ui().jump.you}</b>
            <span ref={meLabel} />
          </div>
        </Html>
      </group>
      <group ref={earthTag}>
        <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="jump-tag earth">
            <b>{ui().jump.earth}</b>
            <span ref={earthLabel} />
          </div>
        </Html>
      </group>
    </>
  )
}
