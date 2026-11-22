import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { FlightCtl, FLOOR, LapMeter, topSpeed } from './flightControl'

const R = 1_737_400
const flat = () => 0

describe('FlightCtl', () => {
  it('stays above the floor and keeps fwd tangent', () => {
    const c = new FlightCtl(R)
    c.place(new THREE.Vector3(1, 0, 0), 50, new THREE.Vector3(0, 0, -1))
    for (let i = 0; i < 600; i++) c.step(1 / 60, { turn: 0.3, pitch: -1, gear: 7 }, flat)
    expect(c.p.length() - R).toBeGreaterThanOrEqual(FLOOR - 1e-6)
    expect(Math.abs(c.fwd.dot(c.up))).toBeLessThan(1e-9)
  })
  it('goes faster higher up', () => {
    expect(topSpeed(100_000)).toBeGreaterThan(topSpeed(100) * 50)
  })
})

describe('LapMeter', () => {
  it('counts a full great circle as one lap, and ignores sideways motion', () => {
    const p = new THREE.Vector3(R, 0, 0)
    const fwd = new THREE.Vector3(0, 0, -1)
    const lap = new LapMeter()
    lap.start(p, fwd)
    for (let i = 0; i < 360; i++) {
      p.applyAxisAngle(lap.axis, Math.PI / 180)
      lap.update(p)
    }
    expect(lap.angle).toBeCloseTo(Math.PI * 2, 6)
    const side = new LapMeter()
    side.start(new THREE.Vector3(R, 0, 0), fwd)
    const q = new THREE.Vector3(R, 0, 0)
    // 大円に直角（北へ）に 30° 動いても、一周の進みは 0
    q.applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 6)
    side.update(q)
    expect(Math.abs(side.angle)).toBeLessThan(1e-9)
  })
})
