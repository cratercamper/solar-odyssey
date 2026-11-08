import { useStore } from '../state/store'
import { COMPARE_VIEW, DEFAULT_VIEW, METERS_PER_UNIT, SHIP_LENGTH_M, SHIP_PARTS, SHOTS, type ShipPart, type ShipPartText, type View } from './shipParts'
import { ui } from '../i18n'

// 乗る船をえらべる。SV-01 のほかの船は Blender で組み立てたモデル（tools/blender/build_fleet.py）。
// どれもこのアプリのオリジナルの空想の船で、本物の科学や乗り物と結びつく話をそえる。
// 位置はどれも船の模型の座標（Y が上、前方が -Z、全長およそ 1）

export type ShipId = 'sv01' | 'heron' | 'sorakaze' | 'hakobune' | 'meguri' | 'amatsu' | 'arcadia'

/** 灯火：strobe は白い衝突防止灯（3秒おきに2回光る）、port は左舷の赤、starboard は右舷の緑、beacon は赤い回転灯風 */
export type ShipLight = { pos: [number, number, number]; kind: 'strobe' | 'port' | 'starboard' | 'beacon'; size: number }

/** 船体を照らす投光器（暗い宇宙でも形がわかるように、外板に光のたまりを作る） */
export type Flood = { from: [number, number, number]; to: [number, number, number]; angle: number; intensity: number }

/** 外板に描く文字（型式番号や船名）。pos は板の中心、rot は板の向き（オイラー角）、size は幅と高さ */
export type Decal = { text: string; pos: [number, number, number]; rot: [number, number, number]; size: [number, number]; color?: string }

export type ShipSpec = {
  id: ShipId
  registry: string
  /** 設定上の全長（m） */
  lengthM: number
  /** 模型の座標の 1 が何 m か */
  metersPerUnit: number
  /** 旋回の速さの倍率（大きな船ほどゆっくり） */
  turn: number
  /** glb（SV-01 以外） */
  model?: string
  /** ブリッジの部屋の床の基準点（模型の座標） */
  bridgeBase: [number, number, number]
  parts: ShipPart[]
  defaultView: View
  compareView: View
  shots: { from: View; to: View }[]
  lights: ShipLight[]
  floods: Flood[]
  decals: Decal[]
  /** 噴射の光の色（ふだん・ワープ準備） */
  glow: { idle: [number, number, number]; warp: [number, number, number] }
  /** エンジン噴射と姿勢制御の演出（components/ship/EngineFx.tsx） */
  engine: EngineSpec
  /** 回る部品（Rotor）が1回転する秒数 */
  spinSeconds?: number
  /** 選ぶ画面のカードの色（外板の主な色） */
  swatch: string[]
}

/** ShipSpec の文言（日本語は src/i18n/ships.ja.ts、英語は ships.en.ts） */
export type ShipText = {
  name: string
  /** 船の種類 */
  kind: string
  /** 選ぶ画面の紹介文 */
  blurb: string
  parts: Record<string, ShipPartText>
}

type Vec3 = [number, number, number]

/** 姿勢制御の噴射口（pos）と、ガスを吹き出す向き（dir、船体の外向き）。噴射の反動で船が動く・回る向きから、どれを吹くかを決める */
export type Rcs = { pos: Vec3; dir: Vec3 }

/** 主エンジンの噴射口：pos は出口の中心、r は出口の半径。炎は +Z（後ろ）へ伸びる */
export type Nozzle = { pos: Vec3; r: number }

/**
 * 噴射の演出。噴射口のある船（nozzle）は青白い炎、噴射口のない船（nacelle）はナセルの光と光の粒。
 * 位置はどれも模型の座標（Blender の (x, y, z) は three.js の (x, z, -y)。tools/blender/build_fleet.py の nozzle() の back が出口）
 */
export type EngineSpec =
  | {
      kind: 'nozzle'
      nozzles: Nozzle[]
      rcs: Rcs[]
      /** 炎の芯と外側の光の色（明るさ込み） */
      core: Vec3
      outer: Vec3
      /** 全開のときの炎の長さ（噴射口の半径の何倍か） */
      length: number
    }
  | {
      kind: 'nacelle'
      /** 光の粒が出るナセルの後端と、その広がり（半径） */
      vents: Vec3[]
      ventRadius: number
      /** 姿勢制御のときに一瞬光る、船体の端 */
      rcs: Rcs[]
    }

/**
 * 姿勢制御の噴射口を、船の左右（x = ±hx）の高さ y、前後 z の位置に置く。
 * 片側に上・下・外向きの 3 つ。front なら前向き（後退用）も足す
 */
function rcsPair(hx: number, y: number, z: number, front = false): Rcs[] {
  const list: Rcs[] = []
  for (const sx of [-1, 1]) {
    const pos: Vec3 = [sx * hx, y, z]
    list.push({ pos, dir: [0, 1, 0] }, { pos, dir: [0, -1, 0] }, { pos, dir: [sx, 0, 0] })
    if (front) list.push({ pos, dir: [0, 0, -1] })
  }
  return list
}

const PI = Math.PI

const SV01: ShipSpec = {
  id: 'sv01',
  registry: 'SV-01',
  lengthM: SHIP_LENGTH_M,
  metersPerUnit: METERS_PER_UNIT,
  turn: 1,
  bridgeBase: [0, 0, 0],
  parts: SHIP_PARTS,
  defaultView: DEFAULT_VIEW,
  compareView: COMPARE_VIEW,
  shots: SHOTS,
  lights: [],
  floods: [],
  decals: [],
  engine: {
    kind: 'nacelle',
    // ナセルの後端（ShipModel の NACELLE_X/Y/Z と、ナセルの長さ 0.437）
    vents: [[-0.2, 0.068, 0.567], [0.2, 0.068, 0.567]],
    ventRadius: 0.012,
    // 円盤の左右の縁と前の縁、ナセルの後端
    rcs: [...rcsPair(0.31, 0.07, -0.17), ...rcsPair(0.1, 0.07, -0.47, true), ...rcsPair(0.235, 0.068, 0.54)],
  },
  glow: { idle: [1, 1, 1], warp: [1, 1, 1] },
  swatch: ['#e6e4dc', '#4aa8ff', '#ff4a2a'],
}

const HERON: ShipSpec = {
  id: 'heron',
  registry: 'SC-03',
  lengthM: 400,
  metersPerUnit: 400 / 1.06,
  turn: 0.9,
  model: 'ship-heron.glb',
  bridgeBase: [0, 0.163, -0.02],
  parts: [
    {
      id: 'legs',
      pos: [0.212, 0.03, -0.2],
      side: [0, 1, 0],
      view: { yaw: PI - 0.9, pitch: 0.42, dist: 0.85, target: [0.15, 0, -0.2] },
    },
    {
      id: 'bay',
      pos: [-0.212, -0.04, -0.48],
      side: [0, 0, -1],
      view: { yaw: PI + 0.45, pitch: 0.12, dist: 0.42, target: [-0.212, -0.044, -0.46] },
    },
    {
      id: 'bridge',
      pos: [0, 0.17, 0],
      side: [0, 1, 0],
      view: { yaw: PI - 0.6, pitch: 0.28, dist: 0.38, target: [0, 0.15, -0.01] },
    },
    {
      id: 'sensors',
      pos: [0.024, 0.19, 0.035],
      side: null,
      view: { yaw: PI - 1.2, pitch: 0.35, dist: 0.3, target: [0.01, 0.18, 0.02] },
    },
    {
      id: 'engines',
      pos: [0.118, 0.004, 0.55],
      side: [0, 0, 1],
      view: { yaw: 0.45, pitch: 0.2, dist: 0.6, target: [0, 0, 0.45] },
    },
    {
      id: 'wings',
      pos: [0.36, -0.02, 0.44],
      side: null,
      view: { yaw: 1.1, pitch: 0.5, dist: 0.9, target: [0.15, 0.02, 0.38] },
    },
  ],
  defaultView: { yaw: PI - 0.75, pitch: 0.3, dist: 1.75, target: [0, 0, 0] },
  compareView: { yaw: -1.2, pitch: 0.45, dist: 2.6, target: [-0.6, -0.1, 0.0] },
  shots: [
    { from: { yaw: PI - 0.9, pitch: 0.2, dist: 1.8, target: [0, 0.02, -0.05] }, to: { yaw: PI - 0.25, pitch: 0.3, dist: 1.35, target: [0, 0.03, -0.1] } },
    { from: { yaw: PI + 0.55, pitch: -0.3, dist: 1.1, target: [0, -0.03, -0.2] }, to: { yaw: PI + 1.1, pitch: -0.18, dist: 0.9, target: [0, -0.03, -0.1] } },
    { from: { yaw: PI - 0.5, pitch: 0.3, dist: 0.5, target: [0, 0.14, 0] }, to: { yaw: PI - 1.4, pitch: 0.2, dist: 0.45, target: [0, 0.14, 0.02] } },
    { from: { yaw: 0.8, pitch: 0.25, dist: 1.0, target: [0, 0, 0.4] }, to: { yaw: -0.5, pitch: 0.3, dist: 1.15, target: [0, 0, 0.35] } },
    { from: { yaw: -0.3, pitch: 1.1, dist: 2.0, target: [0, 0, 0] }, to: { yaw: 0.6, pitch: 0.95, dist: 1.7, target: [0, 0, -0.05] } },
  ],
  lights: [
    { pos: [0, 0.222, 0.02], kind: 'strobe', size: 0.0012 },
    { pos: [-0.448, -0.03, 0.485], kind: 'strobe', size: 0.0014 },
    { pos: [0.448, -0.03, 0.485], kind: 'strobe', size: 0.0014 },
    { pos: [-0.113, 0.185, 0.495], kind: 'strobe', size: 0.0011 },
    { pos: [0.113, 0.185, 0.495], kind: 'strobe', size: 0.0011 },
    { pos: [-0.282, -0.02, -0.4], kind: 'port', size: 0.0035 },
    { pos: [0.282, -0.02, -0.4], kind: 'starboard', size: 0.0035 },
    { pos: [0, -0.093, -0.1], kind: 'beacon', size: 0.0028 },
  ],
  floods: [
    { from: [0, 0.2, 0.25], to: [0, 0.08, -0.15], angle: 0.5, intensity: 0.7 },
    { from: [0.32, 0.12, 0.2], to: [0.212, 0.0, -0.25], angle: 0.4, intensity: 0.6 },
    { from: [-0.32, 0.12, 0.2], to: [-0.212, 0.0, -0.25], angle: 0.4, intensity: 0.6 },
    { from: [0, -0.2, 0.3], to: [0, -0.05, -0.2], angle: 0.6, intensity: 0.45 },
  ],
  decals: [
    { text: 'SC-03', pos: [0.212, 0.0262, 0.16], rot: [-PI / 2, 0, 0], size: [0.08, 0.032] },
    { text: 'SC-03', pos: [-0.212, 0.0262, 0.16], rot: [-PI / 2, 0, 0], size: [0.08, 0.032] },
    { text: 'SC-03  WHITE HERON', pos: [0, 0.0615, -0.15], rot: [-PI / 2, 0, 0], size: [0.11, 0.014] },
  ],
  engine: {
    kind: 'nozzle',
    nozzles: [
      // 機関ブロックの 4 つ、胴の後ろの 2 つ、脚の付け根の 2 つ
      ...[-1, 1].flatMap((sx) => [-0.022, 0.032].map((y) => ({ pos: [sx * 0.118, y, 0.555] as Vec3, r: 0.027 }))),
      { pos: [0, -0.022, 0.445], r: 0.022 },
      { pos: [0, 0.028, 0.445], r: 0.022 },
      { pos: [-0.212, -0.034, 0.355], r: 0.024 },
      { pos: [0.212, -0.034, 0.355], r: 0.024 },
    ],
    // 脚の先と、機関ブロックの外側
    rcs: [...rcsPair(0.278, -0.034, -0.42, true), ...rcsPair(0.186, 0.004, 0.49)],
    core: [1.6, 1.9, 2.6],
    outer: [0.35, 0.6, 1.5],
    length: 9,
  },
  glow: { idle: [0.55, 0.85, 1.9], warp: [1.4, 1.9, 3.2] },
  swatch: ['#eef0f2', '#8d96a3', '#d9472b'],
}

const SORAKAZE: ShipSpec = {
  id: 'sorakaze',
  registry: 'LS-04',
  lengthM: 150,
  metersPerUnit: 150 / 0.93,
  turn: 1.35,
  model: 'ship-sorakaze.glb',
  bridgeBase: [0, 0.047, -0.36],
  parts: [
    {
      id: 'blades',
      pos: [0.45, 0, 0.05],
      side: null,
      view: { yaw: PI - 0.5, pitch: 0.5, dist: 1.9, target: [0, 0, 0] },
    },
    {
      id: 'hub',
      pos: [0, 0.06, 0.05],
      side: null,
      view: { yaw: PI - 0.9, pitch: 0.3, dist: 0.5, target: [0, 0, 0.05] },
    },
    {
      id: 'capsule',
      pos: [0, 0.05, -0.32],
      side: null,
      view: { yaw: PI - 0.7, pitch: 0.25, dist: 0.5, target: [0, 0, -0.3] },
    },
    {
      id: 'panels',
      pos: [0.12, 0.01, 0.27],
      side: null,
      view: { yaw: 0.9, pitch: 0.5, dist: 0.55, target: [0.05, 0, 0.27] },
    },
    {
      id: 'ion',
      pos: [0, 0, 0.43],
      side: [0, 0, 1],
      view: { yaw: 0.4, pitch: 0.25, dist: 0.4, target: [0, 0, 0.4] },
    },
  ],
  defaultView: { yaw: PI - 0.7, pitch: 0.35, dist: 2.1, target: [0, 0, 0] },
  compareView: { yaw: -1.2, pitch: 0.42, dist: 6.5, target: [-2.2, -0.2, 0.15] },
  shots: [
    { from: { yaw: PI - 0.9, pitch: 0.25, dist: 2.2, target: [0, 0, 0] }, to: { yaw: PI - 0.2, pitch: 0.35, dist: 1.8, target: [0, 0, -0.05] } },
    { from: { yaw: PI - 0.6, pitch: 0.2, dist: 0.6, target: [0, 0, -0.3] }, to: { yaw: PI - 1.3, pitch: 0.15, dist: 0.55, target: [0, 0, -0.2] } },
    { from: { yaw: 0.2, pitch: 0.05, dist: 2.4, target: [0, 0, 0] }, to: { yaw: -0.3, pitch: 0.1, dist: 2.0, target: [0, 0, 0] } },
    { from: { yaw: 1.4, pitch: 0.9, dist: 1.4, target: [0, 0, 0.1] }, to: { yaw: 0.8, pitch: 0.6, dist: 1.1, target: [0, 0, 0.1] } },
  ],
  lights: [
    { pos: [0, 0.048, -0.25], kind: 'strobe', size: 0.0009 },
    { pos: [0, -0.03, 0.4], kind: 'strobe', size: 0.0009 },
    { pos: [-0.16, 0.002, 0.27], kind: 'port', size: 0.0022 },
    { pos: [0.16, 0.002, 0.27], kind: 'starboard', size: 0.0022 },
  ],
  floods: [
    { from: [0, 0.15, 0.1], to: [0, 0, -0.3], angle: 0.4, intensity: 0.6 },
    { from: [0, -0.12, 0.2], to: [0, 0, 0.05], angle: 0.6, intensity: 0.4 },
  ],
  decals: [
    { text: 'LS-04 SORAKAZE', pos: [0.0465, 0, -0.355], rot: [0, PI / 2, 0], size: [0.08, 0.009] },
    { text: 'LS-04 SORAKAZE', pos: [-0.0465, 0, -0.355], rot: [0, -PI / 2, 0], size: [0.08, 0.009] },
  ],
  engine: {
    kind: 'nozzle',
    // 小さなイオンエンジン 4 つ。青く淡い
    nozzles: [[-0.014, 0], [0.014, 0], [0, -0.014], [0, 0.014]].map(([x, y]) => ({ pos: [x, y, 0.425] as Vec3, r: 0.011 })),
    rcs: [...rcsPair(0.046, 0, -0.35, true), ...rcsPair(0.027, 0, 0.37)],
    core: [0.9, 1.3, 2.6],
    outer: [0.25, 0.45, 1.6],
    length: 10,
  },
  glow: { idle: [0.5, 0.75, 2.2], warp: [1.2, 1.8, 3.5] },
  swatch: ['#f2f2ee', '#c9d4e4', '#e0662f'],
}

const HAKOBUNE: ShipSpec = {
  id: 'hakobune',
  registry: 'HT-05',
  lengthM: 800,
  metersPerUnit: 800 / 1.053,
  turn: 0.7,
  model: 'ship-hakobune.glb',
  bridgeBase: [0, 0.069, -0.42],
  parts: [
    {
      id: 'cab',
      pos: [0, 0.07, -0.42],
      side: null,
      view: { yaw: PI - 0.6, pitch: 0.25, dist: 0.6, target: [0, 0, -0.42] },
    },
    {
      id: 'cargo',
      pos: [0, 0.11, 0],
      side: null,
      view: { yaw: PI - 1.1, pitch: 0.3, dist: 0.95, target: [0, 0, 0] },
    },
    {
      id: 'radiators',
      pos: [0.2, 0.2, 0.2],
      side: null,
      view: { yaw: 0.9, pitch: 0.45, dist: 0.95, target: [0, 0, 0.2] },
    },
    {
      id: 'reactor',
      pos: [0, 0.08, 0.36],
      side: null,
      view: { yaw: 0.7, pitch: 0.3, dist: 0.55, target: [0, 0, 0.37] },
    },
    {
      id: 'nozzle',
      pos: [0, 0.08, 0.5],
      side: [0, 0, 1],
      view: { yaw: 0.45, pitch: 0.2, dist: 0.45, target: [0, 0, 0.48] },
    },
  ],
  defaultView: { yaw: PI - 0.8, pitch: 0.3, dist: 1.7, target: [0, 0, 0] },
  compareView: { yaw: -1.2, pitch: 0.42, dist: 1.7, target: [-0.4, -0.06, 0.04] },
  shots: [
    { from: { yaw: PI - 0.9, pitch: 0.2, dist: 1.7, target: [0, 0, -0.05] }, to: { yaw: PI - 0.3, pitch: 0.3, dist: 1.3, target: [0, 0, -0.1] } },
    { from: { yaw: PI - 1.4, pitch: 0.15, dist: 0.8, target: [0, 0, 0] }, to: { yaw: PI - 1.9, pitch: 0.2, dist: 0.75, target: [0, 0, 0.1] } },
    { from: { yaw: 0.8, pitch: 0.25, dist: 0.9, target: [0, 0, 0.35] }, to: { yaw: -0.4, pitch: 0.3, dist: 1.0, target: [0, 0, 0.35] } },
    { from: { yaw: -0.3, pitch: 1.1, dist: 1.9, target: [0, 0, 0] }, to: { yaw: 0.6, pitch: 0.95, dist: 1.6, target: [0, 0, -0.05] } },
  ],
  lights: [
    { pos: [0.03, 0.102, -0.36], kind: 'strobe', size: 0.0011 },
    { pos: [0, 0.0, 0.545], kind: 'strobe', size: 0.0012 },
    { pos: [-0.077, 0.0, -0.44], kind: 'port', size: 0.003 },
    { pos: [0.077, 0.0, -0.44], kind: 'starboard', size: 0.003 },
    { pos: [0.212, 0.212, 0.26], kind: 'beacon', size: 0.0025 },
    { pos: [-0.212, -0.212, 0.26], kind: 'beacon', size: 0.0025 },
  ],
  floods: [
    { from: [0, 0.25, -0.5], to: [0, 0.05, 0.05], angle: 0.45, intensity: 0.6 },
    { from: [0.25, -0.1, 0.25], to: [0, 0, -0.15], angle: 0.5, intensity: 0.5 },
  ],
  decals: [
    { text: 'HT-05 HAKOBUNE', pos: [0.0755, 0.01, -0.43], rot: [0, PI / 2, 0], size: [0.11, 0.013] },
    { text: 'HT-05 HAKOBUNE', pos: [-0.0755, 0.01, -0.43], rot: [0, -PI / 2, 0], size: [0.11, 0.013] },
  ],
  engine: {
    kind: 'nozzle',
    // 磁気ノズルの輪の奥から、紫がかったプラズマ
    nozzles: [{ pos: [0, 0, 0.45], r: 0.045 }],
    rcs: [...rcsPair(0.076, 0, -0.38, true), ...rcsPair(0.076, 0, 0.38)],
    core: [1.7, 1.6, 2.6],
    outer: [0.75, 0.35, 1.6],
    length: 7,
  },
  glow: { idle: [1.1, 0.6, 2.4], warp: [2.2, 1.4, 3.6] },
  swatch: ['#e5e2da', '#d5782a', '#2f7f86'],
}

const MEGURI: ShipSpec = {
  id: 'meguri',
  registry: 'RS-06',
  lengthM: 100,
  metersPerUnit: 45 / 0.42,
  turn: 1.1,
  model: 'ship-meguri.glb',
  bridgeBase: [0, 0.051, -0.3],
  spinSeconds: 13.5,
  parts: [
    {
      id: 'ring',
      pos: [0.42, 0.06, 0],
      side: null,
      view: { yaw: PI - 0.7, pitch: 0.35, dist: 1.6, target: [0, 0, 0] },
    },
    {
      id: 'modules',
      pos: [-0.42, 0.06, 0],
      side: null,
      view: { yaw: PI + 1.2, pitch: 0.25, dist: 0.6, target: [-0.36, 0, 0] },
    },
    {
      id: 'hub',
      pos: [0, 0.09, 0],
      side: null,
      view: { yaw: PI - 0.5, pitch: 0.3, dist: 0.6, target: [0, 0, 0] },
    },
    {
      id: 'landers',
      pos: [0, 0.112, -0.2],
      side: null,
      view: { yaw: PI - 1.0, pitch: 0.25, dist: 0.6, target: [0, 0, -0.18] },
    },
    {
      id: 'cab',
      pos: [0, 0.06, -0.32],
      side: null,
      view: { yaw: PI - 0.6, pitch: 0.25, dist: 0.45, target: [0, 0, -0.32] },
    },
    {
      id: 'engines',
      pos: [0.14, 0.01, 0.26],
      side: null,
      view: { yaw: 0.5, pitch: 0.3, dist: 0.6, target: [0, 0, 0.36] },
    },
  ],
  defaultView: { yaw: PI - 0.7, pitch: 0.35, dist: 1.8, target: [0, 0, 0] },
  compareView: { yaw: -1.2, pitch: 0.42, dist: 9.5, target: [-3.5, -0.3, 0.2] },
  shots: [
    { from: { yaw: PI - 0.9, pitch: 0.25, dist: 1.8, target: [0, 0, 0] }, to: { yaw: PI - 0.3, pitch: 0.35, dist: 1.5, target: [0, 0, -0.05] } },
    { from: { yaw: PI - 0.5, pitch: 0.2, dist: 0.55, target: [0, 0, -0.2] }, to: { yaw: PI - 1.2, pitch: 0.15, dist: 0.5, target: [0, 0, -0.1] } },
    { from: { yaw: 0.15, pitch: 0.05, dist: 1.6, target: [0, 0, 0] }, to: { yaw: -0.25, pitch: 0.1, dist: 1.4, target: [0, 0, 0] } },
    { from: { yaw: 1.4, pitch: 0.9, dist: 1.4, target: [0, 0, 0.1] }, to: { yaw: 0.8, pitch: 0.6, dist: 1.1, target: [0, 0, 0.1] } },
  ],
  lights: [
    { pos: [0, 0.052, -0.36], kind: 'strobe', size: 0.0008 },
    { pos: [0, 0.058, 0.43], kind: 'strobe', size: 0.0009 },
    { pos: [-0.221, 0.0, 0.255], kind: 'port', size: 0.0022 },
    { pos: [0.221, 0.0, 0.255], kind: 'starboard', size: 0.0022 },
  ],
  floods: [
    { from: [0, 0.18, 0.15], to: [0, 0.0, -0.25], angle: 0.5, intensity: 0.6 },
    { from: [0, -0.15, 0.3], to: [0, 0.0, 0.0], angle: 0.7, intensity: 0.5 },
  ],
  decals: [
    { text: 'RS-06 MEGURI', pos: [0.0565, 0.006, -0.3], rot: [0, PI / 2, 0], size: [0.1, 0.012] },
    { text: 'RS-06 MEGURI', pos: [-0.0565, 0.006, -0.3], rot: [0, -PI / 2, 0], size: [0.1, 0.012] },
  ],
  engine: {
    kind: 'nozzle',
    nozzles: [PI / 2, (7 * PI) / 6, (11 * PI) / 6].map((a) => ({ pos: [0.026 * Math.cos(a), 0.026 * Math.sin(a), 0.475] as Vec3, r: 0.02 })),
    rcs: [...rcsPair(0.04, 0, -0.38, true), ...rcsPair(0.05, 0, 0.4)],
    core: [1.6, 1.9, 2.6],
    outer: [0.35, 0.6, 1.5],
    length: 9,
  },
  glow: { idle: [0.6, 0.8, 2.0], warp: [1.4, 1.9, 3.3] },
  swatch: ['#e9e8e3', '#9097a0', '#d4552a'],
}

const AMATSU: ShipSpec = {
  id: 'amatsu',
  registry: 'SA-07',
  lengthM: 270,
  metersPerUnit: 270 / 1.04,
  turn: 0.85,
  model: 'ship-amatsu.glb',
  bridgeBase: [0, 0.199, -0.006],
  parts: [
    {
      id: 'hull',
      pos: [0.1, -0.04, 0.15],
      side: null,
      view: { yaw: PI / 2 + 0.2, pitch: 0.08, dist: 1.5, target: [0, 0, 0] },
    },
    {
      id: 'telescope',
      pos: [0, 0.012, -0.5],
      side: [0, 0, -1],
      view: { yaw: PI + 0.35, pitch: 0.12, dist: 0.4, target: [0, 0.01, -0.46] },
    },
    {
      id: 'domes',
      pos: [0, 0.09, -0.2],
      side: [0, 1, 0],
      view: { yaw: PI - 0.6, pitch: 0.4, dist: 0.6, target: [0, 0.05, -0.2] },
    },
    {
      id: 'bridge',
      pos: [0, 0.235, 0.04],
      side: null,
      view: { yaw: PI - 0.7, pitch: 0.25, dist: 0.55, target: [0, 0.15, 0.03] },
    },
    {
      id: 'stack',
      pos: [0, 0.11, 0.15],
      side: null,
      view: { yaw: 0.9, pitch: 0.35, dist: 0.5, target: [0, 0.08, 0.14] },
    },
    {
      id: 'engine',
      pos: [0, 0.05, 0.5],
      side: [0, 0, 1],
      view: { yaw: 0.4, pitch: 0.2, dist: 0.5, target: [0, 0, 0.45] },
    },
  ],
  defaultView: { yaw: PI - 0.9, pitch: 0.25, dist: 1.6, target: [0, 0.03, 0] },
  compareView: { yaw: -1.2, pitch: 0.42, dist: 3.4, target: [-1.0, -0.08, 0.05] },
  shots: [
    { from: { yaw: PI - 1.0, pitch: 0.15, dist: 1.6, target: [0, 0.03, -0.05] }, to: { yaw: PI - 0.4, pitch: 0.25, dist: 1.3, target: [0, 0.03, -0.1] } },
    { from: { yaw: PI / 2 + 0.1, pitch: 0.05, dist: 1.4, target: [0, 0.02, 0] }, to: { yaw: PI / 2 - 0.2, pitch: 0.1, dist: 1.3, target: [0, 0.02, 0.05] } },
    { from: { yaw: PI - 0.6, pitch: 0.3, dist: 0.5, target: [0, 0.15, 0] }, to: { yaw: PI - 1.4, pitch: 0.2, dist: 0.45, target: [0, 0.15, 0.02] } },
    { from: { yaw: 0.7, pitch: 0.2, dist: 1.0, target: [0, 0, 0.35] }, to: { yaw: -0.5, pitch: 0.3, dist: 1.1, target: [0, 0, 0.3] } },
  ],
  lights: [
    { pos: [0, 0.2635, 0.058], kind: 'strobe', size: 0.0011 },
    { pos: [0, 0.035, 0.47], kind: 'strobe', size: 0.0011 },
    { pos: [-0.1, 0.034, 0.05], kind: 'port', size: 0.003 },
    { pos: [0.1, 0.034, 0.05], kind: 'starboard', size: 0.003 },
    { pos: [0, -0.087, 0.1], kind: 'beacon', size: 0.0026 },
  ],
  floods: [
    { from: [0, 0.06, -0.3], to: [0, 0.14, 0.0], angle: 0.45, intensity: 0.7 },
    { from: [0.25, 0.1, 0.1], to: [0, 0.0, -0.2], angle: 0.5, intensity: 0.5 },
    { from: [-0.25, 0.1, 0.1], to: [0, 0.0, -0.2], angle: 0.5, intensity: 0.5 },
  ],
  decals: [
    { text: 'SA-07  AMATSUKAZE', pos: [0.069, 0.012, -0.3], rot: [0, PI / 2, 0], size: [0.11, 0.012] },
    { text: 'SA-07  AMATSUKAZE', pos: [-0.069, 0.012, -0.3], rot: [0, -PI / 2, 0], size: [0.11, 0.012] },
  ],
  engine: {
    kind: 'nozzle',
    // 大きな主噴射口と、左右の補助噴射口。外側の光は噴射口の色に合わせて暖かく
    nozzles: [
      { pos: [0, 0, 0.52], r: 0.05 },
      { pos: [-0.055, -0.012, 0.49], r: 0.018 },
      { pos: [0.055, -0.012, 0.49], r: 0.018 },
    ],
    rcs: [...rcsPair(0.086, 0, -0.36, true), ...rcsPair(0.06, 0, 0.32)],
    core: [1.9, 1.8, 2.2],
    outer: [1.2, 0.55, 0.35],
    length: 7,
  },
  glow: { idle: [1.8, 0.95, 0.45], warp: [2.6, 1.9, 1.3] },
  swatch: ['#c3c7cc', '#2d3a50', '#b8904c'],
}

/** アルカディアの模型の座標：Blender のメートル (x, y, z) を three.js の模型の座標へ（tools/blender/build_arcadia.py の S） */
const AS = 1.04 / 1252
const am = (x: number, y: number, z: number): Vec3 => [x * AS, z * AS, -y * AS]

const ARCADIA: ShipSpec = {
  id: 'arcadia',
  registry: 'MC-09',
  lengthM: 1200,
  metersPerUnit: 1 / AS,
  turn: 0.6,
  model: 'ship-arcadia.glb',
  bridgeBase: am(0, -160, 98),
  parts: [
    {
      id: 'prongs',
      pos: am(0, 420, 10),
      side: [0, 1, 0],
      view: { yaw: PI + 0.5, pitch: 0.35, dist: 0.55, target: am(0, 380, 0) },
    },
    {
      id: 'bridge',
      pos: am(0, -190, 140),
      side: null,
      view: { yaw: PI - 0.7, pitch: 0.3, dist: 0.45, target: am(0, -190, 100) },
    },
    {
      id: 'pods',
      pos: am(130, -170, 0),
      side: [1, 0, 0],
      view: { yaw: PI / 2 + 0.4, pitch: 0.15, dist: 0.6, target: am(98, -150, 0) },
    },
    {
      id: 'wings',
      pos: am(150, -380, 75),
      side: null,
      view: { yaw: 0.9, pitch: 0.45, dist: 0.8, target: am(80, -350, 30) },
    },
    {
      id: 'engine',
      pos: am(0, -600, 40),
      side: [0, 0, 1],
      view: { yaw: 0.45, pitch: 0.2, dist: 0.55, target: am(0, -560, 0) },
    },
  ],
  defaultView: { yaw: PI - 0.85, pitch: 0.3, dist: 1.6, target: [0, 0.02, 0] },
  compareView: { yaw: -1.2, pitch: 0.42, dist: 3.4, target: [-1.0, -0.08, 0.05] },
  shots: [
    { from: { yaw: PI - 1.0, pitch: 0.2, dist: 1.6, target: [0, 0.02, -0.05] }, to: { yaw: PI - 0.4, pitch: 0.3, dist: 1.3, target: [0, 0.02, -0.1] } },
    { from: { yaw: PI / 2 + 0.1, pitch: 0.05, dist: 1.4, target: [0, 0.02, 0] }, to: { yaw: PI / 2 - 0.2, pitch: 0.12, dist: 1.3, target: [0, 0.02, 0.05] } },
    { from: { yaw: PI + 0.4, pitch: 0.35, dist: 0.6, target: am(0, 380, 0) }, to: { yaw: PI - 0.2, pitch: 0.25, dist: 0.5, target: am(0, 300, 0) } },
    { from: { yaw: 0.7, pitch: 0.25, dist: 1.0, target: [0, 0, 0.35] }, to: { yaw: -0.5, pitch: 0.3, dist: 1.1, target: [0, 0, 0.3] } },
  ],
  lights: [
    { pos: am(0, -150, 176), kind: 'strobe', size: 0.0011 },
    { pos: am(0, -500, 66), kind: 'strobe', size: 0.0011 },
    { pos: am(-133, -400, 36), kind: 'port', size: 0.003 },
    { pos: am(133, -400, 36), kind: 'starboard', size: 0.003 },
    { pos: am(0, -100, -73), kind: 'beacon', size: 0.0026 },
  ],
  floods: [
    { from: am(0, 300, 40), to: am(0, -150, 90), angle: 0.45, intensity: 0.7 },
    { from: am(260, -100, 120), to: am(0, 150, 0), angle: 0.5, intensity: 0.5 },
    { from: am(-260, -100, 120), to: am(0, 150, 0), angle: 0.5, intensity: 0.5 },
  ],
  decals: [
    { text: 'MC-09  ARCADIA', pos: am(132.7, -175, 4), rot: [0, PI / 2, 0], size: [0.085, 0.0065] },
    { text: 'MC-09  ARCADIA', pos: am(-132.7, -175, 4), rot: [0, -PI / 2, 0], size: [0.085, 0.0065] },
  ],
  engine: {
    kind: 'nozzle',
    // 主噴射口 4 つ（2 × 2）と、下の補助噴射口 2 つ
    nozzles: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ pos: am(sx * 36, -614, sz * 25), r: 23 * AS }))),
      { pos: am(-70, -625, -48), r: 13 * AS },
      { pos: am(70, -625, -48), r: 13 * AS },
    ],
    rcs: [...rcsPair(60 * AS, 0, -360 * AS, true), ...rcsPair(100 * AS, 40 * AS, 500 * AS)],
    core: [1.6, 1.9, 2.6],
    outer: [0.35, 0.6, 1.5],
    length: 8,
  },
  glow: { idle: [0.6, 0.8, 2.0], warp: [1.4, 1.9, 3.3] },
  swatch: ['#c3c6d2', '#8a1b27', '#232835'],
}

export const SHIPS: ShipSpec[] = [SV01, HERON, SORAKAZE, HAKOBUNE, MEGURI, AMATSU, ARCADIA]
export const SHIP_IDS = SHIPS.map((s) => s.id)

export const shipSpec = (id: ShipId) => SHIPS.find((s) => s.id === id) ?? SV01
/** 今乗っている船（描画のたびに読む所向け） */
export const currentShip = () => shipSpec(useStore.getState().settings.ship)
/** 今乗っている船（React 向け。替えたら描き直す） */
export const useShip = () => shipSpec(useStore((s) => s.settings.ship))

/** 大きさくらべの模型は SV-01 の座標で作ってあるので、ほかの船ではこの倍率で拡大・縮小する */
export const compareScale = (spec: ShipSpec) => METERS_PER_UNIT / spec.metersPerUnit

export const shipLabel = (spec: ShipSpec) => `${spec.registry} ${ui().ships[spec.id].name}`
