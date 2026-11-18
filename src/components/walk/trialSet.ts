// 公園の人を別の素材で試す（確認中。URL に ?mobset=rocketbox または ?mobset=quaternius）
export type MobSet = 'rocketbox' | 'quaternius'
export const MOB_SET: MobSet | null = (() => {
  if (typeof location === 'undefined') return null
  const m = /[?&#]mobset=(rocketbox|quaternius)\b/.exec(location.search + location.hash)
  return m ? (m[1] as MobSet) : null
})()
