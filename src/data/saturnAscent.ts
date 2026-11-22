// 月ミッション（アポロ17号の追体験）の打ち上げの物理。サターンV の本物の推力・重さ・燃える時間で、
// 地球のまわりの軌道（高さ約 170 km）まで上がる。画面や操作には関わらない、数字だけの計算。
//
// 地球の中心を原点にした、打ち上げの向き（東）を含む平面の 2 次元で計算する。
// x：発射場の真上の向き（打ち上げの瞬間の「上」）、y：打ち上げの向き（東）。単位は m・秒・kg。
// 地球の自転で、発射場は最初から東へ約 408 m/s で動いている（ケネディ宇宙センター、北緯 28.5°）。

export const MU = 3.986004e14
export const R_EARTH = 6_371_000
export const G0 = 9.80665
/** 地球の自転の角速度（rad/s） */
export const OMEGA = 7.2921e-5
/** 発射場の緯度（度） */
export const PAD_LAT = 28.6
/** 目標の軌道の高さ（m）。アポロ17号は約 170 km の円い軌道に入った */
export const TARGET_ALT = 170_000

export type StageId = 'S1' | 'S2' | 'S3'

export type StageDef = {
  id: StageId
  /** 真空での推力（N）と、地上での推力（第1段だけ空気で減る） */
  thrustVac: number
  thrustSl: number
  /** 比推力（s）：真空・地上 */
  ispVac: number
  ispSl: number
  /** 推進剤（kg）と、空になった段の重さ（kg） */
  prop: number
  dry: number
}

/** 3 つの段（本物の値をもとに丸めたもの） */
export const STAGES: StageDef[] = [
  // S-IC：F-1 エンジン 5 基。地上で 3,400 t 重の推力、2 分 40 秒ほど燃える
  { id: 'S1', thrustVac: 38_850_000, thrustSl: 33_850_000, ispVac: 304, ispSl: 263, prop: 2_100_000, dry: 135_000 },
  // S-II：J-2 エンジン 5 基。6 分ほど燃える
  { id: 'S2', thrustVac: 5_165_000, thrustSl: 5_165_000, ispVac: 424, ispSl: 424, prop: 452_000, dry: 36_000 },
  // S-IVB：J-2 エンジン 1 基。軌道に入る燃焼と、月へ向かう燃焼（TLI）の 2 回燃える
  { id: 'S3', thrustVac: 1_033_000, thrustSl: 1_033_000, ispVac: 424, ispSl: 424, prop: 110_000, dry: 15_300 },
]

/** 段間部（第2段の下のリング。第2段の点火から 30 秒で捨てる）と、脱出塔（35 秒で捨てる） */
export const INTERSTAGE_MASS = 5_200
export const LES_MASS = 4_200
export const INTERSTAGE_DROP = 30
export const LES_DROP = 35
/** 司令船・機械船・着陸船・アダプタ（脱出塔のぶんは別） */
export const PAYLOAD = 48_700
/** 第1段の中央のエンジンを先に止める時刻（s）。加速が強くなりすぎないように */
export const CENTER_CUTOFF = 135.5
/** 第2段の中央のエンジンを止める、第2段の点火からの秒（アポロ17号：点火 T+2:44.6 ごろ、中央停止 T+7:41.2。NASA SP-4029） */
export const S2_CENTER_CUTOFF = 296.6
/** 段を切り離してから次の段に火が入るまで（s） */
export const STAGING_GAP = 2.5

export function liftoffMass() {
  return STAGES.reduce((m, s) => m + s.prop + s.dry, 0) + INTERSTAGE_MASS + LES_MASS + PAYLOAD
}

export type Ascent = {
  /** 打ち上げからの時刻（s） */
  t: number
  x: number
  y: number
  vx: number
  vy: number
  m: number
  /** 今の段（0〜2）と、その段の残りの推進剤 */
  stage: number
  prop: number
  /** 段の切り離しの後、次の段に火が入る時刻（それまでは推力なし） */
  ignite: number
  /** 第2段の点火の時刻（段間部・脱出塔を捨てる時刻のもと） */
  s2Start: number
  interstage: boolean
  les: boolean
  /** エンジンが止まっている（軌道に入った） */
  cutoff: boolean
  /** 今の推力（N）と加速（m/s²、推力÷重さ） */
  thrust: number
  accel: number
  /** 動圧（Pa）。空気の抵抗がいちばん強い所（マックスQ）を見せる */
  q: number
  /** 今の燃焼の目的：軌道に入る（第1〜3段）・月へ向かう（第3段の 2 回目、TLI） */
  goal: 'orbit' | 'tli'
}

export function startAscent(): Ascent {
  const lat = (PAD_LAT * Math.PI) / 180
  return {
    t: 0,
    x: R_EARTH,
    y: 0,
    vx: 0,
    // アポロ17号はほぼ真東（方位 91.5°）へ打ち上げた。自転の速さをそのままもらう
    vy: OMEGA * R_EARTH * Math.cos(lat),
    m: liftoffMass(),
    stage: 0,
    prop: STAGES[0].prop,
    ignite: 0,
    s2Start: -1,
    interstage: true,
    les: true,
    cutoff: false,
    thrust: 0,
    accel: 0,
    q: 0,
    goal: 'orbit',
  }
}

/** 月へ向かう燃焼（TLI）の目標：遠い所の高さ（m）。月の軌道の少し先 */
export const TLI_APO = 360_000_000

/** 第3段に 2 回目の火を入れる（月へ向かう燃焼）。機首は進む向き（呼ぶ側が progradePitch を渡す） */
export function startTli(a: Ascent) {
  a.goal = 'tli'
  a.cutoff = false
  a.ignite = a.t
}

/** 進む向き（度、真上から東へ）。軌道を回るときと、月へ向かう燃焼のとき */
export function progradePitch(a: Ascent) {
  const { up, side } = velocities(a)
  return (Math.atan2(side, up) * 180) / Math.PI
}

export const radius = (a: Ascent) => Math.hypot(a.x, a.y)
export const altitude = (a: Ascent) => radius(a) - R_EARTH
/** 上向きの速さ・横向きの速さ（m/s、地球の中心から見た慣性の速さ） */
export function velocities(a: Ascent) {
  const r = radius(a)
  const ux = a.x / r
  const uy = a.y / r
  const up = a.vx * ux + a.vy * uy
  const side = -a.vx * uy + a.vy * ux
  return { up, side, speed: Math.hypot(a.vx, a.vy) }
}

/** 発射場から東へ進んだ距離（m、地表に沿って） */
export const downrange = (a: Ascent) => Math.atan2(a.y, a.x) * R_EARTH

/** 空気の密さ（kg/m³）。指数の大気 */
export const airDensity = (h: number) => (h > 150_000 ? 0 : 1.225 * Math.exp(-h / 7_200))

/** 軌道の近い所・遠い所の高さ（m）。双曲線なら遠い所は Infinity */
export function orbitOf(a: Ascent) {
  const r = radius(a)
  const v2 = a.vx * a.vx + a.vy * a.vy
  const energy = v2 / 2 - MU / r
  const h = a.x * a.vy - a.y * a.vx
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (MU * MU)))
  if (energy >= 0) return { peri: (h * h) / MU / (1 + e) - R_EARTH, apo: Infinity, e }
  const sma = -MU / (2 * energy)
  return { peri: sma * (1 - e) - R_EARTH, apo: sma * (1 + e) - R_EARTH, e }
}

// ---- 手本の道すじ（ガイド） ------------------------------------------------------------

/**
 * 第1段の手本の向き（真上から何度、東へ倒すか）。打ち上げから 12 秒はまっすぐ上（発射塔をよけて、向きを整える）。
 * そのあとゆっくり倒していき、第1段が燃え尽きるころには 60° ほど。本物の飛行記録の形をなぞった表。
 */
const S1_PITCH: [number, number][] = [
  [0, 0],
  [12, 0],
  [25, 4],
  [40, 12],
  [60, 24],
  [80, 36],
  [100, 46],
  [120, 54],
  [140, 60],
  [165, 63],
]

function table(t: number, tab: [number, number][]) {
  if (t <= tab[0][0]) return tab[0][1]
  for (let i = 1; i < tab.length; i++) {
    if (t <= tab[i][0]) {
      const [t0, v0] = tab[i - 1]
      const [t1, v1] = tab[i]
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0)
    }
  }
  return tab[tab.length - 1][1]
}

/**
 * 手本の向き（度、真上から東へ）。第1段は決まった表、第2段から先は「今いる所から目標の軌道へ入る」向きを
 * その場で計算する（本物のサターンV の誘導 IGM と同じ考え）。だから途中で少しずれても、手本にもどれば軌道に入れる。
 */
export function guidePitch(a: Ascent) {
  if (a.stage === 0) return table(a.t, S1_PITCH)
  const r = radius(a)
  const { up, side } = velocities(a)
  const h = r - R_EARTH
  const aT = Math.max(0.5, a.thrust > 0 ? a.accel : STAGES[a.stage].thrustVac / a.m)
  const vCirc = Math.sqrt(MU / (R_EARTH + TARGET_ALT))
  // 残りの時間の見積もり：足りない横の速さを、今の加速で割る（燃えるうちに軽くなるので少し短め）
  const tgo = Math.max(8, ((vCirc - side) / aT) * 0.85)
  // 高さと上向きの速さを、時間 tgo でちょうど目標に合わせる上向きの加速（直線に変わる加速の始めの値）
  const aUp = (6 * (TARGET_ALT - h)) / (tgo * tgo) - (4 * up) / tgo
  // 重力と、横の速さによる遠心の分を足したものが、推力の上向きの分
  const need = aUp + MU / (r * r) - (side * side) / r
  const c = Math.max(-0.5, Math.min(1, need / aT))
  return (Math.acos(c) * 180) / Math.PI
}

// ---- 1 歩すすめる ----------------------------------------------------------------------

export type AscentEvent = 'centerCutoff' | 's2CenterCutoff' | 'stage1Sep' | 'stage2Ign' | 'interstage' | 'les' | 'stage2Sep' | 'stage3Ign' | 'orbit' | 'tliCutoff'

/**
 * dt 秒すすめる。pitch は機首の向き（度、真上から東へ）。起きた出来事を返す。
 * dt は 0.05 s 以下で呼ぶ（呼ぶ側で細かく分ける）
 */
export function stepAscent(a: Ascent, dt: number, pitch: number, out: AscentEvent[] = []) {
  if (!a.cutoff) {
    // 出来事
    if (a.stage === 0 && a.t < CENTER_CUTOFF && a.t + dt >= CENTER_CUTOFF) out.push('centerCutoff')
    if (a.stage === 1 && a.s2Start >= 0) {
      if (a.interstage && a.t - a.s2Start >= INTERSTAGE_DROP) {
        a.interstage = false
        a.m -= INTERSTAGE_MASS
        out.push('interstage')
      }
      if (a.t - a.s2Start < S2_CENTER_CUTOFF && a.t + dt - a.s2Start >= S2_CENTER_CUTOFF) out.push('s2CenterCutoff')
      if (a.les && a.t - a.s2Start >= LES_DROP) {
        a.les = false
        a.m -= LES_MASS
        out.push('les')
      }
    }
  }
  const r = radius(a)
  const ux = a.x / r
  const uy = a.y / r
  const h = r - R_EARTH
  // 推力
  let thrust = 0
  const st = STAGES[a.stage]
  if (!a.cutoff && a.t >= a.ignite && a.prop > 0) {
    const p = Math.exp(-h / 7_200)
    const f = (a.stage === 0 && a.t >= CENTER_CUTOFF) || (a.stage === 1 && a.s2Start >= 0 && a.t - a.s2Start >= S2_CENTER_CUTOFF) ? 0.8 : 1
    thrust = f * (st.thrustVac + (st.thrustSl - st.thrustVac) * p)
    const isp = st.ispVac + (st.ispSl - st.ispVac) * p
    const mdot = thrust / (isp * G0)
    const burn = Math.min(a.prop, mdot * dt)
    a.prop -= burn
    a.m -= burn
  }
  const th = (pitch * Math.PI) / 180
  // 機首の向き：上（ux,uy）から東（-uy,ux）へ th だけ倒す
  const dx = Math.cos(th) * ux - Math.sin(th) * uy
  const dy = Math.cos(th) * uy + Math.sin(th) * ux
  // 空気の抵抗（空気は地球と一緒に回っている）
  const ax0 = a.vx + OMEGA * a.y
  const ay0 = a.vy - OMEGA * a.x
  const vRel = Math.hypot(ax0, ay0)
  const rho = airDensity(h)
  a.q = 0.5 * rho * vRel * vRel
  const drag = a.q * 0.45 * 80 // Cd × 断面積（m²、直径 10 m）
  const g = MU / (r * r)
  let fx = thrust * dx - g * a.m * ux
  let fy = thrust * dy - g * a.m * uy
  if (vRel > 0) {
    fx -= (drag * ax0) / vRel
    fy -= (drag * ay0) / vRel
  }
  // 発射台の上では、推力が重さに勝つまで動かない
  if (h <= 0 && fx * ux + fy * uy <= 0 && a.t < 20) {
    fx = 0
    fy = 0
  }
  a.vx += (fx / a.m) * dt
  a.vy += (fy / a.m) * dt
  a.x += a.vx * dt
  a.y += a.vy * dt
  a.t += dt
  a.thrust = thrust
  a.accel = thrust / a.m
  if (a.cutoff) return out
  // 燃え尽きたら次の段へ
  if (a.prop <= 0 && a.stage < 2) {
    a.m -= st.dry
    a.stage += 1
    a.prop = STAGES[a.stage].prop
    a.ignite = a.t + STAGING_GAP
    out.push(a.stage === 1 ? 'stage1Sep' : 'stage2Sep')
  }
  if (a.goal === 'tli') {
    if (orbitOf(a).apo >= TLI_APO || a.prop <= 0) {
      a.cutoff = true
      out.push('tliCutoff')
    }
    return out
  }
  if (a.stage > 0 && a.t >= a.ignite && a.t - dt < a.ignite) {
    if (a.stage === 1) a.s2Start = a.t
    out.push(a.stage === 1 ? 'stage2Ign' : 'stage3Ign')
  }
  // 軌道に入ったら止める：近い所が目標の少し下まで上がったら
  if (a.stage === 2 && a.t >= a.ignite) {
    const o = orbitOf(a)
    if (o.peri >= TARGET_ALT - 4_000 || a.prop <= 0) {
      a.cutoff = true
      out.push('orbit')
    }
  }
  return out
}
