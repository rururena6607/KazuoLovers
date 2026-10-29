// 相手のサーブ1本と自チームのレシーブを作る（要件定義書 F-09）。画面から切り離してテストする。
import type { Grade, ReceptionRecord, ServeType } from '../../contracts/index.ts'

/** 結果ボタンを押す前の入力。受けた位置・相手サーバー・種類は任意 */
export interface ReceptionDraft {
  receiverId: string | null
  at: { x: number; y: number } | null
  oppServerId: string | null
  oppServeType: ServeType | null
}

/** 結果ボタン：被エース、A〜D、相手ミス */
export type ReceptionOutcome = 'ace' | Grade | 'opp_miss'

export const emptyReceptionDraft = (): ReceptionDraft => ({
  receiverId: null,
  at: null,
  oppServerId: null,
  oppServeType: null,
})

/** A〜D は受けた選手が要る。被エースは触れていないこともあるので任意 */
export const needsReceiver = (outcome: ReceptionOutcome): boolean =>
  outcome !== 'ace' && outcome !== 'opp_miss'

/** 確定した1本。A〜D で受けた選手がいなければ null */
export function buildReception(
  draft: ReceptionDraft,
  outcome: ReceptionOutcome,
  ids: { clientId: string; setId: string; recordedAt: string },
): ReceptionRecord | null {
  if (needsReceiver(outcome) && draft.receiverId === null) return null
  const oppMiss = outcome === 'opp_miss'
  return {
    kind: 'reception',
    clientId: ids.clientId,
    setId: ids.setId,
    // 相手ミスは誰も受けていない
    receiverId: oppMiss ? null : draft.receiverId,
    oppServerId: draft.oppServerId,
    oppServeType: draft.oppServeType,
    atX: oppMiss ? null : (draft.at?.x ?? null),
    atY: oppMiss ? null : (draft.at?.y ?? null),
    result: outcome,
    recordedAt: ids.recordedAt,
  }
}

/** 任意項目を直前の1本に付け足す（6 章「任意項目はあとから付けられる」） */
export function attachToReception(
  rec: ReceptionRecord,
  patch: Partial<Pick<ReceptionDraft, 'at' | 'oppServerId' | 'oppServeType'>>,
): ReceptionRecord {
  const next = { ...rec }
  if (patch.at !== undefined && rec.result !== 'opp_miss') {
    next.atX = patch.at?.x ?? null
    next.atY = patch.at?.y ?? null
  }
  if (patch.oppServerId !== undefined) next.oppServerId = patch.oppServerId
  if (patch.oppServeType !== undefined) next.oppServeType = patch.oppServeType
  return next
}
