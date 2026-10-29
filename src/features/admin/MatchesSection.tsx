// 試合（F-05）：試合か練習かを選んで作り、記録画面に進む。作ると第1セットもできる。
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { DEFAULT_SET_POINTS, type Match, type Opponent } from '../../contracts/index.ts'
import type { TeamData } from '../../lib/data/teamData.ts'
import type { MatchInput } from '../../lib/data/teamRows.ts'
import { today } from './labels.ts'
import { useAction } from './useAction.ts'

interface Props {
  data: TeamData
  teamId: string
  opponents: Opponent[]
  onOpenMatch: (matchId: string) => void
}

const newInput = (opponents: Opponent[]): MatchInput => ({
  kind: 'match',
  opponentId: opponents[0]?.id ?? null,
  date: today(),
  tournament: null,
  setPoints: DEFAULT_SET_POINTS,
})

export function MatchesSection({ data, teamId, opponents, onOpenMatch }: Props) {
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [input, setInput] = useState<MatchInput | null>(null)
  const [pointsText, setPointsText] = useState(String(DEFAULT_SET_POINTS))
  const { busy, error, run } = useAction()

  const reload = useCallback(
    () => run(async () => setMatches(await data.listMatches(teamId))),
    [data, teamId, run],
  )

  useEffect(() => {
    void reload()
  }, [reload])

  const opponentName = (id: string | null) => opponents.find((o) => o.id === id)?.name ?? '（相手なし）'

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!input) return
    if (input.kind === 'match' && !input.opponentId) return
    const setPoints = pointsText === '' ? Number.NaN : Number(pointsText)
    void run(async () => {
      const { match } = await data.createMatch(teamId, { ...input, setPoints })
      setInput(null)
      setMatches((list) => [match, ...(list ?? []).filter((m) => m.id !== match.id)])
      onOpenMatch(match.id)
    })
  }

  const needOpponent = input?.kind === 'match' && opponents.length === 0

  return (
    <section className="admin-section">
      <h2>試合</h2>
      {input ? (
        <form className="admin-form" onSubmit={onSubmit}>
          <div className="admin-choices">
            {(['match', 'practice'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                className="btn"
                aria-pressed={input.kind === kind}
                onClick={() =>
                  setInput({
                    ...input,
                    kind,
                    opponentId: kind === 'practice' ? null : (opponents[0]?.id ?? null),
                  })
                }
              >
                {kind === 'match' ? '試合' : '練習'}
              </button>
            ))}
          </div>
          <label>
            日付
            <input
              type="date"
              required
              value={input.date}
              onChange={(e) => setInput({ ...input, date: e.target.value })}
            />
          </label>
          {input.kind === 'match' && (
            <>
              <label>
                相手
                <select
                  required
                  value={input.opponentId ?? ''}
                  onChange={(e) => setInput({ ...input, opponentId: e.target.value || null })}
                >
                  {opponents.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              {needOpponent && (
                <p className="admin-mute">先に下の「相手チーム」で相手を足してください。</p>
              )}
              <label>
                大会名（任意）
                <input
                  placeholder="例：新人戦"
                  value={input.tournament ?? ''}
                  onChange={(e) => setInput({ ...input, tournament: e.target.value })}
                />
              </label>
              <label>
                1セットの点数
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  value={pointsText}
                  onChange={(e) => setPointsText(e.target.value)}
                />
              </label>
            </>
          )}
          <div className="admin-actions">
            <button type="submit" className="btn admin-primary" disabled={busy || needOpponent}>
              {busy ? '作っています…' : '作って記録する'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setInput(null)}>
              やめる
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn admin-primary"
          onClick={() => {
            setInput(newInput(opponents))
            setPointsText(String(DEFAULT_SET_POINTS))
          }}
        >
          ＋ 試合・練習を作る
        </button>
      )}

      {matches?.length === 0 && <p className="admin-mute">まだ試合がありません。</p>}
      <ul className="admin-list">
        {matches?.map((m) => (
          <li key={m.id}>
            <span className="admin-grow">
              {m.kind === 'practice' ? '練習' : opponentName(m.opponentId)}
              <small>{[m.date, m.tournament].filter(Boolean).join(' · ')}</small>
            </span>
            <button type="button" className="btn" onClick={() => onOpenMatch(m.id)}>
              記録する
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="admin-error" role="alert">
          {error}
          {matches === null && (
            <button type="button" className="btn" onClick={() => void reload()}>
              読み直す
            </button>
          )}
        </p>
      )}
    </section>
  )
}
