// Unit tests for the race ghost in src/state/rallyGhost.ts. The ghost replays an earlier run as a translucent rover
// that races along with the player; that file records the run, replays it, and stores it in the browser.
// Tested here: samples at exact times from uneven frames, a finish exactly on a sample time (not stored twice),
// replay between samples, heading across ±π, a teleport (snap, no glide), time going back (an error), the stored
// format (round trip, another course refused, a broken record throws), the date of a stored result (absent when the
// run has none), the storage key's form (one per track), and the size of a 3-minute run.
// The tests import only that file and Node's own node:test and node:assert/strict. At commits d0ef578 and a41f635 that
// file imports nothing, so no `npm install` is needed; all 8 tests pass there (checked: src/state/rallyGhost.ts is the
// same at both commits, `git diff --quiet d0ef578 a41f635 -- src/state/rallyGhost.ts` exits 0; tests run on a41f635).
//
// Run from the repository root:
//   node --test .memory/tools/tests/rallyGhost.test.ts
// Node 22.18.0 and later 22.x, and 23.6.0 and later, run a TypeScript file like this one directly. Node 22.6.0 to
// 22.17.x and 23.0 to 23.5 need a flag:
//   node --experimental-strip-types --test .memory/tools/tests/rallyGhost.test.ts
// Some versions print an ExperimentalWarning about type stripping; it does not change the result. Checked with
// Node 22.6.0, 22.17.1 and 23.5.0 (with the flag) and with 22.18.0, 23.6.0 and 24.22.2 (without).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GhostRecorder, coursePrint, decodeGhost, encodeGhost, ghostAt, ghostKey, ghostSamples, type GhostPose } from '../../../src/state/rallyGhost.ts'

const P = (x: number, heading = 0, y = 0): GhostPose => ({ x, y, z: 0, heading, pitch: 0, roll: 0 })
const out = () => P(0)
const close = (a: number, b: number, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`)

/** drive at constant v along x with uneven frame steps; returns the run */
function drive(v: number, T: number, steps: number[]) {
  const rec = new GhostRecorder(10)
  rec.hold(P(0))
  let t = 0
  let i = 0
  while (true) {
    const nt = t + steps[i++ % steps.length]
    if (nt >= T) break
    t = nt
    rec.frame(t, P(v * t))
  }
  return rec.finish(T, P(v * T))
}

test('samples are exact at k/hz even with uneven frames, and replay is exact in between', () => {
  const run = drive(10, 3.03, [0.016, 0.033, 0.05, 0.007])
  // 0.0 … 3.0 on the grid, then the finish at 3.03
  assert.equal(ghostSamples(run), 32)
  for (let k = 0; k <= 30; k++) close(run.data[k * 6], 10 * (k / 10), 1e-3)
  close(run.data[31 * 6], 30.3, 1e-3)
  for (const t of [0, 0.05, 1.234, 2.99, 3.01, 3.03]) close(ghostAt(run, t, out()).x, 10 * t, 1e-3)
  // clamped before the start and after the finish
  close(ghostAt(run, -1, out()).x, 0)
  close(ghostAt(run, 99, out()).x, 30.3, 1e-3)
})

test('a finish exactly on a sample time is not stored twice', () => {
  const run = drive(5, 2, [0.025])
  assert.equal(ghostSamples(run), 21)
  close(ghostAt(run, 2, out()).x, 10, 1e-3)
  close(ghostAt(run, 1.95, out()).x, 9.75, 1e-3)
})

test('heading turns the short way across ±π', () => {
  const rec = new GhostRecorder(10)
  rec.hold(P(0, Math.PI - 0.1))
  rec.frame(0.1, P(0, -Math.PI + 0.1))
  const run = rec.finish(0.2, P(0, -Math.PI + 0.1))
  const h = ghostAt(run, 0.05, out()).heading
  // halfway between π-0.1 and -π+0.1 the short way is ±π, not 0
  close(Math.abs(Math.cos(h) + 1), 0, 1e-6)
})

test('a teleport (back to the gate) snaps instead of gliding through the terrain', () => {
  const rec = new GhostRecorder(10)
  rec.hold(P(0))
  rec.frame(0.08, P(1))
  rec.frame(0.12, P(-200)) // R pressed: placed 200 m back
  const run = rec.finish(0.5, P(-197))
  const x = ghostAt(run, 0.1, out()).x
  assert.ok(x === -200 || Math.abs(x - 1) < 1e-3 + 0.25, `ghost at ${x} — glided between frames across the jump`)
  // replay between a pre-jump and a post-jump sample snaps to the nearer one (the jump time is known to ±half a sample)
  assert.equal(ghostAt(run, 0.03, out()).x, 0)
  assert.equal(ghostAt(run, 0.07, out()).x, -200)
})

test('time going back is an error, not a silent sample', () => {
  const rec = new GhostRecorder(10)
  rec.hold(P(0))
  rec.frame(1, P(1))
  assert.throws(() => rec.frame(0.5, P(2)), /time went back/)
  assert.throws(() => new GhostRecorder(10).frame(0.1, P(0)), /before hold/)
})

test('storage round trip; another course version is refused, a broken record throws', () => {
  const run = drive(8, 4.2, [0.016])
  const line: [number, number][] = [[0, 0], [10, 0], [10, 10]]
  const course = coursePrint(line)
  assert.equal(course, '3:20.0')
  const text = encodeGhost(run, course)
  const back = decodeGhost(text, course)
  assert.ok(back)
  assert.equal(back.time, run.time)
  assert.deepEqual(Array.from(back.data), Array.from(run.data))
  assert.equal(decodeGhost(text, '3:20.1'), null)
  const bad = JSON.parse(text)
  bad.b64 = bad.b64.slice(0, 8)
  assert.throws(() => decodeGhost(JSON.stringify(bad), course), /not whole samples/)
  bad.v = 99
  assert.throws(() => decodeGhost(JSON.stringify(bad), course), /format v99/)
})

test('a 3-minute run stays small enough for browser storage', () => {
  const run = drive(12, 180, [1 / 60])
  const kib = encodeGhost(run, '1:1.0').length / 1024
  assert.ok(kib < 60, `${kib.toFixed(1)} KiB`)
})

test('a stored run keeps the date of its result (at), absent when the run has none; one key per track', () => {
  const rec = new GhostRecorder()
  rec.hold(P(0))
  rec.frame(0.05, P(1))
  const run = { ...rec.finish(0.1, P(2)), at: 1_762_000_000_000 }
  const back = decodeGhost(encodeGhost(run, '1:1.0'), '1:1.0')
  assert.ok(back)
  assert.equal(back.at, run.at)
  const bare = decodeGhost(encodeGhost({ time: run.time, hz: run.hz, data: run.data }, '1:1.0'), '1:1.0')
  assert.ok(bare && bare.at === undefined)
  assert.equal(ghostKey('coprates'), 'solar-voyager:rally-ghost:coprates')
})
