// ログインしていなければログイン画面を出し、ログインしていれば children を出す（F-01）。
// 一度ログインした端末は、再読み込みしても電波がなくてもログインしたまま（lib/data/auth.ts）。
import { useEffect, useState, type ReactNode } from 'react'
import type { Auth, AuthSession } from '../../lib/data/auth.ts'
import { LoginScreen } from './LoginScreen.tsx'

export function AuthGate({ auth, children }: { auth: Auth; children: ReactNode }) {
  // undefined：端末に保ったログイン状態をまだ読んでいない
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined)

  useEffect(() => auth.subscribe(setSession), [auth])

  // 読むのは一瞬なので、ログイン画面がちらつかないよう何も出さない
  if (session === undefined) return null
  if (session === null) return <LoginScreen auth={auth} />
  return <>{children}</>
}
