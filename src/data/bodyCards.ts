import { PLANETS, SUN } from './bodies'

// 天体カード：大きさ・重力・1日の長さ・気温を、地球と並べてくらべる数字。
// 出典：NASA Planetary Fact Sheet と NASA の天体ページ（概数）。
// 重力は、公表されている質量と平均半径から GM/r² で計算した表面の値（ガス惑星は 1 気圧の雲の高さ）。
// 1日は「日の出から次の日の出まで」（太陽日）。衛星はみな親の星に同じ面を向けて回るので、
// 1日は親の星を1周する時間に近い（親の星が太陽を回るぶん、少し長くなる）

export type BodyCard = {
  id: string
  /** 平均半径（km） */
  radiusKm: number
  /** 表面の重力（m/s²） */
  gravity: number
  /** 1日の長さ（時間）。太陽は赤道の自転 */
  dayHours: number
  /** 気温（℃）。わかっているものだけ。min と max があれば昼と夜などの幅 */
  temp?: { min?: number; max?: number; mean?: number }
  /** 固い地面がない（ガス惑星・太陽）：重力と気温は雲の上（太陽は表面） */
  noGround?: boolean
  /** 自転が逆向き */
  retrograde?: boolean
}

export const EARTH_G = 9.81

/** 太陽日（時間）＝自転と公転から。retro は逆向きの自転 */
const solarDay = (spinH: number, yearDays: number) => {
  const spinD = Math.abs(spinH) / 24
  const sign = spinH < 0 ? -1 : 1
  // 太陽日 = 1 / |1/自転 − 1/公転|（逆向きの自転は足し算になる）
  return 24 / Math.abs(sign / spinD - 1 / yearDays)
}

// 重力（m/s²）と気温。数値は上のコメントの出典から
const EXTRA: Record<string, Pick<BodyCard, 'gravity' | 'temp' | 'noGround'> & { dayHours?: number }> = {
  sun: { gravity: 274, temp: { mean: 5500 }, noGround: true, dayHours: 25.4 * 24 },
  mercury: { gravity: 3.7, temp: { min: -180, max: 430 } },
  venus: { gravity: 8.87, temp: { mean: 464 } },
  earth: { gravity: 9.81, temp: { min: -89, max: 57, mean: 15 }, dayHours: 24 },
  moon: { gravity: 1.62, temp: { min: -170, max: 120 } },
  mars: { gravity: 3.73, temp: { min: -140, max: 20, mean: -63 }, dayHours: 24.66 },
  phobos: { gravity: 0.0058, temp: { min: -112, max: -4 } },
  deimos: { gravity: 0.0026 },
  jupiter: { gravity: 24.79, temp: { mean: -110 }, noGround: true, dayHours: 9.93 },
  io: { gravity: 1.8, temp: { mean: -130 } },
  europa: { gravity: 1.32, temp: { mean: -160 } },
  ganymede: { gravity: 1.43, temp: { mean: -160 } },
  callisto: { gravity: 1.24, temp: { mean: -140 } },
  saturn: { gravity: 10.44, temp: { mean: -140 }, noGround: true, dayHours: 10.56 },
  mimas: { gravity: 0.064, temp: { mean: -200 } },
  enceladus: { gravity: 0.113, temp: { mean: -200 } },
  tethys: { gravity: 0.146, temp: { mean: -187 } },
  dione: { gravity: 0.232, temp: { mean: -186 } },
  rhea: { gravity: 0.264, temp: { mean: -174 } },
  titan: { gravity: 1.35, temp: { mean: -180 } },
  iapetus: { gravity: 0.223 },
  uranus: { gravity: 8.87, temp: { mean: -195 }, noGround: true, dayHours: 17.24 },
  miranda: { gravity: 0.077, temp: { mean: -187 } },
  ariel: { gravity: 0.249 },
  umbriel: { gravity: 0.25 },
  titania: { gravity: 0.365 },
  oberon: { gravity: 0.355 },
  neptune: { gravity: 11.15, temp: { mean: -200 }, noGround: true, dayHours: 16.11 },
  proteus: { gravity: 0.067 },
  triton: { gravity: 0.779, temp: { mean: -235 } },
  pluto: { gravity: 0.62, temp: { mean: -230 } },
  charon: { gravity: 0.288, temp: { mean: -220 } },
}

function build(): BodyCard[] {
  const out: BodyCard[] = [{ id: 'sun', radiusKm: SUN.radiusKm, dayHours: EXTRA.sun.dayHours!, ...pick('sun') }]
  for (const p of PLANETS) {
    out.push({
      id: p.id,
      radiusKm: p.radiusKm,
      dayHours: EXTRA[p.id].dayHours ?? solarDay(p.rotationHours, p.orbitDays),
      retrograde: p.rotationHours < 0,
      ...pick(p.id),
    })
    for (const m of p.moons) {
      // 衛星は親の星に同じ面を向けたまま回る：自転＝公転（トリトンは逆向きに公転）
      out.push({ id: m.id, radiusKm: m.radiusKm, dayHours: solarDay(m.orbitDays * 24, p.orbitDays), ...pick(m.id) })
    }
  }
  return out
}

function pick(id: string) {
  const { gravity, temp, noGround } = EXTRA[id]
  return { gravity, temp, noGround }
}

/** 太陽、惑星（と冥王星）、その衛星の順 */
export const BODY_CARDS: BodyCard[] = build()

export const cardOf = (id: string) => BODY_CARDS.find((c) => c.id === id)
export const hasCard = (id: string | null | undefined) => !!id && BODY_CARDS.some((c) => c.id === id)

/** その天体が回っている親（衛星なら惑星、ほかは null） */
export function parentOf(id: string): string | null {
  for (const p of PLANETS) if (p.moons.some((m) => m.id === id)) return p.id
  return null
}
