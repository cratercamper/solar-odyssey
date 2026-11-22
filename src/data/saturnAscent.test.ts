import { describe, expect, it } from 'vitest'
import { altitude, guidePitch, orbitOf, startAscent, stepAscent, velocities, TARGET_ALT, type AscentEvent } from './saturnAscent'

function fly(err = (_t: number) => 0, log = false) {
  const a = startAscent()
  const events: [AscentEvent, number, number, number][] = []
  for (let i = 0; i < 20 * 900 && !a.cutoff; i++) {
    const out: AscentEvent[] = []
    stepAscent(a, 0.05, guidePitch(a) + err(a.t), out)
    for (const e of out) events.push([e, Math.round(a.t), Math.round(altitude(a) / 1000), Math.round(velocities(a).speed)])
    if (log && i % 400 === 0) console.log(Math.round(a.t), (altitude(a) / 1000).toFixed(1), Math.round(velocities(a).speed), guidePitch(a).toFixed(1), (a.accel / 9.8).toFixed(2))
  }
  return { a, events }
}

describe('Saturn V ascent', () => {
  it('reaches a ~170 km orbit when following the guide', () => {
    const { a, events } = fly(undefined, true)
    console.log(events)
    const o = orbitOf(a)
    console.log('orbit', a.t.toFixed(0), o.peri / 1000, o.apo / 1000, 'S3 prop left', a.prop)
    expect(a.cutoff).toBe(true)
    expect(o.peri).toBeGreaterThan(TARGET_ALT - 15_000)
    expect(o.apo).toBeLessThan(TARGET_ALT + 30_000)
    // 実物は 11 分 40 秒ほどで軌道に入った
    expect(a.t).toBeGreaterThan(560)
    expect(a.t).toBeLessThan(780)
  })
  it('still reaches orbit with a sloppy pilot in the first stage', () => {
    const { a } = fly((t) => (t > 20 && t < 160 ? 6 * Math.sin(t / 9) : 0))
    const o = orbitOf(a)
    expect(a.cutoff).toBe(true)
    expect(o.peri).toBeGreaterThan(TARGET_ALT - 25_000)
  })
})

describe('TLI', () => {
  it('the third stage has enough propellant left to send the ship to the Moon', async () => {
    const { progradePitch, startTli } = await import('./saturnAscent')
    const a = startAscent()
    while (!a.cutoff) stepAscent(a, 0.05, guidePitch(a))
    // 軌道を半周ほど回ってから
    for (let i = 0; i < 2600; i++) stepAscent(a, 1, progradePitch(a))
    startTli(a)
    const out: AscentEvent[] = []
    const t0 = a.t
    while (!a.cutoff) stepAscent(a, 0.05, progradePitch(a), out)
    console.log('TLI burn', (a.t - t0).toFixed(0), 's, speed', velocities(a).speed.toFixed(0), 'prop left', a.prop.toFixed(0), out)
    expect(out).toContain('tliCutoff')
    expect(a.prop).toBeGreaterThan(0)
    expect(velocities(a).speed).toBeGreaterThan(10_000)
  })
})
