// 自チームの選手（F-03）：背番号・名前・ポジション・いつものサーブの種類の登録と編集、引退扱い。
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Player, ServeType } from '../../contracts/index.ts'
import type { TeamData } from '../../lib/data/teamData.ts'
import type { PlayerInput } from '../../lib/data/teamRows.ts'
import { SERVE_TYPES, SERVE_TYPE_LABELS } from './labels.ts'
import { useAction } from './useAction.ts'

const EMPTY: PlayerInput = { number: 0, name: '', position: null, serveType: 'float', active: true }

export function PlayersSection({ data, teamId }: { data: TeamData; teamId: string }) {
  const [players, setPlayers] = useState<Player[] | null>(null)
  /** 編集中の選手。新しく作るときは id なし。null なら閉じている */
  const [editing, setEditing] = useState<PlayerInput | null>(null)
  const [numberText, setNumberText] = useState('')
  const { busy, error, run, clearError } = useAction()

  const reload = useCallback(
    () => run(async () => setPlayers(await data.listPlayers(teamId))),
    [data, teamId, run],
  )

  useEffect(() => {
    void reload()
  }, [reload])

  const open = (p: PlayerInput) => {
    clearError()
    setEditing(p)
    setNumberText(p.id ? String(p.number) : '')
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    const input = { ...editing, number: numberText === '' ? Number.NaN : Number(numberText) }
    void run(async () => {
      await data.savePlayer(teamId, input)
      setEditing(null)
      setPlayers(await data.listPlayers(teamId))
    })
  }

  return (
    <section className="admin-section">
      <h2>選手</h2>
      {players?.length === 0 && <p className="admin-mute">まだ選手がいません。</p>}
      <ul className="admin-list">
        {players?.map((p) => (
          <li key={p.id} className={p.active ? undefined : 'admin-retired'}>
            <span className="num admin-number">{p.number}</span>
            <span className="admin-grow">
              {p.name}
              <small>
                {[p.position, SERVE_TYPE_LABELS[p.serveType], p.active ? null : '引退']
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            </span>
            <button type="button" className="btn" onClick={() => open({ ...p })}>
              編集
            </button>
          </li>
        ))}
      </ul>

      {editing ? (
        <form className="admin-form" onSubmit={onSubmit}>
          <h3>{editing.id ? '選手を直す' : '選手を足す'}</h3>
          <label>
            背番号
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              required
              value={numberText}
              onChange={(e) => setNumberText(e.target.value)}
            />
          </label>
          <label>
            名前
            <input
              required
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label>
            ポジション（任意）
            <input
              placeholder="例：OH"
              value={editing.position ?? ''}
              onChange={(e) => setEditing({ ...editing, position: e.target.value })}
            />
          </label>
          <fieldset>
            <legend>いつものサーブの種類</legend>
            <div className="admin-choices">
              {SERVE_TYPES.map((t: ServeType) => (
                <button
                  key={t}
                  type="button"
                  className="btn"
                  aria-pressed={editing.serveType === t}
                  onClick={() => setEditing({ ...editing, serveType: t })}
                >
                  {SERVE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </fieldset>
          {editing.id && (
            <label className="admin-check">
              <input
                type="checkbox"
                checked={!editing.active}
                onChange={(e) => setEditing({ ...editing, active: !e.target.checked })}
              />
              引退した（記録画面の選手に出さない。過去の記録は残る）
            </label>
          )}
          <div className="admin-actions">
            <button type="submit" className="btn admin-primary" disabled={busy}>
              {busy ? '保存しています…' : '保存'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setEditing(null)}>
              やめる
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn" onClick={() => open(EMPTY)}>
          ＋ 選手を足す
        </button>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
          {players === null && (
            <button type="button" className="btn" onClick={() => void reload()}>
              読み直す
            </button>
          )}
        </p>
      )}
    </section>
  )
}
