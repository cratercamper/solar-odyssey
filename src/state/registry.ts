import type * as THREE from 'three'

/** 描画中の天体。航法や自動航行が位置を参照する */
export type BodyEntry = {
  id: string
  name: string
  radius: number
  object: THREE.Object3D
}

export const bodies = new Map<string, BodyEntry>()

export function registerBody(entry: BodyEntry) {
  bodies.set(entry.id, entry)
  return () => {
    if (bodies.get(entry.id) === entry) bodies.delete(entry.id)
  }
}

/** シミュレーション時間（秒）。一時停止や早送りのため描画時計とは分ける */
export const sim = { time: 0 }

/** 小惑星の種類（0 炭素質・1 石質・2 金属） */
export type RockType = 0 | 1 | 2

/** 小惑星帯：ビームで壊すために参照する */
export const asteroids = {
  meshes: [] as THREE.InstancedMesh[],
  types: new Map<THREE.InstancedMesh, RockType[]>(),
  destroyed: [] as { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4; at: number }[],
}

/** 小惑星帯の岩が砕けたとき（開拓の資源集めが聞く）。at は世界座標、size は岩の大きさ、rock はどの岩か（形の番号と何番目か） */
export const rockBreaks = new Set<(type: RockType, size: number, at: THREE.Vector3, rock?: { shape: number; index: number }) => void>()

/** 小惑星帯のほかにビームが当たるもの（任務の小惑星など）。当たると onHit を呼ぶ */
export const beamTargets: { object: THREE.Object3D; onHit: () => void }[] = []

/** 天体以外を目標マーカーで指すとき（レースの次のゲートなど） */
export const markerOverride = { object: null as THREE.Object3D | null }

/**
 * 天体ではないが、そばで船を縮めたい場所（SFモードのスペースコロニーなど）。
 * 中心から start より近いと縮め始め、full より近いと factor 倍まで縮める。
 * 縮めた分、速さの上限も下げる（大きな構造物の横を、ゆっくり流れるように）
 */
export type ZoomZone = { object: THREE.Object3D; start: number; full: number; factor: number }
export const zoomZones = new Set<ZoomZone>()

/** 中を飛べる構造物：天体のような「近づける限界」の代わりに、自分で壁に当たる判定をする（毎フレーム、自機を動かしたあとに呼ぶ） */
export const colliders = new Set<() => void>()
/** 天体の近づける限界を使わない id（colliders で自分で判定するもの） */
export const passThrough = new Set<string>()

/**
 * チャージビームで壊せる、小惑星帯のほかのもの（宇宙ごみなど）。ビームが当たっているあいだ毎フレーム呼ばれる。
 * from から dir（長さ 1）の向きに length まで、太さは中心から radius + 距離 × spread までに入ったものを壊し、hit で場所と大きさを知らせる
 */
export type BeamSweep = (from: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, spread: number, hit: (at: THREE.Vector3, size: number) => void) => void
export const beamSweeps = new Set<BeamSweep>()

/**
 * 港から中へ入れる構造物の入口（周辺観察の「入港」で、自動で入口の手前まで行く）。
 * next は from（自機の位置）から次に向かう点を out に、入口から中へ向かう向きを inward に入れ、
 * 入口の手前（最後の点）なら true を返す。壁を突き抜けないよう、途中の点を順に返す
 */
export type Port = {
  /** この港を持つ天体の id（中心から離れた港でも、その天体の港として選ぶ） */
  owner?: string
  object: THREE.Object3D
  next: (from: THREE.Vector3, out: THREE.Vector3, inward: THREE.Vector3) => boolean
  /** 着いたときの案内（ないときは「港の入口に着きました」） */
  done?: () => string
  /** 船の上の向き（ドックの床に水平に止めるとき。ないときは今の船の上） */
  up?: (out: THREE.Vector3) => void
}
export const ports = new Set<Port>()

/**
 * 速さだけを落とす場所（自機は縮めない）。中心から near より近いと最高速の factor 倍まで、far より遠いと落とさない。
 * 縮める場所（zoomZones）の速さの落とし方では、小さな構造物（宇宙船ドックなど）を通り越してしまうときに使う
 */
export type SlowZone = { object: THREE.Object3D; near: number; far: number; factor: number }
export const slowZones = new Set<SlowZone>()
