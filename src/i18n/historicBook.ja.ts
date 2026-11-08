// ui/HistoricBook.tsx の文言（日本語）

export const historicBookJa = {
  fromLandingSpot: (dir: string, dist: string) => `着陸地点から${dir}へ ${dist}`,
  back: '一覧へ',
  /** まだ見つけていない場所の印と名前 */
  unknownIcon: '？',
  unknownName: '？？？',
  notVisitedYet: 'まだ訪ねていない場所です。',
  notVisitedWhere: (where: string) => `月のタウルス・リットロウ谷（月の追いかけっこ場）で、${where}。光の柱をめざしてローバーで走ろう。`,
  title: 'アポロ17号の史跡ずかん',
  close: '閉じる',
  intro: '1972年12月、アポロ17号のセルナン船長とシュミット飛行士は、この谷で3日間、月面車で探検しました。人が月を歩いたのは、今のところこれが最後です。2人が残した物や、立ち寄った観測点を、ローバーで訪ねてみよう。',
  station: (no: number) => `観測点${no}`,
  /** 8 方位（北から右回り） */
  directions: ['北', '北東', '東', '南東', '南', '南西', '西', '北西'],
}
