import { useStore } from '../state/store'

// 日本語と英語の切り替え。文言は src/i18n/ の言語ごとのファイルにあり、ui() などが今の言語のものを読む（index.ts）。
// 言語は設定（settings.lang）に保存する。選ぶ前は日本語

export type Lang = 'ja' | 'en'

export const getLang = (): Lang => useStore.getState().settings.lang ?? 'ja'

/** 言語が変わったら描き直す（コンポーネントの最初で呼ぶ） */
export const useLang = (): Lang => useStore((s) => s.settings.lang ?? 'ja')

export function setLang(lang: Lang) {
  useStore.getState().updateSettings({ lang })
}

// リンクで言語を決めて開ける（?lang=en や #lang=en）。そのときは最初の言語の画面を出さない
const fromUrl = /[?&#]lang=(ja|en)\b/.exec(location.search + location.hash)?.[1] as Lang | undefined
if (fromUrl) setLang(fromUrl)

// ページの言語（読み上げ・翻訳の機能や検索エンジン向け）
const applyDocumentLang = (lang: Lang) => {
  document.documentElement.lang = lang
}
applyDocumentLang(getLang())
useStore.subscribe((s, prev) => {
  if (s.settings.lang !== prev.settings.lang) applyDocumentLang(s.settings.lang ?? 'ja')
})
