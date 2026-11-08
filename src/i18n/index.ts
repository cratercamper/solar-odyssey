import { ja } from './ja'
import { en } from './en'
import { chaptersJa, missionsJa } from './missions.ja'
import { chaptersEn, missionsEn } from './missions.en'
import { getLang, type Lang } from './lang'
import { fill, guardIds, untranslated } from './translation'
import { FACTS } from './facts.ja'
import { FACTS_EN } from './facts.en'

// 画面の文言の辞書（日本語・英語）。ui() と missionText() は、呼ぶたびに今の言語を見る
// （読み込み時に文字列を決めてしまわないこと）。言語は設定（settings.lang）にあり、lang.ts の getLang() で読む。
// 英語の辞書に書いていない文言は日本語で出る（translation.ts）。足りない文言は、遊びは止めずにコンソールにエラーで出す：
// 英語にない文言は読み込みのときに一覧で、id で引く表にない id は引いたときに（translation.ts の guardIds）

export type { Lang }

const JA = { ui: ja, missions: missionsJa, chapters: chaptersJa }
const DICTS = {
  ja: guardIds(JA, JA, 'ja'),
  en: guardIds({ ui: fill(ja, en), missions: fill(missionsJa, missionsEn), chapters: fill(chaptersJa, chaptersEn) }, JA, 'en'),
}

// 英語の辞書にまだない文言（日本語で出るもの）
const missing = [
  ...untranslated(ja, en),
  ...untranslated(missionsJa, missionsEn, 'missions'),
  ...untranslated(chaptersJa, chaptersEn, 'chapters'),
  // 航海日誌（data/facts.ts の factsFor・クイズ）は、項目ごと英語がなければ日本語で出る
  ...Object.keys(FACTS).filter((id) => !(id in FACTS_EN)).map((id) => `facts.${id}`),
]
if (missing.length) console.error(`ERROR [i18n] en: not translated (shown in Japanese): ${missing.length}`, missing)

/** 今の言語 */
export const currentLang = (): Lang => getLang()

/** 画面の短い文言 */
export const ui = () => DICTS[currentLang()].ui

/** 言語を決めて引く辞書：クイズのように両方の言語で作るもの、船体の船名のようにいつも英語で出すもの（英語の辞書にないものは日本語） */
export const uiJa = DICTS.ja.ui
export const uiEn = DICTS.en.ui

/** ミッションの文章（data/missions.ts と同じ id） */
export const missionText = (id: string) => DICTS[currentLang()].missions[id]

/** 章の文章（data/missions.ts の CHAPTERS と同じ id） */
export const chapterText = (id: string) => DICTS[currentLang()].chapters[id]
