// 招待コード（T-43、F-02）：管理者だけに出す。発行・再発行すると、前のコードは使えなくなる。
import { useEffect, useState } from 'react'
import type { InviteInfo } from '../../lib/data/invite.ts'
import type { TeamData } from '../../lib/data/teamData.ts'
import { useAction } from './useAction.ts'

interface Props {
  data: TeamData
  teamId: string
}

export function InviteSection({ data, teamId }: Props) {
  const [info, setInfo] = useState<InviteInfo | null>(null)
  /** 再発行の確認を出しているか（押し間違いで前のコードを使えなくしないよう、2 回押す） */
  const [confirming, setConfirming] = useState(false)
  const { busy, error, run } = useAction()

  useEffect(() => {
    void run(async () => setInfo(await data.inviteInfo(teamId)))
  }, [data, teamId, run])

  const regenerate = () => {
    void run(async () => {
      const code = await data.regenerateInviteCode(teamId)
      setInfo({ isAdmin: true, code })
      setConfirming(false)
    })
  }

  // 部員には出さない（読めなかったときは、理由だけ出す）
  if (!info?.isAdmin) {
    return error ? (
      <p className="admin-error" role="alert">
        {error}
      </p>
    ) : null
  }

  return (
    <section className="admin-section">
      <h2>招待コード</h2>
      {info.code ? (
        <>
          <p className="admin-code" aria-label="招待コード">
            {info.code}
          </p>
          <p className="admin-mute">部員に伝えると、管理画面の「ほかのチームに移る」か、最初の画面から参加できます。</p>
        </>
      ) : (
        <p className="admin-mute">まだ発行していません。</p>
      )}
      {confirming ? (
        <div className="admin-inline">
          <span className="admin-error">いまのコードは使えなくなります。</span>
          <button type="button" className="btn admin-danger" disabled={busy} onClick={regenerate}>
            {busy ? '発行しています…' : '再発行する'}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>
            やめる
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => (info.code ? setConfirming(true) : regenerate())}
        >
          {info.code ? '再発行' : busy ? '発行しています…' : '発行する'}
        </button>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
