import * as THREE from 'three'

// 月ミッション（アポロ17号の追体験）第2弾の物理：月の裏での減速（LOI）と、着陸船の動力降下。
// 画面や操作には関わらない、数字だけの計算。単位は m・秒・kg。
//
// 月の中心を原点にした 3 次元。向きは components/flight/moonGlobe.ts と同じ（y が北極、x が経度 0 = 地球の側、
// 経度は東が -z へ回る向き）。月の自転（赤道で 4.6 m/s）は小さいので無視して、月は止まっているとする。
//
// 降下の誘導は本物のアポロの考え方と同じ：「ある時刻に、ある位置・速さ・加速度になる」ように、加速度を時間の 2 次式で
// 毎回引き直す（P63 制動 → P64 接近 → P66 手動）。地面の高さは外から渡す（場面では本物の地形、テストでは平ら）。

export const MU_MOON = 4.9048695e12
/** moonGlobe.ts の MOON_R と同じ */
export const R_MOON = 1_737_400
export const G0 = 9.80665

/** 着陸地点（アポロ17号の着陸船の場所。地形の地図 moon_taurus の中心から東へ 155 m・北へ 140 m） */
export const SITE_LAT = 20.18629
export const SITE_LON = 30.76622
export const LM_SPOT = { east: 155.4, north: 140.1 }

/** 降下用エンジン（DPS）：最大 45 kN。65〜92.5% のあいだは使えない（エンジンを傷めないため）。最大は 92.5% */
export const DPS = { max: 45_040, ftp: 0.925, high: 0.65, low: 0.1, isp: 311 }
/** 降下を始めるときの着陸船（チャレンジャー号）の重さと、降下用の推進剤 */
export const LM_MASS = 16_400
export const LM_PROP = 8_600
/** 機械船のエンジン（SPS）と、月に着いたときの司令船＋着陸船の重さ */
export const SPS = { thrust: 91_190, isp: 314 }
export const STACK_MASS = 46_700

/** 足の裏の下に伸びた探り棒（1.7 m）。これが地面に触れると「接地」のランプがつく */
export const PROBE = 1.7

// ---- 向き ----

/** 緯度・経度（度）→ 単位ベクトル（moonGlobe.ts の dirOf と同じ向き） */
export function dirOf(latDeg: number, lonDeg: number, out = new THREE.Vector3()) {
  const lat = THREE.MathUtils.degToRad(latDeg)
  const lon = THREE.MathUtils.degToRad(lonDeg)
  return out.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon))
}

/** 着陸地点の地方の向き：up（真上）、east、north */
export type SiteFrame = { up: THREE.Vector3; east: THREE.Vector3; north: THREE.Vector3 }

export function siteFrame(lat = SITE_LAT, lon = SITE_LON): SiteFrame {
  const up = dirOf(lat, lon)
  const east = new THREE.Vector3(0, 1, 0).cross(up).normalize()
  const north = new THREE.Vector3().crossVectors(up, east).normalize()
  return { up, east, north }
}

/** 地方の平面（東 x・南 z、m）の点 → 月の中心から見た向き（地図を球に貼る、心射図法） */
export function localDir(f: SiteFrame, x: number, z: number, out = new THREE.Vector3()) {
  return out.copy(f.up).multiplyScalar(R_MOON).addScaledVector(f.east, x).addScaledVector(f.north, -z).normalize()
}

/** 向き → 地方の平面（東 x・南 z、m）。着陸地点の側の半球だけ */
export function localXZ(f: SiteFrame, d: THREE.Vector3) {
  const k = d.dot(f.up)
  return { x: (R_MOON * d.dot(f.east)) / k, z: (-R_MOON * d.dot(f.north)) / k }
}

/**
 * 軌道の面：着陸地点の真上を、西へ向かって通る（アポロは東から谷へ入り、太陽を背にして西へ降りた）。
 * 着陸地点をいちばん北の点にするので、傾きは着陸地点の緯度と同じ（20°）。p(θ) = cosθ·P + sinθ·Q、θ = 0 が着陸地点の真上
 */
export function orbitPlane(f: SiteFrame) {
  const P = f.up.clone()
  const Q = f.east.clone().negate()
  const N = new THREE.Vector3().crossVectors(P, Q).normalize()
  return { P, Q, N }
}

export type Plane = ReturnType<typeof orbitPlane>

/** 面の上の角度 θ の向き */
export function planeDir(pl: Plane, th: number, out = new THREE.Vector3()) {
  return out.copy(pl.P).multiplyScalar(Math.cos(th)).addScaledVector(pl.Q, Math.sin(th))
}

/** 面の上の角度（θ）。P から Q の向きへ */
export function planeAngle(pl: Plane, r: THREE.Vector3) {
  return Math.atan2(r.dot(pl.Q), r.dot(pl.P))
}

/** 楕円（または双曲線）の軌道の、ある真近点角での位置と速さ。peri：近月点の θ、rp：近月点の半径、e：離心率 */
export function conicState(pl: Plane, peri: number, rp: number, e: number, nu: number) {
  const p = rp * (1 + e)
  const r = p / (1 + e * Math.cos(nu))
  const th = peri + nu
  const radial = new THREE.Vector3()
  planeDir(pl, th, radial)
  const along = new THREE.Vector3()
  planeDir(pl, th + Math.PI / 2, along)
  const k = Math.sqrt(MU_MOON / p)
  const vr = k * e * Math.sin(nu)
  const vt = k * (1 + e * Math.cos(nu))
  return { r: radial.clone().multiplyScalar(r), v: radial.multiplyScalar(vr).addScaledVector(along, vt) }
}

/** 今の位置と速さから、軌道の近月点・遠月点の高さ（m、月の半径から）。逃げていく軌道なら apo は Infinity */
export function orbitOf(r: THREE.Vector3, v: THREE.Vector3) {
  const rr = r.length()
  const vv = v.lengthSq()
  const energy = vv / 2 - MU_MOON / rr
  const h = _h.crossVectors(r, v).length()
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (MU_MOON * MU_MOON)))
  const p = (h * h) / MU_MOON
  const peri = p / (1 + e) - R_MOON
  const apo = e < 1 ? p / (1 - e) - R_MOON : Infinity
  return { peri, apo, e }
}
const _h = new THREE.Vector3()

export function gravity(r: THREE.Vector3, out: THREE.Vector3) {
  const d = r.length()
  return out.copy(r).multiplyScalar(-MU_MOON / (d * d * d))
}

/** 推力なしで dt 秒すすめる（4 次のルンゲ＝クッタ） */
export function coast(r: THREE.Vector3, v: THREE.Vector3, dt: number) {
  const r0 = _r0.copy(r)
  const v0 = _v0.copy(v)
  const a1 = gravity(r0, _a1)
  const r2 = _r2.copy(r0).addScaledVector(v0, dt / 2)
  const v2 = _v2.copy(v0).addScaledVector(a1, dt / 2)
  const a2 = gravity(r2, _a2)
  const r3 = _r3.copy(r0).addScaledVector(v2, dt / 2)
  const v3 = _v3.copy(v0).addScaledVector(a2, dt / 2)
  const a3 = gravity(r3, _a3)
  const r4 = _r4.copy(r0).addScaledVector(v3, dt)
  const v4 = _v4.copy(v0).addScaledVector(a3, dt)
  const a4 = gravity(r4, _a4)
  r.addScaledVector(v0, dt / 6).addScaledVector(v2, dt / 3).addScaledVector(v3, dt / 3).addScaledVector(v4, dt / 6)
  v.addScaledVector(a1, dt / 6).addScaledVector(a2, dt / 3).addScaledVector(a3, dt / 3).addScaledVector(a4, dt / 6)
}
const [_r0, _v0, _a1, _r2, _v2, _a2, _r3, _v3, _a3, _r4, _v4, _a4] = Array.from({ length: 12 }, () => new THREE.Vector3())

// ---- 月の裏での減速（LOI） -------------------------------------------------------------

/** 月に近づく双曲線の軌道：近月点の高さ 110 km、そこでの速さ 2.48 km/s（月の裏側） */
export const ARRIVE_PERI_ALT = 110_000
export const ARRIVE_PERI_V = 2_480
/** 近月点の θ（軌道の面の角度）：月の裏側（地球からは見えない）で、日の当たっている所 */
export const ARRIVE_PERI_TH = THREE.MathUtils.degToRad(235)
/** 減速を止める：遠月点が 315 km まで下がったら（アポロ17号は 315 km × 97 km の軌道に入った） */
export const LOI_APO = 315_000
/** 本物の LOI は 393 秒、速さを 911 m/s 落とした */

export type Stack = {
  t: number
  r: THREE.Vector3
  v: THREE.Vector3
  m: number
  /** 燃えている */
  burning: boolean
  burnStart: number | null
  burnEnd: number | null
}

/** 近月点の何秒前から始めるか */
export function startArrival(pl: Plane, before = 2 * 3600): Stack {
  const rp = R_MOON + ARRIVE_PERI_ALT
  const e = (ARRIVE_PERI_V * ARRIVE_PERI_V * rp) / MU_MOON - 1
  const s = conicState(pl, ARRIVE_PERI_TH, rp, e, 0)
  // 近月点から時間を戻す
  const step = 5
  for (let t = 0; t < before; t += step) coast(s.r, s.v, -step)
  return { t: -before, r: s.r, v: s.v, m: STACK_MASS, burning: false, burnStart: null, burnEnd: null }
}

/** 減速を始める時刻の手本（近月点の時刻 = 0 から、燃える時間の半分前） */
export const LOI_IDEAL = -200

/** 司令船と着陸船を dt 秒すすめる。燃えているあいだは進む向きの逆へ押す */
export function stepStack(s: Stack, dt: number): 'loiCutoff' | null {
  let ev: 'loiCutoff' | null = null
  const sub = s.burning ? 0.25 : 5
  let left = dt
  while (left > 1e-9) {
    const h = Math.min(sub, left)
    left -= h
    if (s.burning) {
      const a = SPS.thrust / s.m
      _d.copy(s.v).normalize().multiplyScalar(-a * h)
      coast(s.r, s.v, h)
      s.v.add(_d)
      s.m -= (SPS.thrust / (SPS.isp * G0)) * h
      s.t += h
      const o = orbitOf(s.r, s.v)
      if (o.apo < LOI_APO) {
        s.burning = false
        s.burnEnd = s.t
        ev = 'loiCutoff'
      }
    } else {
      coast(s.r, s.v, h)
      s.t += h
    }
  }
  return ev
}
const _d = new THREE.Vector3()

// ---- 着陸船の動力降下 -------------------------------------------------------------------

/** 降下を始める点（PDI）の軌道：近月点 15 km（ここで点火）、遠月点 110 km */
export const PDI_ALT = 15_000
export const DESCENT_APO = 110_000
/** 降下を始める点の θ（着陸地点の 17° 手前、約 515 km）。ここから 12 分半ほどで着く（本物と同じくらい） */
export const PDI_TH = THREE.MathUtils.degToRad(-17)

/** 誘導の目標（着陸地点を原点にした、高さと手前の距離・速さ・加速度） */
type Aim = { alt: number; range: number; vDown: number; vUp: number; aDown: number; aUp: number; jerk: number }
/** 制動の終わり（P63 → P64 に切り替わる「ハイゲート」）：高さ 2.3 km、7.6 km 手前、前へ 140 m/s、下へ 38 m/s */
export const HIGH_GATE: Aim = { alt: 2_300, range: 7_600, vDown: 140, vUp: -38, aDown: -1.1, aUp: 0.3, jerk: 0.01 }
/** 接近の終わり（P64 → P66 に切り替わる「ローゲート」）：高さ 150 m、250 m 手前、前へ 15 m/s、下へ 4.5 m/s */
export const LOW_GATE: Aim = { alt: 150, range: 250, vDown: 15, vUp: -4.5, aDown: -0.35, aUp: 0.1, jerk: 0.05 }
/** 制動・接近にかける時間（s） */
export const BRAKING_TIME = 520
export const APPROACH_TIME = 98

export type DescentMode = 'coast' | 'braking' | 'approach' | 'terminal' | 'contact' | 'landed' | 'abort'

export type DescentEvent =
  | 'pdi'
  | 'landLong'
  | 'throttleDown'
  | 'radar'
  | 'highGate'
  | 'lowGate'
  | 'manual'
  | 'lowFuel'
  | 'call60'
  | 'call30'
  | 'contact'
  | 'touchdown'
  | 'outOfFuel'

export type Ground = (dir: THREE.Vector3) => number

export type Descent = {
  /** 近月点（PDI の点）を通る時刻 = 0 とした時刻（s） */
  t: number
  r: THREE.Vector3
  v: THREE.Vector3
  m: number
  prop: number
  mode: DescentMode
  /** 今の推力（N）・推力の向き（単位ベクトル、着陸船の「上」）・スロットル（0〜1） */
  thrust: number
  dir: THREE.Vector3
  throttle: number
  /** 制動・接近の残り時間（s） */
  tgo: number
  /** 降りる場所（月の中心から、地面の上の点） */
  target: THREE.Vector3
  /** 本物のアポロ17号の着陸船の場所（目標をずらしても、ここからの距離で点をつける） */
  spot: THREE.Vector3
  /** 本物の地面の高さで降りる場所を決めたか（地図を読む前は仮の高さ） */
  groundOk?: boolean
  /** 探り棒が触れた時刻と、そのときの上下の速さ */
  contactAt: number | null
  contactV: number
  /** 進む向き（軌道の面の、着陸地点での向き = 西）。誘導の「前」 */
  track: THREE.Vector3
  /** 地面からの高さ（足の裏、m）・上下の速さ（上が +）・地面に平行な速さ */
  alt: number
  vUp: number
  vSide: number
  /** 降下を始めた時刻（PDI） */
  pdiAt: number | null
  /** 手動（P66）。降りる速さの指示（m/s、下が -） */
  manual: boolean
  vCmd: number
  /** 手動のとき、自動の降りる速さに足す分（m/s、上が +。W/S・ボタンで 0.3 ずつ） */
  trim: number
  /** おまかせ（最後まで自動で降りる） */
  auto: boolean
  /** 着陸レーダーが地面をとらえた */
  radar: boolean
  /** 一度だけの知らせ */
  said: Set<DescentEvent>
  /** 接地した時の、上下・横の速さと傾き（度）、目標からの距離（m） */
  /** vUp：探り棒が触れたときの上下の速さ（操縦のうまさ）、hit：足が着いたときの速さ */
  touch: { vUp: number; hit: number; vSide: number; tilt: number; miss: number; fuel: number } | null
  /** 推進剤の残り（ホバーできる秒数）。「60 秒」「30 秒」の呼びかけは、ここから「ビンゴ」（20 秒）を引いた秒 */
  hover: number
}

export type DescentInput = {
  /** 手動のとき：前（+）・後ろ、右（+）・左（-1〜1） */
  fwd: number
  right: number
  /** 降りる速さの指示を、何段変えたか（1 段 0.3 m/s、上が +）。読んだら 0 に戻す */
  rod: number
  /** 降りる場所を動かす（接近のあいだ、1 回 1 段 = 40 m）。読んだら 0 に戻す */
  lpdFwd: number
  lpdRight: number
}

export const emptyInput = (): DescentInput => ({ fwd: 0, right: 0, rod: 0, lpdFwd: 0, lpdRight: 0 })

/** 降下の軌道の上の、PDI の何秒前からの状態を作る */
export function startDescent(pl: Plane, f: SiteFrame, ground: Ground, before = 600, pdiTh = PDI_TH): Descent {
  const rp = R_MOON + PDI_ALT
  const ra = R_MOON + DESCENT_APO
  const e = (ra - rp) / (ra + rp)
  const s = conicState(pl, pdiTh, rp, e, 0)
  const step = 2
  for (let t = 0; t < before; t += step) coast(s.r, s.v, -step)
  const target = spotOf(f, LM_SPOT.east, -LM_SPOT.north, ground)
  const d: Descent = {
    t: -before,
    r: s.r,
    v: s.v,
    m: LM_MASS,
    prop: LM_PROP,
    mode: 'coast',
    thrust: 0,
    dir: s.v.clone().normalize().negate(),
    throttle: 0,
    tgo: BRAKING_TIME,
    target,
    spot: target.clone(),
    contactAt: null,
    contactV: 0,
    track: pl.Q.clone(),
    alt: 0,
    vUp: 0,
    vSide: 0,
    pdiAt: null,
    manual: false,
    vCmd: -1,
    trim: 0,
    auto: false,
    radar: false,
    said: new Set(),
    touch: null,
    hover: 0,
  }
  measure(d, ground)
  return d
}

/** 地方の平面の点（東 x・南 z）の、地面の上の位置 */
export function spotOf(f: SiteFrame, x: number, z: number, ground: Ground, out = new THREE.Vector3()) {
  localDir(f, x, z, out)
  return out.multiplyScalar(R_MOON + ground(out))
}

/** 降りる場所での向き：up と、進む向き（西）と、右（北） */
function aimFrame(d: Descent) {
  const up = _u.copy(d.target).normalize()
  // 進む向き：軌道の面の中の、着陸地点での進む向き（西）。地面に平行に
  const down = _dn.copy(d.track).addScaledVector(up, -d.track.dot(up)).normalize()
  const right = _rt.crossVectors(down, up).normalize()
  return { up, down, right }
}
const _u = new THREE.Vector3()
const _dn = new THREE.Vector3()
const _rt = new THREE.Vector3()

/** 目標の点・速さ・加速度（月の中心から） */
function aimState(d: Descent, aim: Aim) {
  const { up, down } = aimFrame(d)
  const r = _ar.copy(d.target).addScaledVector(up, aim.alt).addScaledVector(down, -aim.range)
  const v = _av.copy(down).multiplyScalar(aim.vDown).addScaledVector(up, aim.vUp)
  const a = _aa.copy(down).multiplyScalar(aim.aDown).addScaledVector(up, aim.aUp)
  return { r, v, a }
}
const _ar = new THREE.Vector3()
const _av = new THREE.Vector3()
const _aa = new THREE.Vector3()

/**
 * 加速度を時間の 2 次式にして、T 秒後に目標の位置・速さ・加速度になるように引いたときの、今の加速度。
 * a0 = aT − 6(vT − v)/T + 12(rT − r − vT)/T²
 */
function quadraticAccel(d: Descent, aim: Aim, T: number, out: THREE.Vector3) {
  const { r, v, a } = aimState(d, aim)
  const dv = _q1.copy(v).sub(d.v)
  const dp = _q2.copy(r).sub(d.r).addScaledVector(d.v, -T)
  return out.copy(a).addScaledVector(dv, -6 / T).addScaledVector(dp, 12 / (T * T))
}
const _q1 = new THREE.Vector3()
const _q2 = new THREE.Vector3()

/**
 * 目標まであと何秒か（アポロの誘導と同じ考え方）。前向きの成分について「目標で、加加速度（加速度の変わる速さ）が
 * jerk になる」ように残り時間 T を決める：jerk·T³ − 6·aT·T² + (18·vT + 6·v)·T − 24·(rT − r) = 0 をニュートン法で解く。
 * 毎回引き直すので、点火が遅れても早くても、そのぶん強く・弱く減速して合わせる
 */
function timeToGo(d: Descent, aim: Aim, guess: number) {
  const { r } = aimState(d, aim)
  const { down } = aimFrame(d)
  const dp = _t1.copy(r).sub(d.r).dot(down)
  const v0 = d.v.dot(down)
  const j = aim.jerk
  const c2 = -6 * aim.aDown
  const c1 = 18 * aim.vDown + 6 * v0
  const c0 = -24 * dp
  let T = Math.max(2, guess)
  for (let i = 0; i < 12; i++) {
    const f = ((j * T + c2) * T + c1) * T + c0
    const df = (3 * j * T + 2 * c2) * T + c1
    if (Math.abs(df) < 1e-9) break
    const next = T - f / df
    T = next > 0.5 ? next : T * 0.5
    if (Math.abs(f) < 1e-3) break
  }
  return T
}
const _t1 = new THREE.Vector3()

/** 高さ・速さを測りなおす */
function measure(d: Descent, ground: Ground) {
  const up = _m.copy(d.r).normalize()
  d.alt = d.r.length() - R_MOON - ground(up)
  d.vUp = d.v.dot(up)
  d.vSide = Math.sqrt(Math.max(0, d.v.lengthSq() - d.vUp * d.vUp))
  // ホバーに要る推力で、残りの推進剤が何秒もつか
  const g = MU_MOON / d.r.lengthSq()
  d.hover = d.prop / ((d.m * g) / (DPS.isp * G0))
}
const _m = new THREE.Vector3()

/** 呼びかけの「ビンゴ」（ここで降りていなければ、やめて戻る）。60・30 秒はこれの手前 */
export const BINGO = 20

/** PDI の手本の時刻（近月点を通る時刻 = 0）と、押せる窓（早すぎ・遅すぎ）。窓の終わりで自動で点火する */
export const PDI_IDEAL = 0
export const PDI_EARLY = -30
export const PDI_LATE = 12

/** 降下を始める（PDI）。窓の外なら何もしない */
export function ignitePdi(d: Descent) {
  if (d.mode !== 'coast') return false
  d.mode = 'braking'
  d.pdiAt = d.t
  d.tgo = BRAKING_TIME - d.t * 0.95
  d.said.add('pdi')
  return true
}

/** 手で操縦に切り替えられる高さ（m）。これより高いと横の速さが大きすぎて（高さ 2 km で 140 m/s）、手では止めきれない。本物も 100〜150 m で切り替えた */
export const MANUAL_ALT = 300

/** 手動（P66）に切り替える。接近のあいだは、高さ MANUAL_ALT から下で */
export function takeOver(d: Descent) {
  if (d.mode !== 'approach' && d.mode !== 'terminal') return false
  if (d.mode === 'approach' && d.alt > MANUAL_ALT) return false
  d.mode = 'terminal'
  d.manual = true
  d.auto = false
  d.vCmd = THREE.MathUtils.clamp(Math.round(d.vUp / 0.3) * 0.3, -6, 0)
  d.trim = 0
  return true
}

/** 降下の状態の写し（手動に切り替えた所から、もう一度やり直すため） */
export function cloneDescent(d: Descent): Descent {
  return {
    ...d,
    r: d.r.clone(),
    v: d.v.clone(),
    dir: d.dir.clone(),
    target: d.target.clone(),
    spot: d.spot.clone(),
    track: d.track.clone(),
    said: new Set(d.said),
    touch: d.touch ? { ...d.touch } : null,
  }
}

/**
 * 自動の降りる速さ（m/s、下が -）：高さに合わせて、だんだんゆっくり。地面の近くで 1 m/s（本物の接地も 1 m/s ほど）。
 * 高いところではもう少し速く降りる（300 m から 90 秒かかって退屈だった。junji 2026-11-23）
 */
const sinkFor = (alt: number) => -THREE.MathUtils.clamp(1.0 + alt * 0.045, 1.0, 5.5)

const MAX_TILT = THREE.MathUtils.degToRad(35)
/** 機体が向きを変えられる速さ（rad/s） */
const TURN = THREE.MathUtils.degToRad(10)

/** dt 秒すすめる。出来事を out に足す */
export function stepDescent(d: Descent, dt: number, input: DescentInput, ground: Ground, out: DescentEvent[] = []) {
  const done = () => d.mode === 'landed' || d.mode === 'abort'
  let left = dt
  while (left > 1e-9 && !done()) {
    // 推力なしは 2 秒刻み、燃えているあいだは 0.1 秒刻み
    const h = Math.min(d.mode === 'coast' ? 2 : 0.1, left)
    left -= h
    stepOnce(d, h, input, ground, out)
  }
  return out
}

function say(d: Descent, e: DescentEvent, out: DescentEvent[]) {
  if (d.said.has(e)) return
  d.said.add(e)
  out.push(e)
}

const _g = new THREE.Vector3()
const _cmd = new THREE.Vector3()
const _tmp = new THREE.Vector3()
const _up = new THREE.Vector3()

function stepOnce(d: Descent, h: number, input: DescentInput, ground: Ground, out: DescentEvent[]) {
  if (d.mode === 'coast') {
    coast(d.r, d.v, h)
    d.t += h
    measure(d, ground)
    d.dir.copy(d.v).normalize().negate()
    // 点火されないまま窓の終わりをすぎたら、自動で点火（乗り遅れない）
    if (d.t > PDI_LATE) {
      ignitePdi(d)
      out.push('pdi')
    }
    return
  }
  // 降りる場所を動かす（接近のあいだだけ）
  if (d.mode === 'approach' && (input.lpdFwd || input.lpdRight)) {
    const { up, down, right } = aimFrame(d)
    d.target.addScaledVector(down, input.lpdFwd * 40).addScaledVector(right, input.lpdRight * 40)
    const dir = _tmp.copy(d.target).normalize()
    d.target.copy(dir).multiplyScalar(R_MOON + ground(dir))
    void up
  }
  input.lpdFwd = 0
  input.lpdRight = 0
  gravity(d.r, _g)
  _up.copy(d.r).normalize()
  // ほしい加速度（重力を含まない、動きの加速度）
  if (d.mode === 'braking' || d.mode === 'approach') {
    const aim = d.mode === 'braking' ? HIGH_GATE : LOW_GATE
    d.tgo = timeToGo(d, aim, d.tgo)
    quadraticAccel(d, aim, Math.max(d.tgo, 3), _cmd)
    // 目標の少し手前で、次の段階へ（残りが短いと誘導が暴れる）
    if (d.tgo <= 4) {
      if (d.mode === 'braking') {
        d.mode = 'approach'
        d.tgo = APPROACH_TIME
        say(d, 'highGate', out)
      } else {
        d.mode = 'terminal'
        say(d, 'lowGate', out)
        if (!d.auto && !d.manual) {
          // 手動にしていなければ、ここで自動のまま（P66 の自動）
        }
        d.vCmd = THREE.MathUtils.clamp(d.vUp, -6, -1)
      }
    }
  } else {
    terminalAccel(d, input, _cmd)
  }
  if (d.mode === 'contact') d.dir.copy(_up)
  // 推力 = 質量 × (ほしい加速度 − 重力)
  _cmd.sub(_g)
  // 傾きすぎない（最後の降下だけ。制動のあいだは横向きに噴く）
  if (d.mode === 'terminal' || d.mode === 'contact') limitTilt(_cmd, _up, MAX_TILT)
  let want = d.m * _cmd.length()
  let throttle = want / DPS.max
  if (throttle > DPS.high) throttle = DPS.ftp
  throttle = THREE.MathUtils.clamp(throttle, DPS.low, DPS.ftp)
  // 探り棒が触れてから 0.8 秒でエンジンが止まる（押してから火が消えるまで）
  if (d.mode === 'contact' && d.t - (d.contactAt ?? d.t) > 0.8) throttle = 0
  if (d.prop <= 0) {
    throttle = 0
    if (d.alt > 3) {
      say(d, 'outOfFuel', out)
      d.mode = 'abort'
      return
    }
  }
  if (d.mode === 'braking' && throttle >= DPS.ftp && d.t - (d.pdiAt ?? 0) > 60) landLong(d, ground, out)
  if (d.mode === 'braking' && throttle < DPS.high && !d.said.has('throttleDown') && d.t - (d.pdiAt ?? 0) > 200) say(d, 'throttleDown', out)
  // 機体の向き：ほしい向きへ、決まった速さで回る
  if (_cmd.lengthSq() > 1e-6) {
    _cmd.normalize()
    const ang = d.dir.angleTo(_cmd)
    const turn = (d.mode === 'braking' && d.t - (d.pdiAt ?? 0) < 2 ? 1 : TURN * (d.mode === 'terminal' ? 2.5 : 1)) * h
    if (ang > 1e-6) {
      if (ang <= turn) d.dir.copy(_cmd)
      else {
        const axis = _tmp.crossVectors(d.dir, _cmd).normalize()
        d.dir.applyAxisAngle(axis, turn).normalize()
      }
    }
  }
  d.throttle = throttle
  d.thrust = throttle * DPS.max
  const acc = d.thrust / d.m
  coast(d.r, d.v, h)
  d.v.addScaledVector(d.dir, acc * h)
  const used = (d.thrust / (DPS.isp * G0)) * h
  d.prop = Math.max(0, d.prop - used)
  d.m -= used
  d.t += h
  measure(d, ground)
  if (!d.radar && d.alt < 12_000) {
    d.radar = true
    say(d, 'radar', out)
  }
  // 推進剤の残り
  if (d.mode === 'terminal' || d.mode === 'approach') {
    if (d.prop / LM_PROP < 0.056) say(d, 'lowFuel', out)
    if (d.hover - BINGO < 60) say(d, 'call60', out)
    if (d.hover - BINGO < 30) say(d, 'call30', out)
  }
  // 探り棒が触れた → エンジンを止める（少し遅れて）
  if (d.mode === 'terminal' && d.alt < PROBE) {
    d.mode = 'contact'
    d.contactAt = d.t
    d.contactV = d.vUp
    say(d, 'contact', out)
  }
  if (d.alt <= 0) {
    const tilt = THREE.MathUtils.radToDeg(d.dir.angleTo(_up))
    const miss = _tmp.copy(d.r).normalize().multiplyScalar(R_MOON).distanceTo(_cmd.copy(d.spot).normalize().multiplyScalar(R_MOON))
    d.touch = { vUp: d.contactAt !== null ? d.contactV : d.vUp, hit: d.vUp, vSide: d.vSide, tilt, miss, fuel: d.hover }
    d.mode = 'landed'
    d.thrust = 0
    d.throttle = 0
    // 地面に置く
    d.r.setLength(d.r.length() - d.alt)
    d.v.set(0, 0, 0)
    d.alt = 0
    say(d, 'touchdown', out)
  }
}

/**
 * 減速が間に合わないとき（点火が遅れた）：止まれる距離まで、降りる場所を先へずらす（本物でも「着陸地点が先へずれる」）。
 * 止まるのに要る距離 = (前の速さ² − 目標の速さ²) ÷ (2 × 出せる減速の 8 割)
 */
function landLong(d: Descent, ground: Ground, out: DescentEvent[]) {
  const aim = HIGH_GATE
  const { r } = aimState(d, aim)
  const { down } = aimFrame(d)
  const dist = _ll.copy(r).sub(d.r).dot(down)
  const vf = d.v.dot(down)
  // 最大の推力で減速し続けたときの距離（燃えて軽くなる分も入れる）。余裕を 1 割みる
  const dv = Math.max(0, vf - aim.vDown)
  const mEnd = d.m * Math.exp(-dv / (DPS.isp * G0))
  const can = (DPS.max * DPS.ftp) / ((d.m + mEnd) / 2)
  const need = (((vf + aim.vDown) / 2) * dv) / can / 0.97
  if (need <= dist) return
  const shift = Math.min(need - dist, 200)
  d.target.addScaledVector(down, shift)
  const dir = _ll.copy(d.target).normalize()
  d.target.copy(dir).multiplyScalar(R_MOON + ground(dir))
  say(d, 'landLong', out)
}
const _ll = new THREE.Vector3()

function limitTilt(v: THREE.Vector3, up: THREE.Vector3, max: number) {
  const u = v.dot(up)
  const side = _lt.copy(v).addScaledVector(up, -u)
  const s = side.length()
  const lim = Math.max(0, u) * Math.tan(max)
  if (s > lim && s > 1e-9) {
    side.multiplyScalar(lim / s)
    v.copy(up).multiplyScalar(Math.max(0, u)).add(side)
  }
}
const _lt = new THREE.Vector3()

/** 最後の降下（P66）：上下は「降りる速さの指示」に合わせ、横は手動（押した向きへ傾ける）か自動（目標へ寄せる） */
function terminalAccel(d: Descent, input: DescentInput, out: THREE.Vector3) {
  const up = _up
  if (d.manual) {
    // 手動でも、降りる速さは自動の速さが土台（はじめての人は横の操縦だけに集中できる）。W/S で少し速く・ゆっくり。
    // 推進剤が残り少なくなったら、ゆっくりにはできない（燃料切れで落ちないように）
    d.trim = THREE.MathUtils.clamp(d.trim + input.rod * 0.3, -2.1, 1.5)
    input.rod = 0
    if (d.hover - BINGO < 15) d.trim = Math.min(d.trim, -0.6)
    // 地面の近くでは、速く降りすぎない（脚がこわれない 2.4 m/s まで）
    d.vCmd = Math.max(sinkFor(d.alt) + d.trim, d.alt < 30 ? -2.4 : -6)
  } else d.vCmd = sinkFor(d.alt)
  const aUp = THREE.MathUtils.clamp((d.vCmd - d.vUp) * 1.2, -1.2, 2.5)
  out.copy(up).multiplyScalar(aUp)
  // 横
  const vh = _vh.copy(d.v).addScaledVector(up, -d.vUp)
  if (d.manual) {
    // 押した向きへ「横の速さ」を指示する（離すと、機体が自分で横の動きを止める）。
    // 押した分だけ傾き続ける操縦（本物の P66 に近い）は、ちょっと押すだけで行き過ぎて止められなかった（junji 2026-11-23）。
    // 速さの上限は高さで小さく：着く前は 0.5 m/s ほど（脚が横すべりしない）
    const { down, right } = aimFrame(d)
    _tmp.copy(down).multiplyScalar(input.fwd).addScaledVector(right, input.right)
    if (_tmp.lengthSq() > 1) _tmp.normalize()
    const vmax = THREE.MathUtils.clamp(0.3 + d.alt * 0.075, 0.3, 10)
    const ah = _tmp.multiplyScalar(vmax).sub(vh).multiplyScalar(0.7)
    if (ah.length() > 1.4) ah.setLength(1.4)
    out.add(ah)
  } else {
    // 目標までの横のずれ
    const there = _tmp.copy(d.target).normalize().multiplyScalar(d.r.length()).sub(d.r)
    there.addScaledVector(up, -there.dot(up))
    const dist = there.length()
    const want = there.multiplyScalar(dist > 1e-3 ? Math.min(12, dist * 0.09) / dist : 0)
    const ah = want.sub(vh).multiplyScalar(0.55)
    if (ah.length() > 1.5) ah.setLength(1.5)
    out.add(ah)
  }
}
const _vh = new THREE.Vector3()

/** 地面に平行な速さを、着陸船の前・右に分けた値（m/s）。手動の操縦の目安（十字の速度計） */
export function sideSpeeds(d: Descent) {
  const { down, right } = aimFrame(d)
  return { fwd: d.v.dot(down), right: d.v.dot(right) }
}

/** 目標までの、前・右の距離（m） */
export function targetOffset(d: Descent) {
  const { down, right } = aimFrame(d)
  const there = _to.copy(d.target).normalize().multiplyScalar(d.r.length()).sub(d.r)
  return { fwd: there.dot(down), right: there.dot(right), dist: Math.hypot(there.dot(down), there.dot(right)) }
}
const _to = new THREE.Vector3()

/** 着地の点数（0〜3）。おまかせなら 1 */
/** 脚がこわれるほど強く着いたか（本物の脚は、たて 3 m/s・横 1.2 m/s ほどまで） */
export function hardLanding(d: Descent) {
  const t = d.touch
  return !!t && (Math.abs(t.vUp) > 3.5 || t.vSide > 3 || t.tilt > 15)
}

export function landingStars(d: Descent) {
  const t = d.touch
  if (!t || hardLanding(d)) return 0
  if (d.auto || !d.manual) return 1
  let s = 3
  if (Math.abs(t.vUp) > 1.2 || t.vSide > 0.8 || t.miss > 250 || t.fuel < BINGO) s = 2
  if (Math.abs(t.vUp) > 2.6 || t.vSide > 2 || t.tilt > 12 || t.miss > 800) s = 1
  return s
}
