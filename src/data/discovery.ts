// 発見スキャン：小惑星帯の岩を近くでスキャンすると「発見」になり、仮の名前（仮符号）が付く。自分の名前も付けられる。
// 仮符号は本物の決まりと同じ形：見つけた年 + 半月の記号（1月前半 A、1月後半 B … I は使わない）+ その半月の何番目か

export type RockKind = 0 | 1 | 2

export type Discovery = {
  /** 岩の見分け（帯の形の番号-岩の番号） */
  key: string
  /** 仮符号（2026 WA など） */
  code: string
  /** 自分で付けた名前（なければ空） */
  name: string
  kind: RockKind
  /** 大きさの見積もり（km） */
  sizeKm: number
  /** 見つけた日時（ミリ秒） */
  at: number
  /** 発見したときに撮った写真（JPEG の data URL。古いものは消して容量をおさえる） */
  photo?: string
}

/** 写真を残しておく数（新しいものから） */
export const PHOTO_KEEP = 60
/** エベレストの高さ（km）。大きさをくらべるもの */
export const EVEREST_KM = 8.8

const HALF_MONTH = 'ABCDEFGHJKLMNOPQRSTUVWXY'
const ORDER = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

/** 仮符号：年、半月の記号、その半月で何番目か（0 から。25 個ごとに後ろの数字が 1 増える） */
export function provisionalCode(date: Date, n: number) {
  const half = date.getMonth() * 2 + (date.getDate() > 15 ? 1 : 0)
  const cycle = Math.floor(n / ORDER.length)
  return `${date.getFullYear()} ${HALF_MONTH[half]}${ORDER[n % ORDER.length]}${cycle ? cycle : ''}`
}

/** 同じ半月に見つけた数（次の仮符号の番号） */
export function countInHalfMonth(found: Discovery[], date: Date) {
  const head = provisionalCode(date, 0).slice(0, -1)
  return found.filter((d) => d.code.startsWith(head) && d.code.length >= head.length + 1).length
}

/** 帯の岩の大きさ（場面の単位）から、見積もりの大きさ（km） */
export const rockSizeKm = (size: number) => Math.max(1, Math.round(size * 120))

/** 自分で付ける名前の長さの上限 */
export const NAME_MAX = 20

/** 名前をきれいにする（前後の空白を取って、長すぎるところを切る） */
export const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)

/** セーブから読んだものを確かめる */
export function checkDiscoveries(v: unknown): Discovery[] | null {
  if (!Array.isArray(v)) return null
  return v
    .filter(
      (d): d is Discovery =>
        !!d && typeof d.key === 'string' && typeof d.code === 'string' && typeof d.name === 'string' && [0, 1, 2].includes(d.kind) && typeof d.sizeKm === 'number' && typeof d.at === 'number',
    )
    .map((d) => (d.photo === undefined || (typeof d.photo === 'string' && d.photo.startsWith('data:image/')) ? d : { ...d, photo: undefined }))
}

/** 写真は新しいほうから PHOTO_KEEP 個だけ残す */
export function trimPhotos(found: Discovery[]): Discovery[] {
  let kept = 0
  const out = [...found]
  for (let i = out.length - 1; i >= 0; i--) {
    if (!out[i].photo) continue
    if (++kept > PHOTO_KEEP) out[i] = { ...out[i], photo: undefined }
  }
  return out
}
