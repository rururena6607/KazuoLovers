import { useState } from 'react'
import FullCourt from '../../components/FullCourt.tsx'
import type { AttackRecord, Grade, Player } from '../../contracts/index.ts'
import {
  buildAttack,
  emptyAttackDraft,
  withArrowTap,
  withAttackType,
  type AttackDraft,
} from './attack.ts'
import { newIds } from './ids.ts'
import { ATTACK_RESULTS, ATTACK_TYPES, playerLabel } from './labels.ts'
import SpeedPicker from './SpeedPicker.tsx'

// ラリー中のアタックの記録（F-20）。打った選手 → 結果 で確定する（1本2タップ）。
// 攻撃の種類・バックアタック・打った位置と方向（矢印）・速さは任意。決定・ミス・被ブロックは得点を自動で更新する。

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
    const rec = buildAttack(draft, result, prevReception, { ...newIds(), setId })
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
            onClick={() => setDraft((d) => withAttackType(d, t.value))}
          >
            {t.label}
          </button>
        ))}
        {/* 種類「バック」のあいだはバックアタックに決まっているので切り替えない */}
        <button
          type="button"
          className="btn btn-sm"
          aria-pressed={draft.isBack}
          disabled={draft.attackType === 'back'}
          onClick={() => update({ isBack: !draft.isBack })}
        >
          バックアタック
        </button>
      </div>

      <SpeedPicker value={draft.speed} onChange={(speed) => update({ speed })} />

      <p className="court-hint">矢印（任意）：自コートで打った位置、相手コートで打った方向をタップ</p>
      <FullCourt
        label="コート（打った位置から打った方向への矢印・任意）"
        from={draft.from && { side: 'own', p: draft.from }}
        to={draft.to && { side: 'opponent', p: draft.to }}
        onTap={(end) => setDraft((d) => withArrowTap(d, end.side, end.p))}
      />
    </div>
  )
}
