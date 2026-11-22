// 探査機の旅。日付と、通った天体は本物。あいだの道すじは、天体どうしを太陽のまわりの弧でつないだ、おおよその形。
// 最後の天体のあとは、その日から本物の向きと速さでまっすぐ進む（太陽の重力をふり切ったあとは、ほぼまっすぐ飛ぶ）。

import type { Trajectory } from './trajectory'
import { VOYAGER2_TRAJECTORY } from './trajectories/voyager2'
import { HAYABUSA2_TRAJECTORY } from './trajectories/hayabusa2'
import { CASSINI_TRAJECTORY } from './trajectories/cassini'

export type ProbeStop = {
  date: string
  /** そこにいた天体（惑星の id か 'ryugu'） */
  body: string
  /** この日まで、その天体と一緒に動く（土星を回ったカッシーニ、リュウグウにいたはやぶさ2） */
  until?: string
}

export type Probe = {
  id: string
  color: string
  stops: ProbeStop[]
  /** 最後の天体のあと、まっすぐ進む向き（黄経・黄緯、度）と速さ（天文単位／年） */
  escape?: { lon: number; lat: number; auPerYear: number }
  /** 旅の再生をここで終える（ないものは今日まで） */
  end?: string
  /** 再生の速さ（1秒に何年）。最後の天体を過ぎたら fast にする */
  pace: { slow: number; fast: number }
  /** 今の、太陽からの本物の距離を求める基準（天文単位） */
  distance?: { date: string; au: number; auPerYear: number }
  events: { date: string }[]
  /** 本物の道すじ（JPL Horizons の値）。あるものは、弧のかわりにこれをたどり、右に探査機の模型を出す */
  trajectory?: Trajectory
  /** 模型（public/models の glb）。ボイジャーは NASA 3D Resources のもの、はやぶさ2は写真をもとにしたオリジナルの再現 */
  model?: string
}

/** Probe の文言（日本語は src/i18n/probes.ja.ts、英語は probes.en.ts） */
export type ProbeText = {
  name: string
  /** 一覧に出す一言 */
  summary: string
  events: { text: string }[]
  /** 旅の終わりに出す一言（今も飛んでいるものは、今の距離を足す） */
  last: string
}

export const RYUGU_ID = 'ryugu'

export const PROBES: Probe[] = [
  {
    id: 'voyager2',
    color: '#b59cff',
    stops: [
      { date: '1977-08-20', body: 'earth' },
      { date: '1979-07-09', body: 'jupiter' },
      { date: '1981-08-25', body: 'saturn' },
      { date: '1986-01-24', body: 'uranus' },
      { date: '1989-08-25', body: 'neptune' },
    ],
    escape: { lon: 290.7, lat: -35.8, auPerYear: 3.25 },
    pace: { slow: 0.55, fast: 3.5 },
    distance: { date: '2018-11-05', au: 119, auPerYear: 3.25 },
    trajectory: VOYAGER2_TRAJECTORY,
    model: 'probe-voyager.glb',
    events: [
      { date: '1977-08-20' },
      { date: '1979-07-09' },
      { date: '1981-08-25' },
      { date: '1986-01-24' },
      { date: '1989-08-25' },
      { date: '2018-11-05' },
    ],
  },
  {
    id: 'voyager1',
    color: '#6fd0ff',
    stops: [
      { date: '1977-09-05', body: 'earth' },
      { date: '1979-03-05', body: 'jupiter' },
      { date: '1980-11-12', body: 'saturn' },
    ],
    escape: { lon: 255.6, lat: 34.8, auPerYear: 3.57 },
    pace: { slow: 0.32, fast: 4 },
    distance: { date: '2012-08-25', au: 121.6, auPerYear: 3.57 },
    events: [
      { date: '1977-09-05' },
      { date: '1979-03-05' },
      { date: '1980-11-12' },
      { date: '1990-02-14' },
      { date: '2012-08-25' },
    ],
  },
  {
    id: 'cassini',
    color: '#ffd27a',
    stops: [
      { date: '1997-10-15', body: 'earth' },
      { date: '1998-04-26', body: 'venus' },
      { date: '1999-06-24', body: 'venus' },
      { date: '1999-08-18', body: 'earth' },
      { date: '2000-12-30', body: 'jupiter' },
      { date: '2004-07-01', body: 'saturn', until: '2017-09-15' },
    ],
    // 土星の大気へ飛びこんだ時刻（Horizons の値の最後）
    end: '2017-09-15T10:30:50Z',
    pace: { slow: 0.37, fast: 2 },
    events: [
      { date: '1997-10-15' },
      { date: '1998-04-26' },
      { date: '1999-06-24' },
      { date: '1999-08-18' },
      { date: '2000-12-30' },
      { date: '2004-07-01' },
      { date: '2004-12-25' },
      { date: '2005-01-14' },
      { date: '2005-07-14' },
      { date: '2017-04-26' },
      { date: '2017-09-15' },
    ],
    trajectory: CASSINI_TRAJECTORY,
    model: 'probe-cassini.glb',
  },
  {
    id: 'newhorizons',
    color: '#7ee08a',
    stops: [
      { date: '2006-01-19', body: 'earth' },
      { date: '2007-02-28', body: 'jupiter' },
      { date: '2015-07-14', body: 'pluto' },
    ],
    escape: { lon: 286, lat: 2, auPerYear: 2.9 },
    pace: { slow: 0.6, fast: 2 },
    distance: { date: '2019-01-01', au: 43.4, auPerYear: 2.9 },
    events: [
      { date: '2006-01-19' },
      { date: '2007-02-28' },
      { date: '2015-07-14' },
      { date: '2019-01-01' },
    ],
  },
  {
    id: 'hayabusa2',
    color: '#ff9a7a',
    stops: [
      { date: '2014-12-03', body: 'earth' },
      { date: '2015-12-03', body: 'earth' },
      { date: '2018-06-27', body: RYUGU_ID, until: '2019-11-13' },
      { date: '2020-12-06', body: 'earth' },
    ],
    end: '2020-12-09',
    pace: { slow: 0.25, fast: 0.25 },
    trajectory: HAYABUSA2_TRAJECTORY,
    model: 'probe-hayabusa2.glb',
    events: [
      { date: '2014-12-03' },
      { date: '2015-12-03' },
      { date: '2018-06-27' },
      { date: '2019-02-22' },
      { date: '2019-07-11' },
      { date: '2019-11-13' },
    ],
  },
]

/** リュウグウの軌道要素（2011年12月12日の値） */
export const RYUGU = { epoch: '2011-12-12', a: 1.1896, e: 0.1902, i: 5.8837, node: 251.62, peri: 211.43, M: 3.9832, periodDays: 474 }

/** 日付（その日の正午、世界時）。時刻まであるもの（2017-09-15T10:30:50Z）は、その時刻 */
export const dateMs = (iso: string) => Date.parse(iso.includes('T') ? iso : `${iso}T12:00:00Z`)
