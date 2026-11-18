import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { ColonyModel, MIRROR_ANGLE } from './ColonyModel'
import { ApproachLights } from './ApproachLights'
import { ColonyDock } from './ColonyDock'
import { ConstructionSite } from './ConstructionSite'
import { colliders, passThrough, ports, registerBody, slowZones, zoomZones, type Port, type SlowZone, type ZoomZone } from '../../state/registry'
import { MAX_SPEED } from '../../state/throttle'
import { flightControl, ship } from '../../state/flight'
import { useStore } from '../../state/store'
import { COLONY_LENGTH as L, COLONY_PORT as PORT, COLONY_RADIUS as R, COLONY_SPIN_SECONDS, COLONY_ZOOM, SF_TEXT } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { colonyWalk } from '../../state/walk'

const H = L / 2
const CAP = 0.03
/** 外から近づけない円筒の外側（外板・鏡の支点・端の丸屋根の少し外） */
const OUTER = R * 1.06
/** 中で飛べる範囲：地面から少し上まで */
const INNER = R * 0.9
/** 中での最高速（1秒に長さの何分の一か）。約20秒で端から端まで。速すぎると景色を見る前に通り過ぎる */
const INSIDE_SPEED = L / 20
/** 2号基を置く、横の距離（1号基の鏡が回ってきても届かない） */
const SITE_OFFSET = 0.85
/** この距離まで近づくと案内を出す・2号基を描く */
const NOTICE = 2.4
const DRAW_SITE = 4

const local = new THREE.Vector3()
const inverse = new THREE.Matrix4()
const push = new THREE.Vector3()
const now = new THREE.Vector3()

type ColonyProps = {
  id: string
  name: () => string
  /** コロニー群の中での置き場所（群の座標。回転軸は +Y で太陽向き） */
  position?: [number, number, number]
  /** 群の代表（ラベル・案内・となりの建設現場を出す） */
  primary?: boolean
  /** 回転の向きをそろえないよう、最初の角度をずらす */
  phase?: number
  /** 大きさ（第2〜第7コロニー群は半分）。自機の縮み方と速さも、同じ割合で合わせる（入り口の操作感を第1と同じに） */
  scale?: number
  /** 天体として登録するか（目標に選べる・名前が出る）。群の中の 1 基として近くでだけ出すときは登録しない */
  body?: boolean
}

/**
 * 回転円筒型のスペースコロニー1基。回転軸（+Y）は群ごと太陽へ向いていて、
 * 1Gになる速さ（約2分に1回転）で回る。港から中へ入って飛べる。
 */
export function Colony({ id, name, position = [0, 0, 0], primary = false, phase = 0, scale = 1, body = true }: ColonyProps) {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const spin = useRef<THREE.Group>(null!)
  const site = useRef<THREE.Group>(null)
  const label = useRef<HTMLSpanElement>(null)
  const state = useRef({ inside: false, noticed: false, ready: false, last: new THREE.Vector3(), delta: new THREE.Vector3() })
  // 中にいるあいだだけ、操縦の最高速を落とす（factor は collide が毎フレーム切りかえる）
  const slow = useMemo<SlowZone>(() => ({ object: new THREE.Object3D(), near: Infinity, far: Infinity, factor: 1 }), [])
  useHideBehindSun(label, group)

  useEffect(() => {
    const zone: ZoomZone = { object: group.current, start: 2.6 * scale, full: 0.9 * scale, factor: COLONY_ZOOM / scale }
    const unregister = body ? registerBody({ id, get name() { return name() }, radius: H * 1.1 * scale, object: group.current }) : () => {}
    if (body) passThrough.add(id)
    zoomZones.add(zone)
    colliders.add(collide)
    slow.object = group.current
    slowZones.add(slow)
    const port: Port = { object: group.current, next: portPath }
    ports.add(port)
    return () => {
      unregister()
      if (body) passThrough.delete(id)
      zoomZones.delete(zone)
      colliders.delete(collide)
      slowZones.delete(slow)
      ports.delete(port)
      if (colonyWalk.inside?.id === id) colonyWalk.inside = null
    }
    // collide は state の ref だけを読む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /**
   * 周辺観察の「入港」：港（太陽と反対側の端の軸）の少し外へ向かう道順。
   * 円筒の横にいるときは、まず外へ離れてから端の高さへ下り、最後に軸の上へ寄る（外板を突き抜けないように）
   */
  function portPath(from: THREE.Vector3, out: THREE.Vector3, inward: THREE.Vector3) {
    const g = group.current
    inverse.copy(g.matrixWorld).invert()
    local.copy(from).applyMatrix4(inverse)
    inward.set(0, 1, 0).transformDirection(g.matrixWorld)
    const r = Math.hypot(local.x, local.z)
    const entry = -H - CAP - 0.12
    // 外板と、太陽のほうへ開いた鏡（港側の端が支点）の外まで離れる
    const clear = Math.max(OUTER * 1.3, R * 1.04 + Math.max(0, local.y + H) * Math.tan(MIRROR_ANGLE) + 0.05)
    let last = false
    if (local.y > entry + 0.02 && r < clear * 0.97) {
      // 円筒や鏡のそば：まず真横へ離れる（下りるあいだに鏡は近づかないので、あとは真下へ）
      if (r < 1e-4) local.set(clear, local.y, 0)
      else local.set((local.x * clear) / r, local.y, (local.z * clear) / r)
    } else if (local.y > entry + 0.02) local.y = entry
    else {
      local.set(0, entry, 0)
      last = true
    }
    out.copy(local).applyMatrix4(g.matrixWorld)
    return last
  }

  /** 壁に当たる判定。外からは港の穴だけを通れ、中では地面と両端の壁の内側を飛ぶ */
  function collide() {
    const s = state.current
    // 片づけの途中（group がもう外れている）なら何もしない
    if (!s.ready || !group.current) return
    slow.factor = s.inside ? Math.min(1, (INSIDE_SPEED * scale) / MAX_SPEED) : 1
    // 中にいるあいだは、コロニーと一緒に動く（地球のまわりを回っても、壁が迫ってこないように）
    if (s.inside && !flightControl.holding) ship.position.add(s.delta)
    s.delta.set(0, 0, 0)
    inverse.copy(group.current.matrixWorld).invert()
    local.copy(ship.position).applyMatrix4(inverse)
    const r = Math.hypot(local.x, local.z)
    const y = local.y
    let moved = false
    if (s.inside) {
      // ワープなどで遠くへ出たら、外にいることにする
      if (r > R * 1.5 || Math.abs(y) > H + 0.3 || (y < -H - 0.01 && r < PORT)) {
        s.inside = false
        if (colonyWalk.inside?.id === id) colonyWalk.inside = null
        return
      }
      if (r > INNER) {
        local.x *= INNER / r
        local.z *= INNER / r
        moved = true
      }
      if (y > H - 0.02) {
        local.y = H - 0.02
        moved = true
      }
      if (y < -H + 0.02 && r > PORT * 0.85) {
        local.y = -H + 0.02
        moved = true
      }
      // 中はゆっくり（ワープ中は縛らない）
      const max = INSIDE_SPEED * scale
      const speed = ship.velocity.length()
      if (speed > max && useStore.getState().warpPhase === 'idle') ship.velocity.multiplyScalar(max / speed)
    } else {
      const bottom = -H - CAP - 0.005
      const top = H + CAP + 0.005
      if (r < OUTER && y > bottom && y < top) {
        // 港の穴の中なら、そのまま中へ
        if (r < PORT * 0.9) {
          if (y > -H) {
            s.inside = true
            colonyWalk.inside = { id, name }
            useStore.getState().showToast(SF_TEXT.colonyInside())
          }
        } else {
          // いちばん浅い向きへ押し出す
          const out = OUTER - r
          const up = top - y
          const down = y - bottom
          if (out <= up && out <= down) {
            local.x *= OUTER / r
            local.z *= OUTER / r
          } else if (up < down) local.y = top
          else local.y = bottom
          moved = true
        }
      }
    }
    if (!moved) return
    push.copy(local).applyMatrix4(group.current.matrixWorld).sub(ship.position)
    ship.position.add(push)
    // 壁へ向かう速さを消す
    if (push.lengthSq() > 0) {
      push.normalize()
      const into = ship.velocity.dot(push)
      if (into < 0) ship.velocity.addScaledVector(push, -into)
    }
  }

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05)
    const s = state.current
    const g = group.current
    // 群（ColonyCluster）が先に位置を決めている。前のフレームから動いた分を、中にいる自機にも足す
    g.updateWorldMatrix(true, false)
    g.getWorldPosition(now)
    if (s.ready) s.delta.add(now).sub(s.last)
    s.last.copy(now)
    s.ready = true

    const st = useStore.getState()
    if (st.timeScale > 0) spin.current.rotation.y += (dt * Math.PI * 2) / COLONY_SPIN_SECONDS

    const d = ship.position.distanceTo(now)
    if (site.current) site.current.visible = d < DRAW_SITE
    if (primary && st.mode === 'flight' && st.warpPhase === 'idle') {
      if (d < NOTICE && !state.current.noticed) {
        state.current.noticed = true
        if (!state.current.inside) st.showToast(SF_TEXT.colonyFound())
      }
      if (d > NOTICE * 3) state.current.noticed = false
    }
  })

  return (
    <group ref={group} position={position} scale={scale}>
      <group ref={spin} rotation={[0, phase, 0]}>
        <ColonyModel />
      </group>
      {/* 港へ入る船の誘導灯（回さない） */}
      <ApproachLights />
      {/* 港の中の回らないドック（停泊中の船） */}
      <ColonyDock />
      {primary && (
        <>
          <group ref={site} position={[SITE_OFFSET, 0, 0]} visible={false}>
            <ConstructionSite />
          </group>
          <Html position={[0, 0, R * 3]} center className="label" zIndexRange={LABEL_Z}>
            <span ref={label} onClick={() => useStore.getState().setTarget(id)}>
              {name()}
            </span>
          </Html>
        </>
      )}
    </group>
  )
}
