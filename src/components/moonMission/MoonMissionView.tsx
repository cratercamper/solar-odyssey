import { Suspense, memo, useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { useDpr } from '../../state/quality'
import { QualityGovernor } from '../QualityGovernor'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { isTouchDevice } from '../../state/input'
import {
  COUNT_FROM,
  IGNITION_AT,
  MISSION_FADE,
  TLI_WINDOW,
  TLI_WINDOW_OPEN,
  bindMissionKeys,
  endMission,
  missionInput,
  missionNow,
  missionReadout,
  pressGo,
  restartMission,
  setAuto,
  sim,
  useMoonMission,
  film,
} from '../../state/moonMission'

const debugOn = typeof location !== 'undefined' && location.hash.includes('debug')
import { LaunchWorld } from './LaunchWorld'
import { MissionPost } from './MissionPost'
import { LunarWorld } from './LunarWorld'
import { DockWorld } from './DockWorld'
import { DockHud } from './DockHud'
import { ReturnWorld } from './ReturnWorld'
import { ReturnHud } from './ReturnHud'
import { startDock } from '../../state/moonDock'
import { LunarHud } from './LunarHud'
import { bindLunarKeys, lunarPhase } from '../../state/moonLunar'
import { RadioSubtitle } from './RadioSubtitle'
import { JourneyBar } from './JourneyBar'
import { journey } from '../../state/missionJourney'
import { ChapterMenu, ResumeButton } from './ChapterMenu'
import { CabinFrame } from './CabinFrame'
import { useAfter, useAutoNext } from './autoNext'
import './moonMission.css'
import { CamMenu } from './CamMenu'
import { AscentCards } from './AscentCards'
import { SaturnExplorer } from './SaturnExplorer'
import { LifeTip, lifeTipNow } from './LifeTip'

// 月ミッション（アポロ17号の追体験）の場面。宇宙の場面とは別の Canvas で描く（そのあいだ宇宙の場面は止める）。
// 画面の上に、時刻・高さ・速さ・G、機首の手本の目盛り、出来事の字幕、終わりのカードを重ねる。

/** 確認用の動画：コマを 1 枚ずつ進める（window.__moonFilm.step(dt)）。ふだんは使わない */
function FilmHook() {
  const advance = useThree((s) => s.advance)
  const setFrameloop = useThree((s) => s.setFrameloop)
  const get = useThree((s) => s.get)
  useEffect(() => {
    const w = window as unknown as { __moonFilm?: unknown }
    w.__moonFilm = {
      begin: () => {
        film.t = 1000
        setFrameloop('never')
      },
      step: (dt: number) => {
        // 時計を止めておく：動いていると、コマとコマのあいだの本当の時間（撮影に 1 秒かかるなど）が差し引かれ、
        // 次のコマの dt が小さくなって、早送りが遅く測れていた（画質の自動調整で描き直すと、時計がまた動き出す）
        if (get().frameloop !== 'never') setFrameloop('never')
        const clock = get().clock
        clock.autoStart = false
        clock.running = false
        film.t = (film.t ?? 1000) + dt
        advance(film.t)
      },
      /** 確認用：いまの場面とカメラ */
      three: () => get(),
    }
    return () => {
      delete w.__moonFilm
    }
  }, [advance, setFrameloop, get])
  return null
}

/** on のあいだ、ms ミリ秒さわらなかったら true（画面にさわる・マウスを動かす・キーを押すと false にもどる） */
function useIdle(on: boolean, ms: number) {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if (!on) {
      setIdle(false)
      return
    }
    let id = 0
    const wake = () => {
      setIdle(false)
      clearTimeout(id)
      id = window.setTimeout(() => setIdle(true), ms)
    }
    wake()
    const evs = ['pointermove', 'pointerdown', 'keydown'] as const
    for (const e of evs) window.addEventListener(e, wake)
    return () => {
      clearTimeout(id)
      for (const e of evs) window.removeEventListener(e, wake)
    }
  }, [on, ms])
  return idle
}

type World = 'launch' | 'dock' | 'moon' | 'home'

const MissionCanvas = memo(function MissionCanvas({ world }: { world: World }) {
  const dpr = useDpr(1.75)
  return (
    // コマ送りの確認のあいだは、画質の自動調整で描き直されても、本当の時間で動き出さないように
    <Canvas frameloop={film.t !== null ? 'never' : 'always'} dpr={dpr} gl={{ alpha: false, logarithmicDepthBuffer: true, antialias: true }} camera={{ fov: 40, near: 0.3, far: 2e10, position: [0, 20, 300] }}>
      <color attach="background" args={['#000']} />
      {/* 第1弾（地球から月へ向かうまで）と第2弾（月のまわり）は、別の世界 */}
      <Suspense fallback={null}>{world === 'moon' ? <LunarWorld /> : world === 'dock' ? <DockWorld /> : world === 'home' ? <ReturnWorld /> : <LaunchWorld />}</Suspense>
      {/* 後処理（露出・光のにじみ）：打ち上げの世界と、地球へ帰る世界（9 章）。ほかの章は質感を合わせてから広げる */}
      {(world === 'launch' || world === 'home') && <MissionPost />}
      <QualityGovernor />
      {debugOn && <FilmHook />}
    </Canvas>
  )
})

/** 毎フレームの数字を、画面の部品に 10 回/秒ほどで渡す */
function useReadout() {
  const [r, setR] = useState(missionReadout)
  useEffect(() => {
    const id = setInterval(() => setR(missionReadout()), 100)
    return () => clearInterval(id)
  }, [])
  return r
}

/** 機首の目盛り：0°（真上）〜90°（水平）の扇。緑が手本、白い針が今の機首 */
function PitchDial({ pitch, guide }: { pitch: number; guide: number }) {
  const R = 70
  const pt = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180
    return [80 + Math.sin(a) * r, 84 - Math.cos(a) * r]
  }
  const g0 = pt(guide - 3, R)
  const g1 = pt(guide + 3, R)
  const [nx, ny] = pt(pitch, R - 4)
  const off = Math.abs(pitch - guide)
  return (
    <svg className="mm-dial" viewBox="0 0 170 92" aria-hidden>
      <path d={`M10 84 A${R} ${R} 0 0 1 150 84`} className="mm-dial-arc" />
      <path d={`M${pt(0, R)[0]} ${pt(0, R)[1]} A${R} ${R} 0 0 1 ${pt(90, R)[0]} ${pt(90, R)[1]}`} className="mm-dial-arc on" />
      <path d={`M80 84 L${g0[0]} ${g0[1]} A${R} ${R} 0 0 1 ${g1[0]} ${g1[1]} Z`} className="mm-dial-guide" />
      <line x1={80} y1={84} x2={nx} y2={ny} className={`mm-dial-nose ${off > 7 ? 'bad' : off > 3 ? 'ok' : 'good'}`} />
      <circle cx={80} cy={84} r={4} className="mm-dial-hub" />
    </svg>
  )
}

function TiltButtons() {
  const press = (v: number) => () => (missionInput.tilt = v)
  const up = () => (missionInput.tilt = 0)
  return (
    <>
      <button className="mm-tilt left" onPointerDown={press(-1)} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}>
        ◀
      </button>
      <button className="mm-tilt right" onPointerDown={press(1)} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}>
        ▶
      </button>
    </>
  )
}

function Caption() {
  useLang()
  const caption = useMoonMission((s) => s.caption)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [])
  const age = caption ? missionNow() - caption.at : 1e9
  const fact = caption ? ui().moonMission.facts[caption.key] : undefined
  // 見出しも豆知識も出ていない静かなときは、船内のくらしのカード
  const life = lifeTipNow(age > 14 || (age > 5.5 && !fact))
  if (life) return <LifeTip id={life} />
  if (!caption) return null
  // 見出しが消えたあと、その場面の豆知識をしばらく出す
  if (age > 5.5 && fact && age < 14)
    return (
      <div className="mm-caption mm-fact" key={`fact-${caption.at}`}>
        <span className="mm-fact-label">{ui().moonMission.factLabel}</span>
        <div className="mm-fact-line">{fact}</div>
      </div>
    )
  if (age > 5.5) return null
  const [head, line] = ui().moonMission.captions[caption.key]
  return (
    <div className="mm-caption" key={caption.at}>
      <div className="mm-caption-head">{head}</div>
      <div className="mm-caption-line">{line}</div>
    </div>
  )
}

function Hud() {
  useLang()
  const t = ui().moonMission
  const s = useMoonMission()
  const r = useReadout()
  const touch = isTouchDevice()
  const flying = s.phase === 'ascent' || s.phase === 'orbit' || s.phase === 'tli' || s.phase === 'outbound'
  const orbitT = r.t - sim.orbitAt
  const windowPos = (orbitT - TLI_WINDOW_OPEN + 300) / (TLI_WINDOW + 600)
  return (
    <div className="mm-hud">
      {(s.phase === 'observe' || s.phase === 'timelapse') && <SaturnExplorer />}
      {s.phase === 'pad' && (
        <div className="mm-pad">
          {s.countdown > COUNT_FROM - 5 && (
            <div className="mm-intro">
              <div className="mm-intro-title">{t.title}</div>
              <div>{t.intro}</div>
              <div className="mm-intro-crew">{t.crew}</div>
              {s.ignitedAt === null && <ResumeButton />}
            </div>
          )}
          <div className="mm-count">{t.tMinus(s.countdown)}</div>
          {s.ignitedAt === null ? (
            <>
              <button className={`mm-go ${s.countdown <= IGNITION_AT + 0.6 ? 'ready' : ''}`} onPointerDown={() => pressGo()} disabled={s.countdown > IGNITION_AT + 0.6}>
                {t.igniteHold}
              </button>
              <div className="mm-hint">{t.igniteHint}</div>
            </>
          ) : (
            <div className="mm-go-done">{t.ignitionGo}</div>
          )}
        </div>
      )}
      {flying && (
        <div className="mm-panel">
          {/* 帯と同じ、本物の経過時間に合わせた時計 */}
          <div className="mm-met">{t.met(journey()?.get ?? r.t)}</div>
          <div className="mm-stage">{t.stageName[r.stage]}</div>
          <div className="mm-row">
            <span>{t.altitude}</span>
            <b>{t.km(r.alt / 1000)}</b>
          </div>
          <div className="mm-row">
            <span>{t.speed}</span>
            <b>{t.kms(r.speed / 1000)}</b>
          </div>
          <div className="mm-row">
            <span>{t.gee}</span>
            <b>{r.g.toFixed(1)}</b>
            <i className="mm-gbar">
              <i style={{ width: `${Math.min(100, (r.g / 4) * 100)}%` }} />
            </i>
          </div>
          {(s.phase === 'orbit' || s.phase === 'tli') && r.apo < 1e9 && <div className="mm-orbit">{t.orbitInfo(r.peri, r.apo)}</div>}
          {r.warp > 1.5 && <div className="mm-warp">{t.warp(r.warp)}</div>}
        </div>
      )}
      {s.phase === 'ascent' && r.stage < 2 && r.t > 10 && (
        <div className="mm-steer">
          <PitchDial pitch={r.pitch} guide={r.guide} />
          {!s.auto && <div className="mm-hint">{t.tiltHint}</div>}
        </div>
      )}
      {s.phase === 'ascent' && touch && !s.auto && r.stage < 2 && <TiltButtons />}
      <AscentCards r={r} raised={s.phase === 'ascent' && touch && !s.auto && r.stage < 2} high={s.phase === 'orbit' && orbitT > TLI_WINDOW_OPEN - 300} />
      {s.phase === 'orbit' && orbitT > TLI_WINDOW_OPEN - 300 && (
        <div className="mm-tli">
          <div className="mm-tli-label">{t.tliBar}</div>
          <div className="mm-tli-bar">
            <i className="mm-tli-window" style={{ left: `${(300 / (TLI_WINDOW + 600)) * 100}%`, width: `${(TLI_WINDOW / (TLI_WINDOW + 600)) * 100}%` }} />
            <i className="mm-tli-mark" style={{ left: `${Math.max(0, Math.min(1, windowPos)) * 100}%` }} />
          </div>
          <button className="mm-go ready" onPointerDown={() => pressGo()} disabled={orbitT < TLI_WINDOW_OPEN}>
            {t.tliGo}
          </button>
          <div className="mm-hint">{t.tliHint}</div>
        </div>
      )}
      <Caption />
      <RadioSubtitle />
      <div className="mm-buttons">
        {s.phase !== 'observe' && s.phase !== 'timelapse' && <CamMenu />}
        {s.phase === 'ascent' && (
          <button className={s.auto ? 'on' : ''} onClick={() => setAuto(!s.auto)}>
            {s.auto ? t.autoOn : t.auto}
          </button>
        )}
        <ChapterMenu />
        <button className="mm-quit" onClick={() => endMission()}>
          {t.quit}
        </button>
      </div>
      <OutboundEnd />
    </div>
  )
}

/** 章3 の終わり：月へ向かう道に乗って 9 秒たったら結果を出し、さらに数秒で自動で章4 へ */
function OutboundEnd() {
  const s = useMoonMission()
  const show = useAfter(s.phase === 'outbound', 9)
  if (!show) return null
  return <OutboundCard stars={s.stars} best={s.best.stars} />
}

function OutboundCard({ stars, best }: { stars: number; best: number }) {
  const t = ui().moonMission
  const auto = useAutoNext(() => startDock(), 6)
  return (
    <div className="mm-end">
      <div className="mm-end-title">{t.endTitle}</div>
      <div className="mm-end-stars">{t.stars(stars)}</div>
      <div className="mm-end-note">{t.starsNote}</div>
      <div className="mm-end-next">{t.endNext}</div>
      <div className="mm-end-buttons">
        <button className="mm-continue" onClick={() => startDock()}>
          {auto.left !== null ? t.autoNext(t.dockNext, auto.left) : t.dockNext}
        </button>
        <button onClick={() => (auto.cancel(), restartMission())}>{t.again}</button>
        <button onClick={() => (auto.cancel(), endMission())}>{t.back}</button>
      </div>
      {best > 0 && <div className="mm-end-best">{t.best(best)}</div>}
    </div>
  )
}

/** 暗転の幕 */
function Fade() {
  const phase = useMoonMission((s) => s.phase)
  const dark = phase === 'fadeIn' || phase === 'leave'
  return <div className="mm-fade" style={{ opacity: dark ? 1 : 0, transitionDuration: `${MISSION_FADE}s` }} />
}

export function MoonMissionView() {
  const phase = useMoonMission((s) => s.phase)
  useEffect(() => bindMissionKeys(), [])
  useEffect(() => bindLunarKeys(), [])
  // スマホ：長押しの点火ボタンを離したとき
  useEffect(() => {
    const up = () => (missionInput.ignite = false)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])
  const shown = phase !== 'none' && phase !== 'fadeIn'
  const moon = lunarPhase(phase)
  const docking = phase === 'dock' || phase === 'marble'
  const home = phase === 'home'
  // 映画のカメラのあいだは、数字や手本の目盛りをしまって、絵と字幕だけにする
  const filmCam = useMoonMission((s) => s.cam === 'film' && s.phase !== 'observe' && s.phase !== 'timelapse')
  const idle = useIdle(filmCam, 3000)
  return (
    <div className="mm-root" data-phase={phase} data-film={filmCam ? '1' : undefined} data-idle={idle ? '1' : undefined}>
      {shown && <MissionCanvas world={moon ? 'moon' : docking ? 'dock' : home ? 'home' : 'launch'} />}
      {shown && <CabinFrame />}
      {shown && <JourneyBar />}
      {shown && !moon && !docking && !home && <Hud />}
      {shown && home && (
        <div className="mm-hud">
          <ReturnHud />
          <Caption />
          <RadioSubtitle />
        </div>
      )}
      {shown && docking && (
        <div className="mm-hud">
          <DockHud />
          <Caption />
          <RadioSubtitle />
        </div>
      )}
      {shown && moon && (
        <div className="mm-hud">
          <LunarHud />
          <Caption />
      <RadioSubtitle />
        </div>
      )}
      <Fade />
    </div>
  )
}
