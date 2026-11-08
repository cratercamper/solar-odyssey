import type { quizPanelJa } from './quizPanel.ja'
import type { Translation } from './translation'
import { theEn } from './article'

// The texts of ui/QuizPanel.tsx (English). Same keys as quizPanel.ja.ts

export const quizPanelEn: Translation<typeof quizPanelJa> = {
  quizResults: 'Quiz results',
  resultScore: (score: number, QUIZ_LENGTH: number) => `Result: ${score} / ${QUIZ_LENGTH} correct`,
  close: 'Close',
  earnedTitle: (score: string) => `Title: ${score}`,
  longestStreak: 'Longest streak',
  longestStreakCount: (bestStreak: number) => `${bestStreak}`,
  bestSoFar: 'Best so far',
  bestSoFarCount: (best: number) => `${best}`,
  newRecord: 'New record!',
  goSeeMissed: 'Go and see the ones you missed',
  warpTo: (id: string) => `Warp to ${theEn(id)}`,
  arriveNote: 'When you arrive, the ship’s log has more facts and a quiz.',
  allCorrect: 'All correct. Amazing!',
  tryAgain: 'Try again',
  quizRun: 'Quiz run',
  questionNumber: (index: number, QUIZ_LENGTH: number) => `Question ${index} / ${QUIZ_LENGTH}`,
  correctCount: 'Correct',
  streak: 'Streak',
  correctStreak: (streak: number) => `Correct! ${streak} in a row!`,
  correct: 'Correct!',
  notQuiteAnswer: (answer: string) => `Not quite! The answer is “${answer}.”`,
  seeResults: 'See results',
  nextQuestion: 'Next question',
}
