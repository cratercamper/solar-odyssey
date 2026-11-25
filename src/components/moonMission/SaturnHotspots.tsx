import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { pickPart, useExplorer } from '../../state/saturnExplorer'
import { SATURN_PARTS } from './saturnCutaway'
import { makeApolloAstronaut } from '../surface/apolloSuit'

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
  // 自作のアポロ 17 号の宇宙服（発射台へは背中の装置なしで来た）。腕は体の横に下ろした形（はじめの形のまま）
  const rig = useMemo(() => makeApolloAstronaut({ back: 'none', leva: false, cdr: false, rcu: false }), [])
  useEffect(() => () => rig.materials.forEach((m) => m.dispose()), [rig])
  // 第1段の脚のそば、甲板の南西の角に。ロケットを見上げる向き
  return <primitive object={rig.root} position={[-6.5, 0.8, 8.5]} rotation={[0, -2.5, 0]} />
}
