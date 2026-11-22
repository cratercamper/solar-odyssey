import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { QUALITY, SCALE_STEPS, currentLevel, looksIntegrated, lowMemory, registerSwitcher, stepDown, stepUp, useQuality, wantedLevel, type Level } from '../state/quality'
import { useStore } from '../state/store'
import { useProgress } from '@react-three/drei'
import { warpPrepDone } from '../state/flight'

/** FPS を測る区切り（秒） */
const WINDOW = 2
/** これより遅い区切りが2回続いたら一段下げる */
const SLOW_FPS = 30
/** これより速い区切りが4回続いたら一段上げる */
const FAST_FPS = 56
/** シェーダーの用意を待つ上限（秒）。これを過ぎたら、残りはその場で作らせて切り替える */
const PREPARE_LIMIT = 10
/** 画質を切り替えた直後は、残りのシェーダー作りなどで遅くなるので FPS を数えない（秒） */
const SETTLE = 3

/** 後処理（PostFx）を通して描く画質か。通すときは、場面を画面ではなく描画先（テクスチャ）に描くので、材質のシェーダーも別物になる */
export function drawsThroughPostFx(level: Level) {
  const fx = useStore.getState().settings.fx
  return QUALITY[level].bloom && (fx.bloom || fx.ao || fx.film)
}

/**
 * その画質で使う材質のシェーダーを、描画を止めずに裏で用意する（KHR_parallel_shader_compile）。
 * 用意せずに切り替えると、最初のコマで全部の材質のシェーダーをその場で作るため、弱い GPU では何秒も描けなくなる
 */
function prepare(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, level: Level, target: THREE.WebGLRenderTarget) {
  const prev = gl.getRenderTarget()
  let done: Promise<unknown>
  try {
    // シェーダーの種類は「画面に描くか、描画先に描くか」で決まる（トーンマッピング・色空間）。中身の大きさは関係ない
    gl.setRenderTarget(drawsThroughPostFx(level) ? target : null)
    done = gl.compileAsync(scene, camera)
  } catch {
    done = Promise.resolve()
  } finally {
    gl.setRenderTarget(prev)
  }
  return Promise.race([done, new Promise((r) => setTimeout(r, PREPARE_LIMIT * 1000))])
}

/** 見えている物の材質が使うテクスチャ（描き込み先のテクスチャは除く） */
function sceneTextures(scene: THREE.Scene) {
  const found = new Set<THREE.Texture>()
  const add = (v: unknown) => {
    const t = v as (THREE.Texture & { isRenderTargetTexture?: boolean }) | null
    if (t?.isTexture && !t.isRenderTargetTexture && t.image) found.add(t)
  }
  scene.traverseVisible((o) => {
    const mesh = o as THREE.Mesh
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
    for (const m of mats) {
      for (const v of Object.values(m)) add(v)
      const u = (m as THREE.ShaderMaterial).uniforms
      if (u) for (const k in u) add(u[k]?.value)
    }
  })
  return found
}

/** 読み込みがこの秒数止まっていたら、落ち着いたとみなす */
const LOAD_QUIET = 1
/** ワープの準備をいつまでも待たない（秒） */
const PREP_GIVE_UP = 20

/** スマホで GPU に載せるテクスチャの最大の辺（ピクセル） */
const PHONE_MAX_TEXTURE = 1024

/** まだ GPU に載せていないテクスチャを探す間隔（秒）。何も見つからなければ、間隔を倍にしていく（最大 UPLOAD_SCAN_MAX） */
const UPLOAD_SCAN = 4
const UPLOAD_SCAN_MAX = 32

/**
 * FPS を測り、画質が「自動」なら描画が追いつくところまで下げる（余裕があれば戻す）。
 * 画質の切り替え（自動・手動とも）は、新しい画質のシェーダーを裏で用意し終えてから行う
 */
export function QualityGovernor() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const m = useRef({ frames: 0, time: 0, slow: 0, fast: 0, lastDown: -Infinity, settleUntil: 0, tooSlow: new Set<Level>(), tooSlowScale: new Set<number>() })
  const job = useRef({ busy: false, warmed: false, scanAt: 0, scanEvery: UPLOAD_SCAN, soon: false, uploads: [] as THREE.Texture[], prep: 'load' as 'load' | 'compile' | 'upload' | 'done', quietSince: -1 })
  // 後処理を通すときのシェーダーを用意するための、形だけの描画先
  const target = useMemo(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }), [])
  useEffect(() => () => target.dispose(), [target])

  useEffect(() => registerSwitcher(), [])

  // 船・世界（実在/SF）・場面が変わると新しいテクスチャが増えるので、探す間隔を短く戻す
  useEffect(
    () =>
      useStore.subscribe((st, prev) => {
        if (st.mode === prev.mode && st.settings.world === prev.settings.world && st.settings.ship === prev.settings.ship && st.targetId === prev.targetId) return
        job.current.soon = true
      }),
    [],
  )

  useEffect(() => {
    // 内蔵 GPU やスマホは、はじめから「標準」で（まだ何も描いていないので、そのまま切り替える）
    const ctx = gl.getContext()
    const info = ctx.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER))
    const touch = matchMedia('(pointer: coarse)').matches
    // スマホは、GPU に載せるテクスチャを 1024 ピクセルまでに縮める（three.js が載せるときに縮める）。
    // 2K の惑星や 4K の船体の模様をそのまま載せると 350MB を超え、ワープのあとに視点を回して
    // 新しいテクスチャが載った瞬間などに、Safari がページごと落として最初から読み込み直してしまう。
    // スマホの画面では 1024 でもほぼ画素と同じ細かさなので、見た目はほとんど変わらない
    if (lowMemory()) gl.capabilities.maxTextureSize = Math.min(gl.capabilities.maxTextureSize, PHONE_MAX_TEXTURE)
    if (looksIntegrated(renderer) || touch) {
      useQuality.getState().setAuto('medium')
      if (useStore.getState().settings.quality === 'auto') useQuality.setState({ level: 'medium' })
    }
    // GPU が描ききれずに画面を失ったら、戻ったときにいちばん軽くする
    const lost = () => {
      useQuality.getState().setAuto('low')
      m.current.tooSlow.add('medium').add('high')
    }
    gl.domElement.addEventListener('webglcontextlost', lost)
    return () => gl.domElement.removeEventListener('webglcontextlost', lost)
  }, [gl])

  // 画質の切り替え：使いたい画質が描いている画質と違ったら、裏でシェーダーを用意してから切り替える
  useEffect(() => {
    let alive = true
    const check = () => {
      const want = wantedLevel()
      if (!alive || job.current.busy || want === currentLevel()) return
      job.current.busy = true
      void prepare(gl, scene, camera, want, target).then(() => {
        job.current.busy = false
        if (!alive) return
        // 待っているあいだにまた変わっていたら、その画質でやり直す
        if (wantedLevel() === want) {
          useQuality.setState({ level: want })
          m.current.settleUntil = performance.now() / 1000 + SETTLE
        }
        check()
      })
    }
    const offStore = useStore.subscribe(check)
    const offQuality = useQuality.subscribe(check)
    check()
    return () => {
      alive = false
      offStore()
      offQuality()
    }
  }, [gl, scene, camera, target])

  /**
   * ワープの準備（起動直後だけ）：読み込みが落ち着いてから、その時点の場面のシェーダーを作り、
   * パソコンではテクスチャも載せ終えたら、ワープを使えるようにする（それまで押されたワープは待たせる）
   */
  function warmForWarp(time: number) {
    const j = job.current
    if (j.prep === 'done') return
    if (time > PREP_GIVE_UP) {
      j.prep = 'done'
      warpPrepDone()
      return
    }
    if (j.prep === 'load') {
      if (useProgress.getState().active || time < 1) {
        j.quietSince = -1
        return
      }
      if (j.quietSince < 0) j.quietSince = time
      if (time - j.quietSince < LOAD_QUIET) return
      j.prep = 'compile'
      void prepare(gl, scene, camera, currentLevel(), target).then(() => {
        j.prep = 'upload'
        j.scanAt = 0
      })
    } else if (j.prep === 'upload') {
      // スマホは前もって載せないので、シェーダーができたら準備完了
      if (lowMemory() || (j.scanAt > 0 && j.uploads.length === 0)) {
        j.prep = 'done'
        warpPrepDone()
      }
    }
  }

  useFrame(({ clock }, dt) => {
    // 最初に描けたら、今は見えていない天体や構造物のシェーダーも裏で用意しておく
    // （全体マップを開いた瞬間に、初めて画面に入る物のシェーダー作りで止まらないように）
    if (!job.current.warmed && clock.elapsedTime > 1) {
      job.current.warmed = true
      void prepare(gl, scene, camera, currentLevel(), target)
    }
    // テクスチャも前もって GPU に載せておく（パソコンだけ）。three.js は初めて画面に写ったときに載せるので、
    // 全体マップでは小さすぎて描かれない船の 4K テクスチャなどが、ワープで操縦席に切り替えた瞬間にまとめて載り、
    // ワープの演出が止まる。1フレームに1枚ずつ載せる。
    // スマホは逆に、見ていない物まで載せるとメモリが足りなくなる（Safari がページごと落とす）ので、見えたときに載せる
    if (job.current.warmed && !lowMemory()) {
      const j = job.current
      if (j.soon) {
        // 新しい物が画面に出そろうのを少し待ってから探す
        j.soon = false
        j.scanEvery = UPLOAD_SCAN
        j.scanAt = Math.min(j.scanAt, clock.elapsedTime + 1)
      }
      if (clock.elapsedTime > j.scanAt) {
        // 場面の物を全部（SF では 3,000 近く）調べるので、見つからない間は間隔をのばす
        // （設定や行き先が変わったら、また短い間隔に戻す）
        j.uploads = [...sceneTextures(scene)].filter((t) => (gl.properties.get(t) as { __webglTexture?: WebGLTexture }).__webglTexture === undefined)
        j.scanEvery = j.uploads.length > 0 ? UPLOAD_SCAN : Math.min(j.scanEvery * 2, UPLOAD_SCAN_MAX)
        j.scanAt = clock.elapsedTime + j.scanEvery
      }
      const next = j.uploads.shift()
      if (next) gl.initTexture(next)
    }
    warmForWarp(clock.elapsedTime)
    const s = m.current
    // タブを切り替えた・テクスチャの読み込みで一瞬止まったなどの、とびぬけて長いフレームは数えない
    if (dt > 1 || document.hidden) return
    // 画質の切り替え中・直後は数えない
    if (job.current.busy || performance.now() / 1000 < s.settleUntil) {
      s.frames = 0
      s.time = 0
      return
    }
    s.frames++
    s.time += dt
    if (s.time < WINDOW) return
    const fps = s.frames / s.time
    s.frames = 0
    s.time = 0
    useQuality.getState().setFps(Math.round(fps))
    if (useStore.getState().settings.quality !== 'auto') return
    const now = clock.elapsedTime
    const level = useQuality.getState().auto
    s.slow = fps < SLOW_FPS ? s.slow + 1 : 0
    s.fast = fps > FAST_FPS ? s.fast + 1 : 0
    const step = useQuality.getState().scaleStep
    if (s.slow >= 2 && level !== 'low') {
      // 一度遅かった画質には、自動ではもう上げない（行ったり来たりすると、そのたびに画面が止まるので）
      s.tooSlow.add(level)
      useQuality.getState().setAuto(stepDown(level))
      s.slow = 0
      s.fast = 0
      s.lastDown = now
    } else if (s.slow >= 2 && currentLevel() === 'low' && step < SCALE_STEPS.length - 1) {
      // 「軽量」でもまだ遅い：画面をもう一段粗く描く（シェーダーは作り直さないので、すぐ切り替わる）
      s.tooSlowScale.add(step)
      useQuality.setState({ scaleStep: step + 1 })
      s.slow = 0
      s.fast = 0
      s.lastDown = now
      s.settleUntil = performance.now() / 1000 + 1
    } else if (s.fast >= 4 && step > 0 && !s.tooSlowScale.has(step - 1) && now - s.lastDown > 10) {
      // 余裕が出たら、まず画面の粗さを戻す
      useQuality.setState({ scaleStep: step - 1 })
      s.fast = 0
      s.settleUntil = performance.now() / 1000 + 1
    } else if (s.fast >= 4 && step === 0 && level !== 'high' && !s.tooSlow.has(stepUp(level)) && now - s.lastDown > 10) {
      useQuality.getState().setAuto(stepUp(level))
      s.fast = 0
    }
  })

  return null
}
