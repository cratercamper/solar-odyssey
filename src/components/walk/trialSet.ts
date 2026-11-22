// 公園の人の素材。ふだんは Rocketbox。見比べ用に URL に ?mobset=makehuman（前の人）・?mobset=quaternius
export type MobSet = 'rocketbox' | 'makehuman' | 'quaternius'
export const MOB_SET: MobSet = (() => {
  if (typeof location === 'undefined') return 'rocketbox'
  const m = /[?&#]mobset=(rocketbox|makehuman|quaternius)\b/.exec(location.search + location.hash)
  return m ? (m[1] as MobSet) : 'rocketbox'
})()
