// AI コメント（T-30、F-13）。分析画面（T-32）はこれを使い、Gemini を直接呼ばない。
// 集計の JSON（lib/stats の buildAiSummary、T-31）を Edge Function の gemini-report に送る。
// 範囲（scope）の名前は、画面の範囲の選択と同じにする。例：match:<試合の id>、set:<セットの id>、
// opponent:<相手の id>、practice:<試合の id>、all。同じ範囲で同じ集計なら、保存済みのコメントが返る。
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from './supabaseClient.ts'

export interface AiComment {
  comment: string
  /** true なら、保存済みのコメント（Gemini は呼んでいない） */
  cached: boolean
  /** ISO 8601 */
  createdAt: string
}

export interface AiCommentRequest {
  teamId: string
  scope: string
  /** buildAiSummary の結果。背番号と数値だけ */
  summary: object
  /** true なら、同じ集計でも作り直す */
  force?: boolean
}

export interface AiReports {
  request(input: AiCommentRequest): Promise<AiComment>
  /** その範囲の最後のコメント（再表示）。まだなければ null */
  latest(teamId: string, scope: string): Promise<AiComment | null>
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Edge Function の失敗を、画面に出せる日本語にする。gemini-report は { error } を返す */
export async function errorMessageOf(error: unknown): Promise<string> {
  const context = isRecord(error) ? error.context : undefined
  if (context instanceof Response) {
    try {
      const body: unknown = await context.json()
      if (isRecord(body) && typeof body.error === 'string') return body.error
    } catch {
      // 本文が JSON でなければ、下の決まった文にする
    }
  }
  if (isRecord(error) && error.name === 'FunctionsFetchError') {
    return '通信できませんでした。電波のよい場所でもう一度試してください。'
  }
  return 'AI のコメントを作れませんでした。'
}

/** gemini-report の応答を確かめる */
export function toAiComment(data: unknown): AiComment | null {
  if (!isRecord(data)) return null
  const { comment, cached, createdAt } = data
  if (typeof comment !== 'string' || typeof createdAt !== 'string') return null
  return { comment, cached: cached === true, createdAt }
}

/** getClient は最初に使うときに呼ぶ */
export function createAiReports(getClient: () => SupabaseClient): AiReports {
  return {
    async request({ teamId, scope, summary, force = false }) {
      const { data, error } = await getClient().functions.invoke('gemini-report', {
        body: { teamId, scope, summary, force },
      })
      if (error) throw new Error(await errorMessageOf(error))
      const comment = toAiComment(data)
      if (!comment) throw new Error('AI のコメントを作れませんでした。')
      return comment
    },
    async latest(teamId, scope) {
      const { data, error } = await getClient()
        .from('ai_reports')
        .select('comment,created_at')
        .eq('team_id', teamId)
        .eq('scope', scope)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ comment: string; created_at: string }>()
      if (error) throw new Error('AI のコメントを読めませんでした。')
      return data ? { comment: data.comment, cached: true, createdAt: data.created_at } : null
    },
  }
}

/** アプリで使う AiReports */
export const aiReports: AiReports = createAiReports(getSupabase)
