import { useEffect, useRef, useState } from 'react'
import { ui } from '../../i18n'
import { gasFx, onPioneerFx, shipOnScreen } from '../../state/pioneerFx'
import { togglePanel } from '../../state/pioneer'
import { playDaily, playDeliver, playJobDone, playJobHandoff, playRare, playUpgrade, playFull, playPickup, startGasWind, STAR_GAP } from '../../audio/pioneerSfx'
import { RARE_BONUS, RESOURCES, type Amounts, type RareId, type Resource } from '../../data/pioneer'
import { usePioneer } from '../../state/pioneer'
import type { JobKind } from '../../data/delivery'
import { JOB_ICON, placeName } from './jobKind'
import { IconStar } from './icons'

// 開拓の手応え：拾った量の数字（船のそばから浮かぶ）、積み荷のゲージのはね、
// いっぱいのゆれ、納品・珍しい岩・今日の依頼のカード（数字が増えていく）、ガスの風の音

type Pop = { id: number; resource: Resource; amount: number; x: number; y: number; born: number }
/** 画面の真ん中に少し出るカード（納品・珍しい岩・今日の依頼）。重なったら順に出す */
type Card = { id: number } & (
  | { kind: 'deliver'; amounts: Amounts; ready: boolean }
  | { kind: 'rare'; rare: RareId; count: number; amount: number }
  | { kind: 'daily'; reward: Amounts }
  | { kind: 'jobStep'; job: JobKind; at: string; load: boolean; walk: boolean }
  | { kind: 'jobDone'; job: JobKind; stars: number; kept: boolean; fast: boolean; reward: Amounts; seconds: number; target: number }
)

/** 同じ資源をこの時間内に続けて拾ったら、1 つの数字にまとめる（ミリ秒） */
const MERGE_MS = 400
const POP_MS = 1100
const DELIVER_MS = 3600
/** 積んだ・降ろしたカードは短く。配達完了は星が出そろうまで長く */
const STEP_MS = 1800
const JOB_DONE_MS = 5200

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function bumpHold(kind: 'pickup' | 'full') {
  const el = document.querySelector<HTMLElement>('.pioneer-hud .pio-hold')
  if (!el?.animate || reduced()) return
  if (kind === 'pickup') el.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.6)' }, { transform: 'scaleY(1)' }], { duration: 260, easing: 'ease-out' })
  else el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 360 })
}

/** 0 から to まで、ms ミリ秒で増えていく数 */
function CountUp({ to, ms = 900 }: { to: number; ms?: number }) {
  const [v, setV] = useState(reduced() ? to : 0)
  useEffect(() => {
    if (reduced()) return
    const t0 = performance.now()
    let raf = 0
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / ms)
      setV(Math.round(to * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return <>{v}</>
}

/** 資源ごとの「+数」の行（数は増えていく） */
function Rows({ amounts }: { amounts: Amounts }) {
  const t = ui().pioneer
  return (
    <div className="pio-delivery-rows">
      {RESOURCES.filter((r) => amounts[r] > 0).map((r) => (
        <span key={r} className="pio-delivery-row">
          <i className={`pio-dot pio-${r}`} />
          {t.resource[r]}
          <b>
            {t.term.plusSign}
            <CountUp to={amounts[r]} />
          </b>
        </span>
      ))}
    </div>
  )
}

export function PioneerFx() {
  const [pops, setPops] = useState<Pop[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const delivery = cards[0] ?? null
  const shift = () => setCards((l) => l.slice(1))
  const ids = useRef(0)

  useEffect(
    () =>
      onPioneerFx((e) => {
        if (e.kind === 'pickup') {
          playPickup(e.resource)
          bumpHold('pickup')
          const now = performance.now()
          setPops((list) => {
            const live = list.filter((p) => now - p.born < POP_MS)
            const same = live.find((p) => p.resource === e.resource && now - p.born < MERGE_MS)
            if (same) return live.map((p) => (p === same ? { ...p, amount: p.amount + e.amount } : p))
            const x = shipOnScreen.visible ? shipOnScreen.x : window.innerWidth / 2
            const y = shipOnScreen.visible ? shipOnScreen.y : window.innerHeight / 2
            return [...live.slice(-5), { id: ++ids.current, resource: e.resource, amount: e.amount, x: x + (Math.random() - 0.5) * 50, y: y - 30 - 22 * live.length, born: now }]
          })
        } else if (e.kind === 'full') {
          playFull()
          bumpHold('full')
        } else if (e.kind === 'upgrade') {
          playUpgrade(e.level)
        } else if (e.kind === 'rare') {
          playRare()
          const count = usePioneer.getState().rare?.[e.id] ?? 1
          setCards((l) => [...l.slice(-2), { id: ++ids.current, kind: 'rare', rare: e.id, count, amount: e.amount }])
        } else if (e.kind === 'jobLoad' || e.kind === 'jobDrop') {
          playJobHandoff(e.kind === 'jobLoad')
          setCards((l) => [...l.slice(-2), { id: ++ids.current, kind: 'jobStep', job: e.job, at: e.at, load: e.kind === 'jobLoad', walk: !!e.walk }])
        } else if (e.kind === 'jobDone') {
          playJobDone(e.stars)
          setCards((l) => [...l.slice(-2), { id: ++ids.current, kind: 'jobDone', job: e.job, stars: e.stars, kept: e.kept, fast: e.fast, reward: e.reward, seconds: e.seconds, target: e.target }])
        } else if (e.kind === 'daily') {
          playDaily()
          setCards((l) => [...l.slice(-2), { id: ++ids.current, kind: 'daily', reward: e.reward }])
        } else {
          playDeliver()
          setCards((l) => [...l.slice(-2), { id: ++ids.current, kind: 'deliver', amounts: e.amounts, ready: e.ready }])
        }
      }),
    [],
  )

  // 数字は少したったら消す
  useEffect(() => {
    if (!pops.length) return
    const timer = window.setTimeout(() => setPops((l) => l.filter((p) => performance.now() - p.born < POP_MS)), POP_MS)
    return () => window.clearTimeout(timer)
  }, [pops])

  useEffect(() => {
    if (!delivery) return
    const timer = window.setTimeout(shift, delivery.kind === 'jobStep' ? STEP_MS : delivery.kind === 'jobDone' ? JOB_DONE_MS : DELIVER_MS)
    return () => window.clearTimeout(timer)
  }, [delivery])

  // ガスの風の音：集めているあいだだけ
  useEffect(() => {
    let wind: ReturnType<typeof startGasWind> = null
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (gasFx.collecting && !wind) wind = startGasWind()
      else if (!gasFx.collecting && wind) {
        wind.stop()
        wind = null
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      wind?.stop()
    }
  }, [])

  const t = ui().pioneer
  const td = ui().delivery
  return (
    <>
      <div className="pio-pops" aria-hidden>
        {pops.map((p) => (
          <span key={p.id} className={`pio-pop pio-pop-${p.resource}`} style={{ left: p.x, top: p.y }}>
            +{p.amount} {t.resource[p.resource]}
          </span>
        ))}
      </div>
      {delivery?.kind === 'deliver' && (
        <div key={delivery.id} className="pio-delivery" role="status" aria-label={t.delivered(delivery.amounts, delivery.ready)}>
          <h3>{t.deliveredTitle}</h3>
          <Rows amounts={delivery.amounts} />
          {delivery.ready && (
            <button
              type="button"
              className="pio-build"
              onClick={() => {
                shift()
                togglePanel(true)
              }}
            >
              {t.readyToBuild}
            </button>
          )}
        </div>
      )}
      {delivery?.kind === 'rare' && (
        <div key={delivery.id} className="pio-delivery pio-card-rare" role="status">
          <small>{t.rare.found}</small>
          <h3>{t.rare.name[delivery.rare]}</h3>
          <Rows amounts={{ metal: 0, ice: 0, gas: 0, [RARE_BONUS[delivery.rare].resource]: delivery.amount }} />
          <p className="pio-science">{t.rare.science[delivery.rare]}</p>
          <small>{t.rare.count(delivery.count)}</small>
        </div>
      )}
      {delivery?.kind === 'jobStep' && (
        <div key={delivery.id} className="pio-delivery pio-card-step" role="status">
          <span className="pio-place-icon">{JOB_ICON[delivery.job](30)}</span>
          <h3>{delivery.load ? td.loaded(td.kind[delivery.job].title, placeName(delivery.at)) : delivery.walk ? td.arrivedWalk(placeName(delivery.at)) : td.dropped(placeName(delivery.at))}</h3>
        </div>
      )}
      {delivery?.kind === 'jobDone' && (
        <div key={delivery.id} className="pio-delivery pio-card-job" role="status">
          <span className="pio-sr">{td.doneAria(td.kind[delivery.job].title, delivery.stars)}</span>
          <small aria-hidden>{td.kind[delivery.job].title}</small>
          <h3>{td.doneTitle}</h3>
          <span className="pio-card-stars" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < delivery.stars ? 'on' : ''} style={{ animationDelay: `${0.5 + i * STAR_GAP}s` }}>
                <IconStar size={34} on={i < delivery.stars} />
              </span>
            ))}
          </span>
          <ul className="pio-card-checks">
            <li className="on">{td.starDone}</li>
            <li className={delivery.kept ? 'on' : ''}>{td.starKept}</li>
            <li className={delivery.fast ? 'on' : ''}>{td.seconds(delivery.seconds, delivery.target)}</li>
          </ul>
          <Rows amounts={delivery.reward} />
        </div>
      )}
      {delivery?.kind === 'daily' && (
        <div key={delivery.id} className="pio-delivery pio-card-daily" role="status">
          <small>{t.daily.title}</small>
          <h3>{t.daily.doneTitle}</h3>
          <Rows amounts={delivery.reward} />
          <small>{t.daily.rewardNote}</small>
        </div>
      )}
    </>
  )
}
