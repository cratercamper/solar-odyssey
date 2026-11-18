import { create } from 'zustand'
import * as THREE from 'three'
import type { EvaTool } from './eva'
import { evaSite, hullNormal, hullPoint, hullRoll, type EvaSiteId } from '../components/eva/hull'

// 修理ミッション：船外に出るたびに、外壁のあちこちに故障が 3 つ出る（光の柱が目印）。
// それぞれ 2〜4 手順で、手順ごとに正しいツールに付け替えて E 長押しで作業する。
// 「取る」手順は、エアロックのそばの部品棚から当て板やセンサーを運んでくる。
// 終わると作業記録のカード（作業の中身と、本当の宇宙での船外作業の豆知識）が出て、記録に残る。

export type JobType = 'hole' | 'panel' | 'cable' | 'antenna' | 'radiator' | 'sensor'
export type Carry = 'patch' | 'sensor'

export type JobStep = {
  tool: EvaTool
  sec: number
  /** 'fetch' = 部品棚で取る、'place' = 運んだ部品を付ける */
  kind?: 'fetch' | 'place'
  carry?: Carry
}

/** JobStep の文言（日本語は src/i18n/evaJobs.ja.ts、英語は evaJobs.en.ts） */
export type JobStepText = {
  /** 手順の説明 */
  text: string
}

export type JobDef = {
  steps: JobStep[]
}

/** JobDef の文言（日本語は src/i18n/evaJobs.ja.ts、英語は evaJobs.en.ts） */
export type JobText = {
  name: string
  steps: JobStepText[]
  note: string
}

export const JOB_TYPES: JobType[] = ['hole', 'panel', 'cable', 'antenna', 'radiator', 'sensor']

export const JOBS: Record<JobType, JobDef> = {
  hole: {
    steps: [
      { tool: 'cutter', sec: 2.2 },
      { tool: 'pad', sec: 0.8, kind: 'fetch', carry: 'patch' },
      { tool: 'pad', sec: 1.0, kind: 'place', carry: 'patch' },
      { tool: 'welder', sec: 3.0 },
    ],
  },
  panel: {
    steps: [
      { tool: 'pad', sec: 1.6 },
      { tool: 'drill', sec: 2.4 },
    ],
  },
  cable: {
    steps: [
      { tool: 'cutter', sec: 1.4 },
      { tool: 'hand', sec: 2.0 },
    ],
  },
  antenna: {
    steps: [
      { tool: 'drill', sec: 1.4 },
      { tool: 'hand', sec: 2.6 },
      { tool: 'drill', sec: 1.4 },
    ],
  },
  radiator: {
    steps: [
      { tool: 'drill', sec: 1.6 },
      { tool: 'welder', sec: 3.2 },
    ],
  },
  sensor: {
    steps: [
      { tool: 'drill', sec: 1.6 },
      { tool: 'hand', sec: 1.2 },
      { tool: 'hand', sec: 0.8, kind: 'fetch', carry: 'sensor' },
      { tool: 'hand', sec: 1.2, kind: 'place', carry: 'sensor' },
    ],
  },
}

// ---- 場所：外壁の上の局所座標（OnHull と同じ：外壁の点が原点、外向きが +Y、前が -Z、theta の増える向きが +X） ----

export type JobSite = { th: number; z: number }

/** 種類ごとの置き場所の候補（手すり・窓・アンテナ・放熱板にかぶらない所） */
const HULL_SITES: Record<JobType, JobSite[]> = {
  hole: [
    { th: 0.16, z: -9 },
    { th: -0.22, z: 7 },
  ],
  panel: [
    { th: -0.14, z: -20 },
    { th: 0.2, z: 19 },
  ],
  cable: [
    { th: 0.11, z: 4.5 },
    { th: -0.12, z: -11 },
  ],
  antenna: [
    { th: 0.34, z: -6 },
    { th: -0.3, z: 24 },
  ],
  // 放熱板（EvaWorld の Details：theta ±1.12、z 12 / 22 / 32）の上向きの面
  radiator: [
    { th: 1.12, z: 12 },
    { th: -1.12, z: 22 },
  ],
  sensor: [
    { th: -0.18, z: 13 },
    { th: 0.24, z: -27 },
  ],
}

/** 平らな場所（th は x の m）。アルカディア：レール（x ±3.7〜5.3）と誘導灯（±7.2）をよけ、壁（±15〜18）の手前 */
const ARCADIA_SITES: Record<JobType, JobSite[]> = {
  hole: [
    { th: 10.5, z: -9 },
    { th: -11, z: 7 },
  ],
  panel: [
    { th: 1.8, z: -18 },
    { th: -11.5, z: 19 },
  ],
  cable: [
    { th: 2.2, z: 5 },
    { th: -2.2, z: -11 },
  ],
  antenna: [
    { th: 11.5, z: -6 },
    { th: -11.5, z: 28 },
  ],
  // 壁ぎわに立てた放熱板（EvaWorld が置く）
  radiator: [
    { th: 12.5, z: 13 },
    { th: -12.5, z: 22 },
  ],
  sensor: [
    { th: -10, z: 13 },
    { th: 10.5, z: -27 },
  ],
}

/** 天の湊のリングの下面（x は外へ向かう m、ふちは ±110） */
const DOCK_SITES: Record<JobType, JobSite[]> = {
  hole: [
    { th: 7, z: -9 },
    { th: -9, z: 7 },
  ],
  panel: [
    { th: -6, z: -20 },
    { th: 9, z: 19 },
  ],
  cable: [
    { th: 3, z: 4.5 },
    { th: -3, z: -11 },
  ],
  antenna: [
    { th: 12, z: -6 },
    { th: -12, z: 24 },
  ],
  radiator: [
    { th: -14, z: 12 },
    { th: 14, z: 22 },
  ],
  sensor: [
    { th: -5, z: 13 },
    { th: 6, z: -27 },
  ],
}

const SITE_JOBS: Record<Exclude<EvaSiteId, 'ship'>, { jobs: Record<JobType, JobSite[]>; rack: JobSite }> = {
  hull: { jobs: HULL_SITES, rack: { th: -0.13, z: 1.8 } },
  arcadia: { jobs: ARCADIA_SITES, rack: { th: -2.3, z: 2.2 } },
  dock: { jobs: DOCK_SITES, rack: { th: -3.4, z: 1.8 } },
}

/** いまの作業場所の、依頼の置き場所の候補 */
/** 母船のまわりを自由に飛ぶとき（ship）は修理の依頼がない。呼ばれたときは外壁の分を返す */
const siteJobs = () => SITE_JOBS[evaSite.id === 'ship' ? 'hull' : evaSite.id]

export const jobSites = () => siteJobs().jobs

/** 放熱板の置き場所（外壁の場面では、もとからある放熱板を使う） */
export const radiatorFins = () => (evaSite.id === 'hull' || evaSite.id === 'ship' ? [] : siteJobs().jobs.radiator)

/** 種類ごとの、作業する点（局所座標）、近づく向き（局所）、ツムギの上の向き（局所） */
export function workSpot(type: JobType, site: JobSite) {
  const sx = site.th > 0 ? -1 : 1
  switch (type) {
    case 'hole':
      return { p: new THREE.Vector3(0, 0.01, 0), a: new THREE.Vector3(0, 1, 0) }
    case 'panel':
      return { p: new THREE.Vector3(0, 0.05, 0), a: new THREE.Vector3(0, 1, 0) }
    case 'cable':
      return { p: new THREE.Vector3(0, 0.12, -0.14), a: new THREE.Vector3(0, 0.35, -1).normalize() }
    case 'antenna':
      return { p: new THREE.Vector3(0, 0.95, 0), a: new THREE.Vector3(-sx, 0, 0) }
    case 'radiator':
      // 放熱板の上向きの面（外壁の上のほう＝エアロックの側を向いた面）
      return { p: new THREE.Vector3(sx * 0.045, 1.25, -1.2), a: new THREE.Vector3(sx, 0, 0) }
    case 'sensor':
      return { p: new THREE.Vector3(0, 0.14, 0), a: new THREE.Vector3(0, 1, 0) }
  }
}

export const RACK_SPOT = { p: new THREE.Vector3(0, 0.62, 0.15), a: new THREE.Vector3(0, 1, 0) }

/** 外壁の上の局所座標 → 世界の座標の行列 */
export function hullFrame(site: JobSite, out = new THREE.Matrix4()) {
  const p = hullPoint(site.th, site.z)
  return out.makeRotationZ(hullRoll(site.th)).setPosition(p)
}

// ---- 進み具合（毎フレーム書き換えるので React の外） --------------------------------------------

export type JobRt = {
  type: JobType
  site: JobSite
  /** 今の手順（steps.length なら完了） */
  step: number
  /** 今の手順の進み（0..1） */
  prog: number
  /** 作業する点・近づく向き・ツムギの上の向き（世界の座標） */
  P: THREE.Vector3
  A: THREE.Vector3
  U: THREE.Vector3
  /** 溶接・切断の熱（見た目） */
  heat: number
}

export const jobsRt: { list: JobRt[]; carrying: Carry | null; rackTaken: Record<Carry, number> } = {
  list: [],
  carrying: null,
  rackTaken: { patch: 0, sensor: 0 },
}

export const jobDone = (j: JobRt) => j.step >= JOBS[j.type].steps.length
/** 手順 i の進み（済み 1、まだ 0） */
export const stepU = (j: JobRt, i: number) => (j.step > i ? 1 : j.step === i ? j.prog : 0)

function makeRt(type: JobType, site: JobSite): JobRt {
  const spot = workSpot(type, site)
  const m = hullFrame(site)
  const q = new THREE.Quaternion().setFromRotationMatrix(m)
  return {
    type,
    site,
    step: 0,
    prog: 0,
    P: spot.p.clone().applyMatrix4(m),
    A: spot.a.clone().applyQuaternion(q).normalize(),
    U: hullNormal(site.th),
    heat: 0,
  }
}

/** 部品棚（エアロックの左）。作業場所が決まったら置き直す */
export const rackRt = { site: { th: -0.13, z: 1.8 } as JobSite, P: new THREE.Vector3(), A: new THREE.Vector3(), U: new THREE.Vector3() }

function placeRack() {
  const site = siteJobs().rack
  const m = hullFrame(site)
  const q = new THREE.Quaternion().setFromRotationMatrix(m)
  rackRt.site = site
  rackRt.P.copy(RACK_SPOT.p).applyMatrix4(m)
  rackRt.A.copy(RACK_SPOT.a).applyQuaternion(q)
  hullNormal(site.th, rackRt.U)
}
placeRack()

// ---- ツムギとのやりとり（Tsumugi が書く：ツールの先・体。EvaJobs が書く：寄せる先・作業中か） ----------

export const workLink = {
  /** ツールの先（世界） */
  tip: new THREE.Vector3(),
  /** ツールの先（ツムギの体の座標） */
  tipLocal: new THREE.Vector3(0, -0.3, -0.5),
  /** 右手首の行列（運んでいる部品を持たせる） */
  wrist: new THREE.Matrix4(),
  body: new THREE.Vector3(),
  /** 作業の場所へ体を寄せる */
  assist: false,
  P: new THREE.Vector3(),
  A: new THREE.Vector3(0, 1, 0),
  U: new THREE.Vector3(0, 1, 0),
  /** 正しいツールが当たって、作業が進んでいる（火花・削りかす） */
  contact: false,
  /** これより前は にっこり */
  happyUntil: 0,
}

// ---- 画面に出す分（ときどき書き換える） ------------------------------------------------------

export type JobUi = {
  /** 3 つの依頼：種類、今の手順、完了 */
  jobs: { type: JobType; step: number; done: boolean; x: number; z: number }[]
  /** いま注目している依頼（近い順、運んでいるときは付ける先） */
  focus: number
  /** 注目している依頼までの距離 m（作業する所、または部品棚） */
  dist: number
  /** 手が届く */
  near: boolean
  /** ツールが違う（正しいツール） */
  need: EvaTool | null
  prog: number
  /** 部品棚へ行く */
  toRack: boolean
}

type JobsState = {
  ui: JobUi
  carrying: Carry | null
  /** 完了カード（依頼の番号） */
  card: number | null
  /** 運んでいるあいだはツールを付け替えられない、と伝えた時刻 */
  blockedAt: number
  /** 当番を作り直すたびに増える（光の柱や故障の模型を作り直す） */
  shift: number
}

const emptyUi: JobUi = { jobs: [], focus: -1, dist: 0, near: false, need: null, prog: 0, toRack: false }

export const useEvaJobs = create<JobsState>(() => ({ ui: emptyUi, carrying: null, card: null, blockedAt: 0, shift: 0 }))

// ---- 作業記録（種類ごとに直した回数。ブラウザに残す） ------------------------------------------

const LOG_KEY = 'solar-voyager:eva-log'

function readLog(): Partial<Record<JobType, number>> {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export const useEvaLog = create<{ log: Partial<Record<JobType, number>>; add: (t: JobType) => void }>((set, get) => ({
  log: readLog(),
  add: (t) => {
    const log = { ...get().log, [t]: (get().log[t] ?? 0) + 1 }
    set({ log })
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(log))
    } catch {
      // 保存できなくても遊べる
    }
  },
}))

/** 新しい当番：まだ直したことのない種類を優先して 3 つ選ぶ */
export function newShift(rnd = Math.random) {
  const log = useEvaLog.getState().log
  const fresh = JOB_TYPES.filter((t) => !log[t]).sort(() => rnd() - 0.5)
  const old = JOB_TYPES.filter((t) => log[t]).sort(() => rnd() - 0.5)
  // 母船のまわりを自由に飛ぶときは、依頼なし
  const types = evaSite.id === 'ship' ? [] : [...fresh, ...old].slice(0, 3)
  placeRack()
  jobsRt.list = types.map((t) => {
    const c = jobSites()[t]
    return makeRt(t, c[Math.floor(rnd() * c.length)])
  })
  jobsRt.carrying = null
  jobsRt.rackTaken = { patch: 0, sensor: 0 }
  useEvaJobs.setState({ ui: emptyUi, carrying: null, card: null, blockedAt: 0, shift: useEvaJobs.getState().shift + 1 })
}

/** テスト用（#debug） */
export const evaJobsDebug = {
  list: () => jobsRt.list.map((j) => ({ type: j.type, step: j.step, P: j.P.toArray(), A: j.A.toArray() })),
  rack: () => rackRt.P.toArray(),
  /** 依頼を選んで当番を作り直す */
  set: (types: JobType[], siteIdx = 0) => {
    placeRack()
    jobsRt.list = types.map((t) => makeRt(t, jobSites()[t][siteIdx % jobSites()[t].length]))
    jobsRt.carrying = null
    jobsRt.rackTaken = { patch: 0, sensor: 0 }
    useEvaJobs.setState({ ui: emptyUi, carrying: null, card: null, shift: useEvaJobs.getState().shift + 1 })
  },
  /** 依頼 i を手順 step まで進める */
  advance: (i: number, step: number) => {
    const j = jobsRt.list[i]
    if (!j) return
    j.step = step
    j.prog = 0
  },
}
