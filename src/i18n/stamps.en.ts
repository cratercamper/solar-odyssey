import type { stampsJa } from './stamps.ja'
import type { Translation } from './translation'

// The texts of state/stamps.ts (English). Same keys as stamps.ja.ts

export const stampsEn: Translation<typeof stampsJa> = {
  newTitle: (name: string) => `New title: ${name}!`,
  stampCollectedCount: (name: string, count: number, length: number) => `Stamp collected: ${name} (${count}/${length})`,
  stampCollected: (name: string) => `Stamp collected: ${name}`,
}
