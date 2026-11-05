import { useState, type FormEvent } from 'react'
import type { OpponentPlayer, Player } from '../../contracts/index.ts'
import { playerLabel } from './labels.ts'
import { parseOppNumber } from './matchSource.ts'

// 相手の背番号を試合中にその場で足す（F-04）。「＋」を押すと番号の入力が出る。
// 紅白戦（F-27）では番号を打たず、B チームに入れる部員を選ぶ（candidates）。
// 足した選手は親（記録のタブ）が一覧に入れ、onAdded で選んだ状態にする。

interface Props {
  /** 足せないとき（練習・デモの相手なし）は undefined。紅白戦では playerId（部員）も渡す */
  onAdd?: (number: number, playerId?: string) => Promise<OpponentPlayer>
  onAdded: (player: OpponentPlayer) => void
  /** 紅白戦のとき、B チームに足せる部員（まだ B チームにいない部員）。ふつうの試合は undefined */
  candidates?: readonly Player[]
}

export default function AddOppNumber({ onAdd, onAdded, candidates }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!onAdd) return null

  const value = parseOppNumber(text)

  const add = (number: number, playerId?: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    onAdd(number, playerId)
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

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value !== null) add(value)
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn chip"
        aria-label={candidates ? 'B チームに部員を足す' : '相手の背番号を足す'}
        onClick={() => setOpen(true)}
      >
        ＋
      </button>
    )
  }

  const errorText = error && (
    <span className="error" role="alert">
      {error}
    </span>
  )

  if (candidates) {
    return (
      <div className="add-opp" role="group" aria-label="B チームに入れる部員">
        {candidates.map((p) => (
          <button key={p.id} type="button" className="btn btn-sm" disabled={busy} onClick={() => add(p.number, p.id)}>
            {playerLabel(p)}
          </button>
        ))}
        {candidates.length === 0 && <span className="chips-label">足せる部員がいません</span>}
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          やめる
        </button>
        {errorText}
      </div>
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
      {errorText}
    </form>
  )
}
