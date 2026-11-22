import { create } from 'zustand'
import * as THREE from 'three'
import { PLANETS } from '../data/bodies'
import { dateMs, PROBES, RYUGU, RYUGU_ID, type Probe } from '../data/probes'
import { daysAt, EPOCH_MS, planetPosition, simTimeAt, trueAnomaly } from '../data/ephemeris'
import { encounterPlanet, heliocentric, loadSamples, nearestEncounter, trajectoryStart, type Trajectory } from '../data/trajectory'
import { sim } from './registry'
import { useStore } from './store'
import { useQuiz } from './quiz'

// 探査機の旅の再生：その日の本当の位置に惑星を動かしながら、探査機の道すじをたどる。
// 道すじは「天文単位の空間」（太陽から1天文単位＝1、向きは画面と同じ軸）で作り、描くときに今の並べ方の距離に直す

const DEG = Math.PI / 180
const DAY_MS = 86_400_000
const YEAR_MS = 365.25 * DAY_MS
/** できごとの日に来たら、説明を読めるように少し止まる（秒） */
const HOLD_SECONDS = 2.2

type ProbeState = {
  open: boolean
  probeId: string | null
  playing: boolean
  /** 最後に過ぎたできごと（-1 はまだ） */
  event: number
  finished: boolean
  /** 道すじの本物の値（別のファイル）を読み込んだ回数。増えたら道すじを描き直す */
  samples: number
}

export const useProbes = create<ProbeState>(() => ({ open: false, probeId: null, playing: false, event: -1, finished: false, samples: 0 }))

/** 再生中の時計（毎フレーム進めるので React の外） */
export const probeClock = { ms: 0, hold: 0 }
/** 開く前のシミュレーションの時間（閉じたら戻す） */
let savedTime = 0

export const probeById = (id: string | null) => PROBES.find((p) => p.id === id) ?? null
export const endMs = (probe: Probe) => (probe.end ? dateMs(probe.end) : EPOCH_MS)

export function openProbes() {
  useQuiz.setState({ open: false })
  const s = useStore.getState()
  if (document.pointerLockElement) document.exitPointerLock()
  if (!useProbes.getState().open) savedTime = sim.time
  s.setLogOpen(false)
  s.setAutopilot(false)
  s.setMode('map')
  useProbes.setState({ open: true, probeId: null, playing: false, event: -1, finished: false })
}

export function closeProbes() {
  if (!useProbes.getState().open) return
  sim.time = savedTime
  useProbes.setState({ open: false, probeId: null, playing: false })
}

/** 探査機を選んで、打ち上げの日から再生する */
export function playProbe(id: string) {
  const probe = probeById(id)
  if (!probe) return
  probeClock.ms = probe.trajectory ? trajectoryStart(probe.trajectory) : dateMs(probe.stops[0].date)
  probeClock.hold = 0
  useProbes.setState({ probeId: id, playing: true, event: -1, finished: false })
  // 土星を回ったカッシーニの13年分などは別のファイル。打ち上げから着くまでのあいだに読み込む
  if (probe.trajectory?.encounters.some((e) => e.samples))
    loadSamples(probe.trajectory, import.meta.env.BASE_URL).then(() => useProbes.setState((s) => ({ samples: s.samples + 1 })))
}

export function togglePlay() {
  const p = useProbes.getState()
  if (!p.probeId) return
  if (p.finished) playProbe(p.probeId)
  else useProbes.setState({ playing: !p.playing })
}

/** 毎フレーム呼ぶ。再生中ならシミュレーションの時間（その日の惑星の位置）を返す */
export function advanceProbe(delta: number): number | null {
  const p = useProbes.getState()
  const probe = p.open ? probeById(p.probeId) : null
  if (!probe) return null
  if (p.playing && !p.finished) {
    if (probeClock.hold > 0) probeClock.hold -= delta
    else {
      const lastStop = dateMs(probe.stops[probe.stops.length - 1].until ?? probe.stops[probe.stops.length - 1].date)
      const pace = probeClock.ms < lastStop ? probe.pace.slow : probe.pace.fast
      let next = probeClock.ms + delta * (probe.trajectory ? encounterPace(probe.trajectory, probeClock.ms, pace) * DAY_MS : pace * YEAR_MS)
      // 次のできごとの日で止まる（日付を先へ飛ばしたときは、飛ばしたできごとは止まらずに過ぎる）
      let event = p.event
      while (event + 1 < probe.events.length && dateMs(probe.events[event + 1].date) < probeClock.ms) event++
      const upcoming = probe.events[event + 1]
      if (upcoming && next >= dateMs(upcoming.date)) {
        // 本物の道すじでは、惑星のそばはゆっくり進めて字幕で説明するので、止まらない
        const flyby = probe.trajectory && Math.abs(nearestEncounter(probe.trajectory, dateMs(upcoming.date)).days) < 1.5
        if (!flyby) {
          next = dateMs(upcoming.date)
          probeClock.hold = HOLD_SECONDS
        }
        event++
      }
      if (event !== p.event) useProbes.setState({ event })
      const end = endMs(probe)
      if (next >= end) {
        next = end
        useProbes.setState({ finished: true, playing: false })
      }
      probeClock.ms = next
    }
  }
  return simTimeAt(probeClock.ms)
}

/** 惑星のそばでは、ゆっくり進める速さ（日／秒）。最接近までの日数に比べて進み、近いほど遅く（近づくのにも離れるのにも十数秒） */
const RAMP_SECONDS = 2.2
const MIN_DAYS_PER_SECOND: Record<string, number> = { earth: 0.03, neptune: 0.04 }
/** 小惑星の表面へ降りる瞬間の速さ（日／秒）。1秒に約6分 */
const DIP_DAYS_PER_SECOND = 0.004
const MOMENT_RAMP_SECONDS = 1.2
export function encounterPace(t: Trajectory, ms: number, yearsPerSecond: number) {
  const { encounter, days } = nearestEncounter(t, ms)
  const base = yearsPerSecond * 365.25
  const min = MIN_DAYS_PER_SECOND[encounter.body] ?? 0.08
  if (encounter.until !== undefined && days === 0) {
    // とどまるあいだ（はやぶさ2とリュウグウ）：着いたとき・離れるときの前後はゆっくり、表面へ降りるときは、もっとゆっくり
    const edge = Math.min(ms - encounter.ms, encounter.until - ms) / DAY_MS
    let pace = Math.max(min, edge / RAMP_SECONDS)
    for (const d of encounter.hover?.dips ?? []) pace = Math.min(pace, Math.max(DIP_DAYS_PER_SECOND, Math.abs(ms - d.ms) / DAY_MS / RAMP_SECONDS))
    // 見どころ（ホイヘンスの切りはなしなど）は、もっと早くからゆっくりにはしない（13年を見せるので、近づくのは手早く）
    for (const m of encounter.moments ?? []) pace = Math.min(pace, Math.max(m.pace, Math.abs(ms - m.ms) / DAY_MS / MOMENT_RAMP_SECONDS))
    return Math.min(base, pace)
  }
  return Math.min(base, Math.max(min, Math.abs(days) / RAMP_SECONDS))
}

/** その日に飛ばす（できごとの一覧を押したとき）。惑星の通過なら、少し手前から */
export function seekProbe(ms: number) {
  const p = useProbes.getState()
  const probe = probeById(p.probeId)
  if (!probe) return
  const t = probe.trajectory
  const enc = t ? nearestEncounter(t, ms) : null
  // とどまるあいだのできごと（タッチダウンなど）は、その2日前から
  const stay = enc && enc.encounter.until !== undefined && enc.days === 0 && ms - enc.encounter.ms > 2 * DAY_MS
  const at = stay ? ms - 2 * DAY_MS : enc && Math.abs(enc.days) < 1.5 ? enc.encounter.ms - 25 * DAY_MS : ms
  probeClock.ms = Math.max(t ? trajectoryStart(t) : dateMs(probe.stops[0].date), Math.min(at, endMs(probe)))
  probeClock.hold = 0
  let event = -1
  while (event + 1 < probe.events.length && dateMs(probe.events[event + 1].date) <= probeClock.ms) event++
  useProbes.setState({ event, finished: false, playing: true })
}

// ---- 道すじ ----

/** リュウグウの位置（天文単位の空間）。楕円軌道で、少し傾いている */
export function ryuguAu(ms: number, out = new THREE.Vector3()) {
  const n = 360 / RYUGU.periodDays
  const M = (RYUGU.M + n * (daysAt(ms) - daysAt(dateMs(RYUGU.epoch)))) * DEG
  const { nu, E } = trueAnomaly(M, RYUGU.e)
  const r = RYUGU.a * (1 - RYUGU.e * Math.cos(E))
  const u = RYUGU.peri * DEG + nu
  const node = RYUGU.node * DEG
  const i = RYUGU.i * DEG
  // 黄道の座標（x, y, z）を、画面の軸（x, 上, -y）に
  const x = r * (Math.cos(node) * Math.cos(u) - Math.sin(node) * Math.sin(u) * Math.cos(i))
  const y = r * (Math.sin(node) * Math.cos(u) + Math.cos(node) * Math.sin(u) * Math.cos(i))
  const z = r * Math.sin(u) * Math.sin(i)
  return out.set(x, z, -y)
}

/** その日の天体の位置（天文単位の空間） */
export function bodyAu(id: string, ms: number, out = new THREE.Vector3()) {
  if (id === RYUGU_ID) return ryuguAu(ms, out)
  const planet = PLANETS.find((p) => p.id === id)
  return planet ? planetPosition(planet, planet.distanceAu, simTimeAt(ms), out) : out.set(0, 0, 0)
}

export type PathPoint = { ms: number; p: THREE.Vector3 }

const lonOf = (v: THREE.Vector3) => Math.atan2(-v.z, v.x)

/** 太陽のまわりの弧で2点をつなぐ。何周するかは、ケプラーの法則でのおおよその速さに近いものを選ぶ */
function arc(a: THREE.Vector3, ta: number, b: THREE.Vector3, tb: number, out: PathPoint[]) {
  const ra = a.length()
  const rb = b.length()
  const ha = a.y / ra
  const hb = b.y / rb
  const la = lonOf(a)
  let d = (((lonOf(b) - la) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const days = (tb - ta) / DAY_MS
  const expected = (2 * Math.PI * days) / (365.25 * ((ra + rb) / 2) ** 1.5)
  d += 2 * Math.PI * Math.max(0, Math.round((expected - d) / (2 * Math.PI)))
  const steps = Math.min(400, Math.max(24, Math.round(days / 4)))
  for (let k = 1; k <= steps; k++) {
    const s = k / steps
    const r = ra + (rb - ra) * s
    const l = la + d * s
    const h = ha + (hb - ha) * s
    const c = Math.sqrt(Math.max(0, 1 - h * h))
    out.push({ ms: ta + (tb - ta) * s, p: new THREE.Vector3(Math.cos(l) * c * r, h * r, -Math.sin(l) * c * r) })
  }
}

/** 探査機の道すじ（天文単位の空間）。打ち上げから再生の終わりまで */
export function probePath(probe: Probe): PathPoint[] {
  if (probe.trajectory) return realPath(probe, probe.trajectory)
  const out: PathPoint[] = []
  const stops = probe.stops
  const first = dateMs(stops[0].date)
  out.push({ ms: first, p: bodyAu(stops[0].body, first) })
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i]
    const at = dateMs(stop.date)
    if (i > 0) {
      const prev = out[out.length - 1]
      arc(prev.p, prev.ms, bodyAu(stop.body, at), at, out)
    }
    // 天体と一緒に動くあいだ（5日おき）
    if (stop.until) {
      const until = dateMs(stop.until)
      for (let t = at + 5 * DAY_MS; t < until; t += 5 * DAY_MS) out.push({ ms: t, p: bodyAu(stop.body, t) })
      out.push({ ms: until, p: bodyAu(stop.body, until) })
    }
  }
  // 最後の天体のあとは、まっすぐ
  if (probe.escape) {
    const { lon, lat, auPerYear } = probe.escape
    const dir = new THREE.Vector3(Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.sin(lat * DEG), -Math.cos(lat * DEG) * Math.sin(lon * DEG))
    const start = out[out.length - 1]
    const end = endMs(probe)
    for (let t = start.ms + 30 * DAY_MS; t < end + 30 * DAY_MS; t += 30 * DAY_MS) {
      const ms = Math.min(t, end)
      out.push({ ms, p: start.p.clone().addScaledVector(dir, (auPerYear * (ms - start.ms)) / YEAR_MS) })
    }
  }
  return out
}

/** 道すじの上の、その日の位置（点と点のあいだは直線でつなぐ）。index は過ぎた点の数 */
export function pathAt(path: PathPoint[], ms: number, out: THREE.Vector3) {
  let i = 1
  while (i < path.length && path[i].ms < ms) i++
  if (i >= path.length) return { index: path.length, point: out.copy(path[path.length - 1].p) }
  const a = path[i - 1]
  const b = path[i]
  const k = b.ms > a.ms ? (ms - a.ms) / (b.ms - a.ms) : 1
  return { index: i, point: out.lerpVectors(a.p, b.p, Math.min(1, Math.max(0, k))) }
}

/** 今の、太陽からの本物の距離（天文単位） */
export function realDistanceNow(probe: Probe) {
  if (probe.trajectory && !probe.end) return heliocentric(probe.trajectory, EPOCH_MS).r.reduce((a, x) => a + x * x, 0) ** 0.5
  const d = probe.distance
  return d ? d.au + (d.auPerYear * (EPOCH_MS - dateMs(d.date))) / YEAR_MS : null
}

// ---- 本物の道すじ（JPL Horizons の値から） ----

/** 黄道座標（x, y, z）を、画面の軸（x, 上, -y）に */
export const eclipticToScreen = (r: number[], out = new THREE.Vector3()) => out.set(r[0], r[2], -r[1])

/**
 * アプリの惑星は、円の軌道に、本物の方向で並べている（本物の軌道は少しゆがんで傾いている）。
 * 探査機が画面の惑星のところを通るように、通過のたびに「画面の惑星 − 本物の惑星」のずれを測り、
 * そのあいだは時間でなめらかにつなげて足す（ずれは太陽からの距離の数％）
 */
const offsets = new WeakMap<Trajectory, { ms: number; d: THREE.Vector3 }[]>()
function offsetAt(t: Trajectory, ms: number, out: THREE.Vector3) {
  let list = offsets.get(t)
  if (!list) {
    // とどまる天体（リュウグウ）は、着いた日と離れた日の両方で合わせる
    list = t.encounters.flatMap((e) =>
      [e.ms, ...(e.until !== undefined ? [e.until] : [])].map((ms) => ({ ms, d: bodyAu(e.body, ms).sub(eclipticToScreen(encounterPlanet(e, ms).r)) })),
    )
    offsets.set(t, list)
  }
  if (ms <= list[0].ms) return out.copy(list[0].d)
  for (let i = 1; i < list.length; i++) {
    if (ms <= list[i].ms) {
      const k = (ms - list[i - 1].ms) / (list[i].ms - list[i - 1].ms)
      return out.lerpVectors(list[i - 1].d, list[i].d, k * k * (3 - 2 * k))
    }
  }
  return out.copy(list[list.length - 1].d)
}

const shift = new THREE.Vector3()
/** 本物の道すじの、その日の位置（天文単位の空間、画面の惑星に合わせたもの） */
export function realProbeAu(t: Trajectory, ms: number, out = new THREE.Vector3()) {
  return eclipticToScreen(heliocentric(t, ms).r, out).add(offsetAt(t, ms, shift))
}

function realPath(probe: Probe, t: Trajectory): PathPoint[] {
  const out: PathPoint[] = []
  const end = endMs(probe)
  const last = t.encounters[t.encounters.length - 1].ms
  let ms = trajectoryStart(t)
  while (ms < end) {
    out.push({ ms, p: realProbeAu(t, ms) })
    const near = nearestEncounter(t, ms)
    const days = Math.abs(near.days)
    // とどまるあいだ：降りていく小惑星は細かく、土星を回るあいだは1日おき
    const enc = near.encounter
    const stay = days === 0 && enc.until !== undefined && !enc.hover
    const step = stay ? 1 : days < 3 ? 0.05 : days < 40 ? 1 : ms < last + YEAR_MS ? 4 : 30
    ms += step * DAY_MS
  }
  out.push({ ms: end, p: realProbeAu(t, end) })
  return out
}
