// 招待コードでチームに参加する（T-43、F-02）。参加すると、いまのチームからは抜ける。
// 管理者が自分だけのチームは消える（選手・試合・記録も）ので、注意を2回出してから参加する。
import { useEffect, useState, type FormEvent } from 'react'
import type { Team } from '../../contracts/index.ts'
import type { JoinPreview } from '../../lib/data/invite.ts'
import type { TeamData } from '../../lib/data/teamData.ts'
import { useAction } from './useAction.ts'

interface Props {
  data: TeamData
  onJoined: (team: Team) => void
  /** 招待リンクで開いたときのコード。あれば、すぐに確かめる */
  initialCode?: string
  /** 「やめる」を押したとき（招待リンクの画面を閉じる）。なければ、入力に戻るだけ */
  onCancel?: () => void
}

/** input：コードを入れる。confirm：入るチームと抜けるチームを見せる。confirmDelete：消えるチームをもう一度確かめる */
type Step = 'input' | 'confirm' | 'confirmDelete'

const names = (list: readonly string[]) => list.map((n) => `「${n}」`).join('・')

export function JoinForm({ data, onJoined, initialCode, onCancel }: Props) {
  const [code, setCode] = useState(initialCode ?? '')
  const [preview, setPreview] = useState<JoinPreview | null>(null)
  const [step, setStep] = useState<Step>('input')
  /** 招待リンクで開いた直後の確認中（入力欄を見せない） */
  const [checking, setChecking] = useState(Boolean(initialCode))
  const { busy, error, run, clearError } = useAction()

  const reset = () => {
    setPreview(null)
    setStep('input')
    clearError()
    onCancel?.()
  }

  // 招待リンクで開いたら、コードを入れる手間を省いて、すぐ確かめる
  useEffect(() => {
    if (!initialCode) return
    void run(async () => {
      setPreview(await data.previewJoin(initialCode))
      setStep('confirm')
    }).finally(() => setChecking(false))
  }, [data, initialCode, run])

  if (checking) return <p className="admin-mute">招待を確かめています…</p>

  const onCheck = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      setPreview(await data.previewJoin(code))
      setStep('confirm')
    })
  }

  const join = (allowDelete: boolean) => {
    void run(async () => onJoined(await data.joinTeam(code, allowDelete)))
  }

  if (step === 'input' || !preview) {
    return (
      <form className="admin-form" onSubmit={onCheck}>
        <label>
          招待コード
          <input
            required
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <div className="admin-inline">
          <button type="submit" className="btn" disabled={busy}>
            {busy ? '確かめています…' : '確かめる'}
          </button>
          {onCancel && (
            <button type="button" className="btn" disabled={busy} onClick={reset}>
              やめる
            </button>
          )}
        </div>
        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
      </form>
    )
  }

  const deleting = preview.deleting.length > 0

  // 自分がただ一人の管理者で、ほかに部員がいるチームからは移れない（サーバーでも止める）
  if (preview.blocked.length > 0) {
    return (
      <div className="admin-form">
        <p className="admin-error" role="alert">
          あなたは{names(preview.blocked)}のただ一人の管理者で、ほかに部員がいるので、「{preview.teamName}」には移れません。
          移ると{names(preview.blocked)}と、その選手・試合・記録がすべて消え、ほかの部員もチームを失います。
        </p>
        <p className="admin-mute">
          先にほかの人を管理者にしてください（いまは、Supabase の Table Editor で team_members の role を admin に変えます）。
        </p>
        <div className="admin-inline">
          <button type="button" className="btn" onClick={reset}>
            やめる
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-form">
      <p>「{preview.teamName}」に部員として参加します。</p>
      {preview.leaving.length > 0 && <p>{names(preview.leaving)}からは抜けます（チームと記録は残ります）。</p>}
      {preview.leaving.length + preview.deleting.length > 0 && (
        <p className="admin-mute">
          記録の画面に「未送信」が出ているときは、送り終えてから移ってください。移ったあとは、前のチームの記録は送れません。
        </p>
      )}
      {deleting && (
        <p className="admin-error">
          あなたは{names(preview.deleting)}のただ一人の管理者なので、参加すると{names(preview.deleting)}は消えます。
          選手・試合・記録もすべて消え、元に戻せません。
        </p>
      )}
      {step === 'confirmDelete' && (
        <p className="admin-error" role="alert">
          本当に{names(preview.deleting)}を消して参加しますか？
        </p>
      )}
      {step === 'confirm' ? (
        <div className="admin-inline">
          <button
            type="button"
            className={deleting ? 'btn admin-danger' : 'btn admin-primary'}
            disabled={busy}
            onClick={() => (deleting ? setStep('confirmDelete') : join(false))}
          >
            {busy ? '参加しています…' : '参加する'}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={reset}>
            やめる
          </button>
        </div>
      ) : (
        // 2 回目は並びを入れ替える。1 回目の「参加する」と同じ位置には「やめる」が来るので、
        // 素早く 2 回タップしても消えない
        <div className="admin-inline">
          <button type="button" className="btn" disabled={busy} onClick={reset}>
            やめる
          </button>
          <button type="button" className="btn admin-danger" disabled={busy} onClick={() => join(true)}>
            {busy ? '参加しています…' : '消して参加する'}
          </button>
        </div>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
