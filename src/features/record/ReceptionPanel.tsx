import { useState } from 'react'
import Court from '../../components/Court.tsx'
import type { OpponentPlayer, Player, ReceptionRecord, ServeType } from '../../contracts/index.ts'
import { GRADES, SERVE_TYPES, playerLabel } from './labels.ts'
import {
  attachToReception,
  buildReception,
  emptyReceptionDraft,
  needsReceiver,
  type ReceptionDraft,
  type ReceptionOutcome,
} from './reception.ts'

// 相手のサーブの記録（F-09）。レシーバー → 結果 で確定する（1本2タップ）。
// 受けた位置・相手サーバー・相手のサーブの種類は任意で、結果のあとでも直前の1本に付け足せる。

interface Props {
  setId: string
  players: readonly Player[]
  oppPlayers: readonly OpponentPlayer[]
  onSave: (rec: ReceptionRecord) => void
}

type Optional = Partial<Pick<ReceptionDraft, 'at' | 'oppServerId' | 'oppServeType'>>

export default function ReceptionPanel({ setId, players, oppPlayers, onSave }: Props) {
  const [draft, setDraft] = useState<ReceptionDraft>(emptyReceptionDraft)
  /** 任意項目を付け足せる直前の1本。次の1本の入力を始めたら null */
  const [last, setLast] = useState<ReceptionRecord | null>(null)

  const confirm = (outcome: ReceptionOutcome) => {
    const rec = buildReception(draft, outcome, {
      clientId: crypto.randomUUID(),
      setId,
      recordedAt: new Date().toISOString(),
    })
    if (!rec) return
    onSave(rec)
    // 相手サーバーと種類は続けて同じことが多いので残す
    setDraft({ ...emptyReceptionDraft(), oppServerId: draft.oppServerId, oppServeType: draft.oppServeType })
    setLast(rec)
  }

  const setOptional = (patch: Optional) => {
    // 相手サーバーと種類は次の1本にも残す。結果のあとの受けた位置は直前の1本だけに付ける
    if (!last || patch.at === undefined) setDraft((d) => ({ ...d, ...patch }))
    if (last) {
      const updated = attachToReception(last, patch)
      onSave(updated)
      setLast(updated)
    }
  }

  const at = last ? (last.atX !== null && last.atY !== null ? { x: last.atX, y: last.atY } : null) : draft.at
  const oppServerId = last ? last.oppServerId : draft.oppServerId
  const oppServeType = last ? last.oppServeType : draft.oppServeType
  const toggle = <T,>(current: T | null, value: T): T | null => (current === value ? null : value)

  const outcomes: { value: ReceptionOutcome; label: string }[] = [
    { value: 'ace', label: '被エース' },
    ...GRADES.map((g) => ({ value: g, label: g })),
  ]

  return (
    <div className="panel">
      <div className="chips" role="group" aria-label="レシーバー">
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn chip"
            aria-pressed={draft.receiverId === p.id}
            onClick={() => {
              setDraft((d) => ({ ...d, receiverId: p.id }))
              setLast(null)
            }}
          >
            {playerLabel(p)}
          </button>
        ))}
      </div>

      <div className="row results" role="group" aria-label="結果">
        {outcomes.map((o) => (
          <button
            key={o.value}
            type="button"
            className="btn"
            disabled={needsReceiver(o.value) && draft.receiverId === null}
            onClick={() => confirm(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={() => confirm('opp_miss')}>
          相手ミス
        </button>
      </div>

      <Court
        side="own"
        label="自コート（受けた位置・任意）"
        marks={at ? [at] : []}
        onTap={(p) => setOptional({ at: p })}
      />

      <div className="chips chips-sm" role="group" aria-label="相手サーバー（任意）">
        <span className="chips-label">相手サーバー</span>
        {oppPlayers.map((o) => (
          <button
            key={o.id}
            type="button"
            className="btn chip num"
            aria-pressed={oppServerId === o.id}
            onClick={() => setOptional({ oppServerId: toggle(oppServerId, o.id) })}
          >
            {o.number}
          </button>
        ))}
      </div>
      <div className="row" role="group" aria-label="相手のサーブの種類（任意）">
        {SERVE_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            className="btn btn-sm"
            aria-pressed={oppServeType === t.value}
            onClick={() => setOptional({ oppServeType: toggle<ServeType>(oppServeType, t.value) })}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
