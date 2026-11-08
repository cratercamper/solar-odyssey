import type { ProbesJa } from './probes.ja'
import type { Translation } from './translation'

// The texts of data/probes.ts (English). Same keys as probes.ja.ts

export const probesEn: Translation<ProbesJa> = {
  voyager2: {
    name: 'Voyager 2',
    summary: 'The only probe to visit Jupiter, Saturn, Uranus and Neptune',
    last: 'It is still flying between the stars and sending data back to Earth.',
    events: [
      { text: 'Launch. Using a lineup that happens about once every 176 years, when the outer planets gather on one side, it sets off to visit four planets in a row.' },
      { text: 'Closest approach to Jupiter. Jupiter’s gravity speeds it up (a swing-by) and sends it on to Saturn.' },
      { text: 'Closest approach to Saturn. It studied the fine strands in the rings and the moons.' },
      { text: 'Closest approach to Uranus. Voyager 2 is still the only probe to have seen Uranus up close.' },
      { text: 'Closest approach to Neptune. On its moon Triton it found gas jetting out from under the ice. From here it heads south of the plane of the solar system.' },
      { text: 'It leaves the region the solar wind reaches (the heliosphere) and enters the space between the stars.' },
    ],
  },
  voyager1: {
    name: 'Voyager 1',
    summary: 'The farthest thing people have ever made',
    last: 'It is the most distant thing people have ever made.',
    events: [
      { text: 'Launch. It left 16 days after Voyager 2, but takes a shortcut and reaches Jupiter first.' },
      { text: 'Closest approach to Jupiter. It found the first erupting volcanoes beyond Earth, on the moon Io.' },
      { text: 'Closest approach to Saturn. It bent its course to study Titan, the moon with a thick atmosphere, and flew up out of the plane of the solar system to the north.' },
      { text: 'From about 6 billion km away it turned around and photographed Earth: a tiny blue dot in a streak of light (the “Pale Blue Dot”).' },
      { text: 'The first human-made object to leave the heliosphere and enter the space between the stars.' },
    ],
  },
  cassini: {
    name: 'Cassini',
    summary: 'Reached Saturn after four swing-bys, then orbited it for 13 years',
    last: 'Running out of fuel, it ended its mission by diving into Saturn’s atmosphere on September 15, 2017, so it would never crash onto a moon that might have life.',
    events: [
      { text: 'Launch. It is too heavy to fly straight to Saturn, so it borrows gravity from Venus, Venus again, Earth and Jupiter to speed up.' },
      { text: 'Swing-by at Venus (first time).' },
      { text: 'Swing-by at Venus (second time).' },
      { text: 'Swing-by at Earth. It passes very close to Earth and speeds up even more.' },
      { text: 'Swing-by at Jupiter. It observed Jupiter on the way past.' },
      { text: 'It entered orbit around Saturn.' },
      { text: 'Huygens, the small probe it carried, landed on the moon Titan.' },
      { text: 'It found water spraying out of the south pole of the moon Enceladus.' },
    ],
  },
  newhorizons: {
    name: 'New Horizons',
    summary: 'The first probe to see Pluto up close',
    last: 'It is still observing as it flies through the outer solar system (the Kuiper Belt).',
    events: [
      { text: 'Launch. It left Earth so fast that it passed the Moon’s orbit in just 9 hours.' },
      { text: 'A swing-by at Jupiter speeds it up even more.' },
      { text: 'Closest approach to Pluto. It saw a heart-shaped plain of ice.' },
      { text: 'It flew past Arrokoth, a small object in the outer solar system shaped like a snowman.' },
    ],
  },
  hayabusa2: {
    name: 'Hayabusa2',
    summary: 'The Japanese probe that brought back sand from the asteroid Ryugu',
    last: 'On December 6, 2020, its capsule landed in Australia and delivered the sand from Ryugu. The probe is continuing on toward its next asteroid.',
    events: [
      { text: 'Launch. Its goal is Ryugu, an asteroid that circles the Sun between Earth and Mars.' },
      { text: 'A swing-by at Earth puts it on course for Ryugu. Its ion engines speed it up little by little.' },
      { text: 'Arrival at Ryugu, an asteroid shaped like a spinning top.' },
      { text: 'First touchdown. It collected sand from the surface.' },
      { text: 'Second touchdown. It landed beside a crater it had made itself and collected sand from underground too.' },
      { text: 'It leaves Ryugu and heads for Earth.' },
    ],
  },
}
