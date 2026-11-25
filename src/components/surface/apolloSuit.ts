import * as THREE from 'three'
import { makeAstronaut, type Rig } from './astronaut'

// アポロ 17 号の宇宙服（A7LB）。public/models/apollo-suit.glb（tools/blender/build_apollo_suit.py で作る）を、
// 手作りの宇宙飛行士（astronaut.ts の Rig）と同じ関節の箱に入れる。関節の位置はどちらも同じなので、動きはそのまま使える。
// 読み込みが終わるまで・失敗したときは、手作りの宇宙飛行士のまま。読み込めたら、関節の箱の中の形を入れかえる
// （隠すのではなく外す：React の Suspense が visible を戻してしまうことがあるので）

/** どの道具を身に着けるか */
export type ApolloKit = {
  /** 背中：月面の生命維持装置（plss）・船外活動の司令船パイロットの非常用酸素だけ（ops）・何も無し */
  back: 'plss' | 'ops' | 'none'
  /** 金色のバイザーの日よけ（LEVA） */
  leva: boolean
  /** 船長の赤い帯 */
  cdr: boolean
  /** 月面の胸の操作箱 */
  rcu: boolean
  /** ひざから下の月の砂ぼこり（月面を歩いたあとの姿）。省くと無し */
  dust?: boolean
  /** NASA の印・アポロ 17 号のパッチ・国旗。アポロの場面だけで付ける。省くと付ける */
  patches?: boolean
  /** 地球の人（重力ジャンプのくらべ役）：うすい青で透ける。砂ぼこりと印は付けない */
  ghost?: boolean
}

type Src = { parts: Map<string, THREE.Mesh[]> }
let loading: Promise<Src | null> | null = null

/** モデルを一度だけ読む（失敗したら null） */
export function loadApolloSuit(): Promise<Src | null> {
  if (loading) return loading
  loading = Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')])
    .then(async ([{ GLTFLoader }, { MeshoptDecoder }]) => {
      const loader = new GLTFLoader()
      loader.setMeshoptDecoder(MeshoptDecoder)
      const g = await loader.loadAsync(`${import.meta.env.BASE_URL}models/apollo-suit.glb`)
      const parts = new Map<string, THREE.Mesh[]>()
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        // 部品の名前（ノードの名前）。複数の材質の部品は、子のメッシュに分かれている
        let node: THREE.Object3D = m
        while (node.parent && node.parent !== g.scene) node = node.parent
        // 頂点の色のアルファ＝砂ぼこりの少なさ（1 = きれい）。色は RGB だけにして、量は dust に分ける
        const col = m.geometry.getAttribute('color')
        if (col && col.itemSize === 4 && !m.geometry.getAttribute('dust')) {
          const n = col.count
          const rgb = new Float32Array(n * 3)
          const dust = new Float32Array(n)
          for (let i = 0; i < n; i++) {
            rgb[i * 3] = col.getX(i)
            rgb[i * 3 + 1] = col.getY(i)
            rgb[i * 3 + 2] = col.getZ(i)
            dust[i] = 1 - col.getW(i)
          }
          m.geometry.setAttribute('color', new THREE.BufferAttribute(rgb, 3))
          m.geometry.setAttribute('dust', new THREE.BufferAttribute(dust, 1))
        }
        const list = parts.get(node.name) ?? []
        list.push(m)
        parts.set(node.name, list)
      })
      return { parts }
    })
    .catch(() => null)
  return loading
}

const JOINTS = ['torso', 'shoulder0', 'elbow0', 'shoulder1', 'elbow1', 'hip0', 'knee0', 'hip1', 'knee1'] as const

function wanted(tag: string | undefined, kit: ApolloKit) {
  if (!tag) return true
  if (tag === 'helmet') return true
  if (tag === 'patch') return kit.patches !== false && !kit.ghost // NASA の印・アポロ 17 号のパッチ・国旗（アポロの場面だけ）
  if (tag === 'plss') return kit.back === 'plss'
  if (tag === 'ops') return kit.back === 'ops'
  if (tag === 'leva') return kit.leva
  if (tag === 'cdr') return kit.cdr
  if (tag === 'rcu') return kit.rcu
  return false
}

const DUST = new THREE.Color(0.25, 0.235, 0.21)

/** 頂点の dust の量だけ、月の砂の色を混ぜる */
function addDust(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.dustColor = { value: DUST }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float dust;\nvarying float vDust;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDust = dust;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 dustColor;\nvarying float vDust;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, dustColor, vDust);')
  }
  mat.customProgramCacheKey = () => 'apollo-dust'
}

/** アポロの宇宙服の宇宙飛行士ひとり。すぐに使える（はじめは手作りの形、モデルが届いたら入れかわる） */
export function makeApolloAstronaut(kit: ApolloKit): Rig {
  const rig = makeAstronaut(!!kit.ghost)
  const groups: Record<(typeof JOINTS)[number], THREE.Group> = {
    torso: rig.torso,
    shoulder0: rig.shoulders[0],
    elbow0: rig.elbows[0],
    shoulder1: rig.shoulders[1],
    elbow1: rig.elbows[1],
    hip0: rig.hips[0],
    knee0: rig.knees[0],
    hip1: rig.hips[1],
    knee1: rig.knees[1],
  }
  // 手作りの形（いまの関節の箱の中身。関節の箱そのものと、あとから付けた物＝フィルムの箱などは残す）
  const keep = new Set<THREE.Object3D>(Object.values(groups))
  const made: THREE.Object3D[] = []
  for (const g of Object.values(groups)) for (const c of g.children) if (!keep.has(c)) made.push(c)
  void loadApolloSuit().then((src) => {
    if (!src) return
    for (const c of made) c.removeFromParent()
    for (const m of rig.materials) m.dispose()
    rig.materials.length = 0
    const own = new Map<THREE.Material, THREE.MeshStandardMaterial>()
    for (const [name, meshes] of src.parts) {
      const [joint, tag] = name.split('__')
      const g = groups[joint as (typeof JOINTS)[number]]
      if (!g || !wanted(tag, kit)) continue
      for (const orig of meshes) {
        let mat = own.get(orig.material as THREE.Material)
        if (!mat) {
          mat = (orig.material as THREE.MeshStandardMaterial).clone()
          const mn = (orig.material as THREE.Material).name
          if (mn === 'Bubble') {
            // 泡のヘルメット：透明なポリカーボネート
            mat.transparent = true
            mat.opacity = 0.16
            mat.depthWrite = false
            mat.vertexColors = false
          } else if (mn === 'Gold') {
            mat.envMapIntensity = 2
            mat.vertexColors = false
          } else mat.envMapIntensity = 0.8
          if (kit.ghost) {
            mat.map = null
            mat.vertexColors = false
            mat.metalness = 0
            mat.color.set(mn === 'Bubble' ? '#a9d4ff' : '#86b9ff')
            mat.transparent = true
            mat.opacity = mn === 'Bubble' ? 0.12 : 0.5
            mat.depthWrite = false
            mat.emissive = new THREE.Color('#2a5aa8')
            mat.emissiveIntensity = 0.35
          }
          if (kit.dust && !kit.ghost && mn !== 'Bubble' && mn !== 'Gold' && mn !== 'Hard') addDust(mat)
          own.set(orig.material as THREE.Material, mat)
          rig.materials.push(mat)
        }
        const m = new THREE.Mesh(orig.geometry, mat)
        m.name = name
        m.castShadow = mat.name !== 'Bubble' && !kit.ghost
        m.receiveShadow = true
        g.add(m)
      }
    }
  })
  return rig
}
