import { ui } from '../../i18n'
import { MU_MOON, R_MOON } from '../../data/lunarDescent'
import './loiCard.css'

// 章6「月の裏でブレーキ」の図：月を軌道の真上から見て、今のままならどう飛ぶか（その時の速さと位置から計算した道）。
// 減速しないうちは月を回りこんで飛び去る線、噴射するにつれて線が閉じて、月を回る輪になる。
// 地球から見えない所（月の影）と、管制室の 2 つの時計（成功なら・失敗なら、地球からまた見える時刻）も出す。

export type LoiReadout = {
  t: number
  speed: number
  burning: boolean
  burnEnd: number | null
  los: boolean
  peri: number
  apo: number
  clocks: { los: number | null; aosBurn: number | null; aosNoBurn: number | null } | null
  x: number
  y: number
  vx: number
  vy: number
  ex: number
  ey: number
}

const W = 320
const H = 150
const CX = 172
const CY = 75
const RM = 28
const K = RM / R_MOON

const mmss = (s: number) => {
  const v = Math.max(0, Math.round(s))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
}

/** 今の位置と速さからの道（2 次元の円錐曲線）。画面の座標の点の列（遠すぎる所で切る） */
function pathOf(r: LoiReadout, rot: number) {
  const { x, y, vx, vy } = r
  const rr = Math.hypot(x, y)
  const v2 = vx * vx + vy * vy
  const h = x * vy - y * vx
  const rv = x * vx + y * vy
  const ex = ((v2 - MU_MOON / rr) * x - rv * vx) / MU_MOON
  const ey = ((v2 - MU_MOON / rr) * y - rv * vy) / MU_MOON
  const e = Math.hypot(ex, ey)
  const w = Math.atan2(ey, ex)
  const p = (h * h) / MU_MOON
  const dir = h >= 0 ? 1 : -1
  const nuMax = e < 1 ? Math.PI : Math.acos(-1 / e) - 0.03
  const pts: string[] = []
  const N = 160
  for (let i = 0; i <= N; i++) {
    const nu = -nuMax + (2 * nuMax * i) / N
    const rad = p / (1 + e * Math.cos(nu))
    if (rad <= 0 || rad > 7 * R_MOON) continue
    const a = w + dir * nu + rot
    pts.push(`${(CX + Math.cos(a) * rad * K).toFixed(1)},${(CY - Math.sin(a) * rad * K).toFixed(1)}`)
  }
  return { pts: pts.join(' '), e }
}

export function LoiCard({ r }: { r: LoiReadout }) {
  const c = ui().moonMission.lunar.loiCard
  // 地球が左に来るように回す
  const rot = Math.PI - Math.atan2(r.ey, r.ex)
  const { pts, e } = pathOf(r, rot)
  const a = Math.atan2(r.y, r.x) + rot
  const rr = Math.hypot(r.x, r.y) * K
  const sx = CX + Math.cos(a) * rr
  const sy = CY - Math.sin(a) * rr
  const va = Math.atan2(r.vy, r.vx) + rot
  const clocks = r.clocks
  let line: string
  if (r.burning) line = c.braking((r.speed / 1000).toFixed(2))
  else if (r.los && r.burnEnd !== null && clocks?.aosNoBurn != null && r.t > clocks.aosNoBurn) line = c.notYet
  else if (r.los && clocks) line = ''
  else if (r.burnEnd !== null) line = c.inOrbit
  else line = c.faster((r.speed / 1000).toFixed(2))
  return (
    <div className="lc-card">
      <div className="lc-title">{c.title}</div>
      <svg className="lc-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        {/* 地球から見えない所：月のうしろの影 */}
        <rect x={CX} y={CY - RM} width={W - CX} height={RM * 2} className="lc-hidden" />
        <text x={W - 6} y={CY + RM - 6} className="lc-label end dim">
          {c.hidden}
        </text>
        <circle cx={CX} cy={CY} r={RM} className="lc-moon" />
        <text x={CX} y={CY + 4} className="lc-label mid">
          {c.moon}
        </text>
        <polyline points={pts} className={`lc-path ${e < 1 ? 'closed' : ''}`} />
        <line x1={sx} y1={sy} x2={sx + Math.cos(va) * 12} y2={sy - Math.sin(va) * 12} className="lc-vel" />
        <circle cx={sx} cy={sy} r={3.4} className={`lc-ship ${r.burning ? 'burn' : ''}`} />
        <text x={6} y={CY - 6} className="lc-label">
          {c.earth}
        </text>
        <line x1={6} y1={CY} x2={40} y2={CY} className="lc-earth" />
        <path d={`M6 ${CY} l7 -4 v8 z`} className="lc-earth-head" />
      </svg>
      <div className={`lc-state ${e < 1 ? 'ok' : ''}`}>{e < 1 ? c.orbit(Math.round(r.peri / 1000), Math.round(r.apo / 1000)) : c.flyby}</div>
      {r.los && clocks && (
        <div className="lc-clocks">
          <div className="lc-clocks-head">{c.clocksHead}</div>
          {clocks.aosBurn != null && <div>{c.ifOk(mmss(clocks.aosBurn - r.t))}</div>}
          {clocks.aosNoBurn != null && <div className="dim">{r.t < clocks.aosNoBurn ? c.ifNot(mmss(clocks.aosNoBurn - r.t)) : c.ifNotPassed}</div>}
        </div>
      )}
      {line && <div className="lc-note">{line}</div>}
    </div>
  )
}
