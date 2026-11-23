import * as THREE from 'three'

// まるくぼけた光の絵（中心が明るく、外へ消える丸）を、計算で作る。
//
// 前は canvas の放射グラデーションで作っていた。iPhone の Safari では、
//  - canvas の中身は「色 × 透明度」を 8 ビットで持つ（premultiplied）
//  - グラデーションに、色ごとにばらばらのざらつき（ディザ）を入れる
// ので、透明度が 1/255 ほどの外側では、赤・緑・青のそれぞれが 0 か 1 かにばらつく。
// これを画面いっぱいに引きのばして暗い空に足すと、1 画素ぶんの絵が大きな赤・緑・黒の丸いしみに見えた
// （junji 2026-11-23：打ち上げの空、月からの離陸の噴射、地球への降下）。
// ここでは色と透明度を小数（半精度）のまま持ち、色は掛けずに別々に持つので、どの端末でも同じなめらかな絵になる。

/** 色の止め：位置（0 中心〜1 ふち）、赤・緑・青（0〜255）、透明度（0〜1）。canvas の addColorStop と同じ意味 */
export type GlowStop = [pos: number, r: number, g: number, b: number, a: number]

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))

/**
 * 放射グラデーションの絵。srgb：色を sRGB の値として書いてある（canvas の絵に colorSpace = SRGBColorSpace を付けていた所）。
 * 白一色の光なら、どちらでも同じ
 */
export function radialGlowTexture(stops: GlowStop[], size = 64, srgb = false): THREE.DataTexture {
  const data = new Uint16Array(size * size * 4)
  const c = (size - 1) / 2
  const half = size / 2
  const at = (t: number, k: number) => {
    if (t <= stops[0][0]) return stops[0][k]
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1]
      const b = stops[i]
      if (t <= b[0]) return a[k] + ((b[k] - a[k]) * (t - a[0])) / Math.max(1e-6, b[0] - a[0])
    }
    return stops[stops.length - 1][k]
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = Math.min(1, Math.hypot(x - c, y - c) / half)
      const o = (y * size + x) * 4
      for (let k = 0; k < 3; k++) {
        const v = at(t, k + 1) / 255
        data[o + k] = THREE.DataUtils.toHalfFloat(srgb ? srgbToLinear(v) : v)
      }
      data[o + 3] = THREE.DataUtils.toHalfFloat(at(t, 4))
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.HalfFloatType)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  // 色は光の量（リニア）で入っている
  tex.colorSpace = srgb ? THREE.LinearSRGBColorSpace : THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}
