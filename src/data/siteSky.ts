// 発射場（ケネディ宇宙センター 39A 発射台）の空：日時から、太陽と月の向き・月の満ち欠け・星空の回りぐあいを出す。
// 打ち上げの場面の空（components/moonMission/launchSky.ts）と、観察パートのタイムラプスで使う。
//
// 精度は 0.5〜1 度（見た目に十分）。式は低精度の太陽・月の位置（ヤン・メーウス『天体計算』の短い形）。
// 向きは「地面の組」の座標で返す：x 東、y 上、z 南（components/moonMission/launchSite.ts と同じ）。

/** 39A 発射台（度） */
export const PAD_LAT_DEG = 28.6083
export const PAD_LON_DEG = -80.6041

/** アポロ17号の離昇：1972-12-07 05:33:00 UTC（米東部時間 0 時 33 分） */
export const APOLLO17_LIFTOFF = Date.UTC(1972, 11, 7, 5, 33, 0)

const D2R = Math.PI / 180
const norm360 = (a: number) => ((a % 360) + 360) % 360

/** 2000 年 1 月 1 日 12 時（世界時）からの日数 */
export const daysJ2000 = (ms: number) => ms / 86_400_000 - 10957.5

/** 黄道の傾き（度） */
const obliquity = (d: number) => 23.4393 - 3.563e-7 * d

/** 太陽の黄経（度） */
export function sunLongitude(d: number) {
  const g = norm360(357.529 + 0.98560028 * d) * D2R
  const q = norm360(280.459 + 0.98564736 * d)
  return norm360(q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g))
}

/** 月の黄経・黄緯（度）。主な 6 項だけ（誤差はおよそ 0.3 度） */
export function moonEcliptic(d: number) {
  const L = norm360(218.316 + 13.176396 * d)
  const M = norm360(134.963 + 13.064993 * d) * D2R
  const Ms = norm360(357.529 + 0.98560028 * d) * D2R
  const D = norm360(297.85 + 12.190749 * d) * D2R
  const F = norm360(93.272 + 13.22935 * d) * D2R
  const lon = L + 6.289 * Math.sin(M) + 1.274 * Math.sin(2 * D - M) + 0.658 * Math.sin(2 * D) + 0.214 * Math.sin(2 * M) - 0.186 * Math.sin(Ms) - 0.114 * Math.sin(2 * F)
  const lat = 5.128 * Math.sin(F) + 0.281 * Math.sin(M + F) + 0.278 * Math.sin(M - F)
  return { lon: norm360(lon), lat }
}

/** 黄道座標（度）→ 赤経・赤緯（度） */
export function eclipticToEquatorial(lonDeg: number, latDeg: number, d: number) {
  const e = obliquity(d) * D2R
  const l = lonDeg * D2R
  const b = latDeg * D2R
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l))
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l))
  return { ra: norm360(ra / D2R), dec: dec / D2R }
}

/** 地方恒星時（度） */
export function localSiderealTime(ms: number, lonDeg = PAD_LON_DEG) {
  const d = daysJ2000(ms)
  return norm360(280.46061837 + 360.98564736629 * d + lonDeg)
}

/** 赤経・赤緯（度）→ 地面の組の向き（x 東、y 上、z 南）。高度 alt と方位 az（北から東回り、度）もつける */
export function equatorialToGround(raDeg: number, decDeg: number, ms: number, latDeg = PAD_LAT_DEG, lonDeg = PAD_LON_DEG) {
  const H = (localSiderealTime(ms, lonDeg) - raDeg) * D2R
  const dec = decDeg * D2R
  const lat = latDeg * D2R
  // 赤道の向き → 地平の向き（北・東・上）
  const north = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(H)
  const east = -Math.cos(dec) * Math.sin(H)
  const up = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H)
  return {
    x: east,
    y: up,
    z: -north,
    alt: Math.asin(up) / D2R,
    az: norm360(Math.atan2(east, north) / D2R),
  }
}

/**
 * 赤道座標の向き（単位ベクトル）→ 地面の組の向き（x 東、y 上、z 南）の行列（行ごと 3 つずつ、9 個）。
 * equatorialToGround と同じ変換を、星をまとめて回すために行列にしたもの
 */
export function groundFromEquatorial(ms: number, latDeg = PAD_LAT_DEG, lonDeg = PAD_LON_DEG): number[] {
  const th = localSiderealTime(ms, lonDeg) * D2R
  const lat = latDeg * D2R
  const [st, ct, sl, cl] = [Math.sin(th), Math.cos(th), Math.sin(lat), Math.cos(lat)]
  return [-st, ct, 0, cl * ct, cl * st, sl, sl * ct, sl * st, -cl]
}

export type SiteSky = {
  sun: ReturnType<typeof equatorialToGround>
  moon: ReturnType<typeof equatorialToGround>
  /** 月の輝いている割合（0 新月〜1 満月） */
  moonLit: number
  /** 月齢（日、新月から） */
  moonAge: number
  /** 地方恒星時（度）。星空の球を回すのに使う */
  lst: number
}

/** ms（世界時のミリ秒）の、発射場の空 */
export function siteSky(ms: number): SiteSky {
  const d = daysJ2000(ms)
  const sl = sunLongitude(d)
  const se = eclipticToEquatorial(sl, 0, d)
  const m = moonEcliptic(d)
  const me = eclipticToEquatorial(m.lon, m.lat, d)
  const elong = norm360(m.lon - sl)
  return {
    sun: equatorialToGround(se.ra, se.dec, ms),
    moon: equatorialToGround(me.ra, me.dec, ms),
    moonLit: (1 - Math.cos(elong * D2R)) / 2,
    moonAge: (elong / 360) * 29.530589,
    lst: localSiderealTime(ms),
  }
}
