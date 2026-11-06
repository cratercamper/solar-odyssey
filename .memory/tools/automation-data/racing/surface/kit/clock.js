// A fixed time step for the race, so that the time on the result card is the time the game simulated, the same on a
// fast machine and a slow one. The game's frame step (three.js's Clock) and its race timer (rallyNow in
// src/state/rally.ts) both read performance.now(). The game caps a frame's step at 0.05 s (Math.min(rawDt, 0.05) in
// Rover.tsx and Rally.tsx), so in a software-rendered browser drawing about one frame per second it simulates 0.05 s
// per frame while the race timer counts real seconds: a 7 s lap once read 2:44.6.
// Installed before Start. From then on performance.now() changes only once per drawn frame: until the race runs it
// follows real time; from the first frame of the race it advances exactly STEP seconds per frame (STEP, the track's
// check.step, is put in front of this code by make_route.py), so the rover, the rivals and the timer all take steps of
// STEP. Within a frame the clock stands still, so the game's loops that work "for up to N ms per frame" (ground tiles)
// finish their work in that frame.
(() => {
  if (window.__autoClock) throw new Error('the fixed-step clock is already installed')
  if (!(STEP > 0 && STEP <= 0.05)) throw new Error(`STEP must be in (0, 0.05] s (the game caps a frame at 0.05 s), not ${STEP}`)
  const real = performance.now.bind(performance)
  const rally = window.__sv.rally.state
  const C = (window.__autoClock = { step: STEP, now: real(), frames: 0, realAtRun: null, real })
  performance.now = () => C.now
  const tick = () => {
    if (C.realAtRun === null && rally.getState().phase === 'run') C.realAtRun = real()
    if (C.realAtRun !== null) {
      C.now += STEP * 1000
      C.frames++
    } else C.now = Math.max(C.now, real())
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return `clock: real time until the race runs, then ${STEP} s per frame`
})()
