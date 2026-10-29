import { useRegisterSW } from 'virtual:pwa-register/react'

// 新しい版の通知（要件定義書 10 章「更新」）。
// 未送信の記録があるあいだは再読み込みせず、送り終わってから押せるようにする。

interface Props {
  /** 未送信の件数（RecordRepository.subscribePending） */
  pending: number
}

export default function UpdatePrompt({ pending }: Props) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

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
