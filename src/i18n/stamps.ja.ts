// state/stamps.ts の文言（日本語）

export const stampsJa = {
  newTitle: (name: string) => `称号「${name}」をもらいました！`,
  stampCollectedCount: (name: string, count: number, length: number) => `スタンプ「${name}」をもらいました（${count}/${length}）`,
  stampCollected: (name: string) => `スタンプ「${name}」をもらいました`,
}
