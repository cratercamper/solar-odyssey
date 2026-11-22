// スクリーンショット（PNG・8 ビット RGB/RGBA・インターレースなし）を読む小さな読み取り器。
// 画面が真っ黒・一色になっていないかを調べるためだけに使う
import { inflateSync } from 'node:zlib'

export function decodePng(buf) {
  let p = 8
  let width = 0
  let height = 0
  let channels = 4
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('latin1', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8 || data[12] !== 0) throw new Error('unsupported png')
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0
      if (!channels) throw new Error('unsupported png color type')
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    p += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0
      let v = line[x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[y * stride + x] = v & 255
    }
  }
  return { width, height, channels, data: out }
}

/** 画面の明るさの平均と散らばり、明るい画素の割合（0〜1） */
export function imageStats(png) {
  const { data, channels } = png
  let sum = 0
  let sq = 0
  let lit = 0
  const n = data.length / channels
  for (let i = 0; i < data.length; i += channels) {
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    sum += l
    sq += l * l
    if (l > 40) lit++
  }
  const mean = sum / n
  return { mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)), lit: lit / n }
}
