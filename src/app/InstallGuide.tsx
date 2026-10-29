import { useEffect, useState } from 'react'
import { isIos, isStandalone } from './pwa.ts'

// ホーム画面への追加の案内（F-18）。
// Android（Chrome）はブラウザが出す beforeinstallprompt を取っておき、「インストール」ボタンで出す。
// iPhone の Safari にはそのイベントがないので、「共有 → ホーム画面に追加」の手順を出す。

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
}

const DISMISSED_KEY = 'install-guide-dismissed'

export default function InstallGuide() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  // サーバ側の描画（テスト）では window がないので、案内を出さない
  const [dismissed, setDismissed] = useState(
    () =>
      typeof window === 'undefined' ||
      isStandalone() ||
      localStorage.getItem(DISMISSED_KEY) === '1',
  )

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  if (dismissed) return null

  if (installEvent) {
    return (
      <div className="banner">
        <span>ホーム画面に追加すると、全画面で使えます</span>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await installEvent.prompt()
            setInstallEvent(null)
          }}
        >
          インストール
        </button>
        <button type="button" className="btn" onClick={dismiss}>
          閉じる
        </button>
      </div>
    )
  }

  if (isIos(navigator.userAgent)) {
    return (
      <div className="banner">
        <span>
          ホーム画面に追加するには、Safari の <b>共有</b>（□↑）→ <b>ホーム画面に追加</b>
        </span>
        <button type="button" className="btn" onClick={dismiss}>
          閉じる
        </button>
      </div>
    )
  }

  return null
}
