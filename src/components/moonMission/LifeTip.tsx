import { ui } from '../../i18n'
import { useMoonMission, missionNow } from '../../state/moonMission'
import { useMoonReturn } from '../../state/moonReturn'
import { lunar } from '../../state/moonLunar'
import { useRadio } from '../../audio/radio'

// 船内のくらしの豆知識（junji 2026-11-25「待ち時間を埋めるアイデア」）。宇宙服・ごはん・トイレ・寝方・船のせまさを、
// 小さな絵と短い文で。画面の見出し・豆知識・本物の交信の字幕が出ていない「静かなとき」だけ、字幕と同じ場所に 1 枚ずつ出す。
// 本物の暮らしの時期に合わせて場面ごとに分け、同じカードは 1 度だけ。文は src/i18n（moonMission.life）。
// 事実は Apollo Flight Journal（アポロ17号の交信の書き起こし）と NASA の資料から

export type LifeId =
  | 'suitOff'
  | 'food'
  | 'soup'
  | 'menu'
  | 'toilet'
  | 'sleep'
  | 'bath'
  | 'lmSmall'
  | 'lmStand'
  | 'lmThin'
  | 'hammock'
  | 'suitToilet'
  | 'dust'
  | 'cmSmall'
  | 'puffy'
  | 'exercise'

/** 場面ごとのカード（上から順に） */
const LIFE: Record<string, LifeId[]> = {
  // 章5：青い地球（出発の約 5 時間後に宇宙服をぬいだ）
  marble: ['suitOff', 'food', 'soup'],
  // 章5 の終わり：月まで 3 日（地球の写真の場面は無線が長いので、見のがしたカードはこのあとで）
  coast: ['suitOff', 'food', 'soup', 'menu'],
  // 章6：月を回る軌道へ（点火までの長い待ちと、月の裏の静かな時間）
  loi: ['suitOff', 'food', 'soup', 'menu', 'toilet', 'sleep', 'bath', 'puffy'],
  // 章7：着陸船で降りるまで（制動のあいだ。切り離しの場面は短いので出さない）
  braking: ['lmSmall', 'lmStand', 'lmThin'],
  // 章9：月をはなれて司令船へ（月面のくらしをふりかえる。着いた直後は結果の画面があるので出さない）
  rdv: ['dust', 'hammock', 'suitToilet'],
  docked: ['cmSmall', 'dust', 'hammock'],
  lmGone: ['cmSmall', 'exercise'],
  teiWait: ['exercise', 'puffy'],
  coastHome: ['cmSmall', 'exercise'],
  // パラシュートで降りるあいだ（12 日ぶりの重さ）
  chutes: ['exercise', 'puffy'],
}

/** カードを出しておく秒数と、次のカードまでのあき */
const SHOW = 10
const GAP = 3

const seen = new Set<LifeId>()
let cur: { id: LifeId; at: number } | null = null
let lastEnd = -1e9

function sceneKey(): string {
  const s = useMoonMission.getState()
  if (s.phase === 'home') {
    const step = useMoonReturn.getState().step
    return step === 'coast' ? 'coastHome' : step
  }
  if (s.phase === 'descent') return lunar.desc?.mode === 'braking' ? 'braking' : ''
  return s.phase
}

/** いま出すカード（静かなときだけ。呼ぶたびに時間で進む） */
export function lifeTipNow(quiet: boolean): LifeId | null {
  const now = missionNow()
  if (useMoonMission.getState().phase === 'pad') {
    // 最初からやり直したら、カードもまた最初から
    seen.clear()
    cur = null
    return null
  }
  if (cur && now - cur.at < SHOW && quiet) return cur.id
  if (cur) {
    cur = null
    lastEnd = now
  }
  if (!quiet || useRadio.getState().playing || now - lastEnd < GAP) return null
  const id = (LIFE[sceneKey()] ?? []).find((x) => !seen.has(x))
  if (!id) return null
  seen.add(id)
  cur = { id, at: now }
  return id
}

export function LifeTip({ id }: { id: LifeId }) {
  const T = ui().moonMission
  const [title, line] = T.life[id]
  return (
    <div className="mm-caption mm-fact mm-life" key={`life-${id}`}>
      <LifeArt id={id} />
      <span className="mm-fact-label">{T.lifeLabel}</span>
      <div className="mm-life-title">{title}</div>
      <div className="mm-fact-line">{line}</div>
    </div>
  )
}

// ── 絵（96×56。線は白、色は少しだけ） ──
const W = '#e8eef6'
const S = { fill: 'none', stroke: W, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function Person({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  // 立っている人
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="0" cy="-15" r="4" {...S} />
      <path d="M0,-11 L0,2 M0,-7 L-6,-2 M0,-7 L6,-2 M0,2 L-4,12 M0,2 L4,12" {...S} />
    </g>
  )
}

function LifeArt({ id }: { id: LifeId }) {
  const body = (() => {
    switch (id) {
      case 'suitOff':
        // 宇宙服と、ぱんぱんのふくろ
        return (
          <>
            <circle cx="26" cy="14" r="8" {...S} />
            <path d="M18,24 h16 v16 h-16 z M18,26 l-6,10 M34,26 l6,10 M21,40 v12 M31,40 v12" {...S} />
            <path d="M54,22 q-4,30 8,30 h20 q10,0 6,-30 z" {...S} fill="rgba(255,217,138,0.15)" />
            <path d="M58,22 q14,-8 28,0" {...S} />
            <path d="M44,34 l6,0 m-3,-3 l3,3 l-3,3" {...S} />
          </>
        )
      case 'food':
        // お湯の口と、もどす袋
        return (
          <>
            <path d="M10,10 h22 v8 h-8 v8 h-6 v-8 h-8 z" {...S} />
            <path d="M21,30 v6" stroke="#8fd0ff" strokeWidth="2.5" strokeDasharray="2 3" />
            <path d="M40,22 h34 l4,30 h-42 z" {...S} fill="rgba(255,217,138,0.15)" />
            <path d="M44,34 q6,-4 12,0 t12,0" {...S} />
            <circle cx="21" cy="42" r="2.5" fill="#8fd0ff" />
          </>
        )
      case 'soup':
        // 袋の内側にはりつくスープと、まん中の穴
        return (
          <>
            <path d="M28,8 h40 l4,44 h-48 z" {...S} />
            <path d="M31,12 h34 l3,36 h-40 z" fill="rgba(255,190,110,0.55)" />
            <ellipse cx="48" cy="30" rx="10" ry="13" fill="#0b1420" stroke="rgba(255,190,110,0.9)" />
            <path d="M48,2 v20" {...S} />
            <ellipse cx="48" cy="24" rx="3" ry="2" {...S} />
          </>
        )
      case 'menu':
        // おぼん：缶・袋・コップ
        return (
          <>
            <rect x="8" y="34" width="80" height="8" rx="3" {...S} />
            <rect x="14" y="16" width="14" height="18" rx="2" {...S} />
            <path d="M36,14 h18 l2,20 h-22 z" {...S} fill="rgba(255,217,138,0.15)" />
            <path d="M64,18 h14 l-2,16 h-10 z" {...S} />
            <path d="M66,24 h10" stroke="#ffb35c" strokeWidth="5" />
          </>
        )
      case 'toilet':
        // 船の外で光る、凍った粒
        return (
          <>
            <path d="M6,8 q22,-4 22,22 q0,22 -22,22" {...S} />
            <path d="M28,30 h8" {...S} />
            {[
              [44, 26],
              [52, 20],
              [58, 34],
              [66, 24],
              [72, 40],
              [78, 16],
              [86, 30],
              [62, 46],
            ].map(([x, y], i) => (
              <path key={i} d={`M${x - 3},${y} h6 M${x},${y - 3} v6`} stroke="#bfe6ff" strokeWidth="1.6" strokeLinecap="round" />
            ))}
          </>
        )
      case 'sleep':
        // 座席の下につるした寝袋
        return (
          <>
            <path d="M8,16 h70 l10,-8" {...S} />
            <path d="M14,24 h60 q6,0 6,7 q0,7 -6,7 h-60 q-6,0 -6,-7 q0,-7 6,-7 z" {...S} fill="rgba(140,180,255,0.2)" />
            <circle cx="20" cy="31" r="4" {...S} />
            <path d="M14,24 L10,16 M74,24 L78,16" {...S} />
            <text x="62" y="54" fill={W} fontSize="12">
              z z
            </text>
          </>
        )
      case 'bath':
        // ぬれタオル
        return (
          <>
            <Person x={32} y={38} />
            <path d="M48,18 h28 v22 h-28 z" {...S} fill="rgba(140,200,255,0.2)" />
            <path d="M52,24 h20 M52,30 h20 M52,36 h20" stroke="#8fd0ff" strokeWidth="1.4" />
            <path d="M38,30 l10,-6" {...S} />
          </>
        )
      case 'lmSmall':
      case 'lmStand':
        // 2 人が立ったまま入る、小さな部屋
        return (
          <>
            <path d="M18,6 h60 v46 h-60 z" {...S} fill="rgba(255,217,138,0.08)" />
            <path d="M26,10 l14,10 M70,10 l-14,10" stroke="#8fd0ff" strokeWidth="2" />
            <Person x={38} y={38} s={1.2} />
            <Person x={58} y={38} s={1.2} />
            {id === 'lmStand' && <path d="M30,30 h16 M50,30 h16" stroke="#ffd98a" strokeWidth="1.6" strokeDasharray="2 2" />}
          </>
        )
      case 'lmThin':
        // うすい壁の断面と、0.3 mm
        return (
          <>
            <path d="M12,8 h72 v40 h-72 z" {...S} fill="rgba(200,200,210,0.08)" />
            <path d="M48,8 v40 M50,8 v40" stroke="#ffd98a" strokeWidth="1.4" />
            <path d="M30,28 h14 m-4,-4 l4,4 l-4,4 M68,28 h-14 m4,-4 l-4,4 l4,4" {...S} />
            <text x="34" y="56" fill="#ffd98a" fontSize="10">
              0.3 mm
            </text>
          </>
        )
      case 'hammock':
        // ハンモック 2 つ
        return (
          <>
            <path d="M14,8 v44 M82,8 v44" {...S} />
            <path d="M14,16 q34,14 68,0" {...S} fill="rgba(140,180,255,0.18)" />
            <path d="M14,34 q34,14 68,0" {...S} fill="rgba(140,180,255,0.18)" />
            <circle cx="30" cy="20" r="3.5" {...S} />
            <circle cx="30" cy="38" r="3.5" {...S} />
            <text x="62" y="54" fill={W} fontSize="11">
              z z
            </text>
          </>
        )
      case 'suitToilet':
        // 宇宙服と、7 時間の時計
        return (
          <>
            <circle cx="30" cy="14" r="8" {...S} />
            <path d="M22,24 h16 v16 h-16 z M22,26 l-6,10 M38,26 l6,10 M25,40 v12 M35,40 v12" {...S} />
            <path d="M24,34 h12" stroke="#ffd98a" strokeWidth="2" />
            <circle cx="70" cy="28" r="16" {...S} />
            <path d="M70,28 v-10 M70,28 l-8,5" {...S} />
            <text x="62" y="54" fill="#ffd98a" fontSize="10">
              7h
            </text>
          </>
        )
      case 'dust':
        // 宇宙服から舞う月の砂
        return (
          <>
            <circle cx="28" cy="14" r="8" {...S} />
            <path d="M20,24 h16 v16 h-16 z M23,40 v12 M33,40 v12" {...S} />
            {[
              [44, 20],
              [50, 30],
              [46, 40],
              [58, 24],
              [60, 38],
              [68, 30],
              [54, 46],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="1.8" fill="#b9b2a6" />
            ))}
            <path d="M72,22 q8,6 0,12 M80,18 q10,10 0,20" stroke="#ffd98a" strokeWidth="1.6" fill="none" />
          </>
        )
      case 'cmSmall':
        // 円すいの司令船に 3 人
        return (
          <>
            <path d="M48,4 L86,52 H10 Z" {...S} fill="rgba(200,210,220,0.08)" />
            <circle cx="34" cy="34" r="4" {...S} />
            <circle cx="48" cy="32" r="4" {...S} />
            <circle cx="62" cy="34" r="4" {...S} />
            <path d="M26,44 q8,-6 16,0 M40,42 q8,-6 16,0 M54,44 q8,-6 16,0" {...S} />
          </>
        )
      case 'puffy':
        // ふくらんだ顔と、細い脚
        return (
          <>
            <circle cx="48" cy="16" r="10" {...S} fill="rgba(255,190,170,0.15)" />
            <path d="M48,26 v14 M48,30 l-10,6 M48,30 l10,6 M48,40 l-3,14 M48,40 l3,14" {...S} />
            <path d="M28,12 v-6 m-3,3 l3,-3 l3,3 M68,12 v-6 m-3,3 l3,-3 l3,3" stroke="#8fd0ff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          </>
        )
      case 'exercise':
        // ひもを引っぱる運動
        return (
          <>
            <Person x={48} y={40} s={1.2} />
            <path d="M41,30 L22,10 M55,30 L74,10" stroke="#ffd98a" strokeWidth="1.8" />
            <circle cx="22" cy="10" r="3" {...S} />
            <circle cx="74" cy="10" r="3" {...S} />
          </>
        )
    }
  })()
  return (
    <svg className="mm-life-art" viewBox="0 0 96 56" aria-hidden="true">
      {body}
    </svg>
  )
}
