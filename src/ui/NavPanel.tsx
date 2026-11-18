import { useEffect, useState } from 'react'
import { PLANETS } from '../data/bodies'
import { TIME_RATES } from '../data/scale'
import { useStore, type ThrustFxLevel } from '../state/store'
import { bodyInfo, engage, travelFacts, useWarpPrep } from '../state/flight'
import { SF_OBJECTS, setWorld } from '../data/sf'
import { HUBBLE_ID, scopeName, WEBB_ID } from '../data/telescopes'
import { useRace } from '../state/race'
import { QUIZ_LENGTH, startQuiz, useQuiz } from '../state/quiz'
import { openProbes, useProbes } from '../state/probes'
import { sim } from '../state/registry'
import { formatDate, simDate, SIM_SECONDS_PER_HOUR } from '../data/ephemeris'
import { closeMissions, openMissions, useMission } from '../state/mission'
import { openCampaign, useCampaign } from '../state/campaign'
import { CAMPAIGN_STAGES } from '../data/campaign'
import { closeEclipses, openEclipses, useEclipse } from '../state/eclipse'
import { openStamps, useStamps } from '../state/stamps'
import { openRocks, useRockBook } from '../state/rockBook'
import { ROCK_TOTAL, rockCount } from '../data/rockCollection'
import { useSampleLog } from '../state/rover'
import { NATURAL } from '../data/stamps'
import { ui } from '../i18n'
import { ShipSection } from './ShipPicker'
import { scaleFacts, scalePatch, stepName, stepOf } from './ScaleToggle'
import { useLevel, useQuality, type QualitySetting } from '../state/quality'
import { setLook } from '../state/look'
import { setLang, useLang } from '../i18n/lang'
import { isTouchDevice } from '../state/input'
import { useTouchUI } from '../state/touchUI'
import { ThrottleMeter } from './Throttle'
import { toggleObserve, useObserve } from '../state/observe'
import { startEva, startRepairEva } from '../state/eva'
import { startWalkDirect } from '../state/walk'

const fmtDistance = (d: number | null) => (d === null ? '—' : d < 10 ? d.toFixed(1) : Math.round(d).toString())

/** 小さい画面（スマホ）か */
function useSmallScreen() {
  // 縦長のスマホと、横向きにしたスマホ（高さが低い）
  const query = '(max-width: 720px), (max-height: 500px)'
  const [small, setSmall] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const onChange = () => setSmall(m.matches)
    m.addEventListener('change', onChange)
    return () => m.removeEventListener('change', onChange)
  }, [])
  return small
}

function TargetButton({ id, name, sub, onPick }: { id: string; name: string; sub?: boolean; onPick?: () => void }) {
  const targetId = useStore((s) => s.targetId)
  const setTarget = useStore((s) => s.setTarget)
  return (
    <button
      className={`nav-item${sub ? ' sub' : ''}${targetId === id ? ' active' : ''}`}
      onClick={() => {
        setTarget(id)
        onPick?.()
      }}
    >
      {name}
    </button>
  )
}

/** 表示の設定：スケール（距離の広さと天体の大きさ）、旋回の傾き */
function Settings({ racing }: { racing: boolean }) {
  const settings = useStore((s) => s.settings)
  const lang = useLang()
  const update = useStore((s) => s.updateSettings)
  const { moonGap, sunSize } = scaleFacts(settings.distance, settings.size)
  const step = settings.distance === settings.size ? stepOf(settings.distance) : null
  return (
    <details className="nav-settings">
      <summary>{ui().navPanel.displaySettings}</summary>
      <div className="nav-check">
        {ui().navPanel.language}
        <span className="nav-lang-pick">
          <button className={lang === 'ja' ? 'on' : ''} onClick={() => setLang('ja')} lang="ja">
            日本語
          </button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')} lang="en">
            English
          </button>
        </span>
      </div>
      <LookPick />
      <QualityPick />
      <FxPick />
      <ThrustPick />
      <label className="nav-slider">
        <span>
          {ui().navPanel.scale} <span className="muted">{step === null ? '' : stepName(step)}</span>
        </span>
        <input type="range" min={0} max={1} step={0.05} value={settings.distance} onChange={(e) => update(scalePatch(Number(e.target.value)))} disabled={racing} />
      </label>
      <div className="muted small">
        {ui().navPanel.scaleFacts(moonGap, sunSize)}
        {racing && ui().navPanel.raceScaleNote}
      </div>
      <label className="nav-slider">
        <span>
          {ui().navPanel.volume} <span className="muted">{settings.muted ? ui().navPanel.muted : `${Math.round(settings.volume * 100)}%`}</span>
        </span>
        <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => update({ volume: Number(e.target.value), muted: false })} />
      </label>
      <label className="nav-check">
        <input type="checkbox" checked={settings.muted} onChange={(e) => update({ muted: e.target.checked })} />
        {ui().navPanel.mute}
      </label>
      <label className="nav-check">
        <input type="checkbox" checked={settings.music} onChange={(e) => update({ music: e.target.checked })} />
        {ui().navPanel.playMusic}
      </label>
      <label className="nav-check">
        <input type="checkbox" checked={settings.banking} onChange={(e) => update({ banking: e.target.checked })} />
        {ui().navPanel.bankWhenTurning}
      </label>
      <div className="muted small">
        {ui().navPanel.bankNote}
      </div>
    </details>
  )
}

/** 天体の描き方：図鑑モード（強調した見やすい絵）か、写真モード（カメラで撮ったような見え方）。現実／SF とは別の切り替え */
function LookPick() {
  useLang()
  const look = useStore((s) => s.settings.look)
  return (
    <>
      <div className="nav-check">
        {ui().navPanel.planetLook}
        <span className="nav-lang-pick" role="group" aria-label={ui().navPanel.planetLook}>
          <button className={look === 'illustrated' ? 'on' : ''} onClick={() => setLook('illustrated')}>
            {ui().navPanel.illustrated}
          </button>
          <button className={look === 'photo' ? 'on' : ''} onClick={() => setLook('photo')}>
            {ui().navPanel.photographic}
          </button>
        </span>
      </div>
      <div className="muted small">
        {look === 'photo'
          ? ui().navPanel.photographicNote
          : ui().navPanel.illustratedNote}
      </div>
    </>
  )
}

const LEVEL_NAME: Record<QualitySetting, () => string> = {
  auto: () => ui().navPanel.auto,
  high: () => ui().navPanel.high,
  medium: () => ui().navPanel.medium,
  low: () => ui().navPanel.light,
}

/** 画質。自動のときは、いま選んでいる画質と FPS も見せる */
function QualityPick() {
  useLang()
  const setting = useStore((s) => s.settings.quality)
  const update = useStore((s) => s.updateSettings)
  const level = useLevel()
  const fps = useQuality((q) => q.fps)
  return (
    <>
      <div className="nav-check">
        {ui().navPanel.quality}
        <span className="nav-lang-pick">
          {(['auto', 'high', 'medium', 'low'] as const).map((q) => (
            <button key={q} className={setting === q ? 'on' : ''} onClick={() => update({ quality: q })}>
              {LEVEL_NAME[q]()}
            </button>
          ))}
        </span>
      </div>
      <div className="muted small">
        {ui().navPanel.qualityNow}: {LEVEL_NAME[level]()}
        {fps > 0 && ` · ${fps} fps`}
        {' '}
        {ui().navPanel.qualityNote}
      </div>
    </>
  )
}

/** 後処理を 1 つずつ切り替える（components/PostFx.tsx）。重いと感じたら切る */
function FxPick() {
  useLang()
  const fx = useStore((s) => s.settings.fx)
  const update = useStore((s) => s.updateSettings)
  const level = useLevel()
  const toggle = (key: keyof typeof fx) => update({ fx: { ...fx, [key]: !fx[key] } })
  const items: [keyof typeof fx, string][] = [
    ['bloom', ui().navPanel.glow],
    ['ao', ui().navPanel.shading],
    ['film', ui().navPanel.filmLook],
  ]
  const beamFx = useStore((s) => s.settings.beamFx)
  const beamItems: [keyof typeof beamFx, string][] = [
    ['flash', ui().navPanel.flash],
    ['shake', ui().navPanel.shake],
  ]
  return (
    <>
      <div className="nav-check">
        {ui().navPanel.effects}
        <span className="nav-lang-pick" role="group" aria-label={ui().navPanel.effects}>
          {items.map(([key, label]) => (
            <button key={key} className={fx[key] ? 'on' : ''} aria-pressed={fx[key]} onClick={() => toggle(key)} disabled={level === 'low'}>
              {label}
            </button>
          ))}
        </span>
      </div>
      <div className="muted small">
        {level === 'low'
          ? ui().navPanel.effectsOffNote
          : ui().navPanel.effectsNote}
      </div>
      <div className="nav-check">
        {ui().navPanel.chargeBeam}
        <span className="nav-lang-pick" role="group" aria-label={ui().navPanel.chargeBeamEffects}>
          {beamItems.map(([key, label]) => (
            <button key={key} className={beamFx[key] ? 'on' : ''} aria-pressed={beamFx[key]} onClick={() => update({ beamFx: { ...beamFx, [key]: !beamFx[key] } })}>
              {label}
            </button>
          ))}
        </span>
      </div>
      <div className="muted small">
        {ui().navPanel.beamNote}
      </div>
    </>
  )
}

/** エンジン噴射と姿勢制御の演出の量（components/ship/EngineFx.tsx） */
function ThrustPick() {
  useLang()
  const thrust = useStore((s) => s.settings.thrust)
  const update = useStore((s) => s.updateSettings)
  const items: [ThrustFxLevel, string][] = [
    ['many', ui().navPanel.more],
    ['normal', ui().navPanel.normal],
    ['off', ui().navPanel.off],
  ]
  return (
    <div className="nav-check">
      {ui().navPanel.thrusters}
      <span className="nav-lang-pick" role="group" aria-label={ui().navPanel.thrusters}>
        {items.map(([key, label]) => (
          <button key={key} className={thrust === key ? 'on' : ''} aria-pressed={thrust === key} onClick={() => update({ thrust: key })}>
            {label}
          </button>
        ))}
      </span>
    </div>
  )
}

/** 1秒に進む時間の名前（1秒で1秒＝本物と同じ速さ） */
const rateName = (hours: number) =>
  hours === 0 ? ui().navPanel.stop : hours < 1 / 60 ? ui().navPanel.oneSecond : hours < 1 ? ui().navPanel.oneMinute : hours === 1 ? ui().navPanel.oneHour : ui().navPanel.oneDay

/** 表示している日時（惑星はこの日の本当の位置にある）。時間を進めていたら、今に戻せる */
function SimDate() {
  useLang()
  const [time, setTime] = useState(sim.time)
  useEffect(() => {
    const id = setInterval(() => setTime(sim.time), 250)
    return () => clearInterval(id)
  }, [])
  // 今から2時間以内なら「今」のまま
  const today = Math.abs(time) < 2 * SIM_SECONDS_PER_HOUR
  return (
    <div className="nav-date muted small">
      {ui().navPanel.date} {formatDate(simDate(time))} {simDate(time).toTimeString().slice(0, 5)}
      {!today && (
        <button className="nav-today" onClick={() => (sim.time = 0)}>
          {ui().navPanel.backToNow}
        </button>
      )}
    </div>
  )
}

export function NavPanel() {
  const [open, setOpen] = useState<string | null>('saturn')
  // スマホでは、ふだんは目標とワープのボタンだけの小さな形にたたんでおく
  // スマホ・タブレットでは、画面下のボタンから引き出す（ふだんは目標とワープだけの小さな形）
  const touch = isTouchDevice()
  const small = useSmallScreen() || touch
  const [localExpanded, setLocalExpanded] = useState(false)
  const sheet = useTouchUI((u) => u.sheet)
  const setSheet = useTouchUI((u) => u.setSheet)
  const expanded = touch ? sheet === 'nav' : localExpanded
  const setExpanded = (on: boolean) => (touch ? setSheet(on ? 'nav' : null) : setLocalExpanded(on))
  const collapsed = small && !expanded
  const pick = () => small && setExpanded(false)
  const s = useStore()
  const info = s.targetId ? bodyInfo(s.targetId) : null
  const facts = info && info.au > 0 ? travelFacts(info.au) : null
  const racePhase = useRace((r) => r.phase)
  const startRace = useRace((r) => r.start)
  const racing = racePhase === 'countdown' || racePhase === 'running'
  const busy = s.warpPhase !== 'idle' || racing
  const pendingWarp = useWarpPrep((w) => w.pending)
  const observing = useObserve((o) => o.id !== null)
  const quizOpen = useQuiz((q) => q.open)
  const probesOpen = useProbes((p) => p.open)
  const eclipsesOpen = useEclipse((e) => e.open)
  const stampsOpen = useStamps((b) => b.open)
  const rocksOpen = useRockBook((r) => r.open)
  const rocksGot = useSampleLog((l) => rockCount(l.log))
  const stampCount = useStamps((b) => NATURAL.filter((id) => id in b.stamps).length)
  const missionPhase = useMission((m) => m.phase)
  const onMission = missionPhase === 'active'
  const campaignOn = useCampaign((c) => c.active)
  const campaignStage = useCampaign((c) => c.stage)
  const lang = useLang()
  if (s.mode === 'gallery') return null
  const sf = s.settings.world === 'sf'
  const other = (
    <>
      <button className="nav-lang" onClick={() => setLang(lang === 'en' ? 'ja' : 'en')} lang={lang === 'en' ? 'ja' : 'en'} title={ui().navPanel.switchLanguage}>
        {lang === 'en' ? '日本語' : 'English'}
      </button>
      {/* 本物の太陽系だけか、架空の船や構造物も出す SF モードか */}
      <span className="nav-world" role="group" aria-label={ui().navPanel.world}>
        <button className={sf ? '' : 'on'} onClick={() => setWorld('real')} disabled={racing} title={ui().navPanel.realWorldTip}>
          {ui().navPanel.real}
        </button>
        <button className={sf ? 'on sf' : 'sf'} onClick={() => setWorld('sf')} disabled={racing} title={ui().navPanel.sfWorldTip}>
          SF
        </button>
      </span>
    </>
  )

  return (
    <aside className={`nav-panel${collapsed ? ' collapsed' : ''}`}>
      {small ? (
        <h2 className="nav-head">
          <button className="nav-collapse" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
            {ui().navPanel.navComputer} <span>{expanded ? ui().navPanel.close : ui().navPanel.open}</span>
          </button>
          {/* たたんだ小さな形には入りきらないので、ひらいたときだけ */}
          {expanded && other}
        </h2>
      ) : (
        <h2 className="nav-head">
          {ui().navPanel.navigationComputer}
          {other}
        </h2>
      )}
      <div className="nav-list">
        <TargetButton id="sun" name={ui().navPanel.sun} onPick={pick} />
        {PLANETS.map((p) => (
          <div key={p.id}>
            {p.dwarf && <div className="nav-heading">{ui().navPanel.dwarfPlanet}</div>}
            <div className="nav-row">
              <TargetButton id={p.id} name={ui().bodies[p.id].name} onPick={pick} />
              {p.moons.length > 0 && (
                <button className="nav-toggle" onClick={() => setOpen(open === p.id ? null : p.id)} aria-label={ui().navPanel.moonsOf(ui().bodies[p.id].name)}>
                  {open === p.id ? '−' : `+${p.moons.length}`}
                </button>
              )}
            </div>
            {open === p.id && p.moons.map((m) => <TargetButton key={m.id} id={m.id} name={ui().bodies[m.id].name} sub onPick={pick} />)}
          </div>
        ))}
        <div className="nav-heading">{ui().navPanel.spaceTelescopes}</div>
        <TargetButton id={HUBBLE_ID} name={scopeName(HUBBLE_ID)} onPick={pick} />
        <TargetButton id={WEBB_ID} name={scopeName(WEBB_ID)} onPick={pick} />
        {sf && (
          <>
            <div className="nav-heading">{ui().navPanel.sfImaginary}</div>
            {SF_OBJECTS.map((e) => (
              <TargetButton key={e.id} id={e.id} name={e.name()} onPick={pick} />
            ))}
          </>
        )}
      </div>

      <div className="nav-target">
        {info ? (
          <>
            <div className="nav-target-name">
              {ui().navPanel.target}
              {info.name}
              {info.parent && <span className="muted">{ui().navPanel.moonOf(info.parent)}</span>}
            </div>
            <div className="muted">
              {ui().navPanel.distance} {fmtDistance(s.telemetry.distance)}
            </div>
            {facts && <div className="muted">{ui().navPanel.lightMinutes(Math.round(facts.lightMinutes))}</div>}
            {!s.logOpen && (
              <button className="nav-log" onClick={() => (s.setLogOpen(true), touch && setSheet('log'))}>
                {ui().navPanel.openShipsLog} <kbd>I</kbd>
              </button>
            )}
          </>
        ) : (
          <div className="muted">{ui().navPanel.chooseTarget}</div>
        )}
      </div>

      {!touch && <ThrottleMeter />}
      <label className="nav-warp">
        {ui().navPanel.warpSpeed} {s.warpFactor}
        <input type="range" min={1} max={9} step={1} value={s.warpFactor} onChange={(e) => s.setWarpFactor(Number(e.target.value))} disabled={busy} />
      </label>
      <button className="engage" onClick={engage} disabled={!s.targetId || busy}>
        {pendingWarp ? ui().navPanel.gettingReady : <>{ui().navPanel.warp} <kbd>Enter</kbd></>}
      </button>
      <button className={`secondary nav-auto${s.autopilot ? ' on' : ''}`} onClick={() => s.setAutopilot(!s.autopilot)} disabled={!s.targetId || busy}>
        {ui().navPanel.autopilot} <kbd>G</kbd>
      </button>
      <button className={`secondary nav-observe${observing ? ' on' : ''}`} onClick={toggleObserve} disabled={!s.targetId || busy || racing}>
        {observing ? ui().navPanel.stopObserving : ui().navPanel.observe} <kbd>O</kbd>
      </button>
      <button className={`secondary mission-start${missionPhase !== 'closed' ? ' on' : ''}`} onClick={() => (pick(), missionPhase !== 'active' && closeEclipses(), openMissions())} disabled={racing}>
        {ui().missionsButton}
      </button>
      <button className={`secondary campaign-open mission-start${campaignOn ? ' on' : ''}`} onClick={() => (pick(), closeEclipses(), openCampaign())} disabled={racing || onMission}>
        {campaignOn && campaignStage < CAMPAIGN_STAGES.length ? ui().campaign.navButtonActive(campaignStage + 1, CAMPAIGN_STAGES.length) : ui().campaign.navButton}
      </button>
      <button className="secondary race-start" onClick={startRace} disabled={busy || onMission}>
        {ui().navPanel.race}
      </button>
      <button className={`secondary quiz-start${quizOpen ? ' on' : ''}`} onClick={() => (pick(), closeEclipses(), startQuiz())} disabled={racing}>
        {ui().navPanel.quizRun(QUIZ_LENGTH)}
      </button>
      <button className="secondary eva-start" onClick={() => (pick(), closeEclipses(), startEva())} disabled={busy || racing || s.mode !== 'flight'}>
        {ui().navPanel.spacewalk} <kbd>K</kbd>
      </button>
      <button className="secondary eva-start repair" onClick={() => (pick(), closeEclipses(), startRepairEva())} disabled={busy || racing || s.mode !== 'flight'}>
        {ui().navPanel.spacewalkRepair}
      </button>
      {sf && (
        <button className="secondary walk-start" onClick={() => (pick(), closeEclipses(), startWalkDirect())} disabled={busy || racing || s.mode !== 'flight'}>
          {ui().navPanel.walkPark}
        </button>
      )}
      <button className={`secondary stamp-start${stampsOpen ? ' on' : ''}`} onClick={() => (pick(), openStamps())}>
        {ui().navPanel.stampBook} <span className="muted">{stampCount}/{NATURAL.length}</span>
      </button>
      <button className={`secondary rock-start${rocksOpen ? ' on' : ''}`} onClick={() => (pick(), openRocks())}>
        {ui().navPanel.rockCollection} <span className="muted">{rocksGot}/{ROCK_TOTAL}</span>
      </button>
      <button className={`secondary probe-start${probesOpen ? ' on' : ''}`} onClick={() => (pick(), closeEclipses(), openProbes())} disabled={busy}>
        {ui().navPanel.probeJourneys}
      </button>
      <button className={`secondary eclipse-start${eclipsesOpen ? ' on' : ''}`} onClick={() => (pick(), closeMissions(), openEclipses())} disabled={busy || onMission}>
        {ui().navPanel.eclipsesFromSpace}
      </button>
      {/* 1秒にどれだけ時間が進むか */}
      <div className="nav-time">
        <span className="nav-time-label">{ui().navPanel.timeSpeed}</span>
        {TIME_RATES.map((k) => (
          <button key={k} className={s.timeScale === k ? 'on' : ''} onClick={() => s.setTimeScale(k)} disabled={racing}>
            {rateName(k)}
          </button>
        ))}
      </div>
      <SimDate />
      <ShipSection />
      <Settings racing={racing} />
    </aside>
  )
}
