import type { Framing } from '../state/mission'
import { approachJa } from './approach.ja'
import { beamGaugeJa } from './beamGauge.ja'
import { blackHoleJa } from './blackHole.ja'
import { bridgeJa } from './bridge.ja'
import { bridgePanelJa } from './bridgePanel.ja'
import { chargeBeamJa } from './chargeBeam.ja'
import { compareModelsJa } from './compareModels.ja'
import { consolesJa } from './consoles.ja'
import { contextLostJa } from './contextLost.ja'
import { cubeJa } from './cube.ja'
import { deepSpaceJa } from './deepSpace.ja'
import { eclipsePanelJa } from './eclipsePanel.ja'
import { ephemerisJa } from './ephemeris.ja'
import { evaJa } from './eva.ja'
import { evaViewJa } from './evaView.ja'
import { exoplanetJa } from './exoplanet.ja'
import { flightJa } from './flight.ja'
import { galleryPanelJa } from './galleryPanel.ja'
import { historicBookJa } from './historicBook.ja'
import { historicPanelJa } from './historicPanel.ja'
import { hudJa } from './hud.ja'
import { landingJa } from './landing.ja'
import { logPanelJa } from './logPanel.ja'
import { navPanelJa } from './navPanel.ja'
import { observeJa } from './observe.ja'
import { observePanelJa } from './observePanel.ja'
import { photoNoteJa } from './photoNote.ja'
import { probePanelJa } from './probePanel.ja'
import { probeSceneJa } from './probeScene.ja'
import { quizJa } from './quiz.ja'
import { quizPanelJa } from './quizPanel.ja'
import { raceJa } from './race.ja'
import { racePanelJa } from './racePanel.ja'
import { rallyHiscoreJa } from './rallyHiscore.ja'
import { rallyPanelJa } from './rallyPanel.ja'
import { rockBookJa } from './rockBook.ja'
import { roverHudJa } from './roverHud.ja'
import { scaleToggleJa } from './scaleToggle.ja'
import { sfJa } from './sf.ja'
import { sfBadgeJa } from './sfBadge.ja'
import { sfEngineJa } from './sfEngine.ja'
import { sfHourglassJa } from './sfHourglass.ja'
import { sfJapanJa } from './sfJapan.ja'
import { sfSidesJa } from './sfSides.ja'
import { sfSpaceJa } from './sfSpace.ja'
import { shipPickerJa } from './shipPicker.ja'
import { sizeCompareJa } from './sizeCompare.ja'
import { spaceDockJa } from './spaceDock.ja'
import { stampBookJa } from './stampBook.ja'
import { stampsJa } from './stamps.ja'
import { stampGroupsJa } from './stampGroups.ja'
import { stampTitlesJa } from './stampTitles.ja'
import { stateLaunchJa } from './stateLaunch.ja'
import { sunJa } from './sun.ja'
import { surfaceViewJa } from './surfaceView.ja'
import { telescopeViewJa } from './telescopeView.ja'
import { telescopesJa } from './telescopes.ja'
import { throttleJa } from './throttle.ja'
import { timeBarJa } from './timeBar.ja'
import { touchBarJa } from './touchBar.ja'
import { newsJa } from './news.ja'
import { touchControlsJa } from './touchControls.ja'
import { apollo17Ja } from './apollo17.ja'
import { rockCompJa } from './rockComp.ja'
import { rockGroupsJa, rockGroupsWhereJa } from './rockGroups.ja'
import { bodiesJa } from './bodies.ja'
import { bridgePartsJa } from './bridgeParts.ja'
import { compareItemsJa } from './compareItems.ja'
import { deepSpaceImagesJa } from './deepSpaceImages.ja'
import { eclipsesJa } from './eclipses.ja'
import { evaJobsJa } from './evaJobs.ja'
import { evaSitesJa } from './evaSites.ja'
import { evaToolsJa } from './evaTools.ja'
import { phaserFactsJa } from './phaserFacts.ja'
import { poisJa } from './pois.ja'
import { probesJa } from './probes.ja'
import { rallyColorsJa } from './rallyColors.ja'
import { rallyTracksJa } from './rallyTracks.ja'
import { rockSamplesJa } from './rockSamples.ja'
import { shipsJa } from './ships.ja'
import { surfaceNotesJa } from './surfaceNotes.ja'
import { surfaceSitesJa } from './surfaceSites.ja'
import { surfaceSkyNotesJa } from './surfaceSkyNotes.ja'

// 画面の文言（日本語）。ストーリーモードの短い文言はここに書く。ほかの画面の文言は画面ごとのファイル（navPanel.ja.ts など）にあり、ここに集める

export const ja = {
  missionsButton: 'ストーリーモード（任務）',
  missionsTitle: 'ストーリーモード',
  missionsIntro: 'あなたは調査船 SV-01 の艦長です。太陽系のあちこちから届く依頼をこなしましょう。',
  missionNumber: (n: number) => `任務${n}`,
  locked: '前の任務を終えると始められます',
  client: (name: string) => `依頼：${name}`,
  goals: 'やること',
  depart: '出発する',
  back: '一覧へもどる',
  close: '閉じる',
  quit: 'やめる',
  navi: 'ナビ',
  progress: (pct: number) => `${pct}%`,
  hits: (n: number, total: number) => `命中 ${n} / ${total}`,
  waitNear: 'そばまで行くと進みます',
  complete: '任務達成！',
  learned: '今回わかったこと',
  quizTitle: (n: number, total: number) => `確認クイズ ${n} / ${total}`,
  right: '正解！',
  wrong: (answer: string) => `残念！ 正解は「${answer}」`,
  next: '次へ',
  showResult: '結果を見る',
  starsLabel: (n: number) => `星 ${n} / 3`,
  starsNote: '任務達成で星1つ、クイズの正解で1問ごとに星1つ。',
  best: (n: number) => `これまでの最高：星${n}`,
  nextMission: '次の任務へ',
  retry: 'もう一度',
  allDone: 'すべての任務を達成しました！艦長、太陽系の旅はいかがでしたか。航海日誌や連続クイズで、まだ知らない天体のことも調べてみましょう。',
  noRace: 'レース中は任務を始められません。',
  rockName: '小惑星 2026 SV',
  chaptersIntro: 'あなたは船団の艦長です。船を選ぶと、その船の得意技を使う任務が始まります。SF モードにすると、SF 編の章も出てきます。',
  chaptersIntroSF: 'あなたは船団の艦長です。船を選ぶと、その船の得意技を使う任務が始まります。紫の SF の章は、空想の建造物が舞台です。',
  skill: '得意技',
  /** 「見出し：中身」 */
  labelled: (label: string, value: string) => `${label}：${value}`,
  /** 一行に並べるものの間 */
  gap: '　',
  /** 名前を並べる：どれも（見つけた場所：フォボス・ダイモス） */
  list: (items: readonly string[]) => items.join('・'),
  /** 名前を並べる：どれか一つ（フォボス・ダイモス・プロテウスに着陸して） */
  listOr: (items: readonly string[]) => items.join('・'),
  shipForChapter: (ship: string) => `この章では ${ship} に乗ります（任務を始めると乗り換えます）`,
  backToChapters: '章の一覧へ',
  chapterDone: 'この章の任務をすべて達成しました！ほかの船の章にも挑戦してみましょう。',
  cargo: '荷物を積んでいます：船が重く、最高速度が下がっています',
  eclipseAgain: '日食の画面をもう一度ひらく',
  realScience: '現実の科学では',
  mechName: '動けなくなった作業メカ',
  launch: '探査艇を発進',
  land: '着陸艇を降ろす',
  craftFar: '目標にもっと近づくと、艇を出せます',
  craftOut: '艇が飛んでいます…',
  sailLight: (x: string) => `太陽の光の強さ：地球のそばの ${x} 倍`,
  sailLaser: 'レーザーの光を帆に受けています',
  sailMoved: (n: number) => `光の帆で進んだ道のり ${n}%`,
  fleet: '船団 全6隻',
  shipForMission: (ship: string) => `この任務では ${ship} に乗ります（任務を始めると乗り換えます）`,
  framing: {
    ok: '撮影中…',
    out: '目標を枠の中へ',
    far: 'もっと近づいて',
    near: '少し離れて',
    hidden: 'ほかの天体のかげ',
    fast: 'もっとゆっくり',
  } satisfies Record<Framing, string>,
  approach: approachJa,
  beamGauge: beamGaugeJa,
  blackHole: blackHoleJa,
  bridge: bridgeJa,
  bridgePanel: bridgePanelJa,
  chargeBeam: chargeBeamJa,
  compareModels: compareModelsJa,
  consoles: consolesJa,
  contextLost: contextLostJa,
  cube: cubeJa,
  deepSpace: deepSpaceJa,
  eclipsePanel: eclipsePanelJa,
  ephemeris: ephemerisJa,
  eva: evaJa,
  evaView: evaViewJa,
  exoplanet: exoplanetJa,
  flight: flightJa,
  galleryPanel: galleryPanelJa,
  historicBook: historicBookJa,
  historicPanel: historicPanelJa,
  hud: hudJa,
  landing: landingJa,
  logPanel: logPanelJa,
  navPanel: navPanelJa,
  observe: observeJa,
  observePanel: observePanelJa,
  photoNote: photoNoteJa,
  probePanel: probePanelJa,
  probeScene: probeSceneJa,
  quiz: quizJa,
  quizPanel: quizPanelJa,
  race: raceJa,
  racePanel: racePanelJa,
  rallyHiscore: rallyHiscoreJa,
  rallyPanel: rallyPanelJa,
  rockBook: rockBookJa,
  roverHud: roverHudJa,
  scaleToggle: scaleToggleJa,
  sf: sfJa,
  sfBadge: sfBadgeJa,
  sfEngine: sfEngineJa,
  sfHourglass: sfHourglassJa,
  sfJapan: sfJapanJa,
  sfSides: sfSidesJa,
  sfSpace: sfSpaceJa,
  shipPicker: shipPickerJa,
  sizeCompare: sizeCompareJa,
  spaceDock: spaceDockJa,
  stampBook: stampBookJa,
  stamps: stampsJa,
  stampGroups: stampGroupsJa,
  stampTitles: stampTitlesJa,
  stateLaunch: stateLaunchJa,
  sun: sunJa,
  surfaceView: surfaceViewJa,
  telescopeView: telescopeViewJa,
  telescopes: telescopesJa,
  throttle: throttleJa,
  timeBar: timeBarJa,
  touchBar: touchBarJa,
  news: newsJa,
  touchControls: touchControlsJa,
  apollo17: apollo17Ja,
  bodies: bodiesJa,
  bridgeParts: bridgePartsJa,
  compareItems: compareItemsJa,
  deepSpaceImages: deepSpaceImagesJa,
  eclipses: eclipsesJa,
  evaJobs: evaJobsJa,
  evaSites: evaSitesJa,
  evaTools: evaToolsJa,
  phaserFacts: phaserFactsJa,
  pois: poisJa,
  probes: probesJa,
  rallyColors: rallyColorsJa,
  rallyTracks: rallyTracksJa,
  rockSamples: rockSamplesJa,
  rockComp: rockCompJa,
  rockGroups: rockGroupsJa,
  rockGroupsWhere: rockGroupsWhereJa,
  ships: shipsJa,
  surfaceNotes: surfaceNotesJa,
  surfaceSites: surfaceSitesJa,
  surfaceSkyNotes: surfaceSkyNotesJa,
}
