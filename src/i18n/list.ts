// 英語で名前を並べる形：「A」「A and B」「A, B, and C」（or も同じ形）。Intl.ListFormat('en') の
// conjunction・disjunction と同じ形（tsconfig の lib が ES2020 で Intl.ListFormat の型がないので、ここに書く）

export function listEn(items: readonly string[], word: 'and' | 'or' = 'and'): string {
  if (items.length < 3) return items.join(` ${word} `)
  return `${items.slice(0, -1).join(', ')}, ${word} ${items[items.length - 1]}`
}
