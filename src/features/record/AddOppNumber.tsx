import { useState, type FormEvent } from 'react'
import type { OpponentPlayer } from '../../contracts/index.ts'
import { parseOppNumber } from './matchSource.ts'

// 相手の背番号を試合中にその場で足す（F-04）。「＋」を押すと番号の入力が出る。
// 足した背番号は親（記録のタブ）が一覧に入れ、onAdded で選んだ状態にする。

interface Props {
  /** 足せないとき（練習・デモの相手なし）は undefined */
  onAdd?: (number: number) => Promise<OpponentPlayer>
  onAdded: (player: OpponentPlayer) => void
}

export default function AddOppNumber({ onAdd, onAdded }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!onAdd) return null

  const value = parseOppNumber(text)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value === null || busy) return
    setBusy(true)
    setError(null)
    onAdd(value)
      .then((p) => {
        onAdded(p)
        setText('')
        setOpen(false)
      })
      .catch((err: unknown) => {
        console.error(err)
        setError('足せませんでした。電波を確かめて、もう一度押してください')
      })
      .finally(() => setBusy(false))
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn chip"
        aria-label="相手の背番号を足す"
        onClick={() => setOpen(true)}
      >
        ＋
      </button>
    )
  }

  return (
    <form className="add-opp" onSubmit={submit}>
      <input
        className="num"
        aria-label="相手の背番号"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="btn btn-sm" disabled={value === null || busy}>
        足す
      </button>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
        やめる
      </button>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}
