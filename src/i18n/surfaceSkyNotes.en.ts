import type { SurfaceSkyNotesJa } from './surfaceSkyNotes.ja'
import type { Translation } from './translation'

// The texts of data/surfaces.ts (English). Same keys as surfaceSkyNotes.ja.ts

export const surfaceSkyNotesEn: Translation<SurfaceSkyNotesJa> = {
  moon: 'Earth stays in almost the same spot in the sky, going through phases.',
  io: 'Jupiter fills a huge part of the sky: about 40 times wider than the full Moon looks from Earth.',
  europa: 'Jupiter looks about 20 times wider than the full Moon.',
  phobos: 'Mars fills a huge part of the sky.',
  mimas: 'The moons orbit over Saturn’s equator, so the rings are seen edge-on as a thin line.',
  enceladus: 'The rings are seen almost edge-on, as a thin line.',
  iapetus: 'Its tilted orbit lets you see Saturn’s rings open.',
  titan: 'The haze is so thick that Saturn and the Sun are only a dim glow.',
  venus: 'The clouds are so thick you cannot tell where the Sun is.',
  pluto: 'Charon hangs in the same place in the sky, always.',
  charon: 'Pluto hangs in the same place in Charon’s sky, always.',
  earth: 'The Moon rises in the east in the afternoon and shines brightly at night.',
}
