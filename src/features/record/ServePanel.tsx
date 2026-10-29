import { useState } from 'react'
import Court from '../../components/Court.tsx'
import type { OpponentPlayer, Player, ServeRecord } from '../../contracts/index.ts'
import EndlinePicker from './EndlinePicker.tsx'
import { GRADES, MISS_TYPES, SERVE_TYPES, playerLabel } from './labels.ts'
import { buildServe, emptyDraft, nextDraft, type ServeDraft, type ServeOutcome } from './serve.ts'

// 自チームのサーブの記録（F-06・F-07）。
// サーバー → （種類）→ 打つ位置 → 着弾点 → 結果 の順で、結果ボタンで確定する。

interface Props {
  setId: string
  players: readonly Player[]
  oppPlayers: readonly OpponentPlayer[]
  /** 新しい1本の保存と、直前の1本への付け足し（同じ clientId で上書き）の両方に使う */
  onSave: (rec: ServeRecord) => void
}

export default function ServePanel({ setId, players, oppPlayers, onSave }: Props) {
  const [draft, setDraft] = useState<ServeDraft>(emptyDraft)
  const [pickingMiss, setPickingMiss] = useState(false)
  /** 受けた相手をあとから付け足せる直前の1本。次の1本の入力を始めたら null */
  const [last, setLast] = useState<ServeRecord | null>(null)

  const update = (patch: Partial<ServeDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
  }

  const selectServer = (p: Player) => {
    // いつもの種類を最初から選んでおく
    update({ serverId: p.id, serveType: p.serveType })
    setLast(null)
  }

  const confirm = (outcome: ServeOutcome) => {
    const rec = buildServe(draft, outcome, {
      clientId: crypto.randomUUID(),
      setId,
      recordedAt: new Date().toISOString(),
    })
    if (!rec) return
    onSave(rec)
    setDraft(nextDraft(draft))
    setPickingMiss(false)
    setLast(rec.result === 'in' ? rec : null)
  }

  const selectReceiver = (id: string) => {
    // 結果のあとなら直前の1本に付け足す（6 章「任意項目はあとから付けられる」）
    if (last) {
      const updated = { ...last, receiverId: last.receiverId === id ? null : id }
      onSave(updated)
      setLast(updated)
      return
    }
    update({ receiverId: draft.receiverId === id ? null : id })
  }

  const receiverId = last ? last.receiverId : draft.receiverId
  const noServer = draft.serverId === null

  return (
    <div className="panel">
      <div className="chips" role="group" aria-label="サーバー">
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn chip"
            aria-pressed={draft.serverId === p.id}
            onClick={() => selectServer(p)}
          >
            {playerLabel(p)}
          </button>
        ))}
      </div>

      <div className="row" role="group" aria-label="サーブの種類">
        {SERVE_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            className="btn btn-sm"
            aria-pressed={draft.serveType === t.value}
            onClick={() => update({ serveType: t.value })}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Court
        side="opponent"
        label="相手コート（着弾点）"
        marks={draft.to ? [draft.to] : []}
        onTap={(p) => {
          update({ to: p })
          setLast(null)
        }}
      />
      <EndlinePicker x={draft.fromX} onChange={(x) => update({ fromX: x })} />

      {pickingMiss ? (
        <div className="row results" role="group" aria-label="ミスの種類">
          {MISS_TYPES.map((m) => (
            <button
              key={m.value}
              type="button"
              className="btn"
              onClick={() => confirm({ result: 'miss', missType: m.value })}
            >
              {m.label}
            </button>
          ))}
          <button type="button" className="btn" onClick={() => setPickingMiss(false)}>
            戻る
          </button>
        </div>
      ) : (
        <div className="row results" role="group" aria-label="結果">
          <button
            type="button"
            className="btn"
            disabled={noServer}
            onClick={() => confirm({ result: 'ace' })}
          >
            エース
          </button>
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              className="btn"
              disabled={noServer}
              onClick={() => confirm({ result: 'in', grade: g })}
            >
              {g}
            </button>
          ))}
          <button
            type="button"
            className="btn"
            disabled={noServer}
            onClick={() => setPickingMiss(true)}
          >
            ミス
          </button>
        </div>
      )}

      <div className="chips chips-sm" role="group" aria-label="受けた相手（任意）">
        <span className="chips-label">受けた相手</span>
        {oppPlayers.map((o) => (
          <button
            key={o.id}
            type="button"
            className="btn chip num"
            aria-pressed={receiverId === o.id}
            onClick={() => selectReceiver(o.id)}
          >
            {o.number}
          </button>
        ))}
      </div>
    </div>
  )
}
