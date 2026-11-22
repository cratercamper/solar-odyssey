// 水のコップの実験（components/surface/WaterCup.tsx・WaterCupPanel.tsx）の文言（日本語）

export const waterCupJa = {
  button: '💧 水を置いてみる',
  buttonTip: 'コップの水を地面の台に置くと、この星では凍る？ 沸く？ 消える？',
  temp: (c: number) => `${c}℃`,
  gone: '空っぽ',
  state: { liquid: '水', boiling: 'ふっとう中', freezing: '凍っていく', ice: '氷', slush: '氷と水', subliming: '氷が気体に' },
  /** 上のカードの見出し */
  head: {
    placed: 'コップに 20℃ の水。どうなる？',
    vacuumBoil: '空気が無い！ 水がいきなり沸騰',
    thinBoil: '空気がうすすぎる！ 水がいきなり沸騰',
    flashFrozen: '沸いて冷えて、もう凍った',
    subliming: '氷が日ざしで、そのまま気体に',
    vacuumGone: '氷は全部、宇宙へ逃げた',
    boiling: (tb: number) => `${tb}℃ で沸騰！ 水が消えていく`,
    boiledAway: '水は全部、蒸気になって消えた',
    heating: '水がどんどん熱くなる…',
    cooling: '水がどんどん冷える…',
    freezing: '凍っていく…',
    frozen: 'カチカチに凍った',
    melting: '氷がとけていく',
    liquid: '水は、水のまま',
  },
  /** なぜ（1 行） */
  why: {
    vacuum: '気圧がほぼ 0。水は液体のままではいられない',
    thin: '火星の空気は地球の約 170 分の 1。水は液体でいられない',
    subliming: '真空の氷は、とけずに直接気体になる（昇華）',
    moonGone: '月の極の、日の当たらないクレーターには、何十億年も氷が残っている',
    vacuumGone: '気体になった水は、星の重力では引きとめられない',
    venus: '92 気圧なので沸点は約 300℃。でも地表は 460℃',
    boil: (t: number) => `まわりは ${t}℃。沸点より熱い`,
    titan: '−180℃ の世界。タイタンでは、氷は岩と同じかたさ',
    frozen: (t: number) => `まわりは ${t}℃。0℃ より寒い`,
    earth: '液体の水が地面にいられる星は、太陽系で地球だけ',
    liquid: (t: number) => `まわりは ${t}℃。0℃ より暖かく、沸点より低い`,
  },
  /** 早回しのすすめ（1 行） */
  hint: {
    waitDay: '早回しで昼を待つと、氷はどうなる？',
    staysIce: 'この寒さでは、氷はずっと残る',
  },
  fastForward: '⏩ 1日を1分で',
  speed: (s: string) => `1 秒 = ${s}`,
  minutes: (n: number) => `${n} 分`,
  hours: (n: string) => `${n} 時間`,
  again: 'もう一度',
  close: '片づける',
}
