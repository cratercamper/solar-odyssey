import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// 宇宙望遠鏡の部品に使う材質。金属の照り返しのために、弱い室内の映り込みを使う

const envs = new WeakMap<THREE.WebGLRenderer, THREE.Texture>()

/** 映り込み用の環境マップ。作るのが重いので、望遠鏡や SF の構造物どうしで 1 つを使い回す（使う側で dispose しない） */
export function roomEnvironment(gl: THREE.WebGLRenderer) {
  let env = envs.get(gl)
  if (!env) {
    const pmrem = new THREE.PMREMGenerator(gl)
    env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    envs.set(gl, env)
  }
  return env
}

function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** ハッブルの銀色の断熱材：少しずつ色の違う四角いパネルと、継ぎ目 */
export function foilTexture() {
  return canvasTexture(512, 256, (g) => {
    g.fillStyle = '#c9ccd2'
    g.fillRect(0, 0, 512, 256)
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let y = 0; y < 256; y += 64) {
      for (let x = 0; x < 512; x += 85) {
        const v = 206 + Math.floor(rand() * 30)
        g.fillStyle = `rgb(${v},${v + 1},${v + 4})`
        g.fillRect(x + 1, y + 1, 83, 62)
        // しわ
        for (let k = 0; k < 3; k++) {
          g.strokeStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '90,92,100'},${0.06 + rand() * 0.08})`
          g.lineWidth = 1 + rand() * 2
          g.beginPath()
          g.moveTo(x + rand() * 84, y + 2)
          g.lineTo(x + rand() * 84, y + 62)
          g.stroke()
        }
      }
    }
    g.fillStyle = 'rgba(80,82,90,0.45)'
    for (let y = 0; y < 256; y += 64) g.fillRect(0, y, 512, 1)
    for (let x = 0; x < 512; x += 85) g.fillRect(x, 0, 1, 256)
  })
}

/** 太陽電池パネル：濃い青のセルと、細い銀の配線 */
export function solarCellTexture() {
  return canvasTexture(128, 256, (g) => {
    g.fillStyle = '#9aa0aa'
    g.fillRect(0, 0, 128, 256)
    for (let y = 4; y < 252; y += 12) {
      for (let x = 4; x < 124; x += 12) {
        g.fillStyle = (x + y) % 24 === 8 ? '#1e2a5c' : '#1a2452'
        g.fillRect(x, y, 11, 11)
      }
    }
    g.fillStyle = '#c2c6cf'
    g.fillRect(62, 0, 4, 256)
  })
}

export const foilMaterial = (env: THREE.Texture, map: THREE.Texture) =>
  new THREE.MeshStandardMaterial({ map, color: '#ffffff', metalness: 0.75, roughness: 0.38, envMap: env, envMapIntensity: 0.6 })

export const darkMaterial = (env: THREE.Texture) =>
  new THREE.MeshStandardMaterial({ color: '#2a2c33', metalness: 0.4, roughness: 0.6, envMap: env, envMapIntensity: 0.3 })

export const whiteMaterial = (env: THREE.Texture) =>
  new THREE.MeshStandardMaterial({ color: '#e6e4de', metalness: 0.1, roughness: 0.7, envMap: env, envMapIntensity: 0.3 })

export const cellMaterial = (env: THREE.Texture, map: THREE.Texture) =>
  new THREE.MeshStandardMaterial({ map, metalness: 0.25, roughness: 0.45, envMap: env, envMapIntensity: 0.35 })

/** ウェッブの金めっきの鏡 */
export const goldMaterial = (env: THREE.Texture) =>
  new THREE.MeshStandardMaterial({ color: '#e9b84f', metalness: 1, roughness: 0.24, envMap: env, envMapIntensity: 0.5, emissive: '#2a1a02', emissiveIntensity: 0.15 })

/** ウェッブの日よけ：アルミを貼った薄い膜（太陽側は少し紫がかった銀色） */
export const shieldMaterial = (env: THREE.Texture, tint: string) =>
  new THREE.MeshStandardMaterial({ color: tint, metalness: 0.85, roughness: 0.28, envMap: env, envMapIntensity: 0.9, side: THREE.DoubleSide })
