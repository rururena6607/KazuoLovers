// ログイン画面（F-01）。メールアドレスを入れてコードを送り、メールに届いた6桁のコードを入れる。
import { useState, type FormEvent } from 'react'
import type { Auth } from '../../lib/data/auth.ts'
import './auth.css'

type Step = { kind: 'email' } | { kind: 'code'; email: string }

export function LoginScreen({ auth }: { auth: Auth }) {
  const [step, setStep] = useState<Step>({ kind: 'email' })
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ログインできませんでした')
    } finally {
      setBusy(false)
    }
  }

  const onSendCode = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await auth.sendCode(email)
      setCode('')
      setStep({ kind: 'code', email: email.trim() })
    })
  }

  const onVerify = (e: FormEvent) => {
    e.preventDefault()
    if (step.kind !== 'code') return
    // 成功すると AuthGate がログイン状態の変化を受けて、アプリに切り替える
    void run(() => auth.verifyCode(step.email, code))
  }

  return (
    <main className="login">
      <h1>サーブレシーブ記録</h1>
      {step.kind === 'email' ? (
        <form onSubmit={onSendCode}>
          <label htmlFor="login-email">メールアドレス</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            {busy ? '送っています…' : 'ログイン用のコードを送る'}
          </button>
        </form>
      ) : (
        <form onSubmit={onVerify}>
          <p>{step.email} に届いたコードを入れてください。</p>
          <label htmlFor="login-code">コード</label>
          <input
            id="login-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            {busy ? '確かめています…' : 'ログイン'}
          </button>
          <div className="login-links">
            <button
              type="button"
              className="login-link"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await auth.sendCode(step.email)
                  // 送れたと分からないと何度も押され、メールの送信の上限に当たる
                  setNotice('コードを送り直しました。新しいメールのコードを入れてください。')
                })
              }
            >
              コードを送り直す
            </button>
            <button
              type="button"
              className="login-link"
              disabled={busy}
              onClick={() => {
                setError(null)
                setNotice(null)
                setStep({ kind: 'email' })
              }}
            >
              メールアドレスを変える
            </button>
          </div>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
