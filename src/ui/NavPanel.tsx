import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { PLANETS } from '../data/bodies'
import { TIME_RATES } from '../data/scale'
import { useStore, type ThrustFxLevel } from '../state/store'
import { bodyInfo, engage, travelFacts, useWarpPrep } from '../state/flight'
import { SF_OBJECTS, setWorld } from '../data/sf'
import { HUBBLE_ID, scopeName, WEBB_ID } from '../data/telescopes'
import { useRace } from '../state/race'
import { sim } from '../state/registry'
import { formatDate, simDate, SIM_SECONDS_PER_HOUR } from '../data/ephemeris'
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
import { SaveDataPanel } from './SaveDataPanel'
import { NAV_TABS, navEntries, openNavTab, useNavTab, type NavTab } from './nav/registry'
import { NavEntryButton } from './nav/NavEntryButton'

// 入口の登録（ui/nav/entries/*.ts）をまとめて読み込む
import.meta.glob('./nav/entries/*.ts', { eager: true })

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

/** 目標の名前・距離・航海日誌（距離は毎フレーム変わるので、ここだけ描き直す） */
function TargetBox({ touch }: { touch: boolean }) {
  const targetId = useStore((s) => s.targetId)
  const distance = useStore((s) => s.telemetry.distance)
  const logOpen = useStore((s) => s.logOpen)
  const setLogOpen = useStore((s) => s.setLogOpen)
  const setSheet = useTouchUI((u) => u.setSheet)
  const info = targetId ? bodyInfo(targetId) : null
  const facts = info && info.au > 0 ? travelFacts(info.au) : null
  return (
    <div className="nav-target">
      {info ? (
        <>
          <div className="nav-target-name">
            {ui().navPanel.target}
            {info.name}
            {info.parent && <span className="muted">{ui().navPanel.moonOf(info.parent)}</span>}
          </div>
          <div className="muted">
            {ui().navPanel.distance} {fmtDistance(distance)}
          </div>
          {facts && <div className="muted">{ui().navPanel.lightMinutes(Math.round(facts.lightMinutes))}</div>}
          {!logOpen && (
            <button className="nav-log" onClick={() => (setLogOpen(true), touch && setSheet('log'))}>
              {ui().navPanel.openShipsLog} <kbd>I</kbd>
            </button>
          )}
        </>
      ) : (
        <div className="muted">{ui().navPanel.chooseTarget}</div>
      )}
    </div>
  )
}

/** 行く・見る・遊ぶ・学ぶ のタブ */
function NavTabs() {
  useLang()
  const tab = useNavTab((t) => t.tab)
  return (
    <div className="nav-tabs" role="tablist" aria-label={ui().navPanel.tabsLabel}>
      {NAV_TABS.map((t) => (
        <button key={t} role="tab" aria-selected={tab === t} className={`nav-tab${tab === t ? ' on' : ''}`} data-tab={t} onClick={() => openNavTab(t)}>
          {ui().navPanel.tabs[t]}
        </button>
      ))}
    </div>
  )
}

/** そのタブの入口のボタン（ui/nav/entries/ の登録表から） */
function Entries({ tab, sf, onPick }: { tab: NavTab; sf: boolean; onPick: () => void }) {
  return (
    <>
      {navEntries(tab, sf ? 'sf' : 'real').map((e) => (
        <NavEntryButton key={e.id} entry={e} onPick={onPick} />
      ))}
    </>
  )
}

export function NavPanel() {
  const [open, setOpen] = useState<string | null>('saturn')
  // スマホ・タブレットでは、画面下のボタンから引き出す。小さい画面では、ふだんは目標とワープだけの小さな形にたたんでおく
  const touch = isTouchDevice()
  const small = useSmallScreen() || touch
  const [localExpanded, setLocalExpanded] = useState(false)
  const sheet = useTouchUI((u) => u.sheet)
  const setSheet = useTouchUI((u) => u.setSheet)
  const expanded = touch ? sheet === 'nav' : localExpanded
  const setExpanded = (on: boolean) => (touch ? setSheet(on ? 'nav' : null) : setLocalExpanded(on))
  const collapsed = small && !expanded
  const pick = () => small && setExpanded(false)
  // 毎フレーム変わる値（距離など）はここで読まない（TargetBox が読む）。パネル全体を毎フレーム描き直さないように
  const s = useStore(
    useShallow((st) => ({
      mode: st.mode,
      targetId: st.targetId,
      warpFactor: st.warpFactor,
      setWarpFactor: st.setWarpFactor,
      warpPhase: st.warpPhase,
      autopilot: st.autopilot,
      setAutopilot: st.setAutopilot,
      timeScale: st.timeScale,
      setTimeScale: st.setTimeScale,
      world: st.settings.world,
    })),
  )
  const racePhase = useRace((r) => r.phase)
  const racing = racePhase === 'countdown' || racePhase === 'running'
  const busy = s.warpPhase !== 'idle' || racing
  const pendingWarp = useWarpPrep((w) => w.pending)
  const observing = useObserve((o) => o.id !== null)
  const chosenTab = useNavTab((t) => t.tab)
  const lang = useLang()
  if (s.mode === 'gallery') return null
  const sf = s.world === 'sf'
  // たたんだ小さな形では、いつも「行く」（目標とワープ）
  const tab: NavTab = collapsed ? 'go' : chosenTab
  const other = (
    <>
      <button className="nav-lang" onClick={() => setLang(lang === 'en' ? 'ja' : 'en')} lang={lang === 'en' ? 'ja' : 'en'} title={ui().navPanel.switchLanguage}>
        {lang === 'en' ? '日本語' : 'English'}
      </button>
      {/* 本物の太陽系だけか、架空の船や構造物も出す SF モードか。パソコンでは画面上の切り替え（SFBadge）、スマホではアイコン列にあるので、タッチでない小さい画面だけ */}
      {small && !touch && (
        <span className="nav-world" role="group" aria-label={ui().navPanel.world}>
          <button className={sf ? '' : 'on'} onClick={() => setWorld('real')} disabled={racing} title={ui().navPanel.realWorldTip}>
            {ui().navPanel.real}
          </button>
          <button className={sf ? 'on sf' : 'sf'} onClick={() => setWorld('sf')} disabled={racing} title={ui().navPanel.sfWorldTip}>
            SF
          </button>
        </span>
      )}
    </>
  )

  return (
    <aside className={`nav-panel nav-tab-${tab}${collapsed ? ' collapsed' : ''}`}>
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
      {!collapsed && <NavTabs />}
      {!collapsed && <div className="nav-tab-note muted small">{ui().navPanel.tabNotes[tab]}</div>}

      {tab === 'go' && (
        <>
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

          <TargetBox touch={touch} />

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
          <Entries tab="go" sf={sf} onPick={pick} />
        </>
      )}

      {tab === 'see' && (
        <>
          <div className="nav-target muted small">{s.targetId ? <>{ui().navPanel.target}{bodyInfo(s.targetId)?.name}</> : ui().navPanel.noTarget}</div>
          <button className={`secondary nav-observe${observing ? ' on' : ''}`} onClick={() => (pick(), toggleObserve())} disabled={!s.targetId || busy || racing}>
            {observing ? ui().navPanel.stopObserving : ui().navPanel.observe} <kbd>O</kbd>
          </button>
          <Entries tab="see" sf={sf} onPick={pick} />
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
        </>
      )}

      {tab === 'play' && <Entries tab="play" sf={sf} onPick={pick} />}
      {tab === 'learn' && <Entries tab="learn" sf={sf} onPick={pick} />}

      {/* 設定とセーブは、どのタブでも一番下に */}
      <Settings racing={racing} />
      <SaveDataPanel />
    </aside>
  )
}
