// data/approach.ts の文言（日本語）

export const approachJa = {
  starLimit: '太陽の熱と光が強すぎて、これ以上は近づけません。表面は約5,500℃もあります。',
  rockLimit: (name: string) => `これより下は${name}の地表です。ここは低い軌道。探査機もこの高さから観察します。`,
  diveStart: (name: string) => `${name}の雲の中へ。ガス惑星には固い地面がなく、下るほど圧力と温度が上がっていきます。`,
  gasLimit: (name: string, LIMIT_BAR: number) => `${name}の雲の下、約${LIMIT_BAR}気圧。これ以上は圧力が強すぎて進めません。1995年、探査機ガリレオのプローブは木星のこのくらいの深さで、熱と圧力のために通信が途絶えました。`,
}
