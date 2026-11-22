import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { pickPart, useExplorer } from '../../state/saturnExplorer'
import { SATURN_PARTS } from './saturnCutaway'
import { loadSuit } from '../surface/suitModel'

// 観察パートの、ロケットにそって光る 8 つの印（3D の中の名札）と、大きさくらべの宇宙飛行士。
// 印はいつもカメラから見てロケットの右のふちに置く（ロケットのかげに隠れないように）。

const _c = new THREE.Vector3()

export function SaturnHotspots() {
  useLang()
  const t = ui().saturnExplorer
  const part = useExplorer((s) => s.part)
  const groups = useRef<(THREE.Group | null)[]>([])
  useFrame(({ camera }) => {
    _c.set(camera.position.x, 0, camera.position.z).normalize()
    SATURN_PARTS.forEach((p, i) => {
      const g = groups.current[i]
      // 画面の右：カメラの見る向き × 上
      if (g) g.position.set(_c.z * (p.r + 0.7), p.y, -_c.x * (p.r + 0.7))
    })
  })
  return (
    <>
      {SATURN_PARTS.map((p, i) => (
        <group key={p.id} ref={(g) => (groups.current[i] = g)}>
          <Html zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
            <button className={`se-dot ${part === p.id ? 'on' : ''}`} onClick={() => pickPart(p.id)}>
              <i />
              <span>{t.parts[p.id].name}</span>
            </button>
          </Html>
        </group>
      ))}
    </>
  )
}

/** 大きさくらべ：移動発射台の甲板に立つ、宇宙服の人（本物の乗組員も宇宙服で発射台へ来た）。読みこむのは見るときだけ */
export function SizeFigure() {
  const [obj, setObj] = useState<THREE.Object3D | null>(null)
  useEffect(() => {
    let alive = true
    loadSuit().then(async (src) => {
      if (!alive || !src) return
      const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js')
      const m = clone(src.scene) as THREE.Group
      m.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(m)
      const k = 1.8 / Math.max(1e-6, box.max.y - box.min.y)
      m.scale.setScalar(k)
      m.position.y = -box.min.y * k
      const bones = new Map<string, THREE.Object3D>()
      m.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) mesh.frustumCulled = false
        if ((o as THREE.Bone).isBone) bones.set(o.name, o)
      })
      // 腕を下ろす（読みこんだままは両腕を横に広げた形）。肩からひじへの向きを、少し外に開いた下向きへ回す
      for (const [arm, elbow, side] of [
        ['arm_1L', 'arm_2L', 1],
        ['arm_1R', 'arm_2R', -1],
      ] as const) {
        const b = bones.get(arm)
        const c = bones.get(elbow)
        if (!b || !c || !b.parent) continue
        m.updateMatrixWorld(true)
        const d = c.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize()
        const qw = new THREE.Quaternion().setFromUnitVectors(d, new THREE.Vector3(0.22 * side, -1, 0.05).normalize())
        const nw = qw.multiply(b.getWorldQuaternion(new THREE.Quaternion()))
        b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(nw))
      }
      const g = new THREE.Group()
      g.add(m)
      setObj(g)
    })
    return () => {
      alive = false
    }
  }, [])
  // 第1段の脚のそば、甲板の南西の角に。ロケットを見上げる向き
  return obj ? <primitive object={obj} position={[-6.5, 0.8, 8.5]} rotation={[0, -2.5, 0]} /> : null
}
