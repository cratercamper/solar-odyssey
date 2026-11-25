import { useEffect, useState } from 'react'
import { ui } from '../i18n'
import { useLang } from '../i18n/lang'
import { CAMPAIGN_STAGES } from '../data/campaign'
import { aimAtGoal, closeCampaignCard, closeCampaignScreen, currentGoal, goalLine, resetCampaign, startCampaign, startFree, useCampaign } from '../state/campaign'
import { useStore } from '../state/store'
import { landableBody, startLanding, startTakeoff, useLanding } from '../state/landing'
import { launchRover, useRover } from '../state/rover'
import { engage } from '../state/flight'
import { useRally } from '../state/rally'

// キャンペーン「博士の探査隊」の画面：はじめの画面（キャンペーンを大きく、自由探検をその下に）、
// 目標の札（画面の上）、ミナセ博士のメッセージのカード。

/** 読み込みの画面が消えたか */
function useBooted() {
  const [booted, setBooted] = useState(() => !document.getElementById('boot'))
  useEffect(() => {
    if (booted) return
    const id = window.setInterval(() => {
      if (!document.getElementById('boot')) setBooted(true)
    }, 300)
    return () => window.clearInterval(id)
  }, [booted])
  return booted
}

export function Campaign() {
  useLang()
  const lang = useStore((s) => s.settings.lang)
  const picking = useCampaign((c) => c.picking)
  const booted = useBooted()
  if (lang === null || !booted) return null
  return (
    <>
      {picking && <StartScreen />}
      <ProfessorCard />
      <GoalTag />
    </>
  )
}

/** キャンペーンの画面（航法コンピュータのボタンから開く）：はじめる・つづきから。下に閉じる／やめる */
function StartScreen() {
  const stage = useCampaign((c) => c.stage)
  const active = useCampaign((c) => c.active)
  const t = ui().campaign
  const max = CAMPAIGN_STAGES.length
  const fresh = stage === 0 && Object.keys(useCampaign.getState().counts).length === 0
  const done = stage >= max
  return (
    <div className="campaign-start" role="dialog" aria-modal="true" aria-label={t.title} onClick={(e) => e.target === e.currentTarget && closeCampaignScreen()}>
      <div className="cs-card">
        <div className="cs-kicker">CAMPAIGN</div>
        <h1>{t.title}</h1>
        <p>{t.tagline}</p>
        <button className="primary cs-go" onClick={done ? resetCampaign : startCampaign} autoFocus>
          {fresh ? t.start : done ? t.cleared : t.resume(stage + 1, max)}
        </button>
        {!fresh && !done && (
          <button className="cs-restart" onClick={resetCampaign}>
            {t.restart}
          </button>
        )}
        <div className="cs-free">
          <button className="secondary" onClick={active ? startFree : closeCampaignScreen}>
            {active ? t.free : t.close}
          </button>
        </div>
      </div>
    </div>
  )
}

/** ミナセ博士のカード（章のはじまり・クリア・第1部の終わり） */
function ProfessorCard() {
  const card = useCampaign((c) => c.card)
  if (!card) return null
  const t = ui().campaign
  const st = CAMPAIGN_STAGES[card.stage]
  const text = card.kind === 'end' || !st ? t.end : t.stages[st.id as keyof typeof t.stages][card.kind === 'done' ? 'done' : 'intro']
  const title = card.kind === 'end' || !st ? t.endTitle : t.stages[st.id as keyof typeof t.stages].chapter
  return (
    <div className="campaign-card" role="dialog" aria-label={t.professor}>
      <div className="cc-face" aria-hidden="true">
        🧑‍🔬
      </div>
      <div className="cc-body">
        <div className="cc-head">
          <span className="cc-name">{t.professor}</span>
          <span className="cc-chapter">{title}</span>
        </div>
        <p>{text}</p>
        {card.kind === 'intro' && st && (
          <div className="cc-goals">
            {st.goals.map((g) => (
              <div key={g.body}>🎯 {goalLine(g.body, g.count)}</div>
            ))}
            <small>{t.howTo}</small>
          </div>
        )}
        <div className="cc-row">
          {card.kind === 'end' && (
            <button className="secondary" onClick={startFree}>
              {t.quit}
            </button>
          )}
          <button className="primary" onClick={closeCampaignCard} autoFocus>
            {card.kind === 'done' ? t.next : t.ok}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 集中モードの次の一歩：ことばと、それをするボタン（なければ null） */
type Step = { text: string; label?: string; run?: () => void }

function nextStep(): Step | null {
  const t = ui().campaign
  const goal = currentGoal()
  const name = (id: string) => ui().bodies[id]?.name ?? id
  const l = useLanding.getState()
  if (l.phase === 'surface') {
    if (!goal || l.bodyId !== goal.body) return { text: goal ? t.stepTakeOff(name(goal.body)) : t.stepLeave, label: t.doTakeOff, run: startTakeoff }
    if (useRover.getState().phase === 'none') return { text: t.stepRover, label: t.doRover, run: () => launchRover() }
    return { text: t.stepCollect }
  }
  if (l.phase !== 'idle' || !goal) return null
  const s = useStore.getState()
  if (s.warpPhase !== 'idle') return { text: t.stepWarping(name(goal.body)) }
  if (landableBody() === goal.body) return { text: t.stepLand(name(goal.body)), label: t.doLand, run: () => startLanding(goal.body) }
  const aim = () => {
    if (useStore.getState().targetId !== goal.body) useStore.getState().setTarget(goal.body)
  }
  if (s.telemetry.near?.id === goal.body)
    return {
      text: t.stepApproach(name(goal.body)),
      label: t.doApproach,
      run: () => {
        aim()
        useStore.getState().setAutopilot(true)
      },
    }
  return {
    text: t.stepWarp(name(goal.body)),
    label: t.doWarp,
    run: () => {
      aim()
      engage()
    },
  }
}

/**
 * 画面の上の目標の札：何を、あといくつ。
 * 集中モード（キャンペーン中のふだん。cratercamper さんの案 2026-11-23）では、次にすることを一つだけと、それをするボタンを出し、
 * ほかのメニューや表示はかくす（body.campaign-focus。styles/campaign.css）。「メニューを全部出す」でいつもの画面にもどせる
 */
function GoalTag() {
  const active = useCampaign((c) => c.active)
  const focus = useCampaign((c) => c.focus)
  const stage = useCampaign((c) => c.stage)
  const counts = useCampaign((c) => c.counts)
  const card = useCampaign((c) => c.card)
  const target = useStore((s) => s.targetId)
  const landed = useLanding((l) => l.phase !== 'idle')
  const racing = useRally((r) => r.phase !== 'off')
  // 次の一歩は、船の位置・ワープ・ローバーで変わるので、ときどき見直す
  const [, tick] = useState(0)
  useEffect(() => {
    if (!active || !focus) return
    const iv = window.setInterval(() => tick((n) => n + 1), 500)
    return () => window.clearInterval(iv)
  }, [active, focus])
  const on = active && focus && !racing
  useEffect(() => {
    document.body.classList.toggle('campaign-focus', on)
    return () => document.body.classList.remove('campaign-focus')
  }, [on])
  const st = CAMPAIGN_STAGES[stage]
  if (!active || !st || card || racing) return null
  const t = ui().campaign
  const left = st.goals.find((g) => (counts[g.body] ?? 0) < g.count)
  const aimed = !left || target === left.body
  const step = focus ? nextStep() : null
  return (
    <div className={`campaign-goal${focus ? ' focus' : ''}`}>
      <div className="cg-row">
        <span className="cg-label">🎯 {t.goalLabel}</span>
        {st.goals.map((g) => {
          const have = Math.min(g.count, counts[g.body] ?? 0)
          return (
            <span key={g.body} className={`cg-item${have >= g.count ? ' done' : ''}`}>
              {t.goalShort(ui().bodies[g.body]?.name ?? g.body)} <b>{t.progress(have, g.count)}</b>
            </span>
          )
        })}
        {!focus && !aimed && !landed && (
          <button className="secondary cg-go" onClick={aimAtGoal}>
            {t.goTo}
          </button>
        )}
        <button className="cg-menus" onClick={() => useCampaign.setState({ focus: !focus })}>
          {focus ? t.allMenus : t.focusMenus}
        </button>
      </div>
      {step && (
        <div className="cg-step">
          <span className="cg-next">{t.nextStep}</span>
          <span className="cg-text">{step.text}</span>
          {step.run && (
            <button className="primary cg-do" onClick={step.run}>
              {step.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
