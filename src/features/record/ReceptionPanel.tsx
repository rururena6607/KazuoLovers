import { useState } from 'react'
import Court from '../../components/Court.tsx'
import type { OpponentPlayer, Player, ReceptionRecord } from '../../contracts/index.ts'
import { newIds } from './ids.ts'
import { GRADES, SERVE_TYPES, playerLabel, toggle } from './labels.ts'
import {
  attachToReception,
  buildReception,
  emptyReceptionDraft,
  needsReceiver,
  type ReceptionDraft,
  type ReceptionOutcome,
  type ReceptionPatch,
} from './reception.ts'

// 相手のサーブの記録（F-09）。レシーバー → 結果 で確定する（1本2タップ）。
// 受けた位置・相手サーバー・相手のサーブの種類は任意。
// 結果のあとに押すと次の1本の入力になる。直前の1本に付け足すときは「直前の1本に付け足す」を押してから選ぶ。

interface Props {
  setId: string
  players: readonly Player[]
  oppPlayers: readonly OpponentPlayer[]
  onSave: (rec: ReceptionRecord) => void
  /** 取消・削除した clientId。直前の1本が消えたら付け足しをやめる */
  removed: ReadonlySet<string>
}

const OUTCOMES: readonly { value: ReceptionOutcome; label: string }[] = [
  { value: 'ace', label: '被エース' },
  ...GRADES.map((g) => ({ value: g, label: g })),
]

export default function ReceptionPanel({ setId, players, oppPlayers, onSave, removed }: Props) {
  const [draft, setDraft] = useState<ReceptionDraft>(emptyReceptionDraft)
  /** 直前の1本。次の1本の入力を始めたら null */
  const [saved, setLast] = useState<ReceptionRecord | null>(null)
  // 取消・削除で消えた1本には付け足さない
  const last = saved && !removed.has(saved.clientId) ? saved : null
  /** true のあいだ、任意項目は直前の1本に付け足す */
  const [attaching, setAttaching] = useState(false)

  /** 次の1本の入力。始めたら直前の1本への付け足しは終わる */
  const update = (patch: Partial<ReceptionDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setLast(null)
    setAttaching(false)
  }

  const confirm = (outcome: ReceptionOutcome) => {
    const rec = buildReception(draft, outcome, { ...newIds(), setId })
    if (!rec) return
    onSave(rec)
    // 相手サーバーと種類は続けて同じことが多いので残す
    setDraft({ ...emptyReceptionDraft(), oppServerId: draft.oppServerId, oppServeType: draft.oppServeType })
    setLast(rec)
    setAttaching(false)
  }

  const setOptional = (patch: ReceptionPatch) => {
    if (!(attaching && last)) {
      update(patch)
      return
    }
    const updated = attachToReception(last, patch)
    // 変わらないとき（相手ミスに位置を付けようとしたなど）は保存しない
    if (updated === last) return
    onSave(updated)
    setLast(updated)
  }

  const target = attaching && last ? last : null
  const at = target
    ? target.atX !== null && target.atY !== null
      ? { x: target.atX, y: target.atY }
      : null
    : draft.at
  const oppServerId = target ? target.oppServerId : draft.oppServerId
  const oppServeType = target ? target.oppServeType : draft.oppServeType

  return (
    <div className="panel">
      <div className="chips" role="group" aria-label="レシーバー">
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn chip"
            aria-pressed={draft.receiverId === p.id}
            onClick={() => update({ receiverId: toggle(draft.receiverId, p.id) })}
          >
            {playerLabel(p)}
          </button>
        ))}
      </div>

      <div className="row results" role="group" aria-label="結果">
        {OUTCOMES.map((o) => (
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
        {/* 確定した直後の2度押しで同じ1本が2つできないよう、次の入力を始めるまで押せない */}
        <button
          type="button"
          className="btn"
          disabled={last?.result === 'opp_miss'}
          onClick={() => confirm('opp_miss')}
        >
          相手ミス
        </button>
        {last && (
          <button
            type="button"
            className="btn"
            aria-pressed={attaching}
            onClick={() => setAttaching((a) => !a)}
          >
            直前の1本に付け足す
          </button>
        )}
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
            onClick={() => setOptional({ oppServeType: toggle(oppServeType, t.value) })}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
