import { useEffect, useState } from 'react'
import { ui } from '../../i18n'
import { useDelivery } from '../../state/delivery'
import { JOB_ICON } from '../../ui/pioneer/jobKind'
import { labDistance, useLabErrand } from './WalkErrand'

// 歩く場面の上の案内：研究温室まであと何 m（配達の仕事で、研究温室へ向かっているときだけ）

export function WalkErrandHud() {
  const on = useLabErrand()
  const job = useDelivery((d) => d.active)
  const [m, setM] = useState(() => labDistance())
  useEffect(() => {
    if (!on) return
    const id = window.setInterval(() => setM(labDistance()), 250)
    return () => window.clearInterval(id)
  }, [on])
  if (!on || !job) return null
  const t = ui().delivery
  return (
    <div className="pio-errand" role="status">
      <span className="pio-place-icon">{JOB_ICON[job.def.kind](24)}</span>
      <span>
        <small>{t.now}</small>
        <b>{t.labDistance(m)}</b>
        <small className={m < 8 ? undefined : "pio-errand-hint"}>{m < 8 ? t.labHere : t.walkHint}</small>
      </span>
    </div>
  )
}
