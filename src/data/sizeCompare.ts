import { BODY_CARDS, cardOf, hasCard } from './bodyCards'

// 大きさくらべ（A4）：いまの星と、地球・月・太陽などを、本当の大きさの比で横にならべる。
// 単位は km。小さいものから左にならべて、下の端をそろえる（棚に置いたように）。
// くらべる相手は、天体カードのある星ならどれでも選べる（太陽・惑星・おもな衛星・冥王星など）

/** くらべるのに選べるもの（太陽、惑星とその衛星の順） */
export const PICKS: readonly string[] = BODY_CARDS.map((c) => c.id)
export type Pick = string

export type Item = {
  id: string
  /** 直径（km） */
  width: number
  height: number
  /** ならべたときのまん中の x（km） */
  x: number
}

/** 半径（km） */
const r = (id: string) => cardOf(id)?.radiusKm ?? 0

/** はじめに出すもの：地球（地球なら月）。地球より小さい星には月も、とても小さい星には大きさの近い星も */
export function defaultPicks(id: string): Pick[] {
  const km = r(id)
  if (id === 'earth') return ['moon']
  if (id === 'sun') return ['jupiter', 'earth']
  const picks: Pick[] = ['earth']
  if (km < 6_371 && id !== 'moon') picks.push('moon')
  if (km < 400) {
    // 大きさのいちばん近い星（比で見て）
    const near = PICKS.filter((p) => p !== id && !picks.includes(p)).sort((a, b) => Math.abs(Math.log(r(a) / km)) - Math.abs(Math.log(r(b) / km)))[0]
    if (near) picks.push(near)
  }
  if (km > 50_000) picks.push('sun')
  return picks
}

/** ならべ方：小さいものから左へ。すき間は、となりの大きいほうの幅の 1/4 */
export function lineup(id: string, picks: readonly string[]): Item[] {
  const ids = [id, ...picks.filter((p) => p !== id)]
  const items = ids
    .map((i): Item => ({ id: i, width: r(i) * 2, height: r(i) * 2, x: 0 }))
    .filter((i) => i.width > 0)
    .sort((a, b) => a.height - b.height)
  let cursor = 0
  items.forEach((it, i) => {
    if (i > 0) cursor += Math.max(it.width, items[i - 1].width) * 0.25
    it.x = cursor + it.width / 2
    cursor += it.width
  })
  return items
}

/** 大きいほうの直径に、小さいほうがいくつならぶか（10 より小さいときは半分きざみ） */
export function across(big: Item, small: Item) {
  const n = big.height / small.height
  return n < 10 ? Math.round(n * 2) / 2 : Math.round(n)
}

/** 大きさくらべができる星（天体カードのある星） */
export const canCompare = (id: string | null | undefined): id is string => !!id && hasCard(id) && r(id) > 0
