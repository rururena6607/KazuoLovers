import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import type { RecordRepository } from '../contracts/index.ts'

// 新しい版の通知（要件定義書 10 章「更新」）。
// 未送信の記録があるあいだは再読み込みせず、送り終わってから押せるようにする。

/** ホーム画面から開いたまま使い続けても、この間隔で新しい版を確かめる */
const CHECK_INTERVAL_MS = 60 * 60 * 1000

interface Props {
  /** 未送信の件数はここから自分で購読する（渡し忘れて 0 のままにならないように） */
  repo: Pick<RecordRepository, 'subscribePending'>
}

export default function UpdatePrompt({ repo }: Props) {
  const [pending, setPending] = useState(0)
  useEffect(() => repo.subscribePending(setPending), [repo])

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {})
      }
      setInterval(check, CHECK_INTERVAL_MS)
      // 画面に戻ったときにも確かめる
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  if (!needRefresh) return null

  return (
    <div className="banner">
      <span>{pending > 0 ? `未送信 ${pending}件を送ってから更新します` : '更新があります'}</span>
      <button
        type="button"
        className="btn"
        disabled={pending > 0}
        onClick={() => updateServiceWorker(true)}
      >
        更新する
      </button>
    </div>
  )
}
