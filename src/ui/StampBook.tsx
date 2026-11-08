import { useEffect, type CSSProperties } from 'react'
import * as THREE from 'three'
import { NATURAL, STAMP_GROUPS, STAMP_IDS, TITLES, stampColor, titleProgress, titleText } from '../data/stamps'
import { CUBE_ID } from '../data/cube'
import { useSF } from '../data/sf'
import { closeStamps, collectStamp, useStamps } from '../state/stamps'
import { nearRange } from '../state/proximity'
import { ship } from '../state/flight'
import { bodies } from '../state/registry'
import { useStore } from '../state/store'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'

/** スタンプの傾き（天体ごとに決まった、少しずつちがう角度） */
const tilt = (id: string) => ([...id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) % 15) - 7

const shortDate = (ms: number) => ui().stampBook.shortDate(new Date(ms))

function Stamp({ id, at, star }: { id: string; at: number | undefined; star: boolean }) {
  const got = at !== undefined
  const secret = id === CUBE_ID && !got
  const name = secret ? ui().stampBook.secret : (bodies.get(id)?.name ?? id)
  const style = { '--c': stampColor(id), '--r': `${tilt(id)}deg` } as CSSProperties
  return (
    <button
      className={`stamp${got ? ' got' : ''}`}
      style={style}
      disabled={secret}
      onClick={() => {
        useStore.getState().setTarget(id)
        closeStamps()
      }}
      title={secret ? undefined : ui().stampBook.setTarget(name)}
    >
      <span className="stamp-face" data-id={id}>
        {!got && '?'}
        {star && <span className="stamp-star" aria-label={ui().stampBook.quizAnswered}>★</span>}
      </span>
      <span className="stamp-name">{name}</span>
      <span className="stamp-date">{got && at ? shortDate(at) : ' '}</span>
    </button>
  )
}

/** 訪問スタンプ帳。天体のそばまで来たらスタンプを押す見張りも、ここでしている */
export function StampBook() {
  const { stamps, titles, open } = useStamps()
  const explored = useStore((s) => s.visited)
  // SF のページと称号は、SF モードのときだけ見せる
  const sf = useSF()
  const groups = STAMP_GROUPS.filter((g) => sf || g.id !== 'sf')
  const shownTitles = TITLES.filter((title) => sf || !title.sf)
  useLang()

  // 操縦しているあいだ、天体のそばまで来たらスタンプを押す（ワープで通り過ぎるところは数えない）
  useEffect(() => {
    const at = new THREE.Vector3()
    const timer = setInterval(() => {
      const st = useStore.getState()
      if (st.mode !== 'flight' || st.warpPhase === 'charge' || st.warpPhase === 'warp') return
      for (const id of STAMP_IDS) {
        const body = bodies.get(id)
        if (!body) continue
        body.object.getWorldPosition(at)
        if (ship.position.distanceTo(at) - body.radius < nearRange(body.radius)) collectStamp(id)
      }
    }, 300)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.code === 'Escape' && closeStamps()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const count = NATURAL.filter((id) => id in stamps).length
  const answered = NATURAL.filter((id) => explored.includes(id)).length
  const current = [...TITLES].reverse().find((title) => title.rank && titles.includes(title.id))

  return (
    <section className="stamp-book" role="dialog" aria-label={ui().stampBook.stampBook}>
      <header>
        <h2>{ui().stampBook.stampBook}</h2>
        <button className="close" onClick={closeStamps} aria-label={ui().stampBook.close}>
          ×
        </button>
      </header>
      <div className="stamp-summary">
        <div>
          {ui().stampBook.currentTitle}
          <strong>{current ? titleText(current).name : ui().stampBook.noneYet}</strong>
        </div>
        <div className="muted">
          {ui().stampBook.stamps} {count}/{NATURAL.length} · {ui().stampBook.quizzes} {answered}/{NATURAL.length} · {ui().stampBook.titles} {shownTitles.filter((title) => titles.includes(title.id)).length}/{shownTitles.length}
        </div>
      </div>
      <p className="muted small">
        {ui().stampBook.howToCollect}
      </p>
      {groups.map((g) => (
        <div key={g.id} className="stamp-group">
          <h3>{g.name()}</h3>
          <div className="stamp-grid">
            {g.ids.map((id) => (
              <Stamp key={id} id={id} at={stamps[id]} star={explored.includes(id)} />
            ))}
          </div>
        </div>
      ))}
      <h3>{ui().stampBook.titles}</h3>
      <ul className="title-list">
        {shownTitles.map((title) => {
          const got = titles.includes(title.id)
          const { have, need } = titleProgress(title, stamps, explored)
          return (
            <li key={title.id} className={got ? 'got' : ''}>
              <span className="medal" aria-hidden />
              <span className="title-text">
                <strong>{title.secret && !got ? ui().stampBook.secret : titleText(title).name}</strong>
                <span className="muted small">{titleText(title).how(title.count)}</span>
              </span>
              <span className="title-count">{got ? ui().stampBook.done : `${have}/${need}`}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
