import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { arrivalOf } from '../data/arrival'
import { radiusKm } from '../data/approach'
import { textureUrl } from '../data/textures'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { ARRIVAL_SECONDS, arrivalElapsed, fadeAt, itemAge, useArrival } from '../state/arrival'
import { bodies } from '../state/registry'

// 到着の瞬間（地球より大きい星）：星の赤道に重ねて、本当の大きさの比の地球を左から一つずつならべる。
// 星のまん中の面に置いて、いつも手前に描く（星の手前の面に置くと、カメラに近いぶん大きく見えて比がくずれる）

const MAX = 120
const EARTH_KM = 6_371
const center = new THREE.Vector3()
const right = new THREE.Vector3()
const pos = new THREE.Vector3()
const quat = new THREE.Quaternion()
const spin = new THREE.Quaternion()
const scale = new THREE.Vector3()
const m = new THREE.Matrix4()
const Y = new THREE.Vector3(0, 1, 0)

/** ポンと出る大きさ（0 → 少し大きく → 1） */
function pop(age: number) {
  if (age <= 0) return 0
  const k = Math.min(1, age / 0.32)
  const back = 1.9
  const x = k - 1
  return 1 + (back + 1) * x * x * x + back * x * x
}

export function ArrivalRow() {
  const id = useArrival((s) => s.id)
  const a = arrivalOf(id)
  if (!a || a.kind !== 'giant') return null
  return <Row id={a.id} items={Math.ceil(a.count)} />
}

function Row({ id, items }: { id: string; items: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const map = useOptionalTexture(textureUrl('earth'))
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#4a7fd0', transparent: true, depthTest: false, depthWrite: false }), [])
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#9fd4ff', transparent: true, depthTest: false, depthWrite: false }), [])
  const lineGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)]), [])
  const line = useMemo(() => new THREE.Line(lineGeo, lineMat), [lineGeo, lineMat])
  useEffect(() => {
    // 太陽の前の 109 個のように小さく見えるときは、模様は見えないので明るい青の点にする
    if (!map || items > 40) {
      mat.color.set('#8fd0ff')
      return
    }
    mat.map = map
    mat.color.set('#ffffff')
    mat.needsUpdate = true
  }, [map, mat, items])
  useEffect(() => () => (mat.dispose(), lineMat.dispose(), lineGeo.dispose()), [mat, lineMat, lineGeo])

  useFrame(({ camera }) => {
    const body = bodies.get(id)
    const km = radiusKm(id)
    const t = arrivalElapsed()
    if (!body || !km || t > ARRIVAL_SECONDS) {
      mesh.current.count = 0
      line.visible = false
      return
    }
    body.object.getWorldPosition(center)
    const R = body.radius
    const r = R * (EARTH_KM / km)
    right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    const fade = fadeAt(t)
    // 端から端までの線（直径）が先に伸びて、そこに地球がならぶ
    const grow = Math.min(1, Math.max(0, t / 0.6))
    line.visible = true
    line.position.copy(center)
    line.quaternion.copy(camera.quaternion)
    line.scale.set(R * grow, 1, 1)
    lineMat.opacity = 0.75 * fade
    mat.opacity = fade
    const start = -(items * r) + r
    let n = 0
    for (let i = 0; i < Math.min(items, MAX); i++) {
      const age = itemAge(t, i, items)
      if (age <= 0) break
      pos.copy(center).addScaledVector(right, start + i * 2 * r)
      // 地球は昼の面をこちらに向け、ゆっくり回す
      spin.setFromAxisAngle(Y, -Math.PI / 2 + age * 0.35)
      quat.copy(camera.quaternion).multiply(spin)
      scale.setScalar(r * pop(age))
      m.compose(pos, quat, scale)
      mesh.current.setMatrixAt(n++, m)
    }
    mesh.current.count = n
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} material={mat} renderOrder={12} frustumCulled={false}>
        <sphereGeometry args={[1, 40, 28]} />
      </instancedMesh>
      <primitive object={line} renderOrder={11} frustumCulled={false} />
    </>
  )
}
