import { registerNav, useNavContext } from '../registry'
import { ui } from '../../../i18n'
import { closeEclipses, openEclipses, useEclipse } from '../../../state/eclipse'
import { closeMissions, openMissions, useMission } from '../../../state/mission'
import { openCampaign, useCampaign } from '../../../state/campaign'
import { CAMPAIGN_STAGES } from '../../../data/campaign'
import { useRace } from '../../../state/race'
import { QUIZ_LENGTH, startQuiz, useQuiz } from '../../../state/quiz'
import { startEva, startRepairEva } from '../../../state/eva'
import { startWalkDirect } from '../../../state/walk'
import { openStamps, useStamps } from '../../../state/stamps'
import { NATURAL } from '../../../data/stamps'
import { openRocks, useRockBook } from '../../../state/rockBook'
import { useSampleLog } from '../../../state/rover'
import { ROCK_TOTAL, rockCount } from '../../../data/rockCollection'
import { openProbes, useProbes } from '../../../state/probes'

// いまある遊び・学びの入口。order はタブの中の並び（10 きざみ。あいだに足せる）

registerNav({
  id: 'missions',
  tab: 'play',
  order: 10,
  className: 'mission-start',
  label: () => ui().missionsButton,
  use: () => ({ on: useMission((m) => m.phase) !== 'closed', disabled: useNavContext().racing }),
  run: () => {
    if (useMission.getState().phase !== 'active') closeEclipses()
    openMissions()
  },
})

registerNav({
  id: 'campaign',
  tab: 'play',
  order: 20,
  className: 'campaign-open mission-start',
  label: () => ui().campaign.navButton,
  use: () => {
    const { racing, onMission } = useNavContext()
    const on = useCampaign((c) => c.active)
    const stage = useCampaign((c) => c.stage)
    return { on, disabled: racing || onMission, label: on && stage < CAMPAIGN_STAGES.length ? ui().campaign.navButtonActive(stage + 1, CAMPAIGN_STAGES.length) : undefined }
  },
  run: () => (closeEclipses(), openCampaign()),
})

registerNav({
  id: 'race',
  tab: 'play',
  order: 30,
  className: 'race-start',
  label: () => ui().navPanel.race,
  use: () => {
    const { busy, onMission } = useNavContext()
    return { disabled: busy || onMission }
  },
  run: () => useRace.getState().start(),
})

registerNav({
  id: 'quiz',
  tab: 'learn',
  order: 10,
  className: 'quiz-start',
  label: () => ui().navPanel.quizRun(QUIZ_LENGTH),
  use: () => ({ on: useQuiz((q) => q.open), disabled: useNavContext().racing }),
  run: () => (closeEclipses(), startQuiz()),
})

registerNav({
  id: 'eva',
  tab: 'play',
  order: 40,
  className: 'eva-start',
  kbd: 'K',
  label: () => ui().navPanel.spacewalk,
  use: () => {
    const { busy, flight } = useNavContext()
    return { disabled: busy || !flight }
  },
  run: () => (closeEclipses(), startEva()),
})

registerNav({
  id: 'eva-repair',
  tab: 'play',
  order: 50,
  className: 'eva-start repair',
  label: () => ui().navPanel.spacewalkRepair,
  use: () => {
    const { busy, flight } = useNavContext()
    return { disabled: busy || !flight }
  },
  run: () => (closeEclipses(), startRepairEva()),
})

registerNav({
  id: 'walk',
  tab: 'play',
  order: 60,
  world: 'sf',
  className: 'walk-start',
  label: () => ui().navPanel.walkPark,
  use: () => {
    const { busy, flight } = useNavContext()
    return { disabled: busy || !flight }
  },
  run: () => (closeEclipses(), startWalkDirect()),
})

registerNav({
  id: 'stamps',
  tab: 'learn',
  order: 20,
  className: 'stamp-start',
  label: () => ui().navPanel.stampBook,
  use: () => ({ on: useStamps((b) => b.open), badge: `${useStamps((b) => NATURAL.filter((id) => id in b.stamps).length)}/${NATURAL.length}` }),
  run: () => openStamps(),
})

registerNav({
  id: 'rocks',
  tab: 'learn',
  order: 30,
  className: 'rock-start',
  label: () => ui().navPanel.rockCollection,
  use: () => ({ on: useRockBook((r) => r.open), badge: `${useSampleLog((l) => rockCount(l.log))}/${ROCK_TOTAL}` }),
  run: () => openRocks(),
})

registerNav({
  id: 'probes',
  tab: 'learn',
  order: 40,
  className: 'probe-start',
  label: () => ui().navPanel.probeJourneys,
  use: () => ({ on: useProbes((p) => p.open), disabled: useNavContext().busy }),
  run: () => (closeEclipses(), openProbes()),
})

registerNav({
  id: 'eclipses',
  tab: 'see',
  order: 10,
  className: 'eclipse-start',
  label: () => ui().navPanel.eclipsesFromSpace,
  use: () => {
    const { busy, onMission } = useNavContext()
    return { on: useEclipse((e) => e.open), disabled: busy || onMission }
  },
  run: () => (closeMissions(), openEclipses()),
})
