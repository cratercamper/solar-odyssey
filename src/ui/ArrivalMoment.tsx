import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { arrivalOf, type Arrival } from '../data/arrival'
import { PLANETS, SUN } from '../data/bodies'
import { textureUrl } from '../data/textures'
import { ARRIVAL_SECONDS, arrivalElapsed, closeArrival, rowDone, shownAt, showArrival, useArrival } from '../state/arrival'
import { useStore } from '../state/store'
import { bodies } from '../state/registry'
import { ship } from '../state/flight'
import * as THREE from 'three'
import { useLanding } from '../state/landing'
import { useMission } from '../state/mission'
import { raceActive } from '../state/race'
import { isTouchDevice } from '../state/input'
import { useTouchUI } from '../state/touchUI'
import { playBeep } from '../audio/sfx'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'
import './arrival.css'

/** 目標にこれより近づいたら「着いた」（航海日誌が開くのと同じ距離。大きな星はワープで止まる所まで） */
const NEAR = 10
const nearFor = (id: string) => Math.max(NEAR, (bodies.get(id)?.radius ?? 0) * 2.6 + 1.2)
const at = new THREE.Vector3()

/** 船からその星の表面までの距離（表示の値は目標を変えた直後に前の星のままのことがあるので、ここで測る） */
function surfaceDistance(id: string) {
  const b = bodies.get(id)
  if (!b) return Infinity
  return b.object.getWorldPosition(at).distanceTo(ship.position) - b.radius
}

const nameOf = (id: string) => ui().bodies[id].name

function colorOf(id: string) {
  if (id === 'sun') return SUN.color
  for (const p of PLANETS) {
    if (p.id === id) return p.color
    const m = p.moons.find((x) => x.id === id)
    if (m) return m.color
  }
  return '#bbb'
}

/** 2D の球：テクスチャ（なければ色）に、光の当たり方の影をのせる */
function Globe({ id, size, style, className = '' }: { id: string; size: number; style?: CSSProperties; className?: string }) {
  const url = textureUrl(id)
  return (
    <span
      className={`arr-globe ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: colorOf(id),
        backgroundImage: url ? `url(${url})` : undefined,
        ...style,
      }}
    />
  )
}

/** 地球より小さい星：地球の円の上に、その星を左から一つずつならべる（本当の大きさの比） */
function RowOnEarth({ a, shown, width }: { a: Arrival; shown: number; width: number }) {
  const piece = a.kind === 'earth' ? 'moon' : a.id
  const d = width / a.ratio
  const items = Math.ceil(a.count)
  const total = a.count * d
  const left = (width - total) / 2
  return (
    <div className="arr-pic" style={{ width, height: width }}>
      <Globe id="earth" size={width} className="arr-earth" />
      {Array.from({ length: items }, (_, i) => {
        const half = i === items - 1 && a.count % 1 !== 0
        return (
          <span key={i} className={`arr-slot${i < shown ? ' on' : ''}`} style={{ left: left + i * d, top: width / 2 - d / 2, width: half ? d / 2 : d, height: d }}>
            <Globe id={piece} size={d} />
          </span>
        )
      })}
      <span className="arr-label">{ui().arrival.earthName}</span>
    </div>
  )
}

/** とても小さい星：星のまわりを歩く人の点が回る */
function WalkAround({ a, width }: { a: Arrival; width: number }) {
  const d = width * 0.62
  return (
    <div className="arr-pic arr-walk" style={{ width, height: width }}>
      <span className="arr-path" style={{ width: d + 18, height: d + 18 }} />
      <Globe id={a.id} size={d} className="arr-tiny" />
      <span className="arr-walker" style={{ width: d + 18, height: d + 18 }}>
        <i />
      </span>
    </div>
  )
}

/** 到着の瞬間：星に着いたら、大きさの絵と、いちばん驚くことを一つ。少しすると消える。「もっと知る」で航海日誌 */
export function ArrivalMoment() {
  const id = useArrival((s) => s.id)
  const targetId = useStore((s) => s.targetId)
  const distance = useStore((s) => s.telemetry.distance)
  const warpPhase = useStore((s) => s.warpPhase)
  const mode = useStore((s) => s.mode)
  const logOpen = useStore((s) => s.logOpen)
  const sheet = useTouchUI((u) => u.sheet)
  const landing = useLanding((l) => l.phase)
  const shownFor = useRef<string | null>(null)
  const [t, setT] = useState(0)
  useLang()

  // 目標に着いたら一度だけ
  useEffect(() => {
    if (targetId !== shownFor.current && shownFor.current !== null && useArrival.getState().id) closeArrival()
    if (!targetId || warpPhase !== 'idle' || distance === null || surfaceDistance(targetId) >= nearFor(targetId) || mode !== 'flight' || landing !== 'idle') return
    if (raceActive() || useMission.getState().phase !== 'closed' || shownFor.current === targetId) return
    shownFor.current = targetId
    if (arrivalOf(targetId)) showArrival(targetId)
  }, [targetId, distance, warpPhase, mode, landing])

  // ワープを始めた、操縦席を離れた、航海日誌を開いたら消す（スマホでは日誌は「日誌」を押して引き出したときだけ見える）
  const logShown = logOpen && (!isTouchDevice() || sheet === 'log')
  useEffect(() => {
    if (warpPhase !== 'idle' || mode !== 'flight' || logShown || landing !== 'idle') closeArrival()
    if (warpPhase !== 'idle') shownFor.current = null
  }, [warpPhase, mode, logShown, landing])

  // 時間を進める（ならべる数・音・消える時刻）
  const a = arrivalOf(id)
  useEffect(() => {
    if (!a) return
    const items = a.kind === 'tiny' ? 0 : Math.ceil(a.count)
    let raf = 0
    let last = 0
    const tick = () => {
      const now = arrivalElapsed()
      if (now > ARRIVAL_SECONDS) {
        closeArrival()
        return
      }
      const n = shownAt(now, items)
      if (n > last) {
        // 一つならぶごとに、少しずつ高くなる音。ならび終わりに和音
        if (items <= 24 || n % Math.ceil(items / 24) === 0) playBeep(520 + Math.min(n, 24) * 28, 0.07)
        if (n === items) setTimeout(() => (playBeep(880, 0.16), setTimeout(() => playBeep(1320, 0.3), 110)), 160)
        last = n
      }
      setT(now)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [a?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!a) return null
  const tx = ui().arrival
  const items = Math.ceil(a.count)
  const shown = a.kind === 'tiny' ? 0 : shownAt(t, items)
  const done = a.kind === 'tiny' || t >= rowDone(items) + 0.25
  const head =
    a.kind === 'giant' ? tx.giant(a.count) : a.kind === 'earth' ? tx.earth(a.count) : a.kind === 'small' ? tx.small(nameOf(a.id), a.count) : tx.tiny(a.walkHours)
  const touch = isTouchDevice()
  const width = touch ? 92 : 150
  const more = () => {
    closeArrival()
    useStore.getState().setLogOpen(true)
    if (touch) useTouchUI.getState().setSheet('log')
  }

  return (
    <section className={`arrival${a.kind === 'giant' ? ' giant' : ''}`} role="status" aria-label={nameOf(a.id)}>
      {a.kind === 'small' || a.kind === 'earth' ? <RowOnEarth a={a} shown={shown} width={width} /> : a.kind === 'tiny' ? <WalkAround a={a} width={width} /> : null}
      <div className="arr-text">
        <div className="arr-name">{nameOf(a.id)}</div>
        <div className="arr-head">
          {done ? (
            <span className="arr-head-text">{head}</span>
          ) : (
            shown > 0 && (
              <>
                <span className="arr-what">{tx.countingWhat(a.kind === 'giant' ? tx.earthName : a.kind === 'earth' ? tx.moonName : nameOf(a.id))}</span>
                <span className="arr-count" key={shown}>
                  {shown}
                </span>
              </>
            )
          )}
        </div>
        <p className={`arr-wow${done ? ' on' : ''}`}>{tx.wow[a.id]}</p>
        <div className="arr-actions">
          <button className="arr-more" onClick={more}>
            {tx.more} {!touch && <kbd>I</kbd>}
          </button>
          <button className="arr-close" onClick={closeArrival} aria-label={tx.close} title={tx.close}>
            ×
          </button>
        </div>
      </div>
      <span className="arr-timer" style={{ animationDuration: `${ARRIVAL_SECONDS}s` }} />
    </section>
  )
}
