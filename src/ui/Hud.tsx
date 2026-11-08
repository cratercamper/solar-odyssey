import { useEffect, useState } from 'react'
import { nextCameraMode, useStore } from '../state/store'
import { enterBridge, leaveBridge, useBridge } from '../state/bridge'
import { useCompare } from '../state/compare'
import { bodyInfo, engage, travelFacts } from '../state/flight'
import { RACE_TEXT, raceActive } from '../state/race'
import type { Near } from '../state/proximity'
import { isTelescope, scopeName, TELESCOPE_TEXT } from '../data/telescopes'
import { canOpenGallery, closeGallery, openGallery } from '../state/gallery'
import { isTouchDevice } from '../state/input'
import { launchLander, useLaunchBusy } from '../state/launch'
import { useLang } from '../i18n/lang'
import { landableBody, landed, startLanding } from '../state/landing'
import { useMission } from '../state/mission'
import { toggleObserve } from '../state/observe'
import { canStartEva, evaActive, startEva } from '../state/eva'
import { ui } from '../i18n'

/** 全体のキー操作：M 全体マップ／V 鑑賞モード／Enter ワープ／G 自動航行／C カメラ／1〜9 ワープ速度 */
export function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return
      // 着陸しているあいだは、宇宙の操作を受けつけない
      if (landed() || evaActive()) return
      const s = useStore.getState()
      // 望遠鏡の写真を見ているあいだは、T と Esc（閉じる）だけ
      if (s.scope) {
        if (e.code === 'KeyT' || e.code === 'Escape') s.setScope(null)
        return
      }
      // 鑑賞モードでは、V と Esc（もどる）と M（全体マップ）だけ
      if (s.mode === 'gallery') {
        if (e.code === 'KeyV' || e.code === 'Escape') closeGallery()
        else if (e.code === 'KeyM') s.setMode('map')
        return
      }
      // ブリッジの中では Esc で外の視点へ（マウスを固定しているときの Esc は、固定を外すだけ）
      if (e.code === 'Escape' && s.cameraMode === 'bridge' && s.mode === 'flight' && !document.pointerLockElement) {
        leaveBridge()
        return
      }
      if (e.code === 'KeyV') {
        openGallery()
        return
      }
      if (e.code === 'KeyT') {
        if (s.scopeNear && !raceActive()) openScope(s.scopeNear)
        else if (s.targetId && isTelescope(s.targetId)) s.showToast(TELESCOPE_TEXT.tooFar(scopeName(s.targetId)))
        return
      }
      if (e.code === 'KeyK') {
        if (canStartEva(landed())) startEva()
        return
      }
      if (e.code === 'KeyJ') {
        if (landableBody()) startLanding()
        return
      }
      if (e.code === 'KeyM') s.setMode(s.mode === 'map' ? 'flight' : 'map')
      else if (e.code === 'Enter') engage()
      else if (e.code === 'KeyC') s.setCameraMode(nextCameraMode(s.cameraMode))
      else if (e.code === 'KeyB' && s.mode === 'flight') useCompare.getState().toggle()
      else if (e.code === 'KeyZ' && s.cameraMode === 'bridge') useBridge.getState().setViewscreen(!useBridge.getState().viewscreen)
      else if (e.code === 'KeyO' && s.mode === 'flight') toggleObserve()
      else if (e.code === 'KeyG' && raceActive()) s.showToast(RACE_TEXT.noWarp)
      else if (e.code === 'KeyG' && s.targetId && s.warpPhase === 'idle') s.setAutopilot(!s.autopilot)
      else if (/^Digit[1-9]$/.test(e.code) && s.warpPhase === 'idle') s.setWarpFactor(Number(e.code.slice(5)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** 地表のある星のそばで出る「地表に降りる」ボタン */
function LandPrompt() {
  useLang()
  // 近くの天体・画面・ワープの状態が変わったら選び直す
  useStore((s) => `${s.telemetry.near?.id ?? ''}|${s.telemetry.near?.kind ?? ''}|${s.mode}|${s.warpPhase}|${s.targetId}`)
  // 目標の衛星に近づいたかは、船が動くたびに変わるので、ときどき見直す
  const [, tick] = useState(0)
  useEffect(() => {
    const iv = window.setInterval(() => tick((n) => n + 1), 600)
    return () => window.clearInterval(iv)
  }, [])
  // 任務の画面を開いているあいだは出さない。任務中の帯が下にあるときは、その上に出す
  const missionPhase = useMission((m) => m.phase)
  const [lift, setLift] = useState<number | null>(null)
  useEffect(() => {
    if (missionPhase !== 'active') return setLift(null)
    const bar = document.querySelector('.mission-bar')
    if (!bar) return setLift(null)
    const top = bar.getBoundingClientRect().top
    setLift(Math.round(window.innerHeight - top + 10))
  })
  const id = landableBody()
  if (!id) return null
  if (missionPhase === 'chapters' || missionPhase === 'list' || missionPhase === 'briefing' || missionPhase === 'debrief') return null
  const name = bodyInfo(id)?.name ?? id
  return (
    <button className="land-prompt" style={lift !== null && !isTouchDevice() ? { bottom: Math.max(118, lift) } : undefined} onClick={() => startLanding(id)}>
      {ui().hud.landOn(name)} <kbd>J</kbd>
    </button>
  )
}

/** 望遠鏡の目で深宇宙をのぞく（マウスの固定を外して写真の画面を開く） */
export function openScope(id: NonNullable<ReturnType<typeof useStore.getState>['scope']>) {
  if (document.pointerLockElement) document.exitPointerLock()
  useStore.getState().setScope(id)
}

function usePointerLocked() {
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement !== null)
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])
  return locked
}

function Toast() {
  const toast = useStore((s) => s.toast)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!toast) return
    setVisible(true)
    // 長いお知らせは読み終わるまで長めに出す
    const timer = setTimeout(() => setVisible(false), Math.max(7000, toast.text.length * 110))
    return () => clearTimeout(timer)
  }, [toast])
  if (!toast || !visible) return null
  return (
    <div className="toast" key={toast.id}>
      {toast.text}
    </div>
  )
}

/** 大きな数を「約22万」（英語は「220,000」「1.5 million」）のように読みやすくする */
function roughly(n: number) {
  const big = ui().hud.bigNumber(n)
  if (big !== null) return big
  if (n >= 100) return (Math.round(n / 10) * 10).toLocaleString('en-US')
  return n < 10 ? n.toFixed(1) : Math.round(n) + ''
}

/** 天体のそばでの高さ・雲の中の様子と、大きさくらべ */
function NearReadout({ near }: { near: Near }) {
  const big = near.timesEarth >= 1.5
  const where = near.kind === 'gas' ? ui().hud.aboveClouds : near.kind === 'star' ? ui().hud.aboveStarSurface : ui().hud.aboveGround
  return (
    <div className="near">
      {near.dive ? (
        <div className="near-dive">
          {ui().hud.diveDepth(near.name, roughly(near.dive.km), near.dive.bar.toFixed(1), Math.round(near.dive.celsius))}
        </div>
      ) : (
        near.altitudeKm !== null && (
          <div>{ui().hud.altitude(near.name, where, roughly(near.altitudeKm))}</div>
        )
      )}
      <div className="muted">
        {ui().hud.diameterVsShip(big, roughly(near.timesEarth), roughly(near.timesShip))}
      </div>
      <CompareButton far={near.zoom >= 3} />
      {near.zoom >= 1.5 && (
        <div className="muted near-zoom">
          {ui().hud.closeUpNote(Math.round(near.zoom), near.name)}
        </div>
      )}
    </div>
  )
}

/** 大きさくらべの切り替え。低い軌道からは横に並べた天体が見えにくいので、離れるよう案内する */
function CompareButton({ far }: { far: boolean }) {
  const on = useCompare((s) => s.on)
  const toggle = useCompare((s) => s.toggle)
  return (
    <div className="compare-row">
      <button className={`compare-button${on ? ' on' : ''}`} onClick={toggle}>
        {on ? ui().hud.hideSizeComparison : ui().hud.compareSizes} {!isTouchDevice() && <kbd>B</kbd>}
      </button>
      {on && far && <span className="muted">{ui().hud.backOffHint}</span>}
    </div>
  )
}

/** ワープ中の、本物の光と探査機ならどのくらいかかるか */
function WarpFact({ name, lightMinutes, probeYears }: { name: string; lightMinutes: number; probeYears: number }) {
  const minutes = Math.round(lightMinutes)
  const months = Math.max(1, Math.round(probeYears * 12))
  const years = Math.round(probeYears)
  return (
    <div className="warp-fact">
      {ui().hud.lightTimeNote(name, minutes, probeYears < 1, months, years, months > 1, years > 1)}
      <span className="muted">{ui().hud.warpFictionNote}</span>
    </div>
  )
}

export function Hud() {
  const locked = usePointerLocked()
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const targetId = useStore((s) => s.targetId)
  const warpPhase = useStore((s) => s.warpPhase)
  const cameraMode = useStore((s) => s.cameraMode)
  const shipId = useStore((s) => s.settings.ship)
  const launching = useLaunchBusy()
  const warpFactor = useStore((s) => s.warpFactor)
  const telemetry = useStore((s) => s.telemetry)
  const scopeNear = useStore((s) => s.scopeNear)
  const scope = useStore((s) => s.scope)
  const info = targetId ? bodyInfo(targetId) : null
  const facts = info && info.au > 0 ? travelFacts(info.au) : null
  const touch = isTouchDevice()
  // スマホでは、操作の説明は画面を切り替えたときに少しだけ出す
  const [hint, setHint] = useState(true)
  useEffect(() => {
    if (!touch) return
    setHint(true)
    const timer = setTimeout(() => setHint(false), 8000)
    return () => clearTimeout(timer)
  }, [touch, mode])
  useLang()

  return (
    <>
      <div className="hud">
        <h1>SOLAR ODYSSEY</h1>
        {touch ? (
          <div className={`hud-hint${hint ? '' : ' hidden'}`}>
            {mode === 'map'
              ? ui().hud.mapTouchHint
              : mode === 'gallery'
                ? ui().hud.galleryTouchHint
                : ui().hud.flyTouchHint}
          </div>
        ) : mode === 'map' ? (
          <div>{ui().hud.mapMouseHint}</div>
        ) : mode === 'gallery' ? (
          <div>{ui().hud.galleryMouseHint}</div>
        ) : (
          <div>
            {ui().hud.clickToFly}
            <br />
            {ui().hud.moveKeysHint}
            <br />
            {ui().hud.actionKeysHint}
            <br />
            {ui().hud.thrustKeysHint}
          </div>
        )}
        {mode !== 'gallery' && (
          <div className="muted">
            {ui().hud.speed} {telemetry.speed.toFixed(1)}
          </div>
        )}
        {mode === 'flight' && telemetry.near && <NearReadout near={telemetry.near} />}
      </div>

      {/* スマホ・タブレットでは、画面下のボタン列（TouchDock）にまとめる */}
      {touch ? null : mode === 'gallery' ? (
        <button className="mode-button" onClick={closeGallery}>
          {ui().hud.cockpit} <kbd>V</kbd>
        </button>
      ) : (
        <>
          <button className="mode-button" onClick={() => setMode(mode === 'map' ? 'flight' : 'map')}>
            {mode === 'map' ? ui().hud.cockpit : ui().hud.map} <kbd>M</kbd>
          </button>
          {mode === 'flight' && (cameraMode === 'bridge' ? (
            <button className="bridge-button inside" onClick={leaveBridge}>
              {ui().hud.leaveBridge} <kbd>Esc</kbd>
            </button>
          ) : (
            <button className="bridge-button" onClick={enterBridge} disabled={raceActive()}>
              {ui().hud.enterBridge}
            </button>
          ))}
          {mode === 'flight' && shipId === 'arcadia' && (
            <button className="launch-button" onClick={launchLander} disabled={launching || warpPhase !== 'idle'}>
              {ui().hud.launchLander} <kbd>L</kbd>
            </button>
          )}
          {mode === 'flight' && (
            <button className="gallery-button" onClick={openGallery} disabled={warpPhase !== 'idle' || !canOpenGallery()}>
              {ui().hud.viewShip} <kbd>V</kbd>
            </button>
          )}
        </>
      )}

      {mode === 'flight' && scopeNear && !scope && warpPhase === 'idle' && (
        <button className="scope-prompt" onClick={() => openScope(scopeNear)}>
          {ui().hud.lookThrough(scopeName(scopeNear))} <kbd>T</kbd>
        </button>
      )}

      <LandPrompt />

      {mode === 'flight' && locked && <div className="crosshair" />}
      {/* スマホ・タブレットでは、お知らせは上のアイコン（TouchBar）にためる */}
      {!touch && <Toast />}

      <div id="target-marker">
        <div className="reticle" />
        <div className="arrow">➤</div>
        {info && <div className="marker-label">{info.name}</div>}
      </div>

      {warpPhase !== 'idle' && info && (
        <div className={`warp-banner ${warpPhase}`}>
          <div className="warp-title">{ui().hud.warpFactor(warpFactor)}</div>
          <div className="warp-dest">{ui().hud.destination(info.name)}</div>
          {facts && <WarpFact name={info.name} lightMinutes={facts.lightMinutes} probeYears={facts.probeYears} />}
        </div>
      )}
    </>
  )
}
