import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ship } from '../../state/flight'
import { COLONY_LENGTH as L, COLONY_PORT as PORT } from '../../data/sf'
import { radialGlowTexture } from '../radialGlow'

// コロニーの港へ入る船のための、宇宙へ伸びる誘導灯（オリジナルのデザイン。考え方は実在の方式から）。
// - 接近の回廊：ISS へ近づく宇宙船は、ドッキング口から外へ広がる円すい形の「接近回廊」の中を通る決まり。
//   その回廊のふちに、光るブイの輪を並べる（港から遠いほど輪が広い）。右（+X）に緑、左（-X）に赤を置き、
//   向きがわかるようにする（船や飛行機の舷灯と同じ色の決まり）
// - 流れる閃光：空港の進入灯の「ラビット」（順番に光る閃光が、滑走路へ向かって走る）にならい、
//   回転軸の上の灯が港へ向かって順に光る
// - 外側の目印：回廊の入口に、ゆっくり明滅する白い標識灯（空港のアウターマーカーのような、ここから進入の合図）
// - 港の口の進入角指示灯：船の港に置く導灯や、空港の PAPI のように、まっすぐ軸の上にいれば白、
//   少しずれると橙、大きくずれると赤に見える
// 回転するコロニーへは、回らない回転軸の上の港から入る（オニールの構想でも港は軸の端）。誘導灯も回さない。

/** 港の口（コロニーの座標。回転軸は +Y、港は -Y の端） */
const MOUTH_COLONY = -L / 2 - 0.03 - 0.1
/** 回廊の長さ（港の口から外へ） */
const REACH_COLONY = 1.6
/** 回廊の輪の数と、1 つの輪のブイの数 */
const GATES = 9
const BUOYS = 12
/** 回廊の半径：港の口で START、外へ行くほど広がる */
const START_COLONY = PORT * 1.4
const SPREAD_COLONY = 0.11

type Kind = 0 | 1 | 2 | 3
// 0 回廊のブイ、1 流れる閃光、2 外側の目印、3 進入角指示灯

function pointsTexture() {
  return radialGlowTexture([
    [0, 255, 255, 255, 1],
    [0.2, 255, 255, 255, 0.8],
    [0.5, 255, 255, 255, 0.18],
    [1, 255, 255, 255, 0],
  ])
}

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aColor;
attribute float aPhase;
attribute float aKind;
attribute float aSize;
uniform float uTime;
uniform float uPx;
uniform vec3 uPapi;
varying vec3 vColor;
varying float vGlow;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float glow = 1.0;
  vec3 color = aColor;
  if (aKind < 0.5) {
    // ブイ：ゆっくり明るさが揺れる（全部そろうと人工的なので、少しずつずらす）
    glow = 0.75 + 0.25 * sin(uTime * 2.0 + aPhase * 6.283);
  } else if (aKind < 1.5) {
    // 流れる閃光：1 秒で外から港まで走る。光った直後に尾を引いて消える
    float t = fract(uTime * 0.9 - aPhase);
    glow = exp(-t * 18.0) * 1.6 + 0.08;
  } else if (aKind < 2.5) {
    // 外側の目印：1 秒に 1 回、短く強く光る
    float t = fract(uTime * 0.8 + aPhase);
    glow = t < 0.12 ? 2.2 : 0.15;
  } else {
    color = uPapi;
    glow = 1.4;
  }
  vColor = color;
  vGlow = glow;
  // 遠くても点として見えるよう、画面で最低 2 画素。近くでは本当の大きさ
  gl_PointSize = clamp(aSize * uPx / -mv.z, 2.0, 28.0) * (0.7 + 0.3 * min(glow, 1.5));
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`
const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vGlow;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float a = texture2D(uMap, gl_PointCoord).a;
  gl_FragColor = vec4(vColor * vGlow * a, 1.0);
}
`

const WHITE = new THREE.Color(2.4, 2.4, 2.6)
const AMBER = new THREE.Color(2.6, 1.4, 0.3)
const RED = new THREE.Color(2.6, 0.25, 0.2)
const GREEN = new THREE.Color(0.3, 2.4, 0.8)
const BLUE = new THREE.Color(1.4, 1.9, 2.8)
const SOFT = new THREE.Color(2.0, 1.55, 0.7)

const mouthWorld = new THREE.Vector3()
const axisWorld = new THREE.Vector3()
const toShip = new THREE.Vector3()
const q = new THREE.Quaternion()

type Props = {
  /** 港の口の位置（回転軸 -Y の上）。既定はコロニーの港 */
  mouth?: number
  /** 回廊の長さ・口での半径・広がり方・進入角指示灯の半径（どれも親の座標）。既定はコロニーの寸法 */
  reach?: number
  start?: number
  spread?: number
  port?: number
}

/** 誘導灯。回廊は -Y へ伸びる（置く側で回して、港の外へ向ける）。寸法を渡せば、コロニー以外の港にも使える */
export function ApproachLights({ mouth: MOUTH = MOUTH_COLONY, reach: REACH = REACH_COLONY, start: START = START_COLONY, spread: SPREAD = SPREAD_COLONY, port: PORT_R = PORT }: Props = {}) {
  const points = useRef<THREE.Points>(null!)
  const { geometry, material } = useMemo(() => {
    const pos: number[] = []
    const col: number[] = []
    const phase: number[] = []
    const kind: number[] = []
    const size: number[] = []
    const add = (x: number, y: number, z: number, c: THREE.Color, k: Kind, p: number, s: number) => {
      pos.push(x, y, z)
      col.push(c.r, c.g, c.b)
      phase.push(p)
      kind.push(k)
      size.push(s)
    }
    // 回廊のブイの輪
    for (let g = 1; g <= GATES; g++) {
      const d = (g / GATES) * REACH
      const r = START + d * SPREAD
      for (let i = 0; i < BUOYS; i++) {
        const a = (i / BUOYS) * Math.PI * 2
        const x = Math.sin(a) * r
        const z = Math.cos(a) * r
        const c = i === BUOYS / 4 ? GREEN : i === (BUOYS * 3) / 4 ? RED : SOFT
        add(x, MOUTH - d, z, c, 0, g * 0.13 + i * 0.05, i % (BUOYS / 4) === 0 ? 0.012 : 0.008)
      }
    }
    // 回転軸の上の、流れる閃光（外から港へ）
    const N = 28
    for (let i = 0; i < N; i++) {
      const d = REACH * (1 - i / N) + REACH * 0.025
      add(0, MOUTH - d, 0, BLUE, 1, i / N, 0.01)
    }
    // 外側の目印（回廊の入口の四方）
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const r = START + REACH * SPREAD + REACH * 0.019
      add(Math.sin(a) * r, MOUTH - REACH - REACH * 0.0375, Math.cos(a) * r, WHITE, 2, 0, 0.022)
    }
    // 港の口の進入角指示灯（四方）
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      add(Math.sin(a) * PORT_R * 1.25, MOUTH - REACH * 0.003, Math.cos(a) * PORT_R * 1.25, WHITE, 3, 0, 0.012)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3))
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1))
    geo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1))
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1))
    geo.computeBoundingSphere()
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uPx: { value: 500 }, uPapi: { value: WHITE.clone() }, uMap: { value: pointsTexture() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    return { geometry: geo, material: mat }
  }, [MOUTH, REACH, START, SPREAD, PORT_R])
  useEffect(
    () => () => {
      geometry.dispose()
      material.uniforms.uMap.value.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame(({ clock, camera, size, gl }) => {
    const u = material.uniforms
    u.uTime.value = clock.getElapsedTime()
    // 点の大きさ：画面の高さと視野角から、距離 1 での 1 単位の画素数。コロニーの大きさ（親の拡大）も掛ける
    const cam = camera as THREE.PerspectiveCamera
    const p = points.current
    p.getWorldScale(toShip)
    u.uPx.value = (size.height * gl.getPixelRatio() * toShip.x) / (2 * Math.tan((cam.fov * Math.PI) / 360))
    // 進入角指示灯：港の口から見た自機の、回転軸からのずれの角度で色を変える
    p.localToWorld(mouthWorld.set(0, MOUTH, 0))
    p.getWorldQuaternion(q)
    axisWorld.set(0, -1, 0).applyQuaternion(q)
    toShip.copy(ship.position).sub(mouthWorld)
    const dist = toShip.length()
    const off = dist > 1e-6 ? Math.acos(THREE.MathUtils.clamp(toShip.dot(axisWorld) / dist, -1, 1)) : 0
    const deg = (off * 180) / Math.PI
    u.uPapi.value.copy(deg < 3 ? WHITE : deg < 8 ? AMBER : RED)
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />
}
