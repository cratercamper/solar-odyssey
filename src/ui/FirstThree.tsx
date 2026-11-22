import { useEffect, useState } from 'react'
import { isTouchDevice } from '../state/input'
import { create } from 'zustand'
import { saveSlot } from '../state/save'
import { useStore } from '../state/store'
import { useStamps } from '../state/stamps'
import { useSampleLog } from '../state/rover'
import { useLanding } from '../state/landing'
import { useEva } from '../state/eva'
import { useWalk } from '../state/walk'
import { useCampaign } from '../state/campaign'
import { engage } from '../state/flight'
import { ui } from '../i18n'
import { useLang } from '../i18n/lang'
import './firstThree.css'

// 「はじめての3つ」カード（K2）：月へワープ・火星に着陸・ローバーで岩を拾う。
// 押しつけない：小さく出して、閉じたら二度と出さない（セーブの 'first-three'）。3つともできたら、ひとこと出して閉じる。
// 自由に飛ぶのがふつうなので、カードは案内だけ（押すと行き先を決めてワープするだけで、ほかは何もしない）

type Saved = { closed: boolean; marsLanded: boolean }
const slot = saveSlot<Saved>('first-three', { closed: false, marsLanded: false }, (v) =>
  v && typeof v === 'object' ? { closed: !!(v as Saved).closed, marsLanded: !!(v as Saved).marsLanded } : null,
)
const useFirst = create<Saved>(() => slot.load())
const update = (patch: Partial<Saved>) => {
  useFirst.setState(patch)
  slot.save(useFirst.getState())
}

/** 行き先を決めてワープ（ワープできないときは目標にするだけ） */
function goTo(id: string) {
  const s = useStore.getState()
  s.setTarget(id)
  if (s.warpPhase === 'idle') engage()
}

export function FirstThree() {
  useLang()
  const closed = useFirst((f) => f.closed)
  const marsLanded = useFirst((f) => f.marsLanded)
  const moon = useStamps((b) => 'moon' in b.stamps)
  const rock = useSampleLog((l) => Object.values(l.log).some((ids) => ids.length > 0))
  const marsRock = useSampleLog((l) => (l.log.mars?.length ?? 0) > 0)
  const landingPhase = useLanding((l) => l.phase)
  const landingBody = useLanding((l) => l.bodyId)
  const mode = useStore((s) => s.mode)
  const eva = useEva((e) => e.phase !== 'none')
  const walk = useWalk((w) => w.phase !== 'none')
  const picking = useCampaign((c) => c.picking)
  const mars = marsLanded || marsRock
  // スマホ・タブレットは画面がせまいので、ふだんは小さな札（はじめての3つ 0/3）にたたんでおき、押すとひらく
  const [folded, setFolded] = useState(isTouchDevice)

  // 火星の地表に着いたら、できたことにする
  useEffect(() => {
    if (landingPhase === 'surface' && landingBody === 'mars' && !marsLanded) update({ marsLanded: true })
  }, [landingPhase, landingBody, marsLanded])

  if (closed || mode !== 'flight' || landingPhase !== 'idle' || eva || walk || picking) return null
  const t = ui().firstThree
  const all = moon && mars && rock
  const items: { done: boolean; label: string; go?: () => void; goLabel?: string; hint?: string }[] = [
    { done: moon, label: t.moon, go: () => goTo('moon'), goLabel: t.moonGo },
    { done: mars, label: t.mars, go: () => goTo('mars'), goLabel: t.marsGo, hint: t.marsHint },
    { done: rock, label: t.rover, hint: t.roverHint },
  ]
  const count = items.filter((i) => i.done).length
  if (folded && !all)
    return (
      <button className="first-three-chip" onClick={() => setFolded(false)} aria-expanded={false}>
        {t.title} <span className="muted">{count}/3</span>
      </button>
    )
  // まだの項目のうち最初の 1 つだけ、ひとことの案内を出す
  const next = items.find((i) => !i.done)
  return (
    <section className="first-three" aria-label={t.title}>
      <header>
        <strong>{t.title}</strong>
        <span className="first-three-spacer" />
        {isTouchDevice() && !all && (
          <button className="first-three-close" onClick={() => setFolded(true)} aria-label={t.fold} title={t.fold}>
            −
          </button>
        )}
        <button className="first-three-close" onClick={() => update({ closed: true })} aria-label={t.close} title={t.close}>
          ×
        </button>
      </header>
      {all ? (
        <p className="small">{t.allDone}</p>
      ) : (
        <>
          <p className="muted small">{t.intro}</p>
          <ol>
            {items.map((i) => (
              <li key={i.label} className={i.done ? 'done' : ''}>
                <span className="first-three-check" aria-hidden>
                  {i.done ? '✓' : '○'}
                </span>
                <span className="first-three-label">
                  {i.label}
                  {i.done && <span className="sr-only"> ({t.done})</span>}
                  {i === next && i.hint && <span className="muted small first-three-hint">{i.hint}</span>}
                </span>
                {!i.done && i.go && (
                  <button className="secondary first-three-go" onClick={i.go}>
                    {i.goLabel}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
