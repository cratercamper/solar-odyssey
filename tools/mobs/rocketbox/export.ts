// Rocketbox（Microsoft、MIT）の人を、公園で使う glb 1 つにまとめる（開発用。tools/mobs/rocketbox/export.cjs から呼ぶ）。
// - FBX（_facial 版）を読み、顔の形はまばたき（EyeBlinkLeft / Right）だけ残す
// - テクスチャは 1024 px（色・凹凸は jpg、髪・まつげの透けは png）
// - 骨の名前（Bip01_*）・Z が上の向きは元のまま。T ポーズへの起こしと大きさ合わせはアプリ側（trialPeople.ts）
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const STAGE = '/tools/mobs/.rocketbox_stage/'

async function exportPerson(name: string) {
  const dir = `${STAGE}${name}/`
  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => {
    const m = /([A-Za-z0-9_]+)\.tga$/i.exec(url)
    return m ? `${dir}${m[1]}.${/opacity/.test(m[1]) ? 'png' : 'jpg'}` : url
  })
  manager.addHandler(/\.tga$/i, new THREE.TextureLoader(manager))
  const done = new Promise<void>((res) => (manager.onLoad = () => res()))
  const fbx = await new FBXLoader(manager).loadAsync(`${dir}${name}.fbx`)
  await done
  fbx.animations = []
  let tris = 0
  const conv = new Map<THREE.Material, THREE.Material>()
  fbx.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isMesh) return
    // FBX は頂点を三角形ごとに持っているので、同じ頂点をまとめる（3 分の 1 ほどになる）
    mesh.geometry = mergeVertices(mesh.geometry, 1e-4)
    const g = mesh.geometry
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3
    const dict = mesh.morphTargetDictionary
    if (dict && g.morphAttributes.position) {
      const keep = Object.entries(dict).filter(([k]) => /EyeBlink(Left|Right)$/.test(k))
      const pos = g.morphAttributes.position
      const nor = g.morphAttributes.normal
      g.morphAttributes = {}
      if (keep.length) {
        g.morphAttributes.position = keep.map(([k, i]) => Object.assign(pos[i], { name: k.replace(/^.*\|/, '') }))
        // まばたきの法線の差は使わない（軽くする）
        void nor
      }
      mesh.morphTargetDictionary = undefined
      mesh.morphTargetInfluences = undefined
      mesh.updateMorphTargets()
    }
    const swap = (m: THREE.Material) => {
      let r = conv.get(m)
      if (r) return r
      const src = m as THREE.MeshPhongMaterial
      const cut = /opacity/i.test(src.name) || src.transparent || !!src.alphaMap
      const map = cut && src.alphaMap ? src.alphaMap : src.map
      if (map) {
        map.colorSpace = THREE.SRGBColorSpace
        map.userData.mimeType = cut ? 'image/png' : 'image/jpeg'
      }
      if (src.normalMap) src.normalMap.userData.mimeType = 'image/jpeg'
      r = new THREE.MeshStandardMaterial({
        name: src.name,
        map: map ?? null,
        normalMap: src.normalMap ?? null,
        roughness: 0.62,
        metalness: 0,
        alphaTest: cut ? 0.45 : 0,
        side: cut ? THREE.DoubleSide : THREE.FrontSide,
      })
      conv.set(m, r)
      return r
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
  })
  const box = new THREE.Box3().setFromObject(fbx)
  const glb = (await new GLTFExporter().parseAsync(fbx, { binary: true, maxTextureSize: 1024 })) as ArrayBuffer
  const bytes = new Uint8Array(glb)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { b64: btoa(bin), tris, size: box.getSize(new THREE.Vector3()).toArray() }
}

;(window as unknown as { exportPerson: typeof exportPerson }).exportPerson = exportPerson
