import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { colonyDay } from '../sf/colonyCity'
import { parkLayout, type House } from './park'
import { parkTexture, standAt } from './WalkWorld'
import { catchUp, useColony } from '../../state/colony'
import { useWalk } from '../../state/walk'
import { occupancy } from '../../data/colony'
import { COLONY_ID } from '../../data/sf'

// 公園のとなりの住宅街（お試し）：家（窓・玄関は色の計算で描く）、屋根、玄関のひさし、塀と生け垣、池のブイ。
// 家は箱 1 つで、窓は箱の面の上の位置（m）から計算するので、どの大きさの家でも窓の大きさがそろう。
// 夜は、家ごと・窓ごとに決めた窓だけが灯る。

export const box = () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)

/** インスタンスの大きさ（行列の列の長さ）を使って、面の上の位置を m で出す、頂点シェーダーの部品 */
const LOCAL_SIZE = `
#ifdef USE_INSTANCING
vec3 ks = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
#else
vec3 ks = vec3(1.0);
#endif
vec3 kp = position * ks;`

/** 公園のとなりの住宅街で、人が住んでいる家の割合（0〜1）。夜に灯る窓は、この割合の家だけ（コロニー経営の人口に合わせる。経営をしていなければ 1）。
 * 一周の道の家（WalkChunks）は、いつもすべての家に人がいる */
export const townLived = { value: 1 }

export function houseMaterial(night: { value: number }, lived: { value: number } = { value: 1 }) {
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = night
    shader.uniforms.uLived = lived
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aDoor;
attribute float aSeed;
varying vec3 vHP;
varying vec3 vHN;
varying vec3 vHS;
varying float vHD;
varying float vHR;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
${LOCAL_SIZE}
vHP = kp;
vHN = normal;
vHS = ks;
vHD = aDoor;
vHR = aSeed;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uNight;
uniform float uLived;
varying vec3 vHP;
varying vec3 vHN;
varying vec3 vHS;
varying float vHD;
varying float vHR;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float lit = 0.0;
vec3 col = diffuseColor.rgb;
if (abs(vHN.y) < 0.5) {
  bool fz = abs(vHN.z) > 0.5;
  bool front = fz && vHN.z < 0.0;
  float u = fz ? vHP.x : vHP.z;
  float hw = (fz ? vHS.x : vHS.z) * 0.5;
  float fi = fz ? (vHN.z < 0.0 ? 0.0 : 1.0) : (vHN.x > 0.0 ? 2.0 : 3.0);
  float y = vHP.y;
  float fl = floor(y / 2.9);
  float fy = y - fl * 2.9;
  // 窓の列：面の幅に 2.7 m ごと、まん中にそろえる
  float pitch = 2.7;
  float n = max(1.0, floor((2.0 * hw - 1.4) / pitch));
  float uu = (u + hw - (2.0 * hw - n * pitch) * 0.5) / pitch;
  float ci = floor(uu);
  float cu = uu - ci;
  // 窓ごとの乱数（家の種は、補間の誤差で揺れないように整数にしてから使う）
  float h = fract(sin(dot(vec3(ci, fl, fi) + floor(vHR * 97.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float door = (front && abs(u - vHD) < 0.5 && y < 2.15) ? 1.0 : 0.0;
  bool nearDoor = front && fl < 0.5 && abs(u - vHD) < 1.6;
  float win = (uu >= 0.0 && uu < n && cu > 0.2 && cu < 0.8 && fy > 0.85 && fy < 2.15 && y < vHS.y - 0.3 && h > (fz ? 0.15 : 0.55) && !nearDoor) ? 1.0 : 0.0;
  // 窓枠（白いアルミ）と、まん中の縦の桟
  float inner = step(0.235, cu) * step(cu, 0.765) * step(0.9, fy) * step(fy, 2.1) * (1.0 - step(abs(cu - 0.5), 0.012));
  float frame = win * (1.0 - inner);
  vec3 glass = mix(vec3(0.11, 0.14, 0.18), vec3(0.45, 0.53, 0.62), smoothstep(0.9, 2.1, fy) * 0.55);
  // 1 階の大きい窓にはカーテン
  glass = mix(glass, vec3(0.78, 0.74, 0.66), step(0.72, h) * step(fy, 2.1) * 0.65);
  col = mix(col, glass, win);
  col = mix(col, vec3(0.9, 0.9, 0.88), frame);
  // 玄関の戸（木）と取っ手
  vec3 wood = mix(vec3(0.33, 0.22, 0.14), vec3(0.2, 0.2, 0.22), step(0.5, vHR));
  col = mix(col, wood, door);
  col = mix(col, vec3(0.75, 0.7, 0.5), door * step(abs(u - vHD - 0.36), 0.04) * step(abs(y - 1.0), 0.06));
  // 基礎（地面から 0.4 m）
  col = mix(col, vec3(0.52, 0.52, 0.5), step(y, 0.4) * (1.0 - door));
  // 家の半分は横張りのサイディング
  if (vHR > 0.55) col *= 1.0 - 0.07 * step(0.88, fract(y / 0.21)) * (1.0 - win) * (1.0 - door) * step(0.4, y);
  // 階の境の帯
  col *= 1.0 - 0.12 * step(abs(y - 2.9), 0.06) * step(3.3, vHS.y);
  lit = win * inner * step(0.42, fract(h * 7.31)) * step(fract(vHR * 13.7), uLived);
}
diffuseColor.rgb = col;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.7, 0.38) * lit * uNight * 1.4;`,
      )
  }
  mat.customProgramCacheKey = () => 'walk-house-2'
  return mat
}

/** 瓦の段（高さ 0.15 m ごと）と、棟の濃い線 */
export function roofMaterial() {
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRP;\nvarying vec3 vRS;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LOCAL_SIZE}\nvRP = kp;\nvRS = ks;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRP;\nvarying vec3 vRS;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float row = fract(vRP.y / 0.15);
float rowI = floor(vRP.y / 0.15);
float seam = step(0.92, fract(vRP.x / 0.3 + mod(rowI, 2.0) * 0.5));
diffuseColor.rgb *= (0.8 + 0.2 * smoothstep(0.0, 0.35, row)) * (1.0 - 0.1 * seam);
diffuseColor.rgb *= 1.0 - 0.35 * step(vRS.y - 0.12, vRP.y);`,
      )
  }
  mat.customProgramCacheKey = () => 'walk-roof-1'
  return mat
}

/** 塀（ブロックの目地）と生け垣（芝の写真を細かく貼って葉の茂みに見せる） */
function wallMaterial(hedge: boolean) {
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', map: hedge ? parkTexture('grass') : null })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
${LOCAL_SIZE}
vWP = kp;
vWN = normal;
${hedge ? 'vMapUv = (abs(normal.x) > 0.5 ? kp.zy : abs(normal.y) > 0.5 ? kp.xz : kp.xy) / 1.1;' : ''}`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace(
        '#include <color_fragment>',
        hedge
          ? `#include <color_fragment>
diffuseColor.rgb *= 0.75 + 0.35 * smoothstep(0.0, 1.3, vWP.y);`
          : `#include <color_fragment>
float bu = abs(vWN.x) > 0.5 ? vWP.z : vWP.x;
float by = vWP.y / 0.2;
float joint = max(step(0.9, fract(by)), step(0.96, fract(bu / 0.4 + mod(floor(by), 2.0) * 0.5)));
diffuseColor.rgb *= (1.0 - 0.18 * joint * step(vWP.y, 0.95)) * (1.0 - 0.15 * step(0.95, vWP.y));`,
      )
  }
  mat.customProgramCacheKey = () => (hedge ? 'walk-hedge-1' : 'walk-block-1')
  return mat
}

/** 切妻屋根の 2 枚の斜面（棟は x の向き、高さ 1、奥行き 1） */
export function slopeGeometry() {
  const p = [
    [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0],
    [-0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, 0.5, 0, 0.5],
  ].flat()
  // 外向きの面になるように、三角ごとに 2 番目と 3 番目を入れかえる
  for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  g.computeVertexNormals()
  return g
}
/** 妻（屋根の下の三角の壁） */
export function gableGeometry() {
  const p = [-0.5, 0, 0.5, -0.5, 1, 0, -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, 0.5, 0, 0.5]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  g.computeVertexNormals()
  return g
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], colors?: number[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length))
  mesh.count = mats.length
  mats.forEach((m, i) => mesh.setMatrixAt(i, m))
  if (colors) {
    const c = new THREE.Color()
    colors.forEach((col, i) => mesh.setColorAt(i, c.setHex(col)))
  }
  mesh.castShadow = mesh.receiveShadow = true
  mesh.computeBoundingSphere()
  return mesh
}

/** 家の前（-z）の、x = u の所の、高さ y の点の行列（家の向きのまま） */
function onHouse(h: House, u: number, y: number, z: number, scale: [number, number, number]) {
  const c = Math.cos(h.yaw)
  const s = Math.sin(h.yaw)
  // 家の x → (s: cos, y: -sin)、z → (s: sin, y: cos)
  return standAt(h.s + u * c + z * s, h.y - u * s + z * c, y, h.yaw, scale, new THREE.Matrix4())
}

export function WalkTown() {
  const town = parkLayout().town
  const data = useMemo(() => {
    const night = { value: 0 }
    const walls: THREE.Matrix4[] = []
    const wallColors: number[] = []
    const doors: number[] = []
    const seeds: number[] = []
    const slopes: THREE.Matrix4[] = []
    const roofColors: number[] = []
    const gables: THREE.Matrix4[] = []
    const gableColors: number[] = []
    const caps: THREE.Matrix4[] = []
    const canopies: THREE.Matrix4[] = []
    const rails: THREE.Matrix4[] = []
    const railColors: number[] = []
    for (const h of town.houses) {
      walls.push(standAt(h.s, h.y, 0, h.yaw, [h.w, h.h, h.d], new THREE.Matrix4()))
      wallColors.push(h.wall)
      doors.push(h.door)
      seeds.push(h.seed)
      if (h.flat) {
        caps.push(standAt(h.s, h.y, h.h, h.yaw, [h.w + 0.3, 0.35, h.d + 0.3], new THREE.Matrix4()))
      } else {
        const rh = h.d * 0.29
        const over = 0.8
        const lift = (rh * over) / (h.d + over)
        slopes.push(standAt(h.s, h.y, h.h - lift, h.yaw, [h.w + 0.6, rh, h.d + over], new THREE.Matrix4()))
        roofColors.push(h.roof)
        gables.push(standAt(h.s, h.y, h.h, h.yaw, [h.w, rh - lift, h.d], new THREE.Matrix4()))
        gableColors.push(h.wall)
      }
      canopies.push(onHouse(h, h.door, 2.4, -h.d / 2 - 0.45, [1.7, 0.1, 0.9]))
      // 2 階建ての多くは、2 階の前か後ろにベランダ（床と手すりの板）
      const r = (h.seed * 7.13) % 1
      if (h.h > 5 && r < 0.75) {
        const bw = Math.min(h.w - 1.2, 3.5 + ((h.seed * 31.7) % 1) * 2.5)
        const bu = ((h.seed * 13.1) % 1 - 0.5) * (h.w - bw - 0.8)
        const z = r < 0.5 ? -1 : 1
        const z0 = (z * h.d) / 2
        canopies.push(onHouse(h, bu, 2.85, z0 + z * 0.55, [bw, 0.15, 1.1]))
        rails.push(onHouse(h, bu, 3.0, z0 + z * 1.07, [bw, 1.0, 0.06]))
        for (const e of [-1, 1]) rails.push(onHouse(h, bu + (e * bw) / 2 - e * 0.03, 3.0, z0 + z * 0.55, [0.06, 1.0, 1.04]))
        const rc = r < 0.25 ? 0xe9e9e6 : r < 0.5 ? 0x5d6064 : h.wall
        railColors.push(rc, rc, rc)
      }
    }
    const wallGeo = box()
    wallGeo.setAttribute('aDoor', new THREE.InstancedBufferAttribute(new Float32Array(doors), 1))
    wallGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1))
    const houseMat = houseMaterial(night, townLived)
    const roofMat = roofMaterial()
    const plain = new THREE.MeshLambertMaterial({ color: '#ffffff' })
    const capMat = new THREE.MeshLambertMaterial({ color: '#8d9094' })
    const hedgeMat = wallMaterial(true)
    const blockMat = wallMaterial(false)
    const hedges = town.walls.filter((w) => w.hedge)
    const blocks = town.walls.filter((w) => !w.hedge)
    const wallM = (list: typeof hedges) => list.map((w) => standAt(w.s, w.y, 0, w.yaw, [w.len, w.h, w.t], new THREE.Matrix4()))
    const buoyMat = new THREE.MeshLambertMaterial({ color: '#e8742c', emissive: '#000000' })
    const meshes = [
      instanced(wallGeo, houseMat, walls, wallColors),
      instanced(slopeGeometry(), roofMat, slopes, roofColors),
      instanced(gableGeometry(), plain, gables, gableColors),
      instanced(box(), capMat, caps),
      instanced(box(), capMat, canopies),
      instanced(box(), plain.clone(), rails, railColors),
      instanced(box(), hedgeMat, wallM(hedges), hedges.map((w) => w.color)),
      instanced(box(), blockMat, wallM(blocks), blocks.map((w) => w.color)),
      instanced(
        new THREE.SphereGeometry(0.35, 12, 8),
        buoyMat,
        town.buoys.map((b) => standAt(b.s, b.y, 0.08, 0, 1, new THREE.Matrix4())),
      ),
    ]
    return { meshes, night, buoyMat }
  }, [town])
  useEffect(
    () => () => {
      for (const m of data.meshes) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
        m.dispose()
      }
    },
    [data],
  )
  // 町づくり（コロニー経営）をしていれば、人口に合わせて灯る家を減らす
  const lived = useColony((c) => (c.started ? Math.round(Math.max(0.12, occupancy(c)) * 50) / 50 : 1))
  const here = useWalk((w) => w.colonyId === COLONY_ID)
  useEffect(() => catchUp(), [])
  useEffect(() => {
    townLived.value = here ? lived : 1
    return () => {
      townLived.value = 1
    }
  }, [lived, here])
  useFrame(() => {
    data.night.value = colonyDay.night
    // 夜のブイは、ほんのり光る
    data.buoyMat.emissive.setRGB(0.5 * colonyDay.night, 0.18 * colonyDay.night, 0.05 * colonyDay.night)
  })
  return (
    <>
      {data.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}
