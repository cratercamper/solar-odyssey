import { useRef, useState, useSyncExternalStore } from 'react'
import { exportFileName, exportText, readSaveText, saveData, SaveError, summarize, type SaveFile } from '../state/save'
import { ui } from '../i18n'
import { useLang } from '../i18n/lang'
import './saveData.css'

// セーブデータ画面（航法パネルの設定の下）：最後に保存した時刻、記録の一覧、書き出し・読み込み・記録を消す。
// 記録の名前は state/saves/*.ts の registerSave から（ここでまとめて読み込む）
import.meta.glob('../state/saves/*.ts', { eager: true })

const useSavedAt = () => useSyncExternalStore(saveData.subscribe, saveData.savedAt)

function Rows({ data }: { data: Record<string, string> }) {
  const rows = summarize(data)
  if (!rows.length) return <div className="muted small">{ui().saveData.empty}</div>
  return (
    <ul className="save-rows">
      {rows.map((r) => (
        <li key={r.name}>
          <span>{r.entry ? r.entry.label() : r.name}</span>
          {r.entry?.prefix && <span className="muted">{ui().saveData.count(r.count)}</span>}
        </li>
      ))}
    </ul>
  )
}

export function SaveDataPanel() {
  useLang()
  const t = ui().saveData
  const savedAt = useSavedAt()
  const fileInput = useRef<HTMLInputElement>(null)
  const [incoming, setIncoming] = useState<SaveFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  const download = () => {
    const blob = new Blob([exportText()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = exportFileName(new Date())
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setClearing(false)
    try {
      setIncoming(readSaveText(await file.text()))
    } catch (e) {
      setIncoming(null)
      setError(t.errors[e instanceof SaveError ? e.kind : 'broken'])
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  // 読み込み・消去のあとは読み直す（どの機能も、起動したときにセーブから読むので）
  const applyImport = () => {
    if (!incoming) return
    saveData.replace(incoming)
    location.reload()
  }
  const applyClear = () => {
    saveData.clear()
    location.reload()
  }

  return (
    <details className="nav-settings save-data">
      <summary>{t.title}</summary>
      <div className="muted small save-at">{savedAt ? t.lastSaved(t.dateTime(new Date(savedAt))) : t.neverSaved}</div>
      {saveData.failed() && <div className="save-warn small">{t.storeFailed}</div>}
      {saveData.newer() && <div className="save-warn small">{t.newerSave}</div>}
      {saveData.recovered() && <div className="save-warn small">{t.recovered}</div>}
      {saveData.migrated() > 0 && <div className="muted small">{t.migrated(saveData.migrated())}</div>}
      <Rows data={saveData.snapshot().data} />
      <div className="muted small">{t.autoNote}</div>
      <div className="save-actions">
        <button className="secondary save-export" onClick={download}>
          {t.export}
        </button>
        <button className="secondary save-import" onClick={() => fileInput.current?.click()}>
          {t.import}
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
        <button className="secondary save-clear" onClick={() => (setIncoming(null), setClearing(true))}>
          {t.clear}
        </button>
      </div>
      {error && <div className="save-warn small">{error}</div>}
      {incoming && (
        <div className="save-confirm">
          <div className="small">{t.importCheck}</div>
          {incoming.savedAt > 0 && <div className="muted small">{t.fileSaved(t.dateTime(new Date(incoming.savedAt)))}</div>}
          <Rows data={incoming.data} />
          <div className="save-actions">
            <button className="engage save-overwrite" onClick={applyImport}>
              {t.overwrite}
            </button>
            <button className="secondary" onClick={() => setIncoming(null)}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}
      {clearing && (
        <div className="save-confirm">
          <div className="small">{t.clearCheck}</div>
          <div className="save-actions">
            <button className="engage save-clear-yes" onClick={applyClear}>
              {t.clearYes}
            </button>
            <button className="secondary" onClick={() => setClearing(false)}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}
    </details>
  )
}
