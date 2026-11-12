// ログインしていなければログイン画面を出し、ログインしていれば children を出す（F-01）。
// 一度ログインした端末は、再読み込みしても電波がなくてもログインしたまま（lib/data/auth.ts）。
// 招待リンク（?invite=コード、T-43）で開いたときは、ログインのあとに参加の確認を先に出す。
import { useEffect, useState, type ReactNode } from 'react'
import type { Auth, AuthSession } from '../../lib/data/auth.ts'
import { inviteCodeFromUrl } from '../../lib/data/invite.ts'
import { teamData } from '../../lib/data/teamData.ts'
import { InviteLanding } from './InviteLanding.tsx'
import { LoginScreen } from './LoginScreen.tsx'

export function AuthGate({ auth, children }: { auth: Auth; children: ReactNode }) {
  // Supabase の確かめを待たず、端末に保ったログイン状態ですぐに出す。
  // 電波がないと、確かめが終わるまで30秒以上かかることがある
  const [session, setSession] = useState<AuthSession | null>(() => auth.current())
  const [invite, setInvite] = useState(() => inviteCodeFromUrl(window.location.search))

  useEffect(() => {
    try {
      return auth.subscribe(setSession)
    } catch (e) {
      // キー（VITE_SUPABASE_*）がないと Supabase を作れない。白い画面にはせずログイン画面を出し、
      // コードを送ろうとしたときに同じ理由を画面に出す
      console.error(e)
    }
  }, [auth])

  if (session === null) return <LoginScreen auth={auth} />
  if (invite) return <InviteLanding data={teamData} code={invite.code} onClose={() => setInvite(null)} />
  return <>{children}</>
}
