import type { Amounts, RareId, Resource, UpgradeId } from '../data/pioneer'
import type { JobKind } from '../data/delivery'

// 開拓の手応えの合図（音・光・数字の演出が聞く）。ゲームの決まりとは別にしておく

export type PioneerFx =
  | { kind: 'pickup'; resource: Resource; amount: number }
  | { kind: 'full' }
  | { kind: 'deliver'; amounts: Amounts; ready: boolean }
  | { kind: 'upgrade'; id: UpgradeId; level: number }
  | { kind: 'rare'; id: RareId; amount: number }
  | { kind: 'daily'; reward: Amounts }
  /** 配達：積んだ・途中で降ろした（at は行き先の id） */
  | { kind: 'jobLoad'; job: JobKind; at: string; walk?: boolean }
  | { kind: 'jobDrop'; job: JobKind; at: string; walk?: boolean }
  /** 配達：届け終えた */
  | { kind: 'jobDone'; job: JobKind; stars: number; kept: boolean; fast: boolean; reward: Amounts; seconds: number; target: number }

const listeners = new Set<(e: PioneerFx) => void>()

export function onPioneerFx(f: (e: PioneerFx) => void) {
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}

export function emitPioneerFx(e: PioneerFx) {
  for (const f of listeners) f(e)
}

/** 船の画面上の位置（px）。PioneerScene が毎フレーム書く。数字をここから浮かべる */
export const shipOnScreen = { x: 0, y: 0, visible: false }

/** ガスを集めているところか（PioneerScene が書き、音とメーターが読む） */
export const gasFx = { collecting: false }

/** 建設の場面の時計（秒）。カメラ（BuildCinema）が進め、形の伸び・字幕・重力のメーターが読む。1 つにそろえて、ずれないように */
export const cinemaClock = { t: 0 }
