import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { asteroids, bodies, registerBody, rockBreaks } from '../../../state/registry'
import { ship, standoff, thrustFx } from '../../../state/flight'
import { proximity } from '../../../state/proximity'
import { useStore } from '../../../state/store'
import { shipScale } from '../../../state/zoom'
import { capacity, collect, deliver, foundRare, rareSalt, rareTakenToday, setNear, upgradeLevel, usePioneer, type Near } from '../../../state/pioneer'
import { gasFx, shipOnScreen } from '../../../state/pioneerFx'
import { BuildCinema } from './BuildCinema'
import { FIELD_ID, GAS_BAND, rockResource, goal, RING_COUNT, total, GAS_MIN_SPEED, GAS_RATE, GAS_TOO_DEEP, rockYield, magnetFactor, scoopFactor, shipTrait, isRare, RARE_BONUS, RARE_BY_TYPE, type Resource } from '../../../data/pioneer'
import { DOCK_ID } from '../../../data/sf'
import { ui } from '../../../i18n'

// 開拓の 3D の部分（開拓で遊んでいるあいだだけ読み込む）：
// - 小惑星帯の「採掘場」の目印（ワープの行き先。帯の岩の 1 つにくっついて回る）
// - 砕いた岩から出る資源のかけら。船へ吸い寄せられて、積み荷に入る
// - 木星の雲のすぐ上をかすめて飛ぶと、ガスがたまる
// - 天の湊のそばに来ると、積み荷を倉庫に納める

const FIELD_RADIUS = 0.2
/** かけらの数の上限（古いものから消える） */
const MAX_ORE = 160
/** この距離（表示単位）より近いかけらは船へ吸い寄せる。チャージビームが岩を砕ける距離（約 30）より少し広い */
const ATTRACT = 40
/** かけらが残る秒数 */
const ORE_LIFE = 90
const COLORS: Record<Resource, THREE.Color> = {
  // 光ってにじむくらい（明るすぎると白く飛んで、色の区別がつかない）
  metal: new THREE.Color(1.7, 0.85, 0.22),
  ice: new THREE.Color(0.35, 1.25, 1.9),
  gas: new THREE.Color(1.4, 0.75, 1.6),
}

type Ore = { pos: THREE.Vector3; vel: THREE.Vector3; resource: Resource; amount: number; born: number }

/** この距離より近い岩に輪を付ける（表示単位） */
const RING_RANGE = 12
/** 輪を付ける岩を探し直す間隔（秒）。3000 個を毎フレーム調べないように */
const RING_SEARCH = 0.25
/** 採掘場の目印からこの距離までを「採掘場にいる」とする */
const FIELD_NEAR = 10
/** その場所から出たとするのは、入る距離のこの倍から */
const LEAVE = 1.3

type Mark = { mesh: THREE.InstancedMesh; index: number; type: 0 | 1 | 2; rare: boolean }

const tmp = new THREE.Vector3()
const rockPos = new THREE.Vector3()
const rockScale = new THREE.Vector3()
const camDir = new THREE.Vector3()
const earthPos = new THREE.Vector3()
const dockPos = new THREE.Vector3()
const m4 = new THREE.Matrix4()
const q = new THREE.Quaternion()
const sc = new THREE.Vector3()

/** いま集めたい資源（「いまやること」が採掘のとき）。輪のうち、それ以外を薄くする */
function goalResource(): Resource | null {
  const p = usePioneer.getState()
  const g = goal(p, capacity())
  return g.kind === 'mine' ? g.resource : null
}

export function PioneerScene() {
  const cinema = usePioneer((p) => p.cinema)
  const field = useRef<THREE.Group>(null!)
  const ores = useRef<Ore[]>([])
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const state = useRef({ anchor: null as number | null, gasCarry: 0, gasNotice: false, deepNotice: false, spin: 0, ringClock: RING_SEARCH, want: null as Resource | null, found: [] as (Mark & { score: number })[] })
  const marks = useRef<Mark[]>([])

  // 採掘場の目印を天体として登録する（ワープ・自動航行で行ける）
  useEffect(() => {
    return registerBody({
      id: FIELD_ID,
      get name() {
        return ui().pioneer.fieldName
      },
      radius: FIELD_RADIUS,
      object: field.current,
    })
  }, [])

  // 砕けた岩から、資源のかけらを出す
  useEffect(() => {
    const onBreak = (type: 0 | 1 | 2, size: number, at: THREE.Vector3, rock?: { shape: number; index: number }) => {
      if (!usePioneer.getState().active) return
      // 珍しい岩：たくさん取れて記録に残る（同じ岩は、遊んでいるあいだ 1 回だけ）
      // （帯の岩はまた現れ、読み込み直しても同じ岩が並ぶので、砕いた珍しい岩はその日のあいだセーブに覚える）
      const key = rock ? `${rock.shape}-${rock.index}` : ''
      const maybeRare = !!rock && rock.shape >= 0 && isRare(rock.shape, rock.index, rareSalt()) && !rareTakenToday(key)
      const got = maybeRare ? RARE_BONUS[RARE_BY_TYPE[type]] : rockYield(type, size)
      const resource = got.resource
      // 船の得意：かけらが多く取れる。1 個の岩から 1〜3 個のかけら（珍しい岩は 5 個）。合計は amount
      const raw = Math.round(got.amount * shipTrait(useStore.getState().settings.ship).yield)
      const n = maybeRare ? 5 : Math.min(3, Math.max(1, Math.round(raw / 5)))
      const amount = Math.round(raw / n) * n
      if (maybeRare) foundRare(RARE_BY_TYPE[type], key, amount)
      const now = performance.now() / 1000
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.3 + Math.random() * 0.4)
        ores.current.push({ pos: at.clone().addScaledVector(v, size), vel: v, resource, amount: Math.round(amount / n), born: now })
      }
      if (ores.current.length > MAX_ORE) ores.current.splice(0, ores.current.length - MAX_ORE)
    }
    rockBreaks.add(onBreak)
    return () => {
      rockBreaks.delete(onBreak)
    }
  }, [])

  const geometry = useMemo(() => new THREE.OctahedronGeometry(1, 0), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), [])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  /** 砕ける岩に輪を重ねる（DOM の #pio-rings の中の .pio-ring を動かす） */
  function placeRings(camera: THREE.Camera, size: { width: number; height: number }, dt: number, on: boolean) {
    const box = document.getElementById('pio-rings')
    if (!box) return
    const rings = box.children as HTMLCollectionOf<HTMLElement>
    const s = state.current
    if (!on) {
      if (marks.current.length) marks.current = []
      for (const el of rings) el.style.display = 'none'
      return
    }
    // ときどき：近くて画面の前にある岩を、近い順に選び直す
    s.ringClock += dt
    if (s.ringClock >= RING_SEARCH) {
      s.ringClock = 0
      camera.getWorldDirection(camDir)
      const want = (s.want = goalResource())
      // 船の得意：調査船は遠くの岩まで見分ける
      const range = RING_RANGE * shipTrait(useStore.getState().settings.ship).scan
      const far2 = (range * 1.6) ** 2
      const salt = rareSalt()
      const found = s.found
      found.length = 0
      for (let shape = 0; shape < asteroids.meshes.length; shape++) {
        const mesh = asteroids.meshes[shape]
        const types = asteroids.types.get(mesh)
        const arr = mesh.instanceMatrix.array as Float32Array
        for (let i = 0; i < mesh.count; i++) {
          const o = i * 16
          // 位置だけ先に見て、遠い岩はすぐとばす（3000 個を分解しない）
          rockPos.set(arr[o + 12], arr[o + 13], arr[o + 14]).applyMatrix4(mesh.matrixWorld)
          const d2 = rockPos.distanceToSquared(ship.position)
          if (d2 > far2) continue
          if (arr[o] === 0 && arr[o + 1] === 0 && arr[o + 2] === 0) continue // 砕いた岩
          const d = Math.sqrt(d2)
          const type = (types?.[i] ?? 0) as 0 | 1 | 2
          // 集めたい資源の岩は、遠くても先に選ぶ（金属の岩は帯の 4 分の 1 しかない）
          const wanted = !want || rockResource(type) === want
          // 珍しい岩は、集めたい資源でなくても遠くから先に輪を付ける
          const rare = isRare(shape, i, salt) && !rareTakenToday(`${shape}-${i}`)
          if (!wanted && !rare && d > range) continue
          if (tmp.copy(rockPos).sub(camera.position).dot(camDir) <= 0) continue
          found.push({ mesh, index: i, type, rare, score: rare ? d * 0.2 : wanted ? d * 0.4 : d })
        }
      }
      found.sort((a, b) => a.score - b.score)
      marks.current = found.slice(0, RING_COUNT)
    }
    // 毎フレーム：選んだ岩の今の位置に輪を置く（帯は回っている）
    const want = s.want
    const reach = 30 * Math.min(1, (shipScale() / 0.3) * 4)
    for (let k = 0; k < rings.length; k++) {
      const el = rings[k]
      const mk = marks.current[k]
      if (!mk) {
        el.style.display = 'none'
        continue
      }
      mk.mesh.getMatrixAt(mk.index, m4)
      m4.premultiply(mk.mesh.matrixWorld).decompose(rockPos, q, rockScale)
      const d = rockPos.distanceTo(ship.position)
      tmp.copy(rockPos).project(camera)
      if (rockScale.x < 1e-4 || tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) {
        el.style.display = 'none'
        continue
      }
      const res = rockResource(mk.type)
      // 見かけの大きさ（岩の大きさ ÷ 距離）から輪の直径。小さすぎ・大きすぎないように
      const px = THREE.MathUtils.clamp((rockScale.x / Math.max(d, 0.01)) * size.height * 1.6, 22, 72)
      el.style.display = 'block'
      el.style.width = el.style.height = `${px}px`
      el.style.transform = `translate(${((tmp.x + 1) / 2) * size.width - px / 2}px, ${((1 - tmp.y) / 2) * size.height - px / 2}px)`
      el.dataset.res = res
      el.dataset.rich = mk.type === 2 ? '1' : '0'
      el.dataset.reach = d < reach ? '1' : '0'
      el.dataset.want = !want || want === res ? '1' : '0'
      el.dataset.first = k === 0 ? '1' : '0'
      el.dataset.rare = mk.rare ? '1' : '0'
    }
  }

  useFrame(({ camera, size: view }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1)
    const st = useStore.getState()
    const s = state.current

    // 目印の場所：小惑星帯の岩の 1 つ（帯と一緒に回る）。地球にいちばん近い向きの岩を選び、毎フレームその岩の位置を読む
    // （帯の広さを変えると岩が並び直すので、位置ではなく「どの岩か」を覚える。砕けて消えているあいだは前の位置のまま）
    const belt = asteroids.meshes[0]
    if (belt) {
      if (s.anchor === null || s.anchor >= belt.count) {
        const e = bodies.get('earth')
        e?.object.getWorldPosition(earthPos)
        earthPos.setY(0).normalize()
        let best = -Infinity
        for (let i = 0; i < belt.count; i++) {
          belt.getMatrixAt(i, m4)
          tmp.setFromMatrixPosition(m4)
          if (tmp.lengthSq() === 0) continue
          const y = Math.abs(tmp.y)
          tmp.applyMatrix4(belt.matrixWorld).setY(0).normalize()
          // 地球の向きに近く、帯の上下のまん中に近い岩
          const score = (e ? tmp.dot(earthPos) : 0) - y * 0.2
          if (score > best) {
            best = score
            s.anchor = i
          }
        }
      }
      if (s.anchor !== null) {
        belt.getMatrixAt(s.anchor, m4)
        tmp.setFromMatrixPosition(m4)
        if (tmp.lengthSq() > 0) field.current.position.copy(tmp.applyMatrix4(belt.matrixWorld))
      }
    }

    // かけら：漂い、近ければ船へ吸い寄せられる
    const now = performance.now() / 1000
    const unit = shipScale()
    const list = ores.current
    const full = total(usePioneer.getState().hold) >= capacity()
    // 船の得意と改造：吸い寄せる距離
    const magnet = magnetFactor(st.settings.ship, upgradeLevel('magnet'))
    s.spin += dt * 2
    let w = 0
    for (let i = 0; i < list.length; i++) {
      const o = list[i]
      if (now - o.born > ORE_LIFE) continue
      tmp.copy(ship.position).sub(o.pos)
      const d = tmp.length()
      // 積み荷がいっぱいのあいだは吸い寄せない（かけらはその場に残り、納めたあとで拾える）
      const room = full ? 0 : 1
      if (room && d < Math.max(unit * 1.5, 0.15) && st.warpPhase === 'idle') {
        const got = collect(o.resource, o.amount)
        o.amount -= got
        if (o.amount <= 0) continue
      }
      if (room && d < ATTRACT * magnet && st.warpPhase === 'idle' && now - o.born > 0.6) {
        // 近いほど速く（遠くからでも数秒で届く）
        const pull = 4 + Math.max(0, ATTRACT * magnet - d) * 0.9
        o.vel.lerp(tmp.multiplyScalar(pull / d), Math.min(1, dt * 3))
      } else o.vel.multiplyScalar(1 - Math.min(1, dt * 0.5))
      o.pos.addScaledVector(o.vel, dt)
      list[w++] = o
    }
    list.length = w
    const im = mesh.current
    const size = Math.max(unit * 0.15, 0.02)
    for (let i = 0; i < w; i++) {
      const o = list[i]
      q.setFromAxisAngle(tmp.set(0.3, 1, 0.2).normalize(), s.spin + i)
      m4.compose(o.pos, q, sc.setScalar(size * (0.7 + Math.min(o.amount, 20) / 20)))
      im.setMatrixAt(i, m4)
      im.setColorAt(i, COLORS[o.resource])
    }
    im.count = w
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.visible = w > 0 && st.mode !== 'map'

    // いまいる場所（「いまやること」の言い方を変える）
    const dock = bodies.get(DOCK_ID)
    // 入るときより出るときを少し遠くにして、境目でカードがちらつかないように
    const was = usePioneer.getState().near
    const keep = (z: Near) => (was === z ? LEAVE : 1)
    let near: Near = null
    if (st.mode === 'flight' || st.mode === 'map') {
      if (ship.position.distanceTo(field.current.position) < FIELD_NEAR * keep('field')) near = 'field'
      else if (proximity.id === 'jupiter' && proximity.radius > 0 && proximity.altitude / proximity.radius < 0.5 * keep('jupiter')) near = 'jupiter'
      else if (dock) {
        dock.object.getWorldPosition(dockPos)
        if (ship.position.distanceTo(dockPos) < standoff(dock.radius) * 3 * keep('dock')) near = 'dock'
      }
    }
    setNear(near)

    placeRings(camera, view, dt, near === 'field' && !full && st.mode === 'flight' && st.warpPhase === 'idle')

    // 船の画面上の位置（拾った数字をここから浮かべる）
    tmp.copy(ship.position).project(camera)
    shipOnScreen.visible = tmp.z < 1 && Math.abs(tmp.x) < 1 && Math.abs(tmp.y) < 1
    shipOnScreen.x = ((tmp.x + 1) / 2) * view.width
    shipOnScreen.y = ((1 - tmp.y) / 2) * view.height
    gasFx.collecting = false

    if (st.mode !== 'flight' || st.warpPhase !== 'idle') return

    // 木星の雲のすぐ上：速く飛んでいるあいだ、ガスがたまる
    if (proximity.id === 'jupiter' && proximity.radius > 0) {
      const h = proximity.altitude / proximity.radius
      if (h < GAS_TOO_DEEP) {
        if (!s.deepNotice) {
          s.deepNotice = true
          st.showToast(ui().pioneer.gasTooDeep)
        }
      } else if (h < GAS_BAND.high) {
        s.deepNotice = false
        if (thrustFx.speed >= GAS_MIN_SPEED && !full) {
          gasFx.collecting = true
          if (!s.gasNotice) {
            s.gasNotice = true
            st.showToast(ui().pioneer.gasSkimming)
          }
          s.gasCarry += GAS_RATE * scoopFactor(st.settings.ship, upgradeLevel('scoop')) * dt
          if (s.gasCarry >= 1) {
            const n = Math.floor(s.gasCarry)
            s.gasCarry -= n
            collect('gas', n)
          }
        }
      } else if (h > GAS_BAND.high * 4) {
        s.gasNotice = false
        s.deepNotice = false
      }
    }

    // 天の湊に着いたら（ワープで着く距離か、それより近く＝入港・係留）、積み荷を納める
    if (dock && total(usePioneer.getState().hold) > 0) {
      dock.object.getWorldPosition(dockPos)
      if (ship.position.distanceTo(dockPos) < standoff(dock.radius) * 1.25) deliver()
    }
  })

  return (
    <>
      <group ref={field} />
      <instancedMesh ref={mesh} args={[geometry, material, MAX_ORE]} frustumCulled={false} />
      <GasStream />
      {cinema && <BuildCinema />}
    </>
  )
}

/** ガスを集めているあいだ、船の前から紫の筋が流れこむ */
const GAS_POINTS = 90
const GAS_LIFE = 0.7
function GasStream() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GAS_POINTS * 3), 3))
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(GAS_POINTS), 1))
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: { uColor: { value: new THREE.Color(2.2, 1.3, 2.6) } },
        vertexShader: `attribute float alpha; varying float vA;
          void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 2.0 + 4.0 * alpha; }`,
        fragmentShader: `uniform vec3 uColor; varying float vA;
          void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor * vA * (1.0 - d * 2.0), 1.0); }`,
      }),
    [],
  )
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  const parts = useRef(Array.from({ length: GAS_POINTS }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: GAS_LIFE })))
  const next = useRef(0)
  const pts = useRef<THREE.Points>(null!)
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1)
    const unit = shipScale()
    const list = parts.current
    if (gasFx.collecting) {
      // 1 秒に 120 粒ほど。船の前方、少し横にずれたところから
      const n = Math.max(1, Math.round(120 * dt))
      fwd.set(0, 0, -1).applyQuaternion(ship.quaternion)
      for (let k = 0; k < n; k++) {
        const p = list[next.current]
        next.current = (next.current + 1) % GAS_POINTS
        side.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(unit * 3)
        p.pos.copy(ship.position).addScaledVector(fwd, unit * (4 + Math.random() * 4)).add(side)
        p.age = 0
      }
    }
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const alpha = geo.getAttribute('alpha') as THREE.BufferAttribute
    let any = false
    for (let i = 0; i < GAS_POINTS; i++) {
      const p = list[i]
      if (p.age >= GAS_LIFE) {
        alpha.setX(i, 0)
        continue
      }
      any = true
      p.age += dt
      // 船へ吸いこまれる（だんだん速く）
      p.vel.copy(ship.position).sub(p.pos).multiplyScalar(dt * (2 + p.age * 6))
      p.pos.add(p.vel)
      pos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z)
      alpha.setX(i, Math.sin((p.age / GAS_LIFE) * Math.PI))
    }
    pos.needsUpdate = true
    alpha.needsUpdate = true
    pts.current.visible = any
  })
  return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} />
}
const fwd = new THREE.Vector3()
const side = new THREE.Vector3()
