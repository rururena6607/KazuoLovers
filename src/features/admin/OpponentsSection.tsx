// 相手チーム（F-04）：チーム名の登録と、相手選手の背番号。背番号は試合中に記録画面でも足せる。
import { useState, type FormEvent } from 'react'
import type { Opponent, OpponentPlayer } from '../../contracts/index.ts'
import type { TeamData } from '../../lib/data/teamData.ts'
import { useAction } from './useAction.ts'

interface Props {
  data: TeamData
  teamId: string
  opponents: Opponent[]
  onAdded: (opponent: Opponent) => void
}

export function OpponentsSection({ data, teamId, opponents, onAdded }: Props) {
  const [name, setName] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [numbers, setNumbers] = useState<OpponentPlayer[]>([])
  const [numberText, setNumberText] = useState('')
  const { busy, error, run } = useAction()

  const onAdd = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      onAdded(await data.createOpponent(teamId, name))
      setName('')
    })
  }

  const toggle = (id: string) => {
    if (openId === id) {
      setOpenId(null)
      return
    }
    setOpenId(id)
    setNumbers([])
    setNumberText('')
    void run(async () => setNumbers(await data.listOpponentPlayers(id)))
  }

  const onAddNumber = (e: FormEvent) => {
    e.preventDefault()
    if (!openId) return
    const n = numberText === '' ? Number.NaN : Number(numberText)
    void run(async () => {
      const added = await data.addOpponentPlayer(openId, n)
      setNumbers((list) =>
        [...list.filter((p) => p.id !== added.id), added].sort((a, b) => a.number - b.number),
      )
      setNumberText('')
    })
  }

  return (
    <section className="admin-section">
      <h2>相手チーム</h2>
      {opponents.length === 0 && <p className="admin-mute">まだ相手チームがいません。</p>}
      <ul className="admin-list">
        {opponents.map((o) => (
          <li key={o.id} className="admin-col">
            <button
              type="button"
              className="btn admin-row-button"
              aria-expanded={openId === o.id}
              onClick={() => toggle(o.id)}
            >
              {o.name}
              <span aria-hidden="true">{openId === o.id ? '▲' : '▼'}</span>
            </button>
            {openId === o.id && (
              <div className="admin-sub">
                <p className="admin-mute">
                  背番号：
                  {numbers.length === 0 ? 'まだありません' : numbers.map((p) => p.number).join('・')}
                </p>
                <form className="admin-inline" onSubmit={onAddNumber}>
                  <input
                    aria-label="足す背番号"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="背番号"
                    required
                    value={numberText}
                    onChange={(e) => setNumberText(e.target.value)}
                  />
                  <button type="submit" className="btn" disabled={busy}>
                    足す
                  </button>
                </form>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form className="admin-inline" onSubmit={onAdd}>
        <input
          aria-label="相手チームの名前"
          placeholder="相手チームの名前"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn" disabled={busy}>
          ＋ 足す
        </button>
      </form>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
