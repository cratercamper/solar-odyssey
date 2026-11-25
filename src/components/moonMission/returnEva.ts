import * as THREE from 'three'
import { makeApolloAstronaut } from '../surface/apolloSuit'
import { HIP_Y } from '../surface/astronaut'
import { EVA_FILM_AT, EVA_TIME } from '../../state/moonReturn'

// 章9 の帰り道：エバンス飛行士の船外活動（1972 年 12 月 17 日、地球と月のあいだ、1 時間 5 分 44 秒）。
// 司令船の横のハッチから出て、手すりをつたって機械船の科学機器室（SIM ベイ）へ。パノラマカメラと地図カメラの
// フィルムを取り出して、ハッチで待つシュミット飛行士に渡した。酸素は命綱（へその緒）で船から送られた。
// 座標はすべて司令船・機械船の模型の中（+Y が司令船の先、機械船は -3.4〜-10.4 m、窓とハッチは +X の側）

/** ハッチ（窓のあいだ）。円すいの面の外向き */
const HATCH = new THREE.Vector3(1.5, -1.85, 0)
const CONE_N = new THREE.Vector3(0.84, 0.54, 0).normalize()
/** 科学機器室（機械船の +X の側、上の方） */
const BAY_Y = -5.9
/** エバンス飛行士の通る道（体の真ん中、船の殻から 0.5 m ほど外） */
const PATH = new THREE.CatmullRomCurve3([
  new THREE.Vector3(1.95, -1.6, 0),
  new THREE.Vector3(2.45, -2.6, 0.15),
  new THREE.Vector3(2.85, -3.7, 0.35),
  new THREE.Vector3(2.85, -4.6, 0.45),
  new THREE.Vector3(2.8, -5.2, 0.5),
])

/** 科学機器室：開いた区画（扉は月へ行く前に外してある）と、中の機械。月を回るあいだも見えていた */
export function makeSimBay() {
  const g = new THREE.Group()
  g.name = 'sim-bay'
  const own: { dispose(): void }[] = []
  const mat = (o: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(o)
    own.push(m)
    return m
  }
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const geo = new THREE.BoxGeometry(w, h, d)
    own.push(geo)
    const b = new THREE.Mesh(geo, m)
    b.position.set(x, y, z)
    b.castShadow = b.receiveShadow = true
    g.add(b)
    return b
  }
  const dark = mat({ color: '#141416', roughness: 0.9 })
  const kapton = mat({ color: '#c99a3a', roughness: 0.45, metalness: 0.6 })
  const gray = mat({ color: '#8c8f94', roughness: 0.5, metalness: 0.5 })
  const white = mat({ color: '#dcdcd6', roughness: 0.6 })
  // 区画のくぼみ（機械船の円の外側を少しおおう、暗い箱）
  box(0.08, 3.7, 1.9, dark, 2.2, BAY_Y, 0.45)
  // パノラマカメラ（上、大きい）・地図カメラ（下）・レーダーのアンテナの台・小さな機械
  box(0.36, 1.05, 0.9, kapton, 2.12, BAY_Y + 1.15, 0.5)
  box(0.3, 0.7, 0.6, gray, 2.14, BAY_Y + 0.05, 0.25)
  box(0.24, 0.5, 0.5, kapton, 2.16, BAY_Y - 0.75, 0.75)
  box(0.22, 0.45, 0.35, white, 2.17, BAY_Y - 1.4, 0.2)
  // フィルムの箱の取っ手（取り出す所）
  box(0.12, 0.3, 0.42, gray, 2.3, BAY_Y + 1.1, 0.5)
  // 手すり：ハッチから機械船へ（金色の細い棒）
  const rail = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([new THREE.Vector3(1.62, -1.25, 0.42), new THREE.Vector3(2.05, -2.6, 0.55), new THREE.Vector3(2.32, -3.6, 0.7), new THREE.Vector3(2.32, -4.3, 0.85)]),
    24,
    0.022,
    6,
  )
  own.push(rail)
  const r = new THREE.Mesh(rail, kapton)
  g.add(r)
  return { group: g, dispose: () => own.forEach((o) => o.dispose()) }
}

export type EvaScene = ReturnType<typeof makeEvaScene>

export function makeEvaScene() {
  const group = new THREE.Group()
  group.name = 'eva'
  group.visible = false
  // アポロ 17 号の宇宙服（A7LB）。深い宇宙の船外活動は、命綱から酸素をもらう：エバンス飛行士は背中に非常用の酸素だけ、
  // 金色のバイザーの日よけ。シュミット飛行士はハッチの中なので、背中に何も無く、泡のヘルメットのまま
  const evans = makeApolloAstronaut({ back: 'ops', leva: true, cdr: false, rcu: false })
  const schmitt = makeApolloAstronaut({ back: 'none', leva: false, cdr: false, rcu: false })
  group.add(evans.root, schmitt.root)
  // フィルムの箱（パノラマカメラのフィルムは、重さ 約 40 kg の箱）
  const casGeo = new THREE.BoxGeometry(0.34, 0.26, 0.4)
  const casMat = new THREE.MeshStandardMaterial({ color: '#5d6066', roughness: 0.5, metalness: 0.5 })
  const cassette = new THREE.Mesh(casGeo, casMat)
  cassette.castShadow = true
  evans.elbows[1].add(cassette)
  cassette.position.set(0, -0.42, 0.12)
  // 命綱：ハッチからエバンス飛行士の胸へ（たるんでゆれる）。太さ 4 cm ほどの白い布でおおったホース
  const N = 40
  const RS = 8
  const CORD_R = 0.022
  const cordPos = new Float32Array(N * RS * 3)
  const cordNor = new Float32Array(N * RS * 3)
  const cordIdx: number[] = []
  for (let i = 0; i < N - 1; i++)
    for (let j = 0; j < RS; j++) {
      const a = i * RS + j
      const b = i * RS + ((j + 1) % RS)
      cordIdx.push(a, b, a + RS, b, b + RS, a + RS)
    }
  const cordGeo = new THREE.BufferGeometry()
  cordGeo.setAttribute('position', new THREE.BufferAttribute(cordPos, 3))
  cordGeo.setAttribute('normal', new THREE.BufferAttribute(cordNor, 3))
  cordGeo.setIndex(cordIdx)
  const cordMat = new THREE.MeshStandardMaterial({ color: '#e9e5da', roughness: 0.85 })
  const cord = new THREE.Mesh(cordGeo, cordMat)
  cord.frustumCulled = false
  cord.castShadow = true
  group.add(cord)
  const _t = new THREE.Vector3()
  const _n = new THREE.Vector3()
  const _b = new THREE.Vector3()
  const _q = new THREE.Vector3()
  const sim = makeSimBay()

  const _p = new THREE.Vector3()
  const _d = new THREE.Vector3()
  const _x = new THREE.Vector3()
  const _y = new THREE.Vector3()
  const _z = new THREE.Vector3()
  const _m = new THREE.Matrix4()
  const _c = new THREE.Vector3()
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3())

  /** 道の上の位置（0 ハッチ 〜 1 科学機器室）。行き・取り出す・帰り・渡す */
  function along(t: number) {
    const go = THREE.MathUtils.smootherstep(t, 2.5, 8.5)
    const back = THREE.MathUtils.smootherstep(t, 13.5, 19.5)
    return { s: go * (1 - back), heading: t < 11.5 ? -1 : 1 }
  }

  /** t：船外活動の秒。chest（模型の中の座標）に胸の位置を返す */
  function update(t: number, time: number, chest: THREE.Vector3) {
    const { s, heading } = along(t)
    // 出てくる：はじめの 2.5 秒はハッチから体が出てくる
    const out = THREE.MathUtils.smoothstep(t, 0, 2.5)
    PATH.getPointAt(s, _p)
    PATH.getTangentAt(Math.min(0.999, Math.max(0.001, s)), _d)
    if (s < 0.02) _p.lerp(_c.copy(HATCH).addScaledVector(CONE_N, -0.4), 1 - out)
    // 体の向き：頭が進む向き（行きは機械船の方、帰りは司令船の方）、おなかが船の側
    _y.copy(_d).multiplyScalar(heading)
    if (t > 11 && t < 12.5) {
      // 向きをかえる（くるりと回る）
      const k = THREE.MathUtils.smootherstep(t, 11, 12.5)
      _y.copy(_d).multiplyScalar(-1).lerp(_c.copy(_d), k).normalize()
      if (_y.lengthSq() < 0.01) _y.set(1, 0, 0)
    }
    _z.set(-1, 0, -0.1).normalize()
    _x.crossVectors(_y, _z).normalize()
    _z.crossVectors(_x, _y).normalize()
    _m.makeBasis(_x, _y, _z)
    evans.root.quaternion.setFromRotationMatrix(_m)
    // 足もとが原点の模型なので、胸（高さ 1.3 m）が道の上に来るように
    evans.root.position.copy(_p).addScaledVector(_y, -1.25)
    // 手で手すりをたぐる（かわりばんこ）。止まっているときは、ゆっくり
    const moving = Math.abs(THREE.MathUtils.smootherstep(t + 0.05, 2.5, 8.5) - THREE.MathUtils.smootherstep(t - 0.05, 2.5, 8.5)) + Math.abs(THREE.MathUtils.smootherstep(t + 0.05, 13.5, 19.5) - THREE.MathUtils.smootherstep(t - 0.05, 13.5, 19.5))
    const ph = time * (moving > 0.002 ? 3.2 : 0.8)
    const carry = t > EVA_FILM_AT + 1 && t < 20.5
    for (let i = 0; i < 2; i++) {
      const sw = Math.sin(ph + i * Math.PI)
      evans.shoulders[i].rotation.set(-2.5 + sw * 0.45, 0, (i === 0 ? 1 : -1) * 0.15)
      evans.elbows[i].rotation.set(-0.5 - Math.max(0, sw) * 0.5, 0, 0)
    }
    if (carry) {
      // 右手で箱を持つ（腕を下へ）
      evans.shoulders[1].rotation.set(-0.5, 0, -0.25)
      evans.elbows[1].rotation.set(-0.9, 0, 0)
    } else if (t > EVA_FILM_AT - 1.5 && t <= EVA_FILM_AT + 1) {
      // 科学機器室に手を入れる
      evans.shoulders[1].rotation.set(-1.4, 0, -0.2)
      evans.elbows[1].rotation.set(-0.3, 0, 0)
    }
    // 足は、うしろへ流れる（なにも踏んでいない）
    for (let i = 0; i < 2; i++) {
      evans.hips[i].rotation.set(0.15 + Math.sin(time * 0.7 + i) * 0.12, 0, (i === 0 ? 1 : -1) * 0.08)
      evans.knees[i].rotation.set(0.35 + Math.sin(time * 0.9 + i * 2) * 0.1, 0, 0)
    }
    evans.update?.()
    cassette.visible = carry
    // シュミット飛行士：ハッチから上半身を出して見守る（足は船の中）。顔は機械船の方へ
    _y.copy(CONE_N)
    _z.set(0, -1, 0.35).projectOnPlane(_y).normalize()
    _x.crossVectors(_y, _z).normalize()
    _m.makeBasis(_x, _y, _z)
    schmitt.root.quaternion.setFromRotationMatrix(_m)
    schmitt.root.position.copy(HATCH).addScaledVector(CONE_N, -0.95)
    schmitt.shoulders[0].rotation.set(-0.3, 0, 0.2)
    schmitt.shoulders[1].rotation.set(t > 19 && t < 21.5 ? -1.6 : -0.4, 0, -0.2)
    schmitt.root.visible = t > 3
    schmitt.update?.()
    // 胸の位置
    chest.copy(_p)
    // 命綱：ハッチから胸へ、外へふくらんでたるむ
    const a = _c.copy(HATCH).addScaledVector(CONE_N, 0.05)
    // 先は胸の酸素の口（体の右の上の口。宇宙服の模型の中で、腰から 0.38 m 上・前へ 0.26 m）
    const plug = _q.set(-0.055, HIP_Y + 0.38, 0.26).applyQuaternion(evans.root.quaternion).add(evans.root.position)
    const len = a.distanceTo(plug)
    curve.v0.copy(a)
    curve.v2.copy(plug)
    curve.v1.copy(a).lerp(plug, 0.5).add(_d.set(0.9 + len * 0.25, Math.sin(time * 0.6) * 0.3, 0.4 + Math.cos(time * 0.5) * 0.35))
    // 筒の輪：曲線の向き（t）に直角な 2 本（n・b）で回す。n は前の輪からなめらかに受けつぐ
    _n.set(0, 0, 1)
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1)
      curve.getPoint(u, _p)
      curve.getTangent(u, _t)
      _n.addScaledVector(_t, -_n.dot(_t))
      if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0).addScaledVector(_t, -_t.x)
      _n.normalize()
      _b.crossVectors(_t, _n)
      for (let j = 0; j < RS; j++) {
        const a = (j / RS) * Math.PI * 2
        _q.copy(_n).multiplyScalar(Math.cos(a)).addScaledVector(_b, Math.sin(a))
        const k = (i * RS + j) * 3
        cordNor[k] = _q.x
        cordNor[k + 1] = _q.y
        cordNor[k + 2] = _q.z
        cordPos[k] = _p.x + _q.x * CORD_R
        cordPos[k + 1] = _p.y + _q.y * CORD_R
        cordPos[k + 2] = _p.z + _q.z * CORD_R
      }
    }
    cordGeo.attributes.position.needsUpdate = true
    cordGeo.attributes.normal.needsUpdate = true
    group.visible = t >= 0 && t <= EVA_TIME + 0.5
  }

  const dispose = () => {
    casGeo.dispose()
    casMat.dispose()
    cordGeo.dispose()
    cordMat.dispose()
    sim.dispose()
    for (const r of [evans, schmitt]) for (const m of r.materials) m.dispose()
  }
  return { group, evans, schmitt, sim, update, hatch: HATCH, coneN: CONE_N, bayY: BAY_Y, dispose }
}
