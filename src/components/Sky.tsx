import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { textureUrl } from '../data/textures'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { bodies } from '../state/registry'
import { photoUniform, starExposure } from '../state/look'
import { useLevel } from '../state/quality'
import { MILKY_WAY_ROTATION } from '../data/skyFrame'

/** 天の川の淡い光の明るさ（星の点を除いた画像。星は星表の点で描く） */
const BASE = new THREE.Color('#5a5a5a')
const center = new THREE.Vector3()
const toBody = new THREE.Vector3()
const forward = new THREE.Vector3()

/**
 * 写真モードの自動露出：日の当たった明るい天体が画面に大きく映っているほど、背景の星を暗くする。
 * カメラは明るい天体に露出を合わせるので、それよりずっと暗い星は写らない
 */
function brightOnScreen(camera: THREE.PerspectiveCamera) {
  const halfV = (camera.fov * Math.PI) / 360
  const halfH = Math.atan(Math.tan(halfV) * camera.aspect)
  const halfDiag = Math.atan(Math.hypot(Math.tan(halfV), Math.tan(halfH)))
  camera.getWorldDirection(forward)
  let sum = 0
  for (const b of bodies.values()) {
    b.object.getWorldPosition(center)
    toBody.subVectors(center, camera.position)
    const d = toBody.length()
    if (d < b.radius) return 1
    const a = Math.asin(b.radius / d)
    // 画面の外なら数えない
    if (Math.acos(THREE.MathUtils.clamp(toBody.dot(forward) / d, -1, 1)) > halfDiag + a) continue
    const area = Math.min((Math.PI * a * a) / (4 * halfV * halfH), 1)
    if (b.id === 'sun') {
      sum += Math.max(area, 0.004) * 60
      continue
    }
    // 見えている昼側の割合（位相）
    const cosPhase = center.lengthSq() > 0 ? -toBody.dot(center) / (d * center.length()) : 1
    sum += area * (1 + cosPhase) * 0.5
  }
  return sum
}

// ── 星表の星 ──
// 宇宙では大気がないので、星は瞬かない。ぼやけずに、針で突いたような鋭い点のまま光り続ける。
// 明るさは等級どおり、色は表面温度どおり（scripts/build-stars.mjs が作る public/stars/bsc5.bin）

/** 表面温度（K）の色（黒体の色の近似。ほんの少し白に寄せる） */
function starColor(k: number, out: THREE.Color) {
  const t = k / 100
  const r = t <= 66 ? 1 : THREE.MathUtils.clamp(1.293 * Math.pow(t - 60, -0.1332), 0, 1)
  const g = t <= 66 ? THREE.MathUtils.clamp(0.39 * Math.log(t) - 0.6318, 0, 1) : THREE.MathUtils.clamp(1.1298 * Math.pow(t - 60, -0.0755), 0, 1)
  const b = t >= 66 ? 1 : t <= 19 ? 0 : THREE.MathUtils.clamp(0.5432 * Math.log(t - 10) - 1.1962, 0, 1)
  return out.setRGB(r, g, b).lerp(WHITE, 0.12)
}
const WHITE = new THREE.Color(1, 1, 1)
/** 軽い画質で描く暗さの限界（等級） */
const LOW_LIMIT = 5.6

let catalog: Promise<THREE.BufferGeometry> | null = null
export function loadCatalog() {
  catalog ??= fetch(`${import.meta.env.BASE_URL}stars/bsc5.bin`)
    .then((r) => {
      if (!r.ok) throw new Error(`stars ${r.status}`)
      return r.arrayBuffer()
    })
    .then((buf) => {
      const raw = new Int16Array(buf)
      const n = raw.length / 5
      const pos = new Float32Array(n * 3)
      const col = new Float32Array(n * 3)
      const mag = new Float32Array(n)
      const c = new THREE.Color()
      let low = n
      for (let i = 0; i < n; i++) {
        const o = i * 5
        pos[i * 3] = (raw[o] / 32767) * STAR_RADIUS
        pos[i * 3 + 1] = (raw[o + 1] / 32767) * STAR_RADIUS
        pos[i * 3 + 2] = (raw[o + 2] / 32767) * STAR_RADIUS
        mag[i] = raw[o + 3] / 1000
        if (low === n && mag[i] > LOW_LIMIT) low = i
        starColor(raw[o + 4], c)
        c.toArray(col, i * 3)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      g.setAttribute('mag', new THREE.BufferAttribute(mag, 1))
      g.userData.low = low
      return g
    })
  return catalog
}

const STAR_RADIUS = 1800

export const starVertex = /* glsl */ `
  attribute float mag;
  attribute vec3 color;
  uniform float uPx;
  uniform float uExposure;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    // 1 等星を 1 とした光の量。暗い場所で目が慣れると、暗い星もよく見える（目で見た明るさの差は、
    // 光の量の差よりずっと小さい）ので、強めに縮める
    float flux = pow(10.0, -0.4 * (mag - 1.5) * 0.6) * uExposure;
    // 明るい星ほど点を大きく（光のしみ出し）。暗い星は点の大きさはそのままで暗くする
    float size = clamp(1.5 + 1.8 * sqrt(flux), 1.5, 7.0);
    // 画面の倍率が 1 より小さい（軽量）ときも、点が細くなりすぎないように
    vSize = size * max(uPx, 1.0);
    // 点に配る明るさ：芯の明るさがおよそ光の量になるように
    vColor = color * min(flux * 2.4, 3.4);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = vSize + 2.0;
  }
`

export const starFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vSize;
  void main() {
    // 芯はくっきり、まわりはすぐ落ちる（ぼやけたにじみにしない）
    float r = length(gl_PointCoord - 0.5) * (vSize + 2.0) ;
    float core = exp(-r * r / (0.18 * vSize * vSize + 0.35));
    if (core < 0.004) discard;
    gl_FragColor = vec4(vColor * core, 1.0);
  }
`

function CatalogStars() {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const level = useLevel()
  const gl = useThree((s) => s.gl)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uPx: { value: 1 }, uExposure: { value: 1 } },
        vertexShader: starVertex,
        fragmentShader: starFragment,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => {
    let alive = true
    loadCatalog().then(
      (g) => alive && setGeometry(g),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    if (geometry) geometry.setDrawRange(0, level === 'low' ? geometry.userData.low : Infinity)
  }, [geometry, level])
  useFrame(() => {
    material.uniforms.uPx.value = gl.getPixelRatio()
    material.uniforms.uExposure.value = starExposure.value
  })
  if (!geometry) return null
  return <points geometry={geometry} material={material} renderOrder={-0.5} frustumCulled={false} />
}

/**
 * 背景の空：天の川の全天画像（淡い光として）と、星表の本物の星。遠くの星なので、どこへ行ってもカメラと一緒に動かす。
 * follow=false は、親がもうカメラについて動いているとき（船外の場面の Distant）。二重に足すと、
 * カメラが原点から離れるほど星の球がずれて、遠くへ行くと球の外に出てしまう
 */
export function Sky({ follow = true }: { follow?: boolean }) {
  const map = useOptionalTexture(textureUrl('milkyWayGlow'))
  const group = useRef<THREE.Group>(null!)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ camera }, delta) => {
    if (follow) group.current.position.copy(camera.position)
    // 図鑑モードはいつも同じ明るさ。写真モードは明るい天体の映り方で、なめらかに変える
    const target = photoUniform.value > 0.5 ? 1 - 0.96 * THREE.MathUtils.smoothstep(brightOnScreen(camera as THREE.PerspectiveCamera), 0.003, 0.08) : 1
    starExposure.value += (target - starExposure.value) * (1 - Math.exp(-delta * 2.5))
    material.current?.color.copy(BASE).multiplyScalar(starExposure.value)
  })
  return (
    <group ref={group}>
      {map ? (
        <mesh renderOrder={-1} quaternion={MILKY_WAY_ROTATION}>
          <sphereGeometry args={[2000, 64, 64]} />
          <meshBasicMaterial ref={material} map={map} side={THREE.BackSide} color={BASE} depthWrite={false} depthTest={false} />
        </mesh>
      ) : null}
      <CatalogStars />
    </group>
  )
}
