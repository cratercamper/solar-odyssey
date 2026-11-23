import { useState } from 'react'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { camChoices, pickCam, useMoonMission } from '../../state/moonMission'
import './camMenu.css'

/** カメラのボタン：押すと、いまの場面で選べるカメラの一覧が開く（先頭がおすすめ） */
export function CamMenu() {
  useLang()
  const [open, setOpen] = useState(false)
  const cam = useMoonMission((s) => s.cam)
  // 一覧は場面と高さで変わるので、開いたときに作る
  useMoonMission((s) => s.phase)
  const T = ui().moonMission
  const list = open ? camChoices() : []
  return (
    <span className="cam-wrap">
      <button className={`cam-open ${open ? 'on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {T.camLabel(T.camNames[cam])} ▾
      </button>
      {open && (
        <div className="cam-panel" role="menu" aria-label={T.camTitle}>
          {list.map((c, i) => (
            <button
              key={c}
              role="menuitemradio"
              aria-checked={c === cam}
              className={c === cam ? 'now' : ''}
              onClick={() => {
                pickCam(c)
                setOpen(false)
              }}
            >
              <span>{T.camNames[c]}</span>
              {i === 0 && list.length > 1 && <i>{T.camBest}</i>}
            </button>
          ))}
          <p className="cam-zoom">{T.camZoom}</p>
        </div>
      )}
    </span>
  )
}
