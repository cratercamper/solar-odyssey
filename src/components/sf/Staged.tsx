import { useEffect, useRef, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { drawsThroughPostFx } from '../QualityGovernor'
import { currentLevel, lowMemory } from '../../state/quality'

// SF の構造物を、1 つずつ順番に出すための入れ物（SFWorld）。
// SF をオンにした瞬間に 26 個の構造物を全部作ると、形づくり・シェーダー作り・テクスチャの転送が 1 フレームに集まり、
// 弱い GPU（Edge の内蔵 GPU など）では何秒も固まる。ここでは 1 つずつ作り、
// シェーダーは描画を止めずに裏で用意して（KHR_parallel_shader_compile）、できてから見せる。

/** シェーダーの用意を待つ上限（秒）。過ぎたら、残りはその場で作らせて見せる */
const PREPARE_LIMIT = 6

/** 後処理を通して描くときのシェーダーを用意するための、形だけの描画先 */
let target: THREE.WebGLRenderTarget | null = null

/** obj の材質のシェーダーを裏で用意する（obj が見えていなくても）。テクスチャも GPU に載せておく（パソコンだけ） */
export function prepareObject(gl: THREE.WebGLRenderer, obj: THREE.Object3D, scene: THREE.Scene, camera: THREE.Camera) {
  target ??= new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
  const prev = gl.getRenderTarget()
  const wasVisible = obj.visible
  let done: Promise<unknown>
  try {
    // compile は見えている物だけをたどるので、そのあいだだけ見えることにする
    obj.visible = true
    gl.setRenderTarget(drawsThroughPostFx(currentLevel()) ? target : null)
    done = gl.compileAsync(obj, camera, scene)
  } catch {
    done = Promise.resolve()
  } finally {
    gl.setRenderTarget(prev)
    obj.visible = wasVisible
  }
  return Promise.race([done, new Promise((r) => setTimeout(r, PREPARE_LIMIT * 1000))]).then(() => {
    // スマホは、見えていない物のテクスチャまで載せるとメモリが足りなくなるので、見えたときに載せる
    if (lowMemory()) return
    const found = new Set<THREE.Texture>()
    obj.traverse((o) => {
      const m = (o as THREE.Mesh).material
      for (const mat of m ? (Array.isArray(m) ? m : [m]) : []) {
        for (const v of Object.values(mat)) if ((v as THREE.Texture)?.isTexture && (v as THREE.Texture).image) found.add(v as THREE.Texture)
      }
    })
    for (const t of found) {
      try {
        gl.initTexture(t)
      } catch {
        /* 載せられなくても、初めて描くときに three.js が載せる */
      }
    }
  })
}

/**
 * 中身を作ったら（1 フレーム待ってから）シェーダーを裏で用意し、できたら見せて onReady を呼ぶ。
 * 見せるまでのあいだも、中身の useFrame（位置の計算・登録）は動いている
 */
export function Staged({ children, onReady }: { children: ReactNode; onReady: () => void }) {
  const group = useRef<THREE.Group>(null!)
  const { gl, scene, camera } = useThree()
  const ready = useRef(onReady)
  ready.current = onReady
  useEffect(() => {
    let alive = true
    const g = group.current
    g.visible = false
    const raf = requestAnimationFrame(() => {
      if (!alive) return
      void prepareObject(gl, g, scene, camera).then(() => {
        if (!alive) return
        g.visible = true
        ready.current()
      })
    })
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      // 見せる前にこの入れ物ごと外されたら、次の構造物を待たせない
      g.visible = true
    }
  }, [gl, scene, camera])
  return <group ref={group}>{children}</group>
}
