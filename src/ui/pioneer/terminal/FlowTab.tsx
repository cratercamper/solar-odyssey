import { ui } from '../../../i18n'
import { usePioneer } from '../../../state/pioneer'
import { flow, RESOURCES, STAGES, total, type Resource } from '../../../data/pioneer'

// 端末「流れ」：集めた資源が、いまどこにあるか（建設に使った・倉庫・積み荷）を帯の太さで見せる図と、その表

type Sink = 'used' | 'store' | 'hold'
const SINKS: readonly Sink[] = ['used', 'store', 'hold']

const W = 340
const H = 190
/** 名前と量の 2 行ぶんの高さ。箱が小さくても、字が重ならないようにずらす */
const LABEL = 26

/** 字の真ん中の位置を、重ならないよう上から順にずらし、はみ出したら下からも押し戻す */
function spread(centers: number[]): number[] {
  const out = [...centers]
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + LABEL)
  const last = H - LABEL / 2
  if (out.length && out[out.length - 1] > last) {
    out[out.length - 1] = last
    for (let i = out.length - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - LABEL)
  }
  return out.map((c) => Math.max(LABEL / 2, c))
}
const TOP = 8
const GAP = 10
const BAR = 12
const LX = 92
const RX = W - 92 - BAR

export function FlowTab() {
  const p = usePioneer()
  const t = ui().pioneer
  const tf = t.term.flow
  const { used, gathered } = flow(p)
  const amount = (r: Resource, k: Sink) => (k === 'used' ? used[r] : k === 'store' ? p.store[r] : p.hold[r])
  const sum = total(gathered)
  const sinkName: Record<Sink, string> = { used: tf.used, store: tf.store, hold: tf.hold }

  if (sum === 0) return <p className="pio-empty">{tf.empty}</p>

  const left = RESOURCES.filter((r) => gathered[r] > 0)
  const right = SINKS.filter((k) => RESOURCES.some((r) => amount(r, k) > 0))
  const scale = (H - TOP * 2 - GAP * (Math.max(left.length, right.length) - 1)) / sum

  // 左（資源）と右（行き先）の箱の位置
  const leftY: Partial<Record<Resource, number>> = {}
  let y = TOP
  for (const r of left) {
    leftY[r] = y
    y += gathered[r] * scale + GAP
  }
  const rightY: Partial<Record<Sink, number>> = {}
  const sinkTotal = (k: Sink) => RESOURCES.reduce((n, r) => n + amount(r, k), 0)
  // 右は縦の真ん中にそろえる
  const rightH = right.reduce((n, k) => n + sinkTotal(k) * scale, 0) + GAP * (right.length - 1)
  y = TOP + (H - TOP * 2 - rightH) / 2
  for (const k of right) {
    rightY[k] = y
    y += sinkTotal(k) * scale + GAP
  }

  // 帯：資源の箱の中では行き先の順、行き先の箱の中では資源の順に積む
  const bands: { r: Resource; k: Sink; d: string; v: number }[] = []
  const outUsed: Partial<Record<Resource, number>> = {}
  const inUsed: Partial<Record<Sink, number>> = {}
  for (const r of left) {
    for (const k of right) {
      const v = amount(r, k)
      if (v <= 0) continue
      const h = v * scale
      const y0 = leftY[r]! + (outUsed[r] ?? 0)
      const y1 = rightY[k]! + (inUsed[k] ?? 0)
      outUsed[r] = (outUsed[r] ?? 0) + h
      inUsed[k] = (inUsed[k] ?? 0) + h
      const x0 = LX + BAR
      const x1 = RX
      const mx = (x0 + x1) / 2
      bands.push({ r, k, v, d: `M${x0} ${y0}C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}V${y1 + h}C${mx} ${y1 + h} ${mx} ${y0 + h} ${x0} ${y0 + h}Z` })
    }
  }
  const built = STAGES.slice(0, p.stage)
  const leftLabel = spread(left.map((r) => leftY[r]! + Math.max(2, gathered[r] * scale) / 2))
  const rightLabel = spread(right.map((k) => rightY[k]! + Math.max(2, sinkTotal(k) * scale) / 2))

  return (
    <div className="pio-tab-flow">
      <svg viewBox={`0 0 ${W} ${H}`} className="pio-sankey" role="img" aria-label={tf.title}>
        {bands.map((b) => (
          <path key={`${b.r}-${b.k}`} d={b.d} className={`pio-band pio-band-${b.r}`}>
            <title>{t.term.band(t.resource[b.r], sinkName[b.k], b.v)}</title>
          </path>
        ))}
        {left.map((r, i) => {
          const h = Math.max(2, gathered[r] * scale)
          const y0 = leftY[r]!
          const ly = leftLabel[i]
          return (
            <g key={r}>
              <rect x={LX} y={y0} width={BAR} height={h} rx="3" className={`pio-node-${r}`} />
              <text x={LX - 6} y={ly - 1} textAnchor="end" className="pio-sankey-label">
                {t.term.amount(t.resource[r], gathered[r])}
              </text>
              <text x={LX - 6} y={ly + 11} textAnchor="end" className="pio-sankey-sub">
                {tf.from[r]}
              </text>
            </g>
          )
        })}
        {right.map((k, i) => {
          const h = Math.max(2, sinkTotal(k) * scale)
          const y0 = rightY[k]!
          const ly = rightLabel[i]
          return (
            <g key={k}>
              <rect x={RX} y={y0} width={BAR} height={h} rx="3" className={`pio-node-sink pio-node-${k}`} />
              <text x={RX + BAR + 6} y={ly - 1} className="pio-sankey-label">
                {sinkName[k]}
              </text>
              <text x={RX + BAR + 6} y={ly + 11} className="pio-sankey-sub">
                {sinkTotal(k)}
              </text>
            </g>
          )
        })}
      </svg>
      <table className="pio-table">
        <caption>{tf.table}</caption>
        <thead>
          <tr>
            <th scope="col">{tf.resourceCol}</th>
            <th scope="col">{tf.gathered}</th>
            <th scope="col">{tf.used}</th>
            <th scope="col">{tf.store}</th>
            <th scope="col">{tf.hold}</th>
          </tr>
        </thead>
        <tbody>
          {RESOURCES.map((r) => (
            <tr key={r}>
              <th scope="row">
                <i className={`pio-dot pio-${r}`} />
                {t.resource[r]}
              </th>
              <td>{gathered[r]}</td>
              <td>{used[r]}</td>
              <td>{p.store[r]}</td>
              <td>{p.hold[r]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {built.length > 0 && (
        <p className="pio-built-chips">
          <small>{tf.stagesUsed}</small>
          {built.map((s) => (
            <span key={s.id}>{t.stageName[s.id]}</span>
          ))}
        </p>
      )}
    </div>
  )
}
