// メールの6桁のコードでのログイン（F-01）。画面はこの Auth だけを使い、Supabase を直接呼ばない。
// ログインリンクは iPhone ではホーム画面のアプリではなく Safari で開くので使わない。
import type { Unsubscribe } from '../../contracts/index.ts'
import { getSupabase, SUPABASE_STORAGE_KEY } from './supabaseClient.ts'

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
   * 端末に保ったログイン状態を、通信せずにすぐ返す。起動直後の表示に使う。
   * Supabase の確かめは、電波がないとトークンの更新を30秒以上やり直してから終わる
   */
  current(): AuthSession | null
  /**
   * ログイン状態が変わるたびに呼ぶ（同じ部員のままなら呼ばない）。端末に保ったログイン状態を読んだあとにも1回呼ぶ。
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

/** Supabase のエラーを、画面にそのまま出せる日本語にする。step は、どの操作のエラーか */
export function toLoginErrorMessage(
  error: AuthErrorLike,
  step: 'sendCode' | 'verifyCode' | 'signOut',
): string {
  if (error.name === 'AuthRetryableFetchError') {
    return '通信できませんでした。電波のよい場所でもう一度試してください。'
  }
  switch (error.code) {
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'メールを送りすぎました。しばらく待ってから、もう一度試してください。'
    case 'otp_expired':
      return 'コードが違うか、期限が切れています。'
    case 'validation_failed':
      if (step === 'verifyCode') return 'コードの形が正しくありません。メールに届いた数字だけを入れてください。'
      return 'メールアドレスの形が正しくありません。'
    case 'email_address_invalid':
      return 'メールアドレスの形が正しくありません。'
  }
  if (error.status === 429) {
    return 'メールを送りすぎました。しばらく待ってから、もう一度試してください。'
  }
  return `ログインできませんでした（${error.message}）`
}

function throwIfError(
  result: { error: AuthErrorLike | null },
  step: Parameters<typeof toLoginErrorMessage>[1],
): void {
  if (result.error) throw new Error(toLoginErrorMessage(result.error, step))
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

/** Supabase が端末にログインを残しているか。トークンの更新を拒まれたときやログアウトしたときは Supabase が消す */
function hasSupabaseSession(storage: KeyValueStorage): boolean {
  try {
    return storage.getItem(SUPABASE_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/** 最後にログインした部員。Supabase が端末にログインを残しているときだけ返す */
function lastSession(storage: KeyValueStorage): AuthSession | null {
  return hasSupabaseSession(storage) ? readSession(storage) : null
}

function sameSession(a: AuthSession | null | undefined, b: AuthSession | null): boolean {
  if (a === undefined) return false
  if (a === null || b === null) return a === b
  return a.userId === b.userId && a.email === b.email
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
      throwIfError(await getClient().signInWithOtp({ email: email.trim() }), 'sendCode')
    },
    async verifyCode(email, code) {
      const token = code.replace(/\s/g, '')
      throwIfError(
        await getClient().verifyOtp({ email: email.trim(), token, type: 'email' }),
        'verifyCode',
      )
    },
    async signOut() {
      // この端末だけログアウトする。電波がなくてサーバーに伝えられなくても、Supabase は
      // 端末のログインを消して SIGNED_OUT を出してからエラーを返す。消えていればログアウトできている
      const result = await getClient().signOut({ scope: 'local' })
      if (result.error && !hasSupabaseSession(storage)) return
      throwIfError(result, 'signOut')
    },
    current() {
      return lastSession(storage)
    },
    subscribe(onChange) {
      let last: AuthSession | null | undefined
      const update = (s: AuthSession | null) => {
        // タブに戻ったときの SIGNED_IN やトークンの更新では、同じ部員のままなので知らせない
        if (sameSession(last, s)) return
        last = s
        writeSession(storage, s)
        onChange(s)
      }
      const { data } = getClient().onAuthStateChange((event, session) => {
        if (session) {
          update({ userId: session.user.id, email: session.user.email ?? null })
        } else if (event === 'INITIAL_SESSION') {
          // 電波がなくてトークンを更新できないと、Supabase は端末にログインを残したまま null を渡す。
          // 残っているときだけ、最後にログインした部員のままにする。電波が戻ると TOKEN_REFRESHED が来る。
          // 更新を拒まれた（リフレッシュトークンが無効）ときは、Supabase が端末のログインを消しているので null にする
          update(lastSession(storage))
        } else {
          update(null)
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
