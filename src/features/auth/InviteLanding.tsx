// 招待リンク（?invite=コード）で開いたとき、ログインのあとに出す参加の確認（T-43、F-02）。
// 参加したらアプリを読み直し、やめたらいつもの画面に戻る。どちらもアドレスバーからコードを消す。
import { JoinForm } from '../admin/JoinForm.tsx'
import { urlWithoutInvite } from '../../lib/data/invite.ts'
import type { TeamData } from '../../lib/data/teamData.ts'
import '../admin/admin.css'

interface Props {
  data: TeamData
  code: string
  onClose: () => void
}

const dropInviteFromUrl = () => window.history.replaceState(null, '', urlWithoutInvite(window.location.href))

export function InviteLanding({ data, code, onClose }: Props) {
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
        onCancel={() => {
          dropInviteFromUrl()
          onClose()
        }}
      />
    </div>
  )
}
