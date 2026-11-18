import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { ui } from '../../i18n'
import { ARM_STOW, applyPose, deployPose, type Rig } from './Rover'
import { rallyClock, useRally } from '../../state/rally'
import { roverPose } from '../../state/rover'
import { GhostRecorder, ghostAt, loadGhost, saveGhost, type GhostPose, type GhostRun } from '../../state/rallyGhost'
import { courseOf, goldRun, ranksAbove, resultsOf, type RallyResult } from '../../state/rallyHiscore'

// 峡谷レースのゴースト：記録した走りを再生するローバーが 2 台、いっしょに走る（ぶつからず、通りぬけられる）。
//   金色      ハイスコア表の 1 位の走り（ゲームに入っている記録か、自分の記録）。上に 1 位の人の名前
//   半透明    自分のいちばん速い走り。金色と同じ走りのときは出さない
// ゴールのたびに走りを記録して、自分のベストより速ければ自分のゴーストにする（このブラウザに保存）。
// 記録・再生・保存は state/rallyGhost.ts。

const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}`

/** 色と、どれだけ透けるか（0 見えない〜1 透けない）。自分のローバーと重なる所では、さらに薄くする */
const LOOK = { gold: { color: '#ffcf3f', opacity: 0.45 }, own: { color: '#bff4ff', opacity: 0.32 } } as const
type Kind = keyof typeof LOOK
const WHEEL_R = 0.2

/** ゴーストの姿（展開して、アームをたたんだ姿） */
const GHOST_POSE = (() => {
  const p = deployPose(1)
  p.arm = [...ARM_STOW]
  return p
})()

type Ghost = { run: GhostRun | null; model: THREE.Object3D; mat: THREE.MeshBasicMaterial; rig: Rig; look: (typeof LOOK)[Kind]; spin: number; hasLast: boolean; last: GhostPose; pose: GhostPose }

function buildGhost(scene: THREE.Object3D, kind: Kind): Ghost {
  const model = scene.clone(true)
  model.name = `rally-ghost-${kind}`
  const mat = new THREE.MeshBasicMaterial({ color: LOOK[kind].color, transparent: true, opacity: LOOK[kind].opacity, depthWrite: false })
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.material = mat
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.renderOrder = 5
  })
  const get = (n: string) => {
    const o = model.getObjectByName(n)
    if (!o) throw new Error(`rover model has no part ${n}`)
    return o
  }
  const rig: Rig = {
    body: get('Body'),
    legs: Object.fromEntries(['FR', 'MR', 'RR', 'FL', 'ML', 'RL'].map((k) => [k, get('Leg_' + k)])),
    wheels: Object.fromEntries(['FR', 'MR', 'RR', 'FL', 'ML', 'RL'].map((k) => [k, get('Wheel_' + k)])),
    links: [get('Link_R'), get('Link_L')],
    panelsL: [get('Panel_L1'), get('Panel_L2')],
    panelsR: [get('Panel_R1'), get('Panel_R2')],
    mast: get('Mast'),
    head: get('Head'),
    antennas: [get('Antenna1'), get('Antenna2')],
    arm: [get('ArmYaw'), get('ArmUpper'), get('ArmFore'), get('ArmHand')],
  }
  for (const w of Object.values(rig.wheels)) w.rotation.order = 'YXZ'
  applyPose(rig, GHOST_POSE)
  model.visible = false
  const zero = () => ({ x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 })
  return { run: null, model, mat, rig, look: LOOK[kind], spin: 0, hasLast: false, last: zero(), pose: zero() }
}

/** レースの時刻 t の所へゴーストを置く（t が null・show が false なら隠す）。描いたら true */
function place(g: Ghost, t: number | null, show: boolean): boolean {
  g.model.visible = show && t !== null && g.run !== null
  if (!g.model.visible || !g.run || t === null) return false
  const p = ghostAt(g.run, t, g.pose)
  g.model.position.set(p.x, p.y, p.z)
  g.model.rotation.set(p.pitch, p.heading, p.roll, 'YXZ')
  // 車輪は、前へ進んだ分だけ回す
  if (g.hasLast) {
    const fwd = -(p.x - g.last.x) * Math.sin(p.heading) - (p.z - g.last.z) * Math.cos(p.heading)
    if (Math.abs(fwd) < 3) g.spin -= fwd / WHEEL_R
  }
  Object.assign(g.last, p)
  g.hasLast = true
  for (const w of Object.values(g.rig.wheels)) w.rotation.x = g.spin
  // 自分のローバーと重なる所では薄くして、自分のローバーを隠さない
  const d = Math.hypot(p.x - roverPose.x, p.z - roverPose.z)
  g.mat.opacity = g.look.opacity * THREE.MathUtils.clamp((d - 1) / 4, 0.3, 1)
  return true
}

export function RallyGhost({ track }: { track: string }) {
  const { scene } = useGLTF(url('rover-orv7.glb'))
  const ghosts = useMemo(() => ({ gold: buildGhost(scene, 'gold'), own: buildGhost(scene, 'own') }), [scene])
  useEffect(
    () => () => {
      ghosts.gold.mat.dispose()
      ghosts.own.mat.dispose()
    },
    [ghosts],
  )
  useEffect(() => {
    ghosts.own.run = loadGhost(track, courseOf(track))
    ghosts.own.hasLast = false
  }, [ghosts, track])
  const label = useRef<HTMLDivElement>(null)

  const st = useRef({ rec: new GhostRecorder(), recording: false, results: null as RallyResult[] | null, own: null as GhostRun | null, gold: null as ReturnType<typeof goldRun> })
  const pose = useRef<GhostPose>({ x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 })
  const me = (): GhostPose => {
    const p = pose.current
    p.x = roverPose.x
    p.y = roverPose.y
    p.z = roverPose.z
    p.heading = roverPose.heading
    p.pitch = roverPose.pitch
    p.roll = roverPose.roll
    return p
  }

  useFrame(() => {
    const s = st.current
    const r = useRally.getState()
    // このフレームのレースの時刻（state/rallyGhost.ts の時計の説明）。ゴールのあとも、ゴーストは自分の走りの終わりまで走る
    let time: number | null = null
    if (r.phase === 'count') {
      s.rec.hold(me())
      s.recording = true
      time = 0
    } else if (r.phase === 'run') {
      time = rallyClock.t
      if (s.recording) s.rec.frame(time, me())
    } else if (r.phase === 'done' && r.result) {
      if (s.recording) {
        s.recording = false
        // ゴールした走りは、もうハイスコア表に入っている（Rally.tsx のゴール）
        const run: GhostRun = { ...s.rec.finish(r.result.time, me()), at: r.result.at }
        const own = ghosts.own
        if (!own.run || ranksAbove(track, run, own.run)) {
          saveGhost(run, track, courseOf(track))
          own.run = run
          own.hasLast = false // 新しいゴーストはゴールに現れる。コースを飛びこえた分は車輪を回さない
        }
      }
      time = rallyClock.t
    } else s.recording = false

    // 金色のゴースト：表か自分のゴーストが変わったときだけ選びなおす
    const results = resultsOf(track)
    if (results !== s.results || ghosts.own.run !== s.own) {
      s.results = results
      s.own = ghosts.own.run
      s.gold = goldRun(track, ghosts.own.run)
      if (ghosts.gold.run !== (s.gold?.run ?? null)) {
        ghosts.gold.run = s.gold?.run ?? null
        ghosts.gold.hasLast = false
      }
    }
    const gold = place(ghosts.gold, time, true)
    // 金色のゴーストの上の名前（Html が要素を作ったあとなので、ここで書く）
    const el = label.current
    if (el) {
      el.style.display = gold ? '' : 'none'
      const name = `🏆 ${s.gold?.name ?? ui().rallyHiscore.you}`
      if (el.textContent !== name) el.textContent = name
    }
    // 自分のベストは、金色と同じ走りでなければ出す
    place(ghosts.own, time, !gold || ghosts.gold.run !== ghosts.own.run)
  })

  return (
    <>
      <primitive object={ghosts.gold.model}>
        <Html position={[0, 3.1, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div ref={label} className="rally-ghost-name" />
        </Html>
      </primitive>
      <primitive object={ghosts.own.model} />
    </>
  )
}
