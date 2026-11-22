import { ui } from '../../i18n'
import { useLang } from '../../i18n/lang'

/** 与圧ローバーの説明（実在の計画のこと）。運転中に「この車について」で開く */
export function CrewInfoCard({ onClose }: { onClose: () => void }) {
  useLang()
  const t = ui().crewRover
  return (
    <div className="sample-card crew-card">
      <div className="sample-head">
        <span className="historic-icon">🚐</span>
        <div>
          <div className="sample-kicker">{t.name}</div>
          <div className="sample-name">{t.cardTitle}</div>
        </div>
      </div>
      {t.cardLines.map((line, i) => (
        <p key={i} className="sample-note">
          {line}
        </p>
      ))}
      <p className="sample-note muted">{t.cardNote}</p>
      <div className="sample-foot">
        <span />
        <button className="secondary" onClick={onClose}>
          {ui().surfaceView.close}
        </button>
      </div>
    </div>
  )
}
