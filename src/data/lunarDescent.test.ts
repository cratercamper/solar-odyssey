import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  emptyInput,
  ignitePdi,
  orbitOf,
  orbitPlane,
  siteFrame,
  startArrival,
  startDescent,
  stepDescent,
  stepStack,
  takeOver,
  targetOffset,
  landingStars,
  LOI_IDEAL,
  PDI_LATE,
  LM_PROP,
  type DescentEvent,
} from './lunarDescent'

const f = siteFrame()
const pl = orbitPlane(f)
const flat = () => -3_500

describe('lunar orbit insertion', () => {
  it('a burn around perilune captures the ship into a ~315 x ~100 km orbit', () => {
    const s = startArrival(pl)
    const o0 = orbitOf(s.r, s.v)
    expect(o0.e).toBeGreaterThan(1)
    expect(o0.peri).toBeGreaterThan(100_000)
    while (s.t < LOI_IDEAL) stepStack(s, Math.min(5, LOI_IDEAL - s.t))
    s.burning = true
    s.burnStart = s.t
    let ev = null
    while (!ev) ev = stepStack(s, 0.5)
    const o = orbitOf(s.r, s.v)
    console.log('LOI burn', (s.burnEnd! - s.burnStart).toFixed(0), 's', (o.peri / 1000).toFixed(0), 'x', (o.apo / 1000).toFixed(0), 'km, mass', s.m.toFixed(0))
    expect(s.burnEnd! - s.burnStart).toBeGreaterThan(330)
    expect(s.burnEnd! - s.burnStart).toBeLessThan(460)
    expect(o.apo).toBeLessThan(320_000)
    expect(o.peri).toBeGreaterThan(70_000)
  })
})

function descend(opts: { pdi?: number; manual?: (d: ReturnType<typeof startDescent>, inp: ReturnType<typeof emptyInput>) => void; log?: boolean } = {}) {
  const d = startDescent(pl, f, flat, 300)
  d.auto = !opts.manual
  const input = emptyInput()
  const events: [DescentEvent, number, number, number][] = []
  const pdi = opts.pdi ?? 0
  for (let i = 0; i < 40_000 && d.mode !== 'landed' && d.mode !== 'abort'; i++) {
    if (d.mode === 'coast' && d.t >= pdi) ignitePdi(d)
    if (opts.manual && d.mode === 'terminal') opts.manual(d, input)
    const out: DescentEvent[] = []
    stepDescent(d, d.mode === 'coast' ? 1 : 0.1, input, flat, out)
    for (const e of out) events.push([e, Math.round(d.t - (d.pdiAt ?? 0)), Math.round(d.alt), Math.round(d.vSide)])
    if (opts.log && i % 300 === 0 && d.mode !== 'coast')
      console.log(d.mode, Math.round(d.t - (d.pdiAt ?? 0)), 'alt', Math.round(d.alt), 'vUp', d.vUp.toFixed(1), 'vSide', d.vSide.toFixed(0), 'thr', d.throttle.toFixed(2), 'prop', Math.round(d.prop), 'to go', Math.round(targetOffset(d).dist))
  }
  return { d, events }
}

describe('powered descent', () => {
  it('the guidance lands near the Apollo 17 spot with fuel to spare', () => {
    const { d, events } = descend()
    console.log(events, d.touch, 'prop left', Math.round(d.prop))
    expect(d.mode).toBe('landed')
    expect(d.touch!.miss).toBeLessThan(60)
    expect(Math.abs(d.touch!.vUp)).toBeLessThan(2.6)
    expect(d.prop).toBeGreaterThan(LM_PROP * 0.05)
    // 本物は PDI から着陸まで 12 分ほど
    const dur = d.t - d.pdiAt!
    expect(dur).toBeGreaterThan(620)
    expect(dur).toBeLessThan(820)
  })
  it('still reaches the spot when the descent is started at the very end of the window', () => {
    const { d } = descend({ pdi: PDI_LATE })
    expect(d.mode).toBe('landed')
    expect(d.touch!.miss).toBeLessThan(300)
  })
  it('lands long (but safely) when it cannot brake in time', () => {
    const d = startDescent(pl, f, flat, 20, THREE.MathUtils.degToRad(-14))
    d.auto = true
    const out: DescentEvent[] = []
    ignitePdi(d)
    for (let i = 0; i < 20_000 && d.mode !== 'landed' && d.mode !== 'abort'; i++) stepDescent(d, 0.1, emptyInput(), flat, out)
    expect(d.mode).toBe('landed')
    expect(out).toContain('landLong')
    expect(Math.abs(d.touch!.vUp)).toBeLessThan(1.6)
  })
  it('a pilot can take over, null the drift and set it down softly', () => {
    let taken = false
    const { d } = descend({
      manual: (d, inp) => {
        if (!taken) taken = takeOver(d)
        // 矢印は「その向きへ動く」指示：目標の向きへ、近づくほど弱く押す
        const o = targetOffset(d)
        inp.fwd = THREE.MathUtils.clamp(o.fwd * 0.1, -1, 1)
        inp.right = THREE.MathUtils.clamp(o.right * 0.1, -1, 1)
      },
    })
    console.log('manual', d.touch, Math.round(d.prop), targetOffset(d).dist)
    expect(d.mode).toBe('landed')
    expect(d.manual).toBe(true)
    expect(Math.abs(d.touch!.vUp)).toBeLessThan(1.2)
    expect(d.touch!.miss).toBeLessThan(60)
    expect(landingStars(d)).toBe(3)
  })
  it('a first-time pilot who mashes a direction and lets go still lands safely', () => {
    let taken = false
    let held = 0
    const { d } = descend({
      manual: (d, inp) => {
        if (!taken) taken = takeOver(d)
        // 初めの 6 秒、右を押しっぱなし。そのあとは何もしない（W/S も押さない）
        held += 0.1
        inp.right = held < 6 ? 1 : 0
        inp.fwd = 0
      },
    })
    expect(d.mode).toBe('landed')
    expect(Math.abs(d.touch!.vUp)).toBeLessThan(2.5)
    expect(d.touch!.vSide).toBeLessThan(1)
    expect(landingStars(d)).toBeGreaterThan(0)
  })
  it('holding "faster" all the way down cannot break the legs', () => {
    let taken = false
    const { d } = descend({
      manual: (d, inp) => {
        if (!taken) taken = takeOver(d)
        inp.rod = -1
      },
    })
    expect(d.mode).toBe('landed')
    expect(Math.abs(d.touch!.vUp)).toBeLessThan(3)
    expect(landingStars(d)).toBeGreaterThan(0)
  })
})
