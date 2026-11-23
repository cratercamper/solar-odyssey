import { GRAVITY } from '../../state/walk'
import { G } from './park'
import { Y_MIN } from './cylinder'

// コロニーの回転の軸へ上がるエレベーターと、軸のまわりの駅。
// 重さは回転の遠心力なので、軸からの距離に比例する（地面で 1G、軸で 0）。
// 歩く場面の h（地面からの高さ m）で書くと、軸からの距離は G - h。

/** 回転の速さ（rad/s）。地面で 1G になる */
export const OMEGA = Math.sqrt(GRAVITY / G)
/** その高さの重さ（m/s²） */
export const gAt = (h: number) => (GRAVITY * Math.max(0, G - h)) / G
/** その高さで、s（地面の円周の長さ）を 1 m 進むと、実際には何 m か */
export const sMeters = (h: number) => Math.max(0.002, (G - h) / G)

/** 港側の端の壁の前に立つエレベーターの塔（地面の位置） */
export const TOWER = { s: 0, y: Y_MIN + 46, r: 4.5 }
/** 軸の駅：軸のまわりの細い円筒。外側の面に立つ（半径 STATION_R m、y は y0〜y1） */
export const STATION_R = 25
export const STATION_H = G - STATION_R
export const STATION = { y0: Y_MIN + 6, y1: Y_MIN + 86 }
/** 塔の扉のまわり（ここに来るとエレベーターに乗れる） */
export const DOOR_REACH = 9
/** 乗っている時間（秒）。上で 1 回、下で 1 回、速さをなめらかに変える */
export const RIDE_S = 40

/** エレベーターの位置（0 = 地面、1 = 軸の駅）を、高さへ */
export const elevH = (t: number) => STATION_H * (t * t * (3 - 2 * t))

/** 塔の扉の近くか。下（地面）か上（駅）か */
export function nearDoor(s: number, y: number, h: number): 'up' | 'down' | null {
  const ds = (s - TOWER.s) * sMeters(h)
  if (Math.hypot(ds, y - TOWER.y) > DOOR_REACH) return null
  if (h < 3) return 'up'
  if (Math.abs(h - STATION_H) < 3) return 'down'
  return null
}

/** 駅の先の、壁のない発着デッキの端（翼をつけていれば、ここから飛び出せる） */
export const DECK_END = STATION.y1 + 30
/** 駅かデッキの床の上か */
export const onStation = (y: number) => y >= STATION.y0 && y <= DECK_END
/** 足もとの床の高さ。駅かデッキの床（円筒の内がわ）は、その高さかそれより上にいるときだけ。
 *  デッキの先から出て床より下へ沈んだ人には床はない：駅の下へもどっても、下から床の上へ上がらない */
export const floorUnder = (h: number, y: number) => (h >= STATION_H - 0.01 && onStation(y) ? STATION_H : 0)

/** エレベーターのかごの今の位置（0〜1）。WalkActors が動かし、WalkAxis が描く */
export const elevCar = { t: 0 }
/** 塔の柱の中心（かごの横）と太さ */
export const CORE = { y: TOWER.y - 3.6, r: 2.2 }
