// The test's verdict, after the race: PASS only if the race finished with every gate passed; the time is inside
// CHECK.time (seconds); the pilot had no error and did not need the game's "back to the gate"; no console error since
// the track was added; the game drew at the pinned level QUALITY from the Start button to the finish; and, with a
// record, its name is in the result card's table. Returns the findings as JSON (the route saves them) and keeps them in
// window.__autoResult; the route's last step fails the run unless PASS.
// CHECK, RECORD and QUALITY are put in front of this code by make_route.py.
(() => {
  const st = window.__sv.rally.state.getState()
  const p = window.__pilot
  const card = document.querySelector('.rally-result')
  const out = {
    phase: st.phase, gates: `${st.gate}/${st.gates}`, time: st.result?.time ?? null, place: st.result?.place ?? null,
    pilot: p, errors: window.__autoErrors, table: card ? card.innerText : null, level: window.__autoLevel ?? null,
  }
  const C = window.__autoClock
  if (C) out.clock = { step: C.step, frames: C.frames, real_s: C.realAtRun === null ? null : (C.real() - C.realAtRun) / 1000 }
  const fail = []
  if (st.phase !== 'done' || !st.result) fail.push(`the race did not finish (phase ${st.phase})`)
  if (st.gate !== st.gates) fail.push(`gates passed ${st.gate} of ${st.gates}`)
  const [lo, hi] = CHECK.time
  if (!(st.result?.time >= lo && st.result?.time <= hi)) fail.push(`time ${st.result?.time} s is outside ${lo}-${hi} s`)
  if (p?.error) fail.push(`pilot error: ${p.error}`)
  if (p?.resets) fail.push(`the pilot was sent back to a gate ${p.resets} time(s)`)
  if (window.__autoErrors.length) fail.push(`${window.__autoErrors.length} console error(s): ${window.__autoErrors[0]}`)
  if (!C) fail.push('no fixed-step clock (clock.js): the time is real time')
  const L = window.__autoLevel
  if (!L) fail.push('no record of the drawing level (the route\'s level watch)')
  else {
    if (L.start !== QUALITY) fail.push(`the race started at level ${L.start}, not the pinned ${QUALITY}`)
    // a change of level rebuilds the rivals; after the finish ('done') it no longer matters
    const during = L.changes.filter((c) => c.phase !== 'done')
    const seen = during.map((c) => `${c.from}->${c.to} (${c.phase})`).join(', ')
    if (during.length) fail.push(`the level changed during the race: ${seen}`)
  }
  if (!card) fail.push('no result card')
  if (RECORD && !(card?.innerText ?? '').includes(RECORD.name)) fail.push(`the result card's table does not show ${RECORD.name}`)
  out.verdict = fail.length ? 'FAIL: ' + fail.join('; ') : 'PASS'
  window.__autoResult = out
  return JSON.stringify(out, null, 1)
})()
