import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import type { Terrain } from './terrain'
import { lowMemory } from '../../state/quality'

// ミニマップの地形：真上から見た陰影（北西から光を当てる）と、うすい等高線。
// ミニマップは描画の外（HTML）にあるので、地形は Scene がここへ置く。
// 高さを何万回も調べるので、少しずつ（ブラウザの手が空いたときに）作り、ページを止めない。

/** いま地面に使っている地形（Scene が置く） */
export const useMapTerrain = create<{ terrain: Terrain | null }>(() => ({ terrain: null }))

/** 作った地図の画像：世界の (x0, z0) が左上、1 辺 size m */
export type ReliefLayer = { url: string; x0: number; z0: number; size: number }

const NICE = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500]

type Idle = (cb: (d: { timeRemaining: () => number }) => void, o?: { timeout: number }) => number
const idle: Idle =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? (cb, o) => (window as unknown as { requestIdleCallback: Idle }).requestIdleCallback(cb, o)
    : (cb) => window.setTimeout(() => cb({ timeRemaining: () => 8 }), 16)

/**
 * 中心 (cx, cz)・半分の幅 half の正方形を n × n 点で調べて、地図の画像を作る。
 * cancel() を呼ぶと途中でやめる
 */
function build(terrain: Terrain, cx: number, cz: number, half: number, n: number, done: (l: ReliefLayer) => void) {
  let stop = false
  const step = (half * 2) / (n - 1)
  const x0 = cx - half
  const z0 = cz - half
  const hs = new Float32Array(n * n)
  // 星の丸み（遠いほど沈む分）はもどす。小さい衛星では丸みのほうが起伏より大きく、等高線が同心円になってしまう
  const bend = 1 / (2 * terrain.radiusM)
  let row = 0
  const work = (d: { timeRemaining: () => number }) => {
    if (stop) return
    const t0 = performance.now()
    // 手が空いている時間だけ、行ごとに進める。忙しいときも 1 回に 4 ms は進める（遅い端末でも終わるように）
    do {
      for (let i = 0; i < n; i++) {
        const x = x0 + i * step
        const z = z0 + row * step
        hs[row * n + i] = terrain.mapHeight(x, z) + (x * x + z * z) * bend
      }
      row++
      const spent = performance.now() - t0
      if (spent > 12 || (spent > 4 && d.timeRemaining() < 2)) break
    } while (row < n)
    if (row < n) idle(work, { timeout: 120 })
    else paint()
  }
  const paint = () => {
    if (stop) return
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < hs.length; i++) {
      lo = Math.min(lo, hs[i])
      hi = Math.max(hi, hs[i])
    }
    // 傾きの大きさ（80% のところ）から、陰影の強調の度合いを決める（平らな所でも凹凸が見えるように）
    const slopes: number[] = []
    for (let j = 1; j < n - 1; j += 3) {
      for (let i = 1; i < n - 1; i += 3) {
        const gx = (hs[j * n + i + 1] - hs[j * n + i - 1]) / (2 * step)
        const gz = (hs[(j + 1) * n + i] - hs[(j - 1) * n + i]) / (2 * step)
        slopes.push(Math.hypot(gx, gz))
      }
    }
    slopes.sort((a, b) => a - b)
    const p80 = slopes[Math.floor(slopes.length * 0.8)] || 0.01
    const ex = Math.min(12, Math.max(1, 0.45 / p80))
    // 光は北西（-x, -z）の上 45° から
    const lx = -0.5
    const lz = -0.5
    const ly = Math.SQRT1_2
    const g = new Float32Array(3)
    const hex = terrain.def.ground
    g[0] = parseInt(hex.slice(1, 3), 16)
    g[1] = parseInt(hex.slice(3, 5), 16)
    g[2] = parseInt(hex.slice(5, 7), 16)
    const flat = ly // 平らな地面の明るさ
    const shade = document.createElement('canvas')
    shade.width = n
    shade.height = n
    const sctx = shade.getContext('2d')!
    const img = sctx.createImageData(n, n)
    const span = Math.max(hi - lo, 1e-3)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1)
        const b = Math.min(n - 1, i + 1)
        const c = Math.max(0, j - 1)
        const e = Math.min(n - 1, j + 1)
        const gx = ((hs[j * n + b] - hs[j * n + a]) / ((b - a) * step)) * ex
        const gz = ((hs[e * n + i] - hs[c * n + i]) / ((e - c) * step)) * ex
        // 法線 (-gx, 1, -gz) と光の向き
        const dot = (-gx * lx + ly - gz * lz) / Math.sqrt(gx * gx + 1 + gz * gz)
        const s = Math.max(0, dot) / flat
        // 暗めに：平らな所で地面の色の 3 割ほど。高い所ほど少し明るく
        const v = (0.1 + 0.2 * Math.min(1.8, s)) * (0.85 + 0.3 * ((hs[j * n + i] - lo) / span))
        const p = (j * n + i) * 4
        img.data[p] = Math.min(255, g[0] * v + 6)
        img.data[p + 1] = Math.min(255, g[1] * v + 8)
        img.data[p + 2] = Math.min(255, g[2] * v + 12)
        img.data[p + 3] = 255
      }
    }
    sctx.putImageData(img, 0, 0)
    // 等高線は、陰影を引きのばした大きな画像の上に線で描く（拡大してもギザギザにならない）
    const px = lowMemory() ? n : n * 2
    const out = document.createElement('canvas')
    out.width = px
    out.height = px
    const ctx = out.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    // 点の中心が画像の端にくるように、半ます分外へ広げて貼る（size は (n - 1) 点ぶん + 1 ます）
    const cell = px / n
    ctx.drawImage(shade, 0, 0, px, px)
    // 間隔は高さの幅を 10 本ほどに分ける切りのよい値。5 本ごとに少し濃く
    const iv = NICE.find((v) => span / v <= 12) ?? 1000
    const minor: number[] = []
    const major: number[] = []
    const P = (i: number, j: number) => [(i + 0.5) * cell, (j + 0.5) * cell] as const
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const h00 = hs[j * n + i]
        const h10 = hs[j * n + i + 1]
        const h01 = hs[(j + 1) * n + i]
        const h11 = hs[(j + 1) * n + i + 1]
        const mn = Math.min(h00, h10, h01, h11)
        const mx = Math.max(h00, h10, h01, h11)
        for (let k = Math.ceil(mn / iv); k * iv < mx; k++) {
          const lv = k * iv
          const pts: number[] = []
          // ますの 4 辺で、その高さをまたぐ所（上・右・下・左の順）
          const edge = (ha: number, hb: number, ia: number, ja: number, ib: number, jb: number) => {
            if (ha < lv !== hb < lv) {
              const f = (lv - ha) / (hb - ha)
              const [ax, ay] = P(ia, ja)
              const [bx, by] = P(ib, jb)
              pts.push(ax + (bx - ax) * f, ay + (by - ay) * f)
            }
          }
          edge(h00, h10, i, j, i + 1, j)
          edge(h10, h11, i + 1, j, i + 1, j + 1)
          edge(h11, h01, i + 1, j + 1, i, j + 1)
          edge(h01, h00, i, j + 1, i, j)
          const list = k % 5 === 0 ? major : minor
          for (let q = 0; q + 3 < pts.length; q += 4) list.push(pts[q], pts[q + 1], pts[q + 2], pts[q + 3])
        }
      }
    }
    const stroke = (segs: number[], color: string, w: number) => {
      ctx.beginPath()
      for (let q = 0; q < segs.length; q += 4) {
        ctx.moveTo(segs[q], segs[q + 1])
        ctx.lineTo(segs[q + 2], segs[q + 3])
      }
      ctx.strokeStyle = color
      ctx.lineWidth = w
      ctx.stroke()
    }
    const lw = px / 512
    stroke(minor, 'rgba(230, 240, 255, 0.13)', 1 * lw + 0.4)
    stroke(major, 'rgba(230, 240, 255, 0.26)', 1.4 * lw + 0.5)
    out.toBlob((blob) => {
      if (stop || !blob) return
      done({ url: URL.createObjectURL(blob), x0: x0 - step / 2, z0: z0 - step / 2, size: step * n })
    })
  }
  idle(work, { timeout: 120 })
  return () => {
    stop = true
  }
}

/**
 * 地図の画像を作って返す（できるまでは前の画像、なければ null）。
 * box が変わると作り直す。box が null のあいだは作らない（前の画像はそのまま）
 */
export function useRelief(terrain: Terrain | null, box: { cx: number; cz: number; half: number } | null, n = 256) {
  const [layer, setLayer] = useState<ReliefLayer | null>(null)
  const shown = useRef<ReliefLayer | null>(null)
  const cx = box?.cx
  const cz = box?.cz
  const half = box?.half
  useEffect(() => {
    if (!terrain || cx === undefined || cz === undefined || half === undefined) return
    return build(terrain, cx, cz, half, n, (l) => {
      const old = shown.current
      shown.current = l
      setLayer(l)
      // 前の画像は、新しい画像に差しかえたあとで捨てる
      if (old) setTimeout(() => URL.revokeObjectURL(old.url), 1000)
    })
  }, [terrain, cx, cz, half, n])
  // 地形が変わったら（別の天体・本物の地形を読み終えた）前の画像は見せない
  const [seen, setSeen] = useState(terrain)
  if (seen !== terrain) {
    setSeen(terrain)
    setLayer(null)
  }
  useEffect(
    () => () => {
      if (shown.current) URL.revokeObjectURL(shown.current.url)
    },
    [],
  )
  return layer
}
