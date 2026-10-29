import { useState } from 'react'
import Court from '../../components/Court.tsx'
import type { AttackRecord, Grade, Player } from '../../contracts/index.ts'
import { buildAttack, emptyAttackDraft, type AttackDraft } from './attack.ts'
import { ATTACK_RESULTS, ATTACK_TYPES, playerLabel } from './labels.ts'

// ラリー中のアタックの記録（F-20）。打った選手 → 結果 で確定する（1本2タップ）。
// 攻撃の種類・バックアタック・打った方向は任意。決定・ミス・被ブロックは得点を自動で更新する。

interface Props {
  setId: string
  players: readonly Player[]
  /** サーブレシーブからの攻撃なら、そのレシーブの評価 */
  prevReception: Grade | null
  onSave: (rec: AttackRecord) => void
}

export default function RallyPanel({ setId, players, prevReception, onSave }: Props) {
  const [draft, setDraft] = useState<AttackDraft>(emptyAttackDraft)
  const update = (patch: Partial<AttackDraft>) => setDraft((d) => ({ ...d, ...patch }))

  const confirm = (result: AttackRecord['result']) => {
    const rec = buildAttack(draft, result, prevReception, {
      clientId: crypto.randomUUID(),
      setId,
      recordedAt: new Date().toISOString(),
    })
    if (!rec) return
    onSave(rec)
    setDraft(emptyAttackDraft())
  }

  return (
    <div className="panel">
      <div className="chips" role="group" aria-label="アタックした選手">
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn chip"
            aria-pressed={draft.attackerId === p.id}
            onClick={() => update({ attackerId: p.id })}
          >
            {playerLabel(p)}
          </button>
        ))}
      </div>

      <div className="row results" role="group" aria-label="アタックの結果">
        {ATTACK_RESULTS.map((r) => (
          <button
            key={r.value}
            type="button"
            className="btn"
            disabled={draft.attackerId === null}
            onClick={() => confirm(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="row" role="group" aria-label="攻撃の種類（任意）">
        {ATTACK_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            className="btn btn-sm"
            aria-pressed={draft.attackType === t.value}
            onClick={() => update({ attackType: draft.attackType === t.value ? null : t.value })}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-sm"
          aria-pressed={draft.isBack || draft.attackType === 'back'}
          onClick={() => update({ isBack: !draft.isBack })}
        >
          バックアタック
        </button>
      </div>

      <Court
        side="opponent"
        label="相手コート（打った方向・任意）"
        marks={draft.to ? [draft.to] : []}
        onTap={(p) => update({ to: p })}
      />
    </div>
  )
}
