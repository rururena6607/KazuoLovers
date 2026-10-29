// 公式戦の結果を LINE のグループに送る（T-35、F-15）。記録画面で試合を終えたときに呼ぶ。
// 送るかどうか（公式戦か、送ってあるか、通数が足りるか）は Edge Function の line-push が決める。
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from './supabaseClient.ts'

export interface PushResult {
  /** LINE に送ったか */
  sent: boolean
  /** 画面に出す文（送らなかった理由など） */
  message: string
}

export function toPushResult(data: unknown): PushResult | null {
  if (typeof data !== 'object' || data === null) return null
  const { sent, message } = data as Record<string, unknown>
  if (typeof sent !== 'boolean' || typeof message !== 'string') return null
  return { sent, message }
}

export interface LinePush {
  /** 失敗しても reject しない（試合を終える操作を止めない）。sent が false のときは message に理由が入る */
  pushMatchResult(matchId: string): Promise<PushResult>
}

/** getClient は最初に使うときに呼ぶ */
export function createLinePush(getClient: () => SupabaseClient): LinePush {
  return {
    async pushMatchResult(matchId) {
      try {
        const { data, error } = await getClient().functions.invoke('line-push', { body: { matchId } })
        if (error) {
          // line-push は失敗しても { sent, message } を返すので、message をそのまま出す
          const context = (error as { context?: unknown }).context
          if (context instanceof Response) {
            const result = toPushResult(await context.clone().json().catch(() => null))
            if (result) return result
          }
          const offline = (error as { name?: unknown }).name === 'FunctionsFetchError'
          return {
            sent: false,
            message: offline ? '通信できなかったので、LINE には送れませんでした。' : 'LINE に送れませんでした。',
          }
        }
        return toPushResult(data) ?? { sent: false, message: 'LINE に送れませんでした。' }
      } catch {
        return { sent: false, message: 'LINE に送れませんでした。' }
      }
    },
  }
}

/** アプリで使う LinePush */
export const linePush: LinePush = createLinePush(getSupabase)
