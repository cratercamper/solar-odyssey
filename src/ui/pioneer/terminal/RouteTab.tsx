import { useEffect, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { ui } from '../../../i18n'
import { bodies } from '../../../state/registry'
import { ship } from '../../../state/flight'
import { capacity, usePioneer } from '../../../state/pioneer'
import { useLayout } from '../../../state/useLayout'
import { BELT_AU } from '../../../data/layout'
import { FIELD_ID, goal, type Goal } from '../../../data/pioneer'
import { COLONY_ID, DOCK_ID } from '../../../data/sf'
import { IconBuild, IconDock, IconGas, IconMine } from '../icons'
import { go } from '../go'

// 端末「航路」：上から見た太陽系の略図（太陽・地球・小惑星帯・木星と、自分の船）と、4 つの行き先。
// 距離はそのままだと木星が遠すぎるので、地球・帯・木星の軌道が等間隔に近くなるよう縮める（方角は本物）

type Place = 'field' | 'jupiter' | 'dock' | 'site'
const PLACES: readonly Place[] = ['field', 'jupiter', 'dock', 'site']
const BODY: Record<Place, string> = { field: FIELD_ID, jupiter: 'jupiter', dock: DOCK_ID, site: COLONY_ID }
const ICON: Record<Place, ReactNode> = { field: <IconMine />, jupiter: <IconGas />, dock: <IconDock />, site: <IconBuild /> }

/** いまやることから、次に行く場所 */
export function placeFor(g: Goal): Place {
  if (g.kind === 'mine') return 'field'
  if (g.kind === 'gas') return 'jupiter'
  if (g.kind === 'deliver') return 'dock'
  return 'site'
}

const SIZE = 300
const MID = SIZE / 2
const MAX_R = 132
const v = new THREE.Vector3()

type Pt = { x: number; y: number }
/** 地球のまわり（天の湊・建設地）は小さすぎるので、隅の拡大図に描く */
type Inset = { x: number; y: number; places: Partial<Record<Place, Pt>>; ship: Pt | null }
type Snapshot = { earth: Pt | null; earthR: number; beltIn: number; beltOut: number; jupiterR: number; places: Partial<Record<Place, Pt>>; ship: Pt | null; heading: number; inset: Inset | null }
const INSET = 84
const INSET_R = 24

/** 本物の距離 → 図の半径（地球 0.3、帯 0.55〜0.7、木星 0.9 を結ぶ折れ線） */
function squeeze(r: number, knots: readonly [number, number][]): number {
  for (let i = 1; i < knots.length; i++) {
    const [r0, m0] = knots[i - 1]
    const [r1, m1] = knots[i]
    if (r <= r1) return m0 + ((r - r0) / Math.max(1e-6, r1 - r0)) * (m1 - m0)
  }
  const [rj, mj] = knots[knots.length - 1]
  return mj + 0.1 * (1 - Math.exp(-(r - rj) / Math.max(rj, 1e-6)))
}

function useSnapshot(): Snapshot | null {
  const { belt } = useLayout()
  const [snap, setSnap] = useState<Snapshot | null>(null)
  useEffect(() => {
    const read = () => {
      const pos = (id: string) => {
        const b = bodies.get(id)
        if (!b) return null
        b.object.getWorldPosition(v)
        return { x: v.x, z: v.z }
      }
      const earth = pos('earth')
      const jup = pos('jupiter')
      const earthR = earth ? Math.hypot(earth.x, earth.z) : belt(1)
      const jupiterR = jup ? Math.hypot(jup.x, jup.z) : belt(5.2)
      const beltIn = belt(BELT_AU.inner)
      const beltOut = belt(BELT_AU.outer)
      const knots: [number, number][] = [
        [0, 0],
        [earthR, 0.3],
        [beltIn, 0.55],
        [beltOut, 0.7],
        [jupiterR, 0.9],
      ]
      const map = (p: { x: number; z: number }): Pt => {
        const r = Math.hypot(p.x, p.z)
        const m = squeeze(r, knots) * MAX_R
        const a = Math.atan2(p.z, p.x)
        return { x: MID + Math.cos(a) * m, y: MID + Math.sin(a) * m }
      }
      const earthPt = earth ? map(earth) : null
      const places: Snapshot['places'] = {}
      const f = pos(FIELD_ID)
      if (f) places.field = map(f)
      const jupPt = jup ? map(jup) : null
      if (jupPt) places.jupiter = jupPt
      const sp = { x: ship.position.x, z: ship.position.z }
      v.set(0, 0, -1).applyQuaternion(ship.quaternion)
      const heading = (Math.atan2(v.z, v.x) * 180) / Math.PI
      let shipPt: Pt | null = map(sp)
      let inset: Inset | null = null
      if (earth && earthPt) {
        // 拡大図の置き場所：地球・木星・採掘場からいちばん遠い隅
        const corners = [
          { x: INSET / 2 + 2, y: INSET / 2 + 2 },
          { x: SIZE - INSET / 2 - 2, y: INSET / 2 + 2 },
          { x: INSET / 2 + 2, y: SIZE - INSET / 2 - 2 },
          { x: SIZE - INSET / 2 - 2, y: SIZE - INSET / 2 - 2 },
        ]
        const avoid = [earthPt, jupPt, places.field].filter((q): q is Pt => !!q)
        const c = corners.reduce((best, k) => {
          const d = Math.min(...avoid.map((q) => Math.hypot(q.x - k.x, q.y - k.y)))
          return d > best.d ? { k, d } : best
        }, { k: corners[0], d: -1 }).k
        // 拡大図は「地球のまわり」の見取り図：地球を真ん中、天の湊を左、建設地（L5）を右の決まった場所に置く。
        // 船が地球のそばにいれば、近いほうの場所の下に描く
        const dist = (id: string) => {
          const q = pos(id)
          return q ? Math.hypot(q.x - sp.x, q.z - sp.z) : Infinity
        }
        const ip: Inset['places'] = { dock: { x: c.x - INSET_R, y: c.y - 6 }, site: { x: c.x + INSET_R, y: c.y - 6 } }
        const dDock = dist(DOCK_ID)
        const dSite = dist(COLONY_ID)
        const dEarth = Math.hypot(sp.x - earth.x, sp.z - earth.z)
        const shipNear = Math.min(dDock, dSite, dEarth) < earthR * 0.2
        const nearest = dDock <= dSite && dDock <= dEarth ? ip.dock! : dSite <= dEarth ? ip.site! : { x: c.x, y: c.y }
        const insetShip = { x: nearest.x, y: nearest.y + 13 }
        // 天の湊・建設地と、そのそばの船は拡大図だけに描く
        if (shipNear) shipPt = null
        inset = { x: c.x, y: c.y, places: ip, ship: shipNear ? insetShip : null }
      }
      setSnap({ earth: earthPt, earthR: 0.3 * MAX_R, beltIn: 0.55 * MAX_R, beltOut: 0.7 * MAX_R, jupiterR: 0.9 * MAX_R, places, ship: shipPt, heading, inset })
    }
    read()
    const id = window.setInterval(read, 500)
    return () => window.clearInterval(id)
  }, [belt])
  return snap
}

export function RouteTab() {
  const p = usePioneer()
  const t = ui().pioneer
  const tr = t.term.route
  const snap = useSnapshot()
  const next = placeFor(goal(p, capacity()))
  const here: Place | null = p.near === 'field' ? 'field' : p.near === 'jupiter' ? 'jupiter' : p.near === 'dock' ? 'dock' : null
  const target = snap ? (snap.places[next] ?? snap.inset?.places[next]) : undefined
  const shipAt = snap ? (snap.ship ?? snap.inset?.ship ?? null) : null
  const node = (pl: Place, pt: Pt, labelBelow: boolean) => (
    <g
      key={pl}
      className={`pio-map-place pio-place-${pl}${pl === next ? ' next' : ''}`}
      transform={`translate(${pt.x} ${pt.y})`}
      aria-hidden
      onClick={() => go(BODY[pl])}
    >
      <circle r="12" className="pio-map-hit" />
      {pl === next && <circle r="10" className="pio-map-pulse" />}
      <circle r="5" className="pio-map-node" />
      <text y={labelBelow ? 16 : -9} textAnchor="middle" className="pio-map-label">
        {tr.mapLabel[pl]}
      </text>
    </g>
  )

  return (
    <div className="pio-tab-route">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="pio-map" role="img" aria-label={tr.title}>
        <defs>
          <radialGradient id="pio-sun">
            <stop offset="0" stopColor="#fff6c8" />
            <stop offset="1" stopColor="#ffb340" stopOpacity="0" />
          </radialGradient>
        </defs>
        {snap && (
          <>
            <circle cx={MID} cy={MID} r={(snap.beltIn + snap.beltOut) / 2} className="pio-map-belt" strokeWidth={snap.beltOut - snap.beltIn} />
            <circle cx={MID} cy={MID} r={snap.earthR} className="pio-map-orbit" />
            <circle cx={MID} cy={MID} r={snap.jupiterR} className="pio-map-orbit" />
            <circle cx={MID} cy={MID} r="14" fill="url(#pio-sun)" />
            <circle cx={MID} cy={MID} r="5" fill="#ffe08a" />
            <text x={MID} y={MID + 20} className="pio-map-label" textAnchor="middle">
              {tr.sun}
            </text>
            <text x={MID} y={MID - (snap.beltIn + snap.beltOut) / 2 + 3} className="pio-map-label pio-map-faint" textAnchor="middle">
              {tr.belt}
            </text>
            {snap.earth && (
              <>
                <circle cx={snap.earth.x} cy={snap.earth.y} r="5" fill="#4f9cff" />
                <text x={snap.earth.x} y={snap.earth.y + 16} className="pio-map-label" textAnchor="middle">
                  {tr.earth}
                </text>
              </>
            )}
            {snap.inset && snap.earth && (
              <g className="pio-map-inset">
                <line x1={snap.earth.x} y1={snap.earth.y} x2={snap.inset.x} y2={snap.inset.y} className="pio-map-leader" />
                <rect x={snap.inset.x - INSET / 2} y={snap.inset.y - INSET / 2} width={INSET} height={INSET} rx="8" className="pio-map-inset-box" />
                <circle cx={snap.inset.x} cy={snap.inset.y} r="4" fill="#4f9cff" />
                <text x={snap.inset.x} y={snap.inset.y + INSET / 2 - 4} textAnchor="middle" className="pio-map-label pio-map-faint">
                  {tr.earth}
                </text>
              </g>
            )}
            {target && shipAt && <line x1={shipAt.x} y1={shipAt.y} x2={target.x} y2={target.y} className="pio-map-route" />}
            {(['field', 'jupiter'] as const).map((pl) => (snap.places[pl] ? node(pl, snap.places[pl]!, true) : null))}
            {snap.inset && (['dock', 'site'] as const).map((pl) => (snap.inset!.places[pl] ? node(pl, snap.inset!.places[pl]!, false) : null))}
            {shipAt && (
              <g transform={`translate(${shipAt.x} ${shipAt.y}) rotate(${snap.heading})`} className="pio-map-ship">
                <path d="M7 0L-5 -4.5L-2.5 0L-5 4.5Z" />
              </g>
            )}
          </>
        )}
      </svg>
      <ul className="pio-places">
        {PLACES.map((pl) => (
          <li key={pl} className={pl === next ? 'next' : ''}>
            <span className="pio-place-icon">{ICON[pl]}</span>
            <span className="pio-place-text">
              <b>{tr.place[pl]}</b>
              <small>{tr.gives[pl]}</small>
              {pl === next && <em>{tr.next}</em>}
              {pl === here && <em className="here">{tr.here}</em>}
            </span>
            <button type="button" onClick={() => go(BODY[pl])}>
              {t.goButton}
            </button>
          </li>
        ))}
      </ul>
      <p className="pio-science">{tr.science}</p>
    </div>
  )
}
