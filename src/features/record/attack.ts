// ラリー中の自チームのアタック1本を作る（要件定義書 F-20、5 章「アタックの結果」）。画面から切り離してテストする。
import type { AttackRecord, AttackResult, AttackType, Grade, PlayRecord } from '../../contracts/index.ts'

/** 結果ボタンを押す前の入力。攻撃の種類・バックアタック・打った方向は任意 */
export interface AttackDraft {
  attackerId: string | null
  attackType: AttackType | null
  isBack: boolean
  to: { x: number; y: number } | null
}

export const emptyAttackDraft = (): AttackDraft => ({
  attackerId: null,
  attackType: null,
  isBack: false,
  to: null,
})

/**
 * サーブレシーブからの攻撃なら、そのレシーブの評価。
 * 直前の1本が A〜D の自チームのレシーブのときだけで、ラリー中の切り返し（アタックのあと）は null
 */
export function prevReceptionOf(plays: readonly PlayRecord[]): Grade | null {
  const last = [...plays].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)).at(-1)
  if (!last || last.kind !== 'reception') return null
  return last.result === 'ace' || last.result === 'opp_miss' ? null : last.result
}

/** 確定した1本。打った選手がいなければ null */
export function buildAttack(
  draft: AttackDraft,
  result: AttackResult,
  prevReception: Grade | null,
  ids: { clientId: string; setId: string; recordedAt: string },
): AttackRecord | null {
  if (draft.attackerId === null) return null
  return {
    kind: 'attack',
    clientId: ids.clientId,
    setId: ids.setId,
    attackerId: draft.attackerId,
    attackType: draft.attackType,
    // 攻撃の種類が「バック」ならバックアタック
    isBack: draft.isBack || draft.attackType === 'back',
    toX: draft.to?.x ?? null,
    toY: draft.to?.y ?? null,
    result,
    prevReception,
    recordedAt: ids.recordedAt,
  }
}
