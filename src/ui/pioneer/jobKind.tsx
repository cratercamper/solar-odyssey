import type { ReactNode } from 'react'
import { LAB_STOP, type JobKind } from '../../data/delivery'
import { ui } from '../../i18n'
import { sfEntry } from '../../data/sf'
import { IconFuel, IconMedicine, IconParts, IconSamples, IconSeedlings, IconStar } from './icons'

// 配達の仕事の絵と、行き先の名前（端末・カード・飛んでいるあいだのカードで使う）

export const JOB_ICON: Record<JobKind, (size?: number) => ReactNode> = {
  samples: (size) => <IconSamples size={size} />,
  seedlings: (size) => <IconSeedlings size={size} />,
  parts: (size) => <IconParts size={size} />,
  medicine: (size) => <IconMedicine size={size} />,
  fuel: (size) => <IconFuel size={size} />,
}

/** 行き先の名前（SF の場所の一覧から） */
export const placeName = (id: string) => (id === LAB_STOP ? ui().delivery.lab : (sfEntry(id)?.name() ?? id))

/** 星 3 つの並び（n 個が光る） */
export function Stars({ n, size = 16, label }: { n: number; size?: number; label: string }) {
  return (
    <span className="pio-stars" role="img" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <IconStar key={i} size={size} on={i < n} />
      ))}
    </span>
  )
}
