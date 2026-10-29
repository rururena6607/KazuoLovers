import { useEffect, useState, type ReactNode } from 'react'
import { iosBrowserOf, isIos, isStandalone, readStorage, writeStorage, type IosBrowser } from './pwa.ts'

// ホーム画面への追加の案内（F-18）。
// Android（Chrome）はブラウザが出す beforeinstallprompt を取っておき、「インストール」ボタンで出す。
// iPhone にはそのイベントがないので、ブラウザに合わせて「共有 → ホーム画面に追加」の手順を出す。

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
}

const DISMISSED_KEY = 'install-guide-dismissed'

const IOS_STEPS: Record<IosBrowser, ReactNode> = {
  safari: (
    <>
      ホーム画面に追加するには、Safari の <b>共有</b>（□↑）→ <b>ホーム画面に追加</b>
    </>
  ),
  other: (
    <>
      ホーム画面に追加するには、<b>共有</b>（□↑）→ <b>ホーム画面に追加</b>
      （出ないときは Safari で開いてください）
    </>
  ),
  inApp: (
    <>
      このアプリ内のブラウザでは追加できません。メニューから <b>Safari で開く</b> を選んでください
    </>
  ),
}

export default function InstallGuide() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  // サーバ側の描画（テスト）では window がないので、案内を出さない
  const [dismissed, setDismissed] = useState(
    () => typeof window === 'undefined' || isStandalone() || readStorage(DISMISSED_KEY) === '1',
  )

  useEffect(() => {
    // 閉じたあとは止めない（ブラウザ標準のインストールの案内が出るようにする）
    if (dismissed) return
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    // ブラウザのメニューからインストールしたときもバナーを消す
    const onInstalled = () => setInstallEvent(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [dismissed])

  const dismiss = () => {
    // 保存できなくても、今回は閉じる
    writeStorage(DISMISSED_KEY, '1')
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
            // prompt() は1つのイベントで1回だけ。失敗してもバナーは消す
            try {
              await installEvent.prompt()
            } catch {
              // 押し直しても同じ例外になるだけなので、何もしない
            } finally {
              setInstallEvent(null)
            }
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

  if (isIos(navigator.userAgent, navigator.maxTouchPoints)) {
    return (
      <div className="banner">
        <span>{IOS_STEPS[iosBrowserOf(navigator.userAgent)]}</span>
        <button type="button" className="btn" onClick={dismiss}>
          閉じる
        </button>
      </div>
    )
  }

  return null
}
