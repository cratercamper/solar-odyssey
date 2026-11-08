// data/rockCollection.ts の文言（日本語）：自分の名前があるページ（ほかのページは先頭の天体の名前）

const texts = {
  europa: '氷の衛星・冥王星',
  phobos: 'そのほかの岩の天体',
} satisfies Record<string, string>

// 英語の rockGroups.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type RockGroupsJa = typeof texts
export const rockGroupsJa: Record<string, string> = texts

// 文の中でページの天体をまとめて言うとき（「…に着陸して」）。天体が4つ以上のページだけ（ほかは天体の名前を並べる）
const where = {
  europa: '氷の衛星・冥王星',
} satisfies Record<string, string>

export type RockGroupsWhereJa = typeof where
export const rockGroupsWhereJa: Record<string, string> = where
