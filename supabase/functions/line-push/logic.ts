// line-push の純粋な処理（T-35、F-15）。何も import しない（Vitest で確かめる：src/lib/data/linePush.test.ts）。

/**
 * 公式戦かどうか。試合（練習ではない）で、大会名があるものを公式戦とする。
 * 練習試合は大会名を空にして作る（管理画面）
 */
export function isOfficialMatch(m: { kind: string; tournament: string | null }): boolean {
  return m.kind === 'match' && (m.tournament ?? '').trim() !== ''
}

export interface QuotaCheck {
  /** 送ってよいか */
  ok: boolean
  /** 今月の残りの通数。上限がなければ null */
  remaining: number | null
  /** 1回送るのに要る通数（グループの人数） */
  need: number
}

/**
 * 残りの通数で送れるか。Push は「送った回数 × 届く人数」で数える（要件定義書 8 章）。
 * quota は GET /v2/bot/message/quota、usage は GET /v2/bot/message/quota/consumption の totalUsage、
 * members は GET /v2/bot/group/{groupId}/members/count の count
 */
export function checkQuota(quota: unknown, usage: unknown, members: unknown): QuotaCheck | null {
  const q = quota as { type?: unknown; value?: unknown } | null
  const u = usage as { totalUsage?: unknown } | null
  const m = members as { count?: unknown } | null
  if (typeof m?.count !== 'number' || m.count < 0) return null
  const need = m.count
  if (q?.type === 'none') return { ok: true, remaining: null, need }
  if (q?.type !== 'limited' || typeof q.value !== 'number' || typeof u?.totalUsage !== 'number') return null
  const remaining = Math.max(0, q.value - u.totalUsage)
  return { ok: need > 0 && need <= remaining, remaining, need }
}

/** 送らなかったときに、画面に出す理由 */
export function quotaMessage(check: QuotaCheck): string {
  if (check.need === 0) return 'グループに人がいないので、送りませんでした。'
  return `LINE の今月の残りが ${check.remaining ?? 0} 通で、送るのに ${check.need} 通いるので、送りませんでした。部員はグループで「結果」と送れば見られます（通数を使いません）。`
}

export const PUSH_HEADER = '試合が終わりました'
