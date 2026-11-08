import * as THREE from 'three'
import { useStore } from '../../state/store'
import { bodies, sim } from '../../state/registry'
import { ship, warpFx } from '../../state/flight'
import { proximity } from '../../state/proximity'
import { useStamps } from '../../state/stamps'
import { STAMP_IDS } from '../../data/stamps'
import { PLANETS } from '../../data/bodies'
import { formatDate, simDate } from '../../data/ephemeris'
import { isTouchDevice } from '../../state/input'
import { ui } from '../../i18n'

/**
 * 艦橋の画面に、いまの飛行のようすを描く。見た目はオリジナル：黒いガラスに細い線と数字、水色と琥珀色。
 * 画面ごとに小さなキャンバスを持ち、1 秒に数回だけ描き直す（スマホでは少なめ）
 */

const CYAN = '#5fd3e6'
const CYAN_DIM = 'rgba(95, 211, 230, 0.35)'
const CYAN_FAINT = 'rgba(95, 211, 230, 0.14)'
const AMBER = '#f2b45a'
const TEXT = 'rgba(200, 238, 245, 0.92)'
const BG = '#03060a'
const FONT = '"Noto Sans JP", system-ui, sans-serif'
const MONO = 'ui-monospace, Menlo, monospace'

export type Role =
  | 'helm'
  | 'ops'
  | 'radar'
  | 'contacts'
  | 'defence'
  | 'map'
  | 'science'
  | 'engine'
  | 'environment'
  | 'log'
  | 'clock'
  | 'deco'
  | 'sign1'
  | 'sign2'

type Screen = { role: Role; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; seed: number; phase: number }

const v = new THREE.Vector3()
const rel = new THREE.Vector3()
const qInv = new THREE.Quaternion()

/** 画面の名前と置き場所から、何を映すかを決める（Blender の build_bridge.py の並びに合わせる） */
export function screenRoles(meshes: THREE.Mesh[]) {
  const roles = new Map<THREE.Mesh, Role>()
  const center = (m: THREE.Mesh) => {
    m.geometry.computeBoundingBox()
    return m.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(m.matrixWorld)
  }
  const of = (prefix: string) =>
    meshes
      .filter((m) => m.name.startsWith(prefix))
      .map((m) => ({ m, c: center(m) }))
      .sort((a, b) => a.c.x - b.c.x)
  for (const { m, c } of of('screen_front')) roles.set(m, c.x < 0 ? 'helm' : 'ops')
  of('screen_tactical').forEach(({ m }, i) => roles.set(m, (['radar', 'defence', 'contacts'] as Role[])[i] ?? 'deco'))
  // 後ろの壁（奥、z が大きい）と、窓の両わきの壁
  const stations = of('screen_station')
  const aft = stations.filter((s) => s.c.z > 2)
  const side = stations.filter((s) => s.c.z <= 2)
  const aftRoles: Role[] = ['engine', 'science', 'map', 'log', 'environment']
  aft.forEach(({ m, c }, i) => roles.set(m, Math.abs(c.x) < 0.6 ? 'map' : aftRoles[i] ?? 'deco'))
  const sideRoles: Role[] = ['clock', 'contacts', 'science', 'radar']
  side.forEach(({ m }, i) => roles.set(m, sideRoles[i] ?? 'deco'))
  of('screen_sign').forEach(({ m }, i) => roles.set(m, i === 0 ? 'sign1' : 'sign2'))
  for (const m of meshes) if (!roles.has(m)) roles.set(m, 'deco')
  return roles
}

/**
 * 画面の絵の向きを合わせる。Blender の板は向きがまちまちなので、見る人の側から見て
 * 絵の上が上（机の画面なら奥）、右が右になるよう、絵の座標を裏返す
 */
export function orientScreen(mesh: THREE.Mesh, texture: THREE.Texture, role: Role) {
  const pos = mesh.geometry.getAttribute('position')
  const uv = mesh.geometry.getAttribute('uv')
  if (!pos || !uv || pos.count < 3) return
  const idx = mesh.geometry.index
  const at = (k: number) => (idx ? idx.getX(k) : k)
  const p = [0, 1, 2].map((k) => new THREE.Vector3(pos.getX(at(k)), pos.getY(at(k)), pos.getZ(at(k))).applyMatrix4(mesh.matrixWorld))
  const t = [0, 1, 2].map((k) => new THREE.Vector2(uv.getX(at(k)), uv.getY(at(k))))
  // 三角形から、絵の座標 u・v が増える向き（部屋の中の向き）を求める
  const e1 = p[1].clone().sub(p[0])
  const e2 = p[2].clone().sub(p[0])
  const d1 = t[1].clone().sub(t[0])
  const d2 = t[2].clone().sub(t[0])
  const det = d1.x * d2.y - d2.x * d1.y
  if (Math.abs(det) < 1e-12) return
  const du = e1.clone().multiplyScalar(d2.y).sub(e2.clone().multiplyScalar(d1.y)).divideScalar(det)
  const dv = e2.clone().multiplyScalar(d1.x).sub(e1.clone().multiplyScalar(d2.x)).divideScalar(det)
  const center = p[0].clone().add(p[1]).add(p[2]).divideScalar(3)
  // 見る人：防御・センサー卓は手すりの外側に立つ人、ほかは部屋の真ん中
  const viewer = role === 'radar' || role === 'defence' || role === 'contacts' ? (center.z > 3 ? center.clone().setY(0).multiplyScalar(1.4).setY(1.7) : new THREE.Vector3(0, 1.4, 0)) : new THREE.Vector3(0, 1.4, 0)
  const toViewer = viewer.clone().sub(center)
  const normal = du.clone().cross(dv).normalize()
  if (normal.dot(toViewer) < 0) normal.negate()
  let upRef = new THREE.Vector3(0, 1, 0).addScaledVector(normal, -normal.y)
  if (upRef.length() < 0.3) upRef = toViewer.clone().addScaledVector(normal, -toViewer.dot(normal)).negate()
  // 絵（キャンバス）の上は v が減る向き、右は u が増える向き
  let up = dv.clone().negate()
  if (up.dot(upRef) < 0) {
    texture.repeat.y = -1
    texture.offset.y = 1
    up = dv.clone()
  }
  if (du.clone().cross(up).dot(normal) < 0) {
    texture.repeat.x = -1
    texture.offset.x = 1
  }
}

const SIZES: Partial<Record<Role, [number, number]>> = {
  map: [1024, 512],
  helm: [640, 320],
  ops: [640, 320],
  radar: [384, 256],
  contacts: [384, 256],
  defence: [384, 256],
  sign1: [256, 96],
  sign2: [256, 96],
  deco: [256, 160],
}

export class Consoles {
  screens: Screen[] = []
  private clock = 0
  private next = 0
  private interval = isTouchDevice() ? 0.5 : 0.25

  make(role: Role, seed: number) {
    const [w, h] = SIZES[role] ?? [512, 256]
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    // glTF の絵の座標に合わせる（上下を反転しない）
    texture.flipY = false
    const s: Screen = { role, canvas, ctx, texture, seed, phase: seed * 0.37 }
    this.screens.push(s)
    draw(s, 0)
    texture.needsUpdate = true
    return texture
  }

  /** 毎フレーム呼ぶ。決まった間隔で、画面を一つずつ順に描き直す */
  update(dt: number) {
    this.clock += dt
    if (!this.screens.length) return
    const per = this.interval / this.screens.length
    while (this.clock >= per) {
      this.clock -= per
      const s = this.screens[this.next++ % this.screens.length]
      draw(s, performance.now() / 1000)
      s.texture.needsUpdate = true
    }
  }

  dispose() {
    for (const s of this.screens) s.texture.dispose()
    this.screens = []
  }
}

// ---- 描く道具 -------------------------------------------------------------------
function frame(g: CanvasRenderingContext2D, w: number, h: number, title: string, code: string) {
  g.fillStyle = BG
  g.fillRect(0, 0, w, h)
  // うっすらした方眼
  g.strokeStyle = CYAN_FAINT
  g.lineWidth = 1
  for (let x = 0.5; x < w; x += 24) line(g, x, 0, x, h)
  for (let y = 0.5; y < h; y += 24) line(g, 0, y, w, y)
  // 上の見出し：細い線と、小さな番号
  const s = h / 256
  g.fillStyle = CYAN
  g.font = `600 ${Math.round(17 * s)}px ${FONT}`
  g.textBaseline = 'alphabetic'
  g.fillText(title, 14 * s, 26 * s)
  g.fillStyle = AMBER
  g.font = `${Math.round(12 * s)}px ${MONO}`
  g.textAlign = 'right'
  g.fillText(code, w - 14 * s, 25 * s)
  g.textAlign = 'left'
  g.strokeStyle = CYAN_DIM
  line(g, 10 * s, 34.5 * s, w - 10 * s, 34.5 * s)
  g.strokeStyle = CYAN_DIM
  g.strokeRect(3.5, 3.5, w - 7, h - 7)
  return s
}

function line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  g.beginPath()
  g.moveTo(x0, y0)
  g.lineTo(x1, y1)
  g.stroke()
}

function row(g: CanvasRenderingContext2D, s: number, x: number, y: number, label: string, value: string, color = TEXT, width = 260) {
  g.font = `${Math.round(13 * s)}px ${FONT}`
  g.fillStyle = CYAN_DIM.replace('0.35', '0.8')
  g.fillText(label, x, y)
  g.font = `600 ${Math.round(16 * s)}px ${MONO}`
  g.fillStyle = color
  g.textAlign = 'right'
  g.fillText(value, x + width * s, y)
  g.textAlign = 'left'
}

function bar(g: CanvasRenderingContext2D, s: number, x: number, y: number, w: number, value: number, label: string, warn = false) {
  g.font = `${Math.round(12 * s)}px ${FONT}`
  g.fillStyle = TEXT
  g.fillText(label, x, y - 5 * s)
  g.strokeStyle = CYAN_DIM
  g.strokeRect(x + 0.5, y + 0.5, w, 9 * s)
  g.fillStyle = warn ? AMBER : CYAN
  g.fillRect(x + 2, y + 2, Math.max(0, Math.min(1, value)) * (w - 3), 9 * s - 3)
}

const fmt = (n: number, digits = 1) => (Number.isFinite(n) ? n.toLocaleString(ui().consoles.numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—')

/** 自機から見た向き（右が +x、上が +y、前が -z） */
function local(p: THREE.Vector3) {
  return rel.copy(p).sub(ship.position).applyQuaternion(qInv.copy(ship.quaternion).invert())
}

function targetEntry() {
  const id = useStore.getState().targetId
  return id ? bodies.get(id) : undefined
}

function planetOf(id: string | undefined) {
  if (!id) return undefined
  for (const p of PLANETS) {
    if (p.id === id) return { planet: p, moon: undefined }
    const moon = p.moons.find((m) => m.id === id)
    if (moon) return { planet: p, moon }
  }
  return undefined
}

// ---- 画面ごとの絵 ----------------------------------------------------------------
function draw(s: Screen, time: number) {
  const g = s.ctx
  const { width: w, height: h } = s.canvas
  switch (s.role) {
    case 'helm':
      return helm(g, w, h, time)
    case 'ops':
      return ops(g, w, h, time)
    case 'radar':
      return radar(g, w, h, time)
    case 'contacts':
      return contacts(g, w, h)
    case 'defence':
      return defence(g, w, h, time)
    case 'map':
      return map(g, w, h)
    case 'science':
      return science(g, w, h, time)
    case 'engine':
      return engine(g, w, h, time + s.phase)
    case 'environment':
      return environment(g, w, h, time)
    case 'log':
      return log(g, w, h)
    case 'clock':
      return clock(g, w, h)
    case 'sign1':
    case 'sign2':
      return sign(g, w, h, s.role === 'sign1' ? 1 : 2)
    default:
      return deco(g, w, h, time, s.seed)
  }
}

function helm(g: CanvasRenderingContext2D, w: number, h: number, time: number) {
  const st = useStore.getState()
  const s = frame(g, w, h, ui().consoles.helm, 'NAV 01')
  const target = targetEntry()
  const phase = { idle: ui().consoles.cruise, charge: ui().consoles.warpCharging, warp: ui().consoles.atWarp, exit: ui().consoles.leavingWarp }[st.warpPhase]
  row(g, s, 16 * s, 62 * s, ui().consoles.target, target ? target.name : ui().consoles.none, target ? AMBER : TEXT)
  row(g, s, 16 * s, 88 * s, ui().consoles.distance, st.telemetry.distance === null ? '—' : fmt(st.telemetry.distance, 2))
  row(g, s, 16 * s, 114 * s, ui().consoles.speed, fmt(st.telemetry.speed, 2))
  row(g, s, 16 * s, 140 * s, ui().consoles.eta, st.telemetry.eta === null ? '—' : `${fmt(st.telemetry.eta, 0)} s`)
  row(g, s, 16 * s, 166 * s, ui().consoles.warpFactor, fmt(st.warpFactor, 0))
  row(g, s, 16 * s, 192 * s, ui().consoles.status, phase, st.warpPhase === 'idle' ? TEXT : AMBER)
  row(g, s, 16 * s, 218 * s, ui().consoles.autopilot, st.autopilot ? 'ON' : 'OFF', st.autopilot ? AMBER : TEXT)
  // 右：目標の向き（真ん中が船の正面）
  const cx = w - 150 * s
  const cy = 140 * s
  const r = 92 * s
  g.strokeStyle = CYAN_DIM
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.arc(cx, cy, r / 2, 0, Math.PI * 2)
  g.stroke()
  line(g, cx - r, cy, cx + r, cy)
  line(g, cx, cy - r, cx, cy + r)
  if (target) {
    target.object.getWorldPosition(v)
    const p = local(v)
    // 前（-z）からのずれの角度を、円の中の位置に
    const off = Math.acos(THREE.MathUtils.clamp(-p.z / Math.max(p.length(), 1e-9), -1, 1)) / Math.PI
    const dir = Math.atan2(-p.y, p.x)
    const x = cx + Math.cos(dir) * off * r
    const y = cy + Math.sin(dir) * off * r
    g.fillStyle = AMBER
    g.beginPath()
    g.arc(x, y, 6 * s, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = AMBER
    g.strokeRect(x - 11 * s, y - 11 * s, 22 * s, 22 * s)
  }
  // 中央の目印がゆっくり点滅
  g.fillStyle = Math.sin(time * 3) > 0 ? CYAN : CYAN_DIM
  g.fillRect(cx - 3 * s, cy - 3 * s, 6 * s, 6 * s)
}

function ops(g: CanvasRenderingContext2D, w: number, h: number, time: number) {
  const st = useStore.getState()
  const s = frame(g, w, h, ui().consoles.operations, 'OPS 02')
  const bw = w / 2 - 40 * s
  const jitter = (k: number) => 0.015 * Math.sin(time * 1.3 + k)
  bar(g, s, 16 * s, 66 * s, bw, 0.32 + warpFx.glow * 0.5 + warpFx.intensity * 0.18 + jitter(1), ui().consoles.warpCoreOutput, warpFx.intensity > 0.5)
  bar(g, s, 16 * s, 104 * s, bw, Math.min(1, st.telemetry.speed / 12) + jitter(2), ui().consoles.impulse)
  bar(g, s, 16 * s, 142 * s, bw, 0.98 + jitter(3), ui().consoles.deflectorShield)
  bar(g, s, 16 * s, 180 * s, bw, 0.9 + jitter(4), ui().consoles.lifeSupport)
  bar(g, s, 16 * s, 218 * s, bw, 0.995, ui().consoles.hullIntegrity)
  const x = w / 2 + 10 * s
  row(g, s, x, 66 * s, ui().consoles.date, formatDate(simDate(sim.time)), TEXT, 250)
  row(g, s, x, 92 * s, ui().consoles.time, simDate(sim.time).toTimeString().slice(0, 5), TEXT, 250)
  const visited = Object.keys(useStamps.getState().stamps).length
  row(g, s, x, 118 * s, ui().consoles.bodiesVisited, `${visited} / ${STAMP_IDS.size}`, AMBER, 250)
  row(g, s, x, 144 * s, ui().consoles.crew, ui().consoles.onWatch, TEXT, 250)
  row(g, s, x, 170 * s, ui().consoles.registry, 'SV-01', TEXT, 250)
  row(g, s, x, 196 * s, ui().consoles.alerts, ui().consoles.none, CYAN, 250)
}

/** センサーのレーダー：上から見た自機のまわり（上が前）。距離は対数で縮める */
function radar(g: CanvasRenderingContext2D, w: number, h: number, time: number) {
  const s = frame(g, w, h, ui().consoles.sensors, 'SNS 03')
  const cx = w / 2
  const cy = (h + 34 * s) / 2 + 4 * s
  const r = Math.min(w / 2, (h - 34 * s) / 2) - 12 * s
  g.strokeStyle = CYAN_DIM
  for (const k of [1, 0.66, 0.33]) {
    g.beginPath()
    g.arc(cx, cy, r * k, 0, Math.PI * 2)
    g.stroke()
  }
  // 回る掃引線
  const a = (time * 1.2) % (Math.PI * 2)
  const grad = g.createConicGradient?.(a - 0.9, cx, cy)
  if (grad) {
    grad.addColorStop(0, 'rgba(95,211,230,0)')
    grad.addColorStop(0.14, 'rgba(95,211,230,0.28)')
    grad.addColorStop(0.145, 'rgba(95,211,230,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.fill()
  }
  const targetId = useStore.getState().targetId
  g.font = `${Math.round(11 * s)}px ${FONT}`
  for (const b of nearest(9)) {
    const p = local(b.pos)
    const d = Math.hypot(p.x, p.z)
    const k = Math.min(1, Math.log10(1 + d) / 3.2)
    const x = cx + (p.x / Math.max(d, 1e-9)) * k * r
    const y = cy + (p.z / Math.max(d, 1e-9)) * k * r
    const hot = b.id === targetId
    g.fillStyle = hot ? AMBER : TEXT
    g.beginPath()
    g.arc(x, y, (hot ? 4 : 3) * s, 0, Math.PI * 2)
    g.fill()
    g.fillText(b.name, x + 6 * s, y + 4 * s)
  }
  // 自機
  g.fillStyle = AMBER
  g.beginPath()
  g.moveTo(cx, cy - 7 * s)
  g.lineTo(cx - 5 * s, cy + 5 * s)
  g.lineTo(cx + 5 * s, cy + 5 * s)
  g.fill()
}

function nearest(n: number) {
  const list: { id: string; name: string; pos: THREE.Vector3; d: number }[] = []
  for (const b of bodies.values()) {
    const pos = b.object.getWorldPosition(new THREE.Vector3())
    list.push({ id: b.id, name: b.name, pos, d: Math.max(0, pos.distanceTo(ship.position) - b.radius) })
  }
  return list.sort((a, b) => a.d - b.d).slice(0, n)
}

function contacts(g: CanvasRenderingContext2D, w: number, h: number) {
  const s = frame(g, w, h, ui().consoles.nearby, 'SNS 04')
  nearest(7).forEach((b, i) => row(g, s, 14 * s, (60 + i * 26) * s, b.name, fmt(b.d, 2), i === 0 ? AMBER : TEXT, (w / s) - 30))
}

function defence(g: CanvasRenderingContext2D, w: number, h: number, time: number) {
  const s = frame(g, w, h, ui().consoles.defence, 'DEF 05')
  const cx = w / 2
  const cy = (h + 34 * s) / 2 + 2 * s
  // 船の形のまわりに、シールドの輪
  g.strokeStyle = CYAN
  g.lineWidth = 1.5
  for (let i = 0; i < 3; i++) {
    g.globalAlpha = 0.25 + 0.25 * Math.sin(time * 2 + i)
    g.beginPath()
    g.ellipse(cx, cy, (120 - i * 14) * s, (70 - i * 9) * s, 0, 0, Math.PI * 2)
    g.stroke()
  }
  g.globalAlpha = 1
  g.lineWidth = 1
  g.fillStyle = TEXT
  g.beginPath()
  g.ellipse(cx, cy - 12 * s, 40 * s, 14 * s, 0, 0, Math.PI * 2)
  g.fill()
  g.fillRect(cx - 6 * s, cy - 4 * s, 12 * s, 26 * s)
  g.fillRect(cx - 46 * s, cy + 18 * s, 92 * s, 6 * s)
  g.font = `${Math.round(13 * s)}px ${FONT}`
  g.fillStyle = CYAN
  g.textAlign = 'center'
  g.fillText(ui().consoles.shieldsAllClear, cx, h - 16 * s)
  g.textAlign = 'left'
}

/** 太陽系の地図：真上から見た惑星の位置と、自機と目標 */
function map(g: CanvasRenderingContext2D, w: number, h: number) {
  const s = frame(g, w, h, ui().consoles.solarSystem, 'AST 06')
  const cx = w / 2
  const cy = (h + 34 * s) / 2
  const r = Math.min(w / 2.2, (h - 50 * s) / 2)
  const sun = bodies.get('sun')
  const origin = sun ? sun.object.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3()
  let far = 1
  const placed = PLANETS.map((p) => {
    const b = bodies.get(p.id)
    const pos = b ? b.object.getWorldPosition(new THREE.Vector3()).sub(origin) : new THREE.Vector3()
    far = Math.max(far, Math.hypot(pos.x, pos.z))
    return { p, pos }
  })
  // 距離はルートで縮めて、内側の惑星も見えるように
  const k = (d: number) => Math.sqrt(d / far) * r
  const at = (pos: THREE.Vector3) => {
    const d = Math.hypot(pos.x, pos.z)
    return [cx + (pos.x / Math.max(d, 1e-9)) * k(d), cy + (pos.z / Math.max(d, 1e-9)) * k(d)]
  }
  g.fillStyle = '#ffcc66'
  g.beginPath()
  g.arc(cx, cy, 6 * s, 0, Math.PI * 2)
  g.fill()
  const targetId = useStore.getState().targetId
  const targetPlanet = planetOf(targetId ?? undefined)?.planet.id
  g.font = `${Math.round(12 * s)}px ${FONT}`
  for (const { p, pos } of placed) {
    const d = Math.hypot(pos.x, pos.z)
    g.strokeStyle = CYAN_FAINT.replace('0.14', '0.3')
    g.beginPath()
    g.arc(cx, cy, k(d), 0, Math.PI * 2)
    g.stroke()
    const [x, y] = at(pos)
    const hot = p.id === targetPlanet
    g.fillStyle = hot ? AMBER : p.color
    g.beginPath()
    g.arc(x, y, (hot ? 5 : 4) * s, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = hot ? AMBER : TEXT
    g.fillText(ui().bodies[p.id].name, x + 7 * s, y - 5 * s)
  }
  const [sx, sy] = at(v.copy(ship.position).sub(origin))
  g.strokeStyle = AMBER
  g.lineWidth = 2
  g.strokeRect(sx - 6 * s, sy - 6 * s, 12 * s, 12 * s)
  g.lineWidth = 1
  g.fillStyle = AMBER
  g.fillText(ui().consoles.ownShip, sx + 9 * s, sy + 14 * s)
}

function science(g: CanvasRenderingContext2D, w: number, h: number, time: number) {
  const s = frame(g, w, h, ui().consoles.science, 'SCI 07')
  const id = useStore.getState().targetId ?? proximity.id ?? 'earth'
  const found = planetOf(id ?? undefined)
  const body = found?.moon ?? found?.planet
  const name = body ? ui().bodies[body.id].name : bodies.get(id)?.name ?? '—'
  g.font = `600 ${Math.round(20 * s)}px ${FONT}`
  g.fillStyle = AMBER
  g.fillText(name, 16 * s, 64 * s)
  if (body) {
    const rows: [string, string][] = [[ui().consoles.diameter, `${fmt(body.radiusKm * 2, 0)} km`]]
    if (found?.moon) rows.push([ui().consoles.fromPlanet, `${fmt(found.moon.distanceKm, 0)} km`], [ui().consoles.orbitPeriod, `${fmt(found.moon.orbitDays, 1)} ${ui().consoles.daysUnit}`])
    else if (found) {
      rows.push([ui().consoles.fromSun, `${fmt(found.planet.distanceAu, 2)} au`], [ui().consoles.orbitPeriod, `${fmt(found.planet.orbitDays / 365.25, 2)} ${ui().consoles.yearsUnit}`])
      rows.push([ui().consoles.dayLength, `${fmt(Math.abs(found.planet.rotationHours), 1)} h`], [ui().consoles.moonsHere, `${found.planet.moons.length}`])
    }
    rows.forEach(([a, b], i) => row(g, s, 16 * s, (96 + i * 26) * s, a, b, TEXT, 270))
  }
  // 右：回る天体の線画
  const cx = w - 110 * s
  const cy = (h + 34 * s) / 2
  const r = 70 * s
  g.strokeStyle = CYAN_DIM
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.stroke()
  g.strokeStyle = CYAN
  for (let i = 0; i < 6; i++) {
    const a = ((i / 6) * Math.PI + time * 0.4) % Math.PI
    g.beginPath()
    g.ellipse(cx, cy, Math.abs(Math.cos(a)) * r, r, 0, 0, Math.PI * 2)
    g.stroke()
  }
  for (const k of [-0.6, 0, 0.6]) {
    const y = cy + k * r
    const half = Math.sqrt(1 - k * k) * r
    g.beginPath()
    g.ellipse(cx, y, half, half * 0.18, 0, 0, Math.PI * 2)
    g.stroke()
  }
}

function engine(g: CanvasRenderingContext2D, w: number, h: number, time: number) {
  const s = frame(g, w, h, ui().consoles.engineering, 'ENG 08')
  const power = 0.35 + warpFx.glow * 0.4 + warpFx.intensity * 0.25
  const top = 48 * s
  const mid = (top + h - 30 * s) / 2
  const amp = (h - top - 40 * s) / 2
  for (const [color, k, f] of [
    [CYAN, 1, 3],
    [AMBER, 0.6, 5],
  ] as const) {
    g.strokeStyle = color
    g.lineWidth = 1.5
    g.beginPath()
    for (let x = 12 * s; x < w - 12 * s; x += 3) {
      const u = x / w
      const y = mid + Math.sin(u * f * Math.PI * 2 + time * (2 + power * 6)) * amp * power * k * (0.7 + 0.3 * Math.sin(u * 17 + time))
      if (x === 12 * s) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
  }
  g.lineWidth = 1
  g.font = `${Math.round(13 * s)}px ${FONT}`
  g.fillStyle = TEXT
  g.fillText(`${ui().consoles.warpField} ${fmt(power * 100, 0)}%`, 16 * s, h - 14 * s)
}

function environment(g: CanvasRenderingContext2D, w: number, h: number, time: number) {
  const s = frame(g, w, h, ui().consoles.environment, 'ENV 09')
  const j = (k: number, a: number) => a * Math.sin(time * 0.3 + k)
  const rows: [string, string][] = [
    [ui().consoles.cabinTemp, `${fmt(21.5 + j(1, 0.2), 1)} °C`],
    [ui().consoles.pressure, `${fmt(101.3 + j(2, 0.1), 1)} kPa`],
    [ui().consoles.oxygen, `${fmt(20.9 + j(3, 0.05), 1)} %`],
    [ui().consoles.co2, `${fmt(0.04 + j(4, 0.004), 2)} %`],
    [ui().consoles.humidity, `${fmt(45 + j(5, 1), 0)} %`],
    [ui().consoles.gravity, '1.00 g'],
  ]
  rows.forEach(([a, b], i) => row(g, s, 16 * s, (64 + i * 30) * s, a, b, i === 5 ? AMBER : TEXT, w / s - 36))
}

function log(g: CanvasRenderingContext2D, w: number, h: number) {
  const s = frame(g, w, h, ui().consoles.records, 'LOG 10')
  const stamps = useStamps.getState()
  const visited = Object.entries(stamps.stamps)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  if (!visited.length) {
    g.font = `${Math.round(14 * s)}px ${FONT}`
    g.fillStyle = TEXT
    g.fillText(ui().consoles.noVisitsYet, 16 * s, 70 * s)
  }
  visited.forEach(([id, at], i) => row(g, s, 16 * s, (64 + i * 28) * s, bodies.get(id)?.name ?? id, at ? formatDate(new Date(at)) : '—', i === 0 ? AMBER : TEXT, w / s - 36))
  g.font = `${Math.round(12 * s)}px ${FONT}`
  g.fillStyle = CYAN
  g.fillText(`${ui().consoles.titles} ${stamps.titles.length}`, 16 * s, h - 14 * s)
}

function clock(g: CanvasRenderingContext2D, w: number, h: number) {
  const s = frame(g, w, h, ui().consoles.timeTitle, 'CHR 11')
  const d = simDate(sim.time)
  g.fillStyle = AMBER
  g.font = `600 ${Math.round(54 * s)}px ${MONO}`
  g.fillText(d.toTimeString().slice(0, 8), 16 * s, 118 * s)
  g.fillStyle = TEXT
  g.font = `${Math.round(18 * s)}px ${FONT}`
  g.fillText(formatDate(d), 16 * s, 154 * s)
  const rate = useStore.getState().timeScale
  g.font = `${Math.round(13 * s)}px ${FONT}`
  g.fillStyle = CYAN
  g.fillText(`${ui().consoles.timeRate}: ${rate === 0 ? ui().consoles.timeStopped : `×${fmt(rate * 3600, 0)}`}`, 16 * s, 196 * s)
}

function sign(g: CanvasRenderingContext2D, w: number, h: number, n: number) {
  g.fillStyle = BG
  g.fillRect(0, 0, w, h)
  g.fillStyle = AMBER
  g.font = `600 ${Math.round(h * 0.42)}px ${FONT}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(`${ui().consoles.lift} ${n}`, w / 2, h / 2)
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
}

/** 机やひじ掛けの小さな画面：ボタンの並びが、ときどき点く */
function deco(g: CanvasRenderingContext2D, w: number, h: number, time: number, seed: number) {
  g.fillStyle = BG
  g.fillRect(0, 0, w, h)
  const cols = 6
  const rows = 4
  const bw = (w - 20) / cols
  const bh = (h - 20) / rows
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const k = Math.sin(seed * 12.9 + i * 78.2 + j * 37.7) * 43758.5
      const on = (k - Math.floor(k) + time * 0.05 * ((i + j) % 3)) % 1 > 0.55
      g.fillStyle = on ? ((i + j + seed) % 5 === 0 ? AMBER : CYAN) : CYAN_FAINT
      g.fillRect(10 + i * bw + 3, 10 + j * bh + 3, bw - 6, bh - 6)
    }
}
