import { useState } from 'react'
import type { OpponentPlayer, Player } from '../../contracts/index.ts'
import { describe, editableGrade, withGrade, type Entry } from './history.ts'
import { GRADES } from './labels.ts'

// 記録一覧（F-08）。新しい順に並べ、削除と評価（A〜D）の修正ができる。
// 得点が変わる修正（エース↔イン など）は、削除して記録し直す。

interface Props {
  entries: readonly Entry[]
  players: readonly Player[]
  oppPlayers: readonly OpponentPlayer[]
  onRemove: (entry: Entry) => void
  onEdit: (entry: Entry) => void
  onClose: () => void
}

export default function RecordList({ entries, players, oppPlayers, onRemove, onEdit, onClose }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const newestFirst = [...entries].reverse()

  return (
    <div className="panel">
      <div className="row">
        <button type="button" className="btn" onClick={onClose}>
          ← 記録に戻る
        </button>
      </div>
      {newestFirst.length === 0 && <p className="placeholder">このセットの記録はまだありません。</p>}
      <ol className="list">
        {newestFirst.map((e) => {
          const grade = editableGrade(e)
          return (
            <li key={e.clientId} className="list-item">
              <div className="list-main">
                <span className="num">{describe(e, players, oppPlayers)}</span>
                {grade !== null && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-pressed={editing === e.clientId}
                    onClick={() => setEditing(editing === e.clientId ? null : e.clientId)}
                  >
                    修正
                  </button>
                )}
                <button type="button" className="btn btn-sm" onClick={() => onRemove(e)}>
                  削除
                </button>
              </div>
              {editing === e.clientId && (
                <div className="row" role="group" aria-label="評価の修正">
                  {GRADES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className="btn btn-sm"
                      aria-pressed={grade === g}
                      onClick={() => {
                        onEdit(withGrade(e, g))
                        setEditing(null)
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
