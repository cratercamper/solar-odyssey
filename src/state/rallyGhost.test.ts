import { describe, expect, it } from 'vitest'
import { decodeGhost, encodeGhost, ghostAt, ghostSamples, GhostRecorder, packSamples, unpackSamples, type GhostPose } from './rallyGhost'

const pose = (x: number): GhostPose => ({ x, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 })

describe('race ghost (race clock)', () => {
  it('records one sample per 1/hz of race time, whatever the frame rate', () => {
    for (const fps of [15, 60, 144]) {
      const rec = new GhostRecorder(10)
      rec.hold(pose(0))
      let t = 0
      while (t < 5) {
        t = Math.min(5, t + 1 / fps)
        rec.frame(t, pose(t * 10))
      }
      const run = rec.finish(5, pose(50))
      expect(ghostSamples(run)).toBe(51)
      // 線形に走ったので、どの時刻でも x = 10 t
      const out = pose(0)
      for (const q of [0.05, 1.27, 3.5, 4.99]) expect(ghostAt(run, q, out).x).toBeCloseTo(q * 10, 3)
    }
  })

  it('stays at the start before 0 and at the finish after the time', () => {
    const rec = new GhostRecorder(10)
    rec.hold(pose(1))
    rec.frame(0.5, pose(2))
    const run = rec.finish(1, pose(3))
    expect(ghostAt(run, -1, pose(0)).x).toBe(1)
    expect(ghostAt(run, 9, pose(0)).x).toBe(3)
  })

  it('refuses time going back', () => {
    const rec = new GhostRecorder(10)
    rec.hold(pose(0))
    rec.frame(1, pose(1))
    expect(() => rec.frame(0.5, pose(1))).toThrow()
  })

  it('packs and saves losslessly, and ignores a run for another course', () => {
    const data = Float32Array.from([1.5, -2.25, 3, 0.1, 0.2, 0.3])
    expect([...unpackSamples(packSamples(data))]).toEqual([...data])
    const run = { time: 1, hz: 10, data }
    const text = encodeGhost(run, 'course-a')
    expect(decodeGhost(text, 'course-a')?.time).toBe(1)
    expect(decodeGhost(text, 'course-b')).toBeNull()
  })
})
