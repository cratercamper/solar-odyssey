import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLONY_LENGTH as L, COLONY_PORT as PORT, COLONY_RADIUS as R } from '../../data/sf'
import { Batch, place } from './batch'
import {
  M,
  applyNight,
  buildingGeometry,
  buildingInstances,
  buildingMaterial,
  colonyDay,
  meters,
  onLand,
  sharedInstancedMesh,
  treeGeometry,
  treeLiteGeometry,
  treeInstances,
  treeMaterial,
  updateColonyDay,
} from './colonyCity'

// コロニーの中の街（ColonyModel の interior のときだけ）。
// - 立体の建物と木（3本の帯ぶん、それぞれ 1 回で描く）
// - 大通りのまん中の鉄道の高架と、走る列車
// - 港の軸から端の壁を伝って地面の駅へ降りるエレベーター（帯ごとに 1 本）と、上り下りするかご
// - 軸のまわりの「ハブ駅」の輪

const DEG = Math.PI / 180
const H = L / 2
const CAP = 0.03
const stripAngle = (k: number) => k * 120 * DEG

/** 高架の高さ・幅（m） */
const VIADUCT_H = 12
const VIADUCT_W = 14
/** 列車の長さ（m）と速さ（m/秒。時速 250 km ほど） */
const TRAIN_LEN = 260
const TRAIN_SPEED = 70
/** エレベーターが端の壁を上り下りする時間（秒） */
const LIFT_SECONDS = 50

/**
 * 端の壁（港側の丸屋根の内側）の上の点。a = 0 で地面の縁、a = π/2 で軸のそばのハブ。
 * 壁から内側へ off（m）だけ浮かせる
 */
function capPoint(angle: number, a: number, off: number, out = new THREE.Vector3()) {
  const r = PORT + (R - PORT) * Math.cos(a)
  const y = -H - CAP * Math.sin(a)
  // 楕円の外向きの法線（r, y）
  let nr = Math.cos(a) / (R - PORT)
  let ny = -Math.sin(a) / CAP
  const len = Math.hypot(nr, ny)
  nr /= len
  ny /= len
  const rr = r - nr * off * M
  return out.set(Math.sin(angle) * rr, y - ny * off * M, Math.cos(angle) * rr)
}

type Infra = { geometry: THREE.BufferGeometry }
let infra: Infra | null = null

/** 高架・エレベーターの筒・ハブ駅を 1 つの形にまとめ、上を向いた面ほど明るい色を頂点に焼く */
function infraGeometry(): Infra {
  if (infra) return infra
  const box = new THREE.BoxGeometry(1, 1, 1)
  const batch = new Batch()
  const p = new THREE.Vector3()
  for (let k = 0; k < 3; k++) {
    const a = stripAngle(k)
    // 高架：長さに沿って、柱で支えた桁
    const y0 = 0.012 * meters.length
    const y1 = 0.95 * meters.length
    const seg = 40
    for (let i = 0; i < seg; i++) {
      const ya = y0 + ((y1 - y0) * i) / seg
      const yb = y0 + ((y1 - y0) * (i + 1)) / seg
      onLand(a, 0, (ya + yb) / 2, VIADUCT_H, p)
      batch.add(box, place([p.x, p.y, p.z], [0, a, 0], [VIADUCT_W * M, (yb - ya) * M, 3 * M]))
    }
    for (let y = y0; y < y1; y += 200) {
      onLand(a, 0, y, VIADUCT_H / 2, p)
      batch.add(box, place([p.x, p.y, p.z], [0, a, 0], [4 * M, 4 * M, VIADUCT_H * M]))
    }
    // エレベーター：端の壁に沿った 2 本の筒
    for (const side of [-1, 1]) {
      const dAng = (side * 40 * M) / R
      const pts = Array.from({ length: 25 }, (_, i) => capPoint(a + dAng, (i / 24) * (Math.PI / 2 - 0.02), 30))
      batch.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 22 * M, 8))
    }
    // 筒を壁へ留める腕
    for (let i = 1; i < 12; i++) {
      const t = (i / 12) * (Math.PI / 2 - 0.02)
      capPoint(a, t, 15, p)
      batch.add(box, place([p.x, p.y, p.z], [0, a, 0], [120 * M, 12 * M, 12 * M]))
    }
    // 地面の駅への入り口（筒の下の端の建屋）
    onLand(a, 0, 120, 25, p)
    batch.add(box, place([p.x, p.y, p.z], [0, a, 0], [180 * M, 200 * M, 50 * M]))
  }
  // ハブ駅：軸のまわりの輪（エレベーターの上の端）
  const ring = new THREE.TorusGeometry(PORT * 1.04, 40 * M, 8, 64)
  batch.add(ring, place([0, -H - CAP + 0.0004, 0], [Math.PI / 2, 0, 0]))
  const geometry = batch.build()
  // 頂点の色：軸の向き（上）を向いた面ほど明るい
  const pos = geometry.attributes.position
  const nor = geometry.attributes.normal
  const col = new Float32Array(pos.count * 3)
  const up = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    up.set(-pos.getX(i), 0, -pos.getZ(i)).normalize()
    n.fromBufferAttribute(nor, i)
    const v = 0.55 + 0.45 * Math.max(0, n.dot(up))
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3))
  infra = { geometry }
  return infra
}

const infraMaterial = new THREE.MeshBasicMaterial({ color: '#c9ccd2', vertexColors: true })
const INFRA_DAY = new THREE.Color('#c9ccd2')
const INFRA_NIGHT = new THREE.Color('#1a1e26')
const trainMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.2, 1.3), toneMapped: false })
const TRAIN_DAY = new THREE.Color(1.15, 1.2, 1.3)
const TRAIN_NIGHT = new THREE.Color(1.6, 1.9, 2.4)
const carMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.5), toneMapped: false })

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpS = new THREE.Vector3()
const p0 = new THREE.Vector3()
const p1 = new THREE.Vector3()
const upV = new THREE.Vector3()
const side = new THREE.Vector3()
const fwd = new THREE.Vector3()
const camLocal = new THREE.Vector3()
const trainScale = new THREE.Matrix4()
const Z = new THREE.Vector3(0, 0, 1)

/** trees = false：木を描かない（コロニーの中を歩く場面は、木を自分で描く） */
export function ColonyInterior({ trees = true }: { trees?: boolean }) {
  const group = useRef<THREE.Group>(null!)
  const meshes = useMemo(() => {
    const buildings = sharedInstancedMesh(buildingGeometry(), buildingMaterial, buildingInstances())
    const trees = sharedInstancedMesh(treeGeometry(), treeMaterial, treeInstances())
    // コロニーの外から窓ごしに見るときは、木を粗い形で（木は 2 万本以上あるので、細かいままだと 200 万三角形近くになる）
    const treesLite = sharedInstancedMesh(treeLiteGeometry(), treeMaterial, treeInstances())
    const trains = new THREE.InstancedMesh(buildingGeometry(), trainMaterial, 6)
    const cars = new THREE.InstancedMesh(buildingGeometry(), carMaterial, 6)
    trains.frustumCulled = cars.frustumCulled = false
    return { buildings, trees, treesLite, trains, cars, infra: infraGeometry().geometry }
  }, [])
  useEffect(() => () => {
    // 形と配置は共有なので捨てない。列車とかごの行列だけ
    meshes.trains.dispose()
    meshes.cars.dispose()
  }, [meshes])

  useFrame(({ clock, camera }) => {
    updateColonyDay(clock.elapsedTime)
    const n = colonyDay.night
    applyNight(n)
    infraMaterial.color.lerpColors(INFRA_DAY, INFRA_NIGHT, n)
    trainMaterial.color.lerpColors(TRAIN_DAY, TRAIN_NIGHT, n)
    // 遠くからは描かない（窓ごしに見えるほど近いときだけ）
    const g = group.current
    camLocal.copy(camera.position)
    g.worldToLocal(camLocal)
    g.visible = camLocal.length() < 1.3
    if (!g.visible) return
    const inside = Math.hypot(camLocal.x, camLocal.z) < R && Math.abs(camLocal.y) < L / 2
    meshes.trees.visible = inside
    meshes.treesLite.visible = !inside
    const t = clock.elapsedTime
    // 列車：帯ごとに上りと下り
    const len = meters.length * (0.95 - 0.012)
    for (let k = 0; k < 3; k++)
      for (let j = 0; j < 2; j++) {
        const dir = j === 0 ? 1 : -1
        const phase = ((t * TRAIN_SPEED + k * 7000 + j * 13000) % (len * 2)) / len
        const f = phase < 1 ? phase : 2 - phase
        const y = 0.012 * meters.length + len * (dir > 0 ? f : 1 - f)
        const a = stripAngle(k)
        onLand(a, dir * 4, y, VIADUCT_H + 3.5, p0)
        const aa = a + (dir * 4 * M) / R
        upV.set(-Math.sin(aa), 0, -Math.cos(aa))
        side.set(Math.cos(aa), 0, -Math.sin(aa))
        tmpM.makeBasis(side, upV, fwd.set(0, 1, 0)).setPosition(p0)
        tmpM.multiply(trainScale.makeScale(5 * M, 5 * M, TRAIN_LEN * M))
        meshes.trains.setMatrixAt(k * 2 + j, tmpM)
      }
    meshes.trains.instanceMatrix.needsUpdate = true
    // エレベーターのかご：2 本の筒を上りと下りで使う
    for (let k = 0; k < 3; k++)
      for (const [j, sideSign] of [[0, -1], [1, 1]] as const) {
        const ph = ((t / LIFT_SECONDS + k * 0.31 + j * 0.5) % 2 + 2) % 2
        const f = ph < 1 ? ph : 2 - ph
        const ease = f * f * (3 - 2 * f)
        const a = stripAngle(k) + (sideSign * 40 * M) / R
        const ca = ease * (Math.PI / 2 - 0.02)
        capPoint(a, ca, 30, p0)
        capPoint(a, Math.min(Math.PI / 2, ca + 0.01), 30, p1)
        fwd.subVectors(p1, p0).normalize()
        tmpQ.setFromUnitVectors(Z, fwd)
        tmpM.compose(p0, tmpQ, tmpS.set(50 * M, 50 * M, 90 * M))
        meshes.cars.setMatrixAt(k * 2 + j, tmpM)
      }
    meshes.cars.instanceMatrix.needsUpdate = true
  })

  return (
    <group ref={group}>
      <primitive object={meshes.buildings} />
      {trees && <primitive object={meshes.trees} />}
      {trees && <primitive object={meshes.treesLite} />}
      <primitive object={meshes.trains} />
      <primitive object={meshes.cars} />
      <mesh geometry={meshes.infra} material={infraMaterial} />
    </group>
  )
}
