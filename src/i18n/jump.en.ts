import type { Translation } from './translation'
import type { jumpJa } from './jump.ja'

// Gravity jump texts (components/surface/GravityJump.tsx and the card on the surface screen), English

const m = (h: number) => (h >= 100 ? `${Math.round(h).toLocaleString('en-US')} m` : h >= 10 ? `${h.toFixed(0)} m` : `${h.toFixed(1)} m`)
const time = (s: number) => (s < 60 ? `${s.toFixed(1)} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`)

export const jumpEn: Translation<typeof jumpJa> = {
  button: '🦘 Try a jump',
  buttonTip: 'Someone who jumps 50 cm on Earth jumps just as hard here. What happens?',
  again: 'Again',
  close: 'Close',
  you: 'Here',
  earth: 'Earth',
  height: m,
  jumping: 'Same push, ready… jump!',
  fastForward: (x: number) => `Fast-forward ×${x}`,
  result: (h: number, x: number) => (x < 1.15 ? `${m(h)} high: almost the same as on Earth` : `${m(h)} high: ${x >= 10 ? Math.round(x).toLocaleString('en-US') : x.toFixed(1)} times higher than on Earth!`),
  airtime: (s: number, x: number) => (x < 1.15 ? `In the air for ${time(s)}` : `In the air for ${time(s)} (${x >= 10 ? Math.round(x).toLocaleString('en-US') : x.toFixed(1)} times as long as on Earth)`),
  earthJumps: (n: number) => (n <= 1 ? '' : `On Earth you could jump ${n.toLocaleString('en-US')} times in that time`),
  note: 'The weaker the gravity, the higher and longer the same push carries you.',
  m,
  time,
}
