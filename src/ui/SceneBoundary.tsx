import { Component, useSyncExternalStore, type ReactNode } from 'react'
import { ui } from '../i18n'
import './sceneBoundary.css'

// 場面ごとの受け皿：着陸・船外活動・公園などの場面でプログラムが失敗しても、画面全体が真っ白にならないようにして、
// 「問題が起きました。もどる」を出す。onBack はその場面を閉じて自由探索へもどす（無ければ「読み直す」だけ）。
// アプリ全体も main.tsx でこれに包む（そのときは読み直すボタンだけ）。

// 動作確認用：crashScene('walk') で、その場面の受け皿の中でわざと失敗させる（debugHooks.ts から。自動テストで「もどる」を確かめる）
const crashing = new Set<string>()
const crashListeners = new Set<() => void>()
export function crashScene(name: string) {
  crashing.add(name)
  crashListeners.forEach((f) => f())
}
function CrashTest({ name }: { name: string }) {
  const on = useSyncExternalStore(
    (f) => (crashListeners.add(f), () => crashListeners.delete(f)),
    () => crashing.has(name),
  )
  // React は失敗した描画をもう一度試すので、受け皿が受けとめる（componentDidCatch）まで消さない
  if (on) throw new Error(`test crash: ${name}`)
  return null
}

type Props = {
  /** どの場面か（コンソールに出す名前） */
  name: string
  /** 場面を閉じて自由探索へもどす。無いときは読み直すボタンだけ */
  onBack?: () => void
  children: ReactNode
}

export class SceneBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown) {
    crashing.delete(this.props.name)
    console.error(`[scene] ${this.props.name} failed`, error)
  }

  back = () => {
    try {
      this.props.onBack?.()
    } finally {
      this.setState({ error: null })
    }
  }

  render() {
    const { error } = this.state
    if (!error)
      return (
        <>
          {this.props.children}
          <CrashTest name={this.props.name} />
        </>
      )
    const t = ui().sceneError
    return (
      <div className="scene-error" role="alert" data-scene={this.props.name}>
        <h2>{t.title}</h2>
        <p>{this.props.onBack ? t.body : t.bodyApp}</p>
        <div className="scene-error-actions">
          {this.props.onBack && (
            <button className="engage scene-error-back" onClick={this.back}>
              {t.back}
            </button>
          )}
          <button className="secondary" onClick={() => location.reload()}>
            {t.reload}
          </button>
        </div>
        <details>
          <summary>{t.detail}</summary>
          <code>{error.message.slice(0, 300)}</code>
        </details>
      </div>
    )
  }
}
