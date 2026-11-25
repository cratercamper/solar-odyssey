import type { campaignJa } from './campaign.ja'
import type { Translation } from './translation'
import { theEn } from './article'

// The texts of ui/Campaign.tsx and state/campaign.ts (English). Same keys as campaign.ja.ts

export const campaignEn: Translation<typeof campaignJa> = {
  title: 'The Professor’s Survey Team',
  tagline: 'Follow the “strange signals” found by unmanned probes, from the Moon all the way to Jupiter. Collect rocks to open the way to the next world.',
  start: 'Start the campaign',
  resume: (n: number, max: number) => `Continue (chapter ${n} of ${max})`,
  cleared: 'Part 1 cleared! Play again',
  restart: 'Start over',
  close: 'Close (keep exploring freely)',
  free: 'Leave the campaign, explore freely',
  // nav computer button
  navButton: 'Campaign: The Professor’s Survey Team',
  navButtonActive: (n: number, max: number) => `Campaign (chapter ${n} of ${max})`,
  goal: (body: string, count: number) => `Collect ${count} rocks on ${theEn(body)}`,
  goalShort: (body: string) => `Rocks on ${theEn(body)}`,
  goalLabel: 'Goal',
  goTo: 'Set course',
  nextStep: 'Next',
  stepWarp: (body: string) => `Warp to ${theEn(body)}`,
  stepWarping: (body: string) => `Warping to ${theEn(body)}…`,
  stepApproach: (body: string) => `Fly closer to ${theEn(body)}`,
  stepLand: (body: string) => `Land on ${theEn(body)}`,
  stepRover: 'Send out the rover and collect the glowing rocks',
  stepCollect: 'Drive up to a glowing rock and take it (E key or the Take button)',
  stepLeave: 'All collected! Take off and report to the professor',
  stepTakeOff: (body: string) => `Take off and head for ${theEn(body)}`,
  doWarp: 'Warp',
  doApproach: 'Fly closer',
  doLand: 'Land',
  doRover: 'Send out the rover',
  doTakeOff: 'Take off',
  allMenus: 'Show all menus',
  focusMenus: 'Show only the goal',
  howTo: 'Near the body, press “Land” → deploy the rover, drive to a rock with a light pillar and press E (sample)',
  locked: (body: string, goal: string) => `You can’t go to ${theEn(body)} yet. First: “${goal}”`,
  lockedMark: '🔒',
  professor: 'Dr. Minase',
  ok: 'Got it!',
  next: 'Next',
  quit: 'Switch to free exploration',
  stages: {
    moon: {
      chapter: 'Chapter 1: To the Moon',
      intro: 'Welcome to the survey team! I’m Dr. Minase, the science officer on this ship.\nWe’ve been exploring the Solar System with unmanned landers and rovers, and now “strange signals” are coming in from all over.\nLet’s start with some practice. Land on the nearest world, the Moon, and collect 3 rocks with the rover.',
      done: 'Well done! Moon rocks hold a record of the Solar System from 4.5 billion years ago.\n…And look at this! The unmanned rover on Mars just picked up a radio signal with the same shape. I’m opening the warp to Mars.',
    },
    mars: {
      chapter: 'Chapter 2: Signal from the red planet',
      intro: 'Long ago, water flowed on Mars. The ground is red because the iron in it has rusted.\nTo find where the signal comes from, collect 3 rocks on Mars.',
      done: 'We found minerals in the Mars rocks that formed in water!\nThe signal… it’s also coming from Venus and Mercury, close to the Sun. I’ve opened the way to both.',
    },
    inner: {
      chapter: 'Chapter 3: Worlds close to the Sun',
      intro: 'Venus hides under thick clouds and is 460 °C hot. On Mercury, day and night differ by 600 °C.\nBoth are tough, but the rover can take it. Collect 2 rocks each on Venus and Mercury.',
      done: 'Great work! Comparing the signals… the strongest one is far away, on Jupiter’s moon Europa.\nThey say there’s an ocean under its ice. I’m opening the warp to Jupiter and its moons.',
    },
    jupiter: {
      chapter: 'Chapter 4: Europa, the ice moon',
      intro: 'Under Europa’s ice there may be more water than in all of Earth’s oceans.\nThe signal is coming from beneath that ice… Collect 3 rocks (ice) on Europa.',
      done: 'A strange light from the cracks in Europa’s ice…! Is it something alive? Or…\nThanks to you, we’re getting closer to the source of the signal.',
    },
  },
  end: 'That’s the end of Part 1. Great job, explorer!\nWe’ll chase the mystery of the signal again in the next chapter. Until then, explore the worlds you’ve opened as much as you like.',
  endTitle: 'End of Part 1',
  progress: (have: number, need: number) => `${have}/${need}`,
}
