import { create } from 'zustand'
import { freshWater, type Water } from '../data/water'

// 水のコップの実験：地表で「水を置いてみる」を押すと、目の前の台に水の入ったコップを置く。
// その星の気温と気圧で、凍る・沸く・消える（data/water.ts）。場面は components/surface/WaterCup.tsx、
// 上のカードは WaterCupPanel.tsx

type CupState = {
  /** 置いた星（置いていなければ null） */
  id: string | null
  /** 置いた時刻（ミリ秒、performance.now） */
  at: number
  /** いまの水（カードの表示用。場面が 1 秒に数回書く） */
  water: Water
  /** まわりの温度（℃） */
  env: number
  /** 画面の 1 秒が、星の上の何秒か */
  sim: number
}

export const useWaterCup = create<CupState>(() => ({ id: null, at: 0, water: freshWater(), env: 20, sim: 60 }))

export function placeCup(id: string) {
  useWaterCup.setState({ id, at: performance.now(), water: freshWater() })
}

export const removeCup = () => useWaterCup.setState({ id: null })
