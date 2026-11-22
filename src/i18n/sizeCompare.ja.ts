// 大きさくらべ（ui/SizeCompare.tsx）の文言（日本語）

const n = (v: number) => v.toLocaleString('ja-JP', { maximumFractionDigits: 1 })

export const sizeCompareJa = {
  title: '大きさくらべ',
  navButton: '大きさくらべ',
  open3d: '🌍 3Dでくらべる',
  /** 大きいほうの直径に、小さいほうがいくつならぶか */
  across: (big: string, small: string, count: number) => `${big}の直径に、${small}が約${n(count)}個ならぶ`,
  picks: 'くらべる星',
  tapHint: 'さわると近づきます',
  back: '全体にもどる',
  close: '閉じる',
  diameter: (km: number) => (km >= 100 ? `${Math.round(km).toLocaleString('ja-JP')} km` : `${n(km)} km`),
}
