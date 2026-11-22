import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { R_EARTH, STAGES, G0, MU, CENTER_CUTOFF, S2_CENTER_CUTOFF } from '../../data/saturnAscent'
import { sim, showBeat, trackPoint, missionNow, useMoonMission, TLI_WINDOW, TLI_WINDOW_OPEN, type MissionPhase, type missionReadout } from '../../state/moonMission'
import './ascentCards.css'

// 上昇の後半（第2段・第3段）から月へ向かう燃焼の終わりまで、画面の左下で入れかわる計器のカード
// （「8 秒ルール」：8 秒に 1 度は画面の何かが変わる）。
//   断面図：地球の丸み・宇宙の入口（100 km）・飛んできた道・海へ落ちていく第1段
//   エンジン：何基燃えているか（中央のエンジンを止めるのも本物の時刻）・燃料の残り・G
//   速さのものさし：音・ライフルの弾・地球を回る速さ（秒速 7.8 km）・月へ行ける速さ（10.8 km）
//   軌道の図：真上から見た地球と軌道、昼と夜、点火の窓と月の方向。燃焼のあいだは、軌道が月の方へのびていく
// カメラの切り替え（LaunchWorld）と同じ拍で、4 秒ずらして入れかえる。

type Readout = ReturnType<typeof missionReadout>
type Card = 'profile' | 'engines' | 'speed' | 'orbit'
/** 場面ごとの順番。断面図・軌道の図は 2 回に 1 回（いちばん大事な絵） */
const ORDERS: Partial<Record<MissionPhase, Card[]>> = {
  ascent: ['profile', 'engines', 'profile', 'speed'],
  orbit: ['orbit', 'speed'],
  tli: ['orbit', 'engines', 'orbit', 'speed'],
}
export const CARD_SEC = 8
/** エンジンのことを言う見出しが出たら、しばらくエンジンのカード */
const ENGINE_KEYS = new Set(['s2CenterCutoff', 'stage3Ign', 'tliIgnition'])
const ENGINE_SEC = 6

/** raised：左下の ◀ ボタンの上へ。high：まん中下の「月への窓」の上へ */
export function AscentCards({ r, raised, high }: { r: Readout; raised: boolean; high: boolean }) {
  useLang()
  const phase = useMoonMission((s) => s.phase)
  const caption = useMoonMission((s) => s.caption)
  const beat = showBeat()
  const order = ORDERS[phase]
  if (!order || beat === null) return null
  let card = order[Math.floor(beat / CARD_SEC) % order.length]
  if (caption && ENGINE_KEYS.has(caption.key) && missionNow() - caption.at < ENGINE_SEC) card = 'engines'
  return (
    <div className={`ac-card ${raised ? 'raised' : ''} ${high ? 'high' : ''}`} key={card} data-dull={card}>
      {card === 'profile' ? <Profile r={r} /> : card === 'engines' ? <Engines r={r} tli={phase === 'tli'} /> : card === 'orbit' ? <OrbitMap r={r} tli={phase === 'tli'} /> : <Speed r={r} far={phase !== 'ascent'} />}
    </div>
  )
}

// ---- 断面図 ----------------------------------------------------------------------------------

const W = 300
const H = 150
const R_KM = R_EARTH / 1000
/** 高さの目盛り（px / km）。横より何倍か伸ばす */
const VS0 = 0.52
const ORBIT_KM = 170

let span: { d0: number; d1: number; ideal: [number, number][] } | null = null
/** 手本の道すじの長さから、横の目盛りを決める（1 度だけ） */
function profileSpan() {
  if (span && span.ideal.length) return span
  const ideal = sim.path.map(([x, y]) => trackPoint(x, y))
  const end = ideal.length ? ideal[ideal.length - 1][0] : 2000
  span = { d0: -60, d1: end * 1.08, ideal }
  return span
}

function Profile({ r }: { r: Readout }) {
  const t = ui().moonMission
  const c = t.cards
  const { d0, d1: dEnd, ideal } = profileSpan()
  const now = trackPoint(sim.a.x, sim.a.y)
  const fall = sim.s1Fall
  // 手本より高く・遠くへ飛んだら、図の目盛りを広げて、いまの点が図の外へ出ないように
  let hMax = 0
  for (const p of sim.track) hMax = Math.max(hMax, p[1])
  for (const p of fall) hMax = Math.max(hMax, p[2])
  hMax = Math.max(hMax, now[1])
  const d1 = Math.max(dEnd, now[0] * 1.06)
  const VS = Math.min(VS0, 108 / Math.max(1, hMax))
  const hs = (W - 24) / (d1 - d0)
  const X = (d: number) => 12 + (d - d0) * hs
  const dm = (d0 + d1) / 2
  // 地表：本当の丸み（横と同じ目盛り）。端ほど下がる
  const surf = (d: number) => 124 + ((d - dm) * (d - dm) * hs) / (2 * R_KM)
  const P = (d: number, h: number) => `${X(d).toFixed(1)},${(surf(d) - h * VS).toFixed(1)}`
  const line = (pts: [number, number][]) => (pts.length ? 'M' + pts.map(([d, h]) => P(d, h)).join(' L') : '')
  const curve = (h: number) => {
    const pts: [number, number][] = []
    for (let i = 0; i <= 24; i++) pts.push([d0 + ((d1 - d0) * i) / 24, h])
    return line(pts)
  }
  const track = [...sim.track, now]
  // 手本の同じ距離での高さとくらべる
  const k = ideal.findIndex((p) => p[0] >= now[0])
  const idealH = k < 0 ? (ideal.length ? ideal[ideal.length - 1][1] : 0) : ideal[k][1]
  const tooHigh = r.t > 90 && now[1] > idealH + 35
  // 落ちていく第1段：いまの物理の時刻のところ
  let s1: [number, number] | null = null
  if (fall.length) {
    const i = fall.findIndex((p) => p[0] > r.t)
    const p = i < 0 ? fall[fall.length - 1] : i === 0 ? fall[0] : fall[i - 1]
    s1 = [p[1], p[2]]
  }
  const ground = `${curve(0)} L${W},${H} L0,${H} Z`
  const [nx, ny] = P(now[0], now[1]).split(',').map(Number)
  return (
    <>
      <div className="ac-title">{c.profile}</div>
      <svg className="ac-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <defs>
          <linearGradient id="ac-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3d7fc4" />
            <stop offset="1" stopColor="#0b1d33" />
          </linearGradient>
        </defs>
        <path d={`${curve(40)} L${W},${H} L0,${H} Z`} className="ac-air" />
        <path d={ground} fill="url(#ac-sea)" />
        <path d={curve(100)} className="ac-space" />
        <text x={X(d0) + 4} y={surf(d0 + 30) - 100 * VS - 4} className="ac-label">
          {c.space}
        </text>
        <path d={curve(ORBIT_KM)} className="ac-orbit" />
        <text x={W - 14} y={surf(d1) - ORBIT_KM * VS - 4} className="ac-label end">
          {c.orbitLine} {ORBIT_KM} km
        </text>
        <path d={line(ideal)} className="ac-ideal" />
        {fall.length > 0 && <path d={line(fall.map((p) => [p[1], p[2]] as [number, number]))} className="ac-fall" />}
        {s1 && (
          <>
            <circle cx={X(s1[0])} cy={surf(s1[0]) - s1[1] * VS} r={2.6} className="ac-s1" />
            <text x={X(s1[0]) + 5} y={surf(s1[0]) - s1[1] * VS + 12} className="ac-label s1">
              {c.s1}
            </text>
          </>
        )}
        <path d={line(track)} className="ac-track" />
        <polygon points={`${X(0) - 4},${surf(0)} ${X(0) + 4},${surf(0)} ${X(0)},${surf(0) - 7}`} className="ac-pad" />
        <text x={X(0)} y={surf(0) + 12} className="ac-label mid">
          {c.pad}
        </text>
        <circle cx={nx} cy={ny} r={7} className="ac-you-glow" />
        <circle cx={nx} cy={ny} r={3.4} className="ac-you" />
        <text x={nx} y={ny - 10} className="ac-label mid you">
          {c.you} {t.km(r.alt / 1000)}
        </text>
      </svg>
      {tooHigh && <div className="ac-warn">{c.tooHigh}</div>}
      <div className="ac-note">{c.profileScale(Math.round(VS / hs))}</div>
    </>
  )
}

// ---- エンジン --------------------------------------------------------------------------------

/** 4 基は四隅、1 基はまん中（サターンV の第1段・第2段の並び） */
const FIVE: [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
  [0, 0],
]

function Engines({ r, tli }: { r: Readout; tli: boolean }) {
  const t = ui().moonMission
  const c = t.cards
  const a = sim.a
  const stage = Math.min(2, r.stage)
  const firing = r.thrust > 0
  const centerOff = (stage === 0 && r.t >= CENTER_CUTOFF) || (stage === 1 && a.s2Start >= 0 && r.t - a.s2Start >= S2_CENTER_CUTOFF)
  const spots: [number, number][] = stage === 2 ? [[0, 0]] : FIVE
  const lit = spots.map((_, i) => firing && !(centerOff && i === 4))
  const n = lit.filter(Boolean).length
  const def = STAGES[stage]
  const frac = Math.max(0, Math.min(1, r.prop / def.prop))
  const flow = r.thrust / (def.ispVac * G0)
  const left = flow > 0 ? Math.round(r.prop / flow) : 0
  const hot = stage === 0 ? 'f1' : 'j2'
  return (
    <>
      <div className="ac-title">
        {c.engines}　<span className="ac-sub">{t.stageName[stage]}</span>
      </div>
      <div className="ac-engines">
        <svg viewBox="-40 -40 80 80" className="ac-bells" aria-hidden>
          <circle r={38} className="ac-base" />
          {spots.map(([x, y], i) => (
            <g key={i} transform={`translate(${x * 19} ${y * 19})`}>
              {lit[i] && <circle r={13} className={`ac-flame ${hot}`} />}
              <circle r={8.5} className={`ac-bell ${lit[i] ? 'on ' + hot : 'off'}`} />
              {!lit[i] && <path d="M-4 -4 L4 4 M4 -4 L-4 4" className="ac-x" />}
            </g>
          ))}
        </svg>
        <div className="ac-lines">
          <div className="ac-big">{c.lit(n, spots.length)}</div>
          {centerOff && <div>{c.centerOff}</div>}
          <div className="ac-row">
            <span>{c.prop}</span>
            <i className="ac-bar">
              <i style={{ width: `${frac * 100}%` }} className={frac < 0.15 ? 'low' : ''} />
            </i>
            <b>{Math.round(frac * 100)}%</b>
          </div>
          <div className="ac-small">{tli ? c.tliBurn : stage === 2 ? c.keepTli : firing ? c.burnLeft(left) : ''}</div>
          <div className="ac-row">
            <span>G</span>
            <i className="ac-bar g">
              <i style={{ width: `${Math.min(100, (r.g / 4) * 100)}%` }} />
            </i>
            <b>{r.g.toFixed(1)}</b>
          </div>
          <div className="ac-small">{c.gee(r.g)}</div>
        </div>
      </div>
    </>
  )
}

// ---- 速さのものさし ----------------------------------------------------------------------------

type MarkKey = 'sound' | 'bullet' | 'orbitSpeed' | 'moonSpeed'
type Mark = { v: number; key: MarkKey; y: number; anchor: '' | 'mid' | 'end' }
const MARKS: Mark[] = [
  { v: 0.34, key: 'sound', y: 14, anchor: '' },
  { v: 1.0, key: 'bullet', y: 26, anchor: '' },
  { v: 7.8, key: 'orbitSpeed', y: 26, anchor: 'end' },
]
const FAR_MARKS: Mark[] = [
  { v: 1.0, key: 'bullet', y: 26, anchor: '' },
  { v: 7.8, key: 'orbitSpeed', y: 14, anchor: 'end' },
  { v: 10.8, key: 'moonSpeed', y: 26, anchor: 'end' },
]
/** 月へ向かう燃焼を止めたときの速さ（アポロ17号、約 10.8 km/s） */
const MOON_KMS = 10.8

/** far：地球を回る・月へ向かうときは、目盛りを月へ行ける速さまでのばす */
function Speed({ r, far }: { r: Readout; far: boolean }) {
  const t = ui().moonMission
  const c = t.cards
  const v = r.speed / 1000
  const MAX_KMS = far ? 11.4 : 8.2
  const marks = far ? FAR_MARKS : MARKS
  const X = (k: number) => 10 + (k / MAX_KMS) * 280
  return (
    <>
      <div className="ac-title">{c.speedTitle}</div>
      <svg className="ac-svg short" viewBox="0 0 300 74" aria-hidden>
        <rect x={10} y={34} width={280} height={10} rx={5} className="ac-rail" />
        <rect x={10} y={34} width={Math.max(0, X(Math.min(v, MAX_KMS)) - 10)} height={10} rx={5} className="ac-fill" />
        {Array.from({ length: Math.floor(MAX_KMS) + 1 }, (_, k) => (
          <g key={k}>
            <line x1={X(k)} x2={X(k)} y1={46} y2={51} className="ac-tick" />
            <text x={X(k)} y={61} className="ac-label mid dim">
              {k}
            </text>
          </g>
        ))}
        <text x={290} y={72} className="ac-label end dim">
          km/s
        </text>
        {marks.map((m) => (
          <g key={m.key}>
            <line x1={X(m.v)} x2={X(m.v)} y1={30} y2={46} className="ac-mark" />
            <text x={X(m.v) + (m.anchor === '' ? 2 : m.anchor === 'end' ? 3 : 0)} y={m.y} className={`ac-label ${m.anchor}`}>
              {c[m.key]}
            </text>
          </g>
        ))}
        <polygon points={`${X(v) - 5},${30} ${X(v) + 5},${30} ${X(v)},${37}`} className="ac-you" />
      </svg>
      <div className="ac-big">{c.perSec(v)}</div>
      <div className="ac-small">{far ? c.toMoon(Math.min(100, Math.round((v / MOON_KMS) * 100))) : c.toGo(Math.min(100, Math.round((v / 7.8) * 100)))}</div>
    </>
  )
}

// ---- 軌道の図（真上から） ----------------------------------------------------------------------

/** 太陽の向き（物理の平面の上で）。LaunchWorld の SUN（世界の x = 物理の y、世界の y = 物理の x）と同じ */
const SUN_ANGLE = Math.atan2(-0.5, -0.866)
const OW = 300
const OH = 150
/** 地球の半径（px）。高さ 170 km の軌道は、本当の大きさのまま描く（地球のすぐ外側） */
const ER = 40
const OCX = 150
const OCY = 76

function OrbitMap({ r, tli }: { r: Readout; tli: boolean }) {
  const c = ui().moonMission.cards
  const a = sim.a
  // 図の座標：物理の角度を、反時計回り（東へ）に描く
  const P = (rr: number, th: number) => [OCX + ((ER * rr) / R_EARTH) * Math.cos(th), OCY - ((ER * rr) / R_EARTH) * Math.sin(th)] as const
  const pts = (list: (readonly [number, number])[]) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const rNow = Math.hypot(a.x, a.y)
  const th = Math.atan2(a.y, a.x)
  // 軌道（いまの速さから決まる形）：楕円の焦点が地球の中心
  const h = a.x * a.vy - a.y * a.vx
  const v2 = a.vx * a.vx + a.vy * a.vy
  const rv = a.x * a.vx + a.y * a.vy
  const ex = ((v2 - MU / rNow) * a.x - rv * a.vx) / MU
  const ey = ((v2 - MU / rNow) * a.y - rv * a.vy) / MU
  const e = Math.hypot(ex, ey)
  const peri = e > 1e-4 ? Math.atan2(ey, ex) : th
  const p = (h * h) / MU
  const ring: (readonly [number, number])[] = []
  for (let i = 0; i <= 160; i++) {
    const nu = (i / 160) * Math.PI * 2
    const den = 1 + e * Math.cos(nu)
    if (den < 0.03) continue
    ring.push(P(Math.min(p / den, 40 * R_EARTH), peri + Math.sign(h || 1) * nu))
  }
  // 1 周の時間
  const sma = 1 / (2 / rNow - v2 / MU)
  const period = sma > 0 ? 2 * Math.PI * Math.sqrt((sma * sma * sma) / MU) : 0
  const w = period > 0 ? (2 * Math.PI) / period : 0
  // 点火の窓と月の方向（月へ向かう燃焼は、月と反対の側で行う）
  const orbitT = r.t - sim.orbitAt
  let win: (readonly [number, number])[] = []
  let moonTh = peri + Math.PI
  if (!tli) {
    const t0 = Math.max(0, TLI_WINDOW_OPEN - orbitT)
    const t1 = TLI_WINDOW_OPEN + TLI_WINDOW - orbitT
    if (t1 > 0) {
      for (let i = 0; i <= 20; i++) win.push(P(rNow * 1.06, th + w * (t0 + ((t1 - t0) * i) / 20)))
      moonTh = th + w * (TLI_WINDOW_OPEN + TLI_WINDOW / 2 - orbitT) + Math.PI
    } else win = []
  }
  // 夜の半分
  const night: (readonly [number, number])[] = []
  for (let i = 0; i <= 40; i++) night.push(P(R_EARTH, SUN_ANGLE + Math.PI / 2 + (i / 40) * Math.PI))
  const [sx, sy] = P(R_EARTH * 3.4, SUN_ANGLE)
  const [dx, dy] = P(R_EARTH * 0.55, SUN_ANGLE)
  const [nx, ny] = P(R_EARTH * 0.55, SUN_ANGLE + Math.PI)
  const [m0x, m0y] = P(R_EARTH * 1.5, moonTh)
  const [m1x, m1y] = P(R_EARTH * 3.1, moonTh)
  const [yx, yy] = P(rNow, th)
  return (
    <>
      <div className="ac-title">{c.orbitTitle}</div>
      <svg className="ac-svg" viewBox={`0 0 ${OW} ${OH}`} aria-hidden>
        <defs>
          <marker id="ac-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" className="ac-moon-head" />
          </marker>
        </defs>
        <circle cx={sx} cy={sy} r={6} className="ac-sun" />
        <circle cx={OCX} cy={OCY} r={ER} className="ac-earth" />
        <polygon points={pts(night)} className="ac-night" />
        <text x={dx} y={dy + 3} className="ac-label mid">
          {c.day}
        </text>
        <text x={nx} y={ny + 3} className="ac-label mid dim">
          {c.night}
        </text>
        {win.length > 1 && <polyline points={pts(win)} className="ac-window" />}
        <line x1={m0x} y1={m0y} x2={m1x} y2={m1y} className="ac-moon" markerEnd="url(#ac-arrow)" />
        <text x={Math.max(48, Math.min(OW - 48, m1x))} y={Math.max(12, Math.min(OH - 4, m1y + (m1y > OCY ? 12 : -5)))} className="ac-label mid moon">
          {tli ? c.moonFar : c.moonWay}
        </text>
        <polyline points={pts(ring)} className="ac-ring" />
        <circle cx={yx} cy={yy} r={6} className="ac-you-glow" />
        <circle cx={yx} cy={yy} r={3} className="ac-you" />
      </svg>
      {tli ? (
        <>
          <div className="ac-big">{c.stretch}</div>
          <div className="ac-small">{c.opposite}</div>
        </>
      ) : (
        <>
          <div className="ac-big">{c.period(Math.round(period / 60))}</div>
          <div className="ac-small">
            <i className="ac-swatch" /> {c.window}　{c.skin}
          </div>
        </>
      )}
    </>
  )
}
