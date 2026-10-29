// 自チームのサーブ1本を作る（要件定義書 F-06・F-07、6 章「1本の確定」）。画面から切り離してテストする。
import type { Grade, MissType, ServeRecord, ServeType } from '../../contracts/index.ts'

/** 結果ボタンを押す前の入力 */
export interface ServeDraft {
  serverId: string | null
  serveType: ServeType
  fromX: number | null
  to: { x: number; y: number } | null
  receiverId: string | null
}

/** 結果ボタン：エース、A〜D（イン）、ミス（種類つき） */
export type ServeOutcome =
  | { result: 'ace' }
  | { result: 'in'; grade: Grade }
  | { result: 'miss'; missType: MissType }

export const emptyDraft = (serveType: ServeType = 'float'): ServeDraft => ({
  serverId: null,
  serveType,
  fromX: null,
  to: null,
  receiverId: null,
})

/** 確定した1本。サーバーが選ばれていなければ null */
export function buildServe(
  draft: ServeDraft,
  outcome: ServeOutcome,
  ids: { clientId: string; setId: string; recordedAt: string },
): ServeRecord | null {
  if (draft.serverId === null) return null
  // ネットのミスは着弾点なし（要件定義書 5 章「着弾点の決め方」）
  const to = outcome.result === 'miss' && outcome.missType === 'net' ? null : draft.to
  return {
    kind: 'serve',
    clientId: ids.clientId,
    setId: ids.setId,
    serverId: draft.serverId,
    serveType: draft.serveType,
    fromX: draft.fromX,
    toX: to?.x ?? null,
    toY: to?.y ?? null,
    result: outcome.result,
    missType: outcome.result === 'miss' ? outcome.missType : null,
    reception: outcome.result === 'in' ? outcome.grade : null,
    // 受けた相手はインのときだけ
    receiverId: outcome.result === 'in' ? draft.receiverId : null,
    targetZone: null,
    recordedAt: ids.recordedAt,
  }
}

/** 確定後の入力：サーバーと打つ位置と種類を残し、着弾点と受けた相手を空に戻す */
export const nextDraft = (draft: ServeDraft): ServeDraft => ({ ...draft, to: null, receiverId: null })
