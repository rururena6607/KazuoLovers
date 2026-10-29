// 未送信の記録を自動で送り直す（T-15、F-17）。
// 未送信があるあいだは一定の間隔で送り直し、電波が戻ったときとアプリを前に出したときはすぐ送る。
import type { RecordRepository, Unsubscribe } from '../../contracts/index.ts'

/** 未送信があるあいだ、送り直す間隔 */
export const RETRY_INTERVAL_MS = 15_000

/** すぐ送り直すきっかけ。テストでは偽物を渡す */
export interface RetrySignals {
  /** 電波が戻った、アプリを前に出した、など */
  subscribe(onSignal: () => void): Unsubscribe
}

export interface Timer {
  setInterval(fn: () => void, ms: number): number
  clearInterval(id: number): void
}

export const browserSignals: RetrySignals = {
  subscribe(onSignal) {
    if (typeof window === 'undefined') return () => {}
    const onVisible = () => {
      if (document.visibilityState === 'visible') onSignal()
    }
    window.addEventListener('online', onSignal)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onSignal)
      document.removeEventListener('visibilitychange', onVisible)
    }
  },
}

const browserTimer: Timer = {
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id),
}

/** 自動の再送を始める。戻り値で止める */
export function startAutoRetry(
  repo: Pick<RecordRepository, 'retry' | 'subscribePending'>,
  signals: RetrySignals = browserSignals,
  timer: Timer = browserTimer,
  intervalMs = RETRY_INTERVAL_MS,
): Unsubscribe {
  let count = 0
  let intervalId: number | null = null

  const retry = () => {
    if (count > 0) void repo.retry()
  }

  const stopPending = repo.subscribePending((n) => {
    count = n
    if (n > 0 && intervalId === null) intervalId = timer.setInterval(retry, intervalMs)
    if (n === 0 && intervalId !== null) {
      timer.clearInterval(intervalId)
      intervalId = null
    }
  })
  const stopSignals = signals.subscribe(retry)

  return () => {
    stopPending()
    stopSignals()
    if (intervalId !== null) timer.clearInterval(intervalId)
    intervalId = null
  }
}
