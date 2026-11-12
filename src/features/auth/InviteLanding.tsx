// 招待リンク（?invite=コード）で開いたとき、ログインのあとに出す参加の確認（T-43、F-02）。
// 参加したらアプリを読み直し、やめたらいつもの画面に戻る。どちらもアドレスバーからコードを消す。
import { JoinForm } from '../admin/JoinForm.tsx'
import { urlWithoutInvite } from '../../lib/data/invite.ts'
import type { TeamData } from '../../lib/data/teamData.ts'
import '../admin/admin.css'

interface Props {
  data: TeamData
  /** 招待リンクのコード。リンクが途中で切れているなど、読めなければ null */
  code: string | null
  onClose: () => void
}

const dropInviteFromUrl = () => window.history.replaceState(null, '', urlWithoutInvite(window.location.href))

export function InviteLanding({ data, code, onClose }: Props) {
  const close = () => {
    dropInviteFromUrl()
    onClose()
  }

  if (code === null) {
    return (
      <div className="admin">
        <h1>チームへの招待</h1>
        <p className="admin-error" role="alert">
          招待リンクが正しくありません（途中で切れているかもしれません）。管理者に、リンクをもう一度送ってもらってください。
        </p>
        <button type="button" className="btn" onClick={close}>
          閉じる
        </button>
      </div>
    )
  }

  return (
    <div className="admin">
      <h1>チームへの招待</h1>
      <JoinForm
        data={data}
        initialCode={code}
        onJoined={() => {
          dropInviteFromUrl()
          window.location.reload()
        }}
        onCancel={close}
      />
    </div>
  )
}
