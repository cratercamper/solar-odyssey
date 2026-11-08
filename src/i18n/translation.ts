// ほかの言語の辞書の形と、足りない文言を日本語でうめるしくみ。
// もとは日本語の辞書。訳は同じキーだけ書けて（ないキーやつづりの違うキーはエラー）、書かなかったキーは日本語で出る。
// だから日本語だけ先に足しても、ビルドは通る

/** 日本語の辞書 T に合わせた訳の形：キーは T と同じ。どのキーも省ける */
export type Translation<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly Translation<U>[]
    : T extends object
      ? { [K in keyof T]?: Translation<T[K]> }
      : T

const merge = (ja: unknown, part: unknown): unknown => {
  if (part === undefined) return ja
  if (Array.isArray(ja)) return ja.map((x, i) => merge(x, (part as readonly unknown[])[i]))
  if (typeof ja === 'object' && ja !== null) {
    const p = part as Record<string, unknown>
    return Object.fromEntries(Object.entries(ja).map(([k, v]) => [k, merge(v, p[k])]))
  }
  return part
}

/** 訳の足りないところを日本語でうめた辞書（配列は番号ごと、オブジェクトはキーごと） */
export const fill = <T>(ja: T, part: Translation<NoInfer<T>>): T => merge(ja, part) as T

/** 訳にない文言の場所（'framing.fast' など）。そこは日本語で出る */
export const untranslated = (ja: unknown, part: unknown, at = ''): string[] => {
  if (Array.isArray(ja)) {
    const p = part as readonly unknown[] | undefined
    return ja.flatMap((x, i) => untranslated(x, p?.[i], `${at}[${i}]`))
  }
  if (typeof ja === 'object' && ja !== null) {
    const p = part as Record<string, unknown> | undefined
    return Object.entries(ja).flatMap(([k, v]) => untranslated(v, p?.[k], at ? `${at}.${k}` : k))
  }
  return part === undefined ? [at] : []
}

// id で引く表（天体・船・ミッションなど）：ない id を引いても遊びは止めない。コンソールにエラーを一度出して、
// 文言の代わりに id を見せる。表の中の、id で引く表（船の parts）にも付ける。
// わざと id がないこともある表（岩のグループ名、組成の語、着陸と空の説明）には使わない
const BY_ID = new WeakSet<object>()

/** id で引く表の印（日本語の .ja.ts で付ける） */
export const byId = <T extends object>(texts: T): T => {
  BY_ID.add(texts)
  return texts
}

/** 表の文言をすべて重ねた形（ない id の代わりの手本）：どれかの文言にあるフィールドはすべて持ち、リストはいちばん長いものの長さ。
 *  ミッションの手順の数や船の parts の id は文言ごとにちがうので、一つの文言の形では足りない */
const shapeOf = (values: unknown[]): unknown => {
  const first = values.find((v) => v !== undefined)
  if (Array.isArray(first)) {
    const lists = values.filter((v): v is unknown[] => Array.isArray(v))
    return Array.from({ length: Math.max(...lists.map((l) => l.length)) }, (_, i) => shapeOf(lists.map((l) => l[i])))
  }
  if (typeof first !== 'object' || first === null) return first
  const objs = values.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v))
  const out = Object.fromEntries([...new Set(objs.flatMap((o) => Object.keys(o)))].map((k) => [k, shapeOf(objs.map((o) => o[k]))]))
  return objs.some((o) => BY_ID.has(o)) ? byId(out) : out
}

/** ない id の代わりの文言：手本と同じ形で、文字のところは id（印もそのまま） */
const stand = (sample: unknown, id: string): unknown => {
  if (typeof sample === 'string') return id
  if (typeof sample === 'function') return () => id
  if (Array.isArray(sample)) return sample.map((x) => stand(x, id))
  if (typeof sample === 'object' && sample !== null) {
    const out = Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, stand(v, id)]))
    return BY_ID.has(sample) ? byId(out) : out
  }
  return sample
}

// JSON.stringify・Promise・React・モジュールの読み込みが、ふつうのオブジェクトにあるかどうか調べる名前（id ではない）
const PROTOCOL = new Set(['toJSON', 'then', '$$typeof', '@@iterator', '@@toStringTag', 'length', 'nodeType', '__esModule', 'displayName'])

const guard = (table: object, ja: object, at: string, lang: string): object => {
  const inner = new Map<string, unknown>() // ある id の文言（中の id で引く表も見張ったもの）
  const made = new Map<string, unknown>() // ない id の代わり
  let sample: unknown
  return new Proxy(table, {
    get(t, k, r) {
      if (typeof k !== 'string' || PROTOCOL.has(k)) return Reflect.get(t, k, r)
      // 毎フレーム引く文言もあるので、二度目からは Map を見るだけ
      if (k in t) {
        if (!inner.has(k)) inner.set(k, guardIds(Reflect.get(t, k, r), (ja as Record<string, unknown>)[k], lang, `${at}["${k}"]`))
        return inner.get(k)
      }
      if (!made.has(k)) {
        console.error(`ERROR [i18n] ${lang}: no text for ${at}["${k}"] (its id is shown instead)`)
        sample ??= shapeOf(Object.values(ja))
        const s = stand(sample, k)
        made.set(k, guardIds(s, s, lang, `${at}["${k}"]`))
      }
      return made.get(k)
    },
  })
}

/** 辞書の中の、byId の印がある表を見張る（ja は日本語の辞書：印と、代わりの形の手本） */
export const guardIds = <T>(dict: T, ja: T, lang: string, at = ''): T => {
  if (typeof ja !== 'object' || ja === null || Array.isArray(ja)) return dict
  if (BY_ID.has(ja)) return guard(dict as object, ja, at, lang) as T
  let out: Record<string, unknown> | undefined
  for (const [k, v] of Object.entries(ja)) {
    const d = (dict as Record<string, unknown>)[k]
    const g = guardIds(d, v, lang, at ? `${at}.${k}` : k)
    if (g !== d) (out ??= { ...(dict as Record<string, unknown>) })[k] = g
  }
  return (out ?? dict) as T
}
