import { describe, expect, it } from 'vitest'
import {
  createAuth,
  toLoginErrorMessage,
  type AuthClient,
  type AuthSession,
  type KeyValueStorage,
} from './auth.ts'

type StateCallback = Parameters<AuthClient['onAuthStateChange']>[0]
type Result = { error: { name: string; message: string; status?: number; code?: string } | null }

function createFakeClient(results: { signIn?: Result; verify?: Result } = {}) {
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
      return { error: null }
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

  it('電波がなくて INITIAL_SESSION が null でも、ログアウトするまではログインしたままにする', () => {
    const storage = createMemoryStorage()
    const user = { user: { id: 'u1', email: 'a@example.com' } }

    // 1回目の起動：ログインする
    const first = createFakeClient()
    const unsubscribe = createAuth(() => first.client, storage).subscribe(() => {})
    first.emit('SIGNED_IN', user)
    unsubscribe()

    // 2回目の起動：電波がなく、トークンを更新できない
    const second = createFakeClient()
    const seen: (AuthSession | null)[] = []
    createAuth(() => second.client, storage).subscribe((s) => seen.push(s))
    second.emit('INITIAL_SESSION', null)
    second.emit('TOKEN_REFRESHED', user)
    second.emit('SIGNED_OUT', null)
    second.emit('INITIAL_SESSION', null)

    const u1 = { userId: 'u1', email: 'a@example.com' }
    expect(seen).toEqual([u1, u1, null, null])
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
    expect(toLoginErrorMessage({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toBe(
      '通信できませんでした。電波のよい場所でもう一度試してください。',
    )
  })

  it('送りすぎは code でも 429 でも同じ案内にする', () => {
    const byCode = toLoginErrorMessage({
      name: 'AuthApiError',
      message: 'rate limit',
      code: 'over_email_send_rate_limit',
    })
    const byStatus = toLoginErrorMessage({ name: 'AuthApiError', message: 'rate limit', status: 429 })
    expect(byCode).toBe('メールを送りすぎました。しばらく待ってから、もう一度試してください。')
    expect(byStatus).toBe(byCode)
  })

  it('知らないエラーは元のメッセージを添える', () => {
    expect(toLoginErrorMessage({ name: 'AuthApiError', message: 'Signups not allowed' })).toBe(
      'ログインできませんでした（Signups not allowed）',
    )
  })
})
