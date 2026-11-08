// ui/StampBook.tsx の文言（日本語）

export const stampBookJa = {
  setTarget: (name: string) => `${name}を目標にする`,
  quizAnswered: 'クイズ正解',
  /** まだ見つけていない隠しスタンプ・隠し称号の名前 */
  secret: '？？？',
  stampBook: '訪問スタンプ帳',
  close: '閉じる',
  currentTitle: '今の称号：',
  noneYet: 'まだありません',
  stamps: 'スタンプ',
  quizzes: 'クイズ正解',
  titles: '称号',
  howToCollect: '天体のそばまで飛んでいくとスタンプがもらえます。航海日誌のクイズに正解すると★がつきます。スタンプを押すと、その天体を目標にします。',
  done: '達成',
  /** スタンプの日付 */
  shortDate: (d: Date) => `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`,
}
