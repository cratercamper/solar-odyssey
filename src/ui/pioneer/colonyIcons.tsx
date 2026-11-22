import type { ReactNode } from 'react'
import type { ZoneId } from '../../data/colony'

// コロニー経営の区画の印（線の絵。色は CSS の currentColor）

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const ZONE_ICON: Record<ZoneId, (size?: number) => ReactNode> = {
  housing: (n = 22) => (
    <svg width={n} height={n} viewBox="0 0 24 24" aria-hidden {...S}>
      <path d="M3 11l9-7 9 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  ),
  farm: (n = 22) => (
    <svg width={n} height={n} viewBox="0 0 24 24" aria-hidden {...S}>
      <path d="M12 21V10" />
      <path d="M12 13c-4 0-6-2.5-6-6 4 0 6 2.5 6 6z" />
      <path d="M12 10c0-3.5 2-6 6-6 0 3.5-2 6-6 6z" />
      <path d="M4 21h16" />
    </svg>
  ),
  factory: (n = 22) => (
    <svg width={n} height={n} viewBox="0 0 24 24" aria-hidden {...S}>
      <path d="M3 20V11l5 3v-3l5 3v-3l5 3V5h3v15z" />
      <path d="M7 17h2M12 17h2M17 17h1" />
    </svg>
  ),
  park: (n = 22) => (
    <svg width={n} height={n} viewBox="0 0 24 24" aria-hidden {...S}>
      <circle cx="9" cy="9" r="5" />
      <path d="M9 14v7" />
      <path d="M16.5 13a3 3 0 1 0 0-.01" />
      <path d="M17 16v5M3 21h18" />
    </svg>
  ),
  power: (n = 22) => (
    <svg width={n} height={n} viewBox="0 0 24 24" aria-hidden {...S}>
      <path d="M13 3L6 13h5l-1 8 7-10h-5z" />
    </svg>
  ),
  water: (n = 22) => (
    <svg width={n} height={n} viewBox="0 0 24 24" aria-hidden {...S}>
      <path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z" />
      <path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5" />
    </svg>
  ),
}

export const IconFlask = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...S}>
    <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
    <path d="M7.5 15h9" />
  </svg>
)
