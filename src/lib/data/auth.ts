// メールの6桁のコードでのログイン（F-01）。画面はこの Auth だけを使い、Supabase を直接呼ばない。
// ログインリンクは iPhone ではホーム画面のアプリではなく Safari で開くので使わない。
import type { Unsubscribe } from '../../contracts/index.ts'
import { getSupabase } from './supabaseClient.ts'

export interface AuthSession {
  userId: string
  email: string | null
}

export interface Auth {
  /** ログイン用のコードをメールで送る。初めてのメールアドレスなら利用者を作る */
  sendCode(email: string): Promise<void>
  /** メールのコードを確かめてログインする */
  verifyCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>
  /**
   * ログイン状態が変わるたびに呼ぶ。端末に保ったログイン状態を読んだあとにも1回呼ぶ。
   * 電波がなくても、この端末でログアウトするまではログインしたままとして渡す
   */
  subscribe(onChange: (session: AuthSession | null) => void): Unsubscribe
}

interface AuthErrorLike {
  name: string
  message: string
  status?: number
  code?: string
}

/** supabase.auth のうち、ここで使う部分。テストでは偽物を渡す */
export interface AuthClient {
  signInWithOtp(credentials: {
    email: string
    options?: { shouldCreateUser?: boolean }
  }): Promise<{ error: AuthErrorLike | null }>
  verifyOtp(params: { email: string; token: string; type: 'email' }): Promise<{
    error: AuthErrorLike | null
  }>
  signOut(options?: { scope?: 'local' }): Promise<{ error: AuthErrorLike | null }>
  onAuthStateChange(
    callback: (event: string, session: { user: { id: string; email?: string } } | null) => void,
  ): { data: { subscription: { unsubscribe(): void } } }
}

/** 最後にログインした部員を覚えておく場所。テストでは偽物を渡す */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const LAST_SESSION_KEY = 'kazuolovers.lastSession'

/** Supabase のエラーを、画面にそのまま出せる日本語にする */
export function toLoginErrorMessage(error: AuthErrorLike): string {
  if (error.name === 'AuthRetryableFetchError') {
    return '通信できませんでした。電波のよい場所でもう一度試してください。'
  }
  switch (error.code) {
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'メールを送りすぎました。しばらく待ってから、もう一度試してください。'
    case 'otp_expired':
      return 'コードが違うか、期限が切れています。'
    case 'email_address_invalid':
    case 'validation_failed':
      return 'メールアドレスの形が正しくありません。'
  }
  if (error.status === 429) {
    return 'メールを送りすぎました。しばらく待ってから、もう一度試してください。'
  }
  return `ログインできませんでした（${error.message}）`
}

function throwIfError(result: { error: AuthErrorLike | null }): void {
  if (result.error) throw new Error(toLoginErrorMessage(result.error))
}

function readSession(storage: KeyValueStorage): AuthSession | null {
  try {
    const raw = storage.getItem(LAST_SESSION_KEY)
    if (raw === null) return null
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const { userId, email } = v as Record<string, unknown>
    if (typeof userId !== 'string') return null
    return { userId, email: typeof email === 'string' ? email : null }
  } catch {
    return null
  }
}

function writeSession(storage: KeyValueStorage, session: AuthSession | null): void {
  try {
    if (session) storage.setItem(LAST_SESSION_KEY, JSON.stringify(session))
    else storage.removeItem(LAST_SESSION_KEY)
  } catch {
    // Safari のプライベートブラウズなどで保存できなくても、ログインはできる
  }
}

/** getClient は最初に使うときに呼ぶ */
export function createAuth(getClient: () => AuthClient, storage: KeyValueStorage): Auth {
  return {
    async sendCode(email) {
      throwIfError(await getClient().signInWithOtp({ email: email.trim() }))
    },
    async verifyCode(email, code) {
      const token = code.replace(/\s/g, '')
      throwIfError(await getClient().verifyOtp({ email: email.trim(), token, type: 'email' }))
    },
    async signOut() {
      // この端末だけログアウトする。電波がないと失敗し、ログインしたままになる
      throwIfError(await getClient().signOut({ scope: 'local' }))
    },
    subscribe(onChange) {
      const { data } = getClient().onAuthStateChange((event, session) => {
        if (session) {
          const s = { userId: session.user.id, email: session.user.email ?? null }
          writeSession(storage, s)
          onChange(s)
        } else if (event === 'INITIAL_SESSION') {
          // 電波がなくてトークンを更新できないと、端末にログインが残っていても null が来る。
          // ログアウトの通知（SIGNED_OUT）が来るまでは、最後にログインした部員のままにする。
          // 電波が戻ると Supabase が更新し、TOKEN_REFRESHED が来る
          onChange(readSession(storage))
        } else {
          writeSession(storage, null)
          onChange(null)
        }
      })
      return () => data.subscription.unsubscribe()
    },
  }
}

const browserStorage: KeyValueStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
}

/** アプリで使う Auth */
export const auth: Auth = createAuth(() => getSupabase().auth, browserStorage)
