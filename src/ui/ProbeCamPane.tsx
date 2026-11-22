import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { Probe } from '../data/probes'
import { captionScene, flybyNumbers, planetRadiusKm, probeNow, type CaptionScene } from '../data/probeView'
import { probeClock, useProbes } from '../state/probes'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'
import '../styles/probeCam.css'

// 探査機の旅の右側（スマホの縦では上）：探査機の模型と、本物の速さ・距離、字幕の解説。
// 3D は別の Canvas（開いたときだけ読み込む）

const ProbeCamCanvas = lazy(() => import('../components/probeCam/ProbeCamCanvas'))

/** 光が1分に進む距離（km） */
const LIGHT_KM_PER_MIN = 299_792.458 * 60
/** 惑星と惑星のあいだの豆知識を変える間隔（ミリ秒） */
const CRUISE_MS = 6000

type Readout = { scene: CaptionScene; speed: number; relKm: number | null; body: string; earthKm: number; geoSpeed: number }

function useReadout(probe: Probe): Readout {
  const t = probe.trajectory!
  const read = (): Readout => {
    const now = probeNow(t, probeClock.ms)
    const relKm = now.rel ? Math.hypot(...now.rel) : null
    return {
      scene: captionScene(t, now),
      speed: now.speed,
      relKm,
      body: now.encounter.body,
      earthKm: now.earthKm,
      geoSpeed: now.relV ? Math.hypot(...now.relV) : 0,
    }
  }
  const [r, setR] = useState(read)
  useEffect(() => {
    const id = setInterval(() => setR(read()), 200)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe])
  return r
}

/** 字幕（2行まで）。場面が変わったら、ふわっと入れかえる */
function Caption({ probe, r }: { probe: Probe; r: Readout }) {
  useLang()
  const t = probe.trajectory!
  // 通過ごとの数字（道すじの何番目か。はやぶさ2は地球に2回来る）
  const numbers = useMemo(() => t.encounters.map((e, i) => (i > 0 && e.until === undefined ? flybyNumbers(t, e) : null)), [t])
  const [tick, setTick] = useState(0)
  // 数秒ごとに順に変える場面（巡航の豆知識、ホームポジションの話）
  const rotating = r.scene.kind === 'cruise' ? `cruise${r.scene.after}` : r.scene.kind === 'stay' && r.scene.step === 'home' ? 'home' : null
  useEffect(() => {
    if (!rotating) return
    setTick(0)
    const id = setInterval(() => setTick((k) => k + 1), CRUISE_MS)
    return () => clearInterval(id)
  }, [rotating])
  const c = ui().probeCam
  const p = c.probes[probe.id] ?? c.probes.voyager2
  const s = r.scene
  const stay = p.stay ?? c.stay
  const radio = c.lightTime(r.earthKm / LIGHT_KM_PER_MIN)
  let text = ''
  let key: string = s.kind
  if (s.kind === 'launch') {
    text = s.step === 0 ? c.launch.burnout(r.geoSpeed) : s.step === 1 ? c.launch.moon(c.distance(r.relKm ?? 0)) : c.launch.helio(r.speed)
    key += s.step
  } else if (s.kind === 'flyby') {
    const last = s.index === t.encounters.length - 1
    // はやぶさ2の地球への帰還は、カプセルの話
    const lines = last && probe.id === 'hayabusa2' ? c.homecoming(numbers[s.index]!.altitudeKm) : c.flyby(c.planet[s.body] ?? s.body, numbers[s.index]!)
    text = lines[s.step]
    key += s.index + '-' + s.step
  } else if (s.kind === 'stay') {
    if (s.step === 'home') {
      const line = stay.home[tick % stay.home.length]
      text = typeof line === 'function' ? line(radio) : line
      key += tick % stay.home.length
    } else text = s.step === 'dip' ? stay.dips[s.dip] : stay[s.step]
    key += s.step + s.dip
  } else if (s.kind === 'cruise') {
    // 通ったばかりの天体の見どころ → 豆知識を順に
    const facts = [...(p.extra[s.after] ? [p.extra[s.after]] : []), ...p.cruise]
    const k = tick % facts.length
    const line = facts[k]
    text = typeof line === 'function' ? line(c.distance(r.earthKm), radio) : line
    key += s.after + '-' + k
  } else text = p.beyond(r.speed)
  return (
    <p className="pc-caption" key={key}>
      {text}
    </p>
  )
}

/** 太陽から見た速さの計器（0〜45 km/s） */
function SpeedGauge({ speed }: { speed: number }) {
  const c = ui().probeCam
  return (
    <div className="pc-speed">
      <span className="pc-speed-label">{c.speed}</span>
      <span className="pc-speed-value">{c.speedValue(speed)}</span>
      <span className="pc-speed-bar">
        <span style={{ width: `${Math.min(100, (speed / 45) * 100)}%` }} />
      </span>
    </div>
  )
}

export function ProbeCamPane({ probe }: { probe: Probe }) {
  useLang()
  const playing = useProbes((s) => s.playing)
  const r = useReadout(probe)
  const c = ui().probeCam
  const name = c.planet[r.body] ?? r.body
  // 小さな小惑星は、中心からではなく地面からの高さ
  const near =
    r.relKm === null || r.body === 'earth'
      ? null
      : r.body === 'ryugu'
        ? c.toSurface(name, c.distance(Math.max(0, r.relKm - planetRadiusKm(r.body))))
        : c.toPlanet(name, c.distance(r.relKm))
  const radii = r.relKm !== null ? r.relKm / planetRadiusKm(r.body) : 0
  return (
    <section className={`probe-cam${playing ? '' : ' paused'}`} aria-label={ui().probes[probe.id].name}>
      <Suspense fallback={<p className="pc-loading">{c.loading}</p>}>
        <ProbeCamCanvas trajectory={probe.trajectory!} model={probe.model!} />
      </Suspense>
      <div className="pc-top">
        <SpeedGauge speed={r.speed} />
        {near ? (
          <p className={`pc-near${radii < 12 || r.body === 'ryugu' ? ' close' : ''}`}>{near}</p>
        ) : (
          <p className="pc-near muted">{c.fromEarth(c.distance(r.earthKm), c.lightTime(r.earthKm / LIGHT_KM_PER_MIN))}</p>
        )}
      </div>
      <Caption probe={probe} r={r} />
      <p className="pc-credit">
        {(c.probes[probe.id] ?? c.probes.voyager2).credit} · {c.dragHint}
      </p>
    </section>
  )
}
