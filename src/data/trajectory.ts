// 本物の探査機の道すじ（NASA JPL Horizons の値から）。
// 値は「ところどころの位置と速度」だけを持ち、そのあいだはケプラーの法則（重力が1つだけのときの動き）で進める。
//  ・ふだんは太陽の重力だけ（30日おきの値から進めるので、木星などに引かれるずれは小さい）
//  ・惑星のそばでは、その惑星の重力で曲がる道（双曲線）を、最接近の本物の位置と速度から進める
//  ・その境目は、なめらかにまぜる
// 座標は黄道（J2000）。x は春分の方向、z は黄道の北。

export type Encounter = {
  /** 惑星の id（data/bodies の PLANETS） */
  body: string
  /** 最接近の時刻（打ち上げは、Horizons に値がある最初の時刻） */
  ms: number
  /** 惑星の重力の強さ GM（km³/s²） */
  gm: number
  /** 惑星の重力で進める範囲（日、前後） */
  window: number
  /** 惑星中心から見た探査機の位置（km）と速度（km/s） */
  rel: number[]
  /** 惑星の、太陽中心の位置（天文単位）と速度（天文単位／日） */
  planet: number[]
  /** 天体のそばにとどまる（はやぶさ2とリュウグウ）：ms から until まで。そのあいだは hover の位置 */
  until?: number
  /** とどまるあいだ：天体の中心から太陽の側へ km の上空にいて、dips の時刻に表面まで降りる（タッチダウン） */
  hover?: { km: number; surfaceKm: number; dips: { ms: number; hours: number }[] }
  /** 着く前・離れたあとの、天体から見た位置の表（Horizons の値、km）。start から step ごと、「x,y,z;…」 */
  table?: { start: number; step: number; km: string }
  /**
   * 天体から見た探査機（と衛星）の本物の位置と速度（Horizons の値）。大きいので、別のファイル（public の下のパス）から、
   * 旅を選んだときに読み込む（loadSamples）。読み込むまでは、とどまるあいだも rel の位置にいることにする
   */
  samples?: string
  /** とどまるあいだの見どころ（ホイヘンスの切りはなしなど）：前後 days 日は字幕を出し、その瞬間に向けて pace（日／秒）までゆっくりに */
  moments?: Moment[]
}

export type Moment = { ms: number; days: number; pace: number }

export type Trajectory = {
  anchors: string
  encounters: Encounter[]
}

export const AU_KM = 149_597_870.7
const DAY_S = 86_400
const DAY_MS = 86_400_000
/** 太陽の GM（天文単位³／日²） */
export const GM_SUN_AU_DAY = 2.959122082855911e-4

type Vec = [number, number, number]
export type State = { r: Vec; v: Vec }

/** ストゥンプ関数 C(z)・S(z)（楕円・放物線・双曲線をひとつの式で扱うため） */
function stumpff(z: number) {
  if (z > 1e-6) {
    const s = Math.sqrt(z)
    return { C: (1 - Math.cos(s)) / z, S: (s - Math.sin(s)) / (s * s * s) }
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z)
    return { C: (Math.cosh(s) - 1) / -z, S: (Math.sinh(s) - s) / (s * s * s) }
  }
  return { C: 1 / 2 - z / 24, S: 1 / 6 - z / 120 }
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: Vec) => Math.sqrt(dot(a, a))

/** ケプラーの法則で dt だけ進める（普遍変数の方法。単位は mu・r・v・dt でそろえる） */
export function propagate(r0: Vec, v0: Vec, dt: number, mu: number, depth = 0): State {
  if (dt === 0) return { r: [...r0], v: [...v0] }
  const r0n = len(r0)
  const vr0 = dot(r0, v0) / r0n
  const alpha = 2 / r0n - dot(v0, v0) / mu
  const sq = Math.sqrt(mu)
  // 最初の見当（Vallado の方法）
  let x: number
  if (alpha > 1e-9) x = sq * dt * alpha
  else if (alpha < -1e-9) {
    const a = 1 / alpha
    const sgn = Math.sign(dt)
    x = sgn * Math.sqrt(-a) * Math.log((-2 * mu * alpha * dt) / (dot(r0, v0) + sgn * Math.sqrt(-mu * a) * (1 - r0n * alpha)))
  } else x = (sq * dt) / r0n
  if (!Number.isFinite(x)) x = (sq * dt) / r0n
  let converged = false
  for (let i = 0; i < 60; i++) {
    const z = alpha * x * x
    const { C, S } = stumpff(z)
    const F = ((r0n * vr0) / sq) * x * x * C + (1 - alpha * r0n) * x * x * x * S + r0n * x - sq * dt
    const dF = ((r0n * vr0) / sq) * x * (1 - z * S) + (1 - alpha * r0n) * x * x * C + r0n
    const step = F / dF
    x -= step
    if (Math.abs(step) < 1e-12 * Math.max(1, Math.abs(x))) {
      converged = true
      break
    }
  }
  // 遠くから近づく双曲線などで、最初の見当が悪くて解けないときは、半分ずつに分けて進める
  if ((!converged || !Number.isFinite(x)) && depth < 12) {
    const half = propagate(r0, v0, dt / 2, mu, depth + 1)
    return propagate(half.r, half.v, dt / 2, mu, depth + 1)
  }
  const z = alpha * x * x
  const { C, S } = stumpff(z)
  const f = 1 - ((x * x) / r0n) * C
  const g = dt - (x * x * x * S) / sq
  const r: Vec = [f * r0[0] + g * v0[0], f * r0[1] + g * v0[1], f * r0[2] + g * v0[2]]
  const rn = len(r)
  const df = (sq / (rn * r0n)) * (alpha * x * x * x * S - x)
  const dg = 1 - ((x * x) / rn) * C
  return { r, v: [df * r0[0] + dg * v0[0], df * r0[1] + dg * v0[1], df * r0[2] + dg * v0[2]] }
}

type Anchor = { ms: number; r: Vec; v: Vec }

const parsed = new WeakMap<Trajectory, Anchor[]>()
function anchorsOf(t: Trajectory) {
  let list = parsed.get(t)
  if (!list) {
    list = t.anchors.split(';').map((row) => {
      const n = row.split(',').map(Number)
      return { ms: n[0] * 1000, r: [n[1] * 1e-6, n[2] * 1e-6, n[3] * 1e-6] as Vec, v: [n[4] * 1e-9, n[5] * 1e-9, n[6] * 1e-9] as Vec }
    })
    parsed.set(t, list)
  }
  return list
}

/** 道すじの始まり（Horizons に値がある最初の時刻） */
export const trajectoryStart = (t: Trajectory) => t.encounters[0].ms

/** その時刻の惑星の太陽中心の位置と速度（最接近のときの本物の値から、太陽の重力で進める） */
export function encounterPlanet(e: Encounter, ms: number): State {
  return propagate(e.planet.slice(0, 3) as Vec, e.planet.slice(3, 6) as Vec, (ms - e.ms) / DAY_MS, GM_SUN_AU_DAY)
}

/** 惑星中心から見た探査機（km、km/s）。最接近の値から、惑星の重力で進める */
export function encounterRelative(e: Encounter, ms: number): State {
  if (e.until !== undefined && e.hover && ms >= e.ms && ms <= e.until) return hoverRelative(e, ms)
  const track = e.samples ? sampleTracks(e.samples)?.probe : undefined
  const fromSamples = track && trackAt(track, ms, e.gm)
  if (fromSamples) return fromSamples
  const fromTable = e.table && tableAt(e, ms)
  if (fromTable) return fromTable
  // 本物の値を読み込むまで（とどまるあいだ）は、着いたときの位置のまま
  if (e.until !== undefined && ms >= e.ms) return { r: e.rel.slice(0, 3) as Vec, v: [0, 0, 0] }
  return propagate(e.rel.slice(0, 3) as Vec, e.rel.slice(3, 6) as Vec, (ms - e.ms) / 1000, e.gm)
}

// ---- 別のファイルの、本物の位置と速度（samples） ----

/** 時刻（ミリ秒）と、その時刻の位置（km）・速度（km/s）を6つずつ */
export type Track = { t: Float64Array; s: Float64Array }
const trackFiles = new Map<string, Record<string, Track>>()
const loading = new Map<string, Promise<void>>()

/**
 * ファイルの形：{ 名前: "秒,x,y,z,vx,vy,vz;…" } か { 名前: { start: 秒, step: 秒, rows: "x,y,z,vx,vy,vz;…" } }。
 * 位置は km、速度は m/s の整数（小さくするため）。探査機自身は probe、ほかは衛星など
 */
export function setSamples(url: string, json: Record<string, string | { start: number; step: number; rows: string }>) {
  const out: Record<string, Track> = {}
  for (const [name, v] of Object.entries(json)) {
    const rows = (typeof v === 'string' ? v : v.rows).split(';')
    const t = new Float64Array(rows.length)
    const s = new Float64Array(rows.length * 6)
    rows.forEach((row, i) => {
      const n = row.split(',').map(Number)
      const o = typeof v === 'string' ? 1 : 0
      t[i] = (typeof v === 'string' ? n[0] : v.start + i * v.step) * 1000
      for (let k = 0; k < 3; k++) {
        s[i * 6 + k] = n[o + k]
        s[i * 6 + 3 + k] = n[o + 3 + k] / 1000
      }
    })
    out[name] = { t, s }
  }
  trackFiles.set(url, out)
}

/** 読み込んだ値（まだなら null） */
export const sampleTracks = (url: string) => trackFiles.get(url) ?? null

/** 道すじの samples を読み込む（済んでいれば、すぐ終わる） */
export function loadSamples(t: Trajectory, base = ''): Promise<void> {
  const urls = t.encounters.flatMap((e) => (e.samples && !trackFiles.has(e.samples) ? [e.samples] : []))
  return Promise.all(
    urls.map((url) => {
      let p = loading.get(url)
      if (!p) {
        p = fetch(base + url)
          .then((r) => r.json())
          .then((json) => setSamples(url, json))
          .catch(() => {
            // 読めなかったら、次に選んだときにもう一度
            loading.delete(url)
          })
        loading.set(url, p)
      }
      return p!
    }),
  ).then(() => undefined)
}

/** その時刻の位置と速度：前と後ろの値の両方から、天体の重力（gm）で進めて、なめらかにまぜる。範囲の外は null */
export function trackAt(track: Track, ms: number, gm: number): State | null {
  const { t, s } = track
  if (ms < t[0] || ms > t[t.length - 1]) return null
  let lo = 0
  let hi = t.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (t[mid] <= ms) lo = mid
    else hi = mid
  }
  const go = (i: number) => propagate([s[i * 6], s[i * 6 + 1], s[i * 6 + 2]], [s[i * 6 + 3], s[i * 6 + 4], s[i * 6 + 5]], (ms - t[i]) / 1000, gm)
  if (ms === t[lo]) return go(lo)
  const a = go(lo)
  const b = go(hi)
  const w = smooth(t[lo], t[hi], ms)
  const mix = (x: Vec, y: Vec): Vec => [x[0] + (y[0] - x[0]) * w, x[1] + (y[1] - x[1]) * w, x[2] + (y[2] - x[2]) * w]
  return { r: mix(a.r, b.r), v: mix(a.v, b.v) }
}

const tables = new WeakMap<Encounter, Vec[]>()
/** 表の位置（点と点のあいだは直線）。速度は、となりの点との差から */
function tableAt(e: Encounter, ms: number): State | null {
  const t = e.table!
  let rows = tables.get(e)
  if (!rows) {
    rows = t.km.split(';').map((r) => r.split(',').map(Number) as Vec)
    tables.set(e, rows)
  }
  const f = (ms - t.start) / t.step
  if (f < 0 || f > rows.length - 1) return null
  const i = Math.min(rows.length - 2, Math.floor(f))
  const k = f - i
  const a = rows[i]
  const b = rows[i + 1]
  const dt = t.step / 1000
  return {
    r: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k],
    v: [(b[0] - a[0]) / dt, (b[1] - a[1]) / dt, (b[2] - a[2]) / dt],
  }
}

/** とどまるあいだの位置：太陽の側の上空。着いてすぐ・離れる前の5日は、表の位置からなめらかにつなぐ。タッチダウンでは表面まで降りる */
function hoverRelative(e: Encounter, ms: number): State {
  const h = e.hover!
  const p = encounterPlanet(e, ms).r
  const n = len(p)
  const sun: Vec = [-p[0] / n, -p[1] / n, -p[2] / n]
  let dip = 0
  for (const d of h.dips) dip = Math.max(dip, Math.exp(-(((ms - d.ms) / (d.hours * 3_600_000)) ** 2)))
  const height = h.surfaceKm + (h.km - h.surfaceKm) * (1 - dip)
  const r: Vec = [sun[0] * height, sun[1] * height, sun[2] * height]
  const blendDays = 5
  const edge = Math.min((ms - e.ms) / DAY_MS, (e.until! - ms) / DAY_MS)
  if (e.table && edge < blendDays) {
    const at = tableAt(e, (ms - e.ms) / DAY_MS < blendDays ? e.ms : e.until!)
    if (at) {
      const w = smooth(0, blendDays, edge)
      for (let i = 0; i < 3; i++) r[i] = at.r[i] + (r[i] - at.r[i]) * w
    }
  }
  return { r, v: [0, 0, 0] }
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

/** 太陽の重力だけで進めた位置：同じ区間（惑星と惑星のあいだ）の、いちばん近い値から */
function cruise(t: Trajectory, ms: number): State {
  const list = anchorsOf(t)
  const enc = t.encounters
  let leg = 0
  while (leg + 1 < enc.length && enc[leg + 1].ms <= ms) leg++
  const from = enc[leg]
  const to = enc[leg + 1]
  const lo = (from.until ?? from.ms) + from.window * DAY_MS
  const hi = to ? to.ms - to.window * DAY_MS : Infinity
  // 前と後ろの値の両方から太陽の重力で進め、なめらかにまぜる（イオンエンジンで加速しているときも、つなぎ目で飛ばない）
  let before: Anchor | null = null
  let after: Anchor | null = null
  for (const a of list) {
    if (a.ms < lo || a.ms > hi) continue
    if (a.ms <= ms && (!before || a.ms > before.ms)) before = a
    if (a.ms > ms && (!after || a.ms < after.ms)) after = a
  }
  const go = (a: Anchor) => propagate(a.r, a.v, (ms - a.ms) / DAY_MS, GM_SUN_AU_DAY)
  if (before && after) {
    const w = smooth(before.ms, after.ms, ms)
    const a = go(before)
    const b = go(after)
    const mix = (x: Vec, y: Vec): Vec => [x[0] + (y[0] - x[0]) * w, x[1] + (y[1] - x[1]) * w, x[2] + (y[2] - x[2]) * w]
    return { r: mix(a.r, b.r), v: mix(a.v, b.v) }
  }
  const best = before ?? after ?? list.reduce((b, a) => (Math.abs(a.ms - ms) < Math.abs(b.ms - ms) ? a : b))
  return go(best)
}

/** 惑星のそばでの位置（太陽中心、天文単位・天文単位／日） */
function near(e: Encounter, ms: number): State {
  const p = encounterPlanet(e, ms)
  const q = encounterRelative(e, ms)
  return {
    r: [p.r[0] + q.r[0] / AU_KM, p.r[1] + q.r[1] / AU_KM, p.r[2] + q.r[2] / AU_KM],
    v: [p.v[0] + (q.v[0] * DAY_S) / AU_KM, p.v[1] + (q.v[1] * DAY_S) / AU_KM, p.v[2] + (q.v[2] * DAY_S) / AU_KM],
  }
}

/** いちばん近い惑星の通過（打ち上げを含む）と、そこからの日数 */
export function nearestEncounter(t: Trajectory, ms: number) {
  let best = t.encounters[0]
  let days = encounterDays(best, ms)
  for (const e of t.encounters) {
    const d = encounterDays(e, ms)
    if (Math.abs(d) < Math.abs(days)) {
      best = e
      days = d
    }
  }
  return { encounter: best, days }
}

/** 通過からの日数（とどまるあいだは 0、着く前は負、離れたあとは正） */
export function encounterDays(e: Encounter, ms: number) {
  if (ms < e.ms) return (ms - e.ms) / DAY_MS
  return e.until !== undefined && ms <= e.until ? 0 : (ms - (e.until ?? e.ms)) / DAY_MS
}

/** その時刻の探査機の、太陽中心の位置（天文単位）と速度（天文単位／日）。黄道座標 */
export function heliocentric(t: Trajectory, ms: number): State {
  ms = Math.max(ms, trajectoryStart(t))
  const { encounter, days } = nearestEncounter(t, ms)
  const w = 1 - smooth(encounter.window * 0.5, encounter.window, Math.abs(days))
  if (w >= 1) return near(encounter, ms)
  const c = cruise(t, ms)
  if (w <= 0) return c
  const n = near(encounter, ms)
  const mix = (a: Vec, b: Vec): Vec => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w]
  return { r: mix(c.r, n.r), v: mix(c.v, n.v) }
}

/** 太陽から見た速さ（km/s） */
export const speedKmS = (s: State) => (len(s.v) * AU_KM) / DAY_S
