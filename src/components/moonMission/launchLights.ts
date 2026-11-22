import * as THREE from 'three'
import { moundHeight } from './launchSite'
import { glowTexture } from './plume'
import { OUT_CHUNK, encodeOutput } from './shaderOut'

// 発射台を夜に照らす投光器（サーチライト）。地面の組の中に置く。
//
// 本物（NASA の写真 S72-54813）では、発射台から数百 m 離れたところに投光器が何台かずつ並び、
// 夜の湿った空気の中に、細い光の柱が何本も斜めに立ち上がって、白いロケットだけが暗闇に浮かぶ。
// - 投光器の列（ARRAYS）ごとに、本当に照らす光は 1 つ（影なし）。灯体は光る小さな箱と、にじみの板で見せる
// - 光の柱は、列ごとに 5 本の細い円すいを少しずつ向きを変えて重ねる。根元が明るく、遠いほど薄く、霧のむらでゆらぐ

const Y = new THREE.Vector3(0, 1, 0)

type LampArray = {
  /** 列のまん中（地面の組の x, z） */
  at: [number, number]
  /** 灯の数 */
  n: number
}
/** 投光器の列。ロケットのまわり 3 方向、150〜230 m（写真のように、光の柱が急な角度で立ち上がる近さ） */
const ARRAYS: LampArray[] = [
  { at: [-170, 150], n: 3 },
  { at: [-200, -130], n: 3 },
  { at: [160, 170], n: 2 },
]
/** 照らす先（ロケットの胴のまん中あたり） */
const AIM = new THREE.Vector3(0, 55, 0)
/** 1 列の明るさ */
export const SPOT_POWER = 0.4e6
/** 光の柱の色 */
const BEAM_COLOR = new THREE.Color('#cfe0ff')

function beamMaterial() {
  return encodeOutput(
    new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float aS;
        varying float vS; varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vD;
        void main(){
          vS = aS;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vec4 mv = viewMatrix * w;
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          vD = -mv.z;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform float uPower; uniform float uTime; uniform float uLen; uniform vec3 uColor; uniform vec3 uAxis;
        varying float vS; varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vD;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float noise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          vec3 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), u.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), u.x), u.y),
                     mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), u.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), u.x), u.y), u.z);
        }
        void main(){
          #include <logdepthbuf_fragment>
          // 縁はうすく（円すいを横から見たときの、光の柱の太さのむら）
          float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
          // 根元が明るく、遠いほど薄い。先は空へ溶ける
          float d = vS * uLen;
          float along = 1.0 / (1.0 + pow(d / 520.0, 2.0));
          float ends = smoothstep(0.0, 0.015, vS) * smoothstep(1.0, 0.6, vS);
          // 霧のむら：ゆっくり流れる
          float haze = 0.55 + 0.45 * noise(vW * 0.018 + vec3(uTime * 0.03, 0.0, uTime * 0.02)) + 0.2 * noise(vW * 0.07);
          // カメラが光の柱のすぐそばにいるときは、目の前の柱を消す（大きな白い帯に見えないように）
          float near = smoothstep(15.0, 70.0, vD);
          // 柱を根元や先から縦に見通すと、内側の面が重なって白く飛ぶので、見通す向きほど薄く
          near *= 1.0 - smoothstep(0.8, 0.97, abs(dot(normalize(vW - cameraPosition), uAxis)));
          float a = rim * along * ends * haze * near * 0.5 * uPower;
          gl_FragColor = vec4(uColor * a, a);
          ${OUT_CHUNK}
        }`,
      uniforms: { uPower: { value: 1 }, uTime: { value: 0 }, uLen: { value: 700 }, uColor: { value: BEAM_COLOR.clone() }, uAxis: { value: new THREE.Vector3(0, 1, 0) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  )
}

/** 根元（原点）から +y へ長さ len、先の半径 rFar の円すい。aS は根元 0 〜 先 1 */
function coneGeometry(len: number, rNear: number, rFar: number) {
  const g = new THREE.CylinderGeometry(rFar, rNear, len, 24, 12, true)
  g.translate(0, len / 2, 0)
  const pos = g.getAttribute('position')
  const s = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) s[i] = pos.getY(i) / len
  g.setAttribute('aS', new THREE.BufferAttribute(s, 1))
  return g
}

export type Floodlights = {
  group: THREE.Group
  /** 司令船の中にいるあいだは、照明の光を消す（外の明かりが船室に入らないように） */
  setInside(inside: boolean): void
  /** 光の柱の濃さ（0〜1。点火の炎でまぶしいあいだは薄く見える）と時刻 */
  update(power: number, t: number): void
  /** 明かりがついた割合（0〜1）。夕方のタイムラプスで、列ごとに順につく */
  setOn(k: number): void
  /** 列ごとの灯の位置（地面の組の座標）と、ついている割合（水面の映り込みに使う） */
  lamps: { pos: THREE.Vector3; on: number }[]
  dispose(): void
}

export function buildFloodlights(): Floodlights {
  const group = new THREE.Group()
  group.name = 'Floodlights'
  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  const beamMats: THREE.ShaderMaterial[] = []
  const spots: THREE.SpotLight[] = []
  /** 列ごとの光の柱・灯体の明るさ（つく割合） */
  const arrayOf: number[] = []
  const heads: THREE.MeshBasicMaterial[] = []
  const glows: THREE.SpriteMaterial[] = []
  const on: number[] = ARRAYS.map(() => 1)
  let inside = false
  // 灯体：光る小さな面（光のにじみで輝いて見える明るさ）と、黒い台
  const headGeo = new THREE.BoxGeometry(1.4, 1.4, 0.6)
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8f0ff').multiplyScalar(6) })
  const baseGeo = new THREE.BoxGeometry(2.2, 1.2, 1.6)
  const baseMat = new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.8 })
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#bcd2ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  geos.push(headGeo, baseGeo)
  mats.push(headMat, baseMat, glowMat)
  let seed = 1
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (const [ai, arr] of ARRAYS.entries()) {
    const [cx, cz] = arr.at
    const head1 = headMat.clone()
    const glow1 = glowMat.clone()
    heads.push(head1)
    glows.push(glow1)
    mats.push(head1, glow1)
    const center = new THREE.Vector3(cx, moundHeight(cx, cz) + 1.6, cz)
    // 列は、ロケットへの向きに直角に並べる
    const toRocket = new THREE.Vector3(-cx, 0, -cz).normalize()
    const side = new THREE.Vector3(-toRocket.z, 0, toRocket.x)
    const dist = center.distanceTo(AIM)
    for (let i = 0; i < arr.n; i++) {
      const from = center.clone().addScaledVector(side, (i - (arr.n - 1) / 2) * 5)
      // 光の柱は、ロケットのすぐそばを通って夜空へ抜ける（写真では、ロケットの上半分から上の空へ扇のように開く）
      const aim = new THREE.Vector3((rnd() - 0.5) * 40, 110 + rnd() * 170, (rnd() - 0.5) * 40)
      const dir = aim.clone().sub(from).normalize()
      const len = dist * 3 + 900 + rnd() * 300
      const geo = coneGeometry(len, 0.7, Math.tan((2.6 + rnd() * 2.4) * THREE.MathUtils.DEG2RAD) * len)
      const mat = beamMaterial()
      mat.uniforms.uLen.value = len
      mat.uniforms.uAxis.value.copy(dir)
      mat.uniforms.uPower.value = 0.75 + rnd() * 0.5
      mat.userData.base = mat.uniforms.uPower.value
      geos.push(geo)
      beamMats.push(mat)
      arrayOf.push(ai)
      const beam = new THREE.Mesh(geo, mat)
      beam.position.copy(from)
      beam.quaternion.setFromUnitVectors(Y, dir)
      beam.renderOrder = 2
      group.add(beam)
      const head = new THREE.Mesh(headGeo, head1)
      head.position.copy(from).addScaledVector(Y, 0.6)
      head.lookAt(aim)
      group.add(head)
      const base = new THREE.Mesh(baseGeo, baseMat)
      base.position.copy(from).addScaledVector(Y, -0.6)
      group.add(base)
      const glow = new THREE.Sprite(glow1)
      glow.position.copy(head.position)
      glow.scale.setScalar(4)
      group.add(glow)
    }
    // 本当に照らす光は、列ごとに 1 つ
    // 広めに当てて、ロケットの根元・移動発射台・盛り土の斜面まで照らす（写真では台のまわりも明るい）
    const spot = new THREE.SpotLight('#dfe8ff', SPOT_POWER, 0, 0.42, 0.55, 2)
    spot.position.copy(center).addScaledVector(Y, 1)
    spot.target.position.set(0, 28, 0)
    group.add(spot, spot.target)
    spots.push(spot)
  }
  for (const m of beamMats) mats.push(m)
  const lamps = ARRAYS.map((a) => ({ pos: new THREE.Vector3(a.at[0], moundHeight(a.at[0], a.at[1]) + 2.2, a.at[1]), on: 1 }))
  return {
    group,
    lamps,
    setInside(v) {
      inside = v
      spots.forEach((s, i) => (s.intensity = inside ? 0 : SPOT_POWER * on[i]))
    },
    update(power, t) {
      beamMats.forEach((m, i) => {
        m.uniforms.uPower.value = m.userData.base * power * on[arrayOf[i]]
        m.uniforms.uTime.value = t
      })
    },
    setOn(k) {
      // 列ごとに順に、ぱっと（少しまたたいて）つく
      for (let i = 0; i < on.length; i++) {
        const x = THREE.MathUtils.clamp((k * on.length - i) * 4, 0, 1)
        on[i] = x > 0 && x < 1 ? x * (0.6 + 0.4 * Math.sin(x * 40)) : x
        heads[i].color.copy(headMat.color).multiplyScalar(0.02 + 0.98 * on[i])
        glows[i].opacity = on[i]
        spots[i].intensity = inside ? 0 : SPOT_POWER * on[i]
        lamps[i].on = on[i]
      }
    },
    dispose() {
      for (const g of geos) g.dispose()
      for (const m of mats) m.dispose()
    },
  }
}
