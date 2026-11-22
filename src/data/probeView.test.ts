import { describe, expect, it } from 'vitest'
import { captionScene, flybyNumbers, poleOf, probeNow } from './probeView'
import { VOYAGER2_TRAJECTORY as V2 } from './trajectories/voyager2'
import { HAYABUSA2_TRAJECTORY as H2 } from './trajectories/hayabusa2'
import { CASSINI_TRAJECTORY as CA } from './trajectories/cassini'

const DAY = 86_400_000

describe('模型の画面の数字', () => {
  it('木星のスイングバイ：太陽から見て約10km/sから20km/s以上へ、木星から見た速さは前後で同じ', () => {
    const j = V2.encounters[1]
    const n = flybyNumbers(V2, j)
    expect(n.speedBefore).toBeGreaterThan(8)
    expect(n.speedBefore).toBeLessThan(12)
    expect(n.speedAfter).toBeGreaterThan(17)
    expect(Math.round(n.closestKm / 10000)).toBe(72)
    expect(n.turnPlanet).toBeGreaterThan(30)
  })

  it('海王星は雲の上 約5,000km をかすめた', () => {
    const n = flybyNumbers(V2, V2.encounters[4])
    expect(n.altitudeKm).toBeGreaterThan(4000)
    expect(n.altitudeKm).toBeLessThan(5500)
  })

  it('字幕の場面：打ち上げ→巡航→木星の最接近→海王星のあと', () => {
    expect(captionScene(V2, probeNow(V2, V2.encounters[0].ms + 0.1 * DAY)).kind).toBe('launch')
    expect(captionScene(V2, probeNow(V2, V2.encounters[0].ms + 300 * DAY)).kind).toBe('cruise')
    expect(captionScene(V2, probeNow(V2, V2.encounters[1].ms))).toEqual({ kind: 'flyby', body: 'jupiter', index: 1, step: 2 })
    expect(captionScene(V2, probeNow(V2, V2.encounters[4].ms + 400 * DAY)).kind).toBe('beyond')
  })

  it('はやぶさ2の字幕の場面：リュウグウへ近づく→ホームポジション→タッチダウン→出発', () => {
    const at = (ms: number) => captionScene(H2, probeNow(H2, ms))
    expect(at(Date.UTC(2018, 5, 20))).toMatchObject({ kind: 'stay', step: 'approach' })
    expect(at(Date.UTC(2018, 11, 1))).toMatchObject({ kind: 'stay', step: 'home' })
    expect(at(Date.UTC(2019, 1, 21, 22))).toMatchObject({ kind: 'stay', step: 'dip', dip: 2 })
    expect(at(Date.UTC(2019, 10, 20))).toMatchObject({ kind: 'stay', step: 'depart' })
    expect(at(Date.UTC(2017, 0, 1))).toEqual({ kind: 'cruise', after: 1 })
    expect(at(H2.encounters[3].ms)).toMatchObject({ kind: 'flyby', index: 3, step: 2 })
  })

  it('リュウグウの自転軸は、ほぼ黄道の南を向く', () => {
    expect(poleOf('ryugu')[2]).toBeLessThan(-0.99)
  })

  it('土星の北極は黄道の北の側に、天王星の北極は黄道の面の近くに寝ている', () => {
    expect(poleOf('saturn')[2]).toBeGreaterThan(0.8)
    expect(Math.abs(poleOf('uranus')[2])).toBeLessThan(0.2)
  })
})

describe('カッシーニの字幕の場面', () => {
  const at = (ms: number) => captionScene(CA, probeNow(CA, ms))
  const saturn = CA.encounters[5]
  it('金星2回・地球・木星はスイングバイ、土星ではとどまって、見どころごとに字幕が変わる', () => {
    expect(at(CA.encounters[1].ms)).toMatchObject({ kind: 'flyby', body: 'venus', index: 1, step: 2 })
    expect(at(CA.encounters[4].ms)).toMatchObject({ kind: 'flyby', body: 'jupiter', step: 2 })
    expect(at(saturn.ms + 3600_000)).toMatchObject({ kind: 'stay', step: 'approach' })
    expect(at(Date.UTC(2010, 0, 1))).toMatchObject({ kind: 'stay', step: 'home' })
    saturn.moments!.forEach((m, i) => expect(at(m.ms - 3600_000)).toMatchObject({ kind: 'stay', step: 'dip', dip: i }))
  })
})
