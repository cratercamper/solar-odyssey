import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { isTouchDevice } from '../../state/input'
import { LOI_IDEAL, MANUAL_ALT, PDI_EARLY, PDI_IDEAL, PDI_LATE } from '../../data/lunarDescent'
import {
  LOI_CLOSE,
  LOI_OPEN,
  lunarGo,
  lunarPad,
  lunarReadout,
  manual,
  moveTarget,
  canRetryManual,
  retryDescent,
  retryManual,
  rod,
  setLunarAuto,
  stepOutside,
  useMoonLunar,
} from '../../state/moonLunar'
import { endMission, missionNow, useMoonMission } from '../../state/moonMission'
import { journey } from '../../state/missionJourney'
import { ChapterMenu } from './ChapterMenu'
import { startChapter } from '../../state/missionChapters'
import { useAutoNext } from './autoNext'
import { LoiCard } from './LoiCard'
import './lunarHud.css'
import { CamMenu } from './CamMenu'

// 月ミッション第2弾の画面の計器。
//  ・3 日の旅：地球からの距離
//  ・LOI：月からの高さ・速さ・軌道、通信なしの印、減速の窓
//  ・降下：プログラム（P63/P64/P66）・高さ・上下と横の速さ・燃料（あと何秒）、降下の窓、
//    P64 の降りる場所の動かし方、P66 の十字の速度計（本物の着陸船の「X ポインター」）と高さの帯、スマホのボタン
//  ・終わりのカード

function useReadout() {
  const [r, setR] = useState(lunarReadout)
  useEffect(() => {
    const id = setInterval(() => setR(lunarReadout()), 100)
    return () => clearInterval(id)
  }, [])
  return r
}

/** 窓の帯：start〜end の時刻の帯の上に、今の時刻の印。手本の時刻に細い線 */
function WindowBar({ t, open, close, ideal, label, go, hint, can }: { t: number; open: number; close: number; ideal: number; label: string; go: string; hint: string; can: boolean }) {
  const pad = (close - open) * 0.8
  const span = close - open + pad * 2
  const at = (v: number) => `${Math.max(0, Math.min(1, (v - open + pad) / span)) * 100}%`
  return (
    <div className="mm-tli">
      <div className="mm-tli-label">{label}</div>
      <div className="mm-tli-bar">
        <i className="mm-tli-window" style={{ left: at(open), width: `${((close - open) / span) * 100}%` }} />
        <i className="lh-ideal" style={{ left: at(ideal) }} />
        <i className="mm-tli-mark" style={{ left: at(t) }} />
      </div>
      <button className="mm-go ready" onPointerDown={() => lunarGo()} disabled={!can}>
        {go}
      </button>
      <div className="mm-hint">{hint}</div>
    </div>
  )
}

/** 針の目盛り（m/s）と、降りる場所の点の目盛り（m）。速いうち・遠いうちは粗い目盛りにして、針が振り切れたままにならないようにする（本物の計器にも 10 倍の切り替えがあった） */
const SPEED_SCALES = [6, 30, 150]
const SITE_SCALES = [120, 600, 3000]

/** いまの値が入る目盛りを選ぶ。細かい目盛りへ戻るのは、値が十分小さくなってから（境目で行ったり来たりしない） */
function useScale(value: number, scales: number[]) {
  const at = useRef(scales.length - 1)
  let i = at.current
  while (i < scales.length - 1 && value > scales[i]) i++
  while (i > 0 && value < scales[i - 1] * 0.92) i--
  at.current = i
  return scales[i]
}

/** 十字の速度計：横の針が前後の速さ、縦の針が左右の速さ。緑の点は降りる場所。ふちの矢印は、いま押している向き */
function CrossPointer({ fwd, right, toFwd, toRight, inFwd, inRight }: { fwd: number; right: number; toFwd: number; toRight: number; inFwd: number; inRight: number }) {
  const t = ui().moonMission.lunar
  const S = 60
  const vs = useScale(Math.max(Math.abs(fwd), Math.abs(right)), SPEED_SCALES)
  const ms = useScale(Math.max(Math.abs(toFwd), Math.abs(toRight)), SITE_SCALES)
  const k = (v: number) => Math.max(-1, Math.min(1, v / vs)) * S
  const tk = (v: number) => Math.max(-1, Math.min(1, v / ms)) * S
  const good = vs === SPEED_SCALES[0]
  return (
    <div className="lh-crossbox">
      <svg className="lh-cross" viewBox="-70 -70 140 140" aria-hidden>
        <rect x={-S} y={-S} width={S * 2} height={S * 2} rx={8} className="lh-cross-bg" />
        <line x1={-S} y1={0} x2={S} y2={0} className="lh-cross-axis" />
        <line x1={0} y1={-S} x2={0} y2={S} className="lh-cross-axis" />
        <circle cx={tk(toRight)} cy={-tk(toFwd)} r={5} className="lh-cross-site" />
        <line x1={-S} y1={-k(fwd)} x2={S} y2={-k(fwd)} className={`lh-cross-needle ${good && Math.abs(fwd) < 0.6 ? 'good' : ''}`} />
        <line x1={k(right)} y1={-S} x2={k(right)} y2={S} className={`lh-cross-needle ${good && Math.abs(right) < 0.6 ? 'good' : ''}`} />
        <path d="M0 -69 L6 -62 L-6 -62 Z" className={`lh-cross-in ${inFwd > 0.1 ? 'on' : ''}`} />
        <path d="M0 69 L6 62 L-6 62 Z" className={`lh-cross-in ${inFwd < -0.1 ? 'on' : ''}`} />
        <path d="M69 0 L62 6 L62 -6 Z" className={`lh-cross-in ${inRight > 0.1 ? 'on' : ''}`} />
        <path d="M-69 0 L-62 6 L-62 -6 Z" className={`lh-cross-in ${inRight < -0.1 ? 'on' : ''}`} />
      </svg>
      <div className="lh-cross-scale">{t.crossScale(vs, ms)}</div>
    </div>
  )
}

type Keys = { up: string; down: string; left: string; right: string; slow: string; fast: string }
const KEYS: Keys = { up: '↑', down: '↓', left: '←', right: '→', slow: 'W', fast: 'S' }
const TOUCH_KEYS: Keys = { up: '▲', down: '▼', left: '◀', right: '▶', slow: 'W ▲', fast: 'S ▼' }

/**
 * 手で操縦するあいだの「いま、やること」。矢印は「その向きへ動く」指示で、離すと機体が自分で止まる。
 * 降りる速さは自動なので、見るのは降りる場所との距離だけ
 */
function coach(lm: { alt: number; vUp: number; fwd: number; right: number; toFwd: number; toRight: number }, keys: Keys) {
  const c = ui().moonMission.lunar.coach
  const dist = Math.hypot(lm.toFwd, lm.toRight)
  if (dist < 12) return Math.hypot(lm.fwd, lm.right) > 1 ? c.letGo : c.steady
  if (Math.abs(lm.toFwd) >= Math.abs(lm.toRight)) return lm.toFwd > 0 ? c.siteAhead(Math.round(lm.toFwd), keys.up) : c.siteBack(Math.round(-lm.toFwd), keys.down)
  return lm.toRight > 0 ? c.siteRight(Math.round(lm.toRight), keys.right) : c.siteLeft(Math.round(-lm.toRight), keys.left)
}

/** 高さの帯：高さ（右の数字）と、上下の速さ（矢印の長さ）と、指示した降りる速さ */
function AltTape({ alt, vUp, vCmd }: { alt: number; vUp: number; vCmd: number }) {
  const t = ui().moonMission.lunar
  const h = Math.max(0, Math.min(1, Math.log10(Math.max(1, alt)) / Math.log10(200)))
  const v = Math.max(-1, Math.min(1, vUp / 5))
  return (
    <div className="lh-tape">
      <div className="lh-tape-bar">
        <i className="lh-tape-fill" style={{ height: `${h * 100}%` }} />
        <i className={`lh-tape-rate ${Math.abs(vUp) > 2 ? 'bad' : Math.abs(vUp) > 1.2 ? 'ok' : 'good'}`} style={{ height: `${Math.abs(v) * 50}%`, [v < 0 ? 'top' : 'bottom']: '50%' }} />
      </div>
      <div className="lh-tape-num">
        <b>{t.m(alt)}</b>
        <span>{t.ms(vUp)}</span>
        <span className="lh-rod">{t.rod(vCmd)}</span>
      </div>
    </div>
  )
}

function PadButtons({ approach }: { approach: boolean }) {
  // 接近のあいだは降りる場所を動かす、手動のあいだは横に動く
  const hold = (f: number, r: number) => ({
    onPointerDown: () => {
      if (approach) moveTarget(f, r)
      else {
        lunarPad.fwd = f
        lunarPad.right = r
      }
    },
    onPointerUp: () => Object.assign(lunarPad, { fwd: 0, right: 0 }),
    onPointerLeave: () => Object.assign(lunarPad, { fwd: 0, right: 0 }),
    onPointerCancel: () => Object.assign(lunarPad, { fwd: 0, right: 0 }),
  })
  return (
    <div className="lh-pad">
      <button className="up" {...hold(1, 0)}>
        ▲
      </button>
      <button className="left" {...hold(0, -1)}>
        ◀
      </button>
      <button className="right" {...hold(0, 1)}>
        ▶
      </button>
      <button className="down" {...hold(-1, 0)}>
        ▼
      </button>
    </div>
  )
}

function RodButtons() {
  return (
    <div className="lh-rod-buttons">
      <button onPointerDown={() => rod(1)}>W ▲</button>
      <button onPointerDown={() => rod(-1)}>S ▼</button>
    </div>
  )
}

export function LunarHud() {
  useLang()
  const T = ui().moonMission
  const t = T.lunar
  const s = useMoonMission()
  const L = useMoonLunar()
  const r = useReadout()
  const touch = isTouchDevice()
  const phase = s.phase
  const lm = r.kind === 'lm' ? r : null
  const st = r.kind === 'stack' ? r : null
  const approach = lm?.mode === 'approach'
  const manualOn = !!lm?.manual && (lm.mode === 'terminal' || lm.mode === 'contact')
  const pdiWindow = !!lm && (phase === 'undock' || phase === 'descent') && lm.mode === 'coast' && lm.t > PDI_EARLY - 120
  const showEnd = phase === 'landed' && missionNow() - s.since > 7
  return (
    <>
      {phase === 'coast' && (
        <div className="mm-panel jb-big">
          <div className="mm-met">{t.distEarth((journey()?.fromEarth ?? 0) / 1000)}</div>
        </div>
      )}
      {st && phase === 'loi' && (
        <div className="mm-panel">
          <div className="mm-stage">{t.stackName}</div>
          <div className="mm-row">
            <span>{T.altitude}</span>
            <b>{T.km(st.alt / 1000)}</b>
          </div>
          <div className="mm-row">
            <span>{T.speed}</span>
            <b>{T.kms(st.speed / 1000)}</b>
          </div>
          <div className="mm-orbit">{st.apo < 1e9 ? t.orbit(st.peri, st.apo) : t.noOrbit}</div>
          {st.los && <div className="lh-badge los">{t.los}</div>}
          {st.burning && <div className="lh-badge burn">{t.burn}</div>}
          {st.warp > 1.5 && <div className="mm-warp">{T.warp(st.warp)}</div>}
        </div>
      )}
      {lm && (phase === 'undock' || phase === 'descent' || phase === 'landed') && (
        <div className="mm-panel">
          <div className="lh-prog">{lm.mode === 'terminal' && !lm.manual ? t.autoProgram : t.program[lm.mode]}</div>
          <div className="mm-row">
            <span>{t.alt}</span>
            <b>{t.m(lm.alt)}</b>
          </div>
          <div className="mm-row">
            <span>{t.vUp}</span>
            <b>{t.ms(lm.vUp)}</b>
          </div>
          <div className="mm-row">
            <span>{t.vSide}</span>
            <b>{t.ms(lm.vSide)}</b>
          </div>
          <div className="mm-row">
            <span>{t.fuel}</span>
            <i className="mm-gbar lh-fuel">
              <i style={{ width: `${Math.max(0, lm.fuel) * 100}%` }} className={lm.hover < 30 ? 'low' : ''} />
            </i>
          </div>
          {(lm.mode === 'approach' || lm.mode === 'terminal') && <div className={`lh-hover ${lm.hover < 30 ? 'low' : ''}`}>{t.hover(lm.hover)}</div>}
          {lm.mode !== 'coast' && lm.mode !== 'landed' && lm.toDist < 60_000 && <div className="mm-orbit">{t.toSite(lm.toDist)}</div>}
          {lm.warp > 1.5 && <div className="mm-warp">{T.warp(lm.warp)}</div>}
          {!L.ready && <div className="mm-warp">{t.loading}</div>}
        </div>
      )}
      {phase === 'loi' && st && <LoiCard r={st} />}
      {phase === 'loi' && st && !st.burning && st.burnEnd === null && st.t > LOI_OPEN - 150 && (
        <WindowBar t={st.t} open={LOI_OPEN} close={LOI_CLOSE} ideal={LOI_IDEAL} label={t.loiBar} go={t.loiGo} hint={t.loiHint} can={st.t >= LOI_OPEN} />
      )}
      {pdiWindow && lm && <WindowBar t={lm.t} open={PDI_EARLY} close={PDI_LATE} ideal={PDI_IDEAL} label={t.pdiBar} go={t.pdiGo} hint={t.pdiHint} can={phase === 'descent' && lm.t >= PDI_EARLY} />}
      {approach && (
        <div className="lh-approach">
          <div className="mm-hint">{t.lpdHint}</div>
          {!s.auto && (
            <button className="mm-go ready" onPointerDown={() => manual()} disabled={!!lm && lm.alt > MANUAL_ALT}>
              {lm && lm.alt > MANUAL_ALT ? t.manualWait(MANUAL_ALT) : t.manualGo}
            </button>
          )}
        </div>
      )}
      {lm && (approach || manualOn) && (
        <div className="lh-instruments">
          <CrossPointer fwd={lm.fwd} right={lm.right} toFwd={lm.toFwd} toRight={lm.toRight} inFwd={manualOn ? lm.inFwd : 0} inRight={manualOn ? lm.inRight : 0} />
          {manualOn && <AltTape alt={lm.alt} vUp={lm.vUp} vCmd={lm.vCmd} />}
        </div>
      )}
      {manualOn && lm && lm.mode === 'terminal' && (
        <div className="lh-manual-hint">
          <div className="lh-coach">{coach(lm, touch ? TOUCH_KEYS : KEYS)}</div>
          {!touch && <div className="mm-hint">{t.manualHint}</div>}
        </div>
      )}
      {touch && (approach || manualOn) && <PadButtons approach={approach} />}
      {touch && manualOn && <RodButtons />}
      <div className="mm-buttons">
        <CamMenu />
        {(phase === 'loi' || phase === 'descent') && (
          <button className={L.realTime ? 'on' : ''} onClick={() => useMoonLunar.setState({ realTime: !L.realTime })}>
            {t.realTime}
          </button>
        )}
        {phase === 'descent' && !lm?.manual && (
          <button className={s.auto ? 'on' : ''} onClick={() => setLunarAuto(!s.auto)}>
            {s.auto ? T.autoOn : T.auto}
          </button>
        )}
        <ChapterMenu />
        <button className="mm-quit" onClick={() => endMission()}>
          {T.quit}
        </button>
      </div>
      {showEnd && lm && <LandEnd lm={lm} stars={L.stars} best={s.best.land ?? 0} />}
      {L.interlude && (
        <div className="lh-interlude">
          <div className="lh-interlude-head">{t.interlude[L.interlude.key][0]}</div>
          <div className="lh-interlude-line">{t.interlude[L.interlude.key][1]}</div>
        </div>
      )}
    </>
  )
}

/** 着陸の結果。うまく着いたら、数秒で自動で月面の探検へ */
function LandEnd({ lm, stars, best }: { lm: { touch: { vUp: number; vSide: number; miss: number; fuel: number } | null }; stars: number; best: number }) {
  const T = ui().moonMission
  const t = T.lunar
  const ok = !!lm.touch && stars > 0
  const auto = useAutoNext(() => startChapter(7), 8, ok)
  return (
    <div className="mm-end lh-end">
      <div className="mm-end-title">{lm.touch ? (stars > 0 ? t.endTitle : t.endHard) : t.endAbort}</div>
      {lm.touch && <div className="mm-end-stars">{T.stars(stars)}</div>}
      {lm.touch && <div className="mm-end-note">{t.touch(lm.touch.vUp, lm.touch.vSide, lm.touch.miss, Math.max(0, lm.touch.fuel - 20))}</div>}
      <div className="mm-end-note">{t.starsNote}</div>
      <div className="mm-end-next">{t.endNext}</div>
      <div className="mm-end-buttons">
        {ok && (
          <button className="mm-continue" onClick={() => startChapter(7)}>
            {auto.left !== null ? T.autoNext(t.evaNext, auto.left) : t.evaNext}
          </button>
        )}
        {!ok && canRetryManual() && (
          <button className="mm-continue" onClick={() => (auto.cancel(), retryManual())}>
            {t.retryManual}
          </button>
        )}
        <button onClick={() => (auto.cancel(), retryDescent())}>{t.again}</button>
        {lm.touch && <button onClick={() => (auto.cancel(), stepOutside())}>{t.surface}</button>}
        <button onClick={() => (auto.cancel(), endMission())}>{T.back}</button>
      </div>
      {best > 0 && <div className="mm-end-best">{T.best(best)}</div>}
    </div>
  )
}
