import { useState } from 'react'
import Court, { type CourtMark } from '../../components/Court.tsx'
import type { OpponentPlayer, Player, ServeRecord } from '../../contracts/index.ts'
import AddOppNumber from './AddOppNumber.tsx'
import EndlinePicker from './EndlinePicker.tsx'
import { newIds } from './ids.ts'
import { GRADES, MISS_TYPES, SERVE_TYPES, playerLabel, toggle } from './labels.ts'
import SpeedPicker from './SpeedPicker.tsx'
import {
  buildServe,
  emptyDraft,
  fitsOutcome,
  nextDraft,
  type ServeDraft,
  type ServeOutcome,
} from './serve.ts'

// 自チームのサーブの記録（F-06・F-07）。
// サーバー → （種類）→ 打つ位置 → 着弾点 → 結果 の順で、結果ボタンで確定する。

interface Props {
  setId: string
  players: readonly Player[]
  oppPlayers: readonly OpponentPlayer[]
  /** 新しい1本の保存と、直前の1本への付け足し（同じ clientId で上書き）の両方に使う */
  onSave: (rec: ServeRecord) => void
  /** 取消・削除した clientId。直前の1本が消えたら付け足しをやめる */
  removed: ReadonlySet<string>
  /** 相手の背番号をその場で足す（F-04）。足せないときは undefined */
  onAddOpp?: (number: number) => Promise<OpponentPlayer>
  /** 直前のサーブの着弾点（選手の色と背番号。F-22） */
  recentMarks?: readonly CourtMark[]
}

export default function ServePanel({
  setId,
  players,
  oppPlayers,
  onSave,
  removed,
  onAddOpp,
  recentMarks = [],
}: Props) {
  const [draft, setDraft] = useState<ServeDraft>(emptyDraft)
  const [pickingMiss, setPickingMiss] = useState(false)
  /** 受けた相手をあとから付け足せる直前の1本。次の1本の入力を始めたら null */
  const [saved, setLast] = useState<ServeRecord | null>(null)
  // 取消・削除で消えた1本には付け足さない
  const last = saved && !removed.has(saved.clientId) ? saved : null

  /** 次の1本の入力。どの項目でも、触ったら直前の1本への付け足しは終わる */
  const update = (patch: Partial<ServeDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setLast(null)
  }

  const selectServer = (p: Player) => {
    // 違うサーバーにしたときだけ、いつもの種類を選んでおく（手で選んだ種類は消さない）
    if (p.id === draft.serverId) return
    update({ serverId: p.id, serveType: p.serveType })
  }

  const confirm = (outcome: ServeOutcome) => {
    const rec = buildServe(draft, outcome, { ...newIds(), setId })
    if (!rec) return
    onSave(rec)
    setDraft(nextDraft(draft))
    setPickingMiss(false)
    setLast(rec.result === 'in' ? rec : null)
  }

  const selectReceiver = (id: string) => {
    // 結果のあとなら直前の1本に付け足す（6 章「任意項目はあとから付けられる」）
    if (last) {
      const updated = { ...last, receiverId: toggle(last.receiverId, id) }
      onSave(updated)
      setLast(updated)
      return
    }
    update({ receiverId: toggle(draft.receiverId, id) })
  }

  const receiverId = last ? last.receiverId : draft.receiverId
  const noServer = draft.serverId === null
  /** 着弾点と食い違う結果のボタンは押せない */
  const cannot = (outcome: ServeOutcome) => noServer || !fitsOutcome(draft.to, outcome)

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
        marks={draft.to ? [...recentMarks, draft.to] : recentMarks}
        onTap={(p) => {
          // ネットより手前（自コート側の余白）は着弾点にしない
          if (p.y >= 0) update({ to: p })
        }}
      />
      <EndlinePicker x={draft.fromX} onChange={(x) => update({ fromX: x })} />
      <SpeedPicker value={draft.speed} onChange={(speed) => update({ speed })} />

      {pickingMiss ? (
        <div className="row results" role="group" aria-label="ミスの種類">
          {MISS_TYPES.map((m) => (
            <button
              key={m.value}
              type="button"
              className="btn"
              disabled={cannot({ result: 'miss', missType: m.value })}
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
            disabled={cannot({ result: 'ace' })}
            onClick={() => confirm({ result: 'ace' })}
          >
            エース
          </button>
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              className="btn"
              disabled={cannot({ result: 'in', grade: g })}
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
        <AddOppNumber onAdd={onAddOpp} onAdded={(p) => selectReceiver(p.id)} />
      </div>
    </div>
  )
}
