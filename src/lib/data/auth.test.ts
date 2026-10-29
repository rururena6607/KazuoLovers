import { describe, expect, it } from 'vitest'
import {
  createAuth,
  toLoginErrorMessage,
  type AuthClient,
  type AuthSession,
  type KeyValueStorage,
} from './auth.ts'
import { SUPABASE_STORAGE_KEY } from './supabaseClient.ts'

type StateCallback = Parameters<AuthClient['onAuthStateChange']>[0]
type Result = { error: { name: string; message: string; status?: number; code?: string } | null }

function createFakeClient(
  results: { signIn?: Result; verify?: Result; signOut?: () => Result } = {},
) {
  const calls: { method: string; args: unknown }[] = []
  const callbacks = new Set<StateCallback>()
  const client: AuthClient = {
    async signInWithOtp(args) {
      calls.push({ method: 'signInWithOtp', args })
      return results.signIn ?? { error: null }
    },
    async verifyOtp(args) {
      calls.push({ method: 'verifyOtp', args })
      return results.verify ?? { error: null }
    },
    async signOut(args) {
      calls.push({ method: 'signOut', args })
      return results.signOut?.() ?? { error: null }
    },
    onAuthStateChange(callback) {
      callbacks.add(callback)
      return { data: { subscription: { unsubscribe: () => callbacks.delete(callback) } } }
    },
  }
  const emit: StateCallback = (event, session) => {
    for (const fn of callbacks) fn(event, session)
  }
  return { client, calls, callbacks, emit }
}

function createMemoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

describe('createAuth', () => {
  it('前後の空白を除いたメールアドレスにコードを送る', async () => {
    const fake = createFakeClient()
    await createAuth(() => fake.client, createMemoryStorage()).sendCode('  a@example.com ')
    expect(fake.calls).toEqual([{ method: 'signInWithOtp', args: { email: 'a@example.com' } }])
  })

  it('コードの空白を除いて type: email で確かめる', async () => {
    const fake = createFakeClient()
    await createAuth(() => fake.client, createMemoryStorage()).verifyCode('a@example.com', '123 456')
    expect(fake.calls).toEqual([
      { method: 'verifyOtp', args: { email: 'a@example.com', token: '123456', type: 'email' } },
    ])
  })

  it('コードが違うと日本語のエラーにする', async () => {
    const fake = createFakeClient({
      verify: { error: { name: 'AuthApiError', message: 'Token has expired', code: 'otp_expired' } },
    })
    await expect(createAuth(() => fake.client, createMemoryStorage()).verifyCode('a@example.com', '000000')).rejects.toThrow(
      'コードが違うか、期限が切れています。',
    )
  })

  it('ログアウトはこの端末だけにする', async () => {
    const fake = createFakeClient()
    await createAuth(() => fake.client, createMemoryStorage()).signOut()
    expect(fake.calls).toEqual([{ method: 'signOut', args: { scope: 'local' } }])
  })

  it('電波がなくてサーバーに伝えられなくても、端末のログインが消えていればログアウトできたとする', async () => {
    const storage = createMemoryStorage()
    storage.setItem(SUPABASE_STORAGE_KEY, '{}')
    const networkError = { name: 'AuthRetryableFetchError', message: 'Failed to fetch' }
    // supabase-js は端末のログインを消してからエラーを返す
    const fake = createFakeClient({
      signOut: () => {
        storage.removeItem(SUPABASE_STORAGE_KEY)
        return { error: networkError }
      },
    })
    await expect(createAuth(() => fake.client, storage).signOut()).resolves.toBeUndefined()
  })

  it('端末のログインが残ったままのログアウトの失敗は、エラーにする', async () => {
    const storage = createMemoryStorage()
    storage.setItem(SUPABASE_STORAGE_KEY, '{}')
    const fake = createFakeClient({
      signOut: () => ({ error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } }),
    })
    await expect(createAuth(() => fake.client, storage).signOut()).rejects.toThrow(
      '通信できませんでした。電波のよい場所でもう一度試してください。',
    )
  })

  it('ログイン状態の変化を AuthSession にして渡し、解除するともう呼ばない', () => {
    const fake = createFakeClient()
    const seen: (AuthSession | null)[] = []
    const unsubscribe = createAuth(() => fake.client, createMemoryStorage()).subscribe((s) => seen.push(s))

    fake.emit('INITIAL_SESSION', null)
    fake.emit('SIGNED_IN', { user: { id: 'u1', email: 'a@example.com' } })
    fake.emit('TOKEN_REFRESHED', { user: { id: 'u1' } })
    unsubscribe()
    fake.emit('SIGNED_OUT', null)

    expect(seen).toEqual([
      null,
      { userId: 'u1', email: 'a@example.com' },
      { userId: 'u1', email: null },
    ])
    expect(fake.callbacks.size).toBe(0)
  })

  it('同じ部員のままの通知（タブに戻ったとき、トークンの更新）は知らせず、保存もし直さない', () => {
    const storage = createMemoryStorage()
    const fake = createFakeClient()
    const seen: (AuthSession | null)[] = []
    createAuth(() => fake.client, storage).subscribe((s) => seen.push(s))
    const user = { user: { id: 'u1', email: 'a@example.com' } }

    fake.emit('SIGNED_IN', user)
    storage.data.clear()
    fake.emit('SIGNED_IN', user)
    fake.emit('TOKEN_REFRESHED', user)

    expect(seen).toEqual([{ userId: 'u1', email: 'a@example.com' }])
    expect(storage.data.size).toBe(0)
  })

  it('電波がなくて INITIAL_SESSION が null でも、Supabase が端末にログインを残していればログインしたままにする', () => {
    const storage = createMemoryStorage()
    const user = { user: { id: 'u1', email: 'a@example.com' } }
    const u1 = { userId: 'u1', email: 'a@example.com' }

    // 1回目の起動：ログインする（Supabase が端末にログインを保つ）
    const first = createFakeClient()
    const unsubscribe = createAuth(() => first.client, storage).subscribe(() => {})
    storage.setItem(SUPABASE_STORAGE_KEY, '{}')
    first.emit('SIGNED_IN', user)
    unsubscribe()

    // 2回目の起動：電波がなく、トークンを更新できない。通信を待たずに読める
    const second = createFakeClient()
    const auth = createAuth(() => second.client, storage)
    expect(auth.current()).toEqual(u1)
    const seen: (AuthSession | null)[] = []
    auth.subscribe((s) => seen.push(s))
    second.emit('INITIAL_SESSION', null)
    second.emit('TOKEN_REFRESHED', user)
    storage.removeItem(SUPABASE_STORAGE_KEY)
    second.emit('SIGNED_OUT', null)

    expect(seen).toEqual([u1, null])
    expect(storage.data.size).toBe(0)
    expect(auth.current()).toBeNull()
  })

  it('Supabase が端末のログインを消していれば、最後にログインした部員がいても INITIAL_SESSION の null に従う', () => {
    // リフレッシュトークンが無効で、購読する前に Supabase がログインを消した場合など
    const storage = createMemoryStorage()
    storage.setItem('kazuolovers.lastSession', JSON.stringify({ userId: 'u1', email: null }))
    const fake = createFakeClient()
    const auth = createAuth(() => fake.client, storage)
    expect(auth.current()).toBeNull()

    const seen: (AuthSession | null)[] = []
    auth.subscribe((s) => seen.push(s))
    fake.emit('INITIAL_SESSION', null)

    expect(seen).toEqual([null])
    expect(storage.data.size).toBe(0)
  })

  it('保存できない端末でも、ログイン状態の通知は止めない', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    const fake = createFakeClient()
    const seen: (AuthSession | null)[] = []
    createAuth(() => fake.client, broken).subscribe((s) => seen.push(s))
    fake.emit('INITIAL_SESSION', null)
    fake.emit('SIGNED_IN', { user: { id: 'u1' } })
    expect(seen).toEqual([null, { userId: 'u1', email: null }])
  })

  it('使うまでクライアントを作らない', () => {
    let created = 0
    createAuth(() => {
      created++
      return createFakeClient().client
    }, createMemoryStorage())
    expect(created).toBe(0)
  })
})

describe('toLoginErrorMessage', () => {
  it('通信できないときは電波の案内を出す', () => {
    expect(toLoginErrorMessage({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }, 'sendCode')).toBe(
      '通信できませんでした。電波のよい場所でもう一度試してください。',
    )
  })

  it('送りすぎは code でも 429 でも同じ案内にする', () => {
    const byCode = toLoginErrorMessage(
      { name: 'AuthApiError', message: 'rate limit', code: 'over_email_send_rate_limit' },
      'sendCode',
    )
    const byStatus = toLoginErrorMessage({ name: 'AuthApiError', message: 'rate limit', status: 429 }, 'sendCode')
    expect(byCode).toBe('メールを送りすぎました。しばらく待ってから、もう一度試してください。')
    expect(byStatus).toBe(byCode)
  })

  it('validation_failed は、コードを確かめるときはコードの、送るときはメールアドレスの誤りにする', () => {
    const error = { name: 'AuthApiError', message: 'invalid', code: 'validation_failed' }
    expect(toLoginErrorMessage(error, 'verifyCode')).toBe(
      'コードの形が正しくありません。メールに届いた数字だけを入れてください。',
    )
    expect(toLoginErrorMessage(error, 'sendCode')).toBe('メールアドレスの形が正しくありません。')
  })

  it('知らないエラーは元のメッセージを添える', () => {
    expect(toLoginErrorMessage({ name: 'AuthApiError', message: 'Signups not allowed' }, 'sendCode')).toBe(
      'ログインできませんでした（Signups not allowed）',
    )
  })
})
