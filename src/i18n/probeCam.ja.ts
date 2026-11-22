// 探査機の模型の画面（ui/ProbeCamPane.tsx）の文言（日本語）。字幕は2行まで

const planet: Record<string, string> = { venus: '金星', earth: '地球', jupiter: '木星', saturn: '土星', uranus: '天王星', neptune: '海王星', ryugu: 'リュウグウ' }
const man = (km: number) =>
  km >= 1e8
    ? `${(km / 1e8).toFixed(1)}億km`
    : km >= 1e4
      ? `${Math.round(km / 1e4).toLocaleString('ja-JP')}万km`
      : km >= 100
        ? `${Math.round(km).toLocaleString('ja-JP')}km`
        : km >= 1
          ? `${km.toFixed(1)}km`
          : `${Math.max(0, Math.round(km * 1000))}m`
const kms = (v: number) => `秒速${v.toFixed(1)}km`

export type ProbeCaptions = {
  credit: string
  extra: string[]
  cruise: (string | ((km: string, t: string) => string))[]
  beyond: (v: number) => string
  /** 天体のそばにとどまるあいだの字幕（ないものは、はやぶさ2の stay）。dips は、とどまるあいだの見どころの順 */
  stay?: StayCaptions
}

export type StayCaptions = { approach: string; home: (string | ((t: string) => string))[]; dips: string[]; depart: string }

export const probeCamJa = {
  planet,
  distance: man,
  title: '探査機',
  speed: '太陽から見た速さ',
  speedValue: (v: number) => `${v.toFixed(1)} km/s`,
  toPlanet: (name: string, km: string) => `${name}まで ${km}`,
  toSurface: (name: string, km: string) => `${name}の地面まで ${km}`,
  fromEarth: (km: string, hours: string) => `地球から ${km}・電波で ${hours}`,
  lightTime: (minutes: number) => (minutes < 1 ? `${(minutes * 60).toFixed(1)}秒` : minutes < 60 ? `${Math.round(minutes)}分` : `${(minutes / 60).toFixed(1)}時間`),
  arrow: '速さの矢印',
  loading: '模型を読み込んでいます…',
  dragHint: 'ドラッグで回して見られます',
  launch: {
    burnout: (v: number) => `打ち上げから約1時間。ロケットの最後の噴射を終え、地球から見て${kms(v)}で離れていきます。`,
    moon: (km: string) => `地球からもう${km}。月の軌道（約38万km）を、半日ほどで越えました。`,
    helio: (v: number) => `地球の公転の速さ（秒速30km）にロケットの速さが足され、太陽から見ると${kms(v)}で外へ向かいます。`,
  },
  flyby: (name: string, n: { speedBefore: number; speedAfter: number; relSpeed: number; turnPlanet: number; turnSun: number; altitudeKm: number; planetSpeed: number }) => {
    const change =
      n.speedAfter > n.speedBefore + 0.5
        ? `太陽から見ると、${kms(n.speedBefore)}から${kms(n.speedAfter)}に加速！ ${name}の動きを少しもらいました。これがスイングバイです。`
        : n.speedAfter < n.speedBefore - 0.5
          ? `太陽から見ると${kms(n.speedBefore)}から${kms(n.speedAfter)}に。向きを大きく変えるために、速さを少し${name}に返しました。`
          : `太陽から見た速さはほとんど同じで、進む向きだけが${Math.round(n.turnSun)}°変わりました。`
    return [
      `${name}へ近づいています。${name}の重力に引かれて、少しずつ速くなります。`,
      `${name}の重力で、進む向きがぐっと曲げられていきます（${name}から見て${Math.round(n.turnPlanet)}°）。`,
      `最接近！ ${name}の雲の上 約${man(n.altitudeKm)}を通過。`,
      `${name}から見ると、近づいたときと同じ${kms(n.relSpeed)}で離れていきます。でも${name}自身が、太陽のまわりを${kms(n.planetSpeed)}で動いています。`,
      change,
    ]
  },
  /** 探査機ごとの字幕。extra は、道すじの何番目の天体を通ったあとに最初に出す見どころ */
  probes: {
    voyager2: {
      credit: '模型：NASA 3D Resources ／ 軌道：NASA JPL Horizons',
      extra: [
        '',
        '木星では、衛星イオの火山や、大赤斑の渦を撮影しました。',
        '土星の重力で、次の天王星へ向かう道にのりました。',
        '天王星は横倒しで回る惑星。近くで見た探査機は、今もボイジャー2号だけです。',
        '海王星の北極の上をかすめて、衛星トリトンへ。太陽系の面から南へ曲げられました。',
      ],
      cruise: [
        '大きなアンテナ（直径3.7m）を、いつも地球に向けて飛んでいます。',
        (km: string, t: string) => `地球から${km}。地球からの電波が届くのに${t}かかります。`,
        '電気は、原子力電池（RTG）で作っています。太陽から遠すぎて、太陽電池では足りないからです。',
        '金色のレコードには、地球の音楽や声、写真がのせてあります。いつか誰かに届くように。',
        'エンジンはほとんど使わず、惑星の重力を借りて次の惑星へ向かいます。',
      ],
      beyond: (v: number) => `今は太陽系の面の南へ、${kms(v)}で進み続けています。`,
    },
    hayabusa2: {
      credit: '模型：写真と資料をもとにしたオリジナルの再現 ／ 軌道：NASA JPL Horizons',
      extra: [
        '1年後に地球へもどってきて、地球の重力で向きを変える計画です。',
        '地球の重力で道を曲げてもらい、リュウグウへ向かう道にのりました。',
        'リュウグウのかけら（5.4g）をカプセルにしまって、地球へ帰ります。',
        '',
      ],
      cruise: [
        '4つのイオンエンジンから、キセノンのガスを秒速30kmで吹き出して進みます。',
        'イオンエンジンの力は、紙1枚を持ち上げるくらい。でも何か月も吹き続けて、少しずつ速くなります。',
        (km: string, t: string) => `地球から${km}。地球からの電波が届くのに${t}かかります。`,
        '2枚の太陽電池の翼を太陽へ向けて、電気を作っています。',
      ],
      beyond: () => '地球を離れ、次の小惑星へ。2031年に、直径30mほどの小惑星1998 KY26に着く予定です。',
    },
    cassini: {
      credit: '模型：NASA 3D Resources ／ 軌道：NASA JPL Horizons',
      extra: [
        '重さ5.6トン。重すぎて、ロケットの力だけでは土星に届きません。',
        '金星の重力で加速。1年あまりあとに、もう一度金星へ。',
        '2回目の金星。次は、わずか2か月後の地球です。',
        '地球のすぐそばを通って、大きく加速。次は木星へ。',
        '木星では、木星を回っていた探査機ガリレオと一緒に観測しました。',
        '',
      ],
      cruise: [
        '高さ6.8m、重さ5.6トン。アメリカ・ヨーロッパ・イタリアが一緒に作った、大きな探査機です。',
        (km: string, t: string) => `地球から${km}。地球からの電波が届くのに${t}かかります。`,
        '電気は3つの原子力電池（RTG）で作ります。土星に届く太陽の光は、地球の100分の1ほどです。',
        '横に抱えている円盤が、ヨーロッパの探査機ホイヘンス。衛星タイタンに降ろすために運んでいます。',
      ],
      beyond: () => '土星の大気へ飛びこみ、カッシーニの旅は終わりました。',
      stay: {
        approach: '土星に到着！ 環のすき間を通り抜け、エンジンを96分ふかして、土星を回る軌道に入りました。',
        home: [
          '13年で土星のまわりを294周。衛星の重力を借りて、軌道の形や傾きを何度も変えました。',
          '大きな衛星タイタンのそばを100回以上通りました。タイタンの重力が、道を曲げるハンドルです。',
          (t: string) => `カッシーニへの命令は、地球から片道${t}かけて届きます。`,
          '土星は、水に浮くほど軽い惑星。環は、ほとんどが氷のつぶでできています。',
        ],
        dips: [
          'ホイヘンスを切りはなしました。くるくる回りながら、3週間かけてタイタンへ向かいます。',
          'ホイヘンスがタイタンに着陸！ 地球から、いちばん遠い天体への着陸です。',
          'エンケラドゥスの上空175kmを通過。南極から水蒸気が噴き出していることが分かりました。',
          'グランドフィナーレの始まり。土星と環のあいだの、幅2,000kmほどのすき間へ飛びこみます。',
          '燃料がつきる前に、土星の大気へ。最後の瞬間まで、データを地球に送り続けました。',
        ],
        depart: '燃料がつきる前に、土星の大気へ。最後の瞬間まで、データを地球に送り続けました。',
      },
    },
  } as Record<string, ProbeCaptions>,
  /** 小惑星にとどまるあいだの字幕（はやぶさ2とリュウグウ） */
  stay: {
    approach: 'リュウグウが見えてきました。そろばん玉のような形の、直径900mほどの小惑星です。',
    home: [
      'リュウグウの上空20km（ホームポジション）で、リュウグウと並んで太陽のまわりを回ります。',
      '表面は炭のように黒く、光を4.5%しか返しません。大きな岩がごろごろしています。',
      'リュウグウは7.6時間で1回、ほかの多くの天体と逆向きに回っています。',
      (t: string) => `地球からの電波は片道${t}。着陸は、探査機が自分で判断して行います。`,
    ],
    dips: [
      '小さなロボット「ミネルバII」を2台降ろしました。跳ねて動く、小惑星で初めてのローバーです。',
      'ドイツとフランスの着陸機「マスコット」を降ろしました。17時間、表面を調べました。',
      '1回目のタッチダウン！ 一瞬だけ表面にふれ、弾丸を撃って、舞い上がった砂を集めました。',
      '2回目のタッチダウン。人工のクレーターのそばで、地下から飛び出した砂も集めました。',
    ],
    depart: '2019年11月、リュウグウを出発。砂の入ったカプセルを持って、地球へ帰ります。',
  },
  /** はやぶさ2の地球への帰還（道すじの最後の天体）。5行（近づく → 最接近 → 離れる） */
  homecoming: (altitudeKm: number) => [
    '6年ぶりに地球へ帰ってきました。',
    '地球から22万kmのところで、リュウグウの砂の入ったカプセルを切りはなしました。',
    `カプセルはオーストラリアの砂漠へ、流れ星のように落ちていきます。探査機は地上 約${man(altitudeKm)}を通過。`,
    '探査機は地球の重力で向きを変え、まだ旅を続けます。',
    'カプセルは見つかり、リュウグウの砂5.4gが地球に届きました。',
  ],
}
