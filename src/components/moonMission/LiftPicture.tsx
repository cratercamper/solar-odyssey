import { ui } from '../../i18n'
import { CORRIDOR, EI_ANGLE, entryAuto, type Entry } from '../../data/reentry'
import { inCorridor } from '../../state/moonReturn'
import { useMoonMission } from '../../state/moonMission'
import { isTouchDevice } from '../../state/input'

// 章9 の大気圏突入：子ども向けの「揚力と重力」の絵（ReturnHud の中）。
// 角度を決めるあいだは、横から見た「大気に入る道」：浅いと はねて宇宙へ、深いと 地面へ急に。
// 火の玉のあいだは、うしろから見た司令船：重力はいつも下、揚力は船の傾きと一緒に回る。うすい点線の船が目安の向きで、
// 黄色の弧が回す向き（どのボタンを押すか）。
// 絵は船の値（ret.angle、e.lift）を読むだけで、船の回し方は変えない

const DEG = 180 / Math.PI
/** 角度を見やすくするための倍率（本物の −6.5° は、絵では約 −33°） */
const EXAG = 5

function arrowHead(x: number, y: number, ang: number, s = 6) {
  // ang：矢の向き（ラジアン、SVG の座標）
  const a1 = ang + Math.PI * 0.82
  const a2 = ang - Math.PI * 0.82
  return `M${x},${y} L${x + Math.cos(a1) * s},${y + Math.sin(a1) * s} L${x + Math.cos(a2) * s},${y + Math.sin(a2) * s} Z`
}

/** 地球の表面と大気の上のふち（絵の y） */
const GROUND = 104
const AIR_TOP = 56

/** 横から見た道。angle：突入の角度（度、負）。浅いと大気の上ではねて上がり、深いと地面へ急に落ちる */
function pathOf(angle: number) {
  const th = (-angle * EXAG) / DEG
  const x0 = 12
  const y0 = 14
  const dx = Math.cos(th)
  const dy = Math.sin(th)
  const xE = x0 + (AIR_TOP - y0) / Math.tan(th)
  const depth = (a: number) => (-a - 4) / 5
  const k = Math.min(1, Math.max(0, depth(angle)))
  const kS = depth(CORRIDOR.shallow)
  const kD = depth(CORRIDOR.steep)
  let cx: number, cy: number, endX: number, endY: number
  if (k < kS) {
    // はねる：大気に少しだけ入って、上へもどる
    cx = xE + dx * 24
    cy = AIR_TOP + dy * 24
    endX = 154
    endY = AIR_TOP - 8 - (kS - k) * 160
  } else if (k <= kD) {
    // ちょうどいい：大気の中で、だんだん水平に
    cx = xE + dx * 26
    cy = AIR_TOP + dy * 26
    endX = 154
    endY = 66 + ((k - kS) / (kD - kS)) * 18
  } else {
    // 深すぎる：まっすぐ地面へ
    cx = xE + dx * 16
    cy = AIR_TOP + dy * 16
    endX = Math.min(154, xE + 36 - (k - kD) * 40)
    endY = GROUND + 2
  }
  const ang = Math.atan2(endY - cy, endX - cx)
  return { d: `M${x0},${y0} L${xE},${AIR_TOP} Q${cx},${cy} ${endX},${endY}`, endX, endY, ang }
}

export function AnglePicture({ angle }: { angle: number }) {
  const T = ui().moonReturn
  const ok = inCorridor(angle)
  const p = pathOf(angle)
  const ideal = pathOf(EI_ANGLE)
  const col = ok ? '#9ff0b8' : '#ff8a70'
  const line = angle > CORRIDOR.shallow ? T.picShallow : angle < CORRIDOR.steep ? T.picSteep : T.picGood
  return (
    <div className="rt-pic">
      <div className="rt-pic-title">{T.picPath}</div>
      <svg viewBox="0 0 160 112" role="img" aria-label={T.picPath}>
        {/* 地球と大気（上の方ほどうすい） */}
        <circle cx="80" cy={GROUND + 460} r={460 + GROUND - AIR_TOP} fill="rgba(110,170,255,0.13)" />
        <circle cx="80" cy={GROUND + 460} r={460 + (GROUND - AIR_TOP) * 0.45} fill="rgba(110,170,255,0.22)" />
        <circle cx="80" cy={GROUND + 460} r="460" fill="#1d4f8a" />
        <text x="6" y={AIR_TOP + 12} className="rt-pic-air">
          {T.picAir}
        </text>
        {/* ちょうどいい道（点線） */}
        <path d={ideal.d} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.4" strokeDasharray="4 3" />
        {/* いまの道 */}
        <path d={p.d} fill="none" stroke={col} strokeWidth="2.6" strokeLinecap="round" />
        <path d={arrowHead(p.endX, p.endY, p.ang, 7)} fill={col} />
        {/* 司令船と重力 */}
        <circle cx="12" cy="14" r="4" fill="#dfe6ee" />
        <line x1="12" y1="19" x2="12" y2="36" stroke="#ffd27a" strokeWidth="2.2" />
        <path d={arrowHead(12, 40, Math.PI / 2, 6)} fill="#ffd27a" />
        <text x="17" y="38" className="rt-pic-g">
          {T.picGravity}
        </text>
      </svg>
      <div className={`rt-pic-line ${ok ? 'good' : 'bad'}`}>{line}</div>
      <div className="rt-pic-note">{T.picIdeal}</div>
    </div>
  )
}

/** うしろから見た司令船：丸い熱よけと、少し傾いた円すい（とがった先は揚力の側へ寄る）、窓。ghost は目安のうすい形 */
function Capsule({ x, y, ghost }: { x: number; y: number; ghost?: boolean }) {
  const stroke = ghost ? 'rgba(255,255,255,0.85)' : '#8d97a3'
  const dash = ghost ? '3 2.5' : undefined
  const fill = ghost ? 'none' : '#c9d0d8'
  return (
    <>
      <circle cx={x} cy={y} r="17" fill={fill} stroke={stroke} strokeWidth="1.5" strokeDasharray={dash} />
      <path d={`M${x - 15.5},${y + 3} L${x - 4.5},${y - 8} M${x + 15.5},${y + 3} L${x + 4.5},${y - 8}`} stroke={ghost ? stroke : '#9aa3ae'} strokeWidth="1.2" strokeDasharray={dash} />
      <circle cx={x} cy={y - 8} r="5" fill={ghost ? 'none' : '#7b8592'} stroke={stroke} strokeWidth="1.2" strokeDasharray={dash} />
      {!ghost && <rect x={x - 4} y={y - 16} width="8" height="4" rx="1" fill="#2b3644" />}
    </>
  )
}

export function LiftPicture({ e }: { e: Entry }) {
  const T = ui().moonReturn
  const auto = useMoonMission((s) => s.auto)
  const touch = isTouchDevice()
  const bank = Math.acos(Math.max(-1, Math.min(1, e.lift))) * DEG
  const want = Math.acos(Math.max(-1, Math.min(1, entryAuto(e)))) * DEG
  // 揚力の大きさ（重力を 1 として）：空気の力のうち、横向きの分（揚抗比 0.3）
  const liftG = e.g * 0.287
  const len = 24 + 26 * Math.min(1.1, liftG)
  const cx = 80
  const cy = 62
  const line = e.lift > 0.5 ? T.picLiftUp : e.lift < -0.5 ? T.picLiftDown : T.picLiftSide
  // 目安の形へ、どちらへ回すか（揚力を上へ＝左回り、下へ＝右回り）
  const diff = want - bank
  const turn = Math.abs(diff) < 10 ? 0 : diff > 0 ? 1 : -1
  const hint = auto ? T.picAutoTurn : turn === 0 ? T.picAligned : turn < 0 ? (touch ? T.picTurnUpTouch : T.picTurnUpKey) : touch ? T.picTurnDownTouch : T.picTurnDownKey
  // 揚力が下のときは、重力の矢と重ならないように、重力の矢を少し左へ（揚力の名前は右、重力の名前は左）
  const gx = Math.cos(bank / DEG) < -0.5 ? cx - 14 : cx
  // 回す向きの弧（いまの向き → 目安の向き）
  const R = 33
  const at = (a: number) => [cx + R * Math.sin(a / DEG), cy - R * Math.cos(a / DEG)] as const
  const [ax, ay] = at(bank)
  const [bx, by] = at(want)
  const tang = turn > 0 ? Math.atan2(Math.sin(want / DEG), Math.cos(want / DEG)) : Math.atan2(-Math.sin(want / DEG), -Math.cos(want / DEG))
  return (
    <div className="rt-pic">
      <div className="rt-pic-title">{T.picBack}</div>
      <svg viewBox="0 0 160 124" role="img" aria-label={T.picBack}>
        {/* 地平線（下が地球） */}
        <circle cx="80" cy="560" r="454" fill="rgba(110,170,255,0.2)" />
        <circle cx="80" cy="560" r="442" fill="#1d4f8a" />
        {/* 船と揚力（船と一緒に回る） */}
        <g transform={`rotate(${bank} ${cx} ${cy})`}>
          <g transform={`translate(${cx} ${cy}) scale(1.35) translate(${-cx} ${-cy})`}>
            <Capsule x={cx} y={cy} />
          </g>
          <line x1={cx} y1={cy - 19} x2={cx} y2={cy - len + 4} stroke="#9ff0b8" strokeWidth="3" />
          <path d={arrowHead(cx, cy - len - 2, -Math.PI / 2, 8)} fill="#9ff0b8" />
        </g>
        {/* 目安の形（うすい点線の船。上に重ねて、とがった先の向きが見えるように） */}
        <g transform={`rotate(${want} ${cx} ${cy}) translate(${cx} ${cy}) scale(1.35) translate(${-cx} ${-cy})`}>
          <Capsule x={cx} y={cy} ghost />
        </g>
        {/* 回す向き */}
        {turn !== 0 && (
          <>
            <path d={`M${ax},${ay} A${R},${R} 0 0 ${turn > 0 ? 1 : 0} ${bx},${by}`} fill="none" stroke="#ffd27a" strokeWidth="2.4" strokeDasharray="1 0" opacity="0.95" />
            <path d={arrowHead(bx, by, tang, 7)} fill="#ffd27a" />
          </>
        )}
        {/* 揚力の名前（字は回さない）：矢の先の横 */}
        <text x={cx + Math.sin(bank / DEG) * (len + 6) + 6} y={cy - Math.cos(bank / DEG) * (len + 6) + 4} className="rt-pic-l">
          {T.picLift}
        </text>
        {/* 重力はいつも下 */}
        <line x1={gx} y1={cy + 23} x2={gx} y2={cy + 48} stroke="#ffd27a" strokeWidth="3" />
        <path d={arrowHead(gx, cy + 54, Math.PI / 2, 8)} fill="#ffd27a" />
        <text x={gx - 6} y={cy + 46} textAnchor="end" className="rt-pic-g">
          {T.picGravity}
        </text>
      </svg>
      <div className="rt-pic-line">{line}</div>
      <div className={`rt-pic-note ${turn === 0 || auto ? 'good' : 'turn'}`}>{liftG < 0.3 && !auto ? T.picThin : hint}</div>
    </div>
  )
}
