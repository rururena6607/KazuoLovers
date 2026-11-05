import { useState } from 'react'
import FullCourt from '../../components/FullCourt.tsx'
import type { OppAttackRecord, OppAttackResult, OpponentPlayer, Player } from '../../contracts/index.ts'
import AddOppNumber from './AddOppNumber.tsx'
import { DIG_RESULTS, buildDig, emptyDigDraft, withDigArrowTap, type DigDraft } from './dig.ts'
import { newIds } from './ids.ts'
import { playerLabel, toggle } from './labels.ts'
import SpeedPicker from './SpeedPicker.tsx'

// 相手のスパイクの記録（F-25）。結果ボタン（拾えず／A〜D／相手ミス）で確定する（最短1タップ）。
// 拾った選手・打った相手の背番号・矢印（打った位置 → 落ちた位置）・速さは任意。
// 拾えず・相手ミスは得点を自動で更新する（6 章「得点とサーブ権」）。

interface Props {
  setId: string
  players: readonly Player[]
  oppPlayers: readonly OpponentPlayer[]
  onSave: (rec: OppAttackRecord) => void
  /** 相手の背番号をその場で足す（F-04）。足せないときは undefined */
  onAddOpp?: (number: number) => Promise<OpponentPlayer>
}

export default function DigPanel({ setId, players, oppPlayers, onSave, onAddOpp }: Props) {
  const [draft, setDraft] = useState<DigDraft>(emptyDigDraft)
  const update = (patch: Partial<DigDraft>) => setDraft((d) => ({ ...d, ...patch }))

  const confirm = (result: OppAttackResult) => {
    onSave(buildDig(draft, result, { ...newIds(), setId }))
    setDraft(emptyDigDraft())
  }

  return (
    <div className="panel">
      <div className="chips" role="group" aria-label="拾った選手（任意）">
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn chip"
            aria-pressed={draft.diggerId === p.id}
            onClick={() => update({ diggerId: toggle(draft.diggerId, p.id) })}
          >
            {playerLabel(p)}
          </button>
        ))}
      </div>

      <div className="row results" role="group" aria-label="相手のスパイクの結果">
        {DIG_RESULTS.map((r) => (
          <button key={r.value} type="button" className="btn" onClick={() => confirm(r.value)}>
            {r.label}
          </button>
        ))}
      </div>

      <SpeedPicker value={draft.speed} onChange={(speed) => update({ speed })} />

      <div className="chips chips-sm" role="group" aria-label="打った相手（任意）">
        <span className="chips-label">打った相手</span>
        {oppPlayers.map((o) => (
          <button
            key={o.id}
            type="button"
            className="btn chip num"
            aria-pressed={draft.hitterId === o.id}
            onClick={() => update({ hitterId: toggle(draft.hitterId, o.id) })}
          >
            {o.number}
          </button>
        ))}
        <AddOppNumber onAdd={onAddOpp} onAdded={(p) => update({ hitterId: p.id })} />
      </div>

      <p className="court-hint">矢印（任意）：相手コートで打った位置、自コートで落ちた位置・拾った位置をタップ</p>
      <FullCourt
        label="コート（相手が打った位置から落ちた位置への矢印・任意）"
        from={draft.from && { side: 'opponent', p: draft.from }}
        to={draft.to && { side: 'own', p: draft.to }}
        onTap={(end) => setDraft((d) => withDigArrowTap(d, end.side, end.p))}
      />
    </div>
  )
}
