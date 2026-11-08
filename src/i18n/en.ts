import type { ja } from './ja'
import type { Translation } from './translation'
import { listEn } from './list'
import { approachEn } from './approach.en'
import { beamGaugeEn } from './beamGauge.en'
import { blackHoleEn } from './blackHole.en'
import { bridgeEn } from './bridge.en'
import { bridgePanelEn } from './bridgePanel.en'
import { chargeBeamEn } from './chargeBeam.en'
import { compareModelsEn } from './compareModels.en'
import { consolesEn } from './consoles.en'
import { contextLostEn } from './contextLost.en'
import { cubeEn } from './cube.en'
import { deepSpaceEn } from './deepSpace.en'
import { eclipsePanelEn } from './eclipsePanel.en'
import { ephemerisEn } from './ephemeris.en'
import { evaEn } from './eva.en'
import { evaViewEn } from './evaView.en'
import { exoplanetEn } from './exoplanet.en'
import { flightEn } from './flight.en'
import { galleryPanelEn } from './galleryPanel.en'
import { historicBookEn } from './historicBook.en'
import { historicPanelEn } from './historicPanel.en'
import { hudEn } from './hud.en'
import { landingEn } from './landing.en'
import { logPanelEn } from './logPanel.en'
import { navPanelEn } from './navPanel.en'
import { observeEn } from './observe.en'
import { observePanelEn } from './observePanel.en'
import { photoNoteEn } from './photoNote.en'
import { probePanelEn } from './probePanel.en'
import { probeSceneEn } from './probeScene.en'
import { quizEn } from './quiz.en'
import { quizPanelEn } from './quizPanel.en'
import { raceEn } from './race.en'
import { racePanelEn } from './racePanel.en'
import { rallyHiscoreEn } from './rallyHiscore.en'
import { rallyPanelEn } from './rallyPanel.en'
import { rockBookEn } from './rockBook.en'
import { roverHudEn } from './roverHud.en'
import { scaleToggleEn } from './scaleToggle.en'
import { sfEn } from './sf.en'
import { sfBadgeEn } from './sfBadge.en'
import { sfEngineEn } from './sfEngine.en'
import { sfHourglassEn } from './sfHourglass.en'
import { sfJapanEn } from './sfJapan.en'
import { sfSidesEn } from './sfSides.en'
import { sfSpaceEn } from './sfSpace.en'
import { shipPickerEn } from './shipPicker.en'
import { sizeCompareEn } from './sizeCompare.en'
import { spaceDockEn } from './spaceDock.en'
import { stampBookEn } from './stampBook.en'
import { stampsEn } from './stamps.en'
import { stampGroupsEn } from './stampGroups.en'
import { stampTitlesEn } from './stampTitles.en'
import { stateLaunchEn } from './stateLaunch.en'
import { sunEn } from './sun.en'
import { surfaceViewEn } from './surfaceView.en'
import { telescopeViewEn } from './telescopeView.en'
import { telescopesEn } from './telescopes.en'
import { throttleEn } from './throttle.en'
import { timeBarEn } from './timeBar.en'
import { touchBarEn } from './touchBar.en'
import { newsEn } from './news.en'
import { touchControlsEn } from './touchControls.en'
import { apollo17En } from './apollo17.en'
import { rockCompEn } from './rockComp.en'
import { rockGroupsEn, rockGroupsWhereEn } from './rockGroups.en'
import { bodiesEn } from './bodies.en'
import { bridgePartsEn } from './bridgeParts.en'
import { compareItemsEn } from './compareItems.en'
import { deepSpaceImagesEn } from './deepSpaceImages.en'
import { eclipsesEn } from './eclipses.en'
import { evaJobsEn } from './evaJobs.en'
import { evaSitesEn } from './evaSites.en'
import { evaToolsEn } from './evaTools.en'
import { phaserFactsEn } from './phaserFacts.en'
import { poisEn } from './pois.en'
import { probesEn } from './probes.en'
import { rallyColorsEn } from './rallyColors.en'
import { rallyTracksEn } from './rallyTracks.en'
import { rockSamplesEn } from './rockSamples.en'
import { shipsEn } from './ships.en'
import { surfaceNotesEn } from './surfaceNotes.en'
import { surfaceSitesEn } from './surfaceSites.en'
import { surfaceSkyNotesEn } from './surfaceSkyNotes.en'

// UI strings (English). Same keys as ja.ts; a key left out is shown in Japanese

export const en: Translation<typeof ja> = {
  missionsButton: 'Story mode (missions)',
  missionsTitle: 'Story mode',
  missionsIntro: 'You are the captain of the survey vessel SV-01. Take on requests from all over the solar system.',
  missionNumber: (n: number) => `Mission ${n}`,
  locked: 'Finish the previous mission to unlock',
  client: (name: string) => `Client: ${name}`,
  goals: 'Objectives',
  depart: 'Depart',
  back: 'Back to the list',
  close: 'Close',
  quit: 'Quit',
  navi: 'NAVI',
  progress: (pct: number) => `${pct}%`,
  hits: (n: number, total: number) => `Hits ${n} / ${total}`,
  waitNear: 'Get close to start',
  complete: 'Mission complete!',
  learned: 'What we learned',
  quizTitle: (n: number, total: number) => `Check quiz ${n} / ${total}`,
  right: 'Correct!',
  wrong: (answer: string) => `Not quite. The answer is "${answer}".`,
  next: 'Next',
  showResult: 'See the result',
  starsLabel: (n: number) => `${n} of 3 stars`,
  starsNote: 'One star for completing the mission, plus one for each correct answer.',
  best: (n: number) => `Best so far: ${n} ${n === 1 ? 'star' : 'stars'}`,
  nextMission: 'Next mission',
  retry: 'Try again',
  allDone:
    'You have completed every mission! Captain, how was your journey through the solar system? Keep exploring with the logbook and the quiz run to learn about the worlds you have not met yet.',
  noRace: 'You cannot start a mission during a race.',
  rockName: 'Asteroid 2026 SV',
  chaptersIntro: 'You command a fleet. Pick a ship to start missions that use its special skill. Switch to SF mode to unlock the SF chapters.',
  chaptersIntroSF: 'You command a fleet. Pick a ship to start missions that use its special skill. The purple SF chapters take place among imaginary structures.',
  skill: 'Skill',
  labelled: (label: string, value: string) => `${label}: ${value}`,
  gap: ' · ',
  list: listEn,
  listOr: (items: readonly string[]) => listEn(items, 'or'),
  shipForChapter: (ship: string) => `In this chapter you fly the ${ship} (you switch ships when a mission starts)`,
  backToChapters: 'All chapters',
  chapterDone: 'You have completed every mission in this chapter! Try another ship’s chapter.',
  cargo: 'Carrying cargo: the ship is heavy and its top speed is lower',
  eclipseAgain: 'Open the eclipse view again',
  realScience: 'In real science',
  mechName: 'Stranded work mech',
  launch: 'Launch the survey craft',
  land: 'Send down the lander',
  craftFar: 'Get closer to the target to launch a craft',
  craftOut: 'The craft is on its way…',
  sailLight: (x: string) => `Sunlight strength: ${x}× what it is near Earth`,
  sailLaser: 'The sail is catching the laser light',
  sailMoved: (n: number) => `Distance sailed by light: ${n}%`,
  fleet: 'The whole fleet (6 ships)',
  shipForMission: (ship: string) => `In this mission you fly the ${ship} (you switch ships when it starts)`,
  framing: {
    ok: 'Taking the photo…',
    out: 'Bring the target into the frame',
    far: 'Get closer',
    near: 'Back off a little',
    hidden: 'Hidden behind another body',
    fast: 'Slow down',
  },
  approach: approachEn,
  beamGauge: beamGaugeEn,
  blackHole: blackHoleEn,
  bridge: bridgeEn,
  bridgePanel: bridgePanelEn,
  chargeBeam: chargeBeamEn,
  compareModels: compareModelsEn,
  consoles: consolesEn,
  contextLost: contextLostEn,
  cube: cubeEn,
  deepSpace: deepSpaceEn,
  eclipsePanel: eclipsePanelEn,
  ephemeris: ephemerisEn,
  eva: evaEn,
  evaView: evaViewEn,
  exoplanet: exoplanetEn,
  flight: flightEn,
  galleryPanel: galleryPanelEn,
  historicBook: historicBookEn,
  historicPanel: historicPanelEn,
  hud: hudEn,
  landing: landingEn,
  logPanel: logPanelEn,
  navPanel: navPanelEn,
  observe: observeEn,
  observePanel: observePanelEn,
  photoNote: photoNoteEn,
  probePanel: probePanelEn,
  probeScene: probeSceneEn,
  quiz: quizEn,
  quizPanel: quizPanelEn,
  race: raceEn,
  racePanel: racePanelEn,
  rallyHiscore: rallyHiscoreEn,
  rallyPanel: rallyPanelEn,
  rockBook: rockBookEn,
  roverHud: roverHudEn,
  scaleToggle: scaleToggleEn,
  sf: sfEn,
  sfBadge: sfBadgeEn,
  sfEngine: sfEngineEn,
  sfHourglass: sfHourglassEn,
  sfJapan: sfJapanEn,
  sfSides: sfSidesEn,
  sfSpace: sfSpaceEn,
  shipPicker: shipPickerEn,
  sizeCompare: sizeCompareEn,
  spaceDock: spaceDockEn,
  stampBook: stampBookEn,
  stamps: stampsEn,
  stampGroups: stampGroupsEn,
  stampTitles: stampTitlesEn,
  stateLaunch: stateLaunchEn,
  sun: sunEn,
  surfaceView: surfaceViewEn,
  telescopeView: telescopeViewEn,
  telescopes: telescopesEn,
  throttle: throttleEn,
  timeBar: timeBarEn,
  touchBar: touchBarEn,
  news: newsEn,
  touchControls: touchControlsEn,
  apollo17: apollo17En,
  bodies: bodiesEn,
  bridgeParts: bridgePartsEn,
  compareItems: compareItemsEn,
  deepSpaceImages: deepSpaceImagesEn,
  eclipses: eclipsesEn,
  evaJobs: evaJobsEn,
  evaSites: evaSitesEn,
  evaTools: evaToolsEn,
  phaserFacts: phaserFactsEn,
  pois: poisEn,
  probes: probesEn,
  rallyColors: rallyColorsEn,
  rallyTracks: rallyTracksEn,
  rockSamples: rockSamplesEn,
  rockComp: rockCompEn,
  rockGroups: rockGroupsEn,
  rockGroupsWhere: rockGroupsWhereEn,
  ships: shipsEn,
  surfaceNotes: surfaceNotesEn,
  surfaceSites: surfaceSitesEn,
  surfaceSkyNotes: surfaceSkyNotesEn,
}
