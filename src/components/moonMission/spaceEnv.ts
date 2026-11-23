import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// 宇宙船に映りこむ「まわりの景色」（環境マップ）。宇宙は真っ黒で、映るのは近くの大きな天体（月か地球）だけ。
// 本物の写真（AS17-145-22261 など、月を回る司令船）でも、銀の司令船には下の月面が映り、上は黒い。
// 部屋の照明（RoomEnvironment）を映すと、宇宙なのに室内の光の板が映ってしまうので、こちらに置きかえる。
//
// 天体は、カメラを原点にして、向き down・見かけの半径 angR の球として、1 方向ずつ計算で描く（光線と球の交わり）。
// 明るさは、太陽の光（平行光の強さ sunI）を受けた、白さ albedo の面の明るさ（albedo × sunI / π × 光の当たり方）。
// 太陽そのものは映しこまない（平行光の照り返しで出る）。向きが 1.5° 以上かわったら、0.5 秒に 1 回まで作りなおす。

export type SpaceBody = {
  /** カメラから天体の中心への向き（ワールド） */
  down: THREE.Vector3
  /** 天体の見かけの半径（ラジアン） */
  angR: number
  /** 太陽の向き（ワールド） */
  sun: THREE.Vector3
  /** 地球なら true（青白く、縁に大気）。省くと useSpaceEnv の kind */
  earth?: boolean
  /** 大気の中（0〜1）：1 なら上は青い空、下は海（down が真下）。帰りの着水の場面 */
  air?: number
}

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
uniform vec3 uDown;
uniform vec3 uSun;
uniform float uDist;
uniform vec3 uAlbedo;
uniform vec3 uRim;
uniform float uSunI;
uniform float uAir;
varying vec3 vDir;
void main() {
  vec3 v = normalize(vDir);
  vec3 c = uDown * uDist;
  float b = dot(v, c);
  float disc = b * b - (uDist * uDist - 1.0);
  // 黒い空にも、ほんの少しの明かり（星明かり・カメラの補助光のつもり）。影の側の船体が真っ黒で見えなくならないように
  vec3 col = vec3(0.03, 0.032, 0.036);
  if (disc > 0.0 && b > 0.0) {
    float t = b - sqrt(disc);
    vec3 n = normalize(v * t - c);
    float lit = max(0.0, dot(n, uSun));
    // 縁（見かけのふち）ほど、地球なら大気で青白く
    float rim = pow(1.0 - max(0.0, dot(n, -v)), 3.0);
    col = max(col, (uAlbedo + uRim * rim) * uSunI / 3.14159 * lit);
  }
  if (uAir > 0.0) {
    // 大気の中：地平線ほど白っぽい青空と、暗い青の海。太陽が高いほど明るい
    float h = dot(v, -uDown);
    float day = clamp(dot(-uDown, uSun) * 1.6 + 0.25, 0.15, 1.0);
    vec3 sky = mix(vec3(0.75, 0.85, 1.0), vec3(0.22, 0.38, 0.78), sqrt(max(0.0, h))) * 0.9;
    vec3 sea = mix(vec3(0.08, 0.13, 0.18), vec3(0.015, 0.04, 0.07), sqrt(max(0.0, -h)));
    col = mix(col, (h > 0.0 ? sky : sea) * day, uAir);
  }
  gl_FragColor = vec4(col, 1.0);
}
`

// 白さは、画面に描いた月・地球の明るさに合わせる（本物の反射率 0.12 だと、描いた月よりずっと暗く映って、銀の機体が黒っぽく見えた）
const MOON = { albedo: new THREE.Color(0.42, 0.4, 0.38), rim: new THREE.Color(0, 0, 0) }
const EARTH = { albedo: new THREE.Color(0.3, 0.37, 0.5), rim: new THREE.Color(0.25, 0.4, 0.7) }

/**
 * scene.environment を宇宙の景色にする。body() は毎フレーム呼ばれ、天体の向き・見かけの大きさ・太陽の向きを返す。
 * kind で月（灰色）か地球（青白く、縁に大気）。intensity は scene.environmentIntensity（本物の明るさなら 1）
 */
export function useSpaceEnv(body: () => SpaceBody, kind: 'moon' | 'earth', intensity = 1) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const env = useMemo(() => {
    const look = kind === 'moon' ? MOON : EARTH
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uDown: { value: new THREE.Vector3(0, -1, 0) },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uDist: { value: 2 },
        uAlbedo: { value: look.albedo.clone() },
        uRim: { value: look.rim.clone() },
        uSunI: { value: 4.2 },
        uAir: { value: 0 },
      },
    })
    const sky = new THREE.Scene()
    sky.background = new THREE.Color(0, 0, 0)
    sky.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat))
    return { mat, sky, pmrem: new THREE.PMREMGenerator(gl), rt: null as THREE.WebGLRenderTarget | null, last: -1e9, down: new THREE.Vector3(), sun: new THREE.Vector3(), angR: -1, earth: kind === 'earth', air: 0 }
  }, [gl, kind])

  useEffect(() => {
    return () => {
      if (env.rt && scene.environment === env.rt.texture) scene.environment = null
      env.rt?.dispose()
      env.pmrem.dispose()
      env.mat.dispose()
      env.sky.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    }
  }, [env, scene])

  useFrame(({ clock }) => {
    const b = body()
    const now = clock.elapsedTime
    const earth = b.earth ?? kind === 'earth'
    const air = b.air ?? 0
    const turned = earth !== env.earth || Math.abs(air - env.air) > 0.05 || env.down.angleTo(b.down) > 0.026 || env.sun.angleTo(b.sun) > 0.026 || Math.abs(env.angR - b.angR) > 0.017
    if (env.rt && (!turned || now - env.last < 0.5)) {
      if (scene.environment !== env.rt.texture) scene.environment = env.rt.texture
      scene.environmentIntensity = intensity
      return
    }
    env.last = now
    env.down.copy(b.down)
    env.sun.copy(b.sun)
    env.angR = b.angR
    env.earth = earth
    env.air = air
    const u = env.mat.uniforms
    u.uAir.value = air
    const look = earth ? EARTH : MOON
    u.uAlbedo.value.copy(look.albedo)
    u.uRim.value.copy(look.rim)
    u.uDown.value.copy(b.down).normalize()
    u.uSun.value.copy(b.sun).normalize()
    // 半径 1 の球を、見かけの半径が angR になる距離に置く（真下に近いほど 1 に近い）
    u.uDist.value = 1 / Math.max(0.01, Math.min(0.9999, Math.sin(Math.max(0.0005, b.angR))))
    const old = env.rt
    env.rt = env.pmrem.fromScene(env.sky, 0, 0.1, 100, { size: 128 })
    scene.environment = env.rt.texture
    scene.environmentIntensity = intensity
    old?.dispose()
  })
}
