import type { BridgePartText } from '../data/bridgeParts'
import { byId } from './translation'

// data/bridgeParts.ts の文言（日本語）

const texts = {
  captain: {
    name: '艦長席',
    text: '船の進む先を決める人の席。部屋の真ん中の一段低い所にあり、窓も、まわりのどの席もよく見えます。ひじ掛けに小さな操作盤があります。',
  },
  seats: {
    name: '左右の席',
    text: '艦長のとなりで相談する人の席。間の低い台で、船の状態や航路をいっしょに確かめます。',
  },
  helm: {
    name: '操舵席',
    text: '船の向きと速さを決める席。目標の天体、距離、到着までの時間、ワープの準備などがこの画面に出ます。',
  },
  ops: {
    name: '運用席',
    text: '船の機械や電力がうまく働いているかを見張る席。ワープ機関の出力やシールド、生命維持のようすを見ています。',
  },
  window: {
    name: '正面の窓',
    text: '大きな曲面ガラスの窓。Z キー（または「拡大画面に」）で、ガラスが大画面に変わり、目標の天体を望遠で映します。本物の宇宙船では、窓は放射線を防ぐために厚く小さくなりがちです。',
  },
  skylight: { name: '天窓', text: '天井の丸い窓。真上の星や、船のてっぺんで光る衝突防止灯が見えます。' },
  tactical: {
    name: '防御・センサー卓',
    text: '手すりの後ろの、横に長い操作卓。まわりの天体をレーダーで見張り、シールドを管理します。この船は探査船なので、武器より観測が主な仕事です。',
  },
  rail: {
    name: '木の手すり',
    text: '中央の低い床と、後ろの高い床を分ける手すり。最新の船にも、手ざわりのいい木を使うと落ち着いた部屋になります。左右のゆるい坂から上り下りします。',
  },
  map: {
    name: '太陽系の地図',
    text: '後ろの壁の大きな画面。惑星の今の位置と、この船（四角）の位置を真上から見た図です。距離は内側が見えるように縮めてあります。',
  },
  stations: {
    name: '壁のステーション',
    text: '機関・科学・環境・記録などの席。科学の画面には目標の天体の資料、環境の画面には室温や酸素の量が出ます。',
  },
  lift: {
    name: '昇降機と銘板',
    text: '左右の扉は、船の中を上下に移動する昇降機。左の扉の横の銘板には、この船の名前「SV-01 ソーラーボイジャー（探査船）」が刻まれています。',
  },
} satisfies Record<string, BridgePartText>

// 英語の bridgeParts.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type BridgePartsJa = typeof texts
export const bridgePartsJa: Record<string, BridgePartText> = byId(texts)
