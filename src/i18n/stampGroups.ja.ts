// data/stamps.ts の文言（日本語）：スタンプ帳のページ

export const stampGroupsJa = {
  planets: '太陽と惑星',
  /** 衛星のある惑星ごとのページ（planet：惑星の名前、count：衛星の数） */
  moonsOf: (planet: string, _count: number) => `${planet}の衛星`,
  dwarf: '準惑星とその衛星',
  scopes: '宇宙望遠鏡',
  sf: 'SF（架空）',
}
