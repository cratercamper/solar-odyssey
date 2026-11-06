import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { Terrain } from './terrain'
import { ARM_STOW, WheelDust, applyPose, deployPose, drawnHeight, meshHeight, type Rig } from './Rover'
import { WheelTracks } from './wheelTracks'
import { Sway } from './roverSway'
import type { SkyNow } from './skyNow'
import { PAINT_PARTS, paintUniforms, withPaint } from './paint'
import { windFor } from './landerFx'
import { TRACKS } from '../../data/rallyTracks'
import { COUNT_SEC, RALLY_COLORS, loadBest, rallyArrive, rallyNow, saveBest, setRallyPhase, useRally, type RallyEntry } from '../../state/rally'
import { bookResult } from '../../state/rallyHiscore'
import { launchRover, roverCtl, roverInput, roverPose, useRover } from '../../state/rover'
import { useLanding } from '../../state/landing'
import { lowMemory, useLevel } from '../../state/quality'
import { MAP_KEYS, shrinkTexture } from './shrinkTexture'

// 峡谷レースの場面：光の門、コンピューターが運転する 3 台のローバー、門の判定・順位・タイム。
// 自分のローバーは Rover.tsx がそのまま走らせ、ここからは roverCtl（置く・止める・色・押す）で動かす。

const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}`

// ---- コース ---------------------------------------------------------------------------------

/** 門の数（最後がゴール） */
export const GATE_COUNT = 10
/** 門の幅の半分（m）。この内側を通ればくぐったことにする */
const GATE_HALF = 9
/** スタートの列：コースの何 m 先か、横の並び（m） */
const GRID_S = 45
const GRID_LANES = [-4.8, -1.6, 1.6, 4.8]
/** 自分は左から 2 番目 */
const PLAYER_SLOT = 1

export type Course = {
  /** 10 m ごとの点と、そこまでの道のり（m） */
  pts: THREE.Vector2[]
  len: number[]
  total: number
  /** 門：道のり、中心、進む向き */
  gates: { s: number; x: number; z: number; dx: number; dz: number }[]
  /** 点ごとの曲がり具合（1/m）と、左右どちらに曲がるか（+ は右） */
  curve: number[]
}

export function buildCourse(line: [number, number][], gateS?: number[]): Course {
  const pts = line.map(([x, z]) => new THREE.Vector2(x, z))
  const len = [0]
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]))
  const total = len[len.length - 1]
  const curve = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 3)]
    const b = pts[i]
    const c = pts[Math.min(pts.length - 1, i + 3)]
    const ab = Math.atan2(b.y - a.y, b.x - a.x)
    const bc = Math.atan2(c.y - b.y, c.x - b.x)
    let d = bc - ab
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    const arc = Math.max(1, a.distanceTo(b) + b.distanceTo(c))
    return d / arc
  })
  const course: Course = { pts, len, total, gates: [], curve }
  // 門：決めてある道のり（ジグザグ、raceLines.ts）か、等しい間隔。ゴールはコースの終わりの少し手前
  const at = gateS ?? Array.from({ length: GATE_COUNT }, (_, g) => ((total - 15) * (g + 1)) / GATE_COUNT)
  for (const s of at) {
    const p = pointAt(course, s)
    course.gates.push({ s, x: p.x, z: p.z, dx: p.dx, dz: p.dz })
  }
  return course
}

const tmpP = { x: 0, z: 0, dx: 1, dz: 0, k: 0 }
/** 道のり s の点と向き（dx, dz：単位ベクトル）、曲がり具合 k */
export function pointAt(c: Course, s: number) {
  const n = c.pts.length
  const ss = THREE.MathUtils.clamp(s, 0, c.total)
  let i = Math.min(n - 2, Math.floor((ss / c.total) * (n - 1)))
  while (i > 0 && c.len[i] > ss) i--
  while (i < n - 2 && c.len[i + 1] < ss) i++
  const a = c.pts[i]
  const b = c.pts[i + 1]
  const seg = c.len[i + 1] - c.len[i] || 1
  const t = (ss - c.len[i]) / seg
  tmpP.x = a.x + (b.x - a.x) * t
  tmpP.z = a.y + (b.y - a.y) * t
  tmpP.dx = (b.x - a.x) / seg
  tmpP.dz = (b.y - a.y) / seg
  tmpP.k = c.curve[i] + (c.curve[i + 1] - c.curve[i]) * t
  return tmpP
}

/** (x, z) に近いコースの道のり。hint の近く（±300 m）だけ探す */
function progressOf(c: Course, x: number, z: number, hint: number) {
  const n = c.pts.length
  const i0 = Math.max(0, Math.floor(hint / 10) - 30)
  const i1 = Math.min(n - 2, Math.floor(hint / 10) + 30)
  let best = hint
  let bestD = Infinity
  for (let i = i0; i <= i1; i++) {
    const a = c.pts[i]
    const b = c.pts[i + 1]
    const ex = b.x - a.x
    const ez = b.y - a.y
    const l2 = ex * ex + ez * ez || 1
    const t = THREE.MathUtils.clamp(((x - a.x) * ex + (z - a.y) * ez) / l2, 0, 1)
    const px = a.x + ex * t - x
    const pz = a.y + ez * t - z
    const d = px * px + pz * pz
    if (d < bestD) {
      bestD = d
      best = c.len[i] + (c.len[i + 1] - c.len[i]) * t
    }
  }
  return { s: best, off: Math.sqrt(bestD) }
}

/** スタートの列の i 番目の場所と向き（heading） */
export function gridSlot(c: Course, i: number) {
  const p = pointAt(c, GRID_S)
  const lane = GRID_LANES[i]
  // 右手（進む向きを右に 90°）
  const x = p.x - p.dz * lane
  const z = p.z + p.dx * lane
  return { x, z, heading: Math.atan2(-p.dx, -p.dz) }
}

// ---- コンピューターのローバー ---------------------------------------------------------------

/**
 * 性格。コースの線をなぞるのではなく、少し先の点をねらって自分でハンドルを切る（先をねらうほどカーブの内側を通る）。
 * top：最高速（m/s）、lat：曲がるときの横の加速度の上限（m/s²）、look：どれだけ先をねらうか（m）、
 * amp / wave：走る位置のくせ（線から左右にずれる幅 m と、その波の長さ m）、trip：岩につまずく間隔（秒）、hop：よく跳ぶ
 */
const TRAITS = [
  { top: 17.4, lat: 3.3, look: 12, amp: 3.5, wave: 160, trip: 9, hop: 0 }, // 赤：直線は速いが、カーブで外にふくらむ・つまずきやすい
  { top: 14.8, lat: 5.6, look: 14, amp: 1.5, wave: 260, trip: 22, hop: 0 }, // 青：慎重。遅いがミスが少ない
  { top: 15.9, lat: 4.3, look: 18, amp: 5.0, wave: 120, trip: 30, hop: 1 }, // 黄：あちこち走り、よく跳んで岩をよける
  { top: 15.4, lat: 4.8, look: 34, amp: 2.5, wave: 200, trip: 14, hop: 0 }, // 緑：ずっと先をねらって、カーブの内側をショートカット
]
/** 追いかけっこ（月）：逃げるローバーの速さ（ふつうのレースに対して）と、タッチしたことにする距離（m） */
const CHASE_PACE = 0.86
const CHASE_TOUCH = 3.2
/** コンピューター全体の速さ（ふつう）。自分の最高速は 16.7 m/s */
const AI_SKILL = 0.93

type Bot = {
  color: number
  slot: number
  model: THREE.Object3D
  rig: Rig
  paint: ReturnType<typeof paintUniforms>
  tracks: WheelTracks
  glow: THREE.Sprite
  pool: THREE.Mesh
  /** コースの道のり（m）と、線からのずれ（m） */
  s: number
  off: number
  v: number
  x: number
  z: number
  y: number
  vy: number
  heading: number
  pitch: number
  roll: number
  spin: number
  steer: number
  air: boolean
  hopT: number
  /** その日の調子（0.95〜1.04）と、走る位置の波のずれ */
  form: number
  phase: number
  /** つまずくまでの時間と、つまずいている残り時間 */
  tripT: number
  tripping: number
  finish: number | null
  /** 追いかけっこ（月）：つかまえられた */
  caught: boolean
  /** 向きを変える速さ（rad/s、左へ +）と、横すべりで車体の前が曲がる側へ向くずれ（rad） */
  turn: number
  drift: number
  /** サスペンション：沈み込み（m）と、車体だけの傾き */
  squash: number
  squashV: number
  sway: Sway
}

/** 作り直しで引き継ぐ走りの状態（モデル・塗り・轍などの部品は除く） */
const BOT_STATE = [
  's', 'off', 'v', 'x', 'z', 'y', 'vy', 'heading', 'pitch', 'roll', 'spin', 'steer', 'air', 'hopT', 'form', 'phase',
  'tripT', 'tripping', 'finish', 'caught', 'turn', 'drift', 'squash', 'squashV', 'sway',
] as const satisfies readonly (keyof Bot)[]

/** コンピューターの姿勢（展開して、アームをたたんだ姿） */
const BOT_POSE = (() => {
  const p = deployPose(1)
  p.arm = [...ARM_STOW]
  return p
})()

/** 光のにじみ（中心が明るい丸） */
let glowTex: THREE.Texture | null = null
function glowTexture() {
  if (glowTex) return glowTex
  const N = 64
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, N, N)
  glowTex = new THREE.CanvasTexture(c)
  return glowTex
}

export function Rally({ track, terrain, prepare, dustColor, sky }: { track: string; terrain: Terrain; prepare: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial; dustColor: string; sky: SkyNow }) {
  const phase = useRally((r) => r.phase)
  const color = useRally((r) => r.color)
  const roverPhase = useRover((r) => r.phase)
  const level = useLevel()
  const course = useMemo(() => buildCourse(TRACKS[track].line, TRACKS[track].gates), [track])
  const chase = !!TRACKS[track].chase
  // 氷（エウロパ）：カーブは遅め、車体は大きく横を向いてすべる
  const ice = TRACKS[track].ice ?? 1
  const g = 9.8 * terrain.def.gravity

  // 自分のローバーの色：このレース場では、いつも選んだ色に塗る
  useEffect(() => {
    roverCtl.paint = RALLY_COLORS[color].hex
    return () => {
      roverCtl.paint = null
    }
  }, [color])
  useEffect(() => {
    useRally.setState({ gates: course.gates.length })
    // 確認用（#debug）：次の門
    if (!location.hash.includes('debug')) return
    const w = window as unknown as { __rallyGate?: () => unknown; __rallyBots?: () => unknown }
    w.__rallyGate = () => course.gates[useRally.getState().gate]
    return () => {
      w.__rallyGate = undefined
    }
  }, [course])
  // 確認用（#debug）：コンピューターだけを sec 秒ぶん一気に走らせて、道のりとコースからのずれを返す
  useEffect(() => {
    if (!location.hash.includes('debug')) return
    const w = window as unknown as { __rallySim?: (sec: number) => unknown }
    let simT = 0
    w.__rallySim = (sec: number) => {
      for (let i = 0; i < sec * 60; i++) {
        simT += 1 / 60
        stepBots(1 / 60, simT, rallyNow() + simT, true, false)
      }
      return bots.list.map((b) => ({ c: b.color, s: Math.round(b.s), off: +b.off.toFixed(1), v: +b.v.toFixed(1), finish: b.finish && +b.finish.toFixed(1) }))
    }
    return () => {
      w.__rallySim = undefined
    }
  })

  // ローバーを運転中に来たときは、着いたらすぐローバーを出す（降ろす場面は飛ばす）
  const landingPhase = useLanding((l) => l.phase)
  useEffect(() => {
    if (landingPhase !== 'surface' || !rallyArrive.rover) return
    rallyArrive.rover = false
    launchRover(true)
  }, [landingPhase])

  // ---- 門 ----
  const gateParts = useMemo(() => {
    const pillar = new THREE.CylinderGeometry(0.6, 0.6, 1, 12, 1, true)
    pillar.translate(0, 0.5, 0)
    const beam = new THREE.BoxGeometry(1, 0.8, 0.8)
    const mk = (c: THREE.Color, o: number) =>
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    return {
      pillar,
      beam,
      next: mk(new THREE.Color(0.5, 1.6, 2.2), 0.75),
      later: mk(new THREE.Color(0.35, 0.7, 1.0), 0.4),
      goal: mk(new THREE.Color(2.2, 1.6, 0.5), 0.8),
      done: mk(new THREE.Color(0.4, 0.4, 0.4), 0.1),
    }
  }, [])
  useEffect(
    () => () => {
      gateParts.pillar.dispose()
      gateParts.beam.dispose()
      for (const m of [gateParts.next, gateParts.later, gateParts.goal, gateParts.done]) m.dispose()
    },
    [gateParts],
  )
  const gateObjs = useMemo(
    () =>
      course.gates.map((gt, i) => {
        const goal = i === course.gates.length - 1
        const H = goal ? 12 : 8
        const grp = new THREE.Group()
        // 左右の柱の足もと：それぞれの地面の高さに
        const rx = -gt.dz
        const rz = gt.dx
        const meshes: THREE.Mesh[] = []
        const yl = terrain.height(gt.x - rx * GATE_HALF, gt.z - rz * GATE_HALF)
        const yr = terrain.height(gt.x + rx * GATE_HALF, gt.z + rz * GATE_HALF)
        for (const [side, y] of [
          [-1, yl],
          [1, yr],
        ] as const) {
          const m = new THREE.Mesh(gateParts.pillar, gateParts.later)
          m.position.set(gt.x + rx * GATE_HALF * side, y - 1, gt.z + rz * GATE_HALF * side)
          m.scale.set(1, H + 1, 1)
          meshes.push(m)
          grp.add(m)
        }
        const top = Math.max(yl, yr) + H
        const b = new THREE.Mesh(gateParts.beam, gateParts.later)
        b.position.set(gt.x, top, gt.z)
        b.scale.set(GATE_HALF * 2 + 0.7, 1, 1)
        b.rotation.y = Math.atan2(-rz, rx)
        meshes.push(b)
        grp.add(b)
        for (const m of meshes) {
          m.renderOrder = 3
          m.frustumCulled = false
        }
        return { grp, meshes, goal }
      }),
    [course, terrain, gateParts],
  )

  // ---- コンピューターのローバー 3 台 ----
  const { scene } = useGLTF(url('rover-orv7.glb'))
  // 画質（Auto）がレースの途中で変わると 3 台を作り直す。そのとき走りの状態を色ごとに引き継ぐ（スタートへ戻らないように）
  const prevBots = useRef<Bot[]>([])
  const bots = useMemo(() => {
    const owned: { dispose: () => void }[] = []
    const list: Bot[] = []
    // 轍：ふつうは 1 台 210 m ぶん、軽い端末は 90 m ぶん
    const trackLevel = lowMemory() || level === 'low' ? 'low' : 'medium'
    const poolGeo = new THREE.PlaneGeometry(1, 1)
    poolGeo.rotateX(-Math.PI / 2)
    owned.push(poolGeo)
    let slot = 0
    for (let c = 0; c < RALLY_COLORS.length; c++) {
      if (c === color) continue
      if (slot === PLAYER_SLOT) slot++
      const model = scene.clone(true)
      const hex = RALLY_COLORS[c].hex
      const paint = paintUniforms(hex)
      // ランプ：その色に光る（夜に目立つ）
      const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(2.4), toneMapped: false })
      owned.push(lamp)
      const mats = new Map<string, THREE.Material>()
      model.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        // 影は自分のローバーだけ（軽くするため）。ほかの 3 台は影を受けるだけ
        mesh.castShadow = level === 'high'
        mesh.receiveShadow = true
        const src = mesh.material as THREE.MeshStandardMaterial
        const full = PAINT_PARTS.has(mesh.name)
        const mk = src.uuid + (full ? ':full' : '')
        if (!mats.has(mk)) {
          if (src.name === 'Lamp') mats.set(mk, lamp)
          else {
            const m = src.clone()
            m.envMapIntensity = 1.15
            if (lowMemory()) {
              for (const key of MAP_KEYS) {
                const tex = m[key]
                if (!tex) continue
                const small = shrinkTexture(tex, 512)
                if (small) {
                  m[key] = small
                  owned.push(small)
                }
              }
            }
            prepare(withPaint(m, paint, full))
            owned.push(m)
            mats.set(mk, m)
          }
        }
        mesh.material = mats.get(mk)!
      })
      const get = (n: string) => model.getObjectByName(n)!
      const rig: Rig = {
        body: get('Body'),
        legs: Object.fromEntries(['FR', 'MR', 'RR', 'FL', 'ML', 'RL'].map((k) => [k, get('Leg_' + k)])),
        wheels: Object.fromEntries(['FR', 'MR', 'RR', 'FL', 'ML', 'RL'].map((k) => [k, get('Wheel_' + k)])),
        links: [get('Link_R'), get('Link_L')],
        panelsL: [get('Panel_L1'), get('Panel_L2')],
        panelsR: [get('Panel_R1'), get('Panel_R2')],
        mast: get('Mast'),
        head: get('Head'),
        antennas: [get('Antenna1'), get('Antenna2')],
        arm: [get('ArmYaw'), get('ArmUpper'), get('ArmFore'), get('ArmHand')],
      }
      for (const w of Object.values(rig.wheels)) w.rotation.order = 'YXZ'
      applyPose(rig, BOT_POSE)
      // 夜の目印：マストの上の色の光と、前の地面を照らす色の光だまり
      const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(hex).multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false })
      const glow = new THREE.Sprite(glowMat)
      glow.position.set(0, 2.05, 0.15)
      glow.scale.setScalar(1.1)
      glow.renderOrder = 4
      model.add(glow)
      const poolMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(hex), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
      const pool = new THREE.Mesh(poolGeo, poolMat)
      pool.position.set(0, 0.12, -6)
      pool.scale.set(5.5, 1, 10)
      pool.renderOrder = 2
      model.add(pool)
      owned.push(glowMat, poolMat)
      const tracks = new WheelTracks(terrain.def.id, trackLevel, (x, z) => drawnHeight(terrain, x, z))
      owned.push(tracks)
      list.push({
        color: c, slot, model, rig, paint, tracks, glow, pool, s: GRID_S, off: GRID_LANES[slot], v: 0,
        x: 0, z: 0, y: 0, vy: 0, heading: 0, pitch: 0, roll: 0, spin: 0, steer: 0, air: false, hopT: 3 + slot,
        form: 1, phase: 0, tripT: 10, tripping: 0, finish: null, caught: false, turn: 0, drift: 0, squash: 0, squashV: 0, sway: new Sway(),
      })
      slot++
    }
    for (const b of list) {
      const old = prevBots.current.find((o) => o.color === b.color)
      if (!old) continue
      for (const k of BOT_STATE) (b as Record<string, unknown>)[k] = old[k]
      b.model.position.copy(old.model.position)
      b.model.quaternion.copy(old.model.quaternion)
    }
    prevBots.current = list
    return { list, owned }
  }, [scene, color, prepare, level, terrain])
  useEffect(() => () => bots.owned.forEach((m) => m.dispose()), [bots])

  const dust = useMemo(
    () => new WheelDust(level === 'high' ? 360 : level === 'medium' ? 220 : 90, new THREE.Color(dustColor), !!terrain.def.sky, terrain.def.gravity, windFor(terrain.def.id, !!terrain.def.sky)),
    [dustColor, level, terrain],
  )
  useEffect(() => () => dust.dispose(), [dust])

  // ---- レースの進み ----
  const run = useRef({ start: 0, prog: GRID_S, lastGate: -1, splits: [] as number[], hud: 0, placed: false })

  const placeBots = () => {
    for (const b of bots.list) {
      // 追いかけっこ：コンピューターは先にスタートして逃げる（60 m・130 m・200 m 先から）
      const ahead = chase ? 60 + 70 * bots.list.indexOf(b) : 0
      const p = ahead ? (() => { const q = pointAt(course, GRID_S + ahead); return { x: q.x, z: q.z, heading: Math.atan2(-q.dx, -q.dz) } })() : gridSlot(course, b.slot)
      const tr = TRAITS[b.color]
      Object.assign(b, {
        s: GRID_S + ahead, off: ahead ? 0 : GRID_LANES[b.slot], v: 0, x: p.x, z: p.z, heading: p.heading, vy: 0, air: false, finish: null, caught: false, hopT: 3 + b.slot * 1.7,
        // 毎回ちがうレースに：調子・走る位置の波・つまずくまでの時間
        form: 0.95 + Math.random() * 0.09,
        phase: Math.random() * Math.PI * 2,
        tripT: tr.trip * (0.5 + Math.random()),
        tripping: 0,
        turn: 0,
        drift: 0,
        squash: 0,
        squashV: 0,
      })
      b.sway.reset()
      b.y = meshHeight(terrain, p.x, p.z)
      b.tracks.lift()
    }
  }

  /** 自分のローバーをスタートの列へ */
  const toGrid = () => {
    const p = gridSlot(course, PLAYER_SLOT)
    roverCtl.place?.(p.x, p.z, p.heading)
    roverCtl.locked = true
    placeBots()
    run.current = { start: 0, prog: GRID_S, lastGate: -1, splits: [], hud: 0, placed: true }
    useRally.setState({ gate: 0, time: 0, place: 1, split: null, result: null, lost: false })
    setRallyPhase('count')
  }

  // ローバーが走れるようになったら（展開が終わったら）、スタートの列へ
  useEffect(() => {
    if (phase === 'deploy' && roverPhase === 'drive') toGrid()
    if (phase === 'off' || roverPhase === 'none') roverCtl.locked = false
    if (roverPhase === 'none' && phase !== 'off') setRallyPhase('off')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, roverPhase])
  useEffect(
    () => () => {
      roverCtl.locked = false
      useRally.setState({ phase: 'off' })
    },
    [],
  )

  /** 直前の門（まだなければスタート）へ戻る */
  const backToGate = () => {
    const r = run.current
    const s = r.lastGate >= 0 ? course.gates[r.lastGate].s : GRID_S
    const p = pointAt(course, s + 2)
    roverCtl.place?.(p.x, p.z, Math.atan2(-p.dx, -p.dz))
    r.prog = s + 2
    useRally.setState({ lost: false })
  }

  /** コンピューターの 3 台を dt 秒すすめる */
  const stepBots = (dt: number, t: number, now: number, moving: boolean, counting: boolean) => {
    const r = run.current
    const me = roverPose
    const k = AI_SKILL
    const night = sky.night
    const last = course.gates[course.gates.length - 1].s
    for (const b of bots.list) {
      const tr = TRAITS[b.color]
      const fx = -Math.sin(b.heading)
      const fz = -Math.cos(b.heading)
      if (moving) {
        let target = 0
        if (b.finish === null && !b.caught) {
          // 先のカーブ（40 m 先まで）を見て、出せる速さを決める
          target = tr.top * k * b.form * (chase ? CHASE_PACE : 1)
          for (let a = 0; a <= 40; a += 10) {
            const curv = Math.abs(pointAt(course, b.s + a).k)
            if (curv > 1e-4) target = Math.min(target, Math.sqrt((tr.lat * k * (0.35 + 0.65 * ice)) / curv) + a * 0.08)
          }
          // 坂：登りは遅い
          const hA = terrain.height(b.x, b.z)
          const hB = terrain.height(b.x + fx * 10, b.z + fz * 10)
          target *= 1 - THREE.MathUtils.clamp(((hB - hA) / 10) * 1.1, -0.08, 0.3)
          // 自分と離れすぎない（ゆるく。順位が入れかわる余地を残す）
          const gap = b.s - r.prog
          if (chase) {
            // 追いかけっこ：近づかれると少し速く逃げ、離れすぎると少し待つ
            if (gap < 25 && gap > -5) target *= 1.1
            else if (gap > 220) target *= 0.9
          } else if (gap > 120) target *= 0.95
          else if (gap < -120) target *= 1.05
          // 岩につまずく：しばらく遅くなってふらつく（ジャンプ好きは跳んでよける）
          b.tripT -= dt
          if (b.tripT < 0 && !b.air) {
            b.tripT = tr.trip * (0.6 + Math.random() * 0.9)
            if (tr.hop) {
              b.vy = 3.4 + b.v * 0.08
              b.air = true
            } else {
              b.tripping = 1.2 + Math.random() * 0.8
              b.vy = 1.2
              b.air = true
              for (let i = 0; i < 6; i++) dust.puff(b.x, b.y, b.z, (Math.random() - 0.5) * 3, 0.8, (Math.random() - 0.5) * 3, 0.5)
            }
          }
          if (b.tripping > 0) {
            b.tripping -= dt
            target *= 0.55
          }
          // ジャンプ好き：ときどき跳ぶ
          if (tr.hop && !b.air) {
            b.hopT -= dt
            if (b.hopT < 0) {
              b.vy = 3.4 + b.v * 0.08
              b.air = true
              b.hopT = 4 + Math.random() * 4
            }
          }
          if (b.s >= last) {
            b.finish = t
            if (chase) {
              const c = useRally.getState().chase
              useRally.setState({ chase: { caught: c?.caught ?? [], escaped: [...(c?.escaped ?? []), b.color], at: c?.at ?? 0, last: c?.last ?? -1 } })
            }
          }
        }
        if (b.air) target = b.v
        const acc = target > b.v ? 3.6 * Math.max(0.2, 1 - b.v / 18) * 2 : -5
        b.v += THREE.MathUtils.clamp(target - b.v, -Math.abs(acc) * dt, Math.abs(acc) * dt)

        // ハンドル：少し先の点（線から自分のくせでずらした所）をねらう。門の近くでは門の内側へ
        const ahead = b.s + tr.look + b.v * 0.6
        const p = pointAt(course, ahead)
        const px = p.x
        const pz = p.z
        const pdx = p.dx
        const pdz = p.dz
        let want = tr.amp * Math.sin((ahead / tr.wave) * Math.PI * 2 + b.phase) + tr.amp * 0.4 * Math.sin((ahead / tr.wave) * 11 + b.phase * 2)
        // スタートの列から、だんだん自分の走り方へ
        const mix = THREE.MathUtils.clamp((b.s - GRID_S) / 120, 0, 1)
        want = GRID_LANES[b.slot] * (1 - mix) + want * mix
        let nearGate = Infinity
        for (const gt of course.gates) nearGate = Math.min(nearGate, Math.abs(gt.s - ahead))
        const lim = nearGate < 30 ? GATE_HALF - 3 : 9
        want = THREE.MathUtils.clamp(want, -lim, lim)
        const tx = px - pdz * want
        const tz = pz + pdx * want
        let dh = Math.atan2(-(tx - b.x), -(tz - b.z)) - b.heading
        while (dh > Math.PI) dh -= Math.PI * 2
        while (dh < -Math.PI) dh += Math.PI * 2
        // 曲がれる速さは自分のローバーと同じ（速いほど大回り）。宙では曲がれず、つまずくと少しふらつく
        const rate = b.air ? 0 : (Math.abs(b.v) / (2.6 + Math.abs(b.v) * 0.32)) * (b.tripping > 0 ? 0.35 : 1)
        const turn = THREE.MathUtils.clamp(dh * 3, -rate, rate) + (b.tripping > 0 ? Math.sin(now * 9 + b.phase) * 0.25 : 0)
        b.heading += turn * dt
        b.turn = turn
        b.steer += (THREE.MathUtils.clamp(dh * 4, -1, 1) - b.steer) * Math.min(1, dt * 5)
        // 大きく向きを変えるときは減速
        if (Math.abs(dh) > 0.4 && !b.air) b.v *= 1 - Math.min(0.5, dt * Math.abs(dh) * 0.8)
      } else {
        b.v = 0
        b.turn = 0
      }
      b.x += -Math.sin(b.heading) * b.v * dt
      b.z += -Math.cos(b.heading) * b.v * dt
      const pr = progressOf(course, b.x, b.z, b.s)
      b.s = pr.s
      b.off = pr.off
      // 自分とぶつかる：押し合う
      const ex = me.x - b.x
      const ez = me.z - b.z
      const d = Math.hypot(ex, ez)
      // 追いかけっこ：タッチしたら、つかまえた（そのローバーは止まる）
      if (chase && !b.caught && b.finish === null && !counting && moving && d < CHASE_TOUCH && Math.abs(me.y - b.y) < 2) {
        b.caught = true
        const c = useRally.getState().chase
        useRally.setState({ chase: { caught: [...(c?.caught ?? []), b.color], escaped: c?.escaped ?? [], at: rallyNow(), last: b.color } })
      }
      if (d < 1.9 && d > 1e-3 && !counting) {
        const o = (1.9 - d) / d
        roverCtl.push.x += ex * o * 0.6
        roverCtl.push.z += ez * o * 0.6
        b.x -= ex * o * 0.4
        b.z -= ez * o * 0.4
      }
      // コンピューターどうし
      for (const c of bots.list) {
        if (c === b) continue
        const cx = c.x - b.x
        const cz = c.z - b.z
        const cd = Math.hypot(cx, cz)
        if (cd < 1.9 && cd > 1e-3) {
          const o = ((1.9 - cd) / cd) * 0.5
          b.x -= cx * o
          b.z -= cz * o
          c.x += cx * o
          c.z += cz * o
        }
      }
      // 縦：地面に沿う。坂の頂上や跳んだときは宙に
      const ground = meshHeight(terrain, b.x, b.z)
      if (b.air || b.y > ground + 0.03) {
        b.vy -= g * dt
        b.y += b.vy * dt
        if (b.y <= ground) {
          // 着地：脚が縮んで車体が沈む
          if (b.air) b.squashV = Math.min(2.2, Math.max(0, -b.vy) * 0.26)
          b.y = ground
          b.vy = 0
          if (b.air) for (let i = 0; i < 8; i++) dust.puff(b.x, ground, b.z, (Math.random() - 0.5) * 3, 0.6, (Math.random() - 0.5) * 3, 0.6)
          b.air = false
        }
      } else {
        const gv = (ground - b.y) / Math.max(dt, 1e-3)
        // 下り坂の頂上で、地面が落ちていく速さより遅ければ飛び出す
        if (gv < -6 && b.v > 8) {
          b.air = true
          b.vy = Math.min(0, b.vy)
        } else {
          b.y = ground
          b.vy = gv
        }
      }
      const gx = -Math.sin(b.heading)
      const gz = -Math.cos(b.heading)
      // 傾き：前後と左右の地面の高さ
      if (!b.air) {
        const hF = meshHeight(terrain, b.x + gx * 0.72, b.z + gz * 0.72)
        const hBk = meshHeight(terrain, b.x - gx * 0.72, b.z - gz * 0.72)
        const hR = meshHeight(terrain, b.x - gz * 0.5, b.z + gx * 0.5)
        const hL = meshHeight(terrain, b.x + gz * 0.5, b.z - gx * 0.5)
        const kk = Math.min(1, dt * 10)
        b.pitch += (Math.atan2(hF - hBk, 1.44) - b.pitch) * kk
        b.roll += (Math.atan2(hR - hL, 1.0) - b.roll) * kk
      } else b.pitch += (Math.min(0.25, Math.max(-0.35, b.vy * 0.04)) - b.pitch) * Math.min(1, dt * 1.2)
      b.spin -= (b.v * dt) / 0.2
      b.model.position.set(b.x, b.y, b.z)
      // 横すべり：速く曲がるほど、車体の前が曲がる側へ向いて、外へすべっていくように見える（重力の弱い星ほど大きく）
      if (!b.air) b.drift += (THREE.MathUtils.clamp((b.turn * b.v * 0.026) / Math.sqrt(g * ice), -0.26 / Math.sqrt(ice), 0.26 / Math.sqrt(ice)) - b.drift) * Math.min(1, dt * (ice < 1 ? 2.5 : 4))
      b.model.rotation.set(b.pitch, b.heading + b.drift, b.roll, 'YXZ')
      // サスペンション（自分のローバーと同じ）
      b.squashV += (-(b.squash - (b.air ? -0.045 : 0)) * 160 - b.squashV * 14) * dt
      b.squash = THREE.MathUtils.clamp(b.squash + b.squashV * dt, -0.06, 0.15)
      b.sway.step(dt, b.v, -b.turn * b.v, b.pitch, b.roll, !b.air)
      applyPose(b.rig, BOT_POSE, b.squash, b.sway.pitch, b.sway.roll)
      for (const key of Object.keys(b.rig.wheels)) {
        const w = b.rig.wheels[key]
        w.rotation.x = b.spin
        w.rotation.y = key[0] === 'F' ? -b.steer * 0.35 : key[0] === 'R' ? b.steer * 0.35 : 0
      }
      // 轍：左右の真ん中の車輪の下。宙に浮いているあいだは切る
      const sx = -gz
      const sz = gx
      if (!b.air && b.v > 0.3) {
        b.tracks.touch(0, b.x - sx * 0.5, b.z - sz * 0.5)
        b.tracks.touch(1, b.x + sx * 0.5, b.z + sz * 0.5)
      } else if (b.air) b.tracks.lift()
      b.tracks.update(dt, sky.sunDir)
      // 夜の色の光
      const on = night > 0.02
      b.glow.visible = on
      b.pool.visible = on
      if (on) {
        ;(b.glow.material as THREE.SpriteMaterial).opacity = Math.min(1, night * 1.2) * (0.85 + 0.15 * Math.sin(now * 6 + b.phase))
        ;(b.pool.material as THREE.MeshBasicMaterial).opacity = night * 0.55
      }
      // 砂ぼこり
      if (!b.air && b.v > 2 && terrain.def.dust) {
        const kv = Math.min(1, b.v / 16.7)
        const n = Math.floor(dt * (level === 'low' ? 14 : 36) * kv + Math.random())
        for (let i = 0; i < n; i++) {
          const sd = Math.random() < 0.5 ? 0.5 : -0.5
          dust.puff(b.x - gz * sd - gx * 0.72, ground, b.z + gx * sd - gz * 0.72, -gx * b.v * 0.25, 0.6 + kv * 1.6, -gz * b.v * 0.25, 0.35 + kv * 0.6)
        }
      }
    }
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const st = useRally.getState()
    const active = st.phase === 'count' || st.phase === 'run' || st.phase === 'done'
    for (const o of gateObjs) o.grp.visible = st.phase !== 'off'
    for (const b of bots.list) {
      b.model.visible = active
      b.tracks.mesh.visible = active
    }
    if (st.phase === 'off' || st.phase === 'deploy') {
      roverInput.reset = false
      dust.update(dt)
      return
    }
    const now = rallyNow()
    const r = run.current
    // スタート：3・2・1 のあと
    if (st.phase === 'count') {
      roverCtl.locked = true
      if (now - st.since >= COUNT_SEC) {
        roverCtl.locked = false
        r.start = now
        setRallyPhase('run')
      }
    }
    const running = st.phase === 'run'
    const t = running || st.phase === 'done' ? now - r.start : 0
    const moving = running || st.phase === 'done'

    // ---- 自分 ----
    const me = roverPose
    r.prog = progressOf(course, me.x, me.z, r.prog).s
    if (roverInput.reset) {
      roverInput.reset = false
      if (running) backToGate()
    }
    let gate = st.gate
    if (running && gate < course.gates.length) {
      const gt = course.gates[gate]
      // 門の面（進む向きに垂直）を横切ったか：門の中心から前後 6 m・左右 GATE_HALF の箱に入ったら
      const ex = me.x - gt.x
      const ez = me.z - gt.z
      const along = ex * gt.dx + ez * gt.dz
      const side = -ex * gt.dz + ez * gt.dx
      if (Math.abs(along) < 6 && Math.abs(side) < GATE_HALF + 0.5) {
        r.splits[gate] = t
        r.lastGate = gate
        const best = loadBest()
        const diff = best?.splits[gate] !== undefined ? t - best.splits[gate] : null
        gate++
        useRally.setState({ gate, split: { gate, time: t, diff, at: now }, lost: false })
        if (gate === course.gates.length) finish(t)
      } else {
        // 門の横を通りすぎた（40 m 以上先へ行った）：戻るように案内
        const lost = r.prog > gt.s + 40
        if (lost !== st.lost) useRally.setState({ lost })
      }
    }

    // ---- コンピューター ----
    stepBots(dt, t, now, moving, st.phase === 'count')
    dust.update(dt)

    // ---- 門の見た目：次の門は明るく、くぐった門は消す ----
    gateObjs.forEach((o, i) => {
      const passed = i < gate
      const mat = passed ? gateParts.done : i === gate ? (o.goal ? gateParts.goal : gateParts.next) : o.goal ? gateParts.goal : gateParts.later
      o.grp.visible = !passed
      for (const m of o.meshes) if (m.material !== mat) m.material = mat
    })
    gateParts.next.opacity = 0.55 + 0.25 * Math.sin(now * 5)

    // ---- 表示：1 秒に 10 回 ----
    r.hud += dt
    if (r.hud > 0.25 && !running) {
      r.hud = 0
      useRally.setState({ bots: bots.list.map((b) => ({ c: b.color, x: b.x, z: b.z })) })
    }
    if (r.hud > 0.1 && running) {
      r.hud = 0
      let place = 1
      for (const b of bots.list) if (b.finish !== null || b.s > r.prog) place++
      const gt = course.gates[Math.min(gate, course.gates.length - 1)]
      const fx = -Math.sin(me.heading)
      const fz = -Math.cos(me.heading)
      const ex = gt.x - me.x
      const ez = gt.z - me.z
      const rel = (Math.atan2(ex * -fz + ez * fx, ex * fx + ez * fz) * 180) / Math.PI
      useRally.setState({ time: t, place, toGate: { dist: Math.round(Math.hypot(ex, ez)), rel: Math.round(rel) }, bots: bots.list.map((b) => ({ c: b.color, x: b.x, z: b.z })) })
    }
  })

  /** ゴール：順位と記録 */
  function finish(t: number) {
    const r = run.current
    const best = loadBest()
    const newBest = !best || t < best.time
    if (newBest) saveBest({ time: t, splits: [...r.splits] })
    const order: RallyEntry[] = [{ color: useRally.getState().color, time: t, you: true }]
    for (const b of bots.list) {
      // まだ走っている車は、今の速さで残りを走った時刻（見込み）
      const est = b.finish ?? t + Math.max(0, course.gates[course.gates.length - 1].s - b.s) / Math.max(8, b.v)
      order.push({ color: b.color, time: est, you: false })
    }
    order.sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9))
    const place = order.findIndex((e) => e.you) + 1
    const { at, rank } = bookResult(track, t, place, useRally.getState().color, chase ? (useRally.getState().chase?.caught.length ?? 0) : undefined)
    useRally.setState({ result: { time: t, place, best: newBest ? t : best!.time, newBest, order, at, rank }, toGate: null, place })
    setRallyPhase('done')
  }

  return (
    <>
      {gateObjs.map((o, i) => (
        <primitive key={i} object={o.grp} />
      ))}
      {bots.list.map((b) => (
        <primitive key={b.color} object={b.model} />
      ))}
      {bots.list.map((b) => (
        <primitive key={'t' + b.color} object={b.tracks.mesh} />
      ))}
      <primitive object={dust.points} />
    </>
  )
}
