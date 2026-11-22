import type { Translation } from './translation'
import type { sizeCompareJa } from './sizeCompare.ja'

// Size comparison (ui/SizeCompare.tsx), English

const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 })

export const sizeCompareEn: Translation<typeof sizeCompareJa> = {
  title: 'Size comparison',
  navButton: 'Compare sizes',
  open3d: '🌍 Compare in 3D',
  across: (big: string, small: string, count: number) => `About ${n(count)} × ${small} fit across ${big}`,
  picks: 'Bodies to compare',
  tapHint: 'Tap one to zoom in',
  back: 'Show all',
  close: 'Close',
  diameter: (km: number) => (km >= 100 ? `${Math.round(km).toLocaleString('en-US')} km` : `${n(km)} km`),
}
