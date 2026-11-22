import { useEffect, useState } from 'react'
import { useLang } from '../../i18n/lang'
import { COUNT_SEC, RALLY_COLORS, RALLY_LEVELS, loadBest, pickRallyTrack, quitRally, rallyNow, setRallyAuto, setRallyColor, setRallyLevel, startRally, useRally, useRallyTrack } from '../../state/rally'
import { medalIcon, nextMedal, useRallyMedals, type Medal } from '../../state/rallyMedals'
import { openRocks } from '../../state/rockBook'
import './rallyFinish.css'
import { releaseRoverMouse, roverInput } from '../../state/rover'
import { TRACKS, siteOfTrack, tracksAt } from '../../data/rallyTracks'
import { useLanding } from '../../state/landing'
import { RallyHiscore } from './RallyHiscore'
import { ui } from '../../i18n'

// 峡谷レースの画面の表示：色えらびとスタート、3・2・1、タイム・順位・次の門、門の区間タイム、結果。

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`
}

const colorName = (i: number) => ui().rallyColors[RALLY_COLORS[i].id].color
/** コンピューターが運転するときの名前 */
const driverName = (i: number) => ui().rallyColors[RALLY_COLORS[i].id].name

/** スタート前のカード：色をえらぶ・自己ベスト・スタート */
export function RallyStart({ track, compact = false }: { track: string; compact?: boolean }) {
  useLang()
  const color = useRally((r) => r.color)
  const best = loadBest()
  const site = siteOfTrack(track)
  const courses = tracksAt(site)
  return (
    <div className={`rally-start${compact ? ' compact' : ''}`}>
      <div className="rally-title">🏁 {ui().rallyTracks[track].title}</div>
      {courses.length > 1 && (
        <div className="rally-levels" role="radiogroup" aria-label={ui().rallyPanel.course}>
          {courses.map((id) => (
            <button key={id} role="radio" aria-checked={id === track} className={id === track ? 'on' : ''} onClick={() => pickRallyTrack(site, id)}>
              {TRACKS[id].level === 'hard' ? ui().rallyPanel.levelHard : ui().rallyPanel.levelEasy}
            </button>
          ))}
        </div>
      )}
      {!compact && (
        <p>
          {ui().rallyTracks[track].intro}
        </p>
      )}
      <RallyOptions compact={compact} />
      <div className="rally-colors" role="radiogroup" aria-label={ui().rallyPanel.roverColour}>
        {RALLY_COLORS.map((c, i) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={i === color}
            className={i === color ? 'on' : ''}
            style={{ ['--c' as string]: c.hex }}
            onClick={() => setRallyColor(i)}
            title={colorName(i)}
          >
            <span className="dot" />
            <span className="nm">{colorName(i)}</span>
          </button>
        ))}
      </div>
      {!compact && <MedalTargets track={track} />}
      {!compact && <RallyHiscore track={track} top={3} />}
      <div className="rally-row">
        {best && <span className="rally-best">{ui().rallyPanel.best} {fmtTime(best.time)}</span>}
        <button className="primary rally-go" onClick={startRally}>
          {ui().rallyPanel.start}
        </button>
      </div>
    </div>
  )
}

const medalName = (m: Medal) => (m === 1 ? ui().rallyPanel.gold : m === 2 ? ui().rallyPanel.silver : ui().rallyPanel.bronze)

/** コンピューターの強さと、自動アクセル（スタート前に選ぶ） */
function RallyOptions({ compact }: { compact: boolean }) {
  const level = useRally((r) => r.level)
  const auto = useRally((r) => r.auto)
  const levelText = { easy: ui().rallyPanel.aiEasy, normal: ui().rallyPanel.aiNormal, hard: ui().rallyPanel.aiHard }
  if (compact) {
    // 運転中の小さな欄：押すたびに やさしい → ふつう → つよい
    const next = RALLY_LEVELS[(RALLY_LEVELS.indexOf(level) + 1) % RALLY_LEVELS.length]
    return (
      <button className="rally-ai-cycle" onClick={() => setRallyLevel(next)} title={ui().rallyPanel.aiLevel}>
        {ui().rallyPanel.aiShort(levelText[level])}
      </button>
    )
  }
  return (
    <div className="rally-options">
      <div className="rally-levels rally-ai" role="radiogroup" aria-label={ui().rallyPanel.aiLevel} title={ui().rallyPanel.aiLevel}>
        <span className="rally-opt-k">{ui().rallyPanel.aiLevel}</span>
        {RALLY_LEVELS.map((lv) => (
          <button key={lv} role="radio" aria-checked={lv === level} className={lv === level ? 'on' : ''} onClick={() => setRallyLevel(lv)}>
            {levelText[lv]}
          </button>
        ))}
      </div>
      <AutoGas auto={auto} />
      {level === 'easy' && <p className="rally-opt-note">{ui().rallyPanel.aiEasyNote}</p>}
    </div>
  )
}

/** 自動アクセルの入・切 */
function AutoGas({ auto }: { auto: boolean }) {
  return (
    <button className={`rally-auto${auto ? ' on' : ''}`} role="switch" aria-checked={auto} onClick={() => setRallyAuto(!auto)} title={ui().rallyPanel.autoGasTip}>
      {auto ? '▲ ' : ''}
      {ui().rallyPanel.autoGas(auto)}
    </button>
  )
}

/** メダルのタイム（追いかけっこは、つかまえる数）と、自分の今のメダル */
function MedalTargets({ track }: { track: string }) {
  const mine = useRallyMedals((m) => m.medals[track]?.medal ?? null)
  const tr = TRACKS[track]
  const goal = (m: Medal) => (tr.chase ? ui().rallyPanel.caughtGoal(4 - m) : tr.medals ? fmtTime(tr.medals[m - 1]) : '')
  return (
    <div className="rally-medals" aria-label={ui().rallyPanel.medals}>
      {([1, 2, 3] as Medal[]).map((m) => (
        <span key={m} className={`rm${mine !== null && mine <= m ? ' got' : ''}`} title={medalName(m)}>
          {medalIcon(m)} {goal(m)}
        </span>
      ))}
      {mine !== null && <span className="rm-mine">{ui().rallyPanel.yourMedal(medalName(mine))}</span>}
    </div>
  )
}

/** 結果のカード：取ったメダル、次のメダルまで、ごほうびの岩 */
function MedalResult({ track, time, caught, medal, fresh, rock }: { track: string; time: number; caught?: number; medal: Medal | null; fresh: boolean; rock: string | null }) {
  const next = nextMedal(track, time, caught)
  const chase = !!TRACKS[track]?.chase
  return (
    <div className="rally-medal-result">
      {medal !== null ? (
        <div className={`rmr-got m${medal}`}>
          <span className="rmr-icon">{medalIcon(medal)}</span>
          {fresh ? ui().rallyPanel.newMedal(medalName(medal)) : ui().rallyPanel.gotMedal(medalName(medal))}
        </div>
      ) : (
        <div className="rmr-none">{ui().rallyPanel.noMedal}</div>
      )}
      {next && <div className="muted rmr-next">{chase ? ui().rallyPanel.nextMedalCaught(medalName(next.medal), next.need) : ui().rallyPanel.nextMedalTime(medalName(next.medal), next.need.toFixed(1))}</div>}
      {rock && (
        <button className="rmr-rock" onClick={openRocks}>
          ◆ {ui().rallyPanel.rewardRock(ui().rockSamples[rock].name)} <span className="sample-book">{ui().rallyPanel.openBook} ▸</span>
        </button>
      )}
    </div>
  )
}

/** レース中の表示 */
export function RallyPanel() {
  useLang()
  const phase = useRally((r) => r.phase)
  const since = useRally((r) => r.since)
  const time = useRally((r) => r.time)
  const place = useRally((r) => r.place)
  const gate = useRally((r) => r.gate)
  const gates = useRally((r) => r.gates)
  const toGate = useRally((r) => r.toGate)
  const split = useRally((r) => r.split)
  const lost = useRally((r) => r.lost)
  const result = useRally((r) => r.result)
  const color = useRally((r) => r.color)
  const chase = useRally((r) => r.chase)
  const auto = useRally((r) => r.auto)
  const track = useRallyTrack(useLanding((l) => l.site))
  const isChase = !!(track && TRACKS[track]?.chase)
  // 結果のカードで R を押すと、もう一度（「もう一度」のボタンと同じ）。ゴールから 0.5 秒は効かない：
  // ゴールの直前に押した R（直前の門へ）で、すぐに走り直さないように
  useEffect(() => {
    if (phase !== 'done') return
    // 結果のカードのボタンを押せるように、マウスの固定をはずす
    releaseRoverMouse()
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'KeyR' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (rallyNow() - useRally.getState().since < 0.5) return
      e.preventDefault()
      roverInput.reset = false
      startRally()
    }
    window.addEventListener('keydown', down, true)
    return () => window.removeEventListener('keydown', down, true)
  }, [phase])
  // 3・2・1 の数字を変えるため、数え中だけ画面を書き換える
  const [, tick] = useState(0)
  useEffect(() => {
    if (phase !== 'count' && phase !== 'run') return
    const id = window.setInterval(() => tick((n) => n + 1), 100)
    return () => window.clearInterval(id)
  }, [phase])
  if (phase === 'off') return null
  const now = rallyNow()
  const left = COUNT_SEC - (now - since)
  const showGo = phase === 'run' && now - since < 1.2
  const showSplit = split && now - split.at < 2.5
  return (
    <div className="rally-ui">
      {phase === 'deploy' && <div className="rally-banner">{ui().rallyPanel.preparingRover}</div>}
      {phase === 'count' && left > 0 && (
        <div className="rally-count" key={Math.ceil(left)}>
          {left > COUNT_SEC - 0.6 ? ui().rallyPanel.onYourMarks : Math.ceil(Math.min(3, left))}
        </div>
      )}
      {showGo && <div className="rally-count go">GO!</div>}
      {(phase === 'run' || phase === 'count') && (
        <div className="rally-hud" style={{ ['--c' as string]: RALLY_COLORS[color].hex }}>
          <span className="rally-time">{fmtTime(time)}</span>
          {isChase ? (
            <span className="rally-place" title={ui().rallyPanel.roversCaught}>
              {ui().rallyPanel.caughtPrefix}
              <b>{chase?.caught.length ?? 0}</b>
              <small>/3</small>
            </span>
          ) : (
            <span className="rally-place">
              <b>{place}</b>
              {ui().rallyPanel.placeSuffix}
              <small>/4</small>
            </span>
          )}
          <span className="rally-gate">
            {gate >= gates ? ui().rallyPanel.finish : gate === gates - 1 ? ui().rallyPanel.nextFinish : ui().rallyPanel.gateOfGates(gate + 1, gates)}
            {toGate && (
              <>
                <span className="rally-arrow" style={{ transform: `rotate(${toGate.rel}deg)` }}>
                  ▲
                </span>
                {toGate.dist} m
              </>
            )}
          </span>
        </div>
      )}
      {phase === 'run' && showSplit && split && (
        <div className={`rally-split${split.diff === null ? '' : split.diff <= 0 ? ' faster' : ' slower'}`}>
          {split.gate >= gates ? ui().rallyPanel.finishSplit : ui().rallyPanel.gateSplit(split.gate)} {fmtTime(split.time)}
          {split.diff !== null && <b>{(split.diff <= 0 ? '−' : '+') + Math.abs(split.diff).toFixed(1)}</b>}
        </div>
      )}
      {phase === 'run' && chase && chase.last >= 0 && now - chase.at < 2.5 && (
        <div className="rally-count chase-caught" style={{ ['--c' as string]: RALLY_COLORS[chase.last].hex }}>
          {ui().rallyPanel.caughtRover(driverName(chase.last))}
        </div>
      )}
      {phase === 'run' && lost && (
        <div className="rover-edge">
          {ui().rallyPanel.missedGate}
          <small>{ui().rallyPanel.missedGateHint}</small>
        </div>
      )}
      {phase === 'done' && result && (
        <div className="rally-result">
          <div className="rally-title">
            {isChase
              ? (chase?.caught.length ?? 0) === 3
                ? ui().rallyPanel.caughtAll
                : ui().rallyPanel.caughtSome(chase?.caught.length ?? 0)
              : result.place === 1
                ? ui().rallyPanel.youWon
                : ui().rallyPanel.finishedPlace(result.place)}
          </div>
          <div className="rally-big">{fmtTime(result.time)}</div>
          {track && <MedalResult track={track} time={result.time} caught={isChase ? (chase?.caught.length ?? 0) : undefined} medal={result.medal} fresh={result.newMedal} rock={result.rock} />}
          {result.newBest ? <div className="rally-new">{ui().rallyPanel.newPersonalBest}</div> : <div className="muted">{ui().rallyPanel.bestTime(fmtTime(result.best))}</div>}
          {isChase ? (
            <ul className="rally-chase-result">
              {result.order
                .filter((e) => !e.you)
                .map((e) => {
                  const got = chase?.caught.includes(e.color)
                  return (
                    <li key={e.color} className={got ? 'got' : ''} style={{ ['--c' as string]: RALLY_COLORS[e.color].hex }}>
                      <span className="dot" />
                      {driverName(e.color)}
                      <span className="t">{got ? ui().rallyPanel.caught : ui().rallyPanel.gotAway}</span>
                    </li>
                  )
                })}
            </ul>
          ) : (
          <ol>
            {result.order.map((e, i) => (
              <li key={e.color} className={e.you ? 'you' : ''} style={{ ['--c' as string]: RALLY_COLORS[e.color].hex }}>
                <span className="n">{i + 1}.</span>
                <span className="dot" />
                {e.you ? ui().rallyPanel.you : driverName(e.color)}
                <span className="t">{e.time !== null ? fmtTime(e.time) : '—'}</span>
              </li>
            ))}
          </ol>
          )}
          {track && <RallyHiscore track={track} top={10} mark={result.at} />}
          <div className="rally-row">
            <button className="secondary" onClick={quitRally}>
              {ui().rallyPanel.freeDrive}
            </button>
            <button className="primary" onClick={startRally}>
              {ui().rallyPanel.raceAgain} <kbd>R</kbd>
            </button>
          </div>
        </div>
      )}
      {(phase === 'run' || phase === 'count') && (
        <div className="rally-actions">
          <button className="secondary" disabled={phase !== 'run'} onClick={() => (roverInput.reset = true)} title={ui().rallyPanel.backToLastGate}>
            ↺ {ui().rallyPanel.back} <kbd>R</kbd>
          </button>
          <AutoGas auto={auto} />
          <button className="secondary" onClick={quitRally}>
            {ui().rallyPanel.quitRace}
          </button>
        </div>
      )}
    </div>
  )
}
