import type { RallyTrackText } from '../data/rallyTracks'
import { byId } from './translation'

// data/rallyTracks.ts の文言（日本語）

const texts = {
  coprates: {
    title: '峡谷トライアル',
    intro: '4台のローバーで、峡谷の谷底を約1.2 km競走します。光の門を順にくぐってゴールへ。岩に乗ると車輪が浮いて遅くなり、曲がれません。ジャンプで飛び越えよう！',
    button: '峡谷レース',
    home: 'ゲール・クレーターへ',
  },
  taurus: {
    title: '月の谷の追いかけっこ',
    intro: 'アポロ17号が降りた谷で追いかけっこ！先に逃げた3台のローバーに、約1.6 km先のゴールまでに追いついてタッチしよう。重力が地球の6分の1なので、ジャンプは長く飛びます。空中では◀▶で横に、▼で早く着地できます。',
    button: '月の追いかけっこ',
    home: 'もとの着陸地点へ',
  },
  conamaraEasy: {
    title: 'エウロパ 氷のドリフトレース（やさしい）',
    intro: 'エウロパの氷の尾根の溝を約1.6 km競走！門は少なめで、カーブもゆるやか。氷はつるつるなので、アクセルを踏んだまま、お尻をすべらせて曲がろう（すべりすぎたら、ハンドルを少し反対に）。氷の板の坂をのぼると、先から大きく飛び出して、一段高い氷の上に着地します。重力は地球の約7分の1なので、15 mの板からはとても長く飛びます。',
    button: '氷のレース',
    home: 'もとの着陸地点へ',
  },
  conamara: {
    title: 'エウロパ 氷のドリフトレース（上級）',
    intro: 'エウロパの氷の尾根の溝を約1.7 km競走！氷はつるつるで、速いままハンドルを切るとお尻が横にすべります。すべり始めたら、ハンドルを少し反対に切って立て直そう（カウンターステア）。カーブの手前でアクセルをゆるめるのがコツ。重力は地球の約7分の1なので、ジャンプ台ではとても高く飛びます。',
    button: '氷のレース',
    home: 'もとの着陸地点へ',
  },
} satisfies Record<string, RallyTrackText>

// 英語の rallyTracks.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type RallyTracksJa = typeof texts
export const rallyTracksJa: Record<string, RallyTrackText> = byId(texts)
