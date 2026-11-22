import type { NavEntry } from './registry'
import './nav.css'

/** 登録表の入口 1 つ分のボタン（entry.use はこの部品の中で呼ぶので、フックの順番が入口ごとに決まる） */
export function NavEntryButton({ entry, onPick }: { entry: NavEntry; onPick: () => void }) {
  const st = entry.use?.() ?? {}
  return (
    <button
      className={`secondary nav-entry${entry.className ? ` ${entry.className}` : ''}${st.on ? ' on' : ''}`}
      data-nav={entry.id}
      onClick={() => (onPick(), entry.run())}
      disabled={st.disabled}
    >
      {st.label ?? entry.label()}
      {entry.kbd && (
        <>
          {' '}
          <kbd>{entry.kbd}</kbd>
        </>
      )}
      {st.badge !== undefined && (
        <>
          {' '}
          <span className="muted">{st.badge}</span>
        </>
      )}
    </button>
  )
}
